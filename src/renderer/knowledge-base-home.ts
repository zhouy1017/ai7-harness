import type { RendererApi } from '../shared/protocol.js';
import { createButton } from './components/controls.js';
import { visibleKnowledgeBaseTabs, type KnowledgeBaseTab } from './knowledge-base-labels.js';

interface Summary {
  count: string;
  latest: string;
  changes?: ReadonlyArray<{ title: string; at: string }>;
}

/** Summaries reuse bounded read projections; a plus sign discloses another page. */
export function mountKnowledgeBaseHome(root: HTMLElement, api: RendererApi, developer: boolean,
  open: (tab: KnowledgeBaseTab) => void): Promise<void> {
  const summaries: Record<KnowledgeBaseTab, () => Promise<Summary>> = {
    guidelines: async () => {
      const page = await api.inspectReviewGuidelines();
      const changes = page.documents.flatMap((document) => document.versions.flatMap((version) =>
        version.recordedAt === null ? [] : [{ title: document.title, at: version.recordedAt }]));
      changes.sort((a, b) => b.at.localeCompare(a.at));
      return { count: `${page.documents.length} 份`, latest: changes[0]?.title ?? '内置规范', changes };
    },
    evaluation: async () => {
      const page = await api.inspectEvaluationProfiles();
      return { count: `${page.profiles.length}${page.nextBefore == null ? '' : '+'} 个`, latest: page.profiles[0]?.title ?? '暂无方案' };
    },
    rules: async () => {
      const page = await api.procedureLibrary({ action: 'inspect' });
      return { count: `${page.procedures.length} 个工序`, latest: '未记录更新时间' };
    },
    memory: async () => {
      const page = await api.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
      const changes = page.items.map(({ current }) => ({ title: current.title, at: current.recordedAt }))
        .sort((a, b) => b.at.localeCompare(a.at));
      return { count: `${page.items.length}${page.nextItemOffset === null ? '' : '+'} 条`, latest: changes[0]?.title ?? '暂无记忆', changes };
    },
    exemplars: async () => {
      const page = await api.inspectExemplars();
      const changes = page.books.map((book) => ({ title: book.bookTitle, at: book.designatedAt }))
        .sort((a, b) => b.at.localeCompare(a.at));
      return { count: `${page.books.length}${page.nextCursor === null ? '' : '+'} 本图书`, latest: changes[0]?.title ?? '暂无范例', changes };
    },
    library: async () => {
      const page = await api.inspectLibraryMaterials();
      return { count: `${page.materials.length}${page.nextCursor === null ? '' : '+'} 份`,
        latest: page.materials[0]?.title ?? '暂无资料',
        changes: page.materials.map((material) => ({ title: material.title, at: material.recordedAt })) };
    },
    external: async () => ({ count: '未提供', latest: '在各书的来源与证据中查看' }),
  };
  const grid = document.createElement('div');
  grid.className = 'knowledge-category-grid';
  const recent = document.createElement('section');
  recent.className = 'knowledge-recent';
  const heading = document.createElement('h3');
  heading.textContent = '最近变化';
  const list = document.createElement('ul');
  recent.append(heading, list);
  const changes: Array<{ tab: KnowledgeBaseTab; category: string; title: string; at: string }> = [];
  const refresh = (): void => {
    list.replaceChildren();
    for (const change of changes.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)) {
      const item = document.createElement('li');
      const link = createButton();
      link.classList.add('quiet');
      link.textContent = `${change.category} · ${change.title}`;
      link.title = link.textContent;
      link.addEventListener('click', () => open(change.tab));
      item.append(link);
      list.append(item);
    }
    if (changes.length === 0) {
      const item = document.createElement('li');
      item.textContent = '暂无近期变化。';
      list.append(item);
    }
  };
  root.append(grid, recent);
  const reads = visibleKnowledgeBaseTabs(developer).map((view) => {
    const card = createButton();
    card.classList.add('knowledge-category');
    card.dataset['knowledgeCategory'] = view.tab;
    card.setAttribute('aria-label', view.label);
    const title = document.createElement('strong');
    title.textContent = view.label;
    const count = document.createElement('span');
    count.className = 'knowledge-category-count';
    count.textContent = '读取中…';
    const sentence = document.createElement('span');
    sentence.textContent = view.holds;
    const latest = document.createElement('span');
    latest.className = 'knowledge-category-latest';
    card.append(title, count, sentence, latest);
    card.addEventListener('click', () => open(view.tab));
    grid.append(card);
    return summaries[view.tab]().then((summary) => {
      if (!root.isConnected) return;
      count.textContent = summary.count;
      latest.textContent = `最近：${summary.latest}`;
      latest.title = latest.textContent;
      changes.push(...(summary.changes ?? []).map((change) => ({ ...change, category: view.label, tab: view.tab })));
      refresh();
    }, () => {
      count.textContent = '暂时无法读取';
      latest.textContent = '打开分类后重试';
    });
  });
  refresh();
  return Promise.all(reads).then(() => { root.dataset['knowledgeHomeReady'] = 'true'; });
}
