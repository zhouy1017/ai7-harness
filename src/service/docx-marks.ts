import { SaxesParser, type SaxesTagNS } from 'saxes';
import { MAX_MARK_BODY_CODE_UNITS } from '../shared/protocol.js';

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
