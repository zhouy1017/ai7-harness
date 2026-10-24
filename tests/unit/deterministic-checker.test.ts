import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { checkLocalPlan, candidateHasExactAnchor, exactLocalCandidateIds, houseCandidateNote, validateLocalResultV2, validateLocalStageArtifactV2,
  type HouseCandidate, type LocalStageArtifactV2 } from '../../src/service/review/deterministic/checker.js';
import { freezeLocalPlan, freezeLocalPlanV2, validateLocalPlan, validateLocalPlanV2 } from '../../src/service/review/deterministic/plan.js';
import { localCheckProcedureDefinition, localCheckProcedureDefinitionV2 } from '../../src/service/procedures/preinstalled.js';
import { HouseWordLists, initializeHouseWordListSchema } from '../../src/service/review/house-word-list.js';
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
    // An opener found unmatched only at the whole-Book end still sorts into frozen block order.
    expect(await counts(['记录（待补。', '他停住了…又望向门口。'])).toEqual(['P01', 'P02']);
    expect(await counts(['记录（`专用字段`待补。'])).toEqual([]);
    // A right single quote with no left single quote open is a possible apostrophe, never an unmatched-closer card.
    const apostrophes = await checkLocalPlan(plan(['她说：“I don’t know.”', '他念：“‘we’re’ 之后。”']));
    expect(apostrophes.candidates).toEqual([]); expect(apostrophes.counts.P01.skipped).toBe(2);
    expect(await counts(['她说：“‘甲（乙’）”'])).toEqual(['P01']);
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
    // Signed endpoints in any sign glyph stay outside N02, and a non-ASCII sign never leaves a partial N01 token.
    expect(await counts(['－3～5%', '＋3～5%', '±3～5%', '﹣3～5万', '－.37%', '±.37%', '1-.37%', '--.37%'], numeric)).toEqual([]);
    const signed = await checkLocalPlan(plan(['比例为-.37%。', '比例为+.37%。'], numeric));
    expect(signed.candidates.map((candidate) => [candidate.ruleId, candidate.from, candidate.to, candidate.quote])).toEqual([['N01', 3, 8, '-.37%'], ['N01', 3, 8, '+.37%']]);
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

function housePlan(texts: string[], entries: readonly { literal: string; enabled?: boolean; note?: string }[], options: Partial<LocalCheckOptions> = {}) {
  const db = new DatabaseSync(':memory:'); initializeHouseWordListSchema(db);
  try {
    const owner = new HouseWordLists(db);
    const saved = owner.save({ expectedCurrent: null, sourceKind: 'editor-entry', entries: entries.map((entry) => ({ entryId: null, note: '', enabled: true, ...entry })) });
    const definition = localCheckProcedureDefinitionV2();
    const { schema: _schema, digest: _digest, rules: _rules, ...common } = plan(texts, { punctuation: 'off', ...options });
    return freezeLocalPlanV2({ ...common, procedure: { procedureId: definition.id, version: definition.version, digest: sha256Hex(canonicalJson(definition)) },
      houseWordList: { pin: saved.pin, document: owner.selectCurrent(saved.pin) } });
  } finally { db.close(); }
}
describe('unselected local v2 House literal contract', () => {
  it('keeps exact overlaps/repetitions, metacharacters, case and NFC distinctions with P/N off', async () => {
    const frozen = housePlan(['ababa a.* A.* é e\u0301 🟦'], ['aba', 'ba', 'a.*', 'é', 'e\u0301', '🟦', 'e', '\u0301'].map((literal) => ({ literal })));
    const result = await checkLocalPlan(frozen); validateLocalResultV2(result, frozen);
    expect(result.candidates.map((candidate) => candidate.quote)).toEqual(['aba', 'ba', 'aba', 'ba', 'a.*', 'é', 'e\u0301', '🟦']);
    expect(result.candidates.map((candidate) => [candidate.from, candidate.to])).toEqual([[0, 3], [1, 3], [2, 5], [3, 5], [6, 9], [14, 15], [16, 17], [18, 19]]);
    expect(new Set(result.candidates.map((candidate) => candidate.id)).size).toBe(8);
    expect(result.candidates.every((candidate) => candidateHasExactAnchor(frozen, candidate) && !('replacement' in candidate))).toBe(true);
    expect(result.counts.H01).toMatchObject({ checked: 1, findings: 8, skipped: 2, error: 0, noFinding: 0 });
    expect(result.counts.P01.disabled).toBe(1); expect(result.counts.N01.disabled).toBe(1);
    expect(canonicalJson(await checkLocalPlan(frozen))).toBe(canonicalJson(result));
  });
  it('uses the unchanged code/URL/email/explicit mask without Chinese-prose or numeral applicability', async () => {
    const frozen = housePlan(['word `word` https://host.invalid/word nameword@host.invalid', '```', 'word', '```', 'word word', 'WORD'],
      [{ literal: 'word' }, { literal: 'WORD', enabled: false }], { excludedRanges: [{ blockId: id(5), from: 0, to: 4, reason: 'technical' }] });
    const result = await checkLocalPlan(frozen);
    expect(result.candidates.map((candidate) => [candidate.blockId, candidate.from, candidate.to])).toEqual([[id(1), 0, 4], [id(5), 5, 9]]);
    expect(result.counts.H01).toMatchObject({ checked: 6, findings: 2, exempt: 5, skipped: 5, noFinding: 1 });
    expect((await checkLocalPlan(housePlan(['wo', 'rd'], [{ literal: 'word' }]))).candidates).toEqual([]);
  });
  it('shares the candidate/exclusion cap across P/N/H01 and counts every overflow without an exhaustive-success counter', async () => {
    const result = await checkLocalPlan(housePlan(['甲…'.repeat(10520)], [{ literal: '甲' }], { punctuation: 'chinese-prose' }));
    expect(result.candidates).toHaveLength(10000); expect(result.excluded).toHaveLength(256);
    expect(result.counts.P02).toMatchObject({ findings: 10000, error: 520 });
    expect(result.counts.H01).toMatchObject({ findings: 0, error: 10520, noFinding: 0 });
  });
  it('cancels inside segmentation, a huge no-hit search, dense matches and a 500-entry scan', async () => {
    for (const phase of ['scan', 'window', 'dense', 'entries'] as const) {
      const frozen = phase === 'entries' ? housePlan(['no-match'], Array.from({ length: 500 }, (_, index) => ({ literal: `合成${index}` })))
        : housePlan([phase === 'dense' ? '甲'.repeat(5000) : '乙'.repeat(300000)], [{ literal: '甲' }]);
      let cancelled = false; let calls = 0;
      await expect(checkLocalPlan(frozen, { cancelled: () => cancelled, checkpoint: async (stage) => {
        if (phase === 'scan' ? stage === 'scan' && ++calls === 3 : stage === 'matches') cancelled = true;
      } })).rejects.toMatchObject({ code: 'LOCAL_CHECK_CANCELLED' });
      expect(cancelled).toBe(true);
    }
  });
  it('pins complete canonical source/list/procedure and refuses snapshot or format drift', () => {
    const frozen = housePlan(['合成词'], [{ literal: '合成词' }]);
    const resign = (body: Omit<typeof frozen, 'digest'>) => ({ ...body, digest: sha256Hex(canonicalJson(body)) });
    const { digest: _digest, ...body } = frozen;
    expect(() => validateLocalPlanV2(resign({ ...body, procedure: { ...body.procedure, digest: 'b'.repeat(64) } }))).toThrow();
    expect(() => validateLocalPlanV2(resign({ ...body, houseWordList: { ...body.houseWordList, document: { ...body.houseWordList.document, entries: [] } } }))).toThrow();
    expect(() => validateLocalPlan(frozen)).toThrow(); expect(() => validateLocalPlanV2(plan(['甲']))).toThrow();
  });
  it('excludes a structurally valid wrong anchor alone, never searches elsewhere, and formats only the matched public entry', async () => {
    const frozen = housePlan(['甲甲乙'], [{ literal: '甲', note: '公开说明' }, { literal: '未命中', note: '不应泄露' }]);
    const result = await checkLocalPlan(frozen); const first = result.candidates[0]!;
    if (first.ruleId !== 'H01') throw new Error('Expected House candidate');
    const moved: HouseCandidate = { ...first, from: 2, to: 3, id: sha256Hex(canonicalJson({ source: frozen.source, planDigest: frozen.digest, houseWordList: frozen.houseWordList.pin,
      rule: 'H01', version: 1, entryId: first.entryId, blockId: first.blockId, from: 2, to: 3 })) };
    const changed = { ...result, candidates: [moved, result.candidates[1]!] };
    expect(() => validateLocalResultV2(changed, frozen)).not.toThrow();
    expect([...exactLocalCandidateIds(frozen, changed.candidates)]).toEqual([result.candidates[1]!.id]);
    expect(() => houseCandidateNote(frozen, moved)).toThrow();
    const note = houseCandidateNote(frozen, first);
    expect(note).toContain('本社敏感词表 第1版'); expect(note).toContain('词条说明：公开说明'); expect(note).toContain(first.entryId);
    expect(note).toContain('H01/v1'); expect(note).not.toContain('未命中'); expect(note).not.toContain('不应泄露');
    expect(() => validateLocalResultV2({ ...result, candidates: [{ ...first, replacement: '自动改写' }, result.candidates[1]] }, frozen)).toThrow();
  });
  it('validates closed /2 artifact state/attempt/digest chains with the whole snapshot and exact completed result', async () => {
    const frozen = housePlan(['合成甲'], [{ literal: '合成甲' }]); const result = await checkLocalPlan(frozen);
    const started: LocalStageArtifactV2 = { schema: 'ai7.review.local-stage-artifact/2', reviewRunId: randomUUID(), categoryId: 'local-text-check', sequence: 1,
      attemptId: randomUUID(), state: 'started', planDigest: frozen.digest, procedure: frozen.procedure, source: frozen.source, plan: frozen,
      previousDigest: null, recordedAt: new Date().toISOString(), result: null, detail: '' };
    validateLocalStageArtifactV2(started, frozen);
    const completed: LocalStageArtifactV2 = { ...started, sequence: 2, state: 'completed', result, previousDigest: sha256Hex(canonicalJson(started)) };
    const prior = { record: started, digest: completed.previousDigest! }; validateLocalStageArtifactV2(completed, frozen, prior);
    const materialized: LocalStageArtifactV2 = { ...completed, sequence: 3, state: 'materialized', previousDigest: sha256Hex(canonicalJson(completed)) };
    const last = { record: completed, digest: materialized.previousDigest! }; validateLocalStageArtifactV2(materialized, frozen, last);
    expect(() => validateLocalStageArtifactV2({ ...materialized, result: { ...result, excluded: [{ candidateId: 'a'.repeat(64), reason: 'local-result-limit' }] } }, frozen, last)).toThrow();
    expect(() => validateLocalStageArtifactV2({ ...completed, attemptId: randomUUID() }, frozen, prior)).toThrow();
    expect(() => validateLocalStageArtifactV2({ ...started, schema: 'ai7.review.local-stage-artifact/1' }, frozen)).toThrow();
    expect(() => validateLocalStageArtifactV2({ ...started, retention: 'factual' }, frozen)).toThrow();
    expect(() => validateLocalStageArtifactV2({ ...started, state: 'materialized', result }, frozen)).toThrow();
  });
  it('keeps old-call result1 bytes and count keys unchanged after the successor is declared', async () => {
    const frozen = plan(['甲'], { punctuation: 'off' }); const result = await checkLocalPlan(frozen);
    const disabled = { checked: 0, exempt: 0, skipped: 0, error: 0, findings: 0, disabled: 1, outOfApplicability: 0, notRecognized: 0, noFinding: 0 };
    expect(canonicalJson(result)).toBe(canonicalJson({ schema: 'ai7.review.local-result/1', planDigest: frozen.digest, paragraphs: 1, candidates: [], excluded: [],
      counts: { P01: disabled, P02: disabled, P03: disabled, N01: disabled, N02: disabled } }));
    expect(Object.keys(result.counts)).toEqual(['P01', 'P02', 'P03', 'N01', 'N02']); expect(frozen).not.toHaveProperty('houseWordList');
    expect(frozen.rules.map((rule) => rule.id)).toEqual(['P01', 'P02', 'P03', 'N01', 'N02']);
  });
});
