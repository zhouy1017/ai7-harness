// Application Theme Preference (Issue #935, wave 11 slice 11b; V2-UX-VIS-004..010): the choice is the `appearance.theme`
// key of the local preferences (seam map §2); what follows is the appearance-only event the main process sends every owned
// window when the choice or the operating system's light/dark state changes. Decoration only: it is no service operation,
// carries no protocol number, and no record, export or model context reads it (VIS-009).

export type ThemePreference = 'system' | 'light' | 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** The chosen preference and the main process's nativeTheme reading (the OS state while the choice is 跟随系统). */
export interface AppearanceState {
  readonly preference: ThemePreference;
  readonly systemDark: boolean;
}

/** Main → renderer push on every change, and the renderer's one initial read of the same state. */
export const APPEARANCE_IPC_CHANNEL = 'ai7:appearance:changed';

/** The preload member beside the two preference members; main-owned, no service op. */
export interface AppearanceRendererApi {
  /** Delivers the initial main-process snapshot, then changes in every owned window; returns the unsubscribe. */
  onAppearanceChanged(listener: (state: AppearanceState) => void): () => void;
}
