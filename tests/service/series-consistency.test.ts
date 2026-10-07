import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import type { LaunchBinding } from '../../src/service/analysis/baseline-analysis-store.js';
import { SERIES_KNOWLEDGE_TRIGGER_SQL, SeriesKnowledgeLedger } from '../../src/service/series-knowledge.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import {
  SERIES_CONSISTENCY_NO_SERIES_REASON,
  SERIES_CONSISTENCY_TOO_MANY_REASON,
  SERIES_CONSISTENCY_UNREADABLE_REASON,
} from '../../src/service/review/series-consistency.js';
import type { LaunchPolicyProjection, ReviewRunProjection, ReviewWorkspaceCategoryProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import {
  J13_EDITOR_WORDS,
  J13_PLACE,
  J13_SERIES_TITLE,
  joinSeries,
  leaveSeries,
  takeInNewItem,
  takeInRevision,
} from '../support/series-consistency.js';

// Service-integration suite (L2) for 书系一致性 (Issue #64, plan slice S29a; V2-UX-REV-013, SER-018): the category offered to a
// Book only over Series Knowledge taken in for it, the reasons it is not, the exact revisions a Review Run pins and its basis
// names, an approval refused once the knowledge or the Book's Series moved, a frozen Run that later revisions never touch, and
// findings on the manuscript as marks — through the real store, the Review Run drive loop, the one execution owner and the
// local deterministic adapter over the authored fixture `sample1-series-consistency-authored`. The manuscript is exact
// `sample1` (ADR 0043); no Provider, socket or credential value is involved. Manuscript text is compared, never printed.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const FIXTURE = 'sample1-series-consistency-authored';
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
const NO_KNOWLEDGE = `书系「${J13_SERIES_TITLE}」还没有纳入可用于一致性审阅的书系知识；在书系中纳入后才能选。`;
const MOVED = '「书系一致性」所依据的书系或书系知识在准备之后有了变化；请重新准备这次审阅。';
/** A developer-live launch for the refusal it causes; nothing is ever transmitted to it. */
const LIVE: LaunchBinding = {
  operationalScope: 'developer-live',
  live: {
    route: 'opencode-go',
    model: 'deepseek-v4-flash',
    endpoint: 'https://example.invalid/v1/chat/completions',
    credentialSlot: 'opencode-go',
    credentialReference: randomUUID(),
    runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 240_000 },
  },
};
const WITHHELD = `这一类以书系「${J13_SERIES_TITLE}」的书系知识审阅；开发者实时模式下，本社的书系知识在获准发给模型之前不会发出，这一类暂不能开始。`;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-series-consistency-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

interface Session { store: EditorialStore; owner: BaselineAnalysisExecutionOwner; driver: ReviewRunDriver }

async function withSession(body: (session: Session, bookId: string) => Promise<void>, existingBookId?: string): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const fixture = await loadModelFixture(FIXTURES_ROOT, FIXTURE);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try {
    let bookId = existingBookId;
    if (bookId === undefined) {
      bookId = (await importSample1Book(store, roots.codeRoot, '星河之三')).bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'S29 主编辑连接');
    }
    await body({ store, owner, driver }, bookId);
  } finally {
    const stopped = driver.dispose();
    await owner.dispose();
    await stopped;
    store.markCleanShutdown();
    store.close();
  }
}

function category(store: EditorialStore, bookId: string): ReviewWorkspaceCategoryProjection {
  return store.inspectReviewWorkspace(bookId, null).categories.find((entry) => entry.categoryId === 'series-consistency')!;
}

function prepare(store: EditorialStore, bookId: string): ReviewRunProjection {
  let progress = store.createReviewRunPreparationWork(bookId, ['series-consistency'], WHOLE, launchPolicy);
  while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
  return progress.projection!.run!;
}

function approve(store: EditorialStore, bookId: string, run: ReviewRunProjection): void {
  store.authorizeReviewRun(bookId, run.reviewRunId, [{ categoryId: 'series-consistency', planEnvelopeDigest: run.categories[0]!.planEnvelopeDigest! }]);
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

/** The Run's category as `review_runs` froze it: what the snapshot pins, read from the canonical record itself. */
function frozenCategory(reviewRunId: string): Record<string, unknown> {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const row = db.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(reviewRunId) as { canonical_json: string };
    return (JSON.parse(row.canonical_json) as { categories: Array<Record<string, unknown>> }).categories[0]!;
  } finally {
    db.close();
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The member row's 书系一致性 state on the Series page. */
function memberState(store: EditorialStore, seriesId: string, bookId: string): [string | null, string | null] {
  const member = store.inspectSeries(seriesId).members.find((entry) => entry.bookId === bookId)!;
  return [member.seriesConsistencyReview?.reviewedAt ?? null, member.seriesConsistencyUnavailableReason];
}

describe('书系一致性 over a Book\'s Series Knowledge', () => {
  it('is offered only over knowledge taken in for it, and otherwise says why — on 审阅 and on the Series page alike', async () => {
    await withSession(async ({ store }, bookId) => {
      expect([category(store, bookId).available, category(store, bookId).unavailableReason]).toEqual([false, SERIES_CONSISTENCY_NO_SERIES_REASON]);
      expect(store.inspectReviewWorkspace(bookId, null).coverage.find((row) => row.categoryId === 'series-consistency')!.state).toBe('unavailable');

      const seriesId = store.createSeries({ title: J13_SERIES_TITLE, note: '' }).seriesId;
      joinSeries(store, seriesId, bookId);
      expect(category(store, bookId).unavailableReason).toBe(NO_KNOWLEDGE);
      expect(memberState(store, seriesId, bookId)).toEqual([null, NO_KNOWLEDGE]);
      // A candidate is no knowledge: only 纳入书系知识 makes it something a review may read (SER-014).
      const candidateId = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: J13_PLACE, knowledgeClass: 'places' }, content: J13_EDITOR_WORDS, span: null }).candidateId;
      expect(category(store, bookId).unavailableReason).toBe(NO_KNOWLEDGE);

      const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId });
      store.promoteSeriesKnowledge({ seriesId, candidateId, candidateVersion: 1, reviewDigest: review.reviewDigest, reuseScope: 'consistency-review', conflictDisposition: 'none' });
      expect(category(store, bookId)).toMatchObject({
        available: true,
        unavailableReason: null,
        basisStatement: `依据：书系「${J13_SERIES_TITLE}」的书系知识：地点「${J13_PLACE}」第 1 版 · 工序：书系一致性检查（第 1 版） · 不使用搜索引擎`,
        guidelineDocuments: [expect.objectContaining({ title: `地点「${J13_PLACE}」`, issuer: `书系「${J13_SERIES_TITLE}」`, version: '1', clauseCount: 1 })],
        scopes: { whole: { available: true, unavailableReason: null } },
      });
      expect(memberState(store, seriesId, bookId)).toEqual([null, null]);
      // A member without a manuscript has knowledge to check against and nothing to check.
      const creation = store.prepareBookCreation('星河之外', null);
      const empty = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
      joinSeries(store, seriesId, empty);
      expect(memberState(store, seriesId, empty)).toEqual([null, '这本书还没有稿件；导入稿件后才能审阅。']);

      // Knowledge another Series holds counts too, until together it is more than one review can carry.
      const crowded = store.createSeries({ title: '人物谱', note: '' }).seriesId;
      for (let index = 0; index < 40; index += 1) {
        takeInNewItem(store, crowded, { subject: `人物${String(index).padStart(2, '0')}`, knowledgeClass: 'characters', content: `第 ${index} 个人物的设定。`, reuseScope: 'series-tasks' });
      }
      joinSeries(store, crowded, bookId);
      expect(category(store, bookId).unavailableReason).toBe(SERIES_CONSISTENCY_TOO_MANY_REASON);
      expect(memberState(store, crowded, bookId)[1]).toBe(SERIES_CONSISTENCY_TOO_MANY_REASON);
      leaveSeries(store, crowded, bookId);
      expect(category(store, bookId).available).toBe(true);
      expect(refusal(() => prepare(store, empty))).toBe('REVIEW_MANUSCRIPT_ABSENT:这本书还没有稿件；导入稿件后才能审阅。');

      // Under developer-live the Series page says what 审阅 says: the house's own knowledge is held back from a live model.
      store.baselineAnalysisLedger.bindLaunch(LIVE);
      expect([category(store, bookId).available, category(store, bookId).unavailableReason]).toEqual([false, WITHHELD]);
      expect(memberState(store, seriesId, bookId)).toEqual([null, WITHHELD]);
      store.baselineAnalysisLedger.bindLaunch({ operationalScope: 'development-ci', live: null });
      expect(memberState(store, seriesId, bookId)).toEqual([null, null]);
    });
  }, 300_000);

  it('reads no further than one review carries, and verifies only the items its reuse scope admits', async () => {
    let member: string | undefined;
    let crowded: string | undefined;
    let revised: string | undefined;
    await withSession(async ({ store }, bookId) => {
      member = bookId;
      // An item whose first revision was for this review alone and whose current one is for every Series-scope Task.
      revised = store.createSeries({ title: '版本谱', note: '' }).seriesId;
      const itemId = takeInNewItem(store, revised, { subject: J13_PLACE, knowledgeClass: 'places', content: '第一版。', reuseScope: 'consistency-review' });
      takeInRevision(store, revised, itemId, '第二版。', 'series-tasks');
      crowded = store.createSeries({ title: '人物谱', note: '' }).seriesId;
      for (let index = 0; index < 42; index += 1) {
        takeInNewItem(store, crowded, { subject: `人物${String(index).padStart(2, '0')}`, knowledgeClass: 'characters', content: `第 ${index} 个人物的设定。`, reuseScope: 'consistency-review' });
      }
      joinSeries(store, crowded, bookId);
      expect(category(store, bookId).unavailableReason).toBe(SERIES_CONSISTENCY_TOO_MANY_REASON);
    });
    // The last item by name, the forty-second clause, no longer reads.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.exec('DROP TRIGGER series_knowledge_revisions_no_update');
      const row = database.prepare(`SELECT r.revision_id, r.canonical_json FROM series_knowledge_revisions r JOIN series_knowledge_items i ON i.item_id = r.item_id
        WHERE i.subject = '人物41'`).get() as { revision_id: string; canonical_json: string };
      const rewritten = row.canonical_json.replace('第 41 个人物的设定。', '改过的设定。');
      expect(rewritten).not.toBe(row.canonical_json);
      database.prepare('UPDATE series_knowledge_revisions SET canonical_json = ?, sha256 = ? WHERE revision_id = ?').run(rewritten, sha256(rewritten), row.revision_id);
      database.exec(SERIES_KNOWLEDGE_TRIGGER_SQL.series_knowledge_revisions_no_update!);
      // Filtered in SQL: a scope no item was taken in under verifies nothing, so the damaged item is never read.
      const ledger = new SeriesKnowledgeLedger(database);
      expect(Array.from(ledger.itemsCurrentlyFor(crowded!, ['series-tasks']))).toEqual([]);
      // The filter reads the current revision's scope, never an earlier one's.
      expect(Array.from(ledger.itemsCurrentlyFor(revised!, ['consistency-review']))).toEqual([]);
      expect(Array.from(ledger.itemsCurrentlyFor(revised!, ['series-tasks']), (item) => [item.subject, item.current.ordinal, item.current.content])).toEqual([[J13_PLACE, 2, '第二版。']]);
    } finally {
      database.close();
    }
    await withSession(async ({ store }, bookId) => {
      // Reading stopped at the forty-first clause, before the damaged one: the reason is the bound, not the damage.
      expect(category(store, bookId).unavailableReason).toBe(SERIES_CONSISTENCY_TOO_MANY_REASON);
    }, member);
  }, 300_000);

  it('makes only 书系一致性 unavailable when a Series record no longer reads, and leaves the rest of 审阅 preparable', async () => {
    let member: string | undefined;
    await withSession(async ({ store }, bookId) => {
      member = bookId;
      const seriesId = store.createSeries({ title: J13_SERIES_TITLE, note: '' }).seriesId;
      joinSeries(store, seriesId, bookId);
      takeInNewItem(store, seriesId, { subject: J13_PLACE, knowledgeClass: 'places', content: J13_EDITOR_WORDS, reuseScope: 'consistency-review' });
      expect(category(store, bookId).available).toBe(true);
    });
    // A revision's record rewritten beside the closed store, with a digest that matches: it no longer agrees with itself.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      database.exec('DROP TRIGGER series_knowledge_revisions_no_update');
      const row = database.prepare('SELECT revision_id, canonical_json FROM series_knowledge_revisions').get() as { revision_id: string; canonical_json: string };
      const rewritten = row.canonical_json.replace(JSON.stringify(J13_EDITOR_WORDS), JSON.stringify('改过的书系知识。'));
      expect(rewritten).not.toBe(row.canonical_json);
      database.prepare('UPDATE series_knowledge_revisions SET canonical_json = ?, sha256 = ? WHERE revision_id = ?').run(rewritten, sha256(rewritten), row.revision_id);
      database.exec(SERIES_KNOWLEDGE_TRIGGER_SQL.series_knowledge_revisions_no_update!);
    } finally {
      database.close();
    }
    await withSession(async ({ store }, bookId) => {
      // The category says why; every other category stays as it was, and 错别字 is prepared as ever.
      expect([category(store, bookId).available, category(store, bookId).unavailableReason]).toEqual([false, SERIES_CONSISTENCY_UNREADABLE_REASON]);
      expect(store.inspectReviewWorkspace(bookId, null).categories.find((entry) => entry.categoryId === 'typos-and-usage')!.available).toBe(true);
      let progress = store.createReviewRunPreparationWork(bookId, ['typos-and-usage'], WHOLE, launchPolicy);
      while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      expect(progress.projection!.run!.state).toBe('prepared');
      expect(refusal(() => prepare(store, bookId))).toBe(`REVIEW_CATEGORY_UNAVAILABLE:「书系一致性」：${SERIES_CONSISTENCY_UNREADABLE_REASON}`);
    }, member);
  }, 300_000);

  it('pins the revisions it used, refuses an approval once they or the Book\'s Series moved, and puts its findings on the manuscript', async () => {
    await withSession(async ({ store, driver }, bookId) => {
      const seriesId = store.createSeries({ title: J13_SERIES_TITLE, note: '' }).seriesId;
      joinSeries(store, seriesId, bookId);
      const itemId = takeInNewItem(store, seriesId, { subject: J13_PLACE, knowledgeClass: 'places', content: '海边小城的地名以第一部为准。', reuseScope: 'consistency-review' });
      const first = prepare(store, bookId);
      const firstRevision = store.inspectSeries(seriesId).knowledge.items[0]!.current.revisionId;
      const frozen = frozenCategory(first.reviewRunId);
      expect((frozen.entry as Record<string, unknown>).seriesKnowledge).toEqual({
        series: [{ seriesId, title: J13_SERIES_TITLE }],
        revisions: [{ seriesId, itemId, revisionId: firstRevision, ordinal: 1, digest: sha256('海边小城的地名以第一部为准。') }],
      });
      expect(frozen.basisStatement).toBe(`依据：书系「${J13_SERIES_TITLE}」的书系知识：地点「${J13_PLACE}」第 1 版 · 工序：书系一致性检查（第 1 版） · 不使用搜索引擎`);

      // J-13's words taken in as the item's second revision: the prepared plan now reads knowledge that is no longer the item's.
      takeInRevision(store, seriesId, itemId, J13_EDITOR_WORDS, 'series-tasks');
      expect(category(store, bookId).basisStatement).toContain(`地点「${J13_PLACE}」第 2 版`);
      const stale = store.inspectTaskPlan({ bookId, kind: 'review-run', ref: first.reviewRunId });
      expect(stale.start.readiness).toBe('changed');
      expect(refusal(() => approve(store, bookId, first))).toBe(`REVIEW_PLAN_CHANGED:${MOVED}`);

      // 重新准备: a new Run over the second revision, a new Task under the contract its words make.
      const second = prepare(store, bookId);
      expect(second.categories[0]!.taskIntentId).not.toBe(first.categories[0]!.taskIntentId);
      // A membership changed after preparation moves the plan too, even into a Series that gives nothing; leaving restores it.
      const other = store.createSeries({ title: '另一个书系', note: '' }).seriesId;
      joinSeries(store, other, bookId);
      expect(refusal(() => approve(store, bookId, second))).toBe(`REVIEW_PLAN_CHANGED:${MOVED}`);
      leaveSeries(store, other, bookId);
      expect(store.inspectTaskPlan({ bookId, kind: 'review-run', ref: second.reviewRunId }).start.readiness).toBe('ready');

      approve(store, bookId, second);
      await driver.drive(second.reviewRunId);
      const done = store.inspectReviewWorkspace(bookId, second.reviewRunId);
      expect(done.run!.state).toBe('settled');
      // Three authored findings, each a 批注 on the manuscript citing the one clause and its revision.
      const findings = done.run!.findings;
      expect(findings).toHaveLength(3);
      expect(findings.every((finding) => finding.output === 'annotation' && finding.anchorState === 'exact' && finding.markId !== null)).toBe(true);
      expect(findings.map((finding) => finding.clauseRefs)).toEqual(Array(3).fill([{ documentTitle: `地点「${J13_PLACE}」`, clauseId: 'series-knowledge/1', text: `地点「${J13_PLACE}」：${J13_EDITOR_WORDS}` }]));
      expect(done.coverage.find((row) => row.categoryId === 'series-consistency')!.state).toBe('current');
      const reviewed = memberState(store, seriesId, bookId);
      expect(reviewed[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
      expect(reviewed[1]).toBeNull();

      // A later revision never alters the frozen Run: its pins, basis and findings stay what it used.
      const pinned = frozenCategory(second.reviewRunId);
      takeInRevision(store, seriesId, itemId, '海边小城的地名以第三部为准。', 'consistency-review');
      expect(frozenCategory(second.reviewRunId)).toEqual(pinned);
      expect((pinned.entry as { seriesKnowledge: { revisions: Array<{ ordinal: number }> } }).seriesKnowledge.revisions.map((revision) => revision.ordinal)).toEqual([2]);
      expect(store.inspectReviewWorkspace(bookId, second.reviewRunId).run!.findings.map((finding) => finding.findingId)).toEqual(findings.map((finding) => finding.findingId));
      expect(category(store, bookId).basisStatement).toContain(`地点「${J13_PLACE}」第 3 版`);
      expect(store.inspectReviewWorkspace(bookId, null).coverage.find((row) => row.categoryId === 'series-consistency')!.state).toBe('current');
    });
  }, 300_000);
});
