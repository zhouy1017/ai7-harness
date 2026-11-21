#!/usr/bin/env node
// The shape of one AI7 store (#1634, ADR 0105 §4): `user_version` and every `sqlite_schema` row as (type, name, tbl_name, sql),
// sorted by type and name, as JSON. It opens the store read-only and reads no row of any relation, so its output holds shape
// only. `tests/fixtures/database/revision-116-schema.json` is this tool's output over a store the code at `1bc1e3ea1` built on
// an empty Agent Data Root; `tests/unit/baseline-schema.test.ts` diffs the baseline against it. `revision-117-schema.json` is the
// current baseline's dump, which that test holds exactly and rewrites with `AI7_REGENERATE_BASELINE_SCHEMA=1`.
//
//   node tools/schema-dump.mjs <store/ai7.sqlite> [<out.json>]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export function schemaDump(db) {
  const rows = db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name').all()
    .map((row) => ({ type: row.type, name: row.name, tbl_name: row.tbl_name, sql: row.sql }));
  return { userVersion: Number(db.prepare('PRAGMA user_version').get().user_version), rows };
}

export function schemaDumpText(db) {
  return `${JSON.stringify(schemaDump(db), null, 1)}\n`;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [path, out] = process.argv.slice(2);
  if (path === undefined) throw new Error('usage: node tools/schema-dump.mjs <store/ai7.sqlite> [<out.json>]');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const text = schemaDumpText(db);
    if (out === undefined) process.stdout.write(text); else writeFileSync(out, text);
  } finally {
    db.close();
  }
}
