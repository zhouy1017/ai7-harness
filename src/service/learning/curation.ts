import type { QualifiedLearningExample, LearningCurationBudget, LearningCurationBundle, EnabledLearningEnvelope } from '../../shared/protocol/learning.js';
import { graphemesOf } from '../../shared/mark-anchor.js';
import { canonicalJson, isRecord, hasExactKeys, sha256Hex } from '../analysis/canonical.js';
import { reviewCategoryEntry } from '../review/category-configuration.js';

/** A single tool-free curation turn; source records are data, never instructions or votes. */
export const CURATION_CONTRACT = {
  schema: 'ai7.qualified-learning-curation/1',
  systemPrompt: [
    '你是编辑学习整理助手。只整理本次列出的真实编辑样例，不调用工具，不读取其他材料。',
    '原生决定的原因可能为空或由系统建议；手动修改和 Word 修改对没有决定、原因、采纳或独立支持票。',
    '过滤偶然改动，合并重复，保留不确定性和冲突；不要从单次文字差异猜测编辑意图，也不要生成事实结论。',
    '遵守 context 中编辑的监督方向和冻结范围；监督方向不是新的证据或支持票。',
    '只能提出待编辑接受的本社审阅偏好和编辑记忆，不得启用或修改稿件。没有可靠模式时返回空 proposals。',
    '只返回 JSON：{"proposals":[{"title":"简明通用偏好","editorialDimension":"审阅类别标识","confidence":0.5,"exampleIds":["e1"]}]}。',
    '最多三项，每项标题不超过160字符；exampleIds 必须引用实际样例，不要复制姓名、稿件原句或内部备注到通用偏好。',
  ].join('\n'),
} as const;
export const CURATION_CONTRACT_DIGEST = sha256Hex(canonicalJson(CURATION_CONTRACT));
export function validCurationBudget(value: unknown): value is LearningCurationBudget {
  return isRecord(value) && hasExactKeys(value, ['maxPasses', 'totalTokens', 'perPassTokens']) &&
    [value.maxPasses, value.totalTokens, value.perPassTokens].every((n) => Number.isSafeInteger(n) && Number(n) > 0) &&
    Number(value.maxPasses) <= 100 && Number(value.totalTokens) <= 10_000_000 && Number(value.perPassTokens) <= Number(value.totalTokens);
}
export interface CuratedPreference {
  title: string;
  editorialDimension: string;
  confidence: number;
  exampleIds: string[];
}
export interface CurationRun {
  taskIntentId: string; runRecordId: string; authorizationId: string;
  controlEntryId: string; envelope: EnabledLearningEnvelope; bundle: LearningCurationBundle;
  planDigest: string; compositionDigest: string;
}

function sideText(side: QualifiedLearningExample['before']): string[] {
  return typeof side === 'string' ? [side] : side.flatMap((part) => typeof part === 'string' ? [part] : part.kind === 'text' ? [part.text] : []);
}

/** Check complete examples; no slicing, normalization, name replacement or convenient first-ten fallback. */
export function boundedCurationExamples(examples: readonly QualifiedLearningExample[]): boolean {
  if (examples.length < 1 || examples.length > 10) return false;
  let total = 0;
  for (const example of examples) {
    if (example.exampleId.length > 128 || example.sourceRef.length > 128) return false;
    for (const side of [example.before, example.after, ...(example.sourceKind === 'proposal-decision' ? [example.proposal] : [])]) {
      const texts = sideText(side);
      if (texts.some((text) => !text.isWellFormed())) return false;
      const count = texts.reduce((sum, text) => sum + graphemesOf(text).length, 0);
      if (count > 2048) return false;
      total += count;
    }
    if (example.sourceKind === 'proposal-decision' && example.reason !== null) {
      const count = graphemesOf(example.reason).length;
      if (!example.reason.isWellFormed() || count > 512) return false;
      total += count;
    }
  }
  return total <= 16000 && Buffer.byteLength(canonicalJson({ schema: CURATION_CONTRACT.schema, examples }), 'utf8') <= 131072;
}

export function parseCurationResult(text: string, examples: readonly QualifiedLearningExample[]): CuratedPreference[] | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!isRecord(value) || !hasExactKeys(value, ['proposals']) || !Array.isArray(value.proposals) || value.proposals.length > 3) return null;
  const offered = new Set(examples.map((example) => example.exampleId));
  for (const proposal of value.proposals) {
    if (!isRecord(proposal) || !hasExactKeys(proposal, ['title', 'editorialDimension', 'confidence', 'exampleIds']) ||
      typeof proposal.title !== 'string' || proposal.title.trim().length === 0 || proposal.title.length > 160 || !proposal.title.isWellFormed() ||
      /[\r\n\p{Cc}\p{Zl}\p{Zp}]/u.test(proposal.title) || typeof proposal.editorialDimension !== 'string' ||
      reviewCategoryEntry(proposal.editorialDimension) === null || typeof proposal.confidence !== 'number' ||
      !Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1 ||
      !Array.isArray(proposal.exampleIds) || proposal.exampleIds.length < 1 || proposal.exampleIds.length > examples.length ||
      new Set(proposal.exampleIds).size !== proposal.exampleIds.length || proposal.exampleIds.some((id) => !offered.has(id))) return null;
  }
  return value.proposals as CuratedPreference[];
}
