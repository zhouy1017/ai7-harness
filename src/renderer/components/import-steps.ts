/** One-page intake keeps its choices together; the pills name the work in order. */
export function importSteps(current: 'choices' | 'review' | 'complete'): HTMLElement {
  const steps = document.createElement('ol');
  steps.className = 'import-steps';
  steps.setAttribute('aria-label', '导入步骤');
  const active = current === 'choices' ? 1 : 3;
  ['选择文件', '目标与关系', '保真与结构', '导入'].forEach((label, index) => {
    const item = document.createElement('li');
    item.className = 'state-term';
    item.dataset['importStep'] = String(index + 1);
    item.textContent = label;
    if (index === active) item.setAttribute('aria-current', 'step');
    if (index < active || current === 'complete') item.dataset['complete'] = 'true';
    steps.append(item);
  });
  return steps;
}
