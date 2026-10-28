import type { DatabaseSync } from 'node:sqlite';
import type { ManuscriptBlockProjection } from '../../shared/protocol.js';
import type { ParsedNoteSource } from '../docx-notes.js';
import { asNumber, asString, type SqlRow } from './bounded-kernel.js';

/**
 * The note blocks of a manuscript (Issue #1204; ADR 0096 §1). The native DOCX reading appends one block of kind `note` per
 * footnote or endnote the body refers to, after the last body paragraph. Each staged note block records which note of the file
 * it reads, and each committed Revision's note blocks record the same beside the body's source paragraphs, so export can put a
 * note back into its own part. A note block is edited like a paragraph and is never split or merged; it opens no chapter and
 * stands outside every chapter's range.
 */
export interface StagedNoteSource extends ParsedNoteSource {
  position: number;
}

/** Stage the note sources of a parse beside its staged blocks, in the caller's transaction. */
export function stageNoteSources(db: DatabaseSync, draftId: string, notes: ReadonlyArray<StagedNoteSource>): void {
  const insert = db.prepare(`INSERT INTO staged_import_note_sources(draft_id, position, note_part, note_id, note_ordinal, reference_position)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (const note of notes) insert.run(draftId, note.position, note.part, note.noteId, note.ordinal, note.referencePosition);
}

/** Whether a fresh parse's note sources are exactly the staged ones. */
export function stagedNoteSourcesMatch(db: DatabaseSync, draftId: string, notes: ReadonlyArray<StagedNoteSource>): boolean {
  const rows = db.prepare(`SELECT position, note_part, note_id, note_ordinal, reference_position FROM staged_import_note_sources
    WHERE draft_id = ? ORDER BY position`).all(draftId) as SqlRow[];
  return rows.length === notes.length && rows.every((row, index) => {
    const note = notes[index]!;
    return asNumber(row.position) === note.position && row.note_part === note.part && row.note_id === note.noteId &&
      asNumber(row.note_ordinal) === note.ordinal && (row.reference_position === null ? null : asNumber(row.reference_position)) === note.referencePosition;
  });
}

/** How many of a draft's staged blocks are note blocks. */
export function stagedNoteCount(db: DatabaseSync, draftId: string): number {
  return asNumber((db.prepare('SELECT count(*) total FROM staged_import_note_sources WHERE draft_id = ?').get(draftId) as SqlRow).total);
}

/**
 * Record the note sources of the Revision an import or reimport commits, in its transaction. `blocks` names where the
 * Revision's block ids stand: the staged blocks an import keeps, or the rows a reimport commits. Returns how many it wrote.
 */
export function commitNoteSources(db: DatabaseSync, input: { revisionId: string; sourceVersionId: string; draftId: string; createdAt: string;
  reimportWorkId?: string }): number {
  const blocks = input.reimportWorkId === undefined
    ? { sql: 'SELECT staged_block_id block_id, position, digest FROM staged_import_blocks WHERE draft_id = ?', id: input.draftId }
    : { sql: 'SELECT block_id, position, digest FROM temp.reimport_commit_rows WHERE work_id = ?', id: input.reimportWorkId };
  return Number(db.prepare(`WITH blocks AS (${blocks.sql})
    INSERT INTO manuscript_note_sources(revision_id, block_id, source_version_id, note_part, note_id, note_ordinal, reference_block_id,
      source_note_digest, created_at)
    SELECT ?, b.block_id, ?, n.note_part, n.note_id, n.note_ordinal, ref.block_id, b.digest, ?
    FROM staged_import_note_sources n JOIN blocks b ON b.position = n.position
    LEFT JOIN blocks ref ON ref.position = n.reference_position
    WHERE n.draft_id = ? ORDER BY n.position`).run(blocks.id, input.revisionId, input.sourceVersionId, input.createdAt, input.draftId).changes);
}

/** The window's note blocks with what they say about themselves: part, number and the paragraph that refers to them. */
export function withNoteReferences(db: DatabaseSync, branchId: string, blocks: ManuscriptBlockProjection[]): ManuscriptBlockProjection[] {
  if (!blocks.some((block) => block.kind === 'note')) return blocks;
  const source = db.prepare(`SELECT ns.note_part, ns.note_ordinal, ns.reference_block_id, wb.position reference_position
    FROM manuscript_note_sources ns LEFT JOIN working_blocks wb ON wb.branch_id = ? AND wb.block_id = ns.reference_block_id
    WHERE ns.block_id = ? ORDER BY ns.rowid DESC LIMIT 1`);
  return blocks.map((block) => {
    if (block.kind !== 'note') return block;
    const row = source.get(branchId, block.blockId) as SqlRow | undefined;
    if (row === undefined) return block;
    return { ...block, note: {
      part: asString(row.note_part) === 'endnote' ? 'endnote' : 'footnote',
      ordinal: asNumber(row.note_ordinal),
      referenceBlockId: row.reference_block_id === null ? null : asString(row.reference_block_id),
      referencePosition: row.reference_position === null ? null : asNumber(row.reference_position),
    } };
  });
}

/** One committed note block's source, as export restores it. */
export interface NoteSourceRow {
  blockId: string;
  part: 'footnote' | 'endnote';
  noteId: string;
  sourceNoteDigest: string;
}

/** The note sources of exactly the Revision that recorded the export's body mapping. */
export function revisionNoteSources(db: DatabaseSync, revisionId: string, sourceVersionId: string): NoteSourceRow[] {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_note_sources'").get() === undefined) return [];
  return (db.prepare(`SELECT block_id, note_part, note_id, source_note_digest FROM manuscript_note_sources
    WHERE revision_id = ? AND source_version_id = ? ORDER BY rowid`).all(revisionId, sourceVersionId) as SqlRow[]).map((row) => ({
    blockId: asString(row.block_id),
    part: asString(row.note_part) === 'endnote' ? 'endnote' : 'footnote',
    noteId: asString(row.note_id),
    sourceNoteDigest: asString(row.source_note_digest),
  }));
}

/** The first position of the working manuscript's notes, which follow every body block; null when it has none. */
export function firstNotePosition(db: DatabaseSync, branchId: string): number | null {
  const row = db.prepare("SELECT min(position) position FROM working_blocks WHERE branch_id = ? AND kind = 'note'").get(branchId) as SqlRow | undefined;
  return row === undefined || row.position === null ? null : asNumber(row.position);
}

/** The staged sources a legacy parse's blocks carry: a body block's paragraph, or a note block's note. */
export interface LegacyBlockSources {
  blockSourceIndexes: number[];
  notes: StagedNoteSource[];
}

export function routeBlockSource(block: { position: number; sourceParagraphIndex: number; note?: ParsedNoteSource }, sources: LegacyBlockSources): void {
  if (block.note === undefined) sources.blockSourceIndexes.push(block.sourceParagraphIndex);
  else sources.notes.push({ position: block.position, ...block.note });
}

export function legacyBlockSources(blocks: ReadonlyArray<{ position: number; sourceParagraphIndex: number; note?: ParsedNoteSource }>): LegacyBlockSources {
  const sources: LegacyBlockSources = { blockSourceIndexes: [], notes: [] };
  for (const block of blocks) routeBlockSource(block, sources);
  return sources;
}
