import type { DatabaseSync } from 'node:sqlite';
import { REIMPORT_GROUP_SCHEMA_SQL } from '../../src/service/reimport-group-ledger.js';

/**
 * The relations schema revision 36 adds (Issue #412, S63), in drop order: a mark outcome and a group's resolution and
 * members before the group, a group before its comparison's group set. A suite that plants a store at an earlier
 * revision drops them with whatever else later revisions added: a store that old never held them.
 */
export const REIMPORT_GROUP_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(REIMPORT_GROUP_SCHEMA_SQL).reverse();

/** Drop the relations revision 36 added, foreign keys off around it. The caller sets the version. */
export function dropReimportGroupRelations(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      // A suite may plant one earlier revision over another, so a relation already gone stays gone.
      for (const relation of REIMPORT_GROUP_RELATIONS_DROP_ORDER) database.exec(`DROP TABLE IF EXISTS ${relation}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}
