import type { ReviewSynthesisProjection } from '../shared/protocol.js';
import { reviewSynthesisLines } from '../shared/review-synthesis-wording.js';

/** Native disclosure keeps evidence keyboard reachable while leaving finding cards in view. */
export function reviewSynthesisNode(value: ReviewSynthesisProjection, modelLabel: string | undefined,
  jump?: (evidence: ReviewSynthesisProjection['evidence'][number]) => void): HTMLElement {
  const root = document.createElement(jump === undefined ? 'section' : 'details');
  root.className = 'review-synthesis';
  root.dataset['synthesisState'] = value.state;
  const heading = document.createElement(jump === undefined ? 'h5' : 'summary');
  heading.textContent = `全书审阅统合总结${value.summary === null ? '' : ` · ${value.summary.recurringProblems.length} 组共性问题`}`;
  root.append(heading);
  if (modelLabel) {
    const mark = document.createElement('p'); mark.className = 'review-synthesis-model'; mark.textContent = modelLabel; root.append(mark);
  }
  for (const line of reviewSynthesisLines(value)) {
    const paragraph = document.createElement('p'); paragraph.textContent = line; root.append(paragraph);
  }
  if (jump !== undefined && value.summary !== null) {
    const refs = new Set([...value.summary.recurringProblems, ...value.summary.contextualExplanations].flatMap((item) => item.evidenceRefs));
    const list = document.createElement('ul'); list.setAttribute('aria-label', '统合总结的原文依据');
    for (const evidence of value.evidence.filter((entry) => refs.has(entry.ref))) {
      const item = document.createElement('li');
      if (evidence.status === 'absent' || evidence.blockId === null) item.textContent = `[${evidence.ref}] ${evidence.chapterLabel}（已不在当前稿件中）「${evidence.quote}」`;
      else {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet';
        button.dataset['synthesisEvidence'] = evidence.ref;
        button.textContent = `[${evidence.ref}] ${evidence.chapterLabel}${evidence.status === 'pending' ? '' : '（已处理）'}「${evidence.quote}」`;
        button.addEventListener('click', () => jump(evidence)); item.append(button);
      }
      list.append(item);
    }
    root.append(list);
  }
  return root;
}
