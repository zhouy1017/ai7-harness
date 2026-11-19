import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { formatReport, maskSource, scanSource, scanTargets } from '../../tools/words-report.mjs';
// @ts-expect-error Plain build tooling intentionally has no TypeScript declarations.
import { BANNED, BY_HAND, STAYS } from '../../tools/words-table.mjs';

// Issue #1546 (plan #1516 §5): the report that tells an interface slice which of its ordinary-mode sentences break the
// vocabulary table. Synthetic sentences only; the report never reads a manuscript.
type BannedHit = { line: number; term: string; use: string };
type HandHit = { from: string; line: number };
const banned = (source: string, extension = '.ts') => scanSource(source, extension).banned.map((hit: BannedHit) => `${hit.line}:${hit.term}`);
const hand = (source: string) => [...new Set<string>(scanSource(source).hand.map((hit: HandHit) => `${hit.line}:${hit.from}`))];

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

  it('reads a literal that is one ASCII word as a key, never as text (Issue #1531)', () => {
    expect(banned("const ceiling = { kind: 'tokens', unit: \"tokens\", key: `tokens` };")).toEqual([]);
    expect(banned("const a = '已用 tokens'; const b = `${n} tokens`;")).toEqual(['1:tokens', '1:tokens']);
  });

  it('keeps ASCII words out of longer names and takes the longest term first', () => {
    expect(banned("const a = ['maxTokens', 'tokens-row', '已用 Tokens', '词元', 'API 凭据', '应用凭据', '结构单元', '保留缺口'];")).toEqual(
      ['1:Tokens', '1:词元', '1:API 凭据', '1:应用凭据', '1:结构单元', '1:保留缺口'],
    );
  });

  it('prints every hit on one line: a term never spans a line break, and blanks inside it become one space', () => {
    expect(scanSource("const a = 'API\t 凭据';").banned.map((hit: BannedHit) => hit.term)).toEqual(['API 凭据']);
    expect(banned('const a = `AI7\n初评`;')).toEqual([]);
  });

  it('does not report a banned term that sits inside a word that stays', () => {
    const table = { banned: [{ from: 'x', terms: ['序'], use: 'y' }], byHand: [], stays: ['工序'] };
    expect(scanSource("const a = '工序';", '.ts', table).banned).toEqual([]);
    expect(scanSource("const a = '工序与顺序';", '.ts', table).banned).toEqual([{ line: 1, term: '序', use: 'y' }]);
  });

  it('lists rows that only the sentence can judge as candidates, not as banned terms', () => {
    expect(banned("const a = '已应用、单元、版本、文档、记忆';")).toEqual([]);
    expect(hand("const a = '版本';\nconst b = '共 3 项：高 / 中 / 低';")).toEqual(['1:「版本」（原「第 N 版」被抹掉后的病句）', '2:严重度里混用的「注意」「高 / 中 / 低」']);
    expect(hand("const a = '生产文档';")).toEqual([]);
  });

  it('takes bare 单元 and 已应用 to the by-hand list, and still reports 阅读范围 and 结构单元', () => {
    expect(banned("const a = ['单元格', '单元', '已应用', '阅读范围', '结构单元'];")).toEqual(['1:阅读范围', '1:结构单元']);
    expect(hand("const a = '导入单元格';")).toEqual([]);
    expect(hand("const a = '第 3 个单元';")).toHaveLength(1);
    expect(hand("const a = '已应用';")).toHaveLength(1);
  });

  it('keeps a bare 版本 as a candidate and lets the established compounds through', () => {
    for (const sentence of ['新版本', '这个版本', '回到此版本', '旧版本']) expect(hand(`const a = '${sentence}';`), sentence).toHaveLength(1);
    for (const sentence of ['发稿版本', '里程碑版本', '来源版本', '来源关系版本', '软件版本', '数据版本']) expect(hand(`const a = '${sentence}';`), sentence).toEqual([]);
  });

  it('reads an HTML page as plain text and ignores its comments', () => {
    expect(banned('<!-- 提案 -->\n<p>待你处理</p>', '.html')).toEqual(['2:待你处理']);
  });

  it('says so when it loses its place in a file', () => {
    expect(maskSource("const a = '未结束的串;\nconst b = 1;").lostSync).toBe(true);
    expect(maskSource("const a = '结束了的串';\n").lostSync).toBe(false);
    expect(maskSource('const a = `${1 + 2}`;\nfoo(/[(]/u);\n').lostSync).toBe(false);
  });

  it('has known lexical limits: a split term is missed and a longer word that holds a term is reported', () => {
    expect(banned("const a = '待' + '复核';")).toEqual([]);
    expect(banned("const a = '连续行走';")).toEqual(['1:续行']);
  });
});

// Written out here, apart from the table, so that deleting a row or disabling a candidate fails (plan #1516 §5, editor-surfaces §10.2).
const EVALUATION_USE = '评估报告（校准页上与编辑定稿分数对比的 AI 分数：AI 初始评分）';
const BUDGET_USE = '用量（较少 / 标准 / 较多三档）';
const EXPECTED_BANNED: [string, string][] = [
  ['待你处理', '待处理'], ['待复核', '待处理'],
  ['随书稿件', '衍生稿件'], ['生产文档', '衍生稿件'], ['工作文档', '衍生稿件'],
  ['社级', '本社'], ['全社', '本社'], ['出版社经验', '本社'],
  ['修订建议', '修改建议'], ['提案', '修改建议'], ['提议内容', '修改建议'],
  ['续行', '继续'],
  ['再做一次', '重新开始'], ['改计划重做', '重新开始'], ['重新准备', '重新开始'], ['按新计划开始', '重新开始'],
  ['停止任务', '取消任务'],
  ['API 凭据', '密钥'], ['凭据', '密钥'],
  ['AI7 初评', EVALUATION_USE], ['AI7 初稿', EVALUATION_USE], ['AI7 评估报告', EVALUATION_USE],
  ['本社审阅偏好', '审阅偏好（自动归纳的标「AI 归纳」）'],
  ['阅读范围', '部分'], ['结构单元', '部分'],
  ['保留缺口', '未完成的部分'], ['缺口', '未完成的部分'],
  ['tokens', BUDGET_USE], ['词元', BUDGET_USE],
  ['派发前已阻止', '没有开始'],
  ['运行名额已满', '排队中'], ['等待运行名额', '排队中'],
  ['应用结果待确认', '修改是否生效待确认'], ['应用凭据', '修改是否生效待确认'],
  ['后台处理登记', '空闲时自动更新分析（只有一项可选时，下拉框和「登记」按钮合成一个开关）'],
  ['证据保证级别', '核查力度（快速 / 标准 / 严格）'],
  ['学习准入', '可用于学习'],
  ['本社敏感词表', '本社词表'], ['本社自用词表', '本社词表'],
  ['当前更改尚未持久保存', '还没有保存'],
];
// [row of the table, a sentence its candidate must find]
const EXPECTED_BY_HAND: [string, string][] = [
  ['已应用（AI 或导入的建议 / 编辑自己的修改）', '已应用'],
  ['阅读范围 / 单元 / 结构单元 中单独的「单元」', '单元'],
  ['严重度里混用的「注意」「高 / 中 / 低」', '注意'],
  ['文档', '文档'],
  ['校准页上与编辑定稿分数对比的 AI 分数', 'AI 分数'],
  ['重写（评估）', '重写'],
  ['本社审阅偏好 / 记忆', '记忆'],
  ['「版本」（原「第 N 版」被抹掉后的病句）', '新版本'],
  ['学习准入 / 归属', '归属'],
];

describe('the table and the report stay in step', () => {
  it('holds exactly the banned terms and replacements of plan §5', () => {
    const actual = (BANNED as { terms: string[]; use: string }[]).flatMap((row) => row.terms.map((term): [string, string] => [term, row.use]));
    const order = (pairs: [string, string][]) => [...pairs].sort((a, b) => a[0].localeCompare(b[0]));
    expect(order(actual)).toEqual(order(EXPECTED_BANNED));
  });

  it('reports each banned term once, with the replacement written out above', () => {
    for (const [term, use] of EXPECTED_BANNED) {
      const hits: BannedHit[] = scanSource(`const a = '前${term}后';`).banned;
      expect(hits.map((hit) => hit.term.toLowerCase()), term).toEqual([term.toLowerCase()]);
      expect(hits[0]?.use, term).toBe(use);
    }
  });

  it('holds exactly the by-hand rows, each finding its own candidate', () => {
    expect((BY_HAND as { from: string }[]).map((row) => row.from).sort()).toEqual(EXPECTED_BY_HAND.map(([from]) => from).sort());
    for (const [from, sentence] of EXPECTED_BY_HAND) {
      expect(hand(`const a = '${sentence}';`), from).toEqual([`1:${from}`]);
    }
  });

  it('holds exactly the words that stay', () => {
    expect(STAYS).toEqual(['工序', '基线分析', '里程碑', '发稿版本', '批注', '备注', '已拒绝', '已忽略', '已处理', '模型@思考强度']);
  });
});

describe('the report text and the command', () => {
  it('prints the banned term, line and replacement per file, then the by-hand rows', () => {
    const row = (BY_HAND as { from: string; use: string }[])[3] as { from: string; use: string };
    const text = formatReport({
      results: [
        { file: 'src/renderer/a.ts', banned: [{ line: 4, term: '提案', use: '修改建议' }], hand: [{ from: row.from, line: 9 }, { from: row.from, line: 9 }], lostSync: false },
        { file: 'src/renderer/b.ts', banned: [], hand: [], lostSync: true },
      ],
      skipped: 1,
      missing: ['nowhere.ts'],
      unreadable: ['src/renderer/c.ts (EBUSY)'],
    });
    expect(text).toContain('src/renderer/a.ts (1)\n  4  提案 -> 修改建议\n1 banned term in 1 of 2 files (1 skipped: not .ts or .html)\nnot found: nowhere.ts\nunreadable: src/renderer/c.ts (EBUSY)\n');
    expect(text).toContain(`${row.from} -> ${row.use}\n    src/renderer/a.ts: 9\n`);
    expect(text).toContain('read these by hand: src/renderer/b.ts');
    expect(text).not.toContain('src/renderer/b.ts (');
  });

  it('names an unreadable file with its error code and still scans the others', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai7-words-report-'));
    try {
      writeFileSync(join(directory, 'busy.ts'), "export const a = '待你处理';\n");
      writeFileSync(join(directory, 'fine.ts'), "export const a = '待复核';\n");
      const read = (path: string) => {
        if (path.endsWith('busy.ts')) throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
        return "export const a = '待复核';\n";
      };
      const scan = scanTargets([directory, join(directory, 'gone.ts')], { read });
      expect(scan.results.map((result: { file: string }) => result.file)).toHaveLength(1);
      expect(scan.results[0].banned).toEqual([{ line: 1, term: '待复核', use: '待处理' }]);
      expect(scan.unreadable).toHaveLength(1);
      expect(scan.unreadable[0]).toMatch(/busy\.ts \(EBUSY\)$/u);
      expect(scan.missing).toEqual([join(directory, 'gone.ts')]);
      const text = formatReport(scan);
      expect(text).toMatch(/\nunreadable: .*busy\.ts \(EBUSY\)\n/u);
      expect(text).not.toMatch(/\n\s+at /u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
