import { graphemesOf } from './mark-anchor.js';

/**
 * The units a Three-way Proposal Conflict is compared and resolved in (Issue #57, plan slice S22; ADR
 * 0085; V2-UX-CONFLICT-004, CONFLICT-006 to CONFLICT-010).
 *
 * A 修改建议 in conflict has three texts: 提案基准, the words it was made on; 当前权威稿件, what its range holds
 * now; and 提议内容, what it would write. They are cut into Chinese phrases — a phrase ends after a
 * sentence or clause mark, a closing quotation mark or bracket, or a line break, and a run of such marks
 * stays with the words before it — so a quick action takes a meaningful piece rather than a character
 * (CONFLICT-007). Every cut falls between two graphemes, so the pieces of a text join back into exactly
 * that text: nothing is normalized, and no emoji, surrogate pair or combining sequence is ever split.
 *
 * The comparison is a three-way diff over those phrases: each of the two later texts is compared with the
 * base, and their changes are grouped where the base phrases they change overlap. A group is one unit:
 * changed only in the current manuscript (`current-only`), only in the proposal (`proposed-only`),
 * identically in both (`both-same`), or differently in both (`conflict`); the phrases no change touched
 * are `same`. A short suggestion whose own words were edited is one `conflict` unit.
 *
 * The service and the renderer read the same units from the same three texts, because both run this
 * module; nothing here decides anything — a unit's resolution is the editor's, recorded in a Resolution
 * Draft that only a new Proposal version can carry further.
 */

export type ConflictUnitKind = 'same' | 'current-only' | 'proposed-only' | 'both-same' | 'conflict';

export interface ConflictUnit {
  readonly kind: ConflictUnitKind;
  /** The unit's words in 提案基准. */
  readonly base: string;
  /** The unit's words in 当前权威稿件. */
  readonly current: string;
  /** The unit's words in 提议内容. */
  readonly proposed: string;
}

/**
 * How the editor resolved one changed unit in the Resolution Draft (V2-UX-CONFLICT-006, CONFLICT-009):
 * 采用当前内容, 采用提议内容, 两者都保留 in the order chosen, or 编辑合并结果 with the editor's own words.
 */
export type ConflictResolution =
  | 'unresolved'
  | 'current'
  | 'proposed'
  | 'both-current-first'
  | 'both-proposed-first'
  | 'edited';

export const CONFLICT_RESOLUTIONS: ReadonlyArray<ConflictResolution> = [
  'unresolved', 'current', 'proposed', 'both-current-first', 'both-proposed-first', 'edited',
];

/**
 * One unit's place in a Resolution Draft. A `same` unit has nothing to resolve and carries `null`; every
 * other unit carries its resolution, and `text` holds the editor's words exactly when it is `edited`.
 */
export interface ConflictUnitResolution {
  readonly resolution: ConflictResolution | null;
  readonly text: string | null;
}

const CLOSING_MARKS = '」』”’）》】';
const PHRASE_MARKS = '。！？；：，、…—．.!?;:,';
const BREAKS: ReadonlySet<string> = new Set([...PHRASE_MARKS, ...CLOSING_MARKS]);

function endsPhrase(grapheme: string): boolean {
  return BREAKS.has(grapheme) || grapheme.includes('\n');
}

/**
 * A text cut into phrases. A phrase ends after a mark of `PHRASE_MARKS`, a closing mark of
 * `CLOSING_MARKS` or a line break; consecutive marks — `。”`, `……`, `——` — end one phrase together, so
 * a mark always stays with the words it closes. The phrases join back into exactly `text`.
 */
export function segmentPhrases(text: string): string[] {
  const graphemes = graphemesOf(text);
  const phrases: string[] = [];
  let phrase = '';
  for (let index = 0; index < graphemes.length; index += 1) {
    const grapheme = graphemes[index]!;
    phrase += grapheme;
    const next = graphemes[index + 1];
    if (endsPhrase(grapheme) && (next === undefined || !endsPhrase(next))) {
      phrases.push(phrase);
      phrase = '';
    }
  }
  if (phrase.length > 0) phrases.push(phrase);
  return phrases;
}

/**
 * For each phrase of `base`, the phrase of `other` a longest common subsequence pairs it with, or -1.
 * The pairs are strictly increasing on both sides. The common head and tail are paired first, so the
 * table is built only over the part between them; ties are broken the same way every time.
 */
function pairWith(base: ReadonlyArray<string>, other: ReadonlyArray<string>): Int32Array {
  const pairs = new Int32Array(base.length).fill(-1);
  let head = 0;
  while (head < base.length && head < other.length && base[head] === other[head]) {
    pairs[head] = head;
    head += 1;
  }
  let tail = 0;
  while (
    tail < base.length - head && tail < other.length - head &&
    base[base.length - 1 - tail] === other[other.length - 1 - tail]
  ) {
    pairs[base.length - 1 - tail] = other.length - 1 - tail;
    tail += 1;
  }
  const rows = base.length - head - tail;
  const columns = other.length - head - tail;
  if (rows === 0 || columns === 0) return pairs;
  // lengths[r * (columns + 1) + c]: the longest common subsequence of base[head + r..] and other[head + c..].
  const width = columns + 1;
  const lengths = new Uint16Array((rows + 1) * width);
  for (let r = rows - 1; r >= 0; r -= 1) {
    for (let c = columns - 1; c >= 0; c -= 1) {
      lengths[r * width + c] = base[head + r] === other[head + c]
        ? lengths[(r + 1) * width + c + 1]! + 1
        : Math.max(lengths[(r + 1) * width + c]!, lengths[r * width + c + 1]!);
    }
  }
  let r = 0;
  let c = 0;
  while (r < rows && c < columns) {
    if (base[head + r] === other[head + c] && lengths[r * width + c] === lengths[(r + 1) * width + c + 1]! + 1) {
      pairs[head + r] = head + c;
      r += 1;
      c += 1;
    } else if (lengths[(r + 1) * width + c]! >= lengths[r * width + c + 1]!) {
      r += 1;
    } else {
      c += 1;
    }
  }
  return pairs;
}

/** One change of one side against the base: base phrases `[from, to)` gave way to that side's `[otherFrom, otherTo)`. */
interface Hunk {
  readonly side: 'current' | 'proposed';
  readonly from: number;
  readonly to: number;
  readonly otherFrom: number;
  readonly otherTo: number;
}

/** The changes that turn `base` into the side whose pairs these are, in order; between them every phrase is paired. */
function hunksOf(side: Hunk['side'], pairs: Int32Array, baseLength: number, otherLength: number): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  while (i < baseLength || j < otherLength) {
    if (i < baseLength && pairs[i] === j) {
      i += 1;
      j += 1;
      continue;
    }
    let to = i;
    while (to < baseLength && pairs[to] === -1) to += 1;
    const otherTo = to < baseLength ? pairs[to]! : otherLength;
    hunks.push({ side, from: i, to, otherFrom: j, otherTo });
    i = to;
    j = otherTo;
  }
  return hunks;
}

/**
 * The changes of both sides grouped where their base spans overlap. Two changes overlap when one starts
 * inside the other, or when both insert at the same place — there the order between them is unknown.
 * Changes that only touch — one ends where the other starts, or one inserts where the other's span begins
 * or ends — keep their order and stay apart.
 */
function groupHunks(hunks: ReadonlyArray<Hunk>): Array<{ from: number; to: number; hunks: Hunk[] }> {
  const sorted = [...hunks].sort((left, right) => left.from - right.from || left.to - right.to);
  const groups: Array<{ from: number; to: number; hunks: Hunk[] }> = [];
  for (const hunk of sorted) {
    const group = groups.at(-1);
    const overlaps = group !== undefined && (
      hunk.from < group.to ||
      (hunk.from === hunk.to && group.from === group.to && hunk.from === group.from)
    );
    if (overlaps) {
      group.to = Math.max(group.to, hunk.to);
      group.hunks.push(hunk);
    } else {
      groups.push({ from: hunk.from, to: hunk.to, hunks: [hunk] });
    }
  }
  return groups;
}

function samePhrases(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((phrase, index) => phrase === right[index]);
}

function classify(base: ReadonlyArray<string>, current: ReadonlyArray<string>, proposed: ReadonlyArray<string>): ConflictUnitKind {
  const currentKept = samePhrases(current, base);
  const proposedKept = samePhrases(proposed, base);
  if (currentKept && proposedKept) return 'same';
  if (currentKept) return 'proposed-only';
  if (proposedKept) return 'current-only';
  return samePhrases(current, proposed) ? 'both-same' : 'conflict';
}

/**
 * The three-way comparison of 提案基准 `base`, 当前权威稿件 `current` and 提议内容 `proposed`, in reading
 * order. Each side is compared with the base phrase by phrase (a longest common subsequence); the
 * changes of the two sides are grouped where their base spans overlap, and each group is one unit whose
 * kind says which side changed it. Every phrase outside the groups is shared by all three texts, and
 * consecutive shared phrases are one `same` unit. The units' words join back into each text.
 */
export function conflictUnits(base: string, current: string, proposed: string): ConflictUnit[] {
  const b = segmentPhrases(base);
  const c = segmentPhrases(current);
  const p = segmentPhrases(proposed);
  const groups = groupHunks([
    ...hunksOf('current', pairWith(b, c), b.length, c.length),
    ...hunksOf('proposed', pairWith(b, p), b.length, p.length),
  ]);
  const units: ConflictUnit[] = [];
  const push = (kind: ConflictUnitKind, baseWords: string, currentWords: string, proposedWords: string): void => {
    const last = units.at(-1);
    if (kind === 'same' && last?.kind === 'same') {
      units[units.length - 1] = { kind, base: last.base + baseWords, current: last.current + currentWords, proposed: last.proposed + proposedWords };
      return;
    }
    units.push({ kind, base: baseWords, current: currentWords, proposed: proposedWords });
  };
  // Where a group's words end on one side: after that side's last change in the group and the paired
  // phrases that follow it inside the group, or — when the side did not change the group — after the
  // group's own base phrases, which that side holds unchanged.
  const endOf = (group: { from: number; to: number; hunks: Hunk[] }, side: Hunk['side'], start: number): number => {
    const own = group.hunks.filter((hunk) => hunk.side === side);
    if (own.length === 0) return start + (group.to - group.from);
    const last = own.reduce((latest, hunk) => (hunk.otherTo > latest.otherTo ? hunk : latest));
    return last.otherTo + (group.to - last.to);
  };
  let i = 0;
  let j = 0;
  let k = 0;
  const shareUntil = (end: number): void => {
    for (; i < end; i += 1, j += 1, k += 1) push('same', b[i]!, c[j]!, p[k]!);
  };
  for (const group of groups) {
    shareUntil(group.from);
    const currentEnd = endOf(group, 'current', j);
    const proposedEnd = endOf(group, 'proposed', k);
    const baseWords = b.slice(group.from, group.to);
    const currentWords = c.slice(j, currentEnd);
    const proposedWords = p.slice(k, proposedEnd);
    push(classify(baseWords, currentWords, proposedWords), baseWords.join(''), currentWords.join(''), proposedWords.join(''));
    i = group.to;
    j = currentEnd;
    k = proposedEnd;
  }
  shareUntil(b.length);
  return units;
}

export function isChangeUnit(unit: Pick<ConflictUnit, 'kind'>): boolean {
  return unit.kind !== 'same';
}

/** Where a Resolution Draft starts: nothing resolved, and nothing preselected (V2-UX-CONFLICT-005). */
export function initialResolutions(units: ReadonlyArray<ConflictUnit>): ConflictUnitResolution[] {
  return units.map((unit) => ({ resolution: isChangeUnit(unit) ? 'unresolved' : null, text: null }));
}

/**
 * Whether `resolutions` is a draft of exactly these units: one entry per unit, `null` exactly for a
 * `same` unit, and the editor's words exactly for an `edited` one.
 */
export function resolutionsFit(units: ReadonlyArray<ConflictUnit>, resolutions: ReadonlyArray<ConflictUnitResolution>): boolean {
  return resolutions.length === units.length && units.every((unit, index) => {
    const entry = resolutions[index]!;
    if (!isChangeUnit(unit)) return entry.resolution === null && entry.text === null;
    if (entry.resolution === null || !CONFLICT_RESOLUTIONS.includes(entry.resolution)) return false;
    return entry.resolution === 'edited'
      ? typeof entry.text === 'string' && entry.text.isWellFormed()
      : entry.text === null;
  });
}

/**
 * The words one unit contributes to the draft. A `same` unit is its own words; an unresolved unit is
 * still what the current manuscript holds, because a Resolution Draft starts as the current text and
 * only the editor's resolutions change it.
 */
export function resolvedUnitText(unit: ConflictUnit, entry: ConflictUnitResolution): string {
  switch (entry.resolution) {
    case null:
    case 'unresolved':
    case 'current':
      return unit.current;
    case 'proposed':
      return unit.proposed;
    case 'both-current-first':
      return unit.current + unit.proposed;
    case 'both-proposed-first':
      return unit.proposed + unit.current;
    case 'edited':
      return entry.text ?? '';
  }
}

/** The Resolution Draft's text: every unit's words, in order. */
export function draftText(units: ReadonlyArray<ConflictUnit>, resolutions: ReadonlyArray<ConflictUnitResolution>): string {
  return units.map((unit, index) => resolvedUnitText(unit, resolutions[index] ?? { resolution: null, text: null })).join('');
}

/** The indices of the changed units the editor has not resolved yet, in reading order. */
export function unresolvedUnits(units: ReadonlyArray<ConflictUnit>, resolutions: ReadonlyArray<ConflictUnitResolution>): number[] {
  return units.flatMap((unit, index) => isChangeUnit(unit) && (resolutions[index]?.resolution ?? 'unresolved') === 'unresolved' ? [index] : []);
}

/**
 * 将全部无冲突更改加入解决草稿 (V2-UX-CONFLICT-010): every unresolved unit that only one side changed, or
 * both changed alike, takes its changed side. A `conflict` unit is never touched, and neither is a unit
 * the editor already resolved: the answer says how many were included and how many conflicts remain.
 */
export function includeNonConflictingChanges(
  units: ReadonlyArray<ConflictUnit>,
  resolutions: ReadonlyArray<ConflictUnitResolution>,
): { resolutions: ConflictUnitResolution[]; included: number; conflictsLeft: number } {
  let included = 0;
  const next = units.map((unit, index): ConflictUnitResolution => {
    const entry = resolutions[index] ?? { resolution: null, text: null };
    if (entry.resolution !== 'unresolved') return entry;
    if (unit.kind === 'current-only' || unit.kind === 'both-same') {
      included += 1;
      return { resolution: 'current', text: null };
    }
    if (unit.kind === 'proposed-only') {
      included += 1;
      return { resolution: 'proposed', text: null };
    }
    return entry;
  });
  const conflictsLeft = units.filter((unit, index) => unit.kind === 'conflict' && next[index]!.resolution === 'unresolved').length;
  return { resolutions: next, included, conflictsLeft };
}

/** Whether 将全部无冲突更改加入解决草稿 has anything to include (it is offered only then). */
export function hasNonConflictingChanges(units: ReadonlyArray<ConflictUnit>, resolutions: ReadonlyArray<ConflictUnitResolution>): boolean {
  return units.some((unit, index) => (unit.kind === 'current-only' || unit.kind === 'proposed-only' || unit.kind === 'both-same') &&
    resolutions[index]?.resolution === 'unresolved');
}
