import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EgressTicketBook,
  OPENCODE_GO_MODEL,
  OPENCODE_GO_ROUTE,
  evaluatePublicSourceFetch,
  evaluateSearchServiceCall,
  type EgressBindingFacts,
  type PublicSourceTicket,
  type SearchServiceTicket,
} from '../../src/service/provider/egress-gate.js';
import { LIST_INDENT_MAX_DEPTH, TRUNCATION_MARKER, capText, decodeEntities, htmlToMarkdown } from '../../src/service/provider/html-to-markdown.js';
import { canonicalToolArguments, readPlatformToolsRule, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';
import type { PlatformToolFetch, PlatformToolHttpInit } from '../../src/service/provider/platform-tool-http.js';
import { WEBFETCH_TEXT_MAX_CHARACTERS, authorizePublicFetch, declaredCharset, fetchPublicSource, sendPublicFetch } from '../../src/service/provider/public-source-fetch.js';
import {
  SEARCH_RESULT_MAX_CHARACTERS,
  SEARCH_SERVICE_TIMEOUT_MS,
  authorizeSearchCall,
  capCharacters,
  forwardSearchCall,
  readSearchServiceAnswer,
  searchServiceRequest,
  sendSearchCall,
} from '../../src/service/provider/search-service.js';

// The two platform-tool owners (ADR 0080 §7.1; Issue #473, S87-f3a) over stub transports only: no socket, no search
// service, no page. Each forwarder sends nothing without a redeemed single-use ticket, and every identifier of the search
// service comes from the rule's bytes — here, v7's, which no active set selects.

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const CITED = 'https://example.org/source';

async function v7Rule(): Promise<PlatformToolsRule> {
  const document = JSON.parse(await readFile(resolve(REPO_ROOT, 'docs/policies/provider-processing-policy.v7.json'), 'utf8')) as {
    decision: { providerAllowRules: unknown[] };
  };
  return readPlatformToolsRule(document.decision.providerAllowRules[0])!;
}

function binding(rule: PlatformToolsRule): EgressBindingFacts {
  return {
    bindingDigest: 'c'.repeat(64),
    route: OPENCODE_GO_ROUTE,
    model: OPENCODE_GO_MODEL,
    systemPrompt: '合成系统提示。',
    outboundDataCategory: 'public-or-synthetic',
    policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v8', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    admittedUserMessages: new Set(),
    platformTools: rule,
  };
}

const scope = {
  currentBindingDigest: () => 'c'.repeat(64),
  acceptedOutputDigests: new Set<string>(),
  ceilingState: () => 'within' as const,
  citationAdmits: (url: string) => url === CITED,
};

interface StubCall {
  readonly url: string;
  readonly init: PlatformToolHttpInit;
}

function stub(respond: (url: string) => Response, calls: StubCall[]): PlatformToolFetch {
  return async (url, init) => {
    calls.push({ url, init });
    return respond(url);
  };
}

const SEARCH_ANSWER = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '结果：https://example.org/source 《狂人日记》1918 年。' }] } };
const websearch = canonicalToolArguments('websearch', { query: '狂人日记 发表 年份' }) as Extract<ReturnType<typeof canonicalToolArguments>, { tool: 'websearch' }>;
const webfetch = canonicalToolArguments('webfetch', { url: CITED }) as Extract<ReturnType<typeof canonicalToolArguments>, { tool: 'webfetch' }>;

describe('the websearch forwarder', () => {
  it('builds one anonymous JSON-RPC tools/call from the rule alone', async () => {
    const rule = await v7Rule();
    const request = searchServiceRequest(rule, '狂人日记');
    expect(request.url).toBe('https://search.parallel.ai/mcp');
    expect(request.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json, text/event-stream' });
    expect(JSON.parse(request.body)).toEqual({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'web_search', arguments: { objective: '狂人日记', search_queries: ['狂人日记'] } },
    });
    // The host and the tool name are the rule's: another rule's bytes move the request, no source literal does.
    const moved = searchServiceRequest({ ...rule, websearch: { ...rule.websearch, host: 'search.example.net', tool: 'other_search' } }, 'q');
    expect(moved.url).toBe('https://search.example.net/mcp');
    expect(JSON.parse(moved.body).params.name).toBe('other_search');
    expect(() => searchServiceRequest({ ...rule, websearch: { ...rule.websearch, service: 'exa' } }, 'q')).toThrowError(/协议/u);
  });

  it('reads the first text block of a JSON or event-stream answer, capped, and nothing from an error', () => {
    expect(readSearchServiceAnswer('application/json', JSON.stringify(SEARCH_ANSWER))).toBe(SEARCH_ANSWER.result.content[0]!.text);
    const sse = `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress' })}\n\nevent: message\ndata: ${JSON.stringify(SEARCH_ANSWER)}\n\n`;
    expect(readSearchServiceAnswer('text/event-stream; charset=utf-8', sse)).toBe(SEARCH_ANSWER.result.content[0]!.text);
    expect(readSearchServiceAnswer('application/json', JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'x' } }))).toBeNull();
    expect(readSearchServiceAnswer('application/json', JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'x' }] } }))).toBeNull();
    expect(readSearchServiceAnswer('application/json', 'not json')).toBeNull();
    const long = '字'.repeat(SEARCH_RESULT_MAX_CHARACTERS + 10);
    expect(readSearchServiceAnswer('application/json', JSON.stringify({ result: { content: [{ type: 'text', text: long }] } }))).toHaveLength(SEARCH_RESULT_MAX_CHARACTERS);
    expect(capCharacters('a😀b', 2)).toBe('a😀');
  });

  it('sends exactly once under a redeemed ticket, and nothing without one', async () => {
    const rule = await v7Rule();
    const book = EgressTicketBook.open(binding(rule), scope);
    const calls: StubCall[] = [];
    const fetch = stub(() => new Response(JSON.stringify(SEARCH_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }), calls);
    const decision = evaluateSearchServiceCall({ arguments: websearch }, binding(rule), scope, book);
    const ticket = (decision as { ticket: SearchServiceTicket }).ticket;
    // A ticket for another query, a copy of it, one from another book, or a book the gate did not open sends nothing.
    const other = canonicalToolArguments('websearch', { query: '别的查询' }) as typeof websearch;
    await expect(forwardSearchCall({ ticket, book, arguments: other, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    await expect(forwardSearchCall({ ticket: { ...ticket }, book, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    await expect(forwardSearchCall({ ticket, book: EgressTicketBook.open(binding(rule), scope), arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    const lookalike = { redeem: () => true, revoke: () => undefined, outstanding: 1 } as unknown as EgressTicketBook;
    await expect(forwardSearchCall({ ticket, book: lookalike, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
    const outcome = await forwardSearchCall({ ticket, book, arguments: websearch, fetch });
    expect(outcome).toMatchObject({ url: 'https://search.parallel.ai/mcp', status: 200, text: SEARCH_ANSWER.result.content[0]!.text });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(calls[0]!.init.headers).not.toHaveProperty('authorization');
    // The same ticket never sends twice.
    await expect(forwardSearchCall({ ticket, book, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(1);
  });
});

describe('the webfetch owner', () => {
  async function fetchWith(respond: (url: string) => Response, rule?: PlatformToolsRule): Promise<{ outcome: Awaited<ReturnType<typeof fetchPublicSource>>; admitted: string[]; released: number; calls: StubCall[] }> {
    const effective = rule ?? await v7Rule();
    const book = EgressTicketBook.open(binding(effective), scope);
    const decision = evaluatePublicSourceFetch({ arguments: webfetch }, binding(effective), scope, book) as { ticket: PublicSourceTicket };
    const admitted: string[] = [];
    let released = 0;
    const calls: StubCall[] = [];
    const outcome = await fetchPublicSource({
      ticket: decision.ticket, book, fetch: stub(respond, calls),
      admitHost: ({ host }) => { admitted.push(host); return () => { released += 1; }; },
    });
    return { outcome, admitted, released, calls };
  }

  it('fetches one cited page under one ticket, holding exactly its host open for the fetch', async () => {
    const html = '<html><head><title>t</title><script>evil()</script></head><body><h1>标题</h1><p>正文 &amp; <a href="/next">下一页</a></p></body></html>';
    const { outcome, admitted, released, calls } = await fetchWith(() => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
    expect(outcome).toMatchObject({ status: 200, failure: null, charset: 'utf-8', text: '# 标题\n\n正文 & [下一页](https://example.org/next)' });
    expect(admitted).toEqual(['example.org']);
    expect(released).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: CITED, init: { method: 'GET', redirect: 'manual' } });
  });

  it('reads the charset from the header, else from the document, and decodes it', async () => {
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]); // 中文 in GBK
    const { outcome } = await fetchWith(() => new Response(gbk, { status: 200, headers: { 'content-type': 'text/plain; charset=gbk' } }));
    expect(outcome).toMatchObject({ charset: 'gbk', text: '中文' });
    const meta = new Uint8Array([...new TextEncoder().encode('<meta charset="gbk"><p>'), ...gbk, ...new TextEncoder().encode('</p>')]);
    expect(declaredCharset('text/html', meta)).toBe('gbk');
    const { outcome: sniffed } = await fetchWith(() => new Response(meta, { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(sniffed.text).toBe('中文');
  });

  it('follows no redirect, reads no failure, and moves on — releasing the host every time', async () => {
    const redirect = await fetchWith(() => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } }));
    expect(redirect.outcome).toMatchObject({ status: 302, failure: 'redirect', text: null });
    expect(redirect.calls).toHaveLength(1);
    expect(redirect.released).toBe(1);
    const missing = await fetchWith(() => new Response('gone', { status: 404, headers: { 'content-type': 'text/plain' } }));
    expect(missing.outcome).toMatchObject({ status: 404, failure: 'status', text: null });
    const binary = await fetchWith(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/pdf' } }));
    expect(binary.outcome).toMatchObject({ failure: 'unsupported-content-type', text: null });
  });

  it('refuses a page past the rule\'s byte cap and sends nothing without a redeemable ticket', async () => {
    const rule = await v7Rule();
    const small = { ...rule, webfetch: { ...rule.webfetch, maxBytes: 8 } };
    const book = EgressTicketBook.open(binding(small), scope);
    const decision = evaluatePublicSourceFetch({ arguments: webfetch }, binding(small), scope, book) as { ticket: PublicSourceTicket };
    let released = 0;
    const calls: StubCall[] = [];
    const run = (): ReturnType<typeof fetchPublicSource> => fetchPublicSource({
      ticket: decision.ticket, book,
      fetch: stub(() => new Response('0123456789', { status: 200, headers: { 'content-type': 'text/plain' } }), calls),
      admitHost: () => () => { released += 1; },
    });
    await expect(run()).rejects.toMatchObject({ code: 'PLATFORM_TOOL_BODY_TOO_LARGE' });
    expect(released).toBe(1);
    // Redeemed once already: the second use sends nothing and opens no host.
    await expect(run()).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(1);
    expect(released).toBe(1);
  });
});

describe('authorized calls', () => {
  it('send once each, and nothing an authorization did not produce', async () => {
    const rule = await v7Rule();
    const book = EgressTicketBook.open(binding(rule), scope);
    const calls: StubCall[] = [];
    const fetch = stub(() => new Response(JSON.stringify(SEARCH_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }), calls);
    const search = evaluateSearchServiceCall({ arguments: websearch }, binding(rule), scope, book) as { ticket: SearchServiceTicket };
    const authorized = authorizeSearchCall({ ticket: search.ticket, book, arguments: websearch });
    await sendSearchCall(authorized, fetch);
    await expect(sendSearchCall(authorized, fetch)).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    await expect(sendSearchCall({ request: authorized.request }, fetch)).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(1);
    const page = evaluatePublicSourceFetch({ arguments: webfetch }, binding(rule), scope, book) as { ticket: PublicSourceTicket };
    const fetchAuthorized = authorizePublicFetch({ ticket: page.ticket, book });
    const opened: string[] = [];
    const send = { fetch: stub(() => new Response('x', { status: 200, headers: { 'content-type': 'text/plain' } }), calls), admitHost: ({ host }: { host: string }) => { opened.push(host); return () => undefined; } };
    await sendPublicFetch(fetchAuthorized, send);
    await expect(sendPublicFetch(fetchAuthorized, send)).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    await expect(sendPublicFetch({ ...fetchAuthorized }, send)).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(2);
    expect(opened).toEqual(['example.org']);
  });
});

describe('the forwarders\' bounds', () => {
  /** A transport that never answers, and rejects with the abort reason when its signal fires. */
  function hanging(seen: { aborted: boolean }): PlatformToolFetch {
    return (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        seen.aborted = true;
        reject(init.signal.reason as Error);
      }, { once: true });
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives a search 25 seconds and not one more', async () => {
    vi.useFakeTimers();
    const rule = await v7Rule();
    const book = EgressTicketBook.open(binding(rule), scope);
    const seen = { aborted: false };
    const decision = evaluateSearchServiceCall({ arguments: websearch }, binding(rule), scope, book);
    const pending = forwardSearchCall({ ticket: (decision as { ticket: SearchServiceTicket }).ticket, book, arguments: websearch, fetch: hanging(seen) });
    const settled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(SEARCH_SERVICE_TIMEOUT_MS - 1);
    expect(seen.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled).toMatchObject({ code: 'PLATFORM_TOOL_TIMEOUT' });
  });

  it('gives a fetch the rule\'s seconds and not one more, releasing its host', async () => {
    vi.useFakeTimers();
    const rule = await v7Rule();
    const book = EgressTicketBook.open(binding(rule), scope);
    const seen = { aborted: false };
    let released = 0;
    const decision = evaluatePublicSourceFetch({ arguments: webfetch }, binding(rule), scope, book) as { ticket: PublicSourceTicket };
    const settled = fetchPublicSource({ ticket: decision.ticket, book, fetch: hanging(seen), admitHost: () => () => { released += 1; } })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(rule.webfetch.timeoutSeconds * 1000 - 1);
    expect(seen.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled).toMatchObject({ code: 'PLATFORM_TOOL_TIMEOUT' });
    expect(released).toBe(1);
  });

  it('cancels an endless body the moment it passes the cap, pulling nothing after', async () => {
    const rule = await v7Rule();
    const small = { ...rule, webfetch: { ...rule.webfetch, maxBytes: 10 } };
    const book = EgressTicketBook.open(binding(small), scope);
    const decision = evaluatePublicSourceFetch({ arguments: webfetch }, binding(small), scope, book) as { ticket: PublicSourceTicket };
    let pulls = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(4));
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    await expect(fetchPublicSource({
      ticket: decision.ticket, book, admitHost: () => () => undefined,
      fetch: async () => new Response(endless, { status: 200, headers: { 'content-type': 'text/plain' } }),
    })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_BODY_TOO_LARGE' });
    expect(cancelled).toBe(true);
    // Three 4-byte chunks pass 10 bytes; at most the one read-ahead the stream machinery takes follows.
    expect(pulls).toBeLessThanOrEqual(4);
  });
});

describe('htmlToMarkdown on hostile markup', () => {
  // A quadratic scan converted 80 KB of `<a` in about a second, so a megabyte would take minutes; a linear one takes
  // milliseconds. The budget leaves room for a loaded guest and none for quadratic growth.
  const MEGABYTE = 1024 * 1024;
  const cases: Array<[string, string]> = [
    ['unclosed tags', '<a'.repeat(MEGABYTE / 2)],
    ['unclosed comments', '<!--'.repeat(MEGABYTE / 4)],
    ['unclosed declarations', '<!x'.repeat(MEGABYTE / 3)],
    ['stray angle brackets', '< '.repeat(MEGABYTE / 2)],
    ['one endless tag', `<a ${' '.repeat(MEGABYTE)}`],
    ['trailing blanks in pre', `<pre>${' '.repeat(MEGABYTE)}x</pre>`],
    ['closed tags', '<b>x</b>'.repeat(MEGABYTE / 8)],
  ];
  for (const [name, html] of cases) {
    it(`converts a megabyte of ${name} in linear time`, () => {
      const started = performance.now();
      htmlToMarkdown(html, 'https://example.org/');
      expect(performance.now() - started).toBeLessThan(2_000);
    });
  }

  it('indents nested lists at most eight levels, so the output stays linear in the input', () => {
    for (const depth of [1_000, 20_000, 80_000]) {
      const html = `${'<ul>'.repeat(depth)}${'<li>x'.repeat(depth)}`;
      const markdown = htmlToMarkdown(html);
      expect(markdown.length).toBeLessThanOrEqual(6 * html.length);
    }
    expect(htmlToMarkdown(`${'<ul>'.repeat(12)}<li>a<li>b`).split('\n')).toEqual(['- a', `${' '.repeat(2 * LIST_INDENT_MAX_DEPTH)}- b`]);
    expect(htmlToMarkdown('<ul><li>a<ul><li>b</ul></ul>').split('\n')).toEqual(['- a', '', '  - b']);
  });

  it('cuts a converted page at its character bound with an explicit marker, however the page amplifies', () => {
    const long = `<p>${'字'.repeat(40_000)}</p>`;
    const cut = htmlToMarkdown(long, null, { maxCharacters: 25_000 });
    expect(cut).toBe(`${'字'.repeat(25_000)}${TRUNCATION_MARKER}`);
    expect(htmlToMarkdown('<p>短</p>', null, { maxCharacters: 25_000 })).toBe('短');
    // A page built to amplify stops being read once its output passes the bound.
    const amplifying = `${'<ul>'.repeat(200_000)}${'<li>x'.repeat(200_000)}`;
    const started = performance.now();
    const bounded = htmlToMarkdown(amplifying, null, { maxCharacters: 25_000 });
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(bounded.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(bounded.length).toBeLessThanOrEqual(25_000 + TRUNCATION_MARKER.length);
    const listy = htmlToMarkdown(`<ul>${'<li>条目'.repeat(20_000)}`, null, { maxCharacters: 25_000 });
    expect(listy.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(listy.length).toBe(25_000 + TRUNCATION_MARKER.length);
    expect(capText('a😀b', 2)).toBe(`a😀${TRUNCATION_MARKER}`);
    expect(capText('ab', 2)).toBe('ab');
  });

  it('bounds the text a fetch hands the model at the search-result bound, keeping the page\'s bytes whole', async () => {
    const rule = await v7Rule();
    const book = EgressTicketBook.open(binding(rule), scope);
    const decision = evaluatePublicSourceFetch({ arguments: webfetch }, binding(rule), scope, book) as { ticket: PublicSourceTicket };
    const page = `<p>${'页'.repeat(WEBFETCH_TEXT_MAX_CHARACTERS + 5)}</p>`;
    const outcome = await fetchPublicSource({
      ticket: decision.ticket, book, admitHost: () => () => undefined,
      fetch: async () => new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    });
    expect(WEBFETCH_TEXT_MAX_CHARACTERS).toBe(SEARCH_RESULT_MAX_CHARACTERS);
    expect(outcome.text).toBe(`${'页'.repeat(WEBFETCH_TEXT_MAX_CHARACTERS)}${TRUNCATION_MARKER}`);
    expect(outcome.bytes.byteLength).toBe(Buffer.byteLength(page));
    // A plain-text page is held to the same bound.
    const plain = evaluatePublicSourceFetch({ arguments: webfetch }, binding(rule), scope, book) as { ticket: PublicSourceTicket };
    const text = await fetchPublicSource({
      ticket: plain.ticket, book, admitHost: () => () => undefined,
      fetch: async () => new Response('文'.repeat(WEBFETCH_TEXT_MAX_CHARACTERS + 1), { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }),
    });
    expect(text.text).toBe(`${'文'.repeat(WEBFETCH_TEXT_MAX_CHARACTERS)}${TRUNCATION_MARKER}`);
  });

  it('stops reading a page once its output passes the bound', () => {
    // Sixteen megabytes of markup after a first paragraph already past the bound: none of it is scanned.
    const page = `<p>${'字'.repeat(60_000)}</p>${'<b>x</b>'.repeat(2_000_000)}`;
    const started = performance.now();
    const text = htmlToMarkdown(page, null, { maxCharacters: 25_000 });
    expect(performance.now() - started).toBeLessThan(300);
    expect(text).toBe(`${'字'.repeat(25_000)}${TRUNCATION_MARKER}`);
  });

  it('keeps the text before an unclosed construct and drops what an unclosed comment hides', () => {
    expect(htmlToMarkdown('<p>正文</p><a')).toBe('正文\n\n<a');
    expect(htmlToMarkdown('<p>正文</p><!-- 未闭合 <p>隐藏</p>')).toBe('正文');
    expect(htmlToMarkdown('a < b and c > d')).toBe('a < b and c > d');
  });
});

describe('htmlToMarkdown', () => {
  it('keeps headings, paragraphs, lists, links, and emphasis, and drops scripts, styles, and comments', () => {
    const html = `<!doctype html><html><head><style>p{}</style></head><body>
      <!-- note --><nav><a href="https://example.org/">首页</a></nav>
      <h2>小节</h2><p>一 <strong>重点</strong> <em>强调</em>&nbsp;&#x4E2D;&#20013;</p>
      <ul><li>甲</li><li>乙</li></ul><ol><li>一</li><li>二</li></ol>
      <script>var x = '<p>不应出现</p>';</script><pre>  code
  block</pre><a href="javascript:alert(1)">坏链接</a></body></html>`;
    const markdown = htmlToMarkdown(html, 'https://example.org/page');
    expect(markdown).toContain('[首页](https://example.org/)');
    expect(markdown).toContain('## 小节');
    expect(markdown).toContain('一 **重点** *强调* 中中');
    expect(markdown).toContain('- 甲\n- 乙');
    expect(markdown).toContain('1. 一\n2. 二');
    expect(markdown).toContain('坏链接');
    expect(markdown).not.toContain('javascript:');
    expect(markdown).not.toContain('不应出现');
    expect(markdown).not.toContain('note');
    expect(markdown).not.toContain('p{}');
    expect(decodeEntities('&lt;&gt;&amp;&quot;&#39;&bogus;&#0;')).toBe('<>&"\'&bogus;&#0;');
  });
});

describe('only the gate\'s tickets send, under the gate\'s rule, while their binding is current (#676)', () => {
  it('refuses both forwarders once the binding the ticket was issued under is no longer current', async () => {
    const rule = await v7Rule();
    let current: string | null = 'c'.repeat(64);
    const book = EgressTicketBook.open(binding(rule), { currentBindingDigest: () => current });
    const calls: StubCall[] = [];
    const fetch = stub(() => new Response(JSON.stringify(SEARCH_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }), calls);
    const search = (evaluateSearchServiceCall({ arguments: websearch }, binding(rule), scope, book) as { ticket: SearchServiceTicket }).ticket;
    const page = (evaluatePublicSourceFetch({ arguments: webfetch }, binding(rule), scope, book) as { ticket: PublicSourceTicket }).ticket;
    current = 'd'.repeat(64);
    let opened = 0;
    await expect(forwardSearchCall({ ticket: search, book, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    await expect(fetchPublicSource({ ticket: page, book, fetch, admitHost: () => { opened += 1; return () => undefined; } }))
      .rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    // Refused for a stale binding, a ticket is spent: the binding coming back does not revive it.
    current = 'c'.repeat(64);
    await expect(forwardSearchCall({ ticket: search, book, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
    expect(opened).toBe(0);
  });

  it('builds the request and the bounds from the rule the gate returns, and opens the host under the ticket\'s own id', async () => {
    const rule = await v7Rule();
    // The binding's rule names another host and a smaller page: that is what the forwarders use, whatever else exists.
    const moved = { ...rule, websearch: { ...rule.websearch, host: 'search.example.net' }, webfetch: { ...rule.webfetch, maxBytes: 4 } };
    const book = EgressTicketBook.open(binding(moved), scope);
    const calls: StubCall[] = [];
    const search = (evaluateSearchServiceCall({ arguments: websearch }, binding(moved), scope, book) as { ticket: SearchServiceTicket }).ticket;
    const outcome = await forwardSearchCall({ ticket: search, book, arguments: websearch,
      fetch: stub(() => new Response(JSON.stringify(SEARCH_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }), calls) });
    expect(outcome.url).toBe('https://search.example.net/mcp');
    const page = (evaluatePublicSourceFetch({ arguments: webfetch }, binding(moved), scope, book) as { ticket: PublicSourceTicket }).ticket;
    const admissions: Array<{ host: string; port: number; ticketId: string }> = [];
    await expect(fetchPublicSource({ ticket: page, book, admitHost: (target) => { admissions.push({ ...target }); return () => undefined; },
      fetch: stub(() => new Response('0123456789', { status: 200, headers: { 'content-type': 'text/plain' } }), calls) }))
      .rejects.toMatchObject({ code: 'PLATFORM_TOOL_BODY_TOO_LARGE' });
    expect(admissions).toEqual([{ host: 'example.org', port: 443, ticketId: page.ticketId }]);
    expect(calls.map((call) => call.url)).toEqual(['https://search.example.net/mcp', CITED]);
  });
});
