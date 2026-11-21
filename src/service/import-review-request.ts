import type { DatabaseSync } from 'node:sqlite';
import { asNumber, asString, canonicalJson, sha256, type SqlRow } from './store-records.js';

export function commitRequestFingerprint(
  operationKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport',
  input: { draftId: string; expectedDraftVersion: number; reviewDigest: string; commitId: string; acceptDegradation?: boolean },
): string {
  const { acceptDegradation, ...legacy } = input;
  return sha256(canonicalJson(acceptDegradation === true && operationKind === 'manuscript-reimport'
    ? { schema: 'ai7.import-commit-request/2', operationKind, input: { ...legacy, acceptDegradation: true } }
    : { schema: 'ai7.import-commit-request/1', operationKind, input: legacy }));
}


/** A commit can accept fidelity without changing the review the editor submitted. */
export function reimportAcceptanceRecorded(db: DatabaseSync, comparison: SqlRow, record: SqlRow, required: boolean): boolean {
  if (!required) return asNumber(comparison.degradation_accepted) === 0;
  if (asNumber(comparison.degradation_accepted) === 1) return true;
  const commit = db.prepare('SELECT * FROM import_commits WHERE commit_id = ?').get(asString(record.commit_id)) as SqlRow | undefined;
  return commit !== undefined && asString(commit.request_fingerprint) === commitRequestFingerprint('manuscript-reimport', {
    draftId: asString(commit.draft_id), expectedDraftVersion: asNumber(commit.expected_draft_version),
    reviewDigest: asString(commit.review_digest), commitId: asString(record.commit_id), acceptDegradation: true,
  });
}
