import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { findTerms, maskSource, scanSource, scanTargets } from '../../tools/words-report.mjs';
import { houseAnnotationDetail } from '../../src/shared/protocol/house-word-list.js';
import { houseAnnotationWords, markDisplayNote } from '../../src/renderer/editorial-mark-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';

// Issue #1531 (plan #1516 §5): the vocabulary report of #1546 as a failing test. Every ordinary-mode sentence of the renderer
// holds none of the table's banned terms — the developer layer's words live in the first argument of `technicalWords`,
// which the scan skips — and every sentence the service hands to the renderer reads none of them AS DISPLAYED, through
// `serviceWords`, the one place the page rewords them. The table is the one of `tools/words-table.mjs`: no second list here.

type Span = { kind: string; found: string; start: number; end: number };

/**
 * Developer-only literals, exempt one by one (never a whole file or a whole line): each is the exact literal with its quote.
 * `why` says where it is shown; a literal that is no longer there fails the test.
 */
const DEVELOPER_LITERALS: ReadonlyArray<{ readonly file: string; readonly literal: string; readonly why: string }> = [
  ...['学习准入', '记录学习准入决定', '正在读取学习准入…', '学习准入已打开', '无法读取学习准入。', '正在记录学习准入决定…', '学习准入决定已记录。']
    .map((text) => ({ file: 'src/renderer/quality-learning-labels.ts', literal: `'${text}'`,
      why: 'the 学习准入 tab is developer-only (editor-surfaces §10.3); the module stays import-free for its DST test' })),
  ...['学习信号来自这条材料参与生成的本社审阅偏好版本', '`本社审阅偏好 v${signal.ordinal}', '`本社审阅偏好 v${version.currentVersion}',
    '`${groups.running} 个已授权或正在运行的审阅任务参考了含有它们的本社审阅偏好版本', '`${groups.prepared} 个已准备、尚未授权的审阅任务不能再授权，需要重新准备。`',
    "reincluding: '正在记录学习准入决定…'", "reincluded: '学习准入决定已记录。'"]
    .map((literal) => ({ file: 'src/renderer/learning-audit-labels.ts', literal,
      why: '学习回溯 is developer-only until 0.7.4 (#1539); the ordinary screens import only its heading and kind labels' })),
  { file: 'src/renderer/manuscript-export.ts', literal: "replaceAll('修订建议'", why: 'the service word the restoration line is rewritten from, where it is displayed' },
];

// The service-authored sentences are checked rule by rule in tests/unit/service-wording.test.ts (review N3). Their module
// holds the service's sentences as the service writes them — the text each rule rewords from — so the scan here reads
// every renderer module but that one; the other test proves every rule's words hold no banned term.
const SERVICE_SENTENCES_MODULE = 'src/renderer/service-wording.ts';

const read = (file: string): string => readFileSync(file, 'utf8');

/** The banned spans of one source file, each with its offset, outside the technical argument of technicalWords. */
function bannedSpans(source: string): Span[] {
  return (findTerms(maskSource(source).text) as Span[]).filter((span) => span.kind === 'banned');
}

/** One-argument technicalWords inside a template that leaves an empty bracket, a doubled or a dangling separator. */
function holes(source: string): string[] {
  const found: string[] = [];
  for (const line of source.split(/\r?\n/u)) {
    // The argument in any quote (review N10): `${technicalWords('…')}` leaves the same hole as a template argument.
    for (const match of line.matchAll(/\$\{technicalWords\((?:`[^`]*`|'[^']*'|"[^"]*")\)\}/gu)) {
      const before = line.slice(0, match.index); const after = line.slice(match.index + match[0].length);
      const open = before.lastIndexOf('`');
      if (open < 0) continue;
      const head = before.slice(open + 1); const tail = after.slice(0, Math.max(0, after.indexOf('`')));
      const joined = `${head}${tail}`.replace(/\$\{[^}]*\}/gu, '甲');
      // A separator left dangling counts only where the call stood at the very start or end of the sentence.
      const dangling = (head === '' && /^ ?· /u.test(tail)) || (tail === '' && / ·$/u.test(head));
      if (dangling || /(（）|「」|《》|\(\)| · +· |，，|；；)/u.test(joined)) found.push(line.trim());
    }
  }
  return found;
}

describe('ordinary-mode words follow the one table (plan #1516 §5)', () => {
  const { results, missing, unreadable } = scanTargets() as { results: Array<{ file: string; lostSync: boolean }>; missing: string[]; unreadable: string[] };

  it('scans every renderer module and the shared report words, and loses its place in none', () => {
    expect([missing, unreadable]).toEqual([[], []]);
    expect(results.filter((result) => result.lostSync).map((result) => result.file)).toEqual([]);
    expect(results.some((result) => result.file === 'src/renderer/task-drawer-labels.ts')).toBe(true);
  });

  it('finds no banned term outside the technical argument of technicalWords, but in the named developer-only literals', () => {
    const used = new Set<string>();
    const hits = results.filter(({ file }) => file !== SERVICE_SENTENCES_MODULE).flatMap(({ file }) => {
      const source = read(file);
      const exempt = DEVELOPER_LITERALS.filter((entry) => entry.file === file).flatMap((entry) =>
        [...source.matchAll(new RegExp(entry.literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu'))].map((match) => ({ entry, start: match.index, end: match.index + entry.literal.length })));
      return bannedSpans(source).flatMap((span) => {
        const allowed = exempt.find((range) => span.start >= range.start && span.end <= range.end);
        if (allowed !== undefined) { used.add(`${allowed.entry.file} ${allowed.entry.literal}`); return []; }
        return [`${file}:${source.slice(0, span.start).split('\n').length} ${span.found}`];
      });
    });
    expect(hits).toEqual([]);
    // Every exception still holds a banned term it was written for: none outlives its words.
    expect(DEVELOPER_LITERALS.filter((entry) => !used.has(`${entry.file} ${entry.literal}`)).map((entry) => entry.literal)).toEqual([]);
  });

  it('leaves no hole where a one-argument technicalWords sits inside a sentence', () => {
    expect(results.flatMap(({ file }) => holes(read(file)).map((line) => `${file}: ${line}`))).toEqual([]);
    expect(holes('const a = `《${t}》${technicalWords(`第 2 版`)} · 已启用`;')).toEqual([]);
    expect(holes('const a = `「${technicalWords(`r1`)}」 · 已启用`;')).toHaveLength(1);
    expect(holes('const a = `甲 · ${technicalWords(`r1`)} · 乙`;')).toHaveLength(1);
    expect(holes("const a = `甲 · ${technicalWords('r1')} · 乙`;")).toHaveLength(1);
  });

  it('reads a review annotation from 本社词表 by that one name on every list, and leaves the record as it is', () => {
    const pin = { listId: '00000000-0000-4000-8000-000000000001', versionId: '00000000-0000-4000-8000-000000000002', digest: 'a'.repeat(64) };
    const note = houseAnnotationDetail({ entryId: '00000000-0000-4000-8000-000000000003', literal: '甲词', note: '合成说明', enabled: true }, { pin, ordinal: 3 });
    try {
      setTechnicalLayerVisible(false);
      expect(markDisplayNote(note).text).toBe('本社词表\n词条：甲词\n词条说明：合成说明\n命中本社词条，请编辑判断。');
      expect(houseAnnotationWords(note)).toBe(markDisplayNote(note).text);
      expect(houseAnnotationWords('另一条批注')).toBe('另一条批注');
      setTechnicalLayerVisible(true);
      expect(houseAnnotationWords(note)).toBe(note);
    } finally { setTechnicalLayerVisible(false); }
  });

  it('fails on a banned term the moment one comes back, and not on its developer-layer twin', () => {
    expect(scanSource("export const A = '任务已中断 · 可续行';").banned.map((hit: { term: string }) => hit.term)).toEqual(['续行']);
    expect(scanSource("export const a = (): string => technicalWords('任务已中断 · 可续行', '任务已中断 · 可继续');").banned).toEqual([]);
  });
});
