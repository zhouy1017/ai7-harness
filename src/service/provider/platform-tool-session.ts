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
export class PlatformToolSession implements PlatformToolOwner {
  readonly #binding: EgressBindingFacts;
  readonly #base: Pick<EgressAttemptScope, 'currentBindingDigest' | 'acceptedOutputDigests' | 'ceilingState'>;
  readonly #fetch: PlatformToolFetch;
  readonly #admitHost: TicketHostAdmission;
  readonly #cache: ProviderResultCache;
  readonly #snapshots: ResearchSnapshotCache;
  readonly #purpose: string;
  /** Where a search goes, as the rule names it: the Research Snapshot Cache never answers one service's query with another's. */
  readonly #searchOrigin: string;
  readonly #breaker: PlatformToolBreaker;
  readonly #book: EgressTicketBook;
  readonly #acceptedToolCallDigests = new Set<string>();
  readonly #admittedToolResults = new Map<string, AdmittedToolResult>();
  readonly #citations = new Set<string>();
  readonly #executedCallIds = new Set<string>();

  constructor(deps: {
    readonly binding: EgressBindingFacts;
    readonly scope: Pick<EgressAttemptScope, 'currentBindingDigest' | 'acceptedOutputDigests' | 'ceilingState'>;
    readonly fetch: PlatformToolFetch;
    /** Per-ticket host admission: the network denial's `admitTicketHost`, keyed by each fetch ticket's id. */
    readonly admitHost: TicketHostAdmission;
    readonly cache: ProviderResultCache;
    readonly snapshots: ResearchSnapshotCache;
    /** The test item purpose every call of this attempt is recorded under. */
    readonly purpose: string;
    readonly breaker?: PlatformToolBreaker;
  }) {
    const rule = deps.binding.platformTools ?? null;
    if (rule === null || deps.binding.policy.operationalScope !== 'developer-live') throw new Error('PLATFORM_TOOLS_NOT_NAMED');
    this.#binding = deps.binding;
    this.#base = deps.scope;
    this.#fetch = deps.fetch;
    this.#admitHost = deps.admitHost;
    this.#cache = deps.cache;
    this.#snapshots = deps.snapshots;
    this.#purpose = deps.purpose;
    this.#searchOrigin = `${rule.websearch.service}@${rule.websearch.host}`;
    this.#breaker = deps.breaker ?? new PlatformToolBreaker();
    // The gate opens this attempt's book for this binding; every redemption re-reads the attempt's current binding (#676).
    this.#book = EgressTicketBook.open(deps.binding, { currentBindingDigest: () => this.#base.currentBindingDigest() });
  }

  /** The scope the gate evaluates every model call and every tool decision of this attempt against. */
  get egressScope(): EgressAttemptScope {
    return {
      ...this.#base,
      acceptedToolCallDigests: this.#acceptedToolCallDigests,
      admittedToolResults: this.#admittedToolResults,
      breakerState: () => this.#breaker.state,
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
  get unitDisclosure(): '联网核查未完成' | null {
    return this.#breaker.state === 'tripped' ? '联网核查未完成' : null;
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
    if (turn.terminal !== 'failed' || this.#breaker.state !== 'tripped') return null;
    const failed = turn.signals.find((signal) => signal.kind === 'failed');
    if (failed?.kind !== 'failed' || failed.failure.code !== AI7_FAILURE_CODES.PLATFORM_TOOL_BREAKER_TRIPPED) return null;
    return BREAKER_UNIT_END;
  }

  /** Start a unit: its breaker is intact and no call is a duplicate yet. Citations persist across the attempt. */
  startUnit(): void {
    this.#breaker.startUnit();
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
      tool: result.tool,
      sourceUrl: result.sourceUrl,
      sha256: sha256Hex(result.text),
      byteCount: Buffer.byteLength(result.text, 'utf8'),
    });
  }

  async execute(call: PlatformToolExecution): Promise<{ readonly text: string; readonly sourceUrl: string | null }> {
    if (this.#executedCallIds.has(call.callId)) return refusal('调用标识已在本次尝试中使用过；不执行。');
    this.#executedCallIds.add(call.callId);
    const args = canonicalToolArguments(call.tool, call.arguments);
    if (args === null) return refusal('参数不是这个工具接受的形式。');
    const verdict = this.#breaker.observe(toolArgumentsDigest(args));
    if (verdict === 'duplicate') return refusal('同一工具调用已在本单元内执行过；不再重复。请使用已有结果。');
    if (verdict === 'tripped') return refusal('联网核查未完成：本单元的工具往返已达到熔断上限。');
    const scope = this.egressScope;
    try {
      if (args.tool === 'websearch') {
        // The call brings only its arguments: the gate derives the host and the category from the rule and the binding.
        const decision = evaluateSearchServiceCall({ arguments: args }, this.#binding, scope, this.#book);
        if (decision.decision !== 'call-search-service') return refusal(decision.detail);
        const settled = await platformToolCallOnce(this.#cache, this.#snapshots,
          { kind: 'search-call', purpose: this.#purpose, argumentsDigest: decision.ticket.argumentsDigest, host: decision.ticket.host, origin: this.#searchOrigin },
          {
            authorize: () => authorizeSearchCall({ ticket: decision.ticket, book: this.#book, arguments: args }),
            send: (authorized) => sendSearchCall(authorized, this.#fetch, call.signal),
          });
        if (settled.replayed) this.#book.revoke(decision.ticket);
        if (settled.snapshot === null) return refusal(`搜索服务没有返回可用结果（状态 ${settled.status}）。`);
        for (const url of urlsIn(settled.snapshot.text)) this.cite(url);
        return { text: settled.snapshot.text, sourceUrl: settled.snapshot.url };
      }
      const decision = evaluatePublicSourceFetch({ arguments: args }, this.#binding, scope, this.#book);
      if (decision.decision !== 'fetch-public-source') return refusal(`${decision.detail}请改用下一条引用。`);
      const settled = await platformToolCallOnce(this.#cache, this.#snapshots,
        { kind: 'fetch', purpose: this.#purpose, argumentsDigest: decision.ticket.argumentsDigest, host: decision.ticket.host, origin: 'webfetch' },
        {
          authorize: () => authorizePublicFetch({ ticket: decision.ticket, book: this.#book }),
          send: (authorized) => sendPublicFetch(authorized, { fetch: this.#fetch, admitHost: this.#admitHost, signal: call.signal }),
        });
      if (settled.replayed) this.#book.revoke(decision.ticket);
      if (settled.snapshot === null) return refusal(`未能取回该来源（状态 ${settled.status}）；请改用下一条引用。`);
      return { text: settled.snapshot.text, sourceUrl: settled.snapshot.url };
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
  readonly disclosure: '联网核查未完成';
  readonly retry: 'never';
  readonly settles: 'unit-only';
}

const BREAKER_UNIT_END: PlatformToolUnitEnd = Object.freeze({
  reason: 'circuit-breaker-tripped',
  disclosure: '联网核查未完成',
  retry: 'never',
  settles: 'unit-only',
});

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
