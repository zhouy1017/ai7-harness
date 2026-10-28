import type { DatabaseSync } from 'node:sqlite';
import type { ImportSplitParagraphProjection, ImportStructureChoice, ImportStructureProjection } from '../../shared/protocol.js';
import { asNumber, asString, requireBounded, type SqlRow } from './bounded-kernel.js';
import { recutRun, type PieceJoint } from './paragraph-pieces.js';
import { MAX_HEADING_CANDIDATES, headingCandidates, type CandidateSourceBlock } from './structure-candidates.js';
import { hasImportStructureSchema } from './structure-schema.js';

/**
 * The import side of candidate structure (Issue #1205; ADR 0096 §2): the pieces a staged draft's over-bound paragraphs were split
 * into, what the fidelity review lists from the staged blocks, and the structure choice a review is formed with. The commit
 * writes the choice in `merged-import-blocks.ts`.
 */
export interface StagedParagraphPiece {
  position: number;
  sourceParagraphIndex: number;
  pieceOrdinal: number;
  joint: PieceJoint | null;
  /** The whole paragraph's block digest, on the first piece only. */
  sourceParagraphDigest: string | null;
}

export function stageParagraphPieces(db: DatabaseSync, draftId: string, pieces: ReadonlyArray<StagedParagraphPiece>): void {
  const insert = db.prepare(`INSERT INTO staged_import_paragraph_pieces(draft_id, position, source_paragraph_index, piece_ordinal, joint,
    source_paragraph_digest) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const piece of pieces) insert.run(draftId, piece.position, piece.sourceParagraphIndex, piece.pieceOrdinal, piece.joint, piece.sourceParagraphDigest);
}

export function stagedParagraphPieces(db: DatabaseSync, draftId: string): StagedParagraphPiece[] {
  if (!hasImportStructureSchema(db)) return [];
  return (db.prepare(`SELECT position, source_paragraph_index, piece_ordinal, joint, source_paragraph_digest
    FROM staged_import_paragraph_pieces WHERE draft_id = ? ORDER BY position`).all(draftId) as SqlRow[]).map((row) => ({
    position: asNumber(row.position),
    sourceParagraphIndex: asNumber(row.source_paragraph_index),
    pieceOrdinal: asNumber(row.piece_ordinal),
    joint: row.joint === null ? null : asString(row.joint) as PieceJoint,
    sourceParagraphDigest: row.source_paragraph_digest === null ? null : asString(row.source_paragraph_digest),
  }));
}

export function stagedParagraphPiecesMatch(db: DatabaseSync, draftId: string, pieces: ReadonlyArray<StagedParagraphPiece>): boolean {
  const staged = stagedParagraphPieces(db, draftId);
  return staged.length === pieces.length && staged.every((piece, index) => {
    const other = pieces[index]!;
    return piece.position === other.position && piece.sourceParagraphIndex === other.sourceParagraphIndex &&
      piece.pieceOrdinal === other.pieceOrdinal && piece.joint === other.joint && piece.sourceParagraphDigest === other.sourceParagraphDigest;
  });
}

type StagedPiece = StagedParagraphPiece & { text: string; stagedBlockId: string };

/** One over-bound paragraph's staged pieces, with each piece's text and staged identity. */
export interface SplitGroup {
  sourceOrdinal: number;
  pieces: StagedPiece[];
}

/** The runs of bound-cut pieces in a group: each run is one line the parser cut at the bound. */
export function boundRuns(group: SplitGroup): StagedPiece[][] {
  const runs: StagedPiece[][] = [];
  for (const piece of group.pieces) {
    if (piece.joint === 'bound') runs.at(-1)!.push(piece);
    else runs.push([piece]);
  }
  return runs.filter((run) => run.length > 1);
}

/** The blocks a group becomes under a method: every piece, with each bound run recut. */
export function groupTexts(group: SplitGroup, method: ImportStructureChoice['longParagraphs']): string[] {
  const texts: string[] = [];
  let run: string[] = [];
  const flush = (): void => { texts.push(...(run.length > 1 && method !== null ? recutRun(run, method) : run)); run = []; };
  for (const piece of group.pieces) {
    if (piece.joint !== 'bound') flush();
    run.push(piece.text);
  }
  flush();
  return texts;
}

export function splitGroups(db: DatabaseSync, draftId: string): SplitGroup[] {
  const pieces = stagedParagraphPieces(db, draftId);
  if (pieces.length === 0) return [];
  const staged = db.prepare('SELECT staged_block_id, text FROM staged_import_blocks WHERE draft_id = ? AND position = ?');
  const groups: SplitGroup[] = [];
  let continuations = 0;
  for (const piece of pieces) {
    const row = staged.get(draftId, piece.position) as SqlRow;
    const withText = { ...piece, text: asString(row.text), stagedBlockId: asString(row.staged_block_id) };
    if (piece.pieceOrdinal === 1) groups.push({ sourceOrdinal: piece.position - continuations, pieces: [withText] });
    else {
      groups.at(-1)!.pieces.push(withText);
      continuations += 1;
    }
  }
  return groups;
}

function splitProjection(group: SplitGroup, firstPosition: number, pieceCount: number): ImportSplitParagraphProjection {
  const first = group.pieces[0]!.text.split('\n')[0]!;
  return { sourceOrdinal: group.sourceOrdinal, firstPosition, pieceCount, excerpt: Array.from(first).slice(0, 40).join('') + '…' };
}

/**
 * What the fidelity review lists for a staged draft, or null when it lists nothing. `offerHeadings` is false for a reading that
 * cannot take a confirmed heading (the Word reading). With a choice, each split paragraph states its resulting positions.
 */
export function stagedStructure(db: DatabaseSync, draftId: string, offerHeadings: boolean,
  choice?: ImportStructureChoice): ImportStructureProjection | null {
  const groups = splitGroups(db, draftId);
  let headings: ImportStructureProjection['headings'] = [];
  if (offerHeadings) {
    const blocks = (db.prepare(`SELECT position, kind, grapheme_length, CASE WHEN grapheme_length <= 60 THEN text ELSE '' END text
      FROM staged_import_blocks WHERE draft_id = ? ORDER BY position`).all(draftId) as SqlRow[]).map((row): CandidateSourceBlock => ({
      position: asNumber(row.position), kind: asString(row.kind) as CandidateSourceBlock['kind'], text: asString(row.text),
      graphemeLength: asNumber(row.grapheme_length),
    }));
    // A piece of a split paragraph is never a candidate: its paragraph's lineage, not a heading, explains it.
    const pieces = new Set(groups.flatMap((group) => group.pieces.map((piece) => piece.position)));
    headings = headingCandidates(blocks.filter((block) => !pieces.has(block.position)));
  }
  if (headings.length === 0 && groups.length === 0) return null;
  const softBreakSplits: ImportSplitParagraphProjection[] = [];
  const longParagraphs: ImportSplitParagraphProjection[] = [];
  let shift = 0;
  for (const group of groups) {
    const firstPosition = group.pieces[0]!.position + shift;
    if (boundRuns(group).length === 0) {
      softBreakSplits.push(splitProjection(group, firstPosition, group.pieces.length));
      continue;
    }
    const sentences = groupTexts(group, 'sentences').length;
    const pieceCount = choice?.longParagraphs === 'sentences' ? sentences : group.pieces.length;
    shift += pieceCount - group.pieces.length;
    longParagraphs.push({ ...splitProjection(group, firstPosition, pieceCount), choice: { sentences, blocks: group.pieces.length } });
  }
  return {
    headings: headings.slice(0, MAX_HEADING_CANDIDATES),
    headingsTruncated: headings.length > MAX_HEADING_CANDIDATES,
    softBreakSplits,
    longParagraphs,
  };
}

/** The staged projection's `structure` field: present only when the draft lists something. */
export function stagedStructureField(db: DatabaseSync, draftId: string, offerHeadings: boolean): { structure?: ImportStructureProjection } {
  const structure = stagedStructure(db, draftId, offerHeadings);
  return structure === null ? {} : { structure };
}

/** The review projection's `structure` field: the staged list stated with the choice the review was formed with. */
export function reviewStructureField(db: DatabaseSync, draftId: string, offerHeadings: boolean,
  choice: ImportStructureChoice | null | undefined): { structure?: { projection: ImportStructureProjection; choice: ImportStructureChoice } } {
  const projection = stagedStructure(db, draftId, offerHeadings, choice ?? undefined);
  return projection === null ? {} : { structure: { projection, choice: choice ?? { headings: [], longParagraphs: null } } };
}

/** The choice a review of the draft is formed with, from the editor's input (Issue #1205). */
export function reviewStructureChoice(db: DatabaseSync, draftId: string, offerHeadings: boolean,
  input: ImportStructureChoice | undefined): ImportStructureChoice | null {
  return resolveStructureChoice(stagedStructure(db, draftId, offerHeadings), input);
}

export function stagedHasPieces(db: DatabaseSync, draftId: string): boolean {
  return hasImportStructureSchema(db) &&
    db.prepare('SELECT 1 FROM staged_import_paragraph_pieces WHERE draft_id = ? LIMIT 1').get(draftId) !== undefined;
}

/**
 * The structure choice a review may be formed with: only listed candidates, each once, at a level from 1 to 6, and the one
 * long-paragraph choice exactly when the draft lists long paragraphs. Returns null when the draft lists nothing or the editor
 * confirmed nothing: such a review is the one the draft would have had without candidates.
 */
export function resolveStructureChoice(projection: ImportStructureProjection | null,
  input: ImportStructureChoice | undefined): ImportStructureChoice | null {
  if (projection === null) {
    requireBounded(input === undefined || (input.headings.length === 0 && input.longParagraphs === null),
      'STRUCTURE_CHOICE_INVALID', '本次导入没有可确认的结构候选或长段落。');
    return null;
  }
  const choice = input ?? { headings: [], longParagraphs: null };
  const listed = new Set(projection.headings.map((candidate) => candidate.position));
  let previous = 0;
  for (const heading of choice.headings) {
    requireBounded(listed.has(heading.position) && heading.position > previous && Number.isSafeInteger(heading.level) &&
      heading.level >= 1 && heading.level <= 6, 'STRUCTURE_CHOICE_INVALID', '所确认的标题不在候选结构中。');
    previous = heading.position;
  }
  requireBounded((projection.longParagraphs.length > 0) === (choice.longParagraphs !== null),
    'STRUCTURE_CHOICE_REQUIRED', '请为超出段落上限的段落选择「按句子分段」或「按长度分为多段」。');
  if (choice.headings.length === 0 && choice.longParagraphs === null) return null;
  return { headings: choice.headings.map(({ position, level }) => ({ position, level })), longParagraphs: choice.longParagraphs };
}

/** Replace the draft's recorded choice with the one its review is formed with, in the review's transaction. */
export function recordStructureChoice(db: DatabaseSync, draftId: string, choice: ImportStructureChoice | null): void {
  if (!hasImportStructureSchema(db)) return;
  db.prepare('DELETE FROM staged_import_structure_choices WHERE draft_id = ?').run(draftId);
  if (choice === null) return;
  const insert = db.prepare('INSERT INTO staged_import_structure_choices(draft_id, choice_key, position, level, method) VALUES (?, ?, ?, ?, ?)');
  for (const heading of choice.headings) insert.run(draftId, 'heading', heading.position, heading.level, null);
  if (choice.longParagraphs !== null) insert.run(draftId, 'long-paragraphs', 0, null, choice.longParagraphs);
}

/** The choice a reviewed draft recorded, or null when its review recorded none. */
export function recordedStructureChoice(db: DatabaseSync, draftId: string): ImportStructureChoice | null {
  if (!hasImportStructureSchema(db)) return null;
  const rows = db.prepare(`SELECT choice_key, position, level, method FROM staged_import_structure_choices
    WHERE draft_id = ? ORDER BY choice_key, position`).all(draftId) as SqlRow[];
  if (rows.length === 0) return null;
  const method = rows.find((row) => row.choice_key === 'long-paragraphs')?.method;
  return {
    headings: rows.filter((row) => row.choice_key === 'heading').map((row) => ({ position: asNumber(row.position), level: asNumber(row.level) })),
    longParagraphs: method === undefined ? null : asString(method) as 'sentences' | 'blocks',
  };
}
