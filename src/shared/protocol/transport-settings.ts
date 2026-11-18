/**
 * The model-request transport settings of the ordinary-production launch projection (#1599). They are read from the
 * `transport` record of `config/runtime-execution-defaults.json`; no source constant carries a value.
 *
 * A request is bounded by what it is waiting for, not by how long its answer is: `firstByteSeconds` from the send until the
 * first byte of the answer body arrives (a whole-answer request has no byte before its answer is finished), `idleSeconds`
 * between received bytes after that, and `totalCeilingSeconds` as a far larger safety net. `connectionTestSeconds` is the
 * one short bound of a connection test, which asks a tiny question and must report a silent endpoint in seconds. A request
 * that reaches a bound after it was sent ends as an unknown outcome and is never resent.
 */
export interface TransportSettings {
  readonly firstByteSeconds: number;
  readonly idleSeconds: number;
  readonly totalCeilingSeconds: number;
  readonly connectionTestSeconds: number;
  readonly rateLimitRetry: { readonly honourRetryAfter: boolean; readonly maxRetries: number };
}

/**
 * The record as read from configuration, or a clear refusal: a bound that is not a positive finite number would make every
 * request time out the instant it is sent, so it is refused where the record is read, at launch.
 */
export function validatedTransportSettings(value: unknown): TransportSettings {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  for (const key of ['firstByteSeconds', 'idleSeconds', 'totalCeilingSeconds', 'connectionTestSeconds'] as const) {
    const seconds = record[key];
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`AI7_TRANSPORT_SETTINGS_INVALID: transport.${key} must be a positive number of seconds.`);
    }
  }
  const retry = record['rateLimitRetry'] as Record<string, unknown> | undefined;
  if (typeof retry?.['honourRetryAfter'] !== 'boolean' || !Number.isInteger(retry['maxRetries']) || (retry['maxRetries'] as number) < 0) {
    throw new Error('AI7_TRANSPORT_SETTINGS_INVALID: transport.rateLimitRetry is malformed.');
  }
  return value as TransportSettings;
}
