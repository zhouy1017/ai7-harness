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
/** Each rewrite a 采用 took, by its revision: the version it was taken on, and the words it wrote (Issue #708). */
let accepted: Map<string, { recordId: string; from: typeof A; items: ReadonlyArray<{ itemId: string; comment: string }>; verdict: string | null }>;
/** Whether the words of an accepted rewrite can be read now. */
let wordsReadable: boolean;

beforeEach(() => {
  db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  initializeEvaluationRecordSchema(db);
  initializeEvaluationInitialDraftSchema(db);
  adoptions = new Map();
  decisionsReadable = true;
  accepted = new Map();
  wordsReadable = true;
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
  accepted.set(from.analysisRevisionId, { recordId, from, items, verdict });
}

/**
 * The suite's decisions as the record checks a reading it kept against: every 采用 and acceptance, by the version it was made
 * on — never whether their words can be read now, which the store cannot tell either; `null` while the decisions cannot be read.
 */
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

/** The Book of each version, as the decisions name it. */
const bookOf = {
  get: (recordId: string): string | undefined =>
    (db.prepare('SELECT book_id FROM evaluation_records WHERE record_id = ?').get(recordId) as { book_id: string } | undefined)?.book_id,
};

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
    expect(page.record!.ai7WordsNotice).toBe(`评语重写的采用记录已损坏，AI7 评语的标注无法全部核对；以下仍按 AI7 所写处理：${FIRST}和总评。`);
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
    // A's acceptance on v1 over these very words is read: the carried mark is checked, and nothing is named (Issue #708).
    expect(page.record!.ai7WordsNotice).toBeNull();
    expect(page.records.map((summary) => summary.ordinal)).toEqual([3, 2]);
    // Every older version is unreadable: no 「更早」 page to open (Issue #702 re-review).
    expect(page.recordsNext).toBeNull();
    expect(page.record!.comparison).toBeNull();
    // v3 reads after v2, its marks still uncheckable against v1, and the per-version operations go on.
    expect(records.workspace(bookId, '书', null).record!.ai7WordsNotice).toBeNull();
    save(v3, (content) => ({ ...content, conclusion: 'revise' }));
    expect(records.finalizedOf(bookId, v2)).not.toBeNull();
    expect(records.latestFinalized(bookId)?.recordId).toBe(v2);
    save(v3, (content) => content, true);
    expect(records.latestFinalized(bookId)?.recordId).toBe(v3);
    // The version asked for that cannot be read gives way to the latest that can, named among the unreadable (Issue #708);
    // only the operations that need it are refused.
    expect(records.workspace(bookId, '书', v1)).toMatchObject({ unreadableRecords: [1], record: { recordId: v3 }, start: { allowed: true } });
    expect(refused(() => latest(v1))).toBe('EVALUATION_RECORD_INVALID');
    expect(refused(() => records.workspace(bookId, '书', randomUUID()))).toBe('EVALUATION_NOT_FOUND');
    // A version after the latest 定稿 that cannot be read may be 定稿 itself: the latest is then unknown, and so refused.
    db.exec('DROP TRIGGER evaluation_record_entries_no_update');
    db.prepare("UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND kind = 'finalized'").run('1'.repeat(64), v3);
    db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    expect(refused(() => records.latestFinalized(bookId))).toBe('EVALUATION_RECORD_INVALID');
    // The latest that cannot be read (Issue #708): 评估 shows the readable versions, the latest of them on show, and offers to
    // skip it — 从第 2 版重新评估 (Issue #726) — while a start that does not say so is still refused, saying why; the readable
    // versions' own operations go on.
    for (const asked of [null, v3]) {
      const damaged = records.workspace(bookId, '书', asked);
      expect(damaged).toMatchObject({ unreadableRecords: [1, 3], record: { recordId: v2 }, start: { allowed: true, kind: 'again', skipDamaged: { skipped: [3], seedOrdinal: 2 } } });
      expect(damaged.records.map((summary) => summary.ordinal)).toEqual([2]);
    }
    expect(evaluationDamagedLatestReason(3)).toBe('第 3 版评估记录已损坏，不能重新评估。');
    let startRefusal = '';
    try {
      records.start(bookId);
    } catch (error) {
      startRefusal = error instanceof EvaluationError ? `${error.code}:${error.message}` : 'other';
    }
    expect(startRefusal).toBe(`EVALUATION_RECORD_INVALID:${evaluationDamagedLatestReason(3)}`);
    expect(refused(() => latest(v2))).toBe('none');
    expect(records.finalizedOf(bookId, v2)).not.toBeNull();
    expect(refused(() => latest(v3))).toBe('EVALUATION_RECORD_INVALID');
    // A latest whose record row itself cannot be read is named, and offered to be skipped, the same way.
    db.exec('DROP TRIGGER evaluation_records_no_update');
    db.prepare('UPDATE evaluation_records SET sha256 = ? WHERE record_id = ?').run('2'.repeat(64), v3);
    expect(records.workspace(bookId, '书', null)).toMatchObject({ unreadableRecords: [1, 3], record: { recordId: v2 }, start: { allowed: true, skipDamaged: { skipped: [3], seedOrdinal: 2 } } });
  });

  it('begins again from the latest 定稿 that reads when the latest version cannot be, recording the skipped versions as a gap (Issue #726)', () => {
    // v1 定稿 with a 采用 whose words stand; v2 定稿 carrying them; v3 begun and damaged while being scored.
    const v1 = records.start(bookId);
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], null, A);
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(bookId);
    save(v2, (content) => ({ ...content, conclusion: 'defer' }), true);
    const v3 = records.start(bookId);
    save(v3, (content) => withComment(content, 1, '第三版的评语。'));
    // A 采用 on v3 of rewrite B over the second item, before v3 is damaged whole.
    adopt(v3, [{ itemId: ITEMS[1]!, comment: 'R2 的评语二。' }], null, B);
    damage(v3, 1);
    // Without saying so, the start is refused as before; saying so while the latest reads is refused too (nothing to skip).
    expect(refused(() => records.start(bookId))).toBe('EVALUATION_RECORD_INVALID');
    // Saying so: v4 is seeded from v2's 定稿, follows v2, names v3 as skipped, and compares with v2.
    const v4 = records.start(bookId, false, true);
    const page = records.workspace(bookId, '书', null);
    expect(page).toMatchObject({ unreadableRecords: [3], record: { recordId: v4, ordinal: 4, skippedRecords: [3], seededFrom: 2, comparison: { previousOrdinal: 2 }, ai7WordsNotice: null } });
    expect(page.records.map((summary) => summary.ordinal)).toEqual([4, 2, 1]);
    expect(page.record!.content.items.map((item) => item.score)).toEqual(own().items.map((item) => item.score));
    expect(page.record!.content.conclusion).toBeNull();
    // v2's mark over A's words, which still stand, is carried into v4 and checked against v2's chain: nothing is unchecked.
    expect(records.ai7Words(bookId, v4)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null });
    expect(marks(v4).at(-1)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null });
    // The skipped v3 is a gap, not a predecessor whose marks are held: B's words pasted back into v4 carry no mark from v2's chain,
    // and a recorded mark naming B is admitted only through B's acceptance on this Book over those very words (Issue #708's
    // rule after a version that cannot be read) — checked, so nothing is named — never because v3 held it.
    save(v4, (content) => withComment(content, 1, 'R2 的评语二。'));
    expect(marks(v4).at(-1)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。')], verdict: null });
    forge(v4, 2, (entry) => ({ ...entry, rewrittenFrom: { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[1]!, B, 'R2 的评语二。')], verdict: null } }));
    expect(refused(() => latest(v4))).toBe('none');
    expect(records.ai7Words(bookId, v4)).toEqual({ items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[1]!, B, 'R2 的评语二。')], verdict: null });
    expect(records.workspace(bookId, '书', v4).record!.ai7WordsNotice).toBeNull();
    // A mark naming a rewrite nobody accepted is refused as ever.
    forge(v4, 2, (entry) => ({ ...entry, rewrittenFrom: { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[1]!, C, 'R2 的评语二。')], verdict: null } }));
    expect(refused(() => latest(v4))).toBe('EVALUATION_RECORD_INVALID');
    forge(v4, 2, (entry) => ({ ...entry, rewrittenFrom: { items: [mark(ITEMS[0]!, A, 'AI7 的评语一。'), mark(ITEMS[1]!, B, 'R2 的评语二。')], verdict: null } }));
    // The gap: nothing of v3's is held by v4, and a later version of the Book goes on as any other. While v4 reads, a start
    // that says it skips is refused before anything else — there is nothing to skip.
    expect(refused(() => records.start(bookId, false, true))).toBe('EVALUATION_MOVED');
    expect(refused(() => records.start(bookId))).toBe('EVALUATION_OPEN');
    save(v4, (content) => ({ ...content, conclusion: 'revise' }), true);
    expect(records.latestFinalized(bookId)?.recordId).toBe(v4);
    const v5 = records.start(bookId);
    expect(records.workspace(bookId, '书', v5).record).toMatchObject({ ordinal: 5, skippedRecords: [], seededFrom: 4, comparison: { previousOrdinal: 4 } });
    // A start that says it skips while the latest reads after all is refused with why, and skips nothing.
    save(v5, (content) => ({ ...content, conclusion: 'revise' }), true);
    let moved = '';
    try {
      records.start(bookId, false, true);
    } catch (error) {
      moved = error instanceof EvaluationError ? `${error.code}:${error.message}` : 'other';
    }
    expect(moved).toBe('EVALUATION_MOVED:第 5 版评估记录现在可以读取，没有要跳过的版本；请看过现在的页面再重新评估。');
    expect(records.workspace(bookId, '书', null).recordCount).toBe(5);
  });

  it('begins from nothing when no version reads, recording every version as skipped (Issue #726)', () => {
    const v1 = records.start(bookId);
    save(v1, () => own());
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(bookId);
    damage(v1, 1);
    damage(v2, 1);
    const before = records.workspace(bookId, '书', null);
    expect(before).toMatchObject({ unreadableRecords: [1, 2], record: null, start: { allowed: true, kind: 'again', skipDamaged: { skipped: [1, 2], seedOrdinal: null } } });
    const v3 = records.start(bookId, false, true);
    const page = records.workspace(bookId, '书', null);
    expect(page).toMatchObject({ unreadableRecords: [1, 2], record: { recordId: v3, ordinal: 3, skippedRecords: [1, 2], seededFrom: null, comparison: null, initial: null } });
    expect(page.record!.content).toEqual(emptyEvaluationContent(BUILTIN_EVALUATION_PROFILE));
    expect(page.records.map((summary) => summary.ordinal)).toEqual([3]);
    expect(page.recordsNext).toBeNull();
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
    // The words are AI7's, and A's acceptance on v1 checks the mark: nothing is named (Issue #708).
    expect(page.record).toMatchObject({ ordinal: 2, ai7WordsNotice: null });
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
    // A's acceptance on v1 over these very words is read: the carried mark is checked, and nothing is named (Issue #708).
    expect(page.record!.ai7WordsNotice).toBeNull();
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

  it('after a version that cannot be read, admits a mark only of a rewrite this Book accepted earlier, over that rewrite\'s words (Issue #708)', () => {
    // v1: 采用 A on item 1 and the 总评, 定稿. v2 carries A's words. Then v1 is damaged: v2's chain is incomplete.
    const v1 = records.start(bookId);
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], 'AI7 的总评。', A);
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(bookId);
    save(v2, (content) => ({ ...content, conclusion: 'revise' }));
    const first = mark(ITEMS[0]!, A, 'AI7 的评语一。');
    const carried = { items: [first], verdict: verdictMark(A, 'AI7 的总评。') };
    expect(marks(v2)).toEqual([carried, carried]);
    damage(v1, 1);
    expect(refused(() => latest(v2))).toBe('none');
    const forgedWith = (rewrittenFrom: unknown): string => {
      forge(v2, 2, (entry) => ({ ...entry, rewrittenFrom }));
      return refused(() => latest(v2));
    };
    // The editor's own words on item 2, called AI7's by a forged mark.
    for (const [what, rewrittenFrom] of [
      ['a rewrite accepted earlier, over words it never wrote', { ...carried, items: [first, mark(ITEMS[1]!, A, '编辑的评语 2。')] }],
      ['a rewrite never accepted', { ...carried, items: [first, mark(ITEMS[1]!, C, '编辑的评语 2。')] }],
      ['another Task under the accepted revision', { ...carried, items: [{ ...(first as object), taskIntentId: B.taskIntentId }] }],
    ] as const) {
      expect(forgedWith(rewrittenFrom), what).toBe('EVALUATION_RECORD_INVALID');
    }
    expect(forgedWith(carried)).toBe('none');
    // A rewrite accepted on this very version, or on a version of no Book here, is no earlier acceptance; one accepted earlier
    // is, for the words it wrote — the 总评 checked against its own 总评. Each case is a rewrite of its own: a decision, once
    // read, never changes.
    const acceptedAs = (recordId: string, verdict: string | null): unknown => {
      const from = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
      accepted.set(from.analysisRevisionId, { recordId, from, items: [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], verdict });
      return { ...carried, items: [mark(ITEMS[0]!, from, 'AI7 的评语一。')], verdict: verdictMark(from, 'AI7 的总评。') };
    };
    expect(forgedWith(acceptedAs(v2, 'AI7 的总评。')), 'accepted on this version').toBe('EVALUATION_RECORD_INVALID');
    expect(forgedWith(acceptedAs(randomUUID(), 'AI7 的总评。')), 'accepted on no version of this Book').toBe('EVALUATION_RECORD_INVALID');
    expect(forgedWith(acceptedAs(v1, '别的总评。')), 'a 总评 the rewrite never wrote').toBe('EVALUATION_RECORD_INVALID');
    expect(forgedWith(acceptedAs(v1, null)), 'a 总评 where the rewrite wrote none').toBe('EVALUATION_RECORD_INVALID');
    expect(forgedWith(acceptedAs(v1, 'AI7 的总评。')), 'accepted earlier, over its own words').toBe('none');
    // When the words or the decisions cannot be read, the mark is kept unchecked rather than refusing 评估; a rewrite no
    // decision accepted is still refused.
    const unread = acceptedAs(v1, '别的总评。');
    wordsReadable = false;
    expect(forgedWith(unread), 'accepted earlier, its words unread').toBe('none');
    // Such a reading is not kept: once the words read, the same rows are read again and the mark is refused.
    wordsReadable = true;
    expect(refused(() => latest(v2)), 'the same rows, the words read now').toBe('EVALUATION_RECORD_INVALID');
    wordsReadable = false;
    expect(forgedWith({ ...carried, items: [first, mark(ITEMS[1]!, B, '编辑的评语 2。')] }), 'never accepted, words unread').toBe('EVALUATION_RECORD_INVALID');
    wordsReadable = true;
    expect(forgedWith(unread), 'accepted earlier, its words read').toBe('EVALUATION_RECORD_INVALID');
    decisionsReadable = false;
    expect(forgedWith({ ...carried, items: [first, mark(ITEMS[1]!, B, '编辑的评语 2。')] }), 'the decisions unread').toBe('none');
    decisionsReadable = true;
    expect(forgedWith(carried)).toBe('none');
    // A rewrite another Book accepted, over these very words, is no acceptance of this Book's (#720 review P2-1).
    const other = randomUUID();
    const w1 = records.start(other);
    records.save(other, w1, 1, own(), false);
    const read = records.rewritable(other, w1);
    const D = { taskIntentId: randomUUID(), analysisRevisionId: randomUUID() };
    const taken = { items: [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], verdict: 'AI7 的总评。' };
    const ordinal = records.applyRewrite(other, w1, { entryOrdinal: read.entryOrdinal, entrySha256: read.entrySha256 }, taken, D);
    adoptions.set(`${w1}:${ordinal}`, D);
    accepted.set(D.analysisRevisionId, { recordId: w1, from: D, ...taken });
    expect(records.ai7Words(other, w1)).toEqual({ items: [mark(ITEMS[0]!, D, 'AI7 的评语一。')], verdict: verdictMark(D, 'AI7 的总评。') });
    expect(forgedWith({ ...carried, items: [mark(ITEMS[0]!, D, 'AI7 的评语一。')], verdict: verdictMark(D, 'AI7 的总评。') }), 'accepted on another Book')
      .toBe('EVALUATION_RECORD_INVALID');
    expect(forgedWith(carried)).toBe('none');
  });

  it('names only the words whose marks could not be checked, and only while they stand (Issue #708)', () => {
    const v1 = records.start(bookId);
    save(v1, () => own());
    adopt(v1, [{ itemId: ITEMS[0]!, comment: 'AI7 的评语一。' }], null, A);
    save(v1, (content) => ({ ...content, conclusion: 'revise' }), true);
    const v2 = records.start(bookId);
    damage(v1, 1);
    // While A's acceptance cannot be checked — its words unreadable now — item 1, carried from v1, is unchecked. v2 adopts B
    // on item 2, checked against its own 采用: only item 1 is named.
    wordsReadable = false;
    save(v2, (content) => ({ ...content, conclusion: 'revise' }));
    adopt(v2, [{ itemId: ITEMS[1]!, comment: 'B 的评语二。' }], 'B 的总评。', B);
    const SECOND = `「${BUILTIN_EVALUATION_PROFILE.items[1]!.label}」的评语`;
    expect(records.workspace(bookId, '书', v2).record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    expect(evaluationCarriedMarksNotice(FIRST)).toBe(`较早的评估版本记录已损坏，AI7 评语的标注无法全部核对；以下仍按 AI7 所写处理：${FIRST}。`);
    expect(records.ai7Words(bookId, v2)!.items.map((item) => item.itemId)).toEqual([ITEMS[0], ITEMS[1]]);
    // The next version carries both: still only item 1 is named.
    save(v2, (content) => content, true);
    const v3 = records.start(bookId);
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    // Once the editor's words stand on item 1, nothing unchecked is left to name, though the version before is still damaged.
    save(v3, (content) => withComment(content, 0, '编辑的评语一。'));
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBeNull();
    expect(records.ai7Words(bookId, v3)).toEqual({ items: [mark(ITEMS[1]!, B, 'B 的评语二。')], verdict: verdictMark(B, 'B 的总评。') });
    // Pasting the words back makes them AI7's again, and unchecked again.
    save(v3, (content) => withComment(content, 0, 'AI7 的评语一。'));
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBe(evaluationCarriedMarksNotice(FIRST));
    // Once A's acceptance reads, the mark is checked against the words A wrote — verified is checked (#720 review P3-1) — and
    // nothing is named, though v1 is still damaged; the words stay AI7's.
    wordsReadable = true;
    expect(records.workspace(bookId, '书', v3).record!.ai7WordsNotice).toBeNull();
    expect(records.ai7Words(bookId, v3)!.items.map((item) => item.itemId)).toEqual([ITEMS[0], ITEMS[1]]);
    expect(records.workspace(bookId, '书', v2).record!.ai7WordsNotice).toBeNull();
    // The adoption notice names, of the same words, only those of unknown source.
    const other = randomUUID();
    const w1 = records.start(other);
    records.save(other, w1, 1, own(), false);
    const read = records.rewritable(other, w1);
    const ordinal = records.applyRewrite(other, w1, { entryOrdinal: read.entryOrdinal, entrySha256: read.entrySha256 },
      { items: [{ itemId: ITEMS[1]!, comment: 'B 的评语二。' }], verdict: null }, B);
    adoptions.set(`${w1}:${ordinal}`, B);
    decisionsReadable = false;
    expect(records.workspace(other, '书', w1).record!.ai7WordsNotice).toBe(evaluationAdoptionsNotice(SECOND));
    decisionsReadable = true;
    expect(records.workspace(other, '书', w1).record!.ai7WordsNotice).toBeNull();
  });

  it('keeps what each earlier version leaves between reads, and reads afresh what moved since (Issue #708)', () => {
    const reads = new Map<string, number>();
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
    let counted = owner();
    const saveIn = (recordId: string): void => {
      const version = counted.rewritable(bookId, recordId);
      counted.save(bookId, recordId, version.entryOrdinal, { ...own(), conclusion: 'revise' }, true);
    };
    const versions: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      versions.push(counted.start(bookId));
      saveIn(versions.at(-1)!);
    }
    const [first, second, , last] = versions as [string, string, string, string];
    // Once read, no version's chain is read again — not by the page, nor by any per-version operation — while its rows stand.
    counted.workspace(bookId, '书', null);
    reads.clear();
    for (let index = 0; index < 5; index += 1) counted.rewritable(bookId, last);
    counted.finalizedOf(bookId, last);
    counted.ai7Words(bookId, last);
    counted.workspace(bookId, '书', last);
    expect(counted.latestFinalized(bookId)?.recordId).toBe(last);
    expect(reads.size).toBe(0);
    // A version whose rows moved is read afresh, and every one after it.
    damage(first, 1);
    reads.clear();
    expect(counted.workspace(bookId, '书', null).unreadableRecords).toEqual([1]);
    expect([first, ...versions.slice(1)].map((recordId) => reads.get(recordId))).toEqual([1, 1, 1, 1]);
    reads.clear();
    counted.rewritable(bookId, last);
    expect(reads.size).toBe(0);
    // A new entry reads its own version again, and nothing before it.
    const v4 = counted.start(bookId);
    reads.clear();
    counted.save(bookId, v4, 1, { ...own(), conclusion: 'defer' }, false);
    counted.rewritable(bookId, v4);
    expect([...reads.keys()]).toEqual([v4]);
    // A read while the 采用 records could not be read is not kept: a later read reads the versions again.
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

  it('counts adjusted Books without failing the house on one Book\'s damage (Issue #702 review)', () => {
    const recordId = records.start(bookId);
    save(recordId, () => own());
    // A version planted as begun from AI7's 初评, its chain then damaged: it counts for nothing, and 设置 still reads.
    db.prepare('INSERT INTO evaluation_initial_drafts(record_id, analysis_revision_id, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(recordId, randomUUID(), '2026-10-09T00:00:00.000Z', '{}', sha256Hex('{}'));
    db.exec('DROP TRIGGER evaluation_record_entries_no_update');
    db.prepare("UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND ordinal = 1").run('0'.repeat(64), recordId);
    db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    expect(records.calibration()).toEqual({ adjustments: 0, unreadable: 1, basisBooks: 0, offsets: null });
  });
});
