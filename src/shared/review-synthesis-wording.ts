import type { ReviewSynthesisProjection } from './protocol/review-synthesis.js';

export const REVIEW_SYNTHESIS_PLAN_LINE = '全书或多章审阅结束后，若覆盖多个阅读范围且已有模型发现，再向本次选定模型发送一次统合请求，计入本次预算；达到本次预算上限后不再发送新的请求，已发出的请求仍计入用量。发送发现的说明与引文（各最多 80 字）、证据索引及可用的分章概述（每段最多 400 字），不发送这些内容以外的章节正文。最多选取 200 条代表发现与 200 条证据、200 段概述；按出现次数保留可引用的问题组，概述有独立的容量份额，并说明覆盖缺口与省略数量。参考资料与编辑记忆沿用同一处理方式；本社审阅偏好、编辑任务说明及豁免规则沿用首个模型审阅类别。各类别规范条款已体现在发现中，统合时不另附原条款。';

export function reviewSynthesisLines(value: ReviewSynthesisProjection): string[] {
  const summary = value.summary;
  const citation = (refs: readonly string[]): string => refs.flatMap((ref) => {
    const evidence = value.evidence.find((entry) => entry.ref === ref);
    return evidence === undefined ? [] : [`[${ref}] ${evidence.chapterLabel}「${evidence.quote}」${evidence.status === 'absent' ? '（已不在当前稿件中）' : evidence.status === 'pending' ? '' : '（已处理）'}`];
  }).join('；');
  return [value.detail, ...(summary === null ? [] : [
    `总体评价：${summary.overallAssessment}`,
    ...summary.recurringProblems.map((problem) => `${problem.title}：${problem.explanation}${problem.priority ? `；${problem.priority}` : ''}\n${citation(problem.evidenceRefs)}`),
    ...summary.contextualExplanations.map((item) => `结合全书可解释的情况：${item.explanation}\n${citation(item.evidenceRefs)}`),
    ...summary.priorities.map((priority, index) => `建议先处理 ${index + 1}：${priority}`),
  ]), ...(value.missingCategories.length === 0 ? [] : [`以下内容未完整覆盖：${value.missingCategories.join('、')}。`]),
  ...(value.omissionLabel === null ? [] : [value.omissionLabel])];
}

/** Editorial coverage labels contain ordinals, not manuscript words. Preserve every range exactly. */
export function reviewSynthesisOrdinalRanges(ordinals: readonly number[]): string {
  const sorted = [...new Set(ordinals)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const from = sorted[index]!;
    let to = from;
    while (sorted[index + 1] === to + 1) { index += 1; to += 1; }
    ranges.push(from === to ? String(from) : `${from}–${to}`);
  }
  return ranges.join('、');
}

export function reviewSynthesisOmissionLabel(omitted: { findings: number; clusters: number; synopses: number }): string | null {
  const parts = [omitted.findings > 0 ? `${omitted.findings} 条发现（${omitted.clusters} 组问题）` : null,
    omitted.synopses > 0 ? `${omitted.synopses} 段概述` : null].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : `受单次阅读容量限制，另有 ${parts.join('、')}未纳入统合。`;
}

/** An internal member may occur in older receipts, but its identifier is never editorial wording. */
export function reviewCategoryDisplayLabel(categoryId: string, label?: string): string {
  return categoryId === 'run-synthesis' ? '全书审阅统合总结' : label ?? categoryId;
}
