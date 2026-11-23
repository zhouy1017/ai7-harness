import { canonicalJson, hasExactKeys, isRecord, sha256Hex } from '../analysis/canonical.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import type { QualifiedLearningExample } from '../../shared/protocol/learning.js';
import type { OutboundDataCategory } from '../provider/egress-gate.js';
import type { ProviderTestItemSlice } from '../provider/provider-result-cache.js';
import { DEFAULT_TRANSPORT_SETTINGS } from '../provider/request-deadlines.js';
import { reviewCategoryEntry } from '../review/category-configuration.js';

export type FlashTaskResult<Output> =
  | { state: 'checked'; value: Output }
  | { state: 'fallback' | 'outcome-unknown'; value: Output | null; reason: string };

export interface FlashTaskContract<Input, Output> {
  readonly kindId: string;
  readonly label: string;
  readonly role: 'underlying-flash' | 'foreground-flash';
  readonly outboundCategory: OutboundDataCategory;
  readonly productionCategory?: OutboundDataCategory;
  readonly systemPrompt: string;
  readonly promptContractDigest: string;
  readonly slice: ProviderTestItemSlice;
  readonly budget: { maxInputBytes: number; maxOutputTokens: number; firstByteSeconds: number; idleSeconds: number };
  readonly message: (input: Input) => string;
  readonly validateAndTrace: (rawText: string, source: Input) => Output | null;
  readonly fallback: (source: Input) => Output | null;
}

/** The enabled-learning lane supplies its own pinned sender. Both lanes check the same registered contract before returning data. */
export async function runStructuredFlashTask<Input, Output>(contract: FlashTaskContract<Input, Output>, source: Input,
  send: (message: string) => Promise<string | { reason: string; outcomeUnknown?: boolean }>): Promise<FlashTaskResult<Output>> {
  if (!Object.is(STRUCTURED_FLASH_TASKS[contract.kindId as keyof typeof STRUCTURED_FLASH_TASKS], contract)) throw new Error('FLASH_CONTRACT_UNKNOWN');
  const message = contract.message(source);
  const fallback = (reason: string, unknown = false): FlashTaskResult<Output> =>
    ({ state: unknown ? 'outcome-unknown' : 'fallback', value: contract.fallback(source), reason });
  if (Buffer.byteLength(message) > contract.budget.maxInputBytes) return fallback('输入超过本次任务的范围。');
  const answer = await send(message);
  if (typeof answer !== 'string') return fallback(answer.reason, answer.outcomeUnknown);
  const value = contract.validateAndTrace(answer, source);
  return value === null ? fallback('返回内容未能对应输入。') : { state: 'checked', value };
}

function structured<Input, Output>(kindId: string, label: string, productionCategory: OutboundDataCategory, systemPrompt: string,
  validate: (answer: unknown, source: Input) => Output | null, fallback: (source: Input) => Output | null = () => null,
  message: (source: Input) => string = canonicalJson): FlashTaskContract<Input, Output> {
  return { kindId, label, role: 'underlying-flash', outboundCategory: 'public-or-synthetic', productionCategory, systemPrompt,
    promptContractDigest: sha256Hex(canonicalJson({ kindId, version: 1, systemPrompt })), slice: 'S80',
    budget: { maxInputBytes: 131072, maxOutputTokens: 4096, firstByteSeconds: DEFAULT_TRANSPORT_SETTINGS.firstByteSeconds,
      idleSeconds: DEFAULT_TRANSPORT_SETTINGS.idleSeconds }, message, fallback,
    validateAndTrace(rawText, source) {
      try { return validate(JSON.parse(rawText), source); } catch { return null; }
    } };
}

function strings(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && new Set(value).size === value.length &&
    value.every(entry => typeof entry === 'string' && entry.trim() !== '' && entry.isWellFormed() && !/\p{Cc}/u.test(entry));
}

export const queryExpansion = structured<string, string[]>('retrieval-query-expansion', '扩展检索词', 'frozen-material-reference-excerpt',
  '只输出 JSON 字符串数组，含三至五个同义检索词，每项最多64字符。', value =>
    strings(value, 5) && value.length >= 3 && value.every(term => term.length <= 64) ? value : null, query => [query]);

export interface RerankInput { query: string; candidates: readonly { id: string; preview: string }[] }
export const retrievalRerank = structured<RerankInput, string[]>('retrieval-rerank', '整理检索候选', 'frozen-material-reference-excerpt',
  '按相关度输出候选 id 的 JSON 数组，可排除无关候选，不添加新 id。', (value, source) =>
    strings(value, source.candidates.length) && value.every(id => source.candidates.some(item => item.id === id)) ? value : null,
  source => source.candidates.map(candidate => candidate.id));

export const guidelineClauses = structured<readonly string[], string[]>('guideline-clause-formatting', '整理审阅规范条款', 'house-review-guideline-clause',
  '按原文顺序分为最多40条条款，每条最多300字。仅返回原文片段的 JSON 数组。', (value, paragraphs) => {
    if (!strings(value, 40) || value.length === 0 || value.some(clause => graphemesOf(clause).length > 300)) return null;
    const source = paragraphs.join('\n');
    let cursor = 0;
    for (const clause of value) {
      const start = source.indexOf(clause, cursor);
      if (start < 0 || source.slice(cursor, start).trim()) return null;
      cursor = start + clause.length;
    }
    return source.slice(cursor).trim() ? null : value;
  });

export interface StandardRow { paragraph: number; recommended: string; discouraged: string[]; status: '待确认' | '未识别'; reason: string }
export const standardsTable = structured<readonly string[], StandardRow[]>('standards-table-formatting', '整理字表与词表', 'frozen-material-reference-excerpt',
  '返回 JSON 行数组，每行含 paragraph（从1起）、recommended、discouraged。recommended 为推荐词形，discouraged 为不推荐词形数组（可为空）。逐项引用所在段落的原文。', (value, source) => {
    if (!Array.isArray(value) || value.length > 500) return null;
    const rows: StandardRow[] = [];
    for (const row of value) {
      if (!isRecord(row) || !hasExactKeys(row, ['paragraph','recommended','discouraged']) ||
          typeof row.paragraph !== 'number' || !Number.isSafeInteger(row.paragraph) ||
          typeof row.recommended !== 'string' || !strings(row.discouraged, 64)) return null;
      const paragraph = source[row.paragraph - 1];
      const traced = paragraph !== undefined && row.recommended.trim().length > 0 &&
        paragraph.includes(row.recommended) && row.discouraged.every(form => paragraph.includes(form));
      rows.push({ paragraph: row.paragraph, recommended: traced ? row.recommended : '', discouraged: traced ? row.discouraged : [],
        status: traced ? '待确认' : '未识别', reason: traced ? '请核对原文与用法。' : '词形未对应所引原文。' });
    }
    return rows;
  });

export interface TidiedExample { example: QualifiedLearningExample; editorialDimension: string }
function digests(example: QualifiedLearningExample) {
  return { beforeDigest: sha256Hex(canonicalJson(example.before)), afterDigest: sha256Hex(canonicalJson(example.after)) };
}
export const learningTidying = structured<readonly QualifiedLearningExample[], TidiedExample[]>('learning-sample-tidying', '预整理学习样例',
  'qualified-learning-example-bundle', '筛去重复与偶然修改，只输出 JSON 数组。每项保留输入 exampleId、beforeDigest、afterDigest，添加审阅类别标识 editorialDimension。不创作文字或规则。',
  (value, examples) => {
    if (!Array.isArray(value) || value.length > examples.length) return null;
    const kept: TidiedExample[] = [];
    for (const item of value) {
      if (!isRecord(item) || !hasExactKeys(item, ['exampleId','beforeDigest','afterDigest','editorialDimension']) ||
          typeof item.editorialDimension !== 'string' || reviewCategoryEntry(item.editorialDimension) === null) return null;
      const example = examples.find(candidate => candidate.exampleId === item.exampleId);
      if (!example || kept.some(entry => entry.example === example)) return null;
      const pinned = digests(example);
      if (pinned.beforeDigest !== item.beforeDigest || pinned.afterDigest !== item.afterDigest) return null;
      kept.push({ example, editorialDimension: item.editorialDimension });
    }
    return kept;
  }, () => null, examples => canonicalJson(examples.map(example => ({ ...example, ...digests(example) }))));

export const STRUCTURED_FLASH_TASKS = { 'standards-table-formatting': standardsTable, 'learning-sample-tidying': learningTidying,
  'retrieval-query-expansion': queryExpansion, 'retrieval-rerank': retrievalRerank, 'guideline-clause-formatting': guidelineClauses } as const;
