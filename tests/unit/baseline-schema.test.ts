import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { BASELINE_SCHEMA_REVISION, createBaselineSchema, requireBaselineSchema } from '../../src/service/baseline-schema.js';
import { canonicalSchemaSql } from '../../src/service/manuscript/bounded-kernel.js';

// The storage baseline fold (#1634; ADR 0105 §4). `revision-116-schema.json` is `tools/schema-dump.mjs` over a store the code at
// 1bc1e3ea1 built on an empty Agent Data Root (byte-equal to the admitted sample1 store opened and migrated to 116 there). The
// baseline must be that shape exactly: every table and index byte for byte, every trigger by name, table and canonical text (the
// append-only ledger triggers now come from one helper), and nothing more or less. The only other difference is the revision.

interface DumpRow { readonly type: string; readonly name: string; readonly tbl_name: string; readonly sql: string | null }

/**
 * Every change of the 117 shape the R5 storage train makes on purpose, named here until the train lands (#1540): each entry
 * is an object (`type:name`) the baseline adds, drops or changes against revision 116, with the train slice that owns it.
 */
const INTENDED_DELTA: ReadonlyArray<{ readonly object: string; readonly change: 'added' | 'removed' | 'changed'; readonly slice: string }> = [];

const reference = JSON.parse(readFileSync('tests/fixtures/database/revision-116-schema.json', 'utf8')) as { userVersion: number; rows: DumpRow[] };

function baseline(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  createBaselineSchema(db);
  return db;
}

function dump(db: DatabaseSync): DumpRow[] {
  return db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name').all() as unknown as DumpRow[];
}

describe('storage baseline (revision 117)', () => {
  it('is the shape of a store migrated to revision 116, apart from the revision and the helper-written trigger text', () => {
    const db = baseline();
    try {
      expect(reference.userVersion).toBe(116);
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(BASELINE_SCHEMA_REVISION);
      const key = (row: DumpRow): string => `${row.type}:${row.name}`;
      const intended = new Set(INTENDED_DELTA.map((entry) => entry.object));
      const actual = new Map(dump(db).map((row) => [key(row), row]));
      const expected = new Map(reference.rows.map((row) => [key(row), row]));
      const differences: string[] = [];
      for (const [name, row] of expected) {
        const built = actual.get(name);
        if (built === undefined) { differences.push(`missing ${name}`); continue; }
        const same = built.tbl_name === row.tbl_name && (row.type === 'trigger'
          ? row.sql !== null && built.sql !== null && canonicalSchemaSql(built.sql) === canonicalSchemaSql(row.sql)
          : built.sql === row.sql);
        if (!same) differences.push(`changed ${name}`);
      }
      for (const name of actual.keys()) if (!expected.has(name)) differences.push(`added ${name}`);
      expect(differences.filter((difference) => !intended.has(difference.slice(difference.indexOf(' ') + 1)))).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('keeps all 408 RAISE(ABORT) triggers: 382 append-only ledger, 12 insert-time guards, 14 import abandonment-cleanup', () => {
    const db = baseline();
    try {
      const kinds = { ledger: 0, guard: 0, cleanup: 0 };
      for (const row of dump(db).filter((entry) => entry.type === 'trigger')) {
        const message = /RAISE\(ABORT,\s*'([^']+)'/.exec(row.sql!)![1]!;
        if (message.startsWith('ABANDONMENT_CLEANUP')) kinds.cleanup += 1;
        else if (/IMMUTABLE$/.test(message) && /BEFORE (UPDATE|DELETE)/.test(row.sql!) && !/\bWHEN\b/.test(row.sql!)) kinds.ledger += 1;
        else kinds.guard += 1;
      }
      expect(kinds).toEqual({ ledger: 382, guard: 12, cleanup: 14 });
    } finally {
      db.close();
    }
  });

  it('passes its own exact check, which refuses any object dropped, changed or added', () => {
    for (const damage of [
      'DROP TRIGGER review_runs_no_update',
      'DROP INDEX working_blocks_window',
      'CREATE TABLE stray (id INTEGER PRIMARY KEY) STRICT',
      'ALTER TABLE books ADD COLUMN extra TEXT',
      'CREATE VIEW stray_view AS SELECT 1',
      null,
    ]) {
      const db = baseline();
      try {
        if (damage === null) expect(() => requireBaselineSchema(db)).not.toThrow();
        else {
          db.exec(damage);
          expect(() => requireBaselineSchema(db), damage).toThrow(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
        }
      } finally {
        db.close();
      }
    }
  });

  it('builds only into an empty database', () => {
    const db = baseline();
    try {
      expect(() => createBaselineSchema(db)).toThrow(expect.objectContaining({ code: 'SCHEMA_INVALID' }));
    } finally {
      db.close();
    }
  });
});
