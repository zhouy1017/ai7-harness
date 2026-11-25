import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import type { GlobalAgentCapture } from '../support/global-agent-capture.js';

// What the AI 助手 lists and sends over one ordinary-production `sample1` store holding no 重新启用 / 删除 record, as the base
// (34389e13c) sent it (Issue #1655 review). Both runs build the store in a fresh interpreter with a fixed clock and a fixed
// identity sequence, so ids, pins, digests and instants compare as raw bytes; nothing is normalised or masked. What the fixed
// inputs cannot show: a dependence on real elapsed time (every instant is the same one) or on real randomness (ids are a
// counter). A change in how many ids are drawn, or in any digest's input, moves the bytes and fails. The expectation is
// regenerated with `AI7_GLOBAL_AGENT_CAPTURE_WRITE=1`: this file then bundles the same capture text over the base's own `src/` and
// `tests/support/` sources (read with `git show`), exactly as tools/memory-compatibility-packet.mjs interprets its base.
const BASE = '34389e13c';
const EXPECTED = resolve('tests/fixtures/global-agent/requests-at-34389e13c.json');
const execute = promisify(execFile);
type Captured = { before: GlobalAgentCapture; after: GlobalAgentCapture | null; stoppedItemId: string };

async function captured(revision: string | null): Promise<Captured> {
  const root = process.cwd();
  const directory = resolve(root, 'node_modules/.cache');
  await mkdir(directory, { recursive: true });
  const label = revision ?? 'head';
  const output = resolve(directory, `1655-global-agent-${label}.mjs`);
  const result = resolve(directory, `1655-global-agent-${label}.json`);
  const capture = 'tests/support/global-agent-capture.ts';
  await build({ entryPoints: [resolve(root, capture)], outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
    plugins: revision === null ? [] : [{ name: 'exact-base-interpreter', setup(builder) {
      // esbuild filters are Go regular expressions, which take no `u` flag.
      builder.onLoad({ filter: /\.ts$/ }, async (args) => {
        const path = relative(root, args.path).replaceAll('\\', '/');
        if (path === capture || !path.startsWith('src/') && !path.startsWith('tests/support/')) return undefined;
        const { stdout } = await execute('git', ['show', `${revision}:${path}`], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
        return { contents: stdout, loader: 'ts' };
      });
    } }] });
  const script = [
    "import crypto from 'node:crypto'; import { syncBuiltinESMExports } from 'node:module'; import { writeFile } from 'node:fs/promises';",
    "let identity = 0; const uuid = () => '00000000-0000-4000-8000-' + (++identity).toString(16).padStart(12, '0');",
    "crypto.randomUUID = uuid; Object.defineProperty(globalThis.crypto, 'randomUUID', { value: uuid }); syncBuiltinESMExports();",
    "const OriginalDate = Date; globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2026-11-21T00:00:00.000Z'])); } static now() { return OriginalDate.parse('2026-11-21T00:00:00.000Z'); } };",
    `const module = await import(${JSON.stringify(pathToFileURL(output).href)});`,
    `await writeFile(${JSON.stringify(result)}, JSON.stringify(await module.captureGlobalAgentRequests(${revision === null})));`,
  ].join('\n');
  await execute(process.execPath, ['--input-type=module', '-e', script], { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024, timeout: 170_000 });
  return JSON.parse(await readFile(result, 'utf8')) as Captured;
}

type Body = { messages: Array<{ role: string; content: string }> } & Record<string, unknown>;

/**
 * The body a request after 重新启用 must be: the before body with exactly two changes — B's source inserted once, at B's place
 * among the listed sources, as its new candidate; and B's published line with the publication's version label in the system
 * prompt (that line must appear exactly once, and removing it with the old label restored must give the before prompt back).
 * Everything else — every option, every message field, the header and the rest of the message — is the before body's.
 */
function expectedAfter(before: string, after: string, source: { itemId: string; revisionId: string; text: string }, index: number, line: string): Body {
  const expected = JSON.parse(before) as Body;
  const system = (JSON.parse(after) as Body).messages[0]!.content;
  const label = /（版本 v[0-9]+）/u;
  expect(system.split(line)).toHaveLength(2);
  expect(system.replace(line, '').replace(label, expected.messages[0]!.content.match(label)![0])).toBe(expected.messages[0]!.content);
  expected.messages[0]!.content = system;
  const user = expected.messages[1]!;
  const [header, json] = user.content.split(/\n(.*)/su) as [string, string];
  const message = JSON.parse(json) as { sources: Array<typeof source> };
  message.sources.splice(index, 0, source);
  user.content = `${header}\n${canonicalJson(message)}`;
  return expected;
}

it('lists and sends the base\'s exact bytes over a store without lifecycle records, and after 重新启用 only the entry comes back (#1655)', async () => {
  if (process.env['AI7_GLOBAL_AGENT_CAPTURE_WRITE'] === '1') {
    await writeFile(EXPECTED, `${JSON.stringify((await captured(BASE)).before, null, 2)}\n`);
    return;
  }
  const { before, after, stoppedItemId } = await captured(null);
  // Byte for byte with the base: every listed and sent revision, every digest, every text and both request bodies.
  expect(before).toEqual(JSON.parse(await readFile(EXPECTED, 'utf8')));
  expect(after).not.toBeNull();
  const now = after!;
  // After one 重新启用 of memory B (no directive), the only new source is B; every other listed item and pin is unchanged.
  const added = now.sourceCandidates.filter((entry) => !before.sourceCandidates.some((old) => old.itemId === entry.itemId));
  expect(added).toEqual([expect.objectContaining({ itemId: stoppedItemId, kind: 'memory', text: '合成停用后的记忆。' })]);
  expect(now.sourceCandidates.filter((entry) => entry.itemId !== stoppedItemId)).toEqual(before.sourceCandidates);
  expect(now.items.filter((entry) => entry.itemId !== stoppedItemId)).toEqual(before.items.filter((entry) => entry.itemId !== stoppedItemId));
  expect(now.items.find((entry) => entry.itemId === stoppedItemId)).toMatchObject({ state: 'active' });
  // Both requests after it (question and regeneration) are compared whole with the before body plus the two allowed changes.
  expect(now.requests).toHaveLength(before.requests.length);
  const source = { itemId: stoppedItemId, revisionId: added[0]!.revisionId, text: added[0]!.text };
  const index = now.sourceCandidates.findIndex((entry) => entry.itemId === stoppedItemId);
  now.requests.forEach((body, at) => {
    expect(JSON.parse(body)).toEqual(expectedAfter(before.requests[at]!, body, source, index, `- [typos-and-usage] ${source.text}\n`));
  });
}, 180_000);
