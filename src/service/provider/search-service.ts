import { isRecord } from '../analysis/canonical.js';
import type { EgressTicketBook, SearchServiceTicket } from './egress-gate.js';
import { toolArgumentsDigest, type PlatformToolArguments, type PlatformToolsRule } from './platform-tools.js';
import { PlatformToolHttpError, deadlineSignal, readBoundedBody, type PlatformToolFetch } from './platform-tool-http.js';

/**
 * The `websearch` forwarder (ADR 0080 §7.1, §7.2; Issue #473 S87-f3a). The model emits the call; AI7 composes no query of
 * its own and forwards exactly that one as one JSON-RPC `tools/call` to the search service the binding's rule names, the
 * way the opencode client does (ADR 0080 §3): HTTP POST, `Accept: application/json, text/event-stream`, the first text
 * content block back, 25 seconds, no retry. The host, the service, and the service's tool name are the rule's; the rule
 * declares the service anonymous, so no credential exists to send. Nothing is sent without a redeemed
 * `call-search-service` ticket for exactly this host and this query.
 */

/** How AI7 speaks to one named search service: the MCP path on the rule's host, and the arguments its tool takes. */
interface SearchServiceProtocol {
  readonly path: string;
  argumentsOf(query: string): Record<string, unknown>;
}

/**
 * The wire contract of each search service a rule may name, keyed by the rule's `service`. This is how a service is
 * spoken to, not which one is used: the host and the tool name stay the rule's, and a service the table does not know is
 * a refusal. Parallel's Search MCP (docs.parallel.ai/integrations/mcp/search-mcp, read 2026-09-11) takes an `objective`
 * and `search_queries[]`.
 */
const SEARCH_SERVICE_PROTOCOLS: Readonly<Record<string, SearchServiceProtocol>> = Object.freeze({
  parallel: Object.freeze({ path: '/mcp', argumentsOf: (query: string) => ({ objective: query, search_queries: [query] }) }),
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
  if (protocol === undefined) throw new SearchServiceError('SEARCH_SERVICE_UNKNOWN', '处理规则命名的搜索服务没有已实现的协议。');
  if (rule.websearch.anonymous !== true) throw new SearchServiceError('SEARCH_SERVICE_CREDENTIAL_REQUIRED', '只实现匿名搜索服务。');
  return {
    url: `https://${rule.websearch.host}${protocol.path}`,
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
export interface AuthorizedSearchCall {
  readonly request: { url: string; headers: Record<string, string>; body: string };
}

const authorizedSearchCalls = new WeakSet<AuthorizedSearchCall>();

/**
 * Redeem one `websearch` call's ticket. The ticket must be for exactly the rule's host and exactly this query's
 * canonical-argument digest; a ticket that does not redeem refuses the call before anything is claimed or sent.
 */
export function authorizeSearchCall(input: {
  readonly ticket: SearchServiceTicket;
  readonly book: EgressTicketBook;
  readonly rule: PlatformToolsRule;
  readonly arguments: Extract<PlatformToolArguments, { tool: 'websearch' }>;
}): AuthorizedSearchCall {
  const { ticket, rule } = input;
  if (ticket.host !== rule.websearch.host || ticket.argumentsDigest !== toolArgumentsDigest(input.arguments) || !input.book.redeem(ticket)) {
    throw new SearchServiceError('PLATFORM_TOOL_TICKET_REFUSED', '没有本次搜索的 call-search-service 决定；未发送任何内容。');
  }
  const authorized = Object.freeze({ request: searchServiceRequest(rule, input.arguments.query) });
  authorizedSearchCalls.add(authorized);
  return authorized;
}

/** Forward one `websearch` call: redeem its ticket, then send it once. */
export async function forwardSearchCall(input: {
  readonly ticket: SearchServiceTicket;
  readonly book: EgressTicketBook;
  readonly rule: PlatformToolsRule;
  readonly arguments: Extract<PlatformToolArguments, { tool: 'websearch' }>;
  readonly fetch: PlatformToolFetch;
  readonly signal?: AbortSignal;
}): Promise<SearchCallOutcome> {
  return sendSearchCall(authorizeSearchCall(input), input.fetch, input.signal);
}

/** Send one authorized search call, exactly once; an object `authorizeSearchCall` did not return sends nothing. */
export async function sendSearchCall(authorized: AuthorizedSearchCall, fetch: PlatformToolFetch, signal?: AbortSignal): Promise<SearchCallOutcome> {
  if (!authorizedSearchCalls.delete(authorized)) {
    throw new SearchServiceError('PLATFORM_TOOL_TICKET_REFUSED', '没有本次搜索的 call-search-service 决定；未发送任何内容。');
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
