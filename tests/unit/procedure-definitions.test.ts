import { describe, expect, it } from 'vitest';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryConfigurationDigest } from '../../src/service/review/category-configuration.js';
import { baselineProcedureDefinition, preinstalledProcedureDefinitions } from '../../src/service/procedures/preinstalled.js';
import { PROCEDURE_STAGE_LABELS, resolveProcedureStage } from '../../src/service/procedures/stage-types.js';
import { PROCEDURE_STAGE_TYPES } from '../../src/shared/protocol/procedures.js';
import { renderProcedureLibrary } from '../../src/renderer/procedure-library.js';
import { installMiniDom } from '../support/mini-dom.js';

describe('pre-installed procedures v1', () => {
  it('keeps the five future stage types unavailable and binds only existing executors', () => {
    const kind = baselineAnalysisKindDefinition();
    const available = PROCEDURE_STAGE_TYPES.filter((type) => resolveProcedureStage(type, kind).state === 'available');
    expect(available).toEqual(['chunked-review', 'cross-unit-reduction', 'synthesis', 'derived-report']);
    expect(PROCEDURE_STAGE_TYPES.map((type) => PROCEDURE_STAGE_LABELS[type])).toEqual([
      '通读记账', '分块审读', '确定性检查', '断言抽取', '联网取证', '跨单元归并与跨章一致性', '综合', '起草', '派生报告',
    ]);
    for (const type of PROCEDURE_STAGE_TYPES.filter((type) => !available.includes(type))) {
      expect(resolveProcedureStage(type, kind)).toMatchObject({ state: 'unavailable', reason: expect.any(String) });
    }
    expect(resolveProcedureStage('synthesis', kind)).toMatchObject({ reduce: kind.reduce });
    expect(resolveProcedureStage('cross-unit-reduction', kind)).toMatchObject({ binding: kind.crossUnit });
  });

  it('deterministically re-expresses the categories without changing configuration or retained baseline contracts', () => {
    const configuration = canonicalJson(BUILTIN_REVIEW_CATEGORY_CONFIGURATION);
    const digest = reviewCategoryConfigurationDigest();
    const definitions = preinstalledProcedureDefinitions();
    expect(definitions).toHaveLength(10);
    expect(new Set(definitions.map((definition) => `${definition.id}@${definition.version}`)).size).toBe(10);
    expect(preinstalledProcedureDefinitions()).toEqual(definitions);
    expect(definitions.every((definition) => definition.editorInstruction === '' && definition.stages.length > 0)).toBe(true);
    expect(baselineProcedureDefinition(baselineAnalysisKindDefinition('retained-v1'))).toEqual(baselineProcedureDefinition());
    expect(canonicalJson(BUILTIN_REVIEW_CATEGORY_CONFIGURATION)).toBe(configuration);
    expect(reviewCategoryConfigurationDigest()).toBe(digest);
  });

  it('lists ten enabled versions with their stages and uses and labels the review-only predecessor', () => {
    const restore = installMiniDom();
    try {
      const library = renderProcedureLibrary(preinstalledProcedureDefinitions().map((definition) => ({
        procedureId: definition.id, version: definition.version, digest: 'a'.repeat(64), title: definition.title,
        state: 'enabled', uses: 2, stages: definition.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })),
      })));
      expect(library.querySelectorAll('li')).toHaveLength(10);
      expect(library.textContent).toContain('已使用 2 次');
      expect(library.textContent).toContain('跨单元归并与跨章一致性');
      expect(library.textContent).toContain('审阅专用前身');
      expect(library.querySelectorAll('button')).toHaveLength(0);
    } finally { restore(); }
  });
});
