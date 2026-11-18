import type { DatabaseSync } from 'node:sqlite';

/** The test owns this transaction runner; production operations receive EditorialStore's own instead. */
export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const value = operation(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
