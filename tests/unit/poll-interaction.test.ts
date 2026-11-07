import { expect, it, vi } from 'vitest';
import { retainPollInteraction } from '../../src/renderer/poll-interaction.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

it('restores a closed progressive trigger through its native select before enhancement runs', () => {
  const uninstall = installMiniDom();
  try {
    const root = miniDocument.createElement('section'); miniDocument.body.append(root);
    const select = miniDocument.createElement('select'), trigger = miniDocument.createElement('button');
    select.className = 'ui-select-native'; select.setAttribute('aria-label', '模型');
    trigger.className = 'ui-select-trigger'; trigger.setAttribute('aria-label', '模型');
    root.append(select, trigger); trigger.focus();
    const restore = retainPollInteraction(root as unknown as HTMLElement);
    const next = miniDocument.createElement('select'); next.setAttribute('aria-label', '模型'); next.value = 'latest';
    root.replaceChildren(next); restore();
    // The minimal DOM keeps native fallback; a real DOM enhances this selected focus target synchronously.
    expect(document.activeElement === (next as unknown as Element)).toBe(true); expect(next.value).toBe('latest');
  } finally { uninstall(); }
});

it('retains action identity, unsent text, selection and nested scroll while records reorder or disappear (#1375)', async () => {
  const uninstall = installMiniDom(); vi.useFakeTimers();
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  let cycle = 0;
  const paint = () => {
    const restore = retainPollInteraction(root as unknown as HTMLElement);
    root.replaceChildren(...(cycle === 0 ? ['a', 'b'] : cycle < 3 ? ['b', 'a'] : ['b']).map((id) => {
      const card = miniDocument.createElement('article'); card.dataset['taskItem'] = id;
      const more = miniDocument.createElement('details'); more.className = 'task-overview-more';
      const summary = miniDocument.createElement('summary');
      const action = miniDocument.createElement('button'); action.dataset['taskAction'] = 'run';
      const input = miniDocument.createElement('textarea'); input.name = 'answer';
      more.append(summary, action, input); card.append(more); return card;
    })); restore();
  };
  try {
    paint(); const card = root.querySelector('[data-task-item="a"]')!;
    card.querySelector('details')!.open = true; card.scrollTop = 48;
    const input = card.querySelector('textarea')!; input.value = '公开合成未发送输入'; input.setSelectionRange(2, 5, 'backward'); input.focus();
    const timer = setInterval(() => { cycle++; paint(); }, 2000);
    for (let index = 0; index < 2; index++) {
      await vi.advanceTimersByTimeAsync(2000);
      const current = root.querySelector('[data-task-item="a"]')!; const field = current.querySelector('textarea')!;
      expect(current.querySelector('details')!.open).toBe(true); expect(current.scrollTop).toBe(48);
      expect(document.activeElement).toBe(field); expect([field.value, field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual(['公开合成未发送输入', 2, 5, 'backward']);
    }
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector('[data-task-item="a"]')).toBeNull(); expect(root.querySelector('[data-task-item="b"] details')!.open).toBe(false);
    clearInterval(timer);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); uninstall(); }
});
