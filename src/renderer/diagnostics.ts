import type { DiagnosticsApi } from '../main/diagnostics.js';
import {
  CRASH_KIND_FALLBACK, CRASH_KIND_LABELS, CRASH_LIST_EMPTY, CRASH_LIST_FAILED, CRASH_LIST_HEADING, CRASH_LIST_LOADING,
  CRASH_RECORD_VIEW, DIAGNOSTICS_ACTION_FAILED, DIAGNOSTICS_BACK, DIAGNOSTICS_BREADCRUMB, DIAGNOSTICS_BUNDLE_ACTION,
  DIAGNOSTICS_BUNDLE_CANCELLED, DIAGNOSTICS_BUNDLE_SAVED, DIAGNOSTICS_EXCLUSIONS, DIAGNOSTICS_LOCATION_ACTION,
  DIAGNOSTICS_LOCATION_REQUESTED, DIAGNOSTICS_TITLE,
} from './diagnostics-labels.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

export function mountDiagnostics(root: HTMLElement, api: DiagnosticsApi, back: () => void): void {
  root.append(el('p', DIAGNOSTICS_BREADCRUMB), el('h2', DIAGNOSTICS_TITLE), el('p', DIAGNOSTICS_EXCLUSIONS));
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
      void Promise.resolve().then(run).catch(() => { status.textContent = DIAGNOSTICS_ACTION_FAILED; })
        .finally(() => { button.disabled = false; });
    });
    return button;
  }
  actions.append(action(DIAGNOSTICS_BUNDLE_ACTION, async () => {
    const result = await api.exportDiagnosticsBundle();
    root.dataset['exportState'] = result.state;
    status.textContent = result.state === 'exported' ? DIAGNOSTICS_BUNDLE_SAVED : DIAGNOSTICS_BUNDLE_CANCELLED;
  }), action(DIAGNOSTICS_LOCATION_ACTION, async () => {
    const result = await api.revealDiagnosticsLocation();
    root.dataset['revealState'] = result.state;
    status.textContent = DIAGNOSTICS_LOCATION_REQUESTED;
  }), action(DIAGNOSTICS_BACK, back));
  const heading = el('h3', CRASH_LIST_HEADING);
  heading.tabIndex = -1;
  root.append(actions, heading, status);
  const list = el('div', CRASH_LIST_LOADING);
  list.dataset['crashList'] = '';
  root.append(list);
  void api.listCrashRecords().then((records) => {
    list.replaceChildren();
    if (records.length === 0) list.append(el('p', CRASH_LIST_EMPTY));
    for (const record of [...records].reverse()) {
      const item = el('section', '');
      item.className = 'source-card';
      item.append(el('p', `${record.instant} · ${CRASH_KIND_LABELS[record.kind] ?? CRASH_KIND_FALLBACK} · ${record.reason}`));
      const details = el('details', '');
      details.append(el('summary', CRASH_RECORD_VIEW), el('pre', JSON.stringify(record, null, 2)));
      item.append(details);
      list.append(item);
    }
    root.dataset['crashListReady'] = 'true';
  }).catch(() => { list.textContent = CRASH_LIST_FAILED; });
  queueMicrotask(() => heading.focus());
}
