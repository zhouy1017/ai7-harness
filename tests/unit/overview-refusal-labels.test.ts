import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_PROFILE_ACTION_LABEL,
  ANALYSIS_PROFILE_NEXT_STEP,
  ANALYSIS_PROFILE_PIN_CODE,
  analysisRefusalView,
  taskCardRefusalShown,
} from '../../src/renderer/overview-refusal-labels.js';

const RENDERER = readFileSync(fileURLToPath(new URL('../../src/renderer/index.ts', import.meta.url)), 'utf8');

describe('工作概览 refusals (#992)', () => {
  it('hides the fixed task card where the development-ci baseline does not apply', () => {
    expect(taskCardRefusalShown('TASK_LINEAGE_UNAVAILABLE')).toBe(false);
    expect(taskCardRefusalShown('TASK_POLICY_UNAVAILABLE')).toBe(false);
  });

  it('keeps the unavailable note for every other refusal and for an error without a code', () => {
    expect(taskCardRefusalShown('TASK_ARTIFACT_PIN_UNAVAILABLE')).toBe(true);
    expect(taskCardRefusalShown('TASK_PROVIDER_BINDING_UNAVAILABLE')).toBe(true);
    expect(taskCardRefusalShown('SERVICE_UNAVAILABLE')).toBe(true);
    expect(taskCardRefusalShown(null)).toBe(true);
    expect(taskCardRefusalShown(undefined)).toBe(true);
  });

  it('turns the missing profile pin into a plain next step with one button', () => {
    expect(ANALYSIS_PROFILE_PIN_CODE).toBe('ANALYSIS_ARTIFACT_PIN_UNAVAILABLE');
    const view = analysisRefusalView(ANALYSIS_PROFILE_PIN_CODE, '当前图书尚未固定编辑工作区方案 Revision 2。');
    expect(view).toEqual({ text: '开始分析前，先在 工作概览 › 编辑工作区方案 获取并启用本书的方案。', actionLabel: '前往编辑工作区方案' });
    expect(view.text).toBe(ANALYSIS_PROFILE_NEXT_STEP);
    expect(view.actionLabel).toBe(ANALYSIS_PROFILE_ACTION_LABEL);
    expect(view.text).not.toContain('Revision');
  });

  it('leaves every other analysis refusal with the service text and no button', () => {
    expect(analysisRefusalView('ANALYSIS_LINEAGE_UNAVAILABLE', '当前图书不是精确 sample1 主稿件血缘。'))
      .toEqual({ text: '当前图书不是精确 sample1 主稿件血缘。', actionLabel: null });
    expect(analysisRefusalView(null, '无法读取本地图书的基线稿件分析记录。'))
      .toEqual({ text: '无法读取本地图书的基线稿件分析记录。', actionLabel: null });
  });

  it('draws the decisions in the two renderer regions and nowhere else', () => {
    expect(RENDERER).toContain("from './overview-refusal-labels.js'");
    // F1: the task card refusal handler returns before it draws the note.
    expect(RENDERER).toMatch(/if \(!taskCardRefusalShown\(rendererErrorCode\(error\)\)\) \{\s*taskHost\.replaceChildren\(\);\s*return;\s*\}/);
    // F2: both surfaces ask the one view, and both offer the same button hook.
    expect(RENDERER.match(/analysisRefusalView\(rendererErrorCode\(error\)/g)).toHaveLength(2);
    expect(RENDERER.match(/dataset\['profileAction'\] = 'go-to-profile'/g)).toHaveLength(2);
  });
});
