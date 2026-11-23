import { rendererApi } from './navigation-generation.js';
import type { QuickActionDefaults } from '../shared/preferences.js';
import { EVIDENCE_ASSURANCE_DEFAULT_LEVEL, EVIDENCE_ASSURANCE_LEVELS, type EvidenceAssuranceLevel } from '../shared/protocol/factual-verification.js';

let writes = Promise.resolve();
export async function readActionDefaults(): Promise<QuickActionDefaults> {
  await writes;
  const defaults = (await rendererApi.getPreferences()).values['actions.defaults'];
  // Legacy chapter ids belong to one imported Book, never to global defaults.
  return { ...defaults, reviewFrom: null, reviewTo: null };
}
/** Serialize patches so independently mounted forms cannot overwrite each other's remembered defaults. */
export async function rememberActionDefaults(patch: Partial<QuickActionDefaults>): Promise<void> {
  const write = writes.then(async () => {
    const current = (await rendererApi.getPreferences()).values['actions.defaults'];
    await rendererApi.savePreference({ key: 'actions.defaults', value: { ...current, ...patch, reviewFrom: null, reviewTo: null } });
  });
  writes = write.catch(() => undefined);
  await write;
}

/** The 核查力度 the editor last planned or started a 事实核查 with (新建审阅); a stored value that is no level reads as 标准核查. */
export async function readEvidenceAssuranceLevel(): Promise<EvidenceAssuranceLevel> {
  await writes;
  const stored: unknown = (await rendererApi.getPreferences()).values['review.evidenceAssuranceLevel'];
  return EVIDENCE_ASSURANCE_LEVELS.find((level) => level === stored) ?? EVIDENCE_ASSURANCE_DEFAULT_LEVEL;
}
/** Through the same chain as the other remembered choices, so two forms cannot write over each other. */
export async function rememberEvidenceAssuranceLevel(level: EvidenceAssuranceLevel): Promise<void> {
  const write = writes.then(() => rendererApi.savePreference({ key: 'review.evidenceAssuranceLevel', value: level }));
  writes = write.then(() => undefined, () => undefined);
  await write;
}
