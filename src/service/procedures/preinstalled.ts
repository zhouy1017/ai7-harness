import {
  PROCEDURE_DEFINITION_SCHEMA,
  type ProcedureDefinitionDocument,
  type ProcedureStageDefinition,
  type ProcedureStageType,
} from '../../shared/protocol/procedures.js';
import { baselineAnalysisKindDefinition, factualReviewKindDefinition, type AnalysisKindDefinition } from '../analysis/kind-definition.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, HISTORICAL_REVIEW_CATEGORY_CONFIGURATION, type ReviewCategoryConfigurationEntry } from '../review/category-configuration.js';
import { REVIEW_CATEGORY_UNIT_RESULT_SCHEMA, REVIEW_CATEGORY_UNIT_RESULT_SCHEMA_V1 } from '../review/review-category-contract.js';
import { BASELINE_ANALYSIS_KIND, FACTUAL_REVIEW_KIND, reviewCategoryIdOfKind } from '../../shared/protocol.js';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { INITIAL_EVALUATION_UNIT_RESULT_SCHEMA, INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA, INITIAL_EVALUATION_RESULT_SET_REVISION_SCHEMA } from '../evaluation/initial-evaluation-contract.js';
import { READERS_REPORT_UNIT_RESULT_SCHEMA, READERS_REPORT_SYNTHESIS_RESULT_SCHEMA, READERS_REPORT_RESULT_SET_REVISION_SCHEMA } from '../evaluation/readers-report-contract.js';
import { EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA, EVALUATION_REWRITE_RESULT_SET_REVISION_SCHEMA } from '../evaluation/evaluation-rewrite-contract.js';
import { WRITING_UNIT_RESULT_SCHEMA, WRITING_SYNTHESIS_RESULT_SCHEMA, WRITING_RESULT_SET_REVISION_SCHEMA } from '../writing/writing-contract.js';

export const BASELINE_PROCEDURE_ID = 'ai7-procedure/baseline-analysis';
export const FACTUAL_CLAIM_PROCEDURE_ID = 'ai7-procedure/factual-claim-check';

/** Existing kind contracts remain the executors; these documents contain no Book-specific inputs. */
export function editorialProcedureDefinitions(): readonly ProcedureDefinitionDocument[] {
  return [
    { kind: 'evaluation', title: 'AI7 初评', unit: INITIAL_EVALUATION_UNIT_RESULT_SCHEMA,
      synthesis: INITIAL_EVALUATION_SYNTHESIS_RESULT_SCHEMA, result: INITIAL_EVALUATION_RESULT_SET_REVISION_SCHEMA, draft: false },
    { kind: 'readers-report', title: '审稿意见', unit: READERS_REPORT_UNIT_RESULT_SCHEMA,
      synthesis: READERS_REPORT_SYNTHESIS_RESULT_SCHEMA, result: READERS_REPORT_RESULT_SET_REVISION_SCHEMA, draft: true },
    { kind: 'evaluation-rewrite', title: '按我的评分重写评语', unit: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
      synthesis: EVALUATION_REWRITE_SYNTHESIS_RESULT_SCHEMA, result: EVALUATION_REWRITE_RESULT_SET_REVISION_SCHEMA, draft: true },
    { kind: 'writing', title: '写作任务', unit: WRITING_UNIT_RESULT_SCHEMA,
      synthesis: WRITING_SYNTHESIS_RESULT_SCHEMA, result: WRITING_RESULT_SET_REVISION_SCHEMA, draft: true },
  ].map((entry) => ({ schema: PROCEDURE_DEFINITION_SCHEMA, id: `ai7-procedure/${entry.kind}`, version: 1,
    title: entry.title, role: entry.title, editorInstruction: '', stages: [
      { ...stage('chunked-review', ['manuscript-scope'], entry.unit), budgetShare: 1 },
      stage(entry.draft ? 'drafting' : 'cross-unit-reduction', ['unit-results'], entry.synthesis),
      stage('synthesis', ['unit-results', 'cross-unit-results'], entry.result),
    ], outputKinds: entry.draft ? ['document'] : ['record'] }));
}

export function factualClaimProcedureDefinition(): ProcedureDefinitionDocument {
  return { schema: PROCEDURE_DEFINITION_SCHEMA, id: FACTUAL_CLAIM_PROCEDURE_ID, version: 1,
    title: '事实核查', role: '抽取精确断言，逐条联网取证，保留来源与未决结果', editorInstruction: '',
    stages: [stage('claim-extraction', ['manuscript-scope'], 'ai7.factual-claim-ledger/1'),
      { ...stage('web-verification', ['ai7.factual-claim-ledger/1'], 'ai7.factual-claim-verification-result/1', true), toolWhitelist: ['websearch', 'webfetch'] }],
    outputKinds: ['annotation'] };
}
export function localCheckProcedureDefinition(): ProcedureDefinitionDocument {
  return { schema: PROCEDURE_DEFINITION_SCHEMA, id: 'ai7-procedure/local-text-check', version: 1,
    title: '本地文字检查', role: '以五项有限规则生成供编辑复核的精确批注', editorInstruction: '',
    stages: [stage('deterministic-check', ['frozen-local-plan'], 'ai7.review.local-result/1'),
      stage('derived-report', ['review-findings'], 'ai7.review.report/1')], outputKinds: ['annotation'] };
}

/** Unselected successor. Active defaults and immutable v1 bytes stay unchanged until integration. */
export function localCheckProcedureDefinitionV2(): ProcedureDefinitionDocument {
  return { schema: PROCEDURE_DEFINITION_SCHEMA, id: 'ai7-procedure/local-text-check', version: 2,
    title: '本地文字检查', role: '以五项有限规则及编辑明确选定的本社字面词表生成供编辑判断的精确批注', editorInstruction: '',
    stages: [stage('deterministic-check', ['frozen-local-plan'], 'ai7.review.local-result/2'),
      stage('derived-report', ['review-findings'], 'ai7.review.report/1')], outputKinds: ['annotation'] };
}

export function localCheckProcedureDefinitionV3(): ProcedureDefinitionDocument {
  return { schema: PROCEDURE_DEFINITION_SCHEMA, id: 'ai7-procedure/local-text-check', version: 3,
    title: '确定性检查', role: '离线检查标点、数字、规范字形、异形词、本社词表与本书术语；机械修正由编辑采纳后应用', editorInstruction: '',
    stages: [stage('deterministic-check', ['frozen-local-plan'], 'ai7.review.local-result/3'),
      stage('derived-report', ['review-findings'], 'ai7.review.report/1')], outputKinds: ['annotation', 'change-suggestion'] };
}

export const FULL_REVIEW_PROCEDURE_ID = 'ai7-procedure/full-review';

/**
 * 全文审校 v1 (Issue #1173): the four dimensions as members, each an existing pre-installed version run as its own category
 * Run, then the Review Run's report. The exemption rules are AI7's own template words: no manuscript text and no person.
 */
export function fullReviewProcedureDefinition(): ProcedureDefinitionDocument {
  const category = (id: string): ReviewCategoryConfigurationEntry => BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => entry.categoryId === id)!;
  const members = [['local-text-check', localCheckProcedureDefinitionV3()], ['typos-and-usage', reviewProcedureDefinition(category('typos-and-usage'))],
    ['style-and-format', reviewProcedureDefinition(category('style-and-format'))], ['plot-consistency', reviewProcedureDefinition(category('plot-consistency'))],
    ['factual-review', factualClaimProcedureDefinition()]] as const;
  // Every model stage holds a share, together 100%, so the members stay inside one Run Budget Ceiling.
  const rules: Partial<Record<string, readonly [number, readonly string[]]>> = {
    'typos-and-usage/chunked-review': [0.15, ['引文、古诗文和作者有意保留的旧式写法不按错别字处理，确属误植时才指出。', '人物对白中的口语、方言和省略句不算语病。']],
    'style-and-format/chunked-review': [0.15, ['作者有意的短句、省略主语和文白夹杂不算体例或格式问题。']],
    'style-and-format/cross-chapter-consistency': [0.1, []],
    'plot-consistency/chunked-review': [0.15, []],
    'plot-consistency/cross-chapter-consistency': [0.1, ['叙述者或人物记忆中有意的前后不一不作错误处理，只提示编辑核对。']],
    'factual-review/claim-extraction': [0.15, ['虚构情节中的人物与事件不作为待核查的事实断言；只抽取涉及真实历史、地理、科学与引语的断言。']],
    'factual-review/web-verification': [0.2, []],
  };
  const stages = members.flatMap(([categoryId, document]) => document.stages.filter((entry) => entry.stageType !== 'derived-report').map((entry) => {
    const rule = rules[`${categoryId}/${entry.stageType}`];
    return rule === undefined ? entry : { ...entry, budgetShare: rule[0], exemptionRules: rule[1] };
  }));
  return { schema: PROCEDURE_DEFINITION_SCHEMA, id: FULL_REVIEW_PROCEDURE_ID, version: 1, title: '全文审校',
    role: '按错别字与规范用语、文风与格式、跨章一致性、事实性断言四个方面依次审校全书，结果以精确定位的卡片交编辑逐条决定',
    editorInstruction: '这是一次全文审校中的一个方面；只报告本方面的问题，每条都须精确引用原文。',
    stages: [...stages, stage('derived-report', ['review-findings'], 'ai7.review.report/1')], outputKinds: ['change-suggestion', 'annotation'],
    members: members.map(([categoryId, document]) => ({ procedureId: document.id, version: document.version, digest: sha256Hex(canonicalJson(document)),
      categoryId, stageCount: document.stages.filter((entry) => entry.stageType !== 'derived-report').length })) };
}

/** The pre-installed procedure one built-in review category runs (ADR 0095 §1). */
export function reviewProcedureId(categoryId: string): string {
  return `ai7-procedure/review-${categoryId}`;
}

function stage(stageType: ProcedureStageType, inputs: readonly string[], outputTemplateId: string, web = false): ProcedureStageDefinition {
  // v1 describes today's serial executor. Parallel execution and new tools belong to later slices.
  return { stageType, inputs, toolWhitelist: [], parallelism: 1, outputTemplateId, exemptionRules: [], budgetShare: 0, web };
}

/** Build from kind metadata only; never put a prompt or an instance's material in a definition. */
export function baselineProcedureDefinition(definition: AnalysisKindDefinition = baselineAnalysisKindDefinition()): ProcedureDefinitionDocument {
  return {
    schema: PROCEDURE_DEFINITION_SCHEMA,
    id: BASELINE_PROCEDURE_ID,
    version: 1,
    title: '基线分析',
    role: definition.expectedOutcome,
    editorInstruction: '',
    stages: [
      { ...stage('chunked-review', ['manuscript-scope'], definition.unitResultSchema), budgetShare: 1 },
      ...(definition.crossUnit === null ? [] : [stage('cross-unit-reduction', ['unit-results'], definition.crossUnit.resultSchema)]),
      stage('synthesis', ['unit-results', 'cross-unit-results'], definition.revisionSchema),
    ],
    outputKinds: ['record'],
  };
}

/** Category identity and existing executor stay distinct from the legacy prompt's procedure identity. */
export function reviewProcedureDefinition(entry: ReviewCategoryConfigurationEntry, version: 1 | 2 | 3 = 3): ProcedureDefinitionDocument {
  const leads = entry.executor === 'baseline-leads';
  const factual = entry.executor === 'factual-review-kind';
  const resultSchema = factual ? factualReviewKindDefinition().unitResultSchema : version === 1 ? REVIEW_CATEGORY_UNIT_RESULT_SCHEMA_V1 : REVIEW_CATEGORY_UNIT_RESULT_SCHEMA;
  return {
    schema: PROCEDURE_DEFINITION_SCHEMA,
    id: reviewProcedureId(entry.categoryId),
    version: version === 3 ? entry.crossChapter !== undefined ? entry.categoryId === 'style-and-format' ? 3 : 2 : !leads && !factual ? 2 : 1 : !leads && !factual ? version : 1,
    title: entry.procedure.title,
    role: entry.description,
    editorInstruction: '',
    stages: [
      ...(leads ? [] : [
        { ...stage('chunked-review', ['manuscript-scope', 'category-guidelines'], resultSchema, entry.searchEngine), budgetShare: 1 },
        ...(entry.crossChapter === undefined || version !== 3 ? [] : [
          stage('cross-unit-reduction', ['unit-results'], 'ai7.editorial-review.cross-chapter-input/1'),
          stage('cross-chapter-consistency', ['exact-occurrence-groups', 'pinned-baseline-leads'], 'ai7.editorial-review.cross-chapter-result/1'),
        ]),
        stage('synthesis', ['unit-results'], factual ? factualReviewKindDefinition().revisionSchema : 'ai7.editorial-review.result-set-revision/1'),
      ]),
      stage('derived-report', [leads ? 'baseline-leads' : 'review-findings'], 'ai7.review.report/1'),
    ],
    outputKinds: [entry.output],
  };
}

export function preinstalledProcedureDefinitions(version: 1 | 2 | 3 = 3): readonly ProcedureDefinitionDocument[] {
  return [...(version === 3 ? BUILTIN_REVIEW_CATEGORY_CONFIGURATION : HISTORICAL_REVIEW_CATEGORY_CONFIGURATION).categories.map((entry) => reviewProcedureDefinition(entry, version)), baselineProcedureDefinition(),
    ...(version >= 2 ? [localCheckProcedureDefinition()] : []),
    ...(version === 3 ? [factualClaimProcedureDefinition(), ...editorialProcedureDefinitions(), fullReviewProcedureDefinition()] : [])];
}

/** Immutable predecessors remain admitted beside the current versions. */
export function allPreinstalledProcedureDefinitions(): readonly ProcedureDefinitionDocument[] {
  return [...preinstalledProcedureDefinitions(1), ...preinstalledProcedureDefinitions(2).filter((document) => document.version === 2 || document.id === 'ai7-procedure/local-text-check'), localCheckProcedureDefinitionV2(), localCheckProcedureDefinitionV3(),
    ...preinstalledProcedureDefinitions(3).filter((document) => document.id === reviewProcedureId('style-and-format') || document.id === reviewProcedureId('plot-consistency')),
    factualClaimProcedureDefinition(), ...editorialProcedureDefinitions(), fullReviewProcedureDefinition()];
}

/** Kind identity selects the behavior-preserving pre-installed procedure. */
export function procedureIdForKind(kind: string): string | null {
  if (kind === BASELINE_ANALYSIS_KIND) return BASELINE_PROCEDURE_ID;
  if (kind === FACTUAL_REVIEW_KIND) return reviewProcedureId('factual-review');
  if (['evaluation', 'readers-report', 'evaluation-rewrite', 'writing'].includes(kind)) return `ai7-procedure/${kind}`;
  const categoryId = reviewCategoryIdOfKind(kind);
  return BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.some((entry) => entry.categoryId === categoryId)
    ? reviewProcedureId(categoryId!) : null;
}
