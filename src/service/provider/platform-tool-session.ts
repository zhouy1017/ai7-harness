import type { ProviderModelProfile } from './model-profile.js';
import { RetrievalError, type RetrievalIndex } from '../retrieval/index.js';
import { LOCAL_TOOL_BREAKER_END, LOCAL_TOOL_RESULT_MAX_BYTES, LOCAL_TOOL_ROUND_TRIP_BREAKER, localToolParallelBound } from './local-tools.js';
import type { DevelopmentValidationIntent } from '../../shared/protocol.js';
import type { CredentialBroker } from './credential-broker.js';
import type { PlatformToolCallItem, PlatformToolCallResult } from './live-transmission.js';
import type { ResearchSnapshot } from './research-snapshot-cache.js';
import { sha256Hex } from '../analysis/canonical.js';
import type { HarnessTurnOutcome, PlatformToolExecution, PlatformToolOwner } from '../harness/primary-agent-harness.js';
import { AI7_FAILURE_CODES } from './classification.js';
import {
  EgressTicketBook,
  evaluatePublicSourceFetch,
  evaluateSearchServiceCall,
  toolResultKey,
  type AdmittedToolResult,
  type EgressAttemptScope,
  type EgressBindingFacts,
} from './egress-gate.js';
import { platformToolCallOnce } from './live-transmission.js';
import {
  PlatformToolBreaker,
  canonicalPublicUrl,
  canonicalToolArguments,
  toolArgumentsDigest,
  isLocalToolName,
  ruleNamedToolSchemas,
  type PlatformToolName,
} from './platform-tools.js';
import type { PlatformToolFetch } from './platform-tool-http.js';
import type { ProviderResultCache } from './provider-result-cache.js';
import { authorizePublicFetch, sendPublicFetch, type TicketHostAdmission } from './public-source-fetch.js';
import type { ResearchSnapshotCache } from './research-snapshot-cache.js';
import { authorizeSearchCall, sendSearchCall } from './search-service.js';

/**
 * One attempt's platform tools, end to end (ADR 0080 §7, Issue #473 S87-f3a): the owner the harness routes `websearch`
 * and `webfetch` calls to. Each call is canonicalized, counted by the unit's breaker, decided by the one Egress Gate
 * (`call-search-service` / `fetch-public-source`, single-use tickets), answered from the Research Snapshot Cache or sent
 * once under a named S87 test item, and its exact text admitted for the gate by call id, URL, digest, and byte count.
 * Every refusal is returned to the model as the tool's result, never retried.
 *
 * It cannot be constructed for a binding whose rule names no platform tools — every binding under the selected Provider
 * Processing v5 — so nothing in this module is reachable until a policy revision naming them is selected (S87-f3b).
 */
/** The sole evidence bootstrap; ordinary registration always requires declared exact-model evidence. */
export function platformToolModelProfile(profile: ProviderModelProfile, scope: string, validation: DevelopmentValidationIntent | null): ProviderModelProfile {
  const bootstrap = scope === 'developer-live' && validation?.family === 'policy-selection' && validation.case === 'wave6-tool-evidence-bootstrap';
  if (bootstrap && profile.capabilities.toolCalling === 'function') throw Object.assign(new Error('该模型已具备工具证据；不重复引导验证。'), { code: 'PLATFORM_TOOL_EVIDENCE_ALREADY_ESTABLISHED' });
  if (bootstrap && profile.route === 'opencode-go' && profile.model === 'deepseek-v4.1-flash') return { ...profile, capabilities: { ...profile.capabilities, toolCalling: 'function' } };
  if (profile.capabilities.toolCalling !== 'function') throw Object.assign(new Error('当前模型尚无工具调用证据；未注册联网工具。'), { code: 'PLATFORM_TOOL_MODEL_NOT_ADMITTED' });
  return profile;
}

export class PlatformToolSession implements PlatformToolOwner {
  readonly #binding: EgressBindingFacts;
  readonly #base: Pick<EgressAttemptScope, 'currentBindingDigest' | 'acceptedOutputDigests' | 'ceilingState'>;
  readonly #fetch: PlatformToolFetch;
  readonly #admitHost: TicketHostAdmission;
  readonly #cache: ProviderResultCache | null;
  readonly #snapshots: ResearchSnapshotCache | null;
  readonly #purpose: string;
  readonly #broker: CredentialBroker | undefined;
  readonly #onUsage: ((usage: { inputTokens: number; outputTokens: number }) => void) | undefined;
  readonly #runResults = new Map<string, { readonly text: string; readonly sourceUrl: string | null }>();
  #inFlight = false;
  #localInFlight = 0;
  #refusedRoundTrips = 0;
  readonly #oneQueryPerUnit: boolean;
  #unitSearchQuery: string | null = null;
  #unitSearchHasResult = false;
  #unitSearchRefused = false;
  readonly #evidenceOnly: boolean;
  evidenceNeedsCommander = false;
  readonly usage: { requests: number; inputTokens: number; outputTokens: number; searchCalls: Record<string, number>; refusedSearchCalls: number;
    fetchCount: number; fetchBytes: number; retrievalCalls?: number; exactFetchCalls?: number; refusedRetrievalCalls?: number; localToolCalls?: Record<string, number> } = {
    requests: 0, inputTokens: 0, outputTokens: 0, searchCalls: {}, refusedSearchCalls: 0, fetchCount: 0, fetchBytes: 0,
  };
  readonly provenance: Array<{ sourceKind: 'tool'; backendId: string | null; host: string; capturedAt: string; argumentsDigest: string; responseDigest: string }> = [];
  /** Where a search goes, as the rule names it: the Research Snapshot Cache never answers one service's query with another's. */
  readonly #searchOrigin: string;
  readonly #breaker: PlatformToolBreaker;
  readonly #book: EgressTicketBook | null;
  readonly #retrieval: RetrievalIndex | null;
  readonly #localBreaker: PlatformToolBreaker;
  #unitLocalCalls = 0;
  #localRoundTrips = 0;
  readonly #acceptedToolCallDigests = new Set<string>();
  readonly #admittedToolResults = new Map<string, AdmittedToolResult>();
  readonly #citations = new Set<string>();
  readonly #executedCallIds = new Set<string>();
  /** What the unit in flight's tools brought back, kept for the External Evidence Retention Procedure (Issue #425, S70). */
  #unitCaptures: Array<{ readonly tool: PlatformToolName; readonly snapshot: ResearchSnapshot }> = [];
  #unitSearches = 0;
  /** Each search answer of this attempt by its digest, so a unit that reuses one keeps the snapshot it read. */
  readonly #searchSnapshots = new Map<string, ResearchSnapshot>();
  /** Share both successful pages and failures with retention: a failed model fetch is never retried by the procedure. */
  readonly #fetchedPages = new Map<string, ResearchSnapshot | { readonly failed: string }>();

  constructor(deps: {
    readonly binding: EgressBindingFacts;
    readonly scope: Pick<EgressAttemptScope, 'currentBindingDigest' | 'acceptedOutputDigests' | 'ceilingState'>;
    readonly fetch?: PlatformToolFetch;
    /** Per-ticket host admission: the network denial's `admitTicketHost`, keyed by each fetch ticket's id. */
    readonly admitHost?: TicketHostAdmission;
    readonly retrieval?: RetrievalIndex;
    readonly cache?: ProviderResultCache | null;
    readonly snapshots?: ResearchSnapshotCache | null;
    /** The test item purpose every call of this attempt is recorded under. */
    readonly purpose: string;
    readonly breaker?: PlatformToolBreaker;
    readonly broker?: CredentialBroker;
    readonly evidenceSearchRoundTripOnly?: boolean;
    readonly onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
  }) {
    const rule = deps.binding.platformTools ?? null;
    const local = deps.binding.localTools?.targetedRetrieval.allowed === true;
    if (local) { this.usage.retrievalCalls = 0; this.usage.exactFetchCalls = 0; this.usage.refusedRetrievalCalls = 0; }
    if ((rule === null && !local) || (!local && !['developer-live', 'ordinary-production'].includes(deps.binding.policy.operationalScope))) throw new Error('PLATFORM_TOOLS_NOT_NAMED');
    if (rule !== null && (deps.fetch === undefined || deps.admitHost === undefined)) throw new Error('PLATFORM_TOOL_TRANSPORT_REQUIRED');
    this.#binding = deps.binding;
    this.#retrieval = deps.retrieval ?? null;
    this.#localBreaker = new PlatformToolBreaker(deps.binding.localTools?.breaker.roundTrips ?? LOCAL_TOOL_ROUND_TRIP_BREAKER);
    this.#oneQueryPerUnit = rule !== null && 'backends' in rule.websearch;
    this.#base = deps.scope;
    this.#fetch = deps.fetch ?? (() => { throw new Error('LOCAL_TOOL_HAS_NO_TRANSPORT'); });
    this.#admitHost = deps.admitHost ?? (() => { throw new Error('LOCAL_TOOL_HAS_NO_HOST'); });
    this.#cache = deps.cache ?? null;
    this.#snapshots = deps.snapshots ?? null;
    this.#purpose = deps.purpose;
    this.#evidenceOnly = deps.evidenceSearchRoundTripOnly === true;
    this.#broker = deps.broker;
    this.#onUsage = deps.onUsage;
    this.#searchOrigin = rule === null ? '' : `${deps.binding.searchBackend?.backendId ?? ('service' in rule.websearch ? rule.websearch.service : '')}@${deps.binding.searchBackend?.host ?? ('host' in rule.websearch ? rule.websearch.host : '')}`;
    this.#breaker = deps.breaker ?? new PlatformToolBreaker();
    // The gate opens this attempt's book for this binding; every redemption re-reads the attempt's current binding (#676).
    this.#book = rule === null ? null : EgressTicketBook.open(deps.binding, { currentBindingDigest: () => this.#base.currentBindingDigest() });
  }

  /** The scope the gate evaluates every model call and every tool decision of this attempt against. */
  get egressScope(): EgressAttemptScope {
    return {
      ...this.#base,
      acceptedToolCallDigests: this.#acceptedToolCallDigests,
      admittedToolResults: this.#admittedToolResults,
      breakerState: () => this.#breaker.state,
      localBreakerState: () => this.#localBreaker.state,
      citationAdmits: (url) => this.#citations.has(url),
    };
  }

  /** The unit's breaker state; a tripped unit ends with 联网核查未完成 on its affected findings (ADR 0080 §7.4). */
  get breakerState(): 'intact' | 'tripped' {
    return this.#breaker.state;
  }

  /**
   * The disclosed state the unit in flight ends with: 联网核查未完成 once its breaker tripped (ADR 0080 §7.4). The gate then
   * refuses the unit's next model call (`circuit-breaker-tripped`), so its turn ends `failed` with the distinct
   * `AI7_PLATFORM_TOOL_BREAKER_TRIPPED`, and the execution owner settles the unit through `unitEnd` instead of retrying.
   */
  get unitDisclosure(): '联网核查已完成' | '联网核查未完成' | null {
    if (this.#breaker.state === 'tripped') return '联网核查未完成';
    return this.#unitSearchQuery !== null || this.#unitSearchRefused
      ? this.#unitSearchHasResult ? '联网核查已完成' : '联网核查未完成' : null;
  }

  /**
   * How the unit in flight ends, read from the turn the harness returned for it (ADR 0080 §7.4; #676) — the one read path
   * the execution owner takes once it wires the platform tools (S87-f3b). A turn that ended on this unit's tripped breaker
   * ends the unit with 联网核查未完成 on its affected findings, and is never retried: not by the automatic safe retry, not
   * by asking the editor first (S76d) — its failure is not retry-safe — and not by ending the Run, since the other units
   * owe nothing to this one's loop. Every other turn — answered, interrupted, refused for any other reason — is `null`, and
   * settles exactly as a turn without platform tools does. Read it before `startUnit`, which resets the breaker.
   */
  unitEnd(turn: Pick<HarnessTurnOutcome, 'terminal' | 'signals'>): PlatformToolUnitEnd | null {
    if (turn.terminal !== 'failed' || (this.#breaker.state !== 'tripped' && this.#localBreaker.state !== 'tripped')) return null;
    const failed = turn.signals.find((signal) => signal.kind === 'failed');
    if (failed?.kind !== 'failed' || failed.failure.code !== AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED) return null;
    return this.#localBreaker.state === 'tripped' ? LOCAL_BREAKER_UNIT_END : BREAKER_UNIT_END;
  }

  /** Start a unit: its breaker is intact and no call is a duplicate yet. Citations persist across the attempt. */
  startUnit(): void {
    this.#unitCaptures = [];
    this.#unitSearches = 0;
    this.#breaker.startUnit();
    this.#localBreaker.startUnit();
    this.#unitLocalCalls = 0;
    this.#unitSearchQuery = null;
    this.#unitSearchHasResult = false;
    this.#unitSearchRefused = false;
  }

  /**
   * What the unit in flight's tools brought back (Issue #425, S70): every search answer and fetched page it read, in order, as the
   * Research Snapshots they were answered from, and how many of its searches answered. Read when the unit settles, before
   * `startUnit` begins the next one.
   */
  get unitCaptures(): { readonly searches: ReadonlyArray<ResearchSnapshot>; readonly fetches: ReadonlyArray<ResearchSnapshot>; readonly searchCalls: number } {
    return {
      searches: this.#unitCaptures.filter((entry) => entry.tool === 'websearch').map((entry) => entry.snapshot),
      fetches: this.#unitCaptures.filter((entry) => entry.tool === 'webfetch').map((entry) => entry.snapshot),
      searchCalls: this.#unitSearches,
    };
  }

  /**
   * One retention fetch (ADR 0079 §3; SRC-013, EGR-003): AI7 fetching a page the model cited, after the unit's turn and outside
   * the model's tool loop, so the source is retained whole. It is the model's `webfetch` in every other respect — cited first,
   * decided by the same gate under the attempt's current binding, a single-use ticket, the host open only for it, answered
   * from the Research Snapshot Cache or sent once under the same test item purpose — but it is not one of the model's round
   * trips and never enters the model's context. Bounded by the citations: the caller asks once per cited page. A refusal or a
   * failure is returned, never retried.
   */
  async retain(url: string, signal?: AbortSignal): Promise<ResearchSnapshot | { readonly failed: string }> {
    if (this.#book === null) return { failed: '本次尝试未准许联网工具。' };
    if (this.#evidenceOnly) return { failed: '此证据项不取回网页。' };
    const canonical = canonicalPublicUrl(url);
    if (canonical === null) return { failed: '不是规范的公开 https 地址；未取回。' };
    const prior = this.#fetchedPages.get(canonical);
    if (prior !== undefined) return prior;
    this.#fetchedPages.set(canonical, { failed: '本次运行已尝试此来源；未能取回，不重试。' });
    this.cite(canonical);
    const decision = evaluatePublicSourceFetch({ arguments: { tool: 'webfetch', url: canonical } }, this.#binding, this.egressScope, this.#book);
    if (decision.decision !== 'fetch-public-source') return { failed: decision.detail };
    try {
      const settled = await this.#settle(
        { kind: 'fetch', purpose: this.#purpose, argumentsDigest: decision.ticket.argumentsDigest, host: decision.ticket.host, origin: 'webfetch' },
        {
          authorize: () => authorizePublicFetch({ ticket: decision.ticket, book: this.#book! }),
          send: (authorized) => sendPublicFetch(authorized, { fetch: this.#fetch, admitHost: this.#admitHost, ...(signal === undefined ? {} : { signal }) }),
        });
      if (settled.replayed) this.#book.revoke(decision.ticket);
      const result = settled.snapshot ?? { failed: `未能取回该来源（状态 ${settled.status}）；不重试。` };
      this.#fetchedPages.set(canonical, result);
      return result;
    } catch (error) {
      const code = error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'PLATFORM_TOOL_FAILED';
      return { failed: `取回失败（${code}）；不重试。` };
    }
  }

  /** Record a URL the model cited; only a cited or search-returned URL may be fetched (ADR 0079 §4.3). */
  cite(url: string): void {
    const canonical = canonicalPublicUrl(url);
    if (canonical !== null) this.#citations.add(canonical);
  }

  acceptToolCallMessage(digest: string): void {
    this.#acceptedToolCallDigests.add(digest);
  }

  admit(result: { readonly callId: string; readonly tool: PlatformToolName; readonly sourceUrl: string | null; readonly text: string }): void {
    // A call id is admitted once per attempt: a reused id never replaces the result its first call was answered with, so
    // the gate refuses whatever history would carry the second one.
    if ([...this.#admittedToolResults.values()].some((admitted) => admitted.callId === result.callId)) return;
    this.#admittedToolResults.set(toolResultKey(result.callId, result.tool), {
      callId: result.callId,
      sourceKind: 'tool',
      ...(result.tool === 'websearch' && this.#binding.searchBackend !== undefined ? { backendId: this.#binding.searchBackend.backendId } : {}),
      ...(result.sourceUrl === null ? {} : { host: new URL(result.sourceUrl).hostname, capturedAt: new Date().toISOString() }),
      tool: result.tool,
      sourceUrl: result.sourceUrl,
      sha256: sha256Hex(result.text),
      byteCount: Buffer.byteLength(result.text, 'utf8'),
    });
  }

  async execute(call: PlatformToolExecution): Promise<{ readonly text: string; readonly sourceUrl: string | null }> {
    if (isLocalToolName(call.tool)) return this.#executeLocal(call);
    if (this.#inFlight) return this.#refuseCounted('平台工具必须顺序调用。');
    this.#inFlight = true;
    try { return await this.#execute(call); }
    finally { this.#inFlight = false; }
  }

  async #executeLocal(call: PlatformToolExecution): Promise<{ readonly text: string; readonly sourceUrl: null }> {
    if (call.tool === 'retrieve') this.usage.retrievalCalls = (this.usage.retrievalCalls ?? 0) + 1;
    else if (call.tool === 'exact_fetch') this.usage.exactFetchCalls = (this.usage.exactFetchCalls ?? 0) + 1;
    if (this.#binding.localTools?.declarations !== undefined) {
      this.usage.localToolCalls ??= {};
      this.usage.localToolCalls[call.tool] = (this.usage.localToolCalls[call.tool] ?? 0) + 1;
    }
    this.#unitLocalCalls += 1;
    const refuse = (text: string): { text: string; sourceUrl: null } => { this.usage.refusedRetrievalCalls = (this.usage.refusedRetrievalCalls ?? 0) + 1; return refusal(text); };
    // Every local request counts, including malformed, concurrent, duplicate and over-cap refusals.
    if (this.#localBreaker.observe(`local:${++this.#localRoundTrips}`) === 'tripped') return refuse('检索未完成：本单元的工具往返已达到熔断上限。');
    const rule = this.#binding.localTools;
    if (rule?.targetedRetrieval.allowed !== true || this.#retrieval === null) return refuse('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    if (this.#base.currentBindingDigest() !== this.#binding.bindingDigest || call.signal.aborted) return refuse('RETRIEVAL_SOURCE_NOT_AUTHORIZED');
    if (this.#unitLocalCalls > rule.targetedRetrieval.callsPerUnit) return refuse('检索未完成：本单元的检索调用次数已用完，请使用已有结果。');
    if (!ruleNamedToolSchemas(false, rule).some((schema) => schema.name === call.tool)) return refuse('本次尝试未准许该工具。');
    if (this.#base.ceilingState?.() === 'reached') return refuse('已达到运行预算上限。');
    if (this.#inFlight || this.#localInFlight >= localToolParallelBound(rule) || this.#executedCallIds.has(call.callId)) return refuse('检索工具超出并行上限，或重复使用调用标识。');
    this.#executedCallIds.add(call.callId);
    const args = canonicalToolArguments(call.tool, call.arguments);
    if (args === null || !isLocalToolName(args.tool)) return refuse('检索参数无效。');
    this.#localInFlight += 1;
    try {
      let value: unknown;
      switch (args.tool) {
        case 'retrieve': value = await this.#retrieval.retrieve(args.query, args.k, args.sourceKinds); break;
        case 'exact_fetch': value = this.#retrieval.exactFetch(args.candidateId); break;
        case 'read_blocks': value = this.#retrieval.readBlocks(args.blockId, args.radius); break;
        case 'search_manuscript': value = this.#retrieval.searchManuscript(args.query, args.mode); break;
        case 'baseline_facts': case 'term_table': value = this.#retrieval.pinnedRecords(args.tool, args.query); break;
        case 'guideline_clause': value = this.#retrieval.pinnedRecords(args.tool, args.clauseId); break;
        default: return refuse('本次尝试未准许该工具。');
      }
      if (call.signal.aborted || this.#base.currentBindingDigest() !== this.#binding.bindingDigest) return refuse('检索未完成');
      const text = JSON.stringify(value);
      return Buffer.byteLength(text, 'utf8') > LOCAL_TOOL_RESULT_MAX_BYTES ? refuse('检索未完成：结果超过字节上限。') : { text, sourceUrl: null };
    } catch (error) {
      return refuse(error instanceof RetrievalError ? error.code : '检索未完成');
    } finally { this.#localInFlight -= 1; }
  }

  /**
   * A refused call is still one of the unit's tool round trips (ADR 0080 §7.4): it counts toward the breaker, so a model that
   * keeps asking — a different query after the unit's one, a malformed or repeated call — ends at 128 with 联网核查未完成
   * instead of looping; the refusal itself never trips the breaker earlier.
   */
  #refuseCounted(text: string): { readonly text: string; readonly sourceUrl: null } {
    this.#refusedRoundTrips += 1;
    return this.#breaker.observe(`refused:${this.#refusedRoundTrips}`) === 'tripped' ? refusal('联网核查未完成：本单元的工具往返已达到熔断上限。') : refusal(text);
  }

  async #settle<Authorized>(item: PlatformToolCallItem, call: { authorize(): Authorized; send(authorized: Authorized): Promise<PlatformToolCallResult> }): Promise<{ snapshot: ResearchSnapshot | null; status: number; replayed: boolean }> {
    const measured = { authorize: call.authorize, send: async (authorized: Authorized): Promise<PlatformToolCallResult> => {
      if (this.#evidenceOnly && item.kind === 'search-call' && Object.values(this.usage.searchCalls).some((count) => count > 0)) {
        this.evidenceNeedsCommander = true;
        throw Object.assign(new Error('本证据项需要第二次新检索；等待 Commander。'), { code: 'PLATFORM_TOOL_EVIDENCE_MORE_SEARCH_REQUIRED' });
      }
      this.usage.requests += 1;
      if (item.kind === 'search-call') {
        const id = this.#binding.searchBackend?.backendId ?? this.#searchOrigin;
        this.usage.searchCalls[id] = (this.usage.searchCalls[id] ?? 0) + 1;
      } else this.usage.fetchCount += 1;
      const result = await call.send(authorized);
      if (item.kind === 'fetch') this.usage.fetchBytes += result.bytes.byteLength;
      if (this.#binding.searchBackend?.backendId === 'search-deepseek' && item.kind === 'search-call') {
        try {
          const body = JSON.parse(new TextDecoder().decode(result.bytes)) as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
          const inputTokens = (body.usage?.input_tokens ?? 0) + (body.usage?.cache_read_input_tokens ?? 0);
          const outputTokens = body.usage?.output_tokens ?? 0;
          if (Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0) {
            this.usage.inputTokens += inputTokens; this.usage.outputTokens += outputTokens; this.#onUsage?.({ inputTokens, outputTokens });
          }
        } catch { /* No vendor payload leaves this boundary. */ }
      }
      this.provenance.push({ sourceKind: 'tool', backendId: item.kind === 'fetch' ? null : this.#binding.searchBackend?.backendId ?? null,
        host: item.host, capturedAt: new Date().toISOString(), argumentsDigest: item.argumentsDigest, responseDigest: sha256Hex(result.bytes) });
      return result;
    } };
    if (this.#cache !== null && this.#snapshots !== null) return platformToolCallOnce(this.#cache, this.#snapshots, item, measured);
    const result = await measured.send(measured.authorize());
    return { status: result.status, replayed: false, snapshot: result.status !== 200 || result.text === null ? null : {
      kind: item.kind, origin: item.origin, argumentsDigest: item.argumentsDigest, url: result.url, retrievedAt: new Date().toISOString(), status: result.status,
      contentType: result.contentType, responseDigest: sha256Hex(result.bytes), responseBytes: result.bytes.byteLength, bodyBase64: Buffer.from(result.bytes).toString('base64'), text: result.text,
    } };
  }

  async #execute(call: PlatformToolExecution): Promise<{ readonly text: string; readonly sourceUrl: string | null }> {
    if (this.#executedCallIds.has(call.callId)) return this.#refuseCounted('调用标识已在本次尝试中使用过；不执行。');
    this.#executedCallIds.add(call.callId);
    const args = canonicalToolArguments(call.tool, call.arguments);
    if (args === null) return this.#refuseCounted('参数不是这个工具接受的形式。');
    if (args.tool !== 'websearch' && args.tool !== 'webfetch' || this.#book === null) return this.#refuseCounted('本次尝试未准许该工具。');
    if (this.#evidenceOnly && args.tool === 'webfetch') return this.#refuseCounted('此最小证据项只执行一次检索往返；不取回网页。');
    const digest = toolArgumentsDigest(args);
    if (args.tool === 'websearch' && this.#oneQueryPerUnit) {
      if (this.#unitSearchQuery !== null && this.#unitSearchQuery !== digest) {
        this.usage.refusedSearchCalls += 1;
        this.#unitSearchRefused = true;
        // The model is told only that the unit's one search is spent, never that anything was verified.
        return this.#refuseCounted(`本单元的检索次数已用完；请使用已有结果。${this.unitDisclosure === '联网核查未完成' ? '联网核查未完成。' : ''}`);
      }
      this.#unitSearchQuery = digest;
      const reused = this.#runResults.get(digest);
      if (reused !== undefined) {
        if (this.#breaker.observe(digest) === 'tripped') return refusal('联网核查未完成：本单元的工具往返已达到熔断上限。');
        this.#unitSearchHasResult = reused.sourceUrl !== null && reused.text !== '[]';
        const kept = this.#searchSnapshots.get(digest);
        if (kept !== undefined) { this.#unitCaptures.push({ tool: 'websearch', snapshot: kept }); this.#unitSearches = 1; }
        return reused;
      }
    }
    const verdict = this.#breaker.observe(toolArgumentsDigest(args));
    if (verdict === 'duplicate') return refusal('同一工具调用已在本单元内执行过；不再重复。请使用已有结果。');
    if (verdict === 'tripped') return refusal('联网核查未完成：本单元的工具往返已达到熔断上限。');
    if (args.tool === 'webfetch') {
      const fetched = this.#fetchedPages.get(args.url);
      if (fetched !== undefined) {
        if ('failed' in fetched) return refusal(fetched.failed);
        this.#unitCaptures.push({ tool: 'webfetch', snapshot: fetched });
        return { text: fetched.text, sourceUrl: fetched.url };
      }
      this.#fetchedPages.set(args.url, { failed: '本次运行已尝试此来源；未能取回，不重试。' });
    }
    const prior = this.#runResults.get(digest);
    if (prior !== undefined && !(this.#cache !== null && this.#snapshots !== null && prior.sourceUrl !== null)) return prior;
    const scope = this.egressScope;
    this.#runResults.set(digest, refusal('本次运行已尝试此请求；不重试。'));
    try {
      if (args.tool === 'websearch') {
        // The call brings only its arguments: the gate derives the host and the category from the rule and the binding.
        const decision = evaluateSearchServiceCall({ arguments: args }, this.#binding, scope, this.#book);
        if (decision.decision !== 'call-search-service') return refusal(decision.detail);
        const settled = await this.#settle(
          { kind: 'search-call', purpose: this.#purpose, argumentsDigest: decision.ticket.argumentsDigest, host: decision.ticket.host, origin: this.#searchOrigin },
          {
            authorize: () => authorizeSearchCall({ ticket: decision.ticket, book: this.#book!, arguments: args }),
            send: (authorized) => sendSearchCall(authorized, this.#fetch, call.signal, this.#broker === undefined ? undefined : { broker: this.#broker, admitHost: this.#admitHost, modelRole: 'Main Editorial Role' }),
          });
        if (settled.replayed) this.#book.revoke(decision.ticket);
        if (settled.snapshot === null) return refusal(`搜索服务没有返回可用结果（状态 ${settled.status}）。`);
        for (const url of urlsIn(settled.snapshot.text)) this.cite(url);
        const result = { text: settled.snapshot.text, sourceUrl: settled.snapshot.url };
        this.#unitSearchHasResult = result.text !== '[]';
        this.#runResults.set(digest, result);
        this.#searchSnapshots.set(digest, settled.snapshot);
        this.#unitCaptures.push({ tool: 'websearch', snapshot: settled.snapshot });
        this.#unitSearches += 1;
        return result;
      }
      const decision = evaluatePublicSourceFetch({ arguments: args }, this.#binding, scope, this.#book);
      if (decision.decision !== 'fetch-public-source') return refusal(`${decision.detail}请改用下一条引用。`);
      const settled = await this.#settle(
        { kind: 'fetch', purpose: this.#purpose, argumentsDigest: decision.ticket.argumentsDigest, host: decision.ticket.host, origin: 'webfetch' },
        {
          authorize: () => authorizePublicFetch({ ticket: decision.ticket, book: this.#book! }),
          send: (authorized) => sendPublicFetch(authorized, { fetch: this.#fetch, admitHost: this.#admitHost, signal: call.signal }),
        });
      if (settled.replayed) this.#book.revoke(decision.ticket);
      if (settled.snapshot === null) return refusal(`未能取回该来源（状态 ${settled.status}）；请改用下一条引用。`);
      const result = { text: settled.snapshot.text, sourceUrl: settled.snapshot.url };
      this.#runResults.set(digest, result);
      this.#fetchedPages.set(args.url, settled.snapshot);
      this.#unitCaptures.push({ tool: 'webfetch', snapshot: settled.snapshot });
      return result;
    } catch (error) {
      const code = error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'PLATFORM_TOOL_FAILED';
      return refusal(`工具调用失败（${code}）；不重试。`);
    }
  }
}

/**
 * A unit its breaker ended (ADR 0080 §7.4): the disclosed state its affected findings carry, and the one way it settles —
 * the unit ends, unretried, and the Run goes on to its next unit.
 */
export interface PlatformToolUnitEnd {
  readonly reason: 'circuit-breaker-tripped';
  readonly disclosure: '联网核查未完成' | '检索未完成';
  readonly retry: 'never';
  readonly settles: 'unit-only';
}

const BREAKER_UNIT_END: PlatformToolUnitEnd = Object.freeze({
  reason: 'circuit-breaker-tripped',
  disclosure: '联网核查未完成',
  retry: 'never',
  settles: 'unit-only',
});
const LOCAL_BREAKER_UNIT_END: PlatformToolUnitEnd = Object.freeze({ reason: 'circuit-breaker-tripped', disclosure: LOCAL_TOOL_BREAKER_END, retry: 'never', settles: 'unit-only' });

function refusal(text: string): { readonly text: string; readonly sourceUrl: null } {
  return { text, sourceUrl: null };
}

/** Every absolute `https` URL a search answer names, for the citation set a later `webfetch` is bounded by. */
export function urlsIn(text: string): string[] {
  return [...text.matchAll(/https:\/\/[^\s<>"'()[\]{}，。；、）》]+/gu)].map((match) => {
    // Trailing sentence punctuation is not part of the address; trimmed by one backward walk, never a backtracking pattern.
    let end = match[0].length;
    while (end > 0 && '.,;:!?'.includes(match[0][end - 1]!)) end -= 1;
    return match[0].slice(0, end);
  });
}
