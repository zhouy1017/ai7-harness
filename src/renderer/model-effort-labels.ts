import { technicalLayerVisible, technicalWords } from './technical-layer.js';

/** 思考强度's words, shared by 设置 › 模型服务 and the per-task chooser. */
export const MODEL_DEFAULT_EFFORT_LABEL = '模型默认';
export const EFFORT_UNKNOWN_NOTE = '还没有查到这个模型的可选强度。';
export const EFFORT_UNSUPPORTED_NOTE = '这个模型不能单独设置思考强度。';
export const EFFORT_STALE_NOTE = '之前选的强度现在不可用，请重新选择。';
export const EFFORT_APPLIES_NOTE = '只影响之后开始的任务。';

const LEVEL_WORDS: Readonly<Record<string, string>> = {
  none: '不启用思考', minimal: '最少', low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高',
};

/** A level's name: its ordinary word, with the service's own name beside it in developer mode. */
export function effortLevelLabel(level: string): string {
  const word = LEVEL_WORDS[level];
  if (word !== undefined) return `${word}${technicalWords(`（${level}）`)}`;
  return /^\d+$/u.test(level) ? technicalWords(`思考上限 ${level} 词元`, `思考上限 ${level}`) : level;
}

/** The saved level the model no longer offers, kept in the list until the editor chooses again. */
export function staleEffortLabel(level: string): string {
  const known = LEVEL_WORDS[level] !== undefined || /^\d+$/u.test(level);
  return `${known ? effortLevelLabel(level) : technicalWords(level, '之前选的强度')}（现在不可用）`;
}

const RECORDED_LEVEL = new RegExp(`@(${Object.keys(LEVEL_WORDS).join('|')})(?![\\w.-])`, 'gu');

/**
 * A recorded `名称@档位` as a surface shows it — a label on its own, or inside a sentence that names the model: the level in the
 * same word the list uses (`名称@高`, `名称@思考上限 8192`). The record keeps the service's level name; developer mode
 * (`technical`, by default the technical layer) shows the record as it is, and so does a level name with no word of its own.
 */
export function modelEffortWords(text: string, technical = technicalLayerVisible): string {
  if (technical) return text;
  return text.replace(RECORDED_LEVEL, (_match, level: string) => `@${LEVEL_WORDS[level]}`).replace(/@(\d+)$/u, '@思考上限 $1');
}

/** What a role or a record uses, in the same words as the list. */
export function effortValueLabel(effort: string | null | undefined): string {
  return effort === undefined || effort === null || effort === 'off' ? MODEL_DEFAULT_EFFORT_LABEL : effortLevelLabel(effort);
}
