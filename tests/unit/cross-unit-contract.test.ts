import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT,
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST,
  BASELINE_CROSS_UNIT_RESULT_SCHEMA,
  CROSS_UNIT_FINDING_KINDS,
  buildCrossUnitMessage,
  citedBlocksByUnit,
  crossUnitRequestDigest,
  parseCrossUnitCitedBlocks,
  parseCrossUnitMessageHeader,
  parseCrossUnitResult,
  unitSetDigest,
  type ClosedUnitResult,
} from '../../src/service/analysis/cross-unit-contract.js';
import { BASELINE_UNIT_RESULT_SCHEMA, type BaselineUnitResult } from '../../src/service/analysis/contract.js';

const BLOCK_A = `blk_${'a'.repeat(24)}`;
const BLOCK_B = `blk_${'b'.repeat(24)}`;
const BLOCK_C = `blk_${'c'.repeat(24)}`;
const BLOCK_D = `blk_${'d'.repeat(24)}`;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function range(blockId: string, fromGrapheme: number | null = null, toGrapheme: number | null = null) {
  return { blockId, fromGrapheme, toGrapheme };
}

function unitResult(unitOrdinal: number, blocks: [string, string], name: string): BaselineUnitResult {
  return {
    schema: BASELINE_UNIT_RESULT_SCHEMA,
    unitOrdinal,
    synopsis: `合成概述（单元 ${unitOrdinal}）。`,
    entities: [{ name, kind: 'person', aliases: ['阿甲'], note: null, sourceRanges: [range(blocks[0], 0, 4)] }],
    events: [{ ordinal: 1, summary: `合成事件（单元 ${unitOrdinal}）。`, chronology: '开端', participants: [name], sourceRanges: [range(blocks[1])] }],
    relationships: [{ subject: name, object: '合成之城', relation: '抵达', sourceRanges: [range(blocks[0])] }],
    settingClaims: [{ subject: '合成之城', claim: unitOrdinal === 1 ? '位于北方' : '位于南方', sourceRanges: [range(blocks[1])] }],
    conflicts: [],
    unresolved: [],
    confidence: 'high',
  };
}

const CLOSED: ReadonlyArray<ClosedUnitResult> = [
  { unitOrdinal: 1, result: unitResult(1, [BLOCK_A, BLOCK_B], '合成人物甲') },
  { unitOrdinal: 3, result: unitResult(3, [BLOCK_C, BLOCK_D], '合成人物乙') },
];

const EXPECTED = { closedOrdinals: [1, 3], citedBlocksByUnit: citedBlocksByUnit(CLOSED) };

function validResult(): Record<string, unknown> {
  return {
    schema: BASELINE_CROSS_UNIT_RESULT_SCHEMA,
    findings: [{
      kind: 'contradiction',
      description: '合成矛盾：单元 1 与单元 3 对合成之城的方位陈述不一致。',
      sides: [
        { unitOrdinal: 1, sourceRanges: [range(BLOCK_B)] },
        { unitOrdinal: 3, sourceRanges: [range(BLOCK_D)] },
      ],
      confidence: 'medium',
    }],
    notes: ['合成备注：其余单元未提及该设定。'],
  };
}

describe('the Baseline Cross-Unit Reduction Contract v1 message', () => {
  it('opens with the header, carries the instruction text, and never a second system prompt', () => {
    const message = buildCrossUnitMessage(CLOSED, 8);
    const lines = message.split('\n');
    expect(lines[0]).toBe(`跨单元归纳 2/8 · 单元集摘要 ${unitSetDigest(CLOSED)}`);
    expect(message).toContain(BASELINE_CROSS_UNIT_PROMPT_CONTRACT.instruction);
    expect(parseCrossUnitMessageHeader(message)).toEqual({ closed: 2, total: 8, unitSetDigest: unitSetDigest(CLOSED) });
    expect(parseCrossUnitMessageHeader('分析单元 1/8 · 单元摘要 ' + 'a'.repeat(64))).toBeNull();
    expect(parseCrossUnitMessageHeader('跨单元归纳 1/8 · 单元集摘要 ' + 'a'.repeat(64))).toBeNull();
  });

  it('reorganizes the closed set by topic, one row per item, each naming its unit and blocks', () => {
    const message = buildCrossUnitMessage(CLOSED, 8);
    const contract = BASELINE_CROSS_UNIT_PROMPT_CONTRACT;
    const lines = message.split('\n');
    const at = (header: string) => lines.indexOf(header);
    expect(at(contract.entityHeader)).toBeGreaterThan(0);
    expect(at(contract.eventHeader)).toBeGreaterThan(at(contract.entityHeader));
    expect(at(contract.relationshipHeader)).toBeGreaterThan(at(contract.eventHeader));
    expect(at(contract.settingClaimHeader)).toBeGreaterThan(at(contract.relationshipHeader));
    expect(at(contract.citedBlocksHeader)).toBeGreaterThan(at(contract.settingClaimHeader));
    expect(lines).toContain(`- 合成人物甲（person；别名：阿甲）· 单元 1 · 内容块 ${BLOCK_A}`);
    expect(lines).toContain(`- 合成事件（单元 3）。（时序：开端） · 单元 3 · 内容块 ${BLOCK_D}`);
    expect(lines).toContain(`- 合成人物乙 —抵达→ 合成之城 · 单元 3 · 内容块 ${BLOCK_C}`);
    expect(lines).toContain(`- 合成之城：位于北方 · 单元 1 · 内容块 ${BLOCK_B}`);
    // No placeholder survives interpolation, and the message carries no manuscript text of its own.
    expect(message).not.toMatch(/\{[a-zA-Z]+\}/u);
  });

  it('ends with each unit’s distinct cited blocks in first-citation order, readable back from the text', () => {
    const message = buildCrossUnitMessage(CLOSED, 8);
    expect(message.split('\n').slice(-2)).toEqual([
      `单元 1：${BLOCK_A}、${BLOCK_B}`,
      `单元 3：${BLOCK_C}、${BLOCK_D}`,
    ]);
    expect([...parseCrossUnitCitedBlocks(message)]).toEqual([[1, [BLOCK_A, BLOCK_B]], [3, [BLOCK_C, BLOCK_D]]]);
    expect([...citedBlocksByUnit(CLOSED)]).toEqual([[1, [BLOCK_A, BLOCK_B]], [3, [BLOCK_C, BLOCK_D]]]);
    expect(parseCrossUnitCitedBlocks('没有引用小节').size).toBe(0);
  });
});

describe('the cross-unit request digest', () => {
  it('is a pure function of the frozen contract and the exact closed unit set', () => {
    expect(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST).toMatch(DIGEST_PATTERN);
    const digest = crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest(CLOSED));
    expect(digest).toMatch(DIGEST_PATTERN);
    // Ordinal order, not submission order, and identical results yield the identical digest.
    expect(unitSetDigest([...CLOSED].reverse())).toBe(unitSetDigest(CLOSED));
    expect(crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, unitSetDigest([...CLOSED].reverse()))).toBe(digest);
    expect(() => crossUnitRequestDigest('not-a-digest', unitSetDigest(CLOSED))).toThrow('ANALYSIS_REQUEST_DIGEST_INVALID');
  });

  /**
   * The half a fixture depends on. A committed block identity is minted from the import's own id
   * (`bounded-manuscript.ts`), so the same manuscript imported twice carries different identities; the
   * digest survives that only because it indexes each cited block by its position rather than naming it.
   */
  it('is the same for two mintings of one closed set under different block identities', () => {
    const reminted: ClosedUnitResult[] = [
      { unitOrdinal: 1, result: unitResult(1, [`blk_${'1'.repeat(24)}`, `blk_${'2'.repeat(24)}`], '合成人物甲') },
      { unitOrdinal: 3, result: unitResult(3, [`blk_${'3'.repeat(24)}`, `blk_${'4'.repeat(24)}`], '合成人物乙') },
    ];
    // Not one identity in common, and the message bytes differ because they name those identities.
    expect(JSON.stringify(reminted)).not.toContain(BLOCK_A);
    expect(buildCrossUnitMessage(reminted, 8)).not.toBe(buildCrossUnitMessage(CLOSED, 8));
    expect(unitSetDigest(reminted)).toBe(unitSetDigest(CLOSED));
    // A third minting whose identities happen to sort the other way is still the same set.
    const resorted: ClosedUnitResult[] = [
      { unitOrdinal: 1, result: unitResult(1, [`blk_${'f'.repeat(24)}`, `blk_${'e'.repeat(24)}`], '合成人物甲') },
      { unitOrdinal: 3, result: unitResult(3, [`blk_${'d'.repeat(24)}`, `blk_${'c'.repeat(24)}`], '合成人物乙') },
    ];
    expect(unitSetDigest(resorted)).toBe(unitSetDigest(CLOSED));
  });

  it('differs whenever the closed set differs in content or in structure', () => {
    const baseline = unitSetDigest(CLOSED);
    // Content: one changed synopsis.
    expect(unitSetDigest([CLOSED[0]!, { unitOrdinal: 3, result: { ...CLOSED[1]!.result, synopsis: '合成概述（已改）。' } }])).not.toBe(baseline);
    // Content: one changed claim, which is what a cross-unit contradiction turns on.
    const claims = CLOSED[1]!.result.settingClaims.map((claim) => ({ ...claim, claim: '位于东方' }));
    expect(unitSetDigest([CLOSED[0]!, { unitOrdinal: 3, result: { ...CLOSED[1]!.result, settingClaims: claims } }])).not.toBe(baseline);
    // Membership: a missing unit, and the same results under a different ordinal.
    expect(unitSetDigest([CLOSED[0]!])).not.toBe(baseline);
    expect(unitSetDigest([CLOSED[0]!, { unitOrdinal: 4, result: { ...CLOSED[1]!.result, unitOrdinal: 4 } }])).not.toBe(baseline);
    // Structure: two items that cite one block are not two items that cite two, because the unit's
    // cited-blocks list is one entry shorter and both items index into position 1.
    const shared = { ...CLOSED[0]!.result, settingClaims: CLOSED[0]!.result.settingClaims.map((claim) => ({ ...claim, sourceRanges: [range(BLOCK_A)] })) };
    expect(unitSetDigest([{ unitOrdinal: 1, result: shared }, CLOSED[1]!])).not.toBe(baseline);
    // Permuting which identity sits in which slot is not a structural difference: the indices are
    // positions in citation order, so this is the same set under a second minting.
    expect(unitSetDigest([{ unitOrdinal: 1, result: unitResult(1, [BLOCK_B, BLOCK_A], '合成人物甲') }, CLOSED[1]!])).toBe(baseline);
    // Structure: one more citation of an already-cited block changes what the message lists.
    const extra = {
      ...CLOSED[0]!.result,
      relationships: [{ subject: '合成人物甲', object: '合成之城', relation: '抵达', sourceRanges: [range(BLOCK_A), range(BLOCK_B)] }],
    };
    expect(unitSetDigest([{ unitOrdinal: 1, result: extra }, CLOSED[1]!])).not.toBe(baseline);
  });
});

describe('parseCrossUnitResult (Baseline Cross-Unit Reduction Contract v1)', () => {
  it('accepts a conforming result, canonicalizes it, and digests it', () => {
    const parsed = parseCrossUnitResult(JSON.stringify(validResult()), EXPECTED);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.findings).toHaveLength(1);
    expect(parsed.result.findings[0]!.sides.map((side) => side.unitOrdinal)).toEqual([1, 3]);
    expect(parsed.result.notes).toEqual(['合成备注：其余单元未提及该设定。']);
    expect(parsed.digest).toMatch(DIGEST_PATTERN);
    expect(parsed.digest).toBe(createHash('sha256').update(parsed.canonicalJson).digest('hex'));
    const reordered = parseCrossUnitResult(JSON.stringify(Object.fromEntries(Object.entries(validResult()).reverse())), EXPECTED);
    expect(reordered.ok && reordered.digest).toBe(parsed.digest);
  });

  it('accepts a JSON code fence and every one of the four finding kinds', () => {
    expect(parseCrossUnitResult(`\`\`\`json\n${JSON.stringify(validResult())}\n\`\`\``, EXPECTED).ok).toBe(true);
    for (const kind of CROSS_UNIT_FINDING_KINDS) {
      const body = validResult();
      (body.findings as Array<{ kind: string }>)[0]!.kind = kind;
      expect(parseCrossUnitResult(JSON.stringify(body), EXPECTED).ok).toBe(true);
    }
  });

  it('refuses a response that is not JSON', () => {
    expect(parseCrossUnitResult('这不是 JSON', EXPECTED)).toEqual({ ok: false, code: 'not-json', detail: '模型输出不是 JSON。' });
  });

  it('refuses every shape the schema does not admit', () => {
    const refuse = (mutate: (body: Record<string, unknown>) => void) => {
      const body = validResult();
      mutate(body);
      return parseCrossUnitResult(JSON.stringify(body), EXPECTED);
    };
    expect(refuse((body) => { body.extra = 1; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { delete body.notes; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { body.schema = 'other/1'; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { body.notes = [42]; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { (body.findings as Array<{ kind: string }>)[0]!.kind = 'plot-hole'; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { (body.findings as Array<{ confidence: string }>)[0]!.confidence = 'certain'; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { (body.findings as Array<{ description: string }>)[0]!.description = ''; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    // 400 graphemes is the bound; 401 is not.
    expect(refuse((body) => { (body.findings as Array<{ description: string }>)[0]!.description = '合'.repeat(400); }).ok).toBe(true);
    expect(refuse((body) => { (body.findings as Array<{ description: string }>)[0]!.description = '合'.repeat(401); })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { body.findings = Array.from({ length: 201 }, () => (validResult().findings as unknown[])[0]); }))
      .toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('refuses a finding that does not span two distinct units of the set', () => {
    const single = validResult();
    (single.findings as Array<{ sides: unknown[] }>)[0]!.sides = [{ unitOrdinal: 1, sourceRanges: [range(BLOCK_A)] }];
    expect(parseCrossUnitResult(JSON.stringify(single), EXPECTED)).toMatchObject({ ok: false, code: 'schema-invalid' });
    const sameUnit = validResult();
    (sameUnit.findings as Array<{ sides: unknown[] }>)[0]!.sides = [
      { unitOrdinal: 1, sourceRanges: [range(BLOCK_A)] },
      { unitOrdinal: 1, sourceRanges: [range(BLOCK_B)] },
    ];
    expect(parseCrossUnitResult(JSON.stringify(sameUnit), EXPECTED)).toMatchObject({ ok: false, code: 'schema-invalid' });
    const tooMany = validResult();
    (tooMany.findings as Array<{ sides: unknown[] }>)[0]!.sides = Array.from({ length: 9 }, (_item, index) => ({
      unitOrdinal: index % 2 === 0 ? 1 : 3, sourceRanges: [],
    }));
    expect(parseCrossUnitResult(JSON.stringify(tooMany), EXPECTED)).toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('refuses a side on a unit outside the closed set', () => {
    const outside = validResult();
    (outside.findings as Array<{ sides: Array<{ unitOrdinal: number }> }>)[0]!.sides[1]!.unitOrdinal = 2;
    expect(parseCrossUnitResult(JSON.stringify(outside), EXPECTED)).toMatchObject({ ok: false, code: 'unit-out-of-set' });
  });

  it('refuses a source range the cited unit never listed', () => {
    const outside = validResult();
    (outside.findings as Array<{ sides: Array<{ sourceRanges: unknown[] }> }>)[0]!.sides[0]!.sourceRanges = [range(BLOCK_D)];
    expect(parseCrossUnitResult(JSON.stringify(outside), EXPECTED)).toMatchObject({ ok: false, code: 'range-out-of-unit' });
    const malformed = validResult();
    (malformed.findings as Array<{ sides: Array<{ sourceRanges: unknown[] }> }>)[0]!.sides[0]!.sourceRanges = [range(BLOCK_B, 5, 2)];
    expect(parseCrossUnitResult(JSON.stringify(malformed), EXPECTED)).toMatchObject({ ok: false, code: 'schema-invalid' });
    const unknownBlock = validResult();
    (unknownBlock.findings as Array<{ sides: Array<{ sourceRanges: unknown[] }> }>)[0]!.sides[0]!.sourceRanges = [range('blk_zzz')];
    expect(parseCrossUnitResult(JSON.stringify(unknownBlock), EXPECTED)).toMatchObject({ ok: false, code: 'schema-invalid' });
  });
});
