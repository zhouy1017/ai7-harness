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

export const BASELINE_PROCEDURE_ID = 'ai7-procedure/baseline-analysis';
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
    ...(version >= 2 ? [localCheckProcedureDefinition()] : [])];
}

/** Immutable predecessors remain admitted beside the current versions. */
export function allPreinstalledProcedureDefinitions(): readonly ProcedureDefinitionDocument[] {
  return [...preinstalledProcedureDefinitions(1), ...preinstalledProcedureDefinitions(2).filter((document) => document.version === 2 || document.id === 'ai7-procedure/local-text-check'), localCheckProcedureDefinitionV2(), localCheckProcedureDefinitionV3(),
    ...preinstalledProcedureDefinitions(3).filter((document) => document.id === reviewProcedureId('style-and-format') || document.id === reviewProcedureId('plot-consistency'))];
}

/** Only the ten pre-installed definitions are admitted in F-26a. */
export function procedureIdForKind(kind: string): string | null {
  if (kind === BASELINE_ANALYSIS_KIND) return BASELINE_PROCEDURE_ID;
  if (kind === FACTUAL_REVIEW_KIND) return reviewProcedureId('factual-review');
  const categoryId = reviewCategoryIdOfKind(kind);
  return BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.some((entry) => entry.categoryId === categoryId)
    ? reviewProcedureId(categoryId!) : null;
}
