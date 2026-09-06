import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BASELINE_UNIT_RESULT_SCHEMA, type BaselineUnitResult } from '../../src/service/analysis/contract.js';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { ExecutionAdmissionError, remapReusedResult } from '../../src/service/analysis/execution.js';

// Synthetic blocks only. A reused unit result is copied by lineage with its source ranges remapped
// onto the new unit's block identities by position; nothing else about the result changes.

function block(name: string, kind: ManifestBlockInput['kind'], graphemes: number, level: number | null = null): ManifestBlockInput {
  const text = kind === 'paragraph' ? `合成段落 ${name} `.repeat(Math.ceil(graphemes / 6)).slice(0, graphemes) : `合成标题 ${name}`;
  return {
    blockId: `blk_${createHash('sha256').update(`lineage-${name}-${randomUUID()}`).digest('hex').slice(0, 24)}`,
    position: 0,
    kind,
    level,
    text,
    digest: createHash('sha256').update(`${kind}:${level ?? ''}:${text}`).digest('hex'),
    graphemes: kind === 'paragraph' ? graphemes : text.length,
  };
}

function manifestOf(blocks: ManifestBlockInput[]) {
  return deriveCoverageManifest({
    bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(),
    revisionLabel: 'r1', revisionDigest: 'd'.repeat(64), blocks: blocks.map((entry, index) => ({ ...entry, position: index + 1 })),
  });
}

describe('remapReusedResult', () => {
  it('remaps own and overlap block identities by position and leaves everything else intact', () => {
    const shared = [block('A', 'heading', 0, 1), block('a', 'paragraph', 700), block('b', 'paragraph', 600), block('c', 'paragraph', 500)];
    const predecessor = manifestOf(shared);
    // The same content re-imported under fresh block identities: every digest equal, every identity different.
    const reimported = manifestOf(shared.map((entry) => ({ ...entry, blockId: `blk_${createHash('sha256').update(`new-${entry.blockId}`).digest('hex').slice(0, 24)}` })));
    const predecessorUnit = predecessor.units[1]!;
    const newUnit = reimported.units[1]!;
    expect(predecessorUnit.blockDigests).toEqual(newUnit.blockDigests);
    expect(predecessorUnit.blockIds).not.toEqual(newUnit.blockIds);
    const result: BaselineUnitResult = {
      schema: BASELINE_UNIT_RESULT_SCHEMA,
      unitOrdinal: 2,
      synopsis: '合成概述',
      entities: [{ name: '合成人物', kind: 'person', aliases: ['甲'], note: null, sourceRanges: [{ blockId: predecessorUnit.blockIds[0]!, fromGrapheme: 0, toGrapheme: 4 }] }],
      events: [{ ordinal: 1, summary: '合成事件', chronology: null, participants: ['合成人物'], sourceRanges: [{ blockId: predecessorUnit.overlapBlockIds[0]!, fromGrapheme: null, toGrapheme: null }] }],
      relationships: [],
      settingClaims: [{ subject: '合成之城', claim: '位于北方', sourceRanges: [{ blockId: predecessorUnit.blockIds[1]!, fromGrapheme: null, toGrapheme: null }] }],
      conflicts: [],
      unresolved: [{ description: '合成未解事项', sourceRanges: [] }],
      confidence: 'medium',
    };
    const remapped = remapReusedResult(result, predecessorUnit, newUnit);
    expect(remapped.unitOrdinal).toBe(newUnit.ordinal);
    expect(remapped.entities[0]!.sourceRanges).toEqual([{ blockId: newUnit.blockIds[0], fromGrapheme: 0, toGrapheme: 4 }]);
    expect(remapped.events[0]!.sourceRanges).toEqual([{ blockId: newUnit.overlapBlockIds[0], fromGrapheme: null, toGrapheme: null }]);
    expect(remapped.settingClaims[0]!.sourceRanges).toEqual([{ blockId: newUnit.blockIds[1], fromGrapheme: null, toGrapheme: null }]);
    expect({ ...remapped, entities: [], events: [], settingClaims: [] }).toEqual({ ...result, unitOrdinal: newUnit.ordinal, entities: [], events: [], settingClaims: [] });
    // Identical identities remap to themselves.
    expect(remapReusedResult(result, predecessorUnit, predecessorUnit)).toEqual(result);
  });

  it('refuses a unit whose block count differs or a range outside the predecessor unit', () => {
    const predecessor = manifestOf([block('A', 'heading', 0, 1), block('a', 'paragraph', 700), block('b', 'paragraph', 600)]);
    const result: BaselineUnitResult = {
      schema: BASELINE_UNIT_RESULT_SCHEMA, unitOrdinal: 1, synopsis: '合成概述', entities: [], events: [], relationships: [], settingClaims: [], conflicts: [],
      unresolved: [{ description: '合成', sourceRanges: [{ blockId: `blk_${'f'.repeat(24)}`, fromGrapheme: null, toGrapheme: null }] }], confidence: 'high',
    };
    expect(() => remapReusedResult(result, predecessor.units[0]!, predecessor.units[1]!)).toThrowError(ExecutionAdmissionError);
    expect(() => remapReusedResult(result, predecessor.units[0]!, predecessor.units[0]!)).toThrowError(/前一单元之外/u);
  });
});
