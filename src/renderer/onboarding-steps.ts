import { FIRST_RUN_CARD_LABELS as labels } from './onboarding-labels.js';

/** Each step opens an existing action; review becomes actionable after a manuscript exists. */
export function appendFirstRunSteps(
  steps: HTMLElement,
  element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K],
  button: (label: string, style: 'primary' | 'secondary' | 'quiet', action: () => void) => HTMLButtonElement,
  actions: { model: () => void; import: () => void; review: (() => void) | null },
): void {
  for (const [title, note, label, action] of [
    [labels.modelStep, labels.modelNote, labels.modelOpen, actions.model],
    [labels.importStep, '选择本机 DOCX 稿件。', '导入稿件', actions.import],
    [labels.startStep, labels.startNote, '新建审阅', actions.review],
  ] as const) {
    const step = element('li');
    step.append(element('strong', undefined, title), element('p', undefined, note));
    if (action) step.append(button(label, 'secondary', action));
    steps.append(step);
  }
}
