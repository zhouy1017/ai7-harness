import { DatabaseSync } from 'node:sqlite';
import { createBaselineSchema } from '../../src/service/baseline-schema.js';

// A partial `:memory:` schema for unit-level owners (#1634): the named relations exactly as the storage baseline defines them,
// each with its own indexes and triggers, and nothing else. It replaces the per-module schema initializers the fold removed; a
// whole store is `createBaselineSchema(new DatabaseSync(':memory:'))` or `EditorialStore.open` on an empty Agent Data Root.

interface BaselineObject { readonly type: string; readonly name: string; readonly table: string; readonly sql: string }

let objects: ReadonlyArray<BaselineObject> | undefined;

function baselineObjects(): ReadonlyArray<BaselineObject> {
  if (objects !== undefined) return objects;
  const db = new DatabaseSync(':memory:');
  try {
    createBaselineSchema(db);
    const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'working_block_search_%'").all();
    const order: Readonly<Record<string, number>> = { table: 0, index: 1, trigger: 2 };
    objects = rows.map((row) => ({ type: String(row.type), name: String(row.name), table: String(row.tbl_name), sql: String(row.sql) }))
      .sort((left, right) => (order[left.type] ?? 3) - (order[right.type] ?? 3));
    return objects;
  } finally {
    db.close();
  }
}

/** Create the named relations (names, or an owner's `*_SCHEMA_SQL` map) with their indexes and triggers, as the baseline has them. */
export function createBaselineRelations(db: DatabaseSync, ...relations: ReadonlyArray<string | Readonly<Record<string, string>>>): void {
  const wanted = new Set(relations.flatMap((entry) => typeof entry === 'string' ? [entry] : Object.keys(entry)));
  const known = new Set(baselineObjects().filter((object) => object.type === 'table').map((object) => object.table));
  for (const name of wanted) if (!known.has(name)) throw new Error(`the baseline has no relation ${name}`);
  for (const object of baselineObjects()) if (wanted.has(object.table)) db.exec(object.sql);
}
