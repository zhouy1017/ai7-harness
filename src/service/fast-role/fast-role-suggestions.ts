import { randomUUID } from 'node:crypto';
import { UUID_PATTERN } from '../analysis/canonical.js';
import type { ProducedEditorialMarkInput } from '../editorial-marks.js';
import { PROPOSAL_CONFLICT_REGENERATION_SCHEMA, type ProposalConflictRegenerationLineage } from '../proposal-conflicts.js';
import type { EditorialStore } from '../store.js';
import { initialResolutions, type ConflictUnitResolution } from '../../shared/conflict-units.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import {
  MAX_DIALOGUE_SELECTION_GRAPHEMES,
  type DialogueSelectionInput,
  type EditorialPolishProjection,
  type FastInteractionRequestProjection,
  type FastInteractionRoutesProjection,
  type PolishSelectionInput,
  type ProposalConflictProjection,
  type ProposalConflictRegenerationProjection,
  type RegenerateProposalConflictUnitInput,
} from '../../shared/protocol.js';
import {
  CONFLICT_REGENERATE_CONTEXT_GRAPHEMES,
  CONFLICT_REGENERATE_CONTRACT_VERSION,
  CONFLICT_REGENERATE_KIND,
  CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST,
  buildConflictRegenerateMessage,
  conflictRegenerateRegionDigest,
  conflictRegenerateRequestDigest,
  holdsConflictRegenerateMarks,
  readConflictRegenerateAnswer,
  type ConflictRegenerateMessageInput,
} from './conflict-regenerate-contract.js';
import { FastRoleError } from './fast-role-error.js';
import type { FastRoleExecutionOwner } from './fast-role-execution.js';
import {
  EDITORIAL_POLISH_CONTEXT_GRAPHEMES,
  EDITORIAL_POLISH_KIND,
  buildEditorialPolishMessage,
  holdsEditorialPolishMarks,
  readEditorialPolishAnswer,
} from './polish-contract.js';

/**
 * 润色这段 and 基于当前稿件重新生成建议 as the service runs them (Issue #842): the words are read from the working state as the
 * editor saw it and checked before anything is sent; the one request then runs beside the service's request loop — a live
 * model may take longer than one service request may — and the surface reads it again until it settles. What the answer
 * offers becomes a Suggestion through the existing owners — 修改建议 marks through the produced-mark path, a Resolution Draft
 * through 稿件冲突 — each re-checked against the working state when it is written. Nothing is accepted, applied or sent again
 * on its own.
 */
export type FastRoleStore = Pick<EditorialStore,
  'getManuscriptWindowAt' | 'dialogueSourceDigest' | 'createProducedEditorialMarks' | 'inspectProposalConflict' | 'saveRegeneratedProposalConflictDraft'>;

/** The label every 润色这段 mark carries as its source, beside the polish task it came from. */
export const EDITORIAL_POLISH_MARK_SOURCE_LABEL = '润色这段';
/** The longest quotation a polish mark's basis keeps, in characters. */
const BASIS_QUOTE_CHARACTERS = 200;
/** How many settled requests the service remembers for the surfaces to read; the marks and drafts themselves are durable. */
const REMEMBERED_REQUESTS = 64;

function require(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new FastRoleError(code, message);
}

/**
 * Whether 润色这段 and 基于当前稿件重新生成建议 can be asked for this Book under this launch, and why not: the launch's route for
 * each kind. Whether the exact words may be sent — an admitted Public SampleBook's under developer-live — is decided again
 * when they are asked, from the revision they are read in.
 */
export function fastInteractionRoutes(owner: FastRoleExecutionOwner, bookId: string): FastInteractionRoutesProjection {
  require(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
  const of = (kindId: typeof EDITORIAL_POLISH_KIND | typeof CONFLICT_REGENERATE_KIND): { available: boolean; reason: string | null } => {
    const reason = owner.refusal(kindId);
    return { available: reason === null, reason };
  };
  return { bookId, editorialPolish: of(EDITORIAL_POLISH_KIND), conflictRegenerate: of(CONFLICT_REGENERATE_KIND) };
}

/** The selected words as the working state holds them now, with the bounded window of their paragraph around them. */
function verifiedSelection(store: FastRoleStore, bookId: string, selection: DialogueSelectionInput): { before: string; text: string; after: string } {
  require(selection !== null && typeof selection === 'object' && typeof selection.manuscriptId === 'string' && UUID_PATTERN.test(selection.manuscriptId) &&
    typeof selection.branchId === 'string' && UUID_PATTERN.test(selection.branchId) && typeof selection.blockId === 'string' &&
    typeof selection.selectedText === 'string' && Number.isSafeInteger(selection.fromGrapheme) && Number.isSafeInteger(selection.toGrapheme) &&
    Number.isSafeInteger(selection.expectedJournalSequence), 'POLISH_SELECTION_INVALID', '所选文字无效。');
  const window = store.getManuscriptWindowAt(selection.manuscriptId, selection.branchId, { kind: 'block', blockId: selection.blockId });
  require(window.bookId === bookId, 'POLISH_SELECTION_INVALID', '所选文字不在这本书的稿件中。');
  require(window.revisionId === selection.baseRevisionId && window.journalSequence === selection.expectedJournalSequence,
    'MARK_BINDING_CHANGED', '稿件已有新的写入，请重新选择文字。');
  const block = window.blocks.find((candidate) => candidate.blockId === selection.blockId);
  require(block !== undefined && block.digest === selection.baseBlockDigest, 'MARK_ANCHOR_CHANGED', '所选文字已不在当前稿件中；请重新选择。');
  const parts = graphemesOf(block.text);
  require(selection.fromGrapheme >= 0 && selection.fromGrapheme < selection.toGrapheme && selection.toGrapheme <= parts.length &&
    parts.slice(selection.fromGrapheme, selection.toGrapheme).join('') === selection.selectedText, 'MARK_ANCHOR_CHANGED', '所选文字已不在当前稿件中；请重新选择。');
  require(selection.toGrapheme - selection.fromGrapheme <= MAX_DIALOGUE_SELECTION_GRAPHEMES, 'POLISH_SELECTION_TOO_LONG',
    `所选文字最多 ${MAX_DIALOGUE_SELECTION_GRAPHEMES} 个字；请选短一些再润色。`);
  return polishWordsOf(block.text, selection.fromGrapheme, selection.toGrapheme);
}

/** The words 润色这段 sends for a range of one block: the selection and the bounded window of the paragraph around it. */
export function polishWordsOf(blockText: string, fromGrapheme: number, toGrapheme: number): { before: string; text: string; after: string } {
  const parts = graphemesOf(blockText);
  return {
    before: parts.slice(Math.max(0, fromGrapheme - EDITORIAL_POLISH_CONTEXT_GRAPHEMES), fromGrapheme).join(''),
    text: parts.slice(fromGrapheme, toGrapheme).join(''),
    after: parts.slice(toGrapheme, toGrapheme + EDITORIAL_POLISH_CONTEXT_GRAPHEMES).join(''),
  };
}

/** A polish request checked and ready to send. */
interface PreparedPolish {
  readonly bookId: string;
  readonly taskId: string;
  readonly selection: DialogueSelectionInput;
  readonly words: { readonly before: string; readonly text: string; readonly after: string };
}

/** Everything 润色这段 checks before it sends: the route, the Book's source, and the selected words as they stand now. */
function preparePolish(owner: FastRoleExecutionOwner, store: FastRoleStore, bookId: string, input: PolishSelectionInput): PreparedPolish {
  require(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
  require(input !== null && typeof input === 'object' && input.selection !== null && typeof input.selection === 'object', 'POLISH_SELECTION_INVALID', '所选文字无效。');
  const selection = input.selection;
  owner.requireReady(EDITORIAL_POLISH_KIND, store.dialogueSourceDigest(bookId, selection));
  const words = verifiedSelection(store, bookId, selection);
  require(!holdsEditorialPolishMarks(words.before) && !holdsEditorialPolishMarks(words.text) && !holdsEditorialPolishMarks(words.after),
    'POLISH_SELECTION_INVALID', '所选文字或它前后的文字含有「【所选文字】」这类标记，不能润色。');
  return { bookId, taskId: randomUUID(), selection, words };
}

function polishProjection(prepared: Pick<PreparedPolish, 'bookId' | 'taskId'>, state: EditorialPolishProjection['state'], label: string,
  extra: Partial<EditorialPolishProjection> = {}): EditorialPolishProjection {
  return { bookId: prepared.bookId, taskId: prepared.taskId, state, markIds: [], withheld: [], outcomeUnknown: false, label, ...extra };
}

/**
 * 润色这段's request (Issue #842): the selected words and the bounded window of their paragraph go to the Fast Interaction Role;
 * each anchored replacement the answer offers becomes an open 修改建议 on the words it replaces, attributed to this polish task.
 * A suggestion outside the contract, or whose words no longer stand where they were, is withheld with why.
 */
async function finishPolish(owner: FastRoleExecutionOwner, store: FastRoleStore, prepared: PreparedPolish): Promise<EditorialPolishProjection> {
  const { selection, words, taskId } = prepared;
  const answer = await owner.ask(EDITORIAL_POLISH_KIND, buildEditorialPolishMessage({ before: words.before, selection: words.text, after: words.after }), 'ask');
  if (answer.kind === 'failed') return polishProjection(prepared, 'failed', answer.message, { outcomeUnknown: answer.outcomeUnknown });
  const reading = readEditorialPolishAnswer(answer.text, words.text);
  if (reading.kind === 'withheld') return polishProjection(prepared, 'withheld', `${reading.reason}；没有新建修改建议。`);
  const inputs: ProducedEditorialMarkInput[] = reading.suggestions.map((suggestion) => {
    const fromGrapheme = selection.fromGrapheme + suggestion.fromGrapheme;
    const toGrapheme = selection.fromGrapheme + suggestion.toGrapheme;
    const quote = [...suggestion.original].length > BASIS_QUOTE_CHARACTERS ? `${[...suggestion.original].slice(0, BASIS_QUOTE_CHARACTERS).join('')}…` : suggestion.original;
    return {
      manuscriptId: selection.manuscriptId,
      branchId: selection.branchId,
      blockId: selection.blockId,
      fromGrapheme,
      toGrapheme,
      pinnedText: suggestion.original,
      kind: 'change-suggestion',
      body: '',
      proposedText: suggestion.replacement,
      rationale: suggestion.reason,
      atomicGroupId: null,
      source: { kind: 'ai7', origin: 'task', label: EDITORIAL_POLISH_MARK_SOURCE_LABEL, taskId },
      basis: [{ label: EDITORIAL_POLISH_MARK_SOURCE_LABEL, blockId: selection.blockId, fromGrapheme, toGrapheme, quote }],
    };
  });
  // Written together, each re-checked against the working state now: words the editor changed meanwhile take no mark.
  const placed = inputs.length === 0 ? [] : store.createProducedEditorialMarks(inputs, (markIds) => [...markIds]);
  const markIds: string[] = [];
  const withheld = [...reading.withheld];
  placed.forEach((markId, index) => {
    if (markId === null) withheld.push({ ordinal: reading.suggestions[index]!.ordinal, reason: '所选文字已改动，这条建议没有放到稿件上' });
    else markIds.push(markId);
  });
  withheld.sort((left, right) => left.ordinal - right.ordinal);
  const notOffered = withheld.length === 0 ? '' : `另有 ${withheld.length} 条建议没有提供。`;
  if (markIds.length > 0) {
    return polishProjection(prepared, 'suggested', `已新建 ${markIds.length} 条修改建议：它们不会自动应用，是否接受由你决定。${notOffered}`, { markIds, withheld });
  }
  if (withheld.length > 0) return polishProjection(prepared, 'withheld', `模型给出的 ${withheld.length} 条建议都没有提供；没有新建修改建议。`, { withheld });
  return polishProjection(prepared, 'nothing-to-suggest', '这段文字没有需要润色的地方；没有新建修改建议。');
}

/** The current manuscript's words on each side of one unit, bounded, as the regeneration sends them. */
export function unitContext(conflict: ProposalConflictProjection, unitIndex: number): { before: string; after: string } {
  const before = graphemesOf(conflict.context.before + conflict.units.slice(0, unitIndex).map((unit) => unit.current).join(''));
  const after = graphemesOf(conflict.units.slice(unitIndex + 1).map((unit) => unit.current).join('') + conflict.context.after);
  return {
    before: before.slice(Math.max(0, before.length - CONFLICT_REGENERATE_CONTEXT_GRAPHEMES)).join(''),
    after: after.slice(0, CONFLICT_REGENERATE_CONTEXT_GRAPHEMES).join(''),
  };
}

/** The words 基于当前稿件重新生成建议 sends for one unit of a conflict as it stands. */
export function regenerationRegionOf(conflict: ProposalConflictProjection, unitIndex: number): ConflictRegenerateMessageInput {
  const unit = conflict.units[unitIndex]!;
  return { intent: conflict.suggestion.rationale, base: unit.base, current: unit.current, proposed: unit.proposed, ...unitContext(conflict, unitIndex) };
}

/** A regeneration checked and ready to send: the conflict it reads, its one unit's words, and the projection it starts as. */
interface PreparedRegeneration {
  readonly conflict: ProposalConflictProjection;
  readonly unitIndex: number;
  readonly region: ConflictRegenerateMessageInput;
  readonly pending: ProposalConflictRegenerationProjection;
}

/** Everything 基于当前稿件重新生成建议 checks before it sends: the basis the editor saw, the unit, the route and the source. */
function prepareRegeneration(owner: FastRoleExecutionOwner, store: FastRoleStore, input: RegenerateProposalConflictUnitInput): PreparedRegeneration {
  require(input !== null && typeof input === 'object' && typeof input.basisDigest === 'string' && Number.isSafeInteger(input.unitIndex),
    'PROPOSAL_CONFLICT_INVALID', '冲突请求无效。');
  const conflict = store.inspectProposalConflict({ manuscriptId: input.manuscriptId, branchId: input.branchId, markId: input.markId });
  require(conflict.basisDigest === input.basisDigest, 'PROPOSAL_CONFLICT_STALE', '稿件又有改动，请重新比较。');
  const unit = conflict.units[input.unitIndex];
  require(unit !== undefined && unit.kind === 'conflict', 'PROPOSAL_CONFLICT_UNIT_INVALID', '只能为一处冲突重新生成建议。');
  const window = store.getManuscriptWindowAt(conflict.manuscriptId, conflict.branchId, { kind: 'block', blockId: conflict.blockId });
  require(window.bookId === conflict.bookId, 'PROPOSAL_CONFLICT_INVALID', '冲突请求无效。');
  // The revision the conflict's words are read in decides whether they may be sent; only these three fields are read.
  const source = { manuscriptId: conflict.manuscriptId, branchId: conflict.branchId, baseRevisionId: window.revisionId } as DialogueSelectionInput;
  owner.requireReady(CONFLICT_REGENERATE_KIND, store.dialogueSourceDigest(conflict.bookId, source));
  const region = regenerationRegionOf(conflict, input.unitIndex);
  require(!Object.values(region).some(holdsConflictRegenerateMarks), 'PROPOSAL_CONFLICT_UNIT_INVALID', '这处冲突的文字含有「【当前稿件】」这类标记，不能重新生成。');
  return {
    conflict,
    unitIndex: input.unitIndex,
    region,
    pending: {
      requestId: randomUUID(), bookId: conflict.bookId, manuscriptId: conflict.manuscriptId, branchId: conflict.branchId, markId: conflict.markId,
      unitIndex: input.unitIndex, outcome: 'requesting', outcomeUnknown: false, label: '正在基于当前稿件重新生成这一处的建议…',
    },
  };
}

/**
 * 基于当前稿件重新生成建议's request (Issue #842): one `conflict` unit's three texts, the suggestion's recorded reason and the
 * bounded current context go to the Fast Interaction Role. Regenerated words that differ from both the current and the old
 * words become the unit's 编辑合并结果 in a new Resolution Draft on exactly the basis the editor saw, the other units as the
 * latest draft on that basis left them; the editor then resolves it through the existing paths. Words identical to the
 * current manuscript or to the old proposal are reported as such and saved nowhere.
 */
async function finishRegeneration(owner: FastRoleExecutionOwner, store: FastRoleStore, prepared: PreparedRegeneration, now: () => Date): Promise<ProposalConflictRegenerationProjection> {
  const { conflict, unitIndex, region } = prepared;
  const unit = conflict.units[unitIndex]!;
  const settled = (outcome: ProposalConflictRegenerationProjection['outcome'], label: string, outcomeUnknown = false): ProposalConflictRegenerationProjection =>
    ({ ...prepared.pending, outcome, outcomeUnknown, label });
  const answer = await owner.ask(CONFLICT_REGENERATE_KIND, buildConflictRegenerateMessage(region), 'unit');
  if (answer.kind === 'failed') return settled('failed', answer.message, answer.outcomeUnknown);
  const reading = readConflictRegenerateAnswer(answer.text);
  if (reading.kind === 'withheld') return settled('withheld', `${reading.reason}；没有改动解决草稿。`);
  if (reading.text === unit.current) return settled('same-as-current', '重新生成的文字与当前稿件相同；没有改动解决草稿。这一处可以直接「采用当前内容」。');
  if (reading.text === unit.proposed) return settled('same-as-proposed', '重新生成的文字与原提议相同；没有改动解决草稿。这一处可以直接「采用提议内容」。');
  const binding = { manuscriptId: conflict.manuscriptId, branchId: conflict.branchId, markId: conflict.markId };
  // The draft the editor may have saved while the request was in flight is the one the regenerated unit joins.
  let latest: ProposalConflictProjection;
  try {
    latest = store.inspectProposalConflict(binding);
  } catch {
    return settled('failed', '这处冲突在重新生成期间已经处理或改动；没有改动解决草稿。');
  }
  if (latest.basisDigest !== conflict.basisDigest) return settled('failed', '稿件在重新生成期间又有改动；没有改动解决草稿，请重新比较后再试。');
  const resolutions: ConflictUnitResolution[] = [...(latest.draft?.resolutions ?? initialResolutions(latest.units))];
  resolutions[unitIndex] = { resolution: 'edited', text: reading.text };
  const lineage: ProposalConflictRegenerationLineage = {
    schema: PROPOSAL_CONFLICT_REGENERATION_SCHEMA,
    kindId: CONFLICT_REGENERATE_KIND,
    contractVersion: CONFLICT_REGENERATE_CONTRACT_VERSION,
    promptContractDigest: CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST,
    requestDigest: conflictRegenerateRequestDigest(CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST, conflictRegenerateRegionDigest(region)),
    unitIndex,
    route: answer.binding.route,
    model: answer.binding.model,
    operationalScope: answer.binding.operationalScope,
    policyRuleId: answer.binding.policyRuleId,
    fixtureSha256: answer.binding.fixtureSha256,
    regeneratedAt: now().toISOString(),
  };
  store.saveRegeneratedProposalConflictDraft({ ...binding, basisDigest: conflict.basisDigest, units: resolutions }, lineage);
  return settled('drafted', '已把重新生成的文字放进解决草稿的这一处；稿件和这条修改建议都没有改动，是否保存为新提案版本由你决定。');
}

type RequestEntry =
  | { readonly kind: 'editorial-polish'; projection: EditorialPolishProjection }
  | { readonly kind: 'conflict-regenerate'; projection: ProposalConflictRegenerationProjection };

/**
 * The fast-role requests of this service's lifetime, by request id: each starts checked, runs its one request beside the
 * request loop and settles here, where the surfaces read it. Only the latest few settled ones are remembered; what they made
 * is durable in the marks and drafts.
 */
export class FastRoleRequests {
  readonly #owner: FastRoleExecutionOwner;
  readonly #store: FastRoleStore;
  readonly #now: () => Date;
  readonly #entries = new Map<string, RequestEntry>();
  readonly #running = new Set<Promise<void>>();

  constructor(owner: FastRoleExecutionOwner, store: FastRoleStore, now: () => Date = () => new Date()) {
    this.#owner = owner;
    this.#store = store;
    this.#now = now;
  }

  /** 润色这段: checked at once — a refusal is thrown before anything is sent — then requested beside the loop. */
  polish(bookId: string, input: PolishSelectionInput): EditorialPolishProjection {
    const prepared = preparePolish(this.#owner, this.#store, bookId, input);
    const entry: RequestEntry = { kind: 'editorial-polish', projection: polishProjection(prepared, 'requesting', '正在润色所选文字…') };
    this.#start(prepared.taskId, entry, async () => {
      entry.projection = await finishPolish(this.#owner, this.#store, prepared);
    }, (message) => { entry.projection = polishProjection(prepared, 'failed', message); });
    return entry.projection;
  }

  /** 基于当前稿件重新生成建议: checked at once, then requested beside the loop. */
  regenerate(input: RegenerateProposalConflictUnitInput): ProposalConflictRegenerationProjection {
    const prepared = prepareRegeneration(this.#owner, this.#store, input);
    const entry: RequestEntry = { kind: 'conflict-regenerate', projection: prepared.pending };
    this.#start(prepared.pending.requestId, entry, async () => {
      entry.projection = await finishRegeneration(this.#owner, this.#store, prepared, this.#now);
    }, (message) => { entry.projection = { ...prepared.pending, outcome: 'failed', label: message }; });
    return entry.projection;
  }

  /** One request of the Book, as it stands. */
  inspect(bookId: string, requestId: string): FastInteractionRequestProjection {
    require(typeof requestId === 'string' && UUID_PATTERN.test(requestId), 'FAST_ROLE_REQUEST_INVALID', '请求标识无效。');
    const entry = this.#entries.get(requestId);
    require(entry !== undefined && entry.projection.bookId === bookId, 'FAST_ROLE_REQUEST_NOT_FOUND', '这次请求已不在本次运行的记录中；生成的修改建议和解决草稿仍在稿件里。');
    return entry.kind === 'editorial-polish' ? { kind: entry.kind, polish: entry.projection } : { kind: entry.kind, regeneration: entry.projection };
  }

  /** Every request in flight has settled (tests and shutdown wait for it). */
  async settled(): Promise<void> {
    await Promise.all([...this.#running]);
  }

  #start(requestId: string, entry: RequestEntry, run: () => Promise<void>, fail: (message: string) => void): void {
    this.#entries.set(requestId, entry);
    const running = run().catch((error: unknown) => {
      // A write the store refused after the answer arrived: nothing of it was kept, and the surface says so.
      fail(error instanceof Error && 'code' in error ? `${(error as Error).message}` : '这次请求没有完成；没有生成任何建议。');
    }).finally(() => {
      this.#running.delete(running);
      this.#forget();
    });
    this.#running.add(running);
  }

  /** Forget the oldest settled requests beyond the remembered few. */
  #forget(): void {
    const settled = [...this.#entries].filter(([, entry]) => entry.kind === 'editorial-polish' ? entry.projection.state !== 'requesting' : entry.projection.outcome !== 'requesting');
    for (const [requestId] of settled.slice(0, Math.max(0, settled.length - REMEMBERED_REQUESTS))) this.#entries.delete(requestId);
  }
}
