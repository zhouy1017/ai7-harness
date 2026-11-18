import defaults from '../../../config/runtime-execution-defaults.json' with { type: 'json' };
import { validatedTransportSettings, type TransportSettings } from '../../shared/protocol/transport-settings.js';

/**
 * The transport record every model request without a projected one reads (developer-live, and any caller that passes none):
 * the same `transport` record the ordinary-production projection copies, never a constant in source (#1599). A malformed
 * record is refused here, when the service loads it.
 */
export const DEFAULT_TRANSPORT_SETTINGS: TransportSettings = validatedTransportSettings(defaults.transport);

/** A connection test asks a tiny question: it waits `connectionTestSeconds` for any answer at all, and no longer. */
export function connectionTestTransport(settings: TransportSettings = DEFAULT_TRANSPORT_SETTINGS): TransportSettings {
  return { ...settings, firstByteSeconds: settings.connectionTestSeconds, totalCeilingSeconds: settings.connectionTestSeconds };
}

/**
 * The bounds of one sent model request (#1599). It is bounded by what it waits for, not by how long its answer is:
 * `firstByteSeconds` from the send until the first byte of the answer body arrives (a whole-answer request has none before
 * its answer is finished, so this is the longest generation tolerated), then `idleSeconds` of silence between received
 * bytes, and `totalCeilingSeconds` as a far larger safety net. Reaching any of them aborts `signal` with a `TimeoutError`;
 * the adapter reads that as an unknown outcome, never resent.
 */
export class RequestDeadlines {
  readonly #abort: AbortController = new AbortController();
  readonly #settings: Pick<TransportSettings, 'firstByteSeconds' | 'idleSeconds' | 'totalCeilingSeconds'>;
  #pending: ReturnType<typeof setTimeout> | undefined;
  #ceiling: ReturnType<typeof setTimeout> | undefined;
  #stopped = false;

  constructor(settings: Pick<TransportSettings, 'firstByteSeconds' | 'idleSeconds' | 'totalCeilingSeconds'>) { this.#settings = settings; }

  get signal(): AbortSignal { return this.#abort.signal; }

  /** The request is about to leave: the first-byte and total bounds start. */
  start(): void {
    this.#arm(this.#settings.firstByteSeconds);
    this.#ceiling = setTimeout(() => this.#expire(), this.#settings.totalCeilingSeconds * 1000);
  }

  /** Answer bytes arrived: the first-byte bound ends at the first of them, and the idle gap starts again with each. */
  activity(): void {
    this.#arm(this.#settings.idleSeconds);
  }

  /** Every exit: no timer outlives the request. */
  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#pending);
    clearTimeout(this.#ceiling);
  }

  #arm(seconds: number): void {
    if (this.#stopped) return;
    clearTimeout(this.#pending);
    this.#pending = setTimeout(() => this.#expire(), seconds * 1000);
  }

  #expire(): void {
    this.stop();
    this.#abort.abort(new DOMException('模型请求超过时限。', 'TimeoutError'));
  }
}

/**
 * The lowest layer that sees a model response's bytes tells the adapter that some arrived, keyed by the request object the
 * adapter handed to the transport (the same identity the no-send proof of a request uses). Reasoning frames and keep-alive
 * comments carry no answer text, so the adapter cannot see them above the byte stream.
 */
const REQUEST_ACTIVITY = new WeakMap<object, () => void>();

export function observeRequestActivity(request: object, activity: () => void): void { REQUEST_ACTIVITY.set(request, activity); }

export function noteRequestActivity(request: object | undefined): void {
  if (request !== undefined) REQUEST_ACTIVITY.get(request)?.();
}
