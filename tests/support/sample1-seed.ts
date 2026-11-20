import { cpSync } from 'node:fs';
import { afterAll } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import {
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from './sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from './temp-data-root.js';

/**
 * One imported `sample1` store per test file, copied for each case (#1621).
 *
 * The seed is built on first use: a data root in which exact `sample1` is imported as a new Book, the editorial workspace
 * profile is pinned at Revision 2 and (when named) one missing-credential connection is recorded, by the same helpers
 * the cases used to call themselves, in a store opened with its default options and closed cleanly. `place` copies that
 * root into a case's own data root before the case opens its OWN store with its own options, so a case still has a store,
 * a data root and a Book of its own and shares no state with another. What every case now holds equal is exactly what the
 * import made: the Book, Manuscript, Branch and Revision ids, the connection's credential reference, the timestamps stored
 * inside the copied root and the store identity. A case that tests the import itself, or imports a second Book into an open
 * store, keeps `importSample1Book`.
 */
export interface Sample1Seed {
  readonly book: { readonly bookId: string; readonly manuscriptId: string; readonly branchId: string; readonly revisionId: string };
  /** The credential reference of the recorded connection, or null when the seed records none. */
  readonly credentialReference: string | null;
  /** Copies the seeded data root to `dataRoot`, which the case's store then opens. */
  place(dataRoot: string): void;
}

export interface Sample1SeedOptions {
  /** The imported Book's title. */
  readonly title: string;
  /** The name of the missing-credential connection to record, or null for none. */
  readonly connectionName: string | null;
  /** Pin the editorial workspace profile at Revision 2 (default true). */
  readonly pinProfile?: boolean;
}

export function sample1Seed(options: Sample1SeedOptions): () => Promise<Sample1Seed> {
  let built: Promise<{ roots: ServiceTestRoots; seed: Sample1Seed }> | null = null;
  const build = async (): Promise<{ roots: ServiceTestRoots; seed: Sample1Seed }> => {
    const roots = await createServiceTestRoots('ai7-sample1-seed-');
    try {
      await requireExactSample1(roots.codeRoot);
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const book = await importSample1Book(store, roots.codeRoot, options.title);
        if (options.pinProfile !== false) await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
        const credentialReference = options.connectionName === null ? null : recordMissingCredentialConnection(store, options.connectionName);
        store.markCleanShutdown();
        return { roots, seed: { book, credentialReference, place: (dataRoot) => cpSync(roots.dataRoot, dataRoot, { recursive: true }) } };
      } finally { store.close(); }
    } catch (error) {
      await roots.dispose();
      throw error;
    }
  };
  afterAll(async () => { if (built !== null) await (await built.catch(() => null))?.roots.dispose(); });
  return async () => (await (built ??= build())).seed;
}
