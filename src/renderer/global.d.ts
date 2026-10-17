import type { RendererApi } from '../shared/protocol.js';
import type { AppearanceRendererApi } from '../shared/appearance.js';
import type { PreferencesRendererApi } from '../shared/preferences.js';

declare global {
  interface Window {
    readonly ai7: RendererApi & PreferencesRendererApi & AppearanceRendererApi;
  }
}

export {};
