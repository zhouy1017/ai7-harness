import { createHash } from 'node:crypto';
import type { DevelopmentValidationIntent } from '../../shared/protocol.js';
import { dialogueSseEvents, isProviderAccountLimit, type DeepSeekTransportResponse, type DialogueStreamEvent, type ProviderRouteProfile } from './deepseek-adapter.js';
import {
  NO_INCURRED_USAGE,
  ProviderResultCache,
  ProviderResultCacheError,
  isModelCallLine,
  isSupportedProviderTestItemId,
  providerCacheKey,
  providerEvidenceGeneration,
  providerRequestDigest,
  providerResponseDigest,
  providerSemanticDigest,
  usageOfResponse,
  type ProviderCacheEntry,
  type ProviderClaim,
  type ProviderClaimRead,
  type ProviderLedgerLine,
  type ProviderRequestNamespace,
  type ProviderTestItemSlice,
  type ProviderValidationRecord,
} from './provider-result-cache.js';
import type { ResearchSnapshot, ResearchSnapshotCache } from './research-snapshot-cache.js';

/**
 * The once-only live transmission (ADR 0067, ADR 0070, ADR 0089), shared by every path that sends to a model or a platform tool
 * (Issue #473, S87-f3a; ADR 0088 §5 names the extraction). The analysis path calls it for every model call of a development
 * validation launch (Issue #808); the dialogue (S17c) and the platform tools (S87) call the same owner with their own slice and
 * item kind. A model call outside development validation never reaches it: the business path sends through its own transport
 * and reads and writes nothing here.
 */

/** The native `fetch` shape a live model call needs: the captured `fetch` of `DeveloperLiveRuntime`, or a test stub. */
export type LiveModelFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<DeepSeekTransportResponse>;

/** The named test item one live model call belongs to. */
export interface LiveModelCallItem {
  readonly purpose: string;
  /** S40 unless named: the analysis path's slice, and every line its ledger already carries. */
  readonly slice?: ProviderTestItemSlice;
  readonly promptContractDigest: string;
  readonly taskPromptContractDigest?: string;
}

/** The development validation one live model call belongs to (Issue #808): the launch's purpose, this call's step and shape. */
export interface LiveModelValidation {
  readonly intent: DevelopmentValidationIntent;
  /** The Task mode and the turn within it, stable across imports, Runs and attempts: `first-baseline/unit-3`. */
  readonly step: string;
  /** The wire shape of the request body, as the model profile declares it. */
  readonly requestShape: string;
}

/** What a live model call hands back: the response, and whether it was a replay that sent nothing and incurred nothing. */
export interface LiveModelResponse {
  readonly status: number;
  json(): Promise<unknown>;
  /** Set only when the cache answered: the response is the capture's, and this call incurred no usage. */
  readonly replayed?: true;
  stream?(): AsyncIterable<DialogueStreamEvent>;
}

type RequestIdentity = Pick<Required<ProviderLedgerLine>, 'route' | 'endpoint' | 'requestShape' | 'cacheKey' | 'claimKey' | 'semanticDigest' | 'generation' | 'evidencePosition'>;
type ClaimFacts = Omit<ProviderClaim, 'schema' | 'state'>;

const CONFIGURATION_FIELDS = ['route', 'endpoint', 'requestShape', 'model', 'promptContractDigest', 'taskPromptContractDigest'] as const;

function items(lines: ReadonlyArray<{ readonly itemId: string }>): string[] {
  return [...new Set(lines.map((line) => line.itemId))];
}

function itemList(lines: ReadonlyArray<{ readonly itemId: string }>): string {
  return items(lines).slice(0, 4).join('、');
}

/**
 * Decide one development validation call against verified capture provenance and the current ledger.
 * Exact requests replay only under their original namespace and active generation. Equivalent or
 * similar validation selects prior evidence, never another input's response. A substantive declared
 * delta permits new evidence; a possibly billed request instead needs a necessary retry reason and a
 * stopped sender. Claims are never moved out from under an active process: each attempt exclusively
 * creates the fixed successor of the attempt it observed. Original and incurred usage remain distinct.
 */
export async function transmitOnce(
  cache: ProviderResultCache,
  nativeFetch: LiveModelFetch,
  item: LiveModelCallItem,
  validation: LiveModelValidation,
  profile: ProviderRouteProfile,
  model: string,
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<LiveModelResponse> {
  const { intent } = validation;
  const step = validationStep(validation.step, init.body);
  const namespace: ProviderRequestNamespace = { route: profile.route, endpoint: url, requestShape: validation.requestShape, model };
  const requestDigest = providerRequestDigest(init.body);
  const cacheKey = providerCacheKey(namespace, requestDigest);
  const generation = providerEvidenceGeneration(namespace, item.promptContractDigest, item.taskPromptContractDigest);
  const semanticDigest = providerSemanticDigest(init.body);
  const claimKey = providerCacheKey(namespace, semanticDigest);
  let identity: RequestIdentity = {
    route: namespace.route, endpoint: namespace.endpoint, requestShape: namespace.requestShape, cacheKey, claimKey,
    semanticDigest, generation, evidencePosition: 0,
  };
  const decided = (decision: ProviderValidationRecord['decision'], evidence: ReadonlyArray<string>, changed?: ReadonlyArray<string>): ProviderValidationRecord => ({
    family: intent.family, case: intent.case, step, delta: intent.delta, decision, evidence, ...(changed === undefined ? {} : { changed }),
  });
  // A refusal sends nothing; its line says why and which items it rests on, so the report can tell a call the evidence
  // answered from one that was captured or replayed. The error carries the same reason to the turn.
  const refusal = async (code: string, message: string, evidence: ReadonlyArray<string>): Promise<ProviderResultCacheError> => {
    await cache.record({
      itemId: await cache.reserveItemId(item.purpose, item.slice), purpose: item.purpose, model, promptContractDigest: item.promptContractDigest,
      ...(item.taskPromptContractDigest === undefined ? {} : { taskPromptContractDigest: item.taskPromptContractDigest }),
      requestDigest, outcome: 'refused', status: null, usage: null, incurredUsage: NO_INCURRED_USAGE, ...identity,
      validation: { ...decided('refused', evidence), refusal: code }, recordedAt: new Date().toISOString(),
    });
    return new ProviderResultCacheError(code, message);
  };

  return cache.withRequestTurn(claimKey, async () => {
    await cache.refresh();
    identity = { ...identity, evidencePosition: cache.lines.length };
    // Foreign metadata grants no answer or retry authority. A missing capture/claim cannot erase a
    // possibly billed send; completed history releases only through the existing retirement rules.
    const foreignHistory = cache.lines.filter(isModelCallLine).filter((line) => !isSupportedProviderTestItemId(line.itemId) &&
      line.model === model && (line.route === undefined || line.route === namespace.route) &&
      (line.endpoint === undefined || line.endpoint === namespace.endpoint) &&
      (line.requestShape === undefined || line.requestShape === namespace.requestShape) &&
      (line.requestDigest === requestDigest || line.semanticDigest === semanticDigest) &&
      (line.classification === 'outcome-unknown' || (line.outcome === 'transmitted' && !cache.isRetired(line.itemId,
        line.validation === undefined ? null : {
          family: line.validation.family, case: line.validation.case, capturedAt: line.recordedAt,
          ...(line.evidencePosition === undefined ? {} : { evidencePosition: line.evidencePosition }),
        }))));
    if (foreignHistory.length > 0) {
      throw await refusal('PROVIDER_VALIDATION_OUTCOME_UNKNOWN',
        '其他切片已记录这个请求的发送或未知结果；未回放或重新发送可能已经计费的请求。', items(foreignHistory));
    }
    // 1. The exact request.
    const exact = await cache.readEntry(cacheKey);
    if (exact.state === 'corrupt') {
      throw await refusal('PROVIDER_VALIDATION_OUTCOME_UNKNOWN', '缓存证据无法核实；未重新发送可能已经计费的请求。', []);
    }
    const evidence = await cache.validEvidence();
    const claim = await cache.readClaim(claimKey);
    if (exact.state === 'present' && exact.entry.streamedAnswer?.complete !== false && exact.entry.generation === generation && !retiredCapture(cache, exact.entry)) {
      const recorded = evidence.some((line) => line.itemId === exact.entry.itemId && line.cacheKey === cacheKey);
      const claimed = 'claim' in claim && claim.claim.itemId === exact.entry.itemId && claim.claim.generation === generation &&
        claim.claim.semanticDigest === identity.semanticDigest;
      if (!recorded && !claimed) throw await refusal('PROVIDER_VALIDATION_EVIDENCE_UNAVAILABLE', '缓存没有可核实的原始记录或发送认领；未回放或重发。', []);
      return replay(cache, item, model, requestDigest, identity, exact.entry, decided('exact-replay', [exact.entry.itemId!]), null);
    }
    if (exact.state === 'absent') {
      const legacy = await cache.readLegacyEntry(model, requestDigest);
      const captured = legacyCaptures(cache, model, requestDigest);
      if (legacy.state !== 'absent' && (captured.length === 0 || captured.some((line) => !cache.isRetired(line.itemId, null)))) {
        throw await refusal('PROVIDER_VALIDATION_LEGACY_UNSCOPED',
          '旧证据没有可核实的路由、端点和请求格式，不能当作当前配置的答案或新请求许可；请核查并明确作废后再验证。', items(captured));
      }
    }
    // 2. The same question asked again under the same configuration.
    const repeated = evidence.filter((line) => line.generation === generation && line.semanticDigest === identity.semanticDigest);
    if (repeated.length > 0) {
      throw await refusal('PROVIDER_VALIDATION_EVIDENCE_EXISTS',
        `已有验证证据（${itemList(repeated)}）回答同一请求，只差系统生成的标识；未发送任何内容。请改用回放或由它生成的夹具。`, items(repeated));
    }
    // 3. A held request: possibly processed and billed.
    let record: ProviderValidationRecord;
    const retiredClaim = 'claim' in claim && cache.isRetired(claim.claim.itemId, {
      family: claim.claim.family, case: claim.claim.case, capturedAt: claim.claim.claimedAt,
      ...(claim.claim.evidencePosition === undefined ? {} : { evidencePosition: claim.claim.evidencePosition }),
    });
    // A lost claim is not proof of an unsent request. A surviving settled unknown line remains
    // authoritative, including legacy exact requests whose original namespace was never recorded.
    // Foreign history was checked against every available namespace fact before replay or claims.
    const sameRequest = cache.lines.filter(isModelCallLine).filter((line) => isSupportedProviderTestItemId(line.itemId) && line.model === model &&
      (line.cacheKey === undefined ? line.requestDigest === requestDigest :
        line.route === namespace.route && line.endpoint === namespace.endpoint && line.requestShape === namespace.requestShape &&
        line.semanticDigest === semanticDigest));
    const ledgerUnknown = claim.state === 'absent' ? sameRequest.filter((line) => line.classification === 'outcome-unknown') : [];
    const held = ledgerUnknown.length > 0 || (claim.state !== 'absent' && claim.state !== 'failed' &&
      !(claim.state === 'completed' && (retiredClaim || claim.claim.generation !== generation)));
    if (held) {
      const heldItems = 'claim' in claim ? [claim.claim.itemId] : ledgerUnknown.length > 0 ? items(ledgerUnknown) : ['unreadable'];
      const delta = intent.delta;
      if (delta?.kind !== 'retry-unknown' || !(ledgerUnknown.length > 0 || retryableClaim(claim))) {
        throw await refusal('PROVIDER_VALIDATION_OUTCOME_UNKNOWN',
          `这个请求（${heldItems.slice(0, 4).join('、')}）可能已处理并计费，或者发送方尚未退出；未再次发送。仅已停止且结果未知的发送可声明必要重试。`, heldItems);
      }
      // A repeated rationale does not grant another retry, even when the prompt contract changed.
      const attempted = sameRequest.some((line) => line.validation?.decision === 'retry-unknown' &&
        line.validation.delta?.rationale === delta.rationale);
      if (attempted || ('claim' in claim && claim.claim.retryRationales?.includes(delta.rationale))) {
        throw await refusal('PROVIDER_VALIDATION_RETRY_SPENT', '同一必要重试问题已有发送记录；请先核查其结果，不重复派发。', heldItems);
      }
      record = decided('retry-unknown', heldItems);
    } else {
      // 4 and 5. The purpose and step.
      // Case/family labels cannot grant another send. A new input class for an already covered stage needs a stated delta,
      // even when a tester renames the case, task mode or retry turn. Distinct generated unit/stage positions remain distinct.
      const slot = evidence.filter((line) => evidenceStep(line.validation!.step) === evidenceStep(step));
      const sameConfiguration = slot.filter((line) => line.generation === generation);
      if (sameConfiguration.length > 0) {
        if (intent.delta?.kind !== 'input') {
          throw await refusal('PROVIDER_VALIDATION_SIMILAR_EVIDENCE',
            `同一验证用途与步骤已有证据（${itemList(sameConfiguration)}），这次只是输入不同；未发送任何内容。请改用夹具回归，或声明 input 差异及其理由。`,
            items(sameConfiguration));
        }
        record = decided('input-delta', items(sameConfiguration));
      } else if (slot.length > 0) {
        // Measured against the nearest evidence: the capture that differs from this call in the fewest configuration fields.
        const now: Record<(typeof CONFIGURATION_FIELDS)[number], string | undefined> = {
          ...namespace, promptContractDigest: item.promptContractDigest, taskPromptContractDigest: item.taskPromptContractDigest,
        };
        const changed = slot.map((line) => CONFIGURATION_FIELDS.filter((field) => now[field] !== line[field]))
          .reduce((nearest, fields) => (fields.length < nearest.length ? fields : nearest));
        record = decided('config-delta', items(slot), changed);
      } else {
        record = decided('first-capture', []);
      }
    }
    const itemId = await cache.reserveItemId(item.purpose, item.slice);
    cache.claimItem(itemId);
    const claimFacts: ClaimFacts = {
      cacheKey: cache.successorKey(claim), itemId, claimedAt: new Date().toISOString(), family: intent.family, case: intent.case, step,
      processId: process.pid, generation, semanticDigest: identity.semanticDigest,
      evidencePosition: identity.evidencePosition,
      retryRationales: [
        ...('claim' in claim ? claim.claim.retryRationales ?? [] : []),
        ...(record.decision === 'retry-unknown' ? [intent.delta!.rationale] : []),
      ],
    };
    if (!(await cache.claim(claimFacts))) {
      throw await refusal('PROVIDER_VALIDATION_OUTCOME_UNKNOWN', '另一个发送方已经认领了这个请求，结果未知；未再次发送。', []);
    }
    return send(cache, nativeFetch, item, profile, model, url, init, { itemId, requestDigest, identity, record, claimFacts });
  });
}

/** A live sender, an unreadable claim, or an unproved legacy sender is never displaced by a retry. */
function retryableClaim(read: ProviderClaimRead): boolean {
  if (read.state === 'outcome-unknown') return true;
  if (read.state !== 'claimed' || !Number.isSafeInteger(read.claim.processId) || read.claim.processId! <= 0) return false;
  try {
    process.kill(read.claim.processId!, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function evidenceStep(step: string): string {
  return step.replace(/^[^/]+\/(?=(?:unit-\d+|reduction|sampling-\d+-unit-\d+|reflection)(?:\/|$))/u, '').replace(/\/turn-\d+$/u, '');
}

/** A retry counter is bookkeeping; a follow-up consuming actual tool results is another model-dependent stage. */
function validationStep(step: string, body: string): string {
  const base = step.replace(/\/(?:turn|tool-turn)-\d+$/u, '');
  try {
    const request: unknown = JSON.parse(body);
    if (request === null || typeof request !== 'object' || !('messages' in request) || !Array.isArray(request.messages)) return base;
    const tools = request.messages.filter((message: unknown) => message !== null && typeof message === 'object' &&
      'role' in message && message.role === 'tool').length;
    return tools === 0 ? base : `${base}/tool-turn-${tools}`;
  } catch { return base; }
}

async function send(
  cache: ProviderResultCache,
  nativeFetch: LiveModelFetch,
  item: LiveModelCallItem,
  profile: ProviderRouteProfile,
  model: string,
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
  facts: { readonly itemId: string; readonly requestDigest: string; readonly identity: RequestIdentity; readonly record: ProviderValidationRecord; readonly claimFacts: ClaimFacts },
): Promise<LiveModelResponse> {
  const { itemId, requestDigest, identity, record, claimFacts } = facts;
  const line = (settled: Pick<ProviderLedgerLine, 'outcome' | 'status' | 'usage' | 'incurredUsage' | 'classification' | 'resetWindow'>): ProviderLedgerLine => ({
    itemId, purpose: item.purpose, model, promptContractDigest: item.promptContractDigest, requestDigest,
    ...(item.taskPromptContractDigest === undefined ? {} : { taskPromptContractDigest: item.taskPromptContractDigest }),
    ...settled, ...identity, validation: record, recordedAt: new Date().toISOString(),
  });
  const transmittedAt = new Date().toISOString();
  let response: DeepSeekTransportResponse;
  try {
    response = await nativeFetch(url, init);
  } catch (error) {
    // Fetch rejection/abort does not prove that the server received or billed nothing.
    await cache.holdUnknown(claimFacts);
    await cache.record(line({ outcome: 'failed', status: null, usage: null, incurredUsage: null, classification: 'outcome-unknown' }));
    throw error;
  }
  if (identity.requestShape === 'editorial-dialogue-sse' && response.status === 200) {
    let consumed = false;
    return { status: response.status, json: () => Promise.reject(new Error('AI7_OUTCOME_UNKNOWN')), stream: async function* () {
      if (consumed) throw new Error('AI7_OUTCOME_UNKNOWN');
      consumed = true;
      const chunks: string[] = [];
      let aggregate: unknown = { model, choices: [{ message: { content: '' }, finish_reason: null }], usage: null };
      let complete = false;
      let kept = false;
      try {
        for await (const event of response.stream?.() ?? dialogueSseEvents(response, model)) {
          if (event.kind === 'text') chunks.push(event.text);
          else { aggregate = event.response; complete = true; }
          if (event.kind === 'text') yield event;
        }
        if (!complete) throw new Error('AI7_OUTCOME_UNKNOWN');
      } finally {
        if (!complete) {
          aggregate = { model, choices: [{ message: { content: chunks.join('') }, finish_reason: null }], usage: null };
          // Hold before keeping partial content: a saved prefix must never become permission to replay
          // or send again. The Harness alone owns the editor's preserved complete fragments.
          await cache.holdUnknown(claimFacts);
        }
        const usage = usageOfResponse(aggregate);
        try {
          await cache.keep({
            model, requestDigest, requestBody: init.body, status: response.status, response: aggregate, usage, transmittedAt,
            itemId, ...identity, promptContractDigest: item.promptContractDigest,
            ...(item.taskPromptContractDigest === undefined ? {} : { taskPromptContractDigest: item.taskPromptContractDigest }),
            validation: { family: record.family, case: record.case, step: record.step },
            responseDigest: providerResponseDigest(aggregate), streamedAnswer: { complete, chunks },
          });
          kept = true;
        } catch { kept = false; }
        if (!kept) await cache.holdUnknown(claimFacts);
        await cache.record(line({ outcome: complete ? 'transmitted' : 'failed', status: response.status, usage, incurredUsage: usage,
          ...(!complete || !kept ? { classification: 'outcome-unknown' as const } : {}) }));
        if (complete && kept) await cache.settle(claimFacts, 'completed');
      }
      // A complete event reaches the adapter only after its protected capture and ledger are durable.
      yield { kind: 'complete', response: aggregate };
    } };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 结果待确认 (Issue #51, S16c): accepted, and its answer never came back whole. The claim becomes a lasting hold before the
    // line is written, so no restart, renamed item or later Run can send it again without a declared retry; nothing is cached.
    if (response.status === 200) {
      await cache.holdUnknown(claimFacts);
      await cache.record(line({ outcome: 'failed', status: response.status, usage: null, incurredUsage: null, classification: 'outcome-unknown' }));
      return { status: response.status, json: () => Promise.reject(new Error('AI7_OUTCOME_UNKNOWN')) };
    }
    body = null;
  }
  const usage = usageOfResponse(body);
  // Only a 200 is kept. Explicit refusals settle; uncertain timeout/server outcomes remain held. The entry is kept before the
  // claim is settled; a crash between the two leaves both, and verified evidence answers. A 200 that cannot be kept leaves its claim
  // standing, so an answer that was paid for is never paid for again by accident.
  const uncertainStatus = response.status >= 500 || response.status === 408;
  let kept = response.status !== 200 && !uncertainStatus;
  if (response.status === 200) {
    try {
      await cache.keep({
        model, requestDigest, requestBody: init.body, status: response.status, response: body, usage, transmittedAt,
        itemId, ...identity, promptContractDigest: item.promptContractDigest,
        ...(item.taskPromptContractDigest === undefined ? {} : { taskPromptContractDigest: item.taskPromptContractDigest }),
        validation: { family: record.family, case: record.case, step: record.step },
        responseDigest: providerResponseDigest(body),
      });
      kept = true;
    } catch {
      kept = false;
    }
  }
  if (!kept) await cache.holdUnknown(claimFacts);
  const accountLimit = isProviderAccountLimit(profile, response.status, body);
  const resetWindow = accountLimit ? providerResetWindow(body) : null;
  await cache.record(line({
    outcome: response.status === 200 ? 'transmitted' : 'failed',
    status: response.status,
    usage,
    incurredUsage: usage,
    ...(accountLimit ? { classification: 'quota-exhausted' as const } : {}),
    ...(uncertainStatus ? { classification: 'outcome-unknown' as const } : {}),
    ...(resetWindow === null ? {} : { resetWindow }),
  }));
  if (kept) await cache.settle(claimFacts, response.status === 200 ? 'completed' : 'failed');
  return { status: response.status, json: () => Promise.resolve(body) };
}

async function replay(
  cache: ProviderResultCache,
  item: LiveModelCallItem,
  model: string,
  requestDigest: string,
  identity: RequestIdentity,
  entry: ProviderCacheEntry,
  record: ProviderValidationRecord,
  evidenceScope: 'legacy-unnamespaced' | null,
): Promise<LiveModelResponse> {
  await cache.record({
    itemId: await cache.reserveItemId(item.purpose, item.slice),
    purpose: item.purpose,
    model,
    promptContractDigest: item.promptContractDigest,
    ...(item.taskPromptContractDigest === undefined ? {} : { taskPromptContractDigest: item.taskPromptContractDigest }),
    requestDigest,
    outcome: 'replayed',
    status: entry.status,
    usage: entry.usage,
    incurredUsage: NO_INCURRED_USAGE,
    capturedAt: entry.transmittedAt,
    ...identity,
    validation: record,
    ...(evidenceScope === null ? {} : { evidenceScope }),
    recordedAt: new Date().toISOString(),
  });
  return { status: entry.status, json: () => Promise.resolve(entry.response), replayed: true };
}

/** Whether a namespaced entry's capture is retired, by its own item or by its purpose. */
function retiredCapture(cache: ProviderResultCache, entry: ProviderCacheEntry): boolean {
  if (entry.itemId === undefined) return false;
  return cache.isRetired(entry.itemId, entry.validation === undefined ? null : {
    ...entry.validation, capturedAt: entry.transmittedAt,
    ...(entry.evidencePosition === undefined ? {} : { evidencePosition: entry.evidencePosition }),
  });
}

/** The lines that transmitted a legacy entry — lines written before #808, which carry no namespaced key. */
function legacyCaptures(cache: ProviderResultCache, model: string, requestDigest: string): ProviderLedgerLine[] {
  return cache.lines.filter(isModelCallLine).filter((line) => line.cacheKey === undefined && line.outcome === 'transmitted' &&
    line.model === model && line.requestDigest === requestDigest);
}

/** The reset window a limit response stated, when it stated one; recorded in the ledger, never guessed. */
export function providerResetWindow(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== 'object') return null;
  for (const key of ['reset_at', 'resets_at', 'reset', 'retry_after']) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** What one platform-tool call brought back, before the Research Snapshot Cache keeps it. */
export interface PlatformToolCallResult {
  readonly url: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly bytes: Uint8Array;
  /** The text for the model, or `null` when nothing usable came back; only a usable 200 is kept. */
  readonly text: string | null;
}

/** The named test item one platform-tool call belongs to (ADR 0080 §7.6): S87 unless named. */
export interface PlatformToolCallItem {
  readonly kind: 'search-call' | 'fetch';
  readonly purpose: string;
  readonly slice?: ProviderTestItemSlice;
  readonly argumentsDigest: string;
  readonly host: string;
  /** Where the call goes, as the rule names it — the Research Snapshot Cache's key beside the arguments. */
  readonly origin: string;
}

/**
 * One platform-tool call, at most once (ADR 0080 §7.4, §7.6). The Research Snapshot Cache answers an identical call — same
 * origin, same tool, same canonical arguments — and nothing leaves the host. Otherwise `authorize` redeems the call's
 * ticket first: a ticket that does not redeem refuses the call before any test item is claimed, so the ledger never shows
 * a live item that was never sent. Then the call claims a fresh test item, `send` sends it once, a usable answer is kept,
 * and the ledger records the arguments' digest, the host, the result's digest and size, and the elapsed time — never the
 * text.
 */
export async function platformToolCallOnce<Authorized>(
  cache: ProviderResultCache,
  snapshots: ResearchSnapshotCache,
  item: PlatformToolCallItem,
  call: { authorize(): Authorized; send(authorized: Authorized): Promise<PlatformToolCallResult> },
  now: () => number = Date.now,
): Promise<{ readonly snapshot: ResearchSnapshot | null; readonly status: number; readonly replayed: boolean; readonly kept: boolean }> {
  const slice = item.slice ?? 'S87';
  const replayed = await snapshots.lookup(item.kind, item.origin, item.argumentsDigest);
  if (replayed !== null) {
    await cache.record({
      itemId: cache.nextItemId(item.purpose, slice), kind: item.kind, purpose: item.purpose, argumentsDigest: item.argumentsDigest,
      host: item.host, outcome: 'replayed', status: replayed.status, resultDigest: replayed.responseDigest,
      resultBytes: replayed.responseBytes, elapsedMs: 0, recordedAt: new Date().toISOString(),
    });
    return { snapshot: replayed, status: replayed.status, replayed: true, kept: true };
  }
  const authorized = call.authorize();
  const itemId = cache.nextItemId(item.purpose, slice);
  cache.claimItem(itemId);
  const started = now();
  let result: PlatformToolCallResult;
  try {
    result = await call.send(authorized);
  } catch (error) {
    await cache.record({
      itemId, kind: item.kind, purpose: item.purpose, argumentsDigest: item.argumentsDigest, host: item.host, outcome: 'failed',
      status: null, resultDigest: null, resultBytes: null, elapsedMs: now() - started, recordedAt: new Date().toISOString(),
    });
    throw error;
  }
  const elapsedMs = now() - started;
  const responseDigest = createHash('sha256').update(result.bytes).digest('hex');
  const usable = result.status === 200 && result.text !== null;
  const snapshot: ResearchSnapshot | null = usable
    ? {
        kind: item.kind,
        origin: item.origin,
        argumentsDigest: item.argumentsDigest,
        url: result.url,
        retrievedAt: new Date(started).toISOString(),
        status: result.status,
        contentType: result.contentType,
        responseDigest,
        responseBytes: result.bytes.byteLength,
        bodyBase64: Buffer.from(result.bytes).toString('base64'),
        text: result.text!,
      }
    : null;
  // The ledger line first: a call that was sent is on the ledger whatever happens to its snapshot (ADR 0067 live-once).
  await cache.record({
    itemId, kind: item.kind, purpose: item.purpose, argumentsDigest: item.argumentsDigest, host: item.host,
    outcome: usable ? 'transmitted' : 'failed', status: result.status, resultDigest: responseDigest,
    resultBytes: result.bytes.byteLength, elapsedMs, recordedAt: new Date().toISOString(),
  });
  // A snapshot that cannot be kept (a full disk, a refused rename) leaves the call sent and answered but not kept: the
  // model still reads the answer, and only a later identical call misses the cache.
  let kept = false;
  if (snapshot !== null) {
    try {
      await snapshots.store(snapshot);
      kept = true;
    } catch {
      kept = false;
    }
  }
  return { snapshot, status: result.status, replayed: false, kept };
}
