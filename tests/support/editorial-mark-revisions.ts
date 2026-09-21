import type { DatabaseSync } from 'node:sqlite';
import { EDITORIAL_MARK_REVISION_22_SQL } from '../../src/service/editorial-marks.js';

/**
 * Plant `editorial_marks` as schema revision 22 created it (Issue #407), so that a store the current
 * code built reads as one revision 22 left: the relation is rebuilt from the frozen revision-22 text
 * with every row copied, rowid included. The rows must be ones revision 22 admitted — no empty pin.
 * The caller drops what revision 23 added and sets the version.
 */
export function downgradeEditorialMarksToRevision22(database: DatabaseSync): void {
  const columns = (database.prepare("SELECT name FROM pragma_table_info('editorial_marks') ORDER BY cid").all() as { name: string }[])
    .map((column) => column.name)
    .join(', ');
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`CREATE TEMP TABLE plant_editorial_marks AS SELECT rowid AS plant_rowid, * FROM editorial_marks;
        DROP TABLE editorial_marks;
        ${EDITORIAL_MARK_REVISION_22_SQL.editorial_marks};
        INSERT INTO editorial_marks(rowid, ${columns}) SELECT plant_rowid, ${columns} FROM temp.plant_editorial_marks ORDER BY plant_rowid;
        DROP TABLE temp.plant_editorial_marks;`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}
