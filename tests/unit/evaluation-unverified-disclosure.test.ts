import { describe, expect, it } from 'vitest';
import { readersReportKindDefinition } from '../../src/service/evaluation/readers-report-kind.js';
import { EVALUATION_UNVERIFIED_DISCLOSURE, disclosedNote, producedUnverified } from '../../src/service/evaluation/unverified-disclosure.js';
import { rewriteProposalItems } from '../../src/service/evaluation-rewrites.js';
import type { EvaluationContent, ReadersReportResultProjection } from '../../src/shared/protocol.js';

// #429: 未联网核查 follows the recorded result — a revision produced under developer-live — onto the display-only basis lines
// alone: the notes AI7 rests a score, a passage or a rewritten 评语 on. Scores, AI7's comments, report sections and rewritten
// words never carry it, since they can become the editor's own words or a later prompt's input.

const definition = readersReportKindDefinition({ template: 'author', record: { profile: { title: '合成方案', version: '1' },
  items: [{ label: '合成评分项', fullMarks: 100, score: 80, notRated: null, comment: '合成评语', ai7: null }],
  total: { score: 80, fullMarks: 100 }, strengths: ['合成优点'], weaknesses: ['合成问题'],
  risks: [], readiness: [], verdict: '合成总评', conclusion: '修改后再议' }, exemplars: [] });
const report: ReadersReportResultProjection = {
  template: 'author',
  exemplars: { count: 0, statement: '合成说明' },
  passages: [{ unitOrdinal: 1, kind: 'strength', note: '合成段落说明。', blockIds: [] }],
  sections: { overall: '合成总体评价。', strengths: ['合成优点。'], problems: ['合成问题。'], suggestions: ['合成建议。'], conclusion: '修改后再议。' },
  synthesis: { state: 'closed', reason: null },
};

describe('未联网核查 on evaluation results (#429)', () => {
  it('reads the revision\'s own scope and prefixes the service-owned words', () => {
    expect(producedUnverified('developer-live')).toBe(true);
    expect(producedUnverified('development-ci')).toBe(false);
    expect(producedUnverified(undefined)).toBe(false);
    expect(disclosedNote('合成依据。', true)).toBe(`${EVALUATION_UNVERIFIED_DISCLOSURE}合成依据。`);
    expect(disclosedNote('合成依据。', false)).toBe('合成依据。');
  });

  it('shows a live 审稿意见\'s passages with the disclosure and its sections as written', () => {
    const live = definition.revisionComponents({ readersReport: report, policyPin: { operationalScope: 'developer-live' } }).readersReport as ReadersReportResultProjection;
    expect(live.passages.map((passage) => passage.note)).toEqual([`${EVALUATION_UNVERIFIED_DISCLOSURE}合成段落说明。`]);
    expect(live.sections).toEqual(report.sections);
    expect(definition.revisionComponents({ readersReport: report, policyPin: { operationalScope: 'development-ci' } }).readersReport).toEqual(report);
  });

  it('shows a live rewrite\'s notes with the disclosure and its words as written', () => {
    const content = { items: [{ itemId: 'literary-quality', comment: '原评语。' }] } as unknown as EvaluationContent;
    const words = [{ itemId: 'literary-quality', comment: '重写的评语。' }];
    const observations = [{ itemId: 'literary-quality', unitOrdinal: 1, note: '合成依据。', blockIds: [] }];
    const [live] = rewriteProposalItems(words, observations, content, true);
    expect(live!.after).toBe('重写的评语。');
    expect(live!.evidence.map((evidence) => evidence.note)).toEqual([`${EVALUATION_UNVERIFIED_DISCLOSURE}合成依据。`]);
    expect(rewriteProposalItems(words, observations, content)[0]!.evidence[0]!.note).toBe('合成依据。');
  });
});
