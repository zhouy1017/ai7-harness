/**
 * Semantic fragments of an Interactive Answer Stream (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-006, 007, 012):
 * the answer appears by complete short sentence, never by token and never with a broken tail.
 *
 * A fragment ends at a sentence's end — 。！？；…, `!` `?` `;`, or `.` before a space — with every closing mark and further
 * end mark that follows it (`。」`, `？！`, `……`), or at a line break, which also ends a list item or a table row. What
 * follows the last complete fragment is the tail, shown only once the answer settles.
 *
 * While the answer streams, an end mark that is the last character received does not yet close its fragment: a closing
 * quotation mark, another end mark, or a line break may still follow, and the fragment would then be told differently.
 * So a fragment once given is never taken back or changed — what the editor read stays — which is the property the unit
 * suite holds the splitter to: the fragments of any prefix of an answer are a prefix of the fragments of the answer.
 *
 * Three readings of the same text:
 * - `streaming`: the answer is still arriving; only fragments nothing more can change.
 * - `cut`: the answer stopped or was interrupted (DIALOG-012); an end mark at the very end closes its fragment, and an
 *   unfinished tail is discarded.
 * - `settled`: the answer completed; the tail, if any, is the last fragment.
 */
export type FragmentReading = 'streaming' | 'cut' | 'settled';

export interface DialogueFragment {
  readonly text: string;
  /** A line break follows: the next fragment starts a new paragraph, list item or row. */
  readonly breakAfter: boolean;
}

const END_MARKS = new Set(['。', '！', '？', '；', '…', '!', '?', ';', '．', '｡']);
const CLOSING_MARKS = new Set(['”', '’', '」', '』', '）', ')', '】', '》', '〉', '"', '\'', '］', ']', '｝', '}']);
const SPACES = new Set([' ', '\t', '　', '\r']);

function isSpace(character: string | undefined): boolean {
  return character !== undefined && (SPACES.has(character) || character === '\n');
}

export function splitFragments(text: string, reading: FragmentReading): DialogueFragment[] {
  const characters = [...text];
  const fragments: DialogueFragment[] = [];
  const push = (from: number, to: number, breakAfter: boolean): void => {
    const piece = characters.slice(from, to).join('').trim();
    if (piece.length > 0) fragments.push({ text: piece, breakAfter });
  };
  let start = 0;
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    if (character === '\n') {
      push(start, index, true);
      index += 1;
      start = index;
      continue;
    }
    // `.` ends a sentence only before a space or a line break: `3.5` and `a.b` do not.
    const asciiStop = character === '.';
    if (!END_MARKS.has(character) && !asciiStop) {
      index += 1;
      continue;
    }
    if (asciiStop && characters[index + 1] !== undefined && !isSpace(characters[index + 1])) {
      index += 1;
      continue;
    }
    // The end mark with every closing mark and further end mark after it.
    let end = index + 1;
    while (end < characters.length && (END_MARKS.has(characters[end]!) || CLOSING_MARKS.has(characters[end]!))) end += 1;
    // Spaces after it decide nothing yet: a line break may follow them.
    let after = end;
    while (after < characters.length && SPACES.has(characters[after]!)) after += 1;
    if (after === characters.length && reading === 'streaming') break;
    push(start, end, characters[after] === '\n');
    // The spaces and the line break after it are read on as an empty piece.
    index = end;
    start = index;
  }
  if (reading === 'settled') push(start, characters.length, false);
  return fragments;
}

/** The fragments read back as prose: each paragraph's fragments run on, and a line break follows where one stood. */
export function fragmentsText(fragments: ReadonlyArray<DialogueFragment>): string {
  return fragments.map((fragment, index) => fragment.text + (fragment.breakAfter && index < fragments.length - 1 ? '\n' : '')).join('');
}
