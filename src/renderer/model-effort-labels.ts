import { technicalWords } from './technical-layer.js';

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

/**
 * A frozen `名称@档位` label as a chooser's summary or a task card shows it: the level in the same word the list uses. The record
 * keeps the service's level name, and developer mode shows the record as it is.
 */
export function modelEffortWords(label: string): string {
  const at = label.lastIndexOf('@');
  const level = at < 0 ? '' : label.slice(at + 1);
  const word = LEVEL_WORDS[level] ?? (/^\d+$/u.test(level) ? `思考上限 ${level}` : undefined);
  return word === undefined ? label : technicalWords(label, `${label.slice(0, at)}@${word}`);
}

/** What a role or a record uses, in the same words as the list. */
export function effortValueLabel(effort: string | null | undefined): string {
  return effort === undefined || effort === null || effort === 'off' ? MODEL_DEFAULT_EFFORT_LABEL : effortLevelLabel(effort);
}
