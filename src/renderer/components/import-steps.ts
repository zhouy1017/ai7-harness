/** A step may point into folded fidelity rows; reveal them before asking the browser to focus. */
export function focusImportStep(target: HTMLElement): void {
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') (parent as HTMLDetailsElement).open = true;
  }
  target.tabIndex = -1;
  target.scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });
}

/** One-page intake keeps its choices together; the pills name the work in order. */
export function importSteps(current: 'choices' | 'review' | 'complete', navigation?: { fidelity: boolean; go(step: 'target' | 'fidelity'): void }): HTMLElement {
  const steps = document.createElement('ol');
  steps.className = 'import-steps';
  steps.setAttribute('aria-label', '导入步骤');
  const active = current === 'choices' ? 1 : current === 'review' ? 2 : 3;
  ['选择文件', '目标与关系', '保真与结构', '导入'].forEach((label, index) => {
    const item = document.createElement('li');
    item.className = 'state-term';
    item.dataset['importStep'] = String(index + 1);
    item.textContent = label;
    if (navigation && (index === 1 || index === 2)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn quiet'; button.textContent = label;
      button.disabled = index === 2 && !navigation.fidelity;
      button.addEventListener('click', () => {
        for (const pill of Array.from(steps.children)) pill.removeAttribute('aria-current');
        item.setAttribute('aria-current', 'step'); navigation.go(index === 1 ? 'target' : 'fidelity');
      });
      item.replaceChildren(button);
    }
    if (index === active) item.setAttribute('aria-current', 'step');
    if (index < active || current === 'complete') item.dataset['complete'] = 'true';
    steps.append(item);
  });
  return steps;
}
