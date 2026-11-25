import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BaseSequencer } from 'vitest/node';
import { describe, expect, it } from 'vitest';
import DurationSequencer, { loadServiceWeights, orderByWeight, planServiceShards } from '../support/duration-sequencer.js';

// The service layer's shards are cut by recorded duration (#1621). However the weights change, every service file must run in
// exactly one shard: this runs the real sequencer over the real file list and executes no service test.
const root = resolve(import.meta.dirname, '..', '..');
const serviceFiles = readdirSync(resolve(root, 'tests/service')).filter((name) => name.endsWith('.test.ts')).sort();
const specOf = (path: string) => ({ moduleId: resolve(root, path), project: { name: '', config: { isolate: true, sequence: { groupOrder: 0 } } } });
const specs = serviceFiles.map((name) => specOf(`tests/service/${name}`));
const context = (index: number, count: number) => ({ config: { root, shard: { index, count } }, cache: { getFileTestResults: () => undefined, getFileStats: () => undefined } }) as never;
const nameOf = (spec: { moduleId: string }) => spec.moduleId.slice(root.length + 1).replaceAll('\\', '/');

async function shardOf(files: readonly object[], index: number, count: number): Promise<string[]> {
  return (await new DurationSequencer(context(index, count)).shard([...files] as never)).map(nameOf);
}

describe('service shards by recorded duration', () => {
  it.each([1, 2, 3, 4, 5])('cuts the service files into %i disjoint shards that together hold every file once', async (count) => {
    const shards = await Promise.all(Array.from({ length: count }, (_, index) => shardOf(specs, index + 1, count)));
    expect(shards.flat().sort()).toEqual(serviceFiles.map((name) => `tests/service/${name}`));
  });

  it('cuts the same shards whatever order the files arrive in', async () => {
    const shuffled = [...specs.slice(40), ...specs.slice(0, 40)].reverse();
    expect(shuffled.map(nameOf)).not.toEqual(specs.map(nameOf));
    for (const index of [1, 2, 3]) expect(await shardOf(shuffled, index, 3)).toEqual(await shardOf(specs, index, 3));
  });

  it('keeps every specification of a file listed twice', async () => {
    const twice = [...specs, specs[0]!];
    const shards = await Promise.all([1, 2, 3].map((index) => shardOf(twice, index, 3)));
    expect(shards.flat()).toHaveLength(twice.length);
  });

  it('leaves a run that holds any file outside tests/service to vitest\'s own sequencer', async () => {
    const mixed = [...specs.slice(0, 12), specOf('tests/unit/service-shard-plan.test.ts')];
    const ours = new DurationSequencer(context(2, 3)), vitests = new BaseSequencer(context(2, 3));
    expect((await ours.shard(mixed as never)).map(nameOf)).toEqual((await vitests.shard(mixed as never)).map(nameOf));
    expect((await ours.sort(mixed as never)).map(nameOf)).toEqual((await vitests.sort(mixed as never)).map(nameOf));
  });

  it('starts the slowest file first and balances the recorded seconds better than an equal count of files', async () => {
    const weights = loadServiceWeights();
    const paths = serviceFiles.map((name) => `tests/service/${name}`);
    const seconds = (path: string) => weights.files[path] ?? weights.defaultSeconds;
    const [a, b, c] = planServiceShards(paths, weights, 3).map((list) => list.reduce((sum, path) => sum + seconds(path), 0)) as [number, number, number];
    // Greedy by weight: no shard is further than the heaviest single file from an even split.
    expect(Math.max(a, b, c) - (a + b + c) / 3).toBeLessThanOrEqual(Math.max(...paths.map(seconds)));
    expect(seconds(orderByWeight(paths, weights)[0]!)).toBe(Math.max(...paths.map(seconds)));
    expect((await new DurationSequencer(context(1, 1)).sort(specs as never)).map(nameOf)).toEqual(orderByWeight(paths, weights));
  });

  it('weighs a file the table does not list at the default, breaks ties by path and never loses a file', () => {
    const weights = { defaultSeconds: 5, files: { 'a.test.ts': 40 } };
    const shards = planServiceShards(['c.test.ts', 'a.test.ts', 'b.test.ts'], weights, 2);
    expect(shards.flat().sort()).toEqual(['a.test.ts', 'b.test.ts', 'c.test.ts']);
    expect(shards).toEqual([['a.test.ts'], ['b.test.ts', 'c.test.ts']]);
    expect(orderByWeight(['c.test.ts', 'b.test.ts'], weights)).toEqual(['b.test.ts', 'c.test.ts']);
  });
});
