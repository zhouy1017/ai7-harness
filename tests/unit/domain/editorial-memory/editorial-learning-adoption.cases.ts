import { randomUUID } from 'node:crypto';
import { editorialMemoryDatabase } from '../../../support/domain/editorial-memory.js';
import { initializeMemorySourceProjections } from '../../../support/domain/memory-projections.js';
import { expect, it } from 'vitest';
import { EditorialLearningLedger } from '../../../../src/service/learning/ledger.js';
import { canonicalRecord } from '../../../../src/service/analysis/canonical.js';

it('pages rule adoption without loss and compares actual decisions independently for each Book/version', () => {
  const db = editorialMemoryDatabase();
  try {
    // Synthetic decision/finding rows only: this projection reads no manuscript, text example, or provider.
    initializeMemorySourceProjections(db);
    const bookId = randomUUID(); const otherBookId = randomUUID();
    db.prepare('INSERT INTO books(book_id, stable_identity, title, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)').run(bookId, `book:${bookId}`, '合成甲书', '2026-10-17', otherBookId, `book:${otherBookId}`, '合成乙书', '2026-10-17');
    db.prepare('INSERT INTO review_runs(review_run_id, book_id) VALUES (?, ?), (?, ?)').run('run-a', bookId, 'run-b', otherBookId);
    const versions: string[] = [];
    for (let index = 0; index < 45; index++) {
      const versionId = randomUUID(); versions.push(versionId);
      const markId = `mark-${index}`; const accepted = index % 2 === 0;
      db.prepare('INSERT INTO editorial_marks(mark_id, book_id, manuscript_id, branch_id, block_id, status, anchor_state, from_grapheme, to_grapheme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(markId, bookId, 'manuscript', 'branch', markId, accepted ? 'applied' : 'resolved', 'exact', 0, 1);
      db.prepare('INSERT INTO proposal_change_items(item_id, mark_id, current_text, proposed_text) VALUES (?, ?, ?, ?)').run(markId, markId, '合成', '合成');
      db.prepare('INSERT INTO proposal_item_decisions(decision_id, item_id, disposition, ordinal, decided_revision_id, decided_journal_sequence, recorded_at) VALUES (?, ?, ?, 1, ?, 0, ?)').run(`decision-${index}`, markId, accepted ? 'accepted' : 'rejected', 'revision', '2026-10-17');
      const record = canonicalRecord({ referencedRuleVersions: [{ versionId, ordinal: index + 1, lineIndex: 0, text: '合成规则' }] });
      db.prepare(`INSERT INTO review_findings(review_run_id, finding_id, mark_id, category_id, output, canonical_json, sha256) VALUES (?, ?, ?, 'typos-and-usage', ?, ?, ?)`).run('run-a', `finding-${index}`, markId, 'change-suggestion', record.json, record.digest);
    }
    const unreferenced = canonicalRecord({});
    db.prepare(`INSERT INTO review_findings(review_run_id, finding_id, mark_id, category_id, output, canonical_json, sha256) VALUES (?, ?, NULL, 'typos-and-usage', ?, ?, ?)`).run('run-b', 'finding-other', 'annotation', unreferenced.json, unreferenced.digest);
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
