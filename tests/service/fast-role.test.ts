import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FastRoleExecutionOwner } from '../../src/service/fast-role/fast-role-execution.js';
import { FastRoleRequests, fastInteractionRoutes } from '../../src/service/fast-role/fast-role-suggestions.js';
import { CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST } from '../../src/service/fast-role/conflict-regenerate-contract.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import type { EditorialPolishProjection, FastInteractionRequestProjection, ProposalConflictRegenerationProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import {
  AUTHORED_POLISH_SUGGESTIONS,
  AUTHORED_REGENERATION,
  CONFLICT_RATIONALE,
  TYPO,
  conflictOf,
  conflictUnitIndex,
  constructSample1Conflict,
  inMemoryFixture,
  polishRequestDigestOf,
  polishSelectionOf,
  regenerationRequestDigestOf,
  typeInto,
  typoBlock,
  unitResult,
  type Sample1Book,
} from '../support/fast-role.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Service-integration suite (L2) for 润色这段 and 稿件冲突 › 基于当前稿件重新生成建议 on the deterministic route (Issue #842):
// the real store, PrimaryAgentHarness composition, Egress Gate and local deterministic adapter under development-ci, answered by
// the authored fixtures `sample1-polish-authored` and `sample1-conflict-regenerate-authored` or by one-entry fixtures held in
// memory. The manuscript is exact `sample1` (ADR 0043); manuscript text is compared by equality only.

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;
let store: EditorialStore;
let book: Sample1Book;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-fast-role-');
  await requireExactSample1(roots.codeRoot);
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  book = await importSample1Book(store, roots.codeRoot, '润色与重新生成');
});

afterEach(async () => {
  try { store.close(); } catch { /* closed by its test */ }
  await roots.dispose();
});

function requests(fixture: ResolvedModelFixture | null): { owner: FastRoleExecutionOwner; requests: FastRoleRequests } {
  const owner = new FastRoleExecutionOwner({ requestGovernor, fixture, live: null });
  return { owner, requests: new FastRoleRequests(owner, store, () => new Date('2026-10-14T00:00:00.000Z')) };
}

function code(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError || (error instanceof Error && 'code' in error)) return (error as { code: string }).code;
    throw error;
  }
  return 'no-error';
}

async function settledPolish(fast: ReturnType<typeof requests>, projection: EditorialPolishProjection): Promise<EditorialPolishProjection> {
  expect(projection.state).toBe('requesting');
  await fast.requests.settled();
  const read = fast.requests.inspect(book.bookId, projection.taskId) as Extract<FastInteractionRequestProjection, { kind: 'editorial-polish' }>;
  expect(read.kind).toBe('editorial-polish');
  return read.polish;
}

async function settledRegeneration(fast: ReturnType<typeof requests>, projection: ProposalConflictRegenerationProjection): Promise<ProposalConflictRegenerationProjection> {
  expect(projection.outcome).toBe('requesting');
  await fast.requests.settled();
  const read = fast.requests.inspect(book.bookId, projection.requestId) as Extract<FastInteractionRequestProjection, { kind: 'conflict-regenerate' }>;
  expect(read.kind).toBe('conflict-regenerate');
  return read.regeneration;
}

function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

describe('the fast-role routes under development-ci', () => {
  it('admits both kinds on the launch fixture and says why not, in the editor\'s words, without one', () => {
    const fixture = inMemoryFixture('fast-role-empty', 'a'.repeat(64), unitResult('{}'));
    expect(fastInteractionRoutes(requests(fixture).owner, book.bookId)).toEqual({
      bookId: book.bookId,
      editorialPolish: { available: true, reason: null },
      conflictRegenerate: { available: true, reason: null },
    });
    const without = requests(null);
    expect(fastInteractionRoutes(without.owner, book.bookId)).toEqual({
      bookId: book.bookId,
      editorialPolish: { available: false, reason: '当前运行范围未允许润色这段：这次启动没有可用的模型。' },
      conflictRegenerate: { available: false, reason: '当前运行范围未允许重新生成建议：这次启动没有可用的模型。' },
    });
    // Refused before anything is recorded or sent.
    expect(code(() => without.requests.polish(book.bookId, { selection: polishSelectionOf(store, book) }))).toBe('FAST_ROLE_ROUTE_UNAVAILABLE');
    expect(withDatabase((database) => database.prepare("SELECT count(*) total FROM editorial_marks WHERE source_kind = 'ai7'").get())).toEqual({ total: 0 });
  });
});

describe('润色这段 on the authored fixture', () => {
  it('places each anchored replacement as an open 修改建议 of the polish task and withholds the one outside the selection', async () => {
    const fast = requests(await loadModelFixture(FIXTURES, 'sample1-polish-authored'));
    const { block } = typoBlock(store, book);
    const projection = await settledPolish(fast, fast.requests.polish(book.bookId, { selection: polishSelectionOf(store, book) }));
    expect(projection).toMatchObject({
      bookId: book.bookId, state: 'suggested', outcomeUnknown: false,
      withheld: [{ ordinal: 3, reason: '摘出的文字不在所选文字中' }],
      label: '已新建 2 条修改建议：它们不会自动应用，是否接受由你决定。另有 1 条建议没有提供。',
    });
    expect(projection.markIds).toHaveLength(2);
    for (const [index, markId] of projection.markIds.entries()) {
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.kind).toBe('change-suggestion');
      expect(card.status).toBe('open');
      // Attributed to the polish task, visibly, like a review-derived mark is to its category.
      expect(card.source).toEqual({ kind: 'ai7', origin: 'task', label: '润色这段', taskId: projection.taskId });
      expect(card.pinnedText).toBe(AUTHORED_POLISH_SUGGESTIONS[index]!.original);
      expect(card.suggestion).toMatchObject({ proposedText: AUTHORED_POLISH_SUGGESTIONS[index]!.replacement, rationale: AUTHORED_POLISH_SUGGESTIONS[index]!.reason });
      expect(card.suggestion!.decision).toBeNull();
    }
    // Nothing is applied: the paragraph is exactly as it was.
    expect(typoBlock(store, book).block.digest).toBe(block.digest);
  });

  it('is reversible like a review-derived mark: 接受并应用 then 撤销本次应用, and a rejection 撤回 to undecided', async () => {
    const fast = requests(await loadModelFixture(FIXTURES, 'sample1-polish-authored'));
    const projection = await settledPolish(fast, fast.requests.polish(book.bookId, { selection: polishSelectionOf(store, book) }));
    const [applyId, rejectId] = projection.markIds as [string, string];
    const original = typoBlock(store, book).block.text;
    const binding = () => ({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: typoBlock(store, book).window.blocks[0]!.blockId });
    // Applied only by the editor's own 接受并应用, through the one Apply path.
    store.applyChangeSuggestion({ ...binding(), markId: applyId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
    expect(typoBlock(store, book).block.text).toBe(original.replace(TYPO, AUTHORED_POLISH_SUGGESTIONS[0].replacement));
    store.reverseAppliedChangeSuggestion({ ...binding(), markId: applyId, clientEffectId: randomUUID() });
    expect(typoBlock(store, book).block.text).toBe(original);
    store.recordChangeSuggestionDecision({ ...binding(), markId: rejectId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: null });
    expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, rejectId).suggestion!.decision!.disposition).toBe('rejected');
    store.recordChangeSuggestionDecision({ ...binding(), markId: rejectId, clientDecisionId: randomUUID(), disposition: 'withdrawn', editedText: null, reason: null });
    const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, rejectId);
    expect(card.status).toBe('open');
    expect(card.suggestion!.decision?.disposition ?? 'withdrawn').toBe('withdrawn');
  });

  it('withholds a suggestion whose words the editor changed while the request was in flight', async () => {
    const fast = requests(await loadModelFixture(FIXTURES, 'sample1-polish-authored'));
    const started = fast.requests.polish(book.bookId, { selection: polishSelectionOf(store, book) });
    // The editor types over the typo before the answer arrives: its suggestion no longer describes the words there.
    const { block } = typoBlock(store, book);
    const at = [...block.text.slice(0, block.text.indexOf(TYPO))].length;
    // As many graphemes as it had, so the second suggestion's words still stand where they were.
    typeInto(store, book, block.blockId, at, at + [...TYPO].length, '〔改过的字〕');
    const projection = await settledPolish(fast, started);
    expect(projection.state).toBe('suggested');
    expect(projection.markIds).toHaveLength(1);
    expect(projection.withheld).toEqual([
      { ordinal: 1, reason: '所选文字已改动，这条建议没有放到稿件上' },
      { ordinal: 3, reason: '摘出的文字不在所选文字中' },
    ]);
  });

  it('refuses a selection the manuscript no longer holds before anything is sent', () => {
    const fast = requests(inMemoryFixture('unused', 'a'.repeat(64), unitResult('{}')));
    const selection = polishSelectionOf(store, book);
    expect(code(() => fast.requests.polish(book.bookId, { selection: { ...selection, selectedText: `${selection.selectedText}多` } }))).toBe('MARK_ANCHOR_CHANGED');
    expect(code(() => fast.requests.polish(book.bookId, { selection: { ...selection, expectedJournalSequence: selection.expectedJournalSequence + 1 } }))).toBe('MARK_BINDING_CHANGED');
    expect(code(() => fast.requests.polish(randomUUID(), { selection }))).toBe('POLISH_SELECTION_INVALID');
  });

  it('withholds an answer outside the contract whole, says nothing to polish plainly, and holds an unknown outcome', async () => {
    const digest = polishRequestDigestOf(store, book);
    const cases: Array<[ResolvedModelFixture, Partial<EditorialPolishProjection>]> = [
      [inMemoryFixture('polish-prose', digest, unitResult('这段可以这样改：……')),
        { state: 'withheld', label: '模型的回答不是约定格式的建议列表；没有新建修改建议。', markIds: [] }],
      [inMemoryFixture('polish-none', digest, unitResult(JSON.stringify({ schema: 'ai7.editorial-polish.result/1', suggestions: [] }))),
        { state: 'nothing-to-suggest', label: '这段文字没有需要润色的地方；没有新建修改建议。', markIds: [] }],
      [inMemoryFixture('polish-unknown', digest, { kind: 'outcome-unknown', message: '回答没有完整传回。' }),
        { state: 'failed', outcomeUnknown: true, markIds: [] }],
    ];
    for (const [fixture, expected] of cases) {
      const fast = requests(fixture);
      const projection = await settledPolish(fast, fast.requests.polish(book.bookId, { selection: polishSelectionOf(store, book) }));
      expect(projection).toMatchObject(expected);
    }
    expect(withDatabase((database) => database.prepare("SELECT count(*) total FROM editorial_marks WHERE source_kind = 'ai7'").get())).toEqual({ total: 0 });
  });
});

describe('基于当前稿件重新生成建议 on the authored fixture', () => {
  it('saves the regenerated words as the conflict unit\'s resolution with its lineage, and the existing path makes the new version', async () => {
    const { markId } = constructSample1Conflict(store, book);
    const before = conflictOf(store, book, markId);
    expect(before.suggestion.rationale).toBe(CONFLICT_RATIONALE);
    const unitIndex = conflictUnitIndex(before);
    const fast = requests(await loadModelFixture(FIXTURES, 'sample1-conflict-regenerate-authored'));
    const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, markId };
    const projection = await settledRegeneration(fast, fast.requests.regenerate({ ...binding, basisDigest: before.basisDigest, unitIndex }));
    expect(projection).toMatchObject({ bookId: book.bookId, markId, unitIndex, outcome: 'drafted', outcomeUnknown: false });
    const after = conflictOf(store, book, markId);
    expect(after.basisDigest).toBe(before.basisDigest);
    expect(after.draft!.resolutions[unitIndex]).toEqual({ resolution: 'edited', text: AUTHORED_REGENERATION });
    expect(after.draft!.regeneration).toEqual({ unitIndex, regeneratedAt: '2026-10-14T00:00:00.000Z' });
    expect(after.draft!.complete).toBe(true);
    // The lineage lives in the draft's canonical JSON only, and its record still verifies.
    const row = withDatabase((database) => database.prepare('SELECT canonical_json, sha256 FROM proposal_conflict_drafts WHERE mark_id = ?').get(markId)) as { canonical_json: string; sha256: string };
    expect(sha256Hex(row.canonical_json)).toBe(row.sha256);
    const record = JSON.parse(row.canonical_json) as { actor: string; regeneration: Record<string, unknown> };
    expect(record.actor).toBe('editor');
    expect(record.regeneration).toEqual({
      schema: 'ai7.proposal-conflict.regeneration/1', kindId: 'conflict-regenerate', contractVersion: 'ai7.conflict-regenerate/1',
      promptContractDigest: CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST, requestDigest: regenerationRequestDigestOf(before, unitIndex), unitIndex,
      route: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture', operationalScope: 'development-ci', policyRuleId: null,
      fixtureSha256: (await loadModelFixture(FIXTURES, 'sample1-conflict-regenerate-authored')).sha256, regeneratedAt: '2026-10-14T00:00:00.000Z',
    });
    expect(canonicalJson(record)).toBe(row.canonical_json);
    // Resolved through the existing path: a new 修改建议 on the current words, not accepted and not applied.
    const resolved = store.resolveProposalConflict({ ...binding, basisDigest: after.basisDigest, outcome: 'new-version', draftOrdinal: after.draft!.ordinal });
    expect(resolved.outcome).toBe('new-version');
    const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, resolved.newMarkId!);
    expect(card.suggestion).toMatchObject({ proposedText: AUTHORED_REGENERATION });
    expect(card.suggestion!.decision).toBeNull();
  });

  it('reports regenerated words identical to the current or the old words instead of offering them', async () => {
    const { markId } = constructSample1Conflict(store, book);
    const conflict = conflictOf(store, book, markId);
    const unitIndex = conflictUnitIndex(conflict);
    const unit = conflict.units[unitIndex]!;
    const digest = regenerationRequestDigestOf(conflict, unitIndex);
    const answer = (text: string) => unitResult(JSON.stringify({ schema: 'ai7.conflict-regenerate.result/1', text }));
    const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, markId, basisDigest: conflict.basisDigest, unitIndex };
    for (const [text, outcome] of [[unit.current, 'same-as-current'], [unit.proposed, 'same-as-proposed']] as const) {
      const fast = requests(inMemoryFixture(`regenerate-${outcome}`, digest, answer(text)));
      expect((await settledRegeneration(fast, fast.requests.regenerate(binding))).outcome).toBe(outcome);
    }
    const fast = requests(inMemoryFixture('regenerate-prose', digest, unitResult('可以改成另一种说法。')));
    expect(await settledRegeneration(fast, fast.requests.regenerate(binding))).toMatchObject({
      outcome: 'withheld', label: '模型的回答不是约定格式的建议文字；没有改动解决草稿。',
    });
    const unknown = requests(inMemoryFixture('regenerate-unknown', digest, { kind: 'outcome-unknown', message: '回答没有完整传回。' }));
    expect(await settledRegeneration(unknown, unknown.requests.regenerate(binding))).toMatchObject({ outcome: 'failed', outcomeUnknown: true });
    // None of them saved a draft.
    expect(conflictOf(store, book, markId).draft).toBeNull();
  });

  it('refuses a unit that is not a conflict, a stale basis, and a draft whose paragraph moved while the request was in flight', async () => {
    const { markId, blockId } = constructSample1Conflict(store, book);
    const conflict = conflictOf(store, book, markId);
    const unitIndex = conflictUnitIndex(conflict);
    const fast = requests(await loadModelFixture(FIXTURES, 'sample1-conflict-regenerate-authored'));
    const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, markId };
    const other = conflict.units.findIndex((unit) => unit.kind !== 'conflict');
    if (other !== -1) expect(code(() => fast.requests.regenerate({ ...binding, basisDigest: conflict.basisDigest, unitIndex: other }))).toBe('PROPOSAL_CONFLICT_UNIT_INVALID');
    expect(code(() => fast.requests.regenerate({ ...binding, basisDigest: conflict.basisDigest, unitIndex: conflict.units.length }))).toBe('PROPOSAL_CONFLICT_UNIT_INVALID');
    expect(code(() => fast.requests.regenerate({ ...binding, basisDigest: 'f'.repeat(64), unitIndex }))).toBe('PROPOSAL_CONFLICT_STALE');
    const started = fast.requests.regenerate({ ...binding, basisDigest: conflict.basisDigest, unitIndex });
    // The editor types elsewhere in the paragraph before the answer arrives: the comparison it was asked on is gone.
    typeInto(store, book, blockId, 0, 0, '〔前〕');
    expect(await settledRegeneration(fast, started)).toMatchObject({ outcome: 'failed', label: '稿件在重新生成期间又有改动；没有改动解决草稿，请重新比较后再试。' });
    expect(conflictOf(store, book, markId).draft).toBeNull();
  });
});

describe('the recorded Go captures, replayed through the real path (provider-free)', () => {
  it('places the recorded polish suggestions and drafts the recorded regeneration, nothing applied', async () => {
    const polishFixture = await loadModelFixture(FIXTURES, 'sample1-recorded-v41-polish');
    expect([...polishFixture.entries.values()][0]!.capture).toMatchObject({ subject: 'editorial-polish', itemId: 'S30/editorial-polish/1', model: 'deepseek-v4.1-flash' });
    const polishing = requests(polishFixture);
    const { block } = typoBlock(store, book);
    const polished = await settledPolish(polishing, polishing.requests.polish(book.bookId, { selection: polishSelectionOf(store, book) }));
    expect(polished).toMatchObject({ state: 'suggested', withheld: [], outcomeUnknown: false });
    expect(polished.markIds).toHaveLength(3);
    for (const markId of polished.markIds) {
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
      expect(card.source).toEqual({ kind: 'ai7', origin: 'task', label: '润色这段', taskId: polished.taskId });
      expect(card.suggestion!.decision).toBeNull();
    }
    expect(typoBlock(store, book).block.digest).toBe(block.digest);
    const regenerateFixture = await loadModelFixture(FIXTURES, 'sample1-recorded-v41-conflict-regenerate');
    const { markId } = constructSample1Conflict(store, book);
    const conflict = conflictOf(store, book, markId);
    const unitIndex = conflictUnitIndex(conflict);
    const regenerating = requests(regenerateFixture);
    const regenerated = await settledRegeneration(regenerating, regenerating.requests.regenerate({
      manuscriptId: book.manuscriptId, branchId: book.branchId, markId, basisDigest: conflict.basisDigest, unitIndex,
    }));
    expect(regenerated.outcome).toBe('drafted');
    const recorded = JSON.parse(([...regenerateFixture.entries.values()][0]!.response as { text: string }).text) as { text: string };
    expect(conflictOf(store, book, markId).draft!.resolutions[unitIndex]).toEqual({ resolution: 'edited', text: recorded.text });
  });
});
