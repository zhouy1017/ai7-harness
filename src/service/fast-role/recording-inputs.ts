import { canonicalJson, isRecord } from '../analysis/canonical.js';
import type { LearningCurationBundle } from '../../shared/protocol/learning.js';

/** Fixed synthetic inputs for the ADR 0108 recording cases that do not have a manuscript source pin. */
const sources = {
  'standards-table-formatting': ['统一写作「样例甲」，不用「样例乙」。'],
  'guideline-clause-formatting': ['合成规范：本样例只检查章节标题的格式。'],
  'retrieval-query-expansion': '合成灯塔档案',
} as const;

const rerankPreviews = new Set(['合成灯塔档案的开篇简介。', '合成博物馆的展览目录。']);

export function isSyntheticRecordingInput(kind: string, message: string): boolean {
  if (Object.hasOwn(sources, kind)) return message === canonicalJson(sources[kind as keyof typeof sources]);
  if (kind !== 'retrieval-rerank') return false;
  try {
    const input: unknown = JSON.parse(message);
    return isRecord(input) && Object.keys(input).length === 2 && input.query === sources['retrieval-query-expansion'] &&
      Array.isArray(input.candidates) && input.candidates.length > 0 && input.candidates.length <= rerankPreviews.size &&
      input.candidates.every(candidate => isRecord(candidate) && Object.keys(candidate).length === 2 &&
        typeof candidate.id === 'string' && /^[0-9a-f]{64}$/u.test(candidate.id) &&
        typeof candidate.preview === 'string' && rerankPreviews.has(candidate.preview));
  } catch {
    return false;
  }
}

export const SYNTHETIC_FLASH_RECORDING_KINDS = [
  'standards-table-formatting', 'guideline-clause-formatting', 'retrieval-query-expansion', 'retrieval-rerank',
] as const;

export function isSyntheticLearningRecording(bundle: LearningCurationBundle): boolean {
  const example = bundle.examples[0];
  return bundle.examples.length === 1 && example?.sourceKind === 'manual-edit-journal' &&
    canonicalJson(example.before) === '["样例乙"]' && canonicalJson(example.after) === '["样例甲"]' &&
    /^e[1-9]\d*$/u.test(example.exampleId) && /^s[1-9]\d*$/u.test(example.sourceRef) &&
    bundle.emittedText === canonicalJson({ schema: bundle.schema, examples: bundle.examples });
}
