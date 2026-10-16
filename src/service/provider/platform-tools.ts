import { canonicalJson, isRecord, sha256Hex } from '../analysis/canonical.js';
import { isPublicHostName } from '../../shared/network-denial.js';

/**
 * AI7's platform tools, `websearch` and `webfetch` (ADR 0080 §7, Issue #473 S87-f3a): what a Provider Processing rule must
 * say for them to exist, the exact schemas the model sees, the canonical form of their arguments, and the breakers against
 * loops (§7.4). Nothing here reaches a network or registers a tool. Every identifier of the search service — its name, its
 * host, its tool — is read from the rule's `platformTools` block. A rule that names none yields `null`, and every consumer
 * of this module refuses on `null`; selected v18/v19 (like v16/v17 before them) name tools only for review, writing and evaluation.
 */

/** The two tool names, sorted: the exact set a payload's tools must equal (ADR 0080 §7.2). */
export const PLATFORM_TOOL_NAMES = ['webfetch', 'websearch'] as const;
export const LOCAL_TOOL_NAMES = ['exact_fetch', 'retrieve'] as const;
export type PlatformToolName = (typeof PLATFORM_TOOL_NAMES)[number] | (typeof LOCAL_TOOL_NAMES)[number];

/**
 * The `platformTools` block of one Provider Processing rule naming one anonymous search service, exactly as ADR 0080 §7.5
 * writes it (Provider Processing v7, never selected): the form every tool consumer reads, one service and one host.
 */
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

/** The webfetch bounds every Provider Processing v16 and v17 research rule states: 5 MiB and 30 seconds per page. */
export const WEBFETCH_MAX_BYTES = 5_242_880;
export const WEBFETCH_TIMEOUT_SECONDS = 30;
/** How a unit the breaker ends is disclosed (ADR 0080 §7.4), as the v16 and v17 rules state it. */
export const PLATFORM_TOOL_BREAKER_END = '联网核查未完成';

/** One search backend a generalized rule names (Provider Processing v16 and v17): a keyed interface the user may select. */
export interface PlatformToolsBackend {
  /** The backend's id, its provider document's file name under `config/providers/search-backends/` (`search-tinyfish`, …). */
  readonly id: string;
  /** The one host a `call-search-service` ticket for this backend may address. */
  readonly host: string;
  readonly endpoint: string;
  /** The Credential Broker slot that holds the key: under developer-live the development entry, under production the editor's own. */
  readonly credentialSlot: string;
  readonly anonymous: false;
  /** The fixed development Credential Reference the provider document names (developer-live, v16); `null` under production (v17). */
  readonly developmentCredentialReference: string | null;
}

/**
 * The generalized `platformTools` block of Provider Processing v16 (developer-live) and v17 (ordinary-production): websearch
 * through the one backend the user selects among the shipped backends the rule lists (in the recorded ranking order, the first
 * being the default), AI7's webfetch, the per-unit breaker, one query per Run unit and the tool results' category. A reading,
 * not a selection: which backend a Run uses, and its freeze, belong to the consuming product slice.
 */
export interface ConfiguredPlatformToolsRule {
  readonly websearch: {
    readonly selection: 'user-configured';
    readonly backends: ReadonlyArray<PlatformToolsBackend>;
    /** v17: a backend without the editor's own configured key cannot be selected for a Run; `false` under v16, which states no such term. */
    readonly selectionRequiresCredential: boolean;
  };
  readonly webfetch: {
    readonly maxBytes: number;
    readonly timeoutSeconds: number;
    readonly boundedByCitations: true;
  };
  readonly breaker: {
    readonly roundTrips: number;
    readonly end: string;
  };
  readonly oneQueryPerRunUnit: true;
  readonly toolResultCategory: 'public-or-synthetic';
}

/** What a rule's `platformTools` block reads as: v7's one anonymous service, or v16/v17's user-selected backends. */
export type PlatformToolsReading = PlatformToolsRule | ConfiguredPlatformToolsRule;

/** Whether a reading is the generalized v16/v17 block. */
export function isConfiguredPlatformTools(reading: PlatformToolsReading): reading is ConfiguredPlatformToolsRule {
  return 'selection' in reading.websearch;
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
 * is present but malformed is a refusal, never a silent `null`. Two shapes are readable: v7's one anonymous search service
 * (`websearch: {service, host, tool, anonymous: true}`), and v16/v17's generalized block (`websearch: {selection:
 * 'user-configured', backends: [...]}` with `breaker`, `oneQueryPerRunUnit` and `toolResultCategory`); the reader checks the
 * shape, while the launch verifies the values against the search backend registry and the bounds.
 */
export function readPlatformToolsRule(rule: unknown): PlatformToolsReading | null {
  if (!isRecord(rule)) return null;
  const transmissions = rule['transmissions'];
  const allowed = isRecord(transmissions) && transmissions['webSearchToolAllowed'] === true;
  const block = rule['platformTools'];
  if (!allowed || block === undefined) return null;
  requireRule(isRecord(block), 'platformTools 必须是对象。');
  if (isRecord(block['websearch']) && Object.hasOwn(block['websearch'], 'selection')) return readConfiguredPlatformTools(block);
  requireRule(exactKeys(block, ['websearch', 'webfetch']), 'platformTools 必须恰好命名 websearch 与 webfetch。');
  const search = block['websearch'];
  requireRule(isRecord(search) && exactKeys(search, ['service', 'host', 'tool', 'anonymous']), 'websearch 字段不完整。');
  requireRule(typeof search['service'] === 'string' && IDENTIFIER_SHAPE.test(search['service']), 'websearch.service 无效。');
  requireRule(typeof search['host'] === 'string' && HOSTNAME_SHAPE.test(search['host']), 'websearch.host 无效。');
  requireRule(typeof search['tool'] === 'string' && IDENTIFIER_SHAPE.test(search['tool']), 'websearch.tool 无效。');
  requireRule(search['anonymous'] === true, 'websearch 只允许匿名使用。');
  return Object.freeze({
    websearch: Object.freeze({ service: search['service'], host: search['host'], tool: search['tool'], anonymous: true as const }),
    webfetch: readWebfetch(block['webfetch']),
  });
}

function readWebfetch(fetch: unknown): ConfiguredPlatformToolsRule['webfetch'] {
  requireRule(isRecord(fetch) && exactKeys(fetch, ['maxBytes', 'timeoutSeconds', 'boundedByCitations']), 'webfetch 字段不完整。');
  requireRule(Number.isSafeInteger(fetch['maxBytes']) && (fetch['maxBytes'] as number) > 0, 'webfetch.maxBytes 无效。');
  requireRule(Number.isSafeInteger(fetch['timeoutSeconds']) && (fetch['timeoutSeconds'] as number) > 0, 'webfetch.timeoutSeconds 无效。');
  requireRule(fetch['boundedByCitations'] === true, 'webfetch 必须以引用数为界。');
  return Object.freeze({ maxBytes: fetch['maxBytes'] as number, timeoutSeconds: fetch['timeoutSeconds'] as number, boundedByCitations: true as const });
}

const BACKEND_ID_SHAPE = /^search-[a-z][a-z0-9-]*$/u;
const CREDENTIAL_REFERENCE_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** The generalized block of v16 (developer-live, development references) and v17 (production, the editor's own keys). */
function readConfiguredPlatformTools(block: Record<string, unknown>): ConfiguredPlatformToolsRule {
  requireRule(exactKeys(block, ['websearch', 'webfetch', 'breaker', 'oneQueryPerRunUnit', 'toolResultCategory']), 'platformTools 字段不完整。');
  const search = block['websearch'] as Record<string, unknown>;
  const production = Object.hasOwn(search, 'selectionRequiresCredential');
  requireRule(exactKeys(search, production
    ? ['selection', 'backends', 'selectionRequiresCredential', 'userConfiguredBackendAuthorizesTransmission']
    : ['selection', 'backends']), 'websearch 字段不完整。');
  requireRule(search['selection'] === 'user-configured', 'websearch.selection 无效。');
  // Selecting a backend never authorizes a transmission by itself, and v17 requires the editor's own key to select one.
  requireRule(!production || (search['selectionRequiresCredential'] === true && search['userConfiguredBackendAuthorizesTransmission'] === false),
    'websearch 的选择条款无效。');
  const listed = search['backends'];
  requireRule(Array.isArray(listed) && listed.length > 0, 'websearch.backends 不能为空。');
  const backends: PlatformToolsBackend[] = [];
  for (const entry of listed as unknown[]) {
    requireRule(isRecord(entry) && exactKeys(entry, production
      ? ['id', 'host', 'endpoint', 'credentialSlot', 'anonymous']
      : ['id', 'host', 'endpoint', 'credentialSlot', 'anonymous', 'developmentCredentialReference']), '搜索后端字段不完整。');
    const { id, host, endpoint, credentialSlot } = entry;
    requireRule(typeof id === 'string' && BACKEND_ID_SHAPE.test(id), '搜索后端标识无效。');
    requireRule(typeof host === 'string' && HOSTNAME_SHAPE.test(host), `搜索后端 ${id} 的主机无效。`);
    requireRule(typeof endpoint === 'string' && httpsEndpointOn(endpoint, host), `搜索后端 ${id} 的地址无效。`);
    requireRule(typeof credentialSlot === 'string' && IDENTIFIER_SHAPE.test(credentialSlot), `搜索后端 ${id} 的凭据槽无效。`);
    requireRule(entry['anonymous'] === false, `搜索后端 ${id} 必须使用密钥。`);
    const reference = production ? null : entry['developmentCredentialReference'];
    requireRule(reference === null || (typeof reference === 'string' && CREDENTIAL_REFERENCE_SHAPE.test(reference)), `搜索后端 ${id} 的开发凭据引用无效。`);
    requireRule(!backends.some((known) => known.id === id || known.host === host), `搜索后端 ${id} 重复。`);
    backends.push(Object.freeze({ id, host, endpoint, credentialSlot, anonymous: false as const, developmentCredentialReference: reference as string | null }));
  }
  const breaker = block['breaker'];
  requireRule(isRecord(breaker) && exactKeys(breaker, ['roundTrips', 'end']) && Number.isSafeInteger(breaker['roundTrips']) &&
    (breaker['roundTrips'] as number) > 0 && typeof breaker['end'] === 'string' && breaker['end'].length > 0, 'breaker 无效。');
  requireRule(block['oneQueryPerRunUnit'] === true, '每个运行单元只允许一条检索。');
  requireRule(block['toolResultCategory'] === 'public-or-synthetic', '工具结果只能是公开或合成内容。');
  return Object.freeze({
    websearch: Object.freeze({ selection: 'user-configured' as const, backends: Object.freeze(backends), selectionRequiresCredential: production }),
    webfetch: readWebfetch(block['webfetch']),
    breaker: Object.freeze({ roundTrips: breaker['roundTrips'] as number, end: breaker['end'] as string }),
    oneQueryPerRunUnit: true as const,
    toolResultCategory: 'public-or-synthetic' as const,
  });
}

/** Whether `endpoint` is an absolute `https` URL on exactly `host`, without credentials, port or fragment. */
function httpsEndpointOn(endpoint: string, host: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && url.hostname === host && url.port === '' && url.username === '' && url.password === '' && url.hash === '';
  } catch {
    return false;
  }
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

export const LOCAL_TOOL_SCHEMAS: ReadonlyArray<PlatformToolSchema> = Object.freeze([
  Object.freeze({ name: 'exact_fetch' as const, description: '精确取回检索候选在已固定来源版本中的原文。引用前必须调用。',
    parameters: { type: 'object', properties: { candidateId: { type: 'string' } }, required: ['candidateId'], additionalProperties: false } }),
  Object.freeze({ name: 'retrieve' as const, description: '在这次任务已授权并固定的本机来源中检索候选；候选预览不是引文，引用前必须精确取文。',
    parameters: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 1000 }, k: { type: 'integer', minimum: 1, maximum: 8 },
      sourceKinds: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: ['manuscript', 'material', 'retained-source'] } } }, required: ['query'], additionalProperties: false } }),
]);
export const LOCAL_TOOL_SCHEMA_DIGEST = sha256Hex(canonicalJson(LOCAL_TOOL_SCHEMAS));

/** Preserve the exact web schemas, adding only the subset the selected rule names. */
export function ruleNamedToolSchemas(web: boolean, local: boolean): ReadonlyArray<PlatformToolSchema> {
  return [...(web ? PLATFORM_TOOL_SCHEMAS : []), ...(local ? LOCAL_TOOL_SCHEMAS : [])].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/**
 * Whether a payload's tools are exactly the platform tools a rule names (ADR 0080 §7.2's narrowing of `tools-present`):
 * the same names, the same descriptions, the same parameters, nothing more and nothing less. A rule that names none
 * matches no tool set at all, so under Provider Processing v5 every tool is still refused.
 */
export function toolSetEqualsRule(tools: ReadonlyArray<unknown>, rule: PlatformToolsRule | null): boolean {
  return rule !== null && toolSetEqualsPlatformSchemas(tools);
}

/** Whether a tool set is exactly the two platform tool schemas, byte for byte in canonical form. */
export function toolSetEqualsPlatformSchemas(tools: ReadonlyArray<unknown>, schemas: ReadonlyArray<PlatformToolSchema> = PLATFORM_TOOL_SCHEMAS): boolean {
  if (tools.length !== schemas.length) return false;
  const projected: unknown[] = [];
  for (const tool of tools) {
    if (!isRecord(tool) || !exactKeys(tool, ['name', 'description', 'parameters'])) return false;
    projected.push({ name: tool['name'], description: tool['description'], parameters: tool['parameters'] });
  }
  projected.sort((left, right) => String((left as { name: unknown }).name).localeCompare(String((right as { name: unknown }).name), 'en'));
  return canonicalJson(projected) === canonicalJson(schemas);
}

/** The canonical arguments of one call: the deduplication key within a unit and the cache key across Runs (§7.4). */
export type PlatformToolArguments =
  | { readonly tool: 'websearch'; readonly query: string }
  | { readonly tool: 'webfetch'; readonly url: string }
  | { readonly tool: 'retrieve'; readonly query: string; readonly k: number; readonly sourceKinds?: ReadonlyArray<'manuscript' | 'material' | 'retained-source'> }
  | { readonly tool: 'exact_fetch'; readonly candidateId: string };

/** The longest query AI7 forwards; a longer one is a refusal returned to the model, never a truncation. */
export const WEBSEARCH_QUERY_MAX_CHARACTERS = 1_000;

/**
 * Parse one call's raw arguments into their canonical form, or `null` when they are not a call this tool accepts. A query
 * is NFC-normalized and trimmed; a URL is an absolute `https` URL with no credentials, no fragment, and a public host
 * name, rendered by the WHATWG serializer so that two spellings of one address are one key.
 */
export function canonicalToolArguments(name: string, args: unknown): PlatformToolArguments | null {
  if (!isRecord(args)) return null;
  if (name === 'exact_fetch') return exactKeys(args, ['candidateId']) && typeof args.candidateId === 'string' && /^[0-9a-f]{64}$/u.test(args.candidateId)
    ? { tool: 'exact_fetch', candidateId: args.candidateId } : null;
  if (name === 'retrieve') {
    if (Object.keys(args).some((key) => !['query', 'k', 'sourceKinds'].includes(key)) || typeof args.query !== 'string') return null;
    const query = args.query.normalize('NFC').trim();
    const k = args.k ?? 8;
    if (!query.isWellFormed() || query.length === 0 || query.length > 1000 || typeof k !== 'number' || !Number.isSafeInteger(k) || k < 1 || k > 8) return null;
    const kinds = args.sourceKinds;
    if (kinds !== undefined && (!Array.isArray(kinds) || kinds.length < 1 || kinds.length > 3 || new Set(kinds).size !== kinds.length ||
        !kinds.every((kind) => ['manuscript', 'material', 'retained-source'].includes(String(kind))))) return null;
    return { tool: 'retrieve', query, k, ...(kinds === undefined ? {} : { sourceKinds: [...kinds].sort() as Array<'manuscript' | 'material' | 'retained-source'> }) };
  }
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
  if (!HOSTNAME_SHAPE.test(host) || !isPublicHostName(host)) return null;
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
