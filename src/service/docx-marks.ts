import { SaxesParser, type SaxesTagNS } from 'saxes';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES, MAX_MARK_BODY_CODE_UNITS } from '../shared/protocol.js';
import { canonicalJson, sha256Hex } from './analysis/canonical.js';
import { wordTemplateKey, type WordCompiledReading, type WordNormalizationGroup, type WordReadingBlock,
  type WordReadingKind, type WordRevisionGraph, type WordSampleTemplate, type WordSourceAtom,
  type WordSourceFragment, type WordSourceLocation, type WordSourceSegment, type WordSourceComment,
  type WordSourceMark, type WordIncompatibility } from './import-retention.js';

/**
 * The comments and tracked changes a DOCX carries, read into marks for the imported manuscript (Issue #411,
 * plan slice S62; V2-UX-MARK-009, editor-surfaces §7 批注与修订). Parser identity `ai7-docx-fflate-saxes/3`
 * reads `word/document.xml` as the file would read with every revision rejected — deleted and moved-away
 * text present, inserted and moved-in text absent — so no author revision is ever applied by importing;
 * this module turns what the parser saw into marks on that text:
 *
 * - a comment becomes a 批注 whose source is its author, anchored on the commented text clipped to its first
 *   paragraph; its replies fold into its body, and a comment marked done arrives 已处理;
 * - a deletion, an insertion, or a deletion and an insertion by the same author at the same time with no
 *   text between them become one 修改建议 each: a deletion, an insertion at a point, or a replacement
 *   (V2-UX-PROP-018; grouped by the revision's identity, never by proximity alone, PROP-020);
 * - text that was inserted and then deleted appears in neither reading and becomes nothing;
 * - a whole paragraph inserted or deleted, a paragraph split or joined, and a move become a 批注 that
 *   describes the revision, because a text change inside one block cannot express them.
 *
 * Formatting revisions, and comments and revisions inside text boxes and notes, stay with the original file
 * and become no mark. Every word of a mark is the file's own or one of the fixed sentences below.
 */

export type ImportedMarkOrigin =
  | 'comment'
  | 'deletion'
  | 'insertion'
  | 'replacement'
  | 'paragraph-insertion'
  | 'paragraph-deletion'
  | 'paragraph-split'
  | 'paragraph-merge'
  | 'move';

export const IMPORTED_MARK_ORIGINS: ReadonlyArray<ImportedMarkOrigin> = [
  'comment', 'deletion', 'insertion', 'replacement', 'paragraph-insertion', 'paragraph-deletion',
  'paragraph-split', 'paragraph-merge', 'move',
];

/** One mark the import will create, pinned exactly in the block the parse produced. */
export interface ParsedImportedMark {
  /** 1-based, in reading order: block position, then range, then the order the parser met them. */
  ordinal: number;
  /** The 1-based position of the block it is pinned in, as the parse numbered it. */
  blockPosition: number;
  fromGrapheme: number;
  toGrapheme: number;
  /** The block's exact text over the range: empty only for an insertion, which stands at a point. */
  pinnedText: string;
  kind: 'annotation' | 'change-suggestion';
  origin: ImportedMarkOrigin;
  /** The file's author, as the mark's source shows it (`作者` when the file names none). */
  authorLabel: string;
  /** A 批注's words; empty for a 修改建议. */
  body: string;
  /** A 修改建议's proposed text — empty for a deletion — and null for a 批注. */
  proposedText: string | null;
  /** A comment the file marks done arrives 已处理 (`resolved`); every other mark is open. */
  status: 'open' | 'resolved';
}

/** At most this many marks one import creates; a file carrying more is refused rather than cut short. */
export const MAX_IMPORTED_MARKS = 20_000;
/** A comments part may be larger than the metadata parts, but it is still read whole, so it is bounded. */
export const MAX_COMMENT_PART_BYTES = 16 * 1024 * 1024;
const MAX_XML_NESTING_DEPTH = 128;
const MAX_AUTHOR_LABEL_CODE_UNITS = 200;

/** The author a mark names when the file names none (V2-UX-MARK-002: every mark carries a source). */
export const UNNAMED_AUTHOR_LABEL = '作者';
export const EMPTY_COMMENT_BODY = '（空批注）';
export const CROSS_PARAGRAPH_COMMENT_LINE = '（原批注跨越多段）';
export const TRUNCATED_BODY_SUFFIX = '……（全文随原文件保留）';
export const PARAGRAPH_DELETION_BODY = '作者建议删除此段';
export const PARAGRAPH_MERGE_BODY = '作者建议将此段与下一段合并';
export const PARAGRAPH_SPLIT_BODY = '作者在此处分段（原文与下一段相连）';

export function commentReplyLine(author: string, text: string): string {
  return `回复（${author}）：${text}`;
}

export function paragraphInsertionBody(text: string, before: boolean): string {
  return `作者在此${before ? '前' : '后'}插入了一段：「${text}」`;
}

export function moveBody(text: string): string {
  return `作者将「${text}」移到此处`;
}

/** An insertion or replacement too long to be a 修改建议's proposed text is described instead. */
export function oversizedRevisionBody(text: string): string {
  return `作者在此修改的文字过长，未转为修改建议：「${text}」`;
}

function requireMarks(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`DOCX_REJECTED:${message}`);
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

function graphemesOf(value: string): string[] {
  return Array.from(segmenter.segment(value), ({ segment }) => segment);
}

/** Text as a block carries it: NFC, runs of spaces and tabs as one space, no space around a line break. */
function normalizeInline(raw: string): string {
  return raw.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
}

function normalizeParagraph(raw: string): string {
  return normalizeInline(raw).trim();
}

/** `value` cut at a code point so that it and the suffix fit `limit`, or `value` itself when it fits. */
export function truncateToFit(value: string, limit: number, suffix = TRUNCATED_BODY_SUFFIX): string {
  if (value.length <= limit) return value;
  let kept = '';
  for (const character of value) {
    if (kept.length + character.length > limit - suffix.length) break;
    kept += character;
  }
  return `${kept}${suffix}`;
}

/** A quote inside a fixed sentence, cut so that the whole sentence stays within a mark's body bound. */
function quoteWithin(sentence: (quote: string) => string, text: string): string {
  const full = sentence(text);
  if (full.length <= MAX_MARK_BODY_CODE_UNITS) return full;
  const room = MAX_MARK_BODY_CODE_UNITS - sentence('').length;
  return sentence(truncateToFit(text, room));
}

export function authorLabel(raw: string | undefined): string {
  const normalized = (raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (normalized.length === 0 || !normalized.isWellFormed()) return UNNAMED_AUTHOR_LABEL;
  return truncateToFit(normalized, MAX_AUTHOR_LABEL_CODE_UNITS, '');
}

function attributeValue(tag: SaxesTagNS, localName: string): string | undefined {
  return Object.values(tag.attributes).find((attribute) => attribute.local === localName)?.value;
}

export type RevisionKind = 'ins' | 'del' | 'moveFrom' | 'moveTo';

export interface RevisionIdentity {
  author: string;
  date: string;
}

/** Where a piece of paragraph text falls between the two readings of a revised file. */
export type TextPlace =
  | { kind: 'plain' }
  | { kind: 'del' | 'moveFrom' | 'ins' | 'moveTo'; identity: RevisionIdentity }
  | { kind: 'hidden' };

interface Segment {
  kind: 'plain' | 'del' | 'ins' | 'moveFrom' | 'moveTo';
  identity: RevisionIdentity | null;
  /** Raw code-unit offsets into the paragraph's rejected-reading text; equal for text only the accepted reading has. */
  baseStart: number;
  baseEnd: number;
  /** Raw text only the accepted reading has. */
  inserted: string;
}

/** What one body paragraph carries beyond its rejected-reading text. */
export interface ParagraphRevisions {
  segments: Segment[];
  /** The paragraph's raw text as it reads with every revision accepted. */
  accept: string;
  /** A revision on the paragraph mark itself (`w:pPr/w:rPr/w:ins` and its kin), or null. */
  markRevision: { kind: RevisionKind; identity: RevisionIdentity } | null;
  /** Comment anchors met inside the paragraph, at raw offsets into its rejected-reading text. */
  commentMarkers: Array<{ id: string; role: CommentMarkerRole; raw: number }>;
}

export type CommentMarkerRole = 'start' | 'end' | 'reference';

export function emptyParagraphRevisions(): ParagraphRevisions {
  return { segments: [], accept: '', markRevision: null, commentMarkers: [] };
}

function sameIdentity(left: RevisionIdentity | null, right: RevisionIdentity | null): boolean {
  return left !== null && right !== null && left.author === right.author && left.date === right.date;
}

/**
 * Record text the parser placed in a body paragraph. `baseBefore`/`baseAfter` bound what the text added to
 * the rejected reading (equal when it added nothing there); text only the accepted reading has is `text`.
 */
export function recordParagraphText(
  revisions: ParagraphRevisions,
  place: Exclude<TextPlace, { kind: 'hidden' }>,
  text: string,
  baseBefore: number,
  baseAfter: number,
): void {
  const identity = place.kind === 'plain' ? null : place.identity;
  if (place.kind === 'plain' || place.kind === 'ins' || place.kind === 'moveTo') revisions.accept += text;
  const last = revisions.segments.at(-1);
  if (last !== undefined && last.kind === place.kind && (place.kind === 'plain' || sameIdentity(last.identity, identity)) &&
      last.baseEnd === baseBefore) {
    last.baseEnd = baseAfter;
    if (place.kind === 'ins' || place.kind === 'moveTo') last.inserted += text;
    return;
  }
  revisions.segments.push({
    kind: place.kind,
    identity,
    baseStart: baseBefore,
    baseEnd: baseAfter,
    inserted: place.kind === 'ins' || place.kind === 'moveTo' ? text : '',
  });
}

/**
 * One block as the collector needs it: its position and text, split into graphemes only once a mark needs
 * them, so a file without comments or revisions segments nothing it did not already segment.
 */
class CollectedBlock {
  #graphemes: string[] | undefined;

  constructor(readonly position: number, readonly text: string) {}

  get graphemes(): string[] {
    this.#graphemes ??= graphemesOf(this.text);
    return this.#graphemes;
  }
}

/** The grapheme index of a raw offset into a paragraph whose block text is `text`. */
function graphemeAt(raw: string, rawOffset: number, text: string, graphemes: ReadonlyArray<string>): number {
  const prefix = normalizeInline(raw.slice(0, rawOffset)).trimStart();
  const codeUnits = Math.min(prefix.length, text.length);
  let index = 0;
  let consumed = 0;
  while (index < graphemes.length && consumed < codeUnits) {
    consumed += graphemes[index]!.length;
    index += 1;
  }
  return index;
}

/**
 * Where one comment stands while the document streams: `pending` started where no block had text yet and
 * opens on the next block; `point` holds no text at all and takes the next block's first grapheme; `open`
 * started in a block and waits for its end.
 */
type CommentAnchor =
  | { state: 'pending' }
  | { state: 'point' }
  | { state: 'open'; block: CollectedBlock; from: number }
  | { state: 'anchored'; position: number; from: number; to: number; pinned: string; crossParagraph: boolean };

interface PendingMark extends Omit<ParsedImportedMark, 'ordinal'> {
  sequence: number;
}

interface CommentDefinition {
  id: string;
  author: string;
  text: string;
  lastParagraphId: string | null;
  order: number;
}

/**
 * Collects the marks of one document as its paragraphs close, so that nothing but the last block and the
 * comments still open is ever held; `finish` joins the comment anchors to the comments part.
 */
export class ImportedMarkCollector {
  readonly #marks: PendingMark[] = [];
  #sequence = 0;
  #present = false;
  #lastBlock: CollectedBlock | undefined;
  /** Marks waiting for the next block to stand on its first grapheme: an insertion before any block. */
  readonly #beforeNextBlock: Array<(block: CollectedBlock) => void> = [];
  /** A split or join on the previous kept paragraph's mark, decided by what the next paragraph is. */
  #pendingParagraphMark: { kind: 'ins' | 'del'; identity: RevisionIdentity; block: CollectedBlock } | undefined;
  readonly #comments = new Map<string, CommentAnchor>();
  /** The comments waiting for the next block: those `pending` or `point` in `#comments`. */
  readonly #waiting: string[] = [];

  /** Whether the file carries any comment or revision at all, converted or kept with the file. */
  get present(): boolean {
    return this.#present;
  }

  markPresent(): void {
    this.#present = true;
  }

  #push(mark: Omit<PendingMark, 'sequence'>): void {
    requireMarks(this.#marks.length < MAX_IMPORTED_MARKS, 'too many comments or revisions');
    this.#marks.push({ ...mark, sequence: this.#sequence++ });
  }

  /** A 批注 describing a revision, on one grapheme of a block: its first, its last, or where a point stands. */
  #note(block: CollectedBlock, at: 'first' | 'last' | number, body: string, identity: RevisionIdentity | null, origin: ImportedMarkOrigin): void {
    const length = block.graphemes.length;
    const from = at === 'first' ? 0 : at === 'last' ? length - 1 : Math.min(at, length - 1);
    this.#push({
      blockPosition: block.position,
      fromGrapheme: from,
      toGrapheme: from + 1,
      pinnedText: block.graphemes[from]!,
      kind: 'annotation',
      origin,
      authorLabel: authorLabel(identity?.author),
      body,
      proposedText: null,
      status: 'open',
    });
  }

  /** A description anchored after the last block, or before the next one when none came yet. */
  #noteBetweenBlocks(bodyAfter: string, bodyBefore: string, identity: RevisionIdentity | null, origin: ImportedMarkOrigin): void {
    if (this.#lastBlock !== undefined) {
      this.#note(this.#lastBlock, 'last', bodyAfter, identity, origin);
      return;
    }
    this.#beforeNextBlock.push((block) => this.#note(block, 'first', bodyBefore, identity, origin));
  }

  /** A comment marker between paragraphs: a start opens on the next block, an end or reference closes here. */
  markerBetweenParagraphs(id: string, role: CommentMarkerRole): void {
    this.#commentMarker(id, role, null, 0);
  }

  #commentMarker(id: string, role: CommentMarkerRole, block: CollectedBlock | null, at: number): void {
    const current = this.#comments.get(id);
    if (role === 'start') {
      if (current !== undefined) return;
      if (block !== null) {
        this.#comments.set(id, { state: 'open', block, from: at });
      } else {
        this.#comments.set(id, { state: 'pending' });
        this.#waiting.push(id);
      }
      return;
    }
    if (current?.state === 'anchored' || current?.state === 'point') return;
    if (current?.state === 'open') {
      const same = block !== null && block.position === current.block.position;
      const to = same ? Math.max(at, current.from) : current.block.graphemes.length;
      this.#comments.set(id, this.#anchored(current.block, current.from, to, !same));
      return;
    }
    if (role === 'end' && current === undefined) return;
    // A comment with no text inside its range, or one known only by its reference, stands at a point.
    if (block !== null) {
      this.#comments.set(id, this.#anchored(block, at, at, false));
    } else if (this.#lastBlock !== undefined) {
      const last = this.#lastBlock.graphemes.length;
      this.#comments.set(id, this.#anchored(this.#lastBlock, last, last, false));
    } else {
      if (current === undefined) this.#waiting.push(id);
      this.#comments.set(id, { state: 'point' });
    }
  }

  /** A range made exact: a point takes its adjacent grapheme, the following one where there is one. */
  #anchored(block: CollectedBlock, from: number, to: number, crossParagraph: boolean): CommentAnchor {
    let start = from;
    let end = to;
    if (end <= start) {
      if (start < block.graphemes.length) end = start + 1;
      else {
        start = Math.max(0, start - 1);
        end = start + 1;
      }
    }
    return {
      state: 'anchored',
      position: block.position,
      from: start,
      to: end,
      pinned: block.graphemes.slice(start, end).join(''),
      crossParagraph,
    };
  }

  /**
   * Close one body paragraph: `block` is the block it became, or null when its rejected reading holds no
   * text. `raw` is its rejected-reading text before normalization and `text` the block text.
   */
  closeParagraph(revisions: ParagraphRevisions, raw: string, block: { position: number; text: string } | null): void {
    const collected = block === null ? null : new CollectedBlock(block.position, block.text);
    if (collected !== null) {
      for (const id of this.#waiting.splice(0)) {
        const anchor = this.#comments.get(id);
        if (anchor?.state === 'pending') this.#comments.set(id, { state: 'open', block: collected, from: 0 });
        else if (anchor?.state === 'point') this.#comments.set(id, this.#anchored(collected, 0, 0, false));
      }
      for (const place of this.#beforeNextBlock.splice(0)) place(collected);
    }
    const at = (offset: number): number => block === null ? 0 : graphemeAt(raw, offset, block.text, collected!.graphemes);
    for (const marker of revisions.commentMarkers) this.#commentMarker(marker.id, marker.role, collected, at(marker.raw));

    // A paragraph no revision touches reads the same both ways: its accepted reading is its block text.
    const revised = revisions.markRevision !== null || revisions.segments.some((segment) => segment.kind !== 'plain');
    const accept = revised ? normalizeParagraph(revisions.accept) : block?.text ?? '';
    const kept = collected !== null && accept.length > 0;
    const pending = this.#pendingParagraphMark;
    this.#pendingParagraphMark = undefined;
    if (pending !== undefined && kept) {
      this.#note(pending.block, 'last', pending.kind === 'del' ? PARAGRAPH_MERGE_BODY : PARAGRAPH_SPLIT_BODY, pending.identity,
        pending.kind === 'del' ? 'paragraph-merge' : 'paragraph-split');
    }
    if (!revised) {
      if (collected !== null) this.#lastBlock = collected;
      return;
    }

    const first = (kind: Segment['kind']): Segment | undefined => revisions.segments.find((segment) => segment.kind === kind);
    if (collected === null) {
      // Nothing of the paragraph stands in the rejected reading: an inserted paragraph, or a moved one.
      if (accept.length > 0) {
        const inserted = first('ins');
        const moved = first('moveTo');
        if (inserted !== undefined || moved === undefined) {
          this.#noteBetweenBlocks(
            quoteWithin((quote) => paragraphInsertionBody(quote, false), accept),
            quoteWithin((quote) => paragraphInsertionBody(quote, true), accept),
            inserted?.identity ?? null,
            'paragraph-insertion',
          );
        } else {
          const body = quoteWithin(moveBody, accept);
          this.#noteBetweenBlocks(body, body, moved.identity, 'move');
        }
      }
      return;
    }
    this.#lastBlock = collected;
    if (accept.length === 0) {
      // Every word of the paragraph is deleted: one intent, described on the paragraph itself. Text only
      // moved away stays where it is and asks for nothing here.
      const deleted = first('del');
      if (deleted !== undefined) {
        this.#push({
          blockPosition: collected.position,
          fromGrapheme: 0,
          toGrapheme: collected.graphemes.length,
          pinnedText: block!.text,
          kind: 'annotation',
          origin: 'paragraph-deletion',
          authorLabel: authorLabel(deleted.identity?.author),
          body: PARAGRAPH_DELETION_BODY,
          proposedText: null,
          status: 'open',
        });
      }
      return;
    }
    this.#inlineRevisions(revisions, collected, at);
    const mark = revisions.markRevision;
    if (mark !== null && (mark.kind === 'ins' || mark.kind === 'del')) {
      this.#pendingParagraphMark = { kind: mark.kind, identity: mark.identity, block: collected };
    }
  }

  /**
   * The revisions inside a kept paragraph. Consecutive deletions and insertions of one identity — the same
   * author at the same time, with no text of either reading between them — are one intent: a deletion, an
   * insertion, or a replacement. Text moved away stays and asks for nothing; text moved in is described
   * where it would arrive.
   */
  #inlineRevisions(revisions: ParagraphRevisions, block: CollectedBlock, at: (raw: number) => number): void {
    let group: { kind: 'change' | 'moveTo'; identity: RevisionIdentity; baseStart: number; baseEnd: number; inserted: string } | undefined;
    const flush = (): void => {
      if (group === undefined) return;
      const current = group;
      group = undefined;
      const from = at(current.baseStart);
      const to = Math.max(from, at(current.baseEnd));
      const inserted = normalizeInline(current.inserted);
      if (current.kind === 'moveTo') {
        if (inserted.trim().length === 0) return;
        this.#note(block, from, quoteWithin(moveBody, inserted.trim()), current.identity, 'move');
        return;
      }
      const pinned = block.graphemes.slice(from, to).join('');
      if (pinned === inserted || (pinned.length === 0 && inserted.length === 0)) return;
      if (inserted.length > MAX_MARK_BODY_CODE_UNITS) {
        this.#note(block, from, quoteWithin(oversizedRevisionBody, inserted), current.identity, 'replacement');
        return;
      }
      this.#push({
        blockPosition: block.position,
        fromGrapheme: from,
        toGrapheme: to,
        pinnedText: pinned,
        kind: 'change-suggestion',
        origin: pinned.length === 0 ? 'insertion' : inserted.length === 0 ? 'deletion' : 'replacement',
        authorLabel: authorLabel(current.identity.author),
        body: '',
        proposedText: inserted,
        status: 'open',
      });
    };
    for (const segment of revisions.segments) {
      if (segment.kind === 'plain' || segment.kind === 'moveFrom') {
        flush();
        continue;
      }
      const kind = segment.kind === 'moveTo' ? 'moveTo' : 'change';
      if (group !== undefined && group.kind === kind && sameIdentity(group.identity, segment.identity)) {
        group.baseEnd = segment.baseEnd;
        group.inserted += segment.inserted;
        continue;
      }
      flush();
      group = { kind, identity: segment.identity!, baseStart: segment.baseStart, baseEnd: segment.baseEnd, inserted: segment.inserted };
    }
    flush();
  }

  /**
   * Join every comment anchored in the document to its comment, fold replies into the comment they answer,
   * and return the marks in reading order. A comment anchored nowhere in the body — in a text box or a
   * note — stays with the file.
   */
  finish(commentsXml: string | undefined, commentsExtendedXml: string | undefined): ParsedImportedMark[] {
    const definitions = parseCommentDefinitions(commentsXml);
    if (definitions.size > 0) this.#present = true;
    for (const [id, anchor] of this.#comments) {
      if (anchor.state === 'open') this.#comments.set(id, this.#anchored(anchor.block, anchor.from, anchor.block.graphemes.length, false));
      else if ((anchor.state === 'pending' || anchor.state === 'point') && this.#lastBlock !== undefined) {
        const last = this.#lastBlock.graphemes.length;
        this.#comments.set(id, this.#anchored(this.#lastBlock, last, last, false));
      }
    }
    const threads = parseCommentThreads(commentsExtendedXml);
    const byLastParagraph = new Map<string, CommentDefinition>();
    for (const definition of definitions.values()) {
      if (definition.lastParagraphId !== null) byLastParagraph.set(definition.lastParagraphId, definition);
    }
    const rootOf = (definition: CommentDefinition): CommentDefinition => {
      let current = definition;
      for (let step = 0; step < definitions.size; step += 1) {
        const parentId = current.lastParagraphId === null ? undefined : threads.get(current.lastParagraphId)?.parent;
        const parent = parentId === undefined || parentId === null ? undefined : byLastParagraph.get(parentId);
        if (parent === undefined || parent === current) return current;
        current = parent;
      }
      return current;
    };
    const replies = new Map<string, CommentDefinition[]>();
    const roots: CommentDefinition[] = [];
    for (const definition of [...definitions.values()].sort((left, right) => left.order - right.order)) {
      const root = rootOf(definition);
      if (root === definition) roots.push(definition);
      else replies.set(root.id, [...(replies.get(root.id) ?? []), definition]);
    }
    for (const root of roots) {
      const thread = [root, ...(replies.get(root.id) ?? [])];
      const anchor = thread.map((comment) => this.#comments.get(comment.id)).find((candidate) => candidate?.state === 'anchored');
      if (anchor === undefined || anchor.state !== 'anchored') continue;
      const lines = [root.text.length > 0 ? root.text : EMPTY_COMMENT_BODY];
      for (const reply of replies.get(root.id) ?? []) {
        lines.push(commentReplyLine(authorLabel(reply.author), reply.text.length > 0 ? reply.text : EMPTY_COMMENT_BODY));
      }
      if (anchor.crossParagraph) lines.push(CROSS_PARAGRAPH_COMMENT_LINE);
      const done = root.lastParagraphId === null ? false : threads.get(root.lastParagraphId)?.done === true;
      this.#push({
        blockPosition: anchor.position,
        fromGrapheme: anchor.from,
        toGrapheme: anchor.to,
        pinnedText: anchor.pinned,
        kind: 'annotation',
        origin: 'comment',
        authorLabel: authorLabel(root.author),
        body: truncateToFit(lines.join('\n'), MAX_MARK_BODY_CODE_UNITS),
        proposedText: null,
        status: done ? 'resolved' : 'open',
      });
    }
    return this.#marks
      .sort((left, right) => left.blockPosition - right.blockPosition || left.fromGrapheme - right.fromGrapheme ||
        left.toGrapheme - right.toGrapheme || left.sequence - right.sequence)
      .map(({ sequence: _sequence, ...mark }, index) => ({ ...mark, ordinal: index + 1 }));
  }
}

/** Read one comments part with the document part's own refusals: no DTD, no processing instruction, bounded nesting. */
function readCommentsXml(
  xml: string,
  onOpen: (tag: SaxesTagNS) => void,
  onText: (text: string) => void,
  onClose: (tag: SaxesTagNS) => void,
): void {
  let depth = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => requireMarks(false, 'DOCTYPE in comments XML'));
  parser.on('processinginstruction', () => requireMarks(false, 'processing instruction in comments XML'));
  parser.on('opentag', (tag) => {
    requireMarks(depth < MAX_XML_NESTING_DEPTH, 'comments XML nesting exceeds its safe bound');
    depth += 1;
    onOpen(tag);
  });
  parser.on('text', onText);
  parser.on('closetag', (tag) => {
    requireMarks(depth > 0, 'comments element stack mismatch');
    depth -= 1;
    onClose(tag);
  });
  parser.write(xml).close();
  requireMarks(depth === 0, 'comments element stack mismatch');
}

/** `word/comments.xml`: every comment's author, its paragraphs' text, and the id of its last paragraph. */
function parseCommentDefinitions(xml: string | undefined): Map<string, CommentDefinition> {
  const definitions = new Map<string, CommentDefinition>();
  if (xml === undefined) return definitions;
  let comment: { id: string; author: string; paragraphs: string[]; lastParagraphId: string | null } | undefined;
  let paragraph: string | undefined;
  let textDepth = 0;
  readCommentsXml(xml, (tag) => {
    switch (tag.local) {
      case 'comment':
        requireMarks(comment === undefined, 'nested comment');
        comment = { id: attributeValue(tag, 'id') ?? '', author: attributeValue(tag, 'author') ?? '', paragraphs: [], lastParagraphId: null };
        break;
      case 'p':
        if (comment !== undefined) {
          paragraph = '';
          comment.lastParagraphId = attributeValue(tag, 'paraId') ?? null;
        }
        break;
      case 't':
        textDepth += 1;
        break;
      case 'tab':
        if (paragraph !== undefined) paragraph += '\t';
        break;
      case 'br':
      case 'cr':
        if (paragraph !== undefined) paragraph += '\n';
        break;
      default:
        break;
    }
  }, (text) => {
    if (paragraph !== undefined && textDepth > 0) {
      requireMarks(paragraph.length + text.length <= MAX_COMMENT_PART_BYTES, 'comment text exceeds its bound');
      paragraph += text;
    }
  }, (tag) => {
    if (tag.local === 't') textDepth -= 1;
    if (tag.local === 'p' && comment !== undefined && paragraph !== undefined) {
      requireMarks(paragraph.isWellFormed(), 'comment contains invalid text');
      const normalized = normalizeParagraph(paragraph);
      if (normalized.length > 0) comment.paragraphs.push(normalized);
      paragraph = undefined;
    }
    if (tag.local === 'comment' && comment !== undefined) {
      requireMarks(definitions.size < MAX_IMPORTED_MARKS, 'too many comments or revisions');
      if (comment.id.length > 0 && !definitions.has(comment.id)) {
        definitions.set(comment.id, {
          id: comment.id,
          author: comment.author,
          text: comment.paragraphs.join('\n'),
          lastParagraphId: comment.lastParagraphId,
          order: definitions.size,
        });
      }
      comment = undefined;
    }
  });
  requireMarks(comment === undefined && textDepth === 0, 'incomplete comments XML state');
  return definitions;
}

/** `word/commentsExtended.xml`: which comment each reply answers, and which comments are done. */
function parseCommentThreads(xml: string | undefined): Map<string, { parent: string | null; done: boolean }> {
  const threads = new Map<string, { parent: string | null; done: boolean }>();
  if (xml === undefined) return threads;
  readCommentsXml(xml, (tag) => {
    if (tag.local !== 'commentEx') return;
    const paragraphId = attributeValue(tag, 'paraId');
    if (paragraphId === undefined) return;
    requireMarks(threads.size < MAX_IMPORTED_MARKS, 'too many comments or revisions');
    const done = attributeValue(tag, 'done');
    threads.set(paragraphId, { parent: attributeValue(tag, 'paraIdParent') ?? null, done: done === '1' || done === 'true' });
  }, () => undefined, () => undefined);
  return threads;
}

/** A complete decoded atom is checked before any slice can become canonical evidence. */
export function wordAtomFragment(atom: WordSourceAtom, decoded: ReadonlyMap<number, string>, from = 0, to = atom.codeUnits): WordSourceFragment {
  if (atom.kind === 'paragraph-boundary') {
    requireMarks(from === 0 && to === 0, 'paragraph boundary has text offsets');
    return { kind: 'paragraph-boundary', part: atom.part, paragraphIndex: atom.paragraphIndex,
      atomOrdinal: atom.atomOrdinal, sha256: atom.sha256 };
  }
  const text = decoded.get(atom.atomOrdinal);
  requireMarks(text !== undefined && text.length === atom.codeUnits && sha256Hex(text) === atom.sha256, 'Word source atom changed');
  const boundary = (offset: number): boolean => Number.isSafeInteger(offset) && offset >= 0 && offset <= text.length &&
    !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[offset]!));
  requireMarks(boundary(from) && boundary(to) && from <= to, 'Word fragment offset is not a code-point boundary');
  return { kind: 'text', part: atom.part, paragraphIndex: atom.paragraphIndex, atomOrdinal: atom.atomOrdinal,
    fromCodeUnit: from, toCodeUnit: to, codeUnits: to - from, sha256: sha256Hex(text.slice(from, to)) };
}

function wordLocation(fragment: WordSourceFragment | undefined): WordSourceLocation | null {
  return fragment === undefined ? null : { part: fragment.part, paragraphIndex: fragment.paragraphIndex,
    atomOrdinal: fragment.atomOrdinal, codeUnitOffset: fragment.kind === 'text' ? fragment.fromCodeUnit : 0 };
}

/** Mechanical operation membership: named moves, separate revised boundaries, and adjacent text hunks. */
export function wordSampleTemplates(graph: WordRevisionGraph, decoded: ReadonlyMap<number, string>, signal?: AbortSignal): WordSampleTemplate[] {
  const events = new Map(graph.events.map((event) => [event.eventId, event]));
  const eventOrder = new Map(graph.events.map((event, index) => [event.eventId, index]));
  const templates: WordSampleTemplate[] = [];
  const membership = (ids: Iterable<string>): string[] => [...new Set(ids)].sort((a, b) => eventOrder.get(a)! - eventOrder.get(b)!);
  const add = (operationKind: WordSampleTemplate['operationKind'], atoms: readonly WordSourceAtom[], extra: readonly string[] = []): void => {
    const visible = atoms.filter((atom) => atom.kind === 'paragraph-boundary'
      ? atom.rejected !== atom.accepted : atom.codeUnits > 0);
    const before = visible.filter((atom) => atom.rejected).map((atom) => wordAtomFragment(atom, decoded));
    const after = visible.filter((atom) => atom.accepted).map((atom) => wordAtomFragment(atom, decoded));
    if (before.length + after.length === 0) return;
    const content = { operationKind, eventMembership: membership([...extra, ...atoms.flatMap((atom) => atom.eventMembership)]),
      before, after, sourceLocation: wordLocation(before[0]), destinationLocation: wordLocation(after[0]) };
    templates.push({ templateKey: wordTemplateKey(graph.sourceDigest, content), ...content });
  };
  const moves = new Map<string, { atoms: WordSourceAtom[]; events: string[] }>();
  const moveOf = (atom: WordSourceAtom): string | null => {
    const marked = atom.eventMembership.map((id) => events.get(id)!).filter((event) => event.kind === 'moveFrom' || event.kind === 'moveTo');
    if (marked.length === 0) return null;
    const starts = marked.flatMap((event) => event.linkedEventIds).map((id) => events.get(id))
      .filter((event) => event?.kind === 'moveFromRangeStart' || event?.kind === 'moveToRangeStart');
    requireMarks(starts.length > 0 && starts.every((event) => event!.rangeName === starts[0]!.rangeName), 'move has no unique named range');
    const start = starts[0]!;
    return `${start.part}\u001f${start.rangeName}`;
  };
  let hunk: WordSourceAtom[] = [];
  const flush = (): void => {
    if (hunk.length === 0) return;
    const before = hunk.some((atom) => atom.rejected && atom.codeUnits > 0);
    const after = hunk.some((atom) => atom.accepted && atom.codeUnits > 0);
    add(before && after ? 'replace' : before ? 'delete' : 'insert', hunk);
    hunk = [];
  };
  for (const atom of graph.atoms) {
    signal?.throwIfAborted();
    const move = moveOf(atom);
    if (move !== null) {
      flush();
      let group = moves.get(move);
      if (group === undefined) {
        group = { atoms: [], events: [] };
        moves.set(move, group);
      }
      group.atoms.push(atom);
      for (const id of atom.eventMembership) {
        const event = events.get(id)!;
      for (const linked of event.linkedEventIds) {
        group.events.push(linked, ...events.get(linked)!.linkedEventIds);
      }
      }
      continue;
    }
    if (atom.kind === 'paragraph-boundary') {
      flush();
      if (atom.rejected !== atom.accepted) add('paragraph-boundary', [atom]);
      continue;
    }
    const revisions = atom.eventMembership.filter((id) => events.get(id)?.context === 'run');
    if (atom.hunkBoundaryBefore || (hunk.length > 0 && hunk[0]!.paragraphIndex !== atom.paragraphIndex)) flush();
    if (revisions.length === 0) flush();
    else hunk.push(atom);
  }
  flush();
  for (const group of moves.values()) add('move', group.atoms, group.events);
  templates.sort((left, right) => {
    const a = left.sourceLocation ?? left.destinationLocation!;
    const b = right.sourceLocation ?? right.destinationLocation!;
    return a.atomOrdinal - b.atomOrdinal || left.templateKey.localeCompare(right.templateKey);
  });
  const visibleEvents = new Set(graph.atoms.filter((atom) => atom.rejected !== atom.accepted &&
    (atom.kind === 'paragraph-boundary' || atom.codeUnits > 0)).flatMap((atom) => atom.eventMembership));
  for (const event of graph.events) {
    if (event.context === 'run' || event.context === 'paragraph-boundary') {
      event.disposition = visibleEvents.has(event.eventId) ? 'visible-transition' : 'no-visible-transition';
    }
  }
  return templates;
}

interface WordRawPiece { from: number; to: number; atom: WordSourceAtom }

/**
 * Normalize whole paragraphs after joins. Source grapheme groups are unioned whenever a normalization
 * replacement touches them; no normalized-prefix rounding is used to invent a source boundary.
 */
export function normalizeWordParagraph(raw: string, pieces: readonly WordRawPiece[], decoded: ReadonlyMap<number, string>): {
  text: string; groups: WordNormalizationGroup[];
} {
  requireMarks(raw.isWellFormed(), 'Word paragraph contains invalid text');
  const clusters = Array.from(segmenter.segment(raw), ({ segment, index }) => ({ from: index, to: index + segment.length, text: segment.normalize('NFC') }));
  const parents = clusters.map((_, index) => index);
  const root = (index: number): number => {
    let current = index;
    while (parents[current] !== current) current = parents[current]!;
    while (parents[index] !== index) { const next = parents[index]!; parents[index] = current; index = next; }
    return current;
  };
  const union = (first: number, last: number): void => {
    const owner = root(first);
    for (let i = first + 1; i <= last; i += 1) parents[root(i)] = owner;
  };
  let scalars = clusters.flatMap((cluster, index) => Array.from(cluster.text, (text) => ({ text, first: index, last: index })));
  const replace = (pattern: RegExp, replacement: string): void => {
    const text = scalars.map((entry) => entry.text).join('');
    const matches = [...text.matchAll(pattern)];
    if (matches.length === 0) return;
    const output: typeof scalars = [];
    let scalarIndex = 0;
    let offset = 0;
    for (const match of matches) {
      while (scalarIndex < scalars.length && offset < match.index) {
        const scalar = scalars[scalarIndex++]!; output.push(scalar); offset += scalar.text.length;
      }
      const first = scalars[scalarIndex]?.first;
      let last = first;
      while (scalarIndex < scalars.length && offset < match.index + match[0].length) {
        const scalar = scalars[scalarIndex++]!; last = scalar.last; offset += scalar.text.length;
      }
      requireMarks(first !== undefined && last !== undefined, 'normalization did not consume a source scalar');
      union(first, last);
      for (const text of replacement) output.push({ text, first, last });
    }
    for (; scalarIndex < scalars.length; scalarIndex += 1) output.push(scalars[scalarIndex]!);
    scalars = output;
  };
  replace(/[ \t]+/gu, ' ');
  replace(/ *\n */gu, '\n');
  replace(/^\s+|\s+$/gu, '');
  const text = scalars.map((entry) => entry.text).join('');
  const outputClusters = Array.from(segmenter.segment(text));
  requireMarks(text.length <= MAX_BLOCK_CODE_UNITS && outputClusters.length <= MAX_BLOCK_GRAPHEMES, 'selected Word paragraph exceeds the bounded block size');
  const boundaries = new Map<number, number>([[0, 0]]);
  outputClusters.forEach((cluster, index) => boundaries.set(cluster.index + cluster.segment.length, index + 1));
  // Whitespace removal can expose a combining sequence. Merge its complete provenance before mapping.
  let outputOffset = 0;
  let previous: number | undefined;
  for (const scalar of scalars) {
    if (previous !== undefined && !boundaries.has(outputOffset)) union(previous, scalar.last);
    previous = scalar.first;
    outputOffset += scalar.text.length;
  }
  const grouped = new Map<number, { from: number; to: number; normalizedText: string }>();
  clusters.forEach((cluster, index) => {
    const owner = root(index);
    const group = grouped.get(owner);
    if (group === undefined) grouped.set(owner, { from: cluster.from, to: cluster.to, normalizedText: '' });
    else group.to = cluster.to;
  });
  for (const scalar of scalars) grouped.get(root(scalar.first))!.normalizedText += scalar.text;
  const pending: Array<{ from: number; to: number; fragments: WordSourceFragment[]; normalizedText: string }> = [];
  const sourceGroups = [...grouped.values()];
  let pieceIndex = 0;
  for (const group of sourceGroups) {
    const fragments: WordSourceFragment[] = [];
    while (pieceIndex < pieces.length && pieces[pieceIndex]!.to <= group.from) pieceIndex += 1;
    for (let i = pieceIndex; i < pieces.length && pieces[i]!.from < group.to; i += 1) {
      const piece = pieces[i]!;
      if (piece.from === piece.to) {
        if (piece.from > group.from && piece.from < group.to) fragments.push(wordAtomFragment(piece.atom, decoded));
      } else if (piece.to > group.from) {
        fragments.push(wordAtomFragment(piece.atom, decoded, Math.max(group.from, piece.from) - piece.from, Math.min(group.to, piece.to) - piece.from));
      }
    }
    pending.push({ ...group, fragments });
  }
  for (const piece of pieces) {
    if (piece.atom.kind !== 'paragraph-boundary') continue;
    let low = 0; let high = sourceGroups.length;
    while (low < high) { const middle = (low + high) >>> 1; if (sourceGroups[middle]!.to <= piece.from) low = middle + 1; else high = middle; }
    const group = sourceGroups[low];
    if (group === undefined || !(group.from < piece.from && piece.from < group.to)) {
      pending.push({ from: piece.from, to: piece.to, fragments: [wordAtomFragment(piece.atom, decoded)], normalizedText: '' });
    }
  }
  pending.sort((a, b) => a.from - b.from || a.to - b.to);
  const groups: WordNormalizationGroup[] = [];
  let offset = 0;
  for (const group of pending) {
    const fromGrapheme = boundaries.get(offset);
    offset += group.normalizedText.length;
    const toGrapheme = boundaries.get(offset);
    requireMarks(fromGrapheme !== undefined && toGrapheme !== undefined, 'normalization group splits a selected grapheme');
    groups.push({ ordinal: groups.length + 1, fragments: group.fragments, fromGrapheme, toGrapheme, normalizedText: group.normalizedText });
  }
  requireMarks(offset === text.length, 'normalization groups do not reconstruct the selected paragraph');
  return { text, groups };
}

/** Both readings use the same raw graph; an empty reading is explicit and is never padded for staging. */
export function compileWordReading(graph: WordRevisionGraph, decoded: ReadonlyMap<number, string>, reading: WordReadingKind,
  templates: readonly WordSampleTemplate[],
  commentBodies: ReadonlyMap<string, string> = new Map(), textBoxes: 'retain' | 'merge' = 'retain', signal?: AbortSignal): WordCompiledReading {
  const atoms = new Map(graph.atoms.map((atom) => [atom.atomOrdinal, atom]));
  const blocks: WordReadingBlock[] = [];
  const segments: WordSourceSegment[] = [];
  let raw = '';
  let pieces: WordRawPiece[] = [];
  let paragraphs: number[] = [];
  let shape: WordRevisionGraph['paragraphs'][number] | undefined;
  const flush = (): void => {
    if (shape === undefined) return;
    const normalized = normalizeWordParagraph(raw, pieces, decoded);
    if (normalized.text.length > 0) {
      requireMarks(blocks.length < 100_000, 'too many manuscript blocks');
      const position = blocks.length + 1;
      const digest = sha256Hex(canonicalJson({ kind: shape.kind, level: shape.level, text: normalized.text }));
      const blockId = `blk_${sha256Hex(`${position}\u0000${digest}`).slice(0, 24)}`;
      const block: WordReadingBlock = { blockId, position, kind: shape.kind, level: shape.level, text: normalized.text, digest,
        graphemeLength: graphemesOf(normalized.text).length, sourceParagraphIndices: paragraphs, groups: normalized.groups };
      blocks.push(block);
      let ordinal = 0;
      for (const group of block.groups) for (const fragment of group.fragments) {
        segments.push({ blockId, segmentOrdinal: ++ordinal, groupOrdinal: group.ordinal, fragment,
          fromGrapheme: group.fromGrapheme, toGrapheme: group.toGrapheme, normalizedSha256: sha256Hex(group.normalizedText) });
      }
    }
    raw = ''; pieces = []; paragraphs = []; shape = undefined;
  };
  for (const paragraph of graph.paragraphs) {
    signal?.throwIfAborted();
    if (paragraph.sourcePart === 'text-box' && textBoxes === 'retain') continue;
    shape ??= paragraph;
    paragraphs.push(paragraph.paragraphIndex);
    for (const ordinal of paragraph.atomOrdinals) {
      const atom = atoms.get(ordinal)!;
      if (atom.kind !== 'text' || !atom[reading]) continue;
      const text = decoded.get(ordinal)!;
      pieces.push({ from: raw.length, to: raw.length + text.length, atom });
      raw += text;
    }
    const boundary = atoms.get(paragraph.boundaryAtomOrdinal)!;
    if (boundary[reading]) flush();
    else pieces.push({ from: raw.length, to: raw.length, atom: boundary });
  }
  flush();
  const contentDigest = sha256Hex(blocks.map((block) => block.text).join('\u001e'));
  const structureDigest = sha256Hex(canonicalJson(blocks.map(({ blockId, position, kind, level, digest }) => ({ blockId, position, kind, level, digest }))));
  const mappingDigest = sha256Hex(canonicalJson(segments));
  const comments = wordCommentMarks(graph, blocks, commentBodies, signal);
  const revisions = wordRevisionMarks(graph, blocks, decoded, templates, reading, signal);
  let marks = [...comments.marks, ...revisions.marks].sort((a, b) => a.mark.blockPosition - b.mark.blockPosition ||
    a.mark.fromGrapheme - b.mark.fromGrapheme || a.mark.toGrapheme - b.mark.toGrapheme || a.mark.ordinal - b.mark.ordinal)
    .map((entry, index) => ({ ...entry, mark: { ...entry.mark, ordinal: index + 1 } }));
  const refusals = [...comments.refusals, ...revisions.refusals];
  if (marks.length > MAX_IMPORTED_MARKS) {
    refusals.push({ code: 'resource-limit', part: 'word/document.xml', elementOrdinal: 0, paragraphIndex: null });
    marks = [];
  }
  const facts = { reading, textBoxes, usable: blocks.length > 0 && refusals.length === 0, blocks, segments, contentDigest, structureDigest, mappingDigest,
    commentMarks: comments.marks, marks, refusals,
    characterCount: blocks.reduce((count, block) => count + block.graphemeLength, 0) };
  return { ...facts, readingDigest: sha256Hex(canonicalJson({ schema: 'ai7.word-selected-reading/1', ...facts })) };
}

const WORD_COMMENT_NS = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main']);

/** Full decoded comment bodies are ephemeral; canonical metadata pins their retained-original locators and hashes. */
export function readWordSourceComments(graph: WordRevisionGraph, xml: string | undefined, extended: string | undefined): {
  comments: WordSourceComment[]; bodies: ReadonlyMap<string, string>; invalid: boolean;
} {
  interface Definition { rawId: string; rawAuthor: string | null; rawDate: string | null; paragraphs: string[];
    lastParagraphId: string | null; parentId: string | null; resolved: boolean }
  const definitions = new Map<string, Definition>();
  const duplicates = new Set<string>();
  const markers = new Map<string, string[]>();
  for (const event of graph.events) {
    if (event.context !== 'comment') continue;
    const key = event.rawId ?? '';
    const ids = markers.get(key) ?? []; ids.push(event.eventId); markers.set(key, ids);
  }
  const attr = (tag: SaxesTagNS, local: string): string | null => Object.values(tag.attributes)
    .find((attribute) => WORD_COMMENT_NS.has(attribute.uri) && attribute.local === local)?.value ?? null;
  let comment: Definition | undefined;
  let paragraph: string | undefined;
  let inText = false;
  if (xml !== undefined) readCommentsXml(xml, (tag) => {
    if (!WORD_COMMENT_NS.has(tag.uri)) return;
    if (tag.local === 'comment') {
      requireMarks(comment === undefined, 'nested Word comment');
      comment = { rawId: attr(tag, 'id') ?? '', rawAuthor: attr(tag, 'author'), rawDate: attr(tag, 'date'),
        paragraphs: [], lastParagraphId: null, parentId: null, resolved: false };
    } else if (tag.local === 'p' && comment !== undefined) {
      paragraph = '';
      comment.lastParagraphId = Object.values(tag.attributes).find((attribute) => attribute.local === 'paraId' &&
        attribute.uri === 'http://schemas.microsoft.com/office/word/2010/wordml')?.value ?? null;
    } else if (tag.local === 't') inText = true;
    else if (paragraph !== undefined && (tag.local === 'tab' || tag.local === 'br' || tag.local === 'cr')) paragraph += tag.local === 'tab' ? '\t' : '\n';
  }, (text) => {
    if (paragraph !== undefined && inText) paragraph += text;
  }, (tag) => {
    if (!WORD_COMMENT_NS.has(tag.uri)) return;
    if (tag.local === 't') inText = false;
    else if (tag.local === 'p' && paragraph !== undefined && comment !== undefined) {
      requireMarks(paragraph.isWellFormed(), 'invalid Word comment text');
      comment.paragraphs.push(paragraph); paragraph = undefined;
    } else if (tag.local === 'comment' && comment !== undefined) {
      if (definitions.has(comment.rawId)) duplicates.add(comment.rawId);
      else definitions.set(comment.rawId, comment);
      comment = undefined;
    }
  });
  const paragraphIds = new Map<string, string>();
  for (const definition of definitions.values()) if (definition.lastParagraphId !== null) paragraphIds.set(definition.lastParagraphId, definition.rawId);
  if (extended !== undefined) readCommentsXml(extended, (tag) => {
    if (tag.local !== 'commentEx' || tag.uri !== 'http://schemas.microsoft.com/office/word/2012/wordml') return;
    const value = (local: string): string | undefined => Object.values(tag.attributes).find((attribute) => attribute.uri === tag.uri && attribute.local === local)?.value;
    const id = paragraphIds.get(value('paraId') ?? '');
    const definition = id === undefined ? undefined : definitions.get(id);
    if (definition === undefined) return;
    definition.parentId = paragraphIds.get(value('paraIdParent') ?? '') ?? null;
    definition.resolved = value('done') === '1' || value('done') === 'true';
  }, () => undefined, () => undefined);
  let invalid = [...markers.keys()].some((id) => id.length === 0 || !definitions.has(id) || duplicates.has(id));
  const relevant = new Set(markers.keys());
  // Resolve a reply to its root in linear time, rejecting cycles instead of inventing a thread.
  const roots = new Map<string, string | null>();
  for (const definition of definitions.values()) {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = definition.rawId;
    while (current !== null && !roots.has(current)) {
      if (seen.has(current)) { if (chain.some((id) => markers.has(id))) invalid = true; current = null; break; }
      seen.add(current); chain.push(current);
      const parent: string | null = definitions.get(current)?.parentId ?? null;
      if (parent === null) { roots.set(current, current); break; }
      current = parent;
    }
    const root = current === null ? null : roots.get(current) ?? current;
    for (const id of chain) roots.set(id, root);
    if (root !== null && markers.has(root)) for (const id of chain) relevant.add(id);
  }
  const comments: WordSourceComment[] = [];
  const bodies = new Map<string, string>();
  for (const definition of definitions.values()) {
    if (!relevant.has(definition.rawId)) continue;
    const body = definition.paragraphs.join('\n');
    bodies.set(definition.rawId, body);
    comments.push({ rawId: definition.rawId, rawAuthor: definition.rawAuthor, rawDate: definition.rawDate,
      bodyCodeUnits: body.length, bodySha256: sha256Hex(body), parentId: definition.parentId, resolved: definition.resolved,
      markerEventIds: markers.get(definition.rawId) ?? [] });
  }
  return { comments, bodies, invalid };
}

function wordCommentMarks(graph: WordRevisionGraph, blocks: readonly WordReadingBlock[], bodies: ReadonlyMap<string, string>, signal?: AbortSignal): {
  marks: WordSourceMark[]; refusals: WordIncompatibility[];
} {
  const events = new Map(graph.events.map((event) => [event.eventId, event]));
  const bodyParagraphs = new Set(graph.paragraphs.filter((paragraph) => paragraph.sourcePart === 'body').map((paragraph) => paragraph.paragraphIndex));
  const groups = blocks.flatMap((block) => block.groups.flatMap((group) => group.fragments.map((fragment) => ({ block, group, fragment }))))
    .sort((a, b) => a.fragment.atomOrdinal - b.fragment.atomOrdinal);
  const marks: WordSourceMark[] = [];
  const refusals: WordIncompatibility[] = [];
  const descendants = new Map<string, WordSourceComment[]>();
  for (const comment of graph.comments) {
    signal?.throwIfAborted();
    if (comment.parentId === null) continue;
    const children = descendants.get(comment.parentId) ?? []; children.push(comment); descendants.set(comment.parentId, children);
  }
  for (const comment of graph.comments) {
    if (comment.markerEventIds.length === 0) continue;
    const markers = comment.markerEventIds.map((id) => events.get(id)!);
    const starts = markers.filter((event) => event.kind === 'commentRangeStart');
    const ends = markers.filter((event) => event.kind === 'commentRangeEnd');
    const first = starts[0]?.location.atomOrdinal ?? -1;
    const last = ends[0]?.location.atomOrdinal ?? -1;
    const refuse = (): void => { refusals.push({ code: 'unrepresentable-comment', part: 'word/document.xml',
      elementOrdinal: markers[0]?.elementOrdinal ?? 0, paragraphIndex: markers[0]?.location.paragraphIndex ?? null }); };
    if (starts.length !== 1 || ends.length !== 1 || first >= last || !bodies.has(comment.rawId)) { refuse(); continue; }
    let lo = 0; let hi = groups.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (groups[mid]!.fragment.atomOrdinal < first) lo = mid + 1; else hi = mid; }
    const mapped = new Map<string, { block: WordReadingBlock; groups: Set<WordNormalizationGroup> }>();
    let exact = true;
    for (let index = lo; index < groups.length && groups[index]!.fragment.atomOrdinal < last; index += 1) {
      const { block, group, fragment } = groups[index]!;
      if (!bodyParagraphs.has(fragment.paragraphIndex)) continue;
      if (group.fromGrapheme === group.toGrapheme) continue;
      if (group.fragments.some((fragment) => fragment.atomOrdinal < first || fragment.atomOrdinal >= last)) { exact = false; break; }
      let entry = mapped.get(block.blockId);
      if (entry === undefined) {
        if (marks.length + mapped.size >= MAX_IMPORTED_MARKS) return { marks: [], refusals: [...refusals,
          { code: 'resource-limit', part: 'word/document.xml', elementOrdinal: markers[0]!.elementOrdinal,
            paragraphIndex: markers[0]!.location.paragraphIndex }] };
        entry = { block, groups: new Set() }; mapped.set(block.blockId, entry);
      }
      entry.groups.add(group);
    }
    if (!exact || mapped.size === 0) { refuse(); continue; }
    let body = bodies.get(comment.rawId)!;
    const replyQueue = [...(descendants.get(comment.rawId) ?? [])];
    for (let index = 0; index < replyQueue.length; index += 1) {
      const reply = replyQueue[index]!;
      const replyBody = bodies.get(reply.rawId);
      requireMarks(replyBody !== undefined && sha256Hex(replyBody) === reply.bodySha256, 'Word comment reply changed');
      body += `\n${commentReplyLine(authorLabel(reply.rawAuthor ?? undefined), replyBody)}`;
      replyQueue.push(...(descendants.get(reply.rawId) ?? []));
    }
    let part = 0;
    for (const { block, groups: selected } of mapped.values()) {
      const fromGrapheme = Math.min(...[...selected].map((group) => group.fromGrapheme));
      const toGrapheme = Math.max(...[...selected].map((group) => group.toGrapheme));
      const label = mapped.size > 1 ? `（原批注第 ${++part}/${mapped.size} 部分）\n` : '';
      marks.push({ mark: { ordinal: marks.length + 1, blockPosition: block.position, fromGrapheme, toGrapheme,
        pinnedText: graphemesOf(block.text).slice(fromGrapheme, toGrapheme).join(''), kind: 'annotation', origin: 'comment',
        authorLabel: authorLabel(comment.rawAuthor ?? undefined), body: truncateToFit(label + (body || EMPTY_COMMENT_BODY), MAX_MARK_BODY_CODE_UNITS),
        proposedText: null, status: comment.resolved ? 'resolved' : 'open' }, eventMembership: comment.markerEventIds,
      templateKey: null, commentId: comment.rawId, fragments: [...selected].flatMap((group) => group.fragments) });
    }
  }
  return { marks, refusals };
}

/** Exact per-operation counterfactuals make proposals; structural edits retain demonstrable source context. */
function wordRevisionMarks(graph: WordRevisionGraph, blocks: readonly WordReadingBlock[], decoded: ReadonlyMap<number, string>,
  templates: readonly WordSampleTemplate[], reading: WordReadingKind, signal?: AbortSignal): { marks: WordSourceMark[]; refusals: WordIncompatibility[] } {
  if (reading === 'accepted') return { marks: [], refusals: [] };
  const marks: WordSourceMark[] = [];
  const refusals: WordIncompatibility[] = [];
  const events = new Map(graph.events.map((event) => [event.eventId, event]));
  const paragraphs = new Map(graph.paragraphs.map((paragraph, index) => [paragraph.paragraphIndex, { paragraph, index }]));
  const byParagraph = new Map<number, WordReadingBlock>();
  const atomsByParagraph = new Map<number, WordSourceAtom[]>();
  const boxesByAnchor = new Map<number, WordRevisionGraph['paragraphs']>();
  for (const paragraph of graph.paragraphs) {
    if (paragraph.anchorParagraphIndex === null) continue;
    const boxes = boxesByAnchor.get(paragraph.anchorParagraphIndex) ?? [];
    boxes.push(paragraph); boxesByAnchor.set(paragraph.anchorParagraphIndex, boxes);
  }
  for (const block of blocks) for (const index of block.sourceParagraphIndices) byParagraph.set(index, block);
  for (const atom of graph.atoms) {
    const atoms = atomsByParagraph.get(atom.paragraphIndex) ?? []; atoms.push(atom); atomsByParagraph.set(atom.paragraphIndex, atoms);
  }
  const context = (template: WordSampleTemplate): { block: WordReadingBlock; from: number; to: number } | null => {
    for (const fragment of [...template.before, ...template.after]) {
      const block = byParagraph.get(fragment.paragraphIndex);
      if (block === undefined) continue;
      const group = block.groups.find((group) => group.fragments.some((source) => source.atomOrdinal === fragment.atomOrdinal));
      if (group !== undefined) return group.toGrapheme > group.fromGrapheme
        ? { block, from: group.fromGrapheme, to: group.toGrapheme }
        : { block, from: Math.max(0, group.fromGrapheme - 1), to: Math.max(1, group.fromGrapheme) };
      // A revised boundary has an exact endpoint in its own surviving source paragraph.
      if (fragment.kind === 'paragraph-boundary') return { block, from: Math.max(0, block.graphemeLength - 1), to: block.graphemeLength };
    }
    const location = template.sourceLocation ?? template.destinationLocation;
    const source = location === null ? undefined : paragraphs.get(location.paragraphIndex);
    if (source === undefined) return null;
    for (const boxParagraph of boxesByAnchor.get(source.paragraph.paragraphIndex) ?? []) {
      const block = byParagraph.get(boxParagraph.paragraphIndex);
      if (block !== undefined) return { block, from: 0, to: 1 };
    }
    for (const direction of [-1, 1]) {
      const adjacent = graph.paragraphs[source.index + direction];
      if (adjacent === undefined || adjacent.container !== source.paragraph.container) continue;
      const block = byParagraph.get(adjacent.paragraphIndex);
      if (block !== undefined) return direction < 0
        ? { block, from: block.graphemeLength - 1, to: block.graphemeLength }
        : { block, from: 0, to: 1 };
    }
    return null;
  };
  for (const template of templates) {
    signal?.throwIfAborted();
    const location = template.sourceLocation ?? template.destinationLocation!;
    const rawAuthors = template.eventMembership.map((id) => events.get(id)!).filter((event) => event.disposition === 'visible-transition' &&
      (event.context === 'run' || event.context === 'paragraph-boundary'));
    const authors = [...new Set(rawAuthors.map((event) => authorLabel(event.rawAuthor ?? undefined)))];
    const label = truncateToFit(authors.join(' / ') || UNNAMED_AUTHOR_LABEL, MAX_AUTHOR_LABEL_CODE_UNITS, '');
    const block = byParagraph.get(location.paragraphIndex);
    let proposal: ParsedImportedMark | null = null;
    const structural = template.operationKind === 'move' || template.operationKind === 'paragraph-boundary';
    if (!structural && block !== undefined) {
      const affected = new Set([...template.before, ...template.after].map((fragment) => fragment.atomOrdinal));
      let counterfactual = '';
      for (const paragraph of block.sourceParagraphIndices) for (const atom of atomsByParagraph.get(paragraph) ?? []) {
        if (atom.kind !== 'text' || !(affected.has(atom.atomOrdinal) ? atom.accepted : atom.rejected)) continue;
        counterfactual += decoded.get(atom.atomOrdinal)!;
      }
      counterfactual = normalizeParagraph(counterfactual);
      const before = graphemesOf(block.text);
      const after = graphemesOf(counterfactual);
      let prefix = 0;
      while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
      let suffix = 0;
      while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
      if (prefix + suffix < before.length || prefix + suffix < after.length) {
        const currentText = before.slice(prefix, before.length - suffix).join('');
        const proposedText = after.slice(prefix, after.length - suffix).join('');
        if (counterfactual.length > 0 && counterfactual.length <= MAX_BLOCK_CODE_UNITS && after.length <= MAX_BLOCK_GRAPHEMES) {
          proposal = { ordinal: marks.length + 1, blockPosition: block.position, fromGrapheme: prefix,
            toGrapheme: before.length - suffix, pinnedText: currentText, kind: 'change-suggestion',
            origin: currentText.length === 0 ? 'insertion' : proposedText.length === 0 ? 'deletion' : 'replacement',
            authorLabel: label, body: '', proposedText, status: 'open' };
        }
      }
    }
    if (proposal === null) {
      const anchor = context(template);
      if (anchor === null) {
        refusals.push({ code: 'unusable-reading', part: location.part, paragraphIndex: location.paragraphIndex,
          elementOrdinal: events.get(template.eventMembership[0]!)!.elementOrdinal });
        continue;
      }
      const words = (fragments: readonly WordSourceFragment[]): string => fragments.map((fragment) => fragment.kind === 'paragraph-boundary'
        ? '〔段落边界〕' : decoded.get(fragment.atomOrdinal)!.slice(fragment.fromCodeUnit, fragment.toCodeUnit)).join('');
      const description = template.operationKind === 'move' ? '原文件中的关联移动' : template.operationKind === 'paragraph-boundary'
        ? '原文件中的分段或合段修订' : '原文件中不能单独表示为文字替换的修订';
      const body = `${description}。来源：${location.part}，原始段落 ${location.paragraphIndex + 1}，原子 ${location.atomOrdinal}。` +
        `\n修改前：${words(template.before)}\n修改后：${words(template.after)}`;
      proposal = { ordinal: marks.length + 1, blockPosition: anchor.block.position, fromGrapheme: anchor.from, toGrapheme: anchor.to,
        pinnedText: graphemesOf(anchor.block.text).slice(anchor.from, anchor.to).join(''), kind: 'annotation',
        origin: template.operationKind === 'move' ? 'move' : template.operationKind === 'paragraph-boundary'
          ? template.before.length > 0 ? 'paragraph-merge' : 'paragraph-split' : template.before.length === 0 ? 'paragraph-insertion' : 'replacement',
        authorLabel: label, body: truncateToFit(body, MAX_MARK_BODY_CODE_UNITS), proposedText: null, status: 'open' };
    }
    if (marks.length >= MAX_IMPORTED_MARKS) return { marks: [], refusals: [...refusals,
      { code: 'resource-limit', part: location.part, elementOrdinal: events.get(template.eventMembership[0]!)!.elementOrdinal,
        paragraphIndex: location.paragraphIndex }] };
    marks.push({ mark: proposal, eventMembership: template.eventMembership, templateKey: template.templateKey,
      commentId: null, fragments: [...template.before, ...template.after] });
  }
  return { marks, refusals };
}
