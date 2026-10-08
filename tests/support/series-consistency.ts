import { expect } from 'vitest';
import type { EditorialStore } from '../../src/service/store.js';
import type { SeriesKnowledgeClass, SeriesKnowledgeReuseScope } from '../../src/shared/protocol.js';

/**
 * The Series Knowledge J-13 holds when its member Book offers 书系一致性 (Issue #64, S29a): the one item of 书系「星河三部曲」,
 * 地点「海边小城」, at the editor's words its second revision took in. The authored fixture
 * `sample1-series-consistency-authored` answers the clauses built from exactly this, so the suites and the generator take it
 * from here and J-13 makes the same through the product.
 */
export const J13_SERIES_TITLE = '星河三部曲';
export const J13_PLACE = '海边小城';
export const J13_EDITOR_WORDS = '三部曲里海边小城的地名，以第一部的写法为准。';

export interface KnowledgeItemInput {
  readonly subject: string;
  readonly knowledgeClass: SeriesKnowledgeClass;
  readonly content: string;
  readonly reuseScope: SeriesKnowledgeReuseScope;
}

/** 加入书系 of one Book against its own preview. */
export function joinSeries(store: EditorialStore, seriesId: string, bookId: string): void {
  const preview = store.previewSeriesMembershipChange({ seriesId, bookId, kind: 'add' });
  store.changeSeriesMembership({ seriesId, bookId, kind: 'add', previewDigest: preview.previewDigest });
}

/** 移出书系 of one Book against its own preview. */
export function leaveSeries(store: EditorialStore, seriesId: string, bookId: string): void {
  const preview = store.previewSeriesMembershipChange({ seriesId, bookId, kind: 'remove' });
  store.changeSeriesMembership({ seriesId, bookId, kind: 'remove', previewDigest: preview.previewDigest });
}

/** An editor-authored candidate for a new item, reviewed and taken in: the item's first revision. Returns the item. */
export function takeInNewItem(store: EditorialStore, seriesId: string, item: KnowledgeItemInput): string {
  const proposed = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: item.subject, knowledgeClass: item.knowledgeClass }, content: item.content, span: null });
  return promote(store, seriesId, proposed.candidateId, item.reuseScope).itemId;
}

/** An editor-authored candidate for an existing item, reviewed and taken in: its next revision. */
export function takeInRevision(store: EditorialStore, seriesId: string, itemId: string, content: string, reuseScope: SeriesKnowledgeReuseScope): void {
  const proposed = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'existing', itemId }, content, span: null });
  promote(store, seriesId, proposed.candidateId, reuseScope);
}

function promote(store: EditorialStore, seriesId: string, candidateId: string, reuseScope: SeriesKnowledgeReuseScope): { itemId: string } {
  const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId });
  const promoted = store.promoteSeriesKnowledge({ seriesId, candidateId, candidateVersion: review.candidate.version, reviewDigest: review.reviewDigest,
    reuseScope, conflictDisposition: review.conflictCount === 0 ? 'none' : 'preserved' });
  expect(promoted.itemId).toMatch(/^[0-9a-f-]{36}$/u);
  return { itemId: promoted.itemId };
}

/** J-13's Series as the member Book reaches 书系一致性: one place, its name to be written as the first book writes it. */
export function makeJ13Series(store: EditorialStore, bookId: string): string {
  const seriesId = store.createSeries({ title: J13_SERIES_TITLE, note: '' }).seriesId;
  joinSeries(store, seriesId, bookId);
  takeInNewItem(store, seriesId, { subject: J13_PLACE, knowledgeClass: 'places', content: J13_EDITOR_WORDS, reuseScope: 'series-tasks' });
  return seriesId;
}
