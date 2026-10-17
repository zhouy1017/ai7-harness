import { PREFERENCE_KEYS, type AppearanceState, type ThemePreference } from '../shared/preferences.js';

export const APPEARANCE_CHOICES: ReadonlyArray<{ value: ThemePreference; label: string; description: string }> = [
  { value: 'system', label: '跟随系统', description: '随本机的浅色或深色外观自动切换。' },
  { value: 'light', label: '浅色', description: '使用冷灰外壳与微暖的稿件背景。' },
  { value: 'dark', label: '深色', description: '使用低亮度的深灰外壳与中性稿件背景。' },
];

/** Only root decoration changes: no screen replacement, focus, selection, scroll or editor transaction. */
export function applyAppearance(root: Pick<HTMLElement, 'dataset' | 'style'>, state: AppearanceState): void {
  const theme = state.preference === 'system' ? (state.systemDark ? 'dark' : 'light') : state.preference;
  root.dataset['theme'] = theme;
  root.style.colorScheme = theme;
}

export function createAppearance(api: Pick<Window['ai7'], 'getPreferences' | 'savePreference' | 'onAppearanceChanged'>) {
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
      const values = await api.savePreference({ key: 'appearance.theme', value });
      const saved = values['appearance.theme'];
      if (revision === requestedAt && PREFERENCE_KEYS['appearance.theme'].validate(saved)) update({ preference: saved, systemDark });
    },
  };
}
