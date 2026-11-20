import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

// The service layer's files are ordered and cut into shards by recorded duration (#1621), not by file count: the slowest
// files start first, and `--shard=i/n` is a greedy balance of the recorded seconds, so the shards end close together.
// The weights are data (`service-file-weights.json`), refreshed by `pnpm run test:service:weights` from a run's own report.

export interface ServiceFileWeights {
  /** Seconds assumed for a file the table does not list. */
  readonly defaultSeconds: number;
  /** Repository-relative path (forward slashes) to seconds. */
  readonly files: Readonly<Record<string, number>>;
}

export const SERVICE_WEIGHTS_PATH = new URL('./service-file-weights.json', import.meta.url);

export function loadServiceWeights(): ServiceFileWeights {
  return JSON.parse(readFileSync(SERVICE_WEIGHTS_PATH, 'utf8')) as ServiceFileWeights;
}

const weightOf = (weights: ServiceFileWeights, path: string): number => weights.files[path] ?? weights.defaultSeconds;

/** Slowest first; equal weights fall back to the path so the order never depends on the file system. */
export function orderByWeight(paths: readonly string[], weights: ServiceFileWeights): string[] {
  return [...paths].sort((a, b) => weightOf(weights, b) - weightOf(weights, a) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The `count` shards of `paths`: heaviest file first into the lightest shard (ties to the lowest index). Every path lands in
 * exactly one shard, whatever the weights, and the result depends only on the paths and the weights, so each shard's own
 * process computes the same plan.
 */
export function planServiceShards(paths: readonly string[], weights: ServiceFileWeights, count: number): string[][] {
  const shards = Array.from({ length: count }, () => ({ seconds: 0, paths: [] as string[] }));
  for (const path of orderByWeight(paths, weights)) {
    const lightest = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best));
    lightest.seconds += weightOf(weights, path);
    lightest.paths.push(path);
  }
  return shards.map((shard) => shard.paths);
}

/** Files of a run that the table does not list, so a new slow file is noticed. */
export function unlistedFiles(paths: readonly string[], weights: ServiceFileWeights): string[] {
  return paths.filter((path) => weights.files[path] === undefined).sort();
}

const isServiceFile = (path: string): boolean => path.startsWith('tests/service/');

export default class DurationSequencer extends BaseSequencer {
  private pathOf(spec: TestSpecification): string {
    return relative(this.ctx.config.root, spec.moduleId).replaceAll('\\', '/');
  }

  // Anything but a run of service files (the unit layer, a mixed filter) keeps vitest's own order and cut.
  private ours(files: readonly TestSpecification[]): boolean {
    return files.length > 0 && files.every((spec) => isServiceFile(this.pathOf(spec)));
  }

  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    if (!this.ours(files)) return super.shard(files);
    const { index, count } = this.ctx.config.shard!;
    const weights = loadServiceWeights();
    const byPath = new Map(files.map((spec) => [this.pathOf(spec), spec] as const));
    const unlisted = unlistedFiles([...byPath.keys()], weights);
    // eslint-disable-next-line no-console
    if (unlisted.length > 0) console.log(`service weights: ${unlisted.length} file(s) not in service-file-weights.json, assumed ${weights.defaultSeconds} s each: ${unlisted.join(', ')}`);
    return planServiceShards([...byPath.keys()], weights, count)[index - 1]!.map((path) => byPath.get(path)!);
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    if (!this.ours(files)) return super.sort(files);
    const weights = loadServiceWeights();
    const byPath = new Map(files.map((spec) => [this.pathOf(spec), spec] as const));
    return orderByWeight([...byPath.keys()], weights).map((path) => byPath.get(path)!);
  }
}
