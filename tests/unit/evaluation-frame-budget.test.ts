import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_EVALUATION_PROFILE,
  EvaluationRecords,
  initializeEvaluationInitialDraftSchema,
  initializeEvaluationRecordSchema,
  type InitialEvaluationFacts,
} from '../../src/service/evaluation-records.js';
import { boundedEvidence, rewriteProposalItems } from '../../src/service/evaluation-rewrites.js';
import { MAX_UNIT_OBSERVATIONS as MAX_INITIAL_UNIT_OBSERVATIONS } from '../../src/service/evaluation/initial-evaluation-contract.js';
import { MAX_UNIT_OBSERVATIONS as MAX_REWRITE_UNIT_OBSERVATIONS, MAX_OBSERVATION_BLOCKS } from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import {
  MAX_EVALUATION_EVIDENCE_NOTES,
  MAX_FRAME_BYTES,
  MIN_SERIES_PREDICTION_BOOKS,
  type EvaluationMarketProjection,
  type EvaluationRewriteWorkspaceProjection,
} from '../../src/shared/protocol.js';

// 评估's one answer within the 512 KiB frame on a long Book (Issue #689, from #682's review): a version begun from AI7's 初评,
// AI7's latest 初评 beside it and a rewrite waiting, each with every note the contracts admit — the most notes per range, the
// longest notes, the most blocks cited — over many reading ranges. Each item carries at most `MAX_EVALUATION_EVIDENCE_NOTES` of
// its notes, spread over the ranges, and says how many there are. The words are the suite's own, never a manuscript's.

const RANGES = 60;
/** The answer's envelope beside the projection: the frame's own fields, generously. */
const ENVELOPE_BYTES = 4 * 1024;

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  initializeEvaluationRecordSchema(db);
  initializeEvaluationInitialDraftSchema(db);
});

afterEach(() => {
  db.close();
});

const words = (length: number, seed: number): string => Array.from({ length }, (_, index) => String.fromCodePoint(0x4e00 + ((seed * 31 + index) % 20_000))).join('');
const blocks = (seed: number): string[] => Array.from({ length: MAX_OBSERVATION_BLOCKS }, (_, index) => `blk_${(seed * 8 + index).toString(16).padStart(24, '0')}`);
const ITEMS = BUILTIN_EVALUATION_PROFILE.items.map((item) => item.itemId);

/** Every range's notes at the contract's most, shared evenly among the items, in reading order. */
function notes(perRange: number): Array<{ itemId: string; unitOrdinal: number; note: string; blockIds: string[] }> {
  const all: Array<{ itemId: string; unitOrdinal: number; note: string; blockIds: string[] }> = [];
  for (let unit = 1; unit <= RANGES; unit += 1) {
    for (let index = 0; index < perRange; index += 1) {
      const seed = unit * 100 + index;
      all.push({ itemId: ITEMS[index % ITEMS.length]!, unitOrdinal: unit, note: words(200, seed), blockIds: blocks(seed) });
    }
  }
  return all;
}

const MARKET: EvaluationMarketProjection = {
  series: [], comparables: [], comparableCount: 0, seriesUnreadable: false,
  pricing: {
    booksWithActuals: 0, otherBooksWithActuals: 0, threshold: 30, enabled: false, available: false, unreadable: false,
    house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: MIN_SERIES_PREDICTION_BOOKS,
  },
};

describe('评估 on a long Book stays within one frame (Issue #689)', () => {
  it('spreads the notes it keeps over the ranges read and says how many there are', () => {
    const evidence = notes(MAX_INITIAL_UNIT_OBSERVATIONS).filter((note) => note.itemId === ITEMS[0]);
    const bounded = boundedEvidence(evidence);
    expect(bounded.evidenceCount).toBe(evidence.length);
    expect(bounded.evidence).toHaveLength(MAX_EVALUATION_EVIDENCE_NOTES);
    // One note from each of twelve ranges spread over all sixty, in reading order, the first range's first.
    const units = bounded.evidence.map((note) => note.unitOrdinal);
    expect(units).toEqual([1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56]);
    expect(bounded.evidence[0]).toBe(evidence[0]);
    // A few ranges: each range's first note, then each one's second, until the room is spent.
    const few = [1, 1, 1, 2, 2, 3].map((unitOrdinal, index) => ({ unitOrdinal, index }));
    expect(boundedEvidence(few, 4).evidence.map((note) => note.index)).toEqual([0, 1, 3, 5]);
    expect(boundedEvidence(few, 6)).toEqual({ evidence: few, evidenceCount: 6 });
    // At the bound and one past it.
    expect(boundedEvidence(evidence.slice(0, MAX_EVALUATION_EVIDENCE_NOTES)).evidence).toHaveLength(MAX_EVALUATION_EVIDENCE_NOTES);
    expect(boundedEvidence(evidence.slice(0, MAX_EVALUATION_EVIDENCE_NOTES + 1))).toMatchObject({ evidenceCount: MAX_EVALUATION_EVIDENCE_NOTES + 1 });
    expect(boundedEvidence(evidence.slice(0, MAX_EVALUATION_EVIDENCE_NOTES + 1)).evidence).toHaveLength(MAX_EVALUATION_EVIDENCE_NOTES);
    expect(boundedEvidence([], 4)).toEqual({ evidence: [], evidenceCount: 0 });
  });

  it('answers a version begun from a 初评, the latest 初评 and a waiting rewrite over many reading ranges within the frame', () => {
    const bookId = randomUUID();
    const manuscript = { manuscriptId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', uncheckpointed: false };
    const initialNotes = notes(MAX_INITIAL_UNIT_OBSERVATIONS);
    const facts = (profileSha256: string): InitialEvaluationFacts => ({
      draft: {
        revisionId: randomUUID(), ordinal: 1, revisionLabel: 'r1', createdAt: '2026-10-09T00:00:00.000Z',
        items: ITEMS.map((itemId, index) => ({
          itemId, score: 15, comment: words(300, index), sufficiency: 'sufficient', citedBlocks: 400, unitsCited: RANGES,
          evidence: initialNotes.filter((note) => note.itemId === itemId).map(({ unitOrdinal, note, blockIds }) => ({ unitOrdinal, note, blockIds })),
        })),
        strengths: [1, 2, 3, 4, 5].map((seed) => words(100, seed)), weaknesses: [6, 7, 8, 9, 10].map((seed) => words(100, seed)),
        nextStep: words(200, 11), suggestedConclusion: 'revise', complete: true, unitsTotal: RANGES, unreadUnits: [],
        market: {
          readers: [1, 2, 3, 4, 5].map((seed) => words(100, seed)), sellingPoints: [1, 2, 3, 4, 5].map((seed) => words(100, seed)),
          channels: [1, 2, 3, 4, 5].map((seed) => words(100, seed)), marketReturn: { statement: words(150, 1), basis: words(200, 2) },
          awards: { statement: words(150, 3), basis: words(200, 4) }, withheld: [],
        },
      },
      manuscriptRevisionId: manuscript.revisionId, current: true, profileSha256,
    });
    const rewriteNotes = notes(MAX_REWRITE_UNIT_OBSERVATIONS);
    const records: EvaluationRecords = new EvaluationRecords(db, { current: () => manuscript }, {
      latest: () => facts(records.profile().sha256),
      task: () => ({ task: null, prepare: { allowed: false, reason: '' } }),
    }, undefined, {
      market: () => MARKET,
      rewrite: (_bookId, version): EvaluationRewriteWorkspaceProjection => ({
        prepare: { allowed: false, reason: '' }, task: null, decided: null,
        proposal: version === null ? null : {
          revisionId: randomUUID(), createdAt: '2026-10-09T00:00:00.000Z', entryOrdinal: 1, current: true,
          reading: { unitsTotal: RANGES, unitsRead: RANGES },
          items: rewriteProposalItems(ITEMS.map((itemId, index) => ({ itemId, comment: words(300, 50 + index) })), rewriteNotes, version.content),
          verdict: { before: null, after: words(600, 60) }, withheld: [],
        },
      }),
    });
    const recordId = records.start(bookId, true);
    const page = records.workspace(bookId, '长书', recordId);

    // Unbounded, the three sets of notes alone would not fit.
    const everyNote = Buffer.byteLength(JSON.stringify([initialNotes, initialNotes, rewriteNotes]), 'utf8');
    expect(everyNote).toBeGreaterThan(MAX_FRAME_BYTES);
    // Bounded, the whole answer does, with its envelope.
    expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThan(MAX_FRAME_BYTES - ENVELOPE_BYTES);

    const perItem = MAX_INITIAL_UNIT_OBSERVATIONS * RANGES / ITEMS.length;
    for (const items of [page.record!.initial!.items, page.initial.latest!.items]) {
      expect(items.map((item) => [item.evidence.length, item.evidenceCount])).toEqual(ITEMS.map(() => [MAX_EVALUATION_EVIDENCE_NOTES, perItem]));
    }
    expect(page.rewrite.proposal!.items.map((item) => [item.evidence.length, item.evidenceCount]))
      .toEqual(ITEMS.map(() => [MAX_EVALUATION_EVIDENCE_NOTES, MAX_REWRITE_UNIT_OBSERVATIONS * RANGES / ITEMS.length]));
    // The version's snapshot keeps every note: only 评估's answer is bounded.
    const snapshot = JSON.parse((db.prepare('SELECT canonical_json FROM evaluation_initial_drafts WHERE record_id = ?').get(recordId) as { canonical_json: string }).canonical_json) as
      { draft: { items: Array<{ evidence: unknown[] }> } };
    expect(snapshot.draft.items.map((item) => item.evidence.length)).toEqual(ITEMS.map(() => perItem));
  });
});
