import { MAIN_EVENTS } from '../shared/protocol.js';
import type { OwnedRendererWindow } from './application-types.js';

export type RestoreOnQuit = () => Promise<unknown>;

export function createApplicationQuit(windows: () => Iterable<OwnedRendererWindow>, quit: () => void) {
  let restoreOnShutdown: RestoreOnQuit | undefined;
  const takeRestore = (): RestoreOnQuit | undefined => {
    const restore = restoreOnShutdown;
    restoreOnShutdown = undefined;
    return restore;
  };
  const blocked = (): boolean => {
    const risky = [...windows()].filter((owned) => owned.closeRisk && !owned.window.isDestroyed());
    if (risky.length === 0) return false;
    takeRestore();
    for (const owned of risky) owned.window.webContents.send(MAIN_EVENTS.closeBlocked);
    return true;
  };
  return {
    blocked,
    takeRestore,
    request(restore?: RestoreOnQuit): 'quitting' | 'blocked' {
      if (blocked()) return 'blocked';
      restoreOnShutdown = restore;
      setImmediate(quit);
      return 'quitting';
    },
  };
}
