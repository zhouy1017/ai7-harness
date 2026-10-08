import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL } from '../../src/service/series-exclusions.js';
import { SERIES_CONSISTENCY_UNREADABLE_REASON, resolveSeriesConsistency } from '../../src/service/review/series-consistency.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  MAX_SERIES_EXCLUSION_REASON_CHARACTERS,
  type SeriesExclusionAction,
  type SeriesExclusionTargetInput,
  type SeriesKnowledgeSpanInput,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { joinSeries, takeInNewItem, takeInRevision } from '../support/series-consistency.js';

// Service-integration suite (L2) for 书系检索排除 (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-029; ADR 0037) over the real
// store: 添加检索排除, 修改检索排除 and 停止此排除 as appended revisions behind the four-part impact preview, a stale preview refused,
// the targets a Series may name and those it may not, the current-read guard leaving excluded knowledge out of what 书系一致性
// would read — by item, by class and by the member Book it was taken from — a Source Version recorded and read by nothing, the
// ledger refusing to be rewritten, and a record that no longer reads making only 书系一致性 unavailable. The manuscripts are
// composed from the one admitted SampleBook and never printed.

const MEMBER: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 24, title: '星河之一' };
const OUTSIDER: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 30, blocks: 24, title: '书系之外' };

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-series-exclusions-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore, excerpt: ComposedManuscriptRequest): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, excerpt);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** The first six graphemes of the first paragraph long enough, as the editor would select them in the window. */
function span(store: EditorialStore, book: Imported): SeriesKnowledgeSpanInput {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 20)!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: 0,
    toGrapheme: 6,
    selectedText: graphemesOf(block.text).slice(0, 6).join(''),
  };
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

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function request(seriesId: string, action: SeriesExclusionAction, input: { target?: SeriesExclusionTargetInput; exclusionId?: string; reason?: string }) {
  return { seriesId, action, exclusionId: input.exclusionId ?? null, target: input.target ?? null, reason: input.reason ?? '' };
}

/** One revision recorded against its own preview. */
function exclude(store: EditorialStore, seriesId: string, action: SeriesExclusionAction, input: { target?: SeriesExclusionTargetInput; exclusionId?: string; reason?: string }) {
  const asked = request(seriesId, action, input);
  const preview = store.previewSeriesExclusion(asked);
  return store.recordSeriesExclusion({ ...asked, previewDigest: preview.previewDigest });
}

/**
 * The knowledge 书系一致性 would read for a Book now, by document title, or why it reads none: its own reader over the store's
 * database, since 审阅 itself opens only for exact `sample1`, which `series-exclusion-runs.test.ts` drives.
 */
function readable(_store: EditorialStore, bookId: string): string[] | string {
  const database = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    const resolution = resolveSeriesConsistency(database, bookId);
    return resolution.kind === 'available' ? resolution.documents.map((document) => document.title) : resolution.reason;
  } finally {
    database.close();
  }
}

describe('书系检索排除 over the real store', () => {
  it('appends 添加, 修改 and 停止 as revisions behind the preview, and refuses what a Series cannot name', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const member = await importBook(store, MEMBER);
      const outsider = await importBook(store, OUTSIDER);
      const seriesId = store.createSeries({ title: '星河三部曲', note: '' }).seriesId;
      joinSeries(store, seriesId, member.bookId);
      const itemId = takeInNewItem(store, seriesId, { subject: '海边小城', knowledgeClass: 'places', content: '海边小城的地名以第一部为准。', reuseScope: 'series-tasks' });
      expect(store.inspectSeries(seriesId).exclusions).toEqual({ effective: [], history: [], historyCount: 0, historyNext: null });

      // The preview states exact target, scope, effective time, how far it reaches, reason and actor (SER-021), then four groups.
      const preview = store.previewSeriesExclusion(request(seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId }, reason: '  待与\n第一部核对  ' }));
      expect(preview).toMatchObject({
        action: 'add', actionLabel: '添加检索排除', exclusionId: null, reason: '待与 第一部核对',
        target: { kind: 'knowledge-item', id: itemId, label: '书系知识条目「海边小城」（地点）', continuing: '这个条目现在和以后的修订版都一并排除。', read: true },
        scope: '只限书系「星河三部曲」的书系检索', effectiveTime: '记录后立即生效', actor: '本机编辑',
      });
      expect(preview.groups.map((group) => [group.key, group.title])).toEqual([
        ['future-reads', '今后的检索'], ['runs', '已排队、已授权或正在运行的任务'], ['history', '已完成的历史'], ['unaffected', '不受影响的授权'],
      ]);
      expect(preview.groups[0]!.changes).toEqual(['记录后立即生效：以后的书系检索不再读取书系知识条目「海边小城」（地点）。',
        '现在涉及 1 个书系知识条目：「海边小城」。', '这个条目现在和以后的修订版都一并排除。']);
      expect(preview.groups[1]!.unchanged[0]).toBe('现在没有已排队、已授权或正在运行的任务用到这些材料。');
      expect(preview.groups[3]!.unchanged).toContain('只限这个书系的检索：AI7 现在还没有跨项目来源，这条排除也不决定跨项目访问。');
      // Nothing is recorded by a preview.
      expect(store.inspectSeries(seriesId).exclusions.effective).toEqual([]);

      // A preview the knowledge moved past is refused, and read again it commits.
      takeInRevision(store, seriesId, itemId, '海边小城的地名以第二部为准。', 'series-tasks');
      expect(refusal(() => store.recordSeriesExclusion({ ...request(seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId }, reason: '待与 第一部核对' }), previewDigest: preview.previewDigest })))
        .toBe('SERIES_EXCLUSION_PREVIEW_STALE:预览之后，检索排除、书系知识或相关任务有了变化；请重新查看影响，再决定。');
      const added = exclude(store, seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId }, reason: '待与第一部核对' });
      expect([added.completionLabel, added.stoppedRuns, added.revision.revision, added.revision.action]).toEqual(['书系检索排除已生效', 0, 1, 'add']);

      const refused = (input: Parameters<typeof request>[2], action: SeriesExclusionAction = 'add'): string => refusal(() => store.previewSeriesExclusion(request(seriesId, action, input)));
      expect(refused({ target: { kind: 'knowledge-item', id: itemId } })).toBe('SERIES_EXCLUSION_ALREADY:书系知识条目「海边小城」（地点）已经排除在书系「星河三部曲」的检索之外。');
      expect(refused({ target: { kind: 'knowledge-item', id: randomUUID() } })).toBe('SERIES_EXCLUSION_TARGET_NOT_FOUND:书系「星河三部曲」没有这个书系知识条目。');
      expect(refused({ target: { kind: 'knowledge-class', id: 'weather' } })).toBe('SERIES_EXCLUSION_TARGET_NOT_FOUND:没有这个知识类别。');
      expect(refused({ target: { kind: 'book', id: outsider.bookId } })).toBe('SERIES_EXCLUSION_NOT_MEMBER:《书系之外》不在书系「星河三部曲」中；检索排除只针对这个书系的成员图书。');
      expect(refused({ target: { kind: 'knowledge-item', id: itemId }, reason: '长'.repeat(MAX_SERIES_EXCLUSION_REASON_CHARACTERS + 1) }))
        .toBe(`SERIES_EXCLUSION_REASON_INVALID:排除理由最多 ${MAX_SERIES_EXCLUSION_REASON_CHARACTERS} 个字，写在一行里。`);
      const outsiderSource = (() => {
        const db = new DatabaseSync(databasePath(), { readOnly: true });
        try {
          return (db.prepare('SELECT source_version_id FROM source_versions WHERE book_id = ?').get(outsider.bookId) as { source_version_id: string }).source_version_id;
        } finally {
          db.close();
        }
      })();
      expect(refused({ target: { kind: 'source-version', id: outsiderSource } })).toBe('SERIES_EXCLUSION_NOT_MEMBER:《书系之外》不在书系「星河三部曲」中；检索排除只针对这个书系成员图书的来源版本。');

      // 修改检索排除 changes the reason alone; the same reason again is no change.
      const exclusionId = added.exclusionId;
      expect(refused({ exclusionId, reason: '待与第一部核对' }, 'change')).toBe('SERIES_EXCLUSION_UNCHANGED:排除理由没有变化。');
      const changed = exclude(store, seriesId, 'change', { exclusionId, reason: '' });
      expect([changed.completionLabel, changed.revision.revision, changed.revision.reason]).toEqual(['检索排除已修改', 2, '']);
      expect(store.inspectSeries(seriesId).exclusions.effective).toEqual([expect.objectContaining({ exclusionId, reason: '', revision: 2, effectiveSince: added.revision.recordedAt })]);
      // 停止此排除 ends it; nothing more supersedes an ended one, and the same target may be excluded anew.
      const ended = exclude(store, seriesId, 'end', { exclusionId });
      expect([ended.completionLabel, ended.revision.revision]).toEqual(['已停止此排除', 3]);
      expect(refused({ exclusionId }, 'end')).toBe('SERIES_EXCLUSION_ENDED:这条检索排除已经停止；以后的检索已经可以读取它。');
      expect(refused({ exclusionId: randomUUID() }, 'end')).toBe('SERIES_EXCLUSION_NOT_FOUND:这条检索排除不存在。');
      const again = exclude(store, seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId } });
      expect(again.exclusionId).not.toBe(exclusionId);

      // Every revision is kept, newest first, with the impact it showed (SER-020).
      const { exclusions } = store.inspectSeries(seriesId);
      expect(exclusions.history.map((revision) => [revision.actionLabel, revision.revision])).toEqual([
        ['添加检索排除', 1], ['停止此排除', 3], ['修改检索排除', 2], ['添加检索排除', 1],
      ]);
      expect(exclusions.historyCount).toBe(4);
      expect(exclusions.history.every((revision) => revision.impact.length === 4 && revision.actor === '本机编辑')).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // Across a restart the ledger reads the same, and refuses to be rewritten.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const series = reopened.inspectSeriesList().series[0]!;
      expect(reopened.inspectSeries(series.seriesId).exclusions.historyCount).toBe(4);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(databasePath());
    try {
      expect(() => database.exec("UPDATE series_retrieval_exclusions SET reason = '改过'")).toThrowError(/SERIES_EXCLUSION_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM series_retrieval_exclusions')).toThrowError(/SERIES_EXCLUSION_LEDGER_IMMUTABLE/u);
    } finally {
      database.close();
    }
  }, 300_000);

  it('leaves what an exclusion reaches out of what 书系一致性 reads — by item, by class and by the member Book — and nothing for a Source Version', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const member = await importBook(store, MEMBER);
      const other = await importBook(store, OUTSIDER);
      const seriesId = store.createSeries({ title: '星河三部曲', note: '' }).seriesId;
      joinSeries(store, seriesId, member.bookId);
      joinSeries(store, seriesId, other.bookId);
      const place = takeInNewItem(store, seriesId, { subject: '海边小城', knowledgeClass: 'places', content: '海边小城的地名以第一部为准。', reuseScope: 'series-tasks' });
      takeInNewItem(store, seriesId, { subject: '旧港', knowledgeClass: 'places', content: '旧港只在第二部出现。', reuseScope: 'consistency-review' });
      takeInNewItem(store, seriesId, { subject: '林默', knowledgeClass: 'characters', content: '林默的年龄以第一部为准。', reuseScope: 'series-tasks' });
      // One item taken from the other member's manuscript.
      const cited = store.proposeSeriesKnowledge({ seriesId, target: { kind: 'new', subject: '灯塔', knowledgeClass: 'canon' }, content: '灯塔在第一章就已熄灭。', span: span(store, other) });
      const review = store.inspectSeriesKnowledgeReview({ seriesId, candidateId: cited.candidateId });
      store.promoteSeriesKnowledge({ seriesId, candidateId: cited.candidateId, candidateVersion: 1, reviewDigest: review.reviewDigest, reuseScope: 'series-tasks',
        conflictDisposition: review.conflictCount === 0 ? 'none' : 'preserved' });
      expect(readable(store, member.bookId)).toEqual(['地点「旧港」', '人物「林默」', '地点「海边小城」', '正典设定「灯塔」']);

      // The targets a Series may name, a page per kind, each saying whether it is excluded already.
      const items = store.inspectSeriesExclusionTargets({ seriesId, kind: 'knowledge-item', after: null });
      expect(items.targets.map((target) => [target.label, target.excluded])).toEqual([
        ['书系知识条目「旧港」（地点）', false], ['书系知识条目「林默」（人物）', false], ['书系知识条目「海边小城」（地点）', false], ['书系知识条目「灯塔」（正典设定）', false],
      ]);
      expect(store.inspectSeriesExclusionTargets({ seriesId, kind: 'knowledge-class', after: null }).targets).toHaveLength(8);
      expect(store.inspectSeriesExclusionTargets({ seriesId, kind: 'book', after: null }).targets.map((target) => target.label).sort()).toEqual(['成员图书《书系之外》', '成员图书《星河之一》']);
      const sources = store.inspectSeriesExclusionTargets({ seriesId, kind: 'source-version', after: null }).targets;
      expect(sources).toHaveLength(2);
      expect(sources.every((target) => !target.read && target.continuing === '只排除这一个来源版本，不包括这本书以后的来源版本。')).toBe(true);

      exclude(store, seriesId, 'add', { target: { kind: 'knowledge-item', id: place } });
      expect(readable(store, member.bookId)).toEqual(['地点「旧港」', '人物「林默」', '正典设定「灯塔」']);
      expect(store.inspectSeriesExclusionTargets({ seriesId, kind: 'knowledge-item', after: null }).targets.filter((target) => target.excluded).map((target) => target.id)).toEqual([place]);
      // A class reaches every item of it, now and later.
      const placesPreview = store.previewSeriesExclusion(request(seriesId, 'add', { target: { kind: 'knowledge-class', id: 'places' } }));
      expect(placesPreview.groups[0]!.changes[1]).toBe('现在涉及 2 个书系知识条目：「旧港」、「海边小城」。');
      exclude(store, seriesId, 'add', { target: { kind: 'knowledge-class', id: 'places' } });
      expect(readable(store, member.bookId)).toEqual(['人物「林默」', '正典设定「灯塔」']);
      takeInNewItem(store, seriesId, { subject: '渔村', knowledgeClass: 'places', content: '渔村在第三部改名。', reuseScope: 'series-tasks' });
      expect(readable(store, member.bookId)).toEqual(['人物「林默」', '正典设定「灯塔」']);
      // A member Book reaches the knowledge taken from its manuscript, and not the editor's own words.
      exclude(store, seriesId, 'add', { target: { kind: 'book', id: other.bookId } });
      expect(readable(store, member.bookId)).toEqual(['人物「林默」']);
      // A Source Version is recorded so the ledger is whole, and no read reaches one: nothing more is left out.
      const sourceExclusion = exclude(store, seriesId, 'add', { target: { kind: 'source-version', id: sources[0]!.id } });
      expect(sourceExclusion.revision.target.read).toBe(false);
      expect(readable(store, member.bookId)).toEqual(['人物「林默」']);
      // The last one excluded, the review has nothing left, and says why.
      exclude(store, seriesId, 'add', { target: { kind: 'knowledge-class', id: 'characters' } });
      expect(readable(store, member.bookId)).toBe('书系「星河三部曲」可用于一致性审阅的书系知识都已排除在书系检索之外；停止排除或纳入其他书系知识后才能选。');
      // Ending one restores later reads of what it alone reached.
      const characters = store.inspectSeries(seriesId).exclusions.effective.find((entry) => entry.target.kind === 'knowledge-class' && entry.target.id === 'characters')!;
      exclude(store, seriesId, 'end', { exclusionId: characters.exclusionId });
      expect(readable(store, member.bookId)).toEqual(['人物「林默」']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('makes only 书系一致性 unavailable when an exclusion record no longer reads', async () => {
    let bookId = '';
    {
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        bookId = (await importBook(store, MEMBER)).bookId;
        const seriesId = store.createSeries({ title: '星河三部曲', note: '' }).seriesId;
        joinSeries(store, seriesId, bookId);
        takeInNewItem(store, seriesId, { subject: '海边小城', knowledgeClass: 'places', content: '海边小城的地名以第一部为准。', reuseScope: 'series-tasks' });
        exclude(store, seriesId, 'add', { target: { kind: 'knowledge-class', id: 'characters' }, reason: '人物另审' });
        expect(readable(store, bookId)).toEqual(['地点「海边小城」']);
        store.markCleanShutdown();
      } finally {
        store.close();
      }
    }
    // A revision rewritten beside the closed store, with a digest that matches: it no longer agrees with its own row.
    const database = new DatabaseSync(databasePath());
    try {
      database.exec('DROP TRIGGER series_retrieval_exclusions_no_update');
      const row = database.prepare('SELECT revision_id, canonical_json FROM series_retrieval_exclusions').get() as { revision_id: string; canonical_json: string };
      const record = JSON.parse(row.canonical_json) as Record<string, unknown>;
      const rewritten = canonicalRecord({ ...record, target: { ...(record.target as object), id: 'places' } });
      database.prepare('UPDATE series_retrieval_exclusions SET canonical_json = ?, sha256 = ? WHERE revision_id = ?').run(rewritten.json, rewritten.digest, row.revision_id);
      database.exec(SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL.series_retrieval_exclusions_no_update!);
    } finally {
      database.close();
    }
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(readable(store, bookId)).toBe(SERIES_CONSISTENCY_UNREADABLE_REASON);
      // Every other read of the Book stands: its own Series page lists it as before.
      expect(store.inspectBookSeries(bookId).memberships).toHaveLength(1);
      const seriesId = store.inspectSeriesList().series[0]!.seriesId;
      expect(refusal(() => store.inspectSeries(seriesId))).toBe('SERIES_EXCLUSION_RECORD_INVALID:书系检索排除记录已损坏。');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});
