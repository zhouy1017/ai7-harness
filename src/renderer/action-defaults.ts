import { DEFAULT_QUICK_ACTIONS, type QuickActionDefaults } from '../shared/preferences.js';

let current: QuickActionDefaults = { ...DEFAULT_QUICK_ACTIONS };
let loaded: Promise<void> | undefined;
let writes = Promise.resolve();
export function readActionDefaults(): Promise<QuickActionDefaults> {
  loaded ??= window.ai7.getPreferences().then((page) => { current = page.values['actions.defaults']; });
  return loaded.then(() => current);
}
/** Serialize patches so independently mounted forms cannot overwrite each other's remembered defaults. */
export async function rememberActionDefaults(patch: Partial<QuickActionDefaults>): Promise<void> {
  await readActionDefaults();
  current = { ...current, ...patch };
  const value = current;
  const write = writes.then(() => window.ai7.savePreference({ key: 'actions.defaults', value })).then(() => undefined);
  writes = write.catch(() => undefined);
  await write;
}
