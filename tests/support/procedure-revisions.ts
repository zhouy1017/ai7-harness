import type { DatabaseSync } from 'node:sqlite';
import { PROCEDURE_DEFINITION_SCHEMA_SQL, PROCEDURE_DEFINITION_TRIGGER_SQL } from '../../src/service/procedures/definition-store.js';
import { FULL_REVIEW_PROCEDURE_ID } from '../../src/service/procedures/preinstalled.js';
import { execPre74Fixture } from './pre74-schema.js';

/**
 * A genuine revision-98 store from a current one (#1173): the same relations and rows in the same order, without the 全文审校 v1
 * rows revision 99 installs. The two immutable relations are rebuilt with their own DDL and triggers; no trigger is bypassed.
 */
export function asRevision98(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of ['procedure_definition_versions', 'procedure_definitions'] as const) {
    db.exec(`CREATE TEMP TABLE kept_${table} AS SELECT * FROM ${table} WHERE procedure_id <> '${FULL_REVIEW_PROCEDURE_ID}' ORDER BY rowid`);
    db.exec(`DROP TABLE ${table}`);
  }
  for (const table of ['procedure_definitions', 'procedure_definition_versions'] as const) {
    db.exec(PROCEDURE_DEFINITION_SCHEMA_SQL[table]);
    db.exec(`INSERT INTO ${table} SELECT * FROM kept_${table}; DROP TABLE kept_${table}`);
    for (const action of ['update', 'delete']) db.exec(PROCEDURE_DEFINITION_TRIGGER_SQL[`${table}_no_${action}`]!);
  }
  execPre74Fixture(db, 'PRAGMA user_version = 98;');
}
