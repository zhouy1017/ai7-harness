import { randomUUID } from 'node:crypto';
import { editorialMemoryDatabase } from '../../../support/domain/editorial-memory.js';
import { describe, expect, it } from 'vitest';
import { canonicalRecord, sha256Hex } from '../../../../src/service/analysis/canonical.js';
import { LearningEligibilityLedger, LEARNING_ELIGIBILITY_POLICY_BASIS, LOCAL_LEARNING_POLICY_BASIS, reviewDispositionCandidate, learningMaterialDigest, learningRemediationPreview } from '../../../../src/service/learning-eligibility.js';

describe('学习准入 policy bases', () => {
  it('reads a decision made under basis version 1 and records the next one under version 2 (Issue #1082)', () => {
    const db = editorialMemoryDatabase();
    try {
      const bookId = randomUUID();
      db.prepare('INSERT INTO books(book_id, stable_identity, title, created_at) VALUES (?, ?, ?, ?)').run(bookId, `book:${bookId}`, '合成准入图书', '2026-10-23T00:00:00.000Z');
      const candidate = reviewDispositionCandidate({ signalId: randomUUID(), reviewRunId: randomUUID(), findingId: 'rvf_basis', categoryLabel: '文字',
        reason: '准入版本理由', recordedAt: '2026-10-23T00:00:00.000Z' }, false);
      const digest = learningMaterialDigest(candidate);
      const decisionId = randomUUID(); const recordedAt = '2026-10-23T00:00:01.000Z';
      const attribution = { peopleVersion: 0, authors: [], editors: [] };
      const record = canonicalRecord({ schema: 'ai7.learning-eligibility-decision/1', decisionId, bookId, materialKey: candidate.materialKey, materialDigest: digest,
        kind: candidate.kind, ordinal: 1, choice: 'book', note: null, basis: LEARNING_ELIGIBILITY_POLICY_BASIS, attribution, supersedes: null, actor: '本机编辑', recordedAt });
      db.prepare('INSERT INTO learning_eligibility_decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(decisionId, bookId, candidate.materialKey, digest, 1, 'book', null, recordedAt, record.json, record.digest);
      const ledger = new LearningEligibilityLedger(db);
      ledger.decide({ bookId, candidate, expectedDecisions: 1, choice: 'excluded', note: null, attribution });
      expect(ledger.history(bookId, candidate.materialKey).map((entry) => [entry.choice, entry.basis])).toEqual([
        ['book', LEARNING_ELIGIBILITY_POLICY_BASIS], ['excluded', LOCAL_LEARNING_POLICY_BASIS]]);
    } finally { db.close(); }
  });
});

describe('学习补救影响预览, the pure reading', () => {
  const book = { bookId: randomUUID(), title: '纯函数' };
  const key = (index: number) => `proposal-decision:00000000-0000-4000-8000-00000000000${index}`;
  const digest = (index: number) => sha256Hex(String(index));
  const standingOf = (choice: 'book' | 'house' | 'excluded' | null, kind: 'proposal-decision' | 'review-disposition' = 'proposal-decision', state: 'decided' | 'pending' | 'changed' = 'decided') =>
    (index: number) => ({
      candidate: { kind, originLabel: `来源${index}` },
      projection: { digest: digest(index), decisions: 1, state: choice === null ? 'pending' as const : state, decision: choice === null ? null : { choice, note: null, decidedAt: '2026-10-08T00:00:00.000Z' } },
    });

  it('binds the digest to every shown fact, and leaves out a different kind', () => {
    const table = new Map([[key(1), standingOf('book')(1)], [key(2), standingOf('book', 'review-disposition')(2)], [key(3), standingOf('book', 'proposal-decision', 'changed')(3)]]);
    const items = [1, 2, 3].map((index) => ({ materialKey: key(index), materialDigest: digest(index), expectedDecisions: 1 }));
    const preview = learningRemediationPreview(book, items, (materialKey) => table.get(materialKey) ?? null);
    expect([preview.included.map((entry) => entry.originLabel), preview.leftOut.map((entry) => [entry.originLabel, entry.reason])]).toEqual([
      ['来源1'], [['来源2', 'different-kind'], ['来源3', 'not-included']],
    ]);
    // Each fact the preview shows moves its digest.
    const again = (mutate: (value: ReturnType<ReturnType<typeof standingOf>>) => void, index = 1) => {
      const changed = new Map(table);
      const entry = structuredClone(table.get(key(index))!);
      mutate(entry);
      changed.set(key(index), entry);
      return learningRemediationPreview(book, items, (materialKey) => changed.get(materialKey) ?? null).previewDigest;
    };
    expect(learningRemediationPreview(book, items, (materialKey) => table.get(materialKey) ?? null).previewDigest).toBe(preview.previewDigest);
    expect(again((entry) => { (entry.projection as { decisions: number }).decisions = 2; })).not.toBe(preview.previewDigest);
    // A chain that moved on and was read again at its new count is another preview, though every shown line reads the same.
    const later = new Map(table);
    later.set(key(1), { ...table.get(key(1))!, projection: { ...table.get(key(1))!.projection, decisions: 3 } });
    const reread = learningRemediationPreview(book, [{ ...items[0]!, expectedDecisions: 3 }, items[1]!, items[2]!], (materialKey) => later.get(materialKey) ?? null);
    expect([reread.included, reread.leftOut]).toEqual([preview.included, preview.leftOut]);
    expect(reread.previewDigest).not.toBe(preview.previewDigest);
    expect(learningRemediationPreview({ ...book, bookId: randomUUID() }, items, (materialKey) => table.get(materialKey) ?? null).previewDigest).not.toBe(preview.previewDigest);
    expect(learningRemediationPreview(book, items.slice(0, 2), (materialKey) => table.get(materialKey) ?? null).previewDigest).not.toBe(preview.previewDigest);
    expect(learningRemediationPreview(book, [items[1]!, items[0]!, items[2]!], (materialKey) => table.get(materialKey) ?? null).previewDigest).not.toBe(preview.previewDigest);
  });
});
