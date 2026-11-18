/**
 * The model-request transport settings of the ordinary-production launch projection (#1599). They are read from the
 * `transport` record of `config/runtime-execution-defaults.json`; no source constant carries a value.
 *
 * A request is bounded by what it is waiting for, not by how long its answer is: `firstByteSeconds` from the send to the
 * response headers (a whole-answer request returns them only when the answer is finished), `idleSeconds` between received
 * bytes once the headers are in, and `totalCeilingSeconds` as a far larger safety net. A request that reaches a bound after
 * it was sent ends as an unknown outcome and is never resent.
 */
export interface TransportSettings {
  readonly firstByteSeconds: number;
  readonly idleSeconds: number;
  readonly totalCeilingSeconds: number;
  readonly rateLimitRetry: { readonly honourRetryAfter: boolean; readonly maxRetries: number };
}
