import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GenerateOptions, LlmAdapter, StreamChunk } from '@deepseek-ai/dsh-llm';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { describeComposition, prepareExecution } from '../../src/service/harness/primary-agent-harness.js';
import { HarnessSessionLogBackend, readHarnessSessionLog } from '../../src/service/harness/session-log.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';
import { GLOBAL_AGENT_PROMPT_CONTRACT, GLOBAL_AGENT_PROMPT_CONTRACT_DIGEST, proveGlobalHistory } from '../../src/service/dialogue/global-agent-session.js';
import { buildDialogueMessage, type DialogueMessageInput } from '../../src/service/dialogue/contract.js';
import { harnessHistoryReader } from '../../src/service/dialogue/dialogue-history.js';
import type { StoredDialogueAttempt, StoredGlobalDialogueTask } from '../../src/service/dialogue/dialogue-ledger.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE } from '../../src/service/provider/egress-gate.js';

// The Harness Session Ledger made durable (Issue #52, S17a): the composition persists its DSH Session log through DSH's own
// persistence seam into AI7's JSONL storage, and streams each text delta to a reader while the turn is in flight.

installNodeNetworkDenial();

const SYSTEM = '合成系统提示。';
const DIGEST = 'c'.repeat(64);
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ai7-session-log-'));
  roots.push(root);
  return root;
}

/** An adapter that streams the given deltas, waiting before each on `gate` so a test can stop it mid-stream. */
function streamingAdapter(deltas: ReadonlyArray<string>, gate: (index: number, signal: AbortSignal | undefined) => Promise<void> = () => Promise.resolve()): LlmAdapter {
  return {
    providerInfo: (provider: string) => ({ id: provider, name: '合成流式适配器' }),
    providerRetryPolicy: () => undefined,
    listModels: () => Promise.resolve([]),
    resolveModel: (provider: string, model: string) => Promise.resolve({ provider, id: model, name: '合成', inputModalities: ['text'] }),
    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      let text = '';
      for (const [index, delta] of deltas.entries()) {
        await gate(index, options.signal);
        if (options.signal?.aborted === true) {
          yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'AI7_INTERRUPTED', message: '中断。' } } } as StreamChunk;
          return;
        }
        text += delta;
        yield { type: 'text-delta', index: 0, text: delta };
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  } as unknown as LlmAdapter;
}

async function compose(root: string | undefined, adapter: LlmAdapter, sessionId = randomUUID()) {
  const handle = await prepareExecution({
    sessionId,
    route: LOCAL_DETERMINISTIC_ROUTE,
    model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: SYSTEM,
    promptContractDigest: DIGEST,
    adapterFactory: () => adapter,
    gate: () => ({ decision: 'transmit-local', payloadDigest: 'a'.repeat(64) }),
    onTransmitTicket: () => undefined,
    ...(root === undefined ? {} : { sessionLogRoot: root }),
  });
  handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest, promptContractDigest: DIGEST });
  return handle;
}

describe('fresh Global ancestry reading (#1161)', () => {
  it('joins an actual interrupted Harness log and refuses same-length damage despite the display cache', async () => {
    const root = tempRoot();
    const sources = [{ itemId: 'synthetic-A', revisionId: 'revision-A', text: '合成偏好甲。' },
      { itemId: 'synthetic-B', revisionId: 'revision-B', text: '合成偏好乙。' }];
    const message: DialogueMessageInput = { kind: 'ask', selection: '', question: '合成问题？', globalSources: sources, kept: null };
    const sessionId = randomUUID();
    const handle = await prepareExecution({ sessionId, route: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL,
      systemPrompt: GLOBAL_AGENT_PROMPT_CONTRACT.systemPrompt, promptContractDigest: GLOBAL_AGENT_PROMPT_CONTRACT_DIGEST,
      adapterFactory: () => streamingAdapter(['完整的合成句子。', '不会完成'], (index, signal) => index === 0 ? Promise.resolve()
        : new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }))),
      // This unit checks log/fragment reading, not service admission or provider currentness.
      gate: () => ({ decision: 'transmit-local', payloadDigest: 'a'.repeat(64) }), onTransmitTicket: () => undefined,
      sessionLogRoot: root });
    handle.bindExecution({ harnessSessionId: sessionId, behaviorCompositionDigest: handle.composition.digest,
      promptContractDigest: GLOBAL_AGENT_PROMPT_CONTRACT_DIGEST });
    const outcome = await handle.submitStreaming(buildDialogueMessage(message), () => setTimeout(() => handle.interrupt(), 0));
    expect(outcome.terminal).toBe('interrupted');
    await handle.finish();
    const now = new Date().toISOString(), dialogueId = randomUUID();
    const pins = sources.map(({ itemId, revisionId }) => ({ itemId, revisionId }));
    const task: StoredGlobalDialogueTask = { dialogueId, bookId: null, sources: pins, operationalScope: 'ordinary-production',
      sourcesSha256: sha256Hex(canonicalJson(pins)), questionSha256: sha256Hex(message.question), askedAt: now };
    const attempt: StoredDialogueAttempt = { attemptId: randomUUID(), dialogueId, ordinal: 1, kind: 'ask', priorAttemptId: null,
      createdAt: now, binding: { route: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL, operationalScope: 'ordinary-production',
        providerProcessingVersion: 'v27', policyRuleId: 'ordinary-production-global-agent-dialogue', harnessSessionId: sessionId,
        promptContractSha256: GLOBAL_AGENT_PROMPT_CONTRACT_DIGEST, behaviorCompositionSha256: handle.composition.digest, boundAt: now },
      span: { harnessSessionId: sessionId, startSeq: outcome.span.startSeq, openedAt: now },
      outcome: { outcome: 'interrupted', endSeq: outcome.span.endSeq, causeCode: 'synthetic-interruption', settledAt: now }, conversions: [] };
    const proof = proveGlobalHistory(task, [attempt], root, 'continue');
    expect(proof.actualAsk).toEqual({ attemptId: attempt.attemptId, messageSha256: sha256Hex(buildDialogueMessage(message)) });
    expect(proof.kept).toBe('完整的合成句子。'); expect(proof.completeFragmentCount).toBe(1);
    expect(proof.retainedInfluences).toEqual(sources.map(({ itemId, revisionId, text }) => ({ itemId, revisionId, textSha256: sha256Hex(text) })));
    expect(proveGlobalHistory(task, [attempt], root, 'regenerate')).toMatchObject({ kept: null, retainedInfluences: [] });
    const display = harnessHistoryReader(root);
    expect(display.turn(attempt)).toMatchObject({ message });
    const path = join(root, `${sessionId}.jsonl`), original = readFileSync(path, 'utf8');
    const damaged = original.replace('"seq":0', '"SEQ":0');
    expect(Buffer.byteLength(damaged)).toBe(Buffer.byteLength(original)); expect(damaged).not.toBe(original);
    writeFileSync(path, damaged);
    expect(display.turn(attempt)).toMatchObject({ message });
    expect(() => proveGlobalHistory(task, [attempt], root, 'continue')).toThrowError(/损坏/u);
    writeFileSync(path, original);
    expect(() => proveGlobalHistory(task, [{ ...attempt, ordinal: 2 }], root, 'continue')).toThrow();
    rmSync(path);
    expect(() => proveGlobalHistory(task, [attempt], root, 'regenerate')).toThrow();
  });
});

describe('Harness Session Ledger', () => {
  it('leaves every composition without a log exactly as it was, and names the log in the one that has it', () => {
    const plain = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, DIGEST);
    expect(describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, DIGEST, { sessionLog: false })).toEqual(plain);
    expect('sessionLog' in plain).toBe(false);
    const logged = describeComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL, DIGEST, { sessionLog: true });
    expect(logged.sessionLog).toEqual({ package: { '@deepseek-ai/dsh-session-persistence': '0.1.0-rc.6' }, storage: 'agent-data-root-jsonl' });
    expect(logged.digest).not.toBe(plain.digest);
  });

  it('streams each delta in order and persists the whole turn under the root', async () => {
    const root = tempRoot();
    const handle = await compose(root, streamingAdapter(['第一句。第', '二句还没', '完。']));
    expect(handle.composition.sessionLog?.storage).toBe('agent-data-root-jsonl');
    const deltas: string[] = [];
    const start = handle.nextSpanStart();
    const outcome = await handle.submitStreaming('问题', (delta) => deltas.push(delta));
    expect(deltas).toEqual(['第一句。第', '二句还没', '完。']);
    expect(outcome.terminal).toBe('completed');
    expect(outcome.span.startSeq).toBe(start.startSeq);
    expect(outcome.span.sessionId).toBe(handle.sessionId);
    await handle.finish();
    const log = readHarnessSessionLog(root, handle.sessionId)!;
    expect(log.header.id).toBe(handle.sessionId);
    expect(log.tornOffset).toBeUndefined();
    expect(log.events.length).toBeGreaterThan(outcome.span.endSeq);
    const turn = log.events.slice(outcome.span.startSeq, outcome.span.endSeq + 1);
    expect(turn.map((event) => event.type)).toContain('user/message');
    const streamed = turn.filter((event) => event.type === 'assistant/chunk')
      .map((event) => (event.data as { chunk: StreamChunk }).chunk)
      .filter((chunk): chunk is Extract<StreamChunk, { type: 'text-delta' }> => chunk.type === 'text-delta')
      .map((chunk) => chunk.text);
    expect(streamed).toEqual(['第一句。第', '二句还没', '完。']);
    expect(turn.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'completed' } } });
  });

  it('keeps what streamed before an interruption, the turn ending aborted', async () => {
    const root = tempRoot();
    let release: (() => void) | null = null;
    const handle = await compose(root, streamingAdapter(['完整的一句。', '没写完的'], (index, signal) => index === 0 ? Promise.resolve() : new Promise<void>((resolve) => {
      release = resolve;
      signal?.addEventListener('abort', () => resolve(), { once: true });
    })));
    const deltas: string[] = [];
    const pending = handle.submitStreaming('问题', (delta) => {
      deltas.push(delta);
      if (deltas.length === 1) setTimeout(() => handle.interrupt(), 10);
    });
    const outcome = await pending;
    expect(release).not.toBeNull();
    expect(outcome.terminal).toBe('interrupted');
    expect(deltas).toEqual(['完整的一句。']);
    await handle.finish();
    const log = readHarnessSessionLog(root, handle.sessionId)!;
    expect(log.events.at(-1)).toMatchObject({ type: 'turn/end', data: { reason: { kind: 'aborted' } } });
  });

  it('keeps a composition without a root in memory: nothing is written', async () => {
    const handle = await compose(undefined, streamingAdapter(['一句。']));
    const outcome = await handle.submitStreaming('问题', () => undefined);
    expect(outcome.terminal).toBe('completed');
    await handle.finish();
  });

  it('drops a torn final line, refuses a damaged one, and repairs through the backend', async () => {
    const root = tempRoot();
    const handle = await compose(root, streamingAdapter(['一句。']));
    await handle.submitStreaming('问题', () => undefined);
    await handle.finish();
    const path = join(root, `${handle.sessionId}.jsonl`);
    const whole = readFileSync(path, 'utf8');
    const count = readHarnessSessionLog(root, handle.sessionId)!.events.length;
    writeFileSync(path, `${whole}{"seq":${count},"type":"turn/st`);
    const torn = readHarnessSessionLog(root, handle.sessionId)!;
    expect(torn.events).toHaveLength(count);
    expect(torn.tornOffset).toBe(Buffer.byteLength(whole));
    const backend = new HarnessSessionLogBackend(root);
    const stored = await backend.loadStored(handle.sessionId as never);
    expect(stored?.tornMarker).toBe(Buffer.byteLength(whole));
    await backend.commitRepair(stored!.meta, stored!.tornMarker, []);
    expect(readFileSync(path, 'utf8')).toBe(whole);
    writeFileSync(path, `${whole}{"seq":${count},"type":"tu\n`);
    expect(() => readHarnessSessionLog(root, handle.sessionId)).toThrowError(/损坏/u);
    writeFileSync(path, `${whole}{"seq":${count + 1},"type":"x","time":1,"data":null}\n`);
    expect(() => readHarnessSessionLog(root, handle.sessionId)).toThrowError(/不连续/u);
    expect(readHarnessSessionLog(root, randomUUID())).toBeNull();
    writeFileSync(path, whole);
    expect((await backend.list()).map((header) => header.id)).toEqual([handle.sessionId]);
  });

  it('refuses a log that is no plain file, and an append that would grow a log past what a read takes', async () => {
    const root = tempRoot();
    const backend = new HarnessSessionLogBackend(root);
    const id = randomUUID();
    mkdirSync(join(root, `${id}.jsonl`));
    expect(() => readHarnessSessionLog(root, id)).toThrowError(/普通文件/u);
    await expect(backend.readStoredRevision(id as never)).rejects.toThrowError(/普通文件/u);
    const other = randomUUID();
    const otherMeta = { version: 0, id: other, createdAt: 1 } as never;
    await backend.appendBatch(otherMeta, [], false);
    const huge = [{ type: 'x', seq: 0, time: 1, data: 'a'.repeat(33 * 1024 * 1024) }] as never;
    await expect(backend.appendBatch(otherMeta, huge, true)).rejects.toThrowError(/超出安全大小/u);
    expect(readHarnessSessionLog(root, other)?.events).toEqual([]);
  });
});
