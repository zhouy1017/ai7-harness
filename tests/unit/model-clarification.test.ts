import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { sep } from 'node:path';
import { clarificationGraphemes, parseModelClarification } from '../../src/service/analysis/clarifications.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import {
  withModelClarification, withAmbiguousClarificationValidation, CLARIFICATION_INSTRUCTION, clarificationPlanBaseDigest, clarificationPromptContractDigest,
} from '../../src/service/provider/clarification-contract.js';
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
  it('unwraps a frozen plan only to its base digest or the re-derived /2 wrapper, never the validation variant', () => {
    const base = baselineAnalysisKindDefinition();
    const wrapped = withModelClarification(base);
    const variant = withAmbiguousClarificationValidation(base);
    // The writing, 审稿意见 and rewrite readers accept exactly this re-derivation beside the base digest.
    expect(clarificationPromptContractDigest(base.promptContractDigest)).toBe(wrapped.promptContractDigest);
    expect(clarificationPromptContractDigest(base.promptContractDigest)).not.toBe(variant.promptContractDigest);
    // The review material consumer: an unwrapped plan keeps its envelope digest; a wrapped one yields its proven base.
    expect(clarificationPlanBaseDigest({}, { promptContractDigest: base.promptContractDigest })).toBe(base.promptContractDigest);
    expect(clarificationPlanBaseDigest({ clarificationBasePromptContractDigest: base.promptContractDigest }, { promptContractDigest: wrapped.promptContractDigest }))
      .toBe(base.promptContractDigest);
    for (const [execution, envelope] of [
      [{ clarificationBasePromptContractDigest: base.promptContractDigest }, { promptContractDigest: variant.promptContractDigest }],
      [{ clarificationBasePromptContractDigest: 'f'.repeat(64) }, { promptContractDigest: wrapped.promptContractDigest }],
      [{ clarificationBasePromptContractDigest: 7 }, { promptContractDigest: wrapped.promptContractDigest }],
      [{}, { promptContractDigest: 'not-a-digest' }],
    ] as const) expect(clarificationPlanBaseDigest(execution, envelope)).toBeNull();
  });
  it('keeps the declared ambiguous retry separate from every product launch selection', () => {
    const base = baselineAnalysisKindDefinition();
    const normal = withModelClarification(base);
    const variant = withAmbiguousClarificationValidation(base);
    expect(variant.promptContractDigest).not.toBe(normal.promptContractDigest);
    expect(variant.systemPrompt).toContain('本次分析的阅读重点尚未决定：人物或事件');
    expect(normal.systemPrompt).not.toContain('本次分析的阅读重点尚未决定：人物或事件');
    // No product source names the variant but its owner; the fixture generator and the replay test are its only other readers.
    const product = readdirSync(new URL('../../src/', import.meta.url), { recursive: true, encoding: 'utf8' })
      .map((path) => path.split(sep).join('/'))
      .filter((path) => /\.(ts|mts|mjs)$/u.test(path) && path !== 'service/provider/clarification-contract.ts');
    expect(product.length).toBeGreaterThan(100);
    for (const path of [...product.map((file) => `src/${file}`), 'tools/start-built.mjs']) {
      const text = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
      expect(text, path).not.toContain('withAmbiguousClarificationValidation');
      expect(text, path).not.toContain('AMBIGUOUS_CLARIFICATION_VALIDATION_INSTRUCTION');
    }
  });
});
