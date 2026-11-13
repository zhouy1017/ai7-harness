import type { EditorialMarkCategoryKey } from '../shared/editorial-mark-category.js';
import type { EditorialMarkAnchorProjection, EditorialMarkCardProjection } from '../shared/protocol.js';
import { markIsHandled, markSourceMark } from './editorial-mark-labels.js';

export interface EditorialMarkFilter {
  readonly selectedCategories: Set<EditorialMarkCategoryKey>;
  readonly selectedModels: Set<string>;
  status: 'all' | 'open' | 'handled';
  keyword: string;
}

export function matchesEditorialMarkFilter(mark: EditorialMarkAnchorProjection, card: EditorialMarkCardProjection | undefined, filter: EditorialMarkFilter): boolean {
  if (filter.selectedCategories.size > 0 && !filter.selectedCategories.has(mark.categoryKey)) return false;
  const handled = markIsHandled(mark);
  if (filter.status === 'handled' && !handled || filter.status === 'open' && handled) return false;
  if (filter.selectedModels.size > 0 && (card?.source.kind !== 'ai7' || !filter.selectedModels.has(markSourceMark(card.source)))) return false;
  const keyword = filter.keyword.trim().toLocaleLowerCase();
  if (!keyword) return true;
  const suggestion = card?.suggestion;
  return [mark.categoryLabel, mark.sourceLabel, card?.pinnedText, card?.body, suggestion?.currentText,
    suggestion?.decision?.editedText, suggestion?.proposedText, suggestion?.rationale]
    .some((value) => value?.toLocaleLowerCase().includes(keyword));
}
