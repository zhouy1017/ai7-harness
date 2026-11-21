import { DEFAULT_EXECUTION_RULE_SCHEMA_SQL } from '../../src/service/default-execution-rules.js';
import { ANALYSIS_LEDGER_SCHEMA_SQL } from '../../src/service/task-authorization.js';

/**
 * The three default-execution-rule relations schema revision 31 adds (Issue #421), in an order that drops every
 * relation before the one it refers to. A suite that plants a store at an earlier revision drops them with
 * whatever else later revisions added: a store that old never held them.
 */
export const DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(DEFAULT_EXECUTION_RULE_SCHEMA_SQL).reverse();
