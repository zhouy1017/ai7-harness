import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES, type JournalEditInput, type JournalStructuralEdit } from '../../shared/protocol.js';
import {
  BLOCK_PATTERN, BoundedStoreError, HISTORY_BATCH, MIGRATION_BATCH, asNumber, asString, fenwickSpan, graphemes, lastWorkingPosition, one,
  requireBounded, stagedBlockLength, workingOffsetPrefix, type SqlRow,
} from './bounded-kernel.js';
import { blockDigest, memberPresenceColumns, recoveryCommandEvidenceDigest, recoveryWorkingDigest } from './command-history.js';

/**
 * Structural edits as ordinary Edit Journal commands (Issue #1175; ADR 0096 §1, ADR 0006). `Enter` at the caret splits a
 * paragraph in two; `Backspace` at a paragraph's start merges it into the paragraph before it. Each is one command group of its
 * own kind with two members — the block whose text changes, and the block that comes into or leaves the working state — and
 * one lineage row: the new block `split-from` the one it came out of, or the absorbed block `merged-into` the one that took its
 * text. 撤销 and 重做 replay the group as one step. Only paragraphs are split or merged; a heading's level, a whole block's
 * insertion or deletion and section moves stay with Structure Adjustment Mode (F-15).
 *
 * The marks of the two blocks (ED-044): a mark wholly before the caret stays; a 批注, 备注 or highlight wholly after it — or on
 * the absorbed paragraph — follows its words to the other block exactly; a mark across the caret stays on the first block as a
 * Drifted Manuscript Range, and so does every ranged 修改建议 the command moves, since its Proposal Change Item still names the
 * words where they stood. 撤销 moves the marks back and leaves a drifted one drifted.
 */

/** The shift that lifts positions clear of the `UNIQUE(branch_id, position)` rows they pass while a block comes or goes. */
const POSITION_SHIFT = 1_000_000_000;

export interface StructuralWriteHooks {
  readonly binding: { manuscriptId: string; branchId: string; revisionId: string; journalSequence: number; workingDigest: string; historySequence: number };
  /** The service lifetime's high-water mark for this branch, as every journal write records it. */
  recordLifetimeWrite(sequence: number, workingDigest: string, durableAt: string): void;
}

interface WorkingBlock { blockId: string; position: number; kind: string; level: number | null; text: string; digest: string }

function workingBlock(db: DatabaseSync, branchId: string, blockId: string): WorkingBlock | undefined {
  const row = db.prepare('SELECT block_id, position, kind, level, text, digest FROM working_blocks WHERE branch_id = ? AND block_id = ?')
    .get(branchId, blockId) as SqlRow | undefined;
  return row === undefined ? undefined : {
    blockId, position: asNumber(row.position), kind: asString(row.kind), level: row.level === null ? null : asNumber(row.level),
    text: asString(row.text), digest: asString(row.digest),
  };
}

/** Every position past `after` moves by `delta`; the offset nodes there, keyed by position, go first and are written again. */
function shiftPositions(db: DatabaseSync, branchId: string, after: number, delta: 1 | -1): void {
  db.prepare('DELETE FROM working_offset_nodes WHERE branch_id = ? AND position > ?').run(branchId, after);
  for (const table of ['working_blocks', 'manuscript_outline']) {
    db.prepare(`UPDATE ${table} SET position = position + ? WHERE branch_id = ? AND position > ?`).run(POSITION_SHIFT, branchId, after);
    db.prepare(`UPDATE ${table} SET position = position - ? WHERE branch_id = ? AND position > ?`).run(POSITION_SHIFT - delta, branchId, POSITION_SHIFT);
  }
}

/**
 * The Fenwick offset nodes from `from` on, written again over the working state as it now stands. The nodes below `from`
 * cover only blocks the command left where they were, so they stay, and every prefix this needs below `from` reads them.
 */
function rebuildOffsetNodesFrom(db: DatabaseSync, branchId: string, from: number): void {
  const total = lastWorkingPosition(db, branchId);
  requireBounded(Number.isSafeInteger(from) && from >= 1 && from <= total, 'OFFSET_INDEX_INVALID', '稿件偏移重建位置无效。');
  db.prepare('DELETE FROM working_offset_nodes WHERE branch_id = ? AND position >= ?').run(branchId, from);
  const base = workingOffsetPrefix(db, branchId, from - 1);
  const prefix: number[] = [];
  let running = base;
  let cursor = from - 1;
  while (cursor < total) {
    const rows = db.prepare('SELECT position, grapheme_length FROM working_blocks WHERE branch_id = ? AND position > ? ORDER BY position LIMIT ?')
      .all(branchId, cursor, MIGRATION_BATCH) as SqlRow[];
    requireBounded(rows.length > 0, 'OFFSET_INDEX_INVALID', '稿件偏移重建缺少内容块。');
    for (const row of rows) {
      cursor = asNumber(row.position);
      requireBounded(cursor === from + prefix.length, 'OFFSET_INDEX_INVALID', '工作稿内容块顺序不连续。');
      running += asNumber(row.grapheme_length);
      prefix.push(running);
    }
  }
  const prefixAt = (position: number): number => position >= from ? prefix[position - from]! : position === from - 1 ? base : workingOffsetPrefix(db, branchId, position);
  const insert = db.prepare('INSERT INTO working_offset_nodes(branch_id, position, span_graphemes) VALUES (?, ?, ?)');
  for (let position = from; position <= total; position += 1) insert.run(branchId, position, prefixAt(position) - prefixAt(position - fenwickSpan(position)));
}

function refreshSearch(db: DatabaseSync, branchId: string, blockId: string, text: string | null): void {
  db.prepare('DELETE FROM working_block_search WHERE branch_id = ? AND block_id = ?').run(branchId, blockId);
  if (text !== null) db.prepare('INSERT INTO working_block_search(branch_id, block_id, text) VALUES (?, ?, ?)').run(branchId, blockId, text);
}

function requireParagraph(block: WorkingBlock | undefined, digest: string): asserts block is WorkingBlock {
  requireBounded(block !== undefined, 'EDIT_BLOCK_CHANGED', '稳定内容块不存在。');
  requireBounded(block.kind === 'paragraph', 'STRUCTURE_INVALID', '只有正文段落可以拆分或合并。');
  requireBounded(block.digest === digest, 'EDIT_BLOCK_CHANGED', '内容块已变化，请刷新窗口。');
}

/** The working state with `blockId` split at grapheme `at`: its head stays, its tail becomes `newBlockId` right after it. */
function splitWorking(db: DatabaseSync, branchId: string, blockId: string, newBlockId: string, at: number, expectedDigest: string): { head: string; tail: string } {
  const block = workingBlock(db, branchId, blockId);
  requireParagraph(block, expectedDigest);
  const parts = graphemes(block.text);
  requireBounded(Number.isSafeInteger(at) && at >= 0 && at <= parts.length, 'EDIT_RANGE_INVALID', '拆分位置无效。');
  const head = parts.slice(0, at).join('');
  const tail = parts.slice(at).join('');
  shiftPositions(db, branchId, block.position, 1);
  db.prepare('UPDATE working_blocks SET text = ?, digest = ?, grapheme_length = ? WHERE branch_id = ? AND block_id = ?')
    .run(head, blockDigest('paragraph', null, head), at, branchId, blockId);
  db.prepare(
    `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
     VALUES (?, ?, ?, 'paragraph', NULL, ?, ?, ?)`,
  ).run(branchId, newBlockId, block.position + 1, tail, blockDigest('paragraph', null, tail), parts.length - at);
  refreshSearch(db, branchId, blockId, head);
  refreshSearch(db, branchId, newBlockId, tail);
  rebuildOffsetNodesFrom(db, branchId, block.position);
  return { head, tail };
}

/** The working state with `mergedBlockId`, the paragraph right after `intoBlockId`, taken into it. */
function joinWorking(
  db: DatabaseSync, branchId: string, intoBlockId: string, mergedBlockId: string, intoDigest: string, mergedDigest: string,
): { intoText: string; mergedText: string; joined: string } {
  const into = workingBlock(db, branchId, intoBlockId);
  const merged = workingBlock(db, branchId, mergedBlockId);
  requireParagraph(into, intoDigest);
  requireParagraph(merged, mergedDigest);
  requireBounded(merged.position === into.position + 1, 'STRUCTURE_INVALID', '只能与紧邻的上一段合并。');
  const joined = into.text + merged.text;
  const length = stagedBlockLength(joined, 'EDIT_TOO_LARGE', '合并后的段落超出安全范围。');
  requireBounded(joined.length <= MAX_BLOCK_CODE_UNITS && length <= MAX_BLOCK_GRAPHEMES, 'EDIT_TOO_LARGE', '合并后的段落超出安全范围。');
  db.prepare('DELETE FROM working_blocks WHERE branch_id = ? AND block_id = ?').run(branchId, mergedBlockId);
  db.prepare('UPDATE working_blocks SET text = ?, digest = ?, grapheme_length = ? WHERE branch_id = ? AND block_id = ?')
    .run(joined, blockDigest('paragraph', null, joined), length, branchId, intoBlockId);
  shiftPositions(db, branchId, merged.position, -1);
  refreshSearch(db, branchId, intoBlockId, joined);
  refreshSearch(db, branchId, mergedBlockId, null);
  rebuildOffsetNodesFrom(db, branchId, into.position);
  return { intoText: into.text, mergedText: merged.text, joined };
}

const LIVE_MARKS = `status IN ('open', 'resolved', 'applied') AND anchor_state IN ('exact', 'drifted')`;

/** A ranged 修改建议 the command moves no longer stands where its Proposal Change Item names its words (ED-044). */
function movedState(row: SqlRow, drift: boolean): string {
  return drift && asString(row.kind) === 'change-suggestion' && asString(row.pinned_text) !== '' ? 'drifted' : asString(row.anchor_state);
}

/** The marks of `fromBlockId` at or past grapheme `at` go to `toBlockId`; one across `at` stays, drifted. */
function splitMarks(db: DatabaseSync, branchId: string, fromBlockId: string, toBlockId: string, at: number, sequence: number, drift: boolean): void {
  const rows = db.prepare(`SELECT mark_id, kind, pinned_text, from_grapheme, to_grapheme, anchor_state FROM editorial_marks
    WHERE branch_id = ? AND block_id = ? AND ${LIVE_MARKS}`).all(branchId, fromBlockId) as SqlRow[];
  const update = db.prepare(`UPDATE editorial_marks SET block_id = ?, from_grapheme = ?, to_grapheme = ?, anchor_state = ?, followed_journal_sequence = ?
    WHERE mark_id = ?`);
  for (const row of rows) {
    const from = asNumber(row.from_grapheme);
    const to = asNumber(row.to_grapheme);
    if (to <= at) continue;
    if (from >= at) update.run(toBlockId, from - at, to - at, movedState(row, drift), sequence, asString(row.mark_id));
    else update.run(fromBlockId, from, at, 'drifted', sequence, asString(row.mark_id));
  }
}

/** Every mark of `fromBlockId` goes to `intoBlockId`, `offset` graphemes on. */
function joinMarks(db: DatabaseSync, branchId: string, intoBlockId: string, fromBlockId: string, offset: number, sequence: number, drift: boolean): void {
  const rows = db.prepare(`SELECT mark_id, kind, pinned_text, from_grapheme, to_grapheme, anchor_state FROM editorial_marks
    WHERE branch_id = ? AND block_id = ? AND ${LIVE_MARKS}`).all(branchId, fromBlockId) as SqlRow[];
  const update = db.prepare(`UPDATE editorial_marks SET block_id = ?, from_grapheme = ?, to_grapheme = ?, anchor_state = ?, followed_journal_sequence = ?
    WHERE mark_id = ?`);
  for (const row of rows) {
    update.run(intoBlockId, asNumber(row.from_grapheme) + offset, asNumber(row.to_grapheme) + offset, movedState(row, drift), sequence, asString(row.mark_id));
  }
}

const insertMember = (db: DatabaseSync, groupId: string, position: number, blockId: string, before: string | null, after: string | null): void => {
  db.prepare(
    `INSERT INTO manuscript_command_edits(
       command_group_id, position, block_id, before_text, before_digest, after_text, after_digest, before_present, after_present
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(groupId, position, blockId, before ?? '', blockDigest('paragraph', null, before ?? ''), after ?? '', blockDigest('paragraph', null, after ?? ''),
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
  requireBounded(input.insertText === '' && input.fromGrapheme === input.toGrapheme, 'EDIT_INVALID', '结构编辑不写入文字。');
  const sequence = binding.journalSequence + 1;
  const groupId = randomUUID();
  const durableAt = new Date().toISOString();
  db.prepare("UPDATE manuscript_command_groups SET status = 'superseded' WHERE branch_id = ? AND status = 'undone'").run(binding.branchId);
  db.prepare(
    `INSERT INTO manuscript_command_groups(
       command_group_id, branch_id, ordinal, kind, status, source_group_id, before_working_digest, after_working_digest, created_at
     ) VALUES (?, ?, ?, ?, 'applied', NULL, ?, ?, ?)`,
  ).run(groupId, binding.branchId, binding.historySequence + 1, structure.kind, binding.workingDigest, '0'.repeat(64), durableAt);
  let resultingDigest: string;
  if (structure.kind === 'split') {
    requireBounded(BLOCK_PATTERN.test(structure.newBlockId) &&
      db.prepare('SELECT 1 FROM manuscript_blocks WHERE block_id = ?').get(structure.newBlockId) === undefined,
    'STRUCTURE_INVALID', '新段落标识无效或已被使用。');
    db.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)')
      .run(structure.newBlockId, binding.manuscriptId, binding.revisionId);
    const before = workingBlock(db, binding.branchId, input.blockId)?.text ?? '';
    const { head, tail } = splitWorking(db, binding.branchId, input.blockId, structure.newBlockId, input.fromGrapheme, input.baseBlockDigest);
    splitMarks(db, binding.branchId, input.blockId, structure.newBlockId, input.fromGrapheme, sequence, true);
    insertMember(db, groupId, 1, input.blockId, before, head);
    insertMember(db, groupId, 2, structure.newBlockId, null, tail);
    db.prepare("INSERT INTO manuscript_block_lineage(block_id, related_block_id, relation, command_group_id) VALUES (?, ?, 'split-from', ?)")
      .run(structure.newBlockId, input.blockId, groupId);
    resultingDigest = blockDigest('paragraph', null, head);
  } else {
    requireBounded(BLOCK_PATTERN.test(structure.mergedBlockId) && structure.mergedBlockId !== input.blockId, 'STRUCTURE_INVALID', '合并段落标识无效。');
    const { intoText, mergedText, joined } = joinWorking(db, binding.branchId, input.blockId, structure.mergedBlockId, input.baseBlockDigest, structure.mergedBlockDigest);
    requireBounded(graphemes(intoText).length === input.fromGrapheme, 'EDIT_RANGE_INVALID', '合并位置无效。');
    joinMarks(db, binding.branchId, input.blockId, structure.mergedBlockId, input.fromGrapheme, sequence, true);
    insertMember(db, groupId, 1, input.blockId, intoText, joined);
    insertMember(db, groupId, 2, structure.mergedBlockId, mergedText, null);
    db.prepare("INSERT INTO manuscript_block_lineage(block_id, related_block_id, relation, command_group_id) VALUES (?, ?, 'merged-into', ?)")
      .run(structure.mergedBlockId, input.blockId, groupId);
    resultingDigest = blockDigest('paragraph', null, joined);
  }
  const workingDigest = recoveryWorkingDigest(binding.workingDigest, sequence, structure.kind, groupId, recoveryCommandEvidenceDigest(db, groupId));
  requireBounded(db.prepare('UPDATE manuscript_command_groups SET after_working_digest = ? WHERE command_group_id = ? AND after_working_digest = ?')
    .run(workingDigest, groupId, '0'.repeat(64)).changes === 1, 'HISTORY_CORRUPT', '编辑命令证据无法绑定工作状态链。');
  db.prepare(
    `INSERT INTO edit_journal_entries(
       journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
       sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
       resulting_working_digest, durable_at, command_group_id, command_kind, service_lifetime_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), input.clientEditId, fingerprint, input.manuscriptId, input.branchId, input.baseRevisionId, sequence, input.blockId,
    input.fromGrapheme, input.toGrapheme, resultingDigest, workingDigest, durableAt, groupId, structure.kind, serviceLifetimeId);
  const state = db.prepare(
    `UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, history_sequence = ?
     WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`,
  ).run(sequence, workingDigest, binding.historySequence + 1, binding.branchId, binding.journalSequence, binding.workingDigest);
  requireBounded(state.changes === 1, 'EDIT_SEQUENCE_CHANGED', '修订日志在保存时已前进。');
  hooks.recordLifetimeWrite(sequence, workingDigest, durableAt);
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
    splitMarks(db, branchId, firstId, secondId, at, sequence, action === 'redo');
  } else {
    const intoDigest = kind === 'split' ? asString(first.after_digest) : asString(first.before_digest);
    const mergedDigest = kind === 'split' ? asString(second.after_digest) : asString(second.before_digest);
    let offset = 0;
    stale(() => { offset = graphemes(joinWorking(db, branchId, firstId, secondId, intoDigest, mergedDigest).intoText).length; });
    joinMarks(db, branchId, firstId, secondId, offset, sequence, action === 'redo');
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
     WHERE e.branch_id = ? AND e.sequence > ? AND e.sequence <= ? AND g.kind IN ('split', 'merge') LIMIT 1`,
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
  const inventory = one(db.prepare('SELECT count(*) total, coalesce(max(position), 0) maximum FROM working_blocks WHERE branch_id = ?')
    .all(branchId) as SqlRow[], 'RECOVERY_CLASSIFICATION_UNCERTAIN', '恢复工作状态清单缺失。');
  if (asNumber(inventory.total) !== present || asNumber(inventory.total) !== asNumber(inventory.maximum)) fail('恢复检查点与工作状态的内容块清单不一致。');
}
