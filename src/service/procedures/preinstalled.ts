import {
  PROCEDURE_DEFINITION_SCHEMA,
  type ProcedureDefinitionDocument,
  type ProcedureStageDefinition,
  type ProcedureStageType,
} from '../../shared/protocol/procedures.js';
import { baselineAnalysisKindDefinition, factualReviewKindDefinition, type AnalysisKindDefinition } from '../analysis/kind-definition.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, type ReviewCategoryConfigurationEntry } from '../review/category-configuration.js';
import { REVIEW_CATEGORY_UNIT_RESULT_SCHEMA } from '../review/review-category-contract.js';
import { BASELINE_ANALYSIS_KIND, FACTUAL_REVIEW_KIND } from '../../shared/protocol.js';

function stage(stageType: ProcedureStageType, inputs: readonly string[], outputTemplateId: string, web = false): ProcedureStageDefinition {
  // v1 describes today's serial executor. Parallel execution and new tools belong to later slices.
  return { stageType, inputs, toolWhitelist: [], parallelism: 1, outputTemplateId, exemptionRules: [], budgetShare: 0, web };
}

/** Build from kind metadata only; never put a prompt or an instance's material in a definition. */
export function baselineProcedureDefinition(definition: AnalysisKindDefinition = baselineAnalysisKindDefinition()): ProcedureDefinitionDocument {
  return {
    schema: PROCEDURE_DEFINITION_SCHEMA,
    id: 'ai7-procedure/baseline-analysis',
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
export function reviewProcedureDefinition(entry: ReviewCategoryConfigurationEntry): ProcedureDefinitionDocument {
  const leads = entry.executor === 'baseline-leads';
  const factual = entry.executor === 'factual-review-kind';
  const resultSchema = factual ? factualReviewKindDefinition().unitResultSchema : REVIEW_CATEGORY_UNIT_RESULT_SCHEMA;
  return {
    schema: PROCEDURE_DEFINITION_SCHEMA,
    id: `ai7-procedure/review-${entry.categoryId}`,
    version: 1,
    title: entry.procedure.title,
    role: entry.description,
    editorInstruction: '',
    stages: [
      ...(leads ? [] : [
        { ...stage('chunked-review', ['manuscript-scope', 'category-guidelines'], resultSchema, entry.searchEngine), budgetShare: 1 },
        stage('synthesis', ['unit-results'], factual ? factualReviewKindDefinition().revisionSchema : 'ai7.editorial-review.result-set-revision/1'),
      ]),
      stage('derived-report', [leads ? 'baseline-leads' : 'review-findings'], 'ai7.review.report/1'),
    ],
    outputKinds: [entry.output],
  };
}

export function preinstalledProcedureDefinitions(): readonly ProcedureDefinitionDocument[] {
  return [...BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map(reviewProcedureDefinition), baselineProcedureDefinition()];
}

/** Only the ten pre-installed definitions are admitted in F-26a. */
export function procedureIdForKind(kind: string): string | null {
  if (kind === BASELINE_ANALYSIS_KIND) return 'ai7-procedure/baseline-analysis';
  if (kind === FACTUAL_REVIEW_KIND) return 'ai7-procedure/review-factual-review';
  const categoryId = kind.startsWith('editorial-review/') ? kind.slice('editorial-review/'.length) : null;
  return BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.some((entry) => entry.categoryId === categoryId)
    ? `ai7-procedure/review-${categoryId}` : null;
}
