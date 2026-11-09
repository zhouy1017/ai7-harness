import type { EditorialMarkCategoryKey } from '../shared/editorial-mark-category.js';
import type { EditorialMarkAnchorProjection, EditorialMarkCardProjection } from '../shared/protocol.js';

export interface EditorialMarkFilter {
  readonly selectedCategories: Set<EditorialMarkCategoryKey>;
  status: 'all' | 'open' | 'applied';
  keyword: string;
}

export function matchesEditorialMarkFilter(mark: EditorialMarkAnchorProjection, card: EditorialMarkCardProjection | undefined, filter: EditorialMarkFilter): boolean {
  if (filter.selectedCategories.size > 0 && !filter.selectedCategories.has(mark.categoryKey)) return false;
  if (filter.status !== 'all' && mark.status !== filter.status) return false;
  const keyword = filter.keyword.trim().toLocaleLowerCase();
  if (!keyword) return true;
  const suggestion = card?.suggestion;
  return [mark.categoryLabel, mark.sourceLabel, card?.pinnedText, card?.body, suggestion?.currentText,
    suggestion?.decision?.editedText, suggestion?.proposedText, suggestion?.rationale]
    .some((value) => value?.toLocaleLowerCase().includes(keyword));
}
