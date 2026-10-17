import type { BookFindingProjection, BookFindingsProjection } from '../shared/protocol.js';

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
      summary.textContent = page.total === 0 ? '暂无发现' : `共 ${page.total} 项待处理发现 · 每页最多 ${page.pageSize} 项`;
      const filter = document.createElement('select');
      filter.setAttribute('aria-label', '发现类别');
      const all = document.createElement('option');
      all.value = ''; all.textContent = '全部类别'; filter.append(all);
      const groups = document.createElement('ul');
      for (const group of page.groups) {
        const option = document.createElement('option'); option.value = group.category; option.textContent = `${group.label} · ${group.count}`; filter.append(option);
        const line = document.createElement('li');
        line.textContent = `${group.label} · ${group.count} · ${Object.entries(group.bySeverity).map(([key, count]) => `${key} ${count}`).join(' / ')} · ${Object.entries(group.byStatus).map(([key, count]) => `${key} ${count}`).join(' / ')}`;
        groups.append(line);
      }
      filter.value = category;
      const list = document.createElement('div');
      const paint = (): void => {
        category = filter.value;
        list.replaceChildren();
        for (const group of page.groups.filter((entry) => category === '' || entry.category === category)) {
          const section = document.createElement('section');
          const heading = document.createElement('h3'); heading.textContent = group.label; section.append(heading);
          for (const item of page.items.filter((entry) => entry.category === group.category)) {
            const row = document.createElement('article'); row.dataset['findingId'] = item.id; row.dataset['findingKind'] = item.target.kind;
            const words = document.createElement('p'); words.textContent = `${item.severity} · ${item.status} · ${item.summary}`;
            const link = document.createElement('button'); link.type = 'button'; link.textContent = '查看记录与原文'; link.addEventListener('click', () => open(item));
            row.append(words, link); section.append(row);
          }
          if (section.childElementCount > 1) list.append(section);
        }
        if (list.childElementCount === 0 && page.total > 0) {
          const empty = document.createElement('p'); empty.textContent = '本页没有此类别的发现，请翻页查看。'; list.append(empty);
        }
      };
      filter.addEventListener('change', paint); paint();
      const actions = document.createElement('div'); actions.className = 'button-row';
      const action = (label: string, disabled: boolean, run: () => void): void => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = disabled; button.addEventListener('click', run); actions.append(button);
      };
      action('上一页', offset === 0, () => void load(Math.max(0, offset - page.pageSize)));
      action('下一页', page.next === null, () => void load(page.next!));
      action('刷新发现', false, () => void load(offset));
      root.append(summary, groups, filter, list, actions);
    } catch {
      if (!root.isConnected || request !== generation) return;
      root.dataset['findingsState'] = 'failed';
      root.replaceChildren();
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '无法读取发现，重试'; retry.addEventListener('click', () => void load(offset)); root.append(retry);
    } finally { if (request === generation) root.removeAttribute('aria-busy'); }
  };
  void load(0);
}
