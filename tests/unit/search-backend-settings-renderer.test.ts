import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchBackendSettingsProjection } from '../../src/service/provider/search-backend-settings.js';
import { SEARCH_CANDIDATE_PROBE_LABEL, candidateProbeLines, effectiveSearchSourceLine, renderSearchBackendSettings, type SearchBackendSettingsApi } from '../../src/renderer/search-backend-settings.js';
import type { ModelServiceSettingsProjection, SearchBackendProbeProjection } from '../../src/shared/protocol.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';

// 设置 › 模型服务 › 联网检索 (Issue #1055 into W22-S10a #1181) over the real registry's projection and stubbed API calls: the
// candidate is shown 未实测 with one 测试连接 that names only the closed identifiers, and its result lives only in the DOM.
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { setTechnicalLayerVisible(true); restore(); });

const SHIPPED = ['search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai'];
const projection = (): ModelServiceSettingsProjection => ({
  searchBackends: searchBackendSettingsProjection(SHIPPED.map((backendId) => ({ backendId, credentialReference: '11111111-1111-4111-8111-111111111111', credentialOperationState: 'ready',
    selected: backendId === 'search-tinyfish', selectedAt: '2026-10-29T00:00:00.000Z' }))),
  routeChoice: { routes: [], unsupportedProviders: [], effectLabel: '' },
  launchPolicy: resolveSourceCheckoutLaunchPolicySync(process.cwd(), 'ordinary-production'),
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
  it.each(['openai-platform', 'anthropic-claude'] as const)('shows %s admitted native source in ordinary mode and restores it after an override round trip', (route) => {
    setTechnicalLayerVisible(false);
    const settings = projection();
    Object.assign(settings, { routeChoice: { routes: [{ route, inUse: true, binding: { providerLabel: '官方渠道' }, connection: { credentialOperationState: 'ready' } }] } });
    const render = () => renderSearchBackendSettings(settings, { api: { probeSearchBackend: vi.fn(), selectSearchBackend: vi.fn(), saveSearchBackendCredential: vi.fn(), removeSearchBackendCredential: vi.fn() }, render: vi.fn(), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement;
    for (const override of [false, true, false]) {
      settings.searchBackends.alwaysUseSelectedBackend = override;
      const node = render();
      expect(node.textContent).toContain(override ? '编辑指定 · TinyFish' : '随模型渠道 · 官方渠道 自带搜索（未实测）');
      expectNoTechnicalText(node);
      expect(node.querySelectorAll('[data-search-backend]')).toHaveLength(5);
    }
  });
  it('keeps candidate decisions and test outcomes without technical identifiers in ordinary mode', async () => {
    setTechnicalLayerVisible(false);
    const { node, api } = section(async () => SUCCESS);
    expect(node.textContent).toContain('不作为独立排名默认后端或备用来源');
    expect(node.textContent).toContain('尚未测量这一接口的命中率、延迟与可达性');
    expectNoTechnicalText(node);
    expect(node.textContent).not.toMatch(/https?:\/\/|deepseek-direct-search|openai-responses-web-search|anthropic-messages-web-search|配置摘要|评测参考|p50|中文命中率|国际命中率|命中率[ ：:]*[0-9]/u);
    node.querySelector('button[data-action="probe-search-candidate"]')!.click();
    await settle();
    expect(node.querySelector('[data-search-candidate-probe]')!.textContent).toContain('连接成功');
    expect(api.probeSearchBackend).toHaveBeenCalledWith({ backendId: 'search-deepseek', candidateId: 'deepseek-direct-search-v1' });
    expectNoTechnicalText(node);
    expect(node.textContent).not.toContain(SUCCESS.candidate!.configurationDigest);
  });
  it('shows the effective source and why it is selected', () => {
    const settings = projection();
    expect(effectiveSearchSourceLine(settings)).toContain('兜底 · TinyFish');
    Object.assign(settings, { routeChoice: { routes: [{ route: 'deepseek-open-platform', inUse: true, binding: { providerLabel: 'DeepSeek 开放平台（官方）' }, connection: { credentialOperationState: 'ready' } }] } });
    expect(effectiveSearchSourceLine(settings)).toContain('随模型渠道 · DeepSeek 开放平台（官方） 自带搜索');
  });
  it('saves the source override from its default-off checkbox and explains the effective source', async () => {
    const settings = projection();
    const api = { probeSearchBackend: vi.fn(), selectSearchBackend: vi.fn().mockResolvedValue(settings), saveSearchBackendCredential: vi.fn(), removeSearchBackendCredential: vi.fn() };
    const node = renderSearchBackendSettings(settings, { api, render: vi.fn(), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement;
    const checkbox = node.querySelector('[data-action="always-use-selected-search-backend"]')!;
    expect(checkbox.checked).toBe(false); expect(node.textContent).toContain('总是使用联网检索里选定的后端');
    checkbox.checked = true; checkbox.dispatchEvent({ type: 'change' }); await settle();
    expect(api.selectSearchBackend).toHaveBeenCalledWith({ backendId: 'search-tinyfish', alwaysUseSelectedBackend: true });
    settings.searchBackends.alwaysUseSelectedBackend = true;
    expect(effectiveSearchSourceLine(settings)).toContain('编辑指定 · TinyFish');
  });
  it.each([false, true])('offers native candidate connection tests with technical mode %s', async (technical) => {
    setTechnicalLayerVisible(technical);
    const settings = projection();
    Object.assign(settings, { routeChoice: { routes: ['openai-platform', 'anthropic-claude'].map((route) => ({ route, connection: { credentialOperationState: 'ready' } })) } });
    const api = { probeSearchBackend: vi.fn().mockResolvedValue(SUCCESS), selectSearchBackend: vi.fn(), saveSearchBackendCredential: vi.fn(), removeSearchBackendCredential: vi.fn() };
    const node = renderSearchBackendSettings(settings, { api, render: vi.fn(), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement;
    for (const service of ['openai', 'anthropic']) {
      const card = node.querySelector(`[data-search-candidate="${service}-native-search-v1"]`)!;
      expect(card.textContent).toContain('未实测'); expect(card.textContent).toContain('不作为独立排名默认后端或备用来源');
      const controls = card.querySelectorAll('button'); expect(controls).toHaveLength(1); expect(controls[0]!.disabled).toBe(false);
      controls[0]!.click(); await settle();
      expect(api.probeSearchBackend).toHaveBeenCalledWith({ backendId: `search-${service}`, candidateId: `${service}-native-search-v1` });
    }
    if (!technical) expectNoTechnicalText(node);
  });
  it('keeps keyless backends unselected, distinguishes measured references, and disables empty credential actions', () => {
    const settings = projection();
    Object.assign(settings, { launchPolicy: { operationalScope: 'ordinary-production' }, routeChoice: { routes: [] } });
    for (const backend of settings.searchBackends.backends) Object.assign(backend.connection, { credentialOperationState: 'missing', credentialReference: null });
    const api = { probeSearchBackend: vi.fn(), selectSearchBackend: vi.fn(), saveSearchBackendCredential: vi.fn(), removeSearchBackendCredential: vi.fn() };
    const node = renderSearchBackendSettings(settings, { api, render: vi.fn(), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement;
    const tiny = node.querySelector('[data-search-backend="search-tinyfish"]')!;
    expect(tiny.dataset['selected']).toBe('false');
    expect(tiny.textContent).toContain('未配置密钥'); expect(tiny.textContent).toContain('评测参考');
    expect(tiny.textContent).not.toContain('已选择'); expect(tiny.textContent).not.toContain('可达');
    expect(tiny.querySelectorAll('button').filter((button) => ['保存密钥', '移除密钥', '测试检索'].includes(button.textContent)).every((button) => button.disabled)).toBe(true);
    const save = tiny.querySelectorAll('button').find((button) => button.textContent === '保存密钥')!;
    const secret = tiny.querySelector('input')!;
    secret.value = '  '; secret.dispatchEvent({ type: 'input' }); expect(save.disabled).toBe(true);
    secret.value = 'synthetic-key'; secret.dispatchEvent({ type: 'input' }); expect(save.disabled).toBe(false);
    expect(node.querySelector('[data-action="probe-search-candidate"]')!.disabled).toBe(true);
    expect(node.querySelector('[data-search-candidate]')!.textContent).not.toContain('2026-11-01');
  });

  it('synchronizes the saved official DeepSeek model credential without exposing its value', async () => {
    setTechnicalLayerVisible(false);
    const settings = projection();
    Object.assign(settings, { launchPolicy: { operationalScope: 'ordinary-production' }, routeChoice: { routes: [{ route: 'deepseek-open-platform', connection: { credentialOperationState: 'ready' } }] } });
    const api = { probeSearchBackend: vi.fn(), selectSearchBackend: vi.fn(), saveSearchBackendCredential: vi.fn(async () => settings), removeSearchBackendCredential: vi.fn() };
    const setStatus = vi.fn();
    const node = renderSearchBackendSettings(settings, { api, render: vi.fn(), setStatus, errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement;
    node.querySelector('[data-action="reuse-model-credential"]')!.click(); await settle();
    expect(api.saveSearchBackendCredential).toHaveBeenCalledWith({ backendId: 'search-deepseek', reuseModelCredential: true });
    expect(setStatus).toHaveBeenCalledWith('模型渠道凭据已同步到联网检索。', 'success');
  });
  it('saves an ordinary search key, selects and tests its backend, then removes the key (#1370)', async () => {
    setTechnicalLayerVisible(false);
    const settings = projection(); Object.assign(settings.launchPolicy, { operationalScope: 'ordinary-production' });
    const backend = settings.searchBackends.backends.find((entry) => entry.backendId === 'search-brave')!;
    Object.assign(backend.connection, { credentialOperationState: 'missing', credentialReference: null });
    const { candidate: _candidate, ...result } = SUCCESS;
    const api = { probeSearchBackend: vi.fn(async () => result),
      selectSearchBackend: vi.fn<SearchBackendSettingsApi['selectSearchBackend']>(async (input) => { if (input.backendId !== null) settings.searchBackends.selectedBackendId = input.backendId; return settings; }),
      saveSearchBackendCredential: vi.fn(async () => { backend.connection.credentialOperationState = 'ready'; return settings; }),
      removeSearchBackendCredential: vi.fn(async () => { backend.connection.credentialOperationState = 'missing'; return settings; }) };
    let node: MiniElement;
    const paint = () => { node = renderSearchBackendSettings(settings, { api, render: paint, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement; };
    const card = () => node.querySelector('[data-search-backend="search-brave"]')!;
    const press = async (label: string) => { card().querySelectorAll('button').find((control) => control.textContent === label)!.click(); await settle(); };
    paint(); const input = card().querySelector('input')!;
    input.value = 'synthetic-search-key'; input.dispatchEvent({ type: 'input' });
    await press('保存密钥'); expect(input.value).toBe('');
    expect(api.saveSearchBackendCredential).toHaveBeenCalledWith({ backendId: 'search-brave', secret: 'synthetic-search-key' });
    await press('选择后端'); expect(card().dataset['selected']).toBe('true');
    paint(); expect(card().dataset['selected']).toBe('true');
    await press('测试检索'); expect(card().querySelector('[data-search-probe]')!.textContent).toContain('可达');
    expect(card().querySelector('[data-search-probe]')!.textContent).not.toContain('延迟');
    expectNoTechnicalText(node!);
    await press('移除密钥'); expect(card().querySelectorAll('button').find((control) => control.textContent === '测试检索')!.disabled).toBe(true);
  });
  it('lists it after the five ranked backends, 未实测, with 测试连接 as its only action', () => {
    const { node } = section(async () => SUCCESS);
    expect(node.querySelectorAll('[data-search-backend]').map((card) => card.dataset['searchBackend'])).toEqual(SHIPPED);
    const card = node.querySelector('[data-search-candidate="deepseek-direct-search-v1"]')!;
    expect(card.dataset['measurement']).toBe('not-measured');
    expect(card.textContent).toContain('未实测');
    expect(card.textContent).toContain('不作为独立排名默认后端或备用来源');
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
    setTechnicalLayerVisible(false);
    const keyed = (backendId: string) => backendId === 'search-brave' || backendId === 'search-parallel';
    const settings = { ...projection(), searchBackends: searchBackendSettingsProjection(SHIPPED.map((backendId) => ({ backendId,
      credentialReference: keyed(backendId) ? `11111111-1111-4111-8111-11111111111${SHIPPED.indexOf(backendId)}` : null,
      credentialOperationState: keyed(backendId) ? 'ready' as const : 'missing' as const, selected: backendId === 'search-tinyfish', selectedAt: '2026-10-31T00:00:00.000Z' })),
    { backendId: 'search-parallel' }) } as ModelServiceSettingsProjection;
    const api = { probeSearchBackend: vi.fn(), selectSearchBackend: vi.fn(async () => settings), saveSearchBackendCredential: vi.fn(), removeSearchBackendCredential: vi.fn() };
    const node = renderSearchBackendSettings(settings, { api, render: vi.fn(), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback }) as unknown as MiniElement;
    const control = (id: string) => node.querySelector(`[data-search-backend="${id}"]`)!.querySelectorAll('button').find((item) => item.dataset['action']?.endsWith('search-fallback'))!;
    expect(node.textContent).toContain('设置备用来源后');
    expect(node.textContent).toContain('余额或套餐额度不足时，直接切换一次');
    expect(node.textContent).toContain('其他认证错误不会切换');
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
