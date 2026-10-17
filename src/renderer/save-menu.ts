import { SAVE_MENU_WORDS } from './save-menu-labels.js';

export interface SaveMenuPersistence { dirty: boolean; saving: boolean; retryRequired: boolean; interrupted: boolean }

/** Only a settled, acknowledged editor reads as written; every other state says what is still pending. */
export function persistenceConfirmed(state: SaveMenuPersistence): boolean {
  return !state.dirty && !state.saving && !state.retryRequired && !state.interrupted;
}

export function saveMenuPersistenceLine(state: SaveMenuPersistence, changedSince: string | null): string {
  const persistence = state.retryRequired || state.interrupted ? SAVE_MENU_WORDS.unconfirmed
    : state.saving ? SAVE_MENU_WORDS.writing : state.dirty ? SAVE_MENU_WORDS.unwritten : SAVE_MENU_WORDS.written;
  return changedSince === null ? persistence : `${persistence} · ${changedSince}`;
}

/** Hosts the existing milestone form unchanged; the persistence words remain independently visible. */
export function createSaveMenu(form: HTMLElement, exportManuscript: () => void): {
  element: HTMLElement;
  /** `null` until the editor has reported its persistence state. */
  update(state: SaveMenuPersistence | null, changedSince: string | null): void;
  destroy(): void;
} {
  const menu = document.createElement('details'); menu.className = 'editor-save-menu'; menu.dataset['saveMenu'] = 'manuscript';
  const summary = document.createElement('summary');
  let latest: { state: SaveMenuPersistence | null; changedSince: string | null } = { state: null, changedSince: null };
  const render = (): void => {
    const protection = document.documentElement.dataset['editingProtection'];
    const protectedNow = protection === 'active' || protection === 'read-only';
    const line = latest.state === null ? SAVE_MENU_WORDS.confirming : saveMenuPersistenceLine(latest.state, latest.changedSince);
    summary.textContent = `${protectedNow ? SAVE_MENU_WORDS.unconfirmed : line} ▾`;
    menu.dataset['persistence'] = !protectedNow && latest.state !== null && persistenceConfirmed(latest.state) ? 'confirmed' : 'unconfirmed';
  };
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-editing-protection'] });
  render();
  const body = document.createElement('div'); body.className = 'editor-save-menu-body';
  const exportAction = document.createElement('button'); exportAction.type = 'button'; exportAction.textContent = SAVE_MENU_WORDS.exportManuscript;
  exportAction.addEventListener('click', () => { menu.open = false; exportManuscript(); });
  body.append(form, exportAction); menu.append(summary, body);
  menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); menu.open = false; summary.focus(); } });
  return { element: menu, update: (state, changedSince) => { latest = { state, changedSince }; render(); }, destroy: () => observer.disconnect() };
}
