import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, assuranceSampleDigest, assuranceSamplingRequestDigest } from '../../src/service/analysis/assurance-sampling-contract.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportReflectionRequestDigest } from '../../src/service/analysis/run-report-contract.js';
import type { AnalysisReductionResult } from '../../src/service/analysis/kind-definition.js';
import { reviewCategoryKindDefinition } from '../../src/service/review/review-category-kind.js';
import { REVIEW_CATEGORY_UNIT_RESULT_SCHEMA } from '../../src/service/review/review-category-contract.js';
import { fixtureEntryKey, parseModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { providerEvidenceGeneration } from '../../src/service/provider/provider-result-cache.js';
import { CLARIFICATION_INSTRUCTION, clarificationPromptContractDigest } from '../../src/service/provider/clarification-contract.js';
import { STYLE_AND_FORMAT, TYPOS_AND_USAGE } from '../support/review-categories.js';
import { generateSyntheticManuscript, SYNTHETIC_MANUSCRIPT_IDS } from '../editorial-cases/synthetic-manuscripts.mjs';
import { validateCase } from '../editorial-cases/runner/case-file.js';
import { classifyFinding, locateOnce, simulatedEditor, structuralMet, type TextAnchor } from '../editorial-cases/runner/scoring.js';
import { createCaseRoots, importManuscript, openStore } from '../editorial-cases/runner/session.js';

// Issue #812: the editorial case set and its provider-free harness. The harness run below replays every case through the product
// path on its fixture with the global fetch refused; its metrics must equal the reviewed baseline, so a product change that moves
// what a case's findings, marks, Apply or delivery yield shows up here. Nothing here prints manuscript or model text.

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const CASES = join(ROOT, 'tests', 'editorial-cases', 'cases');
const SYNTHETIC_FIXTURE = 'synthetic-editorial-review-authored';

function anchor(id: string, paragraph: number, from: number, to: number, words: string, corrections: string[] = [], category: string | null = 'typos-and-usage'): TextAnchor {
  return { id, paragraph, from, to, words, corrections, category };
}

describe('scoring', () => {
  const concern = anchor('c', 3, 10, 14, '必竟是第', ['毕竟是第']);
  const check = anchor('t', 3, 20, 24, '的确如此');
  const finding = (from: number, to: number, replacement: string | null, paragraph: number | null = 3) =>
    ({ key: 'f', categoryId: 'typos-and-usage', paragraph, from, to, quote: 'x'.repeat(to - from), replacement, markId: 'm' });

  it('meets a concern by overlap in its paragraph, calls covering precise, and lets a check win', () => {
    expect(classifyFinding(finding(10, 14, 'y'), [concern], [check])).toEqual({ kind: 'useful', concernId: 'c', precise: true });
    expect(classifyFinding(finding(12, 13, 'y'), [concern], [check])).toEqual({ kind: 'useful', concernId: 'c', precise: false });
    expect(classifyFinding(finding(13, 22, 'y'), [concern], [check])).toEqual({ kind: 'false-positive', checkId: 't' });
    expect(classifyFinding(finding(10, 14, 'y', 4), [concern], [check])).toEqual({ kind: 'unclassified' });
    expect(classifyFinding(finding(10, 14, 'y', null), [concern], [check])).toEqual({ kind: 'unclassified' });
    expect(classifyFinding({ ...finding(10, 14, 'y'), categoryId: 'style-and-format' }, [concern], [check])).toEqual({ kind: 'unclassified' });
  });

  it('adopts a proposal that yields a correction, edits one at the right place, and leaves the rest', () => {
    const block = `${'甲'.repeat(10)}必竟是第一次`;
    const useful = { kind: 'useful', concernId: 'c', precise: true } as const;
    expect(simulatedEditor({ ...finding(10, 14, '毕竟是第'), quote: '必竟是第' }, useful, [concern], block)).toEqual({ action: 'adopt' });
    expect(simulatedEditor({ ...finding(9, 14, '乙毕竟算第'), quote: '甲必竟是第' }, useful, [concern], block)).toEqual({ action: 'edit', editedText: '甲毕竟是第' });
    expect(simulatedEditor({ ...finding(11, 13, '竟然'), quote: '竟是' }, { ...useful, precise: false }, [concern], block)).toEqual({ action: 'leave', reason: 'extent' });
    expect(simulatedEditor(finding(10, 14, null), useful, [concern], block)).toEqual({ action: 'adopt' });
    expect(simulatedEditor(finding(20, 24, 'z'), { kind: 'false-positive', checkId: 't' }, [concern], block)).toEqual({ action: 'reject' });
    expect(simulatedEditor(finding(0, 2, 'z'), { kind: 'unclassified' }, [concern], block)).toEqual({ action: 'leave', reason: 'unclassified' });
  });

  it('reads structural anchors by item, passage kind, paragraphs, keywords, section and length', () => {
    const notes = [{ text: '甲骨文来信构成悬念', paragraphs: [20, 21], item: 'structure-and-coherence' }, { text: '个别脱字', paragraphs: [10], passageKind: 'problem' }];
    expect(structuralMet({ id: 'a', item: 'structure-and-coherence', paragraphs: [21, 44] }, notes, {})).toBe(true);
    expect(structuralMet({ id: 'b', item: 'chinese-language', paragraphs: [10] }, notes, {})).toBe(false);
    expect(structuralMet({ id: 'c', passageKind: 'problem', paragraphs: [10], keywords: ['脱字'] }, notes, {})).toBe(true);
    expect(structuralMet({ id: 'd', keywords: ['抄袭'] }, notes, { overall: '无' })).toBe(false);
    expect(structuralMet({ id: 'e', section: 'draft', keywords: ['蟠虺'], maxGraphemes: 5 }, notes, { draft: '《蟠虺》' })).toBe(true);
    expect(structuralMet({ id: 'f', section: 'draft', maxGraphemes: 3 }, notes, { draft: '《蟠虺》' })).toBe(false);
  });

  it('refuses an anchor that is absent or not unique', () => {
    expect(locateOnce('甲乙丙乙', '丙', 'x')).toEqual({ from: 2, to: 3 });
    expect(() => locateOnce('甲乙丙乙', '乙', 'x')).toThrow('EDITORIAL_CASE/anchor-not-unique');
    expect(() => locateOnce('甲乙丙', '丁', 'x')).toThrow('EDITORIAL_CASE/anchor-not-unique');
  });
});

describe('the case set', () => {
  it('holds at least twelve valid cases across the required kinds, each anchored and checked', async () => {
    const names = (await readdir(CASES)).filter((name) => name.endsWith('.json'));
    const cases = await Promise.all(names.map(async (name) => validateCase(JSON.parse(await readFile(join(CASES, name), 'utf8')), name.slice(0, -5))));
    expect(cases.length).toBeGreaterThanOrEqual(12);
    const reviews = cases.filter((entry) => entry.kind === 'review');
    expect(reviews.length).toBeGreaterThanOrEqual(4);
    for (const category of ['typos-and-usage', 'style-and-format', 'literary-expression']) {
      expect(reviews.some((entry) => (entry.input.categories as string[]).includes(category))).toBe(true);
    }
    expect(cases.filter((entry) => entry.kind === 'polish').length).toBeGreaterThanOrEqual(2);
    for (const kind of ['initial-evaluation', 'readers-report', 'writing-draft', 'clarification', 'cross-deliverable', 'material-review']) {
      expect(cases.filter((entry) => entry.kind === kind).length, kind).toBeGreaterThanOrEqual(1);
    }
    expect(cases.filter((entry) => entry.manuscript.source === 'synthetic').map((entry) => (entry.manuscript as { id: string }).id).sort()).toEqual([...SYNTHETIC_MANUSCRIPT_IDS].sort());
    for (const entry of cases) {
      expect(entry.expectedConcerns.length, entry.id).toBeGreaterThan(0);
      expect(entry.falsePositiveChecks.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('generates each synthetic manuscript deterministically with every anchor where the table says', () => {
    for (const id of SYNTHETIC_MANUSCRIPT_IDS) {
      const first = generateSyntheticManuscript(id);
      expect(generateSyntheticManuscript(id)).toEqual(first);
      expect(first.defects.length).toBe(7);
      expect(first.traps.length).toBe(3);
      for (const anchorAt of [...first.defects, ...first.traps]) {
        const text = first.paragraphs[anchorAt.paragraph - 1]!.text;
        const words = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].slice(anchorAt.from, anchorAt.to).map((part) => part.segment).join('');
        expect(words.length).toBeGreaterThan(0);
      }
    }
    expect(generateSyntheticManuscript('synthetic-lighthouse').textSha256).not.toBe(generateSyntheticManuscript('synthetic-museum').textSha256);
  });
});

describe('the harness', () => {
  it('replays every case provider-free, labels every source as fixture and matches the reviewed baseline', async () => {
    const out = await mkdtemp(join(await realpath(tmpdir()), 'ai7-editorial-evidence-'));
    try {
      const started = Date.now();
      const run = spawnSync(process.execPath, [join(ROOT, 'tools', 'editorial-evidence.mjs'), '--replay', 'fixtures', '--out', out,
        '--baseline', join(ROOT, 'tests', 'editorial-cases', 'replay-baseline.json')], { cwd: ROOT, encoding: 'utf8', timeout: 240_000, windowsHide: true });
      expect(run.stdout.split('\n').filter((line) => line.includes('baseline-mismatch') || line.includes('/error ')), run.stderr).toEqual([]);
      expect(run.status).toBe(0);
      expect(Date.now() - started).toBeLessThan(240_000);
      const report = JSON.parse(await readFile(join(out, 'metrics.json'), 'utf8')) as { cases: Array<Record<string, any>> };
      expect(report.cases.length).toBeGreaterThanOrEqual(12);
      for (const entry of report.cases) {
        expect(entry.source, entry.id).toBe('fixture');
        if (entry.effort !== null) expect(entry.effort.restoredExactly, entry.id).toBe(true);
      }
      expect(await readFile(join(out, 'metrics.md'), 'utf8')).toContain('| Case | Kind | Source |');
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 300_000);
});

// ---- The fixture loader and the v14 model-question synthesis (Issue #812, the named one-line exception) ------------------------
//
// Under a v14 rule a book-level synthesis runs under its base contract inside a Task whose contract is that base wrapped with the
// model-question instruction. The loader admits exactly that pairing for a synthesis capture; any other difference, and the same
// pairing on a unit, still refuses with its existing words.
describe('the fixture loader', () => {
  it('admits a synthesis captured under its base contract inside the wrapped Task, and nothing looser', async () => {
    const recorded = JSON.parse(await readFile(join(ROOT, 'tests', 'fixtures', 'model', 'sample1-recorded-v41-evaluation-initial.json'), 'utf8')) as { entries: Array<{ capture: Record<string, unknown> }> };
    const withTask = (entry: { capture: Record<string, unknown> }, task: string) => {
      const capture = entry.capture as { route: string; endpoint: string; requestShape: string; model: string; promptContractDigest: string };
      const namespace = { route: capture.route, endpoint: capture.endpoint, requestShape: capture.requestShape, model: capture.model };
      return { ...entry, capture: { ...entry.capture, taskPromptContractDigest: task, generation: providerEvidenceGeneration(namespace, capture.promptContractDigest, task) } };
    };
    const synthesis = recorded.entries.find((entry) => entry.capture.subject === 'task-synthesis')!;
    const unit = recorded.entries.find((entry) => entry.capture.subject === 'evaluation-unit')!;
    const base = synthesis.capture.promptContractDigest as string;
    expect(() => parseModelFixture({ ...recorded, entries: [synthesis] })).not.toThrow();
    expect(() => parseModelFixture({ ...recorded, entries: [withTask(synthesis, clarificationPromptContractDigest(base))] })).not.toThrow();
    expect(() => parseModelFixture({ ...recorded, entries: [withTask(synthesis, 'ab'.repeat(32))] })).toThrow('夹具条目的任务与阶段契约不一致。');
    const unitBase = unit.capture.promptContractDigest as string;
    expect(() => parseModelFixture({ ...recorded, entries: [withTask(unit, clarificationPromptContractDigest(unitBase))] })).toThrow('夹具条目的任务与阶段契约不一致。');
  });
});

// The fixture generator's duplicate of the model-question instruction (its #812 case-family branch) agrees with the product's.
describe('the fixture generator branch', () => {
  it('derives the wrapped contract exactly as the product does', async () => {
    // @ts-expect-error Plain ESM tool has no declarations.
    const generator = await import('../../tools/generate-model-fixture.mjs') as { CLARIFICATION_INSTRUCTION: unknown; clarificationPromptContractDigest(base: string): string };
    expect(generator.CLARIFICATION_INSTRUCTION).toEqual(CLARIFICATION_INSTRUCTION);
    for (const base of ['3e8bb0c6'.padEnd(64, '0'), 'ab'.repeat(32)]) expect(generator.clarificationPromptContractDigest(base)).toBe(clarificationPromptContractDigest(base));
  });
});

// ---- The authored fixture of the two synthetic manuscripts --------------------------------------------------------------------
//
//   AI7_REGENERATE_EDITORIAL_SYNTHETIC_FIXTURE=1 pnpm exec vitest run tests/unit/editorial-evidence.test.ts
//
// Written after reading each generated manuscript, as an imperfect reviewer would answer: most injected defects found with the
// right correction, one found with a wording the editor must correct, one missed, one trap wrongly flagged, one plausible finding
// the case does not expect and one quotation that is not in the text. The case metrics therefore exercise every outcome; they
// measure the harness and the product path, never a model. Quotations are the synthetic text's own words.

type AuthoredFinding = { quote: string; blockOrdinal: number; severity: 'must' | 'should' | 'note'; note: string; replacement?: string };
const AUTHORED: Record<string, { category: typeof TYPOS_AND_USAGE; findings: AuthoredFinding[] }> = {
  'synthetic-lighthouse': { category: TYPOS_AND_USAGE, findings: [
    { quote: '仔细的擦拭', blockOrdinal: 2, severity: 'should', note: '状语后的结构助词应为“地”。', replacement: '仔细地擦拭' },
    { quote: '渡过了第一个冬天', blockOrdinal: 5, severity: 'should', note: '经历一段时间应写作“度过”。', replacement: '度过了第一个冬天' },
    { quote: '既使风浪再大', blockOrdinal: 6, severity: 'should', note: '让步连词应为“即使”。', replacement: '即使风浪再大' },
    { quote: '一部份钱', blockOrdinal: 7, severity: 'note', note: '“部份”应作“部分”。', replacement: '一部分的钱' },
    { quote: '必竟是第一次', blockOrdinal: 9, severity: 'should', note: '“必竟”为错字。', replacement: '毕竟是第一次' },
    { quote: '截止今年夏天', blockOrdinal: 10, severity: 'should', note: '表示到某时为止应用“截至”。', replacement: '截至今年夏天' },
    { quote: '的确给灯塔', blockOrdinal: 4, severity: 'note', note: '疑为结构助词误用。', replacement: '地确给灯塔' },
    { quote: '更值得记录下来', blockOrdinal: 12, severity: 'note', note: '可更简洁。', replacement: '更值得记下来' },
    { quote: '灯塔守护人', blockOrdinal: 1, severity: 'note', note: '题名用字。', replacement: '灯塔守望人' },
  ] },
  'synthetic-museum': { category: STYLE_AND_FORMAT, findings: [
    { quote: '三千余件,其中', blockOrdinal: 3, severity: 'should', note: '中文行文中误用半角逗号。' },
    { quote: '1985年', blockOrdinal: 4, severity: 'should', note: '年份写法与全文汉字数字不一致。' },
    { quote: '「家底」', blockOrdinal: 5, severity: 'note', note: '引号与全文“”体例不一致。' },
    { quote: '匆匆走过...', blockOrdinal: 7, severity: 'note', note: '省略号应为“……”。' },
    { quote: '全程约3km', blockOrdinal: 9, severity: 'note', note: '计量单位写法与中文行文不一致。' },
    { quote: '1∶5000', blockOrdinal: 11, severity: 'note', note: '比例尺写法宜统一。' },
    { quote: '前后两进的格局', blockOrdinal: 2, severity: 'note', note: '可补充说明格局。' },
  ] },
};

it.runIf(process.env['AI7_REGENERATE_EDITORIAL_SYNTHETIC_FIXTURE'] === '1')('authors the synthetic review fixture', async () => {
  const entries = new Map<string, ModelFixtureEntry>();
  const fixture: ResolvedModelFixture = { identity: SYNTHETIC_FIXTURE, description: 'generator', provenance: 'authored',
    lineage: [{ identity: SYNTHETIC_FIXTURE, sha256: 'e'.repeat(64) }], entries, sha256: 'f'.repeat(64) };
  const add = (entry: ModelFixtureEntry) => { if (!entries.has(fixtureEntryKey(entry.unitOrdinal, entry.requestDigest))) entries.set(fixtureEntryKey(entry.unitOrdinal, entry.requestDigest), entry); };
  const policy = await resolveSourceCheckoutLaunchPolicy(ROOT);
  for (let pass = 0; pass < 4; pass += 1) {
    const before = entries.size;
    for (const id of SYNTHETIC_MANUSCRIPT_IDS) {
      const { category, findings } = AUTHORED[id]!;
      const definition = reviewCategoryKindDefinition(category);
      const roots = await createCaseRoots();
      const store: EditorialStore = await openStore(roots, ROOT, fixture);
      const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy: policy, fixture, secretResolver: { resolve: async () => null } });
      try {
        const book = await importManuscript(store, ROOT, roots, { source: 'synthetic', id }, `合成稿 ${id}`);
        let progress = store.createReviewCategoryPreparationWork(book.bookId, definition, { mode: 'review-first', selectedRange: null }, policy);
        while (!progress.done) progress = store.advanceReviewCategoryPreparationWork(definition, progress.workId!);
        const prepared = progress.projection!;
        const manifest = prepared.coverageManifest!;
        expect(manifest.units).toHaveLength(1);
        for (const unit of manifest.units) {
          add({ unitOrdinal: unit.ordinal, requestDigest: definition.requestDigest(unit.ordinal, unit.digest), attempt: null, contentDigest: null,
            response: { kind: 'unit-result', text: JSON.stringify({ schema: REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, findings }),
              usage: { inputTokens: 900, outputTokens: 60 + findings.length * 50 } } });
        }
        const authorized = store.authorizeReviewCategory(book.bookId, definition, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
        owner.admitAndDispatch(authorized.dispatchRunRecordId!, store.reviewCategoryLedger(definition));
        await owner.whenIdle();
        const settled = store.inspectReviewCategory(book.bookId, definition);
        const revision = settled.resultSetRevision!;
        const candidates = definition.assurance!.candidates({ components: { findings: revision.findings } } as unknown as AnalysisReductionResult);
        const byUnit = new Map<number, typeof candidates[number][]>();
        for (const candidate of candidates) byUnit.set(candidate.unitOrdinal, [...(byUnit.get(candidate.unitOrdinal) ?? []), candidate]);
        for (const [unitOrdinal, listed] of byUnit) {
          add({ unitOrdinal: 0, attempt: null, contentDigest: null,
            requestDigest: assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, unitOrdinal, manifest.units[unitOrdinal - 1]!.digest, assuranceSampleDigest(listed)),
            response: { kind: 'unit-result', usage: { inputTokens: 700, outputTokens: 40 + listed.length * 40 }, text: JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1',
              dispositions: listed.map((_candidate, index) => ({ ref: `{{ref:${index + 1}}}`, disposition: '成立', reason: '引文在所声明的内容块中逐字出现，内容块支持该发现的提法。' })) }) } });
        }
        const report = settled.taskOutcome?.report;
        if (report !== undefined && report !== null) {
          add({ unitOrdinal: 0, attempt: null, contentDigest: null, requestDigest: runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, report.accountingDigest),
            response: { kind: 'unit-result', usage: { inputTokens: 600, outputTokens: 120 }, text: JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1',
              items: [{ suggestion: '下一次运行可维持当前的单元预算。', basis: '账目中没有预算造成的缺口。' }] }) } });
        }
        store.markCleanShutdown();
      } finally {
        await owner.dispose();
        store.close();
        await roots.dispose();
      }
    }
    if (entries.size === before) break;
  }
  const body = {
    schema: 'ai7.model-fixture/1',
    identity: SYNTHETIC_FIXTURE,
    description: '编辑价值证据（Issue #812）两部合成稿的人工撰写审阅夹具：合成稿甲《灯塔守望人》的错别字与规范用语、合成稿乙《一座县城博物馆》的体例与格式。两部合成稿由 tests/editorial-cases/synthetic-manuscripts.mjs 从公开的合成文本确定性生成，不含任何书稿文字。回答模拟一位不完美的审阅者：多数注入错误给出正确改法，一处改法需编辑修改，一处漏报，一处把正确用法误判为错误，一处案例未预期的发现，一处引文不在文中；抽样一律「成立」，运行反思只说明账目。用于检验编辑价值证据工具与产品路径，不代表任何模型的编辑质量。',
    basedOn: null,
    provenance: 'authored',
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: [...entries.values()].map((entry) => ({ unitOrdinal: entry.unitOrdinal, requestDigest: entry.requestDigest, response: entry.response })),
  };
  await writeFile(join(ROOT, 'tests', 'fixtures', 'model', `${SYNTHETIC_FIXTURE}.json`), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}, 600_000);
