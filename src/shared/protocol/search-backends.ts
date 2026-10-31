import type { ModelCredentialOperationState } from '../protocol.js';

/**
 * 设置 › 模型服务 › 联网检索 (Issue #883) and its one closed direct-search candidate (Issue #1055 into W22-S10a #1181): the
 * shipped backends with their measured profiles, the editor's choice, and a candidate that is declared, disclosed as 未实测
 * and reachable only by the selected policy's fixed connection test — never by a Task, a selection or the default.
 */
export interface SearchBackendConnectionProjection {
  backendId: string;
  credentialReference: string | null;
  credentialOperationState: ModelCredentialOperationState;
  selected: boolean;
  selectedAt: string;
}

/** The closed candidate identifiers a probe request may name; anything else is refused at the frame. */
export const SEARCH_CANDIDATE_IDS = ['deepseek-direct-search-v1'] as const;
export type SearchCandidateId = (typeof SEARCH_CANDIDATE_IDS)[number];

export interface SearchBackendCandidateProjection {
  backendId: string;
  candidateId: SearchCandidateId;
  revision: number;
  name: string;
  measurement: 'not-measured';
  endpoint: string;
  protocol: 'deepseek-direct-search';
  /** The candidate's own digest; the legacy backend's digest excludes its namespace. */
  configurationDigest: string;
  /** Declared, not measured: the vendor documents both; neither serves a Task in this build. */
  capabilities: { search: true; fetch: true };
  selectable: false;
  price: string;
  /** Plain-language disclosure lines, shown before the connection test. */
  disclosure: readonly string[];
}

/**
 * The 备用来源 a Plan froze beside `webToolsBackend` under Provider Processing v32 (Issue #1226; ADR 0094 §2): the one fallback
 * the Run's search binding may send the same canonical query to after the default failed twice on an admitted class.
 */
export interface FrozenWebToolsFallback {
  backendId: string;
  host: string;
  configurationDigest: string;
  credentialReference: string;
  selectedAt: string;
}

/** Choose the default backend, or (Issue #1226) with `role: 'fallback'` the one 备用来源 — `null` clears it. */
export type SearchBackendSelectionInput = { backendId: string; role?: undefined } | { backendId: string | null; role: 'fallback' };

export interface SearchBackendSettingsProjection {
  selectedBackendId: string;
  /** The one 备用来源 a Plan freezes beside the default (Issue #1226), or `null`; never the default itself. */
  fallbackBackendId: string | null;
  backends: ReadonlyArray<{
    backendId: string;
    name: string;
    rank: number;
    host: string;
    reachable: boolean;
    p50Ms: number | null;
    price: string;
    keyRequired: boolean;
    chineseHitRate: number;
    internationalHitRate: number;
    note: string | null;
    connection: SearchBackendConnectionProjection;
  }>;
  candidates: readonly SearchBackendCandidateProjection[];
}

/**
 * What one candidate connection test ended as, sanitized: a valid answer with results or with none, a body that is not the
 * documented shape, an HTTP rejection (its status only, never the provider's body or a guessed account cause), or a transport
 * that was interrupted or ended unknown.
 */
export type SearchCandidateProbeOutcome = 'succeeded' | 'succeeded-empty' | 'malformed-response' | 'http-rejected' | 'transport-interrupted' | 'transport-unknown';

export interface SearchBackendProbeProjection {
  backendId: string;
  reachable: boolean;
  latencyMs: number;
  resultCount: number;
  results: ReadonlyArray<{ title: string; url: string }>;
  failure: string | null;
  /** Present only for a candidate's connection test: the exact contract the results are qualified by. */
  candidate?: {
    candidateId: SearchCandidateId;
    endpoint: string;
    protocol: 'deepseek-direct-search';
    configurationDigest: string;
    outcome: SearchCandidateProbeOutcome;
    httpStatus: number | null;
  };
}

/**
 * The selected policy's `searchConnectionTest` (ordinary-production since v28; the #1055 purpose), read whole by the launch:
 * the exact candidate, its fixed arguments and bounds, and the scopes that refuse it before ticket, credential or transport.
 */
export interface SearchConnectionTestPolicy {
  readonly ruleId: 'ordinary-production-direct-search-connection-test';
  readonly purpose: 'fixed-public-search-connection-test';
  readonly backendId: string;
  readonly candidateId: string;
  readonly endpoint: string;
  readonly method: 'POST';
  readonly protocol: 'deepseek-direct-search';
  readonly credentialSlot: string;
  readonly headerForm: 'authorization-bearer';
  readonly arguments: { readonly query: string; readonly count: number; readonly need_content: false };
  readonly argumentsCanonicalSha256: string;
  readonly maximumRequests: 1;
  readonly timeoutMilliseconds: number;
  readonly responseMaxBytes: number;
  readonly resultsMaximum: number;
  readonly titleMaximumCharacters: number;
  readonly urlMaximumCharacters: number;
  readonly rejectedOperationalScopes: ReadonlyArray<'development-ci' | 'fixture-recording' | 'developer-live'>;
}
