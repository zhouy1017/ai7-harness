import type { DatabaseSync } from 'node:sqlite';
import type { ManuscriptBlockProjection } from '../../shared/protocol.js';
import type { StagedTextBoxParagraph } from '../import-retention.js';
import { asNumber, asString, sha256, type SqlRow } from './bounded-kernel.js';
import { commitNoteSources } from './note-blocks.js';

const MERGE_BATCH_SIZE = 256;

/**
 * Revision r1's blocks when the review merged its text boxes (ADR 0086 §2): the staged body blocks and every staged text-box
 * paragraph in document order — which puts each box's paragraphs right after the paragraph that anchors it — with positions and
 * offsets counted afresh, and the source of every block recorded beside it. A body block keeps its staged identity; a merged
 * paragraph takes one derived from its draft, its box and its place in the box. The note blocks (Issue #1204) follow every body
 * block and every box, keep their staged identities, and record their notes. Runs in the commit's transaction.
 */
export function insertMergedImportBlocks(
  db: DatabaseSync,
  input: { draftId: string; manuscriptId: string; revisionId: string; branchId: string; sourceVersionId: string; now: string },
  merged: ReadonlyArray<StagedTextBoxParagraph>,
): void {
  const { draftId, manuscriptId, revisionId, branchId, sourceVersionId, now } = input;
  const insertBlock = db.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)');
  const insertVersion = db.prepare(
    `INSERT INTO manuscript_block_versions(
       revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertWorking = db.prepare(
    `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSource = db.prepare(
    `INSERT INTO manuscript_block_sources(
       revision_id, block_id, source_version_id, source_part, source_paragraph_index,
       box_ordinal, box_paragraph_ordinal, source_paragraph_digest, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let position = 0;
  let offset = 0;
  const write = (block: {
    blockId: string; kind: ManuscriptBlockProjection['kind']; level: number | null; text: string; digest: string;
    graphemeLength: number; sourceParagraphIndex: number | null; box: { ordinal: number; paragraph: number } | null;
  }): void => {
    position += 1;
    insertBlock.run(block.blockId, manuscriptId, revisionId);
    insertVersion.run(revisionId, block.blockId, position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
    insertWorking.run(branchId, block.blockId, position, block.kind, block.level, block.text, block.digest, block.graphemeLength);
    if (block.sourceParagraphIndex !== null) {
      insertSource.run(
        revisionId, block.blockId, sourceVersionId, block.box === null ? 'body' : 'text-box', block.sourceParagraphIndex,
        block.box?.ordinal ?? null, block.box?.paragraph ?? null, block.digest, now,
      );
    }
    offset += block.graphemeLength;
  };
  let next = 0;
  const writeBoxParagraphsBefore = (limit: number): void => {
    while (next < merged.length && merged[next]!.sourceParagraphIndex < limit) {
      const paragraph = merged[next]!;
      write({
        blockId: `blk_${sha256(`${draftId}\u0000text-box\u0000${paragraph.boxOrdinal}\u0000${paragraph.boxParagraphOrdinal}\u0000${paragraph.digest}`).slice(0, 24)}`,
        kind: paragraph.kind,
        level: paragraph.level,
        text: paragraph.text,
        digest: paragraph.digest,
        graphemeLength: paragraph.graphemeLength,
        sourceParagraphIndex: paragraph.sourceParagraphIndex,
        box: { ordinal: paragraph.boxOrdinal, paragraph: paragraph.boxParagraphOrdinal },
      });
      next += 1;
    }
  };
  let cursor = 0;
  while (true) {
    const rows = db.prepare(
      `SELECT b.staged_block_id, b.position, b.kind, b.level, b.text, b.digest, b.grapheme_length, s.source_paragraph_index
       FROM staged_import_blocks b
       LEFT JOIN staged_import_block_sources s ON s.draft_id = b.draft_id AND s.position = b.position
       WHERE b.draft_id = ? AND b.position > ? ORDER BY b.position LIMIT ?`,
    ).all(draftId, cursor, MERGE_BATCH_SIZE) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      cursor = asNumber(row.position);
      const note = asString(row.kind) === 'note';
      const sourceParagraphIndex = note ? null : asNumber(row.source_paragraph_index);
      writeBoxParagraphsBefore(sourceParagraphIndex ?? Number.POSITIVE_INFINITY);
      write({
        blockId: asString(row.staged_block_id),
        kind: asString(row.kind) as ManuscriptBlockProjection['kind'],
        level: row.level === null ? null : asNumber(row.level),
        text: asString(row.text),
        digest: asString(row.digest),
        graphemeLength: asNumber(row.grapheme_length),
        sourceParagraphIndex,
        box: null,
      });
    }
  }
  writeBoxParagraphsBefore(Number.POSITIVE_INFINITY);
  commitNoteSources(db, { revisionId, sourceVersionId, draftId, createdAt: now });
}
