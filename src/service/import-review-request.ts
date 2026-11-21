import { canonicalJson, sha256 } from './store-records.js';

export function commitRequestFingerprint(
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport',
  input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean },
): string {
  const { acceptDegradation: _acceptance, ...commit } = input;
  return sha256(canonicalJson({ schema: 'ai7.import-commit-request/1', operationKind, input: commit }));
}
