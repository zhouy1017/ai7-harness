import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_WORKSPACE_CAPABILITIES, agentWorkspaceComposition } from '../../src/service/agent-workspace/capabilities.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from '../../src/service/provider/egress-gate.js';
import { AGENT_WORKSPACE_ATOMIC_REASON, AGENT_WORKSPACE_MARK_SOURCE_LABEL, AGENT_WORKSPACE_UNAVAILABLE_REASON, AgentWorkspace } from '../../src/service/agent-workspace/workspace.js';
import { AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST } from '../../src/service/dialogue/contract.js';
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
  return new DialogueExecutionOwner({ records: store, fixture, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null });
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
  it('proposes one change set as a dialogue turn, drops the anchor outside the range and promotes the rest as one atomic group', async () => {
    const store = await openStore();
    const dialogues = localOwner(store);
    const workspace = new AgentWorkspace(store, dialogues);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '工作区变更集');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      const selection = paragraphHolding(store, book, FIRST_ANCHOR);
      const digestBefore = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest;

      // The scope kinds it may name are exactly the two Revision 2 of the profile's authority sidecar makes eligible.
      const profile = await store.inspectEditorialWorkspaceProfile(book.bookId);
      expect([...AGENT_WORKSPACE_CAPABILITIES.scopes]).toEqual([...profile.sidecar.revisions[1].authorityCeiling.readableScopeKinds]);
      expect(profile.sidecar.revisions[1].authorityCeiling).toMatchObject({ networkAccess: false, applyAuthority: false, capabilities: [] });
      // Looking at the workspace writes nothing; it states what it may do.
      const looked = rowCounts();
      const empty = await workspace.inspect(book.bookId);
      expect(empty).toEqual({ bookId: book.bookId, available: true, unavailableReason: null, capabilities: AGENT_WORKSPACE_CAPABILITIES, proposal: null });
      expect(changedTables(looked, rowCounts())).toEqual({});

      const asked = await workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION });
      expect(asked.proposal?.state).toBe('proposing');
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

      // A second round is refused while this one is held.
      expect((await refusal(() => workspace.propose(book.bookId, { selection, instruction: ONE_INSTRUCTION }))).code).toBe('AGENT_WORKSPACE_ROUND_HELD');

      const promotion = await workspace.promote(book.bookId, { proposalSetId: proposal.proposalSetId });
      expect(promotion.markIds).toHaveLength(2);
      expect(promotion.atomicGroupId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(promotion.workspace.proposal).toBeNull();
      for (const [index, markId] of promotion.markIds.entries()) {
        const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, markId);
        const candidate = proposal.candidates[index]!;
        expect(card.kind).toBe('change-suggestion');
        expect(card.source).toMatchObject({ kind: 'ai7', origin: 'task', label: AGENT_WORKSPACE_MARK_SOURCE_LABEL, taskId: proposal.dialogueId });
        expect(card.suggestion).toMatchObject({ currentText: candidate.anchor.text, proposedText: candidate.proposedText,
          atomicGroupId: promotion.atomicGroupId, decision: null, application: null });
      }
      const workspaceItems = store.inspectProposalWorkspace({ manuscriptId: book.manuscriptId, branchId: book.branchId, resultId: null });
      const grouped = workspaceItems.items.filter((item) => promotion.markIds.includes(item.markId));
      expect(grouped.map((item) => [item.atomicGroupId, item.atomicReason])).toEqual([
        [promotion.atomicGroupId, AGENT_WORKSPACE_ATOMIC_REASON], [promotion.atomicGroupId, AGENT_WORKSPACE_ATOMIC_REASON]]);
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
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
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

  it('refuses before anything is recorded: profile not enabled, a selection not of the primary manuscript, and the dialogue route', async () => {
    const store = await openStore();
    const dialogues = localOwner(store);
    const workspace = new AgentWorkspace(store, dialogues);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '工作区未启用');
      const selection = paragraphHolding(store, book, FIRST_ANCHOR);
      const before = rowCounts();
      const closed = await workspace.inspect(book.bookId);
      expect(closed).toMatchObject({ available: false, unavailableReason: AGENT_WORKSPACE_UNAVAILABLE_REASON, proposal: null });
      expect(await refusal(() => workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION })))
        .toEqual({ code: 'AGENT_WORKSPACE_UNAVAILABLE', message: AGENT_WORKSPACE_UNAVAILABLE_REASON });
      expect(changedTables(before, rowCounts())).toEqual({});

      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      const pinned = rowCounts();
      expect((await refusal(() => workspace.propose(book.bookId, { selection: { ...selection, manuscriptId: randomUUID() }, instruction: SET_INSTRUCTION }))).code)
        .toBe('AGENT_WORKSPACE_SCOPE');
      // A launch with no dialogue route refuses as the dialogue does.
      const unbound = new AgentWorkspace(store, new DialogueExecutionOwner({ records: store, fixture: null, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live: null }));
      expect((await refusal(() => unbound.propose(book.bookId, { selection, instruction: SET_INSTRUCTION }))).code).toBe('DIALOGUE_ROUTE_UNAVAILABLE');
      expect(changedTables(pinned, rowCounts())).toEqual({});
    } finally {
      await dialogues.dispose();
    }
  });

  it('refuses a Book that is not exact sample1 under developer-live with the dialogue route refusal, sending nothing', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-agent-workspace-cache-'));
    const store = await openStore();
    try {
      const path = join(roots.inputRoot, 'composed-agent-workspace.docx');
      await composeManuscriptDocx(path, { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '工作区来源' });
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '工作区来源' }, false);
      const book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID() });
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
      let sent = 0;
      const nativeFetch = (async () => { sent += 1; throw new Error('nothing may be sent'); }) as unknown as typeof fetch;
      const live = dialogueLiveRoute(
        { launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 }, providerCacheRoot: cacheRoot, validation: null }, nativeFetch },
        policy, { resolve: async () => 'placeholder-development-key' },
      );
      expect(live.route).not.toBeNull();
      const workspace = new AgentWorkspace(store, new DialogueExecutionOwner({ records: store, fixture: null, sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY), live }));
      const selection = paragraphHolding(store, book, '');
      const before = rowCounts();
      const refused = await refusal(() => workspace.propose(book.bookId, { selection, instruction: SET_INSTRUCTION }));
      expect(refused.code).toBe('DIALOGUE_ROUTE_UNAVAILABLE');
      expect(refused.message).toMatch(/公开样书范围/u);
      expect(changedTables(before, rowCounts())).toEqual({});
      expect(sent).toBe(0);
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });
});
