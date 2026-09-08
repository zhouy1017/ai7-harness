import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ASSURANCE_DISPOSITIONS,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  ASSURANCE_SAMPLING_RESULT_SCHEMA,
  assuranceSampleDigest,
  assuranceSamplingRequestDigest,
  buildAssuranceSamplingMessage,
  parseAssuranceSamplingMessageHeader,
  parseAssuranceSamplingResult,
  type AssuranceSamplingCandidate,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import { BASELINE_PROMPT_CONTRACT } from '../../src/service/analysis/contract.js';
import type { CoverageManifestUnitProjection } from '../../src/shared/protocol.js';

const BLOCK_A = `blk_${'a'.repeat(24)}`;
const BLOCK_B = `blk_${'b'.repeat(24)}`;
const BLOCK_C = `blk_${'c'.repeat(24)}`;
const UNIT_DIGEST = 'd'.repeat(64);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const BLOCKS = new Map([
  [BLOCK_A, { blockId: BLOCK_A, kind: 'heading' as const, level: 1, text: '合成标题' }],
  [BLOCK_B, { blockId: BLOCK_B, kind: 'paragraph' as const, level: null, text: '合成正文第一段。' }],
  [BLOCK_C, { blockId: BLOCK_C, kind: 'paragraph' as const, level: null, text: '合成重叠上下文段落。' }],
]);

function unit(overlap: string[] = []): CoverageManifestUnitProjection {
  return {
    ordinal: 2,
    sectionOrdinal: 1,
    subUnitIndex: 2,
    subUnitCount: 3,
    headingBlockId: BLOCK_A,
    headingText: '合成标题',
    headingLevel: 1,
    startPosition: 2,
    endPosition: 3,
    blockIds: [BLOCK_A, BLOCK_B],
    blockDigests: ['1'.repeat(64), '2'.repeat(64)],
    overlapBlockIds: overlap,
    graphemes: 12,
    digest: UNIT_DIGEST,
  };
}

const FINDINGS: ReadonlyArray<AssuranceSamplingCandidate> = [
  { ref: '0', unitOrdinal: 2, tier: 'medium', text: '合成发现一：两处对同一设定的说法不一致。' },
  { ref: 'fnd_0123456789abcdef01234567', unitOrdinal: 2, tier: 'A', text: '合成发现二：该断言引用了本单元的一处内容。' },
];

function validResult(): Record<string, unknown> {
  return {
    schema: ASSURANCE_SAMPLING_RESULT_SCHEMA,
    dispositions: [
      { ref: '0', disposition: '成立', reason: '本单元内容块按原样支持该发现。' },
      { ref: 'fnd_0123456789abcdef01234567', disposition: '需降级', reason: '内容块只支持较弱的说法。' },
    ],
  };
}

const EXPECTED = { refs: FINDINGS.map((finding) => finding.ref) };

describe('the Assurance Sampling Contract v1 message', () => {
  it('opens with a header naming the anchor unit, its digest, and the sampled set', () => {
    const message = buildAssuranceSamplingMessage(unit(), 8, BLOCKS, FINDINGS);
    const sampleDigest = assuranceSampleDigest(FINDINGS);
    expect(message.split('\n')[0]).toBe(`保证抽样 2/8 · 单元摘要 ${UNIT_DIGEST} · 抽样摘要 ${sampleDigest}`);
    expect(parseAssuranceSamplingMessageHeader(message)).toEqual({ unitOrdinal: 2, totalUnits: 8, unitDigest: UNIT_DIGEST, sampleDigest });
    expect(message).toContain(ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction);
    // Never a second system prompt, and never another contract's header.
    expect(parseAssuranceSamplingMessageHeader(`分析单元 2/8 · 单元摘要 ${UNIT_DIGEST}`)).toBeNull();
    expect(parseAssuranceSamplingMessageHeader(`跨单元归纳 2/8 · 单元集摘要 ${UNIT_DIGEST}`)).toBeNull();
    expect(parseAssuranceSamplingMessageHeader(`保证抽样 0/8 · 单元摘要 ${UNIT_DIGEST} · 抽样摘要 ${sampleDigest}`)).toBeNull();
  });

  it('carries the anchor unit’s blocks exactly as the unit contract writes them, overlap first', () => {
    const contract = ASSURANCE_SAMPLING_PROMPT_CONTRACT;
    // The block-line format is the unit contract's, character for character; only the section
    // headers around it are this contract's own.
    expect(contract.blockLine).toBe(BASELINE_PROMPT_CONTRACT.blockLine);
    const lines = buildAssuranceSamplingMessage(unit([BLOCK_C]), 8, BLOCKS, FINDINGS).split('\n');
    expect(lines.indexOf(contract.overlapHeader)).toBeGreaterThan(0);
    expect(lines[lines.indexOf(contract.overlapHeader) + 1]).toBe(`[${BLOCK_C}] (paragraph) 合成重叠上下文段落。`);
    expect(lines.slice(lines.indexOf(contract.ownHeader) + 1, lines.indexOf(contract.findingHeader))).toEqual([
      `[${BLOCK_A}] (heading h1) 合成标题`,
      `[${BLOCK_B}] (paragraph) 合成正文第一段。`,
    ]);
    // A unit with no overlap block names no overlap section at all.
    expect(buildAssuranceSamplingMessage(unit(), 8, BLOCKS, FINDINGS)).not.toContain(contract.overlapHeader);
  });

  it('lists every sampled finding with its ref and tier, and leaves no placeholder behind', () => {
    const message = buildAssuranceSamplingMessage(unit(), 8, BLOCKS, FINDINGS);
    expect(message.split('\n').slice(-2)).toEqual([
      '- [0]（medium）合成发现一：两处对同一设定的说法不一致。',
      '- [fnd_0123456789abcdef01234567]（A）合成发现二：该断言引用了本单元的一处内容。',
    ]);
    expect(message).not.toMatch(/\{[a-zA-Z]+\}/u);
  });
});

describe('the assurance sampling request digest', () => {
  it('is a pure function of the frozen contract, the anchor unit, its content digest, and the listed set', () => {
    expect(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST).toMatch(DIGEST_PATTERN);
    const sampleDigest = assuranceSampleDigest(FINDINGS);
    const digest = assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 2, UNIT_DIGEST, sampleDigest);
    expect(digest).toMatch(DIGEST_PATTERN);
    expect(assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 2, UNIT_DIGEST, sampleDigest)).toBe(digest);
    // Every part of the key moves it: the unit, its blocks, and the findings listed.
    expect(assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 3, UNIT_DIGEST, sampleDigest)).not.toBe(digest);
    expect(assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 2, 'e'.repeat(64), sampleDigest)).not.toBe(digest);
    expect(assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 2, UNIT_DIGEST, assuranceSampleDigest([FINDINGS[0]!]))).not.toBe(digest);
    expect(() => assuranceSamplingRequestDigest('not-a-digest', 2, UNIT_DIGEST, sampleDigest)).toThrow('ANALYSIS_REQUEST_DIGEST_INVALID');
    expect(() => assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 0, UNIT_DIGEST, sampleDigest)).toThrow('ANALYSIS_REQUEST_DIGEST_INVALID');
  });

  /**
   * The half a fixture depends on. Every identity in play is minted per import — a committed block
   * identity, and with it the factual kind's `findingId`, which is derived from one — so the digest
   * names none: it is taken over the manifest unit's own content digest and over the findings' texts
   * at their listed positions, both of which survive a re-import of the same manuscript.
   */
  it('is a function of text and position alone, so it survives a fresh minting of the same manuscript', () => {
    const sampleDigest = assuranceSampleDigest(FINDINGS);
    expect(sampleDigest).toMatch(DIGEST_PATTERN);
    // The same findings under freshly minted refs are the same turn to a fixture.
    expect(assuranceSampleDigest(FINDINGS.map((finding, index) => ({ ...finding, ref: `fnd_${String(index).repeat(24)}` })))).toBe(sampleDigest);
    // The tier is not part of it either: it labels a finding, and a re-tiered finding is the same claim.
    expect(assuranceSampleDigest(FINDINGS.map((finding) => ({ ...finding, tier: 'low' })))).toBe(sampleDigest);
    // What is part of it: the text of every listed finding, its position, and the size of the listing.
    expect(assuranceSampleDigest([...FINDINGS].reverse())).not.toBe(sampleDigest);
    expect(assuranceSampleDigest(FINDINGS.map((finding) => ({ ...finding, text: `${finding.text}（已改）` })))).not.toBe(sampleDigest);
    expect(assuranceSampleDigest([FINDINGS[0]!])).not.toBe(sampleDigest);
  });
});

describe('parseAssuranceSamplingResult (Assurance Sampling Contract v1)', () => {
  it('accepts a conforming result, canonicalizes it, and digests it', () => {
    const parsed = parseAssuranceSamplingResult(JSON.stringify(validResult()), EXPECTED);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.dispositions.map((entry) => [entry.ref, entry.disposition])).toEqual([
      ['0', '成立'],
      ['fnd_0123456789abcdef01234567', '需降级'],
    ]);
    expect(parsed.digest).toBe(createHash('sha256').update(parsed.canonicalJson).digest('hex'));
    expect(parseAssuranceSamplingResult(`\`\`\`json\n${JSON.stringify(validResult())}\n\`\`\``, EXPECTED).ok).toBe(true);
    for (const disposition of ASSURANCE_DISPOSITIONS) {
      const body = validResult();
      for (const entry of body.dispositions as Array<{ disposition: string }>) entry.disposition = disposition;
      expect(parseAssuranceSamplingResult(JSON.stringify(body), EXPECTED).ok).toBe(true);
    }
  });

  it('refuses a response that is not JSON', () => {
    expect(parseAssuranceSamplingResult('这不是 JSON', EXPECTED)).toEqual({ ok: false, code: 'not-json', detail: '模型输出不是 JSON。' });
  });

  it('refuses every shape the schema does not admit', () => {
    const refuse = (mutate: (body: Record<string, unknown>) => void) => {
      const body = validResult();
      mutate(body);
      return parseAssuranceSamplingResult(JSON.stringify(body), EXPECTED);
    };
    expect(refuse((body) => { body.extra = 1; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { body.schema = 'other/1'; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { delete body.dispositions; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { (body.dispositions as Array<{ disposition: string }>)[0]!.disposition = '存疑'; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { (body.dispositions as Array<{ reason: string }>)[0]!.reason = ''; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(refuse((body) => { (body.dispositions as Array<Record<string, unknown>>)[0]!.note = 1; })).toMatchObject({ ok: false, code: 'schema-invalid' });
    // 200 graphemes is the bound; 201 is not.
    expect(refuse((body) => { (body.dispositions as Array<{ reason: string }>)[0]!.reason = '合'.repeat(200); }).ok).toBe(true);
    expect(refuse((body) => { (body.dispositions as Array<{ reason: string }>)[0]!.reason = '合'.repeat(201); })).toMatchObject({ ok: false, code: 'schema-invalid' });
    // One finding, two dispositions: a malformed array, not an unlisted finding.
    expect(refuse((body) => { const list = body.dispositions as Array<Record<string, unknown>>; list[1] = { ...list[0]! }; }))
      .toMatchObject({ ok: false, code: 'schema-invalid' });
  });

  it('refuses a disposition on a finding this turn never listed', () => {
    const outside = validResult();
    (outside.dispositions as Array<{ ref: string }>)[1]!.ref = '7';
    expect(parseAssuranceSamplingResult(JSON.stringify(outside), EXPECTED)).toMatchObject({ ok: false, code: 'ref-out-of-sample' });
  });

  it('refuses a result that leaves a listed finding unjudged', () => {
    const short = validResult();
    (short.dispositions as unknown[]).pop();
    expect(parseAssuranceSamplingResult(JSON.stringify(short), EXPECTED)).toMatchObject({ ok: false, code: 'disposition-missing' });
    expect(parseAssuranceSamplingResult(JSON.stringify({ schema: ASSURANCE_SAMPLING_RESULT_SCHEMA, dispositions: [] }), EXPECTED))
      .toMatchObject({ ok: false, code: 'disposition-missing' });
  });
});
