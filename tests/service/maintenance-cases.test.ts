import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAINTENANCE_CASE_SCHEMA_SQL } from '../../src/service/maintenance-cases.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { MAINTENANCE_CASE_SCHEMA_VERSION, PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  MAINTENANCE_CONCLUDED,
  MAINTENANCE_FORBIDDEN_COMPLETIONS,
  MAINTENANCE_INTERNAL_ONLY,
  MAINTENANCE_RECORDED,
} from '../../src/shared/maintenance-wording.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import { PUBLICATION_FORBIDDEN_WORDS, type MaintenanceCaseResultProjection } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for ⑥ 维护事项 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011, ADR 0040) over the
// real `EditorialStore` on a temporary Agent Data Root. The manuscript is composed from the one admitted SampleBook; the
// words written here are authored neutral phrases, and no assertion reads manuscript text back.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 12, title: '维护组稿' };
const LEDGER = Object.keys(MAINTENANCE_CASE_SCHEMA_SQL);

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** A 修改建议 on the first paragraph long enough for it, made now. */
function suggest(store: EditorialStore, book: Imported): string {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 12)!;
  return store.createEditorialMark({
    ...book,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: 2,
    toGrapheme: 6,
    selectedText: graphemesOf(block.text).slice(2, 6).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText: '〔更正后的文字〕',
    rationale: null,
  }).markId;
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function counts(): Record<string, number> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return Object.fromEntries(LEDGER.map((table) => [table, (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total]));
  } finally {
    database.close();
  }
}

/** No answer says a text was corrected and published, withdrawn, taken down, recalled or reissued (MAINT-011). */
function expectOnlyInternalWords(result: MaintenanceCaseResultProjection): void {
  const words = JSON.stringify(result).replaceAll(MAINTENANCE_INTERNAL_ONLY, '');
  for (const forbidden of [...MAINTENANCE_FORBIDDEN_COMPLETIONS, ...PUBLICATION_FORBIDDEN_WORDS]) expect(words).not.toContain(forbidden);
}

describe('⑥ 维护事项 (S68a)', () => {
  it('records each classification on one exact 发稿版本, appends every step and rewrites nothing', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let bookId: string;
    let deliverablesBefore: string;
    let errataCaseId: string;
    let errataBefore: string;
    try {
      const book = await importBook(store);
      bookId = book.bookId;
      const first = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
      const a = store.designatePublicationVersion({ bookId, milestoneId: first.milestoneId, scope: '纸质版首印', basis: '三审通过' }).publicationVersionId;
      const record = (classification: 'correction' | 'errata' | 'supersession' | 'withdrawal' | 'reissue' | 'archive', target: string, reason = '读者来信指出第三段有误') =>
        store.recordMaintenanceCase({ bookId, publicationVersionId: target, classification, reason, evidence: null });
      const step = (caseId: string, expectedRevision: number, stepInput: Parameters<EditorialStore['appendMaintenanceCaseRevision']>[0]['step']) =>
        store.appendMaintenanceCaseRevision({ bookId, caseId, expectedRevision, step: stepInput });

      // What a draft needs: a classification, a reason within its bound, and a designation of this Book.
      expect(code(() => record('errata', a, '   '))).toBe('MAINTENANCE_REASON_INVALID');
      expect(code(() => record('errata', a, '由'.repeat(501)))).toBe('MAINTENANCE_REASON_INVALID');
      expect(code(() => record('corrigendum' as 'errata', a))).toBe('MAINTENANCE_INVALID');
      expect(code(() => record('errata', randomUUID()))).toBe('MAINTENANCE_TARGET_NOT_FOUND');
      expect(code(() => store.recordMaintenanceCase({ bookId, publicationVersionId: a, classification: 'errata', reason: '有误', evidence: '   ' })))
        .toBe('MAINTENANCE_EVIDENCE_INVALID');
      expect(Object.values(counts())).toEqual([0, 0, 0]);

      // 勘误: recorded unresolved, its 勘误 written as versions, then concluded; each step one more revision.
      const errata = record('errata', a);
      expectOnlyInternalWords(errata);
      errataCaseId = errata.maintenanceCase.caseId;
      expect(errata.completion).toBe(MAINTENANCE_RECORDED);
      expect(errata.maintenanceCase).toMatchObject({
        ordinal: 1, classification: 'errata', classificationLabel: '勘误', status: 'unresolved', statusLabel: '未解决', nextStep: 'write-errata',
        internalOnly: null, expectedRevision: 1, errata: null,
        target: { publicationVersionId: a, ordinal: 1, label: '第 1 次 · 「一审稿」 · r1 · 纸质版首印', revisionLabel: 'r1' },
        choices: { proposals: [], publications: [] },
      });
      expect(errata.maintenanceCase.revisions.map((revision) => [revision.revision, revision.step, revision.stepLabel, revision.status, revision.reason, revision.link]))
        .toEqual([[1, 'recorded', '记录维护事项', 'unresolved', '读者来信指出第三段有误', null]]);
      const save = (expectedRevision: number, body: string) => store.saveMaintenanceErrata({ bookId, caseId: errataCaseId, expectedRevision, body });
      expect(code(() => step(errataCaseId, 1, { kind: 'link-proposal', markId: randomUUID() }))).toBe('MAINTENANCE_STEP_INVALID');
      const written = save(1, '第三段「甲」应为「乙」。');
      expect(written.maintenanceCase).toMatchObject({ nextStep: 'conclude', expectedRevision: 2, errata: { version: 1, body: '第三段「甲」应为「乙」。' } });
      expect(written.maintenanceCase.revisions[1]).toMatchObject({ step: 'errata-saved', status: 'unresolved', link: { kind: 'errata', version: 1 } });
      // A version's link names it by its number; its words are the case's newest 勘误 alone, so the answer stays one frame.
      expect(Object.keys(written.maintenanceCase.revisions[1]!.link!).sort()).toEqual(['errataVersionId', 'kind', 'version']);
      expect(code(() => save(2, '第三段「甲」应为「乙」。'))).toBe('MAINTENANCE_ERRATA_UNCHANGED');
      expect(code(() => save(1, '第三段「甲」应为「丙」。'))).toBe('MAINTENANCE_CASE_CHANGED');
      expect(save(2, '第三段「甲」应为「丙」。').maintenanceCase.errata).toMatchObject({ version: 2, body: '第三段「甲」应为「丙」。' });
      const historical = store.inspectMaintenanceCase({ bookId, caseId: errataCaseId,
        errataVersionId: written.maintenanceCase.errata!.errataVersionId });
      expect(historical.inspectedErrata).toMatchObject({ version: 1, body: '第三段「甲」应为「乙」。' });
      expect(historical.errata).toMatchObject({ version: 2, body: '第三段「甲」应为「丙」。' });
      expect(code(() => store.inspectMaintenanceCase({ bookId, caseId: errataCaseId, errataVersionId: randomUUID() }))).toBe('MAINTENANCE_NOT_FOUND');
      expect(code(() => step(errataCaseId, 3, { kind: 'conclude', status: 'complete', outcome: '   ' }))).toBe('MAINTENANCE_REASON_INVALID');
      const concluded = step(errataCaseId, 3, { kind: 'conclude', status: 'complete', outcome: '勘误已写入 AI7 的记录' });
      expectOnlyInternalWords(concluded);
      expect([concluded.completion, concluded.maintenanceCase.status, concluded.maintenanceCase.statusLabel, concluded.maintenanceCase.nextStep])
        .toEqual([MAINTENANCE_CONCLUDED, 'complete', '已完成（AI7 内记录）', null]);
      expect(code(() => save(4, '再改一次'))).toBe('MAINTENANCE_CASE_COMPLETE');
      expect(code(() => step(errataCaseId, 4, { kind: 'conclude', status: 'unresolved', outcome: '重新打开' }))).toBe('MAINTENANCE_CASE_COMPLETE');
      // The first 勘误 version is still there, linked by its own revision.
      expect(concluded.maintenanceCase.revisions.map((revision) => revision.link?.kind === 'errata' ? revision.link.version : null)).toEqual([null, 1, 2, null]);

      // 更正: a 修改建议 made after the designation, then a later designation of the corrected text; neither is made for it.
      const correction = record('correction', a).maintenanceCase;
      expect([correction.status, correction.nextStep, correction.choices.proposals]).toEqual(['unresolved', 'link-proposal', []]);
      const markId = suggest(store, book);
      let inspected = store.inspectMaintenanceCase({ bookId, caseId: correction.caseId });
      expect(inspected.choices.proposals.map((proposal) => [proposal.markId, proposal.stateLabel])).toEqual([[markId, '尚未应用']]);
      expect(inspected.choices.proposals[0]!.label).toMatch(/^修改建议 · 「.+」→「〔更正后的文字〕」$/u);
      expect(code(() => step(correction.caseId, 1, { kind: 'link-proposal', markId: randomUUID() }))).toBe('MAINTENANCE_LINK_INVALID');
      expect(step(correction.caseId, 1, { kind: 'link-proposal', markId }).maintenanceCase)
        .toMatchObject({ nextStep: 'link-publication', expectedRevision: 2, choices: { proposals: [], publications: [] } });
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      store.applyChangeSuggestion({ ...book, windowStartBlockId: window.blocks[0]!.blockId, markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      inspected = store.inspectMaintenanceCase({ bookId, caseId: correction.caseId });
      // The link reads the 修改建议 as it stands now: applied through its own path, not by the case.
      expect(inspected.revisions[1]!.link).toMatchObject({ kind: 'proposal', markId, stateLabel: '已应用' });
      const second = await store.saveMilestone(book.manuscriptId, book.branchId, '更正稿', 'delivery-candidate', null, '');
      const b = store.designatePublicationVersion({ bookId, milestoneId: second.milestoneId, scope: '纸质版二印', basis: '更正后付印' }).publicationVersionId;
      inspected = store.inspectMaintenanceCase({ bookId, caseId: correction.caseId });
      expect(inspected.choices.publications).toEqual([{ publicationVersionId: b, label: '第 2 次 · 「更正稿」 · r2 · 纸质版二印' }]);
      expect(code(() => step(correction.caseId, 2, { kind: 'link-publication', publicationVersionId: a }))).toBe('MAINTENANCE_LINK_INVALID');
      const linked = step(correction.caseId, 2, { kind: 'link-publication', publicationVersionId: b }).maintenanceCase;
      expect([linked.status, linked.nextStep, linked.revisions[2]!.link]).toEqual(['unresolved', 'conclude', { kind: 'publication-version', publicationVersionId: b, label: '第 2 次 · 「更正稿」 · r2 · 纸质版二印' }]);

      // 替代 and 再版 wait for a separately designated version; linking it ends the wait, not the case.
      // Until then they may be concluded 仍未解决, never 已完成 (MAINT-007).
      const supersession = record('supersession', a).maintenanceCase;
      expect([supersession.status, supersession.statusLabel, supersession.nextStep, supersession.conclusions])
        .toEqual(['waiting', '等待另设发稿版本', 'link-publication', ['unresolved']]);
      expect(code(() => step(supersession.caseId, 1, { kind: 'link-proposal', markId }))).toBe('MAINTENANCE_STEP_INVALID');
      expect(code(() => step(supersession.caseId, 1, { kind: 'conclude', status: 'complete', outcome: '已另行处理' }))).toBe('MAINTENANCE_STEP_INVALID');
      expect(step(supersession.caseId, 1, { kind: 'link-publication', publicationVersionId: b }).maintenanceCase)
        .toMatchObject({ status: 'unresolved', nextStep: 'conclude', conclusions: ['unresolved', 'complete'] });
      const reissue = record('reissue', b).maintenanceCase;
      expect([reissue.status, reissue.choices.publications]).toEqual(['waiting', []]);
      const stillWaiting = step(reissue.caseId, 1, { kind: 'conclude', status: 'unresolved', outcome: '另设版本尚未确定' }).maintenanceCase;
      expect([stillWaiting.status, stillWaiting.nextStep, stillWaiting.conclusions]).toEqual(['unresolved', 'link-publication', ['unresolved']]);
      expect(code(() => step(reissue.caseId, 2, { kind: 'conclude', status: 'complete', outcome: '已再版' }))).toBe('MAINTENANCE_STEP_INVALID');

      // 撤回 of the current designation: an internal state at once, said as such; 图书交付包 no longer holds it.
      const withdrawal = record('withdrawal', b, '内容有误，AI7 内不再用于发稿');
      expectOnlyInternalWords(withdrawal);
      expect(withdrawal.maintenanceCase).toMatchObject({ status: 'complete', nextStep: null, internalOnly: MAINTENANCE_INTERNAL_ONLY });
      expect(code(() => record('withdrawal', b))).toBe('MAINTENANCE_ALREADY_RECORDED');
      const publication = store.inspectBookDeliveryPackage(bookId).conditions[0]!;
      expect([publication.met, publication.stateLabel, publication.route]).toEqual([false, '发稿版本「更正稿」 · r2 · 已在 AI7 内撤回', 'publication']);
      expect(store.inspectBookDeliveryPackage(bookId).content.included.some((item) => item.kind === 'publication')).toBe(false);
      // The same milestone, scope and basis again is a new designation, never the withdrawn one repeated.
      const again = store.designatePublicationVersion({ bookId, milestoneId: second.milestoneId, scope: '纸质版二印', basis: '更正后付印' });
      expect(again.outcome).toBe('designated');
      expect(store.inspectBookDeliveryPackage(bookId).conditions[0]!.met).toBe(true);

      // 归档 closes the target's maintenance; its use and history are unchanged.
      const archive = record('archive', a, '这一版的维护到此为止');
      expect(archive.maintenanceCase).toMatchObject({ status: 'complete', internalOnly: MAINTENANCE_INTERNAL_ONLY });
      expect(code(() => record('archive', a))).toBe('MAINTENANCE_ALREADY_RECORDED');

      // 交付物 lists each designation's cases newest first, and the states they set.
      const deliverables = store.inspectDeliverables(bookId);
      const maintenanceOf = (id: string) => deliverables.publication.designations.find((designation) => designation.publicationVersionId === id)!.maintenance;
      expect(maintenanceOf(a)).toMatchObject({ total: 4, withdrawn: false, archived: true });
      expect(maintenanceOf(a).cases.map((entry) => [entry.ordinal, entry.classificationLabel, entry.statusLabel, entry.nextStep, entry.revisions])).toEqual([
        [6, '归档', '已完成（AI7 内记录）', null, 1],
        [3, '替代', '未解决', 'conclude', 2],
        [2, '更正', '未解决', 'conclude', 3],
        [1, '勘误', '已完成（AI7 内记录）', null, 4],
      ]);
      expect(maintenanceOf(b)).toMatchObject({ total: 2, withdrawn: true, archived: false });
      expect(counts()).toEqual({ maintenance_cases: 6, maintenance_errata_versions: 2, maintenance_case_revisions: 13 });
      for (const forbidden of PUBLICATION_FORBIDDEN_WORDS) expect(JSON.stringify(deliverables)).not.toContain(forbidden);
      deliverablesBefore = JSON.stringify(deliverables);
      errataBefore = JSON.stringify(store.inspectMaintenanceCase({ bookId, caseId: errataCaseId }));
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // Every relation is append-only, and a restart reads the cases exactly as they were.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      for (const table of LEDGER) {
        expect(() => database.prepare(`UPDATE ${table} SET canonical_json = '{}'`).run()).toThrow(/MAINTENANCE_LEDGER_IMMUTABLE/);
        expect(() => database.prepare(`DELETE FROM ${table}`).run()).toThrow(/MAINTENANCE_LEDGER_IMMUTABLE/);
      }
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(JSON.stringify(reopened.inspectDeliverables(bookId!))).toBe(deliverablesBefore!);
      expect(JSON.stringify(reopened.inspectMaintenanceCase({ bookId: bookId!, caseId: errataCaseId! }))).toBe(errataBefore!);
      expect(code(() => reopened.inspectMaintenanceCase({ bookId: randomUUID(), caseId: errataCaseId! }))).toBe('MAINTENANCE_NOT_FOUND');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('adds the 维护事项 relations to a revision-42 store empty', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(store);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const planted = new DatabaseSync(path);
    try {
      planted.exec('PRAGMA foreign_keys = OFF');
      planted.exec(`BEGIN IMMEDIATE;
        DROP TABLE maintenance_case_revisions;
        DROP TABLE maintenance_errata_versions;
        DROP TABLE maintenance_cases;
        PRAGMA user_version = ${PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_VERSION};
        COMMIT;`);
      planted.exec('PRAGMA foreign_keys = ON');
    } finally {
      planted.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MAINTENANCE_CASE_SCHEMA_VERSION);
      for (const table of LEDGER) expect((after.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count).toBe(0);
      expect((after.prepare("SELECT count(*) count FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'maintenance_%'").get() as { count: number }).count).toBe(6);
    } finally {
      after.close();
    }
  }, 120_000);

  it('opens every case of a 发稿版本, however many came after it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const { bookId } = book;
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
      const a = store.designatePublicationVersion({ bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' }).publicationVersionId;
      const ids = Array.from({ length: 26 }, (_, index) => store.recordMaintenanceCase({
        bookId, publicationVersionId: a, classification: 'correction', reason: `读者来信第 ${index + 1} 封`, evidence: null,
      }).maintenanceCase.caseId);
      // 交付物 lists the newest five; the oldest is still open and waiting.
      const listed = store.inspectDeliverables(bookId).publication.designations[0]!.maintenance;
      expect([listed.total, listed.cases.map((entry) => entry.ordinal)]).toEqual([26, [26, 25, 24, 23, 22]]);
      // 更早的维护事项… reads the rest a page at a time, newest first, and each case opens.
      const page = store.listMaintenanceCases({ bookId, publicationVersionId: a, beforeOrdinal: 22 });
      expect([page.cases.map((entry) => entry.ordinal), page.more]).toEqual([Array.from({ length: 20 }, (_, index) => 21 - index), true]);
      const last = store.listMaintenanceCases({ bookId, publicationVersionId: a, beforeOrdinal: 2 });
      expect([last.cases.map((entry) => [entry.ordinal, entry.caseId, entry.classificationLabel, entry.statusLabel, entry.nextStep]), last.more])
        .toEqual([[[1, ids[0], '更正', '未解决', 'link-proposal']], false]);
      expect(store.inspectMaintenanceCase({ bookId, caseId: last.cases[0]!.caseId }).revisions[0]!.reason).toBe('读者来信第 1 封');
      expect(store.listMaintenanceCases({ bookId, publicationVersionId: a, beforeOrdinal: 1 })).toEqual({ bookId, publicationVersionId: a, cases: [], more: false });
      // Only a designation of the route's Book, and only an ordinal the ledger could hold.
      expect(code(() => store.listMaintenanceCases({ bookId: randomUUID(), publicationVersionId: a, beforeOrdinal: 22 }))).toBe('MAINTENANCE_TARGET_NOT_FOUND');
      expect(code(() => store.listMaintenanceCases({ bookId, publicationVersionId: a, beforeOrdinal: 0 }))).toBe('MAINTENANCE_INVALID');
      // 关联发稿版本… offers the thirty nearest later designations, so a case's answer stays one frame.
      for (let printing = 2; printing <= 32; printing += 1) {
        store.designatePublicationVersion({ bookId, milestoneId: milestone.milestoneId, scope: `纸质版第 ${printing} 印`, basis: '加印' });
      }
      const offered = store.inspectMaintenanceCase({ bookId, caseId: ids[0]! }).choices.publications;
      expect([offered.length, offered[0]!.label, offered.at(-1)!.label]).toEqual([30, '第 2 次 · 「一审稿」 · r1 · 纸质版第 2 印', '第 31 次 · 「一审稿」 · r1 · 纸质版第 31 印']);
      const choices = store.inspectMaintenanceCase({ bookId, caseId: ids[0]! });
      const later = store.inspectMaintenanceCase({ bookId, caseId: ids[0]!, afterPublicationOrdinal: choices.choices.publicationsAfter! });
      expect(later.choices.publications.map((entry) => entry.label)).toEqual(['第 32 次 · 「一审稿」 · r1 · 纸质版第 32 印']);
      expect(later.choices.publicationsAfter).toBeNull();
      expect(store.appendMaintenanceCaseRevision({ bookId, caseId: ids[0]!, expectedRevision: 1,
        step: { kind: 'link-publication', publicationVersionId: later.choices.publications[0]!.publicationVersionId } }).maintenanceCase.revisions[1]!.link)
        .toMatchObject({ kind: 'publication-version', publicationVersionId: later.choices.publications[0]!.publicationVersionId });
      // A link older than the bounded timeline still governs completion and duplicate refusal.
      let maintained = store.recordMaintenanceCase({ bookId, publicationVersionId: a,
        classification: 'supersession', reason: '等待替代版本', evidence: null }).maintenanceCase;
      const linkedId = offered[0]!.publicationVersionId;
      maintained = store.appendMaintenanceCaseRevision({ bookId, caseId: maintained.caseId, expectedRevision: maintained.expectedRevision,
        step: { kind: 'link-publication', publicationVersionId: linkedId } }).maintenanceCase;
      for (let index = 0; index < 65; index += 1) {
        maintained = store.appendMaintenanceCaseRevision({ bookId, caseId: maintained.caseId, expectedRevision: maintained.expectedRevision,
          step: { kind: 'conclude', status: 'unresolved', outcome: `仍待确认 ${index}` } }).maintenanceCase;
      }
      expect(maintained.revisions).toHaveLength(60);
      expect(maintained.revisionsTotal).toBe(67);
      const olderTimeline = store.inspectMaintenanceCase({ bookId, caseId: maintained.caseId, beforeRevision: maintained.revisionsBefore! });
      expect(olderTimeline.revisions.map((revision) => revision.revision)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(olderTimeline.revisions[0]!.reason).toBe('等待替代版本');
      expect(olderTimeline.revisionsBefore).toBeNull();
      expect(olderTimeline.expectedRevision).toBe(67);
      expect(code(() => store.inspectMaintenanceCase({ bookId, caseId: maintained.caseId, beforeRevision: 0 }))).toBe('MAINTENANCE_INVALID');
      expect(maintained.nextStep).toBe('conclude');
      expect(maintained.choices.publications.some((entry) => entry.publicationVersionId === linkedId)).toBe(false);
      expect(code(() => store.appendMaintenanceCaseRevision({ bookId, caseId: maintained.caseId, expectedRevision: maintained.expectedRevision,
        step: { kind: 'link-publication', publicationVersionId: linkedId } }))).toBe('MAINTENANCE_LINK_INVALID');
      expect(store.appendMaintenanceCaseRevision({ bookId, caseId: maintained.caseId, expectedRevision: maintained.expectedRevision,
        step: { kind: 'conclude', status: 'complete', outcome: '替代已经确认' } }).maintenanceCase.status).toBe('complete');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 180_000);
});
