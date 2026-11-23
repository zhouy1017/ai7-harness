import { serviceWords } from './service-wording.js';
import type { ModelServiceSettingsProjection, ReviewSynthesisProjection } from '../shared/protocol.js';
import type { ModelFavourites } from '../shared/preferences.js';
import type { RuntimeExecutionConfig } from '../shared/runtime-execution-config.js';
import { reviewSynthesisLines } from '../shared/review-synthesis-wording.js';
import { createDispatchChooser } from './components/dispatch-chooser.js';
import { REVIEW_ACTION_LABELS } from './review-labels.js';

/**
 * 生成统合总结 (Issue #1506): the usual dispatch chooser, offering the Run's own model and 思考强度 first, and the one button.
 * 恢复默认 hands the role's default back, as every other start does.
 */
export function reviewSynthesisGenerateRow(runChoice: RuntimeExecutionConfig | undefined,
  load: () => Promise<{ settings: ModelServiceSettingsProjection; favourites: ModelFavourites } | null>, generate: (config: RuntimeExecutionConfig) => void): HTMLElement {
  let config: RuntimeExecutionConfig = runChoice ?? {};
  const chooser = createDispatchChooser({ role: 'main-editorial', changed: (next) => { config = next; } });
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'secondary'; button.dataset['reviewAction'] = 'generate-synthesis'; button.textContent = REVIEW_ACTION_LABELS['generate-synthesis'];
  button.addEventListener('click', () => generate(config));
  const row = document.createElement('div'); row.className = 'button-row review-synthesis-generate';
  row.append(chooser.element, button);
  void load().then((value) => { if (value === null) chooser.unavailable(); else chooser.render(value.settings, value.favourites, config); }, () => chooser.unavailable());
  return row;
}

/** Native disclosure keeps evidence keyboard reachable while leaving finding cards in view. */
export function reviewSynthesisNode(value: ReviewSynthesisProjection, modelLabel: string | undefined,
  jump?: (evidence: ReviewSynthesisProjection['evidence'][number]) => void): HTMLElement {
  value = { ...value, detail: serviceWords(value.detail), missingCategories: value.missingCategories.map((line) => serviceWords(line)) };
  const root = document.createElement(jump === undefined ? 'section' : 'details');
  root.className = 'review-synthesis';
  root.dataset['synthesisState'] = value.state;
  const heading = document.createElement(jump === undefined ? 'h5' : 'summary');
  heading.textContent = `全书审阅统合总结${value.summary === null ? '' : ` · ${value.summary.recurringProblems.length} 组共性问题`}`;
  if (jump !== undefined) {
    const preview = document.createElement('span'); preview.className = 'review-synthesis-preview';
    preview.textContent = (value.missingCategories.length ? '仅依据已读范围。' : '') + (value.summary?.overallAssessment ?? value.detail); heading.append(preview);
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
      if (evidence.blockId === null) {
        const absent = document.createElement('span'); absent.textContent = ` [${ref}] ${evidence.chapterLabel}（已不在当前稿件中）「${evidence.quote}」`; node.append(absent);
      } else {
        const link = document.createElement('button'); link.type = 'button'; link.className = 'quiet';
        link.dataset['synthesisEvidence'] = ref;
        link.textContent = `[${ref}] ${evidence.chapterLabel}${evidence.status === 'pending' ? '' : evidence.status === 'absent' ? '（原发现已不在，查看原文）' : '（已处理）'}「${evidence.quote}」`;
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
    if (value.missingCategories.length) paragraph(`以下内容未完整覆盖：${value.missingCategories.join('、')}。`);
    if (value.omissionLabel !== null) paragraph(value.omissionLabel);
  }
  return root;
}
