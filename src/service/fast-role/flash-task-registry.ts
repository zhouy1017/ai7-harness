import { sha256Hex } from '../analysis/canonical.js';
import { CONNECTION_TEST_KIND, CONNECTION_TEST_POLICY } from '../launch-policy.js';
import { connectionTestTransport } from '../provider/request-deadlines.js';
import { MATERIAL_TRANSLATION_KIND, materialTranslation } from './material-translation-contract.js';
import { STRUCTURED_FLASH_TASKS, type FlashTaskContract } from './flash-task-contract.js';

export const connectionProbe = {
  kindId: CONNECTION_TEST_KIND, label: '测试文本连接', role: 'underlying-flash', outboundCategory: 'public-or-synthetic', slice: 'S80',
  systemPrompt: CONNECTION_TEST_POLICY.systemPrompt, promptContractDigest: sha256Hex(JSON.stringify(CONNECTION_TEST_POLICY)),
  budget: { ...connectionTestTransport(), maxInputBytes: CONNECTION_TEST_POLICY.maxInputCharacters, maxOutputTokens: CONNECTION_TEST_POLICY.maxOutputTokens },
  message: () => CONNECTION_TEST_POLICY.message,
  validateAndTrace: (text: string, source: { model: string; actualModel: string }) => source.model === source.actualModel && text.trim() ? text : null,
  fallback: () => null,
} as const satisfies FlashTaskContract<{ model: string; actualModel: string }, string>;

export const FLASH_TASK_REGISTRY = { ...STRUCTURED_FLASH_TASKS, [MATERIAL_TRANSLATION_KIND]: materialTranslation, [CONNECTION_TEST_KIND]: connectionProbe };
