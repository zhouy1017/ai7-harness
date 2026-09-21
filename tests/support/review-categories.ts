import { reviewCategoryContractInput, reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import type { ReviewCategoryContractInput } from '../../src/service/review/review-category-contract.js';

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
