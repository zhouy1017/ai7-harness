import type { CoverageManifestProjection } from '../../shared/protocol.js';
import { unitContentKeys } from './coverage-manifest.js';

/**
 * What changed since the category last read it, per unit (Issue #709). A range Run — 选章 or 当前选区 — leaves every unit
 * outside its range unreviewed: the unit an edit outside the chosen chapters changed as well as the chapter nobody has
 * asked about yet. Measured from the latest revision alone, the first would read as unchanged; so `changed` is measured
 * per unit from the latest revision that *read* it, by walking the category's revision chain back from the latest.
 *
 * One walk is the single fact both sides read: the scope plan of 只审改动过的章 (and so its gate) reads the changed units
 * again, and the coverage matrix reads 需复审 for exactly those units, counting the blocks that make them changed. The
 * walk is pure over the revisions it is handed, which are immutable once written, so a ledger may keep its result per
 * latest revision and preparation and execution derive the same answer.
 */

/** How one revision left one of its units. */
export type ChainUnitState = 'closed' | 'out-of-scope' | 'failed';

/** One revision of the chain, as the walk reads it. */
export interface ChainRevision {
  readonly revisionId: string;
  readonly ordinal: number;
  /** The frozen category contract its units were read under: contract version and schema digest. */
  readonly contract: string;
  readonly manifest: CoverageManifestProjection;
  /** Every unit of its manifest, by ordinal. */
  readonly units: ReadonlyMap<number, ChainUnitState>;
}

/** The revision a revision followed: `null` at the chain's first Run, `'unreadable'` when its record cannot be read. */
export type ChainPredecessor = ChainRevision | null | 'unreadable';

/** Why a walk stopped before the chain's first Run; `null` when it reached it, or had nothing to look for. */
export type UnreadWalkCut = 'unreadable' | 'out-of-order' | 'bounded' | null;

export interface UnreadWalk {
  /** The latest revision's unreviewed units that changed since the category last read them, each with the revision it is measured from. */
  readonly changed: ReadonlyMap<number, ChainRevision>;
  /**
   * The blocks that make those units changed, by identity: changed or added since the revision each is measured from,
   * removed from the unit's place, or reordered within it — with the unit's overlap context. Never empty while
   * `changed` is not, so a row that reads 需复审 always counts at least one block.
   */
  readonly blockIds: ReadonlySet<string>;
  /**
   * Where the walk stopped short (P3-3): an earlier revision whose record cannot be read, one out of order, or a chain
   * longer than the bound. What the walk had not settled by then is treated as never read — left as it is, never
   * claimed changed — and the cut is disclosed.
   */
  readonly cut: UnreadWalkCut;
}

/** The most earlier revisions one walk reads. */
export const UNREAD_WALK_BOUND = 512;

/**
 * Walk back from `latest` for each unit it left `out-of-scope`, by content key:
 * - an earlier revision that closed that very content under the latest revision's contract read it: it has not changed
 *   since, and is left as it is;
 * - one that left that content out of scope, failed it, or closed it under another contract did not read it (the
 *   Commander's ruling on #711): the walk goes on past it;
 * - one that does not hold that content at all is the latest revision whose reading the unit changed since — whether that
 *   revision read the unit's place, or left it unread too and the words arrived later (an edited chapter no Run has read
 *   is flagged and read, as 只审改动过的章 always read an edit in a never-read chapter);
 * - reaching the chain's first Run, the content was there, unread, from the start: never read, left as it is.
 * Matching is by content key across the whole revision, as the scope plan's own carry is (#711 review P3-1, a known limit).
 */
export function walkUnreadChanges(latest: ChainRevision, predecessorOf: (revision: ChainRevision) => ChainPredecessor, bound: number = UNREAD_WALK_BOUND): UnreadWalk {
  const keys = unitContentKeys(latest.manifest);
  const pending = new Map<string, number[]>();
  latest.manifest.units.forEach((unit, index) => {
    if (latest.units.get(unit.ordinal) === 'out-of-scope') pending.set(keys[index]!, [...(pending.get(keys[index]!) ?? []), unit.ordinal]);
  });
  const changed = new Map<number, ChainRevision>();
  let cut: UnreadWalkCut = null;
  let current = latest;
  let steps = 0;
  while (pending.size > 0) {
    const prior = predecessorOf(current);
    if (prior === null) break;
    if (prior === 'unreadable') {
      cut = 'unreadable';
      break;
    }
    if (prior.ordinal >= current.ordinal) {
      cut = 'out-of-order';
      break;
    }
    if (steps >= bound) {
      cut = 'bounded';
      break;
    }
    steps += 1;
    const priorKeys = unitContentKeys(prior.manifest);
    const held = new Map<string, boolean>();
    prior.manifest.units.forEach((unit, index) => {
      const read = prior.units.get(unit.ordinal) === 'closed' && prior.contract === latest.contract;
      held.set(priorKeys[index]!, (held.get(priorKeys[index]!) ?? false) || read);
    });
    for (const [key, ordinals] of [...pending]) {
      const read = held.get(key);
      if (read === false) continue;
      if (read === undefined) for (const ordinal of ordinals) changed.set(ordinal, prior);
      pending.delete(key);
    }
    current = prior;
  }
  return { changed, blockIds: changedBlockIds(latest, changed), cut };
}

/** The blocks of each changed unit that make it changed, measured against the revision it is measured from. */
function changedBlockIds(latest: ChainRevision, changed: ReadonlyMap<number, ChainRevision>): Set<string> {
  const ids = new Set<string>();
  const nowDigests = digestsOf(latest.manifest);
  const nowBlocks = new Set(latest.manifest.units.flatMap((unit) => unit.blockIds));
  for (const [ordinal, anchor] of changed) {
    const unit = latest.manifest.units.find((candidate) => candidate.ordinal === ordinal)!;
    const thenDigests = digestsOf(anchor.manifest);
    const before = ids.size;
    // Changed or added, with the overlap context the unit's key reads.
    for (const blockId of [...unit.overlapBlockIds, ...unit.blockIds]) {
      if (thenDigests.get(blockId) !== nowDigests.get(blockId)) ids.add(blockId);
    }
    // The unit's place then: the units of the earlier revision that held any of its blocks.
    const own = new Set(unit.blockIds);
    const place = anchor.manifest.units.filter((candidate) => candidate.blockIds.some((blockId) => own.has(blockId)));
    const then = [...new Set(place.flatMap((candidate) => candidate.blockIds))];
    // Removed: in its place then, and nowhere in the manuscript the latest revision read.
    for (const blockId of then) if (!nowBlocks.has(blockId)) ids.add(blockId);
    // Reordered: the blocks it shares with its place then, outside the longest run kept in the same order.
    const order = new Map(then.map((blockId, index) => [blockId, index] as const));
    const shared = unit.blockIds.filter((blockId) => order.has(blockId));
    const kept = longestOrdered(shared.map((blockId) => order.get(blockId)!));
    shared.forEach((blockId, index) => {
      if (!kept.has(index)) ids.add(blockId);
    });
    // A unit changed only in how its blocks fall into units still counts: its first block stands for it.
    if (ids.size === before && !unit.blockIds.some((blockId) => ids.has(blockId))) ids.add(unit.blockIds[0]!);
  }
  return ids;
}

function digestsOf(manifest: CoverageManifestProjection): Map<string, string> {
  const digests = new Map<string, string>();
  for (const unit of manifest.units) unit.blockIds.forEach((blockId, index) => digests.set(blockId, unit.blockDigests[index]!));
  return digests;
}

/** The indexes of one longest strictly increasing subsequence of `values`. */
function longestOrdered(values: ReadonlyArray<number>): Set<number> {
  const tails: number[] = [];
  const previous: number[] = new Array<number>(values.length).fill(-1);
  values.forEach((value, index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]!]! < value) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tails[low - 1]!;
    tails[low] = index;
  });
  const kept = new Set<number>();
  for (let index = tails.length === 0 ? -1 : tails[tails.length - 1]!; index >= 0; index = previous[index]!) kept.add(index);
  return kept;
}

/**
 * A cache of walks, or of revisions as a walk reads them, bounded by entry count and by weight — the block references its
 * entries hold, which is what makes an entry large — and letting the least recently used entry go first (Issue #716).
 * The entry just written is never let go by its own write, so a reader always gets back what it computed.
 */
export class UnreadWalkCache<T> {
  readonly #entries = new Map<string, { readonly value: T; readonly weight: number }>();
  #weight = 0;

  constructor(readonly maxEntries: number, readonly maxWeight: number, readonly weigh: (value: T) => number) {}

  get size(): number {
    return this.#entries.size;
  }

  /** The total weight of what is kept. */
  get weight(): number {
    return this.#weight;
  }

  /** The kept value, made the most recently used; `undefined` when none is kept. */
  get(key: string): T | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const previous = this.#entries.get(key);
    if (previous !== undefined) {
      this.#entries.delete(key);
      this.#weight -= previous.weight;
    }
    const weight = Math.max(1, this.weigh(value));
    this.#entries.set(key, { value, weight });
    this.#weight += weight;
    while (this.#entries.size > 1 && (this.#entries.size > this.maxEntries || this.#weight > this.maxWeight)) {
      const [oldest, entry] = this.#entries.entries().next().value!;
      this.#entries.delete(oldest);
      this.#weight -= entry.weight;
    }
  }
}

/** The block references one manifest holds: its blocks, their digests and overlap context, one per unit besides. */
export function manifestWeight(manifest: CoverageManifestProjection): number {
  let weight = 0;
  for (const unit of manifest.units) weight += 1 + unit.blockIds.length + unit.overlapBlockIds.length;
  return weight;
}

/** What a walk holds: the blocks it names and the manifest of each revision a changed unit is measured from. */
export function unreadWalkWeight(walk: UnreadWalk): number {
  let weight = walk.blockIds.size;
  for (const anchor of new Set(walk.changed.values())) weight += manifestWeight(anchor.manifest);
  return weight;
}
