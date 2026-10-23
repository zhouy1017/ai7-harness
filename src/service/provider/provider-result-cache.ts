import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { DevelopmentValidationDelta } from '../../shared/protocol.js';

/**
 * Host-local development evidence under ADR 0067/0089. Exact responses, append-only ledger entries,
 * invalidations and durable send claims share this existing owner outside every checkout. Credentials,
 * headers and diagnostics never enter it. Ordinary business execution does not use it.
 *
 * Response keys bind route, endpoint, request shape, model and canonical request bytes. Capture hashes
 * and the active prompt generation are checked before reuse. Legacy captures retain their unproved
 * namespace and cannot be relabeled as current evidence. Normalized identities select evidence and
 * durable claim chains only; they never select a response for another input.
 */
export const PROVIDER_LEDGER_FILE = 'ledger.jsonl';
export const PROVIDER_CACHE_DIRECTORY = 'entries';
/** Durable normalized-request attempt chains and exclusive item identity reservations. */
export const PROVIDER_CLAIM_DIRECTORY = 'claims';
/** The namespace version every #808 entry key is taken under; a legacy key never carries it. */
export const PROVIDER_CACHE_NAMESPACE = 'ai7.provider-cache/2';
const PROVIDER_CLAIM_SCHEMA = 'ai7.provider-claim/1';
/** The plan slice that owns every model-call test item the analysis path mints; the default slice of `nextItemId`. */
export const PROVIDER_TEST_ITEM_SLICE = 'S40';
/**
 * Every plan slice this checkout may write (Issue #473, S87-f3a). S40 owns the analysis path's model calls;
 * S87 owns the platform tools' search and fetch items (ADR 0080 §7.6); S17c owns the live
 * dialogue's items (ADR 0088 §1.8); S84 owns writing's items (#810); S30 owns 润色这段's and S22 稿件冲突 › 基于当前稿件重新生成建议's
 * (Issue #842); S80 owns 生成来源译文's (Issue #892). Only this closed set may mint or write items. A shared ledger can also carry
 * readable metadata from other slices, without granting those rows positive evidence or mutation authority.
 * The slice only numbers records: the purpose a call answers is its validation family and case,
 * never this.
 */
export const PROVIDER_TEST_ITEM_SLICES = ['S40', 'S87', 'S17c', 'S84', 'S30', 'S22', 'S80'] as const;
export type ProviderTestItemSlice = (typeof PROVIDER_TEST_ITEM_SLICES)[number];
const ITEM_ID_PATTERN = /^(?:S40|S87|S17c|S84|S30|S22|S80)\/[a-z0-9-]+\/[1-9][0-9]{0,5}$/u;
const LEDGER_ITEM_ID_PATTERN = /^[A-Za-z0-9]+\/[a-z0-9-]+\/[1-9][0-9]{0,5}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

/** Readable foreign identities never acquire the authority of a locally supported test item. */
export function isSupportedProviderTestItemId(itemId: string): boolean {
  return ITEM_ID_PATTERN.test(itemId);
}
/**
 * What one ledger line records the sending of. A line without `kind` is a model call: every line written before the
 * platform tools existed reads that way, and a model-call line is still written without the field.
 */
export type ProviderTestItemKind = 'model-call' | 'search-call' | 'fetch';

export interface ProviderUsageRecord {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** What a replay or a cache hit costs: nothing was sent. */
export const NO_INCURRED_USAGE: ProviderUsageRecord = { inputTokens: 0, outputTokens: 0 };

/** Where an exact request went and in what form: with the full body digest, the key of one cache entry. */
export interface ProviderRequestNamespace {
  readonly route: string;
  readonly endpoint: string;
  readonly requestShape: string;
  readonly model: string;
}

/**
 * Why a development validation call was answered, refused, or sent (Issue #808). `exact-replay` answered it from the cache, and
 * `refused` sent nothing (`refusal` says why); the others sent it: `first-capture` because no valid evidence exists for its
 * purpose and step, `config-delta` because the evidence there was captured under another route, endpoint, request shape, model
 * or prompt contract (`changed` names which), `input-delta` because the launch declared that the input itself differs and it
 * does, `retry-unknown` because the launch declared a resend of a request whose result is unknown.
 */
export type ProviderValidationDecision = 'exact-replay' | 'refused' | 'first-capture' | 'config-delta' | 'input-delta' | 'retry-unknown';

/** The development validation one model-call line belongs to, and why it was answered or sent. */
export interface ProviderValidationRecord {
  readonly family: string;
  readonly case: string;
  /** The Task mode and the turn within it — `first-baseline/unit-3`, `…/reduction`, `…/sampling-1-unit-4`, `…/reflection`. */
  readonly step: string;
  readonly delta: DevelopmentValidationDelta | null;
  readonly decision: ProviderValidationDecision;
  /** The items the decision rests on: the capture replayed, the evidence a delta was measured against, the unknown resent. */
  readonly evidence: ReadonlyArray<string>;
  /** For `config-delta`: which of route, endpoint, request shape, model and prompt contract differ from the evidence. */
  readonly changed?: ReadonlyArray<string>;
  /** For `refused`: the refusal's code — the evidence already answers it, a similar input needs a delta, or the request is held. */
  readonly refusal?: string;
}

/** One append-only ledger line: what was asked for, under which item, and how it settled. */
export interface ProviderLedgerLine {
  readonly itemId: string;
  /** Absent on every model-call line, which is how the lines the ledger already carries keep reading. */
  readonly kind?: 'model-call';
  readonly purpose: string;
  readonly model: string;
  readonly promptContractDigest: string;
  /** Enclosing task contract, distinct from a reduction/sampling/reflection call's actual prompt contract. */
  readonly taskPromptContractDigest?: string;
  readonly requestDigest: string;
  /** `refused` (Issue #808): a development validation call that existing evidence or a hold answered, so nothing was sent. */
  readonly outcome: 'transmitted' | 'replayed' | 'failed' | 'refused';
  readonly status: number | null;
  /**
   * The usage the response recorded. On a replay it is the captured response's original usage — what that capture cost when
   * it was sent — never this run's; `incurredUsage` says what this run spent.
   */
  readonly usage: ProviderUsageRecord | null;
  /**
   * The ledger's own label for a Provider Account Limit. The product class is
   * `provider-account-limit`; `quota-exhausted` is what the ledger calls it, so a later reader can
   * tell an exhausted development account from any other failure without reopening the response.
   * `outcome-unknown` (Issue #51, S16c) is a request that was sent and accepted whose answer never came
   * back whole: it may have been processed and billed, and nothing of it is cached.
   */
  readonly classification?: 'quota-exhausted' | 'outcome-unknown';
  /** Set only for a Provider Account Limit, and only when the response stated one. */
  readonly resetWindow?: string;
  /**
   * A stale line no longer reserves its item id, and since #808 an item whose every line is stale no longer answers anything:
   * neither an exact replay nor a similar request is answered by its capture. `invalidate` retires one append-only.
   */
  readonly stale?: boolean;
  readonly recordedAt: string;
  // --- Issue #808: absent on every line written before it. ---
  readonly route?: string;
  readonly endpoint?: string;
  readonly requestShape?: string;
  /** The namespaced entry key this call was answered or captured under. */
  readonly cacheKey?: string;
  /** Base key of the durable normalized-request attempt chain; distinct from the exact response key. */
  readonly claimKey?: string;
  /** The digest of the request body with recognized generated identity positions normalized (see {@link providerSemanticDigest}). */
  readonly semanticDigest?: string;
  /** The digest of the configuration the call ran under (see {@link providerEvidenceGeneration}). */
  readonly generation?: string;
  /** Ledger length observed before claiming: later family invalidation also retires an in-flight capture. */
  readonly evidencePosition?: number;
  readonly validation?: ProviderValidationRecord;
  /** What this run spent on the call: nothing for a replay, the recorded usage for a send, `null` when it cannot be known. */
  readonly incurredUsage?: ProviderUsageRecord | null;
  /** On a replay, when the replayed response was captured. */
  readonly capturedAt?: string;
  /** On a replay of an entry written before #808: its route, endpoint and request shape were never recorded. */
  readonly evidenceScope?: 'legacy-unnamespaced';
}

/**
 * One platform-tool line (ADR 0080 §7.6): a `websearch` call forwarded to the rule's search service, or a `webfetch` of
 * one public source. It records the canonical-argument digest, the host, the result's digest and size, and the elapsed
 * time — never the query, the page, or the result text.
 */
export interface ProviderToolLedgerLine {
  readonly itemId: string;
  readonly kind: 'search-call' | 'fetch';
  readonly purpose: string;
  /** SHA-256 over the tool name and its canonical arguments: the key the Research Snapshot Cache answers by. */
  readonly argumentsDigest: string;
  readonly host: string;
  readonly outcome: 'transmitted' | 'replayed' | 'failed';
  readonly status: number | null;
  readonly resultDigest: string | null;
  readonly resultBytes: number | null;
  readonly elapsedMs: number | null;
  readonly stale?: boolean;
  readonly recordedAt: string;
}

/**
 * What one invalidation retires (Issue #808): one captured item, or every item captured under one validation family and case
 * up to the moment the invalidation was recorded. Captures made after it are a new generation of that evidence.
 */
export type ProviderInvalidationTarget = { readonly itemId: string } | { readonly family: string; readonly case: string };

/**
 * One append-only invalidation: the capture it names stays on the ledger and in the cache with its identity, and from now on
 * answers nothing — no exact replay, no similar request, no fixture — so the same request may be captured again.
 */
export interface ProviderInvalidationLine {
  readonly kind: 'invalidation';
  readonly target: ProviderInvalidationTarget;
  readonly reason: string;
  readonly recordedAt: string;
}

/** Any one line a test item writes. */
export type ProviderItemLine = ProviderLedgerLine | ProviderToolLedgerLine;
/** Any one ledger line. */
export type ProviderLedgerEntry = ProviderItemLine | ProviderInvalidationLine;

/** A bounded report projection, never a payload, path, or evidence grant. Positions count nonempty records from zero. */
export interface ProviderForeignRowMetadata {
  readonly position: number;
  /** At most 160 characters; the original identity remains untouched in the ledger. */
  readonly itemId: string;
  readonly kind: ProviderTestItemKind | 'invalidation';
  readonly outcome: ProviderItemLine['outcome'] | null;
}

/** Whether one ledger line records a model call; a line without `kind` does. */
export function isModelCallLine(line: ProviderLedgerEntry): line is ProviderLedgerLine {
  return line.kind === undefined || line.kind === 'model-call';
}

/** Whether one ledger line belongs to a test item, as every line but an invalidation does. */
export function isItemLine(line: ProviderLedgerEntry): line is ProviderItemLine {
  return line.kind !== 'invalidation';
}

/** One cached result: the exact request that produced it and the exact response it produced. */
export interface ProviderCacheEntry {
  readonly model: string;
  readonly requestDigest: string;
  /** The canonical request body, byte for byte as it was transmitted; never any header. */
  readonly requestBody: string;
  readonly status: number;
  readonly response: unknown;
  readonly usage: ProviderUsageRecord | null;
  readonly transmittedAt: string;
  readonly firstReplayedAt?: string;
  // --- Issue #808: absent on every legacy entry. ---
  /** The test item that captured this response. */
  readonly itemId?: string;
  readonly route?: string;
  readonly endpoint?: string;
  readonly requestShape?: string;
  readonly cacheKey?: string;
  readonly claimKey?: string;
  readonly semanticDigest?: string;
  readonly generation?: string;
  readonly evidencePosition?: number;
  readonly promptContractDigest?: string;
  readonly taskPromptContractDigest?: string;
  readonly validation?: { readonly family: string; readonly case: string; readonly step: string };
  /** SHA-256 over the response as this entry keeps it (`JSON.stringify(response)`). */
  readonly responseDigest?: string;
  /** SSE answer assembled once. A partial entry is evidence of an unknown outcome, never a replayable answer. */
  readonly streamedAnswer?: { readonly complete: boolean; readonly chunks: ReadonlyArray<string> };
}

/** A cache entry as a reader finds it: absent, whole, or present and unreadable — which is never a miss. */
export type ProviderEntryRead =
  | { readonly state: 'absent' }
  | { readonly state: 'present'; readonly entry: ProviderCacheEntry }
  | { readonly state: 'corrupt' };

/** The durable pre-send claim of one exact request. */
export interface ProviderClaim {
  readonly schema: typeof PROVIDER_CLAIM_SCHEMA;
  readonly cacheKey: string;
  readonly itemId: string;
  /** An attempt stays recorded through settlement; only a terminal or provably stopped attempt may have a successor. */
  readonly state: 'claimed' | 'outcome-unknown' | 'completed' | 'failed';
  readonly claimedAt: string;
  readonly family: string;
  readonly case: string;
  readonly step: string;
  readonly processId?: number;
  readonly generation?: string;
  readonly evidencePosition?: number;
  readonly semanticDigest?: string;
  readonly retryRationales?: ReadonlyArray<string>;
}

/**
 * The newest attempt in a durable chain. Claimed/corrupt attempts fail closed; a terminal result retains
 * what happened even if the response is later lost. storageKey identifies this exact attempt, not the response.
 */
export type ProviderClaimRead =
  | { readonly state: 'absent'; readonly storageKey: string }
  | { readonly state: ProviderClaim['state']; readonly claim: ProviderClaim; readonly storageKey: string }
  | { readonly state: 'corrupt'; readonly storageKey: string };

export class ProviderResultCacheError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ProviderResultCacheError';
  }
}

function requireCache(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ProviderResultCacheError(code, message);
}

export function providerRequestDigest(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/** The namespaced key of one exact request: its route, endpoint, request shape, model and full body digest. */
export function providerCacheKey(namespace: ProviderRequestNamespace, requestDigest: string): string {
  return createHash('sha256').update(JSON.stringify([
    PROVIDER_CACHE_NAMESPACE, namespace.route, namespace.endpoint, namespace.requestShape, namespace.model, requestDigest,
  ]), 'utf8').digest('hex');
}

/**
 * The key every entry written before #808 was stored under. The two parts are joined through JSON rather than a separator
 * character, so no model id can ever be read as part of a digest.
 */
export function legacyProviderCacheKey(model: string, requestDigest: string): string {
  return createHash('sha256').update(JSON.stringify([model, requestDigest]), 'utf8').digest('hex');
}

/**
 * Normalize only generated positions in the admitted message contracts, preserving manuscript UUIDs/digests and identity
 * relationships. This is a conservative evidence selector, never a response key or a general semantic equivalence test.
 */
export function providerSemanticDigest(body: string): string {
  const identities = new Map<string, string>();
  const identity = (value: string): string => {
    if (!identities.has(value)) identities.set(value, `<identity-${identities.size}>`);
    return identities.get(value)!;
  };
  const message = (text: string): string => {
    const lines = text.split('\n');
    if (!/^(?:分析单元 |保证抽样 |跨单元归纳 |运行反思 )/u.test(lines[0] ?? '')) return text;
    lines[0] = lines[0]!.replace(/(?<= · (?:单元摘要|单元集摘要|抽样摘要|账目摘要) )[0-9a-f]{64}/gu, '<digest>')
      .replace(/(?<=^运行反思 )[A-Za-z0-9_-]{1,64}(?= · )/u, '<run>');
    return lines.map((line, index) => {
      if (index === 0) return line;
      if (/^单元 \d+：blk_[0-9a-f]{24}/u.test(line)) return line.replace(/blk_[0-9a-f]{24}/gu, identity);
      return line.replace(/^(\[)(blk_[0-9a-f]{24})(\])/u, (_match, before: string, id: string, after: string) => `${before}${identity(id)}${after}`)
        .replace(/^(- \[)([A-Za-z0-9_-]{1,64})(\]（)/u, (_match, before: string, id: string, after: string) => `${before}${identity(id)}${after}`);
    }).join('\n');
  };
  try {
    const canonical = (value: unknown, key = ''): unknown => {
      if (typeof value === 'string') return key === 'content' ? message(value) : value;
      if (Array.isArray(value)) return value.map((part) => canonical(part));
      if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, part]) => [name, canonical(part, name)]));
      return value;
    };
    return providerRequestDigest(JSON.stringify(canonical(JSON.parse(body))));
  } catch {
    return providerRequestDigest(body);
  }
}

/** The configuration a capture answers for: route, endpoint, request shape, model and the frozen prompt contract. */
export function providerEvidenceGeneration(namespace: ProviderRequestNamespace, promptContractDigest: string, taskPromptContractDigest?: string): string {
  return createHash('sha256').update(JSON.stringify([
    namespace.route, namespace.endpoint, namespace.requestShape, namespace.model, promptContractDigest,
    ...(taskPromptContractDigest === undefined || taskPromptContractDigest === promptContractDigest ? [] : [taskPromptContractDigest]),
  ]), 'utf8').digest('hex');
}

/** SHA-256 over a response as an entry keeps it; the fixture converter recomputes it the same way for a legacy entry. */
export function providerResponseDigest(response: unknown): string {
  return providerRequestDigest(JSON.stringify(response) ?? 'null');
}

/** The OpenAI-compatible usage shape, reduced to the two counts the ceiling and the report use. */
export function usageOfResponse(body: unknown): ProviderUsageRecord | null {
  if (body === null || typeof body !== 'object') return null;
  const usage = (body as { usage?: unknown }).usage;
  if (usage === null || typeof usage !== 'object') return null;
  const prompt = (usage as { prompt_tokens?: unknown }).prompt_tokens;
  const completion = (usage as { completion_tokens?: unknown }).completion_tokens;
  if (!Number.isSafeInteger(prompt) || !Number.isSafeInteger(completion) || (prompt as number) < 0 || (completion as number) < 0) return null;
  return { inputTokens: prompt as number, outputTokens: completion as number };
}

/** A file written whole or not at all: a temporary sibling, synced, then renamed over the target. */
async function writeWhole(path: string, text: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

function isCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === code;
}

/**
 * The per-request turn of every cache instance in this process. Two Runs of one service share no instance, yet a request both
 * miss must still be sent once: the second waits for the first to settle and then reads what it left. Across processes the
 * exclusive claim file excludes a competing process, which fails closed instead of waiting on a possibly dead sender.
 */
const requestTurns = new Map<string, Promise<void>>();

function parseLedgerLine(line: string): ProviderLedgerEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new ProviderResultCacheError('PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 含有无法解析的记录。');
  }
  requireCache(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 记录不是对象。');
  const kind = (parsed as { kind?: unknown }).kind;
  if (kind === 'invalidation') {
    const { target, reason, recordedAt } = parsed as { target?: unknown; reason?: unknown; recordedAt?: unknown };
    requireCache(validInvalidationTarget(target, LEDGER_ITEM_ID_PATTERN) && typeof reason === 'string' && reason.length > 0 && validTimestamp(recordedAt),
      'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 的作废记录无效。');
    return parsed as ProviderInvalidationLine;
  }
  requireCache(typeof (parsed as { itemId?: unknown }).itemId === 'string', 'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 记录缺少测试项标识。');
  requireCache(kind === undefined || kind === 'model-call' || kind === 'search-call' || kind === 'fetch',
    'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 记录的测试项类别无效。');
  const item = parsed as Partial<ProviderLedgerLine>;
  requireCache(LEDGER_ITEM_ID_PATTERN.test(item.itemId!) && typeof item.purpose === 'string' &&
    validTimestamp(item.recordedAt) && (item.status === null || (Number.isSafeInteger(item.status) && item.status! >= 100 && item.status! <= 599)) &&
    (item.stale === undefined || typeof item.stale === 'boolean') &&
    ['transmitted', 'replayed', 'failed', 'refused'].includes(item.outcome ?? ''),
  'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 测试项字段无效。');
  if (kind === undefined || kind === 'model-call') {
    requireCache(typeof item.model === 'string' && validDigest(item.requestDigest) &&
      validDigest(item.promptContractDigest) && (item.usage === null || validUsage(item.usage)) &&
      (item.incurredUsage === undefined || item.incurredUsage === null || validUsage(item.incurredUsage)),
    'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 模型记录无效。');
    requireCache(item.evidencePosition === undefined || (Number.isSafeInteger(item.evidencePosition) && item.evidencePosition >= 0),
      'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 证据位置无效。');
    requireCache(validModelMetadata(item), 'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 模型元数据无效。');
    // A supported capture mismatch keeps its existing EVIDENCE_UNAVAILABLE classification in validEvidence.
    // Foreign metadata has no payload owner here: check only relationships computable from the row itself.
    if (!isSupportedProviderTestItemId(item.itemId!)) {
      requireCache(validForeignIdentity(item), 'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 外部切片身份无效。');
    }
  } else {
    const tool = parsed as Partial<ProviderToolLedgerLine>;
    requireCache(tool.outcome !== undefined && ['transmitted', 'replayed', 'failed'].includes(tool.outcome) &&
      validDigest(tool.argumentsDigest) && typeof tool.host === 'string' &&
      (tool.resultDigest === null || validDigest(tool.resultDigest)) &&
      (tool.resultBytes === null || (Number.isSafeInteger(tool.resultBytes) && tool.resultBytes! >= 0)) &&
      (tool.elapsedMs === null || (typeof tool.elapsedMs === 'number' && Number.isFinite(tool.elapsedMs) && tool.elapsedMs >= 0)),
    'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 工具记录无效。');
  }
  return parsed as ProviderItemLine;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validDigest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function validValidation(value: unknown): value is ProviderValidationRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<ProviderValidationRecord>;
  const delta = record.delta;
  return typeof record.family === 'string' && typeof record.case === 'string' && typeof record.step === 'string' &&
    (delta === null || (delta !== undefined && typeof delta === 'object' && !Array.isArray(delta) &&
      ['input', 'retry-unknown'].includes(delta.kind) && typeof delta.rationale === 'string' && delta.rationale.length > 0)) &&
    ['exact-replay', 'refused', 'first-capture', 'config-delta', 'input-delta', 'retry-unknown'].includes(record.decision ?? '') &&
    Array.isArray(record.evidence) && record.evidence.every((id) => typeof id === 'string' &&
      (LEDGER_ITEM_ID_PATTERN.test(id) || (record.decision === 'refused' && id === 'unreadable'))) &&
    (record.changed === undefined || (Array.isArray(record.changed) && record.changed.every((field) =>
      ['route', 'endpoint', 'requestShape', 'model', 'promptContractDigest', 'taskPromptContractDigest'].includes(field)))) &&
    (record.refusal === undefined || typeof record.refusal === 'string');
}

function validModelMetadata(item: Partial<ProviderLedgerLine>): boolean {
  return ['taskPromptContractDigest', 'cacheKey', 'claimKey', 'semanticDigest', 'generation', 'responseDigest'].every((field) => {
    const value = (item as Record<string, unknown>)[field];
    // A response digest's shape can be checked here, never its correspondence to an absent payload.
    return value === undefined || validDigest(value);
  }) && ['route', 'endpoint', 'requestShape', 'resetWindow'].every((field) => {
    const value = (item as Record<string, unknown>)[field];
    return value === undefined || typeof value === 'string';
  }) && (item.classification === undefined || ['quota-exhausted', 'outcome-unknown'].includes(item.classification)) &&
    (item.capturedAt === undefined || validTimestamp(item.capturedAt)) &&
    (item.evidenceScope === undefined || item.evidenceScope === 'legacy-unnamespaced') &&
    (item.validation === undefined || validValidation(item.validation));
}

function validForeignIdentity(item: Partial<ProviderLedgerLine>): boolean {
  const namespace = typeof item.route === 'string' && typeof item.endpoint === 'string' && typeof item.requestShape === 'string' &&
    typeof item.model === 'string' ? { route: item.route, endpoint: item.endpoint, requestShape: item.requestShape, model: item.model } : null;
  return (item.cacheKey === undefined || (namespace !== null && item.cacheKey === providerCacheKey(namespace, item.requestDigest!))) &&
    (item.claimKey === undefined || (namespace !== null && item.semanticDigest !== undefined && item.claimKey === providerCacheKey(namespace, item.semanticDigest))) &&
    (item.generation === undefined || (namespace !== null && item.generation === providerEvidenceGeneration(namespace, item.promptContractDigest!, item.taskPromptContractDigest)));
}

function validInvalidationTarget(target: unknown, pattern = ITEM_ID_PATTERN): target is ProviderInvalidationTarget {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return false;
  const keys = Object.keys(target).sort().join(',');
  if (keys === 'itemId') return typeof (target as { itemId: unknown }).itemId === 'string' && pattern.test((target as { itemId: string }).itemId);
  return keys === 'case,family' && typeof (target as { family: unknown }).family === 'string' &&
    typeof (target as { case: unknown }).case === 'string';
}

function parseClaim(raw: string, cacheKey: string): ProviderClaim | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const claim = parsed as Partial<ProviderClaim>;
  if (claim.schema !== PROVIDER_CLAIM_SCHEMA || claim.cacheKey !== cacheKey || typeof claim.itemId !== 'string' ||
    !['claimed', 'outcome-unknown', 'completed', 'failed'].includes(claim.state ?? '') || typeof claim.claimedAt !== 'string') return null;
  if (!ITEM_ID_PATTERN.test(claim.itemId) || !Number.isFinite(Date.parse(claim.claimedAt)) ||
    typeof claim.family !== 'string' || typeof claim.case !== 'string' || typeof claim.step !== 'string' ||
    !Number.isSafeInteger(claim.processId) || claim.processId! <= 0 || !DIGEST_PATTERN.test(claim.generation ?? '') ||
    !DIGEST_PATTERN.test(claim.semanticDigest ?? '') || !Array.isArray(claim.retryRationales) ||
    !claim.retryRationales.every((reason) => typeof reason === 'string' && reason.length > 0)) return null;
  return claim as ProviderClaim;
}

export class ProviderResultCache {
  readonly #root: string;
  #lines: ProviderLedgerEntry[] = [];
  #opened = false;

  constructor(root: string) {
    requireCache(isAbsolute(root), 'PROVIDER_CACHE_ROOT_INVALID', 'Provider Result Cache 根目录必须是绝对路径。');
    this.#root = root;
  }

  get root(): string {
    return this.#root;
  }

  /** The ledger as it stands; read by the report and the tests, never logged or transmitted. */
  get lines(): ReadonlyArray<ProviderLedgerEntry> {
    return this.#lines;
  }

  /** At most 100 foreign rows, with bounded identities and no parsed-row or content disclosure. */
  get foreignRows(): ReadonlyArray<ProviderForeignRowMetadata> {
    const rows: ProviderForeignRowMetadata[] = [];
    for (const [position, line] of this.#lines.entries()) {
      const itemId = isItemLine(line) ? line.itemId : 'itemId' in line.target ? line.target.itemId : null;
      if (itemId === null || isSupportedProviderTestItemId(itemId)) continue;
      rows.push({ position, itemId: itemId.slice(0, 160), kind: line.kind ?? 'model-call', outcome: isItemLine(line) ? line.outcome : null });
      if (rows.length === 100) break;
    }
    return rows;
  }

  /** Create the root and read the existing ledger. A malformed line is a refusal, never a silent reset. */
  async open(): Promise<void> {
    if (this.#opened) return;
    await mkdir(join(this.#root, PROVIDER_CACHE_DIRECTORY), { recursive: true });
    await mkdir(join(this.#root, PROVIDER_CLAIM_DIRECTORY), { recursive: true });
    await this.refresh();
    this.#opened = true;
  }

  /**
   * Read the ledger again, as another instance or another process may have appended to it since. Every validation decision
   * reads it fresh, so evidence a concurrent Run captured a moment ago already answers this one.
   */
  async refresh(): Promise<void> {
    let raw = '';
    try {
      raw = await readFile(join(this.#root, PROVIDER_LEDGER_FILE), 'utf8');
    } catch (error) {
      if (!isCode(error, 'ENOENT')) throw error;
    }
    const occupied = new Set<string>();
    this.#lines = raw.split('\n').filter((line) => line.trim().length > 0).map((text, index) => {
      const line = parseLedgerLine(text);
      requireCache(!isModelCallLine(line) || line.evidencePosition === undefined || line.evidencePosition <= index,
        'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 证据顺序无效。');
      if (isItemLine(line) && line.stale !== true) {
        requireCache(!occupied.has(line.itemId), 'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 含有重复的有效测试项。');
        occupied.add(line.itemId);
      }
      return line;
    });
  }

  /**
   * The next unused test item id for one purpose: `<slice>/<purpose>/<n>` where `n` is one past the
   * highest ordinal the ledger already carries for that slice and purpose, stale lines included, so a
   * retired item's number is never reused for a different request. The slice is S40 unless named.
   */
  nextItemId(purpose: string, slice: ProviderTestItemSlice = PROVIDER_TEST_ITEM_SLICE): string {
    requireCache(/^[a-z0-9-]+$/u.test(purpose), 'PROVIDER_TEST_ITEM_INVALID', '测试项用途无效。');
    requireCache((PROVIDER_TEST_ITEM_SLICES as ReadonlyArray<string>).includes(slice), 'PROVIDER_TEST_ITEM_INVALID', '测试项所属切片无效。');
    const prefix = `${slice}/${purpose}/`;
    const highest = this.#lines.filter(isItemLine).reduce((max, line) => {
      if (!line.itemId.startsWith(prefix)) return max;
      const ordinal = Number(line.itemId.slice(prefix.length));
      return Number.isSafeInteger(ordinal) && ordinal > max ? ordinal : max;
    }, 0);
    return `${prefix}${highest + 1}`;
  }

  /** Exclusive identity reservation, also for concurrent different requests and replay/refusal records. */
  async reserveItemId(purpose: string, slice: ProviderTestItemSlice = PROVIDER_TEST_ITEM_SLICE): Promise<string> {
    let itemId = this.nextItemId(purpose, slice);
    for (;;) {
      try {
        const handle = await open(join(this.#root, PROVIDER_CLAIM_DIRECTORY, `item-${providerRequestDigest(itemId)}.json`), 'wx');
        try {
          await handle.writeFile(JSON.stringify({ itemId }), 'utf8');
          await handle.sync();
        } finally { await handle.close(); }
        return itemId;
      } catch (error) {
        if (!isCode(error, 'EEXIST')) throw error;
        const ordinal = Number(itemId.slice(itemId.lastIndexOf('/') + 1)) + 1;
        itemId = `${slice}/${purpose}/${ordinal}`;
        requireCache(ITEM_ID_PATTERN.test(itemId), 'PROVIDER_TEST_ITEM_INVALID', '测试项标识已超出支持的表示范围。');
      }
    }
  }

  /**
   * Reserve one test item id for a live transmission. A ledger already carrying that id refuses,
   * unless every one of its lines is marked `stale`: re-running a named test live is a deliberate
   * act, not something a repeated dispatch can cause by accident.
   */
  claimItem(itemId: string): void {
    requireCache(ITEM_ID_PATTERN.test(itemId), 'PROVIDER_TEST_ITEM_INVALID', '测试项标识不符合 <slice>/<purpose>/<n> 形式。');
    const existing = this.#lines.filter(isItemLine).filter((line) => line.itemId === itemId);
    requireCache(existing.length === 0 || existing.every((line) => line.stale === true),
      'PROVIDER_TEST_ITEM_REPEATED', '该测试项标识已在 Provider Test Ledger 中；未重复发起实时传输。');
  }

  #legacyEntryPath(model: string, requestDigest: string): string {
    return join(this.#root, PROVIDER_CACHE_DIRECTORY, `${legacyProviderCacheKey(model, requestDigest)}.json`);
  }

  #entryPath(cacheKey: string): string {
    requireCache(DIGEST_PATTERN.test(cacheKey), 'PROVIDER_CACHE_KEY_INVALID', 'Provider Result Cache 条目键无效。');
    return join(this.#root, PROVIDER_CACHE_DIRECTORY, `${cacheKey}.json`);
  }

  #claimPath(cacheKey: string): string {
    requireCache(DIGEST_PATTERN.test(cacheKey), 'PROVIDER_CACHE_KEY_INVALID', 'Provider Result Cache 条目键无效。');
    return join(this.#root, PROVIDER_CLAIM_DIRECTORY, `${cacheKey}.json`);
  }

  /** The legacy entry of an identical (model, request digest) pair, or `null`: what every entry before #808 is keyed by. */
  async lookup(model: string, requestDigest: string): Promise<ProviderCacheEntry | null> {
    const read = await readEntryFile(this.#legacyEntryPath(model, requestDigest));
    if (read.state === 'corrupt') throw new ProviderResultCacheError('PROVIDER_CACHE_ENTRY_CORRUPT', 'Provider Result Cache 条目无法读取。');
    return read.state === 'present' ? read.entry : null;
  }

  /** Store one result under its legacy key. Kept for the entries and tests that predate #808; `keep` is the current writer. */
  async store(entry: ProviderCacheEntry): Promise<void> {
    requireCache(entry.itemId === undefined || ITEM_ID_PATTERN.test(entry.itemId), 'PROVIDER_TEST_ITEM_INVALID', '缓存测试项所属切片无效。');
    await writeFile(this.#legacyEntryPath(entry.model, entry.requestDigest), `${JSON.stringify(entry)}\n`, 'utf8');
  }

  /** The entry of one exact namespaced request, as a reader finds it. */
  async readEntry(cacheKey: string): Promise<ProviderEntryRead> {
    return this.#readNamespacedEntry(this.#entryPath(cacheKey), cacheKey);
  }

  async #readNamespacedEntry(path: string, cacheKey: string): Promise<ProviderEntryRead> {
    const read = await readEntryFile(path);
    if (read.state !== 'present') return read;
    const entry = read.entry;
    if (entry.cacheKey !== cacheKey || typeof entry.route !== 'string' || typeof entry.endpoint !== 'string' ||
      typeof entry.requestShape !== 'string' || typeof entry.itemId !== 'string' || !ITEM_ID_PATTERN.test(entry.itemId) ||
      typeof entry.promptContractDigest !== 'string' || !DIGEST_PATTERN.test(entry.promptContractDigest) ||
      entry.validation === undefined || typeof entry.validation.family !== 'string' || typeof entry.validation.case !== 'string' ||
      typeof entry.validation.step !== 'string' || entry.responseDigest !== providerResponseDigest(entry.response) ||
      entry.semanticDigest !== providerSemanticDigest(entry.requestBody) ||
      (entry.claimKey !== undefined && entry.claimKey !== providerCacheKey({ ...entry, route: entry.route, endpoint: entry.endpoint, requestShape: entry.requestShape }, entry.semanticDigest)) ||
      (entry.taskPromptContractDigest !== undefined && !DIGEST_PATTERN.test(entry.taskPromptContractDigest)) ||
      (entry.evidencePosition !== undefined && (!Number.isSafeInteger(entry.evidencePosition) || entry.evidencePosition < 0)) ||
      entry.generation !== providerEvidenceGeneration({ ...entry, route: entry.route, endpoint: entry.endpoint, requestShape: entry.requestShape }, entry.promptContractDigest, entry.taskPromptContractDigest) ||
      providerCacheKey({ ...entry, route: entry.route, endpoint: entry.endpoint, requestShape: entry.requestShape }, entry.requestDigest) !== cacheKey) return { state: 'corrupt' };
    return read;
  }

  /** The legacy entry of one (model, request digest) pair, as a reader finds it. */
  async readLegacyEntry(model: string, requestDigest: string): Promise<ProviderEntryRead> {
    return readEntryFile(this.#legacyEntryPath(model, requestDigest));
  }

  /**
   * Keep one transmitted result under its namespaced key, whole or not at all. An entry already there — an invalidated
   * capture, or an unreadable file — is moved aside first, never overwritten, so retired evidence keeps its identity.
   */
  async keep(entry: ProviderCacheEntry & { readonly cacheKey: string }): Promise<void> {
    requireCache(typeof entry.itemId === 'string' && ITEM_ID_PATTERN.test(entry.itemId), 'PROVIDER_TEST_ITEM_INVALID', '缓存测试项所属切片无效。');
    const path = this.#entryPath(entry.cacheKey);
    await this.#setAside(path);
    await writeWhole(path, `${JSON.stringify(entry)}\n`);
  }

  async #setAside(path: string): Promise<boolean> {
    try {
      await rename(path, `${path.slice(0, -'.json'.length)}.superseded-${Date.now()}-${randomUUID()}.json`);
      return true;
    } catch (error) {
      if (isCode(error, 'ENOENT')) return false;
      throw error;
    }
  }

  /** The claim of one exact request, as a reader finds it. */
  async readClaim(cacheKey: string): Promise<ProviderClaimRead> {
    let storageKey = cacheKey;
    let previous: ProviderClaimRead = { state: 'absent', storageKey };
    for (;;) {
      const current = await this.#readClaimAt(storageKey);
      if (current.state === 'absent') return previous;
      previous = current;
      storageKey = providerRequestDigest(`successor:${storageKey}`);
    }
  }

  async #readClaimAt(storageKey: string): Promise<ProviderClaimRead> {
    let raw: string;
    try {
      raw = await readFile(this.#claimPath(storageKey), 'utf8');
    } catch (error) {
      if (isCode(error, 'ENOENT')) return { state: 'absent', storageKey };
      throw error;
    }
    const claim = parseClaim(raw, storageKey);
    return claim === null ? { state: 'corrupt', storageKey } : { state: claim.state, claim, storageKey };
  }

  /**
   * Claim one exact request before it is sent: the file is created exclusively and synced before this returns, so of any
   * number of senders — in this process or another — exactly one gets `true`, and the claim outlives a crash. A sender that
   * gets `false` sends nothing.
   */
  async claim(claim: Omit<ProviderClaim, 'schema' | 'state'>): Promise<boolean> {
    requireCache(ITEM_ID_PATTERN.test(claim.itemId), 'PROVIDER_TEST_ITEM_INVALID', '发送认领测试项所属切片无效。');
    let handle;
    try {
      handle = await open(this.#claimPath(claim.cacheKey), 'wx');
    } catch (error) {
      if (isCode(error, 'EEXIST')) return false;
      throw error;
    }
    try {
      await handle.writeFile(`${JSON.stringify({ schema: PROVIDER_CLAIM_SCHEMA, ...claim, state: 'claimed' })}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  }

  /** Turn a claim into a lasting hold: the request was sent and its result is unknown, possibly processed and billed. */
  async holdUnknown(claim: Omit<ProviderClaim, 'schema' | 'state'>): Promise<void> {
    requireCache(ITEM_ID_PATTERN.test(claim.itemId), 'PROVIDER_TEST_ITEM_INVALID', '发送认领测试项所属切片无效。');
    await writeWhole(this.#claimPath(claim.cacheKey), `${JSON.stringify({ schema: PROVIDER_CLAIM_SCHEMA, ...claim, state: 'outcome-unknown' })}\n`);
  }

  /** Keep the terminal claim as evidence even if its cache entry or ledger is subsequently lost. */
  async settle(claim: Omit<ProviderClaim, 'schema' | 'state'>, state: 'completed' | 'failed'): Promise<void> {
    requireCache(ITEM_ID_PATTERN.test(claim.itemId), 'PROVIDER_TEST_ITEM_INVALID', '发送认领测试项所属切片无效。');
    await writeWhole(this.#claimPath(claim.cacheKey), `${JSON.stringify({ schema: PROVIDER_CLAIM_SCHEMA, ...claim, state })}\n`);
  }

  /** A successor has a fixed exclusive path. Concurrent retry/invalidation decisions can create only one. */
  successorKey(previous: ProviderClaimRead): string {
    return previous.state === 'absent' ? previous.storageKey : providerRequestDigest(`successor:${previous.storageKey}`);
  }

  /**
   * Run `turn` while no other turn on the same exact request runs in this process. Every validation decision runs inside its
   * request's turn, so two concurrent misses decide one after the other: the first sends, the second finds its entry.
   */
  async withRequestTurn<T>(cacheKey: string, turn: () => Promise<T>): Promise<T> {
    const key = `${this.#root}\u0000${cacheKey}`;
    const previous = requestTurns.get(key) ?? Promise.resolve();
    let done!: () => void;
    const mine = previous.then(() => new Promise<void>((resolveTurn) => { done = resolveTurn; }));
    requestTurns.set(key, mine);
    await previous;
    try {
      return await turn();
    } finally {
      done();
      if (requestTurns.get(key) === mine) requestTurns.delete(key);
    }
  }

  /** Append one ledger line. The ledger records identities, counts, and timestamps — never content. */
  async record(line: ProviderItemLine): Promise<void> {
    requireCache(ITEM_ID_PATTERN.test(line.itemId), 'PROVIDER_TEST_ITEM_INVALID', '测试项标识不符合 <slice>/<purpose>/<n> 形式。');
    await this.#append(line);
  }

  /**
   * Retire evidence, append-only, with its reason (Issue #808). The capture keeps its line and its entry; from now on it answers
   * nothing, so the same request may be captured again and a similar one is no longer refused because of it.
   */
  async invalidate(target: ProviderInvalidationTarget, reason: string): Promise<void> {
    requireCache(validInvalidationTarget(target) && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u.test(reason) && reason.length <= 64,
      'PROVIDER_INVALIDATION_INVALID', '作废对象或原因无效。');
    const line: ProviderInvalidationLine = { kind: 'invalidation', target, reason, recordedAt: new Date().toISOString() };
    await this.#append(line);
  }

  async #append(line: ProviderLedgerEntry): Promise<void> {
    const handle = await open(join(this.#root, PROVIDER_LEDGER_FILE), 'a');
    try {
      await handle.writeFile(`${JSON.stringify(line)}\n`, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    this.#lines = [...this.#lines, line];
  }

  /**
   * Whether the capture by `itemId` is retired: every line of that item stale — the rule that frees its id — an invalidation
   * naming it, or a family/case invalidation at or after its pre-send evidencePosition. That position also covers an
   * in-flight capture whose completion line lands later. Older captures fall back to their ledger order or timestamp.
   */
  isRetired(itemId: string, scope: { readonly family: string; readonly case: string; readonly capturedAt: string; readonly evidencePosition?: number } | null): boolean {
    const own = this.#lines.filter(isItemLine).filter((line) => line.itemId === itemId);
    if (own.length > 0 && own.every((line) => line.stale === true)) return true;
    const captured = this.#lines.findIndex((line) => isItemLine(line) && line.itemId === itemId && line.outcome === 'transmitted');
    return this.#lines.some((line, index) => {
      if (isItemLine(line)) return false;
      if ('itemId' in line.target) return line.target.itemId === itemId;
      return scope !== null && line.target.family === scope.family && line.target.case === scope.case &&
        (scope.evidencePosition !== undefined ? index >= scope.evidencePosition : captured === -1 ? line.recordedAt >= scope.capturedAt : index > captured);
    });
  }

  /**
   * The valid development evidence: every #808 model-call capture that was answered with a kept result and is not retired.
   * Lines written before #808 carry no validation scope and cannot prove current namespaced evidence.
   */
  async validEvidence(): Promise<ProviderLedgerLine[]> {
    const evidence = this.#lines.filter(isModelCallLine).filter((line) =>
      isSupportedProviderTestItemId(line.itemId) && line.outcome === 'transmitted' && line.validation !== undefined && line.semanticDigest !== undefined &&
      line.generation !== undefined && !this.isRetired(line.itemId, {
        family: line.validation.family, case: line.validation.case, capturedAt: line.recordedAt,
        ...(line.evidencePosition === undefined ? {} : { evidencePosition: line.evidencePosition }),
      }));
    for (const line of evidence) {
      requireCache(typeof line.cacheKey === 'string', 'PROVIDER_LEDGER_CORRUPT', '验证证据缺少缓存身份。');
      let read = await this.readEntry(line.cacheKey);
      // A different prompt generation may have superseded the exact key, but its capture stays immutable beside it.
      if (read.state !== 'present' || read.entry.itemId !== line.itemId) {
        const paths = (await readdir(join(this.#root, PROVIDER_CACHE_DIRECTORY)))
          .filter((name) => name.startsWith(`${line.cacheKey}.superseded-`) && name.endsWith('.json'));
        for (const path of paths) {
          const archived = await this.#readNamespacedEntry(join(this.#root, PROVIDER_CACHE_DIRECTORY, path), line.cacheKey);
          if (archived.state === 'present' && archived.entry.itemId === line.itemId) { read = archived; break; }
        }
      }
      requireCache(read.state === 'present' && read.entry.itemId === line.itemId &&
        read.entry.generation === line.generation && read.entry.semanticDigest === line.semanticDigest &&
        sameUsage(read.entry.usage, line.usage) &&
        read.entry.requestDigest === line.requestDigest && read.entry.model === line.model &&
        read.entry.promptContractDigest === line.promptContractDigest && read.entry.route === line.route &&
        read.entry.taskPromptContractDigest === line.taskPromptContractDigest &&
        read.entry.evidencePosition === line.evidencePosition &&
        read.entry.endpoint === line.endpoint && read.entry.requestShape === line.requestShape &&
        read.entry.validation?.family === line.validation!.family && read.entry.validation.case === line.validation!.case &&
        read.entry.validation.step === line.validation!.step,
      'PROVIDER_VALIDATION_EVIDENCE_UNAVAILABLE', '已记录的验证证据缺失、损坏或身份不一致；请核查并作废，未将其当作新请求。');
    }
    return evidence;
  }

  /**
   * How many live model transmissions and cache replays the ledger has recorded, for the Run's report. Platform-tool
   * lines are counted by `toolCounts`, so a report's model-call counts never move because a tool ran.
   */
  counts(): { transmitted: number; replayed: number; failed: number } {
    return tally(this.#lines.filter(isModelCallLine));
  }

  /** How many platform-tool calls of one kind the ledger has recorded. */
  toolCounts(kind: 'search-call' | 'fetch'): { transmitted: number; replayed: number; failed: number } {
    return tally(this.#lines.filter(isItemLine).filter((line) => line.kind === kind));
  }

  /**
   * The model-call usage the ledger records, kept apart (Issue #808): `recorded` is what the responses said they cost when
   * captured — a replay counts its capture's original usage there — and `incurred` is what was actually spent sending. A
   * replay incurs nothing; a line written before #808 incurred its usage only if it transmitted.
   */
  usageTotals(): { recorded: ProviderUsageRecord; incurred: ProviderUsageRecord } {
    const recorded = { inputTokens: 0, outputTokens: 0 };
    const incurred = { inputTokens: 0, outputTokens: 0 };
    for (const line of this.#lines.filter(isModelCallLine)) {
      if (line.usage !== null) {
        recorded.inputTokens += line.usage.inputTokens;
        recorded.outputTokens += line.usage.outputTokens;
      }
      const spent = line.incurredUsage !== undefined ? line.incurredUsage : line.outcome === 'replayed' ? null : line.usage;
      if (spent !== null) {
        incurred.inputTokens += spent.inputTokens;
        incurred.outputTokens += spent.outputTokens;
      }
    }
    return { recorded, incurred };
  }
}

async function readEntryFile(path: string): Promise<ProviderEntryRead> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (isCode(error, 'ENOENT')) return { state: 'absent' };
    throw error;
  }
  try {
    const entry = JSON.parse(raw) as ProviderCacheEntry;
    if (entry === null || typeof entry !== 'object' || typeof entry.requestBody !== 'string' || entry.status !== 200 ||
      typeof entry.model !== 'string' || entry.requestDigest !== providerRequestDigest(entry.requestBody) ||
      typeof entry.transmittedAt !== 'string' || !Number.isFinite(Date.parse(entry.transmittedAt)) ||
      !Object.hasOwn(entry, 'response') || (entry.usage !== null && (!validUsage(entry.usage))) ||
      !sameUsage(entry.usage, usageOfResponse(entry.response)) ||
      (entry.streamedAnswer !== undefined && (typeof entry.streamedAnswer.complete !== 'boolean' ||
        !Array.isArray(entry.streamedAnswer.chunks) || !entry.streamedAnswer.chunks.every((chunk) => typeof chunk === 'string') ||
        !entry.response || typeof entry.response !== 'object' ||
        (entry.response as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content !== entry.streamedAnswer.chunks.join('') ||
        (entry.streamedAnswer.complete
          ? typeof (entry.response as { choices?: { finish_reason?: unknown }[] }).choices?.[0]?.finish_reason !== 'string'
          : (entry.response as { choices?: { finish_reason?: unknown }[] }).choices?.[0]?.finish_reason !== null)))) {
      return { state: 'corrupt' };
    }
    return { state: 'present', entry };
  } catch {
    return { state: 'corrupt' };
  }
}

function sameUsage(left: ProviderUsageRecord | null, right: ProviderUsageRecord | null): boolean {
  return left === null || right === null ? left === right : left.inputTokens === right.inputTokens && left.outputTokens === right.outputTokens;
}

function validUsage(value: unknown): value is ProviderUsageRecord {
  if (value === null || typeof value !== 'object') return false;
  const usage = value as Partial<ProviderUsageRecord>;
  return Number.isSafeInteger(usage.inputTokens) && usage.inputTokens! >= 0 && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens! >= 0;
}

function tally(lines: ReadonlyArray<ProviderItemLine>): { transmitted: number; replayed: number; failed: number } {
  return {
    transmitted: lines.filter((line) => line.outcome === 'transmitted').length,
    replayed: lines.filter((line) => line.outcome === 'replayed').length,
    failed: lines.filter((line) => line.outcome === 'failed').length,
  };
}
