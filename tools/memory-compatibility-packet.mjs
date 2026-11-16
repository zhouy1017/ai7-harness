import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const MEMORY_COMPATIBILITY_BASE = '73a3e75fa16e5ba48d8467c4fbb98a68f62fd90c';
const execute = promisify(execFile);

/** A fresh interpreter makes the clock/identity inputs repeatable without changing production dependencies. */
export async function memoryCompatibilityPacketFrom(revision = null, { full = false, mutation = null } = {}) {
  const root = process.cwd();
  const directory = resolve(root, 'node_modules/.cache');
  await mkdir(directory, { recursive: true });
  const label = revision ?? mutation?.name ?? 'candidate';
  const output = resolve(directory, '1498-memory-' + label + '.mjs');
  const packet = resolve(directory, '1498-memory-' + label + '.json');
  await build({ entryPoints: [resolve(root, 'tests/support/memory-facade-compatibility.ts')], outfile: output,
    bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
    plugins: revision === null && mutation === null ? [] : [{ name: 'exact-base-memory-interpreter', setup(builder) {
      // Historical substitution covers .ts only. If a memory owner gains another source extension, extend this before authoring.
      builder.onLoad({ filter: /\.ts$/ }, async args => {
        const path = relative(root, args.path).replaceAll('\\', '/');
        if (!path.startsWith('src/') && (!path.startsWith('tests/support/') || path === 'tests/support/memory-facade-compatibility.ts')) return;
        const source = revision === null ? await readFile(args.path, 'utf8')
          : (await execute('git', ['show', revision + ':' + path], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' })).stdout;
        if (path !== mutation?.path) return { contents: source, loader: 'ts' };
        if (!source.includes(mutation.before)) throw new Error('Mutation target absent: ' + mutation.name);
        return { contents: source.replace(mutation.before, mutation.after), loader: 'ts' };
      });
    } }] });
  const script = [
    "import crypto from 'node:crypto'; import {syncBuiltinESMExports} from 'node:module'; import {writeFile} from 'node:fs/promises';",
    "let identity=0; const uuid=()=> '00000000-0000-4000-8000-'+(++identity).toString(16).padStart(12,'0'); crypto.randomUUID=uuid; Object.defineProperty(globalThis.crypto,'randomUUID',{value:uuid}); syncBuiltinESMExports();",
    "const OriginalDate=Date; globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2026-11-16T00:00:00.000Z']));} static now(){return OriginalDate.parse('2026-11-16T00:00:00.000Z');}};",
    'const module=await import(' + JSON.stringify(pathToFileURL(output).href) + ');',
    'const raw=await module.memoryCompatibilityPacket(); const value=' + (full ? 'raw' : '(' + memorySpecificPins.toString() + ')(raw)') + '; await writeFile(' + JSON.stringify(packet) + ',JSON.stringify(value,null,2)+String.fromCharCode(10));',
  ].join('\n');
  await execute(process.execPath, ['--input-type=module', '-e', script], { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024, timeout: 180_000 });
  return JSON.parse(await readFile(packet, 'utf8'));
}

/** Select memory facts without rewriting any value. Dictionary encoding retains EVERY read in its original order. */
export function memorySpecificPins(packet) {
  const blocks = [];
  for (const request of packet.requests) {
    const wire = JSON.parse(request.body);
    const system = wire.messages.find(message => message.role === 'system')?.content ?? '';
    const block = system.match(/『本社审阅与编辑偏好（版本 [\s\S]*?『本社审阅与编辑偏好结束』/u)?.[0] ?? null;
    if (!blocks.some(entry => entry.surface === request.surface && entry.block === block)) blocks.push({ surface: request.surface, block });
  }
  const snapshots = { empty: packet.snapshots.empty, houseAndBook: packet.snapshots['house-and-book'],
    customCategory: packet.snapshots.customCategory, accepted: packet.snapshots.accepted['baseline-manuscript-analysis'],
    lineLimit: packet.snapshots['line-limit']['factual-review'], characterLimit: packet.snapshots['character-limit']['factual-review'],
    characterCount: packet.snapshots.characterCount, excluded: packet.snapshots.excluded['editorial-dialogue'], disabled: packet.snapshots.disabled,
    restored: packet.snapshots.restored['editorial-dialogue'], redactedSources: packet.snapshots.redactedSources,
    governanceBound: packet.snapshots.governanceBound, legacyPreferences: packet.snapshots.legacyPreferences,
    reviewAttribution: packet.snapshots.reviewAttribution,
    curation: packet.snapshots.curation.items.map(entry => entry.current) };
  const points = [];
  const order = packet.timing.map(point => {
    let index = points.findIndex(value => JSON.stringify(value) === JSON.stringify(point));
    if (index === -1) { index = points.length; points.push(point); }
    return index;
  });
  const events = packet.records.review_run_category_events.flatMap(row => {
    const event = JSON.parse(row.canonical_json);
    return event.unitPreferenceReferences === undefined ? [] : [{ reviewRunId: row.review_run_id, categoryId: row.category_id,
      sequence: row.sequence, unitPreferenceReferences: event.unitPreferenceReferences }];
  });
  const records = Object.fromEntries(['learning_signals', 'global_editorial_memory_items',
    'global_editorial_memory_item_versions', 'learning_supervision_directives'].map(table => [table, packet.records[table]]));
  records.review_run_preference_pins = packet.records.review_run_preference_pins.map(row => JSON.parse(row.canonical_json).preference);
  // The current published row is enough; retaining all predecessor publications repeats the same lines quadratically.
  records.house_review_preference_versions = packet.records.house_review_preference_versions.slice(-1);
  const runs = [];
  for (const index of order) {
    const last = runs.at(-1);
    if (last?.index === index) last.count++;
    else runs.push({ index, count: 1 });
  }
  const frozen = packet.frozen.map(value => ({ kind: value.kind, editorialMemory: value.editorialMemory }));
  return { blocks, snapshots, contexts: packet.contexts, automaticDigest: packet.automaticDigest, preferenceDigests: packet.preferenceDigests,
    frozen: frozen.filter((value, index) => frozen.findIndex(other => JSON.stringify(value) === JSON.stringify(other)) === index),
    events, records, timing: { points, reads: order.length, order: runs.map(run => run.index.toString(36) + ':' + run.count.toString(36)).join(',') } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.AI7_REGENERATE_MEMORY_COMPATIBILITY !== '1') throw new Error('Set AI7_REGENERATE_MEMORY_COMPATIBILITY=1 to author the provider-free base pins.');
  const value = await memoryCompatibilityPacketFrom(MEMORY_COMPATIBILITY_BASE, { full: true });
  await mkdir('.cache', { recursive: true });
  await writeFile(resolve('.cache/1498-base-full.json'), JSON.stringify(value, null, 2) + '\n');
  const candidate = await memoryCompatibilityPacketFrom(null, { full: true });
  await writeFile(resolve('.cache/1498-candidate-full.json'), JSON.stringify(candidate, null, 2) + '\n');
  const differences = Object.keys(value).filter(key => !isDeepStrictEqual(value[key], candidate[key]));
  if (differences.length) throw new Error('Full base/head packet differs: ' + differences.join(', '));
  const repeated = await memoryCompatibilityPacketFrom(MEMORY_COMPATIBILITY_BASE, { full: true });
  if (!isDeepStrictEqual(value, repeated)) throw new Error('Base packet was not deterministic.');
  const path = resolve('tests/fixtures/database/sample1-memory-base.json');
  await writeFile(path, JSON.stringify({ base: MEMORY_COMPATIBILITY_BASE, ...memorySpecificPins(value) }, null, 2) + '\n');
  console.log('Authored base memory packets: ' + value.requests.length + ' captured ordinary requests.');
}
