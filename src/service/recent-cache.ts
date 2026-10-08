/**
 * A keyed cache that keeps at most `capacity` values, letting the least recently used go first (Issue #649). A value
 * `retained` says the caller still needs is never let go, so the cache may stand above its capacity while such values
 * are in use, and comes back down as soon as they are not.
 */
export class RecentCache<V> {
  readonly #capacity: number;
  readonly #retained: (value: V) => boolean;
  // A Map iterates in insertion order, so re-inserting on use keeps the least recently used first.
  readonly #entries = new Map<string, V>();

  constructor(capacity: number, retained: (value: V) => boolean = () => false) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('A recent cache keeps at least one value.');
    this.#capacity = capacity;
    this.#retained = retained;
  }

  get size(): number {
    return this.#entries.size;
  }

  /** The value kept for `key`, now the most recently used, or the one `make` makes and keeps. */
  obtain(key: string, make: () => V): V {
    if (this.#entries.has(key)) {
      const kept = this.#entries.get(key) as V;
      this.#entries.delete(key);
      this.#entries.set(key, kept);
      return kept;
    }
    const made = make();
    this.#entries.set(key, made);
    for (const [oldest, value] of this.#entries) {
      if (this.#entries.size <= this.#capacity) break;
      if (oldest !== key && !this.#retained(value)) this.#entries.delete(oldest);
    }
    return made;
  }

  values(): IterableIterator<V> {
    return this.#entries.values();
  }
}
