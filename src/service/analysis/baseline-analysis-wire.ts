import { MAX_FRAME_BYTES, BASELINE_ANALYSIS_KIND, type BaselineAnalysisProjection,
  type BaselineAnalysisWireProjection, type BaselineAnalysisResultSetRevisionProjection,
  type AnalysisRevisionWireProjection, type AnalysisGapProjection, type AnalysisGapSummaryProjection,
  type RunReportProjection, type AnalysisRunReportSummaryProjection } from '../../shared/protocol.js';
import { canonicalJson, sha256Hex, requireAnalysis } from './canonical.js';

export const ANALYSIS_PAGE_BYTES = MAX_FRAME_BYTES / 2 - 2048;
const INLINE_UNIT_BYTES = 24 * 1024;
const INLINE_OVERVIEW_BYTES = ANALYSIS_PAGE_BYTES;

export const serializedBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** The cursor is exclusive. Never split an item or return a non-advancing page. */
export function analysisBytePage<T>(items: ReadonlyArray<T>, after: number, ordinal: (item: T) => number,
  budget = ANALYSIS_PAGE_BYTES, allowEmpty = false): { items: T[]; next: number | null } {
  const remaining = items.filter((item) => ordinal(item) > after);
  const selected: T[] = [];
  let bytes = 2;
  for (const item of remaining) {
    const size = serializedBytes(item) + (selected.length === 0 ? 0 : 1);
    if ((selected.length > 0 || allowEmpty) && bytes + size > budget) break;
    requireAnalysis(size + 2 <= ANALYSIS_PAGE_BYTES, 'ANALYSIS_PAGE_ITEM_TOO_LARGE', '这个阅读范围的分析结果超出可读取范围。');
    selected.push(item);
    bytes += size;
  }
  return { items: selected, next: selected.length < remaining.length ? (selected.length === 0 ? after : ordinal(selected.at(-1)!)) : null };
}

function gapSummary(gap: AnalysisGapProjection): AnalysisGapSummaryProjection {
  const { blockIds, ...rest } = gap;
  return { ...rest, blockCount: blockIds.length, firstBlockId: blockIds[0] ?? null, lastBlockId: blockIds.at(-1) ?? null };
}

export function revisionUnitsPage(revision: BaselineAnalysisResultSetRevisionProjection, afterOrdinal: number,
  budget = ANALYSIS_PAGE_BYTES, inline = false) {
  const units = revision.units.map((unit) => unit.state === 'gap' ? { ...unit, gap: gapSummary(unit.gap) } : unit);
  const page = analysisBytePage(units, afterOrdinal, (unit) => unit.unitOrdinal, budget, inline);
  return { revisionId: revision.revisionId, units: page.items, next: page.next };
}

export function analysisOverviewText(revision: BaselineAnalysisResultSetRevisionProjection): string {
  return canonicalJson({ sections: revision.sections, synthesis: revision.synthesis });
}

interface OverviewTransfer {
  text: string; bytes: number; totalLength: number; sha256: string;
  chunks: ReadonlyArray<{ start: number; end: number; from: number; to: number }>;
}
// Two immutable revisions suffice for the current/history view. This is a bounded transport working set,
// never a result store: every paged read first resolves its Book/revision through the ledger.
const overviewTransfers = new Map<string, OverviewTransfer>();
const OVERVIEW_WORKING_BYTES = 64 * 1024 * 1024;
function overviewTransfer(revision: BaselineAnalysisResultSetRevisionProjection): OverviewTransfer {
  const key = `${revision.manuscriptPin.bookId}/${revision.revisionId}/${revision.digest}`;
  const kept = overviewTransfers.get(key);
  if (kept !== undefined) { overviewTransfers.delete(key); overviewTransfers.set(key, kept); return kept; }
  const text = analysisOverviewText(revision);
  const chunks: Array<{ start: number; end: number; from: number; to: number }> = [];
  let ordinal = 0; let offset = 0; let from = 0; let start = 0; let chunkBytes = 0;
  for (const point of text) {
    const scalar = point.codePointAt(0)!;
    const bytes = scalar === 34 || scalar === 92 ? 2 : scalar < 32 ? ([8, 9, 10, 12, 13].includes(scalar) ? 2 : 6)
      : scalar <= 0x7f ? 1 : scalar <= 0x7ff ? 2 : scalar <= 0xffff ? 3 : 4;
    if (chunkBytes + bytes > ANALYSIS_PAGE_BYTES) {
      chunks.push({ start, end: ordinal, from, to: offset }); start = ordinal; from = offset; chunkBytes = 0;
    }
    chunkBytes += bytes; ordinal += 1; offset += point.length;
  }
  chunks.push({ start, end: ordinal, from, to: offset });
  const transfer = { text, bytes: Buffer.byteLength(text, 'utf8'), totalLength: ordinal, sha256: sha256Hex(text), chunks };
  if (transfer.bytes <= OVERVIEW_WORKING_BYTES) {
    let held = [...overviewTransfers.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    while (overviewTransfers.size > 0 && (overviewTransfers.size >= 2 || held + transfer.bytes > OVERVIEW_WORKING_BYTES)) {
      const first = overviewTransfers.keys().next().value!;
      held -= overviewTransfers.get(first)!.bytes; overviewTransfers.delete(first);
    }
    overviewTransfers.set(key, transfer);
  }
  return transfer;
}

/** Returned cursors count Unicode code points; page cuts include JSON escaping in their byte budget. */
export function analysisOverviewPage(revision: BaselineAnalysisResultSetRevisionProjection, afterIndex: number) {
  const transfer = overviewTransfer(revision);
  if (afterIndex === transfer.totalLength) return { revisionId: revision.revisionId, text: '', next: null };
  const chunk = transfer.chunks.find((entry) => entry.start === afterIndex);
  requireAnalysis(chunk !== undefined, 'ANALYSIS_PAGE_CURSOR_INVALID', '分析读取位置无效。');
  return { revisionId: revision.revisionId, text: transfer.text.slice(chunk.from, chunk.to),
    next: chunk.end < transfer.totalLength ? chunk.end : null };
}

function reportSummary(report: RunReportProjection | null, history: boolean): AnalysisRunReportSummaryProjection | null {
  if (report === null) return null;
  const { unitRows, ...summary } = report;
  if (history) return summary;
  if (serializedBytes(unitRows) <= 64 * 1024) return report;
  const page = analysisBytePage(unitRows, 0, (row) => row.unitOrdinal, 32 * 1024);
  return { ...summary, unitRows: page.items, unitPage: { shown: page.items.length, total: unitRows.length, nextOrdinal: page.next } };
}

export function analysisRevisionWire(revision: BaselineAnalysisResultSetRevisionProjection, overviewBudget = INLINE_OVERVIEW_BYTES): AnalysisRevisionWireProjection {
  const { units, gaps, sections, synthesis, ...rest } = revision;
  const page = revisionUnitsPage(revision, 0, serializedBytes(units) <= 96 * 1024 ? 96 * 1024 : INLINE_UNIT_BYTES, true);
  const overview = overviewTransfer(revision);
  const totalLength = overview.totalLength;
  const chunkCount = overview.bytes <= overviewBudget ? 0 : overview.chunks.length;
  return { ...rest, gaps: gaps.map(gapSummary), units: page.units,
    unitPage: { shown: page.units.length, total: units.length, nextOrdinal: page.next },
    ...(chunkCount === 0 ? { sections, synthesis } : {
      overviewPage: { totalLength, sha256: overview.sha256, chunkCount },
    }),
  };
}

/** One owner at the outbound edge; the ledger and all in-process consumers retain complete records. */
export function baselineAnalysisWire(projection: BaselineAnalysisProjection, bounded = true, replyBudget = MAX_FRAME_BYTES - 72 * 1024): BaselineAnalysisWireProjection {
  const wire: BaselineAnalysisWireProjection = { ...projection, listPages: {},
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
  if (!bounded) return wire;
  if (projection.run?.attempt != null && projection.run.attempt.spans.length > 20) {
    wire.listPages = { 'run.attempt.spans': { shown: wire.run!.attempt!.spans.length,
      total: projection.run.attempt.spans.length, nextOrdinal: wire.run!.attempt!.spans[0]!.ordinal, descending: true } };
  }
  if (serializedBytes(wire) <= replyBudget) return wire;
  // Two individually small overviews can still exhaust the one enclosing reply when history is open.
  if (serializedBytes(wire) > replyBudget) {
    if (projection.resultSetRevision !== null) wire.resultSetRevision = analysisRevisionWire(projection.resultSetRevision, 0);
    if (projection.inspectedRevision !== null) wire.inspectedRevision = { ...projection.inspectedRevision,
      revision: analysisRevisionWire(projection.inspectedRevision.revision, 0) };
  }
  let share = 12 * 1024;
  for (;;) {
    const paged = boundSummaryLists(wire, share);
    if (share === 0) {
      for (const revision of [paged.resultSetRevision, paged.inspectedRevision?.revision]) if (revision != null) {
        revision.units = []; revision.unitPage = { shown: 0, total: revision.unitPage.total, nextOrdinal: revision.unitPage.total === 0 ? null : 0 };
      }
      const report = paged.taskOutcome?.report;
      if (report?.unitRows !== undefined) {
        const total = report.unitPage?.total ?? report.unitRows.length;
        report.unitRows = []; report.unitPage = { shown: 0, total, nextOrdinal: total === 0 ? null : 0 };
      }
      if (paged.run?.attempt != null) {
        paged.run.attempt.spans = [];
        paged.listPages = { ...paged.listPages, 'run.attempt.spans': { shown: 0, total: paged.run.attempt.spanCount,
          nextOrdinal: paged.run.attempt.spanCount === 0 ? null : 0, descending: true } };
      }
    }
    if (serializedBytes(paged) <= replyBudget) return paged;
    requireAnalysis(share > 0, 'ANALYSIS_SUMMARY_TOO_LARGE', '分析摘要超出可读取范围，请打开具体阅读范围。');
    share = share < 256 ? 0 : Math.floor(share / 2);
  }
}

export const BASELINE_SUMMARY_LIST_PATHS = [
  'coverageManifest.units', 'update.reusePlan.units', 'update.reusePlan.predecessorUnits', 'update.reusePlan.recomputeClosure',
  'updateControls.actions.reanalyze-range.options', 'history.entries', 'run.transitions', 'run.adaptations',
  'planVersions', 'planRevisions', 'runSourceScope.unitScope.recomputedUnitOrdinals', 'runSourceScope.unitScope.reusedUnitOrdinals',
  'taskOutcome.report.adaptations', 'taskOutcome.report.failures', 'taskOutcome.report.modelClarifications',
  ...['resultSetRevision', 'inspectedRevision.revision'].flatMap((root) => [
    'lineage', 'gaps', 'conflicts', 'crossUnitFindings', 'provenance.adaptations.unitOrdinals',
    'assuranceSample.strata', 'assuranceSample.dispositions',
  ].map((field) => `${root}.${field}`)),
] as const;

function listAt(value: unknown, path: string): ReadonlyArray<unknown> | null {
  let current = value;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : null;
}
function replaceList(value: unknown, path: string, items: ReadonlyArray<unknown>): void {
  const keys = path.split('.');
  let current = value as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) current = current[key] as Record<string, unknown>;
  current[keys.at(-1)!] = items;
}
function ordinalOf(item: unknown, index: number): number {
  if (typeof item === 'number') return item;
  if (item !== null && typeof item === 'object') {
    const row = item as Record<string, unknown>;
    if (typeof row['ordinal'] === 'number') return row['ordinal'];
    if (typeof row['unitOrdinal'] === 'number') return row['unitOrdinal'];
  }
  return index + 1;
}
function boundSummaryLists(wire: BaselineAnalysisWireProjection, budget: number): BaselineAnalysisWireProjection {
  const paged = structuredClone(wire);
  const pages = { ...wire.listPages };
  for (const path of BASELINE_SUMMARY_LIST_PATHS) {
    const list = listAt(wire, path);
    if (list === null || list.length === 0 || serializedBytes(list) <= budget) continue;
    const descending = path === 'history.entries';
    const ordered = descending ? [...list].reverse() : list;
    const selected: unknown[] = [];
    let bytes = 2;
    for (const item of ordered) {
      const size = serializedBytes(item) + (selected.length === 0 ? 0 : 1);
      if (bytes + size > budget) break;
      selected.push(item); bytes += size;
    }
    replaceList(paged, path, selected);
    pages[path] = { shown: selected.length, total: list.length,
      nextOrdinal: selected.length === 0 ? 0 : ordinalOf(selected.at(-1), selected.length - 1), ...(descending ? { descending: true } : {}) };
  }
  paged.listPages = pages;
  return paged;
}

/** Reads only a declared list of the same Task/revision snapshot; anonymous lists use one-based row ordinals. */
export function baselineAnalysisSummaryPage(projection: BaselineAnalysisProjection, path: string, afterOrdinal: number) {
  requireAnalysis(path === 'run.attempt.spans' || BASELINE_SUMMARY_LIST_PATHS.some((candidate) => candidate === path),
    'ANALYSIS_PAGE_PATH_INVALID', '分析读取范围无效。');
  let list: ReadonlyArray<unknown> | null;
  switch (path) {
    case 'run.attempt.spans': list = projection.run?.attempt?.spans ?? []; break;
    case 'coverageManifest.units': list = projection.coverageManifest?.units.map(({ blockIds, blockDigests: _digests, overlapBlockIds: _overlap, ...unit }) => ({
      ...unit, blockCount: blockIds.length, firstBlockId: blockIds[0]!, lastBlockId: blockIds.at(-1)!,
    })) ?? []; break;
    case 'update.reusePlan.units': list = projection.update?.reusePlan?.units.map(({ unitOrdinal, disposition, reason }) => ({ unitOrdinal, disposition, reason })) ?? []; break;
    case 'updateControls.actions.reanalyze-range.options': list = projection.updateControls?.actions['reanalyze-range'].options.map(({ unitOrdinal, label, startPosition, endPosition }) => ({ unitOrdinal, label, startPosition, endPosition })) ?? []; break;
    case 'history.entries': list = projection.history?.entries.map((entry) => ({ ...entry, report: reportSummary(entry.report, true) })) ?? []; break;
    default: {
      list = listAt(projection, path);
      if (list !== null && path.endsWith('.gaps')) list = (list as ReadonlyArray<AnalysisGapProjection>).map(gapSummary);
    }
  }
  requireAnalysis(list !== null, 'ANALYSIS_PAGE_PATH_INVALID', '分析读取范围无效。');
  const descending = path === 'history.entries' || path === 'run.attempt.spans';
  const indexed = list.map((item, index) => ({ item, ordinal: ordinalOf(item, index) }));
  const remaining = descending ? indexed.filter((row) => afterOrdinal === 0 || row.ordinal < afterOrdinal).reverse()
    : indexed.filter((row) => row.ordinal > afterOrdinal);
  const page = analysisBytePage(remaining, 0, (_row) => 1);
  return { path, items: page.items.map((row) => row.item),
    nextOrdinal: page.items.length < remaining.length ? page.items.at(-1)!.ordinal : null, listPages: {} };
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
