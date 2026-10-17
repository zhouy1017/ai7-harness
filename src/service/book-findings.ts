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

/** Anchors, never name matching: an item belongs here only when it cites a nearby block. */
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
          const key = JSON.stringify([kind, label, item.sourceRanges]);
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
