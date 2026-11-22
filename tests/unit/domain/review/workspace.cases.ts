import { MAX_SELECTION_BLOCKS, SELECTION_UNAVAILABLE_REASON, SELECTION_GONE_REASON, SELECTION_TOO_LONG_REASON } from '../../../../src/service/review/review-scope.js';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { reviewDatabase, reviewHost } from '../../../support/domain/review.js';
import { inspectReviewWorkspace, createReviewRunPreparationWork } from '../../../../src/service/review/review-operations.js';
import { ReviewRunError } from '../../../../src/service/review/review-runs.js';

describe('review workspace domain', () => {
  let db: DatabaseSync;
  beforeAll(() => { db = reviewDatabase(); });
  afterAll(() => db.close());
  beforeEach(() => db.exec('SAVEPOINT review_case'));
  afterEach(() => db.exec('ROLLBACK TO review_case; RELEASE review_case'));
  const storeCode = (operation: () => unknown) => { try { operation(); return null; } catch (error) { if (error instanceof ReviewRunError) return error.code; throw error; } };
  it('reads a Book without a manuscript as having nothing to review, and names why', () => {
    const bookId = randomUUID();
    db.prepare('INSERT INTO books(book_id, stable_identity, title, created_at) VALUES (?, ?, ?, ?)').run(bookId, randomUUID(), '空图书', '2026-11-17T00:00:00Z');
    const host = reviewHost(db);
    const empty = inspectReviewWorkspace(host, bookId, null);
    expect(empty).toMatchObject({ bookId, manuscript: null, newReview: { available: false }, runs: [], run: null });
    expect(empty.categories.every((category) => !category.available)).toBe(true);
    expect(empty.coverage.every((row) => row.state === 'unavailable')).toBe(true);
    expect(empty.scopeOptions.whole.available).toBe(false);
    // No launch policy is read before this domain refusal.
    expect(storeCode(() => createReviewRunPreparationWork(host, bookId, ['typos-and-usage'], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, host.baselineAnalysis.launch.policy!))).toBe('REVIEW_MANUSCRIPT_ABSENT');
    expect(storeCode(() => inspectReviewWorkspace(host, randomUUID(), null))).toBe('REVIEW_BOOK_NOT_FOUND');
  });

  it('refuses updates and deletion of recorded review ledger relations', () => {
    // Source identities only: the subject is the domain's immutable relations, not provenance.
    db.exec('PRAGMA defer_foreign_keys=ON');
    const digest = '0'.repeat(64);
    const finding = 'rvf_' + '0'.repeat(24);
    db.prepare(`INSERT INTO review_runs VALUES ('run', 'book', 1, 'm', 'b', 'r', 0, ?, 'whole', NULL, NULL, ?, 'now', '{}', ?)`).run(digest, digest, digest);
    db.prepare(`INSERT INTO review_run_authorizations VALUES ('run', 'now', '{}', ?)`).run(digest);
    db.prepare(`INSERT INTO review_run_category_events VALUES ('e', 'run', 'typos-and-usage', 1, 'failed', 'schema test', NULL, NULL, 'now', '{}', ?)`).run(digest);
    db.prepare(`INSERT INTO review_findings VALUES ('run', ?, 'typos-and-usage', 1, 'kind', 'note', 'annotation', 0, 'block', 0, 1, 'q', 'n', NULL, NULL, NULL, NULL, 'anchor-changed', '{}', ?)`).run(finding, digest);
    db.prepare(`INSERT INTO review_finding_dispositions VALUES ('d', 'run', ?, 1, 'ignored', 'reason', 'now', '{}', ?)`).run(finding, digest);
    db.prepare(`INSERT INTO quality_signals VALUES ('s', 'book', 'review-finding-ignored', 'run', 'typos-and-usage', ?, 'd', NULL, 'reason', 'now', '{}', ?)`).run(finding, digest);
    for (const relation of ['review_runs', 'review_run_authorizations', 'review_run_category_events', 'review_findings', 'review_finding_dispositions', 'quality_signals']) {
      expect(() => db.exec(`UPDATE ${relation} SET rowid = rowid`)).toThrow(/REVIEW_LEDGER_IMMUTABLE/u);
      expect(() => db.exec(`DELETE FROM ${relation}`)).toThrow(/REVIEW_LEDGER_IMMUTABLE/u);
    }
  });

  function reviewSession(blockCount: number) {
    const bookId = randomUUID(), manuscriptId = randomUUID(), branchId = randomUUID(), revisionId = randomUUID(), sourceId = randomUUID();
    const digest = '0'.repeat(64), now = '2026-11-17T00:00:00Z';
    db.exec('PRAGMA defer_foreign_keys=ON');
    // External-owner source identities and empty paragraphs only: structural range/eligibility facts, not content or provenance.
    db.prepare('INSERT INTO books VALUES (?, ?, ?, ?)').run(bookId, randomUUID(), '领域图书', now);
    db.prepare('INSERT INTO manuscripts VALUES (?, ?, ?, ?)').run(manuscriptId, bookId, 'primary', now);
    db.prepare('INSERT INTO manuscript_branches VALUES (?, ?, ?, ?, ?)').run(branchId, manuscriptId, 'main', revisionId, now);
    db.prepare('INSERT INTO source_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(sourceId, bookId, digest, digest, digest, digest, 'domain-source', 'DOCX', 'domain.docx', now);
    db.prepare('INSERT INTO manuscript_revisions VALUES (?, ?, ?, 1, ?, NULL, ?, ?, ?)').run(revisionId, manuscriptId, branchId, 'r1', sourceId, digest, now);
    db.prepare('INSERT INTO branch_working_state VALUES (?, ?, ?, 0, ?)').run(branchId, manuscriptId, revisionId, digest);
    const blocks = Array.from({ length: blockCount }, (_, index) => ({ blockId: 'blk_' + (index + 1).toString(16).padStart(24, '0'), position: index + 1 }));
    for (const block of blocks) {
      db.prepare('INSERT INTO manuscript_blocks VALUES (?, ?, ?)').run(block.blockId, manuscriptId, revisionId);
      db.prepare('INSERT INTO working_blocks VALUES (?, ?, ?, ?, NULL, ?, ?, 0)').run(branchId, block.blockId, block.position * 2 ** 20, 'paragraph', '', digest);
    }
    // The working state's one page (Issue #1654): the paragraph numbers are counted from it.
    if (blocks.length > 0) db.prepare('INSERT INTO working_pages VALUES (?, 0, ?, 0)').run(branchId, blocks.length);
    db.prepare('INSERT INTO model_service_connections VALUES (?, ?, ?)').run('main-editorial-deepseek-v4-pro', randomUUID(), 'missing');
    return { bookId, host: reviewHost(db), blocks };
  }

  it('offers the available review categories and scope before the first Run', () => {
    const { host, bookId } = reviewSession(1);
    const before = inspectReviewWorkspace(host, bookId, null);
    expect(before.categories.map((category) => category.categoryId)).toEqual([
      'typos-and-usage', 'style-and-format', 'plot-consistency', 'factual-review', 'academic-integrity', 'publication-risk',
      'literary-expression', 'series-consistency', 'cross-deliverable-consistency',
    ]);
    expect(before.categories.find((category) => category.categoryId === 'plot-consistency')).toMatchObject({ available: true, unavailableReason: null });
    expect(before.categories.filter((category) => category.modelFree).map((category) => category.categoryId)).toEqual([]);
    expect(before.categories.find((category) => category.categoryId === 'series-consistency')!.available).toBe(false);
    expect(before.coverage.map((row) => row.state)).toEqual(['never', 'never', 'never', 'never', 'never', 'never', 'never', 'unavailable', 'unavailable']);
    expect(before.scopeOptions.selection).toEqual({ available: false, unavailableReason: SELECTION_UNAVAILABLE_REASON });
    expect(before.newReview).toEqual({ available: true, unavailableReason: null });
    expect(before.runs).toEqual([]);
    expect(before.run).toBeNull();
  });

  it('refuses unavailable or invalid selection scopes before preparing a Run (#423)', () => {
    const { host, bookId, blocks } = reviewSession(MAX_SELECTION_BLOCKS + 1);
    const at = (position: number) => blocks[position - 1]!;
    const on = (from: string, to: string) => ({ kind: 'selection' as const, fromChapterBlockId: from, toChapterBlockId: to });
    const prepare = (scope: ReturnType<typeof on>) => createReviewRunPreparationWork(host, bookId, ['typos-and-usage'], scope, host.baselineAnalysis.launch.policy!);
    const message = (operation: () => unknown) => { try { operation(); return null; } catch (error) { if (error instanceof ReviewRunError) return error.message; throw error; } };
    const twenty = at(20), twentyOne = at(21);
    const facts = inspectReviewWorkspace(host, bookId, null).categories.find((category) => category.categoryId === 'factual-review')!;
    expect(facts.scopes.selection).toEqual({ available: true, unavailableReason: null });
    expect(message(() => prepare(on('blk_' + '0'.repeat(24), twenty.blockId)))).toBe(SELECTION_GONE_REASON);
    expect(storeCode(() => prepare(on(twentyOne.blockId, twenty.blockId)))).toBe('REVIEW_SCOPE_INVALID');
    expect(message(() => prepare(on(at(1).blockId, at(MAX_SELECTION_BLOCKS + 1).blockId)))).toBe(SELECTION_TOO_LONG_REASON);
    expect(inspectReviewWorkspace(host, bookId, null).runs).toEqual([]);
  });
});
