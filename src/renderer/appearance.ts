import { isThemePreference, type AppearanceRendererApi, type AppearanceState, type ThemePreference } from '../shared/appearance.js';
import type { PreferencesRendererApi } from '../shared/preferences.js';

/** Only root decoration changes: no screen replacement, focus, selection, scroll or editor transaction. */
export function applyAppearance(root: Pick<HTMLElement, 'dataset' | 'style'>, state: AppearanceState): void {
  const theme = state.preference === 'system' ? (state.systemDark ? 'dark' : 'light') : state.preference;
  root.dataset['theme'] = theme;
  root.style.colorScheme = theme;
}

export function createAppearance(api: Pick<PreferencesRendererApi, 'savePreference'> & AppearanceRendererApi) {
  let preference: ThemePreference = 'system';
  let systemDark = false;
  let revision = 0;
  const listeners = new Set<() => void>();
  const update = (state: AppearanceState): void => {
    revision += 1;
    preference = state.preference;
    systemDark = state.systemDark;
    applyAppearance(document.documentElement, state);
    for (const listener of listeners) listener();
  };
  const ready = new Promise<void>((resolve) => {
    api.onAppearanceChanged((state) => { update(state); resolve(); });
  });
  return {
    ready,
    get preference() { return preference; },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async choose(value: ThemePreference): Promise<void> {
      const requestedAt = revision;
      const saved = (await api.savePreference({ key: 'appearance.theme', value })).values['appearance.theme'];
      if (revision === requestedAt && isThemePreference(saved)) update({ preference: saved, systemDark });
    },
  };
}
