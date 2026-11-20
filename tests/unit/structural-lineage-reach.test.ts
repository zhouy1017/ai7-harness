import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { blockReachesThroughLineage, inverseTargetsTouchInOrder } from '../../src/service/manuscript/structural-edits.js';

// Block lineage reach and the touching rule for reversing an Apply whose targets moved (ADR 0105 §2).
function lineage(rows: ReadonlyArray<[string, string, 'split-from' | 'merged-into']>, working: ReadonlyArray<string>): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE manuscript_block_lineage (block_id TEXT, related_block_id TEXT, relation TEXT, command_group_id TEXT);
    CREATE TABLE working_blocks (branch_id TEXT, block_id TEXT)`);
  rows.forEach(([block, related, relation], index) => db.prepare('INSERT INTO manuscript_block_lineage VALUES (?, ?, ?, ?)').run(block, related, relation, `g${index}`));
  for (const block of working) db.prepare("INSERT INTO working_blocks VALUES ('branch', ?)").run(block);
  return db;
}

describe('blockReachesThroughLineage', () => {
  it('ends on a split joined back — a cycle — when the target is not on it', () => {
    const db = lineage([['N', 'P', 'split-from'], ['N', 'P', 'merged-into'], ['M', 'N', 'split-from']], ['P', 'M', 'X']);
    expect(blockReachesThroughLineage(db, 'branch', 'P', 'X')).toBe(false);
    expect(blockReachesThroughLineage(db, 'branch', 'P', 'M')).toBe(true);
  });

  it('follows a merge only while the absorbed block is gone from the working state', () => {
    expect(blockReachesThroughLineage(lineage([['Q', 'P', 'merged-into']], ['P']), 'branch', 'Q', 'P')).toBe(true);
    expect(blockReachesThroughLineage(lineage([['Q', 'P', 'merged-into']], ['P', 'Q']), 'branch', 'Q', 'P')).toBe(false);
  });
});

describe('inverseTargetsTouchInOrder', () => {
  const target = (from: number, to: number, blockId: string, originalFrom: number, originalTo: number) =>
    ({ fromGrapheme: from, toGrapheme: to, original: { blockId, from: originalFrom, to: originalTo } });

  it('orders touching targets of one original paragraph and refuses touching targets of two, empty or not', () => {
    expect(inverseTargetsTouchInOrder(target(2, 2, 'A', 2, 4), target(2, 2, 'A', 4, 6))).toBe(true);
    expect(inverseTargetsTouchInOrder(target(0, 4, 'A', 0, 4), target(4, 8, 'A', 6, 10))).toBe(true);
    expect(inverseTargetsTouchInOrder(target(2, 2, 'B', 0, 2), target(2, 2, 'A', 2, 9))).toBe(false);
    expect(inverseTargetsTouchInOrder(target(0, 4, 'A', 6, 10), target(4, 8, 'B', 0, 4))).toBe(false);
  });
});
