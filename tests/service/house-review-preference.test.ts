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

function source(overrides: Partial<HousePreferenceSource> = {}): HousePreferenceSource {
  return { bookId: randomUUID(), bookTitle: '合成反馈图书', categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语', materialDigest: 'a'.repeat(64),
    decisionId: randomUUID(), eligibilityDecisionId: randomUUID(), eligibility: 'house', operationalScope: 'ordinary-production',
    disposition: 'rejected', reason: '作者甲和责编乙认为应保留原有写法', attribution: { peopleVersion: 1, authors: ['作者甲'], editors: ['责编乙'] },
    quality: { applied: 0, surviving: 0, editVolume: 0, lineageDigest: 'b'.repeat(64) }, ...overrides };
}

/** The decision ledger the consumption guard reads (Issue #912), without the Books it names. */
function withEligibility(db: DatabaseSync): void {
  db.exec(LEARNING_ELIGIBILITY_SCHEMA_SQL.learning_eligibility_decisions.replace('REFERENCES books(book_id)', ''));
}

function ledgerOf(): { db: DatabaseSync; ledger: HouseReviewPreferenceLedger } {
  const db = new DatabaseSync(':memory:');
  for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL)) db.exec(sql);
  for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL)) db.exec(sql);
  withEligibility(db);
  return { db, ledger: new HouseReviewPreferenceLedger(db) };
}

describe('house review preference ledger', () => {
  it('isolates production and development, bounds text, preserves attribution and appends immutable successors only on change', () => {
    const db = new DatabaseSync(':memory:');
    try {
      for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL)) db.exec(sql);
      for (const sql of Object.values(HOUSE_REVIEW_PREFERENCE_TRIGGER_SQL)) db.exec(sql);
      withEligibility(db);
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
      expect(ledger.use('ordinary-production', production.bookId, production.categoryId)).toBeNull();
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
      withEligibility(db);
      const ledger = new HouseReviewPreferenceLedger(db);
      const material = source({ eligibility: 'book' });
      ledger.rebuild('ordinary-production', [material]);
      expect(ledger.use('ordinary-production', randomUUID(), material.categoryId)).toBeNull();
      expect(ledger.use('ordinary-production', material.bookId, 'style-and-format')).toBeNull();
      const use = ledger.use('ordinary-production', material.bookId, material.categoryId)!;
      const run = randomUUID(); const task = randomUUID(); const digest = 'e'.repeat(64);
      db.exec('CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY); CREATE TABLE analysis_task_intents(task_intent_id TEXT PRIMARY KEY);');
      db.prepare('INSERT INTO review_runs VALUES (?)').run(run); db.prepare('INSERT INTO analysis_task_intents VALUES (?)').run(task);
      ledger.pin(run, task, digest, use); ledger.pin(run, task, digest, use);
      expect(db.prepare('SELECT count(*) AS n FROM review_run_preference_pins').get()!.n).toBe(1);
      expect(ledger.pinned(task)).toEqual(use);
      expect(() => ledger.pin(run, task, 'f'.repeat(64), use)).toThrow();
      expect(() => db.prepare('DELETE FROM review_run_preference_pins').run()).toThrow('IMMUTABLE');
    } finally { db.close(); }
  });

  it('reads each source\'s own quality, strips every named person, puts house lines first and gives each category its own lines (#911 review)', () => {
    const { db, ledger } = ledgerOf();
    try {
      const bookId = '00000000-0000-4000-8000-000000000001';
      // A Book-only line would sort first by its Book; house lines, which every Book's Run reads, still lead.
      const bookOnly = source({ bookId, eligibility: 'book', categoryId: 'typos-and-usage', reason: '只在本书', materialDigest: '1'.repeat(64) });
      const kept = source({ categoryId: 'typos-and-usage', disposition: 'accepted', reason: '校对王四认为应统一', materialDigest: '2'.repeat(64),
        quality: { applied: 1, surviving: 0, editVolume: 3, lineageDigest: 'c'.repeat(64) } });
      const excluded = source({ categoryId: 'typos-and-usage', eligibility: 'excluded', disposition: 'accepted', materialDigest: '3'.repeat(64),
        quality: { applied: 5, surviving: 5, editVolume: 0, lineageDigest: 'd'.repeat(64) } });
      const style = source({ categoryId: 'style-and-format', categoryLabel: '体例与格式', disposition: 'rejected', reason: '体例从旧', materialDigest: '4'.repeat(64) });
      const version = ledger.rebuild('ordinary-production', [bookOnly, kept, excluded, style], ['王四'])!;
      expect(version.sourceCount).toBe(3);
      expect(version.lines.map((line) => [line.categoryId, line.bookId])).toEqual([['style-and-format', null], ['typos-and-usage', null], ['typos-and-usage', bookId]]);
      const typos = version.lines[1]!.text;
      // The excluded source's five surviving targets never count: only the admitted one, written over, is read.
      expect(typos).toContain('采纳1、未采纳0；应用后常再改，注意编辑改写偏好');
      expect(typos).toContain('校对认为应统一');
      expect(typos).not.toContain('王四');
      expect(ledger.use('ordinary-production', bookId, 'typos-and-usage')!.lines).toEqual([version.lines[2]!.text, typos]);
      expect(ledger.use('ordinary-production', randomUUID(), 'typos-and-usage')!.lines).toEqual([typos]);
      expect(ledger.use('ordinary-production', bookId, 'style-and-format')!).toMatchObject({ lines: [version.lines[0]!.text], sourceCount: 1 });
      expect(ledger.use('ordinary-production', bookId, 'literary-expression')).toBeNull();
      // Only a changed material set, or lines that read differently, make a version: new lineage alone does not.
      expect(ledger.rebuild('ordinary-production', [bookOnly, { ...kept, quality: { ...kept.quality, lineageDigest: 'e'.repeat(64) } }, excluded, style], ['王四'])!.versionId).toBe(version.versionId);
      const reread = ledger.rebuild('ordinary-production', [bookOnly, { ...kept, quality: { ...kept.quality, surviving: 1 } }, excluded, style], ['王四'])!;
      expect(reread).toMatchObject({ ordinal: 2, supersedes: version.versionId, materialSetDigest: version.materialSetDigest });
      expect(reread.lines[1]!.text).toContain('应用后多保留');
      expect(ledger.history('ordinary-production').map((entry) => entry.ordinal)).toEqual([1, 2]);
    } finally { db.close(); }
  });

  it('migrates an exact revision-78 store additively and refuses a terminal store with missing preference relations', async () => {
    roots = await createServiceTestRoots('ai7-house-preference-schema-');
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.markCleanShutdown(); store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    let db = new DatabaseSync(path);
    const before = db.prepare('SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all();
    // Synchronized delta with Issue #423 (slice 7a): a predecessor of revision 80 has no drafts and the narrower Task Intents.
    restoreTaskIntentDraftPredecessor(db);
    dropHouseReviewPreferenceRelations(db); db.exec('PRAGMA user_version = 78'); db.close();
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

  it('traces a pinned category by identity when another category has identical preference text (#912 review)', () => {
    const { db, ledger } = ledgerOf();
    try {
      const first = source({ categoryId: 'typos-and-usage', categoryLabel: '合成同名类别', reason: null });
      const other = source({ categoryId: 'style-and-format', categoryLabel: '合成同名类别', reason: null });
      ledger.rebuild('ordinary-production', [first, other]);
      const run = randomUUID(); const task = randomUUID();
      db.exec('CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY); CREATE TABLE analysis_task_intents(task_intent_id TEXT PRIMARY KEY, book_id TEXT, kind TEXT);');
      db.prepare('INSERT INTO review_runs VALUES (?)').run(run);
      db.prepare('INSERT INTO analysis_task_intents VALUES (?, ?, ?)').run(task, first.bookId, 'editorial-review/typos-and-usage');
      ledger.pin(run, task, 'e'.repeat(64), ledger.use('ordinary-production', first.bookId, first.categoryId)!);
      expect(ledger.pinnedInfluence(task)!.sources.map((entry) => entry.eligibilityDecisionId)).toEqual([first.eligibilityDecisionId]);
    } finally { db.close(); }
  });

  it('composes no block from a version whose material was withdrawn after its admission, and a re-inclusion restores none of it (#912)', () => {
    const { db, ledger } = ledgerOf();
    try {
      const material = source();
      const bookId = material.bookId;
      const decide = (decisionId: string, ordinal: number, choice: string, supersedes: string | null, recordedAt: string) => {
        const record = canonicalRecord({ schema: 'ai7.learning-eligibility-decision/1', decisionId, bookId, materialKey: 'review-disposition:x',
          materialDigest: material.materialDigest, ordinal, choice, supersedes, recordedAt, actor: '本机编辑', basis: LEARNING_ELIGIBILITY_POLICY_BASIS, note: null });
        db.prepare('INSERT INTO learning_eligibility_decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(decisionId, bookId, 'review-disposition:x', material.materialDigest,
          ordinal, choice, supersedes, recordedAt, record.json, record.digest);
      };
      decide(material.eligibilityDecisionId, 1, 'house', null, '2026-10-17T00:00:00.000Z');
      ledger.rebuild('ordinary-production', [material]);
      expect(ledger.use('ordinary-production', bookId, material.categoryId)).not.toBeNull();
      expect(withdrawalOf(db, material.eligibilityDecisionId)).toEqual({ materialKey: 'review-disposition:x', withdrawnAt: null });
      const excluded = randomUUID();
      decide(excluded, 2, 'excluded', material.eligibilityDecisionId, '2026-10-17T01:00:00.000Z');
      // The version still holds it (no rebuild in this scope yet): it reads as none, never as a block.
      expect(ledger.use('ordinary-production', bookId, material.categoryId)).toBeNull();
      decide(randomUUID(), 3, 'house', excluded, '2026-10-17T02:00:00.000Z');
      expect(withdrawalOf(db, material.eligibilityDecisionId)).toEqual({ materialKey: 'review-disposition:x', withdrawnAt: '2026-10-17T01:00:00.000Z' });
      expect(ledger.use('ordinary-production', bookId, material.categoryId)).toBeNull();
      expect(withdrawalOf(db, randomUUID())).toEqual({ materialKey: null, withdrawnAt: null });
      // A damaged SQL projection must not make the earlier exclusion disappear from the consumption guard.
      db.prepare("UPDATE learning_eligibility_decisions SET choice = 'house' WHERE ordinal = 2").run();
      expect(() => ledger.use('ordinary-production', bookId, material.categoryId)).toThrow('学习准入记录已损坏');
    } finally { db.close(); }
  });
});
