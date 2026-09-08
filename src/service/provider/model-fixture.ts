import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { DIGEST_PATTERN, hasExactKeys, isRecord, sha256Hex } from '../analysis/canonical.js';

/**
 * Hand-written synthetic deterministic model fixtures (`tests/fixtures/model/<identity>.json`): one
 * typed response per Analysis Unit request, keyed by the pair of unit ordinal and request digest.
 * The pair key lets one fixture identity serve successive Coverage Manifests of the same Book: a
 * unit whose content changed after an acknowledged edit derives a new request digest and is served
 * by its own entry beside the entry of the earlier content. An entry may additionally name the
 * 1-based `attempt` it answers, so a fixture can answer the first and the second attempt of the
 * same unit and request digest differently (the `safe-retry` Plan Adaptation of Issue #48); an
 * entry without `attempt` answers every attempt the attempt-specific entries do not. A fixture may
 * be based on another so a variant (one failing unit) restates only the entries it changes.
 * Fixtures carry public synthetic text only and echo no manuscript content beyond exact block
 * identities.
 *
 * Unit ordinal `0` is not an Analysis Unit: it is the Run's one cross-unit reduction (ADR 0066),
 * whose request digest is a function of the frozen cross-unit prompt contract and the exact closed
 * unit set. It is keyed and resolved like any other entry, so nothing else about the fixture format
 * moves and the schema string stays `ai7.model-fixture/1`.
 *
 * An entry may additionally carry a `contentDigest` over the unit's own block texts. The request
 * digest binds the block identities of one import, so a fixture generated from that import answers
 * only it; the content digest binds the text alone, which is what lets the same entry answer a fresh
 * import of the same manuscript. Nothing production-facing reads it — the deterministic adapter
 * resolves by content digest only when a test constructs it that way — so the key set of every
 * request-digest entry, and the schema version, are unchanged.
 */
export const MODEL_FIXTURE_SCHEMA = 'ai7.model-fixture/1' as const;
export const FIXTURE_IDENTITY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_FIXTURE_BYTES = 512 * 1024;
const MAX_BASE_DEPTH = 4;
const MAX_FIXTURE_ATTEMPT = 8;
/** The keys an entry may carry beside the three it must; every other key is still refused. */
const OPTIONAL_ENTRY_KEYS = ['attempt', 'contentDigest'] as const;
/** The keys a fixture may carry beside the seven it must; every other key is still refused. */
const OPTIONAL_FIXTURE_KEYS = ['provenance'] as const;

/**
 * How a fixture's responses came to exist. `recorded` is the default and what every fixture written
 * before this key existed is: a response captured from a model, or hand-written to stand in for one.
 * `authored` states that a human wrote the responses after reading the admitted manuscript units they
 * answer — the honest provenance of a fixture whose quotations are verbatim manuscript text (ADR
 * 0043), and the value the S41 generator replaces when it records the same entries from a live item.
 */
export type ModelFixtureProvenance = 'recorded' | 'authored';
const FIXTURE_PROVENANCE: readonly ModelFixtureProvenance[] = ['recorded', 'authored'];

export type ModelFixtureResponse =
  | { readonly kind: 'unit-result'; readonly text: string; readonly usage: { readonly inputTokens: number; readonly outputTokens: number } }
  | { readonly kind: 'adapter-failure'; readonly code: string; readonly message: string; readonly status: number | null }
  | { readonly kind: 'quota-exceeded'; readonly message: string; readonly status: number }
  | { readonly kind: 'interrupted'; readonly message: string };

export interface ModelFixtureEntry {
  /** The Analysis Unit this entry answers, or `0` for the Run's one cross-unit reduction. */
  readonly unitOrdinal: number;
  readonly requestDigest: string;
  /** The 1-based attempt this entry answers, or `null` for an entry that answers every attempt. */
  readonly attempt: number | null;
  /** The digest over this unit's own block texts, or `null` for an entry keyed by request digest alone. */
  readonly contentDigest: string | null;
  readonly response: ModelFixtureResponse;
}

export interface ModelFixture {
  readonly schema: typeof MODEL_FIXTURE_SCHEMA;
  readonly identity: string;
  readonly description: string;
  readonly basedOn: string | null;
  /** How this fixture came to exist; a fixture that does not say is `recorded`. */
  readonly provenance: ModelFixtureProvenance;
  readonly provider: 'ai7-local-deterministic';
  readonly model: 'ai7-deterministic-fixture';
  readonly entries: ReadonlyArray<ModelFixtureEntry>;
}

/** A fixture with its base chain merged: entries keyed by {@link fixtureEntryKey}, variant entries winning. */
export interface ResolvedModelFixture {
  readonly identity: string;
  readonly description: string;
  /** The head fixture's provenance; a base it restates entries from keeps its own. */
  readonly provenance: ModelFixtureProvenance;
  readonly lineage: ReadonlyArray<{ identity: string; sha256: string }>;
  readonly entries: ReadonlyMap<string, ModelFixtureEntry>;
  /** Digest over the lineage digests; the binding pins it. */
  readonly sha256: string;
}

/**
 * The resolver key: unit ordinal and request digest together, so one identity serves successive
 * manifests; an attempt-specific entry appends `#<attempt>` so it sits beside the any-attempt entry.
 */
export function fixtureEntryKey(unitOrdinal: number, requestDigest: string, attempt: number | null = null): string {
  return attempt === null ? `${unitOrdinal}:${requestDigest}` : `${unitOrdinal}:${requestDigest}#${attempt}`;
}

/** The entry answering the given attempt: the attempt-specific entry when present, else the any-attempt entry. */
export function resolveFixtureEntry(entries: ReadonlyMap<string, ModelFixtureEntry>, unitOrdinal: number, requestDigest: string, attempt: number): ModelFixtureEntry | undefined {
  return entries.get(fixtureEntryKey(unitOrdinal, requestDigest, attempt)) ?? entries.get(fixtureEntryKey(unitOrdinal, requestDigest));
}

export class ModelFixtureError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ModelFixtureError';
  }
}

function requireFixture(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ModelFixtureError('MODEL_FIXTURE_INVALID', message);
}

function wellFormed(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.length <= maximum;
}

function parseResponse(value: unknown): ModelFixtureResponse {
  requireFixture(isRecord(value), '夹具响应不是对象。');
  switch (value.kind) {
    case 'unit-result': {
      requireFixture(hasExactKeys(value, ['kind', 'text', 'usage']) && wellFormed(value.text, 64 * 1024) && isRecord(value.usage) &&
        hasExactKeys(value.usage, ['inputTokens', 'outputTokens']) &&
        Number.isSafeInteger(value.usage.inputTokens) && (value.usage.inputTokens as number) >= 0 &&
        Number.isSafeInteger(value.usage.outputTokens) && (value.usage.outputTokens as number) >= 0, '夹具 unit-result 响应无效。');
      return { kind: 'unit-result', text: value.text, usage: { inputTokens: value.usage.inputTokens as number, outputTokens: value.usage.outputTokens as number } };
    }
    case 'adapter-failure': {
      requireFixture(hasExactKeys(value, ['kind', 'code', 'message', 'status']) && wellFormed(value.code, 64) && (value.code as string).length > 0 &&
        wellFormed(value.message, 1_024) && (value.status === null || (Number.isSafeInteger(value.status) && (value.status as number) >= 100)),
      '夹具 adapter-failure 响应无效。');
      return { kind: 'adapter-failure', code: value.code, message: value.message, status: value.status as number | null };
    }
    case 'quota-exceeded': {
      requireFixture(hasExactKeys(value, ['kind', 'message', 'status']) && wellFormed(value.message, 1_024) &&
        Number.isSafeInteger(value.status) && (value.status as number) >= 100, '夹具 quota-exceeded 响应无效。');
      return { kind: 'quota-exceeded', message: value.message, status: value.status as number };
    }
    case 'interrupted': {
      requireFixture(hasExactKeys(value, ['kind', 'message']) && wellFormed(value.message, 1_024), '夹具 interrupted 响应无效。');
      return { kind: 'interrupted', message: value.message };
    }
    default:
      throw new ModelFixtureError('MODEL_FIXTURE_INVALID', '夹具响应类型不在闭合集合内。');
  }
}

export function parseModelFixture(value: unknown): ModelFixture {
  // The seven required keys, plus whichever optional key this fixture actually carries: a fixture
  // naming none is the exact key set the schema has always accepted, and an unknown key is refused.
  requireFixture(isRecord(value) && hasExactKeys(value, [
    'schema', 'identity', 'description', 'basedOn', 'provider', 'model', 'entries',
    ...OPTIONAL_FIXTURE_KEYS.filter((key) => key in value),
  ]), '夹具键集合无效。');
  requireFixture(!('provenance' in value) || FIXTURE_PROVENANCE.includes(value.provenance as ModelFixtureProvenance), '夹具来源标注无效。');
  requireFixture(value.schema === MODEL_FIXTURE_SCHEMA, '夹具 schema 无效。');
  requireFixture(typeof value.identity === 'string' && FIXTURE_IDENTITY_PATTERN.test(value.identity), '夹具身份无效。');
  requireFixture(wellFormed(value.description, 1_024), '夹具描述无效。');
  requireFixture(value.basedOn === null || (typeof value.basedOn === 'string' && FIXTURE_IDENTITY_PATTERN.test(value.basedOn) && value.basedOn !== value.identity),
    '夹具基础引用无效。');
  requireFixture(value.provider === 'ai7-local-deterministic' && value.model === 'ai7-deterministic-fixture', '夹具路由或模型无效。');
  requireFixture(Array.isArray(value.entries) && value.entries.length <= 4_096, '夹具条目集合无效。');
  const seen = new Set<string>();
  const entries = value.entries.map((entry): ModelFixtureEntry => {
    // The three required keys, plus whichever optional keys this entry actually carries: an entry
    // naming neither is the exact key set the schema has always accepted, and an unknown key is
    // still refused.
    requireFixture(isRecord(entry) &&
      hasExactKeys(entry, ['unitOrdinal', 'requestDigest', 'response', ...OPTIONAL_ENTRY_KEYS.filter((key) => key in entry)]) &&
      Number.isSafeInteger(entry.unitOrdinal) && (entry.unitOrdinal as number) >= 0 &&
      typeof entry.requestDigest === 'string' && DIGEST_PATTERN.test(entry.requestDigest), '夹具条目无效。');
    const attempt = 'attempt' in entry ? entry.attempt : null;
    requireFixture(!('attempt' in entry) || (Number.isSafeInteger(attempt) && (attempt as number) >= 1 && (attempt as number) <= MAX_FIXTURE_ATTEMPT), '夹具条目的尝试序号无效。');
    const contentDigest = 'contentDigest' in entry ? entry.contentDigest : null;
    requireFixture(!('contentDigest' in entry) || (typeof contentDigest === 'string' && DIGEST_PATTERN.test(contentDigest)), '夹具条目的内容摘要无效。');
    const key = fixtureEntryKey(entry.unitOrdinal as number, entry.requestDigest, attempt as number | null);
    requireFixture(!seen.has(key), '夹具条目单元序号与请求摘要重复（含尝试序号）。');
    seen.add(key);
    return {
      unitOrdinal: entry.unitOrdinal as number,
      requestDigest: entry.requestDigest,
      attempt: attempt as number | null,
      contentDigest: contentDigest as string | null,
      response: parseResponse(entry.response),
    };
  });
  return {
    schema: MODEL_FIXTURE_SCHEMA,
    identity: value.identity,
    description: value.description,
    basedOn: value.basedOn as string | null,
    provenance: ('provenance' in value ? value.provenance : 'recorded') as ModelFixtureProvenance,
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries,
  };
}

export function fixturePath(fixturesRoot: string, identity: string): string {
  if (!FIXTURE_IDENTITY_PATTERN.test(identity) || !isAbsolute(fixturesRoot)) throw new ModelFixtureError('MODEL_FIXTURE_INVALID', '夹具身份或根目录无效。');
  const target = resolve(fixturesRoot, `${identity}.json`);
  const relation = relative(fixturesRoot, target);
  if (relation === '' || relation.startsWith(`..${sep}`) || relation === '..' || isAbsolute(relation)) {
    throw new ModelFixtureError('MODEL_FIXTURE_INVALID', '夹具路径越界。');
  }
  return target;
}

/** Load one fixture and its base chain from the fixtures root; the resolved entries are keyed by unit ordinal and request digest. */
export async function loadModelFixture(fixturesRoot: string, identity: string): Promise<ResolvedModelFixture> {
  const chain: Array<{ fixture: ModelFixture; sha256: string }> = [];
  let current: string | null = identity;
  while (current !== null) {
    requireFixture(chain.length < MAX_BASE_DEPTH, '夹具基础链过深。');
    requireFixture(!chain.some((link) => link.fixture.identity === current), '夹具基础链形成循环。');
    let bytes: Buffer;
    try {
      bytes = await readFile(fixturePath(fixturesRoot, current));
    } catch {
      throw new ModelFixtureError('MODEL_FIXTURE_ABSENT', `找不到夹具 ${current}。`);
    }
    requireFixture(bytes.length <= MAX_FIXTURE_BYTES, '夹具超出安全大小。');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw new ModelFixtureError('MODEL_FIXTURE_INVALID', `夹具 ${current} 不是有效 JSON。`);
    }
    const fixture = parseModelFixture(parsed);
    requireFixture(fixture.identity === current, '夹具身份与文件名不一致。');
    chain.push({ fixture, sha256: sha256Hex(bytes) });
    current = fixture.basedOn;
  }
  const entries = new Map<string, ModelFixtureEntry>();
  for (const link of [...chain].reverse()) {
    for (const entry of link.fixture.entries) entries.set(fixtureEntryKey(entry.unitOrdinal, entry.requestDigest, entry.attempt), entry);
  }
  const lineage = chain.map((link) => ({ identity: link.fixture.identity, sha256: link.sha256 }));
  return {
    identity,
    description: chain[0]!.fixture.description,
    provenance: chain[0]!.fixture.provenance,
    lineage,
    entries,
    sha256: sha256Hex(lineage.map((link) => `${link.identity}:${link.sha256}`).join('\n')),
  };
}
