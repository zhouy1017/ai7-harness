import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { HouseReviewPreferenceLedger, HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL, preferenceLines, type HousePreferenceSource } from '../../src/service/house-review-preference.js';
import { EditorialStore } from '../../src/service/store.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { dropHouseReviewPreferenceRelations } from '../support/pre74-schema.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';

let roots: ServiceTestRoots | undefined;
afterEach(async () => { await roots?.dispose(); roots = undefined; });

function source(overrides: Partial<HousePreferenceSource> = {}): HousePreferenceSource {
  return { bookId: randomUUID(), bookTitle: '合成反馈图书', categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语', materialDigest: 'a'.repeat(64),
    decisionId: randomUUID(), eligibilityDecisionId: randomUUID(), eligibility: 'house', operationalScope: 'ordinary-production',
    disposition: 'rejected', reason: '作者甲和责编乙认为应保留原有写法', attribution: { peopleVersion: 1, authors: ['作者甲'], editors: ['责编乙'] },
    quality: { applied: 0, surviving: 0, editVolume: 0, lineageDigest: 'b'.repeat(64) }, ...overrides };
}

describe('house review preference ledger', () => {
  it('isolates production and development, bounds text, preserves attribution and appends immutable successors only on change', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL)) db.exec(sql);
      for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL)) db.exec(sql);
      const ledger = new HouseReviewPreferenceLedger(db);
      const production = source();
      const development = source({ operationalScope: 'developer-live', materialDigest: 'c'.repeat(64) });
      const fixture = source({ operationalScope: 'development-ci', materialDigest: 'd'.repeat(64) });
      expect(ledger.rebuild('ordinary-production', [development, fixture])).toBeNull();
      const first = ledger.rebuild('ordinary-production', [production, development, fixture, source({ eligibility: 'excluded' }), source({ eligibility: 'deferred' })])!;
      expect(first.sourceCount).toBe(1);
      expect(first.lines[0]!.text.includes('作者甲')).toBe(false);
      expect(first.lines[0]!.text.includes('责编乙')).toBe(false);
      expect(first.lines[0]!.sources[0]!.attribution).toEqual(production.attribution);
      expect(ledger.rebuild('ordinary-production', [production])!.versionId).toBe(first.versionId);
      expect(ledger.rebuild('developer-live', [production, fixture])).toBeNull();
      const dev = ledger.rebuild('developer-live', [development, production])!;
      expect(dev.lines.flatMap((line) => line.sources).map((entry) => entry.materialDigest)).toEqual([development.materialDigest]);
      const empty = ledger.rebuild('ordinary-production', [])!;
      expect(empty.supersedes).toBe(first.versionId);
      expect(empty.ordinal).toBe(2);
      expect(ledger.use('ordinary-production', production.bookId)).toBeNull();
      expect(() => db.prepare('UPDATE house_review_preference_versions SET ordinal = 3').run()).toThrow('IMMUTABLE');
      expect(() => db.prepare('DELETE FROM house_review_preference_versions').run()).toThrow('IMMUTABLE');
      const many = Array.from({ length: 30 }, (_, index) => source({ categoryId: `category-${index}`, categoryLabel: '类别', reason: '字'.repeat(300) }));
      const lines = preferenceLines(many);
      expect(lines.length).toBeLessThanOrEqual(12);
      expect(lines.reduce((sum, line) => sum + Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(line.text)).length, 0)).toBeLessThanOrEqual(200);
    } finally { db.close(); }
  });

  it('keeps Book-only feedback in its exact Book and records an idempotent, by-value Run pin', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL)) db.exec(sql);
      for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL)) db.exec(sql);
      const ledger = new HouseReviewPreferenceLedger(db);
      const material = source({ eligibility: 'book' });
      ledger.rebuild('ordinary-production', [material]);
      expect(ledger.use('ordinary-production', randomUUID())).toBeNull();
      const use = ledger.use('ordinary-production', material.bookId)!;
      const run = randomUUID(); const task = randomUUID(); const digest = 'e'.repeat(64);
      db.exec('CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY); CREATE TABLE analysis_task_intents(task_intent_id TEXT PRIMARY KEY);');
      db.prepare('INSERT INTO review_runs VALUES (?)').run(run); db.prepare('INSERT INTO analysis_task_intents VALUES (?)').run(task);
      ledger.pin(run, task, digest, use); ledger.pin(run, task, digest, use);
      expect(db.prepare('SELECT count(*) AS n FROM review_run_preference_pins').get()!.n).toBe(1);
      expect(ledger.pinned(task, digest)).toEqual(use);
      expect(() => ledger.pin(run, task, 'f'.repeat(64), use)).toThrow();
      expect(() => db.prepare('DELETE FROM review_run_preference_pins').run()).toThrow('IMMUTABLE');
    } finally { db.close(); }
  });

  it('migrates an exact revision-78 store additively and refuses a terminal store with missing preference relations', async () => {
    roots = await createServiceTestRoots('ai7-house-preference-schema-');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    let db = new DatabaseSync(path);
    const before = db.prepare('SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all();
    dropHouseReviewPreferenceRelations(db); db.exec('PRAGMA user_version = 78'); db.close();
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    expect(store.inspectHouseReviewPreference().current).toBeNull();
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
