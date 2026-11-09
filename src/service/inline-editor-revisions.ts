import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { computeInlineRevisionDiff } from '../shared/inline-revision-diff.js';
import { graphemesOf } from '../shared/mark-anchor.js';
import type { JournalEditInput, UpdateEditorialMarkInput, EditorialMarkCommandProjection } from '../shared/protocol.js';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import { EditorialMarkStore } from './editorial-marks.js';
import { requireStore } from './store-records.js';
import { transact } from './manuscript/bounded-kernel.js';

/** Links the existing journal history to editor cards, without creating another text/history store. */
export const INLINE_EDITOR_REVISION_SCHEMA_SQL = {
  editor_inline_revision_commands: `CREATE TABLE editor_inline_revision_commands (
  command_group_id TEXT PRIMARY KEY REFERENCES manuscript_command_groups(command_group_id),
  session_id TEXT NOT NULL,
  baseline_text TEXT NOT NULL,
  auto_apply INTEGER NOT NULL CHECK(auto_apply IN (0, 1))
) STRICT`,
  editor_inline_revision_marks: `CREATE TABLE editor_inline_revision_marks (
  mark_id TEXT PRIMARY KEY REFERENCES editorial_marks(mark_id),
  session_id TEXT NOT NULL,
  base_from INTEGER NOT NULL,
  base_to INTEGER NOT NULL,
  before_text TEXT NOT NULL,
  after_text TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0 CHECK(accepted IN (0, 1))
) STRICT`,
} as const;
export const INLINE_EDITOR_REVISION_FOREIGN_KEYS = {
  editor_inline_revision_commands: ['command_group_id>manuscript_command_groups.command_group_id:NO ACTION/NO ACTION/NONE'],
  editor_inline_revision_marks: ['mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE'],
};
export function initializeInlineEditorRevisionSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'editor_inline_revision_commands'").get()) return;
  transact(db, () => { for (const sql of Object.values(INLINE_EDITOR_REVISION_SCHEMA_SQL)) db.exec(sql); });
}

/** Recover this session's original spans against the text just before the next journal write. Unrelated edits stay intact. */
export function inlineRevisionBaseline(db: DatabaseSync, input: JournalEditInput, beforeText: string): string {
  if (!input.editorRevision) return beforeText;
  const rows = db.prepare(`SELECT m.from_grapheme, m.to_grapheme, m.pinned_text, r.before_text
    FROM editor_inline_revision_marks r JOIN editorial_marks m ON m.mark_id = r.mark_id
    WHERE r.session_id = ? AND m.branch_id = ? AND m.block_id = ? AND m.anchor_state = 'exact'
    AND m.status IN ('open', 'applied') ORDER BY m.from_grapheme DESC`).all(input.editorRevision.sessionId, input.branchId, input.blockId);
  const parts = graphemesOf(beforeText);
  for (const row of rows) {
    const from = Number(row.from_grapheme), to = Number(row.to_grapheme);
    if (parts.slice(from, to).join('') === row.pinned_text) parts.splice(from, to - from, ...graphemesOf(String(row.before_text)));
  }
  return parts.join('');
}

export function recordInlineEditorRevision(db: DatabaseSync, input: JournalEditInput, baselineText: string, groupId: string): void {
  if (input.editorRevision === undefined) return;
  const { sessionId, autoApply } = input.editorRevision;
  db.prepare('INSERT INTO editor_inline_revision_commands VALUES (?, ?, ?, ?)')
    .run(groupId, sessionId, baselineText, Number(autoApply));
  syncInlineEditorRevision(db, groupId);
}

/** Called inside the same transaction on edit, undo and redo. Equal-to-baseline edits retire their cards. */
export function syncInlineEditorRevision(db: DatabaseSync, groupId: string): void {
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'editor_inline_revision_commands'").get()) return;
  const session = db.prepare(`SELECT r.*, g.branch_id, e.block_id FROM editor_inline_revision_commands r
    JOIN manuscript_command_groups g ON g.command_group_id = r.command_group_id
    JOIN manuscript_command_edits e ON e.command_group_id = r.command_group_id WHERE r.command_group_id = ?`).get(groupId);
  if (!session) return;
  const branchId = String(session.branch_id), blockId = String(session.block_id), sessionId = String(session.session_id);
  const branch = db.prepare(`SELECT b.manuscript_id, s.base_revision_id revision_id, s.journal_sequence FROM manuscript_branches b
    JOIN branch_working_state s ON s.branch_id = b.branch_id WHERE b.branch_id = ?`).get(branchId)!;
  const block = db.prepare('SELECT text, digest FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(branchId, blockId);
  if (!block) return;
  const diffs = computeInlineRevisionDiff(String(session.baseline_text), String(block.text));
  const old = db.prepare(`SELECT r.* FROM editor_inline_revision_marks r JOIN editorial_marks m ON m.mark_id = r.mark_id
    WHERE r.session_id = ? AND m.branch_id = ? AND m.block_id = ?`).all(sessionId, branchId, blockId);
  const unused = new Set(old.map((row) => String(row.mark_id)));
  const marks = new EditorialMarkStore(db);
  for (const diff of diffs) {
    const matched = old.find((row) => unused.has(String(row.mark_id)) &&
      Number(row.base_from) <= diff.toGrapheme && Number(row.base_to) >= diff.fromGrapheme);
    const from = diff.currentFromGrapheme, to = from + graphemesOf(diff.afterText).length;
    const markId = matched ? String(matched.mark_id) : marks.create({
      manuscriptId: String(branch.manuscript_id), branchId, windowStartBlockId: blockId, clientMarkId: randomUUID(),
      baseRevisionId: String(branch.revision_id), expectedJournalSequence: Number(branch.journal_sequence), blockId,
      baseBlockDigest: String(block.digest), fromGrapheme: from, toGrapheme: to, selectedText: diff.afterText,
      kind: 'change-suggestion', highlightColor: null, body: '', proposedText: diff.afterText, rationale: '编辑修订',
    }, diff.beforeText).markId;
    unused.delete(markId);
    const accepted = matched?.before_text === diff.beforeText && matched.after_text === diff.afterText ? Number(matched.accepted) : 0;
    db.prepare(`INSERT INTO editor_inline_revision_marks(mark_id, session_id, base_from, base_to, before_text, after_text, accepted) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mark_id) DO UPDATE SET base_from = excluded.base_from, base_to = excluded.base_to,
        before_text = excluded.before_text, after_text = excluded.after_text, accepted = excluded.accepted`)
      .run(markId, sessionId, diff.fromGrapheme, diff.toGrapheme, diff.beforeText, diff.afterText, accepted);
    marks.standMarkOn(markId, Number(session.auto_apply) === 1 || accepted === 1 ? 'applied' : 'open', {
      revisionId: String(branch.revision_id), journalSequence: Number(branch.journal_sequence), blockDigest: String(block.digest),
      fromGrapheme: from, toGrapheme: to, text: diff.afterText,
    }, new Date().toISOString());
  }
  for (const markId of unused) db.prepare("UPDATE editorial_marks SET status = 'removed' WHERE mark_id = ?").run(markId);
}

/** Pending edits already stand in the journal; accept keeps them, reject/undo writes their original words back. */
export function decideInlineEditorRevision(db: DatabaseSync, manuscript: BoundedManuscriptStore, lifetimeId: string,
  input: UpdateEditorialMarkInput): EditorialMarkCommandProjection {
  return transact(db, () => {
    const link = db.prepare('SELECT session_id FROM editor_inline_revision_marks WHERE mark_id = ?').get(input.markId);
    requireStore(link !== undefined, 'MARK_ACTION_INVALID', '这不是就地编辑修订。');
    const marks = new EditorialMarkStore(db), card = marks.card(input.manuscriptId, input.branchId, input.markId);
    requireStore(card.anchorState === 'exact' && card.suggestion !== null, 'MARK_BINDING_CHANGED', '这处文字又改过，请先查看当前稿件。');
    if (input.action === 'apply-inline-revision') {
      requireStore(card.status === 'open', 'MARK_ACTION_INVALID', '这处修订已处理。');
      db.prepare('UPDATE editor_inline_revision_marks SET accepted = 1 WHERE mark_id = ?').run(input.markId);
      db.prepare("UPDATE editorial_marks SET status = 'applied', updated_at = ? WHERE mark_id = ?").run(new Date().toISOString(), input.markId);
    } else {
      requireStore(input.action === 'revert-inline-revision', 'MARK_ACTION_INVALID', '修订操作无效。');
      const pin = manuscript.revisionPin(input.manuscriptId, input.branchId, card.blockId);
      const session = db.prepare('SELECT auto_apply FROM editor_inline_revision_commands WHERE session_id = ? LIMIT 1').get(String(link.session_id))!;
      manuscript.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: input.manuscriptId, branchId: input.branchId,
        baseRevisionId: pin.revisionId, expectedJournalSequence: pin.journalSequence, baseBlockDigest: pin.blockDigest,
        blockId: card.blockId, windowStartBlockId: input.windowStartBlockId, fromGrapheme: card.fromGrapheme,
        toGrapheme: card.toGrapheme, insertText: card.suggestion.currentText,
        editorRevision: { sessionId: String(link.session_id), autoApply: Number(session.auto_apply) === 1 } }, lifetimeId);
    }
    const window = manuscript.getWindow(input.manuscriptId, input.branchId, { kind: 'window-start', blockId: input.windowStartBlockId });
    const live = window.marks.some((mark) => mark.markId === input.markId);
    return { markId: input.markId, marks: window.marks, marksTruncated: window.marksTruncated, window,
      card: live ? marks.card(input.manuscriptId, input.branchId, input.markId) : null };
  });
}
