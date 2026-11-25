import { expect, it, vi } from 'vitest';
import { createApplicationQuit } from '../../src/main/application-quit.js';
import type { OwnedRendererWindow } from '../../src/main/application-types.js';
import { MAIN_EVENTS } from '../../src/shared/protocol.js';

it.each(['request', 'beforeQuit'])('notifies the blocking window and discards rollback at %s', async (guard) => {
  const send = vi.fn();
  const owned = { closeRisk: false, window: { isDestroyed: () => false, webContents: { send } } };
  const restore = vi.fn(async () => undefined);
  const beforeQuit = vi.fn(async () => {
    if (!quit.blocked()) await quit.takeRestore()?.();
  });
  const quit = createApplicationQuit(() => [owned as unknown as OwnedRendererWindow], beforeQuit);
  const nextTurn = () => new Promise(resolve => setImmediate(resolve));

  expect(quit.request(restore)).toBe('quitting');
  owned.closeRisk = true;
  if (guard === 'request') {
    expect(quit.request()).toBe('blocked');
    owned.closeRisk = false;
  }
  await nextTurn();
  expect(send).toHaveBeenCalledExactlyOnceWith(MAIN_EVENTS.closeBlocked);
  owned.closeRisk = false;
  await beforeQuit();
  expect(restore).not.toHaveBeenCalled();
  expect(quit.request(restore)).toBe('quitting');
  await nextTurn();
  expect(restore).toHaveBeenCalledTimes(1);
});
