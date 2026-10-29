import { searchBackend, searchBackendCandidateConfigurationDigest } from './search-backends/index.js';
import { DEVELOPMENT_CREDENTIAL_REFERENCES } from '../../shared/protected-secret-identity.js';
import type { CredentialBroker } from './credential-broker.js';
import type { TicketHostAdmission } from './public-source-fetch.js';
import { isRecord } from '../analysis/canonical.js';
import { EgressTicketBook, evaluateSearchCandidateProbe, evaluateSearchServiceCall, redeemEgressTicket, redeemSearchCandidateProbe, releaseSearchCandidateProbe, type SearchCandidateProbeTicket, type SearchServiceTicket } from './egress-gate.js';
import { deepseekDirectSearchRequest, readDeepseekDirectSearch } from './search-backends/deepseek.js';
import { toolArgumentsDigest, type PlatformToolArguments, type PlatformToolsRule } from './platform-tools.js';
import { PlatformToolHttpError, deadlineSignal, readBoundedBody, type PlatformToolFetch } from './platform-tool-http.js';
import { anonymousSearchInterface, searchBackendCandidate } from './search-backends.js';
import type { SearchBackendProbeProjection, SearchCandidateId, SearchCandidateProbeOutcome, SearchConnectionTestPolicy } from '../../shared/protocol.js';

/**
 * The `websearch` forwarder (ADR 0080 §7.1, §7.2; Issue #473 S87-f3a). The model emits the call; AI7 composes no query of
 * its own and forwards exactly that one as one JSON-RPC `tools/call` to the search service the binding's rule names, the
 * way the opencode client does (ADR 0080 §3): HTTP POST, `Accept: application/json, text/event-stream`, the first text
 * content block back, 25 seconds, no retry. The host, the service, and the service's tool name are the rule's; the path on
 * that host is the one the service's search backend document declares for its keyless interface (the registry, Issue #883;
 * ADR 0080 §5.3: an endpoint is configuration, not a source constant), and a service no document declares a keyless
 * interface for is refused. The rule declares the service anonymous, so no credential exists to send. Nothing is sent
 * without a redeemed `call-search-service` ticket for exactly this host and this query.
 */

/** How AI7 speaks to one named search service's tool: the arguments it takes. */
interface SearchServiceProtocol {
  argumentsOf(query: string): Record<string, unknown>;
}

/**
 * The tool-argument contract of each search service a rule may name, keyed by the rule's `service`. This is how a service
 * is spoken to, not which one is used or where it is: the host and the tool name are the rule's, the path the registry's,
 * and a service the table or the registry does not know is a refusal. Parallel's Search MCP
 * (docs.parallel.ai/integrations/mcp/search-mcp, read 2026-09-11) takes an `objective` and `search_queries[]`.
 */
const SEARCH_SERVICE_PROTOCOLS: Readonly<Record<string, SearchServiceProtocol>> = Object.freeze({
  parallel: Object.freeze({ argumentsOf: (query: string) => ({ objective: query, search_queries: [query] }) }),
});

/** The search result's cap before it enters the model's context (ADR 0080 §7.4). */
export const SEARCH_RESULT_MAX_CHARACTERS = 25_000;
/** The search service's deadline, as the opencode client sets it. */
export const SEARCH_SERVICE_TIMEOUT_MS = 25_000;
/** The raw response bytes a search answer may take before the read refuses; far above any 25,000-character result. */
export const SEARCH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

export class SearchServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SearchServiceError';
  }
}

/** The one request a `websearch` call becomes, without sending it. */
export function searchServiceRequest(rule: PlatformToolsRule, query: string): { url: string; headers: Record<string, string>; body: string } {
  const protocol = SEARCH_SERVICE_PROTOCOLS[rule.websearch.service];
  const declared = anonymousSearchInterface(rule.websearch.service);
  if (protocol === undefined || declared === null) throw new SearchServiceError('SEARCH_SERVICE_UNKNOWN', '处理规则命名的搜索服务没有已实现的协议。');
  if (rule.websearch.anonymous !== true) throw new SearchServiceError('SEARCH_SERVICE_CREDENTIAL_REQUIRED', '只实现匿名搜索服务。');
  return {
    url: `https://${rule.websearch.host}${new URL(declared.endpoint).pathname}`,
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: rule.websearch.tool, arguments: protocol.argumentsOf(query) },
    }),
  };
}

/** The JSON-RPC message a body carries: the body itself, or the first `data:` event with a result or an error. */
function jsonRpcMessageOf(contentType: string | null, body: string): unknown {
  if (contentType !== null && contentType.toLowerCase().includes('text/event-stream')) {
    for (const event of body.split(/\r?\n\r?\n/u)) {
      const data = event.split(/\r?\n/u).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /u, '')).join('\n');
      if (data.length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(data);
        if (isRecord(parsed) && (parsed['result'] !== undefined || parsed['error'] !== undefined)) return parsed;
      } catch {
        continue;
      }
    }
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

/** Cut a text at a number of code points, never inside a surrogate pair. */
export function capCharacters(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join('');
}

/**
 * The first text content block of a JSON-RPC `tools/call` answer, capped at 25,000 characters, or `null` when the answer
 * is an error, a tool error, or carries no text.
 */
export function readSearchServiceAnswer(contentType: string | null, body: string): string | null {
  const message = jsonRpcMessageOf(contentType, body);
  if (!isRecord(message) || message['error'] !== undefined || !isRecord(message['result'])) return null;
  const result = message['result'];
  if (result['isError'] === true || !Array.isArray(result['content'])) return null;
  for (const block of result['content'] as unknown[]) {
    if (isRecord(block) && block['type'] === 'text' && typeof block['text'] === 'string') {
      return capCharacters(block['text'], SEARCH_RESULT_MAX_CHARACTERS);
    }
  }
  return null;
}

export interface SearchCallOutcome {
  readonly url: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly bytes: Uint8Array;
  /** The answer text for the model, or `null` when the service answered with no usable text. */
  readonly text: string | null;
}

/** One search call whose ticket was redeemed: the only thing `sendSearchCall` sends. */
export type AuthorizedSearchCall =
  | { readonly request: { url: string; headers: Record<string, string>; body: string }; readonly ticket?: undefined }
  | { readonly ticket: SearchServiceTicket; readonly query: string; readonly request?: undefined };

const authorizedSearchCalls = new WeakSet<AuthorizedSearchCall>();

function ticketRefused(): SearchServiceError {
  return new SearchServiceError('PLATFORM_TOOL_TICKET_REFUSED', '没有本次搜索的 call-search-service 决定；未发送任何内容。');
}

/**
 * Redeem one `websearch` call's ticket through the gate (#676). The ticket must be for exactly this query's canonical-argument
 * digest and must redeem from the gate's own book while its binding is current; the rule the request is built from is the
 * one the gate returns for that binding — never one the caller hands in — and the request must address exactly the
 * ticket's host. A ticket that does not redeem refuses the call before anything is claimed or sent.
 */
export function authorizeSearchCall(input: {
  readonly ticket: SearchServiceTicket;
  readonly book: EgressTicketBook;
  readonly arguments: Extract<PlatformToolArguments, { tool: 'websearch' }>;
}): AuthorizedSearchCall {
  const { ticket } = input;
  if (ticket.argumentsDigest !== toolArgumentsDigest(input.arguments)) throw ticketRefused();
  const rule = redeemEgressTicket(input.book, ticket);
  if (rule === null) throw ticketRefused();
  if (ticket.backend !== undefined) {
    const adapter = searchBackend(ticket.backend.backendId);
    if (adapter.declaration.host !== ticket.host || adapter.declaration.endpoint !== ticket.backend.endpoint) throw ticketRefused();
    const authorized = Object.freeze({ ticket, query: input.arguments.query });
    authorizedSearchCalls.add(authorized);
    return authorized;
  }
  if (!('service' in rule.websearch)) throw ticketRefused();
  const request = searchServiceRequest(rule as PlatformToolsRule, input.arguments.query);
  // The gate issues into a book only under the book's own rule, so this holds by construction; it is kept as the forwarder's
  // own statement that a ticket sends to exactly its host.
  if (new URL(request.url).hostname !== ticket.host) throw ticketRefused();
  const authorized = Object.freeze({ request });
  authorizedSearchCalls.add(authorized);
  return authorized;
}

/** Forward one `websearch` call: redeem its ticket, then send it once. */
export async function forwardSearchCall(input: {
  readonly ticket: SearchServiceTicket;
  readonly book: EgressTicketBook;
  readonly arguments: Extract<PlatformToolArguments, { tool: 'websearch' }>;
  readonly fetch: PlatformToolFetch;
  readonly signal?: AbortSignal;
}): Promise<SearchCallOutcome> {
  return sendSearchCall(authorizeSearchCall(input), input.fetch, input.signal);
}

/** Send one authorized search call, exactly once; an object `authorizeSearchCall` did not return sends nothing. */
export async function sendSearchCall(authorized: AuthorizedSearchCall, fetch: PlatformToolFetch, signal?: AbortSignal,
  credentialed?: { readonly broker: CredentialBroker; readonly admitHost: TicketHostAdmission; readonly modelRole: 'Main Editorial Role' | 'Fast Interaction Role' },
): Promise<SearchCallOutcome> {
  if (!authorizedSearchCalls.delete(authorized)) throw ticketRefused();
  if (authorized.ticket !== undefined) {
    const { ticket, query } = authorized;
    const backend = ticket.backend!;
    if (credentialed === undefined) throw new SearchServiceError('SEARCH_SERVICE_CREDENTIAL_REQUIRED', '联网检索需要本后端的受保护凭据。');
    return credentialed.broker.releaseTo({ bindingDigest: ticket.bindingDigest, modelRole: credentialed.modelRole,
      slot: backend.credentialSlot, credentialReference: backend.credentialReference }, ticket, async (credential) => {
      const adapter = searchBackend(backend.backendId);
      const request = adapter.request(query, { credential, count: 10 });
      if (new URL(request.url).hostname !== ticket.host) throw ticketRefused();
      const deadline = deadlineSignal(SEARCH_SERVICE_TIMEOUT_MS, signal);
      let release: (() => void) | undefined;
      try {
        release = credentialed.admitHost({ host: ticket.host, port: 443, ticketId: ticket.ticketId });
        const response = await fetch(request.url, { method: request.method, headers: { ...request.headers },
          ...(request.body === null ? {} : { body: request.body }), signal: deadline.signal, redirect: 'manual' });
        const contentType = response.headers.get('content-type');
        const bytes = await readBoundedBody(response, SEARCH_RESPONSE_MAX_BYTES);
        const results = adapter.readResults(response.status, contentType, new TextDecoder().decode(bytes));
        const text = results === null ? null : capCharacters(JSON.stringify(results), SEARCH_RESULT_MAX_CHARACTERS);
        return { url: adapter.declaration.endpoint!, status: response.status, contentType, bytes, text };
      } finally { deadline.dispose(); release?.(); }
    });
  }
  const { request } = authorized;
  const input = { fetch, signal };
  const deadline = deadlineSignal(SEARCH_SERVICE_TIMEOUT_MS, input.signal);
  try {
    const response = await input.fetch(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: deadline.signal, redirect: 'manual' });
    const contentType = response.headers.get('content-type');
    const bytes = await readBoundedBody(response, SEARCH_RESPONSE_MAX_BYTES);
    const text = response.status === 200 ? readSearchServiceAnswer(contentType, new TextDecoder('utf-8').decode(bytes)) : null;
    return { url: request.url, status: response.status, contentType, bytes, text };
  } catch (error) {
    if (error instanceof PlatformToolHttpError) throw new SearchServiceError(error.code, error.message);
    throw error;
  } finally {
    deadline.dispose();
  }
}

/**
 * Why one search submission failed, as a closed class (Issue #1181): a missing key, an authentication or account-balance
 * rejection, a rate limit, a server error, any other rejection, an answer AI7 cannot read, a refusal before sending, or a
 * transport that did not complete. Classes come from the HTTP status or AI7's own error code — never from a provider's body.
 */
export type SearchFailureClass = 'credential-missing' | 'auth' | 'quota' | 'rate' | 'server' | 'rejected' | 'malformed' | 'refused' | 'transport';

export function searchFailureClass(failure: { readonly status: number } | { readonly code: string }): SearchFailureClass {
  if ('status' in failure) {
    const { status } = failure;
    return status === 200 ? 'malformed' : status === 401 || status === 403 ? 'auth' : status === 402 ? 'quota' : status === 429 ? 'rate'
      : status >= 500 && status <= 599 ? 'server' : 'rejected';
  }
  if (failure.code === 'SEARCH_SERVICE_CREDENTIAL_REQUIRED' || failure.code === 'CREDENTIAL_MISSING' || failure.code === 'SEARCH_CREDENTIAL_MISSING') return 'credential-missing';
  if (failure.code === 'PLATFORM_TOOL_BODY_TOO_LARGE') return 'malformed';
  return failure.code === 'PLATFORM_TOOL_TIMEOUT' || failure.code === 'PLATFORM_TOOL_FAILED' || failure.code.startsWith('TRANSPORT_') ? 'transport' : 'refused';
}

/** The settings path's only query; it contains no Book or manuscript input. */
export const SEARCH_BACKEND_PROBE_QUERY = 'UNESCO World Book and Copyright Day April 23';

export async function probeSearchBackend(input: {
  readonly binding: import('./egress-gate.js').EgressBindingFacts;
  readonly broker: CredentialBroker;
  readonly fetch: PlatformToolFetch;
  readonly admitHost: TicketHostAdmission;
}): Promise<import('../../shared/protocol.js').SearchBackendProbeProjection> {
  const backendId = input.binding.searchBackend!.backendId;
  const started = Date.now();
  try {
    const scope = { currentBindingDigest: () => input.binding.bindingDigest, acceptedOutputDigests: new Set<string>(), ceilingState: () => 'within' as const };
    const book = EgressTicketBook.open(input.binding, scope);
    const args = { tool: 'websearch' as const, query: SEARCH_BACKEND_PROBE_QUERY };
    const decision = evaluateSearchServiceCall({ arguments: args }, input.binding, scope, book);
    if (decision.decision !== 'call-search-service') throw new SearchServiceError('SEARCH_PROBE_NOT_ADMITTED', decision.detail);
    const authorized = authorizeSearchCall({ ticket: decision.ticket, book, arguments: args });
    const outcome = await sendSearchCall(authorized, input.fetch, undefined, { broker: input.broker, admitHost: input.admitHost, modelRole: 'Main Editorial Role' });
    const hits = searchBackend(backendId).readResults(outcome.status, outcome.contentType, new TextDecoder().decode(outcome.bytes));
    return { backendId, reachable: outcome.status === 200 && hits !== null, latencyMs: Date.now() - started, resultCount: hits?.length ?? 0,
      results: (hits ?? []).slice(0, 3).map((hit) => ({ title: capCharacters(hit.title.replace(/[\r\n]/gu, ' '), 120), url: hit.url.length <= 2048 ? hit.url : '' })).filter((hit) => hit.url !== ''),
      failure: outcome.status === 200 && hits !== null ? null : `HTTP ${outcome.status}` };
  } catch (error) {
    return { backendId, reachable: false, latencyMs: Date.now() - started, resultCount: 0, results: [],
      failure: error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'SEARCH_PROBE_FAILED' };
  }
}

/** Consume a launch-verified projection; the registry supplies the endpoint only after id, host and slot match. */
export function platformToolsFromProjection(rule: unknown): import('./egress-gate.js').RuntimePlatformToolsRule | null {
  if (!isRecord(rule) || rule['webSearchToolAllowed'] !== true || !isRecord(rule['platformTools'])) return null;
  const block = rule['platformTools'];
  const search = block['websearch']; const page = block['webfetch']; const breaker = block['breaker'];
  if (!isRecord(search) || search['selection'] !== 'user-configured' || !Array.isArray(search['backends']) ||
      !isRecord(page) || page['maxBytes'] !== 5_242_880 || page['timeoutSeconds'] !== 30 || page['boundedByCitations'] !== true ||
      !isRecord(breaker) || breaker['roundTrips'] !== 128 || breaker['end'] !== '联网核查未完成') return null;
  for (const entry of search['backends'] as unknown[]) {
    if (!isRecord(entry) || typeof entry['id'] !== 'string') return null;
    try {
      const declared = searchBackend(entry['id']).declaration;
      if (entry['host'] !== declared.host || entry['credentialSlot'] !== declared.credentialSlot) return null;
    } catch { return null; }
  }
  if (search['backends'].length !== 5 || new Set(search['backends'].map((entry: { id: string }) => entry.id)).size !== 5) return null;
  return { websearch: { selection: 'user-configured', backends: search['backends'] as Array<{ id: string; host: string; credentialSlot: string }> },
    webfetch: { maxBytes: 5_242_880, timeoutSeconds: 30, boundedByCitations: true } };
}

/** Titles keep printable text on one line, cut at the policy's code-point bound before they are exposed. */
function boundedProbeTitle(title: string, max: number): string {
  return capCharacters(title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, ' ').trim(), max);
}

/**
 * Send one candidate connection test (Issue #1055) under a redeemed `call-search-candidate-probe` ticket: the broker releases
 * the frozen reference only to this one request, built from the ticket alone — never a caller's query, URL, body or key —
 * with the search service's deadline, body bound and manual redirects, no retry and no fallback. Every exit withdraws the
 * ticket and releases the host. The outcome is sanitized; at most three bounded titles and public URLs are returned and
 * nothing is stored.
 */
export async function probeSearchCandidate(input: {
  readonly ticket: SearchCandidateProbeTicket;
  readonly policy: SearchConnectionTestPolicy;
  readonly broker: CredentialBroker;
  readonly fetch: PlatformToolFetch;
  readonly admitHost: TicketHostAdmission;
  readonly isCurrent: () => boolean;
}): Promise<SearchBackendProbeProjection> {
  const { ticket, policy } = input;
  const started = Date.now();
  const qualified = (outcome: SearchCandidateProbeOutcome, httpStatus: number | null,
    results: ReadonlyArray<{ title: string; url: string }> = [], resultCount = 0): SearchBackendProbeProjection => ({
    backendId: ticket.backendId, reachable: outcome === 'succeeded' || outcome === 'succeeded-empty', latencyMs: Date.now() - started, resultCount, results,
    failure: outcome === 'succeeded' || outcome === 'succeeded-empty' ? null : httpStatus === null ? outcome : `HTTP ${httpStatus}`,
    candidate: { candidateId: ticket.candidateId as SearchCandidateId, endpoint: ticket.endpoint, protocol: ticket.protocol,
      configurationDigest: ticket.configurationDigest, outcome, httpStatus },
  });
  try {
    if (!redeemSearchCandidateProbe(ticket)) throw new SearchServiceError('PLATFORM_TOOL_TICKET_REFUSED', '没有本次连接测试的决定；未发送任何内容。');
    const candidate = searchBackendCandidate(ticket.backendId, ticket.candidateId);
    return await input.broker.releaseTo({ bindingDigest: ticket.bindingDigest, modelRole: 'Main Editorial Role', slot: ticket.credentialSlot,
      credentialReference: ticket.credentialReference, isCurrent: input.isCurrent }, ticket, async (credential) => {
      const request = deepseekDirectSearchRequest(candidate, ticket.arguments, credential);
      if (request.url !== ticket.endpoint || new URL(request.url).hostname !== ticket.host) throw new SearchServiceError('PLATFORM_TOOL_TICKET_REFUSED', '连接测试的请求不是票据所冻结的请求；未发送。');
      const deadline = deadlineSignal(policy.timeoutMilliseconds);
      let release: (() => void) | undefined;
      let status: number | null = null;
      try {
        release = input.admitHost({ host: ticket.host, port: 443, ticketId: ticket.ticketId });
        const response = await input.fetch(request.url, { method: 'POST', headers: { ...request.headers }, body: request.body!, signal: deadline.signal, redirect: 'manual' });
        status = response.status;
        const bytes = await readBoundedBody(response, policy.responseMaxBytes);
        if (status !== 200) return qualified('http-rejected', status);
        const hits = readDeepseekDirectSearch(new TextDecoder().decode(bytes));
        if (hits === null) return qualified('malformed-response', status);
        const results = hits.slice(0, policy.resultsMaximum).map((hit) => ({ title: boundedProbeTitle(hit.title, policy.titleMaximumCharacters), url: hit.url }))
          .filter((hit) => hit.url.length <= policy.urlMaximumCharacters && /^https?:\/\//u.test(hit.url));
        return qualified(hits.length === 0 ? 'succeeded-empty' : 'succeeded', status, results, hits.length);
      } catch (error) {
        if (error instanceof SearchServiceError) throw error;
        // An answer past the body bound is not the documented shape; a deadline is an interruption; anything else is unknown.
        if (error instanceof PlatformToolHttpError && error.code === 'PLATFORM_TOOL_BODY_TOO_LARGE') return qualified('malformed-response', status);
        return qualified(deadline.signal.aborted ? 'transport-interrupted' : 'transport-unknown', status);
      } finally { deadline.dispose(); release?.(); }
    });
  } finally { releaseSearchCandidateProbe(ticket); }
}

export class SearchCandidateProbeRefusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SearchCandidateProbeRefusal';
  }
}

/**
 * The candidate connection test as the service composes it (Issue #1055): the closed candidate or a refusal, then the gate's
 * decision — scope first, so development-ci, fixture-recording and developer-live read no connection, resolve no secret and
 * send nothing — then the one ticketed request. A refusal or a failure before the send is a `SearchCandidateProbeRefusal`.
 */
export async function composeSearchCandidateProbe(input: {
  readonly backendId: string;
  readonly candidateId: string;
  readonly operationalScope: string | null;
  readonly launchPolicy: import('../../shared/protocol.js').LaunchPolicyProjection;
  readonly connection: (backendId: string) => { readonly credentialReference: string | null; readonly credentialOperationState: string } | undefined;
  readonly broker: CredentialBroker;
  readonly fetch: PlatformToolFetch;
  readonly admitHost: TicketHostAdmission;
}): Promise<SearchBackendProbeProjection> {
  let candidate: import('./search-backends.js').SearchBackendCandidate;
  try { candidate = searchBackendCandidate(input.backendId, input.candidateId); } catch { throw new SearchCandidateProbeRefusal('SEARCH_CANDIDATE_UNKNOWN', '没有这一联网检索候选接口；未发送任何内容。'); }
  const policy = input.launchPolicy.providerProcessing.searchConnectionTest;
  const decision = evaluateSearchCandidateProbe({ operationalScope: input.operationalScope, providerProcessingVersion: input.launchPolicy.providerProcessing.version, policy,
    configurationDigest: searchBackendCandidateConfigurationDigest(candidate.backendId, candidate.candidateId), connection: () => input.connection(candidate.backendId),
    candidate: { ...candidate.search, backendId: candidate.backendId, candidateId: candidate.candidateId, credentialSlot: candidate.credentialSlot, arguments: candidate.search.probeArguments },
    developmentReference: (reference) => DEVELOPMENT_CREDENTIAL_REFERENCES.has(reference.toLowerCase()) });
  if (decision.decision === 'refuse') throw new SearchCandidateProbeRefusal(decision.code, decision.detail);
  const { ticket } = decision;
  try {
    return await probeSearchCandidate({ ticket, policy: policy!, broker: input.broker, fetch: input.fetch, admitHost: input.admitHost,
      // Removing or replacing the key between the click and the read retargets nothing: the frozen reference must still be the ready one.
      isCurrent: () => { const now = input.connection(candidate.backendId); return now?.credentialOperationState === 'ready' && now.credentialReference === ticket.credentialReference; } });
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'SEARCH_CANDIDATE_PROBE_FAILED';
    throw new SearchCandidateProbeRefusal(code === 'CREDENTIAL_MISSING' ? 'SEARCH_CREDENTIAL_MISSING' : code, '连接测试未完成：凭据未释放或请求未发送；请检查本页保存的密钥后重试。');
  }
}
