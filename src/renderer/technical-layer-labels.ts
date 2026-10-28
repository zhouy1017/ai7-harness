/**
 * Identifiers live in the technical layer (ADR 0096 §3, ADR 0071 §1; Issue #1177): a Book identifier, a revision or decision
 * identifier, a digest or a raw receipt is never printed inline on 书库 cards, in the proposal workspace, in reimport choices or
 * in model settings; each stays one disclosure away behind 查看技术详情, and the words beside it say what it is.
 */
export const TECHNICAL_IDENTITY_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[0-9a-f]{64}\b|blk_[0-9a-f]{24}/iu;

/** A 书库 card's identities, behind its disclosure. */
export function bookIdentityRows(book: { readonly bookId: string; readonly stableIdentity: string }): ReadonlyArray<readonly [string, string]> {
  return [['图书 ID', book.bookId], ['稳定标识', book.stableIdentity]];
}

/** An exact Book target as a choice reads it: the service's label without the identity it ends with. */
export function bookChoiceWords(label: string, bookId: string): string {
  const suffix = ` · 图书 ID ${bookId}`;
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
}

/** The proposal workspace's preparation line: what an Apply would write, with no branch, revision or decision identity. */
export function proposalPreparationLine(bookTitle: string, decisionRecorded: boolean, included: number, nextJournalSequence: number): string {
  return `${bookTitle} · 决定${decisionRecorded ? '已记录' : '尚未记录'} · 纳入 ${included} 项 · 预计修订日志序号 ${nextJournalSequence}，写入一次新的受控稿件变更`;
}

/** The proposal workspace's identities of one view, behind its disclosure; an absent value is left out. */
export function proposalIdentityRows(values: Readonly<Record<string, string | null | undefined>>): ReadonlyArray<readonly [string, string]> {
  return Object.entries(values).flatMap(([label, value]) => value === null || value === undefined ? [] : [[label, value] as const]);
}
