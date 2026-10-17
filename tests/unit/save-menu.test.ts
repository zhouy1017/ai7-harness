import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveMenu, saveMenuPersistenceLine } from '../../src/renderer/save-menu.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

let restore: () => void;
const observers: Array<{ changed(): void; disconnect: ReturnType<typeof vi.fn> }> = [];
beforeEach(() => {
  restore = installMiniDom(); observers.length = 0;
  vi.stubGlobal('document', { createElement: miniDocument.createElement, documentElement: new MiniElement('html') });
  vi.stubGlobal('MutationObserver', class {
    disconnect = vi.fn();
    constructor(changed: () => void) { observers.push({ changed, disconnect: this.disconnect }); }
    observe(): void {}
  });
});
afterEach(() => { vi.unstubAllGlobals(); restore(); });

describe('the manuscript save menu persistence facts', () => {
  it('keeps confirmed journal persistence separate from modification since the milestone', () => {
    const state = { dirty: false, saving: false, retryRequired: false, interrupted: false };
    const changed = '自里程碑版本「合成里程碑」后有修改';
    expect(saveMenuPersistenceLine(state, changed)).toBe(`已写入修订日志 · ${changed}`);
    expect(saveMenuPersistenceLine({ ...state, dirty: true }, null)).toBe('修改尚未写入修订日志');
    expect(saveMenuPersistenceLine({ ...state, saving: true }, null)).toBe('正在写入修订日志');
    expect(saveMenuPersistenceLine({ ...state, retryRequired: true }, changed)).toBe(`修订日志写入待确认 · ${changed}`);
    expect(saveMenuPersistenceLine({ ...state, interrupted: true }, null)).toBe('修订日志写入待确认');
  });

  it('hosts the same form, offers export, and removes saved presentation in protection mode', () => {
    const form = document.createElement('details'); form.className = 'milestone-section';
    const exporter = vi.fn(); const menu = createSaveMenu(form, exporter);
    expect(menu.element.querySelector('.milestone-section')).toBe(form);
    menu.update('已写入修订日志');
    expect(menu.element.querySelector('summary')?.textContent).toBe('已写入修订日志 ▾');
    expect(menu.element.dataset['persistence']).toBe('confirmed');
    document.documentElement.dataset['editingProtection'] = 'active'; observers[0]!.changed();
    expect(menu.element.querySelector('summary')?.textContent).toBe('修订日志写入待确认 ▾');
    expect(menu.element.dataset['persistence']).toBe('unconfirmed');
    menu.element.querySelector('button')!.click(); expect(exporter).toHaveBeenCalledTimes(1);
    menu.destroy(); expect(observers[0]!.disconnect).toHaveBeenCalledTimes(1);
  });
});
