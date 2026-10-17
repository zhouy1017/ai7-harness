export function saveMenuPersistenceLine(state: { dirty: boolean; saving: boolean; retryRequired: boolean; interrupted: boolean }, changedSince: string | null): string {
  const persistence = state.retryRequired || state.interrupted ? '修订日志写入待确认'
    : state.saving ? '正在写入修订日志' : state.dirty ? '修改尚未写入修订日志' : '已写入修订日志';
  return changedSince === null ? persistence : `${persistence} · ${changedSince}`;
}

/** Hosts the existing milestone form unchanged; the persistence words remain independently visible. */
export function createSaveMenu(form: HTMLElement, exportManuscript: () => void): { element: HTMLElement; update(message: string): void; destroy(): void } {
  const menu = document.createElement('details'); menu.className = 'editor-save-menu'; menu.dataset['saveMenu'] = 'manuscript';
  const summary = document.createElement('summary');
  let latest = '正在确认修订日志';
  const render = (): void => {
    const protection = document.documentElement.dataset['editingProtection'];
    const protectedNow = protection === 'active' || protection === 'read-only';
    summary.textContent = `${protectedNow ? '修订日志写入待确认' : latest} ▾`;
    menu.dataset['persistence'] = !protectedNow && latest.startsWith('已写入修订日志') ? 'confirmed' : 'unconfirmed';
  };
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-editing-protection'] });
  render();
  const body = document.createElement('div'); body.className = 'editor-save-menu-body';
  const exportAction = document.createElement('button'); exportAction.type = 'button'; exportAction.textContent = '导出…';
  exportAction.addEventListener('click', () => { menu.open = false; exportManuscript(); });
  body.append(form, exportAction); menu.append(summary, body);
  menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); menu.open = false; summary.focus(); } });
  return { element: menu, update: (message) => { latest = message; render(); }, destroy: () => observer.disconnect() };
}
