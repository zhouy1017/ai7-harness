import type { DiagnosticsApi } from '../main/diagnostics.js';
import { CRASH_KIND_LABELS, CRASH_LIST_HEADING, DIAGNOSTICS_EXCLUSIONS, DIAGNOSTICS_TITLE } from './diagnostics-labels.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

export function mountDiagnostics(root: HTMLElement, api: DiagnosticsApi, back: () => void): void {
  root.append(el('p', '设置 · 本机'), el('h2', DIAGNOSTICS_TITLE), el('p', DIAGNOSTICS_EXCLUSIONS));
  const actions = el('div', '');
  actions.className = 'button-row';
  const status = el('p', '');
  status.setAttribute('role', 'status');
  function action(label: string, run: () => Promise<void> | void): HTMLButtonElement {
    const button = el('button', label);
    button.type = 'button';
    button.className = 'secondary';
    button.addEventListener('click', () => {
      button.disabled = true;
      void Promise.resolve().then(run).catch(() => { status.textContent = '无法完成本机诊断操作，请稍后重试。'; })
        .finally(() => { button.disabled = false; });
    });
    return button;
  }
  actions.append(action('导出诊断包…', async () => {
    const result = await api.exportDiagnosticsBundle();
    root.dataset['exportState'] = result.state;
    status.textContent = result.state === 'exported' ? '诊断包已保存到所选文件夹。' : '已取消保存诊断包。';
  }), action('查看诊断位置', async () => {
    await api.revealDiagnosticsLocation();
    status.textContent = '已请求系统显示本机崩溃记录位置。';
  }), action('返回', back));
  const heading = el('h3', CRASH_LIST_HEADING);
  heading.tabIndex = -1;
  root.append(actions, heading, status);
  const list = el('div', '正在读取本机崩溃记录…');
  list.dataset['crashList'] = '';
  root.append(list);
  void api.listCrashRecords().then((records) => {
    list.replaceChildren();
    if (records.length === 0) list.append(el('p', '暂无崩溃记录。'));
    for (const record of [...records].reverse()) {
      const item = el('section', '');
      item.className = 'source-card';
      item.append(el('p', `${record.instant} · ${CRASH_KIND_LABELS[record.kind] ?? '异常'} · ${record.reason}`));
      const details = el('details', '');
      details.append(el('summary', '查看'), el('pre', JSON.stringify(record, null, 2)));
      item.append(details);
      list.append(item);
    }
    root.dataset['crashListReady'] = 'true';
  }).catch(() => { list.textContent = '无法读取本机崩溃记录，请稍后重试。'; });
  queueMicrotask(() => heading.focus());
}
