import { reviewSynthesisOmissionLabel, reviewSynthesisOrdinalRanges } from '../../src/shared/review-synthesis-wording.js';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildSynthesisInput, synthesisMessage, parseSynthesisSummary, type SynthesisFinding } from '../../src/service/review/run-synthesis-contract.js';
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
    expect(Buffer.byteLength(synthesisMessage(input), 'utf8')).toBeLessThanOrEqual(4096);
    expect(input.omitted.findings + input.omitted.synopses).toBeGreaterThan(0);
    const refs = new Set(input.evidence.map((entry) => entry.ref));
    expect(input.clusters.every((cluster) => cluster.evidenceRefs.every((ref) => refs.has(ref)))).toBe(true);
    expect(input.findings.every((finding) => finding.evidenceRefs.every((ref) => refs.has(ref)))).toBe(true);
  });
});


it.each([[300, 40], [300, 120], [150, 200]])('keeps every cluster citable and baseline represented for %i findings with %i-character notes (#1433 R2)', (count, length) => {
  const source = Array.from({ length: count }, (_, index) => ({ ...findings[index % findings.length]!, findingId: `volume-${index}`,
    note: `${findings[index % findings.length]!.note.repeat(length).slice(0, length - 8)} ${String(index).padStart(7, '0')}` }));
  const input = buildSynthesisInput({ findings: source, missingCategories: [], baseline: { revisionId: 'baseline',
    synopses: Array.from({ length: 40 }, (_, index) => ({ unitOrdinal: index + 1, synopsis: findings[index % findings.length]!.note.repeat(20) })) } });
  expect(Buffer.byteLength(synthesisMessage(input), 'utf8')).toBeLessThanOrEqual(96 * 1024);
  expect(input.baseline!.synopses.length).toBeGreaterThan(0);
  expect(input.clusters.length).toBeGreaterThan(0);
  expect(input.clusters.every(cluster => cluster.evidenceRefs.length > 0 && input.findings.some(finding => finding.ref === cluster.representativeRef) && cluster.evidenceRefs.every(ref => input.evidence.some(evidence => evidence.ref === ref)))).toBe(true);
  expect(input.findings.length).toBeLessThanOrEqual(200);
});

it.each([['```json\n', '\n```'], ['以下是总结：\n', '\n供编辑核对。']])('accepts an assessment wrapped in %s (#1433 R6)', (prefix, suffix) => {
  const input = buildSynthesisInput({ findings, missingCategories: [], baseline: null });
  const parsed = parseSynthesisSummary(prefix + JSON.stringify({ overallAssessment: '先核对跨章反复出现的问题。' }) + suffix, input);
  expect(parsed?.overallAssessment).toBe('先核对跨章反复出现的问题。');
});

it('counts represented duplicates as included and reports only capacity-dropped findings (#1433 re-review 1)', () => {
  const source = Array.from({ length: 17 }, (_, index) => ({ ...findings[0]!, findingId: `duplicate-${index}` }));
  const small = buildSynthesisInput({ findings: source, missingCategories: [], baseline: null });
  expect(small.clusters[0]!.count).toBe(17); expect(small.omitted.findings).toBe(0);
  expect(reviewSynthesisOmissionLabel(small.omitted)).toBeNull();
  const large = buildSynthesisInput({ findings: Array.from({ length: 600 }, (_, index) => ({ ...findings[0]!, findingId: `capacity-${index}`, note: `${index}: ${findings[0]!.note}` })), missingCategories: [], baseline: null });
  expect(large.omitted.findings).toBe(600 - large.clusters.reduce((sum, cluster) => sum + cluster.count, 0));
  expect(large.omitted.findings).toBeGreaterThan(0);
  expect(reviewSynthesisOmissionLabel(large.omitted)).toContain(`${large.omitted.findings} 条发现`);
});
it('fills spare room with round-robin evidence for 600 findings in 21 recurring topics (#1433 re-review 2)', () => {
  const source = Array.from({ length: 600 }, (_, index) => ({ ...findings[0]!, findingId: `recurring-${index}`, categoryId: `category-${index % 2}`,
    note: `问题 ${index % 21}: ${findings[0]!.note}`, chapterOrdinal: index + 1 }));
  const input = buildSynthesisInput({ findings: source, missingCategories: [], baseline: null });
  expect(input.clusters).toHaveLength(42); expect(input.findings).toHaveLength(42); expect(input.evidence).toHaveLength(200);
  expect(input.clusters.every(cluster => cluster.evidenceRefs.length > 1)).toBe(true); expect(input.omitted.findings).toBe(0);
  const sent = JSON.parse(synthesisMessage(input)); expect(sent.evidence.every((entry: { findingRef: string }) => /^f[0-9]+$/.test(entry.findingRef))).toBe(true);
  expect(Buffer.byteLength(synthesisMessage(input))).toBeLessThanOrEqual(96 * 1024);
});
it('clusters on the bounded note and preserves 400-character synopses (#1433 re-review 3)', () => {
  const prefix = findings[0]!.note.repeat(100).slice(0, 80);
  const input = buildSynthesisInput({ findings: Array.from({ length: 30 }, (_, index) => ({ ...findings[0]!, findingId: `bounded-${index}`, note: prefix + index })),
    missingCategories: [], baseline: { revisionId: 'baseline', synopses: [{ unitOrdinal: 1, synopsis: findings[0]!.note.repeat(100) }] } });
  expect(input.findings).toHaveLength(1); expect(input.clusters[0]!.count).toBe(30);
  expect([...input.baseline!.synopses[0]!.synopsis]).toHaveLength(400);
});
it('compresses coverage ordinals without cutting a number (#1433 re-review 4)', () => {
  const label = `未读第 ${reviewSynthesisOrdinalRanges([...Array.from({ length: 37 }, (_, index) => index + 1), 40])} 范围`;
  const input = buildSynthesisInput({ findings, missingCategories: [label], baseline: null });
  expect(input.missingCategories).toEqual(['未读第 1–37、40 范围']);
});

it.each([3, 600])('preserves all 40 baseline units with %i findings, expands into spare room and discloses even shortening (#1433 final additions)', count => {
  const source = Array.from({ length: count }, (_, index) => ({ ...findings[0]!, findingId: `baseline-budget-${index}`,
    note: `${index}: ${findings[0]!.note.repeat(20)}`, quote: findings[0]!.quote.repeat(20) }));
  const input = buildSynthesisInput({ findings: source, missingCategories: [], baseline: { revisionId: 'baseline',
    synopses: Array.from({ length: 40 }, (_, index) => ({ unitOrdinal: index + 1, synopsis: findings[0]!.note.repeat(100) })) } });
  expect(input.baseline!.synopses.map(unit => unit.unitOrdinal)).toEqual(Array.from({ length: 40 }, (_, index) => index + 1));
  expect(input.omitted.synopses).toBe(0);
  expect(Buffer.byteLength(synthesisMessage(input))).toBeLessThanOrEqual(96 * 1024);
  const lengths = input.baseline!.synopses.map(unit => [...unit.synopsis].length);
  expect(new Set(lengths).size).toBe(1);
  if (count === 3) {
    expect(lengths.every(length => length === 400)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(JSON.parse(synthesisMessage(input)).baseline))).toBeGreaterThan(24 * 1024);
    expect(reviewSynthesisOmissionLabel(input.omitted)).toBeNull();
  } else {
    expect(lengths.every(length => length > 0 && length < 400)).toBe(true);
    expect(input.omitted.shortenedSynopses).toBe(40);
    expect(reviewSynthesisOmissionLabel(input.omitted)).toContain('40 段概述已缩短');
    expect(input.clusters.every(cluster => cluster.evidenceRefs.length > 0)).toBe(true);
  }
});
