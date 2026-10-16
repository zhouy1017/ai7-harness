import type { BookSummaryCursor, BookSummaryProjection, ImportedSkillRevisionProjection, ImportedSkillsProjection, RendererApi } from '../shared/protocol.js';
import { importedSkillCeilingLines, importedSkillIdentityLine, IMPORTED_SKILLS_HEADING, IMPORTED_SKILLS_NO_EXECUTOR } from './imported-skill-labels.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
interface Options {
  readonly root: HTMLElement;
  readonly api: Pick<RendererApi, 'importSkillPackage' | 'inspectImportedSkills' | 'validateImportedSkill' | 'installImportedSkill' | 'enableImportedSkill' | 'listBooks'>;
  setStatus(text: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
}
/** ADR 0090: inert files and conversion are inspectable before separate installation and scoped enablement. */
export function mountImportedSkills({ root, api, setStatus, errorMessage }: Options): { load(): Promise<void> } {
  let projection: ImportedSkillsProjection = { skills: [], revision: null, nextBefore: null };
  let busy = false;
  let books: BookSummaryProjection[] = [];
  let booksAfter: BookSummaryCursor | null = null;
  let selectedBook = '';
  const button = (text: string, action: string, run: () => Promise<void>): HTMLButtonElement => {
    const node = el('button', text); node.type = 'button'; node.className = 'quiet'; node.dataset['skillAction'] = action;
    node.disabled = busy; node.addEventListener('click', () => void act(run)); return node;
  };
  async function act(run: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true; render();
    try { await run(); setStatus('外部 Skill 记录已更新'); }
    catch (error) { setStatus(errorMessage(error, '无法处理这个 Skill。'), 'error'); }
    finally { busy = false; if (root.isConnected) { render(); root.querySelector<HTMLElement>('[data-skill-detail] h4')?.focus(); } }
  }
  async function inspect(revisionId: string | null, before: string | null = null): Promise<void> {
    const next = await api.inspectImportedSkills({ revisionId, before });
    if (!root.isConnected) return;
    projection = next;
  }
  async function changed(revision: ImportedSkillRevisionProjection): Promise<void> {
    await inspect(revision.revisionId);
  }
  async function readBooks(more = false): Promise<void> {
    const page = await api.listBooks({ after: more ? booksAfter : null });
    books = more ? [...books, ...page.items] : [...page.items]; booksAfter = page.nextCursor;
  }
  function render(): void {
    const heading = el('h3', IMPORTED_SKILLS_HEADING);
    const importButton = button('导入 Skill…', 'import', async () => {
      const revision = await api.importSkillPackage();
      if (revision !== null) await changed(revision);
    });
    const directoryButton = button('从目录导入 Skill…', 'import-directory', async () => {
      const revision = await api.importSkillPackage({ kind: 'directory' });
      if (revision !== null) await changed(revision);
    });
    const list = el('ul'); list.className = 'imported-skill-list';
    for (const skill of projection.skills) {
      const item = el('li'); item.dataset['skillId'] = skill.skillId;
      item.dataset['skillState'] = skill.state;
      item.append(el('span', importedSkillIdentityLine(skill)), button('查看修订', 'inspect', () => inspect(skill.revisionId)));
      list.append(item);
    }
    root.replaceChildren(heading, el('p', IMPORTED_SKILLS_NO_EXECUTOR), importButton, directoryButton, list);
    if (projection.skills.length === 0) root.append(el('p', '尚未导入外部 Skill。'));
    if (projection.nextBefore !== null) root.append(button('更多 Skill', 'more', () => inspect(null, projection.nextBefore)));
    if (projection.revision === null) return;
    const revision = projection.revision;
    const detail = el('article'); detail.className = 'imported-skill-detail'; detail.dataset['skillDetail'] = revision.revisionId;
    detail.dataset['skillState'] = revision.state;
    const title = el('h4', importedSkillIdentityLine(revision)); title.tabIndex = -1;
    detail.append(title, el('p', `来源：${revision.sourcePath}`), el('p', `许可：${revision.license ?? '未提供'}`), el('p', `声明文件：${revision.notices.join('、') || '未提供'}`));
    const identities = el('details'); identities.append(el('summary', '查看技术详情'));
    identities.append(el('p', `来源快照：${revision.snapshotId} · SHA-256 ${revision.snapshotSha256}`), el('p', `工作修订：${revision.revisionId} · SHA-256 ${revision.workingSha256}`));
    detail.append(identities);
    const conversion = el('section'); conversion.append(el('h5', '转换报告'));
    for (const [key, label] of [['preserved', '保留'], ['mapped', '确定性映射'], ['reviewRequired', '需要审查'], ['unsupported', '不支持']] as const) {
      const list = el('ul');
      for (const line of revision.conversion[key]) list.append(el('li', line));
      conversion.append(el('h6', label), revision.conversion[key].length === 0 ? el('p', '无') : list);
    }
    detail.append(conversion);
    // Text is assigned only with textContent: imported Markdown/HTML and script members never become active UI.
    const files = el('details'); files.append(el('summary', '来源快照与工作修订文件'));
    for (const [label, records] of [['来源快照', revision.files], ['工作修订', revision.workingFiles]] as const) {
      files.append(el('h5', label));
      for (const file of records) {
        const member = el('details'); member.append(el('summary', `${file.path} · ${file.bytes} 字节 · SHA-256 ${file.sha256}`));
        const bytes = Uint8Array.from(atob(file.base64), (value) => value.charCodeAt(0));
        member.append(el('pre', new TextDecoder().decode(bytes))); files.append(member);
      }
    }
    detail.append(files, el('h5', 'AI7 权限上限'));
    for (const line of importedSkillCeilingLines(revision.ceiling)) detail.append(el('p', line));
    for (const reason of revision.reasons) detail.append(el('p', reason));
    if (revision.previousRevisionId !== null) detail.append(button('查看上一修订', 'previous', () => inspect(revision.previousRevisionId)));
    if (revision.state === 'pending-validation') detail.append(button('验证 Skill', 'validate', async () => changed(await api.validateImportedSkill({ revisionId: revision.revisionId }))));
    if (revision.state === 'validated') detail.append(button('安装（暂不启用）', 'install', async () => changed(await api.installImportedSkill({ revisionId: revision.revisionId, previewDigest: revision.previewDigest }))));
    if (revision.state === 'restricted' || revision.state === 'rejected') detail.append(el('p', '这一修订保持可查看。请在原目录修复后重新导入，生成后继修订；旧记录不改写。'));
    if (revision.state === 'installed-disabled' || revision.state === 'enabled') {
      const label = el('label', '为图书启用：');
      const select = el('select'); select.dataset['skillField'] = 'book'; select.disabled = busy;
      select.append(new Option('请选择图书', ''));
      for (const book of books) select.append(new Option(book.title, book.bookId));
      select.value = selectedBook;
      select.addEventListener('change', () => { selectedBook = select.value; render(); });
      label.append(select); detail.append(label);
      if (books.length === 0 || booksAfter !== null) detail.append(button(books.length === 0 ? '选择图书…' : '更多图书', 'books', () => readBooks(books.length > 0)));
      const enable = button('启用', 'enable', async () => changed(await api.enableImportedSkill({ revisionId: revision.revisionId, bookId: selectedBook, previewDigest: revision.previewDigest })));
      enable.disabled ||= selectedBook === '' || revision.enabledBooks.includes(selectedBook);
      detail.append(enable, el('p', `已为 ${revision.enabledBooks.length} 本图书启用；仍不运行任何内容。`));
    }
    root.append(detail);
  }
  return { async load() { await inspect(null); if (root.isConnected) render(); } };
}
