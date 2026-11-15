import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildSynthesisInput, parseSynthesisSummary, type SynthesisFinding } from '../../src/service/review/run-synthesis-contract.js';
import { runSynthesisKind } from '../../src/service/review/run-synthesis-kind.js';
import { liveKindAdmission } from '../../src/service/analysis/live-kind-admission.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';

// Reuse authored findings from the admitted Public SampleBook; never manufacture manuscript prose.
const fixture = JSON.parse(readFileSync(new URL('../fixtures/model/sample1-review-authored.json', import.meta.url), 'utf8'));
const findings: SynthesisFinding[] = fixture.entries.filter((entry: { unitOrdinal: number }) => entry.unitOrdinal > 0)
  .flatMap((entry: { unitOrdinal: number; response: { text: string } }, index: number) => {
    const result = JSON.parse(entry.response.text);
    return (result.findings ?? []).filter((finding: { note?: string; quote?: string; clauseId?: string }) =>
      typeof finding.note === 'string' && typeof finding.quote === 'string' && typeof finding.clauseId === 'string')
      .map((finding: { note: string; quote: string; clauseId: string; severity: string }, ordinal: number) => ({
      ...finding, findingId: `finding-${index}-${ordinal}`, chapterOrdinal: entry.unitOrdinal,
      chapterLabel: `第 ${entry.unitOrdinal} 章`, categoryId: finding.clauseId.split('/')[0],
    }));
  });

describe('whole-book synthesis contract', () => {
  it('admits the ordinary structured composition and refuses manuscript unit turns or tools', () => {
    const db = new DatabaseSync(':memory:');
    try {
      const binding = { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0]!, credentialReference: '11111111-1111-4111-8111-111111111111' };
      const policy = resolveSourceCheckoutLaunchPolicySync(process.cwd(), 'ordinary-production', binding);
      const definition = runSynthesisKind(db, 'unit-test');
      expect(liveKindAdmission(policy, definition, binding)).not.toBeNull();
      expect(liveKindAdmission(policy, { ...definition, structuredOnly: false }, binding)).toBeNull();
      const parent = policy.providerProcessing.admittedRules.find((rule) => rule.taskKinds.includes('editorial-review/typos-and-usage'))!;
      const tools = { ...policy, providerProcessing: { ...policy.providerProcessing,
        admittedRules: policy.providerProcessing.admittedRules.map((rule) => rule.taskKinds.includes(definition.kind)
          ? { ...rule, localTools: parent.localTools ?? null } : rule) } };
      expect(liveKindAdmission(tools, definition, binding)).toBeNull();
    } finally { db.close(); }
  });
  it('keeps a readable assessment and valid cited items when other model fields are malformed', () => {
    const input = buildSynthesisInput({ findings, missingCategories: [], baseline: null });
    const summary = parseSynthesisSummary(JSON.stringify({ overallAssessment: '先统一数字体例，再逐条核对表达。',
      recurringProblems: [null, { title: '数字体例', explanation: '跨章存在相同问题。', evidenceRefs: ['e1', 'e99999'] },
        { title: '无依据', explanation: '不能采用。', evidenceRefs: ['e99999'] }], contextualExplanations: [null, { explanation: '放回全书脉络后，先保留原发现供编辑判断。', evidenceRefs: ['e1'] }, { explanation: '无依据', evidenceRefs: ['e99999'] }], priorities: [null, '先核对数字体例。'] }), input);
    expect(summary?.overallAssessment).toBe('先统一数字体例，再逐条核对表达。');
    expect(summary?.recurringProblems).toEqual([{ title: '数字体例', explanation: '跨章存在相同问题。', evidenceRefs: ['e1'], priority: '' }]);
    expect(summary?.priorities).toEqual(['先核对数字体例。']);
    expect(summary?.contextualExplanations).toEqual([{ explanation: '放回全书脉络后，先保留原发现供编辑判断。', evidenceRefs: ['e1'] }]);
  });

  it('fits smaller contexts while retaining valid evidence references and disclosing omitted records', () => {
    const input = buildSynthesisInput({ findings, missingCategories: ['事实核查'], baseline: {
      revisionId: 'baseline', synopses: Array.from({ length: 220 }, (_, index) => ({ unitOrdinal: 220 - index, synopsis: findings[index % findings.length]!.note.repeat(40) })),
    } }, 4096);
    expect(Buffer.byteLength(JSON.stringify(input), 'utf8')).toBeLessThanOrEqual(4096);
    expect(input.omitted.findings + input.omitted.synopses).toBeGreaterThan(0);
    const refs = new Set(input.evidence.map((entry) => entry.ref));
    expect(input.clusters.every((cluster) => cluster.evidenceRefs.every((ref) => refs.has(ref)))).toBe(true);
    expect(input.findings.every((finding) => finding.evidenceRefs.every((ref) => refs.has(ref)))).toBe(true);
  });
});
