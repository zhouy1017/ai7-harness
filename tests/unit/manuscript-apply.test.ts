import { describe, expect, it } from 'vitest';
import { applyOnce } from '../../src/renderer/manuscript-apply.js';
import type { ManuscriptApplyOutcomeProjection } from '../../src/shared/protocol.js';

// Unit suite for the one Apply path the Mark Card and 审阅 share (Issues #408 and #417): the Effect
// identity is made once, and an answer that never arrives is recovered by that identity, never re-sent.

const target = { manuscriptId: 'manuscript', branchId: 'branch' };
const committed: ManuscriptApplyOutcomeProjection = { state: 'committed', application: null };
const notCommitted: ManuscriptApplyOutcomeProjection = { state: 'not-committed', application: null };

function recorder(outcome: ManuscriptApplyOutcomeProjection | Error): {
  sent: string[];
  asked: Array<{ manuscriptId: string; branchId: string; clientEffectId: string }>;
  read: (input: { manuscriptId: string; branchId: string; clientEffectId: string }) => Promise<ManuscriptApplyOutcomeProjection>;
} {
  const sent: string[] = [];
  const asked: Array<{ manuscriptId: string; branchId: string; clientEffectId: string }> = [];
  return {
    sent,
    asked,
    read: async (input) => {
      asked.push(input);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}

describe('one AI7 Apply, made once', () => {
  it('answers the acknowledged result and never reads the outcome', async () => {
    const calls = recorder(committed);
    const result = await applyOnce(target, async (clientEffectId) => {
      calls.sent.push(clientEffectId);
      return { receipt: clientEffectId };
    }, calls.read, () => 'effect-1');
    expect(result).toEqual({ acknowledged: true, result: { receipt: 'effect-1' } });
    expect(calls.sent).toEqual(['effect-1']);
    expect(calls.asked).toEqual([]);
  });

  it('recovers a lost acknowledgement by the same Effect identity and never sends it again', async () => {
    const lost = Object.freeze({ code: 'AI7_APPLY_ACKNOWLEDGEMENT_LOST', message: '应用的确认没有送达。' });
    const calls = recorder(committed);
    let identities = 0;
    const result = await applyOnce(target, async (clientEffectId) => {
      calls.sent.push(clientEffectId);
      throw lost;
    }, calls.read, () => `effect-${++identities}`);
    expect(result).toEqual({ acknowledged: false, failure: lost, outcome: committed, outcomeFailure: undefined });
    expect(calls.sent).toEqual(['effect-1']);
    expect(calls.asked).toEqual([{ manuscriptId: 'manuscript', branchId: 'branch', clientEffectId: 'effect-1' }]);
    expect(identities).toBe(1);
  });

  it('reads the outcome when the sender already said why it did not complete', async () => {
    const calls = recorder(notCommitted);
    const result = await applyOnce(target, async () => undefined, calls.read, () => 'effect-2');
    expect(result).toEqual({ acknowledged: false, failure: undefined, outcome: notCommitted, outcomeFailure: undefined });
    expect(calls.asked.map((input) => input.clientEffectId)).toEqual(['effect-2']);
  });

  it('carries both failures when the outcome cannot be read either', async () => {
    const refused = new Error('refused');
    const unreadable = new Error('unreadable');
    const calls = recorder(unreadable);
    const result = await applyOnce(target, async () => {
      throw refused;
    }, calls.read, () => 'effect-3');
    expect(result).toEqual({ acknowledged: false, failure: refused, outcome: null, outcomeFailure: unreadable });
  });

  it('makes a fresh identity for each Apply it is asked for', async () => {
    const seen: string[] = [];
    const send = async (clientEffectId: string): Promise<string> => {
      seen.push(clientEffectId);
      return clientEffectId;
    };
    await applyOnce(target, send, recorder(committed).read);
    await applyOnce(target, send, recorder(committed).read);
    expect(seen).toHaveLength(2);
    expect(new Set(seen).size).toBe(2);
    expect(seen.every((identity) => /^[0-9a-f-]{36}$/u.test(identity))).toBe(true);
  });
});
