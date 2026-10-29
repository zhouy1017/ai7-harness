/**
 * The run mapping of a regenerated DOCX paragraph (Issue #874, F-11).
 *
 * Pure: it reads the source paragraph's reading — its graphemes, the run properties they were written in, the inline
 * containers (hyperlinks and their kin) and the fields around them, as the export walked them — and the block's
 * current graphemes, and says where each piece of that formatting stands in the current text. The writer then
 * re-emits it around the block's own words; the words written are always the block's.
 *
 * The two readings are aligned grapheme by grapheme. A grapheme the alignment keeps keeps its run's properties, its
 * containers and its field. Words the editor wrote in place of others take the properties of the first word they
 * replace, and stay inside a container only when every word they replace stood in it; words inserted between two
 * others extend the run before them, and stay inside a container only when both neighbours stood in it. A field is
 * written whole — instruction and displayed result as the original has them — only when its displayed words are all
 * kept and no mark stands inside them; any other field is written as its current words. What could not be mapped is
 * counted, so the export review names it: a replacement across differently formatted runs, new words across a
 * container's edge, a container left without words, a field whose words changed, and every construct outside the
 * supported set the reading flattened to its words.
 */

/** Graphemes [from, to) of a reading and the run properties they are written in. */
export interface InlineRun {
  from: number;
  to: number;
  properties: string;
}

/** An inline container — a hyperlink, a smart tag, a content control and their kin — around graphemes [from, to). */
export interface InlineContainer {
  from: number;
  to: number;
  open: string;
  close: string;
  /** A hyperlink: the review counts it with the inline styles; any other container is counted only when lost. */
  counted: boolean;
  /** How many containers stand around it: of two around the same words, the shallower is the outer. */
  depth: number;
}

/**
 * A field around graphemes [from, to), and the markup that writes it whole; `from === to` for a field marker that
 * displays nothing here (one half of a field the paragraph does not hold whole, kept where it stood).
 */
export interface InlineField {
  from: number;
  to: number;
  markup: string;
  /** A HYPERLINK field: the review counts it with the inline styles, as the import does. */
  hyperlink: boolean;
  /** The field holds something its markup cannot be written again with (a picture, a note reference): never whole. */
  blocked: boolean;
  /** The depth of the siblings that hold it: a container at that depth or deeper inside its words is part of it. */
  depth: number;
}

/** A source paragraph's reading, as the export walked it. */
export interface SourceInline {
  graphemes: string[];
  runs: InlineRun[];
  containers: InlineContainer[];
  fields: InlineField[];
  /** Constructs outside the supported set whose words the reading flattened. */
  unsupported: number;
  /** Fields whose markers stood where they cannot be kept: written as their words. */
  droppedFields: number;
}

/** Where the marks of the block stand: a comment's ends cut a field; a suggestion's range must not hold one. */
export interface MarkBounds {
  cuts: ReadonlyArray<number>;
  spans: ReadonlyArray<readonly [number, number]>;
}

/** The mapping in the current text's graphemes, and what could not be mapped. */
export interface MappedInline {
  runs: InlineRun[];
  /** Ordered by start, an outer container before the inner one it holds. */
  containers: InlineContainer[];
  /** The fields written whole, and the markers kept at their points, in order. */
  fields: Array<{ from: number; to: number; markup: string }>;
  lost: { styles: number; fields: number; unsupported: number };
}

/** One step of the alignment: graphemes the two readings share, or source graphemes replaced by target graphemes. */
interface AlignedStep {
  equal: boolean;
  source: number;
  sourceLength: number;
  target: number;
  targetLength: number;
}

/** Beyond this many differing graphemes the middle of the paragraph is taken as one replacement. */
const MAX_EDITS = 1024;

/** The diagonals both readings share, by Myers' algorithm, or `null` when they differ by more than `MAX_EDITS`. */
function sharedDiagonals(a: ReadonlyArray<string>, b: ReadonlyArray<string>): Array<[number, number, number]> | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        trace.push(v.slice(offset - d, offset + d + 1));
        return backtrack(trace, n, m);
      }
    }
    trace.push(v.slice(offset - d, offset + d + 1));
  }
  return null;
}

function backtrack(trace: ReadonlyArray<Int32Array>, n: number, m: number): Array<[number, number, number]> {
  const diagonals: Array<[number, number, number]> = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const previous = trace[d - 1]!;
    const at = (k: number): number => previous[k + d - 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const previousK = down ? k + 1 : k - 1;
    const previousX = at(previousK);
    const startX = down ? previousX : previousX + 1;
    if (x > startX) diagonals.push([startX, startX - k, x - startX]);
    x = previousX;
    y = previousX - previousK;
  }
  if (x > 0) diagonals.push([0, 0, x]);
  return diagonals.reverse();
}

/** Align two readings: shared prefix and suffix first, then the shortest edit of the middle. */
function alignGraphemes(source: ReadonlyArray<string>, target: ReadonlyArray<string>): AlignedStep[] {
  let prefix = 0;
  while (prefix < source.length && prefix < target.length && source[prefix] === target[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < source.length - prefix && suffix < target.length - prefix &&
    source[source.length - 1 - suffix] === target[target.length - 1 - suffix]) suffix += 1;
  const middle = sharedDiagonals(source.slice(prefix, source.length - suffix), target.slice(prefix, target.length - suffix)) ?? [];
  const steps: AlignedStep[] = [];
  let s = 0;
  let t = 0;
  const push = (equal: boolean, sourceLength: number, targetLength: number): void => {
    if (sourceLength === 0 && targetLength === 0) return;
    steps.push({ equal, source: s, sourceLength, target: t, targetLength });
    s += sourceLength;
    t += targetLength;
  };
  push(true, prefix, prefix);
  for (const [x, y, length] of middle) {
    push(false, prefix + x - s, prefix + y - t);
    push(true, length, length);
  }
  push(false, source.length - suffix - s, target.length - suffix - t);
  push(true, suffix, suffix);
  return steps;
}

/** The point of the target that a point of the source stands at: inside a replacement, at its start. */
function mapPoint(steps: ReadonlyArray<AlignedStep>, point: number): number {
  for (const step of steps) {
    if (point <= step.source + step.sourceLength) return step.target + (step.equal ? point - step.source : 0);
  }
  return steps.length === 0 ? 0 : steps.at(-1)!.target + steps.at(-1)!.targetLength;
}

/** Map a source paragraph's formatting onto the block's current graphemes. */
export function mapInline(source: SourceInline, target: ReadonlyArray<string>, marks: MarkBounds): MappedInline {
  const steps = alignGraphemes(source.graphemes, target);
  const lost = { styles: 0, fields: source.droppedFields, unsupported: source.unsupported };
  const runAt = (index: number): string => {
    let low = 0;
    let high = source.runs.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const run = source.runs[middle]!;
      if (index < run.from) high = middle - 1;
      else if (index >= run.to) low = middle + 1;
      else return run.properties;
    }
    return source.runs.at(index < 0 ? 0 : -1)?.properties ?? '';
  };
  const properties: string[] = new Array<string>(target.length).fill('');
  const reach = source.containers.map(() => ({ from: Number.POSITIVE_INFINITY, to: Number.NEGATIVE_INFINITY, crossed: false }));
  const touched = source.fields.map(() => false);
  const extend = (index: number, from: number, to: number): void => {
    const span = reach[index]!;
    span.from = Math.min(span.from, from);
    span.to = Math.max(span.to, to);
  };
  for (const step of steps) {
    const end = step.source + step.sourceLength;
    if (step.equal) {
      for (let offset = 0; offset < step.targetLength; offset += 1) properties[step.target + offset] = runAt(step.source + offset);
      source.containers.forEach((container, index) => {
        const from = Math.max(step.source, container.from);
        const to = Math.min(end, container.to);
        if (from < to) extend(index, step.target + from - step.source, step.target + to - step.source);
      });
      continue;
    }
    const replaced = step.sourceLength > 0;
    const base = replaced ? runAt(step.source) : runAt(step.source - 1);
    for (let offset = 0; offset < step.targetLength; offset += 1) properties[step.target + offset] = base;
    if (replaced && step.targetLength > 0) {
      // Words written over differently formatted runs take the first one's properties: the others are not mapped.
      for (const run of source.runs) if (run.from < end && step.source < run.to && run.properties !== base && !plain(run.properties)) lost.styles += 1;
    }
    source.containers.forEach((container, index) => {
      const inside = replaced ? container.from <= step.source && end <= container.to : container.from < step.source && step.source < container.to;
      if (inside) {
        if (step.targetLength > 0) extend(index, step.target, step.target + step.targetLength);
      } else if (replaced && step.targetLength > 0 && container.from < end && step.source < container.to) reach[index]!.crossed = true;
    });
    source.fields.forEach((field, index) => {
      if (replaced ? field.from < end && step.source < field.to : field.from < step.source && step.source < field.to) touched[index] = true;
    });
  }
  const runs: InlineRun[] = [];
  properties.forEach((value, index) => {
    const last = runs.at(-1);
    if (last !== undefined && last.properties === value) last.to = index + 1;
    else runs.push({ from: index, to: index + 1, properties: value });
  });

  const cutInside = (from: number, to: number): boolean => marks.cuts.some((cut) => from < cut && cut < to) ||
    marks.spans.some(([start, stop]) => start === stop ? from < start && start < to : start < to && from < stop);
  // A field inside another one written whole is part of that one's markup: the outer one has the longer markup.
  const within = (inner: InlineField, outer: InlineField): boolean => inner !== outer && inner.from < inner.to && outer.from < outer.to &&
    outer.from <= inner.from && inner.to <= outer.to && (outer.from < inner.from || inner.to < outer.to || outer.markup.length > inner.markup.length);
  const whole: Array<{ from: number; to: number; source: InlineField }> = [];
  source.fields.forEach((field, index) => {
    if (field.from === field.to) {
      const at = mapPoint(steps, field.from);
      whole.push({ from: at, to: at, source: field });
      return;
    }
    // An untouched field's words are all kept, in one run of the alignment: it starts where its first word went.
    const step = steps.find((candidate) => candidate.equal && candidate.source <= field.from && field.from < candidate.source + candidate.sourceLength);
    const from = step === undefined ? -1 : step.target + field.from - step.source;
    if (step !== undefined && !touched[index] && !field.blocked && !cutInside(from, from + field.to - field.from)) {
      whole.push({ from, to: from + field.to - field.from, source: field });
    }
  });
  const fields = whole.filter((field) => !whole.some((other) => within(field.source, other.source)));
  for (const field of source.fields) {
    if (field.from === field.to || whole.some((kept) => kept.source === field || within(field, kept.source))) continue;
    if (field.hyperlink) lost.styles += 1;
    else lost.fields += 1;
  }
  const containers: InlineContainer[] = [];
  source.containers.forEach((container, index) => {
    const span = reach[index]!;
    if (container.from === container.to || span.crossed) {
      if (container.counted) lost.styles += 1;
      else lost.unsupported += 1;
    }
    if (span.from >= span.to) return;
    // A container inside a field written whole is written with that field.
    if (fields.some(({ source: field }) => field.from < field.to && field.from <= container.from && container.to <= field.to && container.depth >= field.depth)) return;
    containers.push({ ...container, from: span.from, to: span.to });
  });
  containers.sort((left, right) => left.from - right.from || right.to - left.to || left.depth - right.depth);
  return { runs, containers, fields: fields.map(({ from, to, source: field }) => ({ from, to, markup: field.markup })), lost };
}

/** Run properties that set nothing: an empty element left once its revision markup is gone. */
function plain(properties: string): boolean {
  return properties === '' || /^<(?:[\w.-]+:)?rPr\/>$/u.test(properties);
}
