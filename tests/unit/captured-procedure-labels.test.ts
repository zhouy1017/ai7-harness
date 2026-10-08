import { describe, expect, it } from 'vitest';
import {
  CAPTURE_NOT_SAVED,
  CAPTURE_RESULT_CONSEQUENCES,
  CAPTURE_RESULT_LABELS,
  captureExtractLines,
  captureStepLine,
  procedureCeilingLines,
  procedureGuidelineLine,
  procedurePackageLinkLine,
  procedurePackagesLine,
  procedureRequirementLine,
  procedureRunLinkLine,
  procedureStopAfterLine,
  procedureRunsLine,
  procedureStopHeading,
  procedureStopMoreVersionsLine,
  procedureStopMoreLine,
  procedureStopRunLine,
  procedureStopVersionLine,
  procedureVersionLine,
  runProcedureLeftOutLine,
  runProcedureLeftOutView,
  runProcedureLine,
  sheetChosenApartLine,
  sheetProcedureChosenStatus,
  sheetProcedureLines,
  sheetProcedureOption,
  sheetProcedureVersionOption,
} from '../../src/renderer/captured-procedure-labels.js';

// Unit suite (L1) for 可复用工序's words (Issue #65, plan slice S30; ADR 0087; REUSE-010, REUSE-013): professional purpose first,
// no Skill, Workflow or Plugin wording in what the editor must read to save, and every pin and difference said in words.

const STEP = { categoryId: 'style-and-format', label: '体例与格式', procedureTitle: '体例与格式审阅工序', procedureVersion: '1', output: 'annotation' as const, model: true, searchEngine: false, requirement: null };
const LEADS = { ...STEP, label: '情节逻辑与前后一致', procedureTitle: '线索转批注', model: false, requirement: 'baseline-analysis' as const };
const SERIES = { ...STEP, categoryId: 'series-consistency', label: '书系一致性', procedureTitle: '书系一致性检查', requirement: 'series' as const };

describe('capture', () => {
  it('names a step by what it runs and yields, and whether it calls a model or a search engine', () => {
    expect(captureStepLine(STEP)).toBe('体例与格式 · 体例与格式审阅工序（第 1 版） · 输出批注 · 调用模型 · 不使用搜索引擎');
    expect(captureStepLine({ ...LEADS, output: 'change-suggestion', searchEngine: true })).toBe('情节逻辑与前后一致 · 线索转批注（第 1 版） · 输出修改建议 · 不调用模型 · 使用搜索引擎');
  });

  it('says what extraction keeps: purpose, ordered steps, the one parameter slot, outputs and the ceiling', () => {
    expect(captureExtractLines('  体例复核 ', [STEP, LEADS], 'chapters')).toEqual([
      '用途：《体例复核》',
      '步骤（按顺序）：体例与格式 → 情节逻辑与前后一致',
      '参数：审阅范围「选定章节」',
      '输出：批注',
      '权限上限：只读当前这本书；会调用模型；不使用搜索引擎；不超过这次审阅',
    ]);
    expect(captureExtractLines('', [], 'whole').slice(0, 2)).toEqual(['用途：（待起名）', '步骤（按顺序）：（未保留）']);
  });

  it('says what is never saved, and keeps the recommendation in professional words', () => {
    expect(CAPTURE_NOT_SAVED.join('')).toMatch(/稿件文字.*发现.*授权.*模型服务.*规范文件.*重试/su);
    expect(CAPTURE_RESULT_LABELS['captured-procedure']).toBe('可复用工序');
    expect(CAPTURE_RESULT_CONSEQUENCES['captured-procedure']).not.toMatch(/Skill|Workflow|Plugin|插件/u);
    expect(CAPTURE_RESULT_CONSEQUENCES['developer-proposal']).toContain('AI7 不会发送它');
  });
});

describe('知识库 and the Run', () => {
  it('reads a version, today\'s guideline against the source Run, and the ceiling', () => {
    expect(procedureVersionLine({ version: 2, stateLabel: '待验证', steps: [STEP], scopeSlot: 'whole' })).toBe('第 2 版 · 待验证 · 1 步 · 范围「全书」');
    expect(procedureGuidelineLine({ title: '体例条款', issuer: '本社', version: '2', sourceVersion: '1' })).toBe('体例条款（本社）第 2 版 · 来源审阅用的是第 1 版');
    expect(procedureGuidelineLine({ title: '体例条款', issuer: 'AI7 内置默认', version: '1', sourceVersion: '1' })).toBe('体例条款（AI7 内置默认）第 1 版 · 与来源审阅相同');
    expect(procedureCeilingLines({ runSourceScope: 'current-book', steps: [], outputs: ['annotation', 'change-suggestion'], model: false, searchEngine: true }).slice(1))
      .toEqual(['输出：批注、修改建议；修改建议只是建议，接受与应用都由你决定', '不调用模型', '会使用搜索引擎']);
  });

  it('fills the sheet in words: the version, the steps left out and why, and guideline differences', () => {
    expect(sheetProcedureLines({
      bookId: 'b', procedureId: 'p', title: '体例复核', passedOver: [{ version: 3, reason: '工序已更新。' }], unavailableReason: null,
      eligibleVersions: [{ versionId: 'v', version: 2 }],
      resolved: {
        versionId: 'v', version: 2, latestEligible: true, documentSha256: 'd', scopeSlot: 'whole',
        steps: [{ categoryId: 'style-and-format', label: '体例与格式', available: true, unavailableReason: null, chosenApart: false },
          { categoryId: 'plot-consistency', label: '情节逻辑与前后一致', available: false, unavailableReason: '还没有基线分析。', chosenApart: false }],
        guidelineChanges: [{ categoryId: 'style-and-format', label: '体例与格式', title: '体例条款', sourceVersion: '1', version: '2' }],
      },
    })).toEqual([
      '按《体例复核》第 2 版：体例与格式 → 情节逻辑与前后一致；范围「全书」。类别已按它选好，计划照常先看。',
      '不运行「情节逻辑与前后一致」：还没有基线分析。',
      '「体例与格式」按今天的《体例条款》第 2 版，来源审阅用的是第 1 版',
      '没有用第 3 版：工序已更新。',
    ]);
    expect(sheetProcedureLines({ bookId: 'b', procedureId: 'p', title: 'x', passedOver: [], eligibleVersions: [], unavailableReason: '还没有启用。', resolved: null }))
      .toEqual(['还没有启用。']);
  });

  it('says when the editor chose an older eligible version than the latest (Issue #66, S31; REUSE-054)', () => {
    const resolved = { versionId: 'v1', version: 1, latestEligible: false, documentSha256: 'd', scopeSlot: 'whole' as const,
      steps: [{ categoryId: 'style-and-format', label: '体例与格式', available: true, unavailableReason: null, chosenApart: false }], guidelineChanges: [] };
    expect(sheetProcedureLines({
      bookId: 'b', procedureId: 'p', title: '体例复核', passedOver: [{ version: 3, reason: '这一版已停用。' }], unavailableReason: null,
      eligibleVersions: [{ versionId: 'v2', version: 2 }, { versionId: 'v1', version: 1 }], resolved,
    })).toEqual([
      '按《体例复核》第 1 版：体例与格式；范围「全书」。类别已按它选好，计划照常先看。',
      '你选了第 1 版；最新可用的是第 2 版。',
      '没有用第 3 版：这一版已停用。',
    ]);
    expect(sheetProcedureVersionOption(2, true)).toBe('第 2 版（最新可用）');
    expect(sheetProcedureVersionOption(1, false)).toBe('第 1 版');
  });

  it('reads 停用…\'s preview in words: the Runs it touches, what a new use takes afterwards (Issue #66, S31)', () => {
    const run = { bookId: 'b', bookTitle: '工序运行之书', reviewRunId: 'r', label: '第 2 次', stateLabel: '计划已冻结 · 待授权' };
    const version = { versionId: 'v', version: 1, stateLabel: '已启用', runCount: 2, prepared: [run], preparedCount: 1, active: [], activeCount: 0 };
    expect(procedureStopHeading({ title: '体例复核', versionId: 'v', versions: [version], versionCount: 1 })).toBe('停用《体例复核》第 1 版');
    // 全部停用 counts every version it takes, also those beyond the page it lists (S31 review P2-2, P3-7).
    expect(procedureStopHeading({ title: '体例复核', versionId: null, versions: [version, { ...version, version: 2 }], versionCount: 7 })).toBe('停用《体例复核》尚未停用的 7 个版本');
    expect(procedureStopMoreVersionsLine(5, 7)).toBe('另有 2 个较早的版本一并停用，未逐一列出。');
    expect(procedureStopVersionLine(version)).toBe('第 1 版 · 已启用 · 按它运行过 2 次，停用后仍然记着它');
    // Runs that ran are counted apart from Runs only prepared (S31 review P3-3).
    expect(procedureRunsLine({ runCount: 1, preparedRunCount: 0 })).toBe('按这一版运行过 1 次');
    expect(procedureRunsLine({ runCount: 1, preparedRunCount: 2 })).toBe('按这一版运行过 1 次；另有 2 次已准备、未开始');
    expect(procedureRunsLine({ runCount: 0, preparedRunCount: 1 })).toBe('还没有审阅按这一版运行过；另有 1 次已准备、未开始');
    expect(procedureStopVersionLine({ ...version, runCount: 0 })).toBe('第 1 版 · 已启用 · 还没有审阅按它运行过');
    expect(procedureStopRunLine(run)).toBe('《工序运行之书》第 2 次审阅 · 计划已冻结 · 待授权');
    expect(procedureStopMoreLine(10, 13)).toBe('另有 3 次，未逐一列出。');
    expect(procedureStopAfterLine(2)).toBe('停用后，新建审阅按这个工序运行时用第 2 版。');
    expect(procedureStopAfterLine(null)).toBe('停用后，这个工序没有可以运行的版本；要再用它，请从一次新的审阅重新保存。');
    expect(procedureRunLinkLine({ bookTitle: '工序运行之书', label: '第 1 次', stateLabel: '已完成' }, '10月9日')).toBe('《工序运行之书》第 1 次审阅 · 已完成 · 10月9日');
  });

  it('names the pin a Run keeps, stopped or not', () => {
    const pin = { procedureId: 'p', versionId: 'v', version: 1, title: '体例复核', documentSha256: 'd', stopped: false, missing: false, leftOut: [] };
    expect(runProcedureLine(pin)).toBe('按可复用工序《体例复核》第 1 版');
    expect(runProcedureLine({ ...pin, stopped: true })).toBe('按可复用工序《体例复核》第 1 版（这一版已停用；这次审阅仍记着它）');
    expect(runProcedureLine({ ...pin, missing: true })).toBe('按可复用工序《体例复核》第 1 版（本机没有这一版；这次审阅仍记着它）');
    expect(runProcedureLeftOutLine({ categoryId: 'plot-consistency', label: '情节逻辑与前后一致', reason: '还没有基线分析。', byChoice: false })).toBe('未运行「情节逻辑与前后一致」：还没有基线分析。');
    // A Series step the editor did not choose is told apart from one the Book could not take (Issue #66, S31b; REUSE-050).
    expect(runProcedureLeftOutLine({ categoryId: 'series-consistency', label: '书系一致性', reason: '书系资料要在每次运行时另行选择，这次你没有选它。', byChoice: true }))
      .toBe('未选「书系一致性」：书系资料要在每次运行时另行选择，这次你没有选它。');
    // The line on the Run's pin carries its category and whether it was left out by choice (S31b review P3-2).
    expect(runProcedureLeftOutView({ categoryId: 'series-consistency', label: '书系一致性', reason: '书系资料要在每次运行时另行选择，这次你没有选它。', byChoice: true })).toEqual({
      text: '未选「书系一致性」：书系资料要在每次运行时另行选择，这次你没有选它。',
      data: { procedureLeftOutCategory: 'series-consistency', procedureLeftOutByChoice: 'true' },
    });
    expect(runProcedureLeftOutView({ categoryId: 'plot-consistency', label: '情节逻辑与前后一致', reason: '还没有基线分析。', byChoice: false })).toEqual({
      text: '未运行「情节逻辑与前后一致」：还没有基线分析。',
      data: { procedureLeftOutCategory: 'plot-consistency', procedureLeftOutByChoice: 'false' },
    });
  });
});

describe('Series material chosen apart, applicability and linked packages (Issue #66, S31b)', () => {
  it('leaves a Series step for the editor to choose, and says so on the filled sheet (REUSE-049, REUSE-050)', () => {
    const steps = [
      { categoryId: 'style-and-format', label: '体例与格式', available: true, unavailableReason: null, chosenApart: false },
      { categoryId: 'series-consistency', label: '书系一致性', available: true, unavailableReason: null, chosenApart: true },
    ];
    const run = { bookId: 'b', procedureId: 'p', title: '书系复核', passedOver: [], unavailableReason: null, eligibleVersions: [{ versionId: 'v', version: 1 }],
      resolved: { versionId: 'v', version: 1, latestEligible: true, documentSha256: 'd', scopeSlot: 'whole' as const, steps, guidelineChanges: [] } };
    expect(sheetProcedureLines(run)).toEqual([
      '按《书系复核》第 1 版：体例与格式 → 书系一致性；范围「全书」。其余类别已按它选好，计划照常先看。',
      '「书系一致性」要读这本书所在书系的资料，不会替你选上：要用就勾选它；不选，这次审阅会记下是你没有选。',
    ]);
    // A procedure of the Series step alone ticks nothing: the editor ticks it, or runs nothing.
    expect(sheetProcedureLines({ ...run, resolved: { ...run.resolved, steps: [steps[1]!] } })[0])
      .toBe('按《书系复核》第 1 版：书系一致性；范围「全书」。要运行的类别由你勾选，计划照常先看。');
    // The status says what the sheet ticked, in the sheet's own words (S31b review P3-5).
    expect(sheetProcedureChosenStatus(run)).toBe('已读取《书系复核》第 1 版：其余类别已按它选好。');
    expect(sheetProcedureChosenStatus({ ...run, resolved: { ...run.resolved, steps: [steps[1]!] } })).toBe('已读取《书系复核》第 1 版：要运行的类别由你勾选。');
    expect(sheetProcedureChosenStatus({ ...run, resolved: { ...run.resolved, steps: [steps[0]!] } })).toBe('已读取《书系复核》第 1 版：类别已按它选好。');
    const none = { ...run, resolved: { ...run.resolved, steps: [{ ...steps[0]!, available: false, unavailableReason: '还没有基线分析。' }] } };
    expect(sheetProcedureChosenStatus(none)).toBe('已读取《书系复核》第 1 版：这本书现在一步也不能运行。');
    expect(sheetProcedureLines(none)[0]).toBe('按《书系复核》第 1 版：体例与格式；范围「全书」。这本书现在一步也不能运行，计划照常先看。');
    expect(sheetProcedureChosenStatus({ ...run, resolved: null, unavailableReason: '还没有启用。' })).toBe('还没有启用。');
    // A Series step this Book cannot take is said as left out, never as a choice.
    const outside = { ...run, resolved: { ...run.resolved, steps: [steps[0]!, { ...steps[1]!, available: false, unavailableReason: '这本书不在任何书系中。' }] } };
    expect(sheetProcedureLines(outside)).toEqual([
      '按《书系复核》第 1 版：体例与格式 → 书系一致性；范围「全书」。类别已按它选好，计划照常先看。',
      '不运行「书系一致性」：这本书不在任何书系中。',
    ]);
    expect(sheetChosenApartLine('书系一致性')).toBe('「书系一致性」要读这本书所在书系的资料，不会替你选上：要用就勾选它；不选，这次审阅会记下是你没有选。');
  });

  it('says what a Book must have for a version to run there (REUSE-048)', () => {
    expect(procedureRequirementLine([STEP])).toBe('适用于：任何一本有稿件的书。');
    expect(procedureRequirementLine([])).toBe('适用于：任何一本有稿件的书。');
    expect(procedureRequirementLine([STEP, LEADS, SERIES])).toBe('适用条件：「情节逻辑与前后一致」要这本书已有基线分析；「书系一致性」要这本书在一个书系里，书系资料在每次运行时另行选择。');
    expect(procedureRequirementLine([SERIES])).toBe('适用条件：「书系一致性」要这本书在一个书系里，书系资料在每次运行时另行选择。');
  });

  it('offers each enabled procedure with the one version a new use takes and how it fits this Book (REUSE-046, REUSE-053)', () => {
    const entry = { procedureId: 'p', title: '书系复核', latestEligible: { versionId: 'v', version: 2 }, fit: 'all' as const, stepCount: 2, availableCount: 2, chosenApart: [], leftOut: [] };
    expect(sheetProcedureOption(entry)).toBe('《书系复核》第 2 版 · 这本书能运行全部 2 步');
    expect(sheetProcedureOption({ ...entry, chosenApart: ['书系一致性'] })).toBe('《书系复核》第 2 版 · 这本书能运行全部 2 步；「书系一致性」要你另行勾选');
    expect(sheetProcedureOption({ ...entry, chosenApart: ['书系一致性', '体例与格式'] })).toBe('《书系复核》第 2 版 · 这本书能运行全部 2 步；「书系一致性」、「体例与格式」要你另行勾选');
    expect(sheetProcedureOption({ ...entry, fit: 'partial', availableCount: 1, leftOut: [{ label: '书系一致性', reason: '这本书不在任何书系中。' }] }))
      .toBe('《书系复核》第 2 版 · 这本书能运行 2 步中的 1 步（「书系一致性」：这本书不在任何书系中）');
    expect(sheetProcedureOption({ ...entry, fit: 'none', availableCount: 0, leftOut: [{ label: '书系一致性', reason: '这本书不在任何书系中。' }, { label: '体例与格式', reason: '另一个原因。' }] }))
      .toBe('《书系复核》第 2 版 · 这本书现在不能运行（「书系一致性」：这本书不在任何书系中）');
    expect(sheetProcedureOption({ ...entry, fit: 'none', availableCount: 0, leftOut: [] })).toBe('《书系复核》第 2 版 · 这本书现在不能运行');
    // Only a reason's first clause: the whole of it is said beside the step once the procedure is chosen.
    expect(sheetProcedureOption({ ...entry, fit: 'none', availableCount: 0, leftOut: [{ label: '书系一致性', reason: '这本书不在任何书系中；加入书系后才能选。' }] }))
      .toBe('《书系复核》第 2 版 · 这本书现在不能运行（「书系一致性」：这本书不在任何书系中）');
    expect(sheetProcedureOption({ ...entry, latestEligible: null, fit: 'no-version', stepCount: 0, availableCount: 0 })).toBe('《书系复核》 · 现在没有可以运行的版本');
  });

  it('names the 图书交付包 versions holding a report of a Run under a version (REUSE-031)', () => {
    expect(procedurePackagesLine(1, 1)).toBe('按这一版运行的审阅，报告收入了 1 个图书交付包版本');
    expect(procedurePackagesLine(10, 12)).toBe('按这一版运行的审阅，报告收入了 12 个图书交付包版本；列出最新的 10 个');
    // Damaged rows among the newest read are counted but not listed: the line says so and never calls an older one 最新的 (Issue #697).
    expect(procedurePackagesLine(1, 3)).toBe('按这一版运行的审阅，报告收入了 3 个图书交付包版本；这 3 个里有 2 个无法读取，列出其余 1 个');
    expect(procedurePackagesLine(0, 2)).toBe('按这一版运行的审阅，报告收入了 2 个图书交付包版本；这 2 个都无法读取，未列出');
    expect(procedurePackagesLine(8, 12)).toBe('按这一版运行的审阅，报告收入了 12 个图书交付包版本；最新的 10 个里有 2 个无法读取，列出其余 8 个');
    expect(procedurePackagesLine(0, 12)).toBe('按这一版运行的审阅，报告收入了 12 个图书交付包版本；最新的 10 个都无法读取，未列出');
    expect(procedurePackagesLine(2, 3, 2)).toBe('按这一版运行的审阅，报告收入了 3 个图书交付包版本；列出最新的 2 个');
    expect(procedurePackagesLine(1, 3, 2)).toBe('按这一版运行的审阅，报告收入了 3 个图书交付包版本；最新的 2 个里有 1 个无法读取，列出其余 1 个');
    expect(procedurePackageLinkLine({ bookTitle: '工序运行之书', version: 2 }, '10月9日')).toBe('《工序运行之书》图书交付包 v2 · 准备于 10月9日');
  });
});
