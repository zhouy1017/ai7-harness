import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import {
  manifestWeight,
  UnreadWalkCache,
  unreadWalkWeight,
  walkUnreadChanges,
  type ChainPredecessor,
  type ChainRevision,
  type ChainUnitState,
} from '../../src/service/analysis/unread-changes.js';
import {
  CHAIN_REVISION_CACHE_ENTRIES,
  CHAIN_REVISION_CACHE_WEIGHT,
  UNREAD_WALK_CACHE_WEIGHT,
} from '../../src/service/analysis/baseline-analysis-store.js';
import { UNREAD_WALK_BOUND_NOTE, UNREAD_WALK_CUT_NOTE, unreadWalkCutNote } from '../../src/service/review/review-runs.js';
import type { CoverageManifestProjection } from '../../src/shared/protocol.js';

// Unit suite for the unread-changes walk (Issue #709; #711 review): synthetic revisions only, planted as the ledger would
// read them — each a manifest, how it left each unit, and the contract it ran under. Each section below is one unit.

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/** One block by a stable identity, with the words it holds now. */
function block(id: string, words: string, kind: ManifestBlockInput['kind'] = 'paragraph'): ManifestBlockInput {
  const text = kind === 'heading' ? `合成标题 ${words}` : `合成段落 ${words} `.repeat(20);
  return { blockId: `blk_${sha(id).slice(0, 24)}`, position: 0, kind, level: kind === 'heading' ? 1 : null, text, digest: sha(`${kind}:${text}`), graphemes: text.length };
}

function manifestOf(blocks: ManifestBlockInput[]): CoverageManifestProjection {
  return deriveCoverageManifest({
    bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(),
    revisionLabel: 'r1', revisionDigest: 'b'.repeat(64), blocks: blocks.map((entry, index) => ({ ...entry, position: index + 1 })),
  });
}

/** Three sections, A, B and C, each a heading and two paragraphs; `words` replaces a paragraph's words by its id. */
function sections(words: Readonly<Record<string, string>> = {}, order: Readonly<Record<string, string[]>> = {}): ManifestBlockInput[] {
  return ['A', 'B', 'C'].flatMap((section) => [
    block(`${section}0`, section, 'heading'),
    ...(order[section] ?? ['1', '2', '3']).map((paragraph) => block(`${section}${paragraph}`, words[`${section}${paragraph}`] ?? `${section}${paragraph}`)),
  ]);
}

function revision(ordinal: number, manifest: CoverageManifestProjection, states: ReadonlyArray<ChainUnitState>, contract = 'c1'): ChainRevision {
  return { revisionId: `rev-${ordinal}`, ordinal, contract, manifest, units: new Map(manifest.units.map((unit, index) => [unit.ordinal, states[index]!] as const)) };
}

/** A chain from the latest back: each revision's predecessor is the next one in the list, the last one is the first Run. */
function chain(...revisions: ChainRevision[]): (current: ChainRevision) => ChainPredecessor {
  return (current) => {
    const index = revisions.indexOf(current);
    return index < 0 || index + 1 >= revisions.length ? null : revisions[index + 1]!;
  };
}

const id = (name: string): string => block(name, '').blockId;
const READ: ChainUnitState[] = ['closed', 'closed', 'closed'];

describe('the unread-changes walk', () => {
  it('flags a unit a 选章 left unread after it changed since a Run read it, and counts the changed block', () => {
    const whole = revision(1, manifestOf(sections()), READ);
    const chosen = revision(2, manifestOf(sections({ A2: '改过' })), ['out-of-scope', 'closed', 'closed']);
    const walk = walkUnreadChanges(chosen, chain(chosen, whole));
    expect([...walk.changed].map(([ordinal, anchor]) => [ordinal, anchor.revisionId])).toEqual([[1, 'rev-1']]);
    expect([...walk.blockIds]).toEqual([id('A2')]);
    expect(walk.cut).toBeNull();
  });

  it('leaves a unit no Run has read, unedited, as it is — and flags it once it is edited (P3-2)', () => {
    const first = revision(1, manifestOf(sections()), ['out-of-scope', 'closed', 'out-of-scope']);
    const second = revision(2, manifestOf(sections()), ['out-of-scope', 'closed', 'closed']);
    expect(walkUnreadChanges(second, chain(second, first)).changed.size).toBe(0);
    const edited = revision(2, manifestOf(sections({ A1: '改过' })), ['out-of-scope', 'closed', 'closed']);
    const walk = walkUnreadChanges(edited, chain(edited, first));
    expect([...walk.changed.keys()]).toEqual([1]);
    expect([...walk.blockIds]).toEqual([id('A1')]);
  });

  it('counts a read that failed as no read: unread since, and unchanged, it is left as it is (ruling on #711 P2-1)', () => {
    const failed = revision(1, manifestOf(sections()), ['failed', 'closed', 'closed']);
    const chosen = revision(2, manifestOf(sections()), ['out-of-scope', 'closed', 'closed']);
    expect(walkUnreadChanges(chosen, chain(chosen, failed)).changed.size).toBe(0);
    // Past the failure, an earlier Run that read the same words settles it unchanged; one that read other words, changed.
    const read = revision(0, manifestOf(sections()), READ);
    const failedAfterRead = { ...failed, ordinal: 1 };
    expect(walkUnreadChanges(chosen, chain(chosen, failedAfterRead, read)).changed.size).toBe(0);
    const readOther = revision(0, manifestOf(sections({ A1: '原来' })), READ);
    expect([...walkUnreadChanges(chosen, chain(chosen, failedAfterRead, readOther)).changed.values()].map((anchor) => anchor.ordinal)).toEqual([0]);
  });

  it('counts a read under another category contract as no read (ruling on #711 P2-1)', () => {
    const before = revision(1, manifestOf(sections()), READ, 'c1');
    const chosen = revision(2, manifestOf(sections()), ['out-of-scope', 'closed', 'out-of-scope'], 'c2');
    expect(walkUnreadChanges(chosen, chain(chosen, before)).changed.size).toBe(0);
    // Under the same contract the same words were read: unchanged, too.
    expect(walkUnreadChanges({ ...chosen, contract: 'c1' }, chain({ ...chosen, contract: 'c1' }, before)).changed.size).toBe(0);
    // A read of these words under another contract settles nothing: measured past it, from the last read under this one,
    // whose words were other, the unit changed.
    const earlier = revision(0, manifestOf(sections({ A1: '原来' })), READ, 'c2');
    const walk = walkUnreadChanges(chosen, chain(chosen, before, earlier));
    expect([...walk.changed].map(([ordinal, anchor]) => [ordinal, anchor.revisionId])).toEqual([[1, 'rev-0']]);
    expect([...walk.blockIds]).toEqual([id('A1')]);
  });

  it('counts a paragraph removed from, or reordered within, a unit left unread — never a row at 需复审 with nothing counted (P2-1)', () => {
    const whole = revision(1, manifestOf(sections()), READ);
    const removed = revision(2, manifestOf(sections({}, { A: ['1', '3'] })), ['out-of-scope', 'closed', 'closed']);
    const walkRemoved = walkUnreadChanges(removed, chain(removed, whole));
    expect([...walkRemoved.changed.keys()]).toEqual([1]);
    expect([...walkRemoved.blockIds]).toEqual([id('A2')]);
    const reordered = revision(2, manifestOf(sections({}, { A: ['1', '3', '2'] })), ['out-of-scope', 'closed', 'closed']);
    const walkReordered = walkUnreadChanges(reordered, chain(reordered, whole));
    expect([...walkReordered.changed.keys()]).toEqual([1]);
    expect(walkReordered.blockIds.size).toBe(1);
    expect([id('A2'), id('A3')]).toContain([...walkReordered.blockIds][0]);
  });

  it('stops at a record it cannot read, one out of order, or past its bound, and says where; what it had not settled stays unread (P2-2, P3-3)', () => {
    const whole = revision(1, manifestOf(sections()), READ);
    const middle = revision(2, manifestOf(sections({ A2: '改过' })), ['out-of-scope', 'closed', 'closed']);
    const latest = revision(3, manifestOf(sections({ A2: '改过' })), ['out-of-scope', 'closed', 'closed']);
    expect(walkUnreadChanges(latest, chain(latest, middle, whole))).toMatchObject({ cut: null });
    expect(walkUnreadChanges(latest, chain(latest, middle, whole)).changed.size).toBe(1);
    const unreadable = walkUnreadChanges(latest, (current) => current === latest ? middle : 'unreadable');
    expect(unreadable).toMatchObject({ cut: 'unreadable' });
    expect(unreadable.changed.size).toBe(0);
    const cycle = walkUnreadChanges(latest, (current) => current === latest ? middle : latest);
    expect(cycle).toMatchObject({ cut: 'out-of-order' });
    expect(cycle.changed.size).toBe(0);
    const bounded = walkUnreadChanges(latest, chain(latest, middle, whole), 1);
    expect(bounded).toMatchObject({ cut: 'bounded' });
    expect(bounded.changed.size).toBe(0);
    // Nothing left unread, nothing to walk: no cut even over an unreadable chain.
    const read = revision(3, manifestOf(sections()), READ);
    expect(walkUnreadChanges(read, () => 'unreadable')).toMatchObject({ cut: null });
  });
});

describe('the walk caches (Issue #716)', () => {
  it('lets the least recently used entry go first, not the oldest written', () => {
    const cache = new UnreadWalkCache<string>(2, 1_000, () => 1);
    cache.set('a', 'A');
    cache.set('b', 'B');
    expect(cache.get('a')).toBe('A');
    cache.set('c', 'C');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('A');
    expect(cache.get('c')).toBe('C');
    expect(cache.size).toBe(2);
  });

  it('is bounded by weight as well as by count, and never lets go of the entry it just wrote', () => {
    const cache = new UnreadWalkCache<number>(10, 10, (value) => value);
    cache.set('a', 4);
    cache.set('b', 4);
    expect([cache.size, cache.weight]).toEqual([2, 8]);
    cache.set('c', 4);
    expect(cache.get('a')).toBeUndefined();
    expect([cache.size, cache.weight]).toEqual([2, 8]);
    // An entry heavier than the bound is kept alone, so its reader still gets back what it computed.
    cache.set('d', 50);
    expect([cache.size, cache.weight, cache.get('d')]).toEqual([1, 50, 50]);
    // Rewriting a key replaces its weight rather than adding to it.
    cache.set('d', 3);
    cache.set('d', 3);
    expect([cache.size, cache.weight]).toEqual([1, 3]);
    // A weight of nothing still counts as one.
    const light = new UnreadWalkCache<number>(10, 2, () => 0);
    light.set('a', 0);
    light.set('b', 0);
    light.set('c', 0);
    expect([light.size, light.weight]).toEqual([2, 2]);
  });

  it('weighs a manifest by the block references it holds, and a walk by its blocks and the manifests it is measured from', () => {
    const manifest = manifestOf(sections());
    const references = manifest.units.reduce((total, unit) => total + 1 + unit.blockIds.length + unit.overlapBlockIds.length, 0);
    expect(manifestWeight(manifest)).toBe(references);
    expect(references).toBeGreaterThan(manifest.units.length);
    const whole = revision(1, manifest, READ);
    const chosen = revision(2, manifestOf(sections({ A2: '改过', C2: '改过' })), ['out-of-scope', 'closed', 'out-of-scope']);
    const walk = walkUnreadChanges(chosen, chain(chosen, whole));
    expect(walk.changed.size).toBe(2);
    // Both units are measured from the one 全书, whose manifest is counted once.
    expect(unreadWalkWeight(walk)).toBe(walk.blockIds.size + references);
    expect(unreadWalkWeight(walkUnreadChanges(whole, () => null))).toBe(0);
  });
});

describe("the chain cache under the walk's own reading order (Issue #727)", () => {
  /** A manuscript of `blocks` paragraphs with a heading every 75, as a ~3,000-block Book's manifest weighs. */
  function manuscript(blocks: number): CoverageManifestProjection {
    const list: ManifestBlockInput[] = [];
    for (let index = 0; index < blocks; index += 1) list.push(block(`b${index}`, `${index}`, index % 75 === 0 ? 'heading' : 'paragraph'));
    return manifestOf(list);
  }
  /**
   * The ledger's reads over a chain that grows one revision at a time, each walk reading newest-first to the chain's first
   * Run (a chapter standing unread keeps it going): how many revisions each walk read from SQLite rather than the cache.
   */
  function missesPerWalk(maxEntries: number, maxWeight: number, revisionWeight: number, chain: number): number[] {
    const cache = new UnreadWalkCache<number>(maxEntries, maxWeight, () => revisionWeight);
    const misses: number[] = [];
    for (let latest = 1; latest <= chain; latest += 1) {
      let missed = 0;
      for (let ordinal = latest; ordinal >= 1; ordinal -= 1) {
        if (cache.get(`rev-${ordinal}`) !== undefined) continue;
        missed += 1;
        cache.set(`rev-${ordinal}`, ordinal);
      }
      misses.push(missed);
    }
    return misses;
  }

  it("keeps a ~3,000-block manuscript's chain of 40 选章 cached, where the walk cache's bound would re-read the whole chain at every Run", () => {
    const manifest = manuscript(3_000);
    const weight = manifestWeight(manifest) + manifest.units.length;
    expect(weight).toBeGreaterThan(4_000);
    // Measured, not fixed: under LRU a scan longer than the bound evicts exactly what the next walk asks for first, so past
    // the bound every walk misses every revision — a cliff, 1 read a Run to n reads a Run — never a decline.
    const fit = Math.floor(UNREAD_WALK_CACHE_WEIGHT / weight);
    const thrashing = missesPerWalk(CHAIN_REVISION_CACHE_ENTRIES, UNREAD_WALK_CACHE_WEIGHT, weight, 40);
    expect(thrashing.slice(0, fit).every((missed) => missed === 1)).toBe(true);
    expect(thrashing.slice(fit)).toEqual(thrashing.slice(fit).map((_, index) => fit + index + 1));
    expect(thrashing.at(-1)).toBe(40);
    // Under the chain cache's own bound the chain of 40 is read from SQLite once, one revision per Run, with room past it.
    const kept = missesPerWalk(CHAIN_REVISION_CACHE_ENTRIES, CHAIN_REVISION_CACHE_WEIGHT, weight, 40);
    expect(kept).toEqual(new Array<number>(40).fill(1));
    expect(Math.floor(CHAIN_REVISION_CACHE_WEIGHT / weight)).toBeGreaterThanOrEqual(48);
  });
});

describe('the note a cut walk puts beside its category (Issue #716)', () => {
  it('words a walk that only reached its bound apart from one that met a record it could not check', () => {
    expect(unreadWalkCutNote(null)).toBeNull();
    expect(unreadWalkCutNote('unreadable')).toBe(UNREAD_WALK_CUT_NOTE);
    expect(unreadWalkCutNote('out-of-order')).toBe(UNREAD_WALK_CUT_NOTE);
    expect(unreadWalkCutNote('bounded')).toBe(UNREAD_WALK_BOUND_NOTE);
    expect(UNREAD_WALK_BOUND_NOTE).toBe('这一类的审阅记录很多，只往回查了最近 512 次审阅：更早读过、之后又改动的章，只审改动过的章不会重读；需要时请审全书或所选各章。');
    expect(UNREAD_WALK_BOUND_NOTE).not.toContain('无法核对');
  });
});
