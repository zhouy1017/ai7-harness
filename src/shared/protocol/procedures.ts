/** ADR 0095 §1: product-built stage identities; declaring a stage grants no execution authority. */
export const PROCEDURE_DEFINITION_SCHEMA = 'ai7.procedure-definition/2' as const;
export const PROCEDURE_STAGE_TYPES = [
  'read-through-ledger', 'chunked-review', 'deterministic-check', 'claim-extraction', 'web-verification',
  'cross-unit-reduction', 'synthesis', 'drafting', 'derived-report',
] as const;
export type ProcedureStageType = (typeof PROCEDURE_STAGE_TYPES)[number];

/** Closed local formats; declaring v2 does not select or activate it. */
export type LocalCheckProcedureVersion = 1 | 2 | 3;
export type LocalCheckPlanSchema = 'ai7.review.local-plan/1' | 'ai7.review.local-plan/2' | 'ai7.review.local-plan/3';
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
