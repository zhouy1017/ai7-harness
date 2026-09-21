import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_REVISION_23_SQL, ANALYSIS_LEDGER_TRIGGER_SQL } from '../../src/service/task-authorization.js';

/**
 * The three kind-coupled analysis relations schema revision 24 rebuilt (Issue #417), in the order a
 * downgrade rebuilds them: the relation that references the other two first.
 */
export const KIND_COUPLED_ANALYSIS_RELATIONS = ['analysis_result_set_revisions', 'analysis_result_sets', 'analysis_task_intents'] as const;

/**
 * Take the three kind-coupled relations back to the exact shapes revisions 20 to 23 carried, with
 * every row copied in its original order. A suite that plants a store at revision 20, 21, 22 or 23
 * needs this beside dropping whatever later revisions added: those stores really held these shapes,
 * and the forward migration validates them exactly before it rebuilds them.
 *
 * It opens its own transaction with foreign keys off, so it is called outside any other transaction.
 * The rows it copies must be ones revision 23 admits — baseline and factual Tasks — which is every row
 * a store that old could hold.
 */
export function downgradeKindCoupledRelationsToRevision23(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  database.exec('BEGIN IMMEDIATE');
  for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
    const columns = (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name).join(', ');
    database.exec(`CREATE TEMP TABLE downgrade_${table} AS SELECT rowid AS r, * FROM ${table}`);
    database.exec(`DROP TABLE ${table}`);
    database.exec(ANALYSIS_LEDGER_REVISION_23_SQL[table]);
    database.exec(`INSERT INTO ${table}(${columns}) SELECT ${columns} FROM temp.downgrade_${table} ORDER BY r`);
    database.exec(`DROP TABLE temp.downgrade_${table}`);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_update`]!);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_delete`]!);
  }
  database.exec('COMMIT');
  database.exec('PRAGMA foreign_keys = ON');
}
