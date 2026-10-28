import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { withProcedureDefinition } from '../../src/service/procedures/execution.js';
import { baselineProcedureDefinition } from '../../src/service/procedures/preinstalled.js';
import { clarificationPlanBaseDigest, withModelClarification } from '../../src/service/provider/clarification-contract.js';

describe('the clarification base of a procedure-bound plan (#1173)', () => {
  it('reads the kind contract the plan recorded beside its procedure-bound contract, and refuses one that does not derive', () => {
    // As a plan is written under a rule that admits model clarification: the kind's clarified contract, then the edited version.
    const kind = withModelClarification(baselineAnalysisKindDefinition());
    const document = { ...baselineProcedureDefinition(), editorInstruction: '保留作者短句。' };
    const bound = withProcedureDefinition(kind, document, { procedureId: document.id, version: 1, digest: sha256Hex(canonicalJson(document)) });
    const execution = { clarificationBasePromptContractDigest: bound.clarificationBase!.promptContractDigest };
    const envelope = { promptContractDigest: bound.promptContractDigest, basePromptContractDigest: kind.promptContractDigest };
    expect(bound.promptContractDigest).not.toBe(kind.promptContractDigest);
    expect(clarificationPlanBaseDigest(execution, envelope)).toBe(kind.clarificationBase!.promptContractDigest);
    // A plan with no procedure, and a recorded base that is not the clarified one, read exactly as before.
    expect(clarificationPlanBaseDigest(execution, { promptContractDigest: kind.promptContractDigest })).toBe(kind.clarificationBase!.promptContractDigest);
    expect(clarificationPlanBaseDigest(execution, { ...envelope, basePromptContractDigest: bound.promptContractDigest })).toBeNull();
  });
});
