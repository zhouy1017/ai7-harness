/**
 * How an Editorial Mark's range follows the text of the block it is pinned in (Issue #407,
 * V2-UX-MARK-001, the Pinned and Drifted Manuscript Range of `docs/ui-ux-v2/CONTEXT.md`).
 *
 * A mark is pinned to exact text: one block identity, one grapheme range, and the text that range
 * held. Every durable change to a block is one replaced span, so a range that lies wholly before or
 * after that span follows it exactly — it shifts by the span's growth, or does not move — and a range
 * the span touches no longer holds the text it was made on. Nothing here guesses: a touched range
 * becomes `exact` again only where the pinned text stands, whole and alone, inside the text that
 * replaced it, which is what undoing the change produces. Anything else is `drifted`, and the editor
 * is told 原文已变.
 *
 * The service applies this inside the transaction that changes the block; the renderer applies the
 * same arithmetic to text it has not flushed yet, so a mark never sits on the wrong characters while
 * someone types in front of it.
 *
 * One kind of mark is pinned on no text: a 修改建议 whose Apply deleted its words stands on the empty
 * range where they were (Issue #408). `followPoint` follows it; the functions that find pinned text
 * again never find it, because empty text stands everywhere.
 */

export interface GraphemeRange {
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
}

/** One replaced span of a block: `[fromGrapheme, toGrapheme)` gave way to `insertedGraphemes`. */
export interface GraphemeEdit extends GraphemeRange {
  readonly insertedGraphemes: number;
}

export type FollowedAnchorState = 'exact' | 'drifted';

export interface FollowedAnchor extends GraphemeRange {
  readonly state: FollowedAnchorState;
}

/** A range as it was last followed. Only a point pinned on no text needs its state: nothing else can tell it. */
export interface AnchorToFollow extends GraphemeRange {
  readonly state?: FollowedAnchorState;
}

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

export function graphemesOf(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

/** The single span that turns `before` into `after`, or `null` when they are the same text. */
export function deriveSpanEdit(before: ReadonlyArray<string>, after: ReadonlyArray<string>): GraphemeEdit | null {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const removed = before.length - prefix - suffix;
  const inserted = after.length - prefix - suffix;
  if (removed === 0 && inserted === 0) return null;
  return { fromGrapheme: prefix, toGrapheme: prefix + removed, insertedGraphemes: inserted };
}

/**
 * Where a range stands after one span edit, and whether the edit touched it. Text inserted exactly at
 * the range's start lands in front of it and text inserted exactly at its end lands behind it, so
 * neither touches the range; an endpoint inside a replaced span moves to that span's nearer new edge.
 */
export function followSpanEdit(range: GraphemeRange, edit: GraphemeEdit): GraphemeRange & { readonly touched: boolean } {
  const delta = edit.insertedGraphemes - (edit.toGrapheme - edit.fromGrapheme);
  if (edit.toGrapheme <= range.fromGrapheme) {
    return { fromGrapheme: range.fromGrapheme + delta, toGrapheme: range.toGrapheme + delta, touched: false };
  }
  if (edit.fromGrapheme >= range.toGrapheme) return { ...range, touched: false };
  const fromGrapheme = range.fromGrapheme < edit.fromGrapheme ? range.fromGrapheme : edit.fromGrapheme;
  const toGrapheme = range.toGrapheme >= edit.toGrapheme
    ? range.toGrapheme + delta
    : edit.fromGrapheme + edit.insertedGraphemes;
  return { fromGrapheme, toGrapheme: Math.max(fromGrapheme, toGrapheme), touched: true };
}

/**
 * Follow a point that cannot say which side of text written at it it belongs on (Issue #533): a pending insertion whose
 * point already drifted, or any point among several standing at one place. Text written at it or into what it covers
 * joins what it covers, so the editor places the point among those words; text written wholly before it moves it, and
 * text wholly after it leaves it. It is `drifted` from then on, as a point never proves its place again.
 */
export function coverSpanEdit(range: GraphemeRange, edit: GraphemeEdit, length: number): FollowedAnchor {
  const delta = edit.insertedGraphemes - (edit.toGrapheme - edit.fromGrapheme);
  let fromGrapheme: number;
  let toGrapheme: number;
  if (edit.toGrapheme < range.fromGrapheme) {
    fromGrapheme = range.fromGrapheme + delta;
    toGrapheme = range.toGrapheme + delta;
  } else if (edit.fromGrapheme > range.toGrapheme) {
    fromGrapheme = range.fromGrapheme;
    toGrapheme = range.toGrapheme;
  } else {
    fromGrapheme = Math.min(range.fromGrapheme, edit.fromGrapheme);
    toGrapheme = range.toGrapheme >= edit.toGrapheme ? range.toGrapheme + delta : edit.fromGrapheme + edit.insertedGraphemes;
  }
  const from = Math.min(Math.max(0, fromGrapheme), length);
  return { fromGrapheme: from, toGrapheme: Math.min(Math.max(from, toGrapheme), length), state: 'drifted' };
}

function holdsAt(text: ReadonlyArray<string>, pinned: ReadonlyArray<string>, at: number): boolean {
  if (at < 0 || at + pinned.length > text.length) return false;
  for (let index = 0; index < pinned.length; index += 1) {
    if (text[at + index] !== pinned[index]) return false;
  }
  return true;
}

/** A range that no longer holds what it was pinned on, clamped to the block it is in. */
function driftedAt(text: ReadonlyArray<string>, range: GraphemeRange): FollowedAnchor {
  const fromGrapheme = Math.min(Math.max(0, range.fromGrapheme), text.length);
  const toGrapheme = Math.min(Math.max(fromGrapheme, range.toGrapheme), text.length);
  return { fromGrapheme, toGrapheme, state: 'drifted' };
}

/**
 * Resolve a range against the text its block holds now. `exact` when the pinned text stands at the
 * range; otherwise `exact` at the one place inside `within` where the pinned text stands, if there is
 * exactly one; otherwise `drifted`, with the range clamped to the block. Empty pinned text is never
 * found: it would stand at every place, so a point pinned on no text resolves `drifted`.
 */
export function resolvePinnedRange(
  text: ReadonlyArray<string>,
  pinned: ReadonlyArray<string>,
  range: GraphemeRange,
  within: GraphemeRange = { fromGrapheme: 0, toGrapheme: text.length },
): FollowedAnchor {
  if (pinned.length > 0 && range.toGrapheme - range.fromGrapheme === pinned.length && holdsAt(text, pinned, range.fromGrapheme)) {
    return { fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme, state: 'exact' };
  }
  const first = Math.max(0, within.fromGrapheme);
  const last = Math.min(text.length, within.toGrapheme) - pinned.length;
  let found: number | undefined;
  let ambiguous = false;
  for (let at = first; pinned.length > 0 && at <= last; at += 1) {
    if (!holdsAt(text, pinned, at)) continue;
    if (found !== undefined) {
      ambiguous = true;
      break;
    }
    found = at;
  }
  if (found !== undefined && !ambiguous) {
    return { fromGrapheme: found, toGrapheme: found + pinned.length, state: 'exact' };
  }
  return driftedAt(text, range);
}

/**
 * Follow one span edit over grapheme arrays: `after` is the block's text once the span is replaced.
 * A range the span did not touch is still checked against the text, so a segmentation change at the
 * span's edge can never leave a mark claiming characters it was not made on.
 */
export function followGraphemeEdit(
  range: GraphemeRange,
  pinned: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
  edit: GraphemeEdit,
): FollowedAnchor {
  const followed = followSpanEdit(range, edit);
  const replaced = { fromGrapheme: edit.fromGrapheme, toGrapheme: edit.fromGrapheme + edit.insertedGraphemes };
  const within = followed.touched
    ? {
        fromGrapheme: Math.min(followed.fromGrapheme, replaced.fromGrapheme),
        toGrapheme: Math.max(followed.toGrapheme, replaced.toGrapheme),
      }
    : followed;
  return resolvePinnedRange(after, pinned, followed, within);
}

/**
 * Follow a point pinned on no text — where an applied 修改建议 deleted its words — through one span
 * edit, or through none when its block's text did not change. There is nothing at a point to check,
 * so its state is carried rather than found again. It stays `exact` while the edit leaves it alone —
 * an edit wholly in front of it, text inserted exactly at it included, shifts it; one wholly behind it
 * leaves it — and while the graphemes still count as the edit says, since a span whose edge joined a
 * neighbouring grapheme leaves no point where the arithmetic puts it. An edit that takes graphemes
 * from both sides of the point makes it `drifted`, and a point that is drifted, or whose state the
 * caller does not know, is never `exact` again.
 */
export function followPoint(
  anchor: AnchorToFollow,
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
  edit: GraphemeEdit | null,
): FollowedAnchor {
  const followed = edit === null ? { ...anchor, touched: false } : followSpanEdit(anchor, edit);
  const counted = after.length === before.length + (edit === null ? 0 : edit.insertedGraphemes - (edit.toGrapheme - edit.fromGrapheme));
  const holds = anchor.state === 'exact' && !followed.touched && counted &&
    followed.fromGrapheme === followed.toGrapheme && followed.fromGrapheme >= 0 && followed.toGrapheme <= after.length;
  return holds ? { fromGrapheme: followed.fromGrapheme, toGrapheme: followed.toGrapheme, state: 'exact' } : driftedAt(after, followed);
}

/**
 * Follow one change of a block's text. `edit` is the span the caller already knows; without it the
 * span is derived from the two texts. A range pinned on no text is a point, followed with the state
 * the range carries.
 */
export function followBlockTextChange(
  range: AnchorToFollow,
  pinnedText: string,
  beforeText: string,
  afterText: string,
  edit?: GraphemeEdit,
): FollowedAnchor {
  const before = graphemesOf(beforeText);
  const after = graphemesOf(afterText);
  const pinned = graphemesOf(pinnedText);
  const span = edit ?? deriveSpanEdit(before, after);
  if (pinned.length === 0) return followPoint(range, before, after, span);
  if (span === null) return resolvePinnedRange(after, pinned, range, range);
  return followGraphemeEdit(range, pinned, after, span);
}
