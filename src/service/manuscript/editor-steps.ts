import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { DurableHistoryProjection, EditorStepSummary } from '../../shared/protocol/manuscript-window.js';
import { EditorialMarkError, followBlockTextChangeForMarks } from '../editorial-marks.js';
import { syncInlineEditorRevision } from '../inline-editor-revisions.js';
import { BoundedStoreError, HISTORY_BATCH, asNumber, asString, canonicalJson, graphemes, one, requireBounded, sha256, transact, type SqlRow } from './bounded-kernel.js';
import { blockShapeFromDigest, recoveryCommandEvidenceDigest, recoveryWorkingDigest, validateCommandHistoryGroup } from './command-history.js';
import { historyStale, isStructuralGroup, replayStructuralGroup } from './structural-edits.js';
import { rewriteBlock, workingBlock } from './working-positions.js';

/**
 * Undo by editor step (Issue #1654; ADR 0105 §1, Owner items 7 and 8). Every editor action writes one step in its existing
 * transaction — typing, a style, a split, a merge, a replacement, an accepted 修改建议, a batch, 全部替换, an AI edit, a card's
 * 撤销本次修改, an in-place revision decision — and Ctrl+Z takes back the newest applied step as one transaction, whatever its
 * kind; redo replays the oldest undone one.
 *
 * A text step names its command groups and replays them. An Apply step owns Effect *slots*, one per Effect it wrote (a
 * reversal consumes its whole Effect, so a batch's items share one slot); each slot is a chain of generations, and a step
 * only ever reverses or re-applies its slot's current generation, through the governed Effect path with interaction
 * `undo-step` or `redo-step`. A card's 撤销本次修改 adds a generation to the slot that owns the Effect it reversed, so undoing
 * it returns that slot to the accepting step. Only a new step supersedes undone steps; a dispatch made by undo or redo opens
 * nothing and supersedes nothing. A step whose words changed afterwards, or whose suggestion was handled another way, is not
 * undone: nothing is written, the answer names the place and the cause, and the step is set `kept`, so the next Ctrl+Z moves
 * to the step before (a redo that cannot stand is dropped). A step a card had already taken back writes nothing and is set
 * aside the same way, with an answer that says so.
 *
 * A split or merge step also records the anchors of the marks at its caret before and after it; its undo (redo) puts back
 * the recorded `pre` (`post`) anchor of a mark that still stands exactly on the other side, which the byte-identical text
 * the structural replay proves makes safe (ADR 0105 §1, Commander decision of 2026-11-22). R5-5's `restore` reuses them.
 */
export const EDITOR_STEP_SCHEMA_SQL = {
  editor_steps: `CREATE TABLE editor_steps (
    step_id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
    ordinal INTEGER NOT NULL CHECK(ordinal > 0),
    kind TEXT NOT NULL CHECK(kind IN ('typing', 'style', 'split', 'merge', 'replace', 'accept', 'accept-batch', 'replace-all',
      'ai-edit', 'reverse-card', 'inline-decision', 'restore')),
    status TEXT NOT NULL CHECK(status IN ('applied', 'undone', 'superseded', 'kept')),
    label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 400),
    anchor_block_id TEXT REFERENCES manuscript_blocks(block_id),
    change_count INTEGER NOT NULL CHECK(change_count >= 1),
    created_at TEXT NOT NULL,
    UNIQUE(branch_id, ordinal)
  ) STRICT`,
  editor_step_parts: `CREATE TABLE editor_step_parts (
    step_id TEXT NOT NULL REFERENCES editor_steps(step_id),
    seq INTEGER NOT NULL CHECK(seq > 0),
    command_group_id TEXT REFERENCES manuscript_command_groups(command_group_id),
    slot_step_id TEXT REFERENCES editor_steps(step_id),
    slot INTEGER CHECK(slot > 0),
    inline_mark_id TEXT REFERENCES editorial_marks(mark_id),
    CHECK((command_group_id IS NOT NULL) + (slot IS NOT NULL) + (inline_mark_id IS NOT NULL) = 1),
    CHECK((slot IS NULL) = (slot_step_id IS NULL)),
    PRIMARY KEY(step_id, seq)
  ) STRICT`,
  editor_step_effects: `CREATE TABLE editor_step_effects (
    step_id TEXT NOT NULL REFERENCES editor_steps(step_id),
    slot INTEGER NOT NULL CHECK(slot > 0),
    generation INTEGER NOT NULL CHECK(generation > 0),
    effect_id TEXT NOT NULL UNIQUE REFERENCES manuscript_effect_intents(effect_id),
    polarity TEXT NOT NULL CHECK(polarity IN ('apply', 'reverse')),
    written_by_step_id TEXT NOT NULL REFERENCES editor_steps(step_id),
    written_as TEXT NOT NULL CHECK(written_as IN ('do', 'undo', 'redo')),
    PRIMARY KEY(step_id, slot, generation)
  ) STRICT`,
  editor_step_mark_anchors: `CREATE TABLE editor_step_mark_anchors (
    step_id TEXT NOT NULL REFERENCES editor_steps(step_id),
    side TEXT NOT NULL CHECK(side IN ('pre', 'post')),
    mark_id TEXT NOT NULL REFERENCES editorial_marks(mark_id),
    block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
    from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
    to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
    anchor_state TEXT NOT NULL CHECK(anchor_state IN ('exact', 'drifted')),
    PRIMARY KEY(step_id, side, mark_id)
  ) STRICT`,
} as const;

export const EDITOR_STEP_INDEX_SQL = {
  editor_steps_walk: `CREATE INDEX editor_steps_walk ON editor_steps(branch_id, status, ordinal)`,
} as const;

export type EditorStepKind = 'typing' | 'style' | 'split' | 'merge' | 'replace' | 'accept' | 'accept-batch' | 'replace-all' | 'ai-edit'
  | 'reverse-card' | 'inline-decision' | 'restore';

/** What an ambient step (a composite action) says it is; its label is written once its changes are counted. */
export interface EditorStepSpec {
  readonly kind: EditorStepKind;
  readonly label: (changes: number) => string;
}

interface OpenStep { readonly branchId: string; readonly spec: EditorStepSpec; stepId: string | null; seq: number; slots: number; changes: number }
interface Replay { readonly stepId: string; readonly action: 'undo' | 'redo'; target: { stepId: string; slot: number } | null; partBlockId: string | null; wrote: boolean }
interface Context { ambient: OpenStep[]; replay: Replay | null }

const contexts = new WeakMap<DatabaseSync, Context>();
const contextOf = (db: DatabaseSync): Context => {
  let context = contexts.get(db);
  if (context === undefined) contexts.set(db, context = { ambient: [], replay: null });
  return context;
};

const LABELS: Readonly<Record<Exclude<EditorStepKind, 'accept-batch' | 'replace-all' | 'ai-edit' | 'restore'>, string>> = {
  typing: '编辑文字', style: '更改段落样式', split: '分段', merge: '合段', replace: '替换', accept: '接受修改建议',
  'reverse-card': '撤销本次修改', 'inline-decision': '处理编辑修订',
};

/** Manuscript words inside a step's label, kept short: the label names the step, it does not repeat the text. */
export function stepQuote(text: string): string {
  const parts = graphemes(text);
  return parts.length <= 12 ? text : `${parts.slice(0, 12).join('')}…`;
}

/** A new step of `branchId`: every undone step, and its command groups, is superseded first (only a new step does that). */
function openStep(db: DatabaseSync, branchId: string, kind: EditorStepKind, label: string, anchorBlockId: string | null, changes: number): string {
  db.prepare("UPDATE manuscript_command_groups SET status = 'superseded' WHERE branch_id = ? AND status = 'undone'").run(branchId);
  db.prepare("UPDATE editor_steps SET status = 'superseded' WHERE branch_id = ? AND status = 'undone'").run(branchId);
  const ordinal = asNumber((db.prepare('SELECT coalesce(max(ordinal), 0) + 1 n FROM editor_steps WHERE branch_id = ?').get(branchId) as SqlRow).n);
  const stepId = randomUUID();
  db.prepare(`INSERT INTO editor_steps(step_id, branch_id, ordinal, kind, status, label, anchor_block_id, change_count, created_at)
    VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, ?)`).run(stepId, branchId, ordinal, kind, label, anchorBlockId, changes, new Date().toISOString());
  return stepId;
}

/** The step a recorded part joins: the ambient step of `branchId` (opened on its first part), or a one-part step of its own. */
function stepFor(db: DatabaseSync, branchId: string, kind: EditorStepKind, label: string, anchorBlockId: string | null, changes: number): OpenStep {
  const ambient = contextOf(db).ambient.findLast((open) => open.branchId === branchId);
  if (ambient !== undefined) {
    ambient.stepId ??= openStep(db, branchId, ambient.spec.kind, ambient.spec.label(1), anchorBlockId, 1);
    ambient.changes += changes;
    return ambient;
  }
  return { branchId, spec: { kind, label: () => label }, stepId: openStep(db, branchId, kind, label, anchorBlockId, changes), seq: 0, slots: 0, changes };
}

function addPart(db: DatabaseSync, step: OpenStep, part: { group?: string; slot?: { stepId: string; slot: number }; mark?: string }): void {
  step.seq += 1;
  db.prepare('INSERT INTO editor_step_parts(step_id, seq, command_group_id, slot_step_id, slot, inline_mark_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(step.stepId, step.seq, part.group ?? null, part.slot?.stepId ?? null, part.slot?.slot ?? null, part.mark ?? null);
}

/**
 * A composite action as one step (全部替换, an AI edit, an in-place revision decision): every part recorded inside `work` on
 * this connection joins it, inside one transaction, each inner write still its own savepoint. No part, no step.
 */
export function withEditorStep<T>(db: DatabaseSync, branchId: string, spec: EditorStepSpec, work: () => T): T {
  return transact(db, () => {
    const context = contextOf(db);
    if (context.replay !== null) return work();
    const open: OpenStep = { branchId, spec, stepId: null, seq: 0, slots: 0, changes: 0 };
    context.ambient.push(open);
    try {
      const result = work();
      if (open.stepId !== null) {
        db.prepare('UPDATE editor_steps SET label = ?, change_count = ? WHERE step_id = ?').run(spec.label(Math.max(1, open.changes)), Math.max(1, open.changes), open.stepId);
      }
      return result;
    } finally {
      context.ambient.splice(context.ambient.indexOf(open), 1);
    }
  });
}

/** A text command's group as a part: typing, a style, a split, a merge, a replacement. Returns its step, or `null` in a replay. */
export function recordGroupPart(db: DatabaseSync, branchId: string, groupId: string, kind: 'typing' | 'style' | 'split' | 'merge' | 'replace',
  anchorBlockId: string | null, label: string = LABELS[kind]): string | null {
  if (contextOf(db).replay !== null) return null;
  const step = stepFor(db, branchId, kind, label, anchorBlockId, 1);
  addPart(db, step, { group: groupId });
  return step.stepId;
}

/** An accepted in-place revision (its text already stands): a part that undo turns back to undecided. */
export function recordInlineDecisionPart(db: DatabaseSync, branchId: string, markId: string, anchorBlockId: string): void {
  if (contextOf(db).replay !== null) return;
  addPart(db, stepFor(db, branchId, 'inline-decision', LABELS['inline-decision'], anchorBlockId, 1), { mark: markId });
}

/**
 * A committed Apply Effect. In a replay it is the replayed slot's next generation. An Apply is a new slot of its step; a
 * card's reversal is the next generation of the slot that owns the reversed Effect, or a slot of its own when no live step
 * owns it (sealed by a restore, a reimport or the upgrade).
 */
export function recordEffectPart(db: DatabaseSync, branchId: string, effect: {
  effectId: string; kind: 'apply' | 'reverse-apply'; reversesEffectId: string | null; batch: boolean; items: number; anchorBlockId: string;
}): void {
  const polarity = effect.kind === 'apply' ? 'apply' : 'reverse';
  const insert = db.prepare(`INSERT INTO editor_step_effects(step_id, slot, generation, effect_id, polarity, written_by_step_id, written_as)
    VALUES (?, ?, (SELECT coalesce(max(generation), 0) + 1 FROM editor_step_effects WHERE step_id = ? AND slot = ?), ?, ?, ?, ?)`);
  const replay = contextOf(db).replay;
  if (replay !== null) {
    requireBounded(replay.target !== null, 'HISTORY_CORRUPT', '撤销步骤的应用记录缺失。');
    insert.run(replay.target.stepId, replay.target.slot, replay.target.stepId, replay.target.slot, effect.effectId, polarity, replay.stepId, replay.action);
    return;
  }
  if (polarity === 'apply') {
    const step = stepFor(db, branchId, effect.batch ? 'accept-batch' : 'accept',
      effect.batch ? `接受本批修改建议（${effect.items.toLocaleString('zh-CN')} 条）` : LABELS.accept, effect.anchorBlockId, effect.items);
    const slot = { stepId: step.stepId!, slot: step.slots += 1 };
    addPart(db, step, { slot });
    insert.run(slot.stepId, slot.slot, slot.stepId, slot.slot, effect.effectId, 'apply', step.stepId, 'do');
    return;
  }
  const step = stepFor(db, branchId, 'reverse-card', LABELS['reverse-card'], effect.anchorBlockId, effect.items);
  const owner = effect.reversesEffectId === null ? undefined : db.prepare(`SELECT e.step_id, e.slot FROM editor_step_effects e
    JOIN editor_steps s ON s.step_id = e.step_id WHERE e.effect_id = ? AND s.status <> 'superseded'`).get(effect.reversesEffectId) as SqlRow | undefined;
  const slot = owner === undefined ? { stepId: step.stepId!, slot: step.slots += 1 } : { stepId: asString(owner.step_id), slot: asNumber(owner.slot) };
  addPart(db, step, { slot });
  insert.run(slot.stepId, slot.slot, slot.stepId, slot.slot, effect.effectId, 'reverse', step.stepId, 'do');
}

/** A reimport or a restore replaces the working state: no step before it can be undone one by one any more. */
export function supersedeAllSteps(db: DatabaseSync, branchId: string): void {
  db.prepare("UPDATE editor_steps SET status = 'superseded' WHERE branch_id = ? AND status <> 'superseded'").run(branchId);
}

// ---- mark anchors of a split or merge step ----------------------------------------------------------------------------

/** The anchors of `markIds` as they stand now, recorded as one side of `stepId`. */
export function recordStepAnchors(db: DatabaseSync, stepId: string | null, side: 'pre' | 'post', markIds: ReadonlyArray<string>): void {
  if (stepId === null || markIds.length === 0) return;
  db.prepare(`INSERT INTO editor_step_mark_anchors(step_id, side, mark_id, block_id, from_grapheme, to_grapheme, anchor_state)
    SELECT ?, ?, mark_id, block_id, from_grapheme, to_grapheme, anchor_state FROM editorial_marks
    WHERE mark_id IN (SELECT value FROM json_each(?)) AND anchor_state IN ('exact', 'drifted')`).run(stepId, side, JSON.stringify(markIds));
}

/** The recorded marks of `stepId` that stand now exactly on its `side` anchor, read before a replay moves them. */
function marksStandingOn(db: DatabaseSync, stepId: string, side: 'pre' | 'post'): string[] {
  return (db.prepare(`SELECT t.mark_id FROM editor_step_mark_anchors t JOIN editorial_marks m ON m.mark_id = t.mark_id
    WHERE t.step_id = ? AND t.side = ? AND m.block_id = t.block_id AND m.from_grapheme = t.from_grapheme AND m.to_grapheme = t.to_grapheme
      AND m.anchor_state = t.anchor_state AND m.status IN ('open', 'resolved', 'applied')`).all(stepId, side) as SqlRow[]).map((row) => asString(row.mark_id));
}

/**
 * After a split or merge step is replayed — its two blocks proven byte-identical to the side being returned to — each mark
 * that stood exactly on the other side before the replay gets its anchor of this side back. Never its status.
 */
function putStepAnchors(db: DatabaseSync, stepId: string, side: 'pre' | 'post', markIds: ReadonlyArray<string>, sequence: number): void {
  if (markIds.length === 0) return;
  db.prepare(`UPDATE editorial_marks SET (block_id, from_grapheme, to_grapheme, anchor_state, followed_journal_sequence) = (
      SELECT t.block_id, t.from_grapheme, t.to_grapheme, t.anchor_state, ? FROM editor_step_mark_anchors t
      WHERE t.step_id = ? AND t.side = ? AND t.mark_id = editorial_marks.mark_id)
    WHERE mark_id IN (SELECT value FROM json_each(?))
      AND EXISTS(SELECT 1 FROM editor_step_mark_anchors t WHERE t.step_id = ? AND t.side = ? AND t.mark_id = editorial_marks.mark_id)`)
    .run(sequence, stepId, side, JSON.stringify(markIds), stepId, side);
}

// ---- undo and redo ----------------------------------------------------------------------------------------------------

export interface EditorStepBinding { manuscriptId: string; branchId: string; revisionId: string; revisionLabel: string; journalSequence: number; workingDigest: string }

/** What the step owner needs of the manuscript and Apply owners, on the authority connection. */
export interface EditorStepHost {
  readonly db: DatabaseSync;
  /** The branch as it stands now (read afresh after every write), refusing a branch under recovery. */
  binding(): EditorStepBinding;
  /** The service lifetime's high-water mark, against the binding read before the write. */
  recordLifetimeWrite(before: EditorStepBinding, sequence: number, workingDigest: string, durableAt: string): void;
  readonly lifetimeId: string;
  /** Reverse one committed Effect whole, as a governed Effect with this interaction. */
  reverseEffect(effectId: string, interaction: 'undo-step' | 'redo-step'): void;
  /** Apply again the items `sourceEffectId` applied, with the decisions its targets name, as a governed Effect. */
  reapplyEffect(sourceEffectId: string, interaction: 'undo-step' | 'redo-step'): void;
}

/**
 * A replay refused by the manuscript or mark owners blocks the step (it is set aside, the next press moves on); only a fault
 * — a corrupt or immutable record, an unresolved outcome — fails the press. A refusal names one of two causes: the words
 * changed since, or the suggestion was handled another way (converted, rejected, removed).
 */
const FAULT = /CORRUPT|IMMUTABLE|UNCERTAIN|UNRESOLVED|STORE_INVALID|RECEIPT_MISSING|IDEMPOTENCY|MANUSCRIPT_NOT_FOUND|RECOVERY/;
const TEXT_CHANGED = new Set(['APPLY_TARGET_DRIFTED', 'HISTORY_STALE', 'HISTORY_AFTER_APPLY', 'EDIT_BLOCK_CHANGED', 'STRUCTURE_INVALID', 'EDIT_RANGE_INVALID',
  'EDIT_TOO_LARGE', 'MARK_BINDING_CHANGED', 'MARK_ANCHOR_CHANGED', 'PROPOSAL_SCOPE_MOVED']);
function refusal(error: unknown): 'text' | 'mark' | null {
  if (!(error instanceof BoundedStoreError) && !(error instanceof EditorialMarkError)) return null;
  if (FAULT.test(error.code)) return null;
  return TEXT_CHANGED.has(error.code) ? 'text' : 'mark';
}

/** One command group replayed backward (undo) or forward (redo), journaled as one entry (#applyHistory's replay, moved here). */
function replayGroup(host: EditorStepHost, groupId: string, action: 'undo' | 'redo', stepId: string): void {
  const db = host.db;
  const binding = host.binding();
  const { branchId } = binding;
  const group = one(db.prepare('SELECT kind FROM manuscript_command_groups WHERE command_group_id = ?').all(groupId) as SqlRow[], 'HISTORY_CORRUPT', '历史命令组缺失。');
  validateCommandHistoryGroup(db, groupId);
  const sequence = binding.journalSequence + 1;
  let totalDelta = 0;
  if (isStructuralGroup(asString(group.kind))) {
    // A split or merge is one step whichever way it goes, and changes no character count (Issue #1175).
    const standing = marksStandingOn(db, stepId, action === 'undo' ? 'post' : 'pre');
    replayStructuralGroup(db, branchId, groupId, asString(group.kind) as 'split' | 'merge', action, sequence);
    putStepAnchors(db, stepId, action === 'undo' ? 'pre' : 'post', standing, sequence);
  } else {
    let cursor = 0;
    for (;;) {
      const rows = db.prepare(`SELECT position, block_id, before_text, before_digest, after_text, after_digest
        FROM manuscript_command_edits WHERE command_group_id = ? AND position > ? ORDER BY position LIMIT ?`).all(groupId, cursor, HISTORY_BATCH) as SqlRow[];
      if (rows.length === 0) break;
      for (const row of rows) {
        cursor = asNumber(row.position);
        const blockId = asString(row.block_id);
        const expectedDigest = action === 'undo' ? asString(row.after_digest) : asString(row.before_digest);
        const targetText = action === 'undo' ? asString(row.before_text) : asString(row.after_text);
        const targetDigest = action === 'undo' ? asString(row.before_digest) : asString(row.after_digest);
        const current = db.prepare('SELECT text, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(branchId, blockId) as SqlRow | undefined;
        if (current === undefined) throw historyStale(db, branchId, groupId, [blockId]);
        const { kind, level } = blockShapeFromDigest(targetText, targetDigest);
        if (rewriteBlock(db, branchId, blockId, { kind, level, text: targetText, digest: targetDigest }, expectedDigest) === null) throw historyStale(db, branchId, groupId, [blockId]);
        followBlockTextChangeForMarks(db, branchId, blockId, asString(current.text), targetText, sequence);
        totalDelta += graphemes(targetText).length - asNumber(current.grapheme_length);
        requireBounded(Number.isSafeInteger(totalDelta), 'HISTORY_CORRUPT', '历史命令字符变化无效。');
      }
    }
  }
  const nextDigest = recoveryWorkingDigest(binding.workingDigest, sequence, action, groupId, recoveryCommandEvidenceDigest(db, groupId));
  const now = new Date().toISOString();
  requireBounded(db.prepare('UPDATE manuscript_command_groups SET status = ? WHERE command_group_id = ? AND status = ?')
    .run(action === 'undo' ? 'undone' : 'applied', groupId, action === 'undo' ? 'applied' : 'undone').changes === 1, 'HISTORY_STALE', '稿件历史状态已变化。');
  const representative = one(db.prepare('SELECT block_id, before_digest, after_digest FROM manuscript_command_edits WHERE command_group_id = ? ORDER BY position LIMIT 1')
    .all(groupId) as SqlRow[], 'HISTORY_CORRUPT', '历史命令内容缺失。');
  db.prepare(`INSERT INTO edit_journal_entries(
      journal_entry_id, client_edit_id, request_fingerprint, manuscript_id, branch_id, base_revision_id,
      sequence, block_id, from_grapheme, to_grapheme, insert_text, resulting_block_digest,
      resulting_working_digest, durable_at, command_group_id, command_kind, service_lifetime_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?, ?, ?, ?, ?, ?)`).run(randomUUID(), randomUUID(), sha256(canonicalJson({ action, groupId, sequence })),
    binding.manuscriptId, branchId, binding.revisionId, sequence, asString(representative.block_id),
    action === 'undo' ? asString(representative.before_digest) : asString(representative.after_digest), nextDigest, now, groupId, action, host.lifetimeId);
  requireBounded(db.prepare(`UPDATE branch_working_state SET journal_sequence = ?, working_digest = ?, total_graphemes = total_graphemes + ?
    WHERE branch_id = ? AND journal_sequence = ? AND working_digest = ?`).run(sequence, nextDigest, totalDelta, branchId, binding.journalSequence, binding.workingDigest)
    .changes === 1, 'HISTORY_STALE', '稿件历史提交时工作状态已变化。');
  host.recordLifetimeWrite(binding, sequence, nextDigest, now);
  syncInlineEditorRevision(db, groupId);
}

interface StepRow { stepId: string; kind: EditorStepKind; label: string; anchorBlockId: string | null; changes: number }

const stepRow = (row: SqlRow): StepRow => ({
  stepId: asString(row.step_id), kind: asString(row.kind) as EditorStepKind, label: asString(row.label),
  anchorBlockId: row.anchor_block_id === null ? null : asString(row.anchor_block_id), changes: asNumber(row.change_count),
});

function nextStep(db: DatabaseSync, branchId: string, action: 'undo' | 'redo'): StepRow | null {
  const row = db.prepare(action === 'undo'
    ? "SELECT * FROM editor_steps WHERE branch_id = ? AND status = 'applied' ORDER BY ordinal DESC LIMIT 1"
    : "SELECT * FROM editor_steps WHERE branch_id = ? AND status = 'undone' ORDER BY ordinal ASC LIMIT 1").get(branchId) as SqlRow | undefined;
  return row === undefined ? null : stepRow(row);
}

/** The slot's current generation, and the Effect whose items and decisions a re-apply writes again. */
function slotState(db: DatabaseSync, stepId: string, slot: number): { effectId: string; polarity: 'apply' | 'reverse'; writtenBy: string; writtenAs: string; source: string } {
  const current = one(db.prepare('SELECT * FROM editor_step_effects WHERE step_id = ? AND slot = ? ORDER BY generation DESC LIMIT 1').all(stepId, slot) as SqlRow[],
    'HISTORY_CORRUPT', '撤销步骤的应用记录缺失。');
  const applied = db.prepare("SELECT effect_id FROM editor_step_effects WHERE step_id = ? AND slot = ? AND polarity = 'apply' ORDER BY generation LIMIT 1").get(stepId, slot) as SqlRow | undefined;
  const reversed = applied === undefined ? db.prepare(`SELECT i.reverses_effect_id FROM editor_step_effects e JOIN manuscript_effect_intents i ON i.effect_id = e.effect_id
    WHERE e.step_id = ? AND e.slot = ? ORDER BY e.generation LIMIT 1`).get(stepId, slot) as SqlRow | undefined : undefined;
  return {
    effectId: asString(current.effect_id), polarity: asString(current.polarity) as 'apply' | 'reverse', writtenBy: asString(current.written_by_step_id),
    writtenAs: asString(current.written_as), source: applied !== undefined ? asString(applied.effect_id) : asString(reversed!.reverses_effect_id),
  };
}

/** Every part of `step`, newest first for an undo, oldest first for a redo, written through its owner. */
function replayStep(host: EditorStepHost, step: StepRow, action: 'undo' | 'redo'): string | null {
  const db = host.db;
  const parts = db.prepare(`SELECT * FROM editor_step_parts WHERE step_id = ? ORDER BY seq ${action === 'undo' ? 'DESC' : 'ASC'}`).all(step.stepId) as SqlRow[];
  const replay = contextOf(db).replay!;
  const interaction = action === 'undo' ? 'undo-step' : 'redo-step';
  let lastGroup: string | null = null;
  for (const part of parts) {
    // Where this part stands, read before it runs: a part refused here is the place the answer names (a blocked step).
    replay.partBlockId = partPlace(db, part);
    if (part.command_group_id !== null) {
      lastGroup = asString(part.command_group_id);
      replayGroup(host, lastGroup, action, step.stepId);
      replay.wrote = true;
    } else if (part.inline_mark_id !== null) {
      const markId = asString(part.inline_mark_id);
      const [from, to, accepted] = action === 'undo' ? ['applied', 'open', 0] : ['open', 'applied', 1];
      requireBounded(db.prepare(`UPDATE editorial_marks SET status = ?, updated_at = ? WHERE mark_id = ? AND status = ? AND anchor_state = 'exact'`)
        .run(to, new Date().toISOString(), markId, from).changes === 1, 'MARK_ACTION_INVALID', '这处修订又改过。');
      db.prepare('UPDATE editor_inline_revision_marks SET accepted = ? WHERE mark_id = ?').run(accepted, markId);
      replay.wrote = true;
    } else {
      const target = { stepId: asString(part.slot_step_id), slot: asNumber(part.slot) };
      const state = slotState(db, target.stepId, target.slot);
      replay.target = target;
      // An Apply step takes back its slot's current Apply, and puts back only what its own undo took; a card's step does the
      // opposite. A slot already standing the other way (taken back by a kept card step, or sealed) is skipped.
      const reversing = step.kind !== 'reverse-card' ? action === 'undo' : action === 'redo';
      if (reversing && state.polarity === 'apply') {
        host.reverseEffect(state.effectId, interaction);
        replay.wrote = true;
      } else if (!reversing && state.polarity === 'reverse' && (step.kind === 'reverse-card' || (state.writtenBy === step.stepId && state.writtenAs === 'undo'))) {
        host.reapplyEffect(state.source, interaction);
        replay.wrote = true;
      }
      replay.target = null;
    }
  }
  return lastGroup;
}

/** The block a part acts on: its group's first member, its slot's current Effect's first mark, or its in-place revision's mark. */
function partPlace(db: DatabaseSync, part: SqlRow): string | null {
  const row = (part.command_group_id !== null
    ? db.prepare('SELECT block_id FROM manuscript_command_edits WHERE command_group_id = ? ORDER BY position LIMIT 1').get(asString(part.command_group_id))
    : part.inline_mark_id !== null
      ? db.prepare('SELECT block_id FROM editorial_marks WHERE mark_id = ?').get(asString(part.inline_mark_id))
      : db.prepare(`SELECT m.block_id FROM editor_step_effects e JOIN manuscript_effect_targets t ON t.effect_id = e.effect_id
          JOIN proposal_change_items i ON i.item_id = t.item_id JOIN editorial_marks m ON m.mark_id = i.mark_id
          WHERE e.step_id = ? AND e.slot = ? ORDER BY e.generation DESC, t.ordinal LIMIT 1`).get(asString(part.slot_step_id), asNumber(part.slot))) as SqlRow | undefined;
  return row === undefined ? null : asString(row.block_id);
}

/** Where a step stands now, for the answer: its first Apply's mark, or its anchor block; the paragraph number when it stands. */
function placeOf(db: DatabaseSync, branchId: string, step: StepRow): { blockId: string | null; paragraph: number | null } {
  const mark = db.prepare(`SELECT m.block_id FROM editor_step_parts p
      JOIN editor_step_effects e ON e.step_id = p.slot_step_id AND e.slot = p.slot
      JOIN manuscript_effect_targets t ON t.effect_id = e.effect_id
      JOIN proposal_change_items i ON i.item_id = t.item_id JOIN editorial_marks m ON m.mark_id = i.mark_id
    WHERE p.step_id = ? ORDER BY p.seq, e.generation DESC, t.ordinal LIMIT 1`).get(step.stepId) as SqlRow | undefined;
  const blockId = mark === undefined ? step.anchorBlockId : asString(mark.block_id);
  const row = blockId === null ? undefined : workingBlock(db, branchId, blockId);
  return { blockId: row === undefined ? null : row.blockId, paragraph: row?.position ?? null };
}

/** The answer for a step set aside: why (its words changed, or its suggestion was handled another way), and what the next press does. */
function blockedSentence(action: 'undo' | 'redo', step: StepRow, paragraph: number | null, cause: 'text' | 'mark'): string {
  const place = paragraph === null ? '这一处' : `第 ${paragraph.toLocaleString('zh-CN')} 段`;
  const next = action === 'undo' ? '再按 Ctrl+Z 撤销更早的一步。' : '再按重做会重做后面的一步。';
  if (cause === 'mark') return `${place}的修改建议${action === 'undo' ? '在接受后' : '在撤销后'}已另作处理，「${step.label}」不能${action === 'undo' ? '撤销' : '重做'}。${next}`;
  if (action === 'redo') return `${place}在撤销后又改过，「${step.label}」不能重做。${next}`;
  const apply = step.kind === 'accept' || step.kind === 'accept-batch' || step.kind === 'replace-all' || step.kind === 'ai-edit';
  return apply ? `${place}这处在接受后又改过，这一步不能撤销；可以在卡片上处理。${next}`
    : `${place}在「${step.label}」之后又改过，这一步不能撤销。${next}`;
}

/** The answer for a step whose every change a card had already taken back (or put back): nothing was written. */
function skippedSentence(action: 'undo' | 'redo', step: StepRow): string {
  return action === 'undo' ? `「${step.label}」已在卡片上撤销过，这次没有改动文字。再按 Ctrl+Z 撤销更早的一步。`
    : `「${step.label}」已在卡片上处理过，这次没有改动文字。再按重做会重做后面的一步。`;
}

export function editorStepSummary(db: DatabaseSync, branchId: string, action: 'undo' | 'redo'): EditorStepSummary | null {
  const step = nextStep(db, branchId, action);
  if (step === null) return null;
  const batch = step.kind !== 'accept-batch' ? undefined : db.prepare(`SELECT f.review_run_id, f.category_id FROM editor_step_parts p
      JOIN editor_step_effects e ON e.step_id = p.slot_step_id AND e.slot = p.slot AND e.generation = 1
      JOIN manuscript_effect_targets t ON t.effect_id = e.effect_id JOIN proposal_change_items i ON i.item_id = t.item_id
      JOIN review_findings f ON f.mark_id = i.mark_id
    WHERE p.step_id = ? LIMIT 1`).get(step.stepId) as SqlRow | undefined;
  return {
    stepId: step.stepId, kind: step.kind, label: step.label, changeCount: step.changes, paragraph: placeOf(db, branchId, step).paragraph,
    batch: batch === undefined ? null : { reviewRunId: asString(batch.review_run_id), categoryId: asString(batch.category_id) },
  };
}

/**
 * Ctrl+Z (undo) or redo on `branchId`, in one transaction: the step's parts replayed through their owners in a savepoint;
 * when its words changed since, the savepoint is rolled back, nothing is written, and the step is set aside — `kept` on an
 * undo, dropped on a redo — so the next press moves on. `expectedStepId` names the step the caller means (撤销本批应用).
 */
export function replayEditorStep(host: EditorStepHost, action: 'undo' | 'redo', expectedWorkingDigest: string, expectedStepId?: string): DurableHistoryProjection {
  const db = host.db;
  return transact(db, () => {
    const before = host.binding();
    requireBounded(before.workingDigest === expectedWorkingDigest, 'HISTORY_STALE', '稿件已变化，请刷新历史状态。');
    const step = nextStep(db, before.branchId, action);
    if (step === null) throw new BoundedStoreError(action === 'undo' ? 'NOTHING_TO_UNDO' : 'NOTHING_TO_REDO', action === 'undo' ? '没有可撤销的修改。' : '没有可重做的修改。');
    requireBounded(expectedStepId === undefined || expectedStepId === step.stepId, 'HISTORY_STEP_CHANGED', '这一批之后又有新的修改；请先按 Ctrl+Z 撤销后来的修改，或在这一批的任一张卡片上撤销本次修改。');
    const context = contextOf(db);
    requireBounded(context.replay === null, 'HISTORY_CORRUPT', '撤销不能嵌套。');
    let lastGroup: string | null = null;
    let cause: 'text' | 'mark' | null = null;
    let blockedAt: string | null = null;
    let wrote = false;
    context.replay = { stepId: step.stepId, action, target: null, partBlockId: null, wrote: false };
    try {
      lastGroup = transact(db, () => replayStep(host, step, action));
      wrote = context.replay.wrote;
    } catch (error) {
      cause = refusal(error);
      if (cause === null) throw error;
      blockedAt = context.replay.partBlockId;
    } finally {
      context.replay = null;
    }
    const blocked = cause !== null;
    // A step set aside, or one that wrote nothing (a card had already taken it back), never comes back to the next press.
    const status = blocked || !wrote ? (action === 'undo' ? 'kept' : 'superseded') : action === 'undo' ? 'undone' : 'applied';
    requireBounded(db.prepare('UPDATE editor_steps SET status = ? WHERE step_id = ? AND status = ?').run(status, step.stepId, action === 'undo' ? 'applied' : 'undone').changes === 1,
      'HISTORY_STALE', '稿件历史状态已变化。');
    const after = host.binding();
    // A step set aside is named where the part that refused stands now; a step taken back, where it stands now.
    const refused = blockedAt === null ? undefined : workingBlock(db, after.branchId, blockedAt);
    const place = blocked && refused !== undefined ? { blockId: refused.blockId, paragraph: refused.position } : placeOf(db, after.branchId, step);
    const done = `${action === 'undo' ? '已撤销' : '已重做'}：${step.label}${place.paragraph === null ? '' : `（第 ${place.paragraph.toLocaleString('zh-CN')} 段）`}`;
    return {
      action, branchId: after.branchId, revisionId: after.revisionId, revisionLabel: after.revisionLabel,
      journalSequence: after.journalSequence, workingDigest: after.workingDigest, commandGroupId: lastGroup,
      completionLabel: cause !== null ? blockedSentence(action, step, place.paragraph, cause) : wrote ? done : skippedSentence(action, step),
      canUndo: nextStep(db, after.branchId, 'undo') !== null, canRedo: nextStep(db, after.branchId, 'redo') !== null,
      stepLabel: step.label, anchorBlockId: place.blockId, paragraph: place.paragraph, blocked,
    };
  });
}
