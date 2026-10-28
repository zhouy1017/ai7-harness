import type { ProcedureRecommendationInput, ProcedureRecommendationProjection } from '../protocol.js';

/** ADR 0095 §1: product-built stage identities; declaring a stage grants no execution authority. */
export const PROCEDURE_DEFINITION_SCHEMA = 'ai7.procedure-definition/2' as const;
export const PROCEDURE_STAGE_TYPES = [
  'read-through-ledger', 'chunked-review', 'deterministic-check', 'claim-extraction', 'web-verification',
  'cross-unit-reduction', 'cross-chapter-consistency', 'synthesis', 'drafting', 'derived-report',
] as const;
export type ProcedureStageType = (typeof PROCEDURE_STAGE_TYPES)[number];

/** Closed local formats; declaring v2 does not select or activate it. */
export type LocalCheckProcedureVersion = 1 | 2 | 3;
export type LocalCheckPlanSchema = 'ai7.review.local-plan/1' | 'ai7.review.local-plan/2' | 'ai7.review.local-plan/3' | 'ai7.review.local-plan/4';
export type LocalCheckResultSchema = 'ai7.review.local-result/1' | 'ai7.review.local-result/2' | 'ai7.review.local-result/3';
export type LocalCheckArtifactSchema = 'ai7.review.local-stage-artifact/1' | 'ai7.review.local-stage-artifact/2' | 'ai7.review.local-stage-artifact/3';

/** F-20a: these declarations are affirmative choices for this Run, never inferred from a Book type. */
export interface LocalCheckOptions {
  /** Editor-selected local tables, frozen with this Book's ReviewRun. */
  readonly tables?: LocalCheckTables;
  readonly punctuation: 'chinese-prose' | 'off';
  readonly numerals: 'off' | 'national-standard' | 'editor-convention';
  readonly publication: 'within-scope' | 'literary' | 'reprinted-classic' | 'unknown';
  readonly numeralRules: readonly ('N01' | 'N02')[];
  readonly numeralsConfirmed: boolean;
  readonly excludedRanges: readonly { readonly blockId: string; readonly from: number; readonly to: number; readonly reason: 'foreign' | 'technical' }[];
  readonly doubledEllipsisBlockIds: readonly string[];
}

export interface BookTermEntry {
  readonly kind: 'term' | 'person' | 'place';
  readonly preferred: string;
  readonly variants: readonly string[];
}
export interface LocalCheckTables {
  readonly characters: boolean;
  readonly variantWords: boolean;
  readonly bookTerms: readonly BookTermEntry[];
  readonly houseWordList: import('./house-word-list.js').HouseWordListPin | null;
}

export interface ProcedureStageDefinition {
  readonly stageType: ProcedureStageType;
  readonly inputs: readonly string[];
  readonly toolWhitelist: readonly string[];
  readonly parallelism: number;
  readonly outputTemplateId: string;
  readonly exemptionRules: readonly string[];
  readonly budgetShare: number;
  readonly web: boolean;
}

/** Immutable configuration, with no Book, manuscript, Provider binding or Run authority. */
export interface ProcedureDefinitionDocument {
  readonly schema: typeof PROCEDURE_DEFINITION_SCHEMA;
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly role: string;
  readonly editorInstruction: string;
  readonly stages: readonly ProcedureStageDefinition[];
  readonly outputKinds: readonly ('change-suggestion' | 'annotation' | 'record' | 'document')[];
  /** A composite version's member executions, in run order; absent on a version that binds one executor. */
  readonly members?: readonly ProcedureMemberDefinition[];
}

/**
 * One member of a composite version (Issue #1173): an existing pre-installed version run as its own category Run of one Review
 * Run. Its `stageCount` stages follow the previous member's in the composite; the composite's last stage is the Run's report.
 */
export interface ProcedureMemberDefinition extends ProcedureDefinitionPin {
  readonly categoryId: string;
  readonly stageCount: number;
}

export interface ProcedureDefinitionPin {
  readonly procedureId: string;
  readonly version: number;
  readonly digest: string;
}

export interface PreinstalledProcedureProjection extends ProcedureDefinitionPin {
  readonly title: string;
  readonly stages: readonly { readonly stageType: ProcedureStageType; readonly label: string }[];
  readonly previousVersions?: readonly (ProcedureDefinitionPin & { readonly stages: readonly { readonly stageType: ProcedureStageType; readonly label: string }[] })[];
  readonly state: 'enabled';
  readonly uses: number;
}

/** A library version always names an existing product executor. */
export interface EditableProcedureProjection extends ProcedureDefinitionPin {
  readonly document: ProcedureDefinitionDocument;
  readonly executorKind: string;
  readonly preInstalled: boolean;
  readonly stopped: boolean;
  readonly sourceRunId: string | null;
  readonly versions: readonly ProcedureDefinitionPin[];
  readonly documents: readonly ProcedureDefinitionDocument[];
  readonly uses: number;
}

export interface SaveProcedureDefinitionInput {
  /** Null creates a procedure from the selected executor's template. */
  readonly procedureId: string | null;
  readonly basedOn: ProcedureDefinitionPin;
  readonly title: string;
  readonly editorInstruction: string;
  readonly stages: readonly ProcedureStageDefinition[];
  readonly captureRunId?: string;
}

export interface ProcedureLibraryProjection {
  readonly procedures: readonly EditableProcedureProjection[];
  readonly completedRuns: readonly { readonly runId: string; readonly bookId: string; readonly bookTitle: string;
    readonly title: string; readonly procedure: ProcedureDefinitionPin; readonly document: ProcedureDefinitionDocument; readonly executorKind: string }[];
  /** 工序推荐 over the library's definitions and the house's Captured Procedures, present only on a `recommend` answer. */
  readonly recommendation?: ProcedureRecommendationProjection;
}

export type ProcedureLibraryCommand =
  | { readonly action: 'inspect' }
  | { readonly action: 'save'; readonly input: SaveProcedureDefinitionInput }
  | { readonly action: 'stop'; readonly procedure: ProcedureDefinitionPin }
  | { readonly action: 'select'; readonly bookId: string; readonly procedure: ProcedureDefinitionPin }
  | { readonly action: 'recommend'; readonly input: ProcedureRecommendationInput };

/** 运行此工序… of a composite (Issue #1173): the exact version a 审阅 runs; its categories are the version's members, in order. */
export interface CompositeReviewRunRequest {
  procedureDefinition?: ProcedureDefinitionPin | null;
}

/** A composite version runs as one 审阅 of a Book; it names no single kind executor. */
export const COMPOSITE_PROCEDURE_EXECUTOR = 'review-run' as const;

export const PROCEDURE_STAGE_LABELS: Readonly<Record<ProcedureStageType, string>> = {
  'read-through-ledger': '通读记账',
  'chunked-review': '分块审读',
  'deterministic-check': '确定性检查',
  'claim-extraction': '断言抽取',
  'web-verification': '联网取证',
  'cross-unit-reduction': '跨单元归并与跨章一致性',
  'cross-chapter-consistency': '跨章一致性',
  synthesis: '综合',
  drafting: '起草',
  'derived-report': '派生报告',
};

/** Existing deterministic owners cannot interpret text rules or spend a model budget. */
export function procedureStageUsesModel(stage: ProcedureStageDefinition, stages: readonly ProcedureStageDefinition[]): boolean {
  return !['deterministic-check', 'synthesis', 'derived-report'].includes(stage.stageType) &&
    !(stage.stageType === 'cross-unit-reduction' && stages.some((entry) => entry.stageType === 'cross-chapter-consistency'));
}
