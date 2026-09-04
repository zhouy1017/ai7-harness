import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCanonicalExternalDataRoot,
  ensureCanonicalDataDirectory,
  inspectBoundedDataFootprint,
  inspectCanonicalDataFile,
  requireSameCanonicalDataDirectory,
} from '../../src/shared/data-root.js';

const BOUNDARY = 'AI7_DATA_ROOT_BOUNDARY_INVALID';

let sandbox: string;
let codeRoot: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-data-root-test-'));
  codeRoot = join(sandbox, 'checkout');
  await mkdir(codeRoot);
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('createCanonicalExternalDataRoot', () => {
  it('creates a missing external root and returns its canonical path', async () => {
    const created = await createCanonicalExternalDataRoot(join(sandbox, 'data', 'nested'), codeRoot);
    expect(created.toLowerCase()).toBe(resolve(sandbox, 'data', 'nested').toLowerCase());
    const footprint = await inspectBoundedDataFootprint(created);
    expect(footprint).toEqual({ measuredBytes: 0, measuredEntries: 0, maximumEntries: 128, complete: true });
  });

  it('rejects a data root inside the code checkout', async () => {
    await expect(createCanonicalExternalDataRoot(join(codeRoot, 'data'), codeRoot)).rejects.toThrow(BOUNDARY);
  });

  it('rejects a data root that contains the code checkout', async () => {
    await expect(createCanonicalExternalDataRoot(sandbox, codeRoot)).rejects.toThrow(BOUNDARY);
  });

  it('rejects relative inputs', async () => {
    await expect(createCanonicalExternalDataRoot('relative/data', codeRoot)).rejects.toThrow(BOUNDARY);
    await expect(createCanonicalExternalDataRoot(join(sandbox, 'data'), 'relative/checkout')).rejects.toThrow(BOUNDARY);
  });
});

describe('ensureCanonicalDataDirectory', () => {
  it('creates one exact directory chain beneath the data root', async () => {
    const dataRoot = await createCanonicalExternalDataRoot(join(sandbox, 'data'), codeRoot);
    const shell = await ensureCanonicalDataDirectory(dataRoot, 'shell', 'cache');
    expect(shell.toLowerCase()).toBe(resolve(dataRoot, 'shell', 'cache').toLowerCase());
    await expect(ensureCanonicalDataDirectory(dataRoot, 'shell', 'cache')).resolves.toBe(shell);
  });

  it('rejects traversal, empty, and multi-segment names', async () => {
    const dataRoot = await createCanonicalExternalDataRoot(join(sandbox, 'data'), codeRoot);
    await expect(ensureCanonicalDataDirectory(dataRoot, '..')).rejects.toThrow(BOUNDARY);
    await expect(ensureCanonicalDataDirectory(dataRoot, '')).rejects.toThrow(BOUNDARY);
    await expect(ensureCanonicalDataDirectory(dataRoot, 'a/b')).rejects.toThrow(BOUNDARY);
    await expect(ensureCanonicalDataDirectory(dataRoot)).rejects.toThrow(BOUNDARY);
  });
});

describe('requireSameCanonicalDataDirectory', () => {
  it('accepts the same directory and rejects a different one', async () => {
    const dataRoot = await createCanonicalExternalDataRoot(join(sandbox, 'data'), codeRoot);
    const other = await ensureCanonicalDataDirectory(dataRoot, 'other');
    await expect(requireSameCanonicalDataDirectory(dataRoot, dataRoot)).resolves.toBeUndefined();
    await expect(requireSameCanonicalDataDirectory(dataRoot, other)).rejects.toThrow(BOUNDARY);
  });
});

describe('inspectCanonicalDataFile and footprint', () => {
  it('reports absence, then existence, and counts bounded entries', async () => {
    const dataRoot = await createCanonicalExternalDataRoot(join(sandbox, 'data'), codeRoot);
    const parent = await ensureCanonicalDataDirectory(dataRoot, 'db');
    const before = await inspectCanonicalDataFile(dataRoot, parent, 'ai7.sqlite');
    expect(before.exists).toBe(false);
    await writeFile(before.path, 'abc');
    const after = await inspectCanonicalDataFile(dataRoot, parent, 'ai7.sqlite');
    expect(after).toEqual({ path: before.path, exists: true });
    const footprint = await inspectBoundedDataFootprint(dataRoot);
    expect(footprint.measuredEntries).toBe(2);
    expect(footprint.measuredBytes).toBe(3);
    expect(footprint.complete).toBe(true);
  });

  it('rejects a parent outside the data root and a traversal file name', async () => {
    const dataRoot = await createCanonicalExternalDataRoot(join(sandbox, 'data'), codeRoot);
    await expect(inspectCanonicalDataFile(dataRoot, codeRoot, 'x')).rejects.toThrow(BOUNDARY);
    await expect(inspectCanonicalDataFile(dataRoot, dataRoot, '..')).rejects.toThrow(BOUNDARY);
  });
});
