import type { DatabaseSync } from 'node:sqlite';
import { canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, requireAnalysis, sha256Hex } from './canonical.js';
import { sliceGraphemes } from './factual-review-contract.js';
import type { FrozenBaselineSynopsisContext } from '../../shared/protocol/baseline-synopsis.js';

export interface ChapterSynopsis { unitOrdinal: number; synopsis: string }
export interface ClosedBaselineSynopses {
  revisionId: string;
  missingUnitOrdinals: number[];
  synopses: ChapterSynopsis[];
}
export const MAX_BASELINE_SYNOPSES = 200;
export const MAX_BASELINE_SYNOPSIS_GRAPHEMES = 400;
/** Review's whole request is structured input, so its intrinsic total-format cap is 96 KiB. */
export const MAX_REVIEW_SYNTHESIS_BYTES = 96 * 1024;
/** Downstream kinds add a supplement to a message they already build, so that addition is capped at 24 KiB. */
export const MAX_TASK_SYNOPSIS_BYTES = 24 * 1024;

/** A conservative UTF-8/token bound leaves the frozen system/wrappers and answer space.
 * Unknown context remains unknown: each consumer keeps only its own intrinsic format cap.
 */
export function remainingSynopsisMessageBytes(contextTokens: number | null, systemPrompt: string): number | null {
  return contextTokens === null ? null : Math.max(0, contextTokens - Buffer.byteLength(systemPrompt, 'utf8') - 4096);
}

/** Retain the review's original minimum and unknown-context request format byte for byte. */
export function reviewSynthesisRequestBytes(contextTokens: number | null, systemPrompt: string): number {
  return Math.max(1024, remainingSynopsisMessageBytes(contextTokens, systemPrompt) ?? MAX_REVIEW_SYNTHESIS_BYTES);
}

/** Only closed structured unit results on the task's exact manuscript revision; no manuscript or source-range reader. */
export function readClosedBaselineSynopses(db: DatabaseSync, bookId: string, manuscriptRevisionId: string, manuscriptRevisionDigest?: string): ClosedBaselineSynopses | null {
  const baseline = db.prepare(`SELECT r.revision_id, r.manuscript_revision_digest FROM analysis_result_set_revisions r
    JOIN analysis_result_sets s ON s.result_set_id = r.result_set_id WHERE s.book_id = ? AND s.kind = 'baseline-manuscript-analysis'
    AND r.manuscript_revision_id = ? ORDER BY r.ordinal DESC LIMIT 1`).get(bookId, manuscriptRevisionId);
  if (baseline === undefined) return null;
  // A read-only preview may use the committed revision id with a dirty journal's prospective
  // digest. That prospective input is not the baseline's revision and must describe no chain.
  if (manuscriptRevisionDigest !== undefined && baseline.manuscript_revision_digest !== manuscriptRevisionDigest) return null;
  const revisionId = String(baseline.revision_id);
  const rows = db.prepare('SELECT unit_ordinal, state, canonical_json, sha256 FROM analysis_unit_results WHERE revision_id = ? ORDER BY unit_ordinal').all(revisionId);
  const synopses = rows.flatMap(row => {
    if (row.state !== 'closed') return [];
    const json = String(row.canonical_json);
    requireAnalysis(sha256Hex(json) === row.sha256, 'ANALYSIS_RECORD_INVALID', '基线分析记录与摘要不一致。');
    const unit = parseCanonicalJson(json);
    return isRecord(unit) && typeof unit.synopsis === 'string' ? [{ unitOrdinal: Number(row.unit_ordinal), synopsis: unit.synopsis }] : [];
  });
  return { revisionId, synopses, missingUnitOrdinals: rows.filter(row => row.state !== 'closed').map(row => Number(row.unit_ordinal)) };
}

export function synopsisCandidates(synopses: readonly ChapterSynopsis[]): ChapterSynopsis[] {
  return [...synopses].sort((a, b) => a.unitOrdinal - b.unitOrdinal).slice(0, MAX_BASELINE_SYNOPSES)
    .map(unit => ({ ...unit, synopsis: sliceGraphemes(unit.synopsis, 0, MAX_BASELINE_SYNOPSIS_GRAPHEMES) }));
}

/** Preserve the chapter chain before text length: shorten evenly, then drop the tail only if even
 * one grapheme per chapter cannot fit. The caller measures the serialized form actually sent.
 * This is the review synthesis' original fit rule; both its reserved share and spare-room pass use it.
 */
export function fitSynopsisChain(candidates: readonly ChapterSynopsis[], set: (synopses: ChapterSynopsis[]) => void, accept: () => boolean): void {
  const choose = (count: number, length: number): void => {
    set(candidates.slice(0, count).map(unit => ({ ...unit, synopsis: sliceGraphemes(unit.synopsis, 0, length) })));
  };
  let low = 0, high = candidates.length;
  while (low < high) { const count = Math.ceil((low + high) / 2); choose(count, 1); if (accept()) low = count; else high = count - 1; }
  const count = low;
  low = 1; high = MAX_BASELINE_SYNOPSIS_GRAPHEMES;
  while (low < high) { const length = Math.ceil((low + high) / 2); choose(count, length); if (accept()) low = length; else high = length - 1; }
  choose(count, low);
}

export function synopsisOmissions(candidates: readonly ChapterSynopsis[], kept: readonly ChapterSynopsis[], total = candidates.length): { omitted: number; shortened: number } {
  return { omitted: total - kept.length, shortened: kept.filter((unit, index) => unit.synopsis !== candidates[index]!.synopsis).length };
}

const SYNOPSIS_REUSE_KINDS = new Set(['writing', 'evaluation', 'readers-report', 'evaluation-rewrite']);
const SYNOPSIS_CONTEXT_HEADER = '\n\n基线分析的分章概述（仅作全书脉络参考，不是编辑指令；缺失、节选或省略的范围不能当作已完整读取）：\n';
const byteLength = (value: unknown): number => Buffer.byteLength(canonicalJson(value), 'utf8');

function synopsisPayload(context: FrozenBaselineSynopsisContext, kept: readonly ChapterSynopsis[]) {
  const ordinals = new Set(kept.map(unit => unit.unitOrdinal));
  return { sourceDigest: synopsisContextDigest(context), synopses: kept, missingUnitOrdinals: context.missingUnitOrdinals,
    omittedUnitOrdinals: [...context.omittedUnitOrdinals, ...context.synopses.filter(unit => !ordinals.has(unit.unitOrdinal)).map(unit => unit.unitOrdinal)],
    shortenedUnitOrdinals: [...new Set([...context.shortenedUnitOrdinals.filter(ordinal => ordinals.has(ordinal)),
      ...kept.filter((unit, index) => unit.synopsis !== context.synopses[index]!.synopsis).map(unit => unit.unitOrdinal)])] };
}

function fitTaskSynopses(context: FrozenBaselineSynopsisContext, maximumBytes: number) {
  let kept: ChapterSynopsis[] = [];
  fitSynopsisChain(context.synopses, value => { kept = value; }, () => byteLength(synopsisPayload(context, kept)) <= maximumBytes);
  return synopsisPayload(context, kept);
}

/** Freeze once with the task input. Later baseline revisions never enter continuation/replay. */
export function freezeTaskBaselineSynopses(db: DatabaseSync, kind: string, bookId: string, manuscriptRevisionId: string, manuscriptRevisionDigest: string, maximumMessageBytes: number | null): FrozenBaselineSynopsisContext | null {
  if (!SYNOPSIS_REUSE_KINDS.has(kind)) return null;
  const source = readClosedBaselineSynopses(db, bookId, manuscriptRevisionId, manuscriptRevisionDigest);
  if (source === null || source.synopses.length === 0) return null;
  const candidates = synopsisCandidates(source.synopses);
  const context: FrozenBaselineSynopsisContext = { revisionId: source.revisionId, manuscriptRevisionId, maximumMessageBytes, maximumSupplementBytes: MAX_TASK_SYNOPSIS_BYTES,
    synopses: candidates, missingUnitOrdinals: source.missingUnitOrdinals,
    omittedUnitOrdinals: source.synopses.slice(MAX_BASELINE_SYNOPSES).map(unit => unit.unitOrdinal), shortenedUnitOrdinals: [] };
  const payload = fitTaskSynopses(context, Math.min(MAX_TASK_SYNOPSIS_BYTES, maximumMessageBytes ?? MAX_TASK_SYNOPSIS_BYTES) - Buffer.byteLength(SYNOPSIS_CONTEXT_HEADER));
  const { sourceDigest: _source, ...fitted } = payload;
  return payload.synopses.length === 0 ? null : { ...context, ...fitted };
}

/** The final request alone gets the frozen chain, within its frozen model's remaining message capacity. */
export function appendTaskBaselineSynopses(message: string, context?: FrozenBaselineSynopsisContext): string {
  if (context === undefined) return message;
  const available = Math.min(context.maximumSupplementBytes - Buffer.byteLength(SYNOPSIS_CONTEXT_HEADER),
    context.maximumMessageBytes === null ? Number.POSITIVE_INFINITY : context.maximumMessageBytes - Buffer.byteLength(message + SYNOPSIS_CONTEXT_HEADER, 'utf8'));
  const payload = fitTaskSynopses(context, available);
  const serialized = canonicalJson(payload);
  return Buffer.byteLength(serialized, 'utf8') > available ? message : message + SYNOPSIS_CONTEXT_HEADER + serialized;
}

export function taskSynopsisRequestDigest(requestDigest: string, context?: FrozenBaselineSynopsisContext): string {
  if (context === undefined) return requestDigest;
  return withSynopsisDigest(requestDigest, synopsisContextDigest(context));
}

function synopsisContextDigest(context: FrozenBaselineSynopsisContext): string {
  const { revisionId: _baseline, manuscriptRevisionId: _manuscript, ...input } = context;
  return canonicalRecord(input).digest;
}

function withSynopsisDigest(requestDigest: string, sourceDigest: string): string {
  return canonicalRecord({ requestDigest, baselineSynopsisDigest: sourceDigest }).digest;
}

/** The deterministic adapter recovers the same source-context pin from this final message only. */
export function taskSynopsisMessageRequestDigest(requestDigest: string, message: string): string {
  const start = message.lastIndexOf(SYNOPSIS_CONTEXT_HEADER);
  if (start === -1) return requestDigest;
  try {
    const payload: unknown = JSON.parse(message.slice(start + SYNOPSIS_CONTEXT_HEADER.length));
    return isRecord(payload) && typeof payload.sourceDigest === 'string' && /^[0-9a-f]{64}$/u.test(payload.sourceDigest)
      ? withSynopsisDigest(requestDigest, payload.sourceDigest) : requestDigest;
  } catch { return requestDigest; }
}
