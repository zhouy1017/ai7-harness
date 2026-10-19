import { MAX_FRAME_BYTES, BASELINE_ANALYSIS_KIND, type BaselineAnalysisProjection,
  type BaselineAnalysisWireProjection, type BaselineAnalysisResultSetRevisionProjection,
  type AnalysisRevisionWireProjection, type AnalysisGapProjection, type AnalysisGapSummaryProjection,
  type RunReportProjection, type AnalysisRunReportSummaryProjection } from '../../shared/protocol.js';
import { canonicalJson, sha256Hex, requireAnalysis } from './canonical.js';

export const ANALYSIS_PAGE_BYTES = MAX_FRAME_BYTES / 2 - 2048;
const INLINE_UNIT_BYTES = 24 * 1024;
const INLINE_OVERVIEW_BYTES = 128 * 1024;
// One Unicode scalar consumes at most six JSON wire bytes (a control-character escape).
const OVERVIEW_CHUNK_POINTS = Math.floor(ANALYSIS_PAGE_BYTES / 6);
export const serializedBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** The cursor is exclusive. Never split an item or return a non-advancing page. */
export function analysisBytePage<T>(items: ReadonlyArray<T>, after: number, ordinal: (item: T) => number,
  budget = ANALYSIS_PAGE_BYTES): { items: T[]; next: number | null } {
  const remaining = items.filter((item) => ordinal(item) > after);
  const selected: T[] = [];
  let bytes = 2;
  for (const item of remaining) {
    const size = serializedBytes(item) + (selected.length === 0 ? 0 : 1);
    if (selected.length > 0 && bytes + size > budget) break;
    requireAnalysis(size + 2 <= ANALYSIS_PAGE_BYTES, 'ANALYSIS_PAGE_ITEM_TOO_LARGE', '这个阅读范围的分析结果超出可读取范围。');
    selected.push(item);
    bytes += size;
  }
  return { items: selected, next: selected.length < remaining.length ? ordinal(selected.at(-1)!) : null };
}

function gapSummary(gap: AnalysisGapProjection): AnalysisGapSummaryProjection {
  const { blockIds, ...rest } = gap;
  return { ...rest, blockCount: blockIds.length, firstBlockId: blockIds[0] ?? null, lastBlockId: blockIds.at(-1) ?? null };
}

export function revisionUnitsPage(revision: BaselineAnalysisResultSetRevisionProjection, afterOrdinal: number,
  budget = ANALYSIS_PAGE_BYTES) {
  const units = revision.units.map((unit) => unit.state === 'gap' ? { ...unit, gap: gapSummary(unit.gap) } : unit);
  const page = analysisBytePage(units, afterOrdinal, (unit) => unit.unitOrdinal, budget);
  return { revisionId: revision.revisionId, units: page.items, next: page.next };
}

export function analysisOverviewText(revision: BaselineAnalysisResultSetRevisionProjection): string {
  return canonicalJson({ sections: revision.sections, synthesis: revision.synthesis });
}

/** Unicode code-point cursor, with JSON escaping included in the byte budget. */
export function analysisOverviewPage(revision: BaselineAnalysisResultSetRevisionProjection, afterIndex: number) {
  const text = analysisOverviewText(revision);
  const points = Array.from(text);
  requireAnalysis(afterIndex <= points.length, 'ANALYSIS_PAGE_CURSOR_INVALID', '分析读取位置无效。');
  const end = Math.min(points.length, afterIndex + OVERVIEW_CHUNK_POINTS);
  return { revisionId: revision.revisionId, text: points.slice(afterIndex, end).join(''), next: end < points.length ? end : null };
}

function reportSummary(report: RunReportProjection | null, history: boolean): AnalysisRunReportSummaryProjection | null {
  if (report === null) return null;
  const { unitRows, ...summary } = report;
  if (history) return summary;
  if (serializedBytes(unitRows) <= 64 * 1024) return report;
  const page = analysisBytePage(unitRows, 0, (row) => row.unitOrdinal, 32 * 1024);
  return { ...summary, unitRows: page.items, unitPage: { shown: page.items.length, total: unitRows.length, nextOrdinal: page.next } };
}

export function analysisRevisionWire(revision: BaselineAnalysisResultSetRevisionProjection): AnalysisRevisionWireProjection {
  const { units, gaps, sections, synthesis, ...rest } = revision;
  const page = revisionUnitsPage(revision, 0, serializedBytes(units) <= 96 * 1024 ? 96 * 1024 : INLINE_UNIT_BYTES);
  const overview = analysisOverviewText(revision);
  const totalLength = Array.from(overview).length;
  const chunkCount = Buffer.byteLength(overview, 'utf8') <= INLINE_OVERVIEW_BYTES ? 0 : Math.ceil(totalLength / OVERVIEW_CHUNK_POINTS);
  return { ...rest, gaps: gaps.map(gapSummary), units: page.units,
    unitPage: { shown: page.units.length, total: units.length, nextOrdinal: page.next },
    ...(chunkCount === 0 ? { sections, synthesis } : {
      overviewPage: { totalLength, sha256: sha256Hex(overview), chunkCount },
    }),
  };
}

/** One owner at the outbound edge; the ledger and all in-process consumers retain complete records. */
export function baselineAnalysisWire(projection: BaselineAnalysisProjection): BaselineAnalysisWireProjection {
  return { ...projection,
    coverageManifest: projection.coverageManifest === null ? null : { ...projection.coverageManifest,
      units: projection.coverageManifest.units.map(({ blockIds, blockDigests: _digests, overlapBlockIds: _overlap, ...unit }) => ({
        ...unit, blockCount: blockIds.length, firstBlockId: blockIds[0]!, lastBlockId: blockIds.at(-1)!,
      })),
    },
    resultSetRevision: projection.resultSetRevision === null ? null : analysisRevisionWire(projection.resultSetRevision),
    inspectedRevision: projection.inspectedRevision === null ? null : { ...projection.inspectedRevision, revision: analysisRevisionWire(projection.inspectedRevision.revision) },
    update: projection.update === null ? null : { ...projection.update, reusePlan: projection.update.reusePlan === null ? null : {
      ...projection.update.reusePlan, units: projection.update.reusePlan.units.map(({ unitOrdinal, disposition, reason }) => ({ unitOrdinal, disposition, reason })),
    } },
    run: projection.run === null ? null : { ...projection.run, attempt: projection.run.attempt === null ? null : {
      ...projection.run.attempt, spans: projection.run.attempt.spans.slice(-20), spanCount: projection.run.attempt.spans.length,
    } },
    taskOutcome: projection.taskOutcome === null ? null : { ...projection.taskOutcome, report: reportSummary(projection.taskOutcome.report, false) },
    history: projection.history === null ? null : { ...projection.history,
      entries: projection.history.entries.map((entry) => ({ ...entry, report: reportSummary(entry.report, true) })),
    },
    updateControls: projection.updateControls === null ? null : { ...projection.updateControls, actions: {
      ...projection.updateControls.actions, 'reanalyze-range': { ...projection.updateControls.actions['reanalyze-range'],
        options: projection.updateControls.actions['reanalyze-range'].options.map(({ unitOrdinal, label, startPosition, endPosition }) => ({ unitOrdinal, label, startPosition, endPosition })),
      },
    } },
  };
}

/** Only transport envelopes are traversed; other analysis kinds and their projections are untouched. */
export function baselineAnalysisOutbound(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if ('kind' in value && value.kind === BASELINE_ANALYSIS_KIND && 'coverageManifest' in value) {
    return baselineAnalysisWire(value as BaselineAnalysisProjection);
  }
  const record = value as Record<string, unknown>;
  const keys = ['result', 'projection', 'analysis'] as const;
  let mapped = record;
  for (const key of keys) if (key in record) mapped = { ...mapped, [key]: baselineAnalysisOutbound(record[key]) };
  return mapped;
}
