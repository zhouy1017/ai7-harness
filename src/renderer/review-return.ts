/**
 * Session-only way back from a finding, to the page 回到原文 was pressed on — 审阅, or 待办汇总 — and said as that page;
 * manuscript content stays with its existing owner. It lasts from 回到原文 until the editor
 * goes back, opens 审阅 for that Book another way, or leaves a reading return of their own (a task result's 跳到): the chip never
 * outlives the jump that made it, and never hides the 「回到<位置>」 chip of a later one.
 */
type ReviewReturn = { bookId: string; manuscriptId: string; branchId: string; ordinal: number; label: string; back: () => void };
let target: ReviewReturn | null = null;

/**
 * 回到原文 from `bookId`'s 审阅: a jump from a numbered finding leaves the way back to it; one from no finding leaves none.
 * `from` names another page the jump was made on (待办汇总), which numbers nothing: its way back is said by its name alone.
 */
export function leaveReviewReturn(bookId: string, jump: { ordinal?: number | undefined; manuscriptId: string; branchId: string }, back: () => void, from?: string): void {
  target = jump.ordinal === undefined ? null : { bookId, manuscriptId: jump.manuscriptId, branchId: jump.branchId, ordinal: jump.ordinal,
    label: from === undefined ? `回到审阅 · 第 ${jump.ordinal} 条` : `回到${from}`, back };
}

/** Forgets the way back: always, or only when it leads to `bookId`'s 审阅. */
export function clearReviewReturn(bookId?: string): void {
  if (bookId === undefined || target?.bookId === bookId) target = null;
}

export function reviewReturnButton(manuscriptId: string, branchId: string): HTMLButtonElement | null {
  const place = target;
  if (!place || place.manuscriptId !== manuscriptId || place.branchId !== branchId) return null;
  const button = document.createElement('button');
  button.className = 'secondary return-chip';
  button.dataset['reviewReturn'] = String(place.ordinal);
  button.textContent = place.label;
  button.addEventListener('click', () => {
    if (target === place) target = null;
    place.back();
  });
  return button;
}
