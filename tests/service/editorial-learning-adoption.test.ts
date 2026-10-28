import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { EditorialLearningLedger } from '../../src/service/learning/ledger.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';

it('pages rule adoption without loss and compares actual decisions independently for each Book/version', () => {
  const db = new DatabaseSync(':memory:');
  try {
    // Synthetic decision/finding rows only: this projection reads no manuscript, text example, or provider.
    db.exec(`CREATE TABLE books(book_id TEXT, title TEXT);
      CREATE TABLE review_runs(review_run_id TEXT, book_id TEXT);
      CREATE TABLE editorial_marks(mark_id TEXT, status TEXT);
      CREATE TABLE review_findings(review_run_id TEXT, finding_id TEXT, mark_id TEXT, output TEXT, canonical_json TEXT, sha256 TEXT);
      CREATE TABLE proposal_change_items(item_id TEXT, mark_id TEXT);
      CREATE TABLE proposal_item_decisions(item_id TEXT, disposition TEXT, ordinal INTEGER);
      CREATE TABLE review_finding_dispositions(review_run_id TEXT, finding_id TEXT, disposition TEXT)`);
    const bookId = randomUUID(); const otherBookId = randomUUID();
    db.prepare('INSERT INTO books VALUES (?, ?), (?, ?)').run(bookId, '合成甲书', otherBookId, '合成乙书');
    db.prepare('INSERT INTO review_runs VALUES (?, ?), (?, ?)').run('run-a', bookId, 'run-b', otherBookId);
    const versions: string[] = [];
    for (let index = 0; index < 45; index++) {
      const versionId = randomUUID(); versions.push(versionId);
      const markId = `mark-${index}`; const accepted = index % 2 === 0;
      db.prepare('INSERT INTO editorial_marks VALUES (?, ?)').run(markId, accepted ? 'applied' : 'resolved');
      db.prepare('INSERT INTO proposal_change_items VALUES (?, ?)').run(markId, markId);
      db.prepare('INSERT INTO proposal_item_decisions VALUES (?, ?, 1)').run(markId, accepted ? 'accepted' : 'rejected');
      const record = canonicalRecord({ referencedRuleVersions: [{ versionId, ordinal: index + 1, lineIndex: 0, text: '合成规则' }] });
      db.prepare('INSERT INTO review_findings VALUES (?, ?, ?, ?, ?, ?)').run('run-a', `finding-${index}`, markId, 'change-suggestion', record.json, record.digest);
    }
    const unreferenced = canonicalRecord({});
    db.prepare('INSERT INTO review_findings VALUES (?, ?, NULL, ?, ?, ?)').run('run-b', 'finding-other', 'annotation', unreferenced.json, unreferenced.digest);
    const ledger = new EditorialLearningLedger(db);
    const first = ledger.adoption(null);
    expect(first.preferenceAdoption).toHaveLength(40);
    expect(first.preferenceAdoptionNext).not.toBeNull();
    const second = ledger.adoption(null, first.preferenceAdoptionNext);
    expect(second.preferenceAdoptionNext).toBeNull();
    const rows = [...first.preferenceAdoption, ...second.preferenceAdoption];
    expect(rows).toHaveLength(47);
    expect(new Set(rows.map((row) => `${row.bookId}/${row.versionId}`)).size).toBe(47);
    expect(rows.find((row) => row.bookId === bookId && row.versionId === null)).toMatchObject({
      referenced: { findings: 45, accepted: 23, rejected: 22 }, unreferenced: { findings: 0, rate: null }, mostlyRejected: false,
    });
    expect(rows.find((row) => row.versionId === versions[1])).toMatchObject({
      referenced: { findings: 1, accepted: 0, rejected: 1, rate: 0 }, unreferenced: { findings: 44, accepted: 23 }, mostlyRejected: true,
    });
    expect(ledger.adoption(otherBookId).preferenceAdoption).toMatchObject([{ bookId: otherBookId,
      referenced: { findings: 0, rate: null }, unreferenced: { findings: 1, accepted: 0, rate: 0 } }]);
  } finally { db.close(); }
});
