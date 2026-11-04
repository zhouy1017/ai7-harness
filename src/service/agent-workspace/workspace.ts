import { WORKSPACE_SERVICE_WORDS as words } from './agent-workspace-labels.js';
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

/** Book-scoped change-set rounds, streamed through the dialogue execution owner but isolated from prose dialogues.
 * Exact selections may span paragraphs. Each candidate stays inside one paragraph and becomes an independent mark only
 * when the editor submits it; this owner never applies manuscript changes. A completed round can be refined immediately.
 */
export type AgentWorkspaceStore = Pick<EditorialStore,
  'getBookOverview' | 'dialogueSourceDigest' | 'askAboutSelection' | 'createProducedEditorialMarks'>;
export type AgentWorkspaceDialogues = Pick<DialogueExecutionOwner, 'requireReady' | 'beginWorkspaceTurn' | 'stop'>;

/** The label every workspace mark carries as its source, beside the dialogue Task of the turn it came from. */
export const AGENT_WORKSPACE_MARK_SOURCE_LABEL = words.source;
/** The reason an unavailable Book cannot be opened. */
export const AGENT_WORKSPACE_UNAVAILABLE_REASON = words.unavailable;
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
  streamedCharacters: number;
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
    streamedCharacters: round.streamedCharacters,
  };
}

/** What a settled turn leaves the round, in the editor's words. */
function settledRound(round: HeldRound, outcome: DialogueOutcome, streamed: string): Pick<HeldRound, 'state' | 'candidates' | 'dropped' | 'label'> {
  const incomplete = outcome !== 'completed';
  const reading = readAgentWorkspaceAnswer(streamed, round.selection.text, true);
  if (reading.kind === 'withheld') return incomplete && round.candidates.length > 0
    ? { state: 'ready', candidates: round.candidates, dropped: round.dropped, label: '回答未完成；已收到的提议已保留。' }
    : { state: 'failed', candidates: [], dropped: [], label: words.withheld(reading.reason) };
  const pins = round.selection.span ?? [{ blockId: round.selection.blockId, fromGrapheme: round.selection.fromGrapheme,
    toGrapheme: round.selection.toGrapheme }];
  let offset = 0;
  const locations = pins.map((pin) => {
    const start = offset;
    offset += pin.toGrapheme - pin.fromGrapheme + 1;
    return { pin, start, end: offset - 1 };
  });
  const dropped = [...reading.dropped];
  const candidates = reading.candidates.flatMap((candidate) => {
    const location = locations.find((entry) => candidate.fromGrapheme >= entry.start && candidate.toGrapheme <= entry.end);
    if (location === undefined) {
      dropped.push({ ordinal: candidate.ordinal, reason: '这项修改跨过段落边界，请分段提出。' });
      return [];
    }
    return [{
      ordinal: candidate.ordinal,
      anchor: {
        blockId: location.pin.blockId,
        fromGrapheme: location.pin.fromGrapheme + candidate.fromGrapheme - location.start,
        toGrapheme: location.pin.fromGrapheme + candidate.toGrapheme - location.start,
        text: candidate.anchor,
      },
      proposedText: candidate.proposedText,
      rationale: candidate.rationale,
    }];
  });
  const notOffered = dropped.length === 0 ? '' : words.notOffered(dropped.length);
  const label = candidates.length > 0
    ? words.offered(candidates.length, notOffered)
    : dropped.length > 0
      ? words.allDropped(dropped.length)
      : words.empty;
  return { state: 'ready', candidates, dropped, label: incomplete ? `${label} 回答未完成。` : label };
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

  /** Validate the Book without requiring a separately installed profile. */
  async #available(bookId: string): Promise<boolean> {
    require(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', words.invalidBook);
    this.#store.getBookOverview(bookId);
    return true;
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
   * words are not the primary manuscript's, a round is still generating, or the dialogue's route refuses them.
   */
  async propose(bookId: string, input: ProposeAgentWorkspaceChangeSetInput): Promise<AgentWorkspaceProjection> {
    require(input !== null && typeof input === 'object' && input.selection !== null && typeof input.selection === 'object',
      'AGENT_WORKSPACE_SELECTION_INVALID', words.invalidSelection);
    await this.#requireAvailable(bookId);
    const held = this.#rounds.get(bookId);
    require(held?.state !== 'proposing', 'AGENT_WORKSPACE_ROUND_HELD', words.held);
    const anchor = this.#store.getBookOverview(bookId).manuscriptAnchor;
    require(anchor !== null && anchor.manuscriptId === input.selection.manuscriptId && anchor.branchId === input.selection.branchId,
      'AGENT_WORKSPACE_SCOPE', words.scope);
    this.#dialogues.requireReady(this.#store.dialogueSourceDigest(bookId, input.selection));
    const turn = this.#store.askAboutSelection(bookId, { selection: input.selection, question: input.instruction }, this.#now(), 'agent-workspace');
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
        ...(input.selection.span === undefined ? {} : { span: input.selection.span }),
      },
      startedAt: this.#now().toISOString(),
      state: 'proposing',
      candidates: [],
      dropped: [],
      label: words.proposing,
      streamedCharacters: 0,
    };
    this.#rounds.set(bookId, round);
    try {
      this.#dialogues.beginWorkspaceTurn({
        ...turn,
        ...(held?.state === 'ready' && held.candidates.length > 0 ? { message: { ...turn.message, followUp: true as const,
          kept: `上一轮修改要求：${held.instruction}\n上一轮提议：${JSON.stringify(held.candidates.map((candidate) => ({
            anchor: candidate.anchor.text, proposedText: candidate.proposedText, rationale: candidate.rationale,
          })))}` } } : {}),
        progress: (streamed) => {
          if (this.#rounds.get(bookId) === round) {
            const preview = settledRound(round, 'completed', streamed);
            if (preview.state === 'ready') { round.candidates = preview.candidates; round.dropped = preview.dropped; }
            round.streamedCharacters = [...streamed].length;
            round.label = `正在提出变更集…已收到 ${round.streamedCharacters} 字`;
          }
        },
        settled: (outcome, streamed) => {
          // A round discarded or replaced meanwhile takes nothing from its answer.
          if (this.#rounds.get(bookId) === round) Object.assign(round, settledRound(round, outcome, streamed));
        },
      });
    } catch (error) {
      if (held === undefined) this.#rounds.delete(bookId);
      else this.#rounds.set(bookId, held);
      throw error;
    }
    return this.inspect(bookId);
  }

  /**
   * 提交为修改建议: every candidate of the held round becomes a 修改建议 mark on the words it anchors, attributed to the round's
   * workspace Task — together in one transaction, independently decidable on their cards. Moved anchors are disclosed
   * and skipped; if none remain placeable the round stays available and promotion refuses. Nothing is decided or applied.
   */
  async promote(bookId: string, input: AgentWorkspaceProposalSetInput): Promise<AgentWorkspacePromotionProjection> {
    const round = this.#requireRound(bookId, input);
    require(round.state === 'ready' && round.candidates.length > 0, 'AGENT_WORKSPACE_NOTHING_TO_PROMOTE', words.nothingToPromote);
    await this.#requireAvailable(bookId);
    const atomicGroupId = null;
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
      atomicReason: null,
      source: { kind: 'ai7', origin: 'task', label: AGENT_WORKSPACE_MARK_SOURCE_LABEL, taskId: round.dialogueId },
      basis: [{
        label: words.basis(candidate.ordinal),
        blockId: candidate.anchor.blockId,
        fromGrapheme: candidate.anchor.fromGrapheme,
        toGrapheme: candidate.anchor.toGrapheme,
        quote: [...candidate.anchor.text].length > BASIS_QUOTE_CHARACTERS ? `${[...candidate.anchor.text].slice(0, BASIS_QUOTE_CHARACTERS).join('')}…` : candidate.anchor.text,
      }],
    }));
    let moved = 0;
    const markIds = this.#store.createProducedEditorialMarks(inputs, (placed) => {
      moved = placed.filter((markId) => markId === null).length;
      const kept = placed.filter((markId): markId is string => markId !== null);
      if (kept.length === 0) {
        round.label = `${words.changed} ${moved} 项原文位置已变动，未放置。`;
        require(false, 'AGENT_WORKSPACE_NOTHING_TO_PROMOTE', round.label);
      }
      return kept;
    });
    this.#rounds.delete(bookId);
    return {
      bookId,
      markIds,
      atomicGroupId,
      manuscriptId: round.selection.manuscriptId,
      branchId: round.selection.branchId,
      label: `${markIds.length === 1 ? words.promotedOne : words.promotedGroup(markIds.length)}${moved > 0 ? ` 另有 ${moved} 项原文位置已变动，未放置。` : ''}`,
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
    require(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', words.invalidBook);
    require(input !== null && typeof input === 'object' && typeof input.proposalSetId === 'string' && UUID_PATTERN.test(input.proposalSetId),
      'AGENT_WORKSPACE_ROUND_NOT_FOUND', words.missing);
    const round = this.#rounds.get(bookId);
    require(round !== undefined && round.proposalSetId === input.proposalSetId, 'AGENT_WORKSPACE_ROUND_NOT_FOUND', words.missing);
    return round;
  }
}
