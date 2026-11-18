import type { CreateEditorialMemoryInput } from '../../../../src/shared/protocol.js';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { EditorialLearningLedger } from '../../../../src/service/learning/ledger.js';
import { HouseReviewPreferenceLedger, HousePreferenceInfluence } from '../../../../src/service/house-review-preference.js';
import { SupervisionDirectives } from '../../../../src/service/learning/supervision-directives.js';
import { memoryDomainFixture } from '../../../support/domain/memory-source-projection.js';
const open: Array<Awaited<ReturnType<typeof memoryDomainFixture>>> = [];
async function sourceDecisions() { const fixture = await memoryDomainFixture(); open.push(fixture); return fixture; }
afterEach(() => { for (const fixture of open.splice(0)) fixture.db.close(); });

it('refuses an over-bound memory title inside the owner before anything is appended', async () => {
  const { db, subject, signals, make, create, accept } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成标题界限。')));
  const items = subject.inspectGlobalAgent().items;
  const pin = { itemId: memory.itemId, revisionId: memory.versionId };
  const versions = () => Number(db.prepare('SELECT count(*) n FROM global_editorial_memory_item_versions').get()!.n);
  const before = versions();
  db.exec('BEGIN IMMEDIATE');
  try {
    const directive = new SupervisionDirectives(db).record('ordinary-production', { actionId: randomUUID(), operation: 'correct', targets: [pin],
      scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '合'.repeat(170), effect: 'guide' }, items);
    expect(() => new EditorialLearningLedger(db).govern(directive, [pin])).toThrow();
    expect(versions()).toBe(before);
  } finally { db.exec('ROLLBACK'); }
});

it('refuses a line-breaking memory title before the candidate is written', async () => {
  const { subject, signals, create, inspect } = await sourceDecisions();
  const count = inspect().items.length;
  expect(() => subject.createEditorialMemory(create([signals[0]!.signalId], '合成第一行\n合成第二行'))).toThrow();
  expect(inspect().items).toHaveLength(count);
});

it('keeps Book-restricted memory in its source Book and refuses promotion, cross-category creation and incompatible merge', async () => {
  const { db, subject, book, signals, make, create, accept, govern, current, inspect } = await sourceDecisions();
  const signal = signals[2]!;
  const material = subject.inspectLearningMaterial(book.bookId, signal.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0, choice: 'book', note: null });
  expect(() => make(create([signal.signalId], '不能提升为本社记忆。'))).toThrow();
  const local = accept(make({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(), signalIds: [signal.signalId],
    applicability: { kind: 'book', bookId: book.bookId }, title: '仅在来源图书中参考。', editorialDimension: 'typos-and-usage', confidence: 0.5 }));
  expect(() => govern([local], 'correct', '不能改为本社适用。')).toThrow();
  expect(current(local.itemId).applicability).toEqual({ kind: 'book', bookId: book.bookId });
  const house = accept(make(create([signals[0]!.signalId], '独立本社记忆。')));
  expect(() => govern([local, house], 'merge', '不能合并并提升范围。')).toThrow();
  const count = inspect().items.length;
  const input = create([signals[0]!.signalId], '不能猜测另一个编辑类别。');
  expect(() => subject.createEditorialMemory({ ...input, editorialDimension: 'style-and-format' })).toThrow();
  expect(inspect().items).toHaveLength(count);
  const ledger = new HouseReviewPreferenceLedger(db);
  expect(ledger.use('ordinary-production', book.bookId, 'typos-and-usage')!.lines).toContain(local.title);
  expect(ledger.use('ordinary-production', randomUUID(), 'typos-and-usage')!.lines).not.toContain(local.title);
});

it('reads one scope\'s preference influence only, never another scope\'s local pins', async () => {
  const { db, signals, make, create, accept, prepare } = await sourceDecisions();
  accept(make(create([signals[0]!.signalId], '只属于本范围的合成记忆。')));
  prepare();
  expect(new HousePreferenceInfluence(db, 'ordinary-production').pins.length).toBeGreaterThan(0);
  expect(new HousePreferenceInfluence(db, 'developer-live').pins).toEqual([]);
  expect(new HousePreferenceInfluence(db, 'development-ci').pins).toEqual([]);
});

it('stops a prepared /2 pin of legacy lines at learning-off or Book exclusion, exactly as a /1 pin stops', async () => {
  const { db, subject, book, signals, make, create, accept, govern, current, prepare } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '冻结后只留旧版偏好。')));
  govern([current(memory.itemId)], 'supervise', '冻结这条合成记忆。', 'freeze');
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.schema).toBe('ai7.house-review-preference/2');
  expect(published.lines.length).toBeGreaterThan(0);
  expect(published.lines.every((line) => line.owner?.kind === 'legacy-preference')).toBe(true);
  const task = prepare().categories.find((entry) => entry.categoryId === 'typos-and-usage')!.taskIntentId!;
  const ledger = new HouseReviewPreferenceLedger(db);
  expect(ledger.pinned(task)!.versionId).toBe(published.versionId);
  expect(ledger.governanceChanged(task, () => [])).toBe(false);
  subject.changeEditorialLearning({ kind: 'switch', enabled: false, expectedEntries: 0 });
  expect(ledger.governanceChanged(task, () => [])).toBe(true);
  // A legacy line's own basis is its admitting decision: as for the #1116 /1 regression, re-enabling makes it usable again.
  subject.changeEditorialLearning({ kind: 'switch', enabled: true, expectedEntries: 1 });
  expect(ledger.governanceChanged(task, () => [])).toBe(false);
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 2 });
  expect(ledger.governanceChanged(task, () => [])).toBe(true);
});

it('keeps no-growth governance usable while derived lines yield to memory lines, and still refuses added text past the bound', async () => {
  const { db, subject, book, signals, make, create, accept, govern, current, seedPreferences } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '合成保留记忆。')));
  const preference = (text: string) => subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
    categoryId: 'style-and-format', text, effect: 'guide' });
  seedPreferences(Array.from({ length: 63 }, (_, index) => `合成偏好${index}`));
  const other = subject.inspectLearningMaterial(book.bookId, signals[3]!.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: other.materialKey, materialDigest: other.digest, expectedDecisions: 0, choice: 'book', note: null });
  const trimmed = subject.inspectHouseReviewPreference().current!;
  expect(trimmed.legacyBasis!.lines).toHaveLength(2);
  expect(trimmed.lines).toHaveLength(64);
  expect(trimmed.lines.some((line) => line.owner?.kind === 'editorial-memory' && line.owner.itemId === memory.itemId)).toBe(true);
  expect(trimmed.lines.some((line) => line.bookId === book.bookId)).toBe(false);
  govern([current(memory.itemId)], 'supervise', '只记录方向，不加文字。', 'guide');
  const legacy = subject.inspectGlobalAgent().items.find((entry) => entry.kind === 'preference' && entry.categoryId === 'style-and-format')!;
  subject.recordLearningSupervision({ operation: 'supervise', targets: [{ itemId: legacy.itemId, revisionId: legacy.revisionId }], scope: { kind: 'house' },
    categoryId: 'style-and-format', text: '旧版条目也只记录方向。', effect: 'guide' });
  expect(subject.inspectHouseReviewPreference().current!.lines.map((line) => line.text)).toEqual(trimmed.lines.map((line) => line.text));
  const before = subject.inspectHouseReviewPreference().current!.versionId;
  expect(() => preference('超出界限的合成偏好')).toThrow(/64/u);
  expect(subject.inspectHouseReviewPreference().current!.versionId).toBe(before);
});

it('ranks a /2 version\'s legacy lines by their /1 dating, not by array position', async () => {
  const { db, subject, book, signals, make, create, accept, govern, current } = await sourceDecisions();
  const memory = accept(make(create([signals[0]!.signalId], '冻结后仍保持 /2。')));
  govern([current(memory.itemId)], 'supervise', '冻结这条合成记忆。', 'freeze');
  const newer = Array.from({ length: 15 }, (_, index) => `合成新偏好${index + 1}`);
  for (const text of newer) subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text, effect: 'guide' });
  const published = subject.inspectHouseReviewPreference().current!;
  expect(published.schema).toBe('ai7.house-review-preference/2');
  expect(published.lines.find((line) => line.owner?.kind === 'legacy-preference' && line.owner.itemId.startsWith('preference:'))!.categoryId).toBe('typos-and-usage');
  // The derived line dates from its older admitting decision, as in /1; the fifteen newer editor lines take the Top-15.
  const used = new HouseReviewPreferenceLedger(db).use('ordinary-production', book.bookId, 'typos-and-usage')!;
  expect([...used.lines].sort()).toEqual([...newer].sort());
});

it('reserves capacity for still-active memories across a Book exclusion, refuses only the overflowing admission and restores without a second accept', async () => {
  const { subject, book, signals, make, create, accept, current, govern, sourceBook, seedActiveMemories } = await sourceDecisions();
  const fromA = seedActiveMemories(Array.from({ length: 59 }, (_, index) => create([signals[0]!.signalId], `合成甲${index}`)));
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: true, expectedEntries: 0 });
  const other = await sourceBook('合成第二来源');
  const fromB = (title: string): CreateEditorialMemoryInput => ({ schema: 'ai7.global-editorial-memory/2', actionId: randomUUID(),
    signalIds: [other.signals[0]!.signalId], applicability: { kind: 'house' }, title, editorialDimension: 'typos-and-usage', confidence: 0.6 });
  const b = Array.from({ length: 5 }, (_, index) => accept(make(fromB(`合成乙${index}`))));
  expect(subject.inspectHouseReviewPreference().current!.lines.filter((line) => line.owner?.kind === 'editorial-memory')).toHaveLength(5);
  const sixth = make(fromB('合成乙5'));
  const before = { preference: subject.inspectHouseReviewPreference().current!.versionId, history: subject.inspectHouseReviewPreference().history.length };
  expect(() => accept(sixth)).toThrow(/64 条/u);
  expect(current(sixth.itemId)).toMatchObject({ versionId: sixth.versionId, state: 'proposed' });
  expect(subject.inspectHouseReviewPreference()).toMatchObject({ current: { versionId: before.preference } });
  expect(subject.inspectHouseReviewPreference().history).toHaveLength(before.history);
  // A merge counts its successor once; freezing or deactivating an owner releases its place.
  const merged = govern([b[0]!, b[1]!], 'merge', '合成乙合并');
  expect(merged.items.filter((entry) => entry.kind === 'memory' && entry.state === 'active')).toHaveLength(63);
  accept(sixth);
  expect(() => accept(make(fromB('合成乙6')))).toThrow(/64 条/u);
  govern([b[2]!], 'supervise', '冻结一条合成记忆。', 'freeze');
  const seventh = accept(make(fromB('合成乙7')));
  const stop = current(b[3]!.itemId);
  subject.deactivateEditorialMemory({ itemId: stop.itemId, expectedVersionId: stop.versionId, actionId: randomUUID() });
  accept(make(fromB('合成乙8')));
  subject.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: 1 });
  const restored = subject.inspectHouseReviewPreference().current!;
  expect(restored.lines).toHaveLength(64);
  expect(restored.lines.every((line) => line.owner?.kind === 'editorial-memory')).toBe(true);
  for (const memory of [...fromA, seventh]) expect(current(memory.itemId).versionId).toBe(memory.versionId);
  expect(fromA.every((memory) => restored.lines.some((line) => line.owner?.itemId === memory.itemId))).toBe(true);
});

it('reserves a line for an excluded legacy correction beside sixty-four memories, and freezing the correction releases it', async () => {
  const { subject, book, signals, explicit, make, create, accept, seedActiveMemories } = await sourceDecisions();
  const legacyItem = () => subject.inspectGlobalAgent().items.find((entry) => entry.kind === 'preference' && entry.categoryId === 'typos-and-usage')!;
  const item = legacyItem();
  subject.recordLearningSupervision({ operation: 'correct', targets: [{ itemId: item.itemId, revisionId: item.revisionId }], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '合成更正的旧版偏好', effect: 'guide' });
  const material = () => subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'excluded', note: null });
  const other = signals.find((entry) => entry.signalId !== explicit.signalId)!;
  seedActiveMemories(Array.from({ length: 63 }, (_, index) => create([other.signalId], `合成记忆${index}`)));
  const twelfth = make(create([other.signalId], '合成记忆11'));
  expect(() => accept(twelfth)).toThrow(/64 条/u);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'house', note: null });
  expect(subject.inspectHouseReviewPreference().current!.lines).toHaveLength(64);
  const corrected = legacyItem();
  subject.recordLearningSupervision({ operation: 'supervise', targets: [{ itemId: corrected.itemId, revisionId: corrected.revisionId }], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '冻结更正。', effect: 'freeze' });
  accept(twelfth);
  expect(subject.inspectHouseReviewPreference().current!.lines.filter((line) => line.owner?.kind === 'editorial-memory')).toHaveLength(64);
});

it('counts a legacy merge over an excluded derived parent once, and its deactivation releases the place', async () => {
  const { subject, book, signals, explicit, make, create, accept, seedPreferences } = await sourceDecisions();
  const legacy = () => subject.inspectGlobalAgent().items.filter((entry) => entry.kind === 'preference' && entry.categoryId === 'typos-and-usage' && entry.state === 'active');
  subject.recordLearningSupervision({ operation: 'create', targets: [], scope: { kind: 'house' }, categoryId: 'typos-and-usage', text: '合'.repeat(40), effect: 'guide' });
  seedPreferences(Array.from({ length: 5 }, (_, index) => String(index) + '留'.repeat(1159)));
  const parents = legacy();
  expect(parents).toHaveLength(2);
  subject.recordLearningSupervision({ operation: 'merge', targets: parents.map(({ itemId, revisionId }) => ({ itemId, revisionId })), scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '并'.repeat(100), effect: 'guide' });
  const material = () => subject.inspectLearningMaterial(book.bookId, explicit.source.materialKey);
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'excluded', note: null });
  expect(legacy()).toEqual([]);
  const other = signals.find((entry) => entry.signalId !== explicit.signalId)!;
  expect(() => accept(make(create([other.signalId], '乙'.repeat(101))))).toThrow(/6,000 字/u);
  const fitting = accept(make(create([other.signalId], '乙'.repeat(100))));
  subject.decideLearningMaterial({ bookId: book.bookId, materialKey: material().materialKey, materialDigest: material().digest, expectedDecisions: material().decisions, choice: 'house', note: null });
  expect(subject.inspectHouseReviewPreference().current!.lines.filter((line) => line.categoryId === 'typos-and-usage').map((line) => line.text).sort()).toEqual(['并'.repeat(100), '乙'.repeat(100)].sort());
  const merged = legacy()[0]!;
  subject.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: merged.itemId, revisionId: merged.revisionId }], scope: { kind: 'house' },
    categoryId: 'typos-and-usage', text: '', effect: 'guide' });
  accept(make(create([other.signalId], '丙'.repeat(100))));
  expect(subject.inspectHouseReviewPreference().current!.lines.filter((line) => line.owner?.kind === 'editorial-memory').map((line) => line.owner!.itemId))
    .toContain(fitting.itemId);
});
