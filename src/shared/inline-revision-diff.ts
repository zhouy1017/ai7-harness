import { deriveSpanEdit, graphemesOf } from './mark-anchor.js';

export interface InlineRevisionDiff {
  fromGrapheme: number;
  toGrapheme: number;
  currentFromGrapheme: number;
  beforeText: string;
  afterText: string;
}

/** Grapheme diff, keeping separated edits separate and bounding work for a fully rewritten paragraph. */
export function computeInlineRevisionDiff(baselineText: string, currentText: string): InlineRevisionDiff[] {
  const before = graphemesOf(baselineText), after = graphemesOf(currentText);
  const outer = deriveSpanEdit(before, after);
  if (outer === null) return [];
  const start = outer.fromGrapheme;
  const a = before.slice(start, outer.toGrapheme), b = after.slice(start, start + outer.insertedGraphemes);
  const result: InlineRevisionDiff[] = [];
  const emit = (from: number, to: number, currentFrom: number, currentTo: number): void => {
    if (from === to && currentFrom === currentTo) return;
    result.push({ fromGrapheme: start + from, toGrapheme: start + to, currentFromGrapheme: start + currentFrom,
      beforeText: a.slice(from, to).join(''), afterText: b.slice(currentFrom, currentTo).join('') });
  };
  if (a.length * b.length > 1_000_000) {
    // Hirschberg keeps long, separated changes exact without allocating a quadratic-size matrix.
    const row = (left: string[], right: string[]): Uint32Array => {
      let previous = new Uint32Array(right.length + 1), next = new Uint32Array(right.length + 1);
      for (const value of left) {
        for (let j = 0; j < right.length; j++) next[j + 1] = value === right[j] ? previous[j]! + 1 : Math.max(previous[j + 1]!, next[j]!);
        [previous, next] = [next, previous]; next.fill(0);
      }
      return previous;
    };
    const matches: Array<[number, number]> = [];
    const match = (left: string[], right: string[], x: number, y: number): void => {
      if (left.length === 0 || right.length === 0) return;
      const values = new Set(right);
      if (!left.some((value) => values.has(value))) return;
      if (left.length === 1) { matches.push([x, y + right.indexOf(left[0]!)]); return; }
      const middle = Math.floor(left.length / 2), head = left.slice(0, middle), tail = left.slice(middle);
      const forward = row(head, right), backward = row([...tail].reverse(), [...right].reverse());
      let split = 0, best = -1;
      for (let j = 0; j <= right.length; j++) {
        const length = forward[j]! + backward[right.length - j]!;
        if (length > best) { best = length; split = j; }
      }
      match(head, right.slice(0, split), x, y); match(tail, right.slice(split), x + middle, y + split);
    };
    match(a, b, 0, 0);
    let from = 0, currentFrom = 0;
    for (const [x, y] of matches) { emit(from, x, currentFrom, y); from = x + 1; currentFrom = y + 1; }
    emit(from, a.length, currentFrom, b.length);
    return result;
  }
  const width = b.length + 1;
  const lengths = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i * width + j] = a[i] === b[j] ? lengths[(i + 1) * width + j + 1]! + 1
      : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
  }
  let i = 0, j = 0, from = 0, currentFrom = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      emit(from, i, currentFrom, j); i++; j++; from = i; currentFrom = j;
    } else if (j < b.length && (i === a.length || lengths[i * width + j + 1]! > lengths[(i + 1) * width + j]!)) j++;
    else i++;
  }
  emit(from, i, currentFrom, j);
  return result;
}
