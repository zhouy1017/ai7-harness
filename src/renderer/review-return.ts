/**
 * Session-only way back from a finding; manuscript content stays with its existing owner. It lasts from 回到原文 until the editor
 * goes back, opens 审阅 for that Book another way, or leaves a reading return of their own (a task result's 跳到): the chip never
 * outlives the jump that made it, and never hides the 「回到<位置>」 chip of a later one.
 */
type ReviewReturn = { bookId: string; manuscriptId: string; branchId: string; ordinal: number; back: () => void };
let target: ReviewReturn | null = null;

/** Remembers the way back to the finding just left, or forgets it (`null`) for a jump that came from no numbered finding. */
export function rememberReviewReturn(value: ReviewReturn | null): void { target = value; }

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
  button.textContent = `回到审阅 · 第 ${place.ordinal} 条`;
  button.addEventListener('click', () => {
    if (target === place) target = null;
    place.back();
  });
  return button;
}
