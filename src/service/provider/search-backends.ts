import bochaai from '../../../config/providers/search-backends/search-bochaai.json' with { type: 'json' };
import brave from '../../../config/providers/search-backends/search-brave.json' with { type: 'json' };
import deepseek from '../../../config/providers/search-backends/search-deepseek.json' with { type: 'json' };
import parallel from '../../../config/providers/search-backends/search-parallel.json' with { type: 'json' };
import tinyfish from '../../../config/providers/search-backends/search-tinyfish.json' with { type: 'json' };
import measured from '../../../config/providers/recorded-evidence/search-backend-profiles.json' with { type: 'json' };
import { isRecord } from '../analysis/canonical.js';
import type { ConfiguredCredentialSlot } from '../../shared/provider-configuration.generated.js';

/**
 * The search backend registry (Issue #883; Owner decisions 24⁵): every web search backend a document under
 * `config/providers/search-backends/` declares, with the profile the development evaluation measured for it
 * (`config/providers/recorded-evidence/search-backend-profiles.json`), whether it ships, and its place in the default order.
 * Hosts, endpoints, prices and key requirements are configuration read from the documents, never source constants
 * (ADR 0080 §5.3). A backend here is a declaration, not a permission: nothing in this module sends, the Egress Gate admits
 * no search backend host because of it, and a Run's search still needs its policy rule and a redeemed ticket.
 *
 * The documents are validated by `tools/generate-provider-configuration.mjs` (the ladder's `check` rung); this module reads
 * them as configuration and refuses at load a document whose shape it does not know, rather than guessing.
 */

/** A search backend's id: its document's file name and its credential slot. */
export type SearchBackendId = Extract<ConfiguredCredentialSlot, `search-${string}`>;
export type SearchBackendProtocol = 'bocha-web-search' | 'brave-web-search' | 'tinyfish-search' | 'parallel-search' | 'anthropic-messages-web-search';
export type SearchBackendHeaderForm = 'authorization-bearer' | 'x-api-key' | 'x-subscription-token';
/** Why a backend is not offered (decision 24⁵: only the clearly unusable are excluded). */
export type SearchBackendExclusion = 'not-supported' | 'unreachable' | 'no-authenticated-response' | 'zero-hits-both-halves' | 'not-measured';

export interface SearchBackendDeclaration {
  readonly id: SearchBackendId;
  /** The name a Provider Processing rule's `platformTools.websearch.service` uses for this vendor. */
  readonly service: string;
  readonly displayName: string;
  readonly support: 'supported' | 'not-supported';
  /** The keyed search interface; all null on a `not-supported` (尚未支持) backend. */
  readonly endpoint: string | null;
  readonly host: string | null;
  readonly method: 'GET' | 'POST' | null;
  readonly protocol: SearchBackendProtocol | null;
  /** A keyless interface the vendor documents beside the keyed one (Parallel's Search MCP, ADR 0080 §7.1), or null. */
  readonly anonymous: { readonly endpoint: string; readonly host: string; readonly protocol: 'mcp-tools-call'; readonly tool: string } | null;
  readonly credentialSlot: SearchBackendId;
  readonly headerForm: SearchBackendHeaderForm;
  readonly anthropicVersion: string | null;
  readonly keyRequired: boolean;
  /** The vendor page's price: `amount` in `currency` per `per` calls, or null amount where it bills otherwise (`basis`). */
  readonly price: { readonly amount: number | null; readonly currency: 'USD' | 'CNY'; readonly per: number; readonly basis: string };
  /** The price's reading, including an explicit caveat when its original vendor source could not be retained. */
  readonly priceSource: { readonly verified: boolean; readonly source: string | null; readonly readOn: string | null; readonly note: string | null };
}

/** What the evaluation measured for one backend: counts, rates and latencies only, never a result or a payload. */
export interface MeasuredSearchProfile {
  readonly backendId: string;
  readonly verdict: 'measured' | 'unreachable' | 'no-authenticated-response' | 'not-supported';
  readonly queries: number;
  readonly answered: number;
  readonly transportErrors: number;
  readonly transportRetries: number;
  readonly statusClasses: Readonly<Record<'2xx' | '3xx' | '4xx' | '5xx' | 'none', number>>;
  readonly hits: SearchHalves;
  readonly totals: SearchHalves;
  readonly sourceQuality: { readonly primaryHits: number; readonly primaryEligible: number; readonly listedResults: number; readonly results: number };
  readonly latencyMs: { readonly p50: number | null; readonly p95: number | null };
  readonly costPerCallUsd: number | null;
  readonly note: string | null;
}

export interface SearchHalves {
  readonly overall: number;
  readonly chinese: number;
  readonly international: number;
}

export interface SearchBackendEntry extends SearchBackendDeclaration {
  readonly profile: MeasuredSearchProfile | null;
  /** Offered in 设置 › 模型服务 › 联网检索: supported, measured, and not excluded by decision 24⁵. */
  readonly shipped: boolean;
  readonly exclusion: SearchBackendExclusion | null;
  /** 1-based place in the default order, and the quality tier it came from; null when not shipped. */
  readonly rank: number | null;
  readonly tier: number | null;
}

/**
 * A backend document's one closed candidate namespace (Issue #1055): a direct interface of the same vendor, declared and
 * disclosed as unmeasured. It is never the backend's request, profile, rank, default or legacy digest, and nothing ordinary —
 * a Task, a selection, the default — may name it; only the selected policy's fixed connection test reaches its search.
 */
export interface SearchBackendCandidate {
  readonly backendId: SearchBackendId;
  readonly candidateId: string;
  readonly revision: number;
  readonly displayName: string;
  readonly measurement: 'not-measured';
  readonly search: {
    readonly endpoint: string; readonly host: string; readonly method: 'POST'; readonly protocol: 'deepseek-direct-search'; readonly headerForm: 'authorization-bearer';
    readonly probeArguments: { readonly query: string; readonly count: number; readonly need_content: false };
  };
  readonly fetch: { readonly endpoint: string; readonly host: string; readonly method: 'POST'; readonly protocol: 'deepseek-direct-fetch'; readonly headerForm: 'authorization-bearer' };
  readonly credentialSlot: SearchBackendId;
  readonly price: SearchBackendDeclaration['price'];
  readonly priceSource: SearchBackendDeclaration['priceSource'];
}

/**
 * The historical subject a measured profile was recorded against (#883): a profile qualifies a backend only while its actual
 * request is still that subject, so an altered legacy request cannot inherit the old measurement and no candidate inherits it.
 */
export const MEASURED_SEARCH_SUBJECTS: Readonly<Partial<Record<SearchBackendId, { readonly endpoint: string; readonly method: 'POST'; readonly protocol: SearchBackendProtocol; readonly model: string; readonly tool: { readonly type: string; readonly name: string } }>>> = Object.freeze({
  'search-deepseek': Object.freeze({ endpoint: 'https://api.deepseek.com/anthropic/v1/messages', method: 'POST', protocol: 'anthropic-messages-web-search',
    model: 'deepseek-flash', tool: Object.freeze({ type: 'web_search_20250305', name: 'web_search' }) }),
});

/** One search result as AI7 keeps it from any backend: a title and a URL, never the snippet or the page. */
export interface SearchBackendHit {
  readonly title: string;
  readonly url: string;
}

/** The one request a query becomes on a backend's keyed interface, without sending it. */
export interface SearchBackendRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
}

/**
 * The single seam every search backend adapter implements (slice 6b): build the request one query becomes and read the
 * results back. An adapter sends nothing itself; the credential value is handed in only inside the transmit step that
 * holds it, and the request is sent by the owner the Egress Gate authorizes.
 */
export interface SearchBackend {
  readonly declaration: SearchBackendDeclaration;
  request(query: string, options: { readonly credential: string; readonly count: number }): SearchBackendRequest;
  /** The results in rank order, or null when the answer carries none AI7 can read. */
  readResults(status: number, contentType: string | null, body: string): ReadonlyArray<SearchBackendHit> | null;
}

/** Decision 24⁵: a backend whose overall hit rate is within this many points of the best is in the top tier. */
export const SEARCH_RANKING_TIER_WIDTH = 0.1;

const PROTOCOLS: ReadonlySet<string> = new Set<SearchBackendProtocol>(['bocha-web-search', 'brave-web-search', 'tinyfish-search', 'parallel-search', 'anthropic-messages-web-search']);
const HEADER_FORMS: ReadonlySet<string> = new Set<SearchBackendHeaderForm>(['authorization-bearer', 'x-api-key', 'x-subscription-token']);

class SearchBackendConfigurationError extends Error {
  constructor(message: string) {
    super(`SEARCH_BACKEND_CONFIGURATION: ${message}`);
    this.name = 'SearchBackendConfigurationError';
  }
}

function requireConfiguration(condition: boolean, message: string): asserts condition {
  if (!condition) throw new SearchBackendConfigurationError(message);
}

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** One document as a declaration; a field outside the shapes the generator validates refuses the whole registry. */
export function searchBackendDeclarationOf(document: unknown): SearchBackendDeclaration {
  requireConfiguration(isRecord(document) && document['schemaVersion'] === 1, 'document');
  const id = document['backendId'];
  const service = document['service'];
  requireConfiguration(typeof id === 'string' && /^search-[a-z][a-z0-9-]*$/u.test(id) && id === `search-${String(service)}`, 'backendId');
  const request = document['request'];
  const credential = document['credential'];
  const price = document['price'];
  requireConfiguration(isRecord(request) && isRecord(credential) && isRecord(price), `${id} request, credential or price`);
  const support = document['support'];
  requireConfiguration(support === 'supported' || support === 'not-supported', `${id} support`);
  const endpoint = stringOrNull(request['endpoint']);
  const method = request['method'];
  const protocol = request['protocol'];
  requireConfiguration(support === 'supported'
    ? endpoint !== null && (method === 'GET' || method === 'POST') && typeof protocol === 'string' && PROTOCOLS.has(protocol)
    : endpoint === null && method === null && protocol === null, `${id} request`);
  const headerForm = credential['headerForm'];
  requireConfiguration(credential['slot'] === id && typeof headerForm === 'string' && HEADER_FORMS.has(headerForm) && typeof credential['keyRequired'] === 'boolean', `${id} credential`);
  const amount = price['amount'];
  const currency = price['currency'];
  requireConfiguration((amount === null || (typeof amount === 'number' && amount >= 0)) && (currency === 'USD' || currency === 'CNY') &&
    typeof price['per'] === 'number' && price['per'] >= 1 && typeof price['basis'] === 'string', `${id} price`);
  const evidence = document['evidence'];
  const priceEvidence = isRecord(evidence) && typeof price['evidence'] === 'string' ? evidence[price['evidence']] : null;
  requireConfiguration(isRecord(priceEvidence) && (priceEvidence['kind'] === 'vendor-documentation' || priceEvidence['kind'] === 'unverified'), `${id} price evidence`);
  const anonymousRequest = document['anonymousRequest'];
  let anonymous: SearchBackendDeclaration['anonymous'] = null;
  if (anonymousRequest !== undefined) {
    requireConfiguration(isRecord(anonymousRequest) && typeof anonymousRequest['endpoint'] === 'string' && anonymousRequest['protocol'] === 'mcp-tools-call' &&
      typeof anonymousRequest['tool'] === 'string', `${id} anonymousRequest`);
    anonymous = Object.freeze({
      endpoint: anonymousRequest['endpoint'],
      host: new URL(anonymousRequest['endpoint']).hostname,
      protocol: 'mcp-tools-call' as const,
      tool: anonymousRequest['tool'],
    });
  }
  return Object.freeze({
    id: id as SearchBackendId,
    service: service as string,
    displayName: String(document['displayName']),
    support,
    endpoint,
    host: endpoint === null ? null : new URL(endpoint).hostname,
    method: method as SearchBackendDeclaration['method'],
    protocol: protocol as SearchBackendDeclaration['protocol'],
    anonymous,
    credentialSlot: id as SearchBackendId,
    headerForm: headerForm as SearchBackendHeaderForm,
    anthropicVersion: stringOrNull(credential['anthropicVersion']),
    keyRequired: credential['keyRequired'] as boolean,
    price: Object.freeze({ amount: amount as number | null, currency, per: price['per'] as number, basis: price['basis'] as string }),
    priceSource: Object.freeze({
      verified: priceEvidence['kind'] === 'vendor-documentation',
      source: stringOrNull(priceEvidence['source']),
      readOn: stringOrNull(priceEvidence['readOn']),
      note: stringOrNull(priceEvidence['note']),
    }),
  });
}

/** A document's candidate namespace, read whole after the generator validated it; `null` when the document declares none. */
export function searchBackendCandidateOf(document: unknown): SearchBackendCandidate | null {
  if (!isRecord(document) || document['candidate'] === undefined) return null;
  const declaration = searchBackendDeclarationOf(document);
  const candidate = document['candidate'];
  requireConfiguration(isRecord(candidate) && typeof candidate['candidateId'] === 'string' && Number.isInteger(candidate['revision']) &&
    candidate['measurement'] === 'not-measured' && isRecord(candidate['search']) && isRecord(candidate['fetch']) && isRecord(candidate['price']) && isRecord(candidate['evidence']), `${declaration.id} candidate`);
  const search = candidate['search'] as Record<string, unknown>;
  const fetch = candidate['fetch'] as Record<string, unknown>;
  const args = search['probeArguments'];
  requireConfiguration(typeof search['endpoint'] === 'string' && search['method'] === 'POST' && search['protocol'] === 'deepseek-direct-search' &&
    search['headerForm'] === 'authorization-bearer' && isRecord(args) && typeof args['query'] === 'string' && Number.isInteger(args['count']) && args['need_content'] === false &&
    typeof fetch['endpoint'] === 'string' && fetch['method'] === 'POST' && fetch['protocol'] === 'deepseek-direct-fetch' && fetch['headerForm'] === 'authorization-bearer', `${declaration.id} candidate interfaces`);
  const host = new URL(search['endpoint']).hostname;
  requireConfiguration(host === declaration.host && new URL(fetch['endpoint']).hostname === host && search['endpoint'] !== declaration.endpoint, `${declaration.id} candidate host`);
  const priced = searchBackendDeclarationOf({ ...document, price: candidate['price'], evidence: candidate['evidence'] });
  return Object.freeze({
    backendId: declaration.id, candidateId: candidate['candidateId'], revision: candidate['revision'] as number, displayName: String(candidate['displayName']),
    measurement: 'not-measured' as const,
    search: Object.freeze({ endpoint: search['endpoint'], host, method: 'POST' as const, protocol: 'deepseek-direct-search' as const, headerForm: 'authorization-bearer' as const,
      probeArguments: Object.freeze({ query: args['query'] as string, count: args['count'] as number, need_content: false as const }) }),
    fetch: Object.freeze({ endpoint: fetch['endpoint'], host, method: 'POST' as const, protocol: 'deepseek-direct-fetch' as const, headerForm: 'authorization-bearer' as const }),
    credentialSlot: declaration.credentialSlot, price: priced.price, priceSource: priced.priceSource,
  });
}

/** Every declared backend, in document file-name order. */
export const SEARCH_BACKEND_DECLARATIONS: ReadonlyArray<SearchBackendDeclaration> = Object.freeze(
  [bochaai, brave, deepseek, parallel, tinyfish].map((document: unknown) => searchBackendDeclarationOf(document)),
);

/** Every declared candidate, in document file-name order. */
export const SEARCH_BACKEND_CANDIDATES: ReadonlyArray<SearchBackendCandidate> = Object.freeze(
  [bochaai, brave, deepseek, parallel, tinyfish].map((document: unknown) => searchBackendCandidateOf(document)).filter((entry): entry is SearchBackendCandidate => entry !== null),
);

/** The exact closed candidate a backend declares; an unknown or mismatched backend/candidate pair is refused. */
export function searchBackendCandidate(backendId: string, candidateId: string): SearchBackendCandidate {
  const candidate = SEARCH_BACKEND_CANDIDATES.find((entry) => entry.backendId === backendId && entry.candidateId === candidateId);
  if (candidate === undefined) throw new Error('SEARCH_CANDIDATE_UNKNOWN');
  return candidate;
}

/** The measured profile that still qualifies this declaration: its own, and only while its request is the measured subject. */
export function qualifiedSearchProfile(declaration: SearchBackendDeclaration, profiles: ReadonlyArray<MeasuredSearchProfile>): MeasuredSearchProfile | null {
  const profile = profiles.find((entry) => entry.backendId === declaration.id) ?? null;
  const subject = MEASURED_SEARCH_SUBJECTS[declaration.id];
  if (profile === null || subject === undefined) return profile;
  return declaration.endpoint === subject.endpoint && declaration.method === subject.method && declaration.protocol === subject.protocol ? profile : null;
}

/** A backend's overall hit rate, or 0 where nothing was asked. */
export function overallHitRate(profile: MeasuredSearchProfile): number {
  return profile.totals.overall === 0 ? 0 : profile.hits.overall / profile.totals.overall;
}

/** The price of one call in USD for ordering inside a tier: the page's price, else the measured token cost, else null. */
export function pricePerCallUsd(declaration: SearchBackendDeclaration, profile: MeasuredSearchProfile | null, cnyPerUsd: number): number | null {
  const { amount, currency, per } = declaration.price;
  if (amount === null) return profile?.costPerCallUsd ?? null;
  const perCall = amount / per;
  return currency === 'USD' ? perCall : perCall / cnyPerUsd;
}

/**
 * Decision 24⁵'s exclusion rule: only the clearly unusable — 尚未支持, never measured, unreachable from the measuring host
 * without a proxy, no working authenticated response, or no hit on either the Chinese or the international half.
 */
export function searchBackendExclusion(declaration: SearchBackendDeclaration, profile: MeasuredSearchProfile | null): SearchBackendExclusion | null {
  if (declaration.support === 'not-supported' || profile?.verdict === 'not-supported') return 'not-supported';
  if (profile === null) return 'not-measured';
  if (profile.verdict === 'unreachable') return 'unreachable';
  if (profile.verdict === 'no-authenticated-response') return 'no-authenticated-response';
  if (profile.hits.chinese === 0 && profile.hits.international === 0) return 'zero-hits-both-halves';
  return null;
}

export interface RankingCandidate {
  readonly backendId: string;
  readonly hitRate: number;
  readonly pricePerCallUsd: number | null;
}

/** An unknown price orders after every known one. */
function comparePrice(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a - b;
}

const EPSILON = 1e-9;

/**
 * Decision 24⁵'s ranking of the backends that survive exclusion: by overall hit rate; every backend within the tier width
 * of the best is the top tier, ordered by price per call (cheapest first, then hit rate, then id); the rest follow in
 * hit-rate order (then price, then id), numbered into further tiers by the same width below each tier's own best.
 */
export function rankSearchBackends(candidates: ReadonlyArray<RankingCandidate>, tierWidth = SEARCH_RANKING_TIER_WIDTH): Array<{ backendId: string; tier: number }> {
  const byHitRate = [...candidates].sort((a, b) => b.hitRate - a.hitRate || comparePrice(a.pricePerCallUsd, b.pricePerCallUsd) || a.backendId.localeCompare(b.backendId));
  const best = byHitRate[0];
  if (best === undefined) return [];
  const top = byHitRate.filter((candidate) => best.hitRate - candidate.hitRate <= tierWidth + EPSILON);
  top.sort((a, b) => comparePrice(a.pricePerCallUsd, b.pricePerCallUsd) || b.hitRate - a.hitRate || a.backendId.localeCompare(b.backendId));
  const ranking = top.map((candidate) => ({ backendId: candidate.backendId, tier: 1 }));
  let tier = 1;
  let leader: number | null = null;
  for (const candidate of byHitRate.slice(top.length)) {
    if (leader === null || leader - candidate.hitRate > tierWidth + EPSILON) {
      tier += 1;
      leader = candidate.hitRate;
    }
    ranking.push({ backendId: candidate.backendId, tier });
  }
  return ranking;
}

export interface SearchBackendOutcome {
  readonly excluded: ReadonlyArray<{ backendId: string; reason: SearchBackendExclusion }>;
  readonly ranking: ReadonlyArray<{ backendId: string; tier: number }>;
  readonly default: string | null;
}

/** Exclusion, then ranking, then the default (the first ranked), over declarations and their measured profiles. */
export function searchBackendOutcome(
  declarations: ReadonlyArray<SearchBackendDeclaration>,
  profiles: ReadonlyArray<MeasuredSearchProfile>,
  cnyPerUsd: number,
  tierWidth = SEARCH_RANKING_TIER_WIDTH,
): SearchBackendOutcome {
  const excluded: Array<{ backendId: string; reason: SearchBackendExclusion }> = [];
  const candidates: RankingCandidate[] = [];
  for (const declaration of declarations) {
    const profile = qualifiedSearchProfile(declaration, profiles);
    const exclusion = searchBackendExclusion(declaration, profile);
    if (exclusion !== null || profile === null) {
      excluded.push({ backendId: declaration.id, reason: exclusion ?? 'not-measured' });
      continue;
    }
    candidates.push({ backendId: declaration.id, hitRate: overallHitRate(profile), pricePerCallUsd: pricePerCallUsd(declaration, profile, cnyPerUsd) });
  }
  const ranking = rankSearchBackends(candidates, tierWidth);
  return { excluded, ranking, default: ranking[0]?.backendId ?? null };
}

/** The recorded evaluation, as configuration: the profiles and the rate that orders prices across currencies. */
export const SEARCH_BACKEND_EVALUATION = Object.freeze({
  measuredOn: measured.evaluation.measuredOn,
  cnyPerUsd: measured.evaluation.cnyPerUsd.rate,
  profiles: measured.profiles as ReadonlyArray<MeasuredSearchProfile>,
});

const OUTCOME = searchBackendOutcome(SEARCH_BACKEND_DECLARATIONS, SEARCH_BACKEND_EVALUATION.profiles, SEARCH_BACKEND_EVALUATION.cnyPerUsd);

/** Every declared backend with its profile, in the default order: shipped backends by rank, then the excluded ones. */
export const SEARCH_BACKENDS: ReadonlyArray<SearchBackendEntry> = Object.freeze(
  [...OUTCOME.ranking.map((entry) => entry.backendId), ...OUTCOME.excluded.map((entry) => entry.backendId)].map((backendId) => {
    const declaration = SEARCH_BACKEND_DECLARATIONS.find((entry) => entry.id === backendId)!;
    const rankIndex = OUTCOME.ranking.findIndex((entry) => entry.backendId === backendId);
    return Object.freeze({
      ...declaration,
      profile: qualifiedSearchProfile(declaration, SEARCH_BACKEND_EVALUATION.profiles),
      shipped: rankIndex >= 0,
      exclusion: OUTCOME.excluded.find((entry) => entry.backendId === backendId)?.reason ?? null,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      tier: rankIndex >= 0 ? OUTCOME.ranking[rankIndex]!.tier : null,
    });
  }),
);

/** The default selection: the first-ranked shipped backend, or null when none ships. */
export function defaultSearchBackend(): SearchBackendEntry | null {
  return SEARCH_BACKENDS.find((entry) => entry.rank === 1) ?? null;
}

/** The keyless search interface a service name declares (the search forwarder's host and path), or null. */
export function anonymousSearchInterface(service: string): SearchBackendDeclaration['anonymous'] {
  return SEARCH_BACKEND_DECLARATIONS.find((entry) => entry.service === service)?.anonymous ?? null;
}
