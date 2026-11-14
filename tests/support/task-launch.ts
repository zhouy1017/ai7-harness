import { recordMissingCredentialConnection } from './sample1-baseline.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';

/** Populate the instance table through the real launch owner, using the test's admitted SampleBook. */
export function launchLocalForSnapshot(store: EditorialStore, codeRoot: string, bookId: string): string {
  if (store.getModelServiceConnections().length === 0) recordMissingCredentialConnection(store, '本地启动测试的缺失凭据元数据');
  const clientCommandId = randomUUID();
  store.launchReviewRun({ bookId, clientCommandId, categoryIds: ['local-text-check'],
    scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null },
    localCheck: { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false,
      excludedRanges: [], doubledEllipsisBlockIds: [], tables: { characters: true, variantWords: true, houseWordList: null, bookTerms: [] } } }, resolveSourceCheckoutLaunchPolicySync(codeRoot));
  return clientCommandId;
}

export async function inspectLaunchSnapshots<T>(dataRoot: string, read: (db: DatabaseSync) => T): Promise<T> {
  const { configureDatabase } = await import('../../src/service/store-schema.js');
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'));
  try { configureDatabase(db); return read(db); } finally { db.close(); }
}
