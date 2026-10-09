import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import {
  BUILTIN_EVALUATION_PROFILE,
  EVALUATION_INITIAL_DRAFT_TRIGGER_SQL,
  EVALUATION_RECORD_TRIGGER_SQL,
  EvaluationError,
  EvaluationRecords,
  initializeEvaluationInitialDraftSchema,
  initializeEvaluationRecordSchema,
  type InitialEvaluationFacts,
} from '../../src/service/evaluation-records.js';
import type { EvaluationContent } from '../../src/shared/protocol.js';

// The house calibration offset (Issue #429, EVAL-011a; V2-UX-EVAL-011, §8.6 「10 本调分记录」) over the record owner on an
// in-memory database, AI7's 初评 and the house switch stubbed: below ten adjusted Books no offset exists and a version begun
// from AI7's 初评 starts raw; at ten, each item's offset is the mean of (editor's 定稿 − AI7 raw) over each Book's latest 定稿
// begun from AI7's 初评, one value per Book, to the half point, applied to AI7's starting scores clamped to [0, 满分] and never
// to a risk item; the version records 「AI7 初评 N · 校准后 M」 with the raw score kept, and reads the editor's departures against
// the start it offered; 停用 starts raw and turning it back on applies again; a later 定稿 changes the offset at the next read;
// a `/2` snapshot reads with none applied and a forged `/3` is refused; a Book with a damaged version gives the basis nothing.
// Every score is the suite's own.

const ITEMS = BUILTIN_EVALUATION_PROFILE.items.map((item) => item.itemId);
const [LITERARY, THEME, , CHINESE, READERS] = ITEMS as [string, string, string, string, string];
/** AI7's raw 初评 scores, as the fixture's: 73 / 100. */
const RAW = [16.5, 15, 15.5, 14, 12];

let db: DatabaseSync;
let records: EvaluationRecords;
let calibrationOn: boolean;
/** Each Book's manuscript revision, stable per Book. */
let revisions: Map<string, string>;
/** AI7's raw scores per Book, where a Book's differ from `RAW`. */
let rawOf: Map<string, ReadonlyArray<number | null>>;

const revisionOf = (bookId: string): string => {
  let revision = revisions.get(bookId);
  if (revision === undefined) {
    revision = randomUUID();
    revisions.set(bookId, revision);
  }
  return revision;
};

function facts(bookId: string): InitialEvaluationFacts {
  const scores = rawOf.get(bookId) ?? RAW;
  return {
    draft: {
      revisionId: randomUUID(),
      ordinal: 1,
      revisionLabel: 'r1',
      createdAt: '2026-10-09T00:00:00.000Z',
      items: ITEMS.map((itemId, index) => ({
        itemId, score: scores[index] ?? null, comment: `AI7 对第 ${index + 1} 项的评语。`, sufficiency: 'sufficient', citedBlocks: 3, unitsCited: 2,
        evidence: [{ unitOrdinal: 1, note: 'AI7 的依据。', blockIds: ['b1'] }],
      })),
      unitsTotal: 2,
      unreadUnits: [],
      strengths: ['优点一。'],
      weaknesses: ['问题一。'],
      nextStep: '下一步。',
      suggestedConclusion: 'revise',
      complete: true,
      market: null,
    },
    manuscriptRevisionId: revisionOf(bookId),
    current: true,
    profileSha256: records.profile().sha256,
  };
}

beforeEach(() => {
  db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  initializeEvaluationRecordSchema(db);
  initializeEvaluationInitialDraftSchema(db);
  calibrationOn = true;
  revisions = new Map();
  rawOf = new Map();
  records = new EvaluationRecords(
    db,
    { current: (bookId) => ({ manuscriptId: `m-${bookId}`, revisionId: revisionOf(bookId), revisionLabel: 'r1', uncheckpointed: false }) },
    { latest: (bookId) => facts(bookId), task: () => ({ task: null, prepare: { allowed: false, reason: '' } }) },
    undefined, undefined, undefined,
    { calibrationEnabled: () => calibrationOn },
  );
});

afterEach(() => {
  db.close();
});

const RISKS: EvaluationContent['risks'] = [
  { riskId: 'facts-and-sources', level: 'low', statement: '已核对。', reviewed: false },
  { riskId: 'law-rights-ethics-policy', level: 'low', statement: '未见风险。', reviewed: false },
];

/** The version's latest saved content, as the editor would read it back. */
const content = (bookId: string, recordId: string) => records.rewritable(bookId, recordId);

/** 从 AI7 初评开始, then 定稿 with the editor's scores where `edits` names them (`'not-rated'` for 不评). */
function finalizeFromInitial(bookId: string, edits: Partial<Record<string, number | 'not-rated'>> = {}): string {
  const recordId = records.start(bookId, true);
  const version = content(bookId, recordId);
  const next: EvaluationContent = {
    ...version.content,
    items: version.content.items.map((item) => {
      const edit = edits[item.itemId];
      if (edit === undefined) return item;
      return edit === 'not-rated' ? { ...item, score: null, notRated: '资料不足，暂不评。' } : { ...item, score: edit };
    }),
    risks: RISKS,
    conclusion: 'revise',
  };
  records.save(bookId, recordId, version.entryOrdinal, next, true);
  return recordId;
}

/** Ten Books, each 定稿 from AI7's 初评: 读者与市场潜力 12 → 10 on every Book; 文学品质 16.5 → 17 on the odd ones; 中文语言 14 → 20
 * on every Book; 主题 不评 on the first. */
function tenBooks(): string[] {
  const books: string[] = [];
  for (let index = 1; index <= 10; index += 1) {
    const bookId = randomUUID();
    books.push(bookId);
    finalizeFromInitial(bookId, {
      [READERS]: 10,
      [CHINESE]: 20,
      ...(index % 2 === 1 ? { [LITERARY]: 17 } : {}),
      ...(index === 1 ? { [THEME]: 'not-rated' as const } : {}),
    });
  }
  return books;
}

const offsetsOf = () => {
  const house = records.calibration();
  return house.offsets === null ? null : Object.fromEntries([...house.offsets].map(([itemId, entry]) => [itemId, [entry.offset, entry.books]]));
};

function refused(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof EvaluationError) return error.code;
    throw error;
  }
  return 'none';
}

describe('the house calibration offset (EVAL-011a)', () => {
  it('exists only from ten adjusted Books, as each item\'s mean to the half point, and moves AI7\'s starting scores within the scale', () => {
    const books: string[] = [];
    for (let index = 1; index <= 9; index += 1) {
      const bookId = randomUUID();
      books.push(bookId);
      finalizeFromInitial(bookId, { [READERS]: 10, [CHINESE]: 20, ...(index % 2 === 1 ? { [LITERARY]: 17 } : {}), ...(index === 1 ? { [THEME]: 'not-rated' as const } : {}) });
    }
    // Nine Books: the gate is not passed, so no offset exists and a tenth version starts from the raw 初评.
    expect(records.calibration()).toMatchObject({ adjustments: 9, unreadable: 0, basisBooks: 9, offsets: null });
    const tenth = randomUUID();
    const rawStart = records.start(tenth, true);
    const rawPage = records.workspace(tenth, '书', rawStart);
    expect(rawPage.record).toMatchObject({ calibration: null, state: 'draft' });
    expect(rawPage.record!.content.items.map((item) => item.score)).toEqual(RAW);
    records.save(tenth, rawStart, 1, { ...rawPage.record!.content, items: rawPage.record!.content.items.map((item) => (item.itemId === READERS ? { ...item, score: 10 } : item.itemId === CHINESE ? { ...item, score: 20 } : item)), risks: RISKS, conclusion: 'revise' }, true);
    // Ten: 文学品质 +0.5 over 10 Books (+0.5 on five → 0.25 → half point), 主题 0 over 9 (one 不评), 结构 0, 中文语言 +6, 读者 −2.
    expect(records.calibration()).toMatchObject({ adjustments: 10, unreadable: 0, basisBooks: 10 });
    expect(offsetsOf()).toEqual({ [LITERARY]: [0.5, 10], [THEME]: [0, 9], [ITEMS[2]!]: [0, 10], [CHINESE]: [6, 10], [READERS]: [-2, 10] });

    // A Book whose AI7 raw scores sit near the ends of the scale: the adjusted start is clamped to [0, 满分]; an item whose
    // offset is 0 is left as it is; the raw score stays beside each adjusted one; no risk and no conclusion is touched.
    const eleventh = randomUUID();
    rawOf.set(eleventh, [16.5, 15, 15.5, 18, 1]);
    const seeded = records.start(eleventh, true);
    const page = records.workspace(eleventh, '书', seeded);
    expect(page.record!.content.items.map((item) => [item.score, item.adjustment])).toEqual([[17, null], [15, null], [15.5, null], [20, null], [0, null]]);
    expect(page.record!.initial!.items.map((item) => item.score)).toEqual([16.5, 15, 15.5, 18, 1]);
    expect(page.record!.calibration).toEqual({
      basisBooks: 10,
      items: [
        { itemId: LITERARY, raw: 16.5, offset: 0.5, adjusted: 17 },
        { itemId: CHINESE, raw: 18, offset: 6, adjusted: 20 },
        { itemId: READERS, raw: 1, offset: -2, adjusted: 0 },
      ],
    });
    expect(page.record!.content.risks).toEqual(BUILTIN_EVALUATION_PROFILE.risks.map((risk) => ({ riskId: risk.riskId, level: null, statement: null, reviewed: false })));
    expect(page.record).toMatchObject({ conclusion: null, state: 'draft', total: { score: 67.5, fullMarks: 100 } });
    // The editor's departures are read against the start the version offered: keeping 17 is no departure, 16.5 — AI7's raw — is.
    const kept = content(eleventh, seeded);
    records.save(eleventh, seeded, kept.entryOrdinal, { ...kept.content, verdict: '可用。', items: kept.content.items.map((item) =>
      (item.itemId === LITERARY ? { ...item, adjustment: { reasons: ['too-high'], note: null } } : item)) }, false);
    expect(content(eleventh, seeded).content.items[0]!.adjustment).toBeNull();
    const departing = content(eleventh, seeded);
    records.save(eleventh, seeded, departing.entryOrdinal, { ...departing.content, items: departing.content.items.map((item) =>
      (item.itemId === LITERARY ? { ...item, score: 16.5, adjustment: { reasons: ['too-high'], note: null } } : item)) }, false);
    expect(content(eleventh, seeded).content.items[0]).toMatchObject({ score: 16.5, adjustment: { reasons: ['too-high'], note: null } });
    // The snapshot records the calibration as `/3`, the raw scores in the draft, and refuses a forged adjusted score.
    const row = db.prepare('SELECT canonical_json FROM evaluation_initial_drafts WHERE record_id = ?').get(seeded) as { canonical_json: string };
    const stored = JSON.parse(row.canonical_json) as { schema: string; calibration: { items: Array<{ adjusted: number }> }; draft: { items: Array<{ score: number }> } };
    expect(stored.schema).toBe('ai7.evaluation-initial-draft/3');
    expect(stored.draft.items.map((item) => item.score)).toEqual([16.5, 15, 15.5, 18, 1]);
    const forged = canonicalRecord({ ...stored, calibration: { ...stored.calibration, items: stored.calibration.items.map((item, index) => (index === 0 ? { ...item, adjusted: 17.5 } : item)) } });
    db.exec('DROP TRIGGER evaluation_initial_drafts_no_update');
    db.prepare('UPDATE evaluation_initial_drafts SET canonical_json = ?, sha256 = ? WHERE record_id = ?').run(forged.json, forged.digest, seeded);
    db.exec(EVALUATION_INITIAL_DRAFT_TRIGGER_SQL.evaluation_initial_drafts_no_update!);
    expect(refused(() => records.workspace(eleventh, '书', seeded))).toBe('EVALUATION_RECORD_INVALID');
    // A `/2` snapshot — written before the offset existed — reads with no calibration applied.
    const { calibration: _calibration, ...v2 } = stored;
    const planted = canonicalRecord({ ...v2, schema: 'ai7.evaluation-initial-draft/2' });
    db.exec('DROP TRIGGER evaluation_initial_drafts_no_update');
    db.prepare('UPDATE evaluation_initial_drafts SET canonical_json = ?, sha256 = ? WHERE record_id = ?').run(planted.json, planted.digest, seeded);
    db.exec(EVALUATION_INITIAL_DRAFT_TRIGGER_SQL.evaluation_initial_drafts_no_update!);
    expect(records.workspace(eleventh, '书', seeded).record).toMatchObject({ calibration: null, initial: { items: [{ score: 16.5 }, { score: 15 }, { score: 15.5 }, { score: 18 }, { score: 1 }] } });
  });

  it('starts raw while the house has turned calibration off, applies again once it is on, and follows the latest 定稿 at the next read', () => {
    const books = tenBooks();
    expect(offsetsOf()).toEqual({ [LITERARY]: [0.5, 10], [THEME]: [0, 9], [ITEMS[2]!]: [0, 10], [CHINESE]: [6, 10], [READERS]: [-2, 10] });
    // Off: the offset is still computed and disclosed, and a new version starts from the raw 初评, recording no calibration.
    calibrationOn = false;
    const off = randomUUID();
    const offStart = records.start(off, true);
    expect(records.calibration().offsets).not.toBeNull();
    const offPage = records.workspace(off, '书', offStart).record!;
    expect([offPage.calibration, offPage.content.items.map((item) => item.score)]).toEqual([null, RAW]);
    // On again: applied as the house's 定稿 evaluations say now.
    calibrationOn = true;
    const on = randomUUID();
    const onPage = records.workspace(on, '书', records.start(on, true)).record!;
    expect(onPage.content.items.map((item) => item.score)).toEqual([17, 15, 15.5, 20, 10]);
    expect(onPage.calibration).toMatchObject({ basisBooks: 10, items: [{ itemId: LITERARY, adjusted: 17 }, { itemId: CHINESE, adjusted: 20 }, { itemId: READERS, raw: 12, offset: -2, adjusted: 10 }] });
    // The first Book is evaluated again from AI7's 初评 — its start calibrated — and 定稿 with 读者 at 20: its latest 定稿 begun from
    // AI7's 初评 now gives +8 there, so the offset is (9 × −2 + 8) / 10 = −1 at the next read, and nothing was stored to go stale.
    const again = records.start(books[0]!, true);
    const carried = content(books[0]!, again);
    expect(carried.content.items.map((item) => item.score)).toEqual([17, 15, 15.5, 20, 10]);
    // Risks carry from the Book's last 定稿, a person's review not counted, untouched by calibration.
    expect(carried.content.risks).toEqual(RISKS);
    records.save(books[0]!, again, carried.entryOrdinal, { ...carried.content, items: carried.content.items.map((item) => (item.itemId === READERS ? { ...item, score: 20 } : item)), conclusion: 'revise' }, true);
    expect(offsetsOf()).toEqual({ [LITERARY]: [0.5, 10], [THEME]: [0, 10], [ITEMS[2]!]: [0, 10], [CHINESE]: [6, 10], [READERS]: [-1, 10] });
    expect(records.calibration()).toMatchObject({ adjustments: 10, basisBooks: 10 });
    const later = randomUUID();
    expect(records.workspace(later, '书', records.start(later, true)).record!.content.items.map((item) => item.score)).toEqual([17, 15, 15.5, 20, 11]);
    // Versions still being scored count for nothing: three open versions changed neither the gate nor the basis.
    expect(records.calibration().basisBooks).toBe(10);
  });

  it('counts a Book with a damaged version begun from AI7\'s 初评 for nothing, and the house still reads (Issue #702 review)', () => {
    const books = tenBooks();
    expect(records.calibration().offsets).not.toBeNull();
    db.exec('DROP TRIGGER evaluation_record_entries_no_update');
    db.prepare('UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = (SELECT record_id FROM evaluation_records WHERE book_id = ?) AND ordinal = 1')
      .run('0'.repeat(64), books[1]!);
    db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    // Nine adjusted Books remain: below the gate again, the damaged Book named, and the basis without it.
    expect(records.calibration()).toEqual({ adjustments: 9, unreadable: 1, basisBooks: 9, offsets: null });
    const next = randomUUID();
    expect(records.workspace(next, '书', records.start(next, true)).record).toMatchObject({ calibration: null });
  });
});
