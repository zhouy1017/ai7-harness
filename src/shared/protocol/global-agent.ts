import type { DialogueAttemptProjection, TrustedOperationalScope } from '../protocol.js';

export const GLOBAL_AGENT_POLICY_BLOCKED = '当前处理策略未允许' as const;
export const GLOBAL_AGENT_TITLE = '全域智能体（记忆与全局指导）' as const;
export type LearningSupervisionScope =
  | { readonly kind: 'house' }
  | { readonly kind: 'book'; readonly bookId: string }
  | { readonly kind: 'category'; readonly categoryId: string };
export interface GlobalMemoryPin {
  readonly itemId: string;
  readonly revisionId: string;
}
export interface GlobalMemoryItem extends GlobalMemoryPin {
  readonly kind: 'preference' | 'memory';
  readonly text: string;
  readonly categoryId: string;
  readonly bookId: string | null;
  readonly state: 'active' | 'inactive' | 'frozen';
  readonly lineage: ReadonlyArray<GlobalMemoryPin>;
}
export interface RecordLearningSupervisionInput {
  readonly operation: 'create' | 'merge' | 'correct' | 'deactivate' | 'supervise';
  readonly targets: ReadonlyArray<GlobalMemoryPin>;
  readonly scope: LearningSupervisionScope;
  readonly text: string;
  readonly categoryId: string;
  readonly effect: 'guide' | 'freeze' | 'correct';
}
export interface LearningSupervisionDirective extends RecordLearningSupervisionInput {
  readonly schema: 'ai7.learning-supervision-directive/1';
  readonly actor: 'editor';
  readonly directiveId: string;
  readonly ordinal: number;
  readonly supersedes: string | null;
  readonly operationalScope: TrustedOperationalScope;
  readonly recordedAt: string;
}
export interface GlobalAgentDialogueProjection {
  readonly dialogueId: string;
  readonly bookId: null;
  readonly question: string | null;
  readonly sources: ReadonlyArray<GlobalMemoryPin>;
  readonly askedAt: string;
  /** Read from the Harness message, never a second transcript. */
  readonly sentSources?: ReadonlyArray<GlobalMemoryPin & { readonly text: string }>;
  readonly provider?: { readonly route: string; readonly model: string; readonly policyRuleId: string } | null;
  readonly submissions?: ReadonlyArray<{
    readonly attemptId: string;
    readonly question: string;
    readonly sources: ReadonlyArray<GlobalMemoryPin & { readonly text: string }>;
    readonly kept: string | null;
    readonly provider: { readonly route: string; readonly model: string; readonly policyRuleId: string } | null;
  }>;
  readonly attempts: ReadonlyArray<DialogueAttemptProjection>;
  readonly actions: { readonly stop: boolean; readonly continue: boolean; readonly regenerate: boolean };
}
export interface GlobalAgentProjection {
  readonly operationalScope: TrustedOperationalScope;
  readonly dialogueState: typeof GLOBAL_AGENT_POLICY_BLOCKED | 'available';
  readonly explanation: string;
  readonly categories: ReadonlyArray<{ readonly categoryId: string; readonly label: string }>;
  readonly books: ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  readonly items: ReadonlyArray<GlobalMemoryItem>;
  readonly sourceCandidates?: ReadonlyArray<GlobalAgentSourceCandidate>;
  readonly directives: ReadonlyArray<LearningSupervisionDirective>;
  readonly history: ReadonlyArray<GlobalAgentDialogueProjection>;
}
export interface AskGlobalAgentInput {
  readonly question: string;
  readonly sources: ReadonlyArray<GlobalMemoryPin>;
  readonly disclosureSha256?: string;
}
export interface GlobalAgentSourceCandidate extends GlobalMemoryPin {
  readonly kind: 'preference' | 'memory' | 'supervision';
  readonly title: string;
  readonly text: string;
}
export type PrepareGlobalAgentTurnInput =
  | { readonly kind: 'ask'; readonly question: string; readonly sources: ReadonlyArray<GlobalMemoryPin> }
  | { readonly kind: 'continue' | 'regenerate'; readonly dialogueId: string; readonly attemptId: string; readonly sources?: ReadonlyArray<GlobalMemoryPin> };
export interface GlobalAgentDisclosure {
  readonly question: string;
  readonly sources: ReadonlyArray<GlobalAgentSourceCandidate>;
  readonly kept: string | null;
  readonly provider: { readonly route: string; readonly model: string; readonly policyRuleId: string };
  readonly sha256: string;
}
export interface GlobalAgentAttemptInput { readonly dialogueId: string; readonly attemptId: string; readonly disclosureSha256?: string; readonly sources?: ReadonlyArray<GlobalMemoryPin> }
export interface GlobalAgentOperations {
  prepareGlobalAgentTurn: { input: PrepareGlobalAgentTurnInput; output: GlobalAgentDisclosure };
  inspectGlobalAgentDialogue: { input: { dialogueId: string }; output: GlobalAgentDialogueProjection };
  stopGlobalAgentAnswer: { input: GlobalAgentAttemptInput; output: GlobalAgentDialogueProjection };
  continueGlobalAgentAnswer: { input: GlobalAgentAttemptInput; output: GlobalAgentDialogueProjection };
  regenerateGlobalAgentAnswer: { input: GlobalAgentAttemptInput; output: GlobalAgentDialogueProjection };
  inspectGlobalAgent: { input: Record<string, never>; output: GlobalAgentProjection };
  recordLearningSupervision: { input: RecordLearningSupervisionInput; output: GlobalAgentProjection };
  askGlobalAgent: { input: AskGlobalAgentInput; output: GlobalAgentDialogueProjection };
}
export interface GlobalAgentRendererApi {
  prepareGlobalAgentTurn(input: PrepareGlobalAgentTurnInput): Promise<GlobalAgentDisclosure>;
  inspectGlobalAgentDialogue(input: { dialogueId: string }): Promise<GlobalAgentDialogueProjection>;
  stopGlobalAgentAnswer(input: GlobalAgentAttemptInput): Promise<GlobalAgentDialogueProjection>;
  continueGlobalAgentAnswer(input: GlobalAgentAttemptInput): Promise<GlobalAgentDialogueProjection>;
  regenerateGlobalAgentAnswer(input: GlobalAgentAttemptInput): Promise<GlobalAgentDialogueProjection>;
  inspectGlobalAgent(): Promise<GlobalAgentProjection>;
  recordLearningSupervision(input: RecordLearningSupervisionInput): Promise<GlobalAgentProjection>;
  askGlobalAgent(input: AskGlobalAgentInput): Promise<GlobalAgentDialogueProjection>;
}
