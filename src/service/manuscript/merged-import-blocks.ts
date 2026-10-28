import type { DatabaseSync } from 'node:sqlite';
import type { ImportStructureChoice, ManuscriptBlockProjection } from '../../shared/protocol.js';
import type { StagedTextBoxParagraph } from '../import-retention.js';
import { asNumber, asString, sha256, type SqlRow } from './bounded-kernel.js';
import { blockDigest } from './command-history.js';
import { boundRuns, groupTexts, splitGroups, type SplitGroup } from './import-structure.js';
import { commitNoteSources } from './note-blocks.js';
import { graphemeLength } from './paragraph-pieces.js';

const MERGE_BATCH_SIZE = 256;

/**
 * Revision r1's blocks when the review merged its text boxes (ADR 0086 §2): the staged body blocks and every staged text-box
 * paragraph in document order — which puts each box's paragraphs right after the paragraph that anchors it — with positions and
 * offsets counted afresh, and the source of every block recorded beside it. A body block keeps its staged identity; a merged
 * paragraph takes one derived from its draft, its box and its place in the box. The note blocks (Issue #1204) follow every body
 * block and every box, keep their staged identities, and record their notes. Runs in the commit's transaction.
 *
 * The review's structure choice (Issue #1205) shapes the same pass. A confirmed candidate becomes a heading at its level, and its
 * source carries the heading's digest, so export restores that paragraph from the file unchanged. A split paragraph's pieces are
 * written as the choice makes them — a run cut at the bound recut at sentence ends when the editor chose so — each with its
 * lineage; only the first maps the paragraph, under the whole paragraph's digest, so export regenerates it rather than restoring
 * it whole. Returns how many blocks r1 holds and how many no source paragraph maps.
 */
export function insertMergedImportBlocks(
  db: DatabaseSync,
  input: { draftId: string; manuscriptId: string; revisionId: string; branchId: string; sourceVersionId: string; now: string },
  merged: ReadonlyArray<StagedTextBoxParagraph>,
  structure: ImportStructureChoice | null = null,
): { blockCount: number; unmapped: number } {
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
  const insertLineage = db.prepare(`INSERT INTO manuscript_import_lineage(
    revision_id, block_id, first_block_id, source_paragraph_index, piece_ordinal, piece_count, method) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const headings = new Map(structure?.headings.map((heading) => [heading.position, heading.level]) ?? []);
  const groups = new Map(splitGroups(db, draftId).map((group) => [group.pieces[0]!.position, group]));
  const continuations = new Set([...groups.values()].flatMap((group) => group.pieces.slice(1).map((piece) => piece.position)));
  let position = 0;
  let offset = 0;
  let unmapped = 0;
  const write = (block: {
    blockId: string; kind: ManuscriptBlockProjection['kind']; level: number | null; text: string; digest: string;
    graphemeLength: number; sourceParagraphIndex: number | null; box: { ordinal: number; paragraph: number } | null;
    sourceDigest?: string;
  }): void => {
    position += 1;
    insertBlock.run(block.blockId, manuscriptId, revisionId);
    insertVersion.run(revisionId, block.blockId, position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
    insertWorking.run(branchId, block.blockId, position, block.kind, block.level, block.text, block.digest, block.graphemeLength);
    if (block.sourceParagraphIndex !== null) {
      insertSource.run(
        revisionId, block.blockId, sourceVersionId, block.box === null ? 'body' : 'text-box', block.sourceParagraphIndex,
        block.box?.ordinal ?? null, block.box?.paragraph ?? null, block.sourceDigest ?? block.digest, now,
      );
    } else if (block.kind !== 'note') unmapped += 1;
    offset += block.graphemeLength;
  };
  /** A split paragraph's blocks: a staged piece keeps its identity; a piece recut at sentence ends takes one from its place. */
  const writeGroup = (group: SplitGroup, sourceParagraphIndex: number): void => {
    const method = boundRuns(group).length === 0 ? 'soft-break' : structure!.longParagraphs!;
    const texts = groupTexts(group, method === 'soft-break' ? null : method);
    const firstBlockId = group.pieces[0]!.stagedBlockId;
    texts.forEach((text, index) => {
      const digest = blockDigest('paragraph', null, text);
      const blockId = index === 0 ? firstBlockId : method !== 'sentences' ? group.pieces[index]!.stagedBlockId
        : `blk_${sha256(`${draftId}\u0000piece\u0000${sourceParagraphIndex}\u0000${index + 1}\u0000${digest}`).slice(0, 24)}`;
      write({ blockId, kind: 'paragraph', level: null, text, digest, graphemeLength: graphemeLength(text),
        sourceParagraphIndex: index === 0 ? sourceParagraphIndex : null, box: null, sourceDigest: group.pieces[0]!.sourceParagraphDigest! });
      insertLineage.run(revisionId, blockId, firstBlockId, sourceParagraphIndex, index + 1, texts.length, method);
    });
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
      if (continuations.has(cursor)) continue;
      const note = asString(row.kind) === 'note';
      const sourceParagraphIndex = note ? null : asNumber(row.source_paragraph_index);
      writeBoxParagraphsBefore(sourceParagraphIndex ?? Number.POSITIVE_INFINITY);
      const group = groups.get(cursor);
      if (group !== undefined) {
        writeGroup(group, sourceParagraphIndex!);
        continue;
      }
      const level = headings.get(cursor);
      const text = asString(row.text);
      write({
        blockId: asString(row.staged_block_id),
        kind: level === undefined ? asString(row.kind) as ManuscriptBlockProjection['kind'] : 'heading',
        level: level ?? (row.level === null ? null : asNumber(row.level)),
        text,
        digest: level === undefined ? asString(row.digest) : blockDigest('heading', level, text),
        graphemeLength: asNumber(row.grapheme_length),
        sourceParagraphIndex,
        box: null,
      });
    }
  }
  writeBoxParagraphsBefore(Number.POSITIVE_INFINITY);
  commitNoteSources(db, { revisionId, sourceVersionId, draftId, createdAt: now });
  return { blockCount: position, unmapped };
}
