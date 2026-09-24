import type { ExportFidelityRowProjection, ManuscriptExportFormat, ReviewReportRecord } from '../shared/protocol.js';
import {
  REVIEW_REPORT_HEADING,
  REVIEW_REPORT_NO_MUST_ITEMS,
  REVIEW_REPORT_OVERVIEW_COLUMNS,
  localInstantLabel,
  reviewCountsLine,
  reviewReportAppendixLine,
  reviewReportConfigurationLine,
  reviewReportExcludedLine,
  reviewReportMustItemLine,
  reviewReportVersionLine,
} from '../shared/report-wording.js';
import { escapeWordText, fidelityRow, freshBodyPackage } from './docx-export.js';
import { PRINT_BASE_STYLE, escapeHtml, escapeLineStart, escapeMarkdown, htmlLines, printPage } from './text-export.js';

/**
 * One version of a Review Run's 审阅报告 as a file (Issue #500, plan slice S64b part 2; V2-UX-REV-009; ADR 0079 §3.4):
 * the report exports in the manuscript's formats — DOCX primary, PDF optional, Markdown the 备用格式 — under the same
 * preparation, approval and receipt. The file says what 审阅 shows: its title, the Run and version it reports, and its
 * four parts — 概览表, 必须处理的事项, 各类别摘要 and 附录 — in the words `src/shared/report-wording.ts` owns.
 *
 * The writer is pure: a report version is immutable, so the same version always gives the same bytes on one machine.
 * The generation time is written in the machine's local time, as 审阅 shows it.
 */
export const REPORT_EXPORT_WRITER_IDENTITIES: Readonly<Record<ManuscriptExportFormat, string>> = {
  docx: 'ai7-report-docx/1',
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
  overview: { title: string; columns: ReadonlyArray<string>; rows: ReadonlyArray<ReadonlyArray<string>> };
  mustItems: { title: string; items: ReadonlyArray<string> };
  summaries: { title: string; entries: ReadonlyArray<{ heading: string; lines: ReadonlyArray<string> }> };
  appendix: { title: string; lines: ReadonlyArray<string> };
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
    },
    mustItems: { title: record.mustItems.title, items: record.mustItems.items.map(reviewReportMustItemLine) },
    summaries: {
      title: record.categorySummaries.title,
      entries: record.categorySummaries.entries.map((entry) => ({
        heading: stateLabels.has(entry.categoryId) ? `${entry.label} · ${stateLabels.get(entry.categoryId)!}` : entry.label,
        lines: [reviewCountsLine(entry.counts), entry.basisStatement, reviewReportExcludedLine(entry.excludedCount)],
      })),
    },
    appendix: {
      title: record.appendix.title,
      lines: [reviewReportConfigurationLine(record.appendix.configuration.version), ...record.appendix.categories.map(reviewReportAppendixLine)],
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

const TABLE_BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="000000"';
const COLUMN_TWIPS = [2400, 1600, 4300] as const;

function wordTable(columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const cell = (text: string, index: number, header: boolean): string =>
    `<w:tc><w:tcPr><w:tcW w:w="${COLUMN_TWIPS[index] ?? 2000}" w:type="dxa"/></w:tcPr><w:p>${wordRuns(text, header)}</w:p></w:tc>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => `<w:${side} ${TABLE_BORDER}/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${columns.map((_, index) => `<w:gridCol w:w="${COLUMN_TWIPS[index] ?? 2000}"/>`).join('')}</w:tblGrid>` +
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
    wordParagraph(layout.mustItems.title, 'Heading1'),
    ...(layout.mustItems.items.length === 0
      ? [wordParagraph(REVIEW_REPORT_NO_MUST_ITEMS)]
      : layout.mustItems.items.map((item, index) => wordParagraph(`${index + 1}. ${item}`))),
    wordParagraph(layout.summaries.title, 'Heading1'),
    ...layout.summaries.entries.flatMap((entry) => [wordParagraph(entry.heading, 'Heading2'), ...entry.lines.map((line) => wordParagraph(line))]),
    wordParagraph(layout.appendix.title, 'Heading1'),
    ...layout.appendix.lines.map((line) => wordParagraph(line)),
  ];
  return freshBodyPackage(layout.title, body.join(''));
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

function reportPage(layout: ReportLayout): Uint8Array {
  const head = layout.overview.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('');
  const rows = layout.overview.rows
    .map((row) => `<tr><th scope="row">${htmlLines(row[0] ?? '')}</th>${row.slice(1).map((text) => `<td>${htmlLines(text)}</td>`).join('')}</tr>`).join('');
  const must = layout.mustItems.items.length === 0
    ? `<p>${escapeHtml(REVIEW_REPORT_NO_MUST_ITEMS)}</p>`
    : `<ol>${layout.mustItems.items.map((item) => `<li>${htmlLines(item)}</li>`).join('')}</ol>`;
  const summaries = layout.summaries.entries
    .map((entry) => `<h3>${htmlLines(entry.heading)}</h3>${entry.lines.map((line) => `<p>${htmlLines(line)}</p>`).join('')}`).join('');
  const body = `<main><h1 class="book-title">${htmlLines(layout.title)}</h1><p class="report-meta">${htmlLines(layout.meta)}</p>` +
    `<h2>${escapeHtml(layout.overview.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>` +
    `<h2>${escapeHtml(layout.mustItems.title)}</h2>${must}` +
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

function reportMarkdown(layout: ReportLayout): Uint8Array {
  const cells = (row: ReadonlyArray<string>): string => `| ${row.map((text) => escapeMarkdown(text).replace(/\n/gu, ' ')).join(' | ')} |`;
  const blocks = [
    `# ${markdownOneLine(layout.title)}`,
    markdownLines(layout.meta, ''),
    `## ${markdownOneLine(layout.overview.title)}`,
    [cells(layout.overview.columns), `|${layout.overview.columns.map(() => ' --- ').join('|')}|`, ...layout.overview.rows.map(cells)].join('\n'),
    `## ${markdownOneLine(layout.mustItems.title)}`,
    layout.mustItems.items.length === 0
      ? markdownLines(REVIEW_REPORT_NO_MUST_ITEMS, '')
      : layout.mustItems.items.map((item, index) => {
        const marker = `${index + 1}. `;
        return `${marker}${markdownLines(item, ' '.repeat(marker.length))}`;
      }).join('\n'),
    `## ${markdownOneLine(layout.summaries.title)}`,
    ...layout.summaries.entries.flatMap((entry) => [`### ${markdownOneLine(entry.heading)}`, ...entry.lines.map((line) => markdownLines(line, ''))]),
    `## ${markdownOneLine(layout.appendix.title)}`,
    layout.appendix.lines.map((line) => `- ${markdownLines(line, '  ')}`).join('\n'),
  ];
  return new TextEncoder().encode(`${blocks.join('\n\n')}\n`);
}

// ---- the review ---------------------------------------------------------------------------------------

/** The report's four parts under one format: every part is written; only Markdown's table is 降级导出. */
function reportFidelityRows(format: ManuscriptExportFormat, layout: ReportLayout): ExportFidelityRowProjection[] {
  const categories = layout.overview.rows.length;
  const items = layout.mustItems.items.length;
  const overview = format === 'docx'
    ? fidelityRow('report-overview', '概览表', categories, 'preserved', `写成 Word 表格，${categories} 个类别各占一行。`)
    : format === 'pdf'
      ? fidelityRow('report-overview', '概览表', categories, 'preserved', `按表格排版，${categories} 个类别各占一行。`)
      : fidelityRow('report-overview', '概览表', categories, 'degraded', `写成 Markdown 表格，${categories} 个类别各占一行；不支持表格的阅读器按文字显示。`);
  return [
    overview,
    fidelityRow('report-must-items', '必须处理的事项', items, 'preserved',
      items === 0 ? REVIEW_REPORT_NO_MUST_ITEMS : `${items} 项，逐条写出类别、位置、引文、说明与状态。`),
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
  const bytes = format === 'docx' ? reportDocx(layout) : format === 'pdf' ? reportPage(layout) : reportMarkdown(layout);
  return { bytes, fidelity, degraded };
}
