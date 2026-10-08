import { describe, expect, it } from 'vitest';
import {
  CAPTURE_NOT_SAVED,
  CAPTURE_RESULT_CONSEQUENCES,
  CAPTURE_RESULT_LABELS,
  captureExtractLines,
  captureStepLine,
  procedureCeilingLines,
  procedureGuidelineLine,
  procedureVersionLine,
  runProcedureLeftOutLine,
  runProcedureLine,
  sheetProcedureLines,
} from '../../src/renderer/captured-procedure-labels.js';

// Unit suite (L1) for 可复用工序's words (Issue #65, plan slice S30; ADR 0087; REUSE-010, REUSE-013): professional purpose first,
// no Skill, Workflow or Plugin wording in what the editor must read to save, and every pin and difference said in words.

const STEP = { categoryId: 'style-and-format', label: '体例与格式', procedureTitle: '体例与格式审阅工序', procedureVersion: '1', output: 'annotation' as const, model: true, searchEngine: false };
const LEADS = { ...STEP, label: '情节逻辑与前后一致', procedureTitle: '线索转批注', model: false };

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
      resolved: {
        versionId: 'v', version: 2, documentSha256: 'd', scopeSlot: 'whole',
        steps: [{ categoryId: 'style-and-format', label: '体例与格式', available: true, unavailableReason: null },
          { categoryId: 'plot-consistency', label: '情节逻辑与前后一致', available: false, unavailableReason: '还没有基线分析。' }],
        guidelineChanges: [{ categoryId: 'style-and-format', label: '体例与格式', title: '体例条款', sourceVersion: '1', version: '2' }],
      },
    })).toEqual([
      '按《体例复核》第 2 版：体例与格式 → 情节逻辑与前后一致；范围「全书」。类别已按它选好，计划照常先看。',
      '不运行「情节逻辑与前后一致」：还没有基线分析。',
      '「体例与格式」按今天的《体例条款》第 2 版，来源审阅用的是第 1 版',
      '没有用第 3 版：工序已更新。',
    ]);
    expect(sheetProcedureLines({ bookId: 'b', procedureId: 'p', title: 'x', passedOver: [], unavailableReason: '还没有启用。', resolved: null })).toEqual(['还没有启用。']);
  });

  it('names the pin a Run keeps, stopped or not', () => {
    const pin = { procedureId: 'p', versionId: 'v', version: 1, title: '体例复核', documentSha256: 'd', stopped: false, missing: false, leftOut: [] };
    expect(runProcedureLine(pin)).toBe('按可复用工序《体例复核》第 1 版');
    expect(runProcedureLine({ ...pin, stopped: true })).toBe('按可复用工序《体例复核》第 1 版（这一版已停用；这次审阅仍记着它）');
    expect(runProcedureLine({ ...pin, missing: true })).toBe('按可复用工序《体例复核》第 1 版（本机没有这一版；这次审阅仍记着它）');
    expect(runProcedureLeftOutLine({ categoryId: 'plot-consistency', label: '情节逻辑与前后一致', reason: '还没有基线分析。' })).toBe('未运行「情节逻辑与前后一致」：还没有基线分析。');
  });
});
