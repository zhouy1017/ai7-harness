/**
 * The Public SampleBooks (ADR 0043, ADR 0044, ADR 0091): the five manuscript files the repository admits, each only by its exact
 * bytes and SHA-256 as `SampleBooks/README.md` lists them. This module is the one owner of that set in code: the developer-live
 * transmittable set and the analysis lineage check read it, so a Book whose source is any of the five is treated exactly as
 * `sample1` is. Renaming identical source bytes preserves admission; altered source bytes or a composed file do not match.
 * This source check preserves the existing treatment of tester edits within an imported sample1 Book (ADR 0088).
 *
 * `sample1` stays separately named: it alone is the ADR 0044 compatibility and recording baseline, the development onboarding
 * sample and the source of every reviewed fixture.
 */
export interface PublicSampleBook {
  /** The exact path under `SampleBooks/`. */
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** Exact `sample1`, the ADR 0044 baseline. */
export const SAMPLE1_PUBLIC_SAMPLEBOOK = {
  path: 'sample1.docx',
  bytes: 29_550,
  sha256: 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483',
} as const satisfies PublicSampleBook;

/** The four public-domain works ADR 0091 admits (decided by the Owner on 2026-10-19, Issue #989), in `SampleBooks/README.md` order. */
export const ADR_0091_PUBLIC_SAMPLEBOOKS = [
  { path: 'luxun-zhaohua-xishi.docx', bytes: 61_890, sha256: '9d515a2245a158bbbcbdb8139e3877d5ee36437ce25a0924b92516c90f973cc7' },
  { path: 'luxun-nahan.docx', bytes: 98_880, sha256: '13afe4783cd2c82f77c99582c62df0fcf13e3aa72ef562fe1d023bf11f1182d3' },
  { path: 'liue-laocan-youji.docx', bytes: 151_564, sha256: 'db25d1a9afe8d3672a789ae8d37a84bc1f8464b014d8621f2403795814cacb8f' },
  { path: 'wujingzi-rulin-waishi.docx', bytes: 425_444, sha256: '2d59edf22ecdb3dbcb7a62c0d7b56daadd066c3349dbeee78bf92f7d59074581' },
] as const satisfies readonly PublicSampleBook[];

/** All five, `sample1` first. */
export const PUBLIC_SAMPLEBOOKS = [SAMPLE1_PUBLIC_SAMPLEBOOK, ...ADR_0091_PUBLIC_SAMPLEBOOKS] as const satisfies readonly PublicSampleBook[];

/** The source digest of one of the five Public SampleBooks. */
export type PublicSampleBookSourceDigest = (typeof PUBLIC_SAMPLEBOOKS)[number]['sha256'];

/** The five source digests, the set a Book's source must be in to count as an admitted Public SampleBook. */
export const PUBLIC_SAMPLEBOOK_SOURCE_DIGESTS: ReadonlySet<string> = new Set(PUBLIC_SAMPLEBOOKS.map((book) => book.sha256));

/** Whether a source digest is exactly one of the five Public SampleBooks'. */
export function isPublicSampleBookSourceDigest(digest: unknown): digest is PublicSampleBookSourceDigest {
  return typeof digest === 'string' && PUBLIC_SAMPLEBOOK_SOURCE_DIGESTS.has(digest);
}
