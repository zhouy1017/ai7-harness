import type { RendererApi } from '../shared/protocol.js';
import type { AppearanceRendererApi } from '../shared/appearance.js';
import type { NotificationsRendererApi, PreferencesRendererApi } from '../shared/preferences.js';

declare global {
  interface Window {
    readonly ai7: RendererApi & PreferencesRendererApi & AppearanceRendererApi & NotificationsRendererApi;
  }
}

export {};
