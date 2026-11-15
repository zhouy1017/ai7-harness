import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { aiLocksOfWindow } from '../../src/service/ai-edit-locks.js';
import { FastRoleExecutionOwner } from '../../src/service/fast-role/fast-role-execution.js';
import { FastRoleRequests } from '../../src/service/fast-role/fast-role-suggestions.js';
import { prepareScopedEdit, type PreparedScopedEdit } from '../../src/service/fast-role/scoped-edit.js';
import {
  SCOPED_EDIT_PROMPT_CONTRACT_DIGEST,
  SCOPED_EDIT_RESULT_SCHEMA,
  scopedEditInstructionDigest,
  scopedEditRequestDigest,
  scopedEditScopeDigest,
} from '../../src/service/fast-role/scoped-edit-contract.js';
import { EditorialStore } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { ManuscriptWindowProjection, ScopedAiEditProjection, StartScopedAiEditInput } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import { inMemoryFixture, polishSelectionOf, typeInto, unitResult } from '../support/fast-role.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { SCOPED_EDIT_AUTHORED_ANSWER, SCOPED_EDIT_AUTHORED_REPLACEMENT, SCOPED_EDIT_FIXTURE_IDENTITY, scopedEditJourneyInput, scopedEditJourneyRequest } from '../support/scoped-edit.js';

// Service-integration suite (L2) for 就选中部分让 AI 修改 and 🔒 锁定 (Issue #1412): the real store, the real scoped-edit
// service path and the deterministic route under development-ci, answered by one-entry fixtures held in memory, over exact
// `sample1` (ADR 0043) and a derivative document made from it. Every model answer here is deliberately adversarial — it names
// targets it was not given, restates read-only context, rewrites locked words — and the assertions compare the working
// state byte for byte: only the frozen targets' ranges may change. Manuscript text is compared by equality only.

let requestGovernor: ModelRequestGovernor;
let roots: ServiceTestRoots;
let store: EditorialStore;
let book: Awaited<ReturnType<typeof importSample1Book>>;
let db: DatabaseSync;

beforeEach(async () => {
  requestGovernor = new ModelRequestGovernor();
  roots = await createServiceTestRoots('ai7-service-scoped-edit-');
  await requireExactSample1(roots.codeRoot);
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  book = await importSample1Book(store, roots.codeRoot, '局部修改');
  db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
});

afterEach(async () => {
  db?.close();
  try { store.close(); } catch { /* closed by its test */ }
  requestGovernor.close();
  await requestGovernor.whenIdle();
  await roots.dispose();
});

type Block = ManuscriptWindowProjection['blocks'][number];
type Target = { manuscriptId: string; branchId: string };

/** Every working block of a branch, in order, by identity: what "the rest stays exactly as it was" is compared against. */
function allBlocks(target: Target): Map<string, { text: string; digest: string; kind: string; position: number }> {
  const out = new Map<string, { text: string; digest: string; kind: string; position: number }>();
  let cursor: string | null = null;
  for (;;) {
    const window = store.getManuscriptWindow(target.manuscriptId, target.branchId, cursor);
    for (const block of window.blocks) out.set(block.blockId, { text: block.text, digest: block.digest, kind: block.kind, position: block.position });
    if (window.nextCursor === null) return out;
    cursor = window.nextCursor;
  }
}

const head = (text: string, count: number): string => graphemesOf(text).slice(0, count).join('');
const from = (text: string, count: number): string => graphemesOf(text).slice(count).join('');

/** Three contiguous long paragraphs of a branch's first window. */
function threeParagraphs(target: Target): { window: ManuscriptWindowProjection; blocks: [Block, Block, Block] } {
  const window = store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
  const at = window.blocks.findIndex((_, index) => window.blocks.slice(index, index + 3).length === 3 &&
    window.blocks.slice(index, index + 3).every((block) => block.kind === 'paragraph' && graphemesOf(block.text).length >= 16));
  if (at < 0) throw new Error('no three contiguous paragraphs');
  return { window, blocks: window.blocks.slice(at, at + 3) as [Block, Block, Block] };
}

function locksDigest(target: Target): string {
  return store.inspectAiEditLocks(target).digest;
}

/** The base a request names, read now. */
function base(target: Target, instruction: string, scope: StartScopedAiEditInput['scope']): StartScopedAiEditInput {
  const window = store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
  return { ...target, baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence, expectedLocksDigest: locksDigest(target), instruction, scope };
}

/** A partial cross-paragraph selection: A from its 3rd grapheme to its end, B whole, C's first 4 graphemes. */
function spanOver(blocks: [Block, Block, Block]): StartScopedAiEditInput['scope'] {
  const [a, b, c] = blocks;
  return { mode: 'selected-only', span: [
    { blockId: a.blockId, blockDigest: a.digest, fromGrapheme: 2, toGrapheme: graphemesOf(a.text).length },
    { blockId: b.blockId, blockDigest: b.digest, fromGrapheme: 0, toGrapheme: graphemesOf(b.text).length },
    { blockId: c.blockId, blockDigest: c.digest, fromGrapheme: 0, toGrapheme: 4 },
  ] };
}

/** The scope as the service freezes it, read through the production path with a launch that can answer. */
function frozen(input: StartScopedAiEditInput): PreparedScopedEdit {
  const owner = new FastRoleExecutionOwner({ requestGovernor, fixture: inMemoryFixture('scoped-probe', '0'.repeat(64), unitResult('{}')), live: null });
  return prepareScopedEdit(owner, store, book.bookId, input);
}

/** Requests whose one fixture answers exactly this frozen scope with `answer`. */
function answering(prepared: PreparedScopedEdit, answer: unknown): FastRoleRequests {
  const digest = scopedEditRequestDigest(SCOPED_EDIT_PROMPT_CONTRACT_DIGEST, scopedEditInstructionDigest(prepared.message.instruction),
    scopedEditScopeDigest(prepared.message.lines));
  const fixture = inMemoryFixture('scoped-edit', digest, unitResult(typeof answer === 'string' ? answer : JSON.stringify(answer)));
  return new FastRoleRequests(new FastRoleExecutionOwner({ requestGovernor, fixture, live: null }), store, () => new Date('2026-11-08T00:00:00.000Z'));
}

async function settled(requests: FastRoleRequests, projection: ScopedAiEditProjection): Promise<ScopedAiEditProjection> {
  await requests.settled();
  return requests.inspectScopedEdit(book.bookId, projection.requestId);
}

const primary = (): Target => ({ manuscriptId: book.manuscriptId, branchId: book.branchId });

describe('就选中部分让 AI 修改: the scoped splice guard', () => {
  it('replays a scoped launch command once and refuses changed input without another edit (#1455)', async () => {
    const target = primary();
    const { blocks } = threeParagraphs(target);
    const input = { ...base(target, '只检查所选文字', spanOver(blocks)), clientCommandId: randomUUID() };
    const requests = answering(frozen(input), { schema: SCOPED_EDIT_RESULT_SCHEMA, targets: [] });
    const first = requests.scopedEdit(book.bookId, input);
    expect(requests.scopedEdit(book.bookId, input).requestId).toBe(first.requestId);
    const result = await settled(requests, first);
    expect(requests.scopedEdit(book.bookId, input)).toEqual(result);
    expect(() => requests.scopedEdit(book.bookId, { ...input, instruction: '另一个修改要求' })).toThrow();
    expect(allBlocks(target).get(blocks[0].blockId)!.digest).toBe(blocks[0].digest);
  });

  it('changes only the selected words of a partial cross-paragraph span and drops what the model wrote outside them', async () => {
    const target = primary();
    const { blocks } = threeParagraphs(target);
    const [a, b, c] = blocks;
    const before = allBlocks(target);
    const input = base(target, '把这几段改得更紧凑，保留核心信息', spanOver(blocks));
    const prepared = frozen(input);
    expect(prepared.targets.map((item) => [item.blockId, item.fromGrapheme, item.toGrapheme]))
      .toEqual([[a.blockId, 2, graphemesOf(a.text).length], [b.blockId, 0, graphemesOf(b.text).length], [c.blockId, 0, 4]]);
    // The unselected prefix of A and suffix of C are read-only context, never a target.
    expect(prepared.message.lines.flat().filter((segment) => segment.kind === 'context').map((segment) => segment.text))
      .toEqual(expect.arrayContaining([head(a.text, 2), from(c.text, 4)]));
    const requests = answering(prepared, { schema: SCOPED_EDIT_RESULT_SCHEMA, targets: [
      { id: 'T1', text: '〔甲改〕' },
      // A target restating read-only context is withheld; one naming no target it was given is dropped unread.
      { id: 'T2', text: `${from(c.text, 4)}〔乙改〕` },
      { id: 'T3', text: '〔丙改〕' },
      { id: 'T9', text: '〔越界〕' },
      { id: 'T1', text: '〔第二次〕' },
    ], document: '整篇重写的全文，绝不应被读取' });
    const result = await settled(requests, requests.scopedEdit(book.bookId, input));
    expect(result).toMatchObject({ state: 'applied', changedBlockIds: [a.blockId, c.blockId], droppedCount: 2 });
    expect(result.label).toMatch(/^已局部更新所选的 2 个段落（其余 \d+ 个未选中\/已锁定段落保持原样）。另有 1 处/u);
    const after = allBlocks(target);
    expect(after.get(a.blockId)!.text).toBe(`${head(a.text, 2)}〔甲改〕`);
    expect(after.get(b.blockId)!.text).toBe(b.text);
    expect(after.get(c.blockId)!.text).toBe(`〔丙改〕${from(c.text, 4)}`);
    // Every other block — and the order and kind of all of them — is the base's, byte for byte.
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [blockId, block] of before) if (blockId !== a.blockId && blockId !== c.blockId) expect(after.get(blockId)).toEqual(block);
    // Each changed target is its own applied card, attributed to the model that answered, and can be taken back alone.
    const cards = result.markIds.map((markId) => store.getEditorialMarkCard(target.manuscriptId, target.branchId, markId));
    expect(cards.map((card) => [card.status, card.blockId, card.suggestion?.proposedText])).toEqual([['applied', a.blockId, '〔甲改〕'], ['applied', c.blockId, '〔丙改〕']]);
    store.reverseAppliedChangeSuggestion({ ...target, windowStartBlockId: before.keys().next().value!, markId: result.markIds[0]!, clientEffectId: randomUUID() });
    const reversed = allBlocks(target);
    expect(reversed.get(a.blockId)!.text).toBe(a.text);
    expect(reversed.get(c.blockId)!.text).toBe(`〔丙改〕${from(c.text, 4)}`);
  }, 300_000);

  it('never changes a locked block inside the selection, and the store refuses any AI7 suggestion onto a locked block', async () => {
    const target = primary();
    const { blocks } = threeParagraphs(target);
    const [a, b, c] = blocks;
    store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: b.blockId }], locked: true, expectedLocksDigest: locksDigest(target) });
    const input = base(target, '统一改为书面语', spanOver(blocks));
    const prepared = frozen(input);
    // B is locked: it is read-only context, whole; only A's and C's selected parts are targets.
    expect(prepared.targets.map((item) => item.blockId)).toEqual([a.blockId, c.blockId]);
    expect(prepared.message.lines.flat().some((segment) => segment.kind === 'context' && b.text.startsWith(segment.text) && segment.text.length > 0)).toBe(true);
    // The answer tries every id it can guess, B's place included.
    const requests = answering(prepared, { schema: SCOPED_EDIT_RESULT_SCHEMA, targets: [{ id: 'T1', text: '〔甲〕' }, { id: 'T2', text: '〔丙〕' }, { id: 'T3', text: '〔乙被改〕' }] });
    const result = await settled(requests, requests.scopedEdit(book.bookId, input));
    expect(result).toMatchObject({ state: 'applied', changedBlockIds: [a.blockId, c.blockId], droppedCount: 1 });
    expect(allBlocks(target).get(b.blockId)!.text).toBe(b.text);
    // A whole selection of locked blocks is refused before anything is sent.
    store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: a.blockId }, { kind: 'block', blockId: c.blockId }], locked: true, expectedLocksDigest: locksDigest(target) });
    const now = allBlocks(target);
    const fresh = [a, b, c].map((block) => ({ ...block, text: now.get(block.blockId)!.text, digest: now.get(block.blockId)!.digest })) as [Block, Block, Block];
    expect(() => frozen(base(target, '再改一次', spanOver(fresh)))).toThrow(expect.objectContaining({ code: 'AI_EDIT_SCOPE_LOCKED' }));
    // With no model route at all the refusal is still the lock's: the route is never asked and nothing is sent.
    const unrouted = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: null });
    expect(() => prepareScopedEdit(unrouted, store, book.bookId, base(target, '再改一次', spanOver(fresh)))).toThrow(expect.objectContaining({ code: 'AI_EDIT_SCOPE_LOCKED' }));
    // An AI7 suggestion made before the lock (here: a scoped-edit card taken back, then re-applied) is refused onto the locked block.
    store.reverseAppliedChangeSuggestion({ ...target, windowStartBlockId: a.blockId, markId: result.markIds[0]!, clientEffectId: randomUUID() });
    expect(() => store.applyChangeSuggestion({ ...target, windowStartBlockId: a.blockId, markId: result.markIds[0]!, clientEffectId: randomUUID(),
      interaction: 'apply-recorded-decision', editedText: null, reason: null })).toThrow(expect.objectContaining({ code: 'AI_EDIT_LOCKED' }));
  }, 300_000);

  it('applies nothing when the locks or the target words move while the model answers', async () => {
    const target = primary();
    const { blocks } = threeParagraphs(target);
    const [a, b] = blocks;
    const before = allBlocks(target);
    const input = base(target, '改得更口语', spanOver(blocks));
    const prepared = frozen(input);
    const answer = { schema: SCOPED_EDIT_RESULT_SCHEMA, targets: [{ id: 'T1', text: '〔甲〕' }, { id: 'T2', text: '〔乙〕' }, { id: 'T3', text: '〔丙〕' }] };
    // The lock set changes after the request was frozen: the stale answer must not overwrite the newly locked words.
    let requests = answering(prepared, answer);
    let started = requests.scopedEdit(book.bookId, input);
    store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: b.blockId }], locked: true, expectedLocksDigest: input.expectedLocksDigest });
    expect(await settled(requests, started)).toMatchObject({ state: 'stale', markIds: [] });
    expect(allBlocks(target)).toEqual(before);
    // The editor types into a target block meanwhile: nothing applies, and their words stand.
    store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: b.blockId }], locked: false, expectedLocksDigest: locksDigest(target) });
    const again = base(target, '改得更口语', spanOver(threeParagraphs(target).blocks));
    requests = answering(frozen(again), answer);
    started = requests.scopedEdit(book.bookId, again);
    typeInto(store, book, a.blockId, 0, 0, '〔编辑先写〕');
    expect(await settled(requests, started)).toMatchObject({ state: 'stale', markIds: [] });
    expect(allBlocks(target).get(a.blockId)!.text).toBe(`〔编辑先写〕${a.text}`);
    expect(allBlocks(target).get(b.blockId)!.text).toBe(b.text);
    // A request on a base the editor no longer stands on is refused before anything is sent.
    expect(() => frozen(again)).toThrow(expect.objectContaining({ code: 'MARK_BINDING_CHANGED' }));
  }, 300_000);
});

/** A derivative document of the Book whose blocks are a copy of `sample1`, made through the real import and creation path. */
async function derivativeCopy(): Promise<Target> {
    const staged = await store.stageSelectedManuscript(randomUUID(), join(roots.codeRoot, 'SampleBooks', 'sample1.docx'));
    const source = db.prepare('SELECT source_version_id FROM manuscript_revisions WHERE revision_id = ?').get(book.revisionId)!;
    const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
      { kind: 'existing-book', bookId: book.bookId, relationship: 'source-only', reuseSourceVersionId: source.source_version_id as string });
    const commitId = randomUUID();
    const committed = await store.commitSourceImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId });
    await store.acknowledgeImportCompletion(commitId);
    const document = (await store.createProductionDocument({ bookId: book.bookId, typeId: 'news-release', sourceVersionId: committed.sourceVersionId })).document!;
    return { manuscriptId: document.documentId, branchId: document.branchId };
}

describe('🔒 锁定 on a derivative document: unlocked-only rounds', () => {

  it('changes every unlocked block of a section over several rounds, keeps locked blocks and sections byte for byte, and refuses a scope too large', async () => {
    const target = await derivativeCopy();
    // The editor makes two paragraphs chapter headings: the section is everything between them.
    const styled = store.getManuscriptWindow(target.manuscriptId, target.branchId, null).blocks.filter((block) => block.kind === 'paragraph' && block.text.length > 0);
    for (const block of [styled[2]!, styled[8]!]) {
      const now = store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
      store.flushJournalEdit({ clientEditId: randomUUID(), ...target, baseRevisionId: now.revisionId, blockId: block.blockId, windowStartBlockId: now.blocks[0]!.blockId,
        baseBlockDigest: now.blocks.find((candidate) => candidate.blockId === block.blockId)!.digest, expectedJournalSequence: now.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '', structure: { kind: 'style', blockKind: 'heading', level: 1 } });
    }
    const before = allBlocks(target);
    const ordered = [...before.entries()];
    const heading = ordered.find(([blockId]) => blockId === styled[2]!.blockId)!;
    expect(heading[1].kind).toBe('heading');
    const nextHeading = before.get(styled[8]!.blockId)!;
    // The whole derivative is beyond one scoped edit's bound; a section is not.
    expect(() => frozen(base(target, '整体压缩', { mode: 'unlocked-only', range: { kind: 'document' } }))).toThrow(expect.objectContaining({ code: 'AI_EDIT_SCOPE_TOO_LARGE' }));
    const headingId = heading[0];
    const section = ordered.filter(([, block]) => block.position > heading[1].position && block.position < nextHeading.position && block.kind === 'paragraph' && block.text.length > 0);
    const [first, second] = section.map(([blockId]) => blockId);
    store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: first! }], locked: true, expectedLocksDigest: locksDigest(target) });
    // Round 1: every unlocked block of the section is a target; the locked one is context. The answer rewrites them all and
    // also tries to sneak the locked paragraph's words in under a target of its own.
    const round1 = base(target, '第一轮：语气更正式', { mode: 'unlocked-only', range: { kind: 'section', headingBlockId: headingId } });
    const prepared1 = frozen(round1);
    expect(prepared1.targets.some((item) => item.blockId === first)).toBe(false);
    expect(prepared1.targets.some((item) => item.blockId === second)).toBe(true);
    // The heading itself is the section's; the next heading of its level ends it and is only context.
    expect(prepared1.targets.some((item) => item.blockId === styled[8]!.blockId)).toBe(false);
    expect(prepared1.targets.map((item) => item.blockId)).toEqual([heading[0], ...section.map(([blockId]) => blockId).filter((blockId) => blockId !== first)]);
    const secondTarget = prepared1.targets.find((item) => item.blockId === second)!;
    const requests1 = answering(prepared1, { schema: SCOPED_EDIT_RESULT_SCHEMA, targets: [
      { id: secondTarget.id, text: '〔第一轮〕' },
      { id: `T${prepared1.targets.length + 1}`, text: '〔锁定段被改〕' },
    ] });
    const result1 = await settled(requests1, requests1.scopedEdit(book.bookId, round1));
    expect(result1).toMatchObject({ state: 'applied', changedBlockIds: [second], droppedCount: 1 });
    // Round 2: the editor locks the paragraph round 1 changed, too, and the whole section is offered again.
    store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: second! }], locked: true, expectedLocksDigest: locksDigest(target) });
    const round2 = base(target, '第二轮：再精炼', { mode: 'unlocked-only', range: { kind: 'section', headingBlockId: headingId } });
    const prepared2 = frozen(round2);
    expect(prepared2.targets.some((item) => item.blockId === first || item.blockId === second)).toBe(false);
    const requests2 = answering(prepared2, { schema: SCOPED_EDIT_RESULT_SCHEMA, targets: prepared2.targets.map((item) => ({ id: item.id, text: `〔第二轮${item.id}〕` })) });
    const result2 = await settled(requests2, requests2.scopedEdit(book.bookId, round2));
    expect(result2.state).toBe('applied');
    const after = allBlocks(target);
    expect(after.get(first!)!.text).toBe(before.get(first!)!.text);
    expect(after.get(second!)!.text).toBe('〔第一轮〕');
    const changed = new Set([second!, ...result2.changedBlockIds]);
    for (const [blockId, block] of before) if (!changed.has(blockId)) expect(after.get(blockId)).toEqual(block);
    // Locking the whole section leaves nothing to change in it, and the window carries the locks.
    store.setAiEditLocks({ ...target, targets: [{ kind: 'section', headingBlockId: headingId }], locked: true, expectedLocksDigest: locksDigest(target) });
    expect(() => frozen(base(target, '第三轮', { mode: 'unlocked-only', range: { kind: 'section', headingBlockId: headingId } })))
      .toThrow(expect.objectContaining({ code: 'AI_EDIT_SCOPE_LOCKED' }));
    expect(store.inspectAiEditLocks(target)).toMatchObject({ blockIds: [first, second], sectionHeadingBlockIds: [headingId] });
  }, 300_000);

  it('refuses a lock change against a lock set that moved, and carries the locks into the window', () => {
    const target = primary();
    const { blocks } = threeParagraphs(target);
    const empty = locksDigest(target);
    store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: blocks[0].blockId }], locked: true, expectedLocksDigest: empty });
    expect(() => store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: blocks[1].blockId }], locked: true, expectedLocksDigest: empty }))
      .toThrow(expect.objectContaining({ code: 'AI_EDIT_LOCKS_STALE' }));
    expect(store.inspectAiEditLocks(target).blockIds).toEqual([blocks[0].blockId]);
    // What the window owner carries beside its marks: this window's locked blocks and the lock set's digest.
    const window = store.getManuscriptWindow(target.manuscriptId, target.branchId, null);
    expect(aiLocksOfWindow(db, target.branchId, window.blocks[0]!.position)).toEqual({ aiLockedBlockIds: [blocks[0].blockId], aiLocksDigest: locksDigest(target) });
  });
});

// The authored fixture `sample1-scoped-edit-authored` (Issue #1412): its one request digest is derived here from the real store
// exactly as the service derives it. Regenerate after the contract or the Journey's words change with
//   AI7_REGENERATE_SCOPED_EDIT_FIXTURE=1 pnpm exec vitest run tests/service/scoped-ai-edit.test.ts -t "authored fixture"
// and review the diff like any other change.
describe('the authored fixture sample1-scoped-edit-authored', () => {
  const FIXTURES = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

  it.runIf(process.env['AI7_REGENERATE_SCOPED_EDIT_FIXTURE'] === '1')('generates the authored fixture', async () => {
    const { requestDigest } = scopedEditJourneyRequest(store, book.bookId, scopedEditJourneyInput(store, book, locksDigest(primary())));
    const fixture = {
      schema: 'ai7.model-fixture/1',
      identity: SCOPED_EDIT_FIXTURE_IDENTITY,
      description: 'Authored 就选中部分让 AI 修改 answer (Issue #1412) for the one 润色这段 sentence of exact sample1 selected inside its paragraph, keyed under unit ordinal 0 by the ai7.scoped-edit/1 request digest of that selection, its paragraph edges and its neighbours\' edges: the sentence rewritten, plus a target id never given and a whole-document rewrite, which the splice drops.',
      basedOn: null,
      provenance: 'authored',
      provider: 'ai7-local-deterministic',
      model: 'ai7-deterministic-fixture',
      entries: [{ unitOrdinal: 0, requestDigest, response: { kind: 'unit-result', text: SCOPED_EDIT_AUTHORED_ANSWER, usage: { inputTokens: 480, outputTokens: 70 } } }],
    };
    await writeFile(resolve(FIXTURES, `${SCOPED_EDIT_FIXTURE_IDENTITY}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  });

  it('answers the Journey request on the manuscript and on a derivative copy of it alike, changing only the sentence', async () => {
    const fixture = await loadModelFixture(FIXTURES, SCOPED_EDIT_FIXTURE_IDENTITY);
    expect(fixture.provenance).toBe('authored');
    const requests = new FastRoleRequests(new FastRoleExecutionOwner({ requestGovernor, fixture, live: null }), store, () => new Date('2026-11-08T00:00:00.000Z'));
    const derivativeTarget = await derivativeCopy();
    for (const target of [primary(), derivativeTarget]) {
      const on = { ...book, ...target };
      const selection = polishSelectionOf(store, on);
      const before = allBlocks(target);
      const original = before.get(selection.blockId)!.text;
      // The paragraph after the sentence's is locked first: locks never enter the request, so the same answer still applies.
      const next = [...before.entries()].find(([, block]) => block.position === before.get(selection.blockId)!.position + 1)![0];
      store.setAiEditLocks({ ...target, targets: [{ kind: 'block', blockId: next }], locked: true, expectedLocksDigest: locksDigest(target) });
      const input = scopedEditJourneyInput(store, on, locksDigest(target));
      const result = await settled(requests, requests.scopedEdit(book.bookId, input));
      expect(result).toMatchObject({ state: 'applied', changedBlockIds: [selection.blockId], droppedCount: 1 });
      const after = allBlocks(target);
      const parts = graphemesOf(original);
      expect(after.get(selection.blockId)!.text).toBe(`${parts.slice(0, selection.fromGrapheme).join('')}${SCOPED_EDIT_AUTHORED_REPLACEMENT}${parts.slice(selection.toGrapheme).join('')}`);
      for (const [blockId, block] of before) if (blockId !== selection.blockId) expect(after.get(blockId)).toEqual(block);
    }
  }, 300_000);
});
