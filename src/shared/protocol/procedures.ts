/** ADR 0095 §1: product-built stage identities; declaring a stage grants no execution authority. */
export const PROCEDURE_DEFINITION_SCHEMA = 'ai7.procedure-definition/2' as const;
export const PROCEDURE_STAGE_TYPES = [
  'read-through-ledger', 'chunked-review', 'deterministic-check', 'claim-extraction', 'web-verification',
  'cross-unit-reduction', 'synthesis', 'drafting', 'derived-report',
] as const;
export type ProcedureStageType = (typeof PROCEDURE_STAGE_TYPES)[number];

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
