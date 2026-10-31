import type { ModelServiceSettingsProjection, RendererApi, SearchBackendCandidateProjection, SearchBackendProbeProjection, SearchCandidateProbeOutcome } from '../shared/protocol.js';

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
export const SEARCH_FALLBACK_NOTE = '默认后端连接未建立、服务出错或限流时，同一检索先重发一次；仍失败，再改发到备用来源一次。只能选一个已保存密钥的后端；候选接口不能作为备用来源。';
export const SEARCH_CANDIDATE_OUTCOME_LABELS: Readonly<Record<SearchCandidateProbeOutcome, string>> = Object.freeze({
  succeeded: '连接成功',
  'succeeded-empty': '连接成功 · 没有结果',
  'malformed-response': '响应不是文档所述的格式',
  'http-rejected': '服务拒绝了请求',
  'transport-interrupted': '传输中断',
  'transport-unknown': '传输结果未知',
});

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
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
  return [`${outcome} · 延迟 ${result.latencyMs} ms · 结果数 ${result.resultCount}`,
    `只说明这一次请求：${candidate.endpoint} · ${candidate.protocol} · 配置摘要 ${candidate.configurationDigest.slice(0, 12)}`];
}

function candidateCard(candidate: SearchBackendCandidateProjection, options: SearchBackendSettingsOptions): HTMLElement {
  const card = element('article', 'model-role-card');
  card.dataset['searchCandidate'] = candidate.candidateId;
  card.dataset['measurement'] = candidate.measurement;
  card.append(element('h4', undefined, `${candidate.name} · 未实测`), element('p', 'field-note', `接口 ${candidate.endpoint} · 单价 ${candidate.price} · 不可选择`));
  for (const line of candidate.disclosure) card.append(element('p', 'field-note', line));
  const output = element('div');
  output.dataset['searchCandidateProbe'] = candidate.candidateId;
  const probe = button(SEARCH_CANDIDATE_PROBE_LABEL, 'quiet', async () => {
    probe.disabled = true;
    try {
      const result = await options.api.probeSearchBackend({ backendId: candidate.backendId, candidateId: candidate.candidateId });
      output.replaceChildren(...candidateProbeLines(result).map((line) => element('p', undefined, line)), resultList(result));
    } catch (error) { output.replaceChildren(element('p', 'attention-note', options.errorMessage(error, '连接测试未完成。'))); }
    finally { probe.disabled = false; }
  });
  probe.dataset['action'] = 'probe-search-candidate';
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
  section.append(element('h3', undefined, '联网检索'), element('p', 'field-note', '新任务使用所选后端；已开始的运行继续使用计划里冻结的后端。'),
    element('p', 'field-note', `备用来源：${SEARCH_FALLBACK_NOTE}`));
  const { selectedBackendId, fallbackBackendId } = projection.searchBackends;
  const saveFallback = (backendId: string | null, done: string): void => void (async () => {
    try { render(await api.selectSearchBackend({ backendId, role: 'fallback' })); setStatus(done); }
    catch (error) { setStatus(errorMessage(error, '无法保存备用来源。'), 'error'); }
  })();
  for (const backend of projection.searchBackends.backends) {
    const card = element('article', 'model-role-card');
    card.dataset['searchBackend'] = backend.backendId;
    card.dataset['selected'] = String(backend.backendId === selectedBackendId);
    card.dataset['fallback'] = String(backend.backendId === fallbackBackendId);
    card.append(element('h4', undefined, `${backend.rank}. ${backend.name}${backend.backendId === selectedBackendId ? ' · 已选择' : ''}${backend.backendId === fallbackBackendId ? ' · 备用来源' : ''}`),
      element('p', 'field-note', `${backend.reachable ? '可达' : '不可达'} · 延迟 p50 ${backend.p50Ms === null ? '未知' : `${backend.p50Ms} ms`} · 单价 ${backend.price} · ${backend.keyRequired ? '需要密钥' : '无需密钥'}`),
      element('p', 'field-note', `中文命中率 ${(backend.chineseHitRate * 100).toFixed(1)}% · 国际命中率 ${(backend.internationalHitRate * 100).toFixed(1)}%`));
    if (backend.note !== null) card.append(element('p', 'field-note', backend.note));
    const actions = element('div', 'button-row');
    const choose = button('选择后端', 'quiet', () => void (async () => {
      try { render(await api.selectSearchBackend({ backendId: backend.backendId })); setStatus('联网检索后端已保存'); }
      catch (error) { setStatus(errorMessage(error, '无法保存联网检索后端。'), 'error'); }
    })());
    choose.disabled = backend.backendId === projection.searchBackends.selectedBackendId;
    const output = element('div');
    output.dataset['searchProbe'] = backend.backendId;
    const probe = button('测试检索', 'quiet', () => void (async () => {
      probe.disabled = true;
      try {
        const result = await api.probeSearchBackend({ backendId: backend.backendId });
        output.replaceChildren(element('p', undefined, `${result.reachable ? '可达' : '不可达'} · 延迟 ${result.latencyMs} ms · 结果数 ${result.resultCount}${result.failure === null ? '' : ` · ${result.failure}`}`));
        output.append(resultList(result));
      } catch (error) { output.replaceChildren(element('p', 'attention-note', errorMessage(error, '测试检索未完成。'))); }
      finally { probe.disabled = false; }
    })());
    const keyed = backend.connection.credentialOperationState === 'ready';
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
        const value = secret.value; secret.value = '';
        try { render(await api.saveSearchBackendCredential({ backendId: backend.backendId, secret: value })); }
        catch (error) { setStatus(errorMessage(error, '无法保存联网检索密钥。'), 'error'); }
      })());
      const remove = button('移除密钥', 'quiet', () => void (async () => {
        try { render(await api.removeSearchBackendCredential({ backendId: backend.backendId })); }
        catch (error) { setStatus(errorMessage(error, '无法移除联网检索密钥。'), 'error'); }
      })());
      card.append(element('p', 'field-note', backend.connection.credentialOperationState === 'ready' ? '密钥已保存' : '密钥需设置'), secret);
      actions.append(save, remove);
    }
    card.append(actions, output); section.append(card);
  }
  if (projection.searchBackends.candidates.length > 0) {
    section.append(element('h4', undefined, '候选接口 · 未实测'));
    for (const candidate of projection.searchBackends.candidates) section.append(candidateCard(candidate, options));
  }
  return section;
}
