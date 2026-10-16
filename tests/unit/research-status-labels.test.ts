import { describe, expect, it } from 'vitest';
import { researchDecisionLine, researchPlanLine, researchStatusLine, researchUnavailableLine } from '../../src/shared/research-status.js';
import type { RunReportProjection } from '../../src/shared/protocol.js';

const backend = { backendId: 'search-tinyfish', host: 'tinyfish.example.test', configurationDigest: 'a'.repeat(64), selectedAt: '2026-10-15T00:00:00Z' };
const noUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };
const report: Pick<RunReportProjection, 'webToolsBackend' | 'usagePerStage' | 'classification' | 'failures'> = {
  webToolsBackend: backend, classification: 'completed', failures: [],
  usagePerStage: { units: noUsage, 'cross-unit-reduction': noUsage, 'assurance-sampling': noUsage, 'run-report-reflection': noUsage,
    'platform-tools': { ...noUsage, searchCalls: { 'search-tinyfish': 1 } } },
};

describe('research status (#744)', () => {
  it('discloses an unshipped or keyless backend as unavailable with its reason', () => {
    expect(researchUnavailableLine('SEARCH_BACKEND_NOT_SHIPPED', '请先选择已提供的后端')).toBe('暂不可用 · 请先选择已提供的后端');
    expect(researchUnavailableLine('SEARCH_CREDENTIAL_MISSING', 'Brave 需要密钥')).toBe('暂不可用 · Brave 需要密钥');
    expect(researchUnavailableLine(null, '其他原因')).toBe('其他原因');
  });
  it('shows 未联网核查 for a rule without tools or a Run with no search', () => {
    const { webToolsBackend: _backend, ...withoutBackend } = report;
    expect(researchStatusLine(withoutBackend)).toBe('未联网核查');
    expect(researchStatusLine({ ...report, usagePerStage: { ...report.usagePerStage, 'platform-tools': noUsage } })).toContain('未联网核查 · TinyFish');
    expect(researchPlanLine(undefined)).toBe('未联网核查');
    expect(researchPlanLine(backend)).toBe('未联网核查 · TinyFish · 已冻结后端，尚未执行');
  });
  it('shows completion with the frozen backend without claiming verified facts', () => {
    expect(researchStatusLine(report)).toBe('联网核查已完成 · TinyFish · 已执行检索，事实结论仍需核对来源');
    expect(researchDecisionLine('允许执行', report)).toContain('允许执行 · 联网核查已完成 · TinyFish');
  });
  it('shows incomplete research with its breaker or refusal reason', () => {
    expect(researchStatusLine({ ...report, classification: 'completed-with-gaps', failures: [{ stage: 'units', code: 'platform-tool-breaker', reason: '达到 128 次工具往返，联网核查未完成' }] }))
      .toContain('联网核查未完成 · TinyFish · 达到 128 次工具往返');
    expect(researchStatusLine({ ...report, usagePerStage: { ...report.usagePerStage, 'platform-tools': { ...noUsage, refusedSearchCalls: 1 } } }))
      .toBe('联网核查未完成 · TinyFish · 检索调用被拒绝');
    expect(researchDecisionLine('允许执行', { ...report, classification: 'cancelled' })).toContain('联网核查未完成 · TinyFish · 运行未完成');
  });
  it('keeps a drawer with no report unverified and names only its frozen selection', () => {
    expect(researchDecisionLine('允许执行', null)).toBe('允许执行 · 未联网核查');
    expect(researchDecisionLine('允许执行', undefined, backend)).toContain('未联网核查 · TinyFish · 已冻结后端，尚未执行');
  });
});
