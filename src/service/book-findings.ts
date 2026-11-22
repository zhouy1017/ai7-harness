import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { requireStore } from './store-records.js';
import type { BookFindingsFilters, InspectBookFindingsInput, BookFindingsReadProjection, EvaluationWorkspaceProjection } from '../shared/protocol.js';
import { BOOK_FINDINGS_PAGE_SIZE, type BookFindingProjection, type BookFindingsProjection, type BaselineAnalysisResultSetRevisionProjection, type ParagraphAnalysisProjection } from '../shared/protocol.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, LOCAL_REVIEW_CATEGORY } from './review/category-configuration.js';
import { bookFindingsBatchSentence, BOOK_FINDINGS_VERSION_CHANGED } from '../shared/report-wording.js';

const CATEGORIES = new Set(['analysis-gaps', 'evaluation-risks', ...BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map((category) => `review:${category.categoryId}`), `review:${LOCAL_REVIEW_CATEGORY.categoryId}`]);
const SEVERITIES = new Set(['必须处理', '建议处理', '提示', '高', '中', '低', '未评级']);
const STATUSES = new Set(['待处理', '未覆盖']);

/** These are the three existing page filters, not a way to send an action to a source owner. */
export function validBookFindingsFilters(value: unknown): value is BookFindingsFilters {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.entries(value).every(([key, entry]) =>
    typeof entry === 'string' && (key === 'category' ? entry === '' || CATEGORIES.has(entry)
      : key === 'severity' ? entry === '' || SEVERITIES.has(entry) : key === 'status' && (entry === '' || STATUSES.has(entry))));
}

/** A disposable page over the owning records. No dispositions or other records live here. */
export function bookFindingsPage(bookId: string, findings: Iterable<BookFindingProjection>, offset: number): BookFindingsProjection {
  const groups = new Map<string, BookFindingsProjection['groups'][number]>();
  const items: BookFindingProjection[] = [];
  let total = 0;
  for (const finding of findings) {
    let group = groups.get(finding.category);
    if (group === undefined) {
      group = { category: finding.category, label: finding.categoryLabel, count: 0, bySeverity: {}, byStatus: {} };
      groups.set(finding.category, group);
    }
    group.count += 1;
    // These dictionaries are created here and never shared with the source records.
    const severity = group.bySeverity as Record<string, number>;
    const status = group.byStatus as Record<string, number>;
    severity[finding.severity] = (severity[finding.severity] ?? 0) + 1;
    status[finding.status] = (status[finding.status] ?? 0) + 1;
    if (total >= offset && items.length < BOOK_FINDINGS_PAGE_SIZE) items.push({ ...finding, summary: finding.summary.slice(0, 500) });
    total += 1;
  }
  return { bookId, total, offset, next: offset + items.length < total ? offset + items.length : null, pageSize: BOOK_FINDINGS_PAGE_SIZE, groups: [...groups.values()], items };
}

/**
 * Anchors, never name matching: an item belongs here only when it cites a nearby block. The synthesis, its sections and the
 * units restate one item at each level, so an item is listed once per kind and wording, at its first nearby anchor.
 */
export function paragraphAnalysis(bookId: string, manuscriptId: string, blockId: string, nearby: ReadonlySet<string>, revision: BaselineAnalysisResultSetRevisionProjection | null): ParagraphAnalysisProjection {
  const items: ParagraphAnalysisProjection['items'][number][] = [];
  let total = 0;
  if (revision !== null) {
    const seen = new Set<string>();
    for (const source of [revision.synthesis, ...revision.sections, ...revision.units]) {
      if (!('entities' in source)) continue;
      for (const kind of ['entities', 'events', 'settingClaims', 'relationships'] as const) {
        for (const item of source[kind]) {
          const anchor = item.sourceRanges.find((range) => nearby.has(range.blockId));
          if (anchor === undefined) continue;
          const label = 'name' in item ? item.name : 'summary' in item ? item.summary : 'claim' in item ? `${item.subject}：${item.claim}` : `${item.subject} · ${item.relation} · ${item.object}`;
          const key = JSON.stringify([kind, label]);
          if (seen.has(key)) continue;
          seen.add(key);
          total += 1;
          if (items.length < 40) items.push({ kind, label: label.slice(0, 500), blockId: anchor.blockId });
        }
      }
    }
  }
  return { bookId, manuscriptId, blockId, revision: revision === null ? null : { revisionId: revision.revisionId, ordinal: revision.ordinal, freshness: revision.freshness }, total, items };
}

/** Aggregates current readings without owning their state. */
export interface BookFindingsHost {
  readonly authority: DatabaseSync;
  evaluationBookTitle(bookId: string): string;
  latestAnalysisRevision(bookId: string): BaselineAnalysisResultSetRevisionProjection | null;
  reviewFindings(bookId: string): ReadonlyArray<BookFindingProjection>;
  inspectEvaluation(bookId: string, recordId: string | null): EvaluationWorkspaceProjection;
}

/** Read-only aggregation: the source owners derive dispositions on every read. */
function composeBookFindings(host: BookFindingsHost, bookId: string): BookFindingProjection[] {
  const store = host;
  function* findings(): Generator<BookFindingProjection> {
    const revision = store.latestAnalysisRevision(bookId);
    if (revision !== null) for (const gap of revision.gaps) {
      yield { id: `gap:${revision.revisionId}:${gap.unitOrdinal}`, category: 'analysis-gaps', categoryLabel: '分析未完成的部分', severity: '提示', status: '未覆盖', summary: gap.reason,
        target: { kind: 'gap', revisionId: revision.revisionId, unitOrdinal: gap.unitOrdinal, blockId: gap.blockIds[0] ?? null } };
    }
    yield* store.reviewFindings(bookId);
    // Only the version on show is current: an earlier version is immutable history, its risks carried or settled by the next.
    const record = store.inspectEvaluation(bookId, null).record;
    if (record !== null) {
      for (const risk of record.content.risks) if (!risk.reviewed && (risk.level !== null || risk.statement !== null)) {
        yield { id: `risk:${record.recordId}:${risk.riskId}`, category: 'evaluation-risks', categoryLabel: '评估风险', severity: risk.level === 'high' ? '高' : risk.level === 'medium' ? '中' : risk.level === 'low' ? '低' : '未评级', status: '待处理',
          summary: risk.statement ?? record.profile.risks.find((item) => item.riskId === risk.riskId)?.label ?? '评估风险',
          target: { kind: 'risk', recordId: record.recordId, riskId: risk.riskId, revisionId: record.revisionId } };
      }
    }
  }
  return [...findings()].map((finding) => ({ ...finding, summary: finding.summary.slice(0, 500) }));
}

type CachedView = { version: string; digest: string; metadata: Omit<BookFindingsReadProjection, 'items'> };
type CachedBook = { generation: string; items: BookFindingProjection[]; groups: BookFindingsProjection['groups']; views: Map<string, CachedView>; snapshot?: { key: string; answer: BookFindingsReadProjection } };
const readers = new WeakMap<DatabaseSync, BookFindingsReader>();

/** Import replacement releases the old list immediately; a normal write is detected by generation on the next read. */
export function forgetBookFindings(db: DatabaseSync, bookId: string): void { readers.get(db)?.forget(bookId); }

const digestOf = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Disposable LRU: eight Books, one composed list/snapshot per Book, eight small filter/page digests (never old rows).
 * A 1,024-row sample1 composition is about 1.4 MB serialized; filtered snapshots share the list's row objects.
 */
export class BookFindingsReader {
  readonly #nonce = randomUUID();
  readonly #books = new Map<string, CachedBook>();
  constructor(readonly host: BookFindingsHost) {}

  forget(bookId: string): void { this.#books.delete(bookId); }
  clear(): void { this.#books.clear(); readers.delete(this.host.authority); }

  inspect(bookId: string, options: number | InspectBookFindingsInput = 0): BookFindingsReadProjection {
    const input = typeof options === 'number' ? { offset: options } : options;
    const offset = input.offset ?? 0;
    requireStore(Number.isSafeInteger(offset) && offset >= 0, 'FINDINGS_PAGE_INVALID', '发现分页无效。');
    requireStore(input.since === undefined || typeof input.since === 'string' && /^[a-f0-9]{64}$/u.test(input.since), 'FINDINGS_VERSION_INVALID', '待办汇总的读取标识无效。');
    requireStore((input.whole === undefined || typeof input.whole === 'boolean') && (input.filters === undefined || validBookFindingsFilters(input.filters)), 'FINDINGS_FILTER_INVALID', '待办汇总的筛选条件无效。');
    const filters = input.filters ?? {};
    const whole = input.whole === true;
    const viewKey = JSON.stringify([filters.category || '', filters.severity || '', filters.status || '', whole, whole ? 0 : offset]);
    if (whole && offset > 0) {
      const cached = this.#books.get(bookId);
      const snapshot = cached?.snapshot;
      requireStore(snapshot !== undefined && snapshot.key === viewKey && snapshot.answer.version === input.since,
        'FINDINGS_VERSION_CHANGED', BOOK_FINDINGS_VERSION_CHANGED);
      requireStore(offset < snapshot.answer.total, 'FINDINGS_PAGE_INVALID', '发现分页无效。');
      this.#books.delete(bookId); this.#books.set(bookId, cached!);
      // A running review writes often. Transport follows this one composition, not the live database generation.
      return { ...snapshot.answer, offset, items: snapshot.answer.items.slice(offset) };
    }
    this.host.evaluationBookTitle(bookId);
    const db = this.host.authority;
    readers.set(db, this);
    // Authority writes include prepare().run() outside transact; journal and ingest commits use other connections.
    // Capture before composing: a commit during the read leaves an old token, forcing another composition next time.
    const generation = JSON.stringify([db.prepare('PRAGMA data_version').get(), db.prepare('SELECT total_changes() changes').get(), db.prepare('PRAGMA schema_version').get()]);
    let book = this.#books.get(bookId);
    if (book === undefined || book.generation !== generation) {
      const items = composeBookFindings(this.host, bookId);
      book = { generation, items, groups: bookFindingsPage(bookId, items, 0).groups, views: book?.views ?? new Map() };
    }
    this.#books.delete(bookId);
    this.#books.set(bookId, book);
    if (this.#books.size > 8) this.#books.delete(this.#books.keys().next().value!);
    const previous = book.views.get(viewKey);
    const version = digestOf([this.#nonce, generation, bookId, viewKey]);
    if (previous?.version === version && input.since === version) return { ...previous.metadata, unchanged: true, items: [] };
    const matching = book.items.filter((item) => (!filters.category || item.category === filters.category) && (!filters.severity || item.severity === filters.severity) && (!filters.status || item.status === filters.status));
    const count = matching.filter((item) => item.suggestion?.batchAllowed).length;
    const answer: BookFindingsReadProjection = {
      bookId, version, unchanged: false, total: matching.length, offset: whole ? 0 : offset,
      next: whole || offset + BOOK_FINDINGS_PAGE_SIZE >= matching.length ? null : offset + BOOK_FINDINGS_PAGE_SIZE,
      pageSize: BOOK_FINDINGS_PAGE_SIZE, groups: book.groups, items: whole ? matching : matching.slice(offset, offset + BOOK_FINDINGS_PAGE_SIZE),
      batch: { count, sentence: bookFindingsBatchSentence(count, Boolean(filters.category || filters.severity || filters.status)) },
    };
    // Compare all of the displayed list, never just its first forty rows or the database-wide token.
    const digest = digestOf([matching, answer.groups, answer.total, answer.batch]);
    const unchanged = input.since !== undefined && previous?.version === input.since && previous.digest === digest;
    book.views.delete(viewKey);
    const { items: _items, ...metadata } = answer;
    book.views.set(viewKey, { version, digest, metadata });
    if (whole && !unchanged) book.snapshot = { key: viewKey, answer };
    if (book.views.size > 8) book.views.delete(book.views.keys().next().value!);
    return unchanged ? { ...answer, unchanged: true, items: [] } : answer;
  }
}
