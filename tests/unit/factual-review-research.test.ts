import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FixtureReplayResearchCapability,
  RESEARCH_REFUSED,
  RefusingResearchCapability,
  ResearchFixtureError,
  loadResearchFixtures,
  parseResearchFixture,
  researchCapabilityFor,
  researchDisclosure,
  researchFixtureKey,
  type ResearchQuestion,
} from '../../src/service/capabilities/research.js';
import { FACTUAL_RESEARCH_NOT_AUTHORIZED } from '../../src/shared/protocol.js';

// The research capability exists so that a factual finding can state, truthfully, that nothing
// external answered its question. No accepted boundary admits a manuscript-derived query leaving
// this host (ADR 0065 admits model transmissions only; ADR 0074 is proposed), so every scope refuses
// and this module contains no network call at all.

const question: ResearchQuestion = { findingId: 'fnd_0123456789abcdef01234567', question: '这条断言是否与公开记录一致？', severity: 'A' };
const RESEARCH_MODULE = fileURLToPath(new URL('../../src/service/capabilities/research.ts', import.meta.url));

describe('the research capability', () => {
  it('refuses under every scope with the disclosed state', () => {
    for (const scope of ['development-ci', 'developer-live', 'fixture-recording', 'ordinary-production', 'unbound'] as const) {
      const outcome = researchCapabilityFor(scope).lookup(question, null);
      expect(outcome.state).toBe(FACTUAL_RESEARCH_NOT_AUTHORIZED);
      expect(outcome.evidence).toEqual([]);
      expect(outcome.budget).toBeNull();
      expect(outcome.fetched).toBe(0);
      expect(outcome.reason.length).toBeGreaterThan(0);
    }
    expect(new RefusingResearchCapability().lookup()).toEqual(RESEARCH_REFUSED);
  });

  it('replays only admitted fixtures under development-ci, and an absent one is the refusal', () => {
    const capability = researchCapabilityFor('development-ci');
    expect(capability).toBeInstanceOf(FixtureReplayResearchCapability);
    expect((capability as FixtureReplayResearchCapability).fixtureCount).toBe(0);
    const absent = capability.lookup(question, null);
    expect(absent.state).toBe(FACTUAL_RESEARCH_NOT_AUTHORIZED);
    expect(absent.evidence).toEqual([]);

    const replayed = new FixtureReplayResearchCapability(new Map([[researchFixtureKey(question.question), {
      state: '已检索' as const,
      reason: '重放已收录的研究夹具。',
      evidence: [],
      budget: null,
      fetched: 0 as const,
    }]]));
    expect(replayed.lookup(question, null).state).toBe('已检索');
    // A different question is a different key, and there is no fallback to a near match.
    expect(replayed.lookup({ ...question, question: '另一个问题？' }, null).state).toBe(FACTUAL_RESEARCH_NOT_AUTHORIZED);
  });

  it('ships no research fixture in this slice, so a missing directory is an empty map', async () => {
    const fixtures = await loadResearchFixtures(fileURLToPath(new URL('../fixtures/research/', import.meta.url)));
    expect(fixtures.size).toBe(0);
  });

  it('parses a fixture strictly and never lets one claim a fetch', () => {
    const parsed = parseResearchFixture({
      schema: 'ai7.research-fixture/1',
      question: '这条断言是否与公开记录一致？',
      outcome: { state: '已检索', reason: '重放。', evidence: [] },
    });
    expect(parsed.outcome.fetched).toBe(0);
    expect(parsed.outcome.budget).toBeNull();
    expect(() => parseResearchFixture({ schema: 'ai7.research-fixture/2', question: 'q', outcome: { state: 'x', reason: 'y', evidence: [] } }))
      .toThrow(ResearchFixtureError);
    expect(() => parseResearchFixture({ schema: 'ai7.research-fixture/1', question: '', outcome: { state: 'x', reason: 'y', evidence: [] } }))
      .toThrow(ResearchFixtureError);
  });

  it('discloses the Run-level state from the outcomes it actually collected', () => {
    expect(researchDisclosure([])).toMatchObject({ state: FACTUAL_RESEARCH_NOT_AUTHORIZED, fetched: 0 });
    const refused = researchCapabilityFor('development-ci').lookup(question, null);
    expect(researchDisclosure([refused, refused])).toMatchObject({ state: FACTUAL_RESEARCH_NOT_AUTHORIZED, fetched: 0, statement: refused.reason });
  });

  it('references no network API anywhere in its source', async () => {
    const source = await readFile(RESEARCH_MODULE, 'utf8');
    for (const forbidden of ['fetch(', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram', 'XMLHttpRequest', 'WebSocket', 'undici', 'https://', 'http://']) {
      expect(source.includes(forbidden), `research.ts must not reference ${forbidden}`).toBe(false);
    }
  });
});
