import { filterChoices, listPosition, stateTerm, type StateTone } from './components/controls.js';
import { createButton } from './components/controls.js';
import type { BookFindingProjection, BookFindingsProjection } from '../shared/protocol.js';
import { FINDINGS_CENTER_WORDS } from './findings-center-labels.js';

const STATUS_TONES: Readonly<Record<string, StateTone>> = {
  '未覆盖': 'attention', '待复核': 'attention',
  '待处理': 'progress', '已处理': 'good', '已忽略': 'neutral',
};

export function mountFindingsCenter(root: HTMLElement, read: (offset: number) => Promise<BookFindingsProjection>, open: (item: BookFindingProjection) => void,
  apply?: (items: BookFindingProjection[]) => Promise<void>): void {
  let offset = 0;
  let generation = 0;
  let category = '';
  let signature = '', busy = false, loading = false;
  const perform = async (items: BookFindingProjection[]): Promise<void> => {
    if (busy || !apply) return; busy = true;
    try { await apply(items); } finally { busy = false; signature = ''; void load(offset); }
  };
  const load = async (next: number): Promise<void> => {
    if (busy || loading) return; loading = true;
    const request = ++generation;
    root.setAttribute('aria-busy', 'true');
    try {
      const page = await read(next);
      if (!root.isConnected || request !== generation) return;
      const key = JSON.stringify(page); if (key === signature) return; signature = key;
      const batchItems = [...page.items];
      if (apply) {
        let cursor = page.next;
        if (next > 0) { const first = await read(0); batchItems.splice(0, batchItems.length, ...first.items); cursor = first.next; }
        while (cursor !== null && batchItems.length < 500) { const rest = await read(cursor); batchItems.push(...rest.items); cursor = rest.next; }
      }
      offset = next;
      root.replaceChildren();
      root.dataset['findingsState'] = 'ready';
      root.dataset['findingsTotal'] = String(page.total);
      const summary = document.createElement('p');
      summary.textContent = page.total === 0 ? FINDINGS_CENTER_WORDS.empty : FINDINGS_CENTER_WORDS.summary(page.total, page.pageSize);
      const groups = document.createElement('ul');
      for (const group of page.groups) {
        const line = document.createElement('li');
        line.textContent = `${group.label} · ${group.count}`;
        groups.append(line);
      }
      let batchButton: HTMLButtonElement | null = null;
      const available = (): BookFindingProjection[] => batchItems.filter((item) => item.suggestion?.batchAllowed && (category === '' || item.category === category)).slice(0, 500);
      const syncBatch = (): void => { if (batchButton) { const count = available().length; batchButton.textContent = `接受并应用全部 ${count} 条`; batchButton.hidden = count === 0; } };
      const filter = filterChoices({ label: FINDINGS_CENTER_WORDS.filter,
        choices: [['', FINDINGS_CENTER_WORDS.allCategories], ...page.groups.map((group) => [group.category, `${group.label} · ${group.count}`] as const)],
        value: category, change: (value) => { category = value; paint(); syncBatch(); },
      });
      filter.dataset['findingsFilter'] = 'category';
      const list = document.createElement('div');
      const paint = (): void => {
        list.replaceChildren();
        for (const group of page.groups.filter((entry) => category === '' || entry.category === category)) {
          const section = document.createElement('section');
          const heading = document.createElement('h3'); heading.textContent = group.label; section.append(heading);
          for (const item of page.items.filter((entry) => entry.category === group.category)) {
            const row = document.createElement('article'); row.dataset['findingId'] = item.id; row.dataset['findingKind'] = item.target.kind;
            const words = document.createElement('p'); words.append(stateTerm(item.status, STATUS_TONES[item.status] ?? 'neutral'), document.createTextNode(` ${item.severity} · ${item.summary}`));
            const link = createButton(); link.type = 'button'; link.textContent = FINDINGS_CENTER_WORDS.open; link.addEventListener('click', () => open(item));
            row.append(words, link);
            if (item.suggestion && apply) { const accept = createButton(); accept.type = 'button'; accept.textContent = '接受并应用'; accept.dataset['findingApply'] = item.id;
              accept.addEventListener('click', () => { accept.disabled = true; void perform([item]); }); row.append(accept); }
            section.append(row);
          }
          if (section.childElementCount > 1) list.append(section);
        }
        if (list.childElementCount === 0 && page.total > 0) {
          const empty = document.createElement('p'); empty.textContent = FINDINGS_CENTER_WORDS.pageEmpty; list.append(empty);
        }
      };
      paint();
      const actions = document.createElement('div'); actions.className = 'button-row';
      actions.append(listPosition({ offset, total: page.total, pageSize: page.pageSize, label: '发现位置', change: (next) => void load(next) }));
      if (apply) {
        batchButton = createButton(); batchButton.type = 'button'; syncBatch();
        batchButton.addEventListener('click', () => {
          const items = available();
          const bar = document.createElement('div'); bar.className = 'attention-note findings-confirm'; bar.setAttribute('role', 'alert');
          const scope = document.createElement('p'); scope.textContent = `将把所列 ${items.length} 条修改建议写入稿件${batchItems.length >= 500 ? '；每次最多读取 500 项发现' : ''}。`;
          const confirm = createButton(); confirm.type = 'button'; confirm.textContent = '确认应用'; confirm.addEventListener('click', () => { bar.remove(); void perform(items); });
          const cancel = createButton(); cancel.textContent = '取消'; cancel.addEventListener('click', () => bar.remove());
          bar.append(scope, ...items.map((item) => { const line = document.createElement('p'); line.textContent = `${item.suggestion!.quote} → ${item.suggestion!.replacement}`; return line; }), confirm, cancel); actions.append(bar);
        });
        actions.append(batchButton);
      }
      root.append(summary, groups, filter, list, actions);
    } catch {
      if (!root.isConnected || request !== generation) return;
      signature = '';
      root.dataset['findingsState'] = 'failed';
      root.replaceChildren();
      const retry = createButton(); retry.type = 'button'; retry.textContent = FINDINGS_CENTER_WORDS.unavailable; retry.addEventListener('click', () => void load(offset)); root.append(retry);
    } finally { loading = false; if (request === generation) root.removeAttribute('aria-busy'); }
  };
  const visible = (): void => { if (document.visibilityState === 'visible') void load(offset); };
  document.addEventListener('visibilitychange', visible);
  const timer = window.setInterval(() => { if (!root.isConnected) { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); } else if (!root.querySelector('.findings-confirm') && document.visibilityState === 'visible') void load(offset); }, 2000);
  void load(0);
}
