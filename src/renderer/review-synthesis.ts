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
  if (jump !== undefined) {
    const preview = document.createElement('span'); preview.className = 'review-synthesis-preview';
    preview.textContent = value.summary?.overallAssessment ?? value.detail; heading.append(preview);
  }
  root.append(heading);
  if (modelLabel) {
    const mark = document.createElement('p'); mark.className = 'review-synthesis-model'; mark.textContent = modelLabel; root.append(mark);
  }
  const paragraph = (text: string, refs: readonly string[] = []): void => {
    const node = document.createElement('p'); node.textContent = text;
    for (const ref of refs) {
      const evidence = value.evidence.find((entry) => entry.ref === ref);
      if (evidence === undefined) continue;
      if (evidence.status === 'absent' || evidence.blockId === null) {
        const absent = document.createElement('span'); absent.textContent = ` [${ref}] ${evidence.chapterLabel}（已不在当前稿件中）「${evidence.quote}」`; node.append(absent);
      } else {
        const link = document.createElement('button'); link.type = 'button'; link.className = 'quiet';
        link.dataset['synthesisEvidence'] = ref;
        link.textContent = `[${ref}] ${evidence.chapterLabel}${evidence.status === 'pending' ? '' : '（已处理）'}「${evidence.quote}」`;
        link.addEventListener('click', () => jump?.(evidence)); node.append(' ', link);
      }
    }
    root.append(node);
  };
  if (jump === undefined || value.summary === null) for (const line of reviewSynthesisLines(value)) paragraph(line);
  else {
    paragraph(`总体评价：${value.summary.overallAssessment}`);
    for (const item of value.summary.recurringProblems) paragraph(`${item.title}：${item.explanation}${item.priority ? `；${item.priority}` : ''}`, item.evidenceRefs);
    for (const item of value.summary.contextualExplanations) paragraph(`结合全书可解释的情况：${item.explanation}`, item.evidenceRefs);
    for (const [index, priority] of value.summary.priorities.entries()) paragraph(`建议先处理 ${index + 1}：${priority}`);
    if (value.missingCategories.length) paragraph(`以下类别未完整完成：${value.missingCategories.join('、')}。`);
    if (value.omissionLabel !== null) paragraph(value.omissionLabel);
  }
  return root;
}
