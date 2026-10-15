/**
 * 未联网核查 on what AI7 read in the Book under the live route (Issue #429; ADR 0080 §7): the developer-live path has no web
 * verification, so a note AI7 rests a score, a passage or a rewritten 评语 on says so, in the words review's findings carry.
 * It follows the recorded result — the revision's own policy pin — at projection time only, and only on display-only basis
 * lines: never on a score, AI7's comment, a report section or rewritten words, which can become the editor's own words or a
 * later prompt's input.
 */
export const EVALUATION_UNVERIFIED_DISCLOSURE = '【未联网核查】' as const;

/** Whether a Result Set Revision was produced under the live route, by its recorded operational scope. */
export function producedUnverified(operationalScope: unknown): boolean {
  // Ordinary production's routes have no web verification either (Issue #811).
  return operationalScope === 'developer-live' || operationalScope === 'ordinary-production';
}

/** A basis note as shown: the disclosure first when the result it belongs to was produced unverified. */
export function disclosedNote(note: string, unverified: boolean): string {
  return unverified ? `${EVALUATION_UNVERIFIED_DISCLOSURE}${note}` : note;
}
