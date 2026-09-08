import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  MAX_RUN_REPORT_REFLECTION_ITEMS,
  RUN_REPORT_REFLECTION_PROMPT_CONTRACT,
  RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST,
  RUN_REPORT_REFLECTION_RESULT_SCHEMA,
  buildRunReportReflectionMessage,
  parseRunReportReflectionMessageHeader,
  parseRunReportReflectionResult,
  runReportReflectionRequestDigest,
} from '../../src/service/analysis/run-report-contract.js';
import { ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/assurance-sampling-contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/cross-unit-contract.js';
import {
  runReportAccounting,
  runReportAccountingDigest,
  type RunReportAccounting,
  type RunReportFacts,
} from '../../src/service/analysis/run-report.js';
import type { AnalysisAssuranceSampleProjection } from '../../src/shared/protocol.js';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const RUN_RECORD_ID = '3f2b7a10-9c41-4d8e-b6a2-5e1c0d7f4a88';

/**
 * The block texts and finding texts of a synthetic Run. Nothing in this list may ever appear in a
 * reflection message: the whole point of the contract is that the model is handed counts and codes.
 */
const MANUSCRIPT_TEXTS = [
  '合成标题',
  '合成正文第一段：人物甲抵达合成之城。',
  '合成重叠上下文段落。',
];
const FINDING_TEXTS = [
  '合成时序冲突：单元 1 把人物甲抵达合成之城记为开端，单元 3 让人物乙回望该城却不给出时序。',
  '合成连续性断裂：单元 1 让人物甲抵达之后，单元 3 未交代人物甲的去向。',
  '「合成引文」这条断言是否成立？',
];

const SAMPLE: AnalysisAssuranceSampleProjection = {
  state: 'closed',
  seed: 's'.repeat(64),
  size: 2,
  candidateCount: 2,
  strata: [{ sectionOrdinal: 1, candidates: 2, sampled: 2 }],
  dispositions: [
    { ref: '0', unitOrdinal: 1, tier: 'medium', disposition: '成立', reason: FINDING_TEXTS[0]! },
    { ref: '1', unitOrdinal: 3, tier: 'low', disposition: '需降级', reason: FINDING_TEXTS[1]! },
  ],
  precision: [
    { tier: 'low', sampled: 1, upheld: 0, estimate: 0 },
    { tier: 'medium', sampled: 1, upheld: 1, estimate: 1 },
  ],
  usage: { inputTokens: 300, outputTokens: 40 },
  reason: null,
};

function facts(): RunReportFacts {
  return {
    runRecordId: RUN_RECORD_ID,
    taskIntentId: 'e0d4b1c2-5a37-4f19-8c6b-2d9e7f3a1b04',
    attemptId: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    resultSetRevisionId: 'b7c8d9e0-1f23-4a56-b789-0c1d2e3f4a5b',
    classification: 'completed-with-gaps',
    recordedAt: '2026-09-09T00:00:10.000Z',
    spans: new Map([['units', { startedAt: '2026-09-09T00:00:00.000Z', settledAt: '2026-09-09T00:00:00.500Z', wallMs: 500 }]]),
    usage: {
      units: { requests: 3, inputTokens: 300, outputTokens: 60 },
      'cross-unit-reduction': { requests: 1, inputTokens: 200, outputTokens: 30 },
      'assurance-sampling': { requests: 1, inputTokens: 300, outputTokens: 40 },
    },
    unitRows: [
      { unitOrdinal: 1, state: 'closed', lineage: 'recomputed', attempts: 1, wallMs: 40, usage: { inputTokens: 100, outputTokens: 20 }, gapCode: null },
      { unitOrdinal: 2, state: 'gap', lineage: 'recomputed', attempts: 1, wallMs: 30, usage: null, gapCode: 'contract-invalid' },
    ],
    submitted: 2,
    adaptations: [{ unitOrdinal: 2, classifiedReason: '瞬时故障，可安全重试。', recordedAt: '2026-09-09T00:00:00.400Z' }],
    gaps: [{ unitOrdinal: 2, code: 'contract-invalid', reason: '单元结果不符合契约 v1。', startPosition: 2, endPosition: 3, blockIds: [] }],
    crossUnit: { state: 'closed', reason: null },
    sample: SAMPLE,
    findingCounts: [
      { kind: 'cross-unit-finding:chronology-conflict', count: 1 },
      { kind: 'cross-unit-finding:continuity-break', count: 1 },
    ],
    terminalFailure: null,
  };
}

const ACCOUNTING: RunReportAccounting = runReportAccounting(facts());

function validResult(items: Array<{ suggestion: string; basis: string }>): string {
  return JSON.stringify({ schema: RUN_REPORT_REFLECTION_RESULT_SCHEMA, items });
}

const ITEM = { suggestion: '下次运行提高单元预算，并对以契约不符合闭合的单元单独重试一次。', basis: '本次 2 个提交单元中有 1 个以 contract-invalid 闭合，计划内调整 1 次。' };

describe('Run Report reflection contract v1', () => {
  it('freezes the prompt contract and digests it', () => {
    expect(RUN_REPORT_REFLECTION_PROMPT_CONTRACT.contractVersion).toBe('ai7.analysis.run-report-reflection/1');
    expect(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST).toMatch(DIGEST_PATTERN);
    expect(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST).toBe(sha256Hex(canonicalJson(RUN_REPORT_REFLECTION_PROMPT_CONTRACT)));
    // A fourth contract, and a fourth key space: no digest of the three existing ones is reused.
    expect(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST).not.toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST);
    expect(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST).not.toBe(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST);
  });

  it('builds a message whose header names the Run and the accounting it carries', () => {
    const message = buildRunReportReflectionMessage(RUN_RECORD_ID, ACCOUNTING);
    const header = parseRunReportReflectionMessageHeader(message)!;
    expect(header.runRecordId).toBe(RUN_RECORD_ID);
    expect(header.accountingDigest).toBe(runReportAccountingDigest(ACCOUNTING));
    // The bytes the digest was taken over are the bytes the message carries.
    expect(message).toContain(canonicalJson(ACCOUNTING));
    expect(message).toContain(RUN_REPORT_REFLECTION_PROMPT_CONTRACT.instruction);
  });

  it('carries no manuscript text and no finding text', () => {
    const message = buildRunReportReflectionMessage(RUN_RECORD_ID, ACCOUNTING);
    for (const text of MANUSCRIPT_TEXTS) expect(message).not.toContain(text);
    for (const text of FINDING_TEXTS) expect(message).not.toContain(text);
    // Not even the disposition reasons the sample recorded, which are model output over the findings.
    for (const entry of SAMPLE.dispositions) expect(message).not.toContain(entry.reason);
    // What it does carry is counts, codes, and class names.
    expect(message).toContain('cross-unit-finding:chronology-conflict');
    expect(message).toContain('contract-invalid');
  });

  it('reads no other contract message as its own', () => {
    expect(parseRunReportReflectionMessageHeader('保证抽样 2/8 · 单元摘要 ' + 'd'.repeat(64) + ' · 抽样摘要 ' + 'e'.repeat(64))).toBeNull();
    expect(parseRunReportReflectionMessageHeader('')).toBeNull();
    expect(parseRunReportReflectionMessageHeader(`运行反思 ${RUN_RECORD_ID} · 账目摘要 短`)).toBeNull();
  });

  it('keys the turn by the frozen contract and the accounting alone', () => {
    const digest = runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, runReportAccountingDigest(ACCOUNTING));
    expect(digest).toMatch(DIGEST_PATTERN);
    // The Run Record identity is minted per Run and is deliberately not part of the key, so the same
    // accounting resolves the same fixture entry on every import and every replay.
    const other = buildRunReportReflectionMessage('11111111-2222-4333-8444-555555555555', ACCOUNTING);
    expect(parseRunReportReflectionMessageHeader(other)!.accountingDigest).toBe(runReportAccountingDigest(ACCOUNTING));
    // A moved count moves the key.
    const moved = runReportAccountingDigest(runReportAccounting({ ...facts(), submitted: 3 }));
    expect(runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, moved)).not.toBe(digest);
    expect(() => runReportReflectionRequestDigest('short', runReportAccountingDigest(ACCOUNTING))).toThrowError(/ANALYSIS_REQUEST_DIGEST_INVALID/u);
    expect(() => runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, 'short')).toThrowError(/ANALYSIS_REQUEST_DIGEST_INVALID/u);
  });

  it('accepts a well-formed answer, fenced or bare', () => {
    const parsed = parseRunReportReflectionResult(validResult([ITEM]));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.result.items).toEqual([ITEM]);
    expect(parsed.ok && parsed.digest).toMatch(DIGEST_PATTERN);
    const fenced = parseRunReportReflectionResult('```json\n' + validResult([ITEM]) + '\n```');
    expect(fenced.ok && fenced.canonicalJson).toBe(parsed.ok ? parsed.canonicalJson : null);
    // An empty list is a valid answer: a Run the model has nothing to say about is not a failure.
    expect(parseRunReportReflectionResult(validResult([])).ok).toBe(true);
  });

  it('refuses anything the contract does not describe', () => {
    expect(parseRunReportReflectionResult('not json at all')).toMatchObject({ ok: false, code: 'not-json' });
    expect(parseRunReportReflectionResult(JSON.stringify({ schema: RUN_REPORT_REFLECTION_RESULT_SCHEMA }))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseRunReportReflectionResult(JSON.stringify({ schema: RUN_REPORT_REFLECTION_RESULT_SCHEMA, items: [], extra: 1 }))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseRunReportReflectionResult(JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1', items: [] }))).toMatchObject({ ok: false, code: 'schema-invalid' });
    // More than ten items is past the bound ADR 0066 states.
    const eleven = Array.from({ length: MAX_RUN_REPORT_REFLECTION_ITEMS + 1 }, () => ITEM);
    expect(parseRunReportReflectionResult(validResult(eleven))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseRunReportReflectionResult(validResult(eleven.slice(1)))).toMatchObject({ ok: true });
    // Each field is bounded in graphemes and must not be blank.
    expect(parseRunReportReflectionResult(validResult([{ suggestion: '多'.repeat(201), basis: '依据。' }]))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseRunReportReflectionResult(validResult([{ suggestion: '做法。', basis: '据'.repeat(201) }]))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseRunReportReflectionResult(validResult([{ suggestion: '   ', basis: '依据。' }]))).toMatchObject({ ok: false, code: 'schema-invalid' });
    expect(parseRunReportReflectionResult(validResult([{ suggestion: '做法。', basis: '' }]))).toMatchObject({ ok: false, code: 'schema-invalid' });
    // 200 graphemes exactly is inside the bound.
    expect(parseRunReportReflectionResult(validResult([{ suggestion: '多'.repeat(200), basis: '依据。' }]))).toMatchObject({ ok: true });
  });
});
