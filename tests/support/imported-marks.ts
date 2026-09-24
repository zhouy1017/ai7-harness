import type { DatabaseSync } from 'node:sqlite';
import { PROPOSAL_CHANGE_ITEMS_REVISION_27_SQL } from '../../src/service/editorial-marks.js';
import { IMPORTED_MARK_SCHEMA_SQL } from '../../src/service/imported-marks.js';

/**
 * The relation schema revision 28 adds (Issue #411): the staged imported marks. A suite that plants a store at
 * an earlier revision drops it with whatever else later revisions added: a store that old never held it.
 * Revision 28 also widened `proposal_change_items`; a planted store keeps the widened text and the rows this
 * build wrote, which every earlier revision's exact validation accepts beside revision 27's own text.
 */
export const IMPORTED_MARK_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(IMPORTED_MARK_SCHEMA_SQL).reverse();

/**
 * Plant `proposal_change_items` as schema revisions 22 to 27 created it, so that a store the current code built
 * reads as one revision 27 left: the ledger is rebuilt from the frozen revision-27 text with every row copied,
 * rowid included, and its two ledger triggers re-armed. The rows must be ones revision 27 admitted — no
 * insertion. The caller drops what revision 28 added and sets the version.
 */
export function downgradeProposalChangeItemsToRevision27(database: DatabaseSync): void {
  const columns = (database.prepare("SELECT name FROM pragma_table_info('proposal_change_items') ORDER BY cid").all() as { name: string }[])
    .map((column) => column.name)
    .join(', ');
  const attached = (database.prepare(
    "SELECT sql FROM sqlite_schema WHERE tbl_name = 'proposal_change_items' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
  ).all() as { sql: string }[]).map((row) => row.sql);
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(`CREATE TEMP TABLE plant_proposal_change_items AS SELECT rowid AS plant_rowid, * FROM proposal_change_items;
        DROP TABLE proposal_change_items;
        ${PROPOSAL_CHANGE_ITEMS_REVISION_27_SQL};
        INSERT INTO proposal_change_items(rowid, ${columns}) SELECT plant_rowid, ${columns} FROM temp.plant_proposal_change_items ORDER BY plant_rowid;
        DROP TABLE temp.plant_proposal_change_items;`);
      for (const sql of attached) database.exec(sql);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}
