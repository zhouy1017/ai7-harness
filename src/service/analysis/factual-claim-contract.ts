import { ModelResultReader, NO_USABLE_MODEL_ENTRIES, type SalvagedModelResult, canonicalJson, sha256Hex } from './canonical.js';
import type { EvidenceAssuranceLevel } from '../../shared/protocol.js';
import { FACTUAL_REVIEW_PROMPT_CONTRACT, preOccurrenceFactualPrompt, FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, parseFactualReviewUnitResult, type FactualUnitAssertion } from './factual-review-contract.js';
import { parseFactualEvidenceRelations, parseFactualCorrectionVariants, type FactualEvidenceRelation, type FactualCorrectionEntry } from './factual-review-contract-v2.js';
import { FACTUAL_CLAIM_EXTRACTION_CONTRACT, FACTUAL_CLAIM_VERIFICATION_CONTRACT } from './factual-claim-ledger.js';
import { factualReviewLevelDefinition, type AnalysisKindDefinition } from './kind-definition.js';
import { reduceFactualReview, type FactualUnitOutcome } from './factual-review-reducers.js';
import { FixtureReplayResearchCapability } from '../capabilities/research.js';

export const FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA = 'ai7.factual-claim-verification-result/1' as const;

/** A new prompt pin; the existing v1/v2 prompts and fixture identities remain immutable. */
export const FACTUAL_CLAIM_EXTRACTION_PROMPT = {
  schema: FACTUAL_CLAIM_EXTRACTION_CONTRACT,
  systemPrompt: preOccurrenceFactualPrompt(FACTUAL_REVIEW_PROMPT_CONTRACT.systemPrompt).replaceAll(FACTUAL_REVIEW_UNIT_RESULT_SCHEMA, FACTUAL_CLAIM_EXTRACTION_CONTRACT),
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

/** Validate each assertion before canonicalization; JSON.stringify safely transports untrusted surrogates. */
export function parseFactualClaimExtraction(text: string, expected: { unitOrdinal: number; blockCount: number }) {
  const reader = ModelResultReader.read(text, FACTUAL_CLAIM_EXTRACTION_CONTRACT, expected.unitOrdinal);
  if (reader === null) return ModelResultReader.failure(text);
  if (reader.value.assertions === undefined && !reader.empty('assertions')) {
    return { ok: false as const, code: 'schema-invalid' as const, detail: NO_USABLE_MODEL_ENTRIES };
  }
  const parsed = parseFactualReviewUnitResult(JSON.stringify({ ...reader.value, schema: FACTUAL_REVIEW_UNIT_RESULT_SCHEMA }), expected);
  if (!parsed.ok) return parsed;
  reader.salvaged.push(...parsed.result.salvaged ?? []);
  return reader.finish({ schema: FACTUAL_CLAIM_EXTRACTION_CONTRACT, unitOrdinal: expected.unitOrdinal, assertions: parsed.result.assertions,
    ...(parsed.result.acceptedIndexes === undefined ? {} : { acceptedIndexes: parsed.result.acceptedIndexes }) });
}

export interface FactualClaimVerificationResult extends SalvagedModelResult {
  readonly schema: typeof FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA;
  readonly claimId: string;
  readonly evidenceRelations: readonly FactualEvidenceRelation[];
  readonly corrections: FactualCorrectionEntry['variants'];
}

/** Evidence keeps v2's bounds; identity and assertion text come solely from the frozen claim. */
export function parseFactualClaimVerification(text: string, claim: { readonly claimId: string; readonly assertion: FactualUnitAssertion }) {
  const reader = ModelResultReader.read(text, FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA);
  if (reader === null) return ModelResultReader.failure(text);
  if (reader.value.claimId !== claim.claimId) reader.drop('claimId', -1, 'request-claimId');
  const evidenceRelations = parseFactualEvidenceRelations(reader.value.evidenceRelations, reader, 'evidenceRelations', true);
  const corrections = parseFactualCorrectionVariants(reader.value.corrections, reader, 'corrections');
  const hadEntries = [reader.value.evidenceRelations, reader.value.corrections].some((value) => Array.isArray(value) && value.length > 0);
  if (evidenceRelations.length + corrections.length === 0 && (hadEntries || !reader.empty('evidenceRelations') && !reader.empty('corrections'))) {
    return { ok: false as const, code: 'schema-invalid' as const, detail: NO_USABLE_MODEL_ENTRIES };
  }
  return reader.finish<FactualClaimVerificationResult>({ schema: FACTUAL_CLAIM_VERIFICATION_RESULT_SCHEMA, claimId: claim.claimId, evidenceRelations, corrections });
}

/** Stable historical intent vocabulary; reading it does not admit a new execution. */
export const FACTUAL_CLAIM_UPDATE_MODES: AnalysisKindDefinition['modes'] = [
    { mode: 'review-again', goal: '再次核查当前全书事实，保留此前核查历史。', label: '再次核查', meaning: '以新的明确授权重读全书并核查事实。', initial: false, rangeBound: false, recompute: 'everything' },
    { mode: 'review-range', goal: '按编辑最新要求补充证据的决定，对所选原文补充核查。', label: '补充核查', meaning: '对决定所绑定的原文与核查级别补充证据，保留原结果。', initial: false, rangeBound: true, recompute: 'selected-range' },
];

/** The claim successor for whole and range tasks; frozen legacy plans keep their prompt pins. */
export function factualClaimKindDefinition(level: 'standard' | 'strict'): AnalysisKindDefinition {
  const base = factualReviewLevelDefinition(level);
  const verification = factualClaimVerificationPrompt(level);
  const verificationPromptDigest = sha256Hex(canonicalJson(verification));
  const promptContractDigest = sha256Hex(canonicalJson({ extraction: FACTUAL_CLAIM_EXTRACTION_PROMPT, verification }));
  return { ...base,
    factualClaims: { level, verificationPrompt: verification.systemPrompt, verificationPromptDigest },
    systemPrompt: FACTUAL_CLAIM_EXTRACTION_PROMPT.systemPrompt, promptContractDigest,
    unitResultSchema: FACTUAL_CLAIM_EXTRACTION_CONTRACT,
    schemaDigest: sha256Hex(canonicalJson({ promptContractDigest, verificationPromptDigest })),
    researchDeclaration: { webSearch: true, searchEngine: 'user-selected-backend' },
    assurance: null, assuranceAbsentReason: '断言工序不增加抽样回合。',
    executionSteps: ['逐单元抽取断言', '冻结精确断言及其出处', '逐断言联网取证', '归并已定位发现'],
    parseUnitResult: (text, unit) => parseFactualClaimExtraction(text, { unitOrdinal: unit.ordinal, blockCount: unit.overlapBlockIds.length + unit.blockIds.length }),
    requestDigest: (ordinal, digest) => sha256Hex(canonicalJson({ promptContractDigest, ordinal, digest })),
    unitRecord: (result) => {
      const extraction = result as SalvagedModelResult & { assertions: readonly FactualUnitAssertion[] };
      return { assertions: extraction.assertions, ...(extraction.salvaged === undefined ? {} : { salvaged: extraction.salvaged }) };
    },
    unitResultOfRecord: (record, unitOrdinal) => ({ schema: FACTUAL_CLAIM_EXTRACTION_CONTRACT, unitOrdinal, assertions: record.assertions,
      ...(record.salvaged === undefined ? {} : { salvaged: record.salvaged }) }),
    reduce: (input) => {
      const reduction = reduceFactualReview({ ...input, outcomes: input.outcomes as readonly FactualUnitOutcome[],
        research: new FixtureReplayResearchCapability(), exactOccurrences: true });
      return { ...reduction, components: { findings: reduction.findings, excluded: reduction.excluded,
        assertionCounts: reduction.assertionCounts, research: reduction.research }, conflictCount: 0 };
    },
  };
}
