import { DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, sha256Hex } from './canonical.js';
import type { RunReportAccounting, RunReportSuggestion } from './run-report.js';

/**
 * Run Report Reflection Contract v1 (ADR 0066 §Run Report): the fourth product-built,
 * exact-versioned contract, and the only one that never sees the manuscript. After the revision is
 * persisted, the Run hands the model its own accounting — stage states, unit counts, gap and failure
 * codes, adaptation count, usage per stage, sample size and precision, and the counts of findings by
 * class — and asks what it would do differently on the next Run of this manuscript.
 *
 * Three things this contract deliberately is not. It is not a second system prompt: the
 * PrimaryAgentHarness freezes one system section at `prepareExecution` and the Egress Gate refuses a
 * payload whose system text differs from the Execution Binding, so the instruction text travels at
 * the top of the user message as frozen, digested contract text — the same move the three existing
 * contracts make. It is not a reading of the Book: the message carries no block, no quotation, and
 * no finding text, only counts and closed codes, which is what makes it safe to dispatch at all. And
 * it is not a verdict on the Run: an item is advice about the *next* Run's parameters — unit budget,
 * retry, which units to re-read, which finding classes to distrust — never an edit to a finding, a
 * re-ranking, or a proposal to change the manuscript.
 *
 * The prompt contract is frozen text. Its digest binds the deterministic fixture key; changing one
 * character of it changes every request digest, which is the intent.
 */
export const RUN_REPORT_REFLECTION_RESULT_SCHEMA = 'ai7.analysis.run-report-reflection-result/1' as const;
export const RUN_REPORT_REFLECTION_PROMPT_CONTRACT_SCHEMA = 'ai7.analysis.run-report-reflection-prompt-contract/1' as const;
export const RUN_REPORT_REFLECTION_CONTRACT_VERSION = 'ai7.analysis.run-report-reflection/1' as const;

/** ADR 0066's bound: at most ten items, so the list stays a list an Owner reads rather than a log. */
export const MAX_RUN_REPORT_REFLECTION_ITEMS = 10;
const MAX_TEXT_GRAPHEMES = 200;
/** Graphemes, the unit every bound in the three existing contracts is already measured in. */
const GRAPHEMES = new Intl.Segmenter('zh', { granularity: 'grapheme' });

function graphemeCount(text: string): number {
  let count = 0;
  for (const _segment of GRAPHEMES.segment(text)) count += 1;
  return count;
}

export interface RunReportReflectionResult {
  readonly schema: typeof RUN_REPORT_REFLECTION_RESULT_SCHEMA;
  readonly items: ReadonlyArray<RunReportSuggestion>;
}

export type RunReportReflectionParseFailureCode = 'not-json' | 'schema-invalid';

export type RunReportReflectionResultParse =
  | { ok: true; result: RunReportReflectionResult; canonicalJson: string; digest: string }
  | { ok: false; code: RunReportReflectionParseFailureCode; detail: string };

/** The frozen prompt contract. Every field is model-facing text or a fixed format; none is manuscript content. */
export const RUN_REPORT_REFLECTION_PROMPT_CONTRACT = {
  schema: RUN_REPORT_REFLECTION_PROMPT_CONTRACT_SCHEMA,
  contractVersion: RUN_REPORT_REFLECTION_CONTRACT_VERSION,
  responseSchema: RUN_REPORT_REFLECTION_RESULT_SCHEMA,
  instruction: [
    '以下是本次运行自身的账目摘要：各阶段的状态、单元计数、缺口与失败代码、计划内调整次数、各阶段用量、抽样规模与估计精度，以及各类发现的条数。请据此说明：如果对同一部稿件再运行一次，你会有哪些不同的做法。',
    '只依据本消息给出的账目判断。本消息不含任何稿件内容，也不含任何发现的文字；不要复述、推测或编造发现、人物、情节或引文，不要给出稿件修改建议，不调用任何工具。',
    '每条建议都应落在下一次运行可调整的做法上：单元预算、重试、需要重读哪些单元、需要降低信任的发现类别。不要评价稿件，也不要判定任何一条发现是否成立。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.analysis.run-report-reflection-result/1"）、',
    'items（数组；最多 10 项；每项含 suggestion、basis）。',
    'suggestion 说明下次运行的不同做法，不超过 200 个字素。',
    'basis 说明该建议依据账目中的哪些数字或代码，不超过 200 个字素。',
  ].join('\n'),
  messageHeader: '运行反思 {runRecordId} · 账目摘要 {accountingDigest}',
  accountingHeader: '以下为本次运行的账目摘要（仅计数、代码与摘要）：',
} as const;

export const RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(RUN_REPORT_REFLECTION_PROMPT_CONTRACT));

/**
 * The header carries every part of the request key that is not the frozen contract itself. The
 * accounting digest is that key, and the Run Record identity travels beside it so a reader of one
 * transcript line can tell which Run reflected — it is deliberately *not* part of the request digest,
 * because a Run Record is minted per Run and a fixture could never pin one.
 */
const HEADER_PATTERN = /^运行反思 ([A-Za-z0-9_-]{1,64}) · 账目摘要 ([0-9a-f]{64})$/u;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder);
}

/**
 * The exact user-role message for the one reflection turn: header, the frozen instruction text, then
 * the accounting as its own canonical JSON.
 *
 * The accounting travels as canonical JSON rather than as prose lines on purpose. It is the same
 * bytes the digest in the header was taken over, so a reader — and the deterministic adapter — can
 * see that the message says exactly what the key claims; and because every value in it is a count, a
 * closed code, an enum, or a digest, the whole message is provably free of manuscript content
 * without anyone having to read it.
 */
export function buildRunReportReflectionMessage(runRecordId: string, accounting: RunReportAccounting): string {
  const contract = RUN_REPORT_REFLECTION_PROMPT_CONTRACT;
  const accountingJson = canonicalJson(accounting);
  return [
    fill(contract.messageHeader, { runRecordId, accountingDigest: sha256Hex(accountingJson) }),
    contract.instruction,
    contract.accountingHeader,
    accountingJson,
  ].join('\n');
}

export interface RunReportReflectionMessageHeader {
  readonly runRecordId: string;
  readonly accountingDigest: string;
}

/** Recover the turn identity from a message built by {@link buildRunReportReflectionMessage}; `null` for anything else. */
export function parseRunReportReflectionMessageHeader(text: string): RunReportReflectionMessageHeader | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = HEADER_PATTERN.exec(firstLine);
  if (match === null) return null;
  return { runRecordId: match[1]!, accountingDigest: match[2]! };
}

/**
 * The request digest a deterministic fixture keys the reflection turn by beside unit ordinal `0`: a
 * pure function of the frozen prompt contract and the Run's own accounting. No minted identity — not
 * a block's, not a Run Record's, not a revision's — appears in it, and neither does a wall time, so a
 * hand-written fixture can pin it across imports of the same manuscript and across replays.
 */
export function runReportReflectionRequestDigest(promptContractDigest: string, accountingDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(accountingDigest)) {
    throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  }
  return sha256Hex(canonicalJson({ promptContractDigest, accountingDigest }));
}

function boundedText(value: unknown): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= MAX_TEXT_GRAPHEMES;
}

/**
 * Validate a model response against the reflection contract. Every refusal is one of two codes, and
 * the caller records it as the report's own `ifRedone` gap; nothing here throws, because an invalid
 * response costs the Run nothing — the revision is already persisted and immutable — and is a
 * disclosed absence in the report rather than a failed Run.
 */
export function parseRunReportReflectionResult(text: string): RunReportReflectionResultParse {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  const body = fenced?.[1] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  }
  const invalid = (detail: string): RunReportReflectionResultParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['schema', 'items'])) return invalid('运行反思结果键集合不符合契约 v1。');
  if (parsed.schema !== RUN_REPORT_REFLECTION_RESULT_SCHEMA) return invalid('运行反思结果 schema 不是契约 v1。');
  if (!Array.isArray(parsed.items) || parsed.items.length > MAX_RUN_REPORT_REFLECTION_ITEMS) {
    return invalid('运行反思条目集合缺失或超出边界。');
  }
  const items: RunReportSuggestion[] = [];
  for (const [index, candidate] of (parsed.items as unknown[]).entries()) {
    const label = `第 ${index + 1} 条建议`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['suggestion', 'basis'])) return invalid(`${label}的键集合不符合契约 v1。`);
    if (!boundedText(candidate.suggestion)) return invalid(`${label}的做法缺失或超出边界。`);
    if (!boundedText(candidate.basis)) return invalid(`${label}的依据缺失或超出边界。`);
    items.push({ suggestion: candidate.suggestion, basis: candidate.basis });
  }
  const result: RunReportReflectionResult = { schema: RUN_REPORT_REFLECTION_RESULT_SCHEMA, items };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}
