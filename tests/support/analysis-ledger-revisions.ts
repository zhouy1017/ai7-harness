import type { DatabaseSync } from 'node:sqlite';
import { ANALYSIS_LEDGER_TRIGGER_SQL } from '../../src/service/task-authorization.js';

/**
 * The three kind-coupled analysis relations schema revisions 24 and 59 rebuilt (Issues #417, #429), in
 * the order a downgrade rebuilds them: the relation that references the other two first.
 */
export const KIND_COUPLED_ANALYSIS_RELATIONS = ['analysis_result_set_revisions', 'analysis_result_sets', 'analysis_task_intents'] as const;

/** The exact text of each kind-coupled relation at one schema revision, as `ANALYSIS_LEDGER_REVISION_23_SQL` or `_58_SQL` holds it. */
export type KindCoupledRelationsSql = Readonly<Record<(typeof KIND_COUPLED_ANALYSIS_RELATIONS)[number], string>>;

/**
 * Take the three kind-coupled relations back to the exact shapes an older revision carried, with every
 * row copied in its original order: `ANALYSIS_LEDGER_REVISION_23_SQL` for a store planted at revision 20
 * to 23, `ANALYSIS_LEDGER_REVISION_58_SQL` for one planted at revision 24 to 58. A suite that plants such
 * a store needs this beside dropping whatever later revisions added: those stores really held these
 * shapes, and the forward migration validates them exactly before it rebuilds them.
 *
 * It opens its own transaction with foreign keys off, so it is called outside any other transaction.
 * The rows it copies must be ones the older revision admits — no Task of a kind it did not know — which
 * is every row a store that old could hold.
 */
export function downgradeKindCoupledRelations(database: DatabaseSync, revisionSql: KindCoupledRelationsSql): void {
  database.exec('PRAGMA foreign_keys = OFF');
  database.exec('BEGIN IMMEDIATE');
  for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
    const columns = (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name).join(', ');
    database.exec(`CREATE TEMP TABLE downgrade_${table} AS SELECT rowid AS r, * FROM ${table}`);
    database.exec(`DROP TABLE ${table}`);
    database.exec(revisionSql[table]);
    database.exec(`INSERT INTO ${table}(${columns}) SELECT ${columns} FROM temp.downgrade_${table} ORDER BY r`);
    database.exec(`DROP TABLE temp.downgrade_${table}`);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_update`]!);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_delete`]!);
  }
  database.exec('COMMIT');
  database.exec('PRAGMA foreign_keys = ON');
}
