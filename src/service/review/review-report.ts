import {
  REVIEW_FINDING_STATUS_LABELS,
  type ReviewCategoryOutputKind,
  type ReviewFindingCountsProjection,
  type ReviewFindingSeverity,
  type ReviewFindingStatus,
  type ReviewReportRecord,
  type ReviewRunCategoryState,
} from '../../shared/protocol.js';
import { graphemeCount, sliceGraphemes } from '../analysis/factual-review-contract.js';

/**
 * The 审阅报告 of one Review Run (Issue #417; V2-UX-REV-009): 概览表, 必须处理的事项, 各类别摘要 and an
 * 附录 of the guideline and 工序 versions the Run applied. Each generation is a new version recorded
 * whole; nothing in an earlier version is rewritten, so a Report says what stood when it was made.
 *
 * A Report carries no manuscript text beyond the findings' own quotations, each at most 80 graphemes,
 * and places a finding by its block position rather than by a heading's words. A recorded version exports
 * through the export ledger in the manuscript's formats (`src/service/report-export.ts`, Issue #500); attaching
 * it to a Delivery Package is S66's; it is a record here.
 */
export const REVIEW_REPORT_SCHEMA = 'ai7.review.report/1' as const;
const MAX_REPORT_QUOTE_GRAPHEMES = 80;

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
}

export interface ReviewReportInput {
  readonly reviewRunId: string;
  readonly version: number;
  readonly generatedAt: string;
  readonly run: ReviewReportRecord['run'];
  readonly configuration: { readonly schema: string; readonly version: string; readonly digest: string };
  readonly categories: ReadonlyArray<ReviewReportCategoryInput>;
  readonly findings: ReadonlyArray<ReviewReportFindingInput>;
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
export function reportQuote(quote: string): string {
  return graphemeCount(quote) <= MAX_REPORT_QUOTE_GRAPHEMES ? quote : `${sliceGraphemes(quote, 0, MAX_REPORT_QUOTE_GRAPHEMES - 1)}…`;
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
