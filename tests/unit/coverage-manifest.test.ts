import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  UNIT_BUDGET_GRAPHEMES,
  UNIT_OVERLAP_BLOCKS,
  canonicalManifestJson,
  deriveCoverageManifest,
  manifestCoversEveryBlock,
  manifestDigestIsExact,
  type ManifestBlockInput,
} from '../../src/service/analysis/coverage-manifest.js';
import { AnalysisError } from '../../src/service/analysis/canonical.js';

// Synthetic blocks only: short public placeholder text whose grapheme counts are chosen to drive the
// structure-aware splitting rules. No SampleBook or manuscript content appears here.

function block(position: number, kind: ManifestBlockInput['kind'], graphemes: number, level: number | null = null): ManifestBlockInput {
  const text = kind === 'paragraph' ? '合成段落'.repeat(Math.max(1, Math.ceil(graphemes / 4))).slice(0, graphemes) : `合成标题 ${position}`;
  return {
    blockId: `blk_${createHash('sha256').update(`block-${position}`).digest('hex').slice(0, 24)}`,
    position,
    kind,
    level,
    text,
    digest: createHash('sha256').update(`${kind}:${level ?? ''}:${text}`).digest('hex'),
    graphemes: kind === 'paragraph' ? graphemes : text.length,
  };
}

function identity() {
  return {
    bookId: randomUUID(),
    manuscriptId: randomUUID(),
    branchId: randomUUID(),
    revisionId: randomUUID(),
    revisionLabel: 'r2',
    revisionDigest: 'a'.repeat(64),
  };
}

describe('deriveCoverageManifest', () => {
  it('turns every heading-delimited section into one unit and covers every block exactly once', () => {
    const blocks = [
      block(1, 'title', 0, 1),
      block(2, 'paragraph', 100),
      block(3, 'heading', 0, 1),
      block(4, 'paragraph', 200),
      block(5, 'paragraph', 300),
      block(6, 'heading', 0, 2),
      block(7, 'paragraph', 50),
    ];
    const manifest = deriveCoverageManifest({ ...identity(), blocks });
    expect(manifest.schema).toBe('ai7.coverage-manifest/1');
    expect(manifest.sectionCount).toBe(3);
    expect(manifest.units.map((unit) => [unit.startPosition, unit.endPosition])).toEqual([[1, 2], [3, 5], [6, 7]]);
    expect(manifest.units.every((unit) => unit.subUnitCount === 1 && unit.overlapBlockIds.length === 0)).toBe(true);
    expect(manifest.units[1]!.headingText).toBe('合成标题 3');
    expect(manifest.units[1]!.headingLevel).toBe(1);
    expect(manifest.units[1]!.blockDigests).toEqual(blocks.slice(2, 5).map((entry) => entry.digest));
    expect(manifest.parameters).toEqual({ unitBudgetGraphemes: UNIT_BUDGET_GRAPHEMES, overlapBlocks: UNIT_OVERLAP_BLOCKS });
    expect(manifestCoversEveryBlock(manifest)).toBe(true);
    expect(manifestDigestIsExact(manifest)).toBe(true);
  });

  it('splits a section over the unit budget into ordered sub-units with bounded overlap', () => {
    const blocks = [
      block(1, 'heading', 0, 1),
      block(2, 'paragraph', 700),
      block(3, 'paragraph', 600),
      block(4, 'paragraph', 500),
      block(5, 'paragraph', 200),
    ];
    const manifest = deriveCoverageManifest({ ...identity(), blocks });
    expect(manifest.units.map((unit) => unit.blockIds.map((id) => blocks.findIndex((entry) => entry.blockId === id) + 1))).toEqual([
      [1, 2], [3, 4], [5],
    ]);
    expect(manifest.units.map((unit) => [unit.sectionOrdinal, unit.subUnitIndex, unit.subUnitCount])).toEqual([[1, 1, 3], [1, 2, 3], [1, 3, 3]]);
    expect(manifest.units[0]!.overlapBlockIds).toEqual([]);
    expect(manifest.units[1]!.overlapBlockIds).toEqual([blocks[1]!.blockId]);
    expect(manifest.units[2]!.overlapBlockIds).toEqual([blocks[3]!.blockId]);
    expect(manifest.units.every((unit) => unit.graphemes <= UNIT_BUDGET_GRAPHEMES)).toBe(true);
    expect(manifestCoversEveryBlock(manifest)).toBe(true);
  });

  it('keeps leading paragraphs before the first heading as their own section and admits an oversized single block', () => {
    const blocks = [block(1, 'paragraph', 40), block(2, 'paragraph', UNIT_BUDGET_GRAPHEMES + 500), block(3, 'heading', 0, 1)];
    const manifest = deriveCoverageManifest({ ...identity(), blocks });
    expect(manifest.units.map((unit) => [unit.sectionOrdinal, unit.startPosition, unit.endPosition, unit.headingText])).toEqual([
      [1, 1, 1, null], [1, 2, 2, null], [2, 3, 3, '合成标题 3'],
    ]);
    expect(manifestCoversEveryBlock(manifest)).toBe(true);
  });

  it('is byte-identical for the same revision and changes its digest for any block change', () => {
    const shared = identity();
    const blocks = [block(1, 'title', 0, 1), block(2, 'paragraph', 120), block(3, 'heading', 0, 1), block(4, 'paragraph', 60)];
    const first = deriveCoverageManifest({ ...shared, blocks });
    const second = deriveCoverageManifest({ ...shared, blocks: blocks.map((entry) => ({ ...entry })) });
    expect(canonicalManifestJson(first)).toBe(canonicalManifestJson(second));
    expect(first.digest).toBe(second.digest);
    const changed = deriveCoverageManifest({ ...shared, blocks: [...blocks.slice(0, 3), { ...blocks[3]!, digest: 'b'.repeat(64) }] });
    expect(changed.digest).not.toBe(first.digest);
    expect(changed.units[1]!.digest).not.toBe(first.units[1]!.digest);
    expect(changed.units[0]!.digest).toBe(first.units[0]!.digest);
  });

  it('refuses an empty, non-contiguous, or duplicated block sequence', () => {
    const shared = identity();
    expect(() => deriveCoverageManifest({ ...shared, blocks: [] })).toThrowError(AnalysisError);
    expect(() => deriveCoverageManifest({ ...shared, blocks: [block(2, 'paragraph', 10)] })).toThrowError(/内容块序列无效/u);
    const duplicate = block(1, 'paragraph', 10);
    expect(() => deriveCoverageManifest({ ...shared, blocks: [duplicate, { ...duplicate, position: 2 }] })).toThrowError(/标识重复/u);
    expect(() => deriveCoverageManifest({ ...shared, revisionLabel: 'x1', blocks: [block(1, 'paragraph', 10)] })).toThrowError(/身份无效/u);
  });

  it('detects a manifest whose digest no longer matches its body', () => {
    const manifest = deriveCoverageManifest({ ...identity(), blocks: [block(1, 'paragraph', 10)] });
    expect(manifestDigestIsExact({ ...manifest, digest: 'c'.repeat(64) })).toBe(false);
    expect(manifestCoversEveryBlock({ ...manifest, totalBlocks: 2 })).toBe(false);
  });
});
