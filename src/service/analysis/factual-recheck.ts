import type { FactualClaimSession, FactualRecheckSelection } from '../factual-verification.js';
import type { ExecutionPlanFacts } from './baseline-analysis-store.js';
import type { FrozenWebToolsBackend, ProcedureDefinitionPin, SelectedPolicyIdentity } from '../../shared/protocol.js';
import type { FactualClaimLedger } from './factual-claim-ledger.js';

/** One already-authorized stage of the existing factual owner; never a background queue or grant. */
export interface FactualRecheckRun {
  readonly taskIntentId: string;
  readonly runRecordId: string;
  readonly authorizationId: string;
  readonly enrollmentId: string;
  readonly enrollmentVersionId: string;
  readonly onceKey: string;
  readonly selection: FactualRecheckSelection;
  readonly binding: NonNullable<ExecutionPlanFacts['productionBinding']> & { readonly credentialReference: string };
  readonly policy: SelectedPolicyIdentity;
  readonly search: FrozenWebToolsBackend & { readonly credentialReference: string };
  readonly maximumTokens: number;
  readonly procedure: ProcedureDefinitionPin;
  readonly session: FactualClaimSession;
  readonly message: string;
  readonly prompt: string;
  readonly promptDigest: string;
  readonly compositionDigest: string;
  readonly planDigest: string;
}

export type FactualRecheckCandidate = Omit<FactualRecheckRun, 'taskIntentId' | 'runRecordId' | 'authorizationId' | 'session' | 'compositionDigest' | 'planDigest'> & {
  readonly ledger: FactualClaimLedger;
  readonly limits: FactualClaimSession['limits'];
};
