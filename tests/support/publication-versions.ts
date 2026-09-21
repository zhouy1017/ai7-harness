import { PUBLICATION_VERSION_SCHEMA_SQL } from '../../src/service/publication-versions.js';

/**
 * The three Publication Version relations schema revision 25 adds (Issue #414), in an order that drops
 * every relation before the one it refers to. A suite that plants a store at an earlier revision drops
 * them with whatever else later revisions added: a store that old never held them.
 */
export const PUBLICATION_VERSION_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(PUBLICATION_VERSION_SCHEMA_SQL).reverse();
