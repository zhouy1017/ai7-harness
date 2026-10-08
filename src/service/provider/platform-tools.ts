import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';

/**
 * AI7's platform tools, `websearch` and `webfetch` (ADR 0080 §7, Issue #473 S87-f3a): what a Provider Processing rule must
 * say for them to exist, the exact schemas the model sees, the canonical form of their arguments, and the breakers against
 * loops (§7.4). Nothing here reaches a network or registers a tool. Every identifier of the search service — its name, its
 * host, its tool — is read from the rule's `platformTools` block; a rule that names none (Provider Processing v5, the
 * selected `developer-live` document) yields `null`, and every consumer of this module refuses on `null`.
 */

/** The two tool names, sorted: the exact set a payload's tools must equal (ADR 0080 §7.2). */
export const PLATFORM_TOOL_NAMES = ['webfetch', 'websearch'] as const;
export type PlatformToolName = (typeof PLATFORM_TOOL_NAMES)[number];

/** The `platformTools` block of one Provider Processing rule, exactly as ADR 0080 §7.5 writes it. */
export interface PlatformToolsRule {
  readonly websearch: {
    /** The search service's name, which selects how AI7 speaks to it (`./search-service.ts`). */
    readonly service: string;
    /** The one host a `call-search-service` ticket may address and the allowance set may admit. */
    readonly host: string;
    /** The service's own tool name, sent in the JSON-RPC `tools/call`. */
    readonly tool: string;
    readonly anonymous: true;
  };
  readonly webfetch: {
    readonly maxBytes: number;
    readonly timeoutSeconds: number;
    readonly boundedByCitations: true;
  };
}

export class PlatformToolsRuleError extends Error {
  readonly code = 'PLATFORM_TOOLS_RULE_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'PlatformToolsRuleError';
  }
}

const HOSTNAME_SHAPE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const IDENTIFIER_SHAPE = /^[a-z][a-z0-9_-]{0,63}$/u;

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new PlatformToolsRuleError(message);
}

/**
 * The platform tools one Provider Processing allow rule names, or `null` when it names none. `webSearchToolAllowed` stays
 * the rule's switch (ADR 0080 §7.5): a rule whose switch is off names no tool whatever its block says, and a rule whose
 * switch is on without a block has no platform tools to name (its supply would be a provider-side tool, §4). A block that
 * is present but malformed is a refusal, never a silent `null`.
 */
export function readPlatformToolsRule(rule: unknown): PlatformToolsRule | null {
  if (!isRecord(rule)) return null;
  const transmissions = rule['transmissions'];
  const allowed = isRecord(transmissions) && transmissions['webSearchToolAllowed'] === true;
  const block = rule['platformTools'];
  if (!allowed || block === undefined) return null;
  requireRule(isRecord(block) && exactKeys(block, ['websearch', 'webfetch']), 'platformTools 必须恰好命名 websearch 与 webfetch。');
  const search = block['websearch'];
  const fetch = block['webfetch'];
  requireRule(isRecord(search) && exactKeys(search, ['service', 'host', 'tool', 'anonymous']), 'websearch 字段不完整。');
  requireRule(typeof search['service'] === 'string' && IDENTIFIER_SHAPE.test(search['service']), 'websearch.service 无效。');
  requireRule(typeof search['host'] === 'string' && HOSTNAME_SHAPE.test(search['host']), 'websearch.host 无效。');
  requireRule(typeof search['tool'] === 'string' && IDENTIFIER_SHAPE.test(search['tool']), 'websearch.tool 无效。');
  requireRule(search['anonymous'] === true, 'websearch 只允许匿名使用。');
  requireRule(isRecord(fetch) && exactKeys(fetch, ['maxBytes', 'timeoutSeconds', 'boundedByCitations']), 'webfetch 字段不完整。');
  requireRule(Number.isSafeInteger(fetch['maxBytes']) && (fetch['maxBytes'] as number) > 0, 'webfetch.maxBytes 无效。');
  requireRule(Number.isSafeInteger(fetch['timeoutSeconds']) && (fetch['timeoutSeconds'] as number) > 0, 'webfetch.timeoutSeconds 无效。');
  requireRule(fetch['boundedByCitations'] === true, 'webfetch 必须以引用数为界。');
  return Object.freeze({
    websearch: Object.freeze({ service: search['service'], host: search['host'], tool: search['tool'], anonymous: true as const }),
    webfetch: Object.freeze({ maxBytes: fetch['maxBytes'] as number, timeoutSeconds: fetch['timeoutSeconds'] as number, boundedByCitations: true as const }),
  });
}

/** One tool schema exactly as the model sees it: the three fields DSH projects, and nothing else. */
export interface PlatformToolSchema {
  readonly name: PlatformToolName;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/**
 * The two schemas, fixed here so that the harness registers exactly these bytes and the gate compares a payload's tools
 * against exactly these bytes. A tool whose description or parameters drift from them is not a platform tool.
 */
export const PLATFORM_TOOL_SCHEMAS: ReadonlyArray<PlatformToolSchema> = Object.freeze([
  Object.freeze({
    name: 'webfetch' as const,
    description: '取回一个公开网页的正文（转换为 Markdown）。只用于你已引用或搜索结果给出的 https 地址。',
    parameters: Object.freeze({
      type: 'object',
      properties: { url: { type: 'string', description: '要取回的公开网页的完整 https 地址。' } },
      required: ['url'],
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'websearch' as const,
    description: '在公开网络上搜索，返回结果摘要与来源地址。查询只写需要核实的事实，不写稿件原文。',
    parameters: Object.freeze({
      type: 'object',
      properties: { query: { type: 'string', description: '一条搜索查询。' } },
      required: ['query'],
      additionalProperties: false,
    }),
  }),
]);

/** SHA-256 over the canonical schema set; the composition descriptor pins it. */
export const PLATFORM_TOOL_SCHEMA_DIGEST: string = sha256Hex(canonicalJson(PLATFORM_TOOL_SCHEMAS));

/**
 * Whether a payload's tools are exactly the platform tools a rule names (ADR 0080 §7.2's narrowing of `tools-present`):
 * the same names, the same descriptions, the same parameters, nothing more and nothing less. A rule that names none
 * matches no tool set at all, so under Provider Processing v5 every tool is still refused.
 */
export function toolSetEqualsRule(tools: ReadonlyArray<unknown>, rule: PlatformToolsRule | null): boolean {
  return rule !== null && toolSetEqualsPlatformSchemas(tools);
}

/** Whether a tool set is exactly the two platform tool schemas, byte for byte in canonical form. */
export function toolSetEqualsPlatformSchemas(tools: ReadonlyArray<unknown>): boolean {
  if (tools.length !== PLATFORM_TOOL_SCHEMAS.length) return false;
  const projected: unknown[] = [];
  for (const tool of tools) {
    if (!isRecord(tool) || !exactKeys(tool, ['name', 'description', 'parameters'])) return false;
    projected.push({ name: tool['name'], description: tool['description'], parameters: tool['parameters'] });
  }
  projected.sort((left, right) => String((left as { name: unknown }).name).localeCompare(String((right as { name: unknown }).name), 'en'));
  return canonicalJson(projected) === canonicalJson(PLATFORM_TOOL_SCHEMAS);
}

/** The canonical arguments of one call: the deduplication key within a unit and the cache key across Runs (§7.4). */
export type PlatformToolArguments =
  | { readonly tool: 'websearch'; readonly query: string }
  | { readonly tool: 'webfetch'; readonly url: string };

/** The longest query AI7 forwards; a longer one is a refusal returned to the model, never a truncation. */
export const WEBSEARCH_QUERY_MAX_CHARACTERS = 1_000;

/**
 * Parse one call's raw arguments into their canonical form, or `null` when they are not a call this tool accepts. A query
 * is NFC-normalized and trimmed; a URL is an absolute `https` URL with no credentials, no fragment, and a public host
 * name, rendered by the WHATWG serializer so that two spellings of one address are one key.
 */
export function canonicalToolArguments(name: string, args: unknown): PlatformToolArguments | null {
  if (!isRecord(args)) return null;
  if (name === 'websearch') {
    if (!exactKeys(args, ['query']) || typeof args['query'] !== 'string') return null;
    const query = args['query'].normalize('NFC').trim();
    return query.length === 0 || query.length > WEBSEARCH_QUERY_MAX_CHARACTERS ? null : { tool: 'websearch', query };
  }
  if (name === 'webfetch') {
    if (!exactKeys(args, ['url']) || typeof args['url'] !== 'string') return null;
    const url = canonicalPublicUrl(args['url']);
    return url === null ? null : { tool: 'webfetch', url };
  }
  return null;
}

/** An absolute public `https` URL in serialized form, or `null`. */
export function canonicalPublicUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') return null;
  if (parsed.port !== '' && parsed.port !== '443') return null;
  const host = parsed.hostname.toLowerCase();
  const labels = host.split('.');
  if (!HOSTNAME_SHAPE.test(host) || /^[0-9]+$/u.test(labels[labels.length - 1]!) || host.endsWith('.localhost')) return null;
  parsed.hash = '';
  return parsed.href;
}

/** SHA-256 over one call's canonical arguments. */
export function toolArgumentsDigest(args: PlatformToolArguments): string {
  return sha256Hex(canonicalJson(args));
}

/**
 * The consecutive tool round trips one unit may make before the breaker ends it with 联网核查未完成 (ADR 0080 §7.4). A
 * circuit breaker, not a budget: a fact check of one unit needs a few searches and fetches per finding, and a unit that
 * reaches this number is a loop. The Run Budget Ceiling remains the only budget.
 */
export const PLATFORM_TOOL_ROUND_TRIP_BREAKER = 128;

/** What the breaker says about one call. */
export type BreakerVerdict = 'admit' | 'duplicate' | 'tripped';

/**
 * The per-unit breakers of ADR 0080 §7.4: an identical call (same tool, same canonical arguments) repeated within one unit
 * is a `duplicate` — refused, and the refusal returned to the model as the tool's result — and a unit whose round trips
 * exceed the breaker is `tripped` for the rest of the unit. A new unit starts intact.
 */
export class PlatformToolBreaker {
  readonly #limit: number;
  #seen = new Set<string>();
  #roundTrips = 0;
  #tripped = false;

  constructor(limit: number = PLATFORM_TOOL_ROUND_TRIP_BREAKER) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('PLATFORM_TOOL_BREAKER_INVALID');
    this.#limit = limit;
  }

  /** Start a unit: every count and every seen call is the previous unit's. */
  startUnit(): void {
    this.#seen = new Set();
    this.#roundTrips = 0;
    this.#tripped = false;
  }

  get state(): 'intact' | 'tripped' {
    return this.#tripped ? 'tripped' : 'intact';
  }

  /** Count one call and say whether it may go on. */
  observe(argumentsDigest: string): BreakerVerdict {
    if (this.#tripped) return 'tripped';
    this.#roundTrips += 1;
    if (this.#roundTrips > this.#limit) {
      this.#tripped = true;
      return 'tripped';
    }
    if (this.#seen.has(argumentsDigest)) return 'duplicate';
    this.#seen.add(argumentsDigest);
    return 'admit';
  }
}
