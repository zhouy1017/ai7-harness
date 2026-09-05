import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_PROMPT_CONTRACT,
  BASELINE_PROMPT_CONTRACT_DIGEST,
  BASELINE_UNIT_RESULT_SCHEMA,
  buildUnitMessage,
  parseUnitMessageHeader,
  parseUnitResult,
  unitRequestDigest,
} from '../../src/service/analysis/contract.js';
import type { CoverageManifestUnitProjection } from '../../src/shared/protocol.js';

const BLOCK_A = `blk_${'a'.repeat(24)}`;
const BLOCK_B = `blk_${'b'.repeat(24)}`;
const BLOCK_C = `blk_${'c'.repeat(24)}`;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function validResult(unitOrdinal = 3): Record<string, unknown> {
  return {
    schema: BASELINE_UNIT_RESULT_SCHEMA,
    unitOrdinal,
    synopsis: '合成单元概述。',
    entities: [{ name: '合成人物甲', kind: 'person', aliases: ['阿甲'], note: null, sourceRanges: [{ blockId: BLOCK_A, fromGrapheme: 0, toGrapheme: 4 }] }],
    events: [{ ordinal: 1, summary: '合成事件。', chronology: '开端', participants: ['合成人物甲'], sourceRanges: [{ blockId: BLOCK_B, fromGrapheme: null, toGrapheme: null }] }],
    relationships: [{ subject: '合成人物甲', object: '合成地点乙', relation: '前往', sourceRanges: [] }],
    settingClaims: [{ subject: '合成地点乙', claim: '位于北方。', sourceRanges: [{ blockId: BLOCK_B, fromGrapheme: null, toGrapheme: null }] }],
    conflicts: [],
    unresolved: [{ description: '合成人物甲的年龄未说明。', sourceRanges: [] }],
    confidence: 'medium',
  };
}

const expected = { unitOrdinal: 3, blockIds: [BLOCK_A, BLOCK_B] };

describe('parseUnitResult (Baseline Manuscript Analysis Contract v1)', () => {
  it('accepts a conforming unit result, canonicalizes it, and digests it', () => {
    const parsed = parseUnitResult(JSON.stringify(validResult()), expected);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.unitOrdinal).toBe(3);
    expect(parsed.result.entities[0]!.aliases).toEqual(['阿甲']);
    expect(parsed.digest).toMatch(DIGEST_PATTERN);
    expect(parsed.digest).toBe(createHash('sha256').update(parsed.canonicalJson).digest('hex'));
    // Key order in the model output never changes the canonical form.
    const reordered = parseUnitResult(JSON.stringify(Object.fromEntries(Object.entries(validResult()).reverse())), expected);
    expect(reordered.ok && reordered.digest).toBe(parsed.digest);
  });

  it('accepts a JSON code fence around the object', () => {
    const parsed = parseUnitResult(`\`\`\`json\n${JSON.stringify(validResult())}\n\`\`\``, expected);
    expect(parsed.ok).toBe(true);
  });

  it('rejects non-JSON, an extra or missing key, a wrong schema, and an unknown confidence', () => {
    expect(parseUnitResult('这不是 JSON', expected)).toEqual({ ok: false, code: 'not-json', detail: '模型输出不是 JSON。' });
    expect(parseUnitResult(JSON.stringify({ ...validResult(), extra: 1 }), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    const { conflicts: _conflicts, ...missing } = validResult();
    expect(parseUnitResult(JSON.stringify(missing), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseUnitResult(JSON.stringify({ ...validResult(), schema: 'other/1' }), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseUnitResult(JSON.stringify({ ...validResult(), confidence: 'certain' }), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseUnitResult(JSON.stringify({ ...validResult(), entities: [{ name: '', kind: 'person', aliases: [], note: null, sourceRanges: [] }] }), expected))
      .toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('rejects a result that names another unit', () => {
    expect(parseUnitResult(JSON.stringify(validResult(4)), expected)).toMatchObject({ ok: false, code: 'unit-mismatch' });
  });

  it('rejects a source range that leaves the unit', () => {
    const outside = validResult();
    (outside.events as Array<{ sourceRanges: unknown[] }>)[0]!.sourceRanges = [{ blockId: BLOCK_C, fromGrapheme: null, toGrapheme: null }];
    expect(parseUnitResult(JSON.stringify(outside), expected)).toMatchObject({ ok: false, code: 'range-out-of-unit' });
    const malformed = validResult();
    (malformed.entities as Array<{ sourceRanges: unknown[] }>)[0]!.sourceRanges = [{ blockId: BLOCK_A, fromGrapheme: 5, toGrapheme: 2 }];
    expect(parseUnitResult(JSON.stringify(malformed), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('rejects duplicate event ordinals', () => {
    const duplicated = validResult();
    (duplicated.events as unknown[]).push({ ordinal: 1, summary: '重复。', chronology: null, participants: [], sourceRanges: [] });
    expect(parseUnitResult(JSON.stringify(duplicated), expected)).toMatchObject({ ok: false, code: 'schema-invalid' });
  });
});

describe('prompt contract', () => {
  const unit: CoverageManifestUnitProjection = {
    ordinal: 2,
    sectionOrdinal: 1,
    subUnitIndex: 2,
    subUnitCount: 2,
    headingBlockId: BLOCK_A,
    headingText: '合成标题',
    headingLevel: 1,
    startPosition: 3,
    endPosition: 4,
    blockIds: [BLOCK_B, BLOCK_C],
    blockDigests: ['1'.repeat(64), '2'.repeat(64)],
    overlapBlockIds: [BLOCK_A],
    graphemes: 12,
    digest: 'd'.repeat(64),
  };
  const blocks = new Map([
    [BLOCK_A, { blockId: BLOCK_A, kind: 'heading' as const, level: 1, text: '合成标题' }],
    [BLOCK_B, { blockId: BLOCK_B, kind: 'paragraph' as const, level: null, text: '合成段落一。' }],
    [BLOCK_C, { blockId: BLOCK_C, kind: 'paragraph' as const, level: null, text: '合成段落二。' }],
  ]);

  it('has a stable digest over frozen text that contains no manuscript content', () => {
    expect(BASELINE_PROMPT_CONTRACT_DIGEST).toMatch(DIGEST_PATTERN);
    expect(BASELINE_PROMPT_CONTRACT.systemPrompt).toContain(BASELINE_UNIT_RESULT_SCHEMA);
    expect(BASELINE_PROMPT_CONTRACT.systemPrompt).not.toMatch(/tool|工具调用/u);
  });

  it('builds the unit message with a parseable header, overlap context, then own blocks', () => {
    const message = buildUnitMessage(unit, 5, blocks);
    const lines = message.split('\n');
    expect(lines[0]).toBe(`分析单元 2/5 · 单元摘要 ${'d'.repeat(64)}`);
    expect(lines[1]).toBe(BASELINE_PROMPT_CONTRACT.overlapHeader);
    expect(lines[2]).toBe(`[${BLOCK_A}] (heading h1) 合成标题`);
    expect(lines[3]).toBe(BASELINE_PROMPT_CONTRACT.ownHeader);
    expect(lines[4]).toBe(`[${BLOCK_B}] (paragraph) 合成段落一。`);
    expect(lines[5]).toBe(`[${BLOCK_C}] (paragraph) 合成段落二。`);
    expect(parseUnitMessageHeader(message)).toEqual({ ordinal: 2, total: 5, unitDigest: 'd'.repeat(64) });
    expect(parseUnitMessageHeader('随意文本')).toBeNull();
    expect(parseUnitMessageHeader(`分析单元 6/5 · 单元摘要 ${'d'.repeat(64)}`)).toBeNull();
  });

  it('derives the fixture request digest from the contract digest, unit ordinal, and unit digest only', () => {
    const digest = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 2, 'd'.repeat(64));
    expect(digest).toMatch(DIGEST_PATTERN);
    expect(unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 2, 'd'.repeat(64))).toBe(digest);
    expect(unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 3, 'd'.repeat(64))).not.toBe(digest);
    expect(unitRequestDigest('e'.repeat(64), 2, 'd'.repeat(64))).not.toBe(digest);
    expect(() => unitRequestDigest('short', 2, 'd'.repeat(64))).toThrowError(/ANALYSIS_REQUEST_DIGEST_INVALID/u);
  });
});
