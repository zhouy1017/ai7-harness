import type { EvidenceAssuranceLevel } from '../../shared/protocol.js';
import { canonicalJson, hasExactKeys, isRecord, sha256Hex } from './canonical.js';
import { FACTUAL_REVIEW_PROMPT_CONTRACT, FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, parseFactualReviewUnitResult, type FactualUnitAssertion } from './factual-review-contract.js';
import { FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, parseFactualReviewUnitResultV2, type FactualEvidenceRelation, type FactualCorrectionEntry } from './factual-review-contract-v2.js';
import { FACTUAL_CLAIM_EXTRACTION_CONTRACT, FACTUAL_CLAIM_VERIFICATION_CONTRACT } from './factual-claim-ledger.js';

export const FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA = 'ai7.factual-claim-verification-result/1' as const;

/** A new prompt pin; the existing v1/v2 prompts and fixture identities remain immutable. */
export const FACTUAL_CLAIM_EXTRACTION_PROMPT = {
  schema: FACTUAL_CLAIM_EXTRACTION_CONTRACT,
  systemPrompt: FACTUAL_REVIEW_PROMPT_CONTRACT.systemPrompt.replaceAll(FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, FACTUAL_CLAIM_EXTRACTION_CONTRACT),
  responseSchema: FACTUAL_CLAIM_EXTRACTION_CONTRACT,
  tools: [],
} as const;

export function factualClaimVerificationPrompt(level: Exclude<EvidenceAssuranceLevel, 'quick'>) {
  return { schema: FACTUAL_CLAIM_VERIFICATION_CONTRACT, evidenceAssuranceLevel: level, responseSchema: FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA,
    systemPrompt: [
      '你是 AI7 的单条事实核查组件。只核查用户消息中 claimId 指定的断言；sourceUnitMessage 只提供这条断言的原始上下文，不抽取或核查其他断言。',
      '只使用本次计划声明的 websearch 与 webfetch。检索词由公开事实主题概括，不包含稿件原文、标题、作者或文件名。模型知识不是证据。',
      '同一断言最多提交三条不同的检索查询。已提交失败或结果未知的查询也占用额度，不能重发。继续核查只使用本会话剩余额度。',
      '优先读取不同发布方、不同域名的原始来源。转载、转引、译介或摘述不是独立原始来源，逐项如实标注 lineage。',
      '只输出 JSON，精确包含 schema、claimId、evidenceRelations、corrections 四个键。',
      `schema 固定为 ${FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA}；claimId 必须与输入一致。`,
      'evidenceRelations 每项精确包含 sourceRef、relation、excerptRef、lineage。sourceRef 必须是工具实际返回的 https 来源。',
      'relation 取 支持/部分支持/反驳/仅提供背景/关系待判断；excerptRef 是读取的逐字原文，不超过 200 字素，没读到时为 null。',
      'lineage 取 original/quoted/syndicated/translated/summarized，无法判断时为 null。最多八项关系；没有证据时返回空数组，保持无法确证。',
      'corrections 是数组；仅在证据表明有误时给出一至三项，每项精确包含 text（最多 200 字素）与 rationale（最多 120 字素）。无需改正时为空数组。',
      level === 'strict' ? '严格核查：尽量找到至少两个独立原始来源，证据不足或冲突时如实保留。' : '标准核查：读取能精确说明问题的原文，如实保留不足和冲突。',
    ].join('\n'), tools: ['websearch', 'webfetch'] as const };
}

function readObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text)?.[1] ?? text);
    return isRecord(value) ? value : null;
  } catch { return null; }
}

/** Reuse the established assertion limits and class/reference parser, without accepting an old contract response. */
export function parseFactualClaimExtraction(text: string, expected: { unitOrdinal: number; blockCount: number }) {
  const value = readObject(text);
  if (value?.schema !== FACTUAL_CLAIM_EXTRACTION_CONTRACT) return { ok: false as const, code: 'schema-invalid' as const, detail: '结果不符合断言抽取契约。' };
  const parsed = parseFactualReviewUnitResult(canonicalJson({ ...value, schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA }), expected);
  if (!parsed.ok) return parsed;
  const result = { ...parsed.result, schema: FACTUAL_CLAIM_EXTRACTION_CONTRACT };
  const json = canonicalJson(result);
  return { ok: true as const, result, canonicalJson: json, digest: sha256Hex(json) };
}

export interface FactualClaimVerificationResult {
  readonly schema: typeof FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA;
  readonly claimId: string;
  readonly evidenceRelations: readonly FactualEvidenceRelation[];
  readonly corrections: FactualCorrectionEntry['variants'];
}

/** Evidence keeps v2's bounds; identity and assertion text come solely from the frozen claim. */
export function parseFactualClaimVerification(text: string, claim: { readonly claimId: string; readonly assertion: FactualUnitAssertion }) {
  const value = readObject(text);
  const invalid = () => ({ ok: false as const, code: 'schema-invalid' as const, detail: '结果不符合这条断言的联网取证契约。' });
  if (value === null || !hasExactKeys(value, ['schema', 'claimId', 'evidenceRelations', 'corrections']) ||
    value.schema !== FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA || value.claimId !== claim.claimId || !Array.isArray(value.corrections)) return invalid();
  const parsed = parseFactualReviewUnitResultV2(canonicalJson({ schema: FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA, unitOrdinal: 1,
    assertions: [{ ...claim.assertion, evidenceRelations: value.evidenceRelations }],
    corrections: value.corrections.length === 0 ? [] : [{ assertionRef: 1, variants: value.corrections }],
  }), { unitOrdinal: 1, blockCount: claim.assertion.blockOrdinal });
  if (!parsed.ok || parsed.result.schema !== FACTUAL_REVIEW_UNIT_RESULT_V2_SCHEMA) return invalid();
  const evidenceRelations = parsed.result.assertions[0]!.evidenceRelations;
  if (evidenceRelations.some((relation) => !relation.sourceRef.startsWith('https://'))) return invalid();
  const result: FactualClaimVerificationResult = { schema: FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA, claimId: claim.claimId,
    evidenceRelations, corrections: parsed.result.corrections[0]?.variants ?? [] };
  const json = canonicalJson(result);
  return { ok: true as const, result, canonicalJson: json, digest: sha256Hex(json) };
}
