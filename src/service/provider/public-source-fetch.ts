import { redeemEgressTicket, type EgressTicketBook, type PublicSourceTicket } from './egress-gate.js';
import { capText, htmlToMarkdown } from './html-to-markdown.js';
import { toolArgumentsDigest, type PlatformToolsRule } from './platform-tools.js';
import { PlatformToolHttpError, deadlineSignal, readBoundedBody, type PlatformToolFetch } from './platform-tool-http.js';

/**
 * The `webfetch` owner (ADR 0080 §7.1, Issue #473 S87-f3a) — the one implementation the External Evidence Retention
 * Procedure will share (SRC-013, ADR 0079 §4.3, S70): one HTTP GET of one cited public page, bounded by the rule's byte cap
 * (5 MiB) and deadline (30 s), its charset taken from the response — the header, else the document's own declaration —
 * and HTML converted to Markdown. A redirect is not followed, because its target would need a ticket of its own; a failed
 * fetch is the model's to move past to its next citation, never a retry. Nothing is sent without a redeemed
 * `fetch-public-source` ticket, and the page's host is reachable only while that one ticket holds it open.
 */

export const WEBFETCH_USER_AGENT = 'AI7-Harness/1.0 (webfetch)';
/**
 * The characters of a fetched page's text that enter the model's context (the re-review of #671): the bound ADR 0080 §7.4
 * sets for a search result before it enters the context, applied to the page after conversion. The 5 MiB cap bounds the
 * bytes before conversion; this bounds what the model reads, and a cut text ends with an explicit truncation marker. The
 * page's bytes are kept whole in the Research Snapshot Cache, so retention (S70) never reads the cut text.
 */
export const WEBFETCH_TEXT_MAX_CHARACTERS = 25_000;

export class PublicSourceFetchError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PublicSourceFetchError';
  }
}

export interface PublicSourceOutcome {
  readonly url: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly charset: string;
  readonly bytes: Uint8Array;
  /** The page as Markdown (or its text), or `null` when nothing readable came back. */
  readonly text: string | null;
  readonly failure: null | 'redirect' | 'status' | 'unsupported-content-type';
}

/** The charset a response declares: the `Content-Type` parameter, else a `<meta>` declaration in the first 4 KiB, else UTF-8. */
export function declaredCharset(contentType: string | null, bytes: Uint8Array): string {
  const fromHeader = contentType === null ? null : /charset\s*=\s*"?([A-Za-z0-9._:-]+)"?/iu.exec(contentType)?.[1] ?? null;
  if (fromHeader !== null) return fromHeader.toLowerCase();
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([A-Za-z0-9._:-]+)/iu.exec(head)?.[1] ?? null;
  return fromMeta === null ? 'utf-8' : fromMeta.toLowerCase();
}

/** Decode bytes in the declared charset; a label the runtime does not know falls back to UTF-8 rather than failing. */
export function decodeInCharset(bytes: Uint8Array, charset: string): { text: string; charset: string } {
  try {
    return { text: new TextDecoder(charset).decode(bytes), charset };
  } catch {
    return { text: new TextDecoder('utf-8').decode(bytes), charset: 'utf-8' };
  }
}

function mediaTypeOf(contentType: string | null, text: string): 'html' | 'text' | null {
  const type = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'html';
  if (type === 'text/plain' || type === 'text/markdown') return 'text';
  if (type === '' && /^\s*</u.test(text)) return 'html';
  return null;
}

/**
 * Per-ticket host admission (`admitTicketHost` of the network denial): open one host for the one fetch one ticket
 * authorizes, keyed by that ticket's id, and return the release that closes it and every socket opened under it (#676).
 */
export type TicketHostAdmission = (target: { readonly host: string; readonly port: number; readonly ticketId: string }) => () => void;

/** One fetch whose ticket was redeemed: the only thing `sendPublicFetch` sends. */
export interface AuthorizedPublicFetch {
  readonly ticketId: string;
  readonly url: string;
  readonly host: string;
  readonly rule: PlatformToolsRule;
}

const authorizedFetches = new WeakSet<AuthorizedPublicFetch>();

function ticketRefused(): PublicSourceFetchError {
  return new PublicSourceFetchError('PLATFORM_TOOL_TICKET_REFUSED', '没有本次取回的 fetch-public-source 决定；未发送任何内容。');
}

/**
 * Redeem one `webfetch` call's ticket through the gate (#676): the URL's host and canonical-argument digest must be the
 * ticket's, and the ticket must redeem from the gate's own book while its binding is current. The byte cap and deadline
 * are the rule the gate returns for that binding, never one the caller hands in. A ticket that does not redeem refuses the
 * call before anything is claimed, opened, or sent.
 */
export function authorizePublicFetch(input: { readonly ticket: PublicSourceTicket; readonly book: EgressTicketBook }): AuthorizedPublicFetch {
  const { ticket } = input;
  let host: string | null = null;
  try {
    host = new URL(ticket.url).hostname;
  } catch {
    host = null;
  }
  if (host === null || host !== ticket.host || ticket.argumentsDigest !== toolArgumentsDigest({ tool: 'webfetch', url: ticket.url })) throw ticketRefused();
  const rule = redeemEgressTicket(input.book, ticket);
  if (rule === null) throw ticketRefused();
  const authorized = Object.freeze({ ticketId: ticket.ticketId, url: ticket.url, host: ticket.host, rule });
  authorizedFetches.add(authorized);
  return authorized;
}

/** Fetch one cited public page under one redeemed ticket. */
export async function fetchPublicSource(input: {
  readonly ticket: PublicSourceTicket;
  readonly book: EgressTicketBook;
  readonly fetch: PlatformToolFetch;
  readonly admitHost: TicketHostAdmission;
  readonly signal?: AbortSignal;
}): Promise<PublicSourceOutcome> {
  return sendPublicFetch(authorizePublicFetch(input), input);
}

/**
 * Send one authorized fetch, exactly once; an object `authorizePublicFetch` did not return sends nothing and opens nothing.
 * The page's host is open only under this ticket's own admission, which the release closes — with every socket the fetch
 * opened, so no pooled connection outlives it — however the fetch ends.
 */
export async function sendPublicFetch(authorized: AuthorizedPublicFetch, input: {
  readonly fetch: PlatformToolFetch;
  readonly admitHost: TicketHostAdmission;
  readonly signal?: AbortSignal;
}): Promise<PublicSourceOutcome> {
  if (!authorizedFetches.delete(authorized)) throw ticketRefused();
  const { rule } = authorized;
  const ticket = authorized;
  const deadline = deadlineSignal(rule.webfetch.timeoutSeconds * 1000, input.signal);
  // The host is admitted as the first statement inside the try that releases it (Issue #728): nothing between the hold's
  // opening and its release can throw past the release, whatever `deadlineSignal` or a later line comes to do.
  let release: (() => void) | undefined;
  try {
    release = input.admitHost({ host: ticket.host, port: 443, ticketId: ticket.ticketId });
    const response = await input.fetch(ticket.url, {
      method: 'GET',
      headers: { accept: 'text/html, application/xhtml+xml, text/plain;q=0.9, text/markdown;q=0.9', 'user-agent': WEBFETCH_USER_AGENT },
      signal: deadline.signal,
      redirect: 'manual',
    });
    const contentType = response.headers.get('content-type');
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      return { url: ticket.url, status: response.status, contentType, charset: 'utf-8', bytes: new Uint8Array(0), text: null, failure: 'redirect' };
    }
    const bytes = await readBoundedBody(response, rule.webfetch.maxBytes);
    const decoded = decodeInCharset(bytes, declaredCharset(contentType, bytes));
    if (response.status !== 200) {
      return { url: ticket.url, status: response.status, contentType, charset: decoded.charset, bytes, text: null, failure: 'status' };
    }
    const media = mediaTypeOf(contentType, decoded.text);
    if (media === null) {
      return { url: ticket.url, status: response.status, contentType, charset: decoded.charset, bytes, text: null, failure: 'unsupported-content-type' };
    }
    const text = media === 'html'
      ? htmlToMarkdown(decoded.text, ticket.url, { maxCharacters: WEBFETCH_TEXT_MAX_CHARACTERS })
      : capText(decoded.text, WEBFETCH_TEXT_MAX_CHARACTERS);
    return { url: ticket.url, status: response.status, contentType, charset: decoded.charset, bytes, text, failure: null };
  } catch (error) {
    if (error instanceof PlatformToolHttpError) throw new PublicSourceFetchError(error.code, error.message);
    throw error;
  } finally {
    deadline.dispose();
    release?.();
  }
}
