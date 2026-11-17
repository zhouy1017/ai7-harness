/** Session-only way back from a finding; manuscript content stays with its existing owner. */
let target: { manuscriptId: string; branchId: string; ordinal: number; back: () => void } | null = null;

export function rememberReviewReturn(value: NonNullable<typeof target>): void { target = value; }

export function reviewReturnButton(manuscriptId: string, branchId: string): HTMLButtonElement | null {
  const place = target;
  if (!place || place.manuscriptId !== manuscriptId || place.branchId !== branchId) return null;
  const button = document.createElement('button');
  button.className = 'secondary return-chip';
  button.dataset['reviewReturn'] = String(place.ordinal);
  button.textContent = `回到审阅 · 第 ${place.ordinal} 条`;
  button.addEventListener('click', () => place.back());
  return button;
}
