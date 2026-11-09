import type { ExportFidelityRowProjection, ManuscriptExportFormat, ReviewEvidenceSource, ReviewReportRecord } from '../shared/protocol.js';
import {
  FINDING_EVIDENCE_HEADING,
  REVIEW_REPORT_HEADING,
  REVIEW_REPORT_NO_MUST_ITEMS,
  REVIEW_REPORT_OVERVIEW_COLUMNS,
  REVIEW_REPORT_STATISTICS_CHAPTER,
  REVIEW_REPORT_TOTAL,
  findingEvidenceLines,
  localInstantLabel,
  reviewCountsLine,
  reviewReportAppendixLine,
  reviewReportConfigurationLine,
  reviewReportExcludedLine,
  reviewReportFindingHeading,
  reviewReportFindingLines,
  reviewReportMustItemLine,
  reviewReportOmittedLine,
  reviewReportTotalsLine,
  reviewReportVersionLine,
} from '../shared/report-wording.js';
import { escapeWordText, fidelityRow, freshBodyPackage } from './docx-export.js';
import { PRINT_BASE_STYLE, escapeHtml, escapeLineStart, escapeMarkdown, htmlLines, printPage } from './text-export.js';

/**
 * One version of a Review Run's 审阅报告 as a file (Issue #500, plan slice S64b part 2; V2-UX-REV-009; ADR 0079 §3.4):
 * the report exports in the manuscript's formats — DOCX primary, PDF optional, Markdown the 备用格式 — under the same
 * preparation, approval and receipt. The file says what 审阅 shows: its title, the Run and version it reports, and its
 * four parts — 概览表, 必须处理的事项, 各类别摘要 and 附录 — in the words `src/shared/report-wording.ts` owns. A /2 record
 * (ADR 0095 §5; Issue #1174) also writes the Run's totals under 概览表, 章节与类别统计 as a table, and 发现详单 with each
 * finding's sources as links; a /1 record writes exactly what it wrote before.
 *
 * The writer is pure: a report version is immutable, so the same version always gives the same bytes on one machine.
 * The generation time is written in the machine's local time, as 审阅 shows it.
 */
export const REPORT_EXPORT_WRITER_IDENTITIES: Readonly<Record<ManuscriptExportFormat, string>> = {
  docx: 'ai7-report-docx/2',
  pdf: 'ai7-report-pdf/1',
  markdown: 'ai7-report-markdown/1',
};

export interface ReportExportInput {
  bookTitle: string;
  version: number;
  generatedAt: string;
  record: ReviewReportRecord;
}

export interface ReportExportResult {
  /** The file, or for PDF the page the main process prints; `null` when only the review was asked for. */
  bytes: Uint8Array | null;
  fidelity: ExportFidelityRowProjection[];
  degraded: boolean;
}

/** The report as a file states it, whatever the format. */
interface ReportLayout {
  title: string;
  meta: string;
  overview: { title: string; columns: ReadonlyArray<string>; rows: ReadonlyArray<ReadonlyArray<string>>; totals: string | null };
  mustItems: { title: string; items: ReadonlyArray<string> };
  statistics: null | { title: string; columns: ReadonlyArray<string>; rows: ReadonlyArray<ReadonlyArray<string>> };
  findings: null | { title: string; entries: ReadonlyArray<ReportFindingLayout>; omitted: string | null };
  summaries: { title: string; entries: ReadonlyArray<{ heading: string; lines: ReadonlyArray<string> }> };
  appendix: { title: string; lines: ReadonlyArray<string> };
}

interface ReportFindingLayout {
  heading: string;
  lines: ReadonlyArray<string>;
  sources: ReadonlyArray<ReviewEvidenceSource>;
}

function layoutOf(input: ReportExportInput): ReportLayout {
  const { record } = input;
  // A category's state in the file is the decision layer's (reading 4): the overview's own label, never the technical
  // line a refused or stopped category carries — its policy, its model binding, its failure code.
  const stateLabels = new Map(record.overview.rows.map((row) => [row.categoryId, row.stateLabel] as const));
  return {
    title: `${input.bookTitle} · ${REVIEW_REPORT_HEADING}`,
    meta: `${record.run.label}审阅 · ${record.run.scopeLabel} · 稿件修订版 ${record.run.manuscript.revisionLabel} · 报告${reviewReportVersionLine(input.version, localInstantLabel(input.generatedAt))}`,
    overview: {
      title: record.overview.title,
      columns: REVIEW_REPORT_OVERVIEW_COLUMNS,
      rows: record.overview.rows.map((row) => [row.label, row.stateLabel, reviewCountsLine(row.counts)]),
      totals: record.totals === undefined ? null : reviewReportTotalsLine(record.totals),
    },
    mustItems: { title: record.mustItems.title, items: record.mustItems.items.map(reviewReportMustItemLine) },
    statistics: record.statistics === undefined ? null : {
      title: record.statistics.title,
      columns: [REVIEW_REPORT_STATISTICS_CHAPTER, ...record.statistics.categories.map((category) => category.label), REVIEW_REPORT_TOTAL],
      rows: [...record.statistics.rows.map((row) => [row.label, ...row.counts.map(String), String(row.total)]),
        [REVIEW_REPORT_TOTAL, ...record.statistics.totals.map(String), String(record.statistics.total)]],
    },
    findings: record.findings === undefined ? null : {
      title: record.findings.title,
      entries: record.findings.entries.map((entry, index) => ({ heading: reviewReportFindingHeading(index + 1, entry), lines: reviewReportFindingLines(entry), sources: entry.sources })),
      omitted: reviewReportOmittedLine(record.findings.omitted),
    },
    summaries: {
      title: record.categorySummaries.title,
      entries: record.categorySummaries.entries.map((entry) => ({
        heading: stateLabels.has(entry.categoryId) ? `${entry.label} · ${stateLabels.get(entry.categoryId)!}` : entry.label,
        lines: [reviewCountsLine(entry.counts), entry.basisStatement, reviewReportExcludedLine(entry.excludedCount)],
      })),
    },
    appendix: {
      title: record.appendix.title,
      lines: [reviewReportConfigurationLine(record.appendix.configuration.version), ...record.appendix.categories.map(reviewReportAppendixLine),
        ...(record.appendix.referencedRules ?? []).flatMap((finding) => finding.rules.map((rule) =>
          `${finding.categoryLabel} · ${finding.locationLabel} · 已参考规则：${rule.text}（本社审阅偏好 v${rule.ordinal} · ${rule.versionId} · 行 ${rule.lineIndex + 1}）`))],
    },
  };
}

// ---- DOCX ---------------------------------------------------------------------------------------------

/** Runs of one text, each line break a `w:br`, bold when asked. */
function wordRuns(text: string, bold = false): string {
  const properties = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return text.split('\n').map((line, index) =>
    `${index > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r>${properties}<w:t xml:space="preserve">${escapeWordText(line)}</w:t></w:r>`).join('');
}

function wordParagraph(text: string, style: string | null = null): string {
  return `<w:p>${style === null ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`}${wordRuns(text)}</w:p>`;
}

/** The address a link may carry: an http(s) one only; anything else is written as words. */
function linkTarget(url: string | null): string | null {
  return url !== null && /^https?:\/\//iu.test(url) ? url : null;
}

/** A source in Word: its name a HYPERLINK field to its address — no relationship part needed — then its address and words. */
function wordSource(source: ReviewEvidenceSource): string {
  const name = `${FINDING_EVIDENCE_HEADING}：${source.name}`;
  const target = linkTarget(source.url);
  const link = target === null ? wordRuns(name)
    : `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> HYPERLINK "${escapeWordText(target.replace(/"/gu, '%22'))}" </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${escapeWordText(name)}</w:t></w:r>` +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  return `<w:p>${link}${source.url === null ? '' : wordRuns(` · ${source.url}`)}</w:p>${findingEvidenceLines(source).map((line) => wordParagraph(line)).join('')}`;
}

const TABLE_BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="000000"';
const COLUMN_TWIPS = [2400, 1600, 4300] as const;
/** 章节与类别统计: the chapter column takes what the page leaves once each count has a narrow column. */
const statisticsTwips = (columns: number): number[] => [Math.max(1800, 8300 - 640 * (columns - 1)), ...Array.from({ length: columns - 1 }, () => 640)];

function wordTable(columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>, widths: ReadonlyArray<number> = COLUMN_TWIPS): string {
  const cell = (text: string, index: number, header: boolean): string =>
    `<w:tc><w:tcPr><w:tcW w:w="${widths[index] ?? 2000}" w:type="dxa"/></w:tcPr><w:p>${wordRuns(text, header)}</w:p></w:tc>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} ${TABLE_BORDER}/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${columns.map((_, index) => `<w:gridCol w:w="${widths[index] ?? 2000}"/>`).join('')}</w:tblGrid>` +
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${columns.map((column, index) => cell(column, index, true)).join('')}</w:tr>` +
    rows.map((row) => `<w:tr>${row.map((text, index) => cell(text, index, false)).join('')}</w:tr>`).join('') +
    '</w:tbl>';
}

function reportDocx(layout: ReportLayout): Uint8Array {
  const body = [
    wordParagraph(layout.title, 'Title'),
    wordParagraph(layout.meta),
    wordParagraph(layout.overview.title, 'Heading1'),
    wordTable(layout.overview.columns, layout.overview.rows),
    ...(layout.overview.totals === null ? [] : [wordParagraph(layout.overview.totals)]),
    wordParagraph(layout.mustItems.title, 'Heading1'),
    ...(layout.mustItems.items.length === 0
      ? [wordParagraph(REVIEW_REPORT_NO_MUST_ITEMS)]
      : layout.mustItems.items.map((item, index) => wordParagraph(`${index + 1}. ${item}`))),
    ...(layout.statistics === null ? [] : [wordParagraph(layout.statistics.title, 'Heading1'),
      wordTable(layout.statistics.columns, layout.statistics.rows, statisticsTwips(layout.statistics.columns.length))]),
    ...(layout.findings === null ? [] : [wordParagraph(layout.findings.title, 'Heading1'),
      ...layout.findings.entries.flatMap((entry) => [wordParagraph(entry.heading, 'Heading2'), ...entry.lines.map((line) => wordParagraph(line)), ...entry.sources.map(wordSource)]),
      ...(layout.findings.omitted === null ? [] : [wordParagraph(layout.findings.omitted)])]),
    wordParagraph(layout.summaries.title, 'Heading1'),
    ...layout.summaries.entries.flatMap((entry) => [wordParagraph(entry.heading, 'Heading2'), ...entry.lines.map((line) => wordParagraph(line))]),
    wordParagraph(layout.appendix.title, 'Heading1'),
    ...layout.appendix.lines.map((line) => wordParagraph(line)),
  ];
  return freshBodyPackage(layout.title, body.join(''));
}

// Publication report (Issue #1430). Legacy /1 records keep their original layout.
const REPORT_BANNER_COLORS = { consistency: 'C0392B', factual: 'B9770E', language: '2E86C1', literary: '117864', style: '566573', risk: 'D35400', editor: '7030A0', other: '566573' } as const;
const REPORT_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="SimSun"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="40"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="1F3864"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="30"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="2F5496"/><w:sz w:val="26"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420" w:hanging="210"/></w:pPr><w:rPr><w:sz w:val="21"/></w:rPr></w:style></w:styles>';

function reportParagraph(text: string, properties = '', runProperties = ''): string {
  return `<w:p><w:pPr>${properties}</w:pPr>` + text.split('\n').map((line, index) =>
    `<w:r><w:rPr>${runProperties}</w:rPr>${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeWordText(line)}</w:t></w:r>`).join('') + '</w:p>';
}
function reportTable(rows: ReadonlyArray<ReadonlyArray<string>>, widths: ReadonlyArray<number>, statistics = false): string {
  const color = statistics ? 'BFBFBF' : 'D9D9D9';
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="${color}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>` +
    rows.map((row, rowIndex) => {
      const header = statistics && rowIndex === 0;
      const total = statistics && rowIndex === rows.length - 1;
      return `<w:tr><w:trPr>${header ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>` + row.map((text, column) => {
        const fill = header ? 'DCE6F1' : total ? 'F2F4F8' : !statistics && column === 0 ? 'EEF2F7' : null;
        return `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/>${fill === null ? '' : `<w:shd w:val="clear" w:fill="${fill}"/>`}<w:vAlign w:val="top"/></w:tcPr>` +
          reportParagraph(text, statistics && column > 0 ? '<w:jc w:val="center"/>' : '', `<w:sz w:val="20"/>${header || total || !statistics && column === 0 ? '<w:b/>' : ''}`) + '</w:tc>';
      }).join('') + '</w:tr>';
    }).join('') + '</w:tbl>';
}

function publicationReportDocx(input: ReportExportInput): Uint8Array {
  const { record } = input;
  const entries = record.findings?.entries ?? [];
  const categories = [...new Set(entries.map((entry) => entry.categoryLabel ?? entry.categoryLabels.join('、')))];
  const chapters = [...new Set(entries.map((entry) => (entry.chapterTitle ?? entry.chapterLabel) || '全书/跨章节'))];
  const title = `《${input.bookTitle}》审阅报告`;
  const date = new Date(input.generatedAt);
  const dateLabel = Number.isNaN(date.getTime()) ? input.generatedAt : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  const extent = record.manuscriptExtent;
  const scope = extent === undefined ? '篇幅未记录' : `正文约 ${(extent.characterCount / 10000).toFixed(1)} 万字，共 ${extent.chapterCount} 章`;
  const section = (text: string): string => wordParagraph(text, 'Heading1');
  const body = [reportParagraph(title, '<w:pStyle w:val="Title"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="40"/><w:color w:val="1F3864"/>'),
    reportParagraph(record.overview.rows.map((row) => row.label).join(' · '), '<w:jc w:val="center"/>', '<w:sz w:val="22"/><w:color w:val="555555"/>'),
    reportParagraph(`审阅对象：《${input.bookTitle}》（${scope}）｜审阅日期：${dateLabel}`, '<w:jc w:val="center"/>', '<w:sz w:val="19"/><w:color w:val="777777"/>'),
    section('一、审阅说明'),
    wordParagraph(`本次审阅范围：${record.run.scopeLabel}；审阅对象为《${input.bookTitle}》，${scope}，稿件版本为 ${record.run.manuscript.revisionLabel}。`),
    ...record.categorySummaries.entries.map((entry) => wordParagraph(`${entry.label}：${entry.basisStatement}`)),
    wordParagraph('每条问题包含四项：问题简述、问题所对应的原文（与稿件逐字一致，可直接检索定位）、建议修改后的文本、修改建议的原因与理由；知识性/事实性类问题另附“引用来源”，每个来源给出原始网址或出处、相关片段及支持结论的说明。'),
    wordParagraph('位置按“章节名｜段落 N”标注，便于在稿件中快速检索定位。'),
    section('二、问题统计'), wordParagraph(`全稿共列出问题 ${entries.length} 条。统计按问题所在章节与类别计数（一条问题只计一次）。`),
    reportTable([['章节', ...categories, '合计'], ...chapters.map((chapter) => {
      const located = entries.filter((entry) => ((entry.chapterTitle ?? entry.chapterLabel) || '全书/跨章节') === chapter);
      return [chapter, ...categories.map((category) => String(located.filter((entry) => (entry.categoryLabel ?? entry.categoryLabels.join('、')) === category).length)), String(located.length)];
    }), ['合计', ...categories.map((category) => String(entries.filter((entry) => (entry.categoryLabel ?? entry.categoryLabels.join('、')) === category).length)), String(entries.length)]], [2600, ...categories.map(() => 1160), 1000], true),
    reportParagraph('事实核查结论以已记录的核查结果为准；引用来源列出本次核查保留的资料。', '', '<w:sz w:val="20"/><w:color w:val="555555"/>'),
    section('三、建议优先处理的重点问题')];
  const priority = entries.filter((entry) => entry.priority === 'must' || entry.severityLabel === '必须处理' || (entry.chapterTitle ?? '').includes('跨章节'));
  const highlights = priority.length > 0 ? priority : entries.slice(0, 5);
  body.push(...(highlights.length === 0 ? [wordParagraph(REVIEW_REPORT_NO_MUST_ITEMS)] : highlights.map((entry) =>
    wordParagraph(`• ${entry.summary ?? entry.reason}（问题 ${entry.index ?? String(entries.indexOf(entry) + 1).padStart(3, '0')}）`, 'ListParagraph'))), section('四、逐项问题清单'));
  for (const chapter of chapters) {
    body.push(wordParagraph(chapter, 'Heading2'));
    for (const entry of entries.filter((candidate) => ((candidate.chapterTitle ?? candidate.chapterLabel) || '全书/跨章节') === chapter)) {
      const index = entry.index ?? String(entries.indexOf(entry) + 1).padStart(3, '0');
      const location = entry.paragraphOrdinal == null ? '段落位置未记录' : `段落 ${entry.paragraphOrdinal}`;
      body.push(reportParagraph(`问题 ${index}  【${entry.categoryLabel ?? entry.categoryLabels.join('、')}】  位置：${chapter}｜${location}`,
        '<w:keepNext/><w:shd w:val="clear" w:fill="F7F7F7"/><w:spacing w:before="180" w:after="40"/>', `<w:b/><w:sz w:val="23"/><w:color w:val="${REPORT_BANNER_COLORS[entry.categoryKey ?? 'other']}"/>`));
      const rows = [['问题简述', entry.summary ?? entry.reason], ['问题所对应的原文', entry.originalText ?? entry.quote],
        ['建议修改后的文本', entry.suggestedText === null ? '（开放性建议，见理由）' : entry.suggestedText || '（删去）'], ['修改建议的原因与理由', entry.rationale ?? entry.reason]];
      if (entry.sources.length > 0) rows.push(['引用来源', entry.sources.map((source, sourceIndex) =>
        [`来源${sourceIndex + 1}：${source.url ?? source.name}`, `相关片段：${source.snippet ?? '（未记录）'}`, ...(source.translation === null ? [] : [`译文：${source.translation}`]), `说明：${source.note}`].join('\n')).join('\n\n')]);
      body.push(reportTable(rows, [1950, 7450]));
    }
  }
  if ((record.findings?.omitted ?? 0) > 0) body.push(wordParagraph(reviewReportOmittedLine(record.findings!.omitted)!));
  return freshBodyPackage(title, body.join(''), REPORT_STYLES, 1253);
}

// ---- PDF: the page the main process prints ---------------------------------------------------------------

const REPORT_PRINT_STYLE = PRINT_BASE_STYLE + [
  'p{margin:0 0 .5em}',
  'p.report-meta{text-align:center;margin:0 0 1.5em}',
  'table{border-collapse:collapse;width:100%;margin:0 0 1em}',
  'th,td{border:1px solid #000;padding:.3em .5em;text-align:left;vertical-align:top}',
  'thead th{font-weight:bold}',
  'ol,ul{margin:0 0 1em;padding-left:2em}',
  'li{margin:0 0 .4em}',
].join('');

function htmlTable(columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const head = columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('');
  const body = rows
    .map((row) => `<tr><th scope="row">${htmlLines(row[0] ?? '')}</th>${row.slice(1).map((text) => `<td>${htmlLines(text)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A source on the printed page: its name a link the printed PDF keeps (the print window never follows it), then its words. */
function htmlSource(source: ReviewEvidenceSource): string {
  const name = escapeHtml(`${FINDING_EVIDENCE_HEADING}：${source.name}`);
  const target = linkTarget(source.url);
  const link = target === null ? name : `<a href="${escapeHtml(target)}">${name}</a>`;
  return `<li>${link}${source.url === null ? '' : ` · ${escapeHtml(source.url)}`}${findingEvidenceLines(source).map((line) => `<br>${htmlLines(line)}`).join('')}</li>`;
}

function reportPage(layout: ReportLayout): Uint8Array {
  const must = layout.mustItems.items.length === 0
    ? `<p>${escapeHtml(REVIEW_REPORT_NO_MUST_ITEMS)}</p>`
    : `<ol>${layout.mustItems.items.map((item) => `<li>${htmlLines(item)}</li>`).join('')}</ol>`;
  const summaries = layout.summaries.entries
    .map((entry) => `<h3>${htmlLines(entry.heading)}</h3>${entry.lines.map((line) => `<p>${htmlLines(line)}</p>`).join('')}`).join('');
  const statistics = layout.statistics === null ? '' : `<h2>${escapeHtml(layout.statistics.title)}</h2>${htmlTable(layout.statistics.columns, layout.statistics.rows)}`;
  const findings = layout.findings === null ? '' : `<h2>${escapeHtml(layout.findings.title)}</h2>` + layout.findings.entries.map((entry) =>
    `<h3>${htmlLines(entry.heading)}</h3>${entry.lines.map((line) => `<p>${htmlLines(line)}</p>`).join('')}` +
    (entry.sources.length === 0 ? '' : `<ul>${entry.sources.map(htmlSource).join('')}</ul>`)).join('') +
    (layout.findings.omitted === null ? '' : `<p>${escapeHtml(layout.findings.omitted)}</p>`);
  const body = `<main><h1 class="book-title">${htmlLines(layout.title)}</h1><p class="report-meta">${htmlLines(layout.meta)}</p>` +
    `<h2>${escapeHtml(layout.overview.title)}</h2>${htmlTable(layout.overview.columns, layout.overview.rows)}` +
    (layout.overview.totals === null ? '' : `<p>${escapeHtml(layout.overview.totals)}</p>`) +
    `<h2>${escapeHtml(layout.mustItems.title)}</h2>${must}${statistics}${findings}` +
    `<h2>${escapeHtml(layout.summaries.title)}</h2>${summaries}` +
    `<h2>${escapeHtml(layout.appendix.title)}</h2><ul>${layout.appendix.lines.map((line) => `<li>${htmlLines(line)}</li>`).join('')}</ul></main>`;
  return new TextEncoder().encode(printPage(layout.title, REPORT_PRINT_STYLE, body));
}

// ---- Markdown -----------------------------------------------------------------------------------------

/** A line that stays one line — a heading or a table cell: escaped, each line break a space. */
function markdownOneLine(text: string): string {
  return escapeMarkdown(text).split('\n').map((line, index) => (index === 0 ? escapeLineStart(line) : line)).join(' ');
}

/**
 * A paragraph or a list item's words: escaped, every line escaped at its start — a list item's first line too, or it
 * could open a list inside the item — each later line indented under the first, each line break a hard break.
 */
function markdownLines(text: string, indent: string): string {
  const [first = '', ...rest] = escapeMarkdown(text).split('\n');
  return [escapeLineStart(first), ...rest.map((line) => `${indent}${escapeLineStart(line)}`)].join('\\\n');
}

/** A source as a list item: its name a link to its address (an http(s) one), then its words under it. */
function markdownSource(source: ReviewEvidenceSource): string {
  const name = escapeMarkdown(`${FINDING_EVIDENCE_HEADING}：${source.name}`).replace(/\n/gu, ' ');
  const target = linkTarget(source.url);
  const link = target === null ? name : `[${name}](<${target.replace(/[<>\s]/gu, encodeURIComponent)}>)`;
  return [`- ${link}`, ...findingEvidenceLines(source).map((line) => `  ${markdownLines(line, '  ')}`)].join('\\\n');
}

function reportMarkdown(layout: ReportLayout): Uint8Array {
  const cells = (row: ReadonlyArray<string>): string => `| ${row.map((text) => escapeMarkdown(text).replace(/\n/gu, ' ')).join(' | ')} |`;
  const table = (columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): string =>
    [cells(columns), `|${columns.map(() => ' --- ').join('|')}|`, ...rows.map(cells)].join('\n');
  const blocks = [
    `# ${markdownOneLine(layout.title)}`,
    markdownLines(layout.meta, ''),
    `## ${markdownOneLine(layout.overview.title)}`,
    table(layout.overview.columns, layout.overview.rows),
    ...(layout.overview.totals === null ? [] : [markdownLines(layout.overview.totals, '')]),
    `## ${markdownOneLine(layout.mustItems.title)}`,
    layout.mustItems.items.length === 0
      ? markdownLines(REVIEW_REPORT_NO_MUST_ITEMS, '')
      : layout.mustItems.items.map((item, index) => {
        const marker = `${index + 1}. `;
        return `${marker}${markdownLines(item, ' '.repeat(marker.length))}`;
      }).join('\n'),
    ...(layout.statistics === null ? [] : [`## ${markdownOneLine(layout.statistics.title)}`, table(layout.statistics.columns, layout.statistics.rows)]),
    ...(layout.findings === null ? [] : [`## ${markdownOneLine(layout.findings.title)}`,
      ...layout.findings.entries.flatMap((entry) => [`### ${markdownOneLine(entry.heading)}`, entry.lines.map((line) => markdownLines(line, '')).join('\\\n'),
        ...(entry.sources.length === 0 ? [] : [entry.sources.map(markdownSource).join('\n')])]),
      ...(layout.findings.omitted === null ? [] : [markdownLines(layout.findings.omitted, '')])]),
    `## ${markdownOneLine(layout.summaries.title)}`,
    ...layout.summaries.entries.flatMap((entry) => [`### ${markdownOneLine(entry.heading)}`, ...entry.lines.map((line) => markdownLines(line, ''))]),
    `## ${markdownOneLine(layout.appendix.title)}`,
    layout.appendix.lines.map((line) => `- ${markdownLines(line, '  ')}`).join('\n'),
  ];
  return new TextEncoder().encode(`${blocks.join('\n\n')}\n`);
}

// ---- the review ---------------------------------------------------------------------------------------

/** The report's parts under one format: every part is written; only Markdown's tables are 降级导出. */
function reportFidelityRows(format: ManuscriptExportFormat, layout: ReportLayout): ExportFidelityRowProjection[] {
  const categories = layout.overview.rows.length;
  const items = layout.mustItems.items.length;
  const overview = format === 'docx'
    ? fidelityRow('report-overview', '概览表', categories, 'preserved', `写成 Word 表格，${categories} 个类别各占一行。`)
    : format === 'pdf'
      ? fidelityRow('report-overview', '概览表', categories, 'preserved', `按表格排版，${categories} 个类别各占一行。`)
      : fidelityRow('report-overview', '概览表', categories, 'degraded', `写成 Markdown 表格，${categories} 个类别各占一行；不支持表格的阅读器按文字显示。`);
  const statistics = layout.statistics === null ? [] : [format === 'markdown'
    ? fidelityRow('report-statistics', '章节与类别统计', layout.statistics.rows.length, 'degraded', `写成 Markdown 表格，${layout.statistics.rows.length} 行；不支持表格的阅读器按文字显示。`)
    : fidelityRow('report-statistics', '章节与类别统计', layout.statistics.rows.length, 'preserved',
      `${format === 'docx' ? '写成 Word 表格' : '按表格排版'}，${layout.statistics.rows.length} 行，各章节按类别计数并合计。`)];
  const findings = layout.findings === null ? [] : [fidelityRow('report-findings', '发现详单', layout.findings.entries.length, 'preserved',
    `${layout.findings.entries.length} 条，各写出引文、建议改法、理由与来源；来源${format === 'docx' ? '写成 Word 超链接' : format === 'pdf' ? '在 PDF 中是可点击的链接' : '写成 Markdown 链接'}，并写出地址。` +
    (layout.findings.omitted === null ? '' : layout.findings.omitted))];
  return [
    overview,
    fidelityRow('report-must-items', '必须处理的事项', items, 'preserved',
      items === 0 ? REVIEW_REPORT_NO_MUST_ITEMS : `${items} 项，逐条写出类别、位置、引文、说明与状态。`),
    ...statistics,
    ...findings,
    fidelityRow('report-summaries', '各类别摘要', layout.summaries.entries.length, 'preserved',
      `${layout.summaries.entries.length} 个类别，各写出状态、发现数、依据与未能定位的发现。`),
    fidelityRow('report-appendix', '附录', layout.appendix.lines.length, 'preserved', '写出审阅配置，以及各类别所用的规范文件与工序，各带版本。'),
  ];
}

/** Lay out one report version in one format, or only review it (`emit: false`). */
export function renderReportExport(input: ReportExportInput, format: ManuscriptExportFormat, options: { emit: boolean }): ReportExportResult {
  const layout = layoutOf(input);
  const fidelity = reportFidelityRows(format, layout);
  const degraded = fidelity.some((row) => row.status === 'degraded' || row.status === 'unavailable');
  if (!options.emit) return { bytes: null, fidelity, degraded };
  const bytes = format === 'docx' ? input.record.schema === 'ai7.review.report/1' ? reportDocx(layout) : publicationReportDocx(input) : format === 'pdf' ? reportPage(layout) : reportMarkdown(layout);
  return { bytes, fidelity, degraded };
}
