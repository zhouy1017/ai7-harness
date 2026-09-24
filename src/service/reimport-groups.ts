/**
 * The chapter-level Reimport Comparison (Issue #412, plan slice S63; V2-UX-IMP-041, IMP-057): the block mappings of
 * one comparison gathered into the rows an editor resolves. Blocks that match exactly and stay in order are the
 * anchors; every run of changed blocks between two anchors is one group — what the new file did there, from the
 * current revision's paragraphs to the new file's. A group is resolved by one of four verbs, never preselected:
 *
 * - `rewrite` 改写与新增 — the new paragraphs are what these became: identities carry over in order, the rest are new;
 * - `split`   拆分 — one paragraph became several (identity carries to the first);
 * - `merge`   并入 — several became one (the first's identity carries);
 * - `delete`  删除 — these are gone, and any new paragraphs there are new.
 *
 * Exact paragraphs never form a row, so a chapter that did not change maps by itself. With headings, a group names
 * the chapter it stands in; without them — the admitted SampleBooks read without — it is named by its paragraphs.
 * The module is pure: the same mappings always give the same groups.
 */

export type ReimportGroupVerb = 'rewrite' | 'split' | 'merge' | 'delete';
export const REIMPORT_GROUP_VERBS: ReadonlyArray<ReimportGroupVerb> = ['split', 'rewrite', 'delete', 'merge'];

export type ReimportChangeKind = 'unchanged' | 'move' | 'edit' | 'insert' | 'delete';

/** One mapping as the grouping reads it. */
export interface ReimportGroupingMapping {
  mappingId: string;
  changeKind: ReimportChangeKind;
  /** The block's 1-based position in the checkpoint revision; `null` for an inserted block. */
  currentPosition: number | null;
  /** The block's 1-based position in the new file; `null` for a deleted block. */
  stagedPosition: number | null;
}

/** A heading of the checkpoint revision, by position, for naming the chapter a group stands in. */
export interface ReimportHeading {
  position: number;
  kind: 'title' | 'heading';
  level: number | null;
  text: string;
}

export interface ReimportGroup {
  ordinal: number;
  /** The mappings on the current revision's side (edit rows and delete rows), in current order. */
  currentMembers: ReadonlyArray<string>;
  /** The mappings on the new file's side (edit rows and insert rows), in the new file's order. */
  stagedMembers: ReadonlyArray<string>;
  currentFrom: number | null;
  currentTo: number | null;
  stagedFrom: number | null;
  stagedTo: number | null;
  /** The heading the group's first current paragraph stands under; `null` without one. */
  chapterLabel: string | null;
}

/** The verbs a group's shape admits: 改写与新增 needs new paragraphs, 删除 current ones, 拆分 one-to-many, 并入 many-to-one. */
export function reimportGroupVerbs(currentCount: number, stagedCount: number): ReimportGroupVerb[] {
  const verbs: ReimportGroupVerb[] = [];
  if (currentCount === 1 && stagedCount > 1) verbs.push('split');
  if (stagedCount > 0) verbs.push('rewrite');
  if (currentCount > 0) verbs.push('delete');
  if (currentCount > 1 && stagedCount === 1) verbs.push('merge');
  return verbs;
}

/**
 * The anchors: exact mappings kept in the same order on both sides — the longest run of unchanged and moved blocks
 * whose current positions rise as their new positions do. A moved block outside that run keeps its identity but is
 * no anchor, so it neither splits nor joins a group.
 */
function anchorsOf(mappings: ReadonlyArray<ReimportGroupingMapping>): ReimportGroupingMapping[] {
  const exact = mappings
    .filter((mapping) => (mapping.changeKind === 'unchanged' || mapping.changeKind === 'move') &&
      mapping.currentPosition !== null && mapping.stagedPosition !== null)
    .sort((left, right) => left.stagedPosition! - right.stagedPosition!);
  // Longest strictly increasing run of current positions, by patience sorting with predecessor links.
  const tails: number[] = [];
  const previous = new Array<number>(exact.length).fill(-1);
  for (let index = 0; index < exact.length; index += 1) {
    const value = exact[index]!.currentPosition!;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (exact[tails[middle]!]!.currentPosition! < value) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tails[low - 1]!;
    tails[low] = index;
  }
  const chain: ReimportGroupingMapping[] = [];
  for (let index = tails.length === 0 ? -1 : tails[tails.length - 1]!; index !== -1; index = previous[index]!) chain.push(exact[index]!);
  return chain.reverse();
}

function chapterOf(position: number | null, headings: ReadonlyArray<ReimportHeading>): string | null {
  if (position === null) return null;
  let found: ReimportHeading | null = null;
  for (const heading of headings) {
    if (heading.position > position) break;
    found = heading;
  }
  return found === null ? null : found.text;
}

/**
 * Gather the changed mappings into groups between consecutive anchors. An edited block stands on both sides; an
 * inserted one on the new file's; a deleted one on the current revision's, placed between the anchors around its
 * current position.
 */
export function groupReimportMappings(
  mappings: ReadonlyArray<ReimportGroupingMapping>,
  headings: ReadonlyArray<ReimportHeading> = [],
): ReimportGroup[] {
  const anchors = anchorsOf(mappings);
  // Gap k lies after anchor k-1 and before anchor k (gap 0 before the first, gap N after the last).
  const stagedGap = (position: number): number => {
    let low = 0;
    let high = anchors.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (anchors[middle]!.stagedPosition! < position) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const currentGap = (position: number): number => {
    let low = 0;
    let high = anchors.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (anchors[middle]!.currentPosition! < position) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const gaps = new Map<number, { current: ReimportGroupingMapping[]; staged: ReimportGroupingMapping[] }>();
  const gap = (index: number) => {
    let entry = gaps.get(index);
    if (entry === undefined) {
      entry = { current: [], staged: [] };
      gaps.set(index, entry);
    }
    return entry;
  };
  for (const mapping of mappings) {
    if (mapping.changeKind === 'edit') {
      const entry = gap(stagedGap(mapping.stagedPosition!));
      entry.staged.push(mapping);
      entry.current.push(mapping);
    } else if (mapping.changeKind === 'insert') {
      gap(stagedGap(mapping.stagedPosition!)).staged.push(mapping);
    } else if (mapping.changeKind === 'delete') {
      gap(currentGap(mapping.currentPosition!)).current.push(mapping);
    }
  }
  const sortedHeadings = [...headings].sort((left, right) => left.position - right.position);
  const groups: ReimportGroup[] = [];
  for (const index of [...gaps.keys()].sort((left, right) => left - right)) {
    const entry = gaps.get(index)!;
    const current = [...entry.current].sort((left, right) => left.currentPosition! - right.currentPosition!);
    const staged = [...entry.staged].sort((left, right) => left.stagedPosition! - right.stagedPosition!);
    const currentPositions = current.map((mapping) => mapping.currentPosition!);
    const stagedPositions = staged.map((mapping) => mapping.stagedPosition!);
    groups.push({
      ordinal: groups.length + 1,
      currentMembers: current.map((mapping) => mapping.mappingId),
      stagedMembers: staged.map((mapping) => mapping.mappingId),
      currentFrom: currentPositions.length === 0 ? null : Math.min(...currentPositions),
      currentTo: currentPositions.length === 0 ? null : Math.max(...currentPositions),
      stagedFrom: stagedPositions.length === 0 ? null : Math.min(...stagedPositions),
      stagedTo: stagedPositions.length === 0 ? null : Math.max(...stagedPositions),
      chapterLabel: chapterOf(currentPositions.length === 0 ? (index === 0 ? null : anchors[index - 1]!.currentPosition) : Math.min(...currentPositions), sortedHeadings),
    });
  }
  return groups;
}

/**
 * The identity each changed mapping takes under a group's verb (the per-mapping resolutions the commit reads):
 * an edit row keeps its own identity; an insert row claims the group's delete rows in order; what is left is new
 * or retired. 删除 retires every current identity and makes every new paragraph new.
 */
export function reimportGroupResolutions(
  verb: ReimportGroupVerb,
  current: ReadonlyArray<{ mappingId: string; changeKind: ReimportChangeKind; currentBlockId: string | null }>,
  staged: ReadonlyArray<{ mappingId: string; changeKind: ReimportChangeKind; currentBlockId: string | null }>,
): Array<{ mappingId: string; resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity'; currentBlockId: string | null }> {
  const resolutions: Array<{ mappingId: string; resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity'; currentBlockId: string | null }> = [];
  const deletes = current.filter((mapping) => mapping.changeKind === 'delete');
  if (verb === 'delete') {
    for (const mapping of staged) resolutions.push({ mappingId: mapping.mappingId, resolution: 'create-new-identity', currentBlockId: null });
    for (const mapping of deletes) resolutions.push({ mappingId: mapping.mappingId, resolution: 'retire-current-identity', currentBlockId: null });
    return resolutions;
  }
  let claimed = 0;
  for (const mapping of staged) {
    if (mapping.changeKind === 'edit') {
      resolutions.push({ mappingId: mapping.mappingId, resolution: 'preserve-current-identity', currentBlockId: mapping.currentBlockId });
    } else if (claimed < deletes.length) {
      resolutions.push({ mappingId: mapping.mappingId, resolution: 'preserve-current-identity', currentBlockId: deletes[claimed]!.currentBlockId });
      claimed += 1;
    } else {
      resolutions.push({ mappingId: mapping.mappingId, resolution: 'create-new-identity', currentBlockId: null });
    }
  }
  // A delete row whose identity an insert claimed resolves with it; the rest retire.
  for (const mapping of deletes.slice(claimed)) resolutions.push({ mappingId: mapping.mappingId, resolution: 'retire-current-identity', currentBlockId: null });
  return resolutions;
}
