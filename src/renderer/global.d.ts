import type { RendererApi } from '../shared/protocol.js';
import type { PreferencesRendererApi, NotificationsRendererApi } from '../shared/preferences.js';

declare global {
  interface Window {
    readonly ai7: RendererApi & PreferencesRendererApi & NotificationsRendererApi;
  }
}

export {};
