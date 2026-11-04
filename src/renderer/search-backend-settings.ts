import type { ModelServiceSettingsProjection, RendererApi, SearchBackendCandidateProjection, SearchBackendProbeProjection, SearchCandidateProbeOutcome } from '../shared/protocol.js';
import { metadataWords, technicalLayerVisible } from './technical-layer.js';

/**
 * 设置 › 模型服务 › 联网检索 (Issue #883): the shipped backends in rank order with 选择后端 and 测试检索, and (Issue #1055) the
 * declared direct-search candidate disclosed as 未实测, never selectable, with one explicit 测试连接; and (Issue #1226) at most one
 * 备用来源 among the ranked backends whose key is saved, never the default, clearable. Every probe result lives
 * only in this section's DOM: a repaint, leaving 设置 or restarting AI7 clears it, and nothing is stored.
 */
export type SearchBackendSettingsApi = Pick<RendererApi, 'selectSearchBackend' | 'probeSearchBackend' | 'saveSearchBackendCredential' | 'removeSearchBackendCredential'>;

export interface SearchBackendSettingsOptions {
  readonly api: SearchBackendSettingsApi;
  render(next: ModelServiceSettingsProjection): void;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}

export const SEARCH_CANDIDATE_PROBE_LABEL = '测试连接';
export const SEARCH_FALLBACK_NOTE = '设置备用来源后，默认来源连接未建立、服务出错或限流时，同一检索最多重试一次；仍失败再切换一次。默认使用博查且明确返回余额或套餐额度不足时，直接切换一次；其他认证错误不会切换。只能选择一个已保存密钥的后端，且不能与默认来源相同；候选接口不能作为备用来源。随模型渠道使用自带搜索时，不会切换到本页的备用来源；开启总是使用选定后端后，按本页配置切换。';
export const SEARCH_CANDIDATE_OUTCOME_LABELS: Readonly<Record<SearchCandidateProbeOutcome, string>> = Object.freeze({
  succeeded: '连接成功',
  'succeeded-empty': '连接成功 · 没有结果',
  'malformed-response': '响应不是文档所述的格式',
  'http-rejected': '服务拒绝了请求',
  'transport-interrupted': '传输中断',
  'transport-unknown': '传输结果未知',
});

/** Explain the resolver's current source using the selected Main route and only a saved, measured native backend. */
export function effectiveSearchSourceLine(projection: ModelServiceSettingsProjection): string {
  const ready = projection.searchBackends.backends.filter((backend) => backend.connection.credentialOperationState === 'ready');
  const mainRoute = projection.routeChoice?.routes.find((route) => route.inUse);
  const native = mainRoute?.connection?.credentialOperationState !== 'ready' || projection.searchBackends.alwaysUseSelectedBackend ? undefined
    : projection.searchBackends.backends.find((backend) => mainRoute.route.startsWith(`${backend.backendId.slice('search-'.length)}-`));
  if (native !== undefined) return `当前生效来源：随模型渠道 · ${mainRoute!.binding.providerLabel} 自带搜索`;
  const selected = ready.find((backend) => backend.backendId === projection.searchBackends.selectedBackendId) ?? ready[0];
  return selected === undefined ? '当前生效来源：暂不可用 · 当前模型渠道不自带联网搜索，请在 设置 › 联网检索 保存一个后端密钥。'
    : projection.searchBackends.alwaysUseSelectedBackend ? `当前生效来源：编辑指定 · ${selected.name}（已开启总是使用选定后端）`
    : `当前生效来源：兜底 · ${selected.name}（模型渠道没有可用的原生搜索）`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = metadataWords(text);
  return node;
}

function button(label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', () => void action());
  return node;
}

/** At most three bounded titles with their public URLs, as links that open outside AI7. */
function resultList(result: SearchBackendProbeProjection): HTMLElement {
  const list = element('ul');
  for (const hit of result.results.slice(0, 3)) {
    const item = element('li');
    const link = element('a', undefined, hit.title);
    link.href = hit.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    item.append(link, element('span', 'field-note', ` ${hit.url}`)); list.append(item);
  }
  return list;
}

/** One candidate connection test's sanitized outcome, qualified by the exact endpoint, protocol and configuration digest. */
export function candidateProbeLines(result: SearchBackendProbeProjection): string[] {
  const candidate = result.candidate;
  if (candidate === undefined) return [];
  const outcome = SEARCH_CANDIDATE_OUTCOME_LABELS[candidate.outcome] + (candidate.outcome === 'http-rejected' && candidate.httpStatus !== null ? `（HTTP ${candidate.httpStatus}）` : '');
  if (!technicalLayerVisible) return [outcome];
  if (candidate.protocol !== 'deepseek-direct-search') return [`${outcome} · 延迟 ${result.latencyMs} ms · 结果数 ${result.resultCount}`];
  return [`${outcome} · 延迟 ${result.latencyMs} ms · 结果数 ${result.resultCount}`,
    `只说明这一次请求：${candidate.endpoint} · ${candidate.protocol} · 配置摘要 ${candidate.configurationDigest.slice(0, 12)}`];
}

function candidateCard(candidate: SearchBackendCandidateProjection, options: SearchBackendSettingsOptions, keyed: boolean): HTMLElement {
  const card = element('article', 'model-role-card');
  card.dataset['searchCandidate'] = candidate.candidateId;
  card.dataset['measurement'] = candidate.measurement;
  card.append(element('h4', undefined, `${candidate.name} · 未实测`), element('p', 'field-note', technicalLayerVisible && candidate.protocol === 'deepseek-direct-search' ? `接口 ${candidate.endpoint} · 单价 ${candidate.price} · 不可选择` : `单价 ${candidate.price} · 不可选择`));
  for (const line of candidate.disclosure) card.append(element('p', 'field-note', technicalLayerVisible ? line : line.replace(/（\/[^）]+）/gu, '')));
  const output = element('div');
  output.dataset['searchCandidateProbe'] = candidate.candidateId;
  const probe = button(SEARCH_CANDIDATE_PROBE_LABEL, 'quiet', async () => {
    probe.disabled = true;
    try {
      const result = await options.api.probeSearchBackend({ backendId: candidate.backendId, candidateId: candidate.candidateId });
      output.replaceChildren(...candidateProbeLines(result).map((line) => element('p', undefined, line)), resultList(result));
    } catch (error) { output.replaceChildren(element('p', 'attention-note', options.errorMessage(error, '连接测试未完成。'))); }
    finally { probe.disabled = !keyed; }
  });
  probe.dataset['action'] = 'probe-search-candidate';
  probe.disabled = !keyed;
  const actions = element('div', 'button-row');
  actions.append(probe);
  card.append(actions, output);
  return card;
}

export function renderSearchBackendSettings(projection: ModelServiceSettingsProjection, options: SearchBackendSettingsOptions): HTMLElement {
  const { api, render, setStatus, errorMessage } = options;
  const section = element('section', 'review-section');
  section.setAttribute('aria-label', '联网检索');
  section.dataset['searchBackends'] = 'true';
  section.append(element('h3', undefined, '联网检索'), element('p', 'field-note', '新任务优先随主编辑模型渠道使用自带搜索；没有可用的自带搜索时使用已配置的检索后端。已开始的运行继续使用冻结的来源。'),
    element('p', 'field-note', effectiveSearchSourceLine(projection)),
    element('p', 'field-note', `备用来源：${SEARCH_FALLBACK_NOTE}`));
  const { selectedBackendId, fallbackBackendId } = projection.searchBackends;
  const override = element('input'); override.type = 'checkbox'; override.checked = projection.searchBackends.alwaysUseSelectedBackend ?? false;
  override.dataset['action'] = 'always-use-selected-search-backend';
  const label = element('label', 'field-note'); label.append(override, element('span', undefined, '总是使用联网检索里选定的后端'));
  override.addEventListener('change', async () => {
    override.disabled = true;
    try { render(await api.selectSearchBackend({ backendId: selectedBackendId, alwaysUseSelectedBackend: override.checked })); setStatus('联网检索来源偏好已保存。'); }
    catch (error) { override.checked = projection.searchBackends.alwaysUseSelectedBackend ?? false; setStatus(errorMessage(error, '无法保存联网检索来源偏好。'), 'error'); }
    finally { override.disabled = false; }
  });
  section.append(label);

  const saveFallback = (backendId: string | null, done: string): void => void (async () => {
    try { render(await api.selectSearchBackend({ backendId, role: 'fallback' })); setStatus(done); }
    catch (error) { setStatus(errorMessage(error, '无法保存备用来源。'), 'error'); }
  })();
  for (const backend of projection.searchBackends.backends) {
    const keyed = backend.connection.credentialOperationState === 'ready';
    const selected = keyed && backend.backendId === selectedBackendId;
    const card = element('article', 'model-role-card');
    card.dataset['searchBackend'] = backend.backendId;
    card.dataset['selected'] = String(selected);
    card.dataset['fallback'] = String(backend.backendId === fallbackBackendId);
    card.append(element('h4', undefined, `${backend.rank}. ${backend.name}${selected ? ' · 已选择' : ''}${backend.backendId === fallbackBackendId ? ' · 备用来源' : ''}`),
      element('p', 'field-note', keyed ? '密钥已保存；可测试当前连接' : '未配置密钥'),
      element('p', 'field-note', `评测参考 · 延迟 p50 ${backend.p50Ms === null ? '未知' : `${backend.p50Ms} ms`} · 单价 ${backend.price}`),
      element('p', 'field-note', `评测参考 · 中文命中率 ${(backend.chineseHitRate * 100).toFixed(1)}% · 国际命中率 ${(backend.internationalHitRate * 100).toFixed(1)}%`));
    if (backend.note !== null) card.append(element('p', 'field-note', backend.note));
    const actions = element('div', 'button-row');
    const choose = button('选择后端', 'quiet', () => void (async () => {
      try { render(await api.selectSearchBackend({ backendId: backend.backendId })); setStatus('联网检索后端已保存'); }
      catch (error) { setStatus(errorMessage(error, '无法保存联网检索后端。'), 'error'); }
    })());
    choose.disabled = selected || !keyed;
    const output = element('div');
    output.dataset['searchProbe'] = backend.backendId;
    const probe = button('测试检索', 'quiet', () => void (async () => {
      probe.disabled = true;
      try {
        const result = await api.probeSearchBackend({ backendId: backend.backendId });
        output.replaceChildren(element('p', undefined, `${result.reachable ? '可达' : '不可达'} · 延迟 ${result.latencyMs} ms · 结果数 ${result.resultCount}${result.failure === null ? '' : ` · ${result.failure}`}`));
        output.append(resultList(result));
      } catch (error) { output.replaceChildren(element('p', 'attention-note', errorMessage(error, '测试检索未完成。'))); }
      finally { probe.disabled = !keyed; }
    })());
    probe.disabled = !keyed;
    const fallback = button(backend.backendId === fallbackBackendId ? '清除备用来源' : '设为备用来源', 'quiet', () => saveFallback(
      backend.backendId === fallbackBackendId ? null : backend.backendId, backend.backendId === fallbackBackendId ? '备用来源已清除' : '备用来源已保存'));
    fallback.dataset['action'] = backend.backendId === fallbackBackendId ? 'clear-search-fallback' : 'select-search-fallback';
    fallback.disabled = backend.backendId !== fallbackBackendId && (backend.backendId === selectedBackendId || !keyed);
    fallback.title = backend.backendId === selectedBackendId ? '默认后端不能同时作为备用来源' : keyed ? '' : '需先保存这个后端的密钥';
    actions.append(choose, probe, fallback);
    if (projection.launchPolicy.operationalScope === 'ordinary-production') {
      const secret = element('input'); secret.type = 'password'; secret.autocomplete = 'off';
      secret.setAttribute('aria-label', `${backend.name} 密钥`);
      const save = button('保存密钥', 'quiet', () => void (async () => {
        if (secret.value.trim().length === 0) return;
        const value = secret.value; secret.value = '';
        save.disabled = true;
        try { render(await api.saveSearchBackendCredential({ backendId: backend.backendId, secret: value })); setStatus('联网检索密钥已保存。', 'success'); }
        catch (error) { setStatus(errorMessage(error, '无法保存联网检索密钥。'), 'error'); }
      })());
      const remove = button('移除密钥', 'quiet', () => void (async () => {
        remove.disabled = true;
        try { render(await api.removeSearchBackendCredential({ backendId: backend.backendId })); setStatus('联网检索密钥已移除。', 'success'); }
        catch (error) { remove.disabled = !keyed; setStatus(errorMessage(error, '无法移除联网检索密钥。'), 'error'); }
      })());
      save.disabled = true; remove.disabled = !keyed;
      secret.addEventListener('input', () => { save.disabled = secret.value.trim().length === 0; });
      card.append(element('p', 'field-note', backend.connection.credentialOperationState === 'ready' ? '密钥已保存' : '密钥需设置'), secret);
      actions.append(save, remove);
      const service = backend.backendId.slice('search-'.length);
      const source = projection.routeChoice.routes.find((route) => route.route.startsWith(`${service}-`))?.connection;
      if (source != null) {
        const reuse = button(`复用${source.connectionName}模型凭据`, 'secondary', async () => {
          reuse.disabled = true;
          try { render(await api.saveSearchBackendCredential({ backendId: backend.backendId, reuseModelCredential: true })); setStatus('模型渠道凭据已同步到联网检索。', 'success'); }
          catch (error) { reuse.disabled = source.credentialOperationState !== 'ready'; setStatus(errorMessage(error, '无法同步模型渠道凭据。'), 'error'); }
        });
        reuse.dataset['action'] = 'reuse-model-credential'; reuse.disabled = source.credentialOperationState !== 'ready';
        actions.append(reuse);
      }
    }
    card.append(actions, output); section.append(card);
  }
  if (projection.searchBackends.candidates.length > 0) {
    section.append(element('h4', undefined, '候选接口 · 未实测'));
    for (const candidate of projection.searchBackends.candidates) section.append(candidateCard(candidate, options,
      candidate.protocol === 'deepseek-direct-search'
        ? projection.searchBackends.backends.some((backend) => backend.backendId === candidate.backendId && backend.connection.credentialOperationState === 'ready')
        : projection.routeChoice.routes.some((route) => route.route.startsWith(`${candidate.backendId.slice('search-'.length)}-`) && route.connection?.credentialOperationState === 'ready')));
  }
  return section;
}
