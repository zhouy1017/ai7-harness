import type { DatabaseSync } from 'node:sqlite';
import { asString, requireStore } from './store-records.js';
import { reviewFindingHasGuessedAnchor } from '../shared/review-basis.js';
import type { ReviewWorkspaceProjection, ReviewFindingPageRequest, EvaluationWorkspaceProjection } from '../shared/protocol.js';
import { BOOK_FINDINGS_PAGE_SIZE, type BookFindingProjection, type BookFindingsProjection, type BaselineAnalysisResultSetRevisionProjection, type ParagraphAnalysisProjection } from '../shared/protocol.js';

/** A disposable page over the owning records. No dispositions or other records live here. */
export function bookFindingsPage(bookId: string, findings: Iterable<BookFindingProjection>, offset: number): BookFindingsProjection {
  const groups = new Map<string, BookFindingsProjection['groups'][number]>();
  const items: BookFindingProjection[] = [];
  let total = 0;
  for (const finding of findings) {
    let group = groups.get(finding.category);
    if (group === undefined) {
      group = { category: finding.category, label: finding.categoryLabel, count: 0, bySeverity: {}, byStatus: {} };
      groups.set(finding.category, group);
    }
    group.count += 1;
    // These dictionaries are created here and never shared with the source records.
    const severity = group.bySeverity as Record<string, number>;
    const status = group.byStatus as Record<string, number>;
    severity[finding.severity] = (severity[finding.severity] ?? 0) + 1;
    status[finding.status] = (status[finding.status] ?? 0) + 1;
    if (total >= offset && items.length < BOOK_FINDINGS_PAGE_SIZE) items.push({ ...finding, summary: finding.summary.slice(0, 500) });
    total += 1;
  }
  return { bookId, total, offset, next: offset + items.length < total ? offset + items.length : null, pageSize: BOOK_FINDINGS_PAGE_SIZE, groups: [...groups.values()], items };
}

/**
 * Anchors, never name matching: an item belongs here only when it cites a nearby block. The synthesis, its sections and the
 * units restate one item at each level, so an item is listed once per kind and wording, at its first nearby anchor.
 */
export function paragraphAnalysis(bookId: string, manuscriptId: string, blockId: string, nearby: ReadonlySet<string>, revision: BaselineAnalysisResultSetRevisionProjection | null): ParagraphAnalysisProjection {
  const items: ParagraphAnalysisProjection['items'][number][] = [];
  let total = 0;
  if (revision !== null) {
    const seen = new Set<string>();
    for (const source of [revision.synthesis, ...revision.sections, ...revision.units]) {
      if (!('entities' in source)) continue;
      for (const kind of ['entities', 'events', 'settingClaims', 'relationships'] as const) {
        for (const item of source[kind]) {
          const anchor = item.sourceRanges.find((range) => nearby.has(range.blockId));
          if (anchor === undefined) continue;
          const label = 'name' in item ? item.name : 'summary' in item ? item.summary : 'claim' in item ? `${item.subject}：${item.claim}` : `${item.subject} · ${item.relation} · ${item.object}`;
          const key = JSON.stringify([kind, label]);
          if (seen.has(key)) continue;
          seen.add(key);
          total += 1;
          if (items.length < 40) items.push({ kind, label: label.slice(0, 500), blockId: anchor.blockId });
        }
      }
    }
  }
  return { bookId, manuscriptId, blockId, revision: revision === null ? null : { revisionId: revision.revisionId, ordinal: revision.ordinal, freshness: revision.freshness }, total, items };
}

/** Aggregates current readings without owning their state. */
export interface BookFindingsHost {
  readonly authority: DatabaseSync;
  evaluationBookTitle(bookId: string): string;
  latestAnalysisRevision(bookId: string): BaselineAnalysisResultSetRevisionProjection | null;
  inspectReviewWorkspace(bookId: string, reviewRunId: string | null, progress?: undefined, page?: ReviewFindingPageRequest): ReviewWorkspaceProjection;
  inspectEvaluation(bookId: string, recordId: string | null): EvaluationWorkspaceProjection;
}

/** Read-only aggregation: the source owners derive dispositions on every read. */
export function inspectBookFindings(host: BookFindingsHost, bookId: string, offset = 0): BookFindingsProjection {
  requireStore(Number.isSafeInteger(offset) && offset >= 0, 'FINDINGS_PAGE_INVALID', '发现分页无效。');
  host.evaluationBookTitle(bookId);
  const store = host;
  function* findings(): Generator<BookFindingProjection> {
    const revision = store.latestAnalysisRevision(bookId);
    if (revision !== null) for (const gap of revision.gaps) {
      yield { id: `gap:${revision.revisionId}:${gap.unitOrdinal}`, category: 'analysis-gaps', categoryLabel: '分析未完成的部分', severity: '提示', status: '待处理', summary: gap.reason,
        target: { kind: 'gap', revisionId: revision.revisionId, unitOrdinal: gap.unitOrdinal, blockId: gap.blockIds[0] ?? null } };
    }
    // The workspace's history is bounded; enumerate identities from its ledger, then page each Run through its owner.
    const runs = store.authority.prepare('SELECT review_run_id FROM review_runs WHERE book_id = ? ORDER BY ordinal DESC').iterate(bookId);
    for (const row of runs) {
      const reviewRunId = asString(row.review_run_id);
      let after: number | null = null;
      for (;;) {
        const run: NonNullable<ReviewWorkspaceProjection['run']> = store.inspectReviewWorkspace(bookId, reviewRunId, undefined,
          { findingsAfterOrdinal: after, categoryId: null, severity: null, status: null, chapterBlockId: null }).run!;
        for (const finding of run.findings) if (finding.status === 'pending') {
          yield { id: finding.findingId, category: `review:${finding.categoryId}`, categoryLabel: finding.categoryLabel, severity: finding.severityLabel, status: finding.statusLabel, summary: finding.note,
            ...(finding.output === 'change-suggestion' && finding.markId !== null && finding.markStatus === 'open' && finding.anchorState === 'exact' && finding.replacement !== null ? {
              suggestion: { manuscriptId: run.manuscript.manuscriptId, branchId: run.manuscript.branchId, markId: finding.markId, blockId: finding.blockId,
                batchAllowed: !reviewFindingHasGuessedAnchor(finding.note) && run.categories.some((category) => category.categoryId === finding.categoryId && category.batchApply), quote: finding.quote, replacement: finding.replacement },
            } : {}),
            target: { kind: 'review', reviewRunId, findingId: finding.findingId, blockId: finding.blockId } };
        }
        if (!run.findingsTruncated || run.findings.length === 0) break;
        after = run.findings[run.findings.length - 1]!.ordinal;
      }
    }
    // Only the version on show is current: an earlier version is immutable history, its risks carried or settled by the next.
    const record = store.inspectEvaluation(bookId, null).record;
    if (record !== null) {
      for (const risk of record.content.risks) if (!risk.reviewed && (risk.level !== null || risk.statement !== null)) {
        yield { id: `risk:${record.recordId}:${risk.riskId}`, category: 'evaluation-risks', categoryLabel: '评估风险', severity: risk.level === 'high' ? '高' : risk.level === 'medium' ? '中' : risk.level === 'low' ? '低' : '未评级', status: '待处理',
          summary: risk.statement ?? record.profile.risks.find((item) => item.riskId === risk.riskId)?.label ?? '评估风险',
          target: { kind: 'risk', recordId: record.recordId, riskId: risk.riskId, revisionId: record.revisionId } };
      }
    }
  }
  return bookFindingsPage(bookId, findings(), offset);
}
