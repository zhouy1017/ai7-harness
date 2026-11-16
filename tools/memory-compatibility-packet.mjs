import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MEMORY_COMPATIBILITY_BASE = '73a3e75fa16e5ba48d8467c4fbb98a68f62fd90c';
const execute = promisify(execFile);

/** A fresh interpreter makes the clock/identity inputs repeatable without changing production dependencies. */
export async function memoryCompatibilityPacketFrom(revision = null) {
  const root = process.cwd();
  const directory = resolve(root, 'node_modules/.cache');
  await mkdir(directory, { recursive: true });
  const label = revision ?? 'candidate';
  const output = resolve(directory, '1498-memory-' + label + '.mjs');
  const packet = resolve(directory, '1498-memory-' + label + '.json');
  await build({ entryPoints: [resolve(root, 'tests/support/memory-facade-compatibility.ts')], outfile: output,
    bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
    plugins: revision === null ? [] : [{ name: 'exact-base-memory-interpreter', setup(builder) {
      builder.onLoad({ filter: /\.ts$/ }, async args => {
        const path = relative(root, args.path).replaceAll('\\', '/');
        if (!path.startsWith('src/') && (!path.startsWith('tests/support/') || path === 'tests/support/memory-facade-compatibility.ts')) return;
        const { stdout } = await execute('git', ['show', revision + ':' + path], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
        return { contents: stdout, loader: 'ts' };
      });
    } }] });
  const script = [
    "import crypto from 'node:crypto'; import {syncBuiltinESMExports} from 'node:module'; import {writeFile} from 'node:fs/promises';",
    "let identity=0; const uuid=()=> '00000000-0000-4000-8000-'+(++identity).toString(16).padStart(12,'0'); crypto.randomUUID=uuid; Object.defineProperty(globalThis.crypto,'randomUUID',{value:uuid}); syncBuiltinESMExports();",
    "const OriginalDate=Date; globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2026-11-16T00:00:00.000Z']));} static now(){return OriginalDate.parse('2026-11-16T00:00:00.000Z');}};",
    'const module=await import(' + JSON.stringify(pathToFileURL(output).href) + ');',
    'const value=await module.memoryCompatibilityPacket(); await writeFile(' + JSON.stringify(packet) + ',JSON.stringify(value,null,2)+String.fromCharCode(10));',
  ].join('\n');
  await execute(process.execPath, ['--input-type=module', '-e', script], { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024, timeout: 180_000 });
  return JSON.parse(await readFile(packet, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.AI7_REGENERATE_MEMORY_COMPATIBILITY !== '1') throw new Error('Set AI7_REGENERATE_MEMORY_COMPATIBILITY=1 to author the provider-free base pins.');
  const value = await memoryCompatibilityPacketFrom(MEMORY_COMPATIBILITY_BASE);
  const path = resolve('tests/fixtures/database/sample1-memory-base.json');
  await writeFile(path, JSON.stringify({ base: MEMORY_COMPATIBILITY_BASE, ...value }, null, 2) + '\n');
  console.log('Authored base memory packets: ' + value.requests.length + ' captured ordinary requests.');
}
