import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
import { decodeEntities, htmlToMarkdown } from '../../src/service/provider/html-to-markdown.js';
import { canonicalToolArguments, readPlatformToolsRule, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';
import type { PlatformToolFetch, PlatformToolHttpInit } from '../../src/service/provider/platform-tool-http.js';
import { declaredCharset, fetchPublicSource } from '../../src/service/provider/public-source-fetch.js';
import {
  SEARCH_RESULT_MAX_CHARACTERS,
  capCharacters,
  forwardSearchCall,
  readSearchServiceAnswer,
  searchServiceRequest,
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
    const book = new EgressTicketBook();
    const calls: StubCall[] = [];
    const fetch = stub(() => new Response(JSON.stringify(SEARCH_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }), calls);
    const decision = evaluateSearchServiceCall({ host: rule.websearch.host, arguments: websearch, outboundDataCategory: 'public-or-synthetic' }, binding(rule), scope, book);
    const ticket = (decision as { ticket: SearchServiceTicket }).ticket;
    // A ticket for another query, a forged one, or one from another book sends nothing.
    const other = canonicalToolArguments('websearch', { query: '别的查询' }) as typeof websearch;
    await expect(forwardSearchCall({ ticket, book, rule, arguments: other, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    await expect(forwardSearchCall({ ticket, book: new EgressTicketBook(), rule, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    // A ticket decided under one rule's host never reaches the host another rule names.
    const moved = { ...rule, websearch: { ...rule.websearch, host: 'search.example.net' } };
    await expect(forwardSearchCall({ ticket, book, rule: moved, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
    const outcome = await forwardSearchCall({ ticket, book, rule, arguments: websearch, fetch });
    expect(outcome).toMatchObject({ url: 'https://search.parallel.ai/mcp', status: 200, text: SEARCH_ANSWER.result.content[0]!.text });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(calls[0]!.init.headers).not.toHaveProperty('authorization');
    // The same ticket never sends twice.
    await expect(forwardSearchCall({ ticket, book, rule, arguments: websearch, fetch })).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(calls).toHaveLength(1);
  });
});

describe('the webfetch owner', () => {
  async function fetchWith(respond: (url: string) => Response, rule?: PlatformToolsRule): Promise<{ outcome: Awaited<ReturnType<typeof fetchPublicSource>>; admitted: string[]; released: number; calls: StubCall[] }> {
    const effective = rule ?? await v7Rule();
    const book = new EgressTicketBook();
    const decision = evaluatePublicSourceFetch({ arguments: webfetch }, binding(effective), scope, book) as { ticket: PublicSourceTicket };
    const admitted: string[] = [];
    let released = 0;
    const calls: StubCall[] = [];
    const outcome = await fetchPublicSource({
      ticket: decision.ticket, book, rule: effective, fetch: stub(respond, calls),
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
    const book = new EgressTicketBook();
    const decision = evaluatePublicSourceFetch({ arguments: webfetch }, binding(small), scope, book) as { ticket: PublicSourceTicket };
    let released = 0;
    const calls: StubCall[] = [];
    const run = (): ReturnType<typeof fetchPublicSource> => fetchPublicSource({
      ticket: decision.ticket, book, rule: small,
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
