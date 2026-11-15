import type { ReviewSynthesisProjection } from './protocol/review-synthesis.js';

export const REVIEW_SYNTHESIS_PLAN_LINE = '全书或多章审阅结束后，若覆盖多个阅读范围且已有模型发现，再向本次选定模型发送一次统合请求，计入本次预算。只发送发现摘要、证据引文与索引、可用的分章概述，不再发送稿件正文；最多选取 200 条代表发现、320 条证据和 200 段概述，受单次阅读容量限制时说明省略数量。参考资料与编辑记忆沿用同一处理方式；本社审阅偏好、编辑任务说明及豁免规则沿用首个模型审阅类别。各类别规范条款已体现在发现中，统合时不另附原条款。';

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
  ]), ...(value.missingCategories.length === 0 ? [] : [`以下类别未完整完成：${value.missingCategories.join('、')}。`]),
  ...(value.omissionLabel === null ? [] : [value.omissionLabel])];
}
