/**
 * 结果待确认's own words (Issue #51, S16c; Issue #757; V2-UX-CTRL-007, COPY-009, CONT-011, CONT-016; ADR 0034), shared by the
 * execution owner that writes them into a gap or a step's reason and by the ledger that reads them back.
 *
 * A reading range whose request was sent and whose answer never came back whole — so whether the model service processed and
 * billed it cannot be known — is never sent again in the same Run: no safe retry, no fallback, no 续行. It is kept at once as
 * its own gap `outcome-unknown`, in words that end with `OUTCOME_UNKNOWN_NOT_RESENT`; the way on is the editor's.
 */
export const OUTCOME_UNKNOWN_NOT_RESENT = '这次运行不会再发它，结果待确认' as const;
/** A range an earlier Run left 结果待确认 that this Run ended without reading (Issue #51, S16c): still that gap. */
export const OUTCOME_UNKNOWN_CARRIED = '这次运行结束前没有读到它，结果仍待确认' as const;

/**
 * A carried gap's words (Issue #757): the earlier Run's reason with its closing clause — 「这次运行不会再发它，结果待确认」 —
 * replaced by the carried one, never a second near-duplicate clause appended after it. Idempotent: words already carried stay
 * exactly as they are, however often the range is carried again, and words that end in neither clause gain the carried one.
 */
export function carriedOutcomeUnknownReason(reason: string): string {
  if (reason.endsWith(OUTCOME_UNKNOWN_CARRIED)) return reason;
  if (reason.endsWith(OUTCOME_UNKNOWN_NOT_RESENT)) return `${reason.slice(0, reason.length - OUTCOME_UNKNOWN_NOT_RESENT.length)}${OUTCOME_UNKNOWN_CARRIED}`;
  return `${reason}；${OUTCOME_UNKNOWN_CARRIED}`;
}

/** Whether a gap carried forward says so — the range was not sent by the Run whose revision holds it (Issue #757). */
export function saysCarried(reason: string): boolean {
  return reason.endsWith(OUTCOME_UNKNOWN_CARRIED);
}

/**
 * Whether a step's reason — the reduction's, a sample's or the reflection's — is 结果待确认's (Issue #757): the words
 * `ambiguousTurnReason` gives, and only those. A step has no gap code of its own on the Run Report, so the words are the record.
 */
export function saysOutcomeUnknown(reason: string): boolean {
  return reason.includes(`；${OUTCOME_UNKNOWN_NOT_RESENT}。`);
}
