import { EXPORT_LEDGER_SCHEMA_SQL } from '../../src/service/manuscript-export.js';

/**
 * The three export-ledger relations schema revision 29 adds (Issue #413), in an order that drops every relation
 * before the one it refers to. A suite that plants a store at an earlier revision drops them with whatever else
 * later revisions added: a store that old never held them.
 */
export const EXPORT_LEDGER_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(EXPORT_LEDGER_SCHEMA_SQL).reverse();
