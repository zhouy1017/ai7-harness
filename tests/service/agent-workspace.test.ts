import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_WORKSPACE_CAPABILITIES, agentWorkspaceComposition } from '../../src/service/agent-workspace/capabilities.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { AGENT_WORKSPACE_MARK_SOURCE_LABEL, AGENT_WORKSPACE_UNAVAILABLE_REASON, AgentWorkspace } from '../../src/service/agent-workspace/workspace.js';
import { AGENT_WORKSPACE_RETRIEVAL_PROMPT_CONTRACT, AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST, AGENT_WORKSPACE_RESULT_SCHEMA } from '../../src/service/dialogue/contract.js';
import { DialogueExecutionOwner, dialogueLiveRoute } from '../../src/service/dialogue/dialogue-execution.js';
import { DialogueError } from '../../src/service/dialogue/dialogue-ledger.js';
import { HARNESS_SESSION_LOG_DIRECTORY } from '../../src/service/harness/session-log.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { AgentWorkspaceProjection, DialogueSelectionInput } from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx } from '../support/composed-fixture.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { typeInto } from '../support/fast-role.js';
import { readSelectionSpan } from '../../src/shared/selection-span.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Service-integration suite (L2) for the Book-bound Agent 工作区 (Issue #90, wave 13 slice 13a; ADR 0045, UI ADR 0015) over the
// real store, the real dialogue owner and PrimaryAgentHarness composition and the AI7 local deterministic adapter: one proposal
// round as one dialogue turn under the workspace fragment, its answer held as candidates anchored inside the selected range —
// one outside it dropped and disclosed — and 提交为修改建议 making them 修改建议 marks in one atomic group, the manuscript
// unchanged; a one-item set without a group; the refusals; and that looking, leaving and 放弃 write nothing.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const SET_INSTRUCTION = '请让这段的表达更凝练，给出一组修改。';
const ONE_INSTRUCTION = '请只就最需要的一处给出修改。';
/** Words of exact sample1's paragraph the authored answer anchors on. */
const FIRST_ANCHOR = '其存在的意义被视为国宝中的国宝';
const SECOND_ANCHOR = '用如此器物作为评价';
const ONE_ANCHOR = '可见曾本之所谓七十小寿寿宴的确非同寻常';

let roots: ServiceTestRoots;
let fixture: ResolvedModelFixture;
let opened: EditorialStore[];

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-agent-workspace-');
  await requireExactSample1(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-agent-workspace');
  opened = [];
});

afterEach(async () => {
  for (const store of opened) {
    try { store.close(); } catch { /* closed by its test */ }
  }
  await roots.dispose();
});

async function openStore(): Promise<EditorialStore> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  opened.push(store);
  return store;
}

function localOwner(store: EditorialStore): DialogueExecutionOwner {
  return new DialogueExecutionOwner({ requestGovernor, records: store, fixture, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null });
}

/** The whole paragraph of the Book's manuscript holding `words`, selected as the workspace selects it. */
function paragraphHolding(store: EditorialStore, book: { manuscriptId: string; branchId: string }, words: string): DialogueSelectionInput {
  let cursor: string | null = null;
  for (;;) {
    const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, cursor);
    const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && candidate.text.includes(words));
    if (block !== undefined) {
      const parts = graphemesOf(block.text);
      return {
        manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId,
        baseRevisionId: window.revisionId, expectedJournalSequence: window.journalSequence, blockId: block.blockId,
        baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: parts.length, selectedText: block.text,
      };
    }
    expect(window.nextCursor).not.toBeNull();
    cursor = window.nextCursor;
  }
}

/** Every relation's row count, read beside the open store. */
function rowCounts(): Map<string, number> {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => String(row.name));
    return new Map(tables.map((table) => [table, Number(db.prepare(`SELECT count(*) AS n FROM "${table}"`).get()!.n)]));
  } finally {
    db.close();
  }
}

function changedTables(before: Map<string, number>, after: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...after].filter(([table, count]) => before.get(table) !== count).map(([table, count]) => [table, count - (before.get(table) ?? 0)]));
}

async function settled(workspace: AgentWorkspace, bookId: string): Promise<AgentWorkspaceProjection> {
  const until = Date.now() + 15_000;
  for (;;) {
    const projection = await workspace.inspect(bookId);
    if (projection.proposal?.state !== 'proposing') return projection;
    if (Date.now() > until) throw new Error('the round did not settle');
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

async function refusal(operation: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError || error instanceof DialogueError || (error instanceof Error && error.name === 'AgentWorkspaceError')) {
      return { code: (error as Error & { code: string }).code, message: error.message };
    }
    throw error;
  }
  return { code: 'no-error', message: '' };
}

describe('Agent 工作区 over the real store, dialogue owner and harness', () => {
  it('also isolates legacy workspace tasks without an origin tag, including after restart', async () => {
    const store = await openStore();
    const dialogues = localOwner(store);
    const book = await importSample1Book(store, roots.codeRoot, '旧变更集');
    const turn = store.askAboutSelection(book.bookId, { selection: paragraphHolding(store, book, FIRST_ANCHOR), question: SET_INSTRUCTION });
    try {
      let completed = false;
      dialogues.beginWorkspaceTurn({ ...turn, settled: () => { completed = true; } });
      const until = Date.now() + 15_000;
      while (!completed && Date.now() < until) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
      expect(completed).toBe(true);
      const before = store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null);
      expect(before.origin).toBe('agent-workspace');
      expect(before.attempts[0]!.fragments).toEqual([]);
      await dialogues.dispose();
      store.close();
      const reopened = await openStore();
      expect(reopened.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null)).toEqual(before);
      expect(reopened.inspectBookTasks(book.bookId, () => null).groups.every((group) => group.items.length === 0)).toBe(true);
    } finally { await dialogues.dispose(); }
  });
  it('replaces a completed round directly, including a round with zero proposals', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '连续提议');
    const selection = paragraphHolding(store, book, FIRST_ANCHOR);
    const workspace = new AgentWorkspace(store, {
      requireReady: () => undefined, stop: async () => undefined,
      beginWorkspaceTurn: (turn) => turn.settled('completed', JSON.stringify({ schema: AGENT_WORKSPACE_RESULT_SCHEMA, items: [] })),
    });
    const first = (await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION })).proposal!;
    expect(first).toMatchObject({ state: 'ready', candidates: [] });
    const second = (await workspace.propose(book.bookId, { selection, instruction: ONE_INSTRUCTION })).proposal!;
    expect(second.state).toBe('ready');
    expect(second.proposalSetId).not.toBe(first.proposalSetId);
    expect(second.instruction).toBe(ONE_INSTRUCTION);
  });

  it('retains the last incomplete preview and promotes only unmoved anchors (#1311)', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '保留已到提议');
    const selection = paragraphHolding(store, book, FIRST_ANCHOR);
    const workspace = new AgentWorkspace(store, {
      requireReady: () => undefined, stop: async () => undefined,
      beginWorkspaceTurn: (turn) => {
        turn.progress?.(JSON.stringify({ items: [
          { anchor: FIRST_ANCHOR, proposedText: '新的表述一', rationale: '凝练。' },
          { anchor: SECOND_ANCHOR, proposedText: '新的表述二', rationale: '凝练。' },
        ] }));
        turn.settled('failed', '回答未完成');
      },
    });
    const proposal = (await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION })).proposal!;
    expect(proposal).toMatchObject({ state: 'ready', candidates: [{ ordinal: 1 }, { ordinal: 2 }] });
    expect(proposal.label).toContain('未完成');
    const first = proposal.candidates[0]!.anchor;
    typeInto(store, book, first.blockId, first.fromGrapheme, first.fromGrapheme + 1, '另');
    const promoted = await workspace.promote(book.bookId, { proposalSetId: proposal.proposalSetId });
    expect(promoted.markIds).toHaveLength(1);
    expect(promoted.label).toContain('1 项原文位置已变动');
    expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, promoted.markIds[0]!).suggestion?.proposedText).toBe('新的表述二');
  });

  it('keeps the round and discloses nothing placed when every anchor moved (#1311)', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '全部锚点变动');
    const selection = paragraphHolding(store, book, FIRST_ANCHOR);
    const workspace = new AgentWorkspace(store, {
      requireReady: () => undefined, stop: async () => undefined,
      beginWorkspaceTurn: (turn) => turn.settled('completed', JSON.stringify({ items: [
        { anchor: FIRST_ANCHOR, proposedText: '新的表述', rationale: '凝练。' },
      ] })),
    });
    const proposal = (await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION })).proposal!;
    const anchor = proposal.candidates[0]!.anchor;
    typeInto(store, book, anchor.blockId, anchor.fromGrapheme, anchor.fromGrapheme + 1, '另');
    const before = rowCounts();
    await expect(workspace.promote(book.bookId, { proposalSetId: proposal.proposalSetId }))
      .rejects.toMatchObject({ code: 'AGENT_WORKSPACE_NOTHING_TO_PROMOTE' });
    expect(changedTables(before, rowCounts())).toEqual({});
    const kept = (await workspace.inspect(book.bookId)).proposal!;
    expect(kept.proposalSetId).toBe(proposal.proposalSetId);
    expect(kept.candidates).toEqual(proposal.candidates);
    expect(kept.label).toContain('没有新建修改建议');
    expect(kept.label).toContain('1 项原文位置已变动');
  });

  it('accepts a paragraph longer than the dialogue cap and maps independent edits across paragraphs', async () => {
    const store = await openStore();
    const book = await importSample1Book(store, roots.codeRoot, '跨段提议');
    const first = paragraphHolding(store, book, FIRST_ANCHOR);
    const padding = first.selectedText.repeat(30).slice(0, 2_010 - first.selectedText.length);
    for (let at = 0; at < padding.length; at += 100) typeInto(store, book, first.blockId, 0, 0, padding.slice(at, at + 100));
    const page = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId: first.blockId });
    const index = page.blocks.findIndex((block) => block.blockId === first.blockId);
    const blocks = page.blocks.slice(index, index + 2);
    const reading = readSelectionSpan(blocks, 0, graphemesOf(blocks[1]!.text).length);
    if (reading.kind !== 'span') throw new Error('sample span missing');
    const pin = reading.pins[0]!;
    const selection = { ...first, baseRevisionId: page.revisionId, expectedJournalSequence: page.journalSequence,
      baseBlockDigest: pin.blockDigest, toGrapheme: pin.toGrapheme, selectedText: reading.text, span: reading.pins };
    expect(pin.toGrapheme).toBeGreaterThan(2_000);
    const anchor = blocks[1]!.text;
    const workspace = new AgentWorkspace(store, {
      requireReady: () => undefined, stop: async () => undefined,
      beginWorkspaceTurn: (turn) => turn.settled('completed', JSON.stringify({ schema: AGENT_WORKSPACE_RESULT_SCHEMA,
        items: [{ anchor, proposedText: `${anchor}。`, rationale: '衔接。' }] })),
    });
    const { span: _span, ...single } = selection;
    expect((await workspace.propose(book.bookId, { selection: { ...single, selectedText: blocks[0]!.text }, instruction: SET_INSTRUCTION })).proposal?.state).toBe('ready');
    const proposal = (await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION })).proposal!;
    expect(proposal.candidates).toHaveLength(1);
    expect(proposal.candidates[0]!.anchor).toMatchObject({ blockId: blocks[1]!.blockId, fromGrapheme: 0, text: anchor });
    const promotion = await workspace.promote(book.bookId, { proposalSetId: proposal.proposalSetId });
    expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, promotion.markIds[0]!).blockId).toBe(blocks[1]!.blockId);
  });
  it('keeps workspace JSON out of dialogue and promotes independent suggestions', async () => {
    const store = await openStore();
    const dialogues = localOwner(store);
    const workspace = new AgentWorkspace(store, dialogues);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '工作区变更集');
      const selection = paragraphHolding(store, book, FIRST_ANCHOR);
      const digestBefore = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest;

      // Looking at the workspace writes nothing; it states what it may do.
      const looked = rowCounts();
      const empty = await workspace.inspect(book.bookId);
      expect(empty).toEqual({ bookId: book.bookId, available: true, unavailableReason: null, capabilities: AGENT_WORKSPACE_CAPABILITIES, proposal: null });
      expect(changedTables(looked, rowCounts())).toEqual({});

      const asked = await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION });
      // The answer runs beside the request; the fixture may already have settled it.
      expect(['proposing', 'ready']).toContain(asked.proposal?.state);
      const ready = await settled(workspace, book.bookId);
      const proposal = ready.proposal!;
      expect(proposal.state).toBe('ready');
      expect(proposal.instruction).toBe(SET_INSTRUCTION);
      expect(proposal.selection).toEqual({ manuscriptId: book.manuscriptId, branchId: book.branchId, blockId: selection.blockId,
        fromGrapheme: selection.fromGrapheme, toGrapheme: selection.toGrapheme, text: selection.selectedText });
      // Two anchored replacements, each exactly the words at its place inside the selected range.
      expect(proposal.candidates.map((candidate) => [candidate.ordinal, candidate.anchor.text])).toEqual([[1, FIRST_ANCHOR], [2, SECOND_ANCHOR]]);
      const parts = graphemesOf(selection.selectedText);
      for (const candidate of proposal.candidates) {
        expect(candidate.anchor.blockId).toBe(selection.blockId);
        expect(candidate.anchor.fromGrapheme).toBeGreaterThanOrEqual(selection.fromGrapheme);
        expect(candidate.anchor.toGrapheme).toBeLessThanOrEqual(selection.toGrapheme);
        expect(parts.slice(candidate.anchor.fromGrapheme, candidate.anchor.toGrapheme).join('')).toBe(candidate.anchor.text);
      }
      // The one whose words are not in the range is dropped and disclosed.
      expect(proposal.dropped).toEqual([{ ordinal: 3, reason: '摘出的文字不在所选范围内' }]);
      expect(proposal.label).toContain('另有 1 项');

      // The round is one dialogue Task of the dialogue's own kind, bound to the workspace contract, its composition tool-free.
      const dialogue = store.inspectDialogue(book.bookId, proposal.dialogueId, 0, () => null);
      expect(dialogue.question).toBe(SET_INSTRUCTION);
      expect(dialogue.attempts.map((attempt) => [attempt.kind, attempt.state])).toEqual([['ask', 'completed']]);
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const binding = db.prepare('SELECT b.prompt_contract_sha256, b.behavior_composition_sha256, b.route FROM dialogue_execution_bindings b JOIN dialogue_attempts a ON a.attempt_id = b.attempt_id WHERE a.dialogue_id = ?')
          .get(proposal.dialogueId)!;
        expect(binding.prompt_contract_sha256).toBe(AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST);
        // The composition the turn ran in is the declared one: no tool registered, no platform or local tools.
        const declared = agentWorkspaceComposition(LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL);
        expect(declared.tools.registeredTools).toBe(0);
        expect(binding.behavior_composition_sha256).toBe(declared.digest);
        expect(binding.route).toBe('ai7-local-deterministic');
      } finally {
        db.close();
      }

      expect(dialogue.origin).toBe('agent-workspace');
      expect(dialogue.attempts.every((attempt) => attempt.fragments.length === 0)).toBe(true);
      expect(store.inspectBookTasks(book.bookId, () => null, 'admitting', (id) => dialogues.liveText(id)).groups
        .flatMap((group) => group.items).some((entry) => entry.item.target.kind === 'dialogue' && entry.item.target.dialogueId === proposal.dialogueId)).toBe(false);

      const promotion = await workspace.promote(book.bookId, { proposalSetId: proposal.proposalSetId });
      expect(promotion.markIds).toHaveLength(2);
      expect(promotion.atomicGroupId).toBeNull();
      expect(promotion.workspace.proposal).toBeNull();
      for (const [index, markId] of promotion.markIds.entries()) {
        const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
        const candidate = proposal.candidates[index]!;
        expect(card.kind).toBe('change-suggestion');
        expect(card.source).toMatchObject({ kind: 'ai7', origin: 'task', label: AGENT_WORKSPACE_MARK_SOURCE_LABEL, taskId: proposal.dialogueId, modelLabel: 'AI7 本地检查' });
        expect(card.suggestion).toMatchObject({ currentText: candidate.anchor.text, proposedText: candidate.proposedText,
          atomicGroupId: promotion.atomicGroupId, decision: null, application: null });
      }
      const workspaceItems = store.inspectProposalWorkspace({ manuscriptId: book.manuscriptId, branchId: book.branchId, resultId: null });
      const grouped = workspaceItems.items.filter((item) => promotion.markIds.includes(item.markId));
      expect(grouped.map((item) => [item.atomicGroupId, item.atomicReason])).toEqual([
        [null, null], [null, null]]);
      // The manuscript's text is exactly as it was: nothing is decided or applied until a Mark Card decision.
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest).toBe(digestBefore);
      expect((await refusal(() => workspace.promote(book.bookId, { proposalSetId: proposal.proposalSetId }))).code).toBe('AGENT_WORKSPACE_ROUND_NOT_FOUND');
    } finally {
      await dialogues.dispose();
    }
  });

  it('promotes a one-item set without an atomic group, and 放弃 records nothing beyond the turn', async () => {
    const store = await openStore();
    const dialogues = localOwner(store);
    const workspace = new AgentWorkspace(store, dialogues);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '工作区单项');
      const selection = paragraphHolding(store, book, ONE_ANCHOR);

      // One round: only the dialogue ledger gains the rows of its one turn.
      const before = rowCounts();
      await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION });
      const held = (await settled(workspace, book.bookId)).proposal!;
      expect(held.state).toBe('ready');
      const afterTurn = rowCounts();
      expect(changedTables(before, afterTurn)).toEqual({
        dialogue_attempt_outcomes: 1, dialogue_attempts: 1, dialogue_execution_bindings: 1, dialogue_harness_spans: 1, dialogue_tasks: 1,
      });
      // 放弃 and leaving write nothing.
      const discarded = await workspace.discard(book.bookId, { proposalSetId: held.proposalSetId });
      expect(discarded.proposal).toBeNull();
      await workspace.inspect(book.bookId);
      expect(changedTables(afterTurn, rowCounts())).toEqual({});
      expect((await refusal(() => workspace.discard(book.bookId, { proposalSetId: held.proposalSetId }))).code).toBe('AGENT_WORKSPACE_ROUND_NOT_FOUND');

      await workspace.propose(book.bookId, { selection, instruction: ONE_INSTRUCTION });
      const one = (await settled(workspace, book.bookId)).proposal!;
      expect(one.candidates.map((candidate) => candidate.anchor.text)).toEqual([ONE_ANCHOR]);
      expect(one.dropped).toEqual([]);
      const promotion = await workspace.promote(book.bookId, { proposalSetId: one.proposalSetId });
      expect(promotion.markIds).toHaveLength(1);
      expect(promotion.atomicGroupId).toBeNull();
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, promotion.markIds[0]!);
      expect(card.suggestion).toMatchObject({ currentText: ONE_ANCHOR, atomicGroupId: null, decision: null, application: null });
    } finally {
      await dialogues.dispose();
    }
  });

  it('opens every imported Book and refuses before recording: a selection not of the primary manuscript, and the dialogue route', async () => {
    const store = await openStore();
    const dialogues = localOwner(store);
    const workspace = new AgentWorkspace(store, dialogues);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '工作区未启用');
      const selection = paragraphHolding(store, book, FIRST_ANCHOR);
      const before = rowCounts();
      const closed = await workspace.inspect(book.bookId);
      expect(closed).toMatchObject({ available: true, unavailableReason: null, proposal: null });
      expect(changedTables(before, rowCounts())).toEqual({});

      const pinned = rowCounts();
      expect((await refusal(() => workspace.propose(book.bookId, { selection: { ...selection, manuscriptId: randomUUID() }, instruction: SET_INSTRUCTION }))).code)
        .toBe('AGENT_WORKSPACE_SCOPE');
      // A launch with no dialogue route refuses as the dialogue does.
      const unbound = new AgentWorkspace(store, new DialogueExecutionOwner({ requestGovernor, records: store, fixture: null, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null }));
      expect((await refusal(() => unbound.propose(book.bookId, { selection, instruction: SET_INSTRUCTION }))).code).toBe('DIALOGUE_ROUTE_UNAVAILABLE');
      expect(changedTables(pinned, rowCounts())).toEqual({});
    } finally {
      await dialogues.dispose();
    }
  });

  it('streams workspace output with the admitted local retrieval tools through a stubbed transport', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-agent-workspace-live-'));
    const store = await openStore();
    try {
      const book = await importSample1Book(store, roots.codeRoot, '工作区实时');
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
      const calls: Array<{ url: string; body: string }> = [];
      let candidateId = '';
      const content = JSON.stringify({ schema: AGENT_WORKSPACE_RESULT_SCHEMA, items: [{ anchor: SECOND_ANCHOR, proposedText: '以如此重器作比', rationale: '更凝练。' }] });
      const nativeFetch = (async (url: string, init: { body: string }) => {
        calls.push({ url, body: init.body });
        const request = JSON.parse(init.body);
        const model = request.model;
        if (calls.length === 2) candidateId = JSON.parse(request.messages.at(-1).content)[0].candidateId;
        if (calls.length < 3) {
          const name = calls.length === 1 ? 'retrieve' : 'exact_fetch';
          const args = calls.length === 1 ? { query: SECOND_ANCHOR, k: 1, sourceKinds: ['manuscript'] } : { candidateId };
          return new Response(`data: ${JSON.stringify({ model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `workspace-${calls.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ model, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
        }
        return new Response(`data: ${JSON.stringify({ model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 300, completion_tokens: 40 } })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
      }) as unknown as typeof fetch;
      // Actual business (no development validation): the request reaches the stubbed transport itself, and nothing else does.
      const live = dialogueLiveRoute(
        { launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 }, providerCacheRoot: cacheRoot, validation: null }, nativeFetch },
        policy, { resolve: async () => 'placeholder-development-key' },
      );
      const dialogues = new DialogueExecutionOwner({ requestGovernor, records: store, fixture: null, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live, retrievalIndex: (id) => store.dialogueRetrievalIndex(id) });
      const workspace = new AgentWorkspace(store, dialogues);
      try {
        const selection = paragraphHolding(store, book, FIRST_ANCHOR);
        await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION });
        const ready = (await settled(workspace, book.bookId)).proposal!;
        expect(ready.state).toBe('ready');
        expect(ready.candidates.map((candidate) => candidate.anchor.text)).toEqual([SECOND_ANCHOR]);
        expect(calls).toHaveLength(3);
        expect(candidateId).toMatch(/^[0-9a-f]{64}$/u);
        const sent = JSON.parse(calls[0]!.body) as { stream?: unknown; tools?: unknown; messages: Array<{ role: string; content: unknown }> };
        expect(sent.stream).toBe(true);
        expect(sent.tools).toBeDefined();
        expect(sent.messages[0]).toMatchObject({ role: 'system', content: AGENT_WORKSPACE_RETRIEVAL_PROMPT_CONTRACT.systemPrompt });
        expect(ready.streamedCharacters).toBeGreaterThan(0);
        const user = JSON.stringify(sent.messages.slice(1));
        expect(user).toContain(SET_INSTRUCTION);
        expect(user).toContain(JSON.stringify(selection.selectedText).slice(1, -1));
        // Only the selected words and the instruction: no other paragraph of the Book travels.
        const other = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.kind === 'paragraph' && block.blockId !== selection.blockId && block.text.length > 30)!;
        expect(user).not.toContain(JSON.stringify(other.text.slice(0, 20)).slice(1, -1));
      } finally {
        await dialogues.dispose();
      }
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });
});
