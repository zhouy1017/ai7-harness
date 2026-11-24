import { technicalReviewBasis, type ReviewCategoryBasis } from '../shared/review-basis.js';
import { technicalLayerVisible } from './technical-layer.js';
import { serviceGoalWords } from './service-wording.js';

export function reviewBasisWords(basis: ReviewCategoryBasis): string {
  if (technicalLayerVisible) return technicalReviewBasis(basis);
  // AI7's own fixed document reads by its rule; a house document's title is the editor's and stays.
  const files = basis.guidelineDocuments.map((document) => serviceGoalWords(document.title));
  return `依据：${[...files, basis.procedure.title].join(' · ')}（${basis.searchEngine ? '联网' : '不联网'}）`;
}

export function recordedReviewBasisWords(record: { categoryId: string; basisStatement: string }, categories: ReadonlyArray<{ categoryId: string; basis: ReviewCategoryBasis }>): string {
  if (technicalLayerVisible) return record.basisStatement;
  const category = categories.find((category) => category.categoryId === record.categoryId);
  return category === undefined ? '依据：本次审阅所选资料' : reviewBasisWords(category.basis);
}
