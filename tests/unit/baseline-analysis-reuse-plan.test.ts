import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AnalysisError } from '../../src/service/analysis/canonical.js';
import { deriveCoverageManifest, unitContentKeys, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION } from '../../src/service/analysis/identity.js';
import { deriveReusePlan, requireSelectedRange, reusePlanRecord, selectedRangeClosure, type ReusePlanPredecessor } from '../../src/service/analysis/reuse-plan.js';
import type { CoverageManifestProjection } from '../../src/shared/protocol.js';

// Synthetic blocks only. The reuse plan must be content-exact and position-independent: a unit
// whose own and overlap content digests match a closed predecessor unit is compatible wherever it
// sits, and any own or overlap change, a predecessor gap, or a bypassing mode recomputes it.

function block(name: string, position: number, kind: ManifestBlockInput['kind'], graphemes: number, level: number | null = null): ManifestBlockInput {
  const text = kind === 'paragraph' ? `合成段落 ${name} `.repeat(Math.max(1, Math.ceil(graphemes / 6))).slice(0, graphemes) : `合成标题 ${name}`;
  return {
    blockId: `blk_${createHash('sha256').update(`block-${name}-${position}`).digest('hex').slice(0, 24)}`,
    position,
    kind,
    level,
    text,
    digest: createHash('sha256').update(`${kind}:${level ?? ''}:${text}`).digest('hex'),
    graphemes: kind === 'paragraph' ? graphemes : text.length,
  };
}

function manifestOf(blocks: ManifestBlockInput[]): CoverageManifestProjection {
  return deriveCoverageManifest({
    bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(),
    revisionLabel: 'r2', revisionDigest: 'b'.repeat(64), blocks: blocks.map((entry, index) => ({ ...entry, position: index + 1 })),
  });
}

/** One heading section split into three sub-units: [A, a700], [b600, c500] overlapping a700, [d600, e300] overlapping c500. */
const baseBlocks = [
  block('A', 1, 'heading', 0, 1),
  block('a', 2, 'paragraph', 700),
  block('b', 3, 'paragraph', 600),
  block('c', 4, 'paragraph', 500),
  block('d', 5, 'paragraph', 600),
  block('e', 6, 'paragraph', 300),
];

function predecessorOf(manifest: CoverageManifestProjection, gaps: number[] = [], contractVersion: string = BASELINE_ANALYSIS_CONTRACT_VERSION): ReusePlanPredecessor {
  return {
    revisionId: randomUUID(),
    ordinal: 1,
    digest: 'c'.repeat(64),
    contractVersion,
    coverageManifestDigest: manifest.digest,
    manifest,
    unitStates: manifest.units.map((unit) => ({ unitOrdinal: unit.ordinal, state: gaps.includes(unit.ordinal) ? 'gap' : 'closed' })),
  };
}

describe('unitContentKeys', () => {
  it('derives one key per unit from own and overlap content digests, independent of ordinal and position', () => {
    const base = manifestOf(baseBlocks);
    expect(base.units.map((unit) => [unit.startPosition, unit.endPosition])).toEqual([[1, 2], [3, 4], [5, 6]]);
    const shifted = manifestOf([block('Z', 0, 'heading', 0, 1), ...baseBlocks]);
    expect(shifted.units).toHaveLength(4);
    const baseKeys = unitContentKeys(base);
    const shiftedKeys = unitContentKeys(shifted);
    expect(shiftedKeys.slice(1)).toEqual(baseKeys);
    expect(new Set(baseKeys).size).toBe(3);
    // A change to the last own block of unit 1 changes unit 1 (own) and unit 2 (overlap), never unit 3.
    const edited = manifestOf(baseBlocks.map((entry, index) => index === 1 ? { ...entry, digest: 'e'.repeat(64) } : entry));
    const editedKeys = unitContentKeys(edited);
    expect(editedKeys[0]).not.toBe(baseKeys[0]);
    expect(editedKeys[1]).not.toBe(baseKeys[1]);
    expect(editedKeys[2]).toBe(baseKeys[2]);
  });
});

describe('deriveReusePlan', () => {
  it('同步到当前稿件 reuses every compatible closed unit and recomputes exactly the changed closure', () => {
    const base = manifestOf(baseBlocks);
    const edited = manifestOf(baseBlocks.map((entry, index) => index === 1 ? { ...entry, digest: 'e'.repeat(64) } : entry));
    const plan = deriveReusePlan({ mode: 'sync-current', selectedRange: null, manifest: edited, predecessor: predecessorOf(base) });
    expect(plan.units.map((unit) => [unit.disposition, unit.reason])).toEqual([
      ['recomputed', 'no-compatible-predecessor'], ['recomputed', 'no-compatible-predecessor'], ['reused', 'compatible'],
    ]);
    expect(plan.units[2]!.reusedFrom).toMatchObject({ revisionOrdinal: 1, unitOrdinal: 3 });
    expect(plan.predecessorUnits.map((unit) => unit.disposition)).toEqual(['invalidated', 'invalidated', 'reused']);
    expect(plan.counts).toEqual({ reused: 1, recomputed: 2, invalidated: 2, bypassed: 0 });
    expect(plan.selectedRange).toBeNull();
    expect(plan.recomputeClosure).toEqual([]);
  });

  it('remaps a compatible unit across ordinals and positions and never reuses a predecessor gap', () => {
    const base = manifestOf(baseBlocks);
    const shifted = manifestOf([block('Z', 0, 'heading', 0, 1), ...baseBlocks]);
    const plan = deriveReusePlan({ mode: 'sync-current', selectedRange: null, manifest: shifted, predecessor: predecessorOf(base, [2]) });
    expect(plan.units.map((unit) => [unit.unitOrdinal, unit.disposition, unit.reason, unit.reusedFrom?.unitOrdinal ?? null])).toEqual([
      [1, 'recomputed', 'no-compatible-predecessor', null],
      [2, 'reused', 'compatible', 1],
      [3, 'recomputed', 'predecessor-gap', null],
      [4, 'reused', 'compatible', 3],
    ]);
    expect(plan.predecessorUnits).toEqual([
      { unitOrdinal: 1, state: 'closed', disposition: 'reused', successorUnitOrdinal: 2 },
      { unitOrdinal: 2, state: 'gap', disposition: 'invalidated', successorUnitOrdinal: null },
      { unitOrdinal: 3, state: 'closed', disposition: 'reused', successorUnitOrdinal: 4 },
    ]);
    expect(plan.counts).toEqual({ reused: 2, recomputed: 2, invalidated: 1, bypassed: 0 });
  });

  it('重新分析所选范围 bypasses the intersecting units plus their overlap dependants and reuses the rest', () => {
    const base = manifestOf(baseBlocks);
    expect(Array.from(selectedRangeClosure(base, { startPosition: 3, endPosition: 4 }))).toEqual([2, 3]);
    expect(Array.from(selectedRangeClosure(base, { startPosition: 6, endPosition: 6 }))).toEqual([3]);
    const plan = deriveReusePlan({ mode: 'reanalyze-range', selectedRange: { startPosition: 3, endPosition: 4 }, manifest: base, predecessor: predecessorOf(base) });
    expect(plan.units.map((unit) => [unit.disposition, unit.reason])).toEqual([
      ['reused', 'compatible'], ['recomputed', 'bypassed-selected-range'], ['recomputed', 'bypassed-selected-range'],
    ]);
    expect(plan.predecessorUnits.map((unit) => [unit.disposition, unit.successorUnitOrdinal])).toEqual([['reused', 1], ['bypassed', 2], ['bypassed', 3]]);
    expect(plan.counts).toEqual({ reused: 1, recomputed: 2, invalidated: 0, bypassed: 2 });
    expect(plan.recomputeClosure).toEqual([2, 3]);
    expect(plan.selectedRange).toEqual({ startPosition: 3, endPosition: 4 });
  });

  it('重新分析全书 recomputes every unit and reuses none even when the manifest is identical', () => {
    const base = manifestOf(baseBlocks);
    const plan = deriveReusePlan({ mode: 'reanalyze-book', selectedRange: null, manifest: base, predecessor: predecessorOf(base, [3]) });
    expect(plan.units.every((unit) => unit.disposition === 'recomputed' && unit.reason === 'bypassed-whole-book' && unit.reusedFrom === null)).toBe(true);
    expect(plan.predecessorUnits.map((unit) => unit.disposition)).toEqual(['bypassed', 'bypassed', 'invalidated']);
    expect(plan.counts).toEqual({ reused: 0, recomputed: 3, invalidated: 1, bypassed: 2 });
  });

  it('treats a predecessor under another contract version as incompatible', () => {
    const base = manifestOf(baseBlocks);
    const plan = deriveReusePlan({ mode: 'sync-current', selectedRange: null, manifest: base, predecessor: predecessorOf(base, [], 'ai7.baseline-manuscript-analysis/0') });
    expect(plan.units.every((unit) => unit.reason === 'contract-version-mismatch')).toBe(true);
    expect(plan.counts).toEqual({ reused: 0, recomputed: 3, invalidated: 3, bypassed: 0 });
  });

  it('is canonical and deterministic, and refuses an out-of-revision or misplaced range', () => {
    const base = manifestOf(baseBlocks);
    const predecessor = predecessorOf(base);
    const first = reusePlanRecord(deriveReusePlan({ mode: 'reanalyze-range', selectedRange: { startPosition: 5, endPosition: 6 }, manifest: base, predecessor }));
    const second = reusePlanRecord(deriveReusePlan({ mode: 'reanalyze-range', selectedRange: { startPosition: 5, endPosition: 6 }, manifest: base, predecessor }));
    expect(first.json).toBe(second.json);
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(first.json)).toMatchObject({ schema: 'ai7.baseline-manuscript-analysis.reuse-plan/1', mode: 'reanalyze-range' });
    expect(() => requireSelectedRange({ startPosition: 0, endPosition: 2 }, 6)).toThrowError(AnalysisError);
    expect(() => requireSelectedRange({ startPosition: 2, endPosition: 7 }, 6)).toThrowError(/不在任务输入修订版之内/u);
    expect(() => requireSelectedRange(null, 6)).toThrowError(AnalysisError);
    expect(() => deriveReusePlan({ mode: 'sync-current', selectedRange: { startPosition: 1, endPosition: 1 }, manifest: base, predecessor: predecessorOf(base) })).toThrowError(AnalysisError);
    expect(() => deriveReusePlan({ mode: 'reanalyze-range', selectedRange: null, manifest: base, predecessor: predecessorOf(base) })).toThrowError(AnalysisError);
  });
});
