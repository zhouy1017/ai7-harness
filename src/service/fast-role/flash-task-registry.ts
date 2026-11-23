import { sha256Hex } from '../analysis/canonical.js';
import { CONNECTION_TEST_KIND, CONNECTION_TEST_POLICY } from '../launch-policy.js';
import type { ProviderModelProfile } from '../provider/model-profile.js';
import { connectionTestTransport } from '../provider/request-deadlines.js';
import { MATERIAL_TRANSLATION_KIND, materialTranslation } from './material-translation-contract.js';
import { STRUCTURED_FLASH_TASKS, type FlashTaskContract } from './flash-task-contract.js';

export interface ProbeModelEvidence {
  readonly model: string;
  readonly family: ProviderModelProfile['capabilities']['requestShape'];
}

/** Buffered probes accept the requested name or the family's versioned spelling of that same name. */
function matchesResponseModel(requested: string, value: string, family: ProbeModelEvidence['family']): boolean {
  const actual = family === 'google-generate-content' ? value.replace(/^models\//u, '') : value;
  if (actual === requested) return true;
  if (!actual.startsWith(requested + '-')) return false;
  const suffix = actual.slice(requested.length + 1);
  if (family === 'google-generate-content') return /^\d{3}$/u.test(suffix);
  if (family === 'anthropic-messages') return /^\d{8}$/u.test(suffix);
  return /^\d{4}-\d{2}-\d{2}$/u.test(suffix);
}

export const connectionProbe = {
  kindId: CONNECTION_TEST_KIND, label: '测试文本连接', role: 'underlying-flash', outboundCategory: 'public-or-synthetic', slice: 'S80',
  systemPrompt: CONNECTION_TEST_POLICY.systemPrompt, promptContractDigest: sha256Hex(JSON.stringify(CONNECTION_TEST_POLICY)),
  budget: { ...connectionTestTransport(), maxInputBytes: CONNECTION_TEST_POLICY.maxInputCharacters, maxOutputTokens: CONNECTION_TEST_POLICY.maxOutputTokens },
  message: () => CONNECTION_TEST_POLICY.message,
  validateAndTrace: (text: string, source: { model: string; reported: ProbeModelEvidence | undefined }) =>
    source.reported && matchesResponseModel(source.model, source.reported.model, source.reported.family) && text.trim() ? text : null,
  fallback: () => null,
} as const satisfies FlashTaskContract<{ model: string; reported: ProbeModelEvidence | undefined }, string>;

export const FLASH_TASK_REGISTRY = { ...STRUCTURED_FLASH_TASKS, [MATERIAL_TRANSLATION_KIND]: materialTranslation, [CONNECTION_TEST_KIND]: connectionProbe };
