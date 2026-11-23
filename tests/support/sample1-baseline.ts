import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
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
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.equal(metadata.size, SAMPLE1_BYTES);
  assert.equal(createHash('sha256').update(await readFile(sample1Path(codeRoot))).digest('hex'), SAMPLE1_SHA256);
}

export async function importSample1Book(
  store: EditorialStore,
  codeRoot: string,
  title: string,
): Promise<{ bookId: string; manuscriptId: string; branchId: string; revisionId: string }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(codeRoot));
  assert.equal(staged.source.sourceSha256, SAMPLE1_SHA256);
  // A second import of the same file is offered as a new Book of a distinct intended work (the identity
  // finding discloses the first); the first import is offered as a plain new Book.
  const choice = staged.targetChoices.find((entry) => entry.kind === 'new-book');
  assert.notEqual(choice, undefined);
  const target = { kind: 'new-book', choiceId: choice!.id as 'new-book' | 'new-book-distinct-intended-work', confirmedTitle: title } as const;
  // ADR 0086: sample1's inline styles and its one section are retained with the file, so its review
  // asks for no Import Degradation Decision and is formed at once.
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
  assert.equal(review.degradationDecision.state, 'not-required-clean-import');
  assert.notEqual(review.reviewDigest, null);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  assert.equal(commit.completionLabel, '稿件已导入');
  assert.deepEqual(await store.acknowledgeImportCompletion(commitId), { state: 'acknowledged' });
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId, revisionId: commit.revisionId };
}

export async function pinEditorialWorkspaceProfileRevision2(store: EditorialStore, bookId: string): Promise<void> {
  const installed = await store.installEditorialWorkspaceProfile(bookId);
  assert.equal(installed.lifecycle.state, 'installed-disabled');
  const enabled = await store.enableEditorialWorkspaceProfile(bookId);
  assert.equal(enabled.sidecar.activeRevision, 2);
}

/** One Main Editorial Role connection whose credential was never present: only nonsecret metadata. */
export function recordMissingCredentialConnection(store: EditorialStore, connectionName: string): string {
  const credentialReference = randomUUID();
  const saved = store.saveModelServiceConnection(connectionName, credentialReference, 'needs-attention');
  assert.equal(saved.credentialReference, credentialReference);
  assert.equal(store.setModelServiceCredentialState(credentialReference, 'missing').credentialOperationState, 'missing');
  return credentialReference;
}
