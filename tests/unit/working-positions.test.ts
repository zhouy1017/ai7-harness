import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { blockDigest } from '../../src/service/manuscript/command-history.js';
import {
  ORDER_KEY_SPACING, blockAtCharacter, insertBlockAfter, keyAtParagraph, offsetBefore, paragraphAtKey, paragraphCount, placesOfKeys,
  removeBlock, replaceWorkingState, validateBranchPositions,
} from '../../src/service/manuscript/working-positions.js';
import { createBaselineRelations } from '../support/baseline-relations.js';

// The working state's positions (Issue #1654; ADR 0105 §6): gapped order keys, the page summary, the re-spacing ladder and
// the paragraph numbers and offsets read from them. Spacing 2^2 makes a few inserts at one place walk all three levels.

const BRANCH = '00000000-0000-4000-8000-000000000001';
const id = (n: number): string => `blk_${n.toString(16).padStart(24, '0')}`;
const paragraph = (text: string) => ({ kind: 'paragraph' as const, level: null, text, digest: blockDigest('paragraph', null, text) });

function branch(blocks: number, spacing: number): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  // The positions owner alone: the branch, revision and block records its rows name are not this case's.
  db.exec('PRAGMA foreign_keys = OFF');
  createBaselineRelations(db, 'working_blocks', 'manuscript_outline', 'working_pages', 'working_block_search', 'branch_working_state');
  db.prepare(`INSERT INTO branch_working_state(branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest, total_graphemes,
    history_sequence, history_boundary_sequence, last_checkpoint_sequence) VALUES (?, ?, ?, 0, ?, 0, 0, 0, 0)`)
    .run(BRANCH, BRANCH, BRANCH, '0'.repeat(64));
  replaceWorkingState(db, BRANCH, Array.from({ length: blocks }, (_, index) => ({ blockId: id(index + 1), ...paragraph('字'.repeat((index % 7) + 1)) })), spacing);
  return db;
}

const rows = (db: DatabaseSync): Array<{ blockId: string; key: number; length: number }> => (db.prepare(
  'SELECT block_id, order_key, grapheme_length FROM working_blocks WHERE branch_id = ? ORDER BY order_key').all(BRANCH) as Array<Record<string, unknown>>)
  .map((row) => ({ blockId: String(row.block_id), key: Number(row.order_key), length: Number(row.grapheme_length) }));
const pages = (db: DatabaseSync): number => Number((db.prepare('SELECT count(*) n FROM working_pages WHERE branch_id = ?').get(BRANCH) as { n: number }).n);

/** Every paragraph number and offset the pages give equals the one counted from the rows. */
function expectNumbersHold(db: DatabaseSync): void {
  validateBranchPositions(db, BRANCH);
  const all = rows(db);
  let offset = 0;
  const places = placesOfKeys(db, BRANCH, all.map((row) => row.key));
  all.forEach((row, index) => {
    expect(paragraphAtKey(db, BRANCH, row.key)).toBe(index + 1);
    expect(offsetBefore(db, BRANCH, row.key)).toBe(offset);
    expect(places.get(row.key)).toEqual({ position: index + 1, offset });
    offset += row.length;
  });
  expect(paragraphCount(db, BRANCH)).toBe(all.length);
}

describe('working positions (#1654)', () => {
  it('splits by one row at the midpoint of the gap, moving no other row', () => {
    const db = branch(10, ORDER_KEY_SPACING);
    const before = rows(db);
    const key = insertBlockAfter(db, BRANCH, id(4), id(100), paragraph('新'));
    const after = rows(db);
    expect(key).toBe(4 * ORDER_KEY_SPACING + ORDER_KEY_SPACING / 2);
    expect(after.filter((row) => row.blockId !== id(100))).toEqual(before);
    expect(after.map((row) => row.blockId).indexOf(id(100))).toBe(4);
    removeBlock(db, BRANCH, id(100));
    expect(rows(db)).toEqual(before);
    expectNumbersHold(db);
  });

  it('re-spaces the page, then the page and its neighbours, then the whole branch, the new block always between its neighbours', () => {
    const db = branch(900, 4);
    const levels = new Set<'page' | 'pages' | 'branch'>();
    let after = id(450);
    for (let index = 0; index < 4000 && levels.size < 3; index += 1) {
      const before = rows(db);
      const next = before[before.findIndex((row) => row.blockId === after) + 1]!.blockId;
      const created = id(10_000 + index);
      insertBlockAfter(db, BRANCH, after, created, paragraph(''), 4);
      const now = rows(db);
      const at = now.findIndex((row) => row.blockId === created);
      // Strictly between its two neighbours, and every other block in its old order.
      expect(now[at - 1]!.blockId).toBe(after);
      expect(now[at + 1]!.blockId).toBe(next);
      expect(now.filter((row) => row.blockId !== created).map((row) => row.blockId)).toEqual(before.map((row) => row.blockId));
      const moved = before.filter((row) => now.find((other) => other.blockId === row.blockId)!.key !== row.key).length;
      if (moved === before.length || moved > 1536) levels.add('branch');
      else if (moved > 512) levels.add('pages');
      else if (moved > 0) levels.add('page');
      after = created;
    }
    expect([...levels].sort()).toEqual(['branch', 'page', 'pages']);
    expectNumbersHold(db);
  });

  it('splits a page that would pass 512 blocks and merges one that falls below 64', () => {
    const db = branch(600, ORDER_KEY_SPACING);
    expect(pages(db)).toBe(3);
    // The second page holds blocks 257 … 512: 257 more blocks in it split it.
    for (let index = 0; index < 257; index += 1) insertBlockAfter(db, BRANCH, id(300 + (index % 16)), id(20_000 + index), paragraph(''));
    expect(pages(db)).toBe(4);
    expectNumbersHold(db);
    for (let index = 0; index < 257; index += 1) removeBlock(db, BRANCH, id(20_000 + index));
    // Back to 256 blocks over two pages, one of them under 64: it merged into its neighbour.
    expect(pages(db)).toBeLessThan(4);
    expectNumbersHold(db);
  });

  it('finds the block of a whole-manuscript offset and the key of a paragraph number as the rows count them', () => {
    const db = branch(700, ORDER_KEY_SPACING);
    const all = rows(db);
    let offset = 0;
    all.forEach((row, index) => {
      expect(keyAtParagraph(db, BRANCH, index + 1)).toBe(row.key);
      for (let character = offset; character < offset + row.length; character += 1) {
        expect(blockAtCharacter(db, BRANCH, character)).toEqual({ key: row.key, position: index + 1, startCharacter: offset });
      }
      offset += row.length;
    });
  });
});
