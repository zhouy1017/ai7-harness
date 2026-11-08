import { randomUUID } from 'node:crypto';
import { UUID_PATTERN } from '../analysis/canonical.js';
import type { ScopedEditWorkingBlock } from '../ai-edit-locks.js';
import type { ProducedEditorialMarkInput } from '../editorial-marks.js';
import type { EditorialStore } from '../store.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import type { DialogueSelectionInput } from '../../shared/protocol.js';
import { MAX_SELECTION_SPAN_BLOCKS } from '../../shared/selection-span.js';
import {
  MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS,
  MAX_SCOPED_AI_EDIT_TARGETS,
  MAX_SCOPED_AI_EDIT_TARGET_GRAPHEMES,
  type ScopedAiEditProjection,
  type StartScopedAiEditInput,
} from '../../shared/protocol/scoped-edit.js';
import { FastRoleError } from './fast-role-error.js';
import type { FastRoleBindingFacts, FastRoleExecutionOwner } from './fast-role-execution.js';
import { EDITORIAL_POLISH_KIND } from './polish-contract.js';
import {
  SCOPED_EDIT_LABEL,
  SCOPED_EDIT_PROMPT_CONTRACT,
  SCOPED_EDIT_PROMPT_CONTRACT_DIGEST,
  buildScopedEditMessage,
  holdsScopedEditMarks,
  readScopedEditAnswer,
  type ScopedEditMessageInput,
  type ScopedEditSegment,
} from './scoped-edit-contract.js';

/**
 * 就选中部分让 AI 修改 with 🔒 锁定 (Issue #1412): the Deterministic Scoped Splice & Lock Guard.
 *
 * - **Freeze.** The request names the base the editor saw — revision, journal position, lock-set digest and, for a selection,
 *   each block's digest and exact grapheme range — and is refused at once when the working state no longer stands there.
 *   From it the scope is frozen: each target is one block's exact range (a partial first or last block of a selection keeps
 *   its unselected prefix or suffix as read-only context), and every locked block is context, never a target.
 * - **Send apart.** The targets go as numbered `<target_to_modify>` segments, the context as `<readonly_context>`.
 * - **Splice.** Only an answer entry naming a frozen target is read, each once; anything else the model wrote is dropped. A
 *   replacement replaces exactly its target's range, so every other byte — unselected words, locked blocks, every other
 *   block and the structure — stays the base's.
 * - **Apply under the same guard.** In one synchronous step, with no other request between: the lock-set digest and every
 *   target block's digest are read again, then each changed target becomes an AI7 修改建议 anchored on exactly its words and
 *   is applied as its own Effect, so the editor sees one applied card per changed block and can take back each alone. Text or
 *   locks that moved while the model answered apply nothing.
 */
export type ScopedEditStore = Pick<EditorialStore,
  'getManuscriptWindow' | 'dialogueSourceDigest' | 'scopedEditWorkingBlocks' | 'createProducedEditorialMarks' | 'applyChangeSuggestion'> &
  Partial<Pick<EditorialStore, 'editorialMemory'>>;

/** Read-only context around a selection: graphemes of the block before and after it, and of a locked block in a range. */
const CONTEXT_GRAPHEMES = 200;
/** The longest quotation a scoped-edit mark's basis keeps, in characters. */
const BASIS_QUOTE_CHARACTERS = 200;

function require(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new FastRoleError(code, message);
}

/** One frozen target: one block's exact range and the words it held. */
interface FrozenTarget {
  readonly id: string;
  readonly blockId: string;
  readonly blockDigest: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly original: string;
}

/** A scoped edit checked and ready to send. */
export interface PreparedScopedEdit {
  readonly bookId: string;
  readonly requestId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly locksDigest: string;
  readonly totalBlocks: number;
  readonly targets: ReadonlyArray<FrozenTarget>;
  readonly message: ScopedEditMessageInput;
  /** The block the Apply commands name their window by: the first target, which the guard has just found standing. */
  readonly windowStartBlockId: string;
}

const head = (text: string, count: number): string => graphemesOf(text).slice(0, count).join('');
const tail = (text: string, count: number): string => { const parts = graphemesOf(text); return parts.slice(Math.max(0, parts.length - count)).join(''); };
const context = (text: string): ScopedEditSegment[] => text.length === 0 ? [] : [{ kind: 'context', text }];

/** The words that may be sent at all: no block a target or context comes from may hold the contract's own marks. */
function requireSendable(text: string): void {
  require(!holdsScopedEditMarks(text), 'AI_EDIT_SCOPE_INVALID', '所选文字或它前后的文字含有「<target_to_modify>」这类标记，不能让 AI 修改。');
}

/** Check the request against the working state now and freeze its scope; a refusal is thrown before anything is sent. */
export function prepareScopedEdit(owner: FastRoleExecutionOwner, store: ScopedEditStore, bookId: string, input: StartScopedAiEditInput): PreparedScopedEdit {
  require(typeof bookId === 'string' && UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
  require(input !== null && typeof input === 'object' && typeof input.manuscriptId === 'string' && UUID_PATTERN.test(input.manuscriptId) &&
    typeof input.branchId === 'string' && UUID_PATTERN.test(input.branchId) && typeof input.baseRevisionId === 'string' &&
    Number.isSafeInteger(input.expectedJournalSequence) && typeof input.expectedLocksDigest === 'string' &&
    input.scope !== null && typeof input.scope === 'object', 'AI_EDIT_SCOPE_INVALID', '局部修改请求无效。');
  const instruction = typeof input.instruction === 'string' ? input.instruction.trim() : '';
  require(instruction.length > 0 && [...instruction].length <= MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS && instruction.isWellFormed(),
    'AI_EDIT_INSTRUCTION_INVALID', `请写下修改要求（最多 ${MAX_SCOPED_AI_EDIT_INSTRUCTION_CHARACTERS} 个字）。`);
  requireSendable(instruction);
  const window = store.getManuscriptWindow(input.manuscriptId, input.branchId, null);
  require(window.bookId === bookId, 'AI_EDIT_SCOPE_INVALID', '这份稿件不属于这本书。');
  require(window.revisionId === input.baseRevisionId && window.journalSequence === input.expectedJournalSequence,
    'MARK_BINDING_CHANGED', '稿件已有新的写入，请重新选择要修改的范围。');
  // The revision the words are read in decides whether they may be sent; only these three fields are read.
  const source = { manuscriptId: input.manuscriptId, branchId: input.branchId, baseRevisionId: window.revisionId } as DialogueSelectionInput;
  try {
    owner.requireReady(EDITORIAL_POLISH_KIND, store.dialogueSourceDigest(bookId, source));
  } catch (error) {
    // The route is 润色这段's; the refusal names the action the editor asked for.
    if (error instanceof FastRoleError) throw new FastRoleError(error.code, error.message.replaceAll('润色这段', SCOPED_EDIT_LABEL).replace('另一项润色或重新生成', '另一项 AI 修改'));
    throw error;
  }
  const scope = input.scope;
  const lines: ScopedEditSegment[][] = [];
  const targets: FrozenTarget[] = [];
  const target = (block: ScopedEditWorkingBlock, from: number, to: number): ScopedEditSegment => {
    const id = `T${targets.length + 1}`;
    const original = graphemesOf(block.text).slice(from, to).join('');
    targets.push({ id, blockId: block.blockId, blockDigest: block.digest, fromGrapheme: from, toGrapheme: to, original });
    return { kind: 'target', id, text: original };
  };
  const targetable = (block: ScopedEditWorkingBlock): boolean => !block.locked && block.kind !== 'note' && block.text.length > 0;
  let locksDigest: string;
  if (scope.mode === 'selected-only') {
    const span = scope.span;
    require(Array.isArray(span) && span.length >= 1 && span.length <= MAX_SELECTION_SPAN_BLOCKS && span.every((pin) => pin !== null && typeof pin === 'object' &&
      typeof pin.blockId === 'string' && typeof pin.blockDigest === 'string' && Number.isSafeInteger(pin.fromGrapheme) && Number.isSafeInteger(pin.toGrapheme)),
    'AI_EDIT_SCOPE_INVALID', '所选范围无效。');
    const read = store.scopedEditWorkingBlocks(input.manuscriptId, input.branchId, { kind: 'blocks', blockIds: span.map((pin) => pin.blockId) });
    locksDigest = read.locksDigest;
    const byId = new Map(read.blocks.map((block) => [block.blockId, block]));
    const chosen = span.map((pin) => byId.get(pin.blockId));
    require(chosen.every((block, index) => block !== undefined && block.digest === span[index]!.blockDigest), 'MARK_ANCHOR_CHANGED', '所选文字已不在当前稿件中；请重新选择。');
    const blocks = chosen as ScopedEditWorkingBlock[];
    require(blocks.every((block, index) => index === 0 || block.position === blocks[index - 1]!.position + 1), 'AI_EDIT_SCOPE_INVALID', '所选范围必须是连续的段落。');
    // A span is the first block from its start to its end, every interior block whole, the last from its start: the exact words selected.
    const last = span.length - 1;
    span.forEach((pin, index) => {
      const length = graphemesOf(blocks[index]!.text).length;
      const shaped = span.length === 1 ? pin.fromGrapheme >= 0 && pin.fromGrapheme < pin.toGrapheme && pin.toGrapheme <= length
        : index === 0 ? pin.fromGrapheme >= 0 && pin.fromGrapheme < length && pin.toGrapheme === length
          : index === last ? pin.fromGrapheme === 0 && pin.toGrapheme > 0 && pin.toGrapheme <= length
            : pin.fromGrapheme === 0 && pin.toGrapheme === length;
      require(shaped, 'AI_EDIT_SCOPE_INVALID', '所选范围无效。');
    });
    const before = read.blocks.find((block) => block.position === blocks[0]!.position - 1);
    const after = read.blocks.find((block) => block.position === blocks[last]!.position + 1);
    if (before !== undefined && before.kind !== 'note') lines.push(context(tail(before.text, CONTEXT_GRAPHEMES)));
    span.forEach((pin, index) => {
      const block = blocks[index]!;
      const parts = graphemesOf(block.text);
      const prefix = parts.slice(0, pin.fromGrapheme).join('');
      const selected = parts.slice(pin.fromGrapheme, pin.toGrapheme).join('');
      const suffix = parts.slice(pin.toGrapheme).join('');
      // A locked block inside the selection is read-only context, whole.
      lines.push(targetable(block)
        ? [...context(tail(prefix, CONTEXT_GRAPHEMES)), target(block, pin.fromGrapheme, pin.toGrapheme), ...context(head(suffix, CONTEXT_GRAPHEMES))]
        : context(head(prefix + selected + suffix, CONTEXT_GRAPHEMES * 2)));
    });
    if (after !== undefined && after.kind !== 'note') lines.push(context(head(after.text, CONTEXT_GRAPHEMES)));
    require(targets.length > 0, 'AI_EDIT_SCOPE_LOCKED', '所选的段落都已锁定，AI 不会修改它们；先解锁再试。');
  } else {
    require(scope.mode === 'unlocked-only' && scope.range !== null && typeof scope.range === 'object' &&
      (scope.range.kind === 'document' || (scope.range.kind === 'section' && typeof scope.range.headingBlockId === 'string')), 'AI_EDIT_SCOPE_INVALID', '修改范围无效。');
    const range = scope.range;
    const read = store.scopedEditWorkingBlocks(input.manuscriptId, input.branchId, range.kind === 'document' ? { kind: 'document' } : { kind: 'section', headingBlockId: range.headingBlockId });
    locksDigest = read.locksDigest;
    const span = read.range;
    const inside = span === null ? read.blocks : read.blocks.filter((block) => block.position >= span.from && block.position < span.to);
    const first = inside[0];
    const lastInside = inside.at(-1);
    const before = first === undefined ? undefined : read.blocks.find((block) => block.position === first.position - 1);
    const after = lastInside === undefined ? undefined : read.blocks.find((block) => block.position === lastInside.position + 1);
    if (before !== undefined && before.kind !== 'note') lines.push(context(tail(before.text, CONTEXT_GRAPHEMES)));
    for (const block of inside) {
      if (block.kind === 'note') continue;
      lines.push(targetable(block) ? [target(block, 0, graphemesOf(block.text).length)] : context(head(block.text, CONTEXT_GRAPHEMES)));
    }
    if (after !== undefined && after.kind !== 'note') lines.push(context(head(after.text, CONTEXT_GRAPHEMES)));
    require(targets.length > 0, 'AI_EDIT_SCOPE_LOCKED', '这个范围里没有未锁定的段落可以修改。');
  }
  require(locksDigest === input.expectedLocksDigest, 'AI_EDIT_LOCKS_STALE', '锁定状态已经变化；请看当前的锁定再试。');
  require(targets.length <= MAX_SCOPED_AI_EDIT_TARGETS, 'AI_EDIT_SCOPE_TOO_LARGE',
    `一次最多修改 ${MAX_SCOPED_AI_EDIT_TARGETS} 段；请选小一些的范围，或锁定更多段落。`);
  require(targets.reduce((sum, item) => sum + graphemesOf(item.original).length, 0) <= MAX_SCOPED_AI_EDIT_TARGET_GRAPHEMES, 'AI_EDIT_SCOPE_TOO_LARGE',
    `一次最多修改 ${MAX_SCOPED_AI_EDIT_TARGET_GRAPHEMES} 个字；请选一章或更小的范围，或锁定更多段落。`);
  for (const line of lines) for (const segment of line) requireSendable(segment.text);
  return {
    bookId, requestId: randomUUID(), manuscriptId: input.manuscriptId, branchId: input.branchId, locksDigest, totalBlocks: window.position.totalBlocks,
    targets, message: { instruction, lines: lines.filter((line) => line.length > 0) }, windowStartBlockId: targets[0]!.blockId,
  };
}

export function scopedEditProjection(prepared: Pick<PreparedScopedEdit, 'bookId' | 'requestId' | 'manuscriptId' | 'branchId' | 'totalBlocks'>,
  state: ScopedAiEditProjection['state'], label: string, extra: Partial<ScopedAiEditProjection> = {}): ScopedAiEditProjection {
  return {
    bookId: prepared.bookId, requestId: prepared.requestId, manuscriptId: prepared.manuscriptId, branchId: prepared.branchId,
    state, label, changedBlockIds: [], markIds: [], keptBlockCount: prepared.totalBlocks, droppedCount: 0, outcomeUnknown: false, ...extra,
  };
}

/** A write that found a target's words moved: rolled back, nothing kept. */
class TargetMoved extends Error {
  constructor() { super('TARGET_MOVED'); }
}

/**
 * Send the frozen scope, splice the answer into it and apply what changed, under the guard (see the module comment). The
 * targets the model did not change, every context segment and every other block of the manuscript are never written.
 */
export async function finishScopedEdit(owner: FastRoleExecutionOwner, store: ScopedEditStore, prepared: PreparedScopedEdit): Promise<ScopedAiEditProjection> {
  const settle = (state: ScopedAiEditProjection['state'], label: string, extra: Partial<ScopedAiEditProjection> = {}): ScopedAiEditProjection =>
    scopedEditProjection(prepared, state, label, extra);
  const answer = await owner.ask(EDITORIAL_POLISH_KIND, buildScopedEditMessage(prepared.message), 'scoped-edit',
    () => store.editorialMemory?.(prepared.bookId, 'editorial-dialogue') ?? null,
    { label: SCOPED_EDIT_LABEL, systemPrompt: SCOPED_EDIT_PROMPT_CONTRACT.systemPrompt, promptContractDigest: SCOPED_EDIT_PROMPT_CONTRACT_DIGEST });
  if (answer.kind === 'failed') return settle('failed', answer.message.replaceAll('润色这段', SCOPED_EDIT_LABEL), { outcomeUnknown: answer.outcomeUnknown });
  const reading = readScopedEditAnswer(answer.text, prepared.message);
  const dropped = reading.dropped;
  if (reading.kind === 'withheld') return settle('withheld', `${reading.reason}；稿件没有改动。`, { droppedCount: dropped });
  if (reading.changes.length === 0) {
    return reading.withheld.length > 0
      ? settle('withheld', `模型给出的 ${reading.withheld.length} 处修改都不能采用（${reading.withheld[0]!.reason}）；稿件没有改动。`, { droppedCount: dropped })
      : settle('unchanged', 'AI 认为所选部分不需要修改；稿件没有改动。', { droppedCount: dropped });
  }
  return applyScopedChanges(store, prepared, reading.changes, answer.binding, reading.withheld.length, dropped);
}

/**
 * The guard at Apply: synchronous from the re-check to the last Apply, so no other request can write between them. The lock
 * set and every target block must stand as frozen; then each change becomes one AI7 修改建议 on exactly its target's words
 * — created together, or none if any target's words moved — and each is applied as its own Effect.
 */
export function applyScopedChanges(store: ScopedEditStore, prepared: PreparedScopedEdit, changes: ReadonlyArray<{ id: string; text: string }>,
  binding: Pick<FastRoleBindingFacts, 'route' | 'model' | 'reasoningEffort'>, withheldCount: number, droppedCount: number): ScopedAiEditProjection {
  const settle = (state: ScopedAiEditProjection['state'], label: string, extra: Partial<ScopedAiEditProjection> = {}): ScopedAiEditProjection =>
    scopedEditProjection(prepared, state, label, { droppedCount, ...extra });
  const changed = changes.map((change) => ({ change, target: prepared.targets.find((item) => item.id === change.id)! }));
  const now = store.scopedEditWorkingBlocks(prepared.manuscriptId, prepared.branchId, { kind: 'blocks', blockIds: changed.map(({ target }) => target.blockId) });
  if (now.locksDigest !== prepared.locksDigest) return settle('stale', '锁定状态在 AI 修改期间变了；为免覆盖，这次没有应用任何修改。请重新发起。');
  const standing = new Map(now.blocks.map((block) => [block.blockId, block]));
  if (changed.some(({ target }) => standing.get(target.blockId)?.digest !== target.blockDigest || standing.get(target.blockId)?.locked !== false)) {
    return settle('stale', '所选文字在 AI 修改期间被改动了；为免覆盖新的内容，这次没有应用任何修改。请重新选择后再试。');
  }
  const inputs: ProducedEditorialMarkInput[] = changed.map(({ change, target }) => {
    const quote = [...target.original].length > BASIS_QUOTE_CHARACTERS ? `${[...target.original].slice(0, BASIS_QUOTE_CHARACTERS).join('')}…` : target.original;
    return {
      manuscriptId: prepared.manuscriptId,
      branchId: prepared.branchId,
      blockId: target.blockId,
      fromGrapheme: target.fromGrapheme,
      toGrapheme: target.toGrapheme,
      pinnedText: target.original,
      kind: 'change-suggestion',
      body: '',
      proposedText: change.text,
      rationale: prepared.message.instruction,
      atomicGroupId: null,
      source: { kind: 'ai7', origin: 'task', label: SCOPED_EDIT_LABEL, taskId: prepared.requestId },
      sourceModelBinding: { route: binding.route, model: binding.model, ...(binding.reasoningEffort === undefined ? {} : { reasoningEffort: binding.reasoningEffort }) },
      basis: [{ label: SCOPED_EDIT_LABEL, blockId: target.blockId, fromGrapheme: target.fromGrapheme, toGrapheme: target.toGrapheme, quote }],
    };
  });
  let markIds: string[];
  try {
    markIds = store.createProducedEditorialMarks(inputs, (ids) => {
      if (ids.some((id) => id === null)) throw new TargetMoved();
      return ids as string[];
    });
  } catch (error) {
    if (error instanceof TargetMoved) return settle('stale', '所选文字在 AI 修改期间被改动了；为免覆盖新的内容，这次没有应用任何修改。请重新选择后再试。');
    throw error;
  }
  const applied: string[] = [];
  try {
    for (const markId of markIds) {
      store.applyChangeSuggestion({ manuscriptId: prepared.manuscriptId, branchId: prepared.branchId, windowStartBlockId: prepared.windowStartBlockId,
        markId, clientEffectId: randomUUID(), interaction: 'accept-and-apply', editedText: null, reason: null });
      applied.push(markId);
    }
  } catch (error) {
    const left = markIds.length - applied.length;
    const why = error instanceof Error ? error.message : '';
    return settle('failed', `已应用 ${applied.length} 处修改；另有 ${left} 处没有应用（${why}），它们作为修改建议留在稿件里，由你决定。`, {
      markIds: applied, changedBlockIds: [...new Set(changed.filter((_, index) => index < applied.length).map(({ target }) => target.blockId))],
      keptBlockCount: prepared.totalBlocks - applied.length,
    });
  }
  const changedBlockIds = [...new Set(changed.map(({ target }) => target.blockId))];
  const kept = Math.max(0, prepared.totalBlocks - changedBlockIds.length);
  const notOffered = withheldCount === 0 ? '' : `另有 ${withheldCount} 处 AI 的修改不能采用，没有应用。`;
  return settle('applied', `已局部更新所选的 ${changedBlockIds.length} 个段落（其余 ${kept} 个未选中/已锁定段落保持原样）。${notOffered}`, {
    markIds: applied, changedBlockIds, keptBlockCount: kept,
  });
}
