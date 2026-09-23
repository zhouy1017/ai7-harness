import { PROPOSAL_CONFLICT_SCHEMA_SQL } from '../../src/service/proposal-conflicts.js';

/**
 * The three proposal-conflict relations schema revision 26 adds (Issue #57), in an order that drops every
 * relation before the one it refers to. A suite that plants a store at an earlier revision drops them with
 * whatever else later revisions added: a store that old never held them.
 */
export const PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(PROPOSAL_CONFLICT_SCHEMA_SQL).reverse();
