import type { DatabaseSync } from 'node:sqlite';
import { RUN_CHECKPOINT_SCHEMA_SQL } from '../../src/service/analysis/run-checkpoints.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from './clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from './reimport-groups.js';
import { PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from './production-documents.js';

/**
 * The relation schema revision 33 adds (Issue #422, S76b), in drop order. A suite that plants a store at an earlier
 * revision drops it with whatever else later revisions added: a store that old never held it.
 */
export const RUN_CHECKPOINT_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(RUN_CHECKPOINT_SCHEMA_SQL).reverse();

/** Drop the relations revision 33 added, foreign keys off around it. The caller sets the version. */
export function dropRunCheckpointRelations(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      // A suite may plant one earlier revision over another, so a relation already gone stays gone.
      // Revision 35's relations are newer still, so a store before revision 33 never held them either.
      for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER]) database.exec(`DROP TABLE IF EXISTS ${relation}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}
