import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { EditorialStore } from '../../src/service/store.js';

/**
 * Exact `sample1` preconditions for the covered-analysis L2 suite, mirroring what J-03 and J-04 do
 * through the product UI: verify the admitted public input, import it as a new Book, pin the
 * editorial workspace profile at Revision 2, and record one Main Editorial Role connection whose
 * credential is not present. No secret value, OS secret store, network, Provider call, or Effect is
 * involved (ADR 0043 / ADR 0044).
 */
export const SAMPLE1_BYTES = 29_550;
export const SAMPLE1_SHA256 = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
export const SAMPLE1_BLOCKS = 97;
export const SAMPLE1_UNITS = 8;

export function sample1Path(codeRoot: string): string {
  return join(codeRoot, 'SampleBooks', 'sample1.docx');
}

export async function requireExactSample1(codeRoot: string): Promise<void> {
  const metadata = await lstat(sample1Path(codeRoot));
  expect(metadata.isFile()).toBe(true);
  expect(metadata.isSymbolicLink()).toBe(false);
  expect(metadata.size).toBe(SAMPLE1_BYTES);
  expect(createHash('sha256').update(await readFile(sample1Path(codeRoot))).digest('hex')).toBe(SAMPLE1_SHA256);
}

export async function importSample1Book(
  store: EditorialStore,
  codeRoot: string,
  title: string,
): Promise<{ bookId: string; manuscriptId: string; branchId: string; revisionId: string }> {
  const staged = await store.stageSelectedDocx(randomUUID(), sample1Path(codeRoot));
  expect(staged.source.sourceSha256).toBe(SAMPLE1_SHA256);
  const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: title } as const;
  const pending = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
  expect(pending.degradationDecision.state).toBe('required-unselected');
  const review = store.prepareNewBookReview(pending.draftId, pending.draftVersion, target, true);
  expect(review.reviewDigest).not.toBeNull();
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  expect(commit.completionLabel).toBe('稿件已导入');
  expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId, revisionId: commit.revisionId };
}

export async function pinEditorialWorkspaceProfileRevision2(store: EditorialStore, bookId: string): Promise<void> {
  const installed = await store.installEditorialWorkspaceProfile(bookId);
  expect(installed.lifecycle.state).toBe('installed-disabled');
  const enabled = await store.enableEditorialWorkspaceProfile(bookId);
  expect(enabled.sidecar.activeRevision).toBe(2);
}

/** One Main Editorial Role connection whose credential was never present: only nonsecret metadata. */
export function recordMissingCredentialConnection(store: EditorialStore, connectionName: string): string {
  const credentialReference = randomUUID();
  const saved = store.saveModelServiceConnection(connectionName, credentialReference, 'needs-attention');
  expect(saved.credentialReference).toBe(credentialReference);
  expect(store.setModelServiceCredentialState(credentialReference, 'missing').credentialOperationState).toBe('missing');
  return credentialReference;
}
