import { SaxesParser } from 'saxes';
import { MAX_COMMENT_PART_BYTES } from './docx-marks.js';

/**
 * Footnotes and endnotes as note blocks (parser identity `ai7-docx-fflate-saxes/4`; Issue #1204, ADR 0096 §1). The body's
 * references are read as the body streams; the two note parts are read whole, under the comments' bound, beside it. Once the
 * body has ended, every note the body refers to becomes one block after the last body paragraph, in the order of its first
 * reference — footnotes and endnotes in one sequence — and its paragraphs become the block's lines. A note with no text, a
 * separator, and a note nothing refers to stay with the file.
 */
export type NotePart = 'footnote' | 'endnote';

export const NOTE_PART_NAMES: Readonly<Record<string, NotePart>> = {
  'word/footnotes.xml': 'footnote',
  'word/endnotes.xml': 'endnote',
};

/** The reference elements of the body, by the part their notes stand in. */
export const NOTE_REFERENCE_PARTS: Readonly<Record<string, NotePart>> = { footnoteReference: 'footnote', endnoteReference: 'endnote' };

/** What a note block carries besides its text: its part, its own identifier there, its number, and the block that refers to it. */
export interface ParsedNoteSource {
  part: NotePart;
  noteId: string;
  /** 1-based among the note blocks of its part, in reference order. */
  ordinal: number;
  /** The position of the body block whose paragraph refers to it, or of the nearest one before it; null when none. */
  referencePosition: number | null;
}

/** A reference the body made, with the body block it belongs to. */
export interface NoteReference {
  part: NotePart;
  noteId: string;
  referencePosition: number | null;
}

function rejected(message: string): Error {
  return new Error(`DOCX_REJECTED:${message}`);
}

/** A paragraph's collected text as a block carries it: NFC, runs of spaces and tabs as one space, lines trimmed. */
export function normalizeBlockText(text: string): string {
  if (!text.isWellFormed()) throw rejected('paragraph contains invalid text');
  return text.normalize('NFC').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

/** The two note parts' bytes, gathered as the archive streams. */
export class NotePartCollector {
  readonly #chunks = new Map<NotePart, Uint8Array[]>();
  readonly #sizes = new Map<NotePart, number>();
  readonly #parts = new Map<NotePart, string>();

  accept(name: string, chunk: Uint8Array, final: boolean): void {
    const part = NOTE_PART_NAMES[name];
    if (part === undefined) return;
    const size = (this.#sizes.get(part) ?? 0) + chunk.byteLength;
    if (size > MAX_COMMENT_PART_BYTES) throw rejected('note part exceeded its bound');
    this.#sizes.set(part, size);
    const chunks = this.#chunks.get(part) ?? [];
    chunks.push(chunk);
    this.#chunks.set(part, chunks);
    if (!final) return;
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const piece of chunks) {
      joined.set(piece, offset);
      offset += piece.byteLength;
    }
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(joined);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw rejected('DTD or entity declaration');
    this.#parts.set(part, xml);
    this.#chunks.delete(part);
  }

  parts(): ReadonlyMap<NotePart, string> {
    return this.#parts;
  }
}

/** The text of every note of one part with text, by its identifier: the file read with every revision rejected. */
export function readNoteTexts(xml: string): Map<string, string> {
  const notes = new Map<string, string>();
  const parser = new SaxesParser({ xmlns: true });
  let note: { id: string; lines: string[]; skipped: boolean } | undefined;
  let line: string | undefined;
  let textDepth = 0;
  let insertedDepth = 0;
  parser.on('doctype', () => { throw rejected('DOCTYPE in note XML'); });
  parser.on('processinginstruction', () => { throw rejected('processing instruction in note XML'); });
  parser.on('opentag', (tag) => {
    const attribute = (local: string) => Object.values(tag.attributes).find((entry) => entry.local === local)?.value;
    if (tag.local === 'footnote' || tag.local === 'endnote') {
      const type = attribute('type');
      note = { id: attribute('id') ?? '', lines: [], skipped: type !== undefined && type !== 'normal' };
    } else if (note !== undefined) {
      if (tag.local === 'p') line = '';
      else if (tag.local === 'ins' || tag.local === 'moveTo') insertedDepth += 1;
      else if (tag.local === 't' || tag.local === 'delText') textDepth += 1;
      else if (line !== undefined && insertedDepth === 0 && tag.local === 'tab') line += '\t';
      else if (line !== undefined && insertedDepth === 0 && (tag.local === 'br' || tag.local === 'cr')) line += '\n';
    }
  });
  parser.on('text', (text) => {
    if (line !== undefined && textDepth > 0 && insertedDepth === 0) line += text;
  });
  parser.on('closetag', (tag) => {
    if (note === undefined) return;
    if (tag.local === 't' || tag.local === 'delText') textDepth -= 1;
    else if (tag.local === 'ins' || tag.local === 'moveTo') insertedDepth -= 1;
    else if (tag.local === 'p' && line !== undefined) {
      note.lines.push(line);
      line = undefined;
    } else if (tag.local === 'footnote' || tag.local === 'endnote') {
      const text = normalizeBlockText(note.lines.map(normalizeBlockText).filter((entry) => entry.length > 0).join('\n'));
      if (!note.skipped && note.id.length > 0 && text.length > 0 && !notes.has(note.id)) notes.set(note.id, text);
      note = undefined;
    }
  });
  parser.write(xml).close();
  return notes;
}

/**
 * The note blocks of a parse, in order: each note the body refers to, once, at its first reference, with its number among the
 * blocks of its part. A reference to a note the part does not hold, or holds without text, makes no block.
 */
export function noteBlocks(references: ReadonlyArray<NoteReference>, parts: ReadonlyMap<NotePart, string>):
  Array<{ source: ParsedNoteSource; text: string }> {
  if (references.length === 0) return [];
  const texts = new Map<NotePart, Map<string, string>>();
  for (const [part, xml] of parts) texts.set(part, readNoteTexts(xml));
  const seen = new Set<string>();
  const ordinals: Record<NotePart, number> = { footnote: 0, endnote: 0 };
  const blocks: Array<{ source: ParsedNoteSource; text: string }> = [];
  for (const reference of references) {
    const key = `${reference.part}\u0000${reference.noteId}`;
    const text = texts.get(reference.part)?.get(reference.noteId);
    if (seen.has(key) || text === undefined) continue;
    seen.add(key);
    ordinals[reference.part] += 1;
    blocks.push({ source: { part: reference.part, noteId: reference.noteId, ordinal: ordinals[reference.part], referencePosition: reference.referencePosition }, text });
  }
  return blocks;
}
