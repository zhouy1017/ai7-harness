import type { CustomAnalysisRowProjection } from '../shared/protocol.js';

/**
 * ②A › 自定义's words (Issue #922, wave 10 slice 7f; ADR 0090 item 4; V2-UX-ANALYSIS-001, ANALYSIS-009): each enabled 自定义分析维度
 * of the house with this Book's latest result of it — coverage, freshness, gaps — its 运行, and its per-unit answers, each with
 * the quotation it rests on as a link back to the manuscript. 分析反馈 is not offered on these rows in this version.
 */
export const CUSTOM_TAB_LABEL = '自定义';
export const CUSTOM_TAB_EMPTY = '尚无自定义分析维度';
export const CUSTOM_TAB_EMPTY_NOTE = '在「知识库 › 工序与规则 › 自定义分析维度」中新建并启用一个维度后，它会出现在这里。';
export const CUSTOM_TAB_NOT_RUN = '尚未运行';
export const CUSTOM_TAB_RUN = '运行';
export const CUSTOM_TAB_READING = '正在读取自定义分析维度…';
export const CUSTOM_TAB_FEEDBACK_NOTE = '自定义维度的回答暂不提供分析反馈。';
export const CUSTOM_TAB_PREPARING = '正在为自定义分析准备任务计划…';
export const CUSTOM_TAB_PREPARED = '自定义分析的任务计划已准备：在右侧的任务计划里看过之后再开始任务。';

export function customTabVersionLine(version: number, revisionLabel: string, ordinal: number): string {
  return `第 ${ordinal} 份结果 · 按维度第 ${version} 版 · 读的是 ${revisionLabel}`;
}

export function customTabCountsLine(counts: { units: number; rows: number; located: number; unlocated: number }): string {
  return `${counts.units} 个单元作答 · ${counts.rows} 条回答 · ${counts.located} 条已定位原文${counts.unlocated === 0 ? '' : ` · ${counts.unlocated} 条未能定位`}`;
}

export function customTabGapLine(gap: { unitOrdinal: number; reason: string }): string {
  return `第 ${gap.unitOrdinal} 单元缺口：${gap.reason}`;
}

export function customTabMoreRows(shown: number): string {
  return `只列出前 ${shown} 条回答。`;
}

/** The quotation link's words, and why a row has none. */
export function customRowAnchorLabel(row: Pick<CustomAnalysisRowProjection, 'quote' | 'anchorState'>): string {
  switch (row.anchorState) {
    case 'located':
      return `「${row.quote}」`;
    case 'ambiguous':
      return `「${row.quote}」（在所指段落中出现不止一次，未定位）`;
    case 'not-found':
      return `「${row.quote}」（未在所指段落中找到，未定位）`;
  }
}
