import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { HouseReviewPreferenceLedger, withdrawalOf, HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL, preferenceLines, type HousePreferenceSource } from '../../src/service/house-review-preference.js';
import { EditorialStore } from '../../src/service/store.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { LEARNING_ELIGIBILITY_POLICY_BASIS, LEARNING_ELIGIBILITY_SCHEMA_SQL, LOCAL_LEARNING_POLICY_BASIS } from '../../src/service/learning-eligibility.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { dropHouseReviewPreferenceRelations, restoreTaskIntentDraftPredecessor } from '../support/pre74-schema.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';

let roots: ServiceTestRoots | undefined;
afterEach(async () => { await roots?.dispose(); roots = undefined; });

describe('house review preference schema', () => {
  it('migrates an exact revision-78 store additively and refuses a terminal store with missing preference relations', async () => {
    roots = await createServiceTestRoots('ai7-house-preference-schema-');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    let db = new DatabaseSync(path);
    const before = db.prepare('SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all();
    // Synchronized delta with Issue #423 (slice 7a): a predecessor of revision 80 has no drafts and the narrower Task Intents.
    restoreTaskIntentDraftPredecessor(db);
    dropHouseReviewPreferenceRelations(db); execPre74Fixture(db, 'PRAGMA user_version = 78'); db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.inspectHouseReviewPreference().current).toBeNull();
    expect(store.inspectHouseReviewPreference().basis).toBe(LOCAL_LEARNING_POLICY_BASIS.text);
    store.markCleanShutdown(); store.close();
    db = new DatabaseSync(path);
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(LATEST_SCHEMA_VERSION);
    expect(db.prepare('SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all()).toEqual(before);
    expect(MERGE_TABLE_POLICY.house_review_preference_versions).toBe('house');
    expect(MERGE_TABLE_POLICY.review_run_preference_pins).toBe('owned');
    dropHouseReviewPreferenceRelations(db); db.close();
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  }, 120_000);

});
