import { describe, expect, it } from 'vitest';
import { ANALYSIS_GAP_CODE_LABELS, WEB_VERIFICATION_INCOMPLETE, analysisGapLead, type AnalysisGapProjection } from '../../src/shared/protocol.js';

// The ②A reading of a unit's gap (Issue #473, S87-f3b; #742 review P3-7): the one disclosed state leads by its own name,
// every other gap leads as 尚未分析 — the words J-04 pins for a range the Run did not read.

const CODES: ReadonlyArray<AnalysisGapProjection['code']> = ['adapter-failure', 'contract-invalid', 'interrupted', 'egress-refused', 'not-attempted', 'out-of-scope', 'web-verification-incomplete', 'outcome-unknown'];

describe('analysis gap labels', () => {
  it('names every gap code once, and the breaker state as 联网核查未完成', () => {
    expect(Object.keys(ANALYSIS_GAP_CODE_LABELS).sort()).toEqual([...CODES].sort());
    expect(ANALYSIS_GAP_CODE_LABELS['web-verification-incomplete']).toBe(WEB_VERIFICATION_INCOMPLETE);
    expect(WEB_VERIFICATION_INCOMPLETE).toBe('联网核查未完成');
    expect(ANALYSIS_GAP_CODE_LABELS['out-of-scope']).toBe('不在本次审阅范围内');
    expect(ANALYSIS_GAP_CODE_LABELS['outcome-unknown']).toBe('结果待确认');
    expect(new Set(Object.values(ANALYSIS_GAP_CODE_LABELS)).size).toBe(CODES.length);
  });

  it('leads the breaker state by its name and every other gap as 尚未分析', () => {
    expect(analysisGapLead('web-verification-incomplete')).toBe('联网核查未完成');
    for (const code of CODES.filter((entry) => entry !== 'web-verification-incomplete')) {
      expect(analysisGapLead(code), code).toBe('尚未分析');
    }
  });
});
