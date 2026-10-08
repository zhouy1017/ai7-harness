import { describe, expect, it } from 'vitest';
import { RecentCache } from '../../src/service/recent-cache.js';

// Issue #649: the store's per-contract review-category caches keep only the most recently used entries, and never drop
// one the caller still needs.
describe('a recent cache', () => {
  it('makes a value once per key and gives the same value back while it is kept', () => {
    const cache = new RecentCache<{ key: string }>(2);
    let made = 0;
    const make = (key: string) => () => {
      made += 1;
      return { key };
    };
    const first = cache.obtain('a', make('a'));
    expect(cache.obtain('a', make('a'))).toBe(first);
    expect(made).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('keeps at most its capacity, dropping the least recently used', () => {
    const cache = new RecentCache<string>(2);
    cache.obtain('a', () => 'a');
    cache.obtain('b', () => 'b');
    // Using `a` again makes `b` the least recent.
    cache.obtain('a', () => 'a-again');
    cache.obtain('c', () => 'c');
    expect(cache.size).toBe(2);
    expect([...cache.values()].sort()).toEqual(['a', 'c']);
    expect(cache.obtain('b', () => 'b-again')).toBe('b-again');
    expect(cache.size).toBe(2);
  });

  it('never drops a value the caller still holds work in, and drops it once that work is done', () => {
    const busy = new Set<string>(['a']);
    const cache = new RecentCache<string>(1, (value) => busy.has(value));
    cache.obtain('a', () => 'a');
    cache.obtain('b', () => 'b');
    // `a` is the oldest but retained, so the cache holds one over its capacity rather than drop it.
    expect([...cache.values()].sort()).toEqual(['a', 'b']);
    busy.delete('a');
    cache.obtain('c', () => 'c');
    expect([...cache.values()]).toEqual(['c']);
  });

  it('refuses a capacity below one', () => {
    expect(() => new RecentCache<string>(0)).toThrow();
  });
});
