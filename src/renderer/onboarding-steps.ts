import type { BookSummaryProjection } from '../shared/protocol.js';
import { FIRST_RUN_CARD_LABELS as labels } from './onboarding-labels.js';

export function firstReviewBook<T extends Pick<BookSummaryProjection, 'bookId' | 'title' | 'manuscriptState'>>(books: readonly T[]): T | null {
  return books.length === 1 && books[0]?.manuscriptState === 'populated' ? books[0] : null;
}

export function firstRunModelConnected(roles: ReadonlyArray<{ roleId: string; status: string; connection: { credentialOperationState: string } | null }>): boolean {
  return roles.some(role => role.roleId === 'main-editorial' && role.status === 'available' && role.connection?.credentialOperationState === 'ready');
}

/** Each step opens an existing action; review becomes actionable after a manuscript exists. */
export function appendFirstRunSteps(
  steps: HTMLElement,
  element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K],
  button: (label: string, style: 'primary' | 'secondary' | 'quiet', action: () => void) => HTMLButtonElement,
  actions: { model: (() => void) | null; import: () => void; review: (() => void) | null; bookTitle?: string },
): void {
  for (const [title, note, label, action] of [
    [actions.model ? labels.modelStep : `${labels.modelStep} · 已连接`, labels.modelNote, labels.modelOpen, actions.model],
    [labels.importStep, '选择本机 DOCX 稿件。', '导入稿件', actions.import],
    [labels.startStep, actions.bookTitle ? `审阅《${actions.bookTitle}》。` : labels.startNote, '新建审阅', actions.review],
  ] as const) {
    const step = element('li');
    step.dataset['onboardingStepNumber'] = String(steps.children.length + 1);
    step.append(element('strong', undefined, title), element('p', undefined, note));
    if (action) step.append(button(label, 'secondary', action));
    steps.append(step);
  }
}
