import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { findTerms, scanSource, scanTargets } from '../../tools/words-report.mjs';
import { RUN_QUEUED_LABEL, RUN_STATE_LABELS } from '../../src/service/analysis/run-state.js';
import { BACKGROUND_OUTCOME_UNKNOWN, BACKGROUND_PAUSED, BACKGROUND_PLACE_BUSY } from '../../src/service/background-analysis-enrollments.js';
import { OUTCOME_UNKNOWN_NO_REDO, RUN_CONTROL_REDO_NOT_BEGUN_REASON, RUN_CONTROL_REDO_REASON } from '../../src/service/task-plan.js';
import { BOOK_DELIVERY_PACKAGE_WORDS } from '../../src/service/book-delivery-packages.js';
import { houseAnnotationDetail } from '../../src/shared/protocol/house-word-list.js';
import { localDayLabel } from '../../src/shared/report-wording.js';
import { houseAnnotationWords, markDisplayNote } from '../../src/renderer/editorial-mark-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';

// Issue #1531 (plan #1516 §5): the vocabulary report of #1546 as a failing test. Every ordinary-mode sentence of the renderer,
// and the service-authored sentences the editor reads as they are, holds none of the table's banned terms; the developer
// layer's words live in the first argument of `technicalWords`, which the scan skips. The table is the one of
// `tools/words-table.mjs`: no second list here.

type Banned = { line: number; term: string; use: string };
type Result = { file: string; banned: Banned[]; lostSync: boolean };

/** Whole screens that are the developer layer's: their words wait for the slice that opens them. */
const DEVELOPER_SCREENS: Readonly<Record<string, string>> = {
  'src/renderer/learning-audit-labels.ts': '学习回溯 stays developer-only until 0.7.4 (#1539)',
};

/** Developer-only sentences in a module whose other words are ordinary: each names the literal it allows on its line. */
const DEVELOPER_SENTENCES: ReadonlyArray<{ readonly file: string; readonly text: string; readonly why: string }> = [
  ...['学习准入', '记录学习准入决定', '正在读取学习准入…', '学习准入已打开', '无法读取学习准入。', '正在记录学习准入决定…', '学习准入决定已记录。']
    .map((text) => ({ file: 'src/renderer/quality-learning-labels.ts', text: `'${text}'`, why: 'the 学习准入 tab is developer-only (editor-surfaces §10.3); the module stays import-free for its DST test' })),
];

/** Service-authored sentences shown as they are, projected on every read: none is stored in a record, digested or sent to a model. */
const SERVICE_SENTENCES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(RUN_STATE_LABELS).map(([state, label]) => [`RUN_STATE_LABELS.${state}`, label])),
  RUN_QUEUED_LABEL, BACKGROUND_PAUSED, BACKGROUND_OUTCOME_UNKNOWN, BACKGROUND_PLACE_BUSY,
  OUTCOME_UNKNOWN_NO_REDO, RUN_CONTROL_REDO_REASON, RUN_CONTROL_REDO_NOT_BEGUN_REASON,
  ...Object.fromEntries(Object.entries(BOOK_DELIVERY_PACKAGE_WORDS).map(([key, words]) => [`BOOK_DELIVERY_PACKAGE_WORDS.${key}`, String(words)])),
};

/** Service files whose every literal is a projection the editor reads (findings are aggregated on each read). */
const SERVICE_FILES = ['src/service/book-findings.ts'];

const lineOf = (file: string, line: number): string => readFileSync(file, 'utf8').split(/\r?\n/u)[line - 1] ?? '';

describe('ordinary-mode words follow the one table (plan #1516 §5)', () => {
  const { results, missing, unreadable } = scanTargets([...(scanTargets().results as Result[]).map((result) => result.file), ...SERVICE_FILES]) as
    { results: Result[]; missing: string[]; unreadable: string[] };

  it('scans every renderer module and the service projections, and loses its place in none', () => {
    expect([missing, unreadable]).toEqual([[], []]);
    expect(results.filter((result) => result.lostSync).map((result) => result.file)).toEqual([]);
    expect(results.some((result) => result.file === 'src/renderer/task-drawer-labels.ts')).toBe(true);
  });

  it('finds no banned term outside the technical argument of technicalWords', () => {
    const allowed = new Set<string>();
    const hits = results.flatMap((result) => DEVELOPER_SCREENS[result.file] !== undefined ? [] : result.banned.flatMap((hit) => {
      const text = lineOf(result.file, hit.line);
      const sentence = DEVELOPER_SENTENCES.find((entry) => entry.file === result.file && text.includes(entry.text));
      if (sentence !== undefined) { allowed.add(sentence.text); return []; }
      return [`${result.file}:${hit.line} ${hit.term} -> ${hit.use}`];
    }));
    expect(hits).toEqual([]);
    // Every exception still names a sentence that is there: none outlives the words it was written for.
    expect(DEVELOPER_SENTENCES.filter((entry) => !allowed.has(entry.text)).map((entry) => entry.text)).toEqual([]);
    for (const file of Object.keys(DEVELOPER_SCREENS)) expect(results.some((result) => result.file === file)).toBe(true);
  });

  it('finds none in the service-authored sentences the editor reads as they are', () => {
    const hits = Object.entries(SERVICE_SENTENCES).flatMap(([name, words]) =>
      (findTerms(words) as Array<{ kind: string; found: string }>).filter((span) => span.kind === 'banned').map((span) => `${name}: ${span.found}`));
    expect(hits).toEqual([]);
  });

  it('reads a review annotation from 本社词表 by that one name and its day, and leaves the record as it is', () => {
    const pin = { listId: '00000000-0000-4000-8000-000000000001', versionId: '00000000-0000-4000-8000-000000000002', digest: 'a'.repeat(64) };
    const note = houseAnnotationDetail({ entryId: '00000000-0000-4000-8000-000000000003', literal: '甲词', note: '合成说明', enabled: true }, { pin, ordinal: 3 });
    try {
      setTechnicalLayerVisible(false);
      const day = localDayLabel('2026-11-16T04:00:00.000Z');
      expect(markDisplayNote(note, '2026-11-16T04:00:00.000Z').text).toBe(`本社词表 · ${day}\n词条：甲词\n词条说明：合成说明\n命中本社词条，请编辑判断。`);
      expect(houseAnnotationWords('另一条批注')).toBe('另一条批注');
      setTechnicalLayerVisible(true);
      expect(houseAnnotationWords(note)).toBe(note);
    } finally { setTechnicalLayerVisible(false); }
  });

  it('fails on a banned term the moment one comes back, and not on its developer-layer twin', () => {
    expect(scanSource("export const A = '任务已中断 · 可续行';").banned.map((hit: Banned) => hit.term)).toEqual(['续行']);
    expect(scanSource("export const a = (): string => technicalWords('任务已中断 · 可续行', '任务已中断 · 可继续');").banned).toEqual([]);
  });
});
