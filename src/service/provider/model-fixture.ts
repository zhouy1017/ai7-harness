import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { canonicalJson, DIGEST_PATTERN, hasExactKeys, isRecord, sha256Hex } from '../analysis/canonical.js';
import { providerCacheKey, providerEvidenceGeneration } from './provider-result-cache.js';
import { clarificationPromptContractDigest } from './clarification-contract.js';

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
 * Synthetic fixtures carry public stand-ins. Reviewed recorded fixtures may retain exact sample1
 * free text under ADR 0079 §5; actual recorded replay remains confined to the complete Journey.
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
 *
 * An entry the fixture converter wrote from a Provider Test Ledger capture (Issue #808) additionally carries its `capture`:
 * the item that captured it, which subject it answers (a unit, the reduction, a sampling turn, the reflection, or a
 * synthesis or dialogue turn the adapter already answers), the route, endpoint, request shape and model, the stage's own
 * prompt contract and the enclosing task's, when, the digests of the exact provider request and response, the development
 * validation it belonged to, and the captured identity each placeholder stands for. Nothing is keyed by it: the deterministic
 * adapter only declines an entry whose recorded enclosing task contract is not the one it answers for, and an entry without
 * it reads exactly as before.
 */
export const MODEL_FIXTURE_SCHEMA = 'ai7.model-fixture/1' as const;
export const FIXTURE_IDENTITY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_FIXTURE_BYTES = 512 * 1024;
const MAX_BASE_DEPTH = 4;
const MAX_FIXTURE_ATTEMPT = 8;
/** The most text deltas one dialogue answer streams. */
const MAX_ANSWER_CHUNKS = 64;
/** The keys an entry may carry beside the three it must; every other key is still refused. */
const OPTIONAL_ENTRY_KEYS = ['attempt', 'contentDigest', 'capture'] as const;
const CAPTURE_KEYS = [
  'subject', 'itemId', 'selectedItemId', 'evidenceScope', 'route', 'endpoint', 'requestShape', 'model', 'promptContractDigest', 'taskPromptContractDigest',
  'capturedAt', 'providerRequestDigest', 'providerResponseDigest', 'validation', 'identityMap', 'cacheKey', 'generation', 'fixtureResponseDigest', 'responseDigestOrigin',
] as const;
const CAPTURE_SUBJECTS = ['unit', 'reduction', 'sampling', 'reflection', 'factual-unit', 'review-unit', 'evaluation-unit', 'readers-unit', 'rewrite-unit', 'writing-unit', 'task-synthesis', 'dialogue', 'editorial-polish', 'conflict-regenerate'] as const;
const CAPTURE_ITEM_PATTERN = /^[A-Za-z0-9]+\/[a-z0-9-]+\/[1-9][0-9]{0,5}$/u;
const CAPTURE_PLACEHOLDER_PATTERN = /^\{\{(?:block:[1-9][0-9]{0,3}|unit:[1-9][0-9]{0,3}:block:[1-9][0-9]{0,3}|ref:[1-9][0-9]{0,3}|sample-block:[1-9][0-9]{0,3})\}\}$/u;
const CAPTURE_IDENTITY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const MAX_IDENTITY_MAP = 4_096;
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
  /**
   * An Interactive Editorial Dialogue answer (Issue #52, S17a): the text deltas the model streams, in order, so a test and
   * J-16 see the answer arrive in pieces — a sentence cut between two of them included — and can hold it between two.
   */
  | { readonly kind: 'answer-chunks'; readonly chunks: ReadonlyArray<string>; readonly usage: { readonly inputTokens: number; readonly outputTokens: number } }
  | { readonly kind: 'adapter-failure'; readonly code: string; readonly message: string; readonly status: number | null }
  | { readonly kind: 'quota-exceeded'; readonly message: string; readonly status: number }
  | { readonly kind: 'interrupted'; readonly message: string }
  /**
   * 结果待确认's stimulus (Issue #51, S16c): the request reached the model service and its answer never came back whole, so
   * whether it was processed and billed cannot be known. Only J-10 may load a fixture that names it ({@link outcomeUnknownFixtureAllowed}).
   */
  | { readonly kind: 'outcome-unknown'; readonly message: string };

/**
 * Where a converted entry came from (Issue #808): the capture's identity and conditions, never its content. A legacy capture —
 * cached before the cache recorded its route, endpoint and request shape — says so and leaves those `null`.
 */
export interface ModelFixtureCapture {
  readonly subject: (typeof CAPTURE_SUBJECTS)[number];
  /** The test item that captured the response. */
  readonly itemId: string;
  /** The test item the converter was pointed at: the capture itself, or a replay of it. */
  readonly selectedItemId: string;
  readonly evidenceScope: 'namespaced' | 'legacy-unnamespaced';
  readonly route: string | null;
  readonly endpoint: string | null;
  readonly requestShape: string | null;
  readonly model: string;
  /** The contract the captured call itself ran under: the reduction's, a sampling turn's or the reflection's own for those. */
  readonly promptContractDigest: string;
  /** The enclosing task's contract; `null` for a legacy capture, which recorded only one contract for every call. */
  readonly taskPromptContractDigest: string | null;
  readonly capturedAt: string;
  /** SHA-256 over the exact canonical request body that was sent. */
  readonly providerRequestDigest: string;
  /** SHA-256 over the response as the cache entry keeps it. */
  readonly providerResponseDigest: string;
  /** Legacy caches did not record a response hash; conversion computes it without claiming historical integrity. */
  readonly responseDigestOrigin: 'recorded' | 'computed-legacy';
  readonly cacheKey: string | null;
  readonly generation: string | null;
  /** Integrity of the sanitized response; distinct from the original Provider response digest. */
  readonly fixtureResponseDigest: string;
  readonly validation: { readonly family: string; readonly case: string; readonly step: string } | null;
  /** Every placeholder the response carries, with the identity in the captured request it stands for. */
  readonly identityMap: ReadonlyArray<{ readonly placeholder: string; readonly identity: string }>;
}

export interface ModelFixtureEntry {
  /** The Analysis Unit this entry answers, or `0` for the Run's one cross-unit reduction. */
  readonly unitOrdinal: number;
  readonly requestDigest: string;
  /** The 1-based attempt this entry answers, or `null` for an entry that answers every attempt. */
  readonly attempt: number | null;
  /** The digest over this unit's own block texts, or `null` for an entry keyed by request digest alone. */
  readonly contentDigest: string | null;
  readonly response: ModelFixtureResponse;
  /** Present only on an entry converted from a captured response. */
  readonly capture?: ModelFixtureCapture;
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
    case 'answer-chunks': {
      requireFixture(hasExactKeys(value, ['kind', 'chunks', 'usage']) && Array.isArray(value.chunks) && value.chunks.length >= 1 &&
        value.chunks.length <= MAX_ANSWER_CHUNKS && value.chunks.every((chunk) => wellFormed(chunk, 4 * 1024) && (chunk as string).length > 0) &&
        isRecord(value.usage) && hasExactKeys(value.usage, ['inputTokens', 'outputTokens']) &&
        Number.isSafeInteger(value.usage.inputTokens) && (value.usage.inputTokens as number) >= 0 &&
        Number.isSafeInteger(value.usage.outputTokens) && (value.usage.outputTokens as number) >= 0, '夹具 answer-chunks 响应无效。');
      return { kind: 'answer-chunks', chunks: [...value.chunks as string[]], usage: { inputTokens: value.usage.inputTokens as number, outputTokens: value.usage.outputTokens as number } };
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
    case 'outcome-unknown': {
      requireFixture(hasExactKeys(value, ['kind', 'message']) && wellFormed(value.message, 1_024), '夹具 outcome-unknown 响应无效。');
      return { kind: 'outcome-unknown', message: value.message };
    }
    default:
      throw new ModelFixtureError('MODEL_FIXTURE_INVALID', '夹具响应类型不在闭合集合内。');
  }
}

function boundedText(value: unknown, maximum: number): value is string {
  return wellFormed(value, maximum) && value.length > 0;
}

function parseCapture(value: unknown): ModelFixtureCapture {
  requireFixture(isRecord(value) && hasExactKeys(value, CAPTURE_KEYS), '夹具条目的捕获来源键集合无效。');
  requireFixture((CAPTURE_SUBJECTS as ReadonlyArray<unknown>).includes(value.subject) &&
    typeof value.itemId === 'string' && CAPTURE_ITEM_PATTERN.test(value.itemId) &&
    typeof value.selectedItemId === 'string' && CAPTURE_ITEM_PATTERN.test(value.selectedItemId) &&
    (value.evidenceScope === 'namespaced' || value.evidenceScope === 'legacy-unnamespaced'), '夹具条目的捕获来源无效。');
  const namespaced = value.evidenceScope === 'namespaced';
  requireFixture(namespaced ? typeof value.taskPromptContractDigest === 'string' && DIGEST_PATTERN.test(value.taskPromptContractDigest)
    : value.taskPromptContractDigest === null, '夹具条目的任务契约来源无效。');
  requireFixture(value.responseDigestOrigin === (namespaced ? 'recorded' : 'computed-legacy'), '夹具条目的响应摘要来源无效。');
  for (const key of ['route', 'endpoint', 'requestShape'] as const) {
    requireFixture(namespaced ? boundedText(value[key], 512) : value[key] === null, '夹具条目的捕获路由、端点或请求形态无效。');
  }
  requireFixture(boundedText(value.model, 128) && typeof value.promptContractDigest === 'string' && DIGEST_PATTERN.test(value.promptContractDigest) &&
    boundedText(value.capturedAt, 64) && !Number.isNaN(Date.parse(value.capturedAt)) &&
    typeof value.providerRequestDigest === 'string' && DIGEST_PATTERN.test(value.providerRequestDigest) &&
    typeof value.providerResponseDigest === 'string' && DIGEST_PATTERN.test(value.providerResponseDigest) &&
    typeof value.fixtureResponseDigest === 'string' && DIGEST_PATTERN.test(value.fixtureResponseDigest), '夹具条目的捕获摘要无效。');
  const namespace = { route: value.route as string, endpoint: value.endpoint as string, requestShape: value.requestShape as string, model: value.model };
  requireFixture(namespaced
    ? value.cacheKey === providerCacheKey(namespace, value.providerRequestDigest) &&
      value.generation === providerEvidenceGeneration(namespace, value.promptContractDigest, value.taskPromptContractDigest as string)
    : value.cacheKey === null && value.generation === null, '夹具条目的捕获命名空间或代次无效。');
  const validation = value.validation;
  requireFixture((!namespaced && validation === null) || (isRecord(validation) && hasExactKeys(validation, ['family', 'case', 'step']) &&
    boundedText(validation.family, 48) && boundedText(validation.case, 48) && boundedText(validation.step, 128)), '夹具条目的验证用途无效。');
  if (namespaced) {
    let endpoint: URL | undefined;
    try { endpoint = new URL(value.endpoint as string); } catch { /* Refuse without printing a payload field. */ }
    requireFixture(endpoint !== undefined && endpoint.protocol === 'https:' && endpoint.username === '' && endpoint.password === '' &&
      endpoint.search === '' && endpoint.hash === '' && /^[a-z][a-z0-9-]{0,63}$/u.test(value.route as string) &&
      (value.requestShape === 'openai-chat-completions' ||
        (value.requestShape === 'editorial-dialogue-sse' && value.subject === 'dialogue' && value.route === 'opencode-go')),
      '夹具条目的捕获路由或形态无效。');
  }
  requireFixture(Array.isArray(value.identityMap) && value.identityMap.length <= MAX_IDENTITY_MAP && value.identityMap.every((mapping) =>
    isRecord(mapping) && hasExactKeys(mapping, ['placeholder', 'identity']) &&
    typeof mapping.placeholder === 'string' && CAPTURE_PLACEHOLDER_PATTERN.test(mapping.placeholder) &&
    typeof mapping.identity === 'string' && CAPTURE_IDENTITY_PATTERN.test(mapping.identity)), '夹具条目的标识映射无效。');
  requireFixture(new Set(value.identityMap.map((mapping) => mapping.placeholder)).size === value.identityMap.length &&
    new Set(value.identityMap.map((mapping) => mapping.identity)).size === value.identityMap.length, '夹具条目的标识映射重复。');
  return {
    subject: value.subject as ModelFixtureCapture['subject'],
    itemId: value.itemId,
    selectedItemId: value.selectedItemId,
    evidenceScope: value.evidenceScope as ModelFixtureCapture['evidenceScope'],
    route: value.route as string | null,
    endpoint: value.endpoint as string | null,
    requestShape: value.requestShape as string | null,
    model: value.model,
    promptContractDigest: value.promptContractDigest,
    taskPromptContractDigest: value.taskPromptContractDigest as string | null,
    capturedAt: value.capturedAt,
    providerRequestDigest: value.providerRequestDigest,
    providerResponseDigest: value.providerResponseDigest,
    responseDigestOrigin: value.responseDigestOrigin as ModelFixtureCapture['responseDigestOrigin'],
    cacheKey: value.cacheKey as string | null,
    generation: value.generation as string | null,
    fixtureResponseDigest: value.fixtureResponseDigest,
    validation: validation === null ? null : { family: validation.family as string, case: validation.case as string, step: validation.step as string },
    identityMap: (value.identityMap as Array<{ placeholder: string; identity: string }>).map((mapping) => ({ placeholder: mapping.placeholder, identity: mapping.identity })),
  };
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
    const response = parseResponse(entry.response);
    const capture = 'capture' in entry ? parseCapture(entry.capture) : undefined;
    if (capture !== undefined) {
      requireFixture(capture.fixtureResponseDigest === sha256Hex(canonicalJson(response)), '夹具条目的响应与捕获摘要不一致。');
      const unitSubject = capture.subject === 'unit' || capture.subject.endsWith('-unit');
      const stageSubject = ['reduction', 'sampling', 'reflection'].includes(capture.subject);
      // A legacy line recorded one contract for every call, so only a namespaced capture can say which contract a stage ran under.
      requireFixture(stageSubject ? capture.evidenceScope === 'namespaced'
        : capture.taskPromptContractDigest === null || capture.taskPromptContractDigest === capture.promptContractDigest ||
          // A book-level synthesis asked inside a Task wrapped with the v14 model-question instruction runs under its base contract (#812).
          (capture.subject === 'task-synthesis' && capture.taskPromptContractDigest === clarificationPromptContractDigest(capture.promptContractDigest)),
      '夹具条目的任务与阶段契约不一致。');
      requireFixture(unitSubject ? (entry.unitOrdinal as number) > 0 : entry.unitOrdinal === 0, '夹具条目的捕获契约序号不一致。');
      requireFixture(capture.subject === 'dialogue' ? response.kind !== 'unit-result' : response.kind !== 'answer-chunks', '夹具条目的捕获响应契约不一致。');
      const serializedResponse = JSON.stringify(response);
      const placeholders = serializedResponse.match(/\{\{[^{}]+\}\}/gu) ?? [];
      requireFixture(!/blk_[0-9a-f]{24}/u.test(serializedResponse) && placeholders.every((placeholder) =>
        capture.identityMap.some((mapping) => mapping.placeholder === placeholder)), '夹具条目的响应标识未经映射。');
      requireFixture(capture.identityMap.every((mapping) => serializedResponse.includes(mapping.placeholder) &&
        (unitSubject ? /^\{\{block:/u.test(mapping.placeholder)
          : capture.subject === 'reduction' ? /^\{\{unit:/u.test(mapping.placeholder)
            : capture.subject === 'sampling' && /^\{\{(?:ref|sample-block):/u.test(mapping.placeholder))), '夹具条目的标识映射与捕获契约不一致。');
    }
    return {
      unitOrdinal: entry.unitOrdinal as number,
      requestDigest: entry.requestDigest,
      attempt: attempt as number | null,
      contentDigest: contentDigest as string | null,
      response,
      ...(capture === undefined ? {} : { capture }),
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

/**
 * The one Journey whose launch may load a fixture that ends a turn ambiguously (Issue #51, S16c): J-10, under development-ci —
 * the only scope a fixture is ever loaded in. Any other launch naming such a fixture is refused before the store opens, so the
 * stimulus is never reachable in a product launch nor in another Journey's.
 */
export const OUTCOME_UNKNOWN_FIXTURE_JOURNEY = 'J-10' as const;

/** Whether any entry of a resolved fixture, its bases' included, ends its turn with 结果待确认. */
export function fixtureEndsAmbiguously(fixture: ResolvedModelFixture): boolean {
  return [...fixture.entries.values()].some((entry) => entry.response.kind === 'outcome-unknown');
}

/** Whether a launch under `journey` (the `AI7_E2E_JOURNEY` it runs under, or none) may bind this fixture. */
export function outcomeUnknownFixtureAllowed(fixture: ResolvedModelFixture, journey: string | undefined): boolean {
  return !fixtureEndsAmbiguously(fixture) || journey === OUTCOME_UNKNOWN_FIXTURE_JOURNEY;
}

/**
 * The fixture a launch's `--j04-model-adapter` binds, as the service's startup loads it (Issue #51, S16c): its base chain
 * resolved, and refused with `MODEL_FIXTURE_REFUSED` — before the store opens — when it ends a turn with 结果待确认 and the
 * launch is not J-10's.
 */
export async function loadLaunchFixture(fixturesRoot: string, identity: string, journey: string | undefined): Promise<ResolvedModelFixture> {
  const fixture = await loadModelFixture(fixturesRoot, identity);
  if (!outcomeUnknownFixtureAllowed(fixture, journey)) {
    throw new ModelFixtureError('MODEL_FIXTURE_REFUSED', `夹具 ${identity} 含结果待确认的响应，只能在 ${OUTCOME_UNKNOWN_FIXTURE_JOURNEY} 的启动中绑定。`);
  }
  return fixture;
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
