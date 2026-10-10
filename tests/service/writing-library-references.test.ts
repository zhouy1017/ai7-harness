import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import type { TaskPlanConnectivity } from '../../src/service/connectivity.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { MATERIAL_INDEX_TRIGGER_SQL } from '../../src/service/material-index.js';
import { LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { WRITING_MATERIAL_GONE_LABEL, writingMaterialCopyNotDo, writingMaterialReferenceLine } from '../../src/service/task-plan.js';
import {
  WRITING_MATERIALS_NONE,
  WRITING_MATERIALS_STATEMENT,
  WRITING_MATERIALS_TOO_MANY,
  WRITING_QUICK_START_MATERIALS,
  WRITING_RULE_MATERIALS,
  writingMaterialDigest,
  writingMaterialMoved,
  writingMaterialOverBound,
  writingMaterialOverBoundNamed,
  writingMaterialUnavailable,
  writingMaterialsOverTotal,
} from '../../src/service/writing-tasks.js';
import { WRITING_PROMPT_CONTRACT_SCHEMA_V3, writingContract, writingContractDigest } from '../../src/service/writing/writing-contract.js';
import { WRITING_MATERIAL_REFUSAL_PREFIX } from '../../src/service/writing/writing-kind.js';
import {
  WRITING_LIVE_UNAVAILABLE,
  WRITING_MATERIAL_LIVE_UNAVAILABLE,
  type LaunchPolicyProjection,
  type LibraryMaterialKind,
  type LibraryMaterialProjection,
  type WritingProjection,
} from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  AUTHORED_LIBRARY_DRAFT,
  AUTHORED_WRITING_DRAFT,
  WRITING_BOOK_TITLE,
  WRITING_FIXTURE_IDENTITY,
  WRITING_LIBRARY_FILE,
  WRITING_LIBRARY_PARAGRAPHS,
  WRITING_LIBRARY_REQUEST,
  WRITING_LIBRARY_TEXT,
  WRITING_LIBRARY_TITLE,
  WRITING_REQUEST,
  answerWriting,
  answerWritingReflection,
} from '../support/writing-task.js';

/** How many characters J-07's 资料库 item's index extracts: what its box and its plan line say (`e2e/run-j07.mjs` pins the same). */
const J07_LIBRARY_CHARACTERS = 85;

// Service-integration suite (L2) for 写作任务's 允许参考 of 资料库 items (Issue #428; V2-UX-TASK-030, TASK-032, KB-007, KB-009):
// the writing kind over the real store, the Material Index, the one execution owner and the AI7 local deterministic adapter,
// answered from an in-memory fixture built over the authored passages for each contract a case asks. The manuscript is exact
// `sample1` (ADR 0043); every 资料库 file is the suite's own synthetic words, never a manuscript. No Provider, socket or credential
// value is involved.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const { schema: _schema, ...DRAFT_WORDS } = AUTHORED_WRITING_DRAFT;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-writing-library-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

interface Session {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
}

async function withSession(fixture: ResolvedModelFixture, body: (session: Session) => Promise<void>): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    await body({ store, owner });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** One in-memory fixture over the authored writing fixture, answered here for each contract a case asks. */
async function memoryFixture(): Promise<{ fixture: ResolvedModelFixture; entries: Map<string, ModelFixtureEntry> }> {
  const base = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
  const entries = new Map<string, ModelFixtureEntry>(base.entries);
  const fixture: ResolvedModelFixture = { ...base, identity: 'sample1-writing-library-l2', lineage: [{ identity: 'sample1-writing-library-l2', sha256: 'e'.repeat(64) }], sha256: 'f'.repeat(64), entries };
  return { fixture, entries };
}

async function sample1Book(store: EditorialStore, title: string): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  if (store.getModelServiceConnection() === null) recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

function emptyBook(store: EditorialStore, title: string): string {
  const creation = store.prepareBookCreation(title, null);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

function file(name: string, content: string): string {
  const directory = join(roots.inputRoot, 'library-writing');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

async function put(store: EditorialStore, name: string, content: string, title: string, kind: LibraryMaterialKind = 'document'): Promise<LibraryMaterialProjection> {
  const preview = await store.previewLibraryMaterial(file(name, content));
  return store.addLibraryMaterial({ previewId: preview.previewId, title, kind });
}

/** 定归属 and 定学习准入 as the card records them. */
function decide(store: EditorialStore, materialId: string, attribution: { scope: 'book'; bookId: string } | { scope: 'house' }, choice: 'book' | 'house' | 'excluded' | 'deferred'): void {
  store.decideLibraryMaterial({ materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution } });
  store.decideLibraryMaterial({ materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice, reason: null } });
}

/** Synthetic words with no repeated run: `length` distinct ideographs from `from` on, in a scattered order, a full stop every 40. */
function synthetic(length: number, from: number): string {
  return Array.from({ length }, (_, index) => `${String.fromCodePoint(from + ((index * 37) % 2000))}${index % 40 === 39 ? '。' : ''}`).join('');
}

/** A text of `characters` characters as the index counts them, in paragraphs within the intake's 2,048-grapheme bound. */
function sized(characters: number, from: number): string {
  const full = Array.from(synthetic(characters, from)).slice(0, characters);
  const paragraphs: string[] = [];
  for (let at = 0; at < full.length; at += 1_500) paragraphs.push(full.slice(at, at + 1_500).join(''));
  return paragraphs.join('\n\n');
}

/** 资料库's item the suite's 写作任务 references: two paragraphs of the suite's own words. */
const LISTED_TEXT = '这份资料记录了一座古城在战火中保存青铜器的经过，馆员连夜把器物装箱转移。\n\n转移途中遭遇暴雨，木箱浸水，修复工作持续了三年。';
const LISTED_PARAGRAPHS = ['这份资料记录了一座古城在战火中保存青铜器的经过，馆员连夜把器物装箱转移。', '转移途中遭遇暴雨，木箱浸水，修复工作持续了三年。'];

function prepare(store: EditorialStore, bookId: string, request: Parameters<EditorialStore['createWritingPreparationWork']>[1]): WritingProjection {
  let progress = store.createWritingPreparationWork(bookId, request, launchPolicy);
  while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  return progress.projection!;
}

async function run(session: Session, bookId: string, prepared: WritingProjection): Promise<WritingProjection> {
  const authorized = session.store.authorizeWriting(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(session.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await session.owner.whenIdle();
  return session.store.inspectWriting(bookId)!;
}

const storePath = (): string => join(roots.dataRoot, 'store', 'ai7.sqlite');

function withDatabase<T>(operation: (database: DatabaseSync) => T, readOnly = true): T {
  const database = new DatabaseSync(storePath(), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

/** The Material Index's rows: what no writing Task may add to or take from. */
function indexRows(): string {
  return withDatabase((database) => JSON.stringify([
    database.prepare('SELECT index_id, sha256 FROM material_index_builds ORDER BY index_id').all(),
    (database.prepare('SELECT count(*) AS count FROM material_index_segments').get() as { count: number }).count,
  ]));
}

/** What another connection sees change: SQLite's data version moves whenever any other connection commits. */
function watcher(): { changed(): boolean; close(): void } {
  const database = new DatabaseSync(storePath(), { readOnly: true });
  const version = (): number => (database.prepare('PRAGMA data_version').get() as { data_version: number }).data_version;
  const before = version();
  return { changed: () => version() !== before, close: () => database.close() };
}

const LIVE = {
  operationalScope: 'developer-live',
  live: {
    route: 'opencode-go',
    model: 'deepseek-v4-flash',
    endpoint: 'https://example.invalid/v1',
    credentialSlot: 'opencode-go',
    credentialReference: randomUUID(),
    runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 },
  },
} as const;

const ONLINE = (): { credentialReadiness: () => Promise<null>; connectivity: TaskPlanConnectivity } => ({
  credentialReadiness: async () => null,
  connectivity: { reading: () => 'online', reachesNetwork: (routeKind) => routeKind === LOCAL_DETERMINISTIC_ROUTE, slotBusy: () => false },
});

describe('写作任务 lists 资料库 items under 允许参考 and reads them through the Material Index', () => {
  it('drafts J-07\'s 评论文章 with its 资料库 item from the authored fixture, as the Journey\'s last Task', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
    await withSession(fixture, async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      // J-07's 宣传文章 first, so the 评论文章 drafts again as it does there.
      expect((await run(session, bookId, prepare(store, bookId, WRITING_REQUEST))).state).toBe('settled');
      const material = await put(store, WRITING_LIBRARY_FILE, WRITING_LIBRARY_TEXT, WRITING_LIBRARY_TITLE);
      decide(store, material.materialId, { scope: 'book', bookId }, 'book');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const offer = store.inspectWritingTask(bookId).references.materials;
      expect(offer.items).toEqual([{ materialId: material.materialId, title: WRITING_LIBRARY_TITLE, characters: J07_LIBRARY_CHARACTERS, scope: 'book', selectable: true, reason: null }]);
      const prepared = prepare(store, bookId, { ...WRITING_LIBRARY_REQUEST, materialIds: [material.materialId] });
      expect(prepared.taskIntent!.mode).toBe('writing-again');
      const plan = store.inspectTaskPlan({ bookId, kind: 'writing', ref: prepared.taskIntent!.taskIntentId });
      expect(plan.scope.reference[3]).toBe(`资料库资料《${WRITING_LIBRARY_TITLE}》：已提取 ${J07_LIBRARY_CHARACTERS} 字，按计划冻结的索引版本读取（只参照，不照抄）`);
      const settled = await run(session, bookId, prepared);
      const { schema: _draftSchema, ...libraryWords } = AUTHORED_LIBRARY_DRAFT;
      expect(settled.state).toBe('settled');
      expect(settled.resultSetRevision!.writing.synthesis).toEqual({ state: 'closed', reason: null });
      expect(settled.resultSetRevision!.writing.draft).toEqual(libraryWords);
      expect(settled.taskOutcome!.report!.ifRedone.state).toBe('closed');
      expect(store.inspectWritingTask(bookId).types.find((type) => type.typeId === 'review-article')!.drafted).toMatchObject({ revisionId: settled.resultSetRevision!.revisionId });
      // The items' paragraphs as the contract took them: the file's two paragraphs, whole.
      expect(writingMaterialDigest(WRITING_LIBRARY_PARAGRAPHS)).toBe(withDatabase((database) =>
        (JSON.parse((database.prepare('SELECT canonical_json FROM writing_tasks WHERE task_intent_id = ?').get(prepared.taskIntent!.taskIntentId) as { canonical_json: string }).canonical_json) as { materialSources: Array<{ sha256: string }> }).materialSources[0]!.sha256));
    });
  }, 300_000);

  it('offers only the Book\'s eligible indexed items, pins the ticked ones, reads them at the pinned build and drafts under `/3`', async () => {
    const { fixture, entries } = await memoryFixture();
    let bookId = '';
    let before = '';
    await withSession(fixture, async (session) => {
      const { store } = session;
      bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      const otherBook = emptyBook(store, '另一本书');
      // Seven items: the one the Task lists, one of the house, one long, one of middling length, one of another Book, one whose
      // eligibility is left for later, one with no decision, and one whose text no reader of AI7 extracts.
      const listed = await put(store, '参考资料甲.txt', LISTED_TEXT, '参考资料甲');
      const house = await put(store, '社级资料.txt', sized(2_990, 0x5000), '社级资料');
      const middle = await put(store, '中等资料.txt', sized(2_990, 0x6000), '中等资料');
      const long = await put(store, '长资料.txt', sized(3_500, 0x7000), '长资料');
      const others = await put(store, '别的书的资料.txt', sized(200, 0x8000), '别的书的资料');
      const deferred = await put(store, '待定资料.txt', sized(200, 0x8400), '待定资料');
      await put(store, '没定归属.txt', sized(200, 0x8800), '没定归属');
      // A scan whose text no admitted dependency reads (a web page was this item until Issue #428 read HTML).
      const scan = await put(store, '扫描件.pdf', '%PDF-1.4\n% synthetic test bytes, not a real document\n', '扫描件资料');
      decide(store, listed.materialId, { scope: 'book', bookId }, 'book');
      decide(store, house.materialId, { scope: 'house' }, 'excluded');
      decide(store, middle.materialId, { scope: 'book', bookId }, 'book');
      decide(store, long.materialId, { scope: 'book', bookId }, 'book');
      decide(store, others.materialId, { scope: 'book', bookId: otherBook }, 'book');
      decide(store, deferred.materialId, { scope: 'book', bookId }, 'deferred');
      decide(store, scan.materialId, { scope: 'book', bookId }, 'book');

      // Before any index is built, nothing has extracted text: nothing is offered, and the row says what an item needs.
      expect(store.inspectWritingTask(bookId).references.materials).toEqual({ statement: WRITING_MATERIALS_NONE, items: [], more: 0 });
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(scan.materialId).index.state).toBe('unsupported');

      // Offered: this Book's and the house's items whose index extracted text; the long one shown, disabled, with why.
      const offer = store.inspectWritingTask(bookId).references.materials;
      expect(offer.statement).toBe(WRITING_MATERIALS_STATEMENT);
      expect(offer.more).toBe(0);
      expect([...offer.items].sort((left, right) => left.title.localeCompare(right.title))).toEqual([
        { materialId: listed.materialId, title: '参考资料甲', characters: 60, scope: 'book', selectable: true, reason: null },
        { materialId: middle.materialId, title: '中等资料', characters: 2_990, scope: 'book', selectable: true, reason: null },
        { materialId: long.materialId, title: '长资料', characters: 3_500, scope: 'book', selectable: false, reason: writingMaterialOverBound(3_500) },
        { materialId: house.materialId, title: '社级资料', characters: 2_990, scope: 'house', selectable: true, reason: null },
      ].sort((left, right) => left.title.localeCompare(right.title)));
      expect(offer.items.map((item) => item.materialId)).not.toContain(others.materialId);
      expect(offer.items.map((item) => item.materialId)).not.toContain(deferred.materialId);
      // The other Book is offered its own item and the house's, never this Book's.
      expect(store.inspectWritingTask(otherBook).references.materials.items.map((item) => item.title).sort()).toEqual(['别的书的资料', '社级资料'].sort());

      // 先看计划 refuses what a plan may not list, in words, and records nothing.
      const news = { typeId: 'news-release', audience: '媒体记者', channel: '新闻通稿', requirements: null };
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: [others.materialId] })))
        .toBe('MATERIAL_REFERENCE_UNAVAILABLE:资料《别的书的资料》：这份资料还不能列进这本书任务的「允许参考」。');
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: [deferred.materialId] })))
        .toBe('MATERIAL_REFERENCE_UNAVAILABLE:资料《待定资料》：这份资料还不能列进这本书任务的「允许参考」。');
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: [scan.materialId] })))
        .toBe('MATERIAL_INDEX_NO_TEXT:资料《扫描件资料》：这份资料没有提取出可分段的文字。');
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: [long.materialId] })))
        .toBe(`WRITING_MATERIAL_OVER_BOUND:${writingMaterialOverBoundNamed('长资料', 3_500)}`);
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: [listed.materialId, house.materialId, middle.materialId] })))
        .toBe(`WRITING_MATERIAL_OVER_BOUND:${writingMaterialsOverTotal(60 + 2_990 + 2_990)}`);
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: [listed.materialId, house.materialId, middle.materialId, long.materialId, others.materialId] })))
        .toBe(`WRITING_MATERIALS_INVALID:${WRITING_MATERIALS_TOO_MANY}`);
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: [listed.materialId, listed.materialId] }))).toBe('WRITING_INVALID:写作任务参数无效。');
      expect(await refusal(() => prepare(store, bookId, { ...news, materialIds: ['not-an-id'] }))).toBe('WRITING_INVALID:写作任务参数无效。');
      expect(withDatabase((database) => (database.prepare('SELECT count(*) AS count FROM writing_tasks').get() as { count: number }).count)).toBe(0);

      // Ticked: the listed item and the house's, each pinned at its build; the plan lists them under 允许参考.
      const indexBefore = indexRows();
      const prepared = prepare(store, bookId, { ...news, materialIds: [listed.materialId, house.materialId] });
      const listedDigest = store.inspectLibraryMaterial(listed.materialId).index.digest!;
      const houseDigest = store.inspectLibraryMaterial(house.materialId).index.digest!;
      const plan = store.inspectTaskPlan({ bookId, kind: 'writing', ref: prepared.taskIntent!.taskIntentId });
      const sources = [
        { materialId: listed.materialId, indexDigest: listedDigest, title: '参考资料甲', characters: 60, sha256: writingMaterialDigest(LISTED_PARAGRAPHS) },
        { materialId: house.materialId, indexDigest: houseDigest, title: '社级资料', characters: 2_990, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) },
      ];
      expect(plan.scope.reference.slice(3, 5)).toEqual([
        writingMaterialReferenceLine({ source: { ...sources[0]!, sha256: '' }, refusal: null }),
        writingMaterialReferenceLine({ source: { ...sources[1]!, sha256: '' }, refusal: null }),
      ]);
      expect(plan.scope.reference[3]).toBe('资料库资料《参考资料甲》：已提取 60 字，按计划冻结的索引版本读取（只参照，不照抄）');
      expect(plan.notDo.editorial).toContain(writingMaterialCopyNotDo());
      expect(plan.technical.find((row) => row.key === 'material-references')?.value)
        .toBe(`《参考资料甲》 · ${listed.materialId} · 索引版本 ${listedDigest}；《社级资料》 · ${house.materialId} · 索引版本 ${houseDigest}`);
      expect(plan.start.readiness).toBe('ready');
      // A rule binds no 资料库 item: a plan that lists one sets none (TASK-023, TASK-026).
      expect(plan.defaultRule).toMatchObject({ canSet: false, reason: WRITING_RULE_MATERIALS });
      // The frozen contract is `/3`, its words the items' paragraphs read at the pins.
      const contract = writingContract({
        type: { typeId: 'news-release', label: '新闻稿' },
        book: { title: WRITING_BOOK_TITLE, authors: [], editors: [], series: [] },
        audience: '媒体记者', channel: '新闻通稿', requirements: null, synopsis: null, evaluation: null, exemplars: [],
        materials: [
          { title: '参考资料甲', paragraphs: LISTED_PARAGRAPHS },
          { title: '社级资料', paragraphs: sized(2_990, 0x5000).split('\n\n') },
        ],
      });
      expect(contract.schema).toBe(WRITING_PROMPT_CONTRACT_SCHEMA_V3);
      expect(prepared.planEnvelope!.promptContractDigest).toBe(writingContractDigest(contract));
      // The Task's row names the items by reference and pins their words by digest; their words are never stored there.
      const row = withDatabase((database) => database.prepare('SELECT canonical_json FROM writing_tasks').get() as { canonical_json: string });
      const stored = JSON.parse(row.canonical_json) as { materialSources: unknown; input: { materials: unknown } };
      expect(stored.materialSources).toEqual(sources);
      expect(stored.input.materials).toEqual([]);
      expect(row.canonical_json).not.toContain('青铜器');

      // Reading the plan and the page again reads the items through the index's Task seam and commits nothing.
      const watch = watcher();
      try {
        store.inspectWritingTask(bookId);
        store.inspectTaskPlan({ bookId, kind: 'writing', ref: prepared.taskIntent!.taskIntentId });
        expect(watch.changed()).toBe(false);
      } finally {
        watch.close();
      }

      // 开始任务: the Run reads the eight ranges and writes the draft under the fixture route; the index is as it was.
      answerWriting(entries, prepared, AUTHORED_WRITING_DRAFT);
      const settled = await run(session, bookId, prepared);
      expect(settled.state).toBe('settled');
      expect(settled.resultSetRevision!.writing.synthesis).toEqual({ state: 'closed', reason: null });
      expect(settled.resultSetRevision!.writing.draft).toEqual(DRAFT_WORDS);
      expect(indexRows()).toBe(indexBefore);
      expect(store.inspectWritingTask(bookId).types.find((type) => type.typeId === 'news-release')!.drafted).toMatchObject({ revisionId: settled.resultSetRevision!.revisionId });
      before = JSON.stringify(store.inspectWritingTask(bookId));
    });
    // A restart reads the Task's items again through the index at their pins, and nothing moves.
    await withSession(fixture, async ({ store }) => {
      expect(JSON.stringify(store.inspectWritingTask(bookId))).toBe(before);
    });
  }, 300_000);

  it('refuses a draft that copies an item, and a start whose pinned build is gone or whose item may no longer be listed — 改计划重做 pins it again', async () => {
    const { fixture, entries } = await memoryFixture();
    let bookId = '';
    let listedId = '';
    let taskIntentId = '';
    let planEnvelopeDigest = '';
    await withSession(fixture, async (session) => {
      const { store } = session;
      bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      const listed = await put(store, '参考资料甲.txt', LISTED_TEXT, '参考资料甲');
      listedId = listed.materialId;
      decide(store, listed.materialId, { scope: 'book', bookId }, 'book');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();

      // A draft that copies twelve characters of the item is refused whole under the 范例's rules: a gap with its own reason.
      const copying = prepare(store, bookId, { ...WRITING_REQUEST, materialIds: [listed.materialId] });
      answerWriting(entries, copying, {
        ...AUTHORED_WRITING_DRAFT,
        sections: [...AUTHORED_WRITING_DRAFT.sections, { heading: '资料里的一段', paragraphs: ['正如资料所写：在战火中保存青铜器的经过。'] }],
      });
      const refused = await run(session, bookId, copying);
      answerWritingReflection(entries, refused.taskOutcome!.report!.accountingDigest);
      expect(refused.resultSetRevision!.writing.draft).toBeNull();
      expect(refused.resultSetRevision!.writing.synthesis).toEqual({
        state: 'gap',
        reason: `${WRITING_MATERIAL_REFUSAL_PREFIX}草稿与资料库资料《参考资料甲》有连续 12 个字以上相同；资料只参照，不复制，这份草稿不予采用。`,
      });
      expect(refused.taskOutcome!.classification).toBe('completed-with-gaps');
      expect(store.inspectWritingTask(bookId).task!.refusal).toBe(refused.resultSetRevision!.writing.synthesis.reason);

      // The next Task lists it too, and is left prepared.
      const next = prepare(store, bookId, { ...WRITING_REQUEST, requirements: '再写一版', materialIds: [listed.materialId] });
      taskIntentId = next.taskIntent!.taskIntentId;
      planEnvelopeDigest = next.planEnvelope!.digest;

      // The item may no longer be listed by this Book's Tasks: the start is refused in words naming it and 改计划重做.
      store.decideLibraryMaterial({ materialId: listed.materialId, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      const unavailable = store.inspectWritingTask(bookId).task!;
      expect([unavailable.label, unavailable.refusal]).toEqual([WRITING_MATERIAL_GONE_LABEL, writingMaterialUnavailable('参考资料甲')]);
      expect(await refusal(() => store.authorizeWriting(bookId, taskIntentId, planEnvelopeDigest)))
        .toBe(`MATERIAL_REFERENCE_UNAVAILABLE:${writingMaterialUnavailable('参考资料甲')}`);
      store.decideLibraryMaterial({ materialId: listed.materialId, expectedDecisions: 3, decision: { kind: 'eligibility', choice: 'book', reason: null } });
      expect(store.inspectTaskPlan({ bookId, kind: 'writing', ref: taskIntentId }).start.readiness).toBe('ready');
    });

    // The build the plan pinned is gone — as data replaced or merged from elsewhere loses it, the index being rebuilt there.
    withDatabase((database) => {
      for (const name of Object.keys(MATERIAL_INDEX_TRIGGER_SQL)) database.exec(`DROP TRIGGER ${name}`);
      database.prepare('DELETE FROM material_index_segments WHERE index_id IN (SELECT index_id FROM material_index_builds WHERE material_id = ?)').run(listedId);
      database.prepare('DELETE FROM material_index_builds WHERE material_id = ?').run(listedId);
      for (const sql of Object.values(MATERIAL_INDEX_TRIGGER_SQL)) database.exec(sql);
    }, false);

    await withSession(fixture, async (session) => {
      const { store } = session;
      // Built again here: another build, another digest — never the one the plan froze.
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const rebuilt = store.inspectLibraryMaterial(listedId).index.digest!;
      const page = store.inspectWritingTask(bookId).task!;
      expect([page.label, page.refusal]).toEqual([WRITING_MATERIAL_GONE_LABEL, writingMaterialMoved('参考资料甲')]);
      const plan = store.inspectTaskPlan({ bookId, kind: 'writing', ref: taskIntentId });
      expect(plan.state.label).toBe(WRITING_MATERIAL_GONE_LABEL);
      expect(plan.start).toMatchObject({ readiness: 'unavailable', planEnvelopeDigest: null, unavailableReason: writingMaterialMoved('参考资料甲') });
      expect(plan.scope.reference[3]).toBe('资料库资料《参考资料甲》：已提取 60 字，按计划冻结的索引版本读取（只参照，不照抄）——计划冻结的索引版本已不在本机，这次起草不能开始');
      expect(await refusal(() => store.authorizeWriting(bookId, taskIntentId, planEnvelopeDigest))).toBe(`MATERIAL_INDEX_MOVED:${writingMaterialMoved('参考资料甲')}`);
      // 改计划重做: the plan prepared again pins the item as it is now, and runs.
      const redone = prepare(store, bookId, { ...WRITING_REQUEST, requirements: '再写一版', materialIds: [listedId] });
      // The same words at another build are the same contract: the redone plan is a Task of its own, never the gone one revised.
      expect(redone.taskIntent!.taskIntentId).not.toBe(taskIntentId);
      expect(store.inspectWritingTask(bookId).task).toMatchObject({ taskIntentId: redone.taskIntent!.taskIntentId, state: 'prepared', refusal: null });
      expect(store.inspectTaskPlan({ bookId, kind: 'writing', ref: redone.taskIntent!.taskIntentId }).technical.find((row) => row.key === 'material-references')?.value)
        .toBe(`《参考资料甲》 · ${listedId} · 索引版本 ${rebuilt}`);
      answerWriting(entries, redone, AUTHORED_WRITING_DRAFT);
      expect((await run(session, bookId, redone)).resultSetRevision!.writing.draft).toEqual(DRAFT_WORDS);
    });
  }, 300_000);

  it('refuses 资料库 items under developer-live in their own words, and never starts a plan that lists one under a 默认执行规则', async () => {
    const { fixture, entries } = await memoryFixture();
    await withSession(fixture, async (session) => {
      const { store } = session;
      const bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      const listed = await put(store, '参考资料甲.txt', LISTED_TEXT, '参考资料甲');
      decide(store, listed.materialId, { scope: 'book', bookId }, 'book');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();

      // The 宣传文章's rule, set from a plan that lists nothing.
      const plain = prepare(store, bookId, WRITING_REQUEST);
      answerWriting(entries, plain, AUTHORED_WRITING_DRAFT);
      const settled = await run(session, bookId, plain);
      answerWritingReflection(entries, settled.taskOutcome!.report!.accountingDigest);
      const rule = store.setDefaultExecutionRule(bookId, plain.taskIntent!.taskIntentId, plain.planEnvelope!.digest);
      // 快速开始 with an item ticked prepares the Task as 先看计划 does, and stops at its plan with why.
      const listing = prepare(store, bookId, { ...WRITING_REQUEST, materialIds: [listed.materialId] });
      expect(await store.quickStartWritingTask(bookId, listing.taskIntent!.taskIntentId, listing.planEnvelope!.digest, rule.ruleVersionId, ONLINE()))
        .toEqual({ outcome: 'fell-back', reasons: [WRITING_QUICK_START_MATERIALS], dispatchRunRecordId: null, ledger: null });
      expect(store.inspectWriting(bookId)!.authorization).toBeNull();

      // Developer-live admits only the Owner-designated Public SampleBooks: no 资料库 item is offered, prepared or started there.
      const free = store.baselineAnalysisLedger.launch;
      store.baselineAnalysisLedger.bindLaunch(LIVE);
      try {
        const live = store.inspectWritingTask(bookId);
        expect(live.unavailable).toBe(WRITING_LIVE_UNAVAILABLE);
        expect(live.references.materials.statement).toBe(WRITING_MATERIAL_LIVE_UNAVAILABLE);
        expect(live.references.materials.items).toEqual([
          { materialId: listed.materialId, title: '参考资料甲', characters: 60, scope: 'book', selectable: false, reason: WRITING_MATERIAL_LIVE_UNAVAILABLE },
        ]);
        expect(await refusal(() => prepare(store, bookId, { ...WRITING_REQUEST, materialIds: [listed.materialId] })))
          .toBe(`WRITING_UNAVAILABLE:${WRITING_MATERIAL_LIVE_UNAVAILABLE}`);
        expect(await refusal(() => store.authorizeWriting(bookId, listing.taskIntent!.taskIntentId, listing.planEnvelope!.digest)))
          .toBe(`WRITING_UNAVAILABLE:${WRITING_MATERIAL_LIVE_UNAVAILABLE}`);
        // A plan that lists none is refused as every writing plan is there.
        expect(await refusal(() => prepare(store, bookId, WRITING_REQUEST))).toBe(`WRITING_UNAVAILABLE:${WRITING_LIVE_UNAVAILABLE}`);
      } finally {
        store.baselineAnalysisLedger.bindLaunch(free);
      }
      expect(store.inspectTaskPlan({ bookId, kind: 'writing', ref: listing.taskIntent!.taskIntentId }).start.readiness).toBe('ready');
    });
  }, 300_000);
});
