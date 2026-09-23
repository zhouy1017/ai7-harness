import { createHash } from 'node:crypto';
import { link, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeAtomically } from '../../src/service/manuscript-export.js';

// A volume with no hard links (Issue #413, the Owner's review of PR #501): `link` answers `EPERM` there, as
// FAT and exFAT do. No exclusive create can stand in for it — a closed handle holds no pathname — so a
// `create` export is refused, and nothing another program put at the chosen name is written over or removed.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    link: vi.fn(async () => { throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' }); }),
    rename: vi.fn(actual.rename),
  };
});

const PAYLOAD = new TextEncoder().encode('AI7 export payload');
const OTHER = new TextEncoder().encode('another application wrote this');
const digest = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'ai7-publication-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
  vi.mocked(link).mockClear();
  vi.mocked(rename).mockClear();
});

async function partials(): Promise<string[]> {
  return (await readdir(folder)).filter((entry) => entry.endsWith('.ai7-partial'));
}

describe('publishing on a volume with no hard links', () => {
  it('refuses a create, writes nothing at the chosen name, and leaves no partial behind', async () => {
    const destination = join(folder, '新建.docx');
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', crypto.randomUUID());
    expect(written).toEqual({ outcome: 'failed', code: 'EXPORT_CREATE_UNSUPPORTED' });
    expect(vi.mocked(link)).toHaveBeenCalledOnce();
    expect(await readdir(folder)).toEqual([]);
  });

  it('never writes over, nor removes, a file another program puts at the chosen name while the export publishes', async () => {
    const destination = join(folder, '被占用.docx');
    // Another program takes the name at the very moment the export tries to — the race an exclusive
    // placeholder could not have closed, because its handle is shut before the staged file arrives.
    vi.mocked(link).mockImplementationOnce(async (_existing, target) => {
      await writeFile(target, OTHER);
      throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    });
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', crypto.randomUUID());
    expect(written).toEqual({ outcome: 'failed', code: 'EXPORT_CREATE_UNSUPPORTED' });
    expect(new Uint8Array(await readFile(destination))).toEqual(OTHER);
    expect(await partials()).toEqual([]);
  });

  it('holds no pathname it could lose: a swap just before publication finds nothing of the export to publish over it', async () => {
    const destination = join(folder, '换过的.docx');
    // The exact race of the review: another program replaces the chosen name after an exclusive placeholder
    // closed and before the staged file is renamed over it. A create no longer renames at all, so the swap has
    // nothing to race against, and the file that program wrote is the one that stays.
    const { rename: realRename } = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await writeFile(to, OTHER);
      await realRename(from, to);
    });
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', crypto.randomUUID());
    expect(written).toEqual({ outcome: 'failed', code: 'EXPORT_CREATE_UNSUPPORTED' });
    expect(vi.mocked(rename)).not.toHaveBeenCalled();
    expect(await readdir(folder)).toEqual([]);
    vi.mocked(rename).mockImplementation(realRename);
  });

  it('still replaces the file the editor chose to replace: that needs no hard link', async () => {
    const destination = join(folder, '覆盖.docx');
    await writeFile(destination, OTHER);
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'replace', crypto.randomUUID());
    expect(written).toEqual({ outcome: 'replaced', bytes: PAYLOAD.byteLength, sha256: digest(PAYLOAD) });
    expect(new Uint8Array(await readFile(destination))).toEqual(PAYLOAD);
    expect(vi.mocked(link)).not.toHaveBeenCalled();
    expect(await partials()).toEqual([]);
  });
});
