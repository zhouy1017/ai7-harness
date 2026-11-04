import { filterChoices, listPosition, stateTerm, type StateTone } from './components/controls.js';
import { createButton } from './components/controls.js';
import type { BookFindingProjection, BookFindingsProjection } from '../shared/protocol.js';
import { FINDINGS_CENTER_WORDS } from './findings-center-labels.js';

const STATUS_TONES: Readonly<Record<string, StateTone>> = {
  '未覆盖': 'attention', '待复核': 'attention',
  '待处理': 'progress', '已处理': 'good', '已忽略': 'neutral',
};

export function mountFindingsCenter(root: HTMLElement, read: (offset: number) => Promise<BookFindingsProjection>, open: (item: BookFindingProjection) => void): void {
  let offset = 0;
  let generation = 0;
  let category = '';
  const load = async (next: number): Promise<void> => {
    const request = ++generation;
    root.setAttribute('aria-busy', 'true');
    try {
      const page = await read(next);
      if (!root.isConnected || request !== generation) return;
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
      const filter = filterChoices({ label: FINDINGS_CENTER_WORDS.filter,
        choices: [['', FINDINGS_CENTER_WORDS.allCategories], ...page.groups.map((group) => [group.category, `${group.label} · ${group.count}`] as const)],
        value: category, change: (value) => { category = value; paint(); },
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
            row.append(words, link); section.append(row);
          }
          if (section.childElementCount > 1) list.append(section);
        }
        if (list.childElementCount === 0 && page.total > 0) {
          const empty = document.createElement('p'); empty.textContent = FINDINGS_CENTER_WORDS.pageEmpty; list.append(empty);
        }
      };
      paint();
      const actions = document.createElement('div'); actions.className = 'button-row';
      const action = (label: string, disabled: boolean, run: () => void): void => {
        const button = createButton(); button.type = 'button'; button.textContent = label; button.disabled = disabled; button.addEventListener('click', run); actions.append(button);
      };
      actions.append(listPosition({ offset, total: page.total, pageSize: page.pageSize, label: '发现位置', change: (next) => void load(next) }));
      action(FINDINGS_CENTER_WORDS.refresh, false, () => void load(offset));
      root.append(summary, groups, filter, list, actions);
    } catch {
      if (!root.isConnected || request !== generation) return;
      root.dataset['findingsState'] = 'failed';
      root.replaceChildren();
      const retry = createButton(); retry.type = 'button'; retry.textContent = FINDINGS_CENTER_WORDS.unavailable; retry.addEventListener('click', () => void load(offset)); root.append(retry);
    } finally { if (request === generation) root.removeAttribute('aria-busy'); }
  };
  void load(0);
}
