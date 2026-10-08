/**
 * The 新建审阅 sheet's choice of a Captured Procedure version, kept honest while it loads (Issue #66, plan slice S31 review P2-1;
 * REUSE-054: the version the sheet shows is the version that enters the plan). Pure, so the unit suite reads it as the sheet does.
 *
 * Each choice asks the service for its resolution; only the answer to the newest question may fill the sheet, and while any
 * question is open the sheet is loading: 先看计划 waits. A preparation also refuses when the version on show is not the one the
 * sheet holds.
 */
export class ProcedureChoiceRequests {
  #asked = 0;
  #answered = 0;

  /** A new choice: its ticket, which supersedes every earlier one. */
  ask(): number {
    this.#asked += 1;
    return this.#asked;
  }

  /** Whether the answer to `ticket` may still fill the sheet: it answers the newest choice. */
  current(ticket: number): boolean {
    return ticket === this.#asked;
  }

  /** The newest choice has its answer (or failed); an older ticket settles nothing. */
  settle(ticket: number): void {
    if (ticket === this.#asked) this.#answered = ticket;
  }

  /** A choice is waiting for its answer. */
  get loading(): boolean {
    return this.#answered !== this.#asked;
  }
}

export const SHEET_PROCEDURE_LOADING = '正在读取所选的可复用工序；读取完成后再看计划。' as const;
export const SHEET_PROCEDURE_VERSION_MISMATCH = '显示的版本与已读取的工序不一致；请重新选择版本。' as const;

/**
 * The pin a preparation carries, or why it may not start: never while a choice loads, and never for a version other than the
 * one the selector shows. `shownVersionId` is the selector's value, `null` when the sheet shows none.
 */
export function procedurePreparationPin(
  resolved: { readonly versionId: string; readonly documentSha256: string } | null,
  shownVersionId: string | null,
  loading: boolean,
): { pin: { versionId: string; documentSha256: string } | null; refusal: string | null } {
  if (loading) return { pin: null, refusal: SHEET_PROCEDURE_LOADING };
  if (resolved === null) return { pin: null, refusal: null };
  if (shownVersionId !== resolved.versionId) return { pin: null, refusal: SHEET_PROCEDURE_VERSION_MISMATCH };
  return { pin: { versionId: resolved.versionId, documentSha256: resolved.documentSha256 }, refusal: null };
}
