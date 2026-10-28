import { describe, expect, it } from 'vitest';
import { reviewRunEvidence, type ReviewEvidenceReader } from '../../src/service/review/report-evidence.js';

// Issue #1174 (ADR 0095 §5): what the 审阅报告 records as a factual finding's sources — the reads its card makes, through the
// store's own answers. Synthetic public text only.

describe('the sources a 审阅报告 records', () => {
  it('takes each finding’s latest result in the Run, every source page, and the retained rows of that finding, less the excluded', () => {
    const asked: string[] = [];
    const card = (cardId: string, excluded = false) => ({ cardId, sourceRef: `https://example.org/${cardId}`, sourceKind: 'web', title: cardId, checkLabel: '已精确取文',
      relation: '支持', excerpt: '示例摘录', evidenceId: `${cardId}-row`, ...(excluded ? { excluded } : {}) });
    const reader = {
      inspectFactualVerification: (input: { after: number | null }) => ({ results: input.after === null
        ? [{ resultId: 'r1', reviewFindingId: 'rvf_a', taskIntentId: 't' }] : [{ resultId: 'r2', reviewFindingId: 'rvf_a', taskIntentId: 't' }],
      nextCursor: input.after === null ? 1 : null }),
      inspectEvidenceWorkspace: (input: { resultId: string; sourcesAfter: number | null }) => {
        asked.push(`${input.resultId}@${input.sourcesAfter}`);
        return { sources: input.sourcesAfter === null ? [card('kept'), card('dropped', true)] : [card('later')], nextSourceCursor: input.sourcesAfter === null ? 12 : null };
      },
      inspectResearchEvidence: (input: { reviewFindingId?: string; after: number | null }) => {
        asked.push(`research ${input.reviewFindingId}@${input.after}`);
        return { records: [{ evidenceId: 'kept-row', sourceTitle: null, translation: { state: 'translated', text: '示例译文' } }], next: null };
      },
    } as unknown as ReviewEvidenceReader;
    const sources = reviewRunEvidence(reader, 'book', 'run').get('rvf_a')!;
    expect(asked).toEqual(['r2@null', 'r2@12', 'research rvf_a@null']);
    expect(sources.map((source) => [source.name, source.translation])).toEqual([['kept', '示例译文'], ['later', null]]);
  });
});
