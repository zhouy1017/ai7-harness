import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES, type JournalEditInput, type JournalStructuralEdit, type ManuscriptBlockKind } from '../../shared/protocol.js';
import {
  BLOCK_PATTERN, BoundedStoreError, HISTORY_BATCH, MIGRATION_BATCH, REVISION_IMPORT_LINEAGE, asNumber, asString, graphemes, one, requireBounded, stagedBlockLength, type SqlRow,
} from './bounded-kernel.js';
import { blockDigest, blockShapeFromDigest, memberPresenceColumns, recoveryCommandEvidenceDigest, recoveryWorkingDigest } from './command-history.js';
import { schemaHas } from '../statement-cache.js';
import { recordGroupPart, recordStepAnchors } from './editor-steps.js';
import { insertBlockAfter, neighbours, paragraphCount, removeBlock, rewriteBlock, workingBlock, type WorkingRow } from './working-positions.js';

/**
 * Structural edits as ordinary Edit Journal commands (Issue #1175; ADR 0096 §1, ADR 0006). `Enter` at the caret splits a
 * paragraph in two; `Backspace` at a paragraph's start merges it into the paragraph before it. Each is one command group of its
 * own kind with two members — the block whose text changes, and the block that comes into or leaves the working state — and
 * one lineage row: the new block `split-from` the one it came out of, or the absorbed block `merged-into` the one that took its
 * text. 撤销 and 重做 replay the group as one step. A heading can create a plain paragraph at its end; a single block's style
 * is an ordinary journal edit too (#1288). Multi-heading hierarchy changes and section moves stay with Structure Adjustment Mode (F-15).
 *
 * The marks of the two blocks (ED-044, ADR 0105 §2): a mark wholly before the caret stays; a mark wholly after it — or on the
 * absorbed paragraph — follows its words to the other block with its anchor state, so an applied 修改建议 keeps its 撤销本次修改;
 * a mark across the caret, or a point exactly at it, stays on the first block as a Drifted Manuscript Range. 撤销 and 重做 follow
 * the same rules; the editor step then puts back the anchors it recorded for the marks at the caret, once the replay has
 * proven both paragraphs byte-identical to that side (Issue #1654, `editor-steps.ts`).
 */

export interface StructuralWriteHooks {
  readonly binding: { manuscriptId: string; branchId: string; revisionId: string; journalSequence: number; workingDigest: string; historySequence: number };
  /** The service lifetime's high-water mark for this branch, as every journal write records it. */
  recordLifetimeWrite(sequence: number, workingDigest: string, durableAt: string): void;
}

function requireParagraph(block: WorkingRow | undefined, digest: string): asserts block is WorkingRow {
  requireBounded(block !== undefined, 'EDIT_BLOCK_CHANGED', '稳定内容块不存在。');
  requireBounded(block.kind === 'paragraph', 'STRUCTURE_INVALID', '只有正文段落可以拆分或合并。');
  requireBounded(block.digest === digest, 'EDIT_BLOCK_CHANGED', '内容块已变化，请刷新窗口。');
}

/** The working state with `blockId` split at grapheme `at`: its head stays, its tail becomes `newBlockId` right after it. */
function splitWorking(db: DatabaseSync, branchId: string, blockId: string, newBlockId: string, at: number, expectedDigest: string): { head: string; tail: string } {
  const block = workingBlock(db, branchId, blockId);
  requireBounded(block !== undefined && block.digest === expectedDigest, 'EDIT_BLOCK_CHANGED', '内容块已变化，请刷新窗口。');
  const parts = graphemes(block.text);
  requireBounded(block.kind === 'paragraph' || ((block.kind === 'heading' || block.kind === 'title') && at === parts.length),
    'STRUCTURE_INVALID', '标题只能在末尾新建正文段落。');
  requireBounded(Number.isSafeInteger(at) && at >= 0 && at <= parts.length, 'EDIT_RANGE_INVALID', '拆分位置无效。');
  const head = parts.slice(0, at).join('');
  const tail = parts.slice(at).join('');
  // The head first, so the page's grapheme total never counts a tail twice; then the tail as one new row (ADR 0105 §6).
  rewriteBlock(db, branchId, blockId, { kind: block.kind, level: block.level, text: head, digest: blockDigest(block.kind, block.level, head) }, block.digest);
  insertBlockAfter(db, branchId, blockId, newBlockId, { kind: 'paragraph', level: null, text: tail, digest: blockDigest('paragraph', null, tail) });
  return { head, tail };
}

/** The working state with `mergedBlockId`, the paragraph right after `intoBlockId`, taken into it. */
function joinWorking(
  db: DatabaseSync, branchId: string, intoBlockId: string, mergedBlockId: string, intoDigest: string, mergedDigest: string, undoHeadingSplit = false,
): { intoText: string; mergedText: string; joined: string } {
  const into = workingBlock(db, branchId, intoBlockId);
  const merged = workingBlock(db, branchId, mergedBlockId);
  if (undoHeadingSplit && (into?.kind === 'heading' || into?.kind === 'title')) {
    requireBounded(into.digest === intoDigest && merged?.text === '', 'EDIT_BLOCK_CHANGED', '标题后的新段落已变化。');
  } else requireParagraph(into, intoDigest);
  requireParagraph(merged, mergedDigest);
  requireBounded(neighbours(db, branchId, into.key).next === mergedBlockId, 'STRUCTURE_INVALID', '只能与紧邻的上一段合并。');
  const joined = into.text + merged.text;
  const length = stagedBlockLength(joined, 'EDIT_TOO_LARGE', '合并后的段落超出安全范围。');
  requireBounded(joined.length <= MAX_BLOCK_CODE_UNITS && length <= MAX_BLOCK_GRAPHEMES, 'EDIT_TOO_LARGE', '合并后的段落超出安全范围。');
  removeBlock(db, branchId, mergedBlockId);
  rewriteBlock(db, branchId, intoBlockId, { kind: into.kind, level: into.level, text: joined, digest: blockDigest(into.kind, into.level, joined) }, into.digest);
  return { intoText: into.text, mergedText: merged.text, joined };
}

const LIVE_MARKS = `status IN ('open', 'resolved', 'applied') AND anchor_state IN ('exact', 'drifted')`;

/** The live marks of `blockId` whose range touches the span `[from, to]` (a caret when `from = to`). */
function caretMarks(db: DatabaseSync, branchId: string, blockId: string, from: number, to: number): string[] {
  return (db.prepare(`SELECT mark_id FROM editorial_marks WHERE branch_id = ? AND block_id = ? AND ${LIVE_MARKS} AND from_grapheme <= ? AND to_grapheme >= ?`)
    .all(branchId, blockId, to, from) as SqlRow[]).map((row) => asString(row.mark_id));
}

/**
 * The marks of a 就地编辑修订 session (Issue #1428) are bound to their paragraph's text as the session began, by offsets in it; a
 * split or join that moves one of them drifts it, so its decision is never matched against another paragraph's words.
 */
const inlineRevisionMark = (db: DatabaseSync): string => !schemaHas(db, 'editor_inline_revision_marks')
  ? '0' : 'mark_id IN (SELECT mark_id FROM editor_inline_revision_marks)';

/**
 * The marks of `fromBlockId` wholly past grapheme `at` go to `toBlockId` with their anchor state; one the caret cuts through
 * stays, drifted. A point exactly at the caret stays drifted too, since its side is ambiguous, unless the caret is at the very
 * start of the paragraph (it goes with the words) or its very end (it stays): one side is empty then (clarification of 2026-11-20).
 */
function splitMarks(db: DatabaseSync, branchId: string, fromBlockId: string, toBlockId: string, at: number, sequence: number): void {
  const tail = asNumber(one(db.prepare('SELECT grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?').all(branchId, toBlockId) as SqlRow[],
    'HISTORY_CORRUPT', '分段后的段落缺失。').grapheme_length);
  const rows = db.prepare(`SELECT mark_id, from_grapheme, to_grapheme, ${inlineRevisionMark(db)} inline_revision FROM editorial_marks
    WHERE branch_id = ? AND block_id = ? AND ${LIVE_MARKS}`).all(branchId, fromBlockId) as SqlRow[];
  const update = db.prepare(`UPDATE editorial_marks SET block_id = ?, from_grapheme = ?, to_grapheme = ?, anchor_state = COALESCE(?, anchor_state),
    followed_journal_sequence = ? WHERE mark_id = ?`);
  for (const row of rows) {
    const from = asNumber(row.from_grapheme);
    const to = asNumber(row.to_grapheme);
    if (to < at || to === at && (from < to || tail === 0)) continue;
    if (from >= at && (to > at || at === 0)) update.run(toBlockId, from - at, to - at, row.inline_revision ? 'drifted' : null, sequence, asString(row.mark_id));
    else update.run(fromBlockId, from, at, 'drifted', sequence, asString(row.mark_id));
  }
}

/**
 * Every mark of `fromBlockId` goes to `intoBlockId` after the absorbing paragraph's text, with its anchor state: a join cuts no
 * mark. When the absorbed paragraph starts with a grapheme that fuses with the one before it (a combining mark, U+200D, a
 * variation selector), the joined paragraph is a grapheme shorter than the two, so its offsets no longer hold and its marks drift.
 */
function joinMarks(db: DatabaseSync, branchId: string, intoBlockId: string, fromBlockId: string, parts: { intoText: string; mergedText: string; joined: string },
  sequence: number): void {
  const offset = graphemes(parts.intoText).length;
  const length = graphemes(parts.joined).length;
  db.prepare(`UPDATE editorial_marks SET block_id = ?, from_grapheme = min(from_grapheme + ?, ?), to_grapheme = min(to_grapheme + ?, ?),
      anchor_state = CASE WHEN ? OR ${inlineRevisionMark(db)} THEN 'drifted' ELSE anchor_state END, followed_journal_sequence = ?
    WHERE branch_id = ? AND block_id = ? AND ${LIVE_MARKS}`).run(intoBlockId, offset, length, offset, length,
    Number(length < offset + graphemes(parts.mergedText).length), sequence, branchId, fromBlockId);
}

/**
 * Whether block lineage carries the words of `fromBlockId` into `toBlockId` on `branchId` (ADR 0105 §2): a split carries them
 * into the new block; a merge into the block that absorbed them, while the absorbed block is gone from the working state — once
 * an undone merge brought it back, its words are its own again. Lineage rows are facts about the blocks whatever later became of
 * their command groups, so no group status is read; `UNION` ends a cycle such as a split joined back.
 */
export function blockReachesThroughLineage(db: DatabaseSync, branchId: string, fromBlockId: string, toBlockId: string): boolean {
  return fromBlockId === toBlockId || db.prepare(`WITH RECURSIVE reached(block_id) AS (
      SELECT ? UNION
      SELECT l.block_id FROM reached r JOIN manuscript_block_lineage l ON l.related_block_id = r.block_id AND l.relation = 'split-from'
      UNION
      SELECT l.related_block_id FROM reached r JOIN manuscript_block_lineage l ON l.block_id = r.block_id AND l.relation = 'merged-into'
        AND NOT EXISTS(SELECT 1 FROM working_blocks w WHERE w.branch_id = ? AND w.block_id = l.block_id)
    ) SELECT 1 FROM reached WHERE block_id = ? LIMIT 1`).get(fromBlockId, branchId, toBlockId) !== undefined;
}

/** A reversal target: where its range stands now, and where the Apply it reverses found it. */
export interface InverseTarget { readonly fromGrapheme: number; readonly toGrapheme: number; readonly original: { readonly blockId: string; readonly from: number; readonly to: number } }

/**
 * Whether two inverse targets touching in one block (`previous` ends where `next` starts) stand in a known order: both from one
 * original paragraph, and both non-empty or contiguous there. Touching targets from different original paragraphs are refused,
 * not reordered (ADR 0105 §2).
 */
export function inverseTargetsTouchInOrder(previous: InverseTarget, next: InverseTarget): boolean {
  return previous.original.blockId === next.original.blockId &&
    (previous.toGrapheme > previous.fromGrapheme && next.toGrapheme > next.fromGrapheme || previous.original.to === next.original.from);
}

const insertMember = (db: DatabaseSync, groupId: string, position: number, blockId: string, before: string | null, after: string | null,
  kind: ManuscriptBlockKind = 'paragraph', level: number | null = null): void => {
  db.prepare(
    `INSERT INTO manuscript_command_edits(
       command_group_id, position, block_id, before_text, before_digest, after_text, after_digest, before_present, after_present
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(groupId, position, blockId, before ?? '', blockDigest(kind, level, before ?? ''), after ?? '', blockDigest(kind, level, after ?? ''),
    before === null ? 0 : 1, after === null ? 0 : 1);
};

/**
 * One `Enter` split or `Backspace` merge, journaled exactly as a text edit is — one entry, one command group, one step of
 * the working-state chain — inside the caller's transaction, after the caller checked the binding and the window.
 */
export function writeStructuralEdit(db: DatabaseSync, input: JournalEditInput & { structure: JournalStructuralEdit }, fingerprint: string,
  serviceLifetimeId: string, hooks: StructuralWriteHooks): void {
  const { binding } = hooks;
  const structure = input.structure;
  const commandKind = structure.kind === 'style' ? 'edit' : structure.kind;
  requireBounded(input.insertText === '' && input.fromGrapheme === input.toGrapheme, 'EDIT_INVALID', '结构编辑不写入文字。');
  const sequence = binding.journalSequence + 1;
  const groupId = randomUUID();
  const durableAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO manuscript_command_groups(
       command_group_id, branch_id, ordinal, kind, status, source_group_id, before_working_digest, after_working_digest, created_at
     ) VALUES (?, ?, ?, ?, 'applied', NULL, ?, ?, ?)`,
  ).run(groupId, binding.branchId, binding.historySequence + 1, commandKind, binding.workingDigest, '0'.repeat(64), durableAt);
  // One editor step (Issue #1654): opening it supersedes what was undone.
  const stepId = recordGroupPart(db, binding.branchId, groupId, structure.kind, input.blockId);
  let resultingDigest: string;
  if (structure.kind === 'split') {
    requireBounded(BLOCK_PATTERN.test(structure.newBlockId) &&
      db.prepare('SELECT 1 FROM manuscript_blocks WHERE block_id = ?').get(structure.newBlockId) === undefined,
    'STRUCTURE_INVALID', '新段落标识无效或已被使用。');
    db.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)')
      .run(structure.newBlockId, binding.manuscriptId, binding.revisionId);
    const original = workingBlock(db, binding.branchId, input.blockId)!;
    const before = original.text;
    const { head, tail } = splitWorking(db, binding.branchId, input.blockId, structure.newBlockId, input.fromGrapheme, input.baseBlockDigest);
    const atCaret = caretMarks(db, binding.branchId, input.blockId, input.fromGrapheme, input.fromGrapheme);
    recordStepAnchors(db, stepId, 'pre', atCaret);
    splitMarks(db, binding.branchId, input.blockId, structure.newBlockId, input.fromGrapheme, sequence);
    recordStepAnchors(db, stepId, 'post', atCaret);
    insertMember(db, groupId, 1, input.blockId, before, head, original.kind as ManuscriptBlockKind, original.level);
    insertMember(db, groupId, 2, structure.newBlockId, null, tail);
    db.prepare("INSERT INTO manuscript_block_lineage(block_id, related_block_id, relation, command_group_id) VALUES (?, ?, 'split-from', ?)")
      .run(structure.newBlockId, input.blockId, groupId);
    resultingDigest = blockDigest(original.kind as ManuscriptBlockKind, original.level, head);
  } else if (structure.kind === 'style') {
    const block = workingBlock(db, binding.branchId, input.blockId);
    requireBounded(block !== undefined && block.digest === input.baseBlockDigest, 'EDIT_BLOCK_CHANGED', '段落已变化，请刷新窗口。');
    requireBounded(['paragraph', 'heading', 'title'].includes(block.kind) &&
      ((structure.blockKind === 'paragraph' && structure.level === null) || (structure.blockKind === 'title' && structure.level === 1) ||
        (structure.blockKind === 'heading' && Number.isSafeInteger(structure.level) && structure.level! >= 1 && structure.level! <= 6)),
    'STRUCTURE_INVALID', '段落样式无效。');
    resultingDigest = blockDigest(structure.blockKind, structure.level, block.text);
    insertMember(db, groupId, 1, block.blockId, block.text, block.text, block.kind as ManuscriptBlockKind, block.level);
    db.prepare('UPDATE manuscript_command_edits SET after_digest = ? WHERE command_group_id = ?').run(resultingDigest, groupId);
    rewriteBlock(db, binding.branchId, block.blockId, { kind: structure.blockKind, level: structure.level, text: block.text, digest: resultingDigest }, block.digest);
  } else {
    requireBounded(BLOCK_PATTERN.test(structure.mergedBlockId) && structure.mergedBlockId !== input.blockId, 'STRUCTURE_INVALID', '合并段落标识无效。');
    const parts = joinWorking(db, binding.branchId, input.blockId, structure.mergedBlockId, input.baseBlockDigest, structure.mergedBlockDigest);
    const { intoText, mergedText, joined } = parts;
    requireBounded(graphemes(intoText).length === input.fromGrapheme, 'EDIT_RANGE_INVALID', '合并位置无效。');
    // The marks at the boundary: the absorbing paragraph's end and the absorbed one's start — every absorbed mark when the
    // boundary fuses two graphemes (ADR 0105 §1, Commander decision of 2026-11-22).
    const fused = graphemes(joined).length < graphemes(intoText).length + graphemes(mergedText).length;
    const atCaret = [...caretMarks(db, binding.branchId, input.blockId, input.fromGrapheme, input.fromGrapheme),
      ...caretMarks(db, binding.branchId, structure.mergedBlockId, 0, fused ? Number.MAX_SAFE_INTEGER : 0)];
    recordStepAnchors(db, stepId, 'pre', atCaret);
    joinMarks(db, binding.branchId, input.blockId, structure.mergedBlockId, parts, sequence);
    recordStepAnchors(db, stepId, 'post', atCaret);
    insertMember(db, groupId, 1, input.blockId, intoText, joined);
    insertMember(db, groupId, 2, structure.mergedBlockId, mergedText, null);
    db.prepare("INSERT INTO manuscript_block_lineage(block_id, related_block_id, relation, command_group_id) VALUES (?, ?, 'merged-into', ?)")
      .run(structure.mergedBlockId, input.blockId, groupId);
    resultingDigest = blockDigest('paragraph', null, joined);
  }
  const workingDigest = recoveryWorkingDigest(binding.workingDigest, sequence, commandKind, groupId, recoveryCommandEvidenceDigest(db, groupId));
  requireBounded(db.prepare('UPDATE manuscript_command_groups SET after_working_digest = ? WHERE command_group_id = ? AND after_working_digest = ?')
    .run(workingDigest, groupId, '0'.repeat(64)).changes === 1, 'HISTORY_CORRUPT', '编辑命令证据无法绑定工作状态链。');
  db.prepare(
    `INSERT INTO edit_journal_entries(
       journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
       sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
       resulting_working_digest, durable_at, command_group_id, command_kind, service_lifetime_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), input.clientEditId, fingerprint, input.manuscriptId, input.branchId, input.baseRevisionId, sequence, input.blockId,
    input.fromGrapheme, input.toGrapheme, resultingDigest, workingDigest, durableAt, groupId, commandKind, serviceLifetimeId);
  const state = db.prepare(
    `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, history_sequence = ?
     WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
  ).run(sequence, workingDigest, binding.historySequence + 1, binding.branchId, binding.journalSequence, binding.workingDigest);
  requireBounded(state.changes === 1, 'EDIT_SEQUENCE_CHANGED', '修订日志在保存时已前进。');
  hooks.recordLifetimeWrite(sequence, workingDigest, durableAt);
}

export function restoreRevisionMergeLineage(db: DatabaseSync, branchId: string, revisionId: string): void {
  db.prepare(`WITH RECURSIVE ${REVISION_IMPORT_LINEAGE}, cutoffs AS (
      SELECT journal.base_revision_id, max(journal.sequence) last_sequence FROM lineage
        JOIN lineage parent ON parent.revision_id = lineage.parent_revision_id
        JOIN edit_journal_entries journal ON journal.base_revision_id = lineage.parent_revision_id AND journal.resulting_working_digest = lineage.revision_digest
        WHERE journal.branch_id = ? GROUP BY journal.base_revision_id
    ), states AS (
      SELECT journal.command_group_id, journal.command_kind, row_number() OVER (PARTITION BY journal.command_group_id ORDER BY journal.sequence DESC) latest
        FROM edit_journal_entries journal JOIN cutoffs ON journal.base_revision_id = cutoffs.base_revision_id AND journal.sequence <= cutoffs.last_sequence
        WHERE journal.branch_id = ? AND journal.command_kind IN ('merge','undo','redo')
    ), applied AS (SELECT command_group_id FROM states WHERE latest = 1 AND command_kind IN ('merge','redo'))
    UPDATE manuscript_command_groups SET status = CASE WHEN command_group_id IN applied THEN 'applied' ELSE 'superseded' END
    WHERE branch_id = ? AND kind = 'merge' AND (status = 'applied' OR command_group_id IN applied)`)
    .run(revisionId, branchId, branchId, branchId, branchId);
}

/** Whether a command group is a structural one, which 撤销 and 重做 replay here rather than member by member. */
export function isStructuralGroup(kind: string): kind is 'split' | 'merge' {
  return kind === 'split' || kind === 'merge';
}

/** 撤销 or 重做 of a split or merge group as one step, inside the caller's transaction; it changes no character count. */
export function replayStructuralGroup(db: DatabaseSync, branchId: string, groupId: string, kind: 'split' | 'merge', action: 'undo' | 'redo', sequence: number): void {
  const members = db.prepare(`SELECT position, block_id, before_text, before_digest, after_text, after_digest FROM manuscript_command_edits
    WHERE command_group_id = ? ORDER BY position`).all(groupId) as SqlRow[];
  requireBounded(members.length === 2, 'HISTORY_CORRUPT', '结构编辑命令证据不完整。');
  const [first, second] = members as [SqlRow, SqlRow];
  const firstId = asString(first.block_id);
  const secondId = asString(second.block_id);
  const stale = (operation: () => void): void => {
    try { operation(); } catch (error) {
      if (error instanceof BoundedStoreError && ['EDIT_BLOCK_CHANGED', 'STRUCTURE_INVALID', 'EDIT_RANGE_INVALID'].includes(error.code)) {
        throw historyStale(db, branchId, groupId, [firstId, secondId]);
      }
      throw error;
    }
  };
  // A split forward, or a merge undone, splits the first member at the length of the text it keeps.
  if ((kind === 'split') === (action === 'redo')) {
    const keptText = kind === 'split' ? asString(first.after_text) : asString(first.before_text);
    const at = graphemes(keptText).length;
    stale(() => splitWorking(db, branchId, firstId, secondId, at, kind === 'split' ? asString(first.before_digest) : asString(first.after_digest)));
    splitMarks(db, branchId, firstId, secondId, at, sequence);
  } else {
    const intoDigest = kind === 'split' ? asString(first.after_digest) : asString(first.before_digest);
    const mergedDigest = kind === 'split' ? asString(second.after_digest) : asString(second.before_digest);
    let parts = { intoText: '', mergedText: '', joined: '' };
    stale(() => { parts = joinWorking(db, branchId, firstId, secondId, intoDigest, mergedDigest, kind === 'split'); });
    joinMarks(db, branchId, firstId, secondId, parts, sequence);
  }
}

/**
 * The refusal of an 撤销 or 重做 whose blocks no longer hold what the command left. When an Apply committed after the command
 * changed one of them, the editor is told so plainly: the Apply stays, and its own 撤销本次应用 comes first (UI ADR 0003).
 */
export function historyStale(db: DatabaseSync, branchId: string, groupId: string, blockIds: ReadonlyArray<string>): BoundedStoreError {
  const ordinal = asNumber(one(db.prepare('SELECT ordinal FROM manuscript_command_groups WHERE command_group_id = ?').all(groupId) as SqlRow[],
    'HISTORY_CORRUPT', '历史命令组缺失。').ordinal);
  const applied = db.prepare(
    `SELECT 1 FROM manuscript_command_groups g JOIN manuscript_command_edits ce ON ce.command_group_id = g.command_group_id
     WHERE g.branch_id = ? AND g.kind = 'apply' AND g.ordinal > ? AND ce.block_id IN (${blockIds.map(() => '?').join(', ')}) LIMIT 1`,
  ).get(branchId, ordinal, ...blockIds) !== undefined;
  return applied
    ? new BoundedStoreError('HISTORY_AFTER_APPLY', '这处编辑之后，同一段落已应用修改建议；请先在那条修改建议上撤销本次应用，再撤销这处编辑。')
    : new BoundedStoreError('HISTORY_STALE', '稿件历史无法在当前状态精确重放。');
}

/** Whether a split or merge stands in the journal between a checkpoint and the latest entry. */
export function journalHasStructuralEdits(db: DatabaseSync, branchId: string, afterSequence: number, throughSequence: number): boolean {
  return db.prepare(
    `SELECT 1 FROM edit_journal_entries e JOIN manuscript_command_groups g ON g.command_group_id = e.command_group_id
     WHERE e.branch_id = ? AND e.sequence > ? AND e.sequence <= ? AND (g.kind IN ('split', 'merge') OR EXISTS(
       SELECT 1 FROM manuscript_command_edits ce WHERE ce.command_group_id = g.command_group_id
       AND ce.before_text = ce.after_text AND ce.before_digest <> ce.after_digest)) LIMIT 1`,
  ).get(branchId, afterSequence, throughSequence) !== undefined;
}

/**
 * Recovery's independent replay (ADR 0006) once a split or merge stands since the checkpoint: every block the checkpoint holds
 * and every block a command brought in is replayed from the checkpoint by identity, a member's absent side meaning the block
 * was not in the working state, and the result must be exactly the working state's blocks — the same identities, texts and
 * digests, and as many blocks as positions.
 */
export function verifyStructuralReconstruction(
  db: DatabaseSync, branchId: string, checkpointRevisionId: string, checkpointSequence: number, journalSequence: number,
): void {
  const fail = (message: string): never => { throw new BoundedStoreError('RECOVERY_CLASSIFICATION_UNCERTAIN', message); };
  const replay = (blockId: string, start: { text: string; digest: string } | null): { text: string; digest: string } | null => {
    let content = start;
    let cursor = checkpointSequence;
    for (;;) {
      const edits = db.prepare(
        `SELECT e.sequence, e.command_kind, ce.before_text, ce.before_digest, ce.after_text, ce.after_digest, ${memberPresenceColumns(db, 'ce.')}
         FROM edit_journal_entries e JOIN manuscript_command_edits ce ON ce.command_group_id = e.command_group_id AND ce.block_id = ?
         WHERE e.branch_id = ? AND e.sequence > ? AND e.sequence <= ? ORDER BY e.sequence LIMIT ?`,
      ).all(blockId, branchId, cursor, journalSequence, HISTORY_BATCH) as SqlRow[];
      if (edits.length === 0) return content;
      for (const edit of edits) {
        cursor = asNumber(edit.sequence);
        const undo = asString(edit.command_kind) === 'undo';
        const [from, to] = undo ? ['after', 'before'] : ['before', 'after'];
        const expected = edit[`${from}_present`] === 1 ? { text: asString(edit[`${from}_text`]), digest: asString(edit[`${from}_digest`]) } : null;
        if ((expected === null) !== (content === null) || (expected !== null && (expected.text !== content!.text || expected.digest !== content!.digest))) {
          fail('修订日志内容块无法从检查点精确重放。');
        }
        content = edit[`${to}_present`] === 1 ? { text: asString(edit[`${to}_text`]), digest: asString(edit[`${to}_digest`]) } : null;
      }
    }
  };
  const compare = (blockId: string, kind: string, level: number | null, result: { text: string; digest: string } | null): number => {
    const current = db.prepare('SELECT kind, level, text, digest, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?')
      .get(branchId, blockId) as SqlRow | undefined;
    if (result === null) {
      if (current !== undefined) fail('修订日志重建结果与持久工作状态不一致。');
      return 0;
    }
    ({ kind, level } = blockShapeFromDigest(result.text, result.digest));
    if (current === undefined || asString(current.kind) !== kind || (current.level === null ? null : asNumber(current.level)) !== level ||
      asString(current.text) !== result.text || asString(current.digest) !== result.digest ||
      blockDigest(kind as 'paragraph', level, result.text) !== result.digest ||
      asNumber(current.grapheme_length) !== stagedBlockLength(result.text, 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作文字超出有界范围。')) {
      fail('修订日志重建结果与持久工作状态不一致。');
    }
    return 1;
  };
  let present = 0;
  const seen = new Set<string>();
  let position = 0;
  for (;;) {
    const blocks = db.prepare('SELECT block_id, position, kind, level, text, digest FROM manuscript_block_versions WHERE revision_id = ? AND position > ? ORDER BY position LIMIT ?')
      .all(checkpointRevisionId, position, MIGRATION_BATCH) as SqlRow[];
    if (blocks.length === 0) break;
    for (const block of blocks) {
      position = asNumber(block.position);
      const blockId = asString(block.block_id);
      seen.add(blockId);
      present += compare(blockId, asString(block.kind), block.level === null ? null : asNumber(block.level),
        replay(blockId, { text: asString(block.text), digest: asString(block.digest) }));
    }
  }
  const arrived = db.prepare(
    `SELECT DISTINCT ce.block_id FROM edit_journal_entries e JOIN manuscript_command_edits ce ON ce.command_group_id = e.command_group_id
     WHERE e.branch_id = ? AND e.sequence > ? AND e.sequence <= ?`,
  ).all(branchId, checkpointSequence, journalSequence) as SqlRow[];
  for (const row of arrived) {
    const blockId = asString(row.block_id);
    if (seen.has(blockId)) continue;
    present += compare(blockId, 'paragraph', null, replay(blockId, null));
  }
  const inventory = one(db.prepare('SELECT count(*) total FROM working_blocks WHERE branch_id = ?')
    .all(branchId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作状态清单缺失。');
  // As many blocks as the pages count (Issue #1654): no stored position is dense any more.
  if (asNumber(inventory.total) !== present || asNumber(inventory.total) !== paragraphCount(db, branchId)) fail('恢复检查点与工作状态的内容块清单不一致。');
}
