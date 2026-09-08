import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  FACTUAL_RESEARCH_NOT_AUTHORIZED,
  type FactualResearchState,
  type FactualSeverityTier,
  type TrustedOperationalScope,
} from '../../shared/protocol.js';
import { DIGEST_PATTERN, hasExactKeys, isRecord, sha256Hex } from '../analysis/canonical.js';

/**
 * The research capability factual verification would use to answer a finding's verification question.
 *
 * It exists, and under every operational scope this slice can run in it refuses. No accepted boundary
 * admits a query derived from a manuscript leaving the developer host: ADR 0065 admits transmissions
 * to a model provider and nothing else, and the bounded research egress is only proposed (ADR 0074,
 * PR #391). Until that record is accepted and its slice integrates, a refusal is the true answer, and
 * a finding that carries it honestly reads `未外部复核` rather than pretending to be checked.
 *
 * Two implementations, one interface:
 *
 * - {@link FixtureReplayResearchCapability} answers under `development-ci` from
 *   `tests/fixtures/research/*.json` and nothing else. No fixture ships in this slice, so every
 *   lookup returns the refusal; an absent fixture is that outcome, never an error, because a Run must
 *   not fail over evidence it was never authorized to gather.
 * - {@link RefusingResearchCapability} is what every other scope gets, including `developer-live`:
 *   the live path belongs to S18c.
 *
 * This module contains no network call. It references no `fetch`, no `node:http`, no `node:https`, no
 * socket, and no URL of any host; the Egress Gate is not consulted because nothing here could ever
 * ask it for anything. The only I/O is reading admitted fixture files from the repository.
 */
export interface ResearchQuestion {
  /** The finding this question serves; recorded so a later ledger item can name what a fetch was for. */
  readonly findingId: string;
  readonly question: string;
  readonly severity: FactualSeverityTier;
}

/**
 * The per-Run search budget ADR 0066 requires, allocated by severity tier. No slice allocates one
 * yet: the Plan Envelope gains the field with the accepted egress (ADR 0074), so a caller passes
 * `null` and every outcome reports `budget: null`.
 */
export interface ResearchBudget {
  readonly perRun: number;
  readonly remaining: number;
  readonly bySeverity: Readonly<Record<FactualSeverityTier, number>>;
}

/** One captured evidence record. Nothing produces one in this slice; the shape is the policy's. */
export interface ResearchEvidence {
  readonly issuingBody: string;
  readonly title: string;
  readonly retrievedAt: string;
  readonly responseDigest: string;
  readonly excerpt: string;
  readonly sourceClass: string;
}

export interface ResearchOutcome {
  readonly state: FactualResearchState;
  /** Why the capability answered as it did, in the register an editor reads. */
  readonly reason: string;
  readonly evidence: ReadonlyArray<ResearchEvidence>;
  readonly budget: null;
  /** Requests that actually left this host. Structurally zero: no code path here can transmit. */
  readonly fetched: 0;
}

export interface ResearchCapability {
  readonly scope: TrustedOperationalScope | 'unbound';
  /** Answer one verification question, or state exactly why it was not answered. Never throws. */
  lookup(question: ResearchQuestion, budget: ResearchBudget | null): ResearchOutcome;
}

export const RESEARCH_NOT_AUTHORIZED_REASON =
  '当前没有已获准的外部研究出口：本次运行未检索任何外部证据，断言仅经引文位置的确定性校验。' as const;
const RESEARCH_FIXTURE_ABSENT_REASON =
  '当前可信区间只允许重放已收录的研究夹具，且本问题没有对应夹具：未发起任何检索。' as const;

function refusal(reason: string): ResearchOutcome {
  return { state: FACTUAL_RESEARCH_NOT_AUTHORIZED, reason, evidence: [], budget: null, fetched: 0 };
}

/** The refusal every scope without an accepted research egress returns, unconditionally. */
export const RESEARCH_REFUSED: ResearchOutcome = refusal(RESEARCH_NOT_AUTHORIZED_REASON);

/**
 * The Run-level disclosure carried by a Result Set Revision: what the capability was allowed to do
 * for this Run, and what it did. It is derived from the outcomes the Run actually collected, so a
 * revision can never claim a state no lookup returned.
 */
export function researchDisclosure(outcomes: ReadonlyArray<ResearchOutcome>): { state: FactualResearchState; fetched: 0; statement: string } {
  const refused = outcomes.every((outcome) => outcome.state === FACTUAL_RESEARCH_NOT_AUTHORIZED);
  const first = outcomes[0];
  return {
    state: refused || first === undefined ? FACTUAL_RESEARCH_NOT_AUTHORIZED : first.state,
    fetched: 0,
    statement: first === undefined ? RESEARCH_NOT_AUTHORIZED_REASON : first.reason,
  };
}

export class RefusingResearchCapability implements ResearchCapability {
  constructor(readonly scope: TrustedOperationalScope | 'unbound' = 'unbound') {}

  lookup(): ResearchOutcome {
    return RESEARCH_REFUSED;
  }
}

/** The key a research fixture is filed under: the digest of the exact question text. */
export function researchFixtureKey(question: string): string {
  return sha256Hex(question);
}

export interface ResearchFixture {
  readonly schema: 'ai7.research-fixture/1';
  readonly question: string;
  readonly outcome: ResearchOutcome;
}

/**
 * Replay admitted research fixtures under `development-ci`. The capability holds the fixtures it was
 * constructed with and reads nothing further, so a lookup is a pure map read and a Run never blocks
 * on the filesystem. No fixture ships in this slice: the map is empty and every lookup refuses.
 */
export class FixtureReplayResearchCapability implements ResearchCapability {
  readonly scope = 'development-ci' as const;
  readonly #fixtures: ReadonlyMap<string, ResearchOutcome>;

  constructor(fixtures: ReadonlyMap<string, ResearchOutcome> = new Map()) {
    this.#fixtures = fixtures;
  }

  get fixtureCount(): number {
    return this.#fixtures.size;
  }

  lookup(question: ResearchQuestion): ResearchOutcome {
    return this.#fixtures.get(researchFixtureKey(question.question)) ?? refusal(RESEARCH_FIXTURE_ABSENT_REASON);
  }
}

export class ResearchFixtureError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ResearchFixtureError';
  }
}

function requireFixture(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ResearchFixtureError('RESEARCH_FIXTURE_INVALID', message);
}

function parseEvidence(value: unknown): ResearchEvidence {
  requireFixture(isRecord(value) && hasExactKeys(value, ['issuingBody', 'title', 'retrievedAt', 'responseDigest', 'excerpt', 'sourceClass']) &&
    typeof value.issuingBody === 'string' && typeof value.title === 'string' && typeof value.retrievedAt === 'string' &&
    typeof value.responseDigest === 'string' && DIGEST_PATTERN.test(value.responseDigest) &&
    typeof value.excerpt === 'string' && typeof value.sourceClass === 'string', '研究夹具的证据记录无效。');
  return {
    issuingBody: value.issuingBody,
    title: value.title,
    retrievedAt: value.retrievedAt,
    responseDigest: value.responseDigest,
    excerpt: value.excerpt,
    sourceClass: value.sourceClass,
  };
}

export function parseResearchFixture(value: unknown): ResearchFixture {
  requireFixture(isRecord(value) && hasExactKeys(value, ['schema', 'question', 'outcome']), '研究夹具键集合无效。');
  requireFixture(value.schema === 'ai7.research-fixture/1', '研究夹具 schema 无效。');
  requireFixture(typeof value.question === 'string' && value.question.isWellFormed() && value.question.length > 0, '研究夹具的问题无效。');
  const outcome = value.outcome;
  requireFixture(isRecord(outcome) && hasExactKeys(outcome, ['state', 'reason', 'evidence']) &&
    typeof outcome.state === 'string' && typeof outcome.reason === 'string' && Array.isArray(outcome.evidence), '研究夹具的结果无效。');
  return {
    schema: 'ai7.research-fixture/1',
    question: value.question,
    // A replayed outcome can never claim a fetch: the count is structural, not carried by the fixture.
    outcome: {
      state: outcome.state as FactualResearchState,
      reason: outcome.reason,
      evidence: outcome.evidence.map(parseEvidence),
      budget: null,
      fetched: 0,
    },
  };
}

/**
 * Load every admitted research fixture of a root, keyed by its question digest. A missing directory
 * is an empty map — the case this slice ships — and never an error.
 */
export async function loadResearchFixtures(fixturesRoot: string): Promise<Map<string, ResearchOutcome>> {
  requireFixture(isAbsolute(fixturesRoot), '研究夹具根目录无效。');
  let names: string[];
  try {
    names = await readdir(fixturesRoot);
  } catch {
    return new Map();
  }
  const fixtures = new Map<string, ResearchOutcome>();
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const target = resolve(fixturesRoot, name);
    const relation = relative(fixturesRoot, target);
    requireFixture(relation !== '' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation), '研究夹具路径越界。');
    const bytes = await readFile(target);
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw new ResearchFixtureError('RESEARCH_FIXTURE_INVALID', `研究夹具 ${name} 不是有效 JSON。`);
    }
    const fixture = parseResearchFixture(parsed);
    fixtures.set(researchFixtureKey(fixture.question), fixture.outcome);
  }
  return fixtures;
}

/**
 * The capability one operational scope gets. `development-ci` replays admitted fixtures; every other
 * scope, `developer-live` included, refuses — the live path is S18c's under ADR 0074.
 */
export function researchCapabilityFor(
  scope: TrustedOperationalScope | 'unbound',
  fixtures: ReadonlyMap<string, ResearchOutcome> = new Map(),
): ResearchCapability {
  return scope === 'development-ci' ? new FixtureReplayResearchCapability(fixtures) : new RefusingResearchCapability(scope);
}
