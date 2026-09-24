import type { ReviewFindingCountsProjection } from './protocol.js';

/**
 * The words a 审阅报告 is written in (V2-UX-REV-009), on screen and in the file it exports to (Issue #500, S64b
 * part 2; ADR 0079 §3.4): one owner, so the exported report says exactly what 审阅 shows. The renderer's labels
 * re-export them; the service's report writer lays them out.
 */

export const REVIEW_REPORT_HEADING = '审阅报告';
export const REVIEW_REPORT_NO_MUST_ITEMS = '没有必须处理的事项。';
export const REVIEW_REPORT_OVERVIEW_COLUMNS = ['类别', '状态', '发现'] as const;

/**
 * The Decision Layer's form of an instant (V2-UX-LAYER-004): absolute local date and time, 24-hour, to
 * the second. It never replaces the exact instant, which sits beside it in the technical layer; an
 * unparsable value is returned as it came, because inventing a time is worse than showing a raw one.
 * `hourCycle` is stated rather than `hour12: false`, which reports midnight as hour 24 in some locales.
 */
export function localInstantLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

/** Findings by severity and by status, each counted once in both. */
export function reviewCountsLine(counts: ReviewFindingCountsProjection): string {
  return `必须处理 ${counts.must} · 建议处理 ${counts.should} · 提示 ${counts.note} · 待处理 ${counts.pending} · 已处理 ${counts.handled} · 已忽略 ${counts.ignored}`;
}

export function reviewReportVersionLine(version: number, generatedAtLabel: string): string {
  return `第 ${version} 版 · 生成于 ${generatedAtLabel}`;
}

export function reviewReportMustItemLine(item: { categoryLabel: string; locationLabel: string; quote: string; note: string; statusLabel: string }): string {
  return `${item.categoryLabel} · ${item.locationLabel} · 「${item.quote}」 · ${item.note} · ${item.statusLabel}`;
}

export function reviewReportExcludedLine(excluded: number): string {
  return excluded === 0 ? '列出的发现都已在稿件上定位' : `另有 ${excluded} 条无法在稿件上定位，没有列为发现`;
}

/** One recorded version of a 审阅报告 as an export names it: in its file name, its card and its record. */
export function reportExportLabel(runLabel: string, version: number): string {
  return `审阅报告 · ${runLabel}审阅 · 第 ${version} 版`;
}

export function reviewReportConfigurationLine(version: string): string {
  return `审阅配置第 ${version} 版`;
}

/** 附录: what a category applied — its guideline documents and its 工序, each with its version (REV-009, REV-012). */
export function reviewReportAppendixLine(category: {
  label: string;
  guidelineDocuments: ReadonlyArray<{ issuer: string; title: string; version: string }>;
  procedure: { title: string; version: string };
}): string {
  const documents = category.guidelineDocuments.length === 0
    ? '没有规范文件'
    : category.guidelineDocuments.map((document) => `${document.issuer} · ${document.title}（第 ${document.version} 版）`).join('、');
  return `${category.label}：${documents}；工序：${category.procedure.title}（第 ${category.procedure.version} 版）`;
}
