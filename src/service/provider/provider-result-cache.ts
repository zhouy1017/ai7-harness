import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/**
 * The Provider Test Ledger and the Provider Result Cache (ADR 0067).
 *
 * Live Provider testing is expensive and, on a metered development account, effectively
 * irreversible: a request that has been paid for once should never be paid for twice. This owner
 * makes that a property of the code rather than of anyone's discipline. Every live call is a named
 * test item `<slice>/<purpose>/<n>`; the ledger is an append-only `ledger.jsonl` of those items, and
 * the cache holds one entry per (model, request digest) with the canonical request body beside the
 * raw response, its usage, and its timestamps. An identical request replays from the cache and
 * transmits nothing, and a test item id that the ledger already carries is refused unless that line
 * is marked `stale`. So the same test, or a similar one, runs live at most once.
 *
 * Nothing here is a repository artifact. The root lives outside every checkout (the launch form
 * enforces that), and no cache entry, ledger line, or response body is logged, uploaded, projected,
 * or committed. Credentials never reach this module at all: the adapter assembles the body without
 * the secret, and only the body is stored — never the headers that carried the bearer.
 */
export const PROVIDER_LEDGER_FILE = 'ledger.jsonl';
export const PROVIDER_CACHE_DIRECTORY = 'entries';
/** The plan slice that owns every model-call test item the analysis path mints; the default slice of `nextItemId`. */
export const PROVIDER_TEST_ITEM_SLICE = 'S40';
/**
 * Every plan slice a test item id may name (Issue #473, S87-f3a). S40 owns the analysis path's model calls and every line
 * the ledger already carries; S87 owns the platform tools' search and fetch items (ADR 0080 §7.6); S17c owns the live
 * dialogue's items (ADR 0088 §1.8). A slice outside this closed set is not a test item, so no id can be minted for it.
 */
export const PROVIDER_TEST_ITEM_SLICES = ['S40', 'S87', 'S17c'] as const;
export type ProviderTestItemSlice = (typeof PROVIDER_TEST_ITEM_SLICES)[number];
const ITEM_ID_PATTERN = /^(?:S40|S87|S17c)\/[a-z0-9-]+\/[1-9][0-9]{0,5}$/u;
/**
 * What one ledger line records the sending of. A line without `kind` is a model call: every line written before the
 * platform tools existed reads that way, and a model-call line is still written without the field, byte for byte as before.
 */
export type ProviderTestItemKind = 'model-call' | 'search-call' | 'fetch';

export interface ProviderUsageRecord {
  readonly inputTokens: number;
  readonly outputTokens: number;
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
  readonly outcome: 'transmitted' | 'replayed' | 'failed';
  readonly status: number | null;
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
  /** A stale line no longer reserves its item id: the same item may run live again. */
  readonly stale?: boolean;
  readonly recordedAt: string;
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

/** Any one ledger line. */
export type ProviderLedgerEntry = ProviderLedgerLine | ProviderToolLedgerLine;

/** Whether one ledger line records a model call; a line without `kind` does. */
export function isModelCallLine(line: ProviderLedgerEntry): line is ProviderLedgerLine {
  return line.kind === undefined || line.kind === 'model-call';
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
}

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
    let raw = '';
    try {
      raw = await readFile(join(this.#root, PROVIDER_LEDGER_FILE), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.#lines = raw.split('\n').filter((line) => line.trim().length > 0).map((line) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new ProviderResultCacheError('PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 含有无法解析的记录。');
      }
      requireCache(parsed !== null && typeof parsed === 'object' && typeof (parsed as ProviderLedgerEntry).itemId === 'string',
        'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 记录缺少测试项标识。');
      const kind = (parsed as { kind?: unknown }).kind;
      requireCache(kind === undefined || kind === 'model-call' || kind === 'search-call' || kind === 'fetch',
        'PROVIDER_LEDGER_CORRUPT', 'Provider Test Ledger 记录的测试项类别无效。');
      return parsed as ProviderLedgerEntry;
    });
    this.#opened = true;
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
    const highest = this.#lines.reduce((max, line) => {
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
    const existing = this.#lines.filter((line) => line.itemId === itemId);
    requireCache(existing.length === 0 || existing.every((line) => line.stale === true),
      'PROVIDER_TEST_ITEM_REPEATED', '该测试项标识已在 Provider Test Ledger 中；未重复发起实时传输。');
  }

  /**
   * The entry key of one (model, request digest) pair. The two parts are joined through canonical
   * JSON rather than a separator character, so no model id can ever be read as part of a digest.
   */
  #entryPath(model: string, requestDigest: string): string {
    const key = createHash('sha256').update(JSON.stringify([model, requestDigest]), 'utf8').digest('hex');
    return join(this.#root, PROVIDER_CACHE_DIRECTORY, `${key}.json`);
  }

  /** The cached result of an identical request, or `null`. A hit means no transmission happens. */
  async lookup(model: string, requestDigest: string): Promise<ProviderCacheEntry | null> {
    try {
      return JSON.parse(await readFile(this.#entryPath(model, requestDigest), 'utf8')) as ProviderCacheEntry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** Store one transmitted result. The body is the canonical request; no header is ever written. */
  async store(entry: ProviderCacheEntry): Promise<void> {
    await writeFile(this.#entryPath(entry.model, entry.requestDigest), `${JSON.stringify(entry)}\n`, 'utf8');
  }

  /** Append one ledger line. The ledger records identities, counts, and timestamps — never content. */
  async record(line: ProviderLedgerEntry): Promise<void> {
    requireCache(ITEM_ID_PATTERN.test(line.itemId), 'PROVIDER_TEST_ITEM_INVALID', '测试项标识不符合 <slice>/<purpose>/<n> 形式。');
    this.#lines = [...this.#lines, line];
    await appendFile(join(this.#root, PROVIDER_LEDGER_FILE), `${JSON.stringify(line)}\n`, 'utf8');
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
    return tally(this.#lines.filter((line) => line.kind === kind));
  }
}

function tally(lines: ReadonlyArray<ProviderLedgerEntry>): { transmitted: number; replayed: number; failed: number } {
  return {
    transmitted: lines.filter((line) => line.outcome === 'transmitted').length,
    replayed: lines.filter((line) => line.outcome === 'replayed').length,
    failed: lines.filter((line) => line.outcome === 'failed').length,
  };
}
