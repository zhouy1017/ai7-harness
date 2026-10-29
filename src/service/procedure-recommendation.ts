import type {
  CapturedProcedureApplicabilityEntryProjection, CapturedProcedureDocument,
  ProcedureRecommendationCandidate, ProcedureRecommendationInput, ProcedureRecommendationProjection,
} from '../shared/protocol.js';
import type { EditableProcedureProjection } from '../shared/protocol/procedures.js';
import { canonicalJson, sha256Hex } from './analysis/canonical.js';

export const IMPORTED_SKILL_RECOMMENDATION_EXCLUSION = '外部 Skill 在此版本没有执行器，不参与工序推荐。';
export interface RecommendationReading {
  readonly applicability: CapturedProcedureApplicabilityEntryProjection;
  readonly document: CapturedProcedureDocument;
  readonly documentSha256: string;
  readonly labels: readonly string[];
}

/** A library Procedure Definition read for the library's 工序推荐 (Issue #1173): its newest version and the categories it reviews. */
export interface DefinitionRecommendationReading {
  readonly procedure: EditableProcedureProjection;
  readonly categoryIds: readonly string[];
  readonly labels: readonly string[];
}

const OUTPUT_WORDS: Readonly<Record<string, string>> = { annotation: '批注', 'change-suggestion': '修改建议', record: '记录', document: '文档' };

/** ADR 0090 / TASK-010..016: deterministic read only. A recommendation is never a selection or authority. */
export function recommendProcedures(input: ProcedureRecommendationInput, readings: readonly RecommendationReading[],
  definitions: readonly DefinitionRecommendationReading[] = []): ProcedureRecommendationProjection {
  const intentDigest = sha256Hex(canonicalJson({ ...input, goal: input.goal.trim(), categoryIds: [...input.categoryIds].sort() }));
  const candidates: ProcedureRecommendationCandidate[] = [];
  if (input.taskKind === 'review-run') for (const { applicability: fit, document, documentSha256, labels } of readings) {
    if (fit.latestEligible === null || fit.fit === 'none' || fit.fit === 'no-version') continue;
    const categories = document.steps.map((step) => step.categoryId);
    const matched = input.categoryIds.filter((categoryId) => categories.includes(categoryId));
    if (input.categoryIds.length > 0 && matched.length === 0) continue;
    const scopeFits = input.scope === 'selection' || document.parameters.scope === input.scope;
    const all = fit.fit === 'all' && scopeFits && matched.length === input.categoryIds.length;
    const series = document.authorityCeiling.steps.some((step) => step.executor === 'series-knowledge');
    candidates.push({
      procedureId: fit.procedureId, versionId: fit.latestEligible.versionId, version: fit.latestEligible.version, documentSha256,
      purpose: fit.title, kind: '可复用工序', fit: all ? 'all' : 'partial',
      rationale: [
        '任务种类：审阅',
        scopeFits ? '范围与当前任务相符' : '保存的范围与当前任务不同，需另行选择',
        `可运行 ${fit.availableCount}/${fit.stepCount} 步：${labels.join('、')}`,
        ...(input.categoryIds.length === 0 ? [] : [`目标类别匹配 ${matched.length}/${input.categoryIds.length} 类`]),
        ...(series ? ['含书系一致性，需书系资料并由你另行勾选'] : []),
        ...fit.leftOut.map((step) => `${step.label}：${step.reason}`),
      ],
      requiredInputs: [input.scope === 'selection' ? '当前所选段落' : input.scope === 'chapters' ? '另选章节' : '当前图书稿件', ...(series ? ['每次另选书系资料'] : [])],
      expectedOutcome: `按已保存顺序完成${labels.join('、')}，输出${document.authorityCeiling.outputs.map((kind) => kind === 'annotation' ? '批注' : '修改建议').join('、')}`,
      proposalClasses: [...document.authorityCeiling.outputs], effectClasses: [],
    });
  }
  // A composite covers a whole review asked for without categories; a one-category version fits when its category was asked for.
  if (input.taskKind === 'review-run') for (const { procedure, categoryIds, labels } of definitions) {
    const matched = input.categoryIds.filter((categoryId) => categoryIds.includes(categoryId));
    if (input.categoryIds.length > 0 && matched.length === 0) continue;
    const composite = procedure.document.members !== undefined;
    const outputs = procedure.document.outputKinds.map((kind) => OUTPUT_WORDS[kind]!);
    candidates.push({
      procedureId: procedure.procedureId, versionId: `${procedure.procedureId}@${procedure.version}`, version: procedure.version, documentSha256: procedure.digest,
      purpose: procedure.document.title, kind: procedure.preInstalled ? '预装工序' : '本社工序',
      fit: (input.categoryIds.length === 0 ? composite : matched.length === input.categoryIds.length) ? 'all' : 'partial',
      rationale: ['任务种类：审阅', `${composite ? '依次审阅' : '审阅'}：${labels.join('、')}`,
        ...(input.categoryIds.length === 0 ? [] : [`目标类别匹配 ${matched.length}/${input.categoryIds.length} 类`]),
        ...(procedure.sourceRunId === null ? [] : ['从一次完成的运行捕获；可在本社任何一本书运行'])],
      requiredInputs: ['所选图书的稿件', ...(categoryIds.includes('local-text-check') ? ['每次运行时明确选择确定性检查选项'] : [])],
      expectedOutcome: `按已保存顺序完成${labels.join('、')}，输出${outputs.join('、')}`,
      proposalClasses: procedure.document.outputKinds.filter((kind) => kind === 'annotation' || kind === 'change-suggestion'), effectClasses: [],
    });
  }
  candidates.sort((a, b) => Number(b.fit === 'all') - Number(a.fit === 'all') || a.procedureId.localeCompare(b.procedureId));
  const clear = candidates.filter((candidate) => candidate.fit === 'all');
  const status = clear.length === 1 ? 'clear' : candidates.length === 0 ? 'none' : 'ambiguous';
  return {
    intentDigest, status,
    candidates: status === 'clear' ? [clear[0]!] : candidates.slice(0, 3), selectedVersionId: null,
    note: status === 'none' ? '暂无适合的可用工序' : status === 'clear' ? '推荐工序，选择后仍需查看计划并授权。' : '这些工序可能适合，请自行选择；尚未选择任何版本。',
    excludedSkillReason: IMPORTED_SKILL_RECOMMENDATION_EXCLUSION,
  };
}
