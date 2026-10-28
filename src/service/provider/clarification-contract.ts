import type { AnalysisKindDefinition } from '../analysis/kind-definition.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { unitRequestDigest } from '../analysis/contract.js';
import type { ClarificationFacts } from '../analysis/clarifications.js';

/** A separately versioned instruction block; the wrapped result contract retains its exact bytes. */
export const CLARIFICATION_INSTRUCTION = {
  schema: 'ai7.provider.clarification-instruction/2',
  systemPrompt: [
    '以下是单元契约的澄清指令 /2；它只扩展单元回合，不适用于跨单元归纳、抽样或运行反思。',
    '若本单元存在必须由编辑决定的歧义，你可以不输出单元结果，而只输出一个 JSON 对象：',
    '{"question":"一个简短明确的问题","options":["简短选项，最多四个"],"freeTextAllowed":true}。options 可省略；无选项时必须允许自行说明。',
    '问题最多 500 字素，每个选项最多 100 字素。只问一个问题；不要同时输出结果或其他键，不要为可从稿件判断的内容提问。',
    '每个单元最多问一次。收到「澄清回答 /2」后必须按原单元结果契约完成，不得再问；回答为「不回答」时据已知信息完成并保留不确定性。',
  ].join('\n'),
} as const;
export const CLARIFICATION_INSTRUCTION_DIGEST = sha256Hex(canonicalJson(CLARIFICATION_INSTRUCTION));
/** One declared live-validation retry, not a launch option or a product-selected instruction. */
export const AMBIGUOUS_CLARIFICATION_VALIDATION_INSTRUCTION = {
  ...CLARIFICATION_INSTRUCTION,
  validationVariant: 'ambiguous-editorial-focus',
  systemPrompt: `${CLARIFICATION_INSTRUCTION.systemPrompt}\n本次分析的阅读重点尚未决定：人物或事件；必须先问编辑确认重点，收到回答后再按原单元结果契约完成。`,
} as const;
const MARKER = /^AI7 单元指令\/2 · 请求摘要 ([0-9a-f]{64})$/mu;

export function clarificationMessageRequestDigest(message: string): string | null {
  return MARKER.exec(message)?.[1] ?? null;
}

/** Every Run kind shares this alternative; no dialogue or fast-role definition enters this seam. */
export function withModelClarification(definition: AnalysisKindDefinition): AnalysisKindDefinition {
  if (definition.clarificationBase !== undefined) return definition;
  return wrapClarification(definition, CLARIFICATION_INSTRUCTION);
}

/** Used by the declared external live-validation driver and its provider-free capture proof/replay. */
export function withAmbiguousClarificationValidation(definition: AnalysisKindDefinition): AnalysisKindDefinition {
  return wrapClarification(definition.clarificationBase ?? definition, AMBIGUOUS_CLARIFICATION_VALIDATION_INSTRUCTION);
}

function wrapClarification(
  definition: AnalysisKindDefinition,
  instruction: typeof CLARIFICATION_INSTRUCTION | typeof AMBIGUOUS_CLARIFICATION_VALIDATION_INSTRUCTION,
): AnalysisKindDefinition {
  const promptContractDigest = clarificationPromptContractDigest(definition.promptContractDigest, instruction);
  const requestDigest = (ordinal: number, digest: string): string => unitRequestDigest(promptContractDigest, ordinal, digest);
  return {
    ...definition,
    clarificationBase: definition,
    systemPrompt: `${definition.systemPrompt}\n\n${instruction.systemPrompt}`,
    promptContractDigest,
    schemaDigest: sha256Hex(canonicalJson({ baseSchemaDigest: definition.schemaDigest, promptContractDigest })),
    requestDigest,
    buildUnitMessage: (unit, total, blocks) => definition.buildUnitMessage(unit, total, blocks)
      .replace('\n', `\nAI7 单元指令/2 · 请求摘要 ${requestDigest(unit.ordinal, unit.digest)}\n`),
  };
}

/** Re-derived by frozen input readers; this validates an instruction binding and grants no eligibility. */
export function clarificationPromptContractDigest(
  basePromptContractDigest: string,
  instruction: typeof CLARIFICATION_INSTRUCTION | typeof AMBIGUOUS_CLARIFICATION_VALIDATION_INSTRUCTION = CLARIFICATION_INSTRUCTION,
): string {
  return sha256Hex(canonicalJson({
    schema: 'ai7.provider.clarification-prompt-contract/2',
    basePromptContractDigest,
    instruction,
  }));
}

/** The exact inner contract a frozen material reader reconstructs; invalid provenance never unwraps. */
export function clarificationPlanBaseDigest(execution: Record<string, unknown>, envelope: Record<string, unknown>): string | null {
  // A plan bound to a procedure version wraps its kind's contract; that contract, recorded beside it, is the one rebuilt (#1173).
  const outer = envelope.basePromptContractDigest ?? envelope.promptContractDigest;
  if (typeof outer !== 'string' || !/^[0-9a-f]{64}$/u.test(outer)) return null;
  const base = execution.clarificationBasePromptContractDigest;
  if (base === undefined) return outer;
  return typeof base === 'string' && /^[0-9a-f]{64}$/u.test(base) && clarificationPromptContractDigest(base) === outer ? base : null;
}

/** One isolated follow-up includes the frozen unit, its one question, and the exact recorded answer. */
export function buildClarificationAnswerMessage(unitMessage: string, request: Pick<ClarificationFacts, 'origin' | 'modelQuestion' | 'answer'>): string {
  if (request.origin !== 'model' || request.modelQuestion === undefined || request.answer === null) throw new Error('MODEL_CLARIFICATION_ANSWER_ABSENT');
  const answer = request.answer;
  const ordinal = /^model-option-([0-3])$/u.exec(answer.optionId)?.[1];
  const text = answer.optionId === 'no-answer' ? '不回答'
    : answer.optionId === 'free-text' ? answer.note!
      : request.modelQuestion.options![Number(ordinal)]!;
  const record = { schema: 'ai7.provider.clarification-answer-turn/2', question: request.modelQuestion, answer: text };
  // The second turn has a different fixture/cache key, including the answer, even on an identical unit.
  const blockIds = [...unitMessage.matchAll(/^\[(blk_[0-9a-f]{24})\]/gmu)].map((match) => match[1]!);
  const normalized = canonicalJson(record).replace(/blk_[0-9a-f]{24}/gu, (id) => {
    const index = blockIds.indexOf(id);
    return index < 0 ? id : `{{block:${index + 1}}}`;
  });
  const digest = sha256Hex(canonicalJson({ unitRequestDigest: clarificationMessageRequestDigest(unitMessage), answer: normalized }));
  return `${unitMessage.replace(MARKER, `AI7 单元指令/2 · 请求摘要 ${digest}`)}\n澄清回答 /2：\n${canonicalJson(record)}`;
}
