import { describe, expect, it } from 'vitest';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, LOCAL_REVIEW_CATEGORY, LOCAL_REVIEW_CATEGORY_V2, reviewCategoryConfigurationDigest } from '../../src/service/review/category-configuration.js';
import { allPreinstalledProcedureDefinitions, baselineProcedureDefinition, localCheckProcedureDefinition, localCheckProcedureDefinitionV2, preinstalledProcedureDefinitions } from '../../src/service/procedures/preinstalled.js';
import { PROCEDURE_STAGE_LABELS, resolveProcedureStage } from '../../src/service/procedures/stage-types.js';
import { PROCEDURE_STAGE_TYPES } from '../../src/shared/protocol/procedures.js';
import { renderProcedureLibrary } from '../../src/renderer/procedure-library.js';
import { installMiniDom } from '../support/mini-dom.js';

describe('pre-installed procedures v1', () => {
  it('freezes local@1 canonical bytes while declaring a distinct unselected annotation-only successor', () => {
    const legacy = '{"editorInstruction":"","id":"ai7-procedure/local-text-check","outputKinds":["annotation"],"role":"以五项有限规则生成供编辑复核的精确批注","schema":"ai7.procedure-definition/2","stages":[{"budgetShare":0,"exemptionRules":[],"inputs":["frozen-local-plan"],"outputTemplateId":"ai7.review.local-result/1","parallelism":1,"stageType":"deterministic-check","toolWhitelist":[],"web":false},{"budgetShare":0,"exemptionRules":[],"inputs":["review-findings"],"outputTemplateId":"ai7.review.report/1","parallelism":1,"stageType":"derived-report","toolWhitelist":[],"web":false}],"title":"本地文字检查","version":1}';
    expect(canonicalJson(localCheckProcedureDefinition())).toBe(legacy);
    const successor = localCheckProcedureDefinitionV2();
    expect(successor).toMatchObject({ id: 'ai7-procedure/local-text-check', version: 2, outputKinds: ['annotation'] });
    expect(successor.stages.map((stage) => stage.stageType)).toEqual(['deterministic-check', 'derived-report']);
    expect(successor.stages[0]?.outputTemplateId).toBe('ai7.review.local-result/2');
    expect(successor.stages.every((stage) => !stage.web && stage.toolWhitelist.length === 0 && stage.budgetShare === 0)).toBe(true);
    expect(preinstalledProcedureDefinitions().find((entry) => entry.id === successor.id)).toEqual(localCheckProcedureDefinition());
    expect(allPreinstalledProcedureDefinitions().filter((entry) => entry.id === successor.id)).toEqual([localCheckProcedureDefinition()]);
    expect(LOCAL_REVIEW_CATEGORY.procedure.version).toBe('1');
    expect(LOCAL_REVIEW_CATEGORY_V2).toMatchObject({ categoryId: 'local-text-check', output: 'annotation', batchApply: false, searchEngine: false, procedure: { version: '2' } });
  });
  it('admits the bounded local checker while other future stage types remain unavailable', () => {
    const kind = baselineAnalysisKindDefinition();
    const available = PROCEDURE_STAGE_TYPES.filter((type) => resolveProcedureStage(type, kind).state === 'available');
    expect(available).toEqual(['chunked-review', 'deterministic-check', 'cross-unit-reduction', 'synthesis', 'derived-report']);
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
    expect(definitions).toHaveLength(11);
    expect(new Set(definitions.map((definition) => `${definition.id}@${definition.version}`)).size).toBe(11);
    expect(preinstalledProcedureDefinitions()).toEqual(definitions);
    expect(definitions.every((definition) => definition.editorInstruction === '' && definition.stages.length > 0)).toBe(true);
    expect(baselineProcedureDefinition(baselineAnalysisKindDefinition('retained-v1'))).toEqual(baselineProcedureDefinition());
    expect(canonicalJson(BUILTIN_REVIEW_CATEGORY_CONFIGURATION)).toBe(configuration);
    expect(reviewCategoryConfigurationDigest()).toBe(digest);
  });

  it('freezes the ten version-1 documents every revision-85 store holds', () => {
    // Every open compares the stored versions with these documents and refuses a store that differs, so a change to a
    // category's words, a kind's outcome or a contract id read here needs a version 2 beside version 1, never a new version 1.
    expect(Object.fromEntries(preinstalledProcedureDefinitions(1).map((definition) => [definition.id, sha256Hex(canonicalJson(definition))]))).toEqual({
      'ai7-procedure/review-typos-and-usage': '4be7d8ca9fbfc8b312fc163e9d1ee57b53372366adb576207ce6ee31741e4e5d',
      'ai7-procedure/review-style-and-format': 'c18a236a7d304876fd229cf225bdbbb2812206ad248b7a0b7b07a3e718419545',
      'ai7-procedure/review-plot-consistency': '20aee9cffceabb4f4b017b6dc38c2716125157fa5b87b47b3eba18e4d9a5be50',
      'ai7-procedure/review-factual-review': 'eea930f9f8b889903cef79e842adb975247e24ba2f6179fd4ce5d10bfbe2769d',
      'ai7-procedure/review-academic-integrity': '94c66e71b769be61fc6538326927813d53a4b8cd40bfd231f14c5a8d9d387b8d',
      'ai7-procedure/review-publication-risk': '717e6ae02ad31623ed13fb2118444288191e08f90b662d80a5e8b5b6700a7554',
      'ai7-procedure/review-literary-expression': '5a985dffd1604301a652c878aff0225e48a67cd6acd53650d94b64822b1a70cf',
      'ai7-procedure/review-series-consistency': '56e09d79d3f792e6db7bae778b3b4c55883f9b74fd0fd7750a2aa544cf896454',
      'ai7-procedure/review-cross-deliverable-consistency': '450b0c6d3c1f6e2862009e85e71b46000144fa648ff2b4dfdabcad73e17e83e1',
      'ai7-procedure/baseline-analysis': '795dae717d0a8b23a971efac44bb777063452941b4d940c5ee98cbe7cbf5a1fd',
    });
  });

  it('lists eleven enabled versions with their stages and uses and labels the review-only predecessor', () => {
    const restore = installMiniDom();
    try {
      const library = renderProcedureLibrary(preinstalledProcedureDefinitions().map((definition) => ({
        procedureId: definition.id, version: definition.version, digest: 'a'.repeat(64), title: definition.title,
        state: 'enabled', uses: 2, stages: definition.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })),
      })));
      expect(library.querySelectorAll('li')).toHaveLength(11);
      expect(library.textContent).toContain('已使用 2 次');
      expect(library.textContent).toContain('跨单元归并与跨章一致性');
      expect(library.textContent).toContain('审阅专用前身');
      expect(library.querySelectorAll('button')).toHaveLength(0);
    } finally { restore(); }
  });
});
