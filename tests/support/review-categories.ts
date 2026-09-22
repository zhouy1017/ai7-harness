import { reviewCategoryContractInput, reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import type { ReviewCategoryContractInput } from '../../src/service/review/review-category-contract.js';
import { REVIEW_RUN_SCHEMA_SQL } from '../../src/service/review/review-runs.js';

/**
 * The seven Review Run relations schema revision 24 adds (Issue #417), in an order that drops every
 * relation before the one it refers to. A suite that plants a store at an earlier revision drops them
 * with whatever else later revisions added: a store that old never held them.
 */
export const REVIEW_RUN_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(REVIEW_RUN_SCHEMA_SQL).reverse();

function builtin(categoryId: string): ReviewCategoryContractInput {
  const entry = reviewCategoryEntry(categoryId);
  if (entry === null) throw new Error(`No built-in review category ${categoryId}.`);
  return reviewCategoryContractInput(entry);
}

/**
 * The three Review Categories the authored fixture `sample1-review-authored` answers (Issue #417):
 * one 修改建议 category that also batches, one 批注 category, and the second 修改建议 category. They
 * are read from the product's built-in configuration and not restated here, because a category's
 * frozen prompt contract — and through its digest every request digest the fixture is keyed by — is a
 * function of exactly what the configuration gives the contract. Change one of their clauses there and
 * the fixture is regenerated.
 */
export const TYPOS_AND_USAGE = builtin('typos-and-usage');
export const STYLE_AND_FORMAT = builtin('style-and-format');
export const LITERARY_EXPRESSION = builtin('literary-expression');

export const AUTHORED_REVIEW_CATEGORIES: ReadonlyArray<ReviewCategoryContractInput> = [TYPOS_AND_USAGE, STYLE_AND_FORMAT, LITERARY_EXPRESSION];
