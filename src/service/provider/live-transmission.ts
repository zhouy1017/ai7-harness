import { createHash } from 'node:crypto';
import { isProviderAccountLimit, type ProviderRouteProfile } from './deepseek-adapter.js';
import {
  ProviderResultCache,
  providerRequestDigest,
  usageOfResponse,
  type ProviderTestItemSlice,
} from './provider-result-cache.js';
import type { ResearchSnapshot, ResearchSnapshotCache } from './research-snapshot-cache.js';

/**
 * The once-only live transmission (ADR 0067, ADR 0070), shared by every path that sends to a model or a platform tool
 * (Issue #473, S87-f3a; ADR 0088 §5 names the extraction). It was the analysis path's private `transmitOnce`; the analysis
 * path still calls it with exactly the arguments it always passed, so its S40 items and ledger lines are byte-identical.
 * The dialogue (S17c) and the platform tools (S87) call the same owner with their own slice and item kind.
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

/**
 * One live call, at most once. The request digest is taken over the canonical body the adapter
 * assembled — the same bytes the gate admitted, and the only part of the request that ever reaches
 * the cache, since the headers carry the credential. An identical request replays from the cache and
 * transmits nothing; otherwise the call claims a fresh test item id, transmits once, and records the
 * result under it. A refused item id fails the turn rather than transmitting anyway.
 */
export async function transmitOnce(
  cache: ProviderResultCache,
  nativeFetch: LiveModelFetch,
  item: LiveModelCallItem,
  profile: ProviderRouteProfile,
  model: string,
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<{ status: number; json(): Promise<unknown> }> {
  const { purpose, promptContractDigest } = item;
  const requestDigest = providerRequestDigest(init.body);
  const replayed = await cache.lookup(model, requestDigest);
  if (replayed !== null) {
    await cache.record({
      itemId: cache.nextItemId(purpose, item.slice),
      purpose,
      model,
      promptContractDigest,
      requestDigest,
      outcome: 'replayed',
      status: replayed.status,
      usage: replayed.usage,
      recordedAt: new Date().toISOString(),
    });
    return { status: replayed.status, json: () => Promise.resolve(replayed.response) };
  }
  const itemId = cache.nextItemId(purpose, item.slice);
  cache.claimItem(itemId);
  const transmittedAt = new Date().toISOString();
  let response: { status: number; json(): Promise<unknown> };
  try {
    response = await nativeFetch(url, init);
  } catch (error) {
    await cache.record({
      itemId, purpose, model, promptContractDigest, requestDigest,
      outcome: 'failed', status: null, usage: null, recordedAt: new Date().toISOString(),
    });
    throw error;
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // 结果待确认 (Issue #51, S16c): accepted, and its answer never came back whole. It was transmitted, so its item is on the
    // ledger as sent with the status it carried — and never cached, so nothing ever replays it as a result. The adapter
    // reads the same unreadable answer, and ends the turn as an outcome it cannot know.
    if (response.status === 200) {
      await cache.record({
        itemId, purpose, model, promptContractDigest, requestDigest,
        outcome: 'failed', status: response.status, usage: null, classification: 'outcome-unknown', recordedAt: new Date().toISOString(),
      });
      return { status: response.status, json: () => Promise.reject(new Error('AI7_OUTCOME_UNKNOWN')) };
    }
    body = null;
  }
  const usage = usageOfResponse(body);
  // Only a result worth replaying is cached: a limit or a server error must be asked again later.
  if (response.status === 200) {
    await cache.store({ model, requestDigest, requestBody: init.body, status: response.status, response: body, usage, transmittedAt });
  }
  const accountLimit = isProviderAccountLimit(profile, response.status, body);
  const resetWindow = accountLimit ? providerResetWindow(body) : null;
  await cache.record({
    itemId,
    purpose,
    model,
    promptContractDigest,
    requestDigest,
    outcome: response.status === 200 ? 'transmitted' : 'failed',
    status: response.status,
    usage,
    ...(accountLimit ? { classification: 'quota-exhausted' as const } : {}),
    ...(resetWindow === null ? {} : { resetWindow }),
    recordedAt: new Date().toISOString(),
  });
  return { status: response.status, json: () => Promise.resolve(body) };
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
