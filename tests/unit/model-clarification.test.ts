import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { clarificationGraphemes, parseModelClarification } from '../../src/service/analysis/clarifications.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { withModelClarification, withAmbiguousClarificationValidation, CLARIFICATION_INSTRUCTION } from '../../src/service/provider/clarification-contract.js';
import { liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';

describe('model clarification contract alternative', () => {
  it('parses only one structured question instead of a result', () => {
    const question = { question: '请选择阅读重点', options: ['人物', '事件'], freeTextAllowed: true };
    expect(parseModelClarification(JSON.stringify(question))).toEqual(question);
    expect(parseModelClarification(JSON.stringify({ question: '请说明重点', freeTextAllowed: true }))).not.toBeNull();
    expect(parseModelClarification(JSON.stringify({ schema: 'unit-result', synopsis: '合成结果' }))).toBeNull();
    for (const invalid of [
      { ...question, options: ['一', '二', '三', '四', '五'] }, { ...question, options: ['重复', '重复'] },
      { question: '问题', freeTextAllowed: false }, { ...question, result: {} }, { ...question, question: '' },
      { ...question, freeTextAllowed: 'yes' }, { ...question, options: ['长'.repeat(101)] },
    ]) expect(parseModelClarification(JSON.stringify(invalid))).toBeNull();
  });
  it('counts the editor note in graphemes, including composed emoji and combining marks', () => {
    expect(clarificationGraphemes('👩🏽‍💻'.repeat(500))).toBe(500);
    expect(clarificationGraphemes('a\u0301'.repeat(501))).toBe(501);
  });
  it('binds instruction /2 to the wrapped contract while retaining its result contract and exact base bytes', () => {
    const base = baselineAnalysisKindDefinition();
    const wrapped = withModelClarification(base);
    expect(CLARIFICATION_INSTRUCTION.schema).toMatch(/\/2$/u);
    expect(wrapped.systemPrompt).toBe(`${base.systemPrompt}\n\n${CLARIFICATION_INSTRUCTION.systemPrompt}`);
    expect(wrapped.promptContractDigest).not.toBe(base.promptContractDigest);
    expect(wrapped.unitResultSchema).toBe(base.unitResultSchema);
    expect(wrapped.clarificationBase).toBe(base);
    expect(withModelClarification(wrapped)).toBe(wrapped);
    // A wrapped non-baseline contract never bypasses the single admitted-rule check.
    expect(liveKindAdmission(undefined, wrapped, { route: 'none', endpoint: '', model: '', credentialSlot: '' })).toBeNull();
  });
  it('keeps the declared ambiguous retry separate from every product launch selection', () => {
    const base = baselineAnalysisKindDefinition();
    const normal = withModelClarification(base);
    const variant = withAmbiguousClarificationValidation(base);
    expect(variant.promptContractDigest).not.toBe(normal.promptContractDigest);
    expect(variant.systemPrompt).toContain('本次分析的阅读重点尚未决定：人物或事件');
    expect(normal.systemPrompt).not.toContain('本次分析的阅读重点尚未决定：人物或事件');
    for (const path of ['src/service/analysis/baseline-analysis-store.ts', 'src/service/index.ts', 'src/main/application.ts', 'tools/start-built.mjs']) {
      expect(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')).not.toContain('withAmbiguousClarificationValidation');
    }
  });
});
