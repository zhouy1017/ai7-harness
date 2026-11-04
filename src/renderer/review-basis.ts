import { technicalReviewBasis, type ReviewCategoryBasis } from '../shared/review-basis.js';
import { technicalLayerVisible } from './technical-layer.js';

export function reviewBasisWords(basis: ReviewCategoryBasis): string {
  if (technicalLayerVisible) return technicalReviewBasis(basis);
  const files = basis.guidelineDocuments.map((document) => document.title);
  return `依据：${[...files, basis.procedure.title].join(' · ')}（${basis.searchEngine ? '联网' : '不联网'}）`;
}

export function recordedReviewBasisWords(record: { categoryId: string; basisStatement: string }, categories: ReadonlyArray<{ categoryId: string; basis: ReviewCategoryBasis }>): string {
  if (technicalLayerVisible) return record.basisStatement;
  const category = categories.find((category) => category.categoryId === record.categoryId);
  return category === undefined ? '依据：本次审阅所选资料' : reviewBasisWords(category.basis);
}
