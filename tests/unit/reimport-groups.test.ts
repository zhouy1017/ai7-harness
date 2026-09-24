import { describe, expect, it } from 'vitest';
import {
  groupReimportMappings,
  reimportGroupResolutions,
  reimportGroupVerbs,
  type ReimportGroupingMapping,
} from '../../src/service/reimport-groups.js';

// The chapter-level Reimport Comparison's rows (Issue #412, plan slice S63; V2-UX-IMP-041, IMP-057): block mappings
// as `*#reimportMappingBatches` classifies them, gathered between the blocks that match exactly and stay in order.

const unchanged = (id: string, position: number): ReimportGroupingMapping => ({ mappingId: id, changeKind: 'unchanged', currentPosition: position, stagedPosition: position });
const move = (id: string, current: number, staged: number): ReimportGroupingMapping => ({ mappingId: id, changeKind: 'move', currentPosition: current, stagedPosition: staged });
const insert = (id: string, staged: number): ReimportGroupingMapping => ({ mappingId: id, changeKind: 'insert', currentPosition: null, stagedPosition: staged });
const remove = (id: string, current: number): ReimportGroupingMapping => ({ mappingId: id, changeKind: 'delete', currentPosition: current, stagedPosition: null });
const edit = (id: string, current: number, staged: number): ReimportGroupingMapping => ({ mappingId: id, changeKind: 'edit', currentPosition: current, stagedPosition: staged });

const shape = (mappings: ReadonlyArray<ReimportGroupingMapping>) => groupReimportMappings(mappings).map((group) =>
  `${group.currentMembers.join('+') || '∅'}→${group.stagedMembers.join('+') || '∅'} [${group.currentFrom ?? '-'}-${group.currentTo ?? '-'} → ${group.stagedFrom ?? '-'}-${group.stagedTo ?? '-'}]`);

describe('the chapter-level Reimport Comparison', () => {
  it('gathers each run of changed paragraphs between exact ones into one row', () => {
    // A B C → A B′ C: one paragraph rewritten.
    expect(shape([unchanged('a', 1), insert('b2', 2), unchanged('c', 3), remove('b', 2)])).toEqual(['b→b2 [2-2 → 2-2]']);
    // A B C → A B1 B2 C: one paragraph split in two.
    expect(shape([unchanged('a', 1), insert('b1', 2), insert('b2', 3), move('c', 3, 4), remove('b', 2)])).toEqual(['b→b1+b2 [2-2 → 2-3]']);
    // A B1 B2 C → A B C: two paragraphs merged.
    expect(shape([unchanged('a', 1), insert('b', 2), move('c', 4, 3), remove('b1', 2), remove('b2', 3)])).toEqual(['b1+b2→b [2-3 → 2-2]']);
    // Two separate changes make two rows, in order.
    expect(shape([insert('n', 1), move('a', 1, 2), remove('b', 2), unchanged('c', 3)])).toEqual(['∅→n [--- → 1-1]', 'b→∅ [2-2 → ---]']);
  });

  it('keeps a moved paragraph out of every row, and names a row by the chapter it stands in', () => {
    // C A B from A B C: every block exact; C moved out of order is no anchor, and nothing changed.
    expect(shape([move('c', 3, 1), move('a', 1, 2), move('b', 2, 3)])).toEqual([]);
    const groups = groupReimportMappings(
      [unchanged('h1', 1), unchanged('p1', 2), unchanged('h2', 3), insert('p2x', 4), remove('p2', 4), unchanged('h3', 5)],
      [{ position: 1, kind: 'heading', level: 1, text: '第一章' }, { position: 3, kind: 'heading', level: 1, text: '第二章' }, { position: 5, kind: 'heading', level: 1, text: '第三章' }],
    );
    expect(groups.map((group) => group.chapterLabel)).toEqual(['第二章']);
    // Without headings, no chapter is named.
    expect(groupReimportMappings([unchanged('a', 1), insert('x', 2), remove('b', 2)]).map((group) => group.chapterLabel)).toEqual([null]);
  });

  it('puts an edited paragraph on both sides of its row', () => {
    const groups = groupReimportMappings([unchanged('a', 1), edit('b', 2, 2), insert('n', 3), unchanged('c', 3)]);
    expect(groups.map((group) => [group.currentMembers, group.stagedMembers])).toEqual([[['b'], ['b', 'n']]]);
  });

  it('offers the verbs a row\'s shape admits, never one it cannot mean', () => {
    expect(reimportGroupVerbs(0, 2)).toEqual(['rewrite']);
    expect(reimportGroupVerbs(2, 0)).toEqual(['delete']);
    expect(reimportGroupVerbs(1, 1)).toEqual(['rewrite', 'delete']);
    expect(reimportGroupVerbs(1, 3)).toEqual(['split', 'rewrite', 'delete']);
    expect(reimportGroupVerbs(3, 1)).toEqual(['rewrite', 'delete', 'merge']);
    expect(reimportGroupVerbs(2, 2)).toEqual(['rewrite', 'delete']);
  });

  it('writes each verb as the identities the commit reads: carried in order, the rest new or retired', () => {
    const current = [
      { mappingId: 'd1', changeKind: 'delete' as const, currentBlockId: 'blk_1' },
      { mappingId: 'd2', changeKind: 'delete' as const, currentBlockId: 'blk_2' },
    ];
    const staged = [
      { mappingId: 'i1', changeKind: 'insert' as const, currentBlockId: null },
      { mappingId: 'i2', changeKind: 'insert' as const, currentBlockId: null },
      { mappingId: 'i3', changeKind: 'insert' as const, currentBlockId: null },
    ];
    expect(reimportGroupResolutions('rewrite', current, staged)).toEqual([
      { mappingId: 'i1', resolution: 'preserve-current-identity', currentBlockId: 'blk_1' },
      { mappingId: 'i2', resolution: 'preserve-current-identity', currentBlockId: 'blk_2' },
      { mappingId: 'i3', resolution: 'create-new-identity', currentBlockId: null },
    ]);
    expect(reimportGroupResolutions('merge', current, staged.slice(0, 1))).toEqual([
      { mappingId: 'i1', resolution: 'preserve-current-identity', currentBlockId: 'blk_1' },
      { mappingId: 'd2', resolution: 'retire-current-identity', currentBlockId: null },
    ]);
    expect(reimportGroupResolutions('split', current.slice(0, 1), staged.slice(0, 2))).toEqual([
      { mappingId: 'i1', resolution: 'preserve-current-identity', currentBlockId: 'blk_1' },
      { mappingId: 'i2', resolution: 'create-new-identity', currentBlockId: null },
    ]);
    expect(reimportGroupResolutions('delete', current, staged.slice(0, 1))).toEqual([
      { mappingId: 'i1', resolution: 'create-new-identity', currentBlockId: null },
      { mappingId: 'd1', resolution: 'retire-current-identity', currentBlockId: null },
      { mappingId: 'd2', resolution: 'retire-current-identity', currentBlockId: null },
    ]);
    // An edited paragraph keeps its own identity under every verb but 删除.
    const edited = [{ mappingId: 'e', changeKind: 'edit' as const, currentBlockId: 'blk_e' }];
    expect(reimportGroupResolutions('rewrite', edited, edited)).toEqual([{ mappingId: 'e', resolution: 'preserve-current-identity', currentBlockId: 'blk_e' }]);
    expect(reimportGroupResolutions('delete', edited, edited)).toEqual([{ mappingId: 'e', resolution: 'create-new-identity', currentBlockId: null }]);
  });
});
