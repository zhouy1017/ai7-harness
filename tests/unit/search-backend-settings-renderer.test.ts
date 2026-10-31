import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchBackendSettingsProjection } from '../../src/service/provider/search-backend-settings.js';
import { SEARCH_CANDIDATE_PROBE_LABEL, candidateProbeLines, renderSearchBackendSettings, type SearchBackendSettingsApi } from '../../src/renderer/search-backend-settings.js';
import type { ModelServiceSettingsProjection, SearchBackendProbeProjection } from '../../src/shared/protocol.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';

// 设置 › 模型服务 › 联网检索 (Issue #1055 into W22-S10a #1181) over the real registry's projection and stubbed API calls: the
// candidate is shown 未实测 with one 测试连接 that names only the closed identifiers, and its result lives only in the DOM.
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => restore());

const SHIPPED = ['search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai'];
const projection = (): ModelServiceSettingsProjection => ({
  searchBackends: searchBackendSettingsProjection(SHIPPED.map((backendId) => ({ backendId, credentialReference: null, credentialOperationState: 'missing',
    selected: backendId === 'search-tinyfish', selectedAt: '2026-10-29T00:00:00.000Z' }))),
  launchPolicy: { operationalScope: 'development-ci' },
} as unknown as ModelServiceSettingsProjection);

const SUCCESS: SearchBackendProbeProjection = { backendId: 'search-deepseek', reachable: true, latencyMs: 12, resultCount: 7,
  results: [{ title: 'World Book and Copyright Day', url: 'https://www.unesco.org/en/days/world-book-and-copyright' }], failure: null,
  candidate: { candidateId: 'deepseek-direct-search-v1', endpoint: 'https://api.deepseek.com/v1/tools/search', protocol: 'deepseek-direct-search',
    configurationDigest: 'a'.repeat(64), outcome: 'succeeded', httpStatus: 200 } };

function section(probe: SearchBackendSettingsApi['probeSearchBackend']) {
  const api = { probeSearchBackend: vi.fn(probe), selectSearchBackend: vi.fn(), saveSearchBackendCredential: vi.fn(), removeSearchBackendCredential: vi.fn() };
  const node = renderSearchBackendSettings(projection(), { api, render: vi.fn(), setStatus: vi.fn(), errorMessage: (error, fallback) => error instanceof Error ? error.message : fallback }) as unknown as MiniElement;
  return { node, api };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the direct-search candidate in 联网检索', () => {
  it('lists it after the five ranked backends, 未实测, with 测试连接 as its only action', () => {
    const { node } = section(async () => SUCCESS);
    expect(node.querySelectorAll('[data-search-backend]').map((card) => card.dataset['searchBackend'])).toEqual(SHIPPED);
    const card = node.querySelector('[data-search-candidate="deepseek-direct-search-v1"]')!;
    expect(card.dataset['measurement']).toBe('not-measured');
    expect(card.textContent).toContain('未实测');
    expect(card.textContent).toContain('不能用于任务');
    expect(card.querySelectorAll('button').map((item) => item.textContent)).toEqual([SEARCH_CANDIDATE_PROBE_LABEL]);
    expect(card.querySelector('[data-search-candidate-probe]')!.textContent).toBe('');
  });

  it('sends only the closed identifiers and shows the qualified outcome and bounded links', async () => {
    const { node, api } = section(async () => SUCCESS);
    node.querySelector('button[data-action="probe-search-candidate"]')!.click();
    await settle();
    expect(api.probeSearchBackend).toHaveBeenCalledWith({ backendId: 'search-deepseek', candidateId: 'deepseek-direct-search-v1' });
    const output = node.querySelector('[data-search-candidate-probe="deepseek-direct-search-v1"]')!;
    expect(output.textContent).toContain('连接成功 · 延迟 12 ms · 结果数 7');
    expect(output.textContent).toContain('只说明这一次请求：https://api.deepseek.com/v1/tools/search · deepseek-direct-search · 配置摘要 aaaaaaaaaaaa');
    expect(output.querySelectorAll('a')).toHaveLength(1);
  });

  it('shows a refusal in place, and names an HTTP rejection by its status only', async () => {
    const { node } = section(async () => { throw new Error('连接测试只在本机正式使用下发送；当前环境（development-ci）不读取凭据，也不发送任何内容。'); });
    node.querySelector('button[data-action="probe-search-candidate"]')!.click();
    await settle();
    expect(node.querySelector('[data-search-candidate-probe]')!.textContent).toContain('development-ci');
    expect(candidateProbeLines({ ...SUCCESS, reachable: false, resultCount: 0, results: [], failure: 'HTTP 429',
      candidate: { ...SUCCESS.candidate!, outcome: 'http-rejected', httpStatus: 429 } })[0]).toBe('服务拒绝了请求（HTTP 429） · 延迟 12 ms · 结果数 0');
    const { candidate: _candidate, ...legacy } = SUCCESS;
    expect(candidateProbeLines(legacy)).toEqual([]);
  });
});

describe('the 备用来源 control in 联网检索 (#1226)', () => {
  it('offers only a keyed non-default backend, sends role fallback, and clears the chosen one', async () => {
    const keyed = (backendId: string) => backendId === 'search-brave' || backendId === 'search-parallel';
    const settings = { ...projection(), searchBackends: searchBackendSettingsProjection(SHIPPED.map((backendId) => ({ backendId,
      credentialReference: keyed(backendId) ? `11111111-1111-4111-8111-11111111111${SHIPPED.indexOf(backendId)}` : null,
      credentialOperationState: keyed(backendId) ? 'ready' as const : 'missing' as const, selected: backendId === 'search-tinyfish', selectedAt: '2026-10-31T00:00:00.000Z' })),
    { backendId: 'search-parallel' }) } as ModelServiceSettingsProjection;
    const api = { probeSearchBackend: vi.fn(), selectSearchBackend: vi.fn(async () => settings), saveSearchBackendCredential: vi.fn(), removeSearchBackendCredential: vi.fn() };
    const node = renderSearchBackendSettings(settings, { api, render: vi.fn(), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement;
    const control = (id: string) => node.querySelector(`[data-search-backend="${id}"]`)!.querySelectorAll('button').find((item) => item.dataset['action']?.endsWith('search-fallback'))!;
    expect(control('search-tinyfish').disabled).toBe(true);
    expect(control('search-deepseek').disabled).toBe(true);
    expect(node.querySelector('[data-search-backend="search-parallel"]')!.dataset['fallback']).toBe('true');
    expect(node.querySelector('[data-search-backend="search-parallel"]')!.textContent).toContain('备用来源');
    control('search-brave').click();
    await settle();
    expect(api.selectSearchBackend).toHaveBeenLastCalledWith({ backendId: 'search-brave', role: 'fallback' });
    expect(control('search-parallel').textContent).toBe('清除备用来源');
    control('search-parallel').click();
    await settle();
    expect(api.selectSearchBackend).toHaveBeenLastCalledWith({ backendId: null, role: 'fallback' });
    expect(node.querySelector('[data-search-candidate="deepseek-direct-search-v1"]')!.querySelectorAll('button').map((item) => item.textContent)).toEqual([SEARCH_CANDIDATE_PROBE_LABEL]);
  });
});
