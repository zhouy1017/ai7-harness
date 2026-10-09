import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EgressTicketBook,
  OPENCODE_GO_MODEL,
  OPENCODE_GO_ROUTE,
  assistantToolCallDigest,
  evaluateEgress,
  evaluatePublicSourceFetch,
  evaluateSearchServiceCall,
  payloadDigest,
  redeemEgressTicket,
  toolResultKey,
  type AdmittedToolResult,
  type EgressAttemptScope,
  type EgressBindingFacts,
  type PublicSourceTicket,
  type SearchServiceTicket,
} from '../../src/service/provider/egress-gate.js';
import type { AssembledContentBlock, AssembledModelPayload } from '../../src/service/provider/payload.js';
import { PLATFORM_TOOL_SCHEMAS, canonicalToolArguments, readPlatformToolsRule, toolArgumentsDigest, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';

// The Egress Gate's platform-tool narrowings (ADR 0080 §7.2; Issue #473, S87-f3a). Every new path is keyed on the
// binding's rule naming the platform tools. The selected developer-live document, Provider Processing v5, names none, so
// the first half of this file proves each path still refuses under v5 exactly as before — with every other precondition
// satisfied, so the rule is the only thing refusing. The second half exercises the paths under the v7 block, which no
// active set selects.

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SYSTEM = '合成系统提示。';
const UNIT = `分析单元 1/1 · 单元摘要 ${'1'.repeat(64)}\n[blk_${'a'.repeat(24)}] (paragraph) 合成段落。`;
const BINDING_DIGEST = 'c'.repeat(64);
const SEARCH_URL = 'https://search.parallel.ai/mcp';
const CITED = 'https://example.org/source';
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

async function ruleOf(version: 'v5' | 'v7'): Promise<PlatformToolsRule | null> {
  const document = JSON.parse(await readFile(resolve(REPO_ROOT, `docs/policies/provider-processing-policy.${version}.json`), 'utf8')) as {
    decision: { providerAllowRules: unknown[] };
  };
  return readPlatformToolsRule(document.decision.providerAllowRules[0]);
}

function binding(platformTools: PlatformToolsRule | null, version: 'v5' | 'v8' = 'v5'): EgressBindingFacts {
  return {
    bindingDigest: BINDING_DIGEST,
    route: OPENCODE_GO_ROUTE,
    model: OPENCODE_GO_MODEL,
    systemPrompt: SYSTEM,
    outboundDataCategory: 'public-or-synthetic',
    policy: { operationalScope: 'developer-live', providerProcessingVersion: version, liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    admittedUserMessages: new Set([UNIT]),
    platformTools,
  };
}

const CALL_CONTENT: AssembledContentBlock[] = [
  { type: 'text', text: '先搜索。' },
  { type: 'tool-call', id: 'call_1', name: 'websearch', arguments: '{"query":"狂人日记 发表 年份"}' },
];
const RESULT_TEXT = '《狂人日记》1918 年发表于《新青年》。来源 https://example.org/source';

function admitted(overrides: Partial<AdmittedToolResult> = {}): AdmittedToolResult {
  return { callId: 'call_1', tool: 'websearch', sourceUrl: SEARCH_URL, sha256: sha(RESULT_TEXT), byteCount: Buffer.byteLength(RESULT_TEXT), ...overrides };
}

function results(...records: AdmittedToolResult[]): Map<string, AdmittedToolResult> {
  return new Map(records.map((record) => [toolResultKey(record.callId, record.tool), record]));
}

function scope(overrides: Partial<EgressAttemptScope> = {}): EgressAttemptScope {
  return {
    currentBindingDigest: () => BINDING_DIGEST,
    acceptedOutputDigests: new Set(),
    ceilingState: () => 'within',
    acceptedToolCallDigests: new Set([assistantToolCallDigest(CALL_CONTENT)]),
    admittedToolResults: results(admitted()),
    breakerState: () => 'intact',
    citationAdmits: (url) => url === CITED,
    ...overrides,
  };
}

const user = (text: string): AssembledModelPayload['messages'][number] => ({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } });
const toolCallMessage = (content: AssembledContentBlock[] = CALL_CONTENT, provider: string = OPENCODE_GO_ROUTE): AssembledModelPayload['messages'][number] =>
  ({ role: 'assistant', content, source: { kind: 'model', provider, model: OPENCODE_GO_MODEL } });
const toolResult = (text: string = RESULT_TEXT, callId = 'call_1', blockCallId = callId): AssembledModelPayload['messages'][number] =>
  ({ role: 'user', content: [{ type: 'tool-result', toolCallId: blockCallId, content: [{ type: 'text', text }] }], source: { kind: 'tool', callId } });
const tools = (): unknown[] => PLATFORM_TOOL_SCHEMAS.map((tool) => JSON.parse(JSON.stringify(tool)) as unknown);

function payload(messages: AssembledModelPayload['messages'], withTools = true): AssembledModelPayload {
  return { provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL, system: SYSTEM, ...(withTools ? { tools: tools() } : {}), messages };
}

const LOOP = [user(UNIT), toolCallMessage(), toolResult()];
const websearch = canonicalToolArguments('websearch', { query: '狂人日记 发表 年份' }) as Extract<ReturnType<typeof canonicalToolArguments>, { tool: 'websearch' }>;
const webfetch = canonicalToolArguments('webfetch', { url: CITED }) as Extract<ReturnType<typeof canonicalToolArguments>, { tool: 'webfetch' }>;

/** The gate's book for a binding whose rule names the platform tools, re-reading the scope's current binding. */
function bookFor(named: EgressBindingFacts, current: () => string | null = () => BINDING_DIGEST): EgressTicketBook {
  return EgressTicketBook.open(named, { currentBindingDigest: current });
}

describe('under the selected Provider Processing v5 every platform-tool path still refuses', () => {
  it('reads no platform tools from the v5 rule', async () => {
    expect(await ruleOf('v5')).toBeNull();
  });

  it('refuses the exact platform tool set as tools-present', async () => {
    const v5 = binding(await ruleOf('v5'));
    expect(evaluateEgress(payload([user(UNIT)]), v5, scope())).toMatchObject({ decision: 'refuse', reason: 'tools-present' });
    // Absent and null are the same reading: a binding that never mentions platform tools refuses them too.
    const { platformTools: _omitted, ...absent } = v5;
    expect(evaluateEgress(payload([user(UNIT)]), absent, scope())).toMatchObject({ decision: 'refuse', reason: 'tools-present' });
    // The same binding without tools in the payload transmits exactly as before.
    expect(evaluateEgress(payload([user(UNIT)], false), v5, scope())).toMatchObject({ decision: 'transmit-remote' });
  });

  it('refuses a tool-call message and a tool result even when the scope would admit both', async () => {
    const v5 = binding(await ruleOf('v5'));
    expect(evaluateEgress(payload(LOOP, false), v5, scope())).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload([user(UNIT), toolResult()], false), v5, scope())).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    // Not even a refusal AI7 composed itself, which carries no URL to check: the rule alone keys the tool branch.
    const composed = scope({ admittedToolResults: results(admitted({ sourceUrl: null })) });
    expect(evaluateEgress(payload(LOOP, false), v5, composed)).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload(LOOP, false), binding(await ruleOf('v7'), 'v8'), composed)).toMatchObject({ decision: 'transmit-remote' });
  });

  it('refuses call-search-service and fetch-public-source with platform-tools-not-named, issuing no ticket', async () => {
    const v5 = binding(await ruleOf('v5'));
    // Even handed a book the gate opened for the same digest under a naming rule, the v5 binding is refused first.
    const book = bookFor(binding(await ruleOf('v7'), 'v8'));
    expect(evaluateSearchServiceCall({ arguments: websearch }, v5, scope(), book)).toMatchObject({ decision: 'refuse', reason: 'platform-tools-not-named' });
    expect(evaluatePublicSourceFetch({ arguments: webfetch }, v5, scope(), book)).toMatchObject({ decision: 'refuse', reason: 'platform-tools-not-named' });
    expect(book.outstanding).toBe(0);
  });

  it('opens no ticket book for a binding whose rule names no platform tools (#676)', async () => {
    const v5 = binding(await ruleOf('v5'));
    expect(() => EgressTicketBook.open(v5, { currentBindingDigest: () => BINDING_DIGEST })).toThrowError('PLATFORM_TOOLS_NOT_NAMED');
    const devCi: EgressBindingFacts = {
      ...binding(await ruleOf('v7')),
      policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
    };
    expect(() => EgressTicketBook.open(devCi, { currentBindingDigest: () => BINDING_DIGEST })).toThrowError('PLATFORM_TOOLS_NOT_NAMED');
    const malformed = { ...binding(await ruleOf('v7'), 'v8'), bindingDigest: 'not-a-digest' };
    expect(() => EgressTicketBook.open(malformed, { currentBindingDigest: () => BINDING_DIGEST })).toThrowError('PLATFORM_TOOLS_NOT_NAMED');
  });

  it('never reads a rule outside developer-live, even one carrying the block', async () => {
    const forged: EgressBindingFacts = {
      ...binding(await ruleOf('v7')),
      policy: { operationalScope: 'development-ci', providerProcessingVersion: 'v1', liveTransmissionAllowed: false, authorizedLiveTransmissionCount: 0 },
    };
    expect(evaluateEgress(payload([user(UNIT)]), forged, scope())).toMatchObject({ reason: 'tools-present' });
    expect(evaluateEgress(payload(LOOP, false), forged, scope())).toMatchObject({ reason: 'payload-out-of-scope' });
    const book = bookFor(binding(await ruleOf('v7'), 'v8'));
    expect(evaluateSearchServiceCall({ arguments: websearch }, forged, scope(), book)).toMatchObject({ reason: 'remote-route-denied-under-v1' });
    expect(book.outstanding).toBe(0);
  });

  it('keeps the digest of every text-only payload exactly as it was', () => {
    const textOnly = payload([user(UNIT)], false);
    const before = createHash('sha256').update([OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL, SYSTEM, `user\u0000${UNIT}`].join('\u0002')).digest('hex');
    expect(payloadDigest(textOnly)).toBe(before);
    expect(payloadDigest(payload(LOOP, false))).not.toBe(payloadDigest(payload([user(UNIT), toolCallMessage([CALL_CONTENT[0]!, { ...CALL_CONTENT[1]!, arguments: '{}' }]), toolResult()], false)));
  });
});

describe('under a rule naming the platform tools (v7\'s block, selected by nothing)', () => {
  it('admits exactly the rule\'s tool set and the admitted tool exchange', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    expect(evaluateEgress(payload(LOOP), named, scope())).toMatchObject({ decision: 'transmit-remote' });
    expect(evaluateEgress(payload([user(UNIT)]), named, scope())).toMatchObject({ decision: 'transmit-remote' });
    const extra = { ...payload([user(UNIT)]), tools: [...tools(), { name: 'shell', description: 'x', parameters: {} }] };
    expect(evaluateEgress(extra, named, scope())).toMatchObject({ reason: 'tools-present' });
    const altered = { ...payload([user(UNIT)]), tools: [{ ...(tools()[0] as object), description: '改写的说明' }, tools()[1]] };
    expect(evaluateEgress(altered, named, scope())).toMatchObject({ reason: 'tools-present' });
  });

  it('admits a tool-call message only by its recorded digest, from the bound model, naming platform tools', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    expect(evaluateEgress(payload(LOOP), named, scope({ acceptedToolCallDigests: new Set() }))).toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload([user(UNIT), toolCallMessage(CALL_CONTENT, 'deepseek-open-platform'), toolResult()]), named, scope()))
      .toMatchObject({ reason: 'payload-out-of-scope' });
    const shell: AssembledContentBlock[] = [{ type: 'tool-call', id: 'call_1', name: 'shell', arguments: '{}' }];
    expect(evaluateEgress(payload([user(UNIT), toolCallMessage(shell), toolResult()]), named,
      scope({ acceptedToolCallDigests: new Set([assistantToolCallDigest(shell)]) }))).toMatchObject({ reason: 'payload-out-of-scope' });
    // Reasoning written beside the calls travels back with them, under the digest that covers it; any other block does not.
    const reasoning: AssembledContentBlock[] = [{ type: 'reasoning', text: 'x' }, CALL_CONTENT[1]!];
    expect(evaluateEgress(payload([user(UNIT), toolCallMessage(reasoning), toolResult()]), named,
      scope({ acceptedToolCallDigests: new Set([assistantToolCallDigest(reasoning)]) }))).toMatchObject({ decision: 'transmit-remote' });
    expect(evaluateEgress(payload([user(UNIT), toolCallMessage([{ type: 'reasoning', text: 'y' }, CALL_CONTENT[1]!]), toolResult()]), named,
      scope({ acceptedToolCallDigests: new Set([assistantToolCallDigest(reasoning)]) }))).toMatchObject({ reason: 'payload-out-of-scope' });
    const image: AssembledContentBlock[] = [{ type: 'image' }, CALL_CONTENT[1]!];
    expect(evaluateEgress(payload([user(UNIT), toolCallMessage(image), toolResult()]), named,
      scope({ acceptedToolCallDigests: new Set([assistantToolCallDigest(image)]) }))).toMatchObject({ reason: 'payload-out-of-scope' });
  });

  it('admits a tool result only by call id, URL, SHA-256, and byte count', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    const refused = (messages: AssembledModelPayload['messages'], overrides: Partial<EgressAttemptScope> = {}) =>
      expect(evaluateEgress(payload(messages), named, scope(overrides))).toMatchObject({ decision: 'refuse', reason: 'payload-out-of-scope' });
    refused([user(UNIT), toolCallMessage(), toolResult(`${RESULT_TEXT}。`)]);
    refused([user(UNIT), toolCallMessage(), toolResult(RESULT_TEXT, 'call_2')]);
    refused([user(UNIT), toolCallMessage(), toolResult(RESULT_TEXT, 'call_1', 'call_2')]);
    refused(LOOP, { admittedToolResults: results(admitted({ byteCount: 1 })) });
    refused(LOOP, { admittedToolResults: results(admitted({ sha256: sha('x') })) });
    refused(LOOP, { admittedToolResults: results(admitted({ sourceUrl: 'https://search.parallel.ai.attacker.example/mcp' })) });
    refused(LOOP, { admittedToolResults: results(admitted({ sourceUrl: 'http://search.parallel.ai/mcp' })) });
    refused(LOOP, { admittedToolResults: new Map() });
    // A result for a call no earlier message asked for, and a second result for one call.
    refused([user(UNIT), toolResult()]);
    refused([user(UNIT), toolCallMessage(), toolResult(), toolResult()]);
    // A fetched page's URL must be one the attempt cited, and the result must be of the tool its call named.
    const fetchCall: AssembledContentBlock[] = [{ type: 'tool-call', id: 'call_1', name: 'webfetch', arguments: `{"url":"${CITED}"}` }];
    const fetchLoop = [user(UNIT), toolCallMessage(fetchCall), toolResult()];
    const fetchScope = { acceptedToolCallDigests: new Set([assistantToolCallDigest(fetchCall)]) };
    const fetched = admitted({ tool: 'webfetch', sourceUrl: CITED });
    expect(evaluateEgress(payload(fetchLoop), named, scope({ ...fetchScope, admittedToolResults: results(fetched) }))).toMatchObject({ decision: 'transmit-remote' });
    refused(fetchLoop, { ...fetchScope, admittedToolResults: results(fetched), citationAdmits: () => false });
    refused(LOOP, { admittedToolResults: results(fetched) });
    refused(fetchLoop, { ...fetchScope, admittedToolResults: results(admitted()) });
    // A record filed under the call's key but naming another tool is not that call's result either.
    refused(LOOP, { admittedToolResults: new Map([[toolResultKey('call_1', 'websearch'), admitted({ tool: 'webfetch', sourceUrl: null })]]) });
    // A call naming a tool the rule does not name is refused even before any result answers it.
    const shellCall: AssembledContentBlock[] = [{ type: 'tool-call', id: 'call_7', name: 'shell', arguments: '{}' }];
    refused([user(UNIT), toolCallMessage(shellCall), user(UNIT)], { acceptedToolCallDigests: new Set([assistantToolCallDigest(shellCall)]) });
    // A call id reused by a later call is refused, whatever the second call names.
    const reused: AssembledContentBlock[] = [{ type: 'tool-call', id: 'call_1', name: 'websearch', arguments: '{"query":"另一个"}' }];
    refused([user(UNIT), toolCallMessage(), toolResult(), toolCallMessage(reused), toolResult()],
      { acceptedToolCallDigests: new Set([assistantToolCallDigest(CALL_CONTENT), assistantToolCallDigest(reused)]) });
    // A refusal AI7 composed itself carries no external bytes and no URL.
    expect(evaluateEgress(payload(LOOP), named, scope({ admittedToolResults: results(admitted({ sourceUrl: null })) })))
      .toMatchObject({ decision: 'transmit-remote' });
  });

  it('ends a unit whose breaker tripped: the model is not asked again with the refusal in hand', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    expect(evaluateEgress(payload(LOOP), named, scope({ breakerState: () => 'tripped' })))
      .toMatchObject({ decision: 'refuse', reason: 'circuit-breaker-tripped', detail: expect.stringContaining('联网核查未完成') });
    // A payload that opens with the next unit's message is not the tripped unit's.
    expect(evaluateEgress(payload([user(UNIT)]), named, scope({ breakerState: () => 'tripped' }))).toMatchObject({ decision: 'transmit-remote' });
    // Under v5 the breaker is never consulted: nothing about it moves a text-only payload.
    expect(evaluateEgress(payload([user(UNIT)], false), binding(await ruleOf('v5')), scope({ breakerState: () => 'tripped' }))).toMatchObject({ decision: 'transmit-remote' });
  });

  it('leaves the user and model branches exactly as strict as before', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    // A user-role message of source `tool` that is plain text is no tool result.
    expect(evaluateEgress(payload([user(UNIT), toolCallMessage(), { role: 'user', content: [{ type: 'text', text: RESULT_TEXT }], source: { kind: 'tool', callId: 'call_1' } }]), named, scope()))
      .toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload([user('越界的单元')]), named, scope())).toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload([user(UNIT), { role: 'assistant', content: [{ type: 'text', text: '未接受' }], source: { kind: 'model', provider: OPENCODE_GO_ROUTE, model: OPENCODE_GO_MODEL } }, user(UNIT)]), named, scope()))
      .toMatchObject({ reason: 'payload-out-of-scope' });
    expect(evaluateEgress(payload([user(UNIT), toolCallMessage()]), named, scope())).toMatchObject({ reason: 'payload-out-of-scope' });
  });

  it('decides call-search-service only for the binding\'s public category, an intact breaker, and a held ceiling', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    const book = bookFor(named);
    const request = { arguments: websearch };
    expect(evaluateSearchServiceCall(request, named, scope({ breakerState: () => 'tripped' }), book)).toMatchObject({ reason: 'circuit-breaker-tripped' });
    expect(evaluateSearchServiceCall(request, named, scope({ ceilingState: () => 'reached' }), book)).toMatchObject({ reason: 'run-budget-ceiling-reached' });
    expect(evaluateSearchServiceCall(request, named, scope({ ceilingState: () => 'unset' }), book)).toMatchObject({ reason: 'run-budget-ceiling-unset' });
    expect(evaluateSearchServiceCall(request, named, scope({ currentBindingDigest: () => null }), book)).toMatchObject({ reason: 'binding-stale' });
    expect(book.outstanding).toBe(0);
    const decision = evaluateSearchServiceCall(request, named, scope(), book);
    expect(decision).toMatchObject({ decision: 'call-search-service', ticket: { host: 'search.parallel.ai', argumentsDigest: toolArgumentsDigest(websearch), bindingDigest: BINDING_DIGEST } });
    expect(book.outstanding).toBe(1);
  });

  it('derives the search host from the selected rule and the category from the binding, never from the call (#676)', async () => {
    const rule = (await ruleOf('v7'))!;
    // The host the ticket carries is whatever the rule names: the call has no way to say another.
    const elsewhere: typeof rule = { ...rule, websearch: { ...rule.websearch, host: 'mcp.exa.ai' } };
    const moved = binding(elsewhere, 'v8');
    const ticket = (evaluateSearchServiceCall({ arguments: websearch }, moved, scope(), bookFor(moved)) as { ticket: SearchServiceTicket }).ticket;
    expect(ticket.host).toBe('mcp.exa.ai');
    // A binding whose category is not public or synthetic is refused on both decisions, before any ticket is issued — even
    // though the call itself states no category at all.
    const excerpt: EgressBindingFacts = { ...binding(rule, 'v8'), outboundDataCategory: 'editor-selected-manuscript-excerpt' };
    const book = bookFor(excerpt);
    expect(evaluateSearchServiceCall({ arguments: websearch }, excerpt, scope(), book)).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    expect(evaluatePublicSourceFetch({ arguments: webfetch }, excerpt, scope(), book)).toMatchObject({ decision: 'refuse', reason: 'outbound-category-mismatch' });
    expect(book.outstanding).toBe(0);
  });

  it('issues only into the book the gate opened for this binding (#676)', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    const other = { ...named, bindingDigest: 'd'.repeat(64) };
    const foreign = bookFor(other, () => other.bindingDigest);
    expect(evaluateSearchServiceCall({ arguments: websearch }, named, scope(), foreign)).toMatchObject({ decision: 'refuse', reason: 'ticket-book-foreign' });
    expect(evaluatePublicSourceFetch({ arguments: webfetch }, named, scope(), foreign)).toMatchObject({ decision: 'refuse', reason: 'ticket-book-foreign' });
    // An object that only looks like a book holds no state the gate knows.
    const lookalike = Object.create(EgressTicketBook.prototype) as EgressTicketBook;
    expect(evaluateSearchServiceCall({ arguments: websearch }, named, scope(), lookalike)).toMatchObject({ reason: 'ticket-book-foreign' });
    expect(foreign.outstanding).toBe(0);
    expect(lookalike.outstanding).toBe(0);
    // Nor can a book be constructed past `open`: the constructor holds the gate's key.
    const Constructor = EgressTicketBook as unknown as new (key: symbol, state: unknown) => EgressTicketBook;
    expect(() => new Constructor(Symbol('egress-ticket-book'), {})).toThrowError('EGRESS_TICKET_BOOK_NOT_OPENED_BY_GATE');
    expect('issue' in EgressTicketBook.prototype).toBe(false);
  });

  it('decides fetch-public-source only for a canonical cited public URL', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    const book = bookFor(named);
    expect(evaluatePublicSourceFetch({ arguments: { tool: 'webfetch', url: 'https://example.org/other' } }, named, scope(), book)).toMatchObject({ reason: 'fetch-target-not-cited' });
    expect(evaluatePublicSourceFetch({ arguments: { tool: 'webfetch', url: 'http://example.org/source' } }, named, scope(), book)).toMatchObject({ reason: 'fetch-target-invalid' });
    expect(evaluatePublicSourceFetch({ arguments: { tool: 'webfetch', url: 'https://EXAMPLE.org/source' } }, named, scope(), book)).toMatchObject({ reason: 'fetch-target-invalid' });
    expect(evaluatePublicSourceFetch({ arguments: webfetch }, named, scope({ breakerState: () => 'tripped' }), book)).toMatchObject({ reason: 'circuit-breaker-tripped' });
    expect(book.outstanding).toBe(0);
    expect(evaluatePublicSourceFetch({ arguments: webfetch }, named, scope(), book))
      .toMatchObject({ decision: 'fetch-public-source', ticket: { url: CITED, host: 'example.org', argumentsDigest: toolArgumentsDigest(webfetch) } });
  });
});

describe('EgressTicketBook', () => {
  it('redeems each issued ticket exactly once, from the book that issued it, and nothing it did not issue', async () => {
    const rule = (await ruleOf('v7'))!;
    const named = binding(rule, 'v8');
    const book = bookFor(named);
    const decision = evaluateSearchServiceCall({ arguments: websearch }, named, scope(), book);
    const ticket = (decision as { ticket: SearchServiceTicket }).ticket;
    expect(Object.isFrozen(ticket)).toBe(true);
    expect(redeemEgressTicket(book, { ...ticket, host: 'mcp.exa.ai' })).toBeNull();
    expect(redeemEgressTicket(book, { ...ticket, ticketId: '00000000-0000-4000-8000-000000000000' })).toBeNull();
    // A field-for-field copy is not the ticket the gate issued.
    expect(redeemEgressTicket(book, { ...ticket })).toBeNull();
    expect(redeemEgressTicket(bookFor(named), ticket)).toBeNull();
    expect(redeemEgressTicket(Object.create(EgressTicketBook.prototype) as EgressTicketBook, ticket)).toBeNull();
    expect(book.outstanding).toBe(1);
    // Redemption hands back the rule of the binding the ticket was issued under: the only rule a forwarder builds from.
    expect(redeemEgressTicket(book, ticket)).toBe(rule);
    expect(redeemEgressTicket(book, ticket)).toBeNull();
    expect(book.outstanding).toBe(0);
    const fetch = evaluatePublicSourceFetch({ arguments: webfetch }, named, scope(), book) as { ticket: PublicSourceTicket };
    book.revoke({ ...fetch.ticket });
    expect(book.outstanding).toBe(1);
    book.revoke(fetch.ticket);
    expect(book.outstanding).toBe(0);
    expect(redeemEgressTicket(book, fetch.ticket)).toBeNull();
  });

  it('re-checks at redemption that the binding is still current, and spends a ticket it refuses (#676)', async () => {
    const named = binding(await ruleOf('v7'), 'v8');
    let current: string | null = BINDING_DIGEST;
    const book = bookFor(named, () => current);
    const ticket = (evaluateSearchServiceCall({ arguments: websearch }, named, scope(), book) as { ticket: SearchServiceTicket }).ticket;
    current = null;
    expect(redeemEgressTicket(book, ticket)).toBeNull();
    current = BINDING_DIGEST;
    expect(redeemEgressTicket(book, ticket)).toBeNull();
    expect(book.outstanding).toBe(0);
    // A superseding binding is not the ticket's binding either.
    const fetch = (evaluatePublicSourceFetch({ arguments: webfetch }, named, scope(), book) as { ticket: PublicSourceTicket }).ticket;
    current = 'e'.repeat(64);
    expect(redeemEgressTicket(book, fetch)).toBeNull();
  });
});
