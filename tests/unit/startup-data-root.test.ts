import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { chooseStartupDataRoot } from '../../src/main/startup-data-root.js';
import {
  createCanonicalProductionDataRoot, readStartupDataChoice, requireStartupChoiceOutsideDataRoot,
  startupDataChoiceFile, storeStartupDataChoice,
} from '../../src/shared/data-root.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function sandbox(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ai7-startup-choice-'));
  roots.push(root);
  return root;
}

describe('startup data location decision', () => {
  const explicit = resolve('explicit');
  const stored = resolve('stored');
  const defaults = { dataRoot: resolve('default') };
  it('gives an explicit root precedence, then the stored choice, without showing a chooser', () => {
    expect(chooseStartupDataRoot({ dataRoot: explicit, choice: { kind: 'cancel' } }, stored, defaults)).toEqual({ kind: 'ready', dataRoot: explicit });
    expect(chooseStartupDataRoot({}, stored, defaults)).toEqual({ kind: 'ready', dataRoot: stored });
  });
  it('asks only on an unconfigured launch, and respects the default, selected folder and cancellation', () => {
    expect(chooseStartupDataRoot({}, null, defaults)).toEqual({ kind: 'choose', defaultRoot: defaults.dataRoot });
    expect(chooseStartupDataRoot({ choice: { kind: 'default' } }, null, defaults)).toEqual({ kind: 'ready', dataRoot: defaults.dataRoot });
    expect(chooseStartupDataRoot({ choice: { kind: 'folder', path: explicit } }, null, defaults)).toEqual({ kind: 'ready', dataRoot: explicit });
    expect(chooseStartupDataRoot({ choice: { kind: 'cancel' } }, null, defaults)).toEqual({ kind: 'quit' });
    expect(() => chooseStartupDataRoot({ dataRoot: 'relative' }, null, defaults)).toThrow();
  });
  it('persists only launcher metadata outside both default and selected product roots', async () => {
    const root = await sandbox();
    const defaultRoot = join(root, 'launcher', 'production');
    const chosen = join(root, 'chosen');
    expect(await readStartupDataChoice(defaultRoot)).toBeNull();
    await storeStartupDataChoice(defaultRoot, chosen);
    expect(await readStartupDataChoice(defaultRoot)).toBe(chosen);
    expect(JSON.parse(await readFile(startupDataChoiceFile(defaultRoot), 'utf8'))).toEqual({ version: 1, dataRoot: chosen });
    expect(() => requireStartupChoiceOutsideDataRoot(defaultRoot, dirname(defaultRoot))).toThrow();
  });
  it('refuses a developer cache sibling before creating product data', async () => {
    const root = await sandbox();
    const checkout = join(root, 'checkout');
    await mkdir(checkout);
    await expect(createCanonicalProductionDataRoot(join(root, 'ai7-provider-cache', 'data'), checkout)).rejects.toThrow('AI7_DATA_ROOT_BOUNDARY_INVALID');
  });
});

describe('production chooser launcher contract', () => {
  it('admits one explicit production pass-through, and the chosen-root relaunch uses the ordinary path', async () => {
    // @ts-expect-error The plain launcher modules intentionally have no declarations.
    const production = await import('../../tools/start-production.mjs');
    // @ts-expect-error The plain launcher modules intentionally have no declarations.
    const built = await import('../../tools/start-built.mjs');
    const initial = built.parseBuiltLaunchArguments(production.startBuiltArguments(null));
    expect(initial.dataRoot).toBeUndefined();
    expect(initial.forwarded).toContain('--allow-first-run-chooser');
    const relaunched = built.parseBuiltLaunchArguments(production.startBuiltArguments(resolve('chosen')));
    expect(relaunched.dataRoot).toBe(resolve('chosen'));
    expect(relaunched.forwarded).not.toContain('--allow-first-run-chooser');
    for (const args of [[], ['--allow-first-run-chooser', 'true'], ['--trusted-operational-scope', 'ordinary-production'],
      ['--allow-first-run-chooser', 'false', '--trusted-operational-scope', 'ordinary-production'],
      ['--data-root', resolve('chosen'), '--allow-first-run-chooser', 'true', '--trusted-operational-scope', 'ordinary-production']]) {
      expect(() => built.parseBuiltLaunchArguments(args)).toThrow();
    }
  });
  it('treats only the two output-free chooser exit codes as completion or cancellation', async () => {
    // @ts-expect-error The plain launcher module intentionally has no declarations.
    const { firstRunChooserExit } = await import('../../tools/start-built.mjs');
    expect(firstRunChooserExit(70, 0)).toBe('relaunch');
    expect(firstRunChooserExit(71, 0)).toBe('cancelled');
    for (const code of [0, 1, null, 72]) expect(() => firstRunChooserExit(code, 0)).toThrow();
    for (const code of [70, 71]) expect(() => firstRunChooserExit(code, 1)).toThrow();
  });
});
