import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Disposable roots for the service-integration suites (Local Verification Ladder L2, ADR 0062).
// `EditorialStore.open` resolves the built-in DSH Profile and the native-artifact source beneath the
// code root and refuses an Agent Data Root that resolves inside it, so the two roots stay separate:
// the code root is the repository checkout, and the Agent Data Root is a canonical temporary
// directory the suite deletes again. Generated DOCX input stays outside the Agent Data Root so no
// test input is mistaken for product-owned data.

export interface ServiceTestRoots {
  /** Canonical Agent Data Root; the store creates and owns its own tree beneath it. */
  readonly dataRoot: string;
  /** Scratch directory for generated DOCX input, deliberately outside the Agent Data Root. */
  readonly inputRoot: string;
  /** The repository checkout, canonical and alias-free. */
  readonly codeRoot: string;
  dispose(): Promise<void>;
}

/**
 * The repository checkout. `loadBuiltInManuscriptProfile` requires the manifest path to be its own
 * realpath, so the value is resolved rather than derived lexically.
 */
export async function resolveCodeRoot(): Promise<string> {
  return realpath(fileURLToPath(new URL('../../', import.meta.url)));
}

/**
 * Create one disposable parent holding an Agent Data Root and an input directory. `tmpdir()` is
 * resolved first because a temporary directory reached through an alias would fail the store's
 * canonical-data-root boundary on either host.
 */
export async function createServiceTestRoots(prefix = 'ai7-service-'): Promise<ServiceTestRoots> {
  const parent = await mkdtemp(join(await realpath(tmpdir()), prefix));
  const inputRoot = join(parent, 'input');
  await mkdir(inputRoot);
  return {
    // `EditorialStore.open` creates this directory itself, which is also what the product does.
    dataRoot: join(parent, 'data'),
    inputRoot,
    codeRoot: await resolveCodeRoot(),
    dispose: async () => {
      await rm(parent, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}
