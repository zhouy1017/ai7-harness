import { technicalWords } from './technical-layer.js';

/**
 * Service-authored sentences in the editor's words (Issue #1531, plan #1516 §5): the ONE place where a sentence the service
 * hands to the renderer is reworded for ordinary mode. Some of these sentences are recorded (run transitions, review
 * reports under a digest) or bound to a plan envelope, so they are never changed at their source; developer mode reads them
 * as recorded. The rules are phrases of the table, longest and most specific first, each written for the sentences that
 * carry it (the PR lists them); a sentence that holds none of them comes back unchanged.
 */
const RULES: ReadonlyArray<readonly [RegExp, string | ((...parts: string[]) => string)]> = [
  // 阅读范围 / 单元 → 部分 (by the sentence's grammar: a numbered part, a count of parts, the parts in general).
  [/第 ([\d、]+) 个阅读范围/gu, '正文第 $1 部分'],
  [/([\d,]+ \/ [\d,]+|[\d,]+|全部 [\d,]+) 个(要重新分析的)?阅读范围/gu, (_all, count: string, again?: string) => `${count} 个${again ?? ''}部分`],
  [/(各|所读|这个|同一个|两个|这些|其余|一个)阅读范围/gu, '$1部分'],
  [/阅读范围/gu, '部分'],
  [/结果未知的单元缺口/gu, '结果未知的未完成部分'],
  [/不重试，记为缺口/gu, '不重试，留作未完成的部分'],
  [/记为缺口/gu, '留作未完成的部分'],
  [/保留缺口/gu, '有未完成的部分'],
  [/缺口/gu, '未完成的部分'],
  [/结果集修订版/gu, '分析结果'],
  // 续行 → 继续; 改计划重做 / 再做一次 → 重新开始; 重新准备 only makes a new plan: it says so (review S3).
  [/续行/gu, '继续'],
  [/改计划重做/gu, '重新开始'],
  [/再做一次/gu, '重新开始'],
  [/重新准备(计划|任务)?/gu, '另做一份计划'],
  [/按新计划开始/gu, '重新开始'],
  [/停止任务/gu, '取消任务'],
  // 名额 and 派发.
  [/等待运行名额/gu, '排队中'],
  [/运行名额已满/gu, '正在排队'],
  [/派发前已阻止/gu, '没有开始'],
  // One name per thing.
  [/应用结果待确认|应用凭据/gu, '修改是否生效待确认'],
  [/(API )?凭据/gu, '密钥'],
  [/后台处理登记/gu, '空闲时自动更新分析'],
  [/本社审阅偏好/gu, '审阅偏好'],
  [/证据保证级别/gu, '核查力度'],
  [/学习准入/gu, '是否可用于学习'],
  [/随书稿件|生产文档|工作文档/gu, '衍生稿件'],
  [/AI7 初评|AI7 初稿|AI7 评估报告/gu, '评估报告'],
  [/修订建议|提议内容/gu, '修改建议'],
  [/出版社经验|全社|社级/gu, '本社'],
  [/当前更改尚未持久保存/gu, '还没有保存'],
  // tokens / 词元 → 用量: a count has no unit in ordinary mode, 用量 is its noun (Owner, 2026-11-19).
  [/预算上限（tokens）/gu, '用量上限'],
  [/(预算上限|登记上限|这次运行的上限) ([\d,]+) tokens/gu, (_all, _what: string, count: string) => `${_what === '这次运行的上限' ? '这次运行的用量上限' : '用量上限'} ${count}`],
  [/预算上限/gu, '用量上限'],
  [/(达到|至多) ([\d,]+) tokens/gu, '用量$1 $2'],
  [/用了 ([\d,]+) tokens/gu, '用量 $1'],
  [/份额 ([\d,]+) tokens/gu, '用量份额 $1'],
  [/([\d,]+) tokens/gu, '用量 $1'],
  [/tokens|词元/giu, '用量'],
];

/** The ordinary words of one service-authored sentence; developer mode reads it as the service wrote it. */
export function ordinaryServiceWords(sentence: string): string {
  let words = sentence;
  for (const [pattern, replacement] of RULES) words = words.replace(pattern, replacement as string);
  return words;
}

/** What a page shows for a service-authored sentence. */
export function serviceWords(sentence: string): string;
export function serviceWords(sentence: string | null): string | null;
export function serviceWords(sentence: string | null): string | null {
  return sentence === null ? null : technicalWords(sentence, ordinaryServiceWords(sentence));
}

/** Every string of a projection subtree in ordinary words — never the parts sent back to the service (`prepare`). */
export function serviceWordsDeep<T>(value: T): T {
  if (typeof value === 'string') return serviceWords(value) as T;
  if (Array.isArray(value)) return value.map((entry) => serviceWordsDeep(entry)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, key === 'prepare' ? entry : serviceWordsDeep(entry)])) as T;
  }
  return value;
}
