import type { QuickActionDefaults } from '../shared/preferences.js';

let writes = Promise.resolve();
export async function readActionDefaults(): Promise<QuickActionDefaults> {
  await writes;
  const defaults = (await window.ai7.getPreferences()).values['actions.defaults'];
  // Legacy chapter ids belong to one imported Book, never to global defaults.
  return { ...defaults, reviewFrom: null, reviewTo: null };
}
/** Serialize patches so independently mounted forms cannot overwrite each other's remembered defaults. */
export async function rememberActionDefaults(patch: Partial<QuickActionDefaults>): Promise<void> {
  const write = writes.then(async () => {
    const current = (await window.ai7.getPreferences()).values['actions.defaults'];
    await window.ai7.savePreference({ key: 'actions.defaults', value: { ...current, ...patch, reviewFrom: null, reviewTo: null } });
  });
  writes = write.catch(() => undefined);
  await write;
}
