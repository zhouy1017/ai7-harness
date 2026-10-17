/** Local display configuration only; never part of the service protocol or an export. */
export type ThemePreference = 'system' | 'light' | 'dark';
export const PREFERENCE_KEYS = {
  'appearance.theme': { validate: (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark', default: 'system' },
} as const;

export const PREFERENCE_CHANNELS = {
  get: 'ai7:preferences:get',
  save: 'ai7:preferences:save',
  appearance: 'ai7:appearance:changed',
} as const;

export interface AppearanceState {
  preference: ThemePreference;
  systemDark: boolean;
}

// Desktop-only additions do not change the service protocol version.
declare module './protocol.js' {
  interface RendererApi {
    getPreferences(): Promise<Record<string, unknown>>;
    savePreference(input: { key: string; value: unknown }): Promise<Record<string, unknown>>;
    /** Delivers the initial main-process snapshot, then changes in every owned window. */
    onAppearanceChanged(listener: (state: AppearanceState) => void): () => void;
  }
}
