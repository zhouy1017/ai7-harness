import type { BookVersionRow, BookVersionScope, RendererApi } from '../shared/protocol.js';
import { mountManuscriptExport } from './manuscript-export.js';

export function mountBookVersions(scope: BookVersionScope, options: {
  api: RendererApi;
  element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K];
  button(label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void): HTMLButtonElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  open(): Promise<void>;
}): HTMLElement {
  const { api, element, button, setStatus } = options;
  const root = element('details', 'review-section book-versions');
  const list = element('ol');
  const selection = element('div', 'version-selection');
  const pages = element('div', 'button-row');
  const exportSlot = element('div');
  root.append(element('summary', undefined, '版本列表'), list, pages, selection, exportSlot);
  let request = 0;
  let pending = false;
  const exports = mountManuscriptExport({ root: exportSlot, bookId: scope.bookId, api, setStatus, errorMessage: options.errorMessage,
    onChanged: () => {}, openerOf: () => null });
  const fail = (error: unknown) => { if (root.isConnected) setStatus(options.errorMessage(error, '版本操作未完成，请刷新后再试。'), 'error'); };
  async function load(offset: number, paging?: 'previous' | 'next'): Promise<void> {
    const current = ++request;
    selection.replaceChildren(element('p', undefined, '正在读取版本列表…'));
    root.dataset['versionState'] = 'loading';
    try {
      const page = await api.listBookVersions({ ...scope, offset });
      if (!root.isConnected || current !== request) return;
      selection.replaceChildren();
      list.replaceChildren(); pages.replaceChildren();
      for (const row of page.rows) {
        const item = element('li'); item.dataset['kind'] = row.kind; item.dataset['revisionId'] = row.revisionId;
        const actions = element('div', 'button-row');
        actions.append(button('查看', 'quiet', () => void view(row, null)), exports.menu({ kind: 'revision', revisionId: row.revisionId }, row.label),
          button('恢复到此版本', 'secondary', () => {
            ++request;
            const confirm = button('确认恢复', 'primary', async () => {
              if (pending) return;
              pending = true; confirm.disabled = true;
              try {
                await api.restoreBookVersion({ ...scope, revisionId: row.revisionId, expectedDigest: page.workingDigest, expectedBase: page.baseRevisionId });
                if (!root.isConnected) return;
                setStatus(`已恢复：${row.label}。原工作稿已自动保存。`, 'success');
                await options.open();
              } catch (error) { fail(error); await load(offset); } finally { pending = false; }
            });
            selection.replaceChildren(element('p', undefined, `恢复「${row.label}」？当前工作稿会存为「恢复前自动保存」。恢复后可按 Ctrl+Z 撤销。`),
              confirm, button('取消', 'quiet', () => selection.replaceChildren()));
            confirm.focus();
          }));
        item.append(element('strong', undefined, row.label), element('time', undefined, new Date(row.createdAt).toLocaleString('zh-CN')), actions); list.append(item);
      }
      const previous = offset > 0 ? button('上一页版本', 'quiet', () => void load(Math.max(0, offset - 30), 'previous')) : null;
      const next = page.more ? button('下一页版本', 'quiet', () => void load(offset + page.rows.length, 'next')) : null;
      if (previous) pages.append(previous);
      if (next) pages.append(next);
      if (paging) (paging === 'next' ? next ?? previous : previous ?? next)?.focus();
      root.dataset['versionState'] = 'ready';
      root.dataset['versionOffset'] = String(offset);
    } catch (error) {
      if (current !== request || !root.isConnected) return;
      root.dataset['versionState'] = 'failed';
      selection.replaceChildren(element('p', undefined, options.errorMessage(error, '版本列表未能打开。')),
        button('重新读取版本列表', 'secondary', () => void load(offset)));
      fail(error);
    }
  }
  async function view(row: BookVersionRow, cursor: string | null): Promise<void> {
    const current = ++request;
    try {
      const page = await api.viewBookVersion({ ...scope, revisionId: row.revisionId, cursor });
      if (current !== request || !root.isConnected) return;
      const heading = element('h4', undefined, `${row.label}（只读）`);
      heading.tabIndex = -1;
      selection.replaceChildren(heading, element('p', undefined, page.position.label),
        ...page.blocks.map(block => element('p', 'version-paragraph', block.text)));
      if (page.previousCursor) selection.append(button('上一页正文', 'quiet', () => void view(row, page.previousCursor)));
      if (page.nextCursor) selection.append(button('下一页正文', 'quiet', () => void view(row, page.nextCursor)));
      selection.scrollIntoView({ block: 'nearest' });
      heading.focus({ preventScroll: true });
    } catch (error) { if (current === request) fail(error); }
  }
  root.addEventListener('toggle', () => { if (root.open) void load(0); else ++request; });
  return root;
}
