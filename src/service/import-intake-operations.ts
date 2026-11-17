import type { DatabaseSync } from 'node:sqlite';
import { requireStore } from './store-records.js';
import { commitNoteSources } from './manuscript/note-blocks.js';
import { insertMergedImportBlocks } from './manuscript/merged-import-blocks.js';

/** Writes r1 inside the caller's existing transaction; the continuation preserves intervening workflow/receipt writes. */
export function writeImportedManuscriptRows<T>(db: DatabaseSync, args: {
  input: { draftId: string }; bookId: string; manuscriptId: string; branchId: string; revisionId: string;
  sourceVersionId: string; revisionDigest: string; workingDigest: string; now: string;
  shaped: boolean; word: unknown; snapshot: { blockCount: number }; blockCount: number; unmappedBlocks: number;
  characterCount: number; merged: Parameters<typeof insertMergedImportBlocks>[2] | null;
  structure: Parameters<typeof insertMergedImportBlocks>[3];
}, betweenSourcesAndWorkingState: () => T, initializeImportedBranch: (branchId: string) => number): {
  blockCount: number; unmappedBlocks: number; between: T;
} {
  const { input, bookId, manuscriptId, branchId, revisionId, sourceVersionId, revisionDigest, workingDigest,
    now, shaped, word, snapshot, characterCount, merged, structure } = args;
  let { blockCount, unmappedBlocks } = args;
      db.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'primary', ?)").run(manuscriptId, bookId, now);
      db.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)').run(branchId, manuscriptId, '主分支', now);
      db
        .prepare(
          `INSERT INTO manuscript_revisions(
             revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
             source_version_id, revision_digest, created_at
           ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
        )
        .run(revisionId, manuscriptId, branchId, sourceVersionId, revisionDigest, now);
      db.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(revisionId, branchId);
      if (!shaped) {
        db.prepare(
          `INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id)
           SELECT staged_block_id, ?, ? FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(manuscriptId, revisionId, input.draftId);
        db.prepare(
          `INSERT INTO manuscript_block_versions(
             revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
           ) SELECT ?, staged_block_id, position, kind, level, text, digest, start_offset, grapheme_length
             FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(revisionId, input.draftId);
        db.prepare(
          `INSERT INTO working_blocks(
             branch_id, block_id, position, kind, level, text, digest, grapheme_length
           ) SELECT ?, staged_block_id, position, kind, level, text, digest, grapheme_length
             FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`,
        ).run(branchId, input.draftId);
        // ADR 0086 §3: every block of r1 is its staged body paragraph, which the staged sources name.
        const mapped = word === undefined ? db.prepare(
          `INSERT INTO manuscript_block_sources(
             revision_id, block_id, source_version_id, source_part, source_paragraph_index,
             box_ordinal, box_paragraph_ordinal, source_paragraph_digest, created_at
           ) SELECT ?, b.staged_block_id, ?, 'body', s.source_paragraph_index, NULL, NULL, b.digest, ?
             FROM staged_import_blocks b
             JOIN staged_import_block_sources s ON s.draft_id = b.draft_id AND s.position = b.position
             WHERE b.draft_id = ? ORDER BY b.position`,
        ).run(revisionId, sourceVersionId, now, input.draftId) : null;
        const noted = commitNoteSources(db, { revisionId, sourceVersionId, draftId: input.draftId, createdAt: now });
        requireStore(mapped === null || Number(mapped.changes) + noted === snapshot.blockCount, 'IMPORT_POSTCONDITION_FAILED', '稿件内容块的来源段落对应不完整。');
      } else {
        ({ blockCount, unmapped: unmappedBlocks } = insertMergedImportBlocks(db,
          { draftId: input.draftId, manuscriptId, revisionId, branchId, sourceVersionId, now }, merged ?? [], structure));
      }
  const between = betweenSourcesAndWorkingState();
      db
        .prepare(
          `INSERT INTO branch_working_state(
             branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
             total_graphemes, history_sequence, last_checkpoint_sequence
           ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
        )
        .run(branchId, manuscriptId, revisionId, workingDigest, characterCount);
      requireStore(
        initializeImportedBranch(branchId) === characterCount,
        'IMPORT_POSTCONDITION_FAILED',
        '稿件索引无法由暂存快照精确建立。',
      );
  return { blockCount, unmappedBlocks, between };
}
