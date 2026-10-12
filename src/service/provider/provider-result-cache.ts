import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { DevelopmentValidationDelta } from '../../shared/protocol.js';

/**
 * The Provider Test Ledger and the Provider Result Cache (ADR 0067, ADR 0089).
 *
 * Live Provider testing is expensive and, on a metered development account, effectively
 * irreversible: a request that has been paid for once should never be paid for twice. This owner
 * makes that a property of the code rather than of anyone's discipline. Every live call is a named
 * test item `<slice>/<purpose>/<n>`; the ledger is an append-only `ledger.jsonl` of those items, and
 * the cache holds one entry per exact request with the canonical request body beside the raw
 * response, its usage, and its timestamps.
 *
 * Since Issue #808 an entry is keyed by the request's whole namespace — route, endpoint, request
 * shape, model and the digest of the full canonical body — and each development validation call
 * records the purpose it belongs to (a family and a case that no Issue, Run or attempt number is part
 * of), its step, the digest of its request with every minted identity removed, and the evidence
 * generation it was captured under. `transmitOnce` decides by those records; this owner keeps them:
 * the entries, written whole or not at all; a durable pre-send claim per exact request, which a crash,
 * a torn file or a concurrent sender reads as possibly sent and billed rather than as a miss; the
 * append-only invalidations that actually stop a capture being reused; and, on every line, the usage
 * the captured response recorded apart from the usage this run incurred.
 *
 * Entries and lines written before #808 stay where they are and read as they always did: a legacy
 * entry is keyed by (model, request digest) alone, and a replay of it says so rather than pretending
 * its route and endpoint were recorded.
 *
 * Nothing here is a repository artifact. The root lives outside every checkout (the launch form
 * enforces that), and no cache entry, claim, ledger line, or response body is logged, uploaded,
 * projected, or committed. Credentials never reach this module at all: the adapter assembles the body
 * without the secret, and only the body is stored — never the headers that carried the bearer.
 */
export const PROVIDER_LEDGER_FILE = 'ledger.jsonl';
export const PROVIDER_CACHE_DIRECTORY = 'entries';
/** The durable pre-send claims, one file per exact request while it is in flight or its result is unknown. */
export const PROVIDER_CLAIM_DIRECTORY = 'claims';
/** The namespace version every #808 entry key is taken under; a legacy key never carries it. */
export const PROVIDER_CACHE_NAMESPACE = 'ai7.provider-cache/2';
const PROVIDER_CLAIM_SCHEMA = 'ai7.provider-claim/1';
/** The plan slice that owns every model-call test item the analysis path mints; the default slice of `nextItemId`. */
export const PROVIDER_TEST_ITEM_SLICE = 'S40';
/**
 * Every plan slice a test item id may name (Issue #473, S87-f3a). S40 owns the analysis path's model calls and every line
 * the ledger already carries; S87 owns the platform tools' search and fetch items (ADR 0080 §7.6); S17c owns the live
 * dialogue's items (ADR 0088 §1.8). A slice outside this closed set is not a test item, so no id can be minted for it. The
 * slice only numbers records: the purpose a call answers is its validation family and case, never this.
 */
export const PROVIDER_TEST_ITEM_SLICES = ['S40', 'S87', 'S17c'] as const;
export type ProviderTestItemSlice = (typeof PROVIDER_TEST_ITEM_SLICES)[number];
const ITEM_ID_PATTERN = /^(?:S40|S87|S17c)\/[a-z0-9-]+\/[1-9][0-9]{0,5}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
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
  /** The digest of the request body with every minted identity removed (see {@link providerSemanticDigest}). */
  readonly semanticDigest?: string;
  /** The digest of the configuration the call ran under (see {@link providerEvidenceGeneration}). */
  readonly generation?: string;
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
  readonly semanticDigest?: string;
  readonly generation?: string;
  readonly promptContractDigest?: string;
  readonly validation?: { readonly family: string; readonly case: string; readonly step: string };
  /** SHA-256 over the response as this entry keeps it (`JSON.stringify(response)`). */
  readonly responseDigest?: string;
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
  /** `claimed` while the request may be in flight; `outcome-unknown` once it was sent and its answer never came back whole. */
  readonly state: 'claimed' | 'outcome-unknown';
  readonly claimedAt: string;
  readonly family: string;
  readonly case: string;
  readonly step: string;
}

/**
 * A claim as a reader finds it. Any claim on disk holds its request: a `claimed` one is in flight in some process or was left
 * by one that died after claiming — sent or not, nobody can tell — and an unreadable one may be either. Only `absent` is free.
 */
export type ProviderClaimRead =
  | { readonly state: 'absent' }
  | { readonly state: 'claimed' | 'outcome-unknown'; readonly claim: ProviderClaim }
  | { readonly state: 'corrupt' };

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

const BLOCK_IDENTITY = /blk_[0-9a-f]{24}/gu;
const MINTED_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const DIGEST_RUN = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/gu;

/**
 * The digest of a request body with every minted identity removed: block identities, UUIDs (a Run Record's, a Session's), and
 * 64-hex digests, each replaced by a fixed marker. Two requests with the same semantic digest differ only in identities a
 * fresh import, a new Run or a renumbered attempt mints — the same question asked again — so one never justifies a new send
 * when the other is valid evidence. The text, the instructions and every count stay in, so any change to what is asked moves it.
 */
export function providerSemanticDigest(body: string): string {
  return providerRequestDigest(body.replace(BLOCK_IDENTITY, 'blk_*').replace(MINTED_UUID, '<id>').replace(DIGEST_RUN, '<digest>'));
}

/** The configuration a capture answers for: route, endpoint, request shape, model and the frozen prompt contract. */
export function providerEvidenceGeneration(namespace: ProviderRequestNamespace, promptContractDigest: string): string {
  return createHash('sha256').update(JSON.stringify([
    namespace.route, namespace.endpoint, namespace.requestShape, namespace.model, promptContractDigest,
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
  if (!Number.isSafeInteger(prompt) || !Number.isSafeInteger(completion)) return null;
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
 * claim file does the same work.
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
    requireCache(validInvalidationTarget(target) && typeof reason === 'string' && reason.length > 0 && typeof recordedAt === 'string',
      'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 的作废记录无效。');
    return parsed as ProviderInvalidationLine;
  }
  requireCache(typeof (parsed as { itemId?: unknown }).itemId === 'string', 'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 记录缺少测试项标识。');
  requireCache(kind === undefined || kind === 'model-call' || kind === 'search-call' || kind === 'fetch',
    'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 记录的测试项类别无效。');
  return parsed as ProviderItemLine;
}

function validInvalidationTarget(target: unknown): target is ProviderInvalidationTarget {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return false;
  const keys = Object.keys(target).sort().join(',');
  if (keys === 'itemId') return ITEM_ID_PATTERN.test(String((target as { itemId: unknown }).itemId));
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
    (claim.state !== 'claimed' && claim.state !== 'outcome-unknown') || typeof claim.claimedAt !== 'string') return null;
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
    this.#lines = raw.split('\n').filter((line) => line.trim().length > 0).map(parseLedgerLine);
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
    await writeFile(this.#legacyEntryPath(entry.model, entry.requestDigest), `${JSON.stringify(entry)}\n`, 'utf8');
  }

  /** The entry of one exact namespaced request, as a reader finds it. */
  async readEntry(cacheKey: string): Promise<ProviderEntryRead> {
    return readEntryFile(this.#entryPath(cacheKey));
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
    let raw: string;
    try {
      raw = await readFile(this.#claimPath(cacheKey), 'utf8');
    } catch (error) {
      if (isCode(error, 'ENOENT')) return { state: 'absent' };
      throw error;
    }
    const claim = parseClaim(raw, cacheKey);
    return claim === null ? { state: 'corrupt' } : { state: claim.state, claim };
  }

  /**
   * Claim one exact request before it is sent: the file is created exclusively and synced before this returns, so of any
   * number of senders — in this process or another — exactly one gets `true`, and the claim outlives a crash. A sender that
   * gets `false` sends nothing.
   */
  async claim(claim: Omit<ProviderClaim, 'schema' | 'state'>): Promise<boolean> {
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
    await writeWhole(this.#claimPath(claim.cacheKey), `${JSON.stringify({ schema: PROVIDER_CLAIM_SCHEMA, ...claim, state: 'outcome-unknown' })}\n`);
  }

  /** Release a claim whose request settled for certain: answered and kept, or refused with a status. */
  async release(cacheKey: string): Promise<void> {
    try {
      await unlink(this.#claimPath(cacheKey));
    } catch (error) {
      if (!isCode(error, 'ENOENT')) throw error;
    }
  }

  /**
   * Move a held request's claim — and an unreadable entry, if that is what holds it — aside, keeping both, so a declared
   * `retry-unknown` may claim it afresh. `false` when another sender moved it first, which then sends nothing here.
   */
  async setAsideHold(cacheKey: string, entryCorrupt: boolean): Promise<boolean> {
    if (entryCorrupt) return this.#setAside(this.#entryPath(cacheKey));
    return this.#setAside(this.#claimPath(cacheKey));
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
    this.#lines = [...this.#lines, line];
    await appendFile(join(this.#root, PROVIDER_LEDGER_FILE), `${JSON.stringify(line)}\n`, 'utf8');
  }

  /**
   * Retire evidence, append-only, with its reason (Issue #808). The capture keeps its line and its entry; from now on it answers
   * nothing, so the same request may be captured again and a similar one is no longer refused because of it.
   */
  async invalidate(target: ProviderInvalidationTarget, reason: string): Promise<void> {
    requireCache(validInvalidationTarget(target) && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u.test(reason) && reason.length <= 64,
      'PROVIDER_INVALIDATION_INVALID', '作废对象或原因无效。');
    const line: ProviderInvalidationLine = { kind: 'invalidation', target, reason, recordedAt: new Date().toISOString() };
    this.#lines = [...this.#lines, line];
    await appendFile(join(this.#root, PROVIDER_LEDGER_FILE), `${JSON.stringify(line)}\n`, 'utf8');
  }

  /**
   * Whether the capture by `itemId` is retired: every line of that item stale — the rule that frees its id — an invalidation
   * naming it, or an invalidation of its family and case appended after its capture line — or, for a capture whose line never
   * reached the ledger, recorded at or after the capture's time. Order on the append-only ledger decides, never two clocks
   * that may read the same instant.
   */
  isRetired(itemId: string, scope: { readonly family: string; readonly case: string; readonly capturedAt: string } | null): boolean {
    const own = this.#lines.filter(isItemLine).filter((line) => line.itemId === itemId);
    if (own.length > 0 && own.every((line) => line.stale === true)) return true;
    const captured = this.#lines.findIndex((line) => isItemLine(line) && line.itemId === itemId && line.outcome === 'transmitted');
    return this.#lines.some((line, index) => {
      if (isItemLine(line)) return false;
      if ('itemId' in line.target) return line.target.itemId === itemId;
      return scope !== null && line.target.family === scope.family && line.target.case === scope.case &&
        (captured === -1 ? line.recordedAt >= scope.capturedAt : index > captured);
    });
  }

  /**
   * The valid development evidence: every #808 model-call capture that was answered with a kept result and is not retired.
   * Lines written before #808 carry no purpose, so they answer exact replays only and are never evidence of a purpose.
   */
  validEvidence(): ProviderLedgerLine[] {
    return this.#lines.filter(isModelCallLine).filter((line) =>
      line.outcome === 'transmitted' && line.validation !== undefined && line.semanticDigest !== undefined &&
      line.generation !== undefined && !this.isRetired(line.itemId, {
        family: line.validation.family, case: line.validation.case, capturedAt: line.recordedAt,
      }));
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
    if (entry === null || typeof entry !== 'object' || typeof entry.requestBody !== 'string' || !Number.isSafeInteger(entry.status)) {
      return { state: 'corrupt' };
    }
    return { state: 'present', entry };
  } catch {
    return { state: 'corrupt' };
  }
}

function tally(lines: ReadonlyArray<ProviderItemLine>): { transmitted: number; replayed: number; failed: number } {
  return {
    transmitted: lines.filter((line) => line.outcome === 'transmitted').length,
    replayed: lines.filter((line) => line.outcome === 'replayed').length,
    failed: lines.filter((line) => line.outcome === 'failed').length,
  };
}
