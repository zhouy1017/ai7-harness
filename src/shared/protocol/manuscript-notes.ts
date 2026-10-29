/**
 * The kinds a manuscript block takes (protocol 182; Issue #1204, ADR 0096 §1). A `note` block carries one footnote or endnote
 * of the imported file: the native DOCX reading appends the notes after the last body paragraph, in the order the body first
 * refers to them, so every body block keeps the identity it had before notes became blocks.
 */
export type ManuscriptBlockKind = 'title' | 'heading' | 'paragraph' | 'note';

/**
 * What a note block says about itself (Issue #1204): which part of the file it belongs to, its number there, and the paragraph
 * that refers to it — 「脚注 n · 引自第 X 段」. `referencePosition` is that paragraph's place in the working manuscript, or null
 * when the paragraph no longer stands in it or the note was referred to before any paragraph with text.
 */
export interface ManuscriptNoteProjection {
  part: 'footnote' | 'endnote';
  ordinal: number;
  referenceBlockId: string | null;
  referencePosition: number | null;
}

export interface ManuscriptBlockProjection {
  blockId: string;
  position: number;
  kind: ManuscriptBlockKind;
  level: number | null;
  text: string;
  digest: string;
  /** Present on a note block of the live window only. */
  note?: ManuscriptNoteProjection;
}
