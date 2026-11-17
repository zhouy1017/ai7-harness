import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { formatReport, maskSource, scanSource } from '../../tools/words-report.mjs';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { BANNED, BY_HAND, STAYS } from '../../tools/words-table.mjs';

// Issue #1546 (plan #1516 §5): the report that tells an interface slice which of its ordinary-mode sentences break the
// vocabulary table. Synthetic sentences only; the report never reads a manuscript.
const banned = (source: string, extension = '.ts') => scanSource(source, extension).banned.map((hit: { line: number; term: string }) => `${hit.line}:${hit.term}`);
const hand = (source: string) => [...new Set(scanSource(source).hand.map((hit: { from: string; line: number }) => `${hit.line}:${hit.from}`))];

describe('the vocabulary report finds a banned term only in text an editor reads', () => {
  it('finds a banned term in a plain string and reports its line and replacement', () => {
    const result = scanSource("const a = 1;\nconst label = '请先处理待复核的项目';\n");
    expect(result.banned).toEqual([{ line: 2, term: '待复核', use: '待处理' }]);
  });

  it('skips the first argument of technicalWords and reports the second', () => {
    expect(banned("const a = technicalWords('任务的提案', '任务的修改');")).toEqual([]);
    expect(banned("const a = technicalWords('任务的修改', '任务的提案');")).toEqual(['1:提案']);
    expect(banned("const a = technicalWords(`第${n}个提案`, ordinary);")).toEqual([]);
    expect(banned("technicalWords(cond ? '甲提案' : f('乙提案', 1), '丙提案')")).toEqual(['1:提案']);
  });

  it('follows a technicalWords call over several lines and into its template expressions', () => {
    const source = [
      'const a = technicalWords(',
      "  '开发者的凭据',",
      '  `普通的${count > 1 ? \'提案\' : \'\'}说明`,',
      ');',
      "const b = '之后的 tokens 用量';",
    ].join('\n');
    expect(banned(source)).toEqual(['3:提案', '5:tokens']);
  });

  it('does not read code, comments or regular expressions', () => {
    const source = [
      '// 待复核 in a line comment',
      '/** 提案 in a block',
      ' * comment */',
      "const pattern = /['\"]提案/u;",
      "const tokens = tokensBudget('值');",
      "const shown = '要读的提案';",
    ].join('\n');
    expect(banned(source)).toEqual(['6:提案']);
  });

  it('keeps ASCII words out of longer names and takes the longest term first', () => {
    expect(banned("const a = ['maxTokens', 'tokens-row', '已用 Tokens', '词元', 'API 凭据', '应用凭据', '结构单元', '保留缺口'];")).toEqual(
      ['1:Tokens', '1:词元', '1:API 凭据', '1:应用凭据', '1:结构单元', '1:保留缺口'],
    );
  });

  it('does not report a banned term that sits inside a word that stays', () => {
    const table = { banned: [{ from: 'x', terms: ['序'], use: 'y' }], byHand: [], stays: ['工序'] };
    expect(scanSource("const a = '工序';", '.ts', table).banned).toEqual([]);
    expect(scanSource("const a = '工序与顺序';", '.ts', table).banned).toEqual([{ line: 1, term: '序', use: 'y' }]);
  });

  it('lists rows that only the sentence can judge as candidates, not as banned terms', () => {
    expect(banned("const a = '这个版本和发稿版本、已用 Word 文档';")).toEqual([]);
    expect(hand("const a = '这个版本和发稿版本';")).toEqual([]);
    expect(hand("const a = '版本';\nconst b = '共 3 项：高 / 中 / 低';")).toEqual(['1:「版本」（原「第 N 版」被抹掉后的病句）', '2:严重度里混用的「注意」「高 / 中 / 低」']);
    expect(hand("const a = '生产文档';")).toEqual([]);
  });

  it('reads an HTML page as plain text and ignores its comments', () => {
    expect(banned('<!-- 提案 -->\n<p>待你处理</p>', '.html')).toEqual(['2:待你处理']);
  });

  it('says so when it loses its place in a file', () => {
    expect(maskSource("const a = '未结束的串;\nconst b = 1;").lostSync).toBe(true);
    expect(maskSource("const a = '结束了的串';\n").lostSync).toBe(false);
    expect(maskSource('const a = `${1 + 2}`;\nfoo(/[(]/u);\n').lostSync).toBe(false);
  });
});

describe('the table and the report stay in step', () => {
  it('reports every banned term of the table, once, with the replacement of its own row', () => {
    for (const row of BANNED as { terms: string[]; use: string }[]) {
      for (const term of row.terms) {
        const hits = scanSource(`const a = '前${term}后';`).banned;
        expect(hits.map((hit: { term: string }) => hit.term.toLowerCase()), term).toEqual([term.toLowerCase()]);
        expect(hits[0].use, term).toBe(row.use);
      }
    }
  });

  it('keeps every by-hand row and every word that stays well formed', () => {
    for (const row of BY_HAND as { candidate: string; from: string; use: string }[]) {
      expect(() => new RegExp(row.candidate, 'gu'), row.from).not.toThrow();
      expect(row.use, row.from).not.toBe('');
    }
    expect(STAYS).toEqual(expect.arrayContaining(['工序', '发稿版本', '模型@思考强度']));
  });
});

describe('the report text and the command', () => {
  it('prints the banned term, line and replacement per file, then the by-hand rows', () => {
    const text = formatReport({
      results: [
        { file: 'src/renderer/a.ts', banned: [{ line: 4, term: '提案', use: '修改建议' }], hand: [{ from: BY_HAND[1].from, line: 9 }, { from: BY_HAND[1].from, line: 9 }], lostSync: false },
        { file: 'src/renderer/b.ts', banned: [], hand: [], lostSync: true },
      ],
      skipped: 1,
      missing: ['nowhere.ts'],
    });
    expect(text).toContain('src/renderer/a.ts (1)\n  4  提案 -> 修改建议\n1 banned term in 1 of 2 files (1 skipped: not .ts or .html)\nnot found: nowhere.ts');
    expect(text).toContain(`${BY_HAND[1].from} -> ${BY_HAND[1].use}\n    src/renderer/a.ts: 9\n`);
    expect(text).toContain('read these by hand: src/renderer/b.ts');
    expect(text).not.toContain('src/renderer/b.ts (');
  });

  it('exits 0 whatever it finds, accepts files after a "--" and ignores other file types', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai7-words-report-'));
    try {
      const found = join(directory, 'found.ts');
      writeFileSync(found, "export const label = '待你处理';\n");
      writeFileSync(join(directory, 'note.md'), '待你处理');
      const tool = fileURLToPath(new URL('../../tools/words-report.mjs', import.meta.url));
      const run = (...targets: string[]) => spawnSync(process.execPath, [tool, '--', ...targets], { encoding: 'utf8', windowsHide: true });
      const withFinding = run(found, join(directory, 'note.md'), join(directory, 'missing.ts'));
      expect(withFinding.status).toBe(0);
      expect(withFinding.stdout).toMatch(/\n {2}1 {2}待你处理 -> 待处理\n1 banned term in 1 of 1 file \(1 skipped: not \.ts or \.html\)\nnot found: /u);
      expect(run(join(directory, 'missing.ts')).status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
