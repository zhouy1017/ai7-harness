import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import DurationSequencer, { loadServiceWeights, orderByWeight, planServiceShards } from '../support/duration-sequencer.js';

// The service layer's shards are cut by recorded duration (#1621). However the weights change, every service file must run in
// exactly one shard: this runs the real sequencer over the real file list and executes no service test.
const root = resolve(import.meta.dirname, '..', '..');
const serviceFiles = readdirSync(resolve(root, 'tests/service')).filter((name) => name.endsWith('.test.ts')).sort();
const specs = serviceFiles.map((name) => ({ moduleId: resolve(root, 'tests/service', name) }));

async function shardOf(index: number, count: number): Promise<string[]> {
  const sequencer = new DurationSequencer({ config: { root, shard: { index, count } } } as never);
  return (await sequencer.shard(specs as never)).map((spec) => spec.moduleId.slice(root.length + 1).replaceAll('\\', '/').replace('tests/service/', ''));
}

describe('service shards by recorded duration', () => {
  it.each([1, 2, 3, 4, 5])('cuts the service files into %i disjoint shards that together hold every file once', async (count) => {
    const shards = await Promise.all(Array.from({ length: count }, (_, index) => shardOf(index + 1, count)));
    expect(shards.flat().sort()).toEqual(serviceFiles);
  });

  it('balances the recorded seconds better than an equal count of files and starts the slowest file first', () => {
    const weights = loadServiceWeights();
    const paths = serviceFiles.map((name) => `tests/service/${name}`);
    const seconds = (list: string[]) => list.reduce((sum, path) => sum + (weights.files[path] ?? weights.defaultSeconds), 0);
    const [a, b, c] = planServiceShards(paths, weights, 3).map(seconds) as [number, number, number];
    const total = a + b + c;
    // Greedy by weight: no shard is further than the heaviest single file from an even split.
    expect(Math.max(a, b, c) - total / 3).toBeLessThanOrEqual(Math.max(...paths.map((path) => weights.files[path] ?? weights.defaultSeconds)));
    expect(weights.files[orderByWeight(paths, weights)[0]!]).toBe(Math.max(...Object.values(weights.files)));
  });

  it('weighs a file the table does not list at the default and never loses it', () => {
    const weights = { defaultSeconds: 5, files: { 'a.test.ts': 40 } };
    const shards = planServiceShards(['a.test.ts', 'b.test.ts', 'c.test.ts'], weights, 2);
    expect(shards.flat().sort()).toEqual(['a.test.ts', 'b.test.ts', 'c.test.ts']);
    expect(shards[0]).toEqual(['a.test.ts']);
  });
});
