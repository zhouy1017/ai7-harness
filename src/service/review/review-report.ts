import {
  REVIEW_FINDING_SEVERITY_LABELS,
  REVIEW_FINDING_STATUS_LABELS,
  type ReviewCategoryOutputKind,
  type ReviewChapterOptionProjection,
  type ReviewEvidenceSource,
  type ReviewFindingCountsProjection,
  type ReviewFindingSeverity,
  type ReviewFindingStatus,
  type ReviewReportFindingEntry,
  type ReviewReportRecord,
  type ReviewReportSchema,
  type ReviewRunCategoryState,
} from '../../shared/protocol.js';
import { canonicalRecord } from '../analysis/canonical.js';
import { graphemeCount, sliceGraphemes } from '../analysis/factual-review-contract.js';
import { chapterOfPosition } from './review-scope.js';
import { resolveEditorialMarkCategory } from '../../shared/editorial-mark-category.js';

/**
 * The 审阅报告 of one Review Run (Issue #417; V2-UX-REV-009): 概览表, 必须处理的事项, 各类别摘要 and an
 * 附录 of the guideline and 工序 versions the Run applied. Each generation is a new version recorded
 * whole; nothing in an earlier version is rewritten, so a Report says what stood when it was made.
 *
 * A Report carries no manuscript text beyond the findings' own quotations, each at most 80 graphemes,
 * and places a finding by its block position rather than by a heading's words. A recorded version exports
 * through the export ledger in the manuscript's formats (`src/service/report-export.ts`, Issue #500); attaching
 * it to a Delivery Package is S66's; it is a record here.
 *
 * Version /2 (ADR 0095 §5; Issue #1174) is a derived view of the cards: the Run's totals, a chapter × category table, and
 * a 发现详单 in which the same quotation at the same place across categories is one row, each with its suggested text, its
 * reason and the sources its card lists. A /1 record keeps reading and exporting as it was recorded.
 */
export const REVIEW_REPORT_SCHEMA = 'ai7.review.report/2' as const;
export const REVIEW_REPORT_SCHEMAS: ReadonlyArray<ReviewReportSchema> = ['ai7.review.report/1', REVIEW_REPORT_SCHEMA];
const MAX_REPORT_QUOTE_GRAPHEMES = 80;
/** A source's excerpt or 来源译文 as the report carries it. */
const MAX_REPORT_SOURCE_GRAPHEMES = 200;
/** The 发现详单 stops here and counts the rest, so a recorded version always crosses the service boundary in one frame. */
export const MAX_REPORT_FINDING_BYTES = 192 * 1024;
const SEVERITY_ORDER: ReadonlyArray<ReviewFindingSeverity> = ['must', 'should', 'note'];

export interface ReviewReportCategoryInput {
  readonly categoryId: string;
  readonly label: string;
  readonly output: ReviewCategoryOutputKind;
  readonly state: ReviewRunCategoryState;
  readonly stateLabel: string;
  readonly stateLine: string;
  readonly basisStatement: string;
  readonly excludedCount: number;
  readonly guidelineDocuments: ReadonlyArray<{ readonly documentId: string; readonly title: string; readonly issuer: string; readonly version: string }>;
  readonly procedure: { readonly procedureId: string; readonly title: string; readonly version: string };
  readonly planEnvelopeDigest: string | null;
  readonly resultSetRevisionId: string | null;
  readonly adapterPin: { readonly route: string; readonly model: string; readonly fixtureIdentity: string | null; readonly fixtureSha256: string | null } | null;
}

export interface ReviewReportFindingInput {
  readonly findingId: string;
  readonly categoryId: string;
  readonly severity: ReviewFindingSeverity;
  readonly status: ReviewFindingStatus;
  readonly quote: string;
  readonly note: string;
  readonly locationLabel: string;
  /** Where the finding stands, so the same place is one row across categories; a finding without it is a row of its own. */
  readonly place?: { readonly blockId: string; readonly position: number | null; readonly fromGrapheme: number; readonly toGrapheme: number };
  readonly replacement?: string | null;
  readonly chapter?: ReportChapter;
  readonly sources?: ReadonlyArray<ReviewEvidenceSource>;
  readonly conclusion?: string | null;
}

/**
 * A chapter as the report names it: by its order and its block positions; `title` is the heading the published
 * report (Issue #1430) groups and locates findings under, and `position` the heading's block, so 「段落 N」 counts from it.
 */
export interface ReportChapter {
  readonly order: number;
  readonly label: string;
  readonly title?: string;
  readonly position?: number;
}

export interface ReviewReportInput {
  readonly reviewRunId: string;
  readonly version: number;
  readonly generatedAt: string;
  readonly run: ReviewReportRecord['run'];
  readonly configuration: { readonly schema: string; readonly version: string; readonly digest: string };
  readonly categories: ReadonlyArray<ReviewReportCategoryInput>;
  readonly findings: ReadonlyArray<ReviewReportFindingInput>;
  /** A Book's report (Issue #1430): every row and every quote and source whole, since its file is written from the record. */
  readonly complete?: boolean;
  readonly compilation?: ReviewReportRecord['compilation'];
  readonly manuscriptExtent?: ReviewReportRecord['manuscriptExtent'];
}

/** Findings by severity and by status; every finding counts once in each. */
export function reviewFindingCounts(findings: ReadonlyArray<{ readonly severity: ReviewFindingSeverity; readonly status: ReviewFindingStatus }>): ReviewFindingCountsProjection {
  const counts: ReviewFindingCountsProjection = { must: 0, should: 0, note: 0, pending: 0, handled: 0, ignored: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
    counts[finding.status] += 1;
  }
  return counts;
}

/** A quotation as a Report may carry it: its first 80 graphemes, marked when there were more. */
export function reportQuote(quote: string, limit = MAX_REPORT_QUOTE_GRAPHEMES): string {
  return graphemeCount(quote) <= limit ? quote : `${sliceGraphemes(quote, 0, limit - 1)}…`;
}

/** The chapter a block position falls in, by position — 「章节 2（内容块 5–9）」 — and after every chapter, outside them or gone. */
export function reportChapterOf(chapters: ReadonlyArray<ReviewChapterOptionProjection>, position: number | null): ReportChapter {
  if (position === null) return { order: chapters.length + 2, label: '内容块已不在当前稿件中', title: '原文已不在当前稿件中' };
  const chapter = chapterOfPosition(chapters, position);
  if (chapter === null) return { order: chapters.length + 1, label: '章节之外', title: chapters.length === 0 ? '全书' : '章节之外' };
  const order = chapters.indexOf(chapter) + 1;
  const blocks = chapter.position === chapter.endPosition ? `${chapter.position}` : `${chapter.position}–${chapter.endPosition}`;
  const label = `章节 ${order}（内容块 ${blocks}）`;
  return { order, label, title: chapter.title.trim() || label, position: chapter.position };
}

/** 问题简述: the note's first sentence, or the note itself when it is one. */
function reportSummary(note: string): string {
  const sentence = /^.+?[。！？!?](?=.)/su.exec(note.trim())?.[0] ?? note.trim();
  return sentence === '' ? '（见原文与修改建议）' : sentence;
}

const distinct = <T>(values: ReadonlyArray<T>): T[] => [...new Set(values)];
const sum = (values: ReadonlyArray<number>): number => values.reduce((total, value) => total + value, 0);

/** Findings per chapter and category, each in its own category, so the totals are the overview's. */
function reportStatistics(input: ReviewReportInput): NonNullable<ReviewReportRecord['statistics']> {
  const columns = input.categories.map((category) => category.categoryId);
  const rows = new Map<number, { label: string; counts: number[] }>();
  for (const finding of input.findings) {
    const chapter = finding.chapter ?? { order: 0, label: '全部' };
    const row = rows.get(chapter.order) ?? { label: chapter.label, counts: columns.map(() => 0) };
    const column = columns.indexOf(finding.categoryId);
    if (column >= 0) row.counts[column]! += 1;
    rows.set(chapter.order, row);
  }
  const ordered = [...rows.entries()].sort(([left], [right]) => left - right).map(([, row]) => ({ ...row, total: sum(row.counts) }));
  const totals = columns.map((_, column) => sum(ordered.map((row) => row.counts[column]!)));
  return {
    title: '章节与类别统计',
    categories: input.categories.map((category) => ({ categoryId: category.categoryId, label: category.label })),
    rows: ordered,
    totals,
    total: sum(totals),
  };
}

/** Each finding once, in manuscript order; the 发现详单 stops at its byte bound and counts what it left out. */
function reportFindings(input: ReviewReportInput): NonNullable<ReviewReportRecord['findings']> {
  const labels = new Map(input.categories.map((category) => [category.categoryId, category.label] as const));
  const groups = new Map<string, ReviewReportFindingInput[]>();
  for (const finding of input.findings) {
    const place = finding.place;
    const key = place === undefined ? finding.findingId : JSON.stringify([place.blockId, place.fromGrapheme, place.toGrapheme, finding.quote]);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  const at = (finding: ReviewReportFindingInput): number[] =>
    [finding.chapter?.order ?? 0, finding.place?.position ?? Number.MAX_SAFE_INTEGER, finding.place?.fromGrapheme ?? 0];
  const ordered = [...groups.values()].sort((left, right) => {
    const [a, b] = [at(left[0]!), at(right[0]!)];
    return a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
  });
  const entries: ReviewReportFindingEntry[] = [];
  let spent = 0;
  for (const members of ordered) {
    const sources = new Map<string, ReviewEvidenceSource>();
    for (const source of members.flatMap((member) => member.sources ?? [])) {
      sources.set(JSON.stringify([source.url ?? source.name, source.snippet]), {
        ...source,
        snippet: input.complete || source.snippet === null ? source.snippet : reportQuote(source.snippet, MAX_REPORT_SOURCE_GRAPHEMES),
        translation: input.complete || source.translation === null ? source.translation : reportQuote(source.translation, MAX_REPORT_SOURCE_GRAPHEMES),
      });
    }
    const replacements = distinct(members.flatMap((member) => member.replacement ?? []));
    const first = members[0]!;
    const severity = SEVERITY_ORDER.find((candidate) => members.some((member) => member.severity === candidate))!;
    const reason = distinct(members.map((member) => member.note)).join('；');
    // The published report's fields (Issue #1430): the first member's category names the row, as its banner colours it.
    const categoryLabel = labels.get(first.categoryId) ?? first.categoryId;
    const categoryKey = resolveEditorialMarkCategory({ sourceKind: 'ai7', sourceOrigin: 'review-category', sourceLabel: categoryLabel }).key;
    const conclusion = members.find((member) => member.conclusion)?.conclusion;
    const position = first.place?.position ?? null;
    const heading = first.chapter?.position;
    const entry: ReviewReportFindingEntry = {
      index: String(entries.length + 1).padStart(3, '0'), categoryKey, categoryLabel,
      chapterTitle: first.chapter?.title ?? first.chapter?.label ?? '全书', chapterOrder: first.chapter?.order ?? 0,
      paragraphOrdinal: position === null ? null : heading === undefined ? position : Math.max(1, position - heading),
      priority: severity === 'note' ? 'consider' : severity,
      summary: reportSummary(first.note), originalText: first.quote,
      rationale: categoryKey === 'factual' && conclusion ? `【核查结论：${conclusion}】${reason}` : reason,
      citations: [...sources.values()].map((source) => ({ urlOrSource: source.url ?? source.name,
        snippet: source.snippet, translation: source.translation, explanation: source.note })),
      findingIds: members.map((member) => member.findingId),
      categoryLabels: distinct(members.map((member) => labels.get(member.categoryId) ?? member.categoryId)),
      severityLabel: REVIEW_FINDING_SEVERITY_LABELS[severity],
      statusLabel: distinct(members.map((member) => REVIEW_FINDING_STATUS_LABELS[member.status])).join('；'),
      chapterLabel: first.chapter?.label ?? '',
      locationLabel: first.locationLabel,
      quote: input.complete ? first.quote : reportQuote(first.quote),
      suggestedText: replacements.length === 0 ? null : replacements.join(' / '),
      reason,
      sources: [...sources.values()],
    };
    const weight = Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1;
    if (!input.complete && spent + weight > MAX_REPORT_FINDING_BYTES) break;
    spent += weight;
    entries.push(entry);
  }
  return { title: '发现详单', entries, omitted: ordered.length - entries.length };
}

/** What a recorded version says apart from its number and time (Issue #1446): two versions with one digest are the same report. */
export function reportContentDigest(record: ReviewReportRecord): string {
  const { version: _version, generatedAt: _generatedAt, ...content } = record;
  return canonicalRecord(content).digest;
}

export function buildReviewReport(input: ReviewReportInput): ReviewReportRecord {
  const labels = new Map(input.categories.map((category) => [category.categoryId, category.label] as const));
  const findingsOf = (categoryId: string): ReadonlyArray<ReviewReportFindingInput> =>
    input.findings.filter((finding) => finding.categoryId === categoryId);
  return {
    schema: REVIEW_REPORT_SCHEMA,
    reviewRunId: input.reviewRunId,
    version: input.version,
    generatedAt: input.generatedAt,
    run: input.run,
    ...(input.manuscriptExtent === undefined ? {} : { manuscriptExtent: input.manuscriptExtent }),
    ...(input.compilation === undefined ? {} : { compilation: input.compilation }),
    totals: reviewFindingCounts(input.findings),
    statistics: reportStatistics(input),
    findings: reportFindings(input),
    overview: {
      title: '概览表',
      rows: input.categories.map((category) => ({
        categoryId: category.categoryId,
        label: category.label,
        state: category.state,
        stateLabel: category.stateLabel,
        counts: reviewFindingCounts(findingsOf(category.categoryId)),
      })),
    },
    // Every 必须处理 finding, whatever became of it: the Report says what was found and what stands now.
    mustItems: {
      title: '必须处理的事项',
      items: input.findings.filter((finding) => finding.severity === 'must').map((finding) => ({
        findingId: finding.findingId,
        categoryId: finding.categoryId,
        categoryLabel: labels.get(finding.categoryId) ?? finding.categoryId,
        locationLabel: finding.locationLabel,
        quote: reportQuote(finding.quote),
        note: finding.note,
        status: finding.status,
        statusLabel: REVIEW_FINDING_STATUS_LABELS[finding.status],
      })),
    },
    categorySummaries: {
      title: '各类别摘要',
      entries: input.categories.map((category) => ({
        categoryId: category.categoryId,
        label: category.label,
        output: category.output,
        counts: reviewFindingCounts(findingsOf(category.categoryId)),
        basisStatement: category.basisStatement,
        excludedCount: category.excludedCount,
        stateLine: category.stateLine,
      })),
    },
    appendix: {
      title: '附录',
      configuration: { schema: input.configuration.schema, version: input.configuration.version, digest: input.configuration.digest },
      categories: input.categories.map((category) => ({
        categoryId: category.categoryId,
        label: category.label,
        guidelineDocuments: category.guidelineDocuments.map((document) => ({
          documentId: document.documentId,
          title: document.title,
          issuer: document.issuer,
          version: document.version,
        })),
        procedure: { procedureId: category.procedure.procedureId, title: category.procedure.title, version: category.procedure.version },
        planEnvelopeDigest: category.planEnvelopeDigest,
        resultSetRevisionId: category.resultSetRevisionId,
        adapterPin: category.adapterPin === null ? null : {
          route: category.adapterPin.route,
          model: category.adapterPin.model,
          fixtureIdentity: category.adapterPin.fixtureIdentity,
          fixtureSha256: category.adapterPin.fixtureSha256,
        },
      })),
    },
  };
}

