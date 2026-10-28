import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { compositeMembers, procedureForKind } from '../../src/service/procedures/composite.js';
import { validateProcedureEdit } from '../../src/service/procedures/editable.js';
import { procedureStageBudget } from '../../src/service/procedures/execution.js';
import { fullReviewProcedureDefinition, preinstalledProcedureDefinitions } from '../../src/service/procedures/preinstalled.js';
import { procedureStageUsesModel } from '../../src/shared/protocol/procedures.js';

const document = fullReviewProcedureDefinition();
const pin = { procedureId: document.id, version: document.version, digest: sha256Hex(canonicalJson(document)) };

describe('全文审校 v1, the first composite procedure (#1173)', () => {
  it('runs the four dimensions as existing pre-installed versions, 确定性检查 first, then the report', () => {
    expect(document.members!.map((member) => [member.categoryId, `${member.procedureId}@${member.version}`, member.stageCount])).toEqual([
      ['local-text-check', 'ai7-procedure/local-text-check@3', 1], ['typos-and-usage', 'ai7-procedure/review-typos-and-usage@2', 2],
      ['style-and-format', 'ai7-procedure/review-style-and-format@3', 4], ['plot-consistency', 'ai7-procedure/review-plot-consistency@2', 4],
      ['factual-review', 'ai7-procedure/factual-claim-check@1', 2]]);
    expect(document.stages.map((stage) => stage.stageType)).toEqual(['deterministic-check', 'chunked-review', 'synthesis',
      'chunked-review', 'cross-unit-reduction', 'cross-chapter-consistency', 'synthesis', 'chunked-review', 'cross-unit-reduction',
      'cross-chapter-consistency', 'synthesis', 'claim-extraction', 'web-verification', 'derived-report']);
    expect(compositeMembers(document).map((member) => member.executorKind)).toEqual(['local-text-check', 'editorial-review/typos-and-usage',
      'editorial-review/style-and-format', 'editorial-review/plot-consistency', 'factual-review']);
    expect(preinstalledProcedureDefinitions().at(-1)).toEqual(document);
  });

  it('holds its exemption template as bounded text and every model stage inside one ceiling', () => {
    const model = document.stages.filter((stage) => procedureStageUsesModel(stage, document.stages));
    expect(model.every((stage) => stage.budgetShare > 0)).toBe(true);
    expect(model.reduce((sum, stage) => sum + stage.budgetShare, 0)).toBeCloseTo(1);
    expect(document.stages.filter((stage) => !procedureStageUsesModel(stage, document.stages))
      .every((stage) => stage.budgetShare === 0 && stage.exemptionRules.length === 0)).toBe(true);
    expect(() => validateProcedureEdit(document, { procedureId: document.id, basedOn: pin, title: document.title,
      editorInstruction: document.editorInstruction, stages: document.stages })).not.toThrow();
  });

  it("gives each member's Task its own stages under the composite's words and shares, run by its own version", () => {
    const typos = procedureForKind(document, pin, 'editorial-review/typos-and-usage');
    expect(typos.pin).toEqual(pin);
    expect(typos.executor).toEqual({ procedureId: 'ai7-procedure/review-typos-and-usage', version: 2, digest: document.members![1]!.digest });
    expect(typos.document.stages.map((stage) => stage.stageType)).toEqual(['chunked-review', 'synthesis', 'derived-report']);
    expect([typos.document.editorInstruction, typos.document.stages[0]!.exemptionRules.length]).toEqual([document.editorInstruction, 2]);
    expect(procedureStageBudget(typos.document, 'units', 100_000)).toBe(15_000);
    const factual = procedureForKind(document, pin, 'factual-review');
    expect(factual.executor.procedureId).toBe('ai7-procedure/factual-claim-check');
    expect([procedureStageBudget(factual.document, 'units', 100_000), procedureStageBudget(factual.document, 'web-verification', 100_000)]).toEqual([15_000, 20_000]);
    expect(procedureStageBudget(procedureForKind(document, pin, 'editorial-review/style-and-format').document, 'cross-unit-reduction', 100_000)).toBe(10_000);
    expect(() => procedureForKind(document, pin, 'writing')).toThrow(/没有这一类任务/);
  });

  it('refuses a composite whose stages or members no longer match the versions they name', () => {
    expect(() => compositeMembers({ ...document, stages: document.stages.map((stage, index) => index === 1 ? { ...stage, outputTemplateId: 'other' } : stage) }))
      .toThrow(/阶段与成员版本不一致/);
    expect(() => compositeMembers({ ...document, members: [...document.members!].reverse() })).toThrow();
    expect(() => compositeMembers({ ...document, members: document.members!.map((member, index) => index === 0 ? { ...member, digest: '0'.repeat(64) } : member) }))
      .toThrow(/成员版本不可用/);
  });
});
