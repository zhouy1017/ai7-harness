import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { BASELINE_SCHEMA_REVISION, createBaselineSchema, requireBaselineSchema } from '../../src/service/baseline-schema.js';
import { canonicalSchemaSql } from '../../src/service/manuscript/bounded-kernel.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
// @ts-expect-error the dump tool is plain JavaScript
import { schemaDumpText } from '../../tools/schema-dump.mjs';

// The storage baseline fold (#1634; ADR 0105 §4). `revision-116-schema.json` is `tools/schema-dump.mjs` over a store the code at
// 1bc1e3ea1 built on an empty Agent Data Root (byte-equal to the admitted sample1 store opened and migrated to 116 there). The
// baseline must be that shape exactly: every table and index byte for byte, every trigger by name, table and canonical text (the
// append-only ledger triggers now come from one helper), and nothing more or less. The only other difference is the revision.
// `revision-117-schema.json` is the same tool over the current baseline, held exactly: a storage-train slice that changes the shape
// regenerates it (`AI7_REGENERATE_BASELINE_SCHEMA=1 pnpm exec vitest run tests/unit/baseline-schema.test.ts`), names each change in
// INTENDED_DELTA, and the file's diff in its pull request is the shape change to review.

interface DumpRow { readonly type: string; readonly name: string; readonly tbl_name: string; readonly sql: string | null }

/**
 * Every change of the 117 shape the R5 storage train makes on purpose, named here until the train lands (#1540): each entry
 * is an object (`type:name`) the baseline adds, drops or changes against revision 116, with the train slice that owns it.
 */
const INTENDED_DELTA: ReadonlyArray<{ readonly object: string; readonly change: 'added' | 'removed' | 'changed'; readonly slice: string }> = [
  { object: 'table:editor_step_restore_revisions', change: 'added', slice: 'R5-5' },
  { object: 'index:sqlite_autoindex_editor_step_restore_revisions_1', change: 'added', slice: 'R5-5' },
  // R5-L1: the 字表与词表 library (ADR 0106 §9): three tables and the autoindexes SQLite makes for their keys.
  { object: 'table:standard_tables', change: 'added', slice: 'R5-L1' },
  { object: 'table:standard_table_versions', change: 'added', slice: 'R5-L1' },
  { object: 'table:standard_table_entries', change: 'added', slice: 'R5-L1' },
  { object: 'index:sqlite_autoindex_standard_tables_1', change: 'added', slice: 'R5-L1' },
  { object: 'index:sqlite_autoindex_standard_tables_2', change: 'added', slice: 'R5-L1' },
  { object: 'index:sqlite_autoindex_standard_table_versions_1', change: 'added', slice: 'R5-L1' },
  { object: 'index:sqlite_autoindex_standard_table_versions_2', change: 'added', slice: 'R5-L1' },
  { object: 'index:sqlite_autoindex_standard_table_versions_3', change: 'added', slice: 'R5-L1' },
  // R5-F1a
  { object: 'table:model_service_connections', change: 'changed', slice: 'R5-F1a' },
  { object: 'index:sqlite_autoindex_model_service_connections_3', change: 'removed', slice: 'R5-F1a' },
  { object: 'index:sqlite_autoindex_model_service_connections_4', change: 'removed', slice: 'R5-F1a' },
  { object: 'table:model_role_choices', change: 'added', slice: 'R5-F1a' },
  { object: 'index:sqlite_autoindex_model_role_choices_1', change: 'added', slice: 'R5-F1a' },
  // R5-F2c: the similarity vectors retired (ADR 0107 §4 point 5): the table, the autoindex of its key and its two append-only triggers.
  { object: 'table:material_index_vectors', change: 'removed', slice: 'R5-F2c' },
  { object: 'index:sqlite_autoindex_material_index_vectors_1', change: 'removed', slice: 'R5-F2c' },
  { object: 'trigger:material_index_vectors_no_update', change: 'removed', slice: 'R5-F2c' },
  { object: 'trigger:material_index_vectors_no_delete', change: 'removed', slice: 'R5-F2c' },
  // R5-3 + R5-4 (#1654): positions as gapped order keys with a page summary (ADR 0105 §6), the lineage and pending-walk
  // indexes, and the editor steps (ADR 0105 §1) with the widened Apply interaction.
  { object: 'table:working_blocks', change: 'changed', slice: 'R5-3+R5-4' },
  { object: 'table:manuscript_outline', change: 'changed', slice: 'R5-3+R5-4' },
  { object: 'table:manuscript_effect_approvals', change: 'changed', slice: 'R5-3+R5-4' },
  { object: 'table:working_offset_nodes', change: 'removed', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_working_offset_nodes_1', change: 'removed', slice: 'R5-3+R5-4' },
  { object: 'index:working_blocks_window', change: 'removed', slice: 'R5-3+R5-4' },
  { object: 'index:manuscript_outline_order', change: 'removed', slice: 'R5-3+R5-4' },
  { object: 'table:working_pages', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_working_pages_1', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:working_blocks_order_cover', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:manuscript_block_lineage_related', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:editorial_marks_pending_walk', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'table:editor_steps', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_editor_steps_1', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_editor_steps_2', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'table:editor_step_parts', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_editor_step_parts_1', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'table:editor_step_effects', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_editor_step_effects_1', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_editor_step_effects_2', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'table:editor_step_mark_anchors', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:sqlite_autoindex_editor_step_mark_anchors_1', change: 'added', slice: 'R5-3+R5-4' },
  // The write-lock plan (#1654 profile): the Effect ledger's reversal and item lookups.
  { object: 'index:manuscript_effect_intents_reversal', change: 'added', slice: 'R5-3+R5-4' },
  { object: 'index:manuscript_effect_targets_item', change: 'added', slice: 'R5-3+R5-4' },
  // A manual edit's learning source reads its command group's journal entries (#1654 typing at a long history).
  { object: 'index:edit_journal_entries_command_group', change: 'added', slice: 'R5-3+R5-4' },
];

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
  it('is the shape of a store migrated to revision 116, apart from the revision, the helper-written trigger text and INTENDED_DELTA', () => {
    const db = baseline();
    try {
      expect(reference.userVersion).toBe(116);
      expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(BASELINE_SCHEMA_REVISION);
      const key = (row: DumpRow): string => `${row.type}:${row.name}`;
      const actual = new Map(dump(db).map((row) => [key(row), row]));
      const expected = new Map(reference.rows.map((row) => [key(row), row]));
      const differences: string[] = [];
      for (const [name, row] of expected) {
        const built = actual.get(name);
        if (built === undefined) { differences.push(`removed ${name}`); continue; }
        const same = built.tbl_name === row.tbl_name && (row.type === 'trigger'
          ? row.sql !== null && built.sql !== null && canonicalSchemaSql(built.sql) === canonicalSchemaSql(row.sql)
          : built.sql === row.sql);
        if (!same) differences.push(`changed ${name}`);
      }
      for (const name of actual.keys()) if (!expected.has(name)) differences.push(`added ${name}`);
      // Every difference is named with its own kind, and every entry names a difference that exists.
      const named = INTENDED_DELTA.map((entry) => `${entry.change} ${entry.object}`);
      expect(differences.filter((difference) => !named.includes(difference))).toEqual([]);
      expect(named.filter((entry) => !differences.includes(entry))).toEqual([]);
      expect(new Set(named).size).toBe(named.length);
    } finally {
      db.close();
    }
  });

  it('is exactly the committed revision-117 dump, and 117 has one value wherever it is used', () => {
    const db = baseline();
    try {
      const text = schemaDumpText(db) as string;
      if (process.env.AI7_REGENERATE_BASELINE_SCHEMA === '1') writeFileSync('tests/fixtures/database/revision-117-schema.json', text);
      expect(text).toBe(readFileSync('tests/fixtures/database/revision-117-schema.json', 'utf8'));
      expect(BASELINE_SCHEMA_REVISION).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  // 408 at revision 116; R5-F2c drops the vector table and its two ledger triggers (Commander decision, 2026-11-21).
  it('keeps 406 RAISE(ABORT) triggers: 380 append-only ledger, 12 insert-time guards, 14 import abandonment-cleanup', () => {
    const db = baseline();
    try {
      const kinds = { ledger: 0, guard: 0, cleanup: 0 };
      for (const row of dump(db).filter((entry) => entry.type === 'trigger')) {
        const message = /RAISE\(ABORT,\s*'([^']+)'/.exec(row.sql!)![1]!;
        if (message.startsWith('ABANDONMENT_CLEANUP')) kinds.cleanup += 1;
        else if (/IMMUTABLE$/.test(message) && /BEFORE (UPDATE|DELETE)/.test(row.sql!) && !/\bWHEN\b/.test(row.sql!)) kinds.ledger += 1;
        else kinds.guard += 1;
      }
      expect(kinds).toEqual({ ledger: 380, guard: 12, cleanup: 14 });
    } finally {
      db.close();
    }
  });

  it('passes its own exact check, which refuses any object dropped, changed or added', () => {
    for (const damage of [
      'DROP TRIGGER review_runs_no_update',
      'DROP INDEX working_blocks_order_cover',
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
