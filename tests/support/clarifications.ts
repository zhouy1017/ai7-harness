import type { DatabaseSync } from 'node:sqlite';
import { CLARIFICATION_SCHEMA_SQL } from '../../src/service/analysis/clarifications.js';

/**
 * The relations schema revision 35 adds (Issue #422, S76d), in drop order: an answer before the request it answers. A
 * suite that plants a store at an earlier revision drops them with whatever else later revisions added: a store that
 * old never held them.
 */
export const CLARIFICATION_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(CLARIFICATION_SCHEMA_SQL).reverse();

/** Drop the relations revision 35 added, foreign keys off around it. The caller sets the version. */
export function dropClarificationRelations(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      // A suite may plant one earlier revision over another, so a relation already gone stays gone.
      for (const relation of CLARIFICATION_RELATIONS_DROP_ORDER) database.exec(`DROP TABLE IF EXISTS ${relation}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}
