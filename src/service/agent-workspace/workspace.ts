import { randomUUID } from 'node:crypto';
import { UUID_PATTERN } from '../analysis/canonical.js';
import type { ProducedEditorialMarkInput } from '../editorial-marks.js';
import type { EditorialStore } from '../store.js';
import type { DialogueExecutionOwner } from '../dialogue/dialogue-execution.js';
import type { DialogueOutcome } from '../dialogue/dialogue-ledger.js';
import type {
  AgentWorkspaceProjection,
  AgentWorkspacePromotionProjection,
  AgentWorkspaceProposalProjection,
  AgentWorkspaceProposalSetInput,
  ProposeAgentWorkspaceChangeSetInput,
} from '../../shared/protocol.js';
import { AGENT_WORKSPACE_CAPABILITIES } from './capabilities.js';
import { readAgentWorkspaceAnswer } from './change-set.js';

/**
 * The Book-bound Agent 工作区 as the service holds it (Issue #90, wave 13 slice 13a; ADR 0045 "Book-bound presentation and
 * Apply", UI ADR 0015; V2-UX-AGENT-001 to 004, APREP-001): one bounded editor journey — propose a change set over a selected
 * range — and nothing more.
 *
 * The workspace opens for a Book only when that Book's editorial workspace profile is enabled at Revision 2 of its authority
 * sidecar. Looking at it writes nothing. One proposal round is one dialogue turn of the `editorial-dialogue` kind on the
 * dialogue's own owners — the selected words verified as a dialogue's are, the route the selected policy admits for the
 * dialogue, its refusals unchanged — under the workspace fragment of the dialogue contract; its dialogue Task is the one
 * record the round writes. What the answer proposes is held here, in memory, as candidates anchored inside the selection —
 * not marks. 提交为修改建议 turns the whole set into 修改建议 marks through the produced-mark path, one atomic group when there
 * are two or more; the editor then decides and applies them only through the existing Mark Cards, proposal workspace and
 * Apply, which this module never calls. 放弃 forgets the round and records nothing. A restart forgets every held round.
 */
export type AgentWorkspaceStore = Pick<EditorialStore,
  'inspectEditorialWorkspaceProfile' | 'getBookOverview' | 'dialogueSourceDigest' | 'askAboutSelection' | 'createProducedEditorialMarks'>;
export type AgentWorkspaceDialogues = Pick<DialogueExecutionOwner, 'requireReady' | 'beginWorkspaceTurn' | 'stop'>;

/** The label every workspace mark carries as its source, beside the dialogue Task of the turn it came from. */
export const AGENT_WORKSPACE_MARK_SOURCE_LABEL = 'Agent 工作区';
/** What an atomic group of a promoted change set says partial acceptance would cause. */
export const AGENT_WORKSPACE_ATOMIC_REASON = 'Agent 工作区变更集';
/** The one-sentence prerequisite of a Book whose profile is not enabled at Revision 2. */
export const AGENT_WORKSPACE_UNAVAILABLE_REASON = '在「工作概览」的编辑工作区方案中为本图书启用 Revision 2 后，才能打开 Agent 工作区。';
/** The longest quotation a workspace mark's basis keeps, in characters. */
const BASIS_QUOTE_CHARACTERS = 200;

export class AgentWorkspaceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AgentWorkspaceError';
  }
}

function require(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AgentWorkspaceError(code, message);
}

interface HeldRound {
  readonly proposalSetId: string;
  readonly bookId: string;
  readonly dialogueId: string;
  readonly attemptId: string;
  readonly instruction: string;
  readonly selection: AgentWorkspaceProposalProjection['selection'];
  readonly startedAt: string;
  state: AgentWorkspaceProposalProjection['state'];
  candidates: AgentWorkspaceProposalProjection['candidates'];
  dropped: AgentWorkspaceProposalProjection['dropped'];
  label: string;
}

function roundProjection(round: HeldRound): AgentWorkspaceProposalProjection {
  return {
    proposalSetId: round.proposalSetId,
    dialogueId: round.dialogueId,
    state: round.state,
    instruction: round.instruction,
    selection: round.selection,
    candidates: round.candidates,
    dropped: round.dropped,
    label: round.label,
    startedAt: round.startedAt,
  };
}

/** What a settled turn leaves the round, in the editor's words. */
function settledRound(round: HeldRound, outcome: DialogueOutcome, streamed: string): Pick<HeldRound, 'state' | 'candidates' | 'dropped' | 'label'> {
  if (outcome !== 'completed') {
    return {
      state: 'failed', candidates: [], dropped: [],
      label: outcome === 'stopped' ? '这轮提议已停止；没有可提交的提议。' : '这轮提议没有完成；没有可提交的提议。可以放弃后重新提出。',
    };
  }
  const reading = readAgentWorkspaceAnswer(streamed, round.selection.text);
  if (reading.kind === 'withheld') return { state: 'failed', candidates: [], dropped: [], label: `${reading.reason}；没有可提交的提议。` };
  const candidates = reading.candidates.map((candidate) => ({
    ordinal: candidate.ordinal,
    anchor: {
      blockId: round.selection.blockId,
      fromGrapheme: round.selection.fromGrapheme + candidate.fromGrapheme,
      toGrapheme: round.selection.fromGrapheme + candidate.toGrapheme,
      text: candidate.anchor,
    },
    proposedText: candidate.proposedText,
    rationale: candidate.rationale,
  }));
  const notOffered = reading.dropped.length === 0 ? '' : `另有 ${reading.dropped.length} 项不在所选范围内或不合格式，没有提供。`;
  const label = candidates.length > 0
    ? `提出了 ${candidates.length} 项修改；它们还不是修改建议，提交后在修改建议卡上由你决定。${notOffered}`
    : reading.dropped.length > 0
      ? `模型给出的 ${reading.dropped.length} 项提议都没有提供；没有可提交的提议。`
      : '这段文字没有需要修改的地方；没有可提交的提议。';
  return { state: 'ready', candidates, dropped: reading.dropped, label };
}

export class AgentWorkspace {
  readonly #store: AgentWorkspaceStore;
  readonly #dialogues: AgentWorkspaceDialogues;
  readonly #now: () => Date;
  /** The one round each Book holds, by Book. */
  readonly #rounds = new Map<string, HeldRound>();

  constructor(store: AgentWorkspaceStore, dialogues: AgentWorkspaceDialogues, now: () => Date = () => new Date()) {
    this.#store = store;
    this.#dialogues = dialogues;
    this.#now = now;
  }

  /** Whether the Book's profile opens the workspace: enabled for this Book and pinned at Revision 2. A read. */
  async #available(bookId: string): Promise<boolean> {
    require(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    const profile = await this.#store.inspectEditorialWorkspaceProfile(bookId);
    return profile.lifecycle.enabledForCurrentBook && profile.sidecar.activeRevision === 2;
  }

  async #requireAvailable(bookId: string): Promise<void> {
    require(await this.#available(bookId), 'AGENT_WORKSPACE_UNAVAILABLE', AGENT_WORKSPACE_UNAVAILABLE_REASON);
  }

  /** The workspace as the editor reads it: whether it opens, what it may do, and the round it holds. Nothing is written. */
  async inspect(bookId: string): Promise<AgentWorkspaceProjection> {
    const available = await this.#available(bookId);
    const round = this.#rounds.get(bookId);
    return {
      bookId,
      available,
      unavailableReason: available ? null : AGENT_WORKSPACE_UNAVAILABLE_REASON,
      capabilities: AGENT_WORKSPACE_CAPABILITIES,
      proposal: round === undefined ? null : roundProjection(round),
    };
  }

  /**
   * One proposal round: the selected words of the Book's primary manuscript and the editor's instruction, sent as one
   * dialogue turn under the workspace fragment. Refused before anything is recorded when the workspace does not open, the
   * words are not the primary manuscript's, a round is already held, or the dialogue's route refuses them.
   */
  async propose(bookId: string, input: ProposeAgentWorkspaceChangeSetInput): Promise<AgentWorkspaceProjection> {
    require(input !== null && typeof input === 'object' && input.selection !== null && typeof input.selection === 'object',
      'AGENT_WORKSPACE_SELECTION_INVALID', '所选文字无效。');
    await this.#requireAvailable(bookId);
    const held = this.#rounds.get(bookId);
    require(held === undefined || held.state === 'failed', 'AGENT_WORKSPACE_ROUND_HELD', '这本书已有一组提议；先提交为修改建议或放弃，再提出新的一组。');
    const anchor = this.#store.getBookOverview(bookId).manuscriptAnchor;
    require(anchor !== null && anchor.manuscriptId === input.selection.manuscriptId && anchor.branchId === input.selection.branchId,
      'AGENT_WORKSPACE_SCOPE', '只能就本书主稿件的当前修订版提出变更集。');
    this.#dialogues.requireReady(this.#store.dialogueSourceDigest(bookId, input.selection));
    const turn = this.#store.askAboutSelection(bookId, { selection: input.selection, question: input.instruction }, this.#now());
    const round: HeldRound = {
      proposalSetId: randomUUID(),
      bookId,
      dialogueId: turn.dialogueId,
      attemptId: turn.attemptId,
      instruction: turn.message.question,
      selection: {
        manuscriptId: input.selection.manuscriptId,
        branchId: input.selection.branchId,
        blockId: input.selection.blockId,
        fromGrapheme: input.selection.fromGrapheme,
        toGrapheme: input.selection.toGrapheme,
        text: turn.message.selection,
      },
      startedAt: this.#now().toISOString(),
      state: 'proposing',
      candidates: [],
      dropped: [],
      label: '正在提出变更集…',
    };
    this.#rounds.set(bookId, round);
    try {
      this.#dialogues.beginWorkspaceTurn({
        ...turn,
        settled: (outcome, streamed) => {
          // A round discarded or replaced meanwhile takes nothing from its answer.
          if (this.#rounds.get(bookId) === round) Object.assign(round, settledRound(round, outcome, streamed));
        },
      });
    } catch (error) {
      this.#rounds.delete(bookId);
      throw error;
    }
    return this.inspect(bookId);
  }

  /**
   * 提交为修改建议: every candidate of the held round becomes a 修改建议 mark on the words it anchors, attributed to the round's
   * dialogue Task — together, in one transaction, and in one atomic group when there are two or more. Words the manuscript no
   * longer holds at an anchor refuse the whole set, and nothing is written. Nothing is decided or applied.
   */
  async promote(bookId: string, input: AgentWorkspaceProposalSetInput): Promise<AgentWorkspacePromotionProjection> {
    const round = this.#requireRound(bookId, input);
    require(round.state === 'ready' && round.candidates.length > 0, 'AGENT_WORKSPACE_NOTHING_TO_PROMOTE', '这组提议还没有可提交的修改。');
    await this.#requireAvailable(bookId);
    const atomicGroupId = round.candidates.length >= 2 ? randomUUID() : null;
    const inputs: ProducedEditorialMarkInput[] = round.candidates.map((candidate) => ({
      manuscriptId: round.selection.manuscriptId,
      branchId: round.selection.branchId,
      blockId: candidate.anchor.blockId,
      fromGrapheme: candidate.anchor.fromGrapheme,
      toGrapheme: candidate.anchor.toGrapheme,
      pinnedText: candidate.anchor.text,
      kind: 'change-suggestion',
      body: '',
      proposedText: candidate.proposedText,
      rationale: candidate.rationale,
      atomicGroupId,
      atomicReason: atomicGroupId === null ? null : AGENT_WORKSPACE_ATOMIC_REASON,
      source: { kind: 'ai7', origin: 'task', label: AGENT_WORKSPACE_MARK_SOURCE_LABEL, taskId: round.dialogueId },
      basis: [{
        label: `${AGENT_WORKSPACE_MARK_SOURCE_LABEL} · 第 ${candidate.ordinal} 项`,
        blockId: candidate.anchor.blockId,
        fromGrapheme: candidate.anchor.fromGrapheme,
        toGrapheme: candidate.anchor.toGrapheme,
        quote: [...candidate.anchor.text].length > BASIS_QUOTE_CHARACTERS ? `${[...candidate.anchor.text].slice(0, BASIS_QUOTE_CHARACTERS).join('')}…` : candidate.anchor.text,
      }],
    }));
    const markIds = this.#store.createProducedEditorialMarks(inputs, (placed) => {
      // A set is one change: when any of its words moved, none of it is placed (the transaction rolls back).
      require(placed.every((markId) => markId !== null), 'MARK_ANCHOR_CHANGED', '所选文字已改动；这组提议没有新建修改建议，可以放弃后重新提出。');
      return placed as ReadonlyArray<string>;
    });
    this.#rounds.delete(bookId);
    return {
      bookId,
      markIds,
      atomicGroupId,
      manuscriptId: round.selection.manuscriptId,
      branchId: round.selection.branchId,
      label: atomicGroupId === null
        ? '已新建 1 条修改建议：它不会自动应用，是否接受由你决定。'
        : `已新建 ${markIds.length} 条修改建议，同属一个变更集，需要整体处理：它们不会自动应用，是否接受由你决定。`,
      workspace: await this.inspect(bookId),
    };
  }

  /** 放弃这组提议: the held round is forgotten — an answer still arriving is stopped first — and nothing else is recorded. */
  async discard(bookId: string, input: AgentWorkspaceProposalSetInput): Promise<AgentWorkspaceProjection> {
    const round = this.#requireRound(bookId, input);
    this.#rounds.delete(bookId);
    if (round.state === 'proposing') await this.#dialogues.stop(round.attemptId);
    return this.inspect(bookId);
  }

  #requireRound(bookId: string, input: AgentWorkspaceProposalSetInput): HeldRound {
    require(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
    require(input !== null && typeof input === 'object' && typeof input.proposalSetId === 'string' && UUID_PATTERN.test(input.proposalSetId),
      'AGENT_WORKSPACE_ROUND_NOT_FOUND', '这组提议已不在工作区中。');
    const round = this.#rounds.get(bookId);
    require(round !== undefined && round.proposalSetId === input.proposalSetId, 'AGENT_WORKSPACE_ROUND_NOT_FOUND', '这组提议已不在工作区中。');
    return round;
  }
}
