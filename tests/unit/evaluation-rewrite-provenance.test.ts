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
  initializeEvaluationInitialDraftSchema,
  initializeEvaluationRecordSchema,
} from '../../src/service/evaluation-records.js';
import type { EvaluationContent } from '../../src/shared/protocol.js';

// Which words of an Evaluation Record entry are AI7's (Issue #689 and its review), over the record owner on an in-memory
// database: 采用 marks only the words a rewrite changed, each with the digest of AI7's words; every later save keeps the mark
// while the words stand as AI7 wrote them, an edit puts it aside and putting the words back restores it; two 采用 leave words of
// both; an entry written before Issue #689 is read as the words it changed, and an entry after it that names none as the
// words still standing; and a mark that does not match its entry is refused. Every mark an item has held is kept, so the words
// of an earlier 采用 pasted back after a later one read as AI7's; and a mark set the chain could not have written — one that
// drops a mark still standing, or names a rewrite not 采用'd on that entry — is refused (Issue #696). The decisions are the
// suite's own map, as the store's evaluation rewrite owner holds them. A mark an entry leaves out is added back on read, never
// refused, so a history #692 wrote reads (Issue #702 review); decisions or an earlier version that cannot be read leave the
// marks as recorded and say so. The words are the suite's own.

const ITEMS = BUILTIN_EVALUATION_PROFILE.items.map((item) => item.itemId);
/** How a notice names the first item's 评语. */
const FIRST = `「${BUILTIN_EVALUATION_PROFILE.items[0]!.label}」的评语`;
const A = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
const B = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
/** A rewrite no 采用 took. */
const C = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };

let db: DatabaseSync;
let records: EvaluationRecords;
let bookId: string;
/** Which rewrite each 采用 appended which entry with, by `recordId:ordinal`. */
let adoptions: Map<string, typeof A>;
/** Whether the decisions can be read now. */
let decisionsReadable: boolean;

beforeEach(() => {
  db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  initializeEvaluationRecordSchema(db);
  initializeEvaluationInitialDraftSchema(db);
  adoptions = new Map();
  decisionsReadable = true;
  records = new EvaluationRecords(db, { current: () => ({ manuscriptId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', uncheckpointed: false }) },
    undefined, undefined, undefined, {
      adoptionsOf: (recordId) => (decisionsReadable
        ? new Map([...adoptions].filter(([key]) => key.startsWith(`${recordId}:`)).map(([key, from]) => [Number(key.split(':')[1]), from] as const))
        : null),
    });
  bookId = randomUUID();
});

afterEach(() => {
  db.close();
});

/** The editor's own words for every item, and a 总评. */
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
}

const withComment = (content: EvaluationContent, index: number, comment: string): EvaluationContent =>
  ({ ...content, items: content.items.map((item, at) => (at === index ? { ...item, comment } : item)) });

/** Each entry's recorded `rewrittenFrom`, oldest first; `null` for an entry that names none. */
function marks(recordId: string): unknown[] {
  return (db.prepare('SELECT canonical_json FROM evaluation_record_entries WHERE record_id = ? ORDER BY ordinal').all(recordId) as Array<{ canonical_json: string }>)
    .map((row) => (JSON.parse(row.canonical_json) as { rewrittenFrom?: unknown }).rewrittenFrom ?? null);
}

const mark = (itemId: string, from: typeof A, words: string): unknown => ({ itemId, ...from, sha256: sha256Hex(words) });
const verdictMark = (from: typeof A, words: string): unknown => ({ ...from, sha256: sha256Hex(words) });

/** Rewrite one entry's recorded JSON in place — the triggers set aside for it — with its digest recomputed. */
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
    const recordId = records.start(bookId);
    save(recordId, () => own());
    // A rewrite that gives back the second 评语 and the 总评 unchanged marks neither: they are the editor's words.
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[1]!, comment: '编辑的评语 2。' }], '编辑的总评。', A);
    expect(marks(recordId).at(-1)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null });
    // A second 采用 leaves words of both rewrites, each with its own.
    adopt(recordId, [{ itemId: ITEMS[2]!, comment: 'AI7 的评语三。' }], 'AI7 的总评。', B);
    const both = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[2]!, B, 'AI7 的评语三。')], verdict: verdictMark(B, 'AI7 的总评。') };
    expect(marks(recordId).at(-1)).toEqual(both);
    // A save that changes only a score keeps every mark.
    save(recordId, (content) => ({ ...content, items: content.items.map((item, index) => (index === 4 ? { ...item, score: 10 } : item)) }));
    expect(marks(recordId).at(-1)).toEqual(both);
    // The editor edits the first 评语: it is theirs; they put AI7's words back: AI7's again.
    save(recordId, (content) => withComment(content, 0, 'AI7 的评语一，编辑改过。'));
    expect(marks(recordId).at(-1)).toEqual({ items: [mark(ITEMS[2]!, B, 'AI7 的评语三。')], verdict: verdictMark(B, 'AI7 的总评。') });
    save(recordId, (content) => withComment(content, 0, 'AI7 的评语一。'));
    expect(marks(recordId).at(-1)).toEqual(both);
    // 定稿 with the editor's own 总评, then 重新评估: the 评语 still AI7's carry into the next version.
    save(recordId, (content) => ({ ...content, verdict: '编辑定稿的总评。', conclusion: 'revise' }), true);
    const next = records.start(bookId);
    expect(marks(recordId).at(-1)).toEqual({ items: both.items, verdict: null });
    expect(marks(next)).toEqual([{ items: both.items, verdict: null }]);
    expect(marks(recordId).slice(0, 2)).toEqual([null, null]);
  });

  it('reads an entry written before Issue #689 as the words it changed, and an unmarked entry after it as the words still standing', () => {
    const recordId = records.start(bookId);
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[1]!, comment: 'AI7 的评语二。' }], 'AI7 的总评。', A);
    // The 采用 entry as it was recorded before: only the rewrite it took.
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: A }));
    save(recordId, (content) => withComment(content, 0, '编辑重写的评语一。'));
    const standing = { items: [mark(ITEMS[1]!, A, 'AI7 的评语二。')], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(marks(recordId)).toEqual([null, null, A, standing]);
    // That save as code before Issue #689 recorded it, naming nothing: the next save still finds AI7's standing words.
    forge(recordId, 4, ({ rewrittenFrom: _words, ...entry }) => entry);
    save(recordId, (content) => ({ ...content, conclusion: 'revise' }));
    expect(marks(recordId)).toEqual([null, null, A, null, standing]);
  });

  it('refuses a mark that is not one this owner writes or does not match its entry', () => {
    const recordId = records.start(bookId);
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[2]!, comment: 'AI7 的评语三。' }], 'AI7 的总评。', A);
    const good = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[2]!, A, 'AI7 的评语三。')], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(marks(recordId).at(-1)).toEqual(good);
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
    // A 总评 mark on an entry whose 总评 is empty.
    forge(recordId, 3, (entry) => ({ ...entry, content: { ...(entry.content as Record<string, unknown>), verdict: null }, rewrittenFrom: good }));
    expect(refused(() => latest(recordId))).toBe('EVALUATION_RECORD_INVALID');
    forge(recordId, 3, (entry) => ({ ...entry, content: { ...(entry.content as Record<string, unknown>), verdict: 'AI7 的总评。' }, rewrittenFrom: good }));
    expect(refused(() => latest(recordId))).toBe('none');
  });

  it('keeps every mark an item has held: an earlier 采用\'s words pasted back after a later one read as AI7\'s (Issue #696)', () => {
    const recordId = records.start(bookId);
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, A);
    save(recordId, (content) => withComment(content, 0, '编辑的评语一。'));
    expect(marks(recordId).at(-1)).toBeNull();
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R2 的评语一。' }], 'R2 的总评。', B);
    const second = { items: [mark(ITEMS[0]!, B, 'R2 的评语一。')], verdict: verdictMark(B, 'R2 的总评。') };
    expect(marks(recordId).at(-1)).toEqual(second);
    // The editor pastes R1's words back over R2's: they are R1's, though R2's 采用 came after; and R2's back are R2's.
    const first = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。')], verdict: verdictMark(B, 'R2 的总评。') };
    save(recordId, (content) => withComment(content, 0, 'R1 的评语一。'));
    expect(marks(recordId).at(-1)).toEqual(first);
    save(recordId, (content) => withComment(content, 0, 'R2 的评语一。'));
    expect(marks(recordId).at(-1)).toEqual(second);
    // 定稿 and 重新评估: R1's words, set aside in the version before, are still AI7's when pasted back in the next.
    save(recordId, (content) => ({ ...content, conclusion: 'revise' }), true);
    const next = records.start(bookId);
    expect(marks(next)).toEqual([second]);
    save(next, (content) => withComment(content, 0, 'R1 的评语一。'));
    expect(marks(next).at(-1)).toEqual(first);
    // Two rewrites that wrote the same words: the later one names them.
    save(next, (content) => withComment(content, 0, '编辑的评语一。'));
    const r3 = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
    adopt(next, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, r3);
    save(next, (content) => ({ ...content, conclusion: 'revise' }));
    expect(marks(next).at(-1)).toEqual({ items: [mark(ITEMS[0]!, r3, 'R1 的评语一。')], verdict: verdictMark(B, 'R2 的总评。') });
  });

  it('refuses a mark its chain could not have written, and adds back a mark an entry leaves out (Issue #696, Issue #702 review)', () => {
    const recordId = records.start(bookId);
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }, { itemId: ITEMS[2]!, comment: 'AI7 的评语三。' }], 'AI7 的总评。', A);
    const first = mark(ITEMS[0]!, A, 'AI7 的评语一。');
    const third = mark(ITEMS[2]!, A, 'AI7 的评语三。');
    const adopted = { items: [first, third], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(marks(recordId).at(-1)).toEqual(adopted);
    const refusedWith = (ordinal: number, rewrittenFrom: unknown, of = recordId): string => {
      forge(of, ordinal, (entry) => ({ ...entry, rewrittenFrom }));
      return refused(() => latest(of));
    };
    // The 采用 entry: another rewrite's mark, this rewrite's over words it did not change, one that names nothing of this
    // rewrite or names none at all.
    for (const [what, rewrittenFrom] of [
      ['a rewrite this entry\'s 采用 did not take', { ...adopted, items: [mark(ITEMS[0]!, C, 'AI7 的评语一。'), third] }],
      ['a 总评 of a rewrite never 采用\'d', { ...adopted, verdict: verdictMark(C, 'AI7 的总评。') }],
      ['this rewrite over the editor\'s own words', { ...adopted, items: [first, mark(ITEMS[1]!, A, '编辑的评语 2。'), third] }],
      ['an entry written before Issue #689 naming a rewrite this 采用 did not take', C],
    ] as const) {
      expect(refusedWith(3, rewrittenFrom), what).toBe('EVALUATION_RECORD_INVALID');
    }
    forge(recordId, 3, ({ rewrittenFrom: _words, ...entry }) => entry);
    expect(refused(() => latest(recordId)), 'a 采用 entry that names none').toBe('EVALUATION_RECORD_INVALID');
    expect(refusedWith(3, A)).toBe('none');
    expect(refusedWith(3, adopted)).toBe('none');
    // Without the decision that took it, the 采用 entry names a rewrite nothing took.
    adoptions.delete(`${recordId}:3`);
    expect(refused(() => latest(recordId))).toBe('EVALUATION_RECORD_INVALID');
    adoptions.set(`${recordId}:3`, A);

    // A plain save after it: a mark left out is added back; a mark the chain does not hold is refused.
    save(recordId, (content) => ({ ...content, conclusion: 'revise' }));
    expect(marks(recordId).at(-1)).toEqual(adopted);
    for (const [what, rewrittenFrom] of [
      ['a 评语 still standing left out', { ...adopted, items: [first] }],
      ['the 总评 still standing left out', { ...adopted, verdict: null }],
    ] as const) {
      expect(refusedWith(4, rewrittenFrom), what).toBe('none');
      expect(records.ai7Words(bookId, recordId), what).toEqual(adopted);
    }
    for (const [what, rewrittenFrom] of [
      ['a rewrite never 采用\'d', { ...adopted, items: [first, mark(ITEMS[1]!, C, '编辑的评语 2。'), third] }],
      ['the 采用\'d rewrite over words it never wrote', { ...adopted, items: [first, mark(ITEMS[1]!, A, '编辑的评语 2。'), third] }],
    ] as const) {
      expect(refusedWith(4, rewrittenFrom), what).toBe('EVALUATION_RECORD_INVALID');
    }
    expect(refusedWith(4, adopted)).toBe('none');
    // A second 采用 whose entry lists only the marks it carried names nothing of its own: refused (Issue #702 review).
    adopt(recordId, [{ itemId: ITEMS[1]!, comment: 'B 的评语二。' }], null, B);
    const both = { items: [first, mark(ITEMS[1]!, B, 'B 的评语二。'), third], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(marks(recordId).at(-1)).toEqual(both);
    expect(refusedWith(5, adopted), 'a 采用 entry naming only carried marks').toBe('EVALUATION_RECORD_INVALID');
    expect(refusedWith(5, both)).toBe('none');

    // The next version's first entry carries the 定稿's marks: one left out is added back, one never held is refused.
    save(recordId, (content) => content, true);
    const next = records.start(bookId);
    expect(marks(next)).toEqual([both]);
    expect(refusedWith(1, { ...both, items: [third] }, next)).toBe('none');
    expect(records.ai7Words(bookId, next)).toEqual(both);
    expect(refusedWith(1, { ...both, items: [first, mark(ITEMS[3]!, A, '编辑的评语 4。'), third] }, next)).toBe('EVALUATION_RECORD_INVALID');
    // A first entry that names none reads the marks carried into it: AI7's words stay AI7's across 重新评估.
    forge(next, 1, ({ rewrittenFrom: _words, ...entry }) => entry);
    expect(records.ai7Words(bookId, next)).toEqual(both);
    save(next, (content) => ({ ...content, conclusion: 'revise' }));
    expect(marks(next)).toEqual([null, both]);
  });

  it('reads the histories #692 wrote, which kept only the latest mark per item: a paste-back left unmarked reads as AI7\'s (Issue #702 review)', () => {
    // Within one version: 采用 R1, the editor edits item 1 away, 采用 R2 on it, the editor pastes R1's words back. #692 kept only
    // R2's mark for item 1, so its save recorded R1's words of item 3 alone. The entry is planted byte for byte as it wrote it.
    const recordId = records.start(bookId);
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }, { itemId: ITEMS[2]!, comment: 'R1 的评语三。' }], null, A);
    save(recordId, (content) => withComment(content, 0, '编辑的评语一。'));
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'R2 的评语一。' }], null, B);
    save(recordId, (content) => withComment(content, 0, 'R1 的评语一。'));
    const r1Third = mark(ITEMS[2]!, A, 'R1 的评语三。');
    const pastedBack = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。'), r1Third], verdict: null };
    expect(marks(recordId).at(-1)).toEqual(pastedBack);
    forge(recordId, 6, (entry) => ({ ...entry, rewrittenFrom: { items: [r1Third], verdict: null } }));
    expect(refused(() => latest(recordId))).toBe('none');
    expect(records.ai7Words(bookId, recordId)).toEqual(pastedBack);
    save(recordId, (content) => ({ ...content, conclusion: 'revise' }));
    expect(marks(recordId).at(-1)).toEqual(pastedBack);

    // Across versions: 采用 R1, the editor edits item 1 away, 定稿, 重新评估, the editor pastes R1's words back in the next one.
    // #692's next version knew only the marks its first entry recorded, so the save recorded item 3 alone.
    const other = randomUUID();
    const v1 = records.start(other);
    const saveOf = (id: string, change: (content: EvaluationContent) => EvaluationContent, finalize = false): void => {
      const version = records.rewritable(other, id);
      records.save(other, id, version.entryOrdinal, change(version.content), finalize);
    };
    saveOf(v1, () => own());
    const version = records.rewritable(other, v1);
    const ordinal = records.applyRewrite(other, v1, { entryOrdinal: version.entryOrdinal, entrySha256: version.entrySha256 },
      { items: [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }, { itemId: ITEMS[2]!, comment: 'R1 的评语三。' }], verdict: null }, A);
    adoptions.set(`${v1}:${ordinal}`, A);
    saveOf(v1, (content) => withComment(content, 0, '编辑的评语一。'));
    saveOf(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(other);
    saveOf(v2, (content) => withComment(content, 0, 'R1 的评语一。'));
    forge(v2, 2, (entry) => ({ ...entry, rewrittenFrom: { items: [r1Third], verdict: null } }));
    expect(refused(() => records.rewritable(other, v2))).toBe('none');
    expect(records.ai7Words(other, v2)).toEqual(pastedBack);
  });

  it('keeps the marks as recorded and says so when the 采用 records cannot be read (Issue #702 review)', () => {
    const recordId = records.start(bookId);
    save(recordId, () => own());
    adopt(recordId, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], 'AI7 的总评。', A);
    const adopted = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBeNull();
    decisionsReadable = false;
    const page = records.workspace(bookId, '书', recordId);
    expect(page.record!.ai7WordsNotice).toBe(evaluationAdoptionsNotice(`${FIRST}和总评`));
    expect(page.record!.ai7WordsNotice).toBe(`评语重写的采用记录已损坏，AI7 评语标注的来源无法核对：${FIRST}和总评仍按 AI7 所写处理。`);
    expect(records.ai7Words(bookId, recordId)).toEqual(adopted);
    // A mark of a rewrite nothing took is kept, its source unknown, rather than refusing 评估; its digest is still checked.
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: { ...adopted, items: [mark(ITEMS[0]!, C, 'AI7 的评语一。')] } }));
    expect(refused(() => latest(recordId))).toBe('none');
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: { ...adopted, items: [mark(ITEMS[0]!, A, '别的话。')] } }));
    expect(refused(() => latest(recordId))).toBe('EVALUATION_RECORD_INVALID');
    forge(recordId, 3, (entry) => ({ ...entry, rewrittenFrom: adopted }));
    // Once the editor's own words stand everywhere, there is nothing to name: no notice (Issue #702 re-review).
    save(recordId, (content) => ({ ...withComment(content, 0, '编辑的评语一。'), verdict: '编辑的总评。' }));
    expect(records.ai7Words(bookId, recordId)).toBeNull();
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBeNull();
    decisionsReadable = true;
    expect(records.workspace(bookId, '书', recordId).record!.ai7WordsNotice).toBeNull();
  });

  it('keeps later versions working when an earlier one cannot be read, and says so (Issue #702 review)', () => {
    const v1 = records.start(bookId);
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], null, A);
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(bookId);
    save(v2, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v3 = records.start(bookId);
    const carried = { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null };
    expect(marks(v3)).toEqual([carried]);
    // v1's first entry damaged: its digest no longer matches its row.
    db.exec('DROP TRIGGER evaluation_record_entries_no_update');
    db.prepare("UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND ordinal = 1").run('0'.repeat(64), v1);
    db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    // v2 reads: its first entry's marks, carried from v1, are kept as recorded and named as unchecked.
    expect(refused(() => latest(v2))).toBe('none');
    expect(records.ai7Words(bookId, v2)).toEqual(carried);
    const page = records.workspace(bookId, '书', v2);
    expect(page.unreadableRecords).toEqual([1]);
    expect(page.record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    expect(page.records.map((summary) => summary.ordinal)).toEqual([3, 2]);
    // Every older version is unreadable: no 「更早」 page to open (Issue #702 re-review).
    expect(page.recordsNext).toBeNull();
    expect(page.record!.comparison).toBeNull();
    // v3 reads after v2, its marks still uncheckable against v1, and the per-version operations go on.
    expect(records.workspace(bookId, '书', null).record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    save(v3, (content) => ({ ...content, conclusion: 'revise' }));
    expect(records.finalizedOf(bookId, v2)).not.toBeNull();
    expect(records.latestFinalized(bookId)?.recordId).toBe(v2);
    save(v3, (content) => content, true);
    expect(records.latestFinalized(bookId)?.recordId).toBe(v3);
    // The version asked for, or the latest, must read: one that cannot is refused as before.
    expect(refused(() => records.workspace(bookId, '书', v1))).toBe('EVALUATION_RECORD_INVALID');
    expect(refused(() => latest(v1))).toBe('EVALUATION_RECORD_INVALID');
    // A version after the latest 定稿 that cannot be read may be 定稿 itself: the latest is then unknown, and so refused.
    db.exec('DROP TRIGGER evaluation_record_entries_no_update');
    db.prepare("UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND kind = 'finalized'").run('1'.repeat(64), v3);
    db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    expect(refused(() => records.latestFinalized(bookId))).toBe('EVALUATION_RECORD_INVALID');
  });

  it('keeps a version readable when it pastes back words of a version that cannot be read, however far back (Issue #702 re-review)', () => {
    // v1: 采用 R1 on item 1, edited away, 定稿. v2 pastes R1's words back: the writer marks them from v1's marks. Then v1 is damaged.
    const v1 = records.start(bookId);
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, A);
    save(v1, (content) => withComment(content, 0, '编辑的评语一。'));
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(bookId);
    save(v2, (content) => withComment(content, 0, 'R1 的评语一。'));
    const pasted = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。')], verdict: null };
    expect(marks(v2)).toEqual([null, pasted]);
    damage(v1, 1);
    expect(refused(() => latest(v2))).toBe('none');
    expect(records.ai7Words(bookId, v2)).toEqual(pasted);
    const page = records.workspace(bookId, '书', null);
    expect(page.unreadableRecords).toEqual([1]);
    expect(page.record).toMatchObject({ ordinal: 2, ai7WordsNotice: evaluationCarriedMarksNotice(FIRST) });
    save(v2, (content) => ({ ...content, conclusion: 'revise' }), true);
    expect(records.latestFinalized(bookId)?.recordId).toBe(v2);
    // A forged mark still has its digest checked, and a mark of an editor's own words names a rewrite only as an over-mark.
    forge(v2, 2, (entry) => ({ ...entry, rewrittenFrom: { items: [mark(ITEMS[0]!, A, '别的话。')], verdict: null } }));
    expect(refused(() => latest(v2))).toBe('EVALUATION_RECORD_INVALID');
  });

  it('keeps a version readable when it pastes back words of a version two before that cannot be read (Issue #702 re-review)', () => {
    // v0 held R1, edited away; v1 never had R1's words; v2 pastes them back; then v0 is damaged.
    const v0 = records.start(bookId);
    save(v0, () => own());
    adopt(v0, [{ itemId: ITEMS[0]!, comment: 'R1 的评语一。' }], null, A);
    save(v0, (content) => withComment(content, 0, '编辑的评语一。'));
    save(v0, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v1 = records.start(bookId);
    save(v1, (content) => ({ ...content, conclusion: 'reject' }), true);
    const v2 = records.start(bookId);
    save(v2, (content) => withComment(content, 0, 'R1 的评语一。'));
    const pasted = { items: [mark(ITEMS[0]!, A, 'R1 的评语一。')], verdict: null };
    expect(marks(v2).at(-1)).toEqual(pasted);
    damage(v0, 1);
    expect(refused(() => latest(v1))).toBe('none');
    expect(refused(() => latest(v2))).toBe('none');
    expect(records.ai7Words(bookId, v2)).toEqual(pasted);
    const page = records.workspace(bookId, '书', null);
    expect(page.unreadableRecords).toEqual([1]);
    expect(page.records.map((summary) => summary.ordinal)).toEqual([3, 2]);
    expect(page.record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    // v1 holds no AI7 words: no notice there.
    expect(records.workspace(bookId, '书', v1).record!.ai7WordsNotice).toBeNull();
    save(v2, (content) => ({ ...content, conclusion: 'revise' }));
  });

  it('names no unchecked marks for a Book that never had AI7\'s words, its first version damaged (Issue #702 re-review)', () => {
    const v1 = records.start(bookId);
    save(v1, () => own());
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(bookId);
    save(v2, (content) => withComment(content, 0, '别的。'));
    damage(v1, 1);
    const page = records.workspace(bookId, '书', null);
    expect(page).toMatchObject({ unreadableRecords: [1], record: { ordinal: 2, ai7WordsNotice: null } });
  });

  it('counts adjusted Books without failing the house on one Book\'s damage (Issue #702 review)', () => {
    const recordId = records.start(bookId);
    save(recordId, () => own());
    // A version planted as begun from AI7's 初评, its chain then damaged: it counts for nothing, and 设置 still reads.
    db.prepare('INSERT INTO evaluation_initial_drafts(record_id, analysis_revision_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(recordId, randomUUID(), '2026-10-09T00:00:00.000Z', '{}', sha256Hex('{}'));
    db.exec('DROP TRIGGER evaluation_record_entries_no_update');
    db.prepare("UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND ordinal = 1").run('0'.repeat(64), recordId);
    db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    expect(records.adjustedBooks()).toEqual({ books: 0, unreadable: 1 });
  });
});
