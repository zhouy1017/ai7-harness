import { SOURCE_TRANSLATION_LABEL } from './protocol.js';
import type { EvidenceSourceCardProjection, ResearchEvidenceProjection, ReviewEvidenceSource, ReviewFindingCountsProjection } from './protocol.js';

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

// ---- a factual finding's sources (ADR 0095 §5; Issue #1174) ---------------------------------------------------

export const REVIEW_REPORT_STATISTICS_CHAPTER = '章节';
export const REVIEW_REPORT_TOTAL = '合计';

/** 概览表's line for the whole Run in a /2 record. */
export function reviewReportTotalsLine(counts: ReviewFindingCountsProjection): string {
  return `全部发现：${reviewCountsLine(counts)}`;
}
export const FINDING_EVIDENCE_HEADING = '来源';
export const FINDING_EVIDENCE_SNIPPET = '摘录';
export const FINDING_EVIDENCE_IN_BOOK = '书内资料';

/**
 * The sources a factual finding's card and its 审阅报告 row list: the result's own source cards less the ones the editor
 * excluded, each joined by `evidenceId` to the retained row 来源与证据 archives for its 来源译文. Only an exact excerpt is
 * quoted (EVID-004); the note is the card's own check state and relation. Pure, so the card and the file say the same.
 */
export function findingEvidenceSources(cards: ReadonlyArray<EvidenceSourceCardProjection>, retained: ReadonlyArray<ResearchEvidenceProjection>): ReviewEvidenceSource[] {
  const rows = new Map(retained.map((record) => [record.evidenceId, record] as const));
  return cards.filter((card) => card.excluded !== true).map((card) => {
    const row = card.evidenceId === null ? undefined : rows.get(card.evidenceId);
    const url = card.sourceKind === 'web' ? card.sourceRef : null;
    let host: string | null = null;
    try { host = url === null ? null : new URL(url).hostname; } catch { host = url; }
    return {
      name: card.title?.trim() || row?.sourceTitle?.trim() || host || FINDING_EVIDENCE_IN_BOOK,
      url,
      snippet: card.excerpt,
      translation: row?.translation?.state === 'translated' ? row.translation.text : null,
      note: `${card.checkLabel} · ${card.relation}`,
      evidenceId: card.evidenceId,
    };
  });
}

/** A merged 发现详单 row's heading: its categories, severity and status, then where it stands. */
export function reviewReportFindingHeading(index: number, entry: { categoryLabels: ReadonlyArray<string>; severityLabel: string; statusLabel: string }): string {
  return `第 ${index} 条 · ${entry.categoryLabels.join('、')} · ${entry.severityLabel} · ${entry.statusLabel}`;
}

/** The lines under a 发现详单 row's heading: place, quotation, suggested text when there is one, and reason. */
export function reviewReportFindingLines(entry: { chapterLabel: string; locationLabel: string; quote: string; suggestedText: string | null; reason: string }): string[] {
  return [
    entry.chapterLabel.length === 0 ? entry.locationLabel : `${entry.chapterLabel} · ${entry.locationLabel}`,
    `引文：「${entry.quote}」`,
    ...(entry.suggestedText === null ? [] : [`建议改为：${entry.suggestedText.length === 0 ? '（删去）' : `「${entry.suggestedText}」`}`]),
    `理由：${entry.reason}`,
  ];
}

/** 「另有 3 条发现未列入详单；每一条仍在审阅的卡片上。」, or `null` when every row is listed. */
export function reviewReportOmittedLine(omitted: number): string | null {
  return omitted === 0 ? null : `另有 ${omitted} 条发现未列入详单；每一条仍在审阅的卡片上。`;
}

/** A source's words after its name: the verification note, its excerpt and its 来源译文. */
export function findingEvidenceLines(source: ReviewEvidenceSource): string[] {
  return [
    source.note,
    ...(source.snippet === null ? [] : [`${FINDING_EVIDENCE_SNIPPET}：「${source.snippet}」`]),
    ...(source.translation === null ? [] : [`${SOURCE_TRANSLATION_LABEL}：${source.translation}`]),
  ];
}
