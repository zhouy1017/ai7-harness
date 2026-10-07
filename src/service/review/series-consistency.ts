import type { DatabaseSync } from 'node:sqlite';
import { SERIES_KNOWLEDGE_CLASS_LABELS, type SeriesKnowledgeClass } from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { graphemeCount, sliceGraphemes } from '../analysis/factual-review-contract.js';
import { SeriesLedger } from '../series.js';
import { SeriesKnowledgeLedger, type StoredItem } from '../series-knowledge.js';
import type { ReviewCategoryConfigurationEntry, ReviewGuidelineDocument, SeriesKnowledgePins } from './category-configuration.js';

/**
 * 书系一致性 for one Book (Issue #64, plan slice S29a; V2-UX-REV-013, SER-018). The category is configuration like the other
 * eight, but its basis is not the house's: it is the Series Knowledge of the Series the Book is in now, so the house entry is
 * resolved for each Book before anything reads it. A Book in a Series whose current revisions were taken in for consistency
 * review gets an entry the Editorial Review Contract executes, its guideline documents built from those revisions; every other
 * Book gets the entry unavailable, with a reason that says why in the editor's words.
 *
 * The clauses are positional. Series by name, items by name within each, `series-knowledge/<n>` counting items across all the
 * Series and `series-knowledge/<n>.<m>` the pieces of an item cut to the contract's 300-grapheme clause bound. An authored
 * fixture names its clauses by those ids, so the ids must not move when an item's identity does — only its order and words
 * move them, and those already move the contract digest.
 *
 * What a Run used is pinned beside the documents (`seriesKnowledge`): every Series the Book was in, and each revision with its
 * content digest. A plan prepared over pins that no longer match what the Book would be given now is no longer current.
 */

export const SERIES_KNOWLEDGE_CLAUSE_PREFIX = 'series-knowledge' as const;
/** The Editorial Review Contract's own bounds (`review-category-contract.ts`): at most 40 clauses of at most 300 graphemes. */
export const MAX_SERIES_KNOWLEDGE_CLAUSES = 40;
const MAX_CLAUSE_GRAPHEMES = 300;
/** Whitespace and anything that would break a prompt line: one clause is one line. */
const FOLDED = /[\s\p{Cc}\p{Zl}\p{Zp}]+/gu;

/**
 * The reuse scopes a revision may be taken into a consistency review under. `series-tasks` is the wider of the two — every
 * later Series-scope Task may use it — so it covers this review as well; `consistency-review` is only this review.
 */
const CONSISTENCY_REUSE_SCOPES: ReadonlySet<string> = new Set(['consistency-review', 'series-tasks']);

/** One Series' knowledge as the clauses are built from it: its name and the current revision of each eligible item. */
export interface SeriesKnowledgeSource {
  readonly seriesId: string;
  readonly title: string;
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    readonly subject: string;
    readonly knowledgeClass: SeriesKnowledgeClass;
    readonly revisionId: string;
    readonly ordinal: number;
    readonly content: string;
  }>;
}

export type SeriesConsistencyResolution =
  | { readonly kind: 'available'; readonly documents: ReadonlyArray<ReviewGuidelineDocument>; readonly pins: SeriesKnowledgePins }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** A revision's words on one line: every run of whitespace or line-breaking character becomes one space. */
export function foldSeriesKnowledgeContent(content: string): string {
  return content.replace(FOLDED, ' ').trim();
}

/**
 * One item's clauses: its class and name lead each piece, so a piece read alone still says what it is about, and the folded
 * words are cut to fit the bound beside the longer of the two leads.
 */
export function seriesKnowledgeItemClauses(
  ordinal: number,
  item: { readonly subject: string; readonly knowledgeClass: SeriesKnowledgeClass; readonly content: string },
): Array<{ clauseId: string; text: string }> {
  const name = `${SERIES_KNOWLEDGE_CLASS_LABELS[item.knowledgeClass]}「${item.subject}」`;
  const lead = `${name}：`;
  const continued = `${name}（续）：`;
  const budget = MAX_CLAUSE_GRAPHEMES - graphemeCount(continued);
  const folded = foldSeriesKnowledgeContent(item.content);
  const total = graphemeCount(folded);
  const pieces: string[] = [];
  for (let from = 0; from < total; from += budget) {
    const piece = sliceGraphemes(folded, from, Math.min(total, from + budget)).trim();
    if (piece.length > 0) pieces.push(piece);
  }
  const base = `${SERIES_KNOWLEDGE_CLAUSE_PREFIX}/${ordinal}`;
  if (pieces.length === 1) return [{ clauseId: base, text: `${lead}${pieces[0]}` }];
  return pieces.map((piece, index) => ({ clauseId: `${base}.${index + 1}`, text: `${index === 0 ? lead : continued}${piece}` }));
}

/** Why the Book has no Series to check against. */
export const SERIES_CONSISTENCY_NO_SERIES_REASON = '这本书不在任何书系中；加入书系、并且书系纳入了可用于一致性审阅的书系知识后才能选。' as const;

/** Why the Book's Series give the review nothing to check against: none holds knowledge taken in for consistency review. */
export function seriesConsistencyNoKnowledgeReason(titles: ReadonlyArray<string>, total: number = titles.length): string {
  const named = titles.map((title) => `「${title}」`).join('、');
  const which = total > titles.length ? `这本书所在的 ${total} 个书系，包括${named}，` : total === 1 ? `书系${named}` : `这本书所在的书系${named}`;
  return `${which}${total === 1 ? '' : '都'}还没有纳入可用于一致性审阅的书系知识；在书系中纳入后才能选。`;
}

/** Why the review cannot carry the knowledge whole: it folds into more clauses than one review may carry. */
export function seriesConsistencyTooManyReason(count: number): string {
  return `这本书所在书系的书系知识折成 ${count} 条审阅依据，超过一次审阅能带的 ${MAX_SERIES_KNOWLEDGE_CLAUSES} 条，暂不能选；请在书系中合并或精简这些书系知识。`;
}

/** How many Series a reason names before it gives the count. */
const NAMED_SERIES = 3;

/**
 * The documents and pins of one Book's knowledge, or why there are none. Pure over what was read, so a test can state the
 * clauses an authored fixture answers without a store.
 */
export function seriesConsistencyFromSources(memberships: ReadonlyArray<{ readonly seriesId: string; readonly title: string }>,
  sources: ReadonlyArray<SeriesKnowledgeSource>): SeriesConsistencyResolution {
  if (memberships.length === 0) return { kind: 'unavailable', reason: SERIES_CONSISTENCY_NO_SERIES_REASON };
  const ordered = [...sources].sort((left, right) => compare(left.title, right.title) || compare(left.seriesId, right.seriesId));
  const documents: ReviewGuidelineDocument[] = [];
  const revisions: Array<SeriesKnowledgePins['revisions'][number]> = [];
  let clauses = 0;
  for (const series of ordered) {
    const items = [...series.items].sort((left, right) => compare(left.subject, right.subject) || compare(left.itemId, right.itemId));
    for (const item of items) {
      const ordinal = revisions.length + 1;
      const built = seriesKnowledgeItemClauses(ordinal, item);
      clauses += built.length;
      revisions.push({ seriesId: series.seriesId, itemId: item.itemId, revisionId: item.revisionId, ordinal: item.ordinal, digest: sha256Hex(item.content) });
      documents.push({
        documentId: `${SERIES_KNOWLEDGE_CLAUSE_PREFIX}/${item.itemId}`,
        title: `${SERIES_KNOWLEDGE_CLASS_LABELS[item.knowledgeClass]}「${item.subject}」`,
        issuer: `书系「${series.title}」`,
        version: String(item.ordinal),
        clauses: built,
      });
    }
  }
  if (revisions.length === 0) {
    const titles = [...memberships].sort((left, right) => compare(left.title, right.title)).map((series) => series.title);
    return { kind: 'unavailable', reason: seriesConsistencyNoKnowledgeReason(titles.slice(0, NAMED_SERIES), titles.length) };
  }
  if (clauses > MAX_SERIES_KNOWLEDGE_CLAUSES) return { kind: 'unavailable', reason: seriesConsistencyTooManyReason(clauses) };
  const series = [...memberships].sort((left, right) => compare(left.title, right.title) || compare(left.seriesId, right.seriesId))
    .map((entry) => ({ seriesId: entry.seriesId, title: entry.title }));
  return { kind: 'available', documents, pins: { series, revisions } };
}

/** Code-unit order, as the database orders names: the same on every host and in every locale. */
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Every Series the Book is in now, across every page of its memberships. */
function membershipsOf(db: DatabaseSync, bookId: string): Array<{ seriesId: string; title: string }> {
  const ledger = new SeriesLedger(db);
  const all: Array<{ seriesId: string; title: string }> = [];
  let after: Parameters<SeriesLedger['seriesOf']>[1] = null;
  do {
    const page = ledger.seriesOf(bookId, after);
    for (const entry of page.memberships) all.push({ seriesId: entry.seriesId, title: entry.title });
    after = page.nextCursor;
  } while (after !== null);
  return all;
}

/** The current revision of each item that may be read by a consistency review. */
function eligible(item: StoredItem): boolean {
  return CONSISTENCY_REUSE_SCOPES.has(item.current.reuseScope);
}

/** One Book's 书系一致性 as it stands in the database now. */
export function resolveSeriesConsistency(db: DatabaseSync, bookId: string): SeriesConsistencyResolution {
  const memberships = membershipsOf(db, bookId);
  if (memberships.length === 0) return seriesConsistencyFromSources(memberships, []);
  const knowledge = new SeriesKnowledgeLedger(db);
  const sources = memberships.map((series): SeriesKnowledgeSource => ({
    seriesId: series.seriesId,
    title: series.title,
    items: Array.from(knowledge.items(series.seriesId)).filter(eligible).map((item) => ({
      itemId: item.itemId,
      subject: item.subject,
      knowledgeClass: item.knowledgeClass,
      revisionId: item.current.revisionId,
      ordinal: item.current.ordinal,
      content: item.current.content,
    })),
  }));
  return seriesConsistencyFromSources(memberships, sources);
}

/**
 * The house entry as it applies to one Book: executed by the Editorial Review Contract over the Book's Series Knowledge, with
 * what it used pinned, or unavailable with the Book's own reason. Every other entry is returned as it is.
 */
export function seriesConsistencyEntry(entry: ReviewCategoryConfigurationEntry, resolution: SeriesConsistencyResolution): ReviewCategoryConfigurationEntry {
  if (resolution.kind === 'unavailable') return { ...entry, executor: 'unavailable', unavailableReason: resolution.reason, guidelineDocuments: [] };
  return { ...entry, executor: 'review-category-contract', unavailableReason: null, guidelineDocuments: resolution.documents, seriesKnowledge: resolution.pins };
}

/** Whether the pins a Run froze are still exactly what the Book would be given now. */
export function seriesKnowledgePinsCurrent(frozen: SeriesKnowledgePins, now: SeriesConsistencyResolution): boolean {
  return now.kind === 'available' && canonicalJson(frozen) === canonicalJson(now.pins);
}
