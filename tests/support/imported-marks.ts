import { IMPORTED_MARK_SCHEMA_SQL } from '../../src/service/imported-marks.js';

/**
 * The relation schema revision 28 adds (Issue #411): the staged imported marks. A suite that plants a store at
 * an earlier revision drops it with whatever else later revisions added: a store that old never held it.
 * Revision 28 also widened `proposal_change_items`; a planted store keeps the widened text and the rows this
 * build wrote, which every earlier revision's exact validation accepts beside revision 27's own text.
 */
export const IMPORTED_MARK_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(IMPORTED_MARK_SCHEMA_SQL).reverse();
