import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { FAST_ROLE_KINDS, type FastRoleExecutionOwner } from '../../src/service/fast-role/fast-role-execution.js';
import {
  MATERIAL_TRANSLATION_BATCH_CODE_UNITS,
  MATERIAL_TRANSLATION_BATCH_PARAGRAPHS,
  MATERIAL_TRANSLATION_KIND,
  MATERIAL_TRANSLATION_NOT_ADMITTED,
  MATERIAL_TRANSLATION_PROMPT_CONTRACT,
  MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST,
  MATERIAL_TRANSLATION_RESULT_SCHEMA,
  buildMaterialTranslationMessage,
  materialTranslator,
  readMaterialTranslationAnswer,
} from '../../src/service/fast-role/material-translation-contract.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCodeRoot } from '../support/temp-data-root.js';

// Unit suite (L1) for the Material Translation Contract v1 (Issue #892): the frozen request text, the aligned answer, and who
// may ask under which launch. The model is never reached here; the owner is a double that records what it was asked.

const answer = (texts: string[]): string => JSON.stringify({ schema: MATERIAL_TRANSLATION_RESULT_SCHEMA, translations: texts.map((text, index) => ({ n: index + 1, text })) });

describe('the 生成来源译文 contract', () => {
  it('is a Fast Interaction Role kind of its own slice, its frozen text bound by its digest', () => {
    expect(MATERIAL_TRANSLATION_KIND).toBe('material-translation');
    expect(MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST).toBe(sha256Hex(canonicalJson(MATERIAL_TRANSLATION_PROMPT_CONTRACT)));
    expect(FAST_ROLE_KINDS[MATERIAL_TRANSLATION_KIND]).toMatchObject({
      label: '生成来源译文', slice: 'S80', category: 'public-or-synthetic', productionCategory: 'frozen-material-reference-excerpt',
      promptContractDigest: MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST,
    });
    expect([MATERIAL_TRANSLATION_BATCH_PARAGRAPHS, MATERIAL_TRANSLATION_BATCH_CODE_UNITS]).toEqual([20, 6_000]);
    expect(MATERIAL_TRANSLATION_PROMPT_CONTRACT.systemPrompt).toContain('不调用任何工具');
  });

  it('sends the batch numbered, one paragraph per line, under a header naming its digest and count', () => {
    const message = buildMaterialTranslationMessage(['The river rose.', 'Nobody\nslept.']);
    const lines = message.split('\n');
    expect(lines[0]).toMatch(/^AI7 来源译文 · 段落摘要 [0-9a-f]{64} · 共 2 段$/u);
    expect(lines.slice(1)).toEqual(['【段落】', '[1] The river rose.', '[2] Nobody slept.']);
    expect(buildMaterialTranslationMessage(['The river rose.', 'Nobody\nslept.'])).toBe(message);
  });

  it('keeps translations by n, never by position, and discards only bad paragraphs', () => {
    const result = readMaterialTranslationAnswer('说明 '+JSON.stringify({ extra: true, translations: [{ n: 2, text: '乙', extra: 1 }, { n: 9, text: '坏' }, { n: 1, text: '甲' }, { n: 3, text: '' }] })+' 结束', 3);
    expect(result).toEqual(['甲', '乙', null]);
    expect(result?.salvaged).toEqual([{ section: 'translations', index: 1, reason: 'paragraph-not-aligned' }, { section: 'translations', index: 3, reason: 'paragraph-not-aligned' }, { section: 'paragraphs', index: 2, reason: 'paragraph-missing' }]);
    expect(readMaterialTranslationAnswer('{"translations":[{"n":2,"text":"乙"},{"n":', 2)).toEqual([null, '乙']);
    expect(readMaterialTranslationAnswer('{"translations":[{"n":1,"text":"甲"},{"n":1,"text":"重复"}]}', 2)).toEqual(['甲', null]);
    expect(readMaterialTranslationAnswer('no JSON', 2)).toBeNull();
  });

  it('reads an aligned JSON answer wrapped in a Markdown code fence', () => {
    for (const fence of ['```json', '```', '```JSON']) {
      expect(readMaterialTranslationAnswer(`${fence}\n${answer(['河水上涨。'])}\n\`\`\``, 1)).toEqual(['河水上涨。']);
    }
    expect(readMaterialTranslationAnswer(`解释\n\`\`\`json\n${answer(['河水上涨。'])}\n\`\`\``, 1)).toEqual(['河水上涨。']);
  });

  it('skips a leading bracketed note before numbered translations (#1311)', () => {
    expect(readMaterialTranslationAnswer(`[说明] ${answer(['甲'])}`, 1)).toEqual(['甲']);
    expect(readMaterialTranslationAnswer('[说明] [{"n":1,"text":"甲"}]', 1)).toEqual(['甲']);
  });
});

describe('who may ask for 来源译文', () => {
  const PUBLIC = 'b'.repeat(64);

  /** An owner double: its route refusal, and the answer it gives. */
  function owner(route: string | null, reply: Awaited<ReturnType<FastRoleExecutionOwner['ask']>>): { owner: FastRoleExecutionOwner; asked: string[] } {
    const asked: string[] = [];
    const double = {
      refusal: () => route,
      ask: async (_kind: string, message: string) => {
        asked.push(message);
        return reply;
      },
    } as unknown as FastRoleExecutionOwner;
    return { owner: double, asked };
  }
  const answered = (text: string): Awaited<ReturnType<FastRoleExecutionOwner['ask']>> => ({
    kind: 'answered' as const, text,
    binding: { kindId: MATERIAL_TRANSLATION_KIND, promptContractDigest: MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST, route: 'opencode-go', model: 'deepseek-v4-flash', operationalScope: 'developer-live' as const, policyRuleId: 'rule', fixtureSha256: null },
  });

  it('refuses with 「当前策略未开放来源译文」 when no rule names the kind, and under development-ci', async () => {
    expect(MATERIAL_TRANSLATION_NOT_ADMITTED).toBe('当前策略未开放来源译文');
    const { owner: ready, asked } = owner(null, answered(answer(['甲'])));
    expect(materialTranslator(ready, 'developer-live', () => 0).refusal(PUBLIC)).toBe(MATERIAL_TRANSLATION_NOT_ADMITTED);
    expect(materialTranslator(ready, 'development-ci', () => 1).refusal(PUBLIC)).toBe(MATERIAL_TRANSLATION_NOT_ADMITTED);
    expect(await materialTranslator(ready, 'ordinary-production', () => 0).translate(PUBLIC, ['x'], 's')).toEqual({ kind: 'failed', message: MATERIAL_TRANSLATION_NOT_ADMITTED });
    expect(asked).toEqual([]);
  });

  it('passes the owner\'s own route refusal through, and holds developer-live to the admitted public passage', async () => {
    const { owner: unrouted } = owner('受保护凭据库中没有…', answered(''));
    expect(materialTranslator(unrouted, 'ordinary-production', () => 1).refusal('a'.repeat(64))).toBe('受保护凭据库中没有…');
    const { owner: ready } = owner(null, answered(answer(['甲'])));
    expect(materialTranslator(ready, 'developer-live', () => 1).refusal('a'.repeat(64))).toBeNull();
    expect(materialTranslator(ready, 'developer-live', () => 1).refusal(PUBLIC)).toBeNull();
    // Ordinary production sends the editor's own material under its rule; no public list applies.
    expect(materialTranslator(ready, 'ordinary-production', () => 1).refusal('a'.repeat(64))).toBeNull();
  });

  it('records an aligned answer with the binding it ran on, and nothing of one that does not align or failed', async () => {
    const { owner: good, asked } = owner(null, answered(answer(['河水上涨。', '无人入睡。'])));
    expect(await materialTranslator(good, 'developer-live', () => 1).translate(PUBLIC, ['The river rose.', 'Nobody slept.'], 'step')).toEqual({
      kind: 'translated', texts: ['河水上涨。', '无人入睡。'],
      made: { model: 'deepseek-v4-flash', route: 'opencode-go', policyRuleId: 'rule', promptContractDigest: MATERIAL_TRANSLATION_PROMPT_CONTRACT_DIGEST },
    });
    expect(asked).toEqual([buildMaterialTranslationMessage(['The river rose.', 'Nobody slept.'])]);
    const { owner: short } = owner(null, answered(answer(['河水上涨。'])));
    expect(await materialTranslator(short, 'developer-live', () => 1).translate(PUBLIC, ['a', 'b'], 's'))
      .toMatchObject({ kind: 'translated', texts: ['河水上涨。', null] });
    const { owner: unknown } = owner(null, { kind: 'failed', code: 'OUTCOME_UNKNOWN', message: '结果待确认', outcomeUnknown: true });
    expect(await materialTranslator(unknown, 'developer-live', () => 1).translate(PUBLIC, ['a'], 's')).toEqual({ kind: 'failed', message: '结果待确认' });
  });
});
