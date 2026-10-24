import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { checkLocalPlan, candidateHasExactAnchor } from '../../src/service/review/deterministic/checker.js';
import { freezeLocalPlan, validateLocalPlan } from '../../src/service/review/deterministic/plan.js';
import { localCheckProcedureDefinition } from '../../src/service/procedures/preinstalled.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import type { LocalCheckOptions } from '../../src/shared/protocol/procedures.js';

// Issue #1119: authored synthetic predicate examples, never copied from a standard or a manuscript.
const OPTIONS: LocalCheckOptions = { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [] };
const id = (index: number): string => `blk_${index.toString(16).padStart(24, '0')}`;
function plan(texts: string[], options: Partial<LocalCheckOptions> = {}, scope: 'whole' | 'selection' = 'whole') {
  const definition = localCheckProcedureDefinition();
  return freezeLocalPlan({ procedure: { procedureId: definition.id, version: 1, digest: sha256Hex(canonicalJson(definition)) },
    source: { manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(), journalSequence: 0, workingDigest: 'a'.repeat(64) },
    bookImportId: null, scope, options: { ...OPTIONS, ...options }, blocks: texts.map((text, index) => ({ blockId: id(index + 1), position: index + 1, text })) });
}
const numeric: Partial<LocalCheckOptions> = { numerals: 'national-standard', publication: 'within-scope', numeralRules: ['N01', 'N02'], numeralsConfirmed: true };
async function counts(texts: string[], options: Partial<LocalCheckOptions> = {}, scope: 'whole' | 'selection' = 'whole') {
  const result = await checkLocalPlan(plan(texts, options, scope));
  return result.candidates.map((candidate) => candidate.ruleId);
}
describe('local punctuation and numeral predicates', () => {
  it('accepts nested and continued quotation and reports one crossing without a cascade', async () => {
    expect(await counts(['她写道：“清点（蓝卡）后再走。”', '她说：“把‘蓝卡’收好。”', '“先记下灯色。', '“再关上小门。”'])).toEqual([]);
    expect(await counts(['她写道：“清点（蓝卡”）'])).toEqual(['P01']);
    expect(await counts(['她写道：“清点（蓝卡”', '）'])).toEqual(['P01']);
    expect(await counts(['她写道：“清点（‘蓝卡”', '’）'])).toEqual(['P01']);
    expect(await counts(['记录（待补。'])).toEqual(['P01']);
    expect(await counts(['记录（待补。'], {}, 'selection')).toEqual([]);
    expect(await counts(['记录（`专用字段`待补。'])).toEqual([]);
  });
  it('recognizes only Unicode ellipsis lengths and skips leaders and undeclared doubled forms', async () => {
    expect(await counts(['他停住了…又望向门口。', '她没有回答……', '后来………………', '小节……37', '真的吗……？', 'ASCII ...'])).toEqual(['P02', 'P02']);
    const result = await checkLocalPlan(plan(['…………'], { doubledEllipsisBlockIds: [id(1)] }));
    expect(result.candidates.length).toBe(0); expect(result.counts.P02.noFinding).toBe(1);
    expect((await checkLocalPlan(plan(['…………']))).counts.P02.skipped).toBe(1);
  });
  it('requires adjacent complete consecutive equally indented list paragraphs', async () => {
    expect(await counts(['（6）、核对蓝卡。', '（7）、封好纸袋。', '（8）、收起纸箱。'])).toEqual(['P03', 'P03', 'P03']);
    expect(await counts(['（6）核对蓝卡。', '（7）封好纸袋。', '2.4 小门', '第七章 小门', '“（6）、”是讨论对象。'])).toEqual([]);
    expect(await counts(['（6）、核对蓝卡。'])).toEqual([]);
    expect(await counts(['（6）、核对蓝卡。', '  （7）、封好纸袋。'])).toEqual([]);
  });
  it('keeps numeral applicability and affirmative editor convention distinct', async () => {
    const text = ['比例为.37%。', '比例为17～29%。', '预算为3—6万元。'];
    expect(await counts(text)).toEqual([]);
    expect(await counts(text, numeric)).toEqual(['N01', 'N02', 'N02']);
    for (const publication of ['unknown', 'literary', 'reprinted-classic'] as const) {
      const result = await checkLocalPlan(plan(text, { ...numeric, publication }));
      expect(result.candidates.length).toBe(0); expect(result.counts.N01.outOfApplicability).toBe(3);
    }
    const result = await checkLocalPlan(plan(text, { ...numeric, publication: 'literary', numerals: 'editor-convention' }));
    expect(result.candidates.every((candidate) => candidate.basis === 'editor-convention')).toBe(true);
    expect(await counts(['比例为0.37%。', '比例为17%～29%。', '预算为3万元—6万元。', '页码32—47页', '编号A3—6', '2026-03', '.37', '版本v.37', '数值12345'], numeric)).toEqual([]);
    expect(await counts(['β.37%', '𝛽.37%', '−3—6万元', 'A3—6万元', 'v.37%', '路径C:\\.37%'], numeric)).toEqual([]);
  });
  it('excludes fences, inline code, URLs, email and explicit foreign/technical ranges', async () => {
    expect(await counts(['```text', '标点… .37%', '```', '`待核… .37%`', 'https://host.invalid/…/.37%', 'www.host.invalid/…', 'name.37%@host.invalid', '~~~', '不闭合…'], numeric)).toEqual([]);
    expect(await counts(['外语…'], { excludedRanges: [{ blockId: id(1), from: 0, to: 3, reason: 'foreign' }] })).toEqual([]);
    expect(await counts(['`未闭合… .37%'], numeric)).toEqual([]);
  });
  it('anchors repeated text by exact grapheme offsets through astral and combining characters', async () => {
    const frozen = plan(['🟦e\u0301甲…乙…']); const result = await checkLocalPlan(frozen);
    expect(result.candidates.map((candidate) => [candidate.from, candidate.to])).toEqual([[3, 4], [5, 6]]);
    expect(result.candidates.every((candidate) => candidateHasExactAnchor(frozen, candidate))).toBe(true);
    expect(candidateHasExactAnchor(frozen, { ...result.candidates[0]!, to: 1000 })).toBe(false);
  });
  it('rejects plan drift and observes cooperative cancellation within a long paragraph', async () => {
    const frozen = plan(['本地检查…']);
    expect(() => validateLocalPlan({ ...frozen, options: { ...frozen.options, numerals: 'editor-convention' } })).toThrow();
    let checkpoints = 0;
    await expect(checkLocalPlan(plan(['甲'.repeat(10000)]), { checkpoint: async () => { checkpoints++; }, cancelled: () => checkpoints > 2 })).rejects.toMatchObject({ code: 'LOCAL_CHECK_CANCELLED' });
    expect(checkpoints).toBe(3);
  });
  it('observes cancellation during dense matching, before results can be materialized', async () => {
    let cancelled = false; let matchYield = false;
    await expect(checkLocalPlan(plan(['甲…'.repeat(2000)]), { cancelled: () => cancelled,
      checkpoint: async (phase) => { if (phase === 'matches') { matchYield = true; cancelled = true; } },
    })).rejects.toMatchObject({ code: 'LOCAL_CHECK_CANCELLED' });
    expect(matchYield).toBe(true);
  });
});
