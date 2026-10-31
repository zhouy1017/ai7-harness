import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  BUILTIN_EVALUATION_PROFILE,
  EVALUATION_RECORD_TRIGGER_SQL,
  EvaluationError,
  EvaluationRecords,
  emptyEvaluationContent,
  evaluationAdoptionsNotice,
  evaluationCarriedMarksNotice,
  evaluationDamagedLatestReason,
  initializeEvaluationInitialDraftSchema,
  initializeEvaluationRecordSchema,
} from '../../src/service/evaluation-records.js';
import type { EvaluationContent } from '../../src/shared/protocol.js';

// Evaluation provenance regressions: #689, #696, #702, #708 and #726.
const ITEMS = BUILTIN_EVALUATION_PROFILE.items.map((item) => item.itemId);
const FIRST = `「${BUILTIN_EVALUATION_PROFILE.items[0]!.label}」的评语`;
const A = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
const B = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
const C = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };

let db: DatabaseSync;
let records: EvaluationRecords;
let bookId: string;
let adoptions: Map<string, typeof A>;
let decisionsReadable: boolean;
let accepted: Map<string, { recordId: string; from: typeof A; items: ReadonlyArray<{ itemId: string; comment: string }>; verdict: string | null }>;
let wordsReadable: boolean;
let bookOf: Map<string, string>;

beforeEach(() => {
  db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  initializeEvaluationRecordSchema(db);
  initializeEvaluationInitialDraftSchema(db);
  adoptions = new Map();
  decisionsReadable = true;
  accepted = new Map();
  wordsReadable = true;
  bookOf = new Map();
  records = new EvaluationRecords(db, { current: () => ({ manuscriptId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', uncheckpointed: false }) },
    undefined, undefined, undefined, {
      adoptionsOf: (recordId) => (decisionsReadable
        ? new Map([...adoptions].filter(([key]) => key.startsWith(`${recordId}:`)).map(([key, from]) => [Number(key.split(':')[1]), from] as const))
        : null),
      acceptedRewrite: (analysisRevisionId) => {
        if (!decisionsReadable) return 'unreadable';
        const taken = accepted.get(analysisRevisionId);
        if (taken === undefined) return null;
        return { bookId: bookOf.get(taken.recordId)!, recordId: taken.recordId, taskIntentId: taken.from.taskIntentId,
          words: wordsReadable ? { items: taken.items, verdict: taken.verdict } : null };
      },
      adoptionStamps: () => decisionStamps(),
    });
  bookId = randomUUID();
});

afterEach(() => {
  db.close();
});

function own(): EvaluationContent {
  const empty = emptyEvaluationContent(BUILTIN_EVALUATION_PROFILE);
  return {
    ...empty,
    items: empty.items.map((item, index) => ({ ...item, score: 12 + index, comment: `编辑的评语 ${index + 1}。` })),
    risks: empty.risks.map((risk) => ({ ...risk, level: 'low', statement: '无。' })),
    verdict: '编辑的总评。',
  };
}

const latest = (recordId: string) => records.rewritable(bookId, recordId);

function save(recordId: string, change: (content: EvaluationContent) => EvaluationContent, finalize = false): void {
  const version = latest(recordId);
  records.save(bookId, recordId, version.entryOrdinal, change(version.content), finalize);
}

function adopt(recordId: string, items: ReadonlyArray<{ itemId: string; comment: string }>, verdict: string | null, from: typeof A): void {
  const version = latest(recordId);
  const ordinal = records.applyRewrite(bookId, recordId, { entryOrdinal: version.entryOrdinal, entrySha256: version.entrySha256 }, { items, verdict }, from);
  adoptions.set(`${recordId}:${ordinal}`, from);
  accepted.set(from.analysisRevisionId, { recordId, from, items, verdict });
}

function decisionStamps(): Map<string, string> | null {
  if (!decisionsReadable) return null;
  const stamps = new Map<string, string>();
  const add = (recordId: string, part: string): void => {
    stamps.set(recordId, `${stamps.get(recordId) ?? ''}${part};`);
  };
  for (const [key, from] of adoptions) add(key.split(':')[0]!, `${key}=${from.analysisRevisionId}`);
  for (const [revisionId, taken] of accepted) add(taken.recordId, `${revisionId}:${JSON.stringify([taken.items, taken.verdict])}`);
  return stamps;
}

function start(fromInitial = false, skipDamaged = false, of = bookId): string {
  const recordId = records.start(of, fromInitial, skipDamaged);
  bookOf.set(recordId, of);
  return recordId;
}

const withComment = (content: EvaluationContent, index: number, comment: string): EvaluationContent =>
  ({ ...content, items: content.items.map((item, at) => (at === index ? { ...item, comment } : item)) });

const words = (recordId: string) => records.ai7Words(bookId, recordId);

const mark = (itemId: string, from: typeof A, words: string): unknown => ({ itemId, ...from, sha256: sha256Hex(words) });
const verdictMark = (from: typeof A, words: string): unknown => ({ ...from, sha256: sha256Hex(words) });

// These fixtures cover provenance refusal/recovery (#689–#726), absent from the migration suites.
// No public API writes malformed or historical marks; assertions read the public owner.
function forge(recordId: string, ordinal: number, change: (entry: Record<string, unknown>) => Record<string, unknown>): void {
  const row = db.prepare('SELECT entry_id, canonical_json FROM evaluation_record_entries WHERE record_id = ? AND ordinal = ?').get(recordId, ordinal) as { entry_id: string; canonical_json: string };
  const forged = canonicalRecord(change(JSON.parse(row.canonical_json) as Record<string, unknown>));
  db.exec('DROP TRIGGER evaluation_record_entries_no_update');
  db.prepare('UPDATE evaluation_record_entries SET canonical_json = ?, sha256 = ? WHERE entry_id = ?').run(forged.json, forged.digest, row.entry_id);
  db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
}

/** One entry's digest no longer that of its row: the version cannot be read. */
function damage(recordId: string, ordinal: number): void {
  db.exec('DROP TRIGGER evaluation_record_entries_no_update');
  db.prepare('UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND ordinal = ?').run(sha256Hex(randomUUID()), recordId, ordinal);
  db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
}

function refused(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof EvaluationError) return error.code;
    throw error;
  }
  return 'none';
}

describe('AI7\'s words in an evaluation entry, item by item (Issue #689)', () => {
  it('marks only the words a 采用 changed, keeps the mark while they stand, and restores it when the editor puts them back', () => {
    const recordId = start();
    expect(words(recordId)).toBeNull();
    save(recordId, () => own());
    expect(words(recordId)).toBeNull();
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[1]!, comment: '编辑的评语 2。' }], '编辑的总评。', A);
    expect(words(recordId)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null });
    adopt(recordId, [{ itemId: ITEMS[2]!, comment: 'AI7 的评语三。' }], 'AI7 的总评。', B);
    const both = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[2]!, B, 'AI7 的评语三。')], verdict: verdictMark(B, 'AI7 的总评。') };
    expect(words(recordId)).toEqual(both);
    save(recordId, (content) => ({ ...content, items: content.items.map((item, index) => (index === 4 ? { ...item, score: 10 } : item)) }));
    expect(words(recordId)).toEqual(both);
    save(recordId, (content) => withComment(content, 0, 'AI7 的评语一，编辑改过。'));
    expect(words(recordId)).toEqual({ items: [mark(ITEMS[2]!, B, 'AI7 的评语三。')], verdict: verdictMark(B, 'AI7 的总评。') });
    save(recordId, (content) => withComment(content, 0, 'AI7 的评语一。'));
    expect(words(recordId)).toEqual(both);
    save(recordId, (content) => ({ ...content, verdict: '编辑定稿的总评。', conclusion: 'revise' }), true);
    const next = start();
    expect(words(recordId)).toEqual({ items: both.items, verdict: null });
    expect(words(next)).toEqual({ items: both.items, verdict: null });

  });

  it('reads an entry written before Issue #689 as the words it changed, and an unmarked entry after it as the words still standing', () => {
    const recordId = start();
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[1]!, comment: 'AI7 的评语二。' }], 'AI7 的总评。', A);
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: A }));
    save(recordId, (content) => withComment(content, 0, '编辑重写的评语一。'));
    const standing = { items: [mark(ITEMS[1]!, A, 'AI7 的评语二。')], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(words(recordId)).toEqual(standing);
    forge(recordId, 4, ({ rewrittenFrom: _words, ...entry }) => entry);
    save(recordId, (content) => ({ ...content, conclusion: 'revise' }));
    expect(words(recordId)).toEqual(standing);
  });

  it('refuses a mark that is not one this owner writes or does not match its entry', () => {
    const recordId = start();
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[2]!, comment: 'AI7 的评语三。' }], 'AI7 的总评。', A);
    const good = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[2]!, A, 'AI7 的评语三。')], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(words(recordId)).toEqual(good);
    const [first, second] = good.items;
    for (const [what, rewrittenFrom] of [
      ['an item the version does not hold', { ...good, items: [mark('no-such-item', A, 'AI7 的评语一。')] }],
      ['items out of the profile\'s order', { ...good, items: [second, first] }],
      ['an item twice', { ...good, items: [first, first] }],
      ['a digest that is not the entry\'s words', { ...good, items: [mark(ITEMS[0]!, A, '别的话。'), second] }],
      ['a 总评 digest that is not the entry\'s', { ...good, verdict: verdictMark(A, '别的总评。') }],
      ['a mark with no digest', { ...good, items: [{ itemId: ITEMS[0]!, ...A }, second] }],
      ['no words at all', { items: [], verdict: null }],
      ['an explicit null', null],
    ] as const) {
      forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom }));
      expect(refused(() => latest(recordId)), what).toBe('EVALUATION_RECORD_INVALID');
    }
    forge(recordId, 3, (entry) => ({ ...entry, content: { ...(entry.content as Record<string, unknown>), verdict: null }, rewrittenFrom: good }));
    expect(refused(() => latest(recordId))).toBe('EVALUATION_RECORD_INVALID');
    forge(recordId, 3, (entry) => ({ ...entry, content: { ...(entry.content as Record<string, unknown>), verdict: 'AI7 的总评。' }, rewrittenFrom: good }));
    expect(refused(() => latest(recordId))).toBe('none');
  });

  it('keeps every mark an item has held: an earlier 采用\'s words pasted back after a later one read as AI7\'s (Issue #696)', () => {
    const recordId = start();
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, A);
    save(recordId, (content) => withComment(content, 0, '编辑的评语一。'));
    expect(words(recordId)).toBeNull();
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R2 的评语一。' }], 'R2 的总评。', B);
    const second = { items: [mark(ITEMS[0]!, B, 'R2 的评语一。')], verdict: verdictMark(B, 'R2 的总评。') };
    expect(words(recordId)).toEqual(second);
    const first = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。')], verdict: verdictMark(B, 'R2 的总评。') };
    save(recordId, (content) => withComment(content, 0, 'R1 的评语一。'));
    expect(words(recordId)).toEqual(first);
    save(recordId, (content) => withComment(content, 0, 'R2 的评语一。'));
    expect(words(recordId)).toEqual(second);
    save(recordId, (content) => ({ ...content, conclusion: 'revise' }), true);
    const next = start();
    expect(words(next)).toEqual(second);
    save(next, (content) => withComment(content, 0, 'R1 的评语一。'));
    expect(words(next)).toEqual(first);
    save(next, (content) => withComment(content, 0, '编辑的评语一。'));
    const r3 = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
    adopt(next, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, r3);
    save(next, (content) => ({ ...content, conclusion: 'revise' }));
    expect(words(next)).toEqual({ items: [mark(ITEMS[0]!, r3, 'R1 的评语一。')], verdict: verdictMark(B, 'R2 的总评。') });
  });

  describe('marks checked against their adoption chain (#696, #702)', () => {
    let recordId: string;
    const first = mark(ITEMS[0]!, A, 'AI7 的评语一。');
    const third = mark(ITEMS[2]!, A, 'AI7 的评语三。');
    const adopted = { items: [first, third], verdict: verdictMark(A, 'AI7 的总评。') };
    const both = { ...adopted, items: [first, mark(ITEMS[1]!, B, 'B 的评语二。'), third] };
    const refusedWith = (ordinal: number, rewrittenFrom: unknown, of = recordId): string => {
      forge(of, ordinal, (entry) => ({ ...entry, rewrittenFrom }));
      return refused(() => latest(of));
    };
    beforeEach(() => {
      recordId = start();
      save(recordId, () => own());
      adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[2]!, comment: 'AI7 的评语三。' }], 'AI7 的总评。', A);
    });

    it('refuses marks not written by the entry\'s adoption', () => {
      for (const rewrittenFrom of [
        { ...adopted, items: [mark(ITEMS[0]!, C, 'AI7 的评语一。'), third] },
        { ...adopted, verdict: verdictMark(C, 'AI7 的总评。') },
        { ...adopted, items: [first, mark(ITEMS[1]!, A, '编辑的评语 2。'), third] }, C,
      ]) expect(refusedWith(3, rewrittenFrom)).toBe('EVALUATION_RECORD_INVALID');
      forge(recordId, 3, ({ rewrittenFrom: _words, ...entry }) => entry);
      expect(refused(() => latest(recordId))).toBe('EVALUATION_RECORD_INVALID');
      expect(refusedWith(3, A)).toBe('none');
      expect(refusedWith(3, adopted)).toBe('none');
      adoptions.delete(`${recordId}:3`);
      expect(refused(() => latest(recordId))).toBe('EVALUATION_RECORD_INVALID');
    });

    it('recovers standing marks omitted by a plain save', () => {
      save(recordId, (content) => ({ ...content, conclusion: 'revise' }));
      for (const rewrittenFrom of [{ ...adopted, items: [first] }, { ...adopted, verdict: null }]) {
        expect(refusedWith(4, rewrittenFrom)).toBe('none');
        expect(words(recordId)).toEqual(adopted);
      }
    });

    it('refuses marks that a plain save could not inherit', () => {
      save(recordId, (content) => ({ ...content, conclusion: 'revise' }));
      for (const from of [C, A]) {
        expect(refusedWith(4, { ...adopted, items: [first, mark(ITEMS[1]!, from, '编辑的评语 2。'), third] })).toBe('EVALUATION_RECORD_INVALID');
      }
      expect(refusedWith(4, adopted)).toBe('none');
    });

    it('requires a second adoption to name its own changed words', () => {
      adopt(recordId, [{ itemId: ITEMS[1]!, comment: 'B 的评语二。' }], null, B);
      expect(words(recordId)).toEqual(both);
      expect(refusedWith(4, adopted)).toBe('EVALUATION_RECORD_INVALID');
      expect(refusedWith(4, both)).toBe('none');
    });

    it('recovers omitted carried marks across versions but refuses marks never held', () => {
      adopt(recordId, [{ itemId: ITEMS[1]!, comment: 'B 的评语二。' }], null, B);
      save(recordId, (content) => ({ ...content, conclusion: 'revise' }), true);
      const next = start();
      expect(words(next)).toEqual(both);
      expect(refusedWith(1, { ...both, items: [third] }, next)).toBe('none');
      expect(words(next)).toEqual(both);
      expect(refusedWith(1, { ...both, items: [first, mark(ITEMS[3]!, A, '编辑的评语 4。'), third] }, next)).toBe('EVALUATION_RECORD_INVALID');
      forge(next, 1, ({ rewrittenFrom: _words, ...entry }) => entry);
      expect(words(next)).toEqual(both);
      save(next, (content) => ({ ...content, conclusion: 'revise' }));
      expect(words(next)).toEqual(both);
    });
  });

  it('reads the histories #692 wrote, which kept only the latest mark per item: a paste-back left unmarked reads as AI7\'s (Issue #702 review)', () => {
    const recordId = start();
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }, { itemId: ITEMS[2]!, comment: 'R1 的评语三。' }], null, A);
    save(recordId, (content) => withComment(content, 0, '编辑的评语一。'));
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R2 的评语一。' }], null, B);
    save(recordId, (content) => withComment(content, 0, 'R1 的评语一。'));
    const r1Third = mark(ITEMS[2]!, A, 'R1 的评语三。');
    const pastedBack = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。'), r1Third], verdict: null };
    expect(words(recordId)).toEqual(pastedBack);
    forge(recordId, 6, (entry) => ({ ...entry, rewrittenFrom: { items: [r1Third], verdict: null } }));
    expect(refused(() => latest(recordId))).toBe('none');
    expect(records.ai7Words(bookId, recordId)).toEqual(pastedBack);
    save(recordId, (content) => ({ ...content, conclusion: 'revise' }));
    expect(words(recordId)).toEqual(pastedBack);

  });

  it('recovers a paste-back omitted by #692 across versions (#702)', () => {
    const v1 = start();
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }, { itemId: ITEMS[2]!, comment: 'R1 的评语三。' }], null, A);
    save(v1, (content) => withComment(content, 0, '编辑的评语一。'));
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    accepted.clear();
    const v2 = start();
    save(v2, (content) => withComment(content, 0, 'R1 的评语一。'));
    const r1Third = mark(ITEMS[2]!, A, 'R1 的评语三。');
    forge(v2, 2, (entry) => ({ ...entry, rewrittenFrom: { items: [r1Third], verdict: null } }));
    expect(refused(() => latest(v2))).toBe('none');
    expect(words(v2)).toEqual({ items: [mark(ITEMS[0]!, A, 'R1 的评语一。'), r1Third], verdict: null });
  });

  it('keeps the marks as recorded and says so when the 采用 records cannot be read (Issue #702 review)', () => {
    const recordId = start();
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], 'AI7 的总评。', A);
    const adopted = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBeNull();
    decisionsReadable = false;
    const page = records.workspace(bookId, '书', recordId);
    expect(page.record!.ai7WordsNotice).toBe(evaluationAdoptionsNotice(`${FIRST}和总评`));
    expect(page.record!.ai7WordsNotice).toBe(`评语重写的采用记录已损坏，AI7 评语的标注无法全部核对；以下仍按 AI7 所写处理：${FIRST}和总评。`);
    expect(records.ai7Words(bookId, recordId)).toEqual(adopted);
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: { ...adopted, items: [mark(ITEMS[0]!, C, 'AI7 的评语一。')] } }));
    expect(refused(() => latest(recordId))).toBe('none');
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: { ...adopted, items: [mark(ITEMS[0]!, A, '别的话。')] } }));
    expect(refused(() => latest(recordId))).toBe('EVALUATION_RECORD_INVALID');
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: adopted }));
    save(recordId, (content) => ({ ...withComment(content, 0, '编辑的评语一。'), verdict: '编辑的总评。' }));
    expect(records.ai7Words(bookId, recordId)).toBeNull();
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBeNull();
    decisionsReadable = true;
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBeNull();
  });

  describe('readable versions around damaged history (#702, #708)', () => {
    let v1: string;
    let v2: string;
    let v3: string;
    beforeEach(() => {
      v1 = start();
      save(v1, () => own());
      adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], null, A);
      save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
      v2 = start();
      save(v2, (content) => ({ ...content, conclusion: 'revise' }), true);
      v3 = start();
      damage(v1, 1);
    });

    it('lists readable versions and checks carried words against the accepted rewrite', () => {
      expect(refused(() => latest(v2))).toBe('none');
      expect(words(v2)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null });
      const page = records.workspace(bookId, '书', v2);
      expect(page).toMatchObject({ unreadableRecords: [1], recordsNext: null, record: { ai7WordsNotice: null, comparison: null } });
      expect(page.records.map((summary) => summary.ordinal)).toEqual([3, 2]);
      expect(records.workspace(bookId, '书', null).record!.ai7WordsNotice).toBeNull();
    });

    it('allows finalization after a damaged earlier version', () => {
      save(v3, (content) => ({ ...content, conclusion: 'revise' }));
      expect(records.finalizedOf(bookId, v2)).not.toBeNull();
      expect(records.latestFinalized(bookId)?.recordId).toBe(v2);
      save(v3, (content) => content, true);
      expect(records.latestFinalized(bookId)?.recordId).toBe(v3);
    });

    it('falls back from a damaged requested version while refusing operations that need it', () => {
      save(v3, (content) => ({ ...content, conclusion: 'revise' }), true);
      expect(records.workspace(bookId, '书', v1)).toMatchObject({ unreadableRecords: [1], record: { recordId: v3 }, start: { allowed: true } });
      expect(refused(() => latest(v1))).toBe('EVALUATION_RECORD_INVALID');
      expect(refused(() => records.workspace(bookId, '书', randomUUID()))).toBe('EVALUATION_NOT_FOUND');
    });

    it('offers a damaged latest finalized entry as a gap but requires explicit skipping', () => {
      save(v3, (content) => ({ ...content, conclusion: 'revise' }), true);
      damage(v3, latest(v3).entryOrdinal);
      expect(refused(() => records.latestFinalized(bookId))).toBe('EVALUATION_RECORD_INVALID');
      for (const asked of [null, v3]) {
        const page = records.workspace(bookId, '书', asked);
        expect(page).toMatchObject({ unreadableRecords: [1, 3], record: { recordId: v2 }, start: { allowed: true, kind: 'again', skipDamaged: { skipped: [3], seedOrdinal: 2 } } });
        expect(page.records.map((summary) => summary.ordinal)).toEqual([2]);
      }
      expect(evaluationDamagedLatestReason(3)).toBe('第 3 版评估记录已损坏，不能重新评估。');
      expect(() => start()).toThrowError(expect.objectContaining({ code: 'EVALUATION_RECORD_INVALID', message: evaluationDamagedLatestReason(3) }));
      expect(refused(() => latest(v2))).toBe('none');
      expect(records.finalizedOf(bookId, v2)).not.toBeNull();
      expect(refused(() => latest(v3))).toBe('EVALUATION_RECORD_INVALID');
    });

    it('offers the same gap when the latest record row cannot be read', () => {
      db.exec('DROP TRIGGER evaluation_records_no_update');
      db.prepare('UPDATE evaluation_records SET sha256 = ? WHERE record_id = ?').run('2'.repeat(64), v3);
      expect(records.workspace(bookId, '书', null)).toMatchObject({ unreadableRecords: [1, 3], record: { recordId: v2 }, start: { allowed: true, skipDamaged: { skipped: [3], seedOrdinal: 2 } } });
    });
  });

  describe('restarting across a damaged gap (#726)', () => {
    beforeEach(() => {
      const v1 = start();
      save(v1, () => own());
      adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], null, A);
      save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
      const v2 = start();
      save(v2, (content) => ({ ...content, conclusion: 'defer' }), true);
      const v3 = start();
      save(v3, (content) => withComment(content, 1, '第三版的评语。'));
      adopt(v3, [{ itemId: ITEMS[1]!, comment: 'R2 的评语二。' }], null, B);
      damage(v3, 1);
    });

    it('seeds from the latest readable finalized version and records the gap', () => {
      expect(refused(() => start())).toBe('EVALUATION_RECORD_INVALID');
      const v4 = start(false, true);
      const page = records.workspace(bookId, '书', null);
      expect(page).toMatchObject({ unreadableRecords: [3], record: { recordId: v4, ordinal: 4, skippedRecords: [3], seededFrom: 2, comparison: { previousOrdinal: 2 }, ai7WordsNotice: null } });
      expect(page.records.map((summary) => summary.ordinal)).toEqual([4, 2, 1]);
      expect(page.record!.content.items.map((item) => item.score)).toEqual(own().items.map((item) => item.score));
      expect(page.record!.content.conclusion).toBeNull();
      expect(words(v4)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null });
    });

    it('checks a skipped version\'s words against its acceptance instead of inheriting its marks', () => {
      const v4 = start(false, true);
      const carried = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null };
      save(v4, (content) => withComment(content, 1, 'R2 的评语二。'));
      expect(words(v4)).toEqual(carried);
      const both = { ...carried, items: [...carried.items, mark(ITEMS[1]!, B, 'R2 的评语二。')] };
      forge(v4, 2, (entry) => ({ ...entry, rewrittenFrom: both }));
      expect(refused(() => latest(v4))).toBe('none');
      expect(words(v4)).toEqual(both);
      expect(records.workspace(bookId, '书', v4).record!.ai7WordsNotice).toBeNull();
      forge(v4, 2, (entry) => ({ ...entry, rewrittenFrom: { ...carried, items: [...carried.items, mark(ITEMS[1]!, C, 'R2 的评语二。')] } }));
      expect(refused(() => latest(v4))).toBe('EVALUATION_RECORD_INVALID');
    });

    it('refuses another start while the version begun after the gap remains open', () => {
      start(false, true);
      expect(refused(() => start(false, true))).toBe('EVALUATION_MOVED');
      expect(refused(() => start())).toBe('EVALUATION_OPEN');
    });

    it('continues normally after the gap and refuses stale skip requests with a reason', () => {
      const v4 = start(false, true);
      save(v4, (content) => ({ ...content, conclusion: 'revise' }), true);
      expect(records.latestFinalized(bookId)?.recordId).toBe(v4);
      const v5 = start();
      expect(records.workspace(bookId, '书', v5).record).toMatchObject({ ordinal: 5, skippedRecords: [], seededFrom: 4, comparison: { previousOrdinal: 4 } });
      save(v5, (content) => ({ ...content, conclusion: 'revise' }), true);
      expect(() => start(false, true)).toThrowError(expect.objectContaining({ code: 'EVALUATION_MOVED', message: '第 5 版评估记录现在可以读取，没有要跳过的版本；请看过现在的页面再重新评估。' }));
      expect(records.workspace(bookId, '书', null).recordCount).toBe(5);
    });
  });

  it('begins from nothing when no version reads, recording every version as skipped (Issue #726)', () => {
    const v1 = start();
    save(v1, () => own());
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = start();
    damage(v1, 1);
    damage(v2, 1);
    const before = records.workspace(bookId, '书', null);
    expect(before).toMatchObject({ unreadableRecords: [1, 2], record: null, start: { allowed: true, kind: 'again', skipDamaged: { skipped: [1, 2], seedOrdinal: null } } });
    const v3 = start(false, true);
    const page = records.workspace(bookId, '书', null);
    expect(page).toMatchObject({ unreadableRecords: [1, 2], record: { recordId: v3, ordinal: 3, skippedRecords: [1, 2], seededFrom: null, comparison: null, initial: null } });
    expect(page.record!.content).toEqual(emptyEvaluationContent(BUILTIN_EVALUATION_PROFILE));
    expect(page.records.map((summary) => summary.ordinal)).toEqual([3]);
    expect(page.recordsNext).toBeNull();
  });

  it('keeps a version readable when it pastes back words of a version that cannot be read, however far back (Issue #702 re-review)', () => {
    const v1 = start();
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, A);
    save(v1, (content) => withComment(content, 0, '编辑的评语一。'));
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = start();
    save(v2, (content) => withComment(content, 0, 'R1 的评语一。'));
    const pasted = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。')], verdict: null };
    expect(words(v2)).toEqual(pasted);
    damage(v1, 1);
    expect(refused(() => latest(v2))).toBe('none');
    expect(records.ai7Words(bookId, v2)).toEqual(pasted);
    const page = records.workspace(bookId, '书', null);
    expect(page.unreadableRecords).toEqual([1]);
    expect(page.record).toMatchObject({ ordinal: 2, ai7WordsNotice: null });
    save(v2, (content) => ({ ...content, conclusion: 'revise' }), true);
    expect(records.latestFinalized(bookId)?.recordId).toBe(v2);
    forge(v2, 2, (entry) => ({ ...entry, rewrittenFrom: { items: [mark(ITEMS[0]!, A, '别的话。')], verdict: null } }));
    expect(refused(() => latest(v2))).toBe('EVALUATION_RECORD_INVALID');
  });

  it('keeps a version readable when it pastes back words of a version two before that cannot be read (Issue #702 re-review)', () => {
    const v0 = start();
    save(v0, () => own());
    adopt(v0, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, A);
    save(v0, (content) => withComment(content, 0, '编辑的评语一。'));
    save(v0, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v1 = start();
    save(v1, (content) => ({ ...content, conclusion: 'reject' }), true);
    const v2 = start();
    save(v2, (content) => withComment(content, 0, 'R1 的评语一。'));
    const pasted = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。')], verdict: null };
    expect(words(v2)).toEqual(pasted);
    damage(v0, 1);
    expect(refused(() => latest(v1))).toBe('none');
    expect(refused(() => latest(v2))).toBe('none');
    expect(records.ai7Words(bookId, v2)).toEqual(pasted);
    const page = records.workspace(bookId, '书', null);
    expect(page.unreadableRecords).toEqual([1]);
    expect(page.records.map((summary) => summary.ordinal)).toEqual([3, 2]);
    expect(page.record!.ai7WordsNotice).toBeNull();
    expect(records.workspace(bookId, '书', v1).record!.ai7WordsNotice).toBeNull();
    save(v2, (content) => ({ ...content, conclusion: 'revise' }));
  });

  it('names no unchecked marks for a Book that never had AI7\'s words, its first version damaged (Issue #702 re-review)', () => {
    const v1 = start();
    save(v1, () => own());
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = start();
    save(v2, (content) => withComment(content, 0, '别的。'));
    damage(v1, 1);
    const page = records.workspace(bookId, '书', null);
    expect(page).toMatchObject({ unreadableRecords: [1], record: { ordinal: 2, ai7WordsNotice: null } });
  });

  describe('accepted rewrite checks beyond an unreadable version (#708)', () => {
    let v1: string;
    let v2: string;
    const first = mark(ITEMS[0]!, A, 'AI7 的评语一。');
    const carried = { items: [first], verdict: verdictMark(A, 'AI7 的总评。') };
    const forgedWith = (rewrittenFrom: unknown): string => {
      forge(v2, 2, (entry) => ({ ...entry, rewrittenFrom }));
      return refused(() => latest(v2));
    };
    const acceptedAs = (recordId: string, verdict: string | null): unknown => {
      const from = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
      accepted.set(from.analysisRevisionId, { recordId, from, items: [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], verdict });
      return { items: [mark(ITEMS[0]!, from, 'AI7 的评语一。')], verdict: verdictMark(from, 'AI7 的总评。') };
    };
    beforeEach(() => {
      v1 = start();
      save(v1, () => own());
      adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], 'AI7 的总评。', A);
      save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
      v2 = start();
      save(v2, (content) => ({ ...content, conclusion: 'revise' }));
      damage(v1, 1);
    });

    it('refuses a mark whose words, revision or Task do not match its acceptance', () => {
      expect(words(v2)).toEqual(carried);
      for (const rewrittenFrom of [
        { ...carried, items: [first, mark(ITEMS[1]!, A, '编辑的评语 2。')] },
        { ...carried, items: [first, mark(ITEMS[1]!, C, '编辑的评语 2。')] },
        { ...carried, items: [{ ...(first as object), taskIntentId: B.taskIntentId }] },
      ]) expect(forgedWith(rewrittenFrom)).toBe('EVALUATION_RECORD_INVALID');
      expect(forgedWith(carried)).toBe('none');
    });

    it('requires an earlier acceptance of the marked verdict on this Book', () => {
      for (const [recordId, verdict] of [[v2, 'AI7 的总评。'], [randomUUID(), 'AI7 的总评。'], [v1, '别的总评。'], [v1, null]] as const) {
        expect(forgedWith(acceptedAs(recordId, verdict))).toBe('EVALUATION_RECORD_INVALID');
      }
      expect(forgedWith(acceptedAs(v1, 'AI7 的总评。'))).toBe('none');
    });

    it('rechecks an unchecked acceptance when its words become readable', () => {
      const unread = acceptedAs(v1, '别的总评。');
      wordsReadable = false;
      expect(forgedWith(unread)).toBe('none');
      wordsReadable = true;
      expect(refused(() => latest(v2))).toBe('EVALUATION_RECORD_INVALID');
      wordsReadable = false;
      expect(forgedWith({ ...carried, items: [first, mark(ITEMS[1]!, B, '编辑的评语 2。')] })).toBe('EVALUATION_RECORD_INVALID');
      wordsReadable = true;
      expect(forgedWith(unread)).toBe('EVALUATION_RECORD_INVALID');
      decisionsReadable = false;
      expect(forgedWith({ ...carried, items: [first, mark(ITEMS[1]!, B, '编辑的评语 2。')] })).toBe('none');
      decisionsReadable = true;
      expect(forgedWith(carried)).toBe('none');
    });

    it('refuses another Book\'s acceptance even over the same words (#720)', () => {
      const other = randomUUID();
      const w1 = start(false, false, other);
      records.save(other, w1, 1, own(), false);
      const read = records.rewritable(other, w1);
      const D = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
      const taken = { items: [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], verdict: 'AI7 的总评。' };
      const ordinal = records.applyRewrite(other, w1, { entryOrdinal: read.entryOrdinal, entrySha256: read.entrySha256 }, taken, D);
      adoptions.set(`${w1}:${ordinal}`, D);
      accepted.set(D.analysisRevisionId, { recordId: w1, from: D, ...taken });
      const marked = { items: [mark(ITEMS[0]!, D, 'AI7 的评语一。')], verdict: verdictMark(D, 'AI7 的总评。') };
      expect(records.ai7Words(other, w1)).toEqual(marked);
      expect(forgedWith(marked)).toBe('EVALUATION_RECORD_INVALID');
      expect(forgedWith(carried)).toBe('none');
    });
  });

  it('names only the words whose marks could not be checked, and only while they stand (Issue #708)', () => {
    const v1 = start();
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], null, A);
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = start();
    damage(v1, 1);
    wordsReadable = false;
    save(v2, (content) => ({ ...content, conclusion: 'revise' }));
    adopt(v2, [{ itemId: ITEMS[1]!, comment: 'B 的评语二。' }], 'B 的总评。', B);
    expect(records.workspace(bookId, '书', v2).record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    expect(evaluationCarriedMarksNotice(FIRST)).toBe(`较早的评估版本记录已损坏，AI7 评语的标注无法全部核对；以下仍按 AI7 所写处理：${FIRST}。`);
    expect(records.ai7Words(bookId, v2)!.items.map((item) => item.itemId)).toEqual([ITEMS[0], ITEMS[1]]);
    save(v2, (content) => content, true);
    const v3 = start();
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    save(v3, (content) => withComment(content, 0, '编辑的评语一。'));
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBeNull();
    expect(records.ai7Words(bookId, v3)).toEqual({ items: [mark(ITEMS[1]!, B, 'B 的评语二。')], verdict: verdictMark(B, 'B 的总评。') });
    save(v3, (content) => withComment(content, 0, 'AI7 的评语一。'));
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    wordsReadable = true;
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBeNull();
    expect(records.ai7Words(bookId, v3)!.items.map((item) => item.itemId)).toEqual([ITEMS[0], ITEMS[1]]);
    expect(records.workspace(bookId, '书', v2).record!.ai7WordsNotice).toBeNull();
  });

  it('names only adopted words with an unreadable source (#708)', () => {
    const recordId = start();
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[1]!, comment: 'B 的评语二。' }], null, B);
    decisionsReadable = false;
    const second = `「${BUILTIN_EVALUATION_PROFILE.items[1]!.label}」的评语`;
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBe(evaluationAdoptionsNotice(second));
    decisionsReadable = true;
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBeNull();
  });

  describe('kept readings and public adoption-reader calls (#708)', () => {
    let reads: Map<string, number>;
    let counted: EvaluationRecords;
    let versions: string[];
    let first: string;
    let second: string;
    let last: string;
    const owner = (): EvaluationRecords => new EvaluationRecords(db,
      { current: () => ({ manuscriptId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', uncheckpointed: false }) },
      undefined, undefined, undefined, {
        adoptionsOf: (recordId) => {
          reads.set(recordId, (reads.get(recordId) ?? 0) + 1);
          return decisionsReadable ? new Map() : null;
        },
        acceptedRewrite: () => null,
        adoptionStamps: () => (decisionsReadable ? new Map() : null),
      });
    beforeEach(() => {
      reads = new Map();
      counted = owner();
      const saveIn = (recordId: string): void => {
        const version = counted.rewritable(bookId, recordId);
        counted.save(bookId, recordId, version.entryOrdinal, { ...own(), conclusion: 'revise' }, true);
      };
      versions = [];
      for (let index = 0; index < 4; index += 1) {
        versions.push(counted.start(bookId));
        saveIn(versions.at(-1)!);
      }
      [first, second, , last] = versions as [string, string, string, string];
    });

    it('reuses unchanged readings across per-version operations', () => {
      counted.workspace(bookId, '书', null);
      reads.clear();
      for (let index = 0; index < 5; index += 1) counted.rewritable(bookId, last);
      counted.finalizedOf(bookId, last);
      counted.ai7Words(bookId, last);
      counted.workspace(bookId, '书', last);
      expect(counted.latestFinalized(bookId)?.recordId).toBe(last);
      expect(reads.size).toBe(0);
    });

    it('refreshes a changed version and every successor', () => {
      damage(first, 1);
      reads.clear();
      expect(counted.workspace(bookId, '书', null).unreadableRecords).toEqual([1]);
      expect([first, ...versions.slice(1)].map((recordId) => reads.get(recordId))).toEqual([1, 1, 1, 1]);
      reads.clear();
      counted.rewritable(bookId, last);
      expect(reads.size).toBe(0);
    });

    it('refreshes only the version with an appended entry', () => {
      const v4 = counted.start(bookId);
      reads.clear();
      counted.save(bookId, v4, 1, { ...own(), conclusion: 'defer' }, false);
      counted.rewritable(bookId, v4);
      expect([...reads.keys()]).toEqual([v4]);
    });

    it('does not keep readings made while adoption decisions were unreadable', () => {
      counted = owner();
      decisionsReadable = false;
      counted.rewritable(bookId, last);
      decisionsReadable = true;
      reads.clear();
      counted.rewritable(bookId, last);
      expect(reads.get(second)).toBe(1);
      reads.clear();
      counted.rewritable(bookId, last);
      expect(reads.size).toBe(0);
    });
  });

  it('counts adjusted Books without failing the house on one Book\'s damage (Issue #702 review)', () => {
    const recordId = start();
    save(recordId, () => own());
    const draft = canonicalRecord({});
    db.prepare('INSERT INTO evaluation_initial_drafts(record_id, analysis_revision_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(recordId, randomUUID(), '2026-10-09T00:00:00.000Z', draft.json, draft.digest);
    damage(recordId, 1);
    expect(records.calibration()).toEqual({ adjustments: 0, unreadable: 1, basisBooks: 0, booksWithoutBasis: 0, offsets: null });
  });
});
