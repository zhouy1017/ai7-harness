import { createHash } from 'node:crypto';
import type { DevelopmentValidationIntent } from '../../shared/protocol.js';
import { isProviderAccountLimit, type ProviderRouteProfile } from './deepseek-adapter.js';
import {
  NO_INCURRED_USAGE,
  ProviderResultCache,
  ProviderResultCacheError,
  isModelCallLine,
  providerCacheKey,
  providerEvidenceGeneration,
  providerRequestDigest,
  providerResponseDigest,
  providerSemanticDigest,
  usageOfResponse,
  type ProviderCacheEntry,
  type ProviderClaim,
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
) => Promise<{ status: number; json(): Promise<unknown> }>;

/** The named test item one live model call belongs to. */
export interface LiveModelCallItem {
  readonly purpose: string;
  /** S40 unless named: the analysis path's slice, and every line its ledger already carries. */
  readonly slice?: ProviderTestItemSlice;
  readonly promptContractDigest: string;
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
}

type RequestIdentity = Pick<Required<ProviderLedgerLine>, 'route' | 'endpoint' | 'requestShape' | 'cacheKey' | 'semanticDigest' | 'generation'>;
type ClaimFacts = Omit<ProviderClaim, 'schema' | 'state'>;

const CONFIGURATION_FIELDS = ['route', 'endpoint', 'requestShape', 'model', 'promptContractDigest'] as const;

function items(lines: ReadonlyArray<{ readonly itemId: string }>): string[] {
  return [...new Set(lines.map((line) => line.itemId))];
}

function itemList(lines: ReadonlyArray<{ readonly itemId: string }>): string {
  return items(lines).slice(0, 4).join('、');
}

/**
 * One development validation call, sent at most once and only when existing evidence cannot answer it (ADR 0067, ADR 0089,
 * Issue #808). The request is keyed by its whole namespace — route, endpoint, request shape, model and the digest of its full
 * canonical body, the same bytes the gate admitted and the only part of the request that ever reaches the cache, since the
 * headers carry the credential. Inside its request's turn, against the ledger as it stands:
 *
 * 1. An identical request whose capture is not retired replays from the cache and transmits nothing. Its line records the
 *    capture's original usage beside this call's incurred usage, which is none. An entry written before #808 replays the same
 *    way, its line saying its route and endpoint were never recorded.
 * 2. A request that differs from valid evidence only in minted identities — the same semantic digest under the same
 *    configuration, whatever family, case or delta it is filed under — is the same question asked again: it is refused and
 *    names that evidence. Renaming the purpose never makes it new.
 * 3. A request that is held — claimed and never settled (in flight elsewhere, or left by a process that died), sent with an
 *    unknown result, or kept in an entry that no longer reads — is possibly processed and billed. It is refused, unless the
 *    launch declares `retry-unknown`, which resends it once per rationale and records which item it resends.
 * 4. Valid evidence for the same purpose and step under the same configuration, with a different input, is similar evidence:
 *    the request is refused unless the launch declares an `input` delta, which the semantic digest has just verified.
 * 5. Evidence for the purpose and step under another configuration cannot answer this one: the call is sent and the line names
 *    what changed. With no evidence at all, the call is the first capture.
 *
 * A send claims the request durably before anything leaves the host, keeps a 200 whole under its key before releasing the
 * claim, and turns the claim into a lasting hold when the answer never comes back whole. A refusal sends nothing: its line
 * records why and which items it rests on, and the turn fails with that reason. Similarity only ever chooses which evidence
 * answers or refuses a request: a request is never answered with another request's response.
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
  const { intent, step } = validation;
  const namespace: ProviderRequestNamespace = { route: profile.route, endpoint: url, requestShape: validation.requestShape, model };
  const requestDigest = providerRequestDigest(init.body);
  const cacheKey = providerCacheKey(namespace, requestDigest);
  const generation = providerEvidenceGeneration(namespace, item.promptContractDigest);
  const identity: RequestIdentity = {
    route: namespace.route, endpoint: namespace.endpoint, requestShape: namespace.requestShape, cacheKey,
    semanticDigest: providerSemanticDigest(init.body), generation,
  };
  const decided = (decision: ProviderValidationRecord['decision'], evidence: ReadonlyArray<string>, changed?: ReadonlyArray<string>): ProviderValidationRecord => ({
    family: intent.family, case: intent.case, step, delta: intent.delta, decision, evidence, ...(changed === undefined ? {} : { changed }),
  });
  // A refusal sends nothing; its line says why and which items it rests on, so the report can tell a call the evidence
  // answered from one that was captured or replayed. The error carries the same reason to the turn.
  const refusal = async (code: string, message: string, evidence: ReadonlyArray<string>): Promise<ProviderResultCacheError> => {
    await cache.record({
      itemId: cache.nextItemId(item.purpose, item.slice), purpose: item.purpose, model, promptContractDigest: item.promptContractDigest,
      requestDigest, outcome: 'refused', status: null, usage: null, incurredUsage: NO_INCURRED_USAGE, ...identity,
      validation: { ...decided('refused', evidence), refusal: code }, recordedAt: new Date().toISOString(),
    });
    return new ProviderResultCacheError(code, message);
  };

  return cache.withRequestTurn(cacheKey, async () => {
    await cache.refresh();
    // 1. The exact request.
    const exact = await cache.readEntry(cacheKey);
    if (exact.state === 'present' && !retiredCapture(cache, exact.entry)) {
      return replay(cache, item, model, requestDigest, identity, exact.entry, decided('exact-replay', [exact.entry.itemId!]), null);
    }
    let legacyCorrupt = false;
    if (exact.state === 'absent') {
      const legacy = await cache.readLegacyEntry(model, requestDigest);
      legacyCorrupt = legacy.state === 'corrupt';
      const captured = legacyCaptures(cache, model, requestDigest);
      if (legacy.state === 'present' && legacy.entry.requestBody === init.body && !captured.some((line) => cache.isRetired(line.itemId, null))) {
        return replay(cache, item, model, requestDigest, identity, legacy.entry, decided('exact-replay', captured.map((line) => line.itemId)), 'legacy-unnamespaced');
      }
    }
    const evidence = cache.validEvidence();
    // 2. The same question asked again under the same configuration.
    const repeated = evidence.filter((line) => line.generation === generation && line.semanticDigest === identity.semanticDigest);
    if (repeated.length > 0) {
      throw await refusal('PROVIDER_VALIDATION_EVIDENCE_EXISTS',
        `已有验证证据（${itemList(repeated)}）回答同一请求，只差系统生成的标识；未发送任何内容。请改用回放或由它生成的夹具。`, items(repeated));
    }
    // 3. A held request: possibly processed and billed.
    const claim = await cache.readClaim(cacheKey);
    let record: ProviderValidationRecord;
    if (claim.state !== 'absent' || exact.state === 'corrupt' || legacyCorrupt) {
      const heldItem = claim.state === 'claimed' || claim.state === 'outcome-unknown' ? claim.claim.itemId : null;
      const held = [heldItem ?? 'unreadable'];
      const delta = intent.delta;
      if (delta?.kind !== 'retry-unknown') {
        throw await refusal('PROVIDER_VALIDATION_OUTCOME_UNKNOWN',
          `这个请求${heldItem === null ? '' : `（${heldItem}）`}已经发出或正在发送，结果未知，可能已被处理并计费；未再次发送。确需重发时，请声明 retry-unknown 及其理由。`, held);
      }
      const spent = cache.lines.filter(isModelCallLine).some((line) => line.cacheKey === cacheKey &&
        line.validation?.decision === 'retry-unknown' && line.validation.delta?.rationale === delta.rationale);
      if (spent) throw await refusal('PROVIDER_VALIDATION_RETRY_SPENT', '这项 retry-unknown 理由已经重发过这个请求一次；未再次发送。', held);
      // The hold is moved aside, kept, so this send can claim afresh; an unreadable legacy entry stays where it is, and the
      // namespaced entry this send keeps answers before it from now on.
      const movable = claim.state !== 'absent' || exact.state === 'corrupt';
      if (movable && !(await cache.setAsideHold(cacheKey, claim.state === 'absent'))) {
        throw await refusal('PROVIDER_VALIDATION_OUTCOME_UNKNOWN', '另一个发送方刚刚接手了这个结果未知的请求；未再次发送。', held);
      }
      record = decided('retry-unknown', held);
    } else {
      // 4 and 5. The purpose and step.
      const slot = evidence.filter((line) => line.validation!.family === intent.family && line.validation!.case === intent.case && line.validation!.step === step);
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
        const now: Record<(typeof CONFIGURATION_FIELDS)[number], string | undefined> = { ...namespace, promptContractDigest: item.promptContractDigest };
        const changed = slot.map((line) => CONFIGURATION_FIELDS.filter((field) => now[field] !== line[field]))
          .reduce((nearest, fields) => (fields.length < nearest.length ? fields : nearest));
        record = decided('config-delta', items(slot), changed);
      } else {
        record = decided('first-capture', []);
      }
    }
    const itemId = cache.nextItemId(item.purpose, item.slice);
    cache.claimItem(itemId);
    const claimFacts: ClaimFacts = { cacheKey, itemId, claimedAt: new Date().toISOString(), family: intent.family, case: intent.case, step };
    if (!(await cache.claim(claimFacts))) {
      throw await refusal('PROVIDER_VALIDATION_OUTCOME_UNKNOWN', '另一个发送方已经认领了这个请求，结果未知；未再次发送。', []);
    }
    return send(cache, nativeFetch, item, profile, model, url, init, { itemId, requestDigest, identity, record, claimFacts });
  });
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
    ...settled, ...identity, validation: record, recordedAt: new Date().toISOString(),
  });
  const transmittedAt = new Date().toISOString();
  let response: { status: number; json(): Promise<unknown> };
  try {
    response = await nativeFetch(url, init);
  } catch (error) {
    // A transport rejection settles as it always has: failed, no status, and the request free to be asked again later.
    await cache.record(line({ outcome: 'failed', status: null, usage: null, incurredUsage: null }));
    await cache.release(identity.cacheKey);
    throw error;
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
  // Only a result worth replaying is kept: a limit or a server error must be asked again later. The entry is kept before the
  // claim is released; a crash between the two leaves both, and the entry answers. A 200 that cannot be kept leaves its claim
  // standing, so an answer that was paid for is never paid for again by accident.
  let kept = response.status !== 200;
  if (response.status === 200) {
    try {
      await cache.keep({
        model, requestDigest, requestBody: init.body, status: response.status, response: body, usage, transmittedAt,
        itemId, ...identity, promptContractDigest: item.promptContractDigest,
        validation: { family: record.family, case: record.case, step: record.step },
        responseDigest: providerResponseDigest(body),
      });
      kept = true;
    } catch {
      kept = false;
    }
  }
  const accountLimit = isProviderAccountLimit(profile, response.status, body);
  const resetWindow = accountLimit ? providerResetWindow(body) : null;
  await cache.record(line({
    outcome: response.status === 200 ? 'transmitted' : 'failed',
    status: response.status,
    usage,
    incurredUsage: usage,
    ...(accountLimit ? { classification: 'quota-exhausted' as const } : {}),
    ...(resetWindow === null ? {} : { resetWindow }),
  }));
  if (kept) await cache.release(identity.cacheKey);
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
    itemId: cache.nextItemId(item.purpose, item.slice),
    purpose: item.purpose,
    model,
    promptContractDigest: item.promptContractDigest,
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
  return cache.isRetired(entry.itemId, entry.validation === undefined ? null : { ...entry.validation, capturedAt: entry.transmittedAt });
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
