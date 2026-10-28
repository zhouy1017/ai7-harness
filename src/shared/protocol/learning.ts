import type { LearningEligibilityChoice, TrustedOperationalScope } from '../protocol.js';

/** Local reference-only learning. Text remains with the exact source record. */
export interface LearningSourceReference {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  /** `null` for a 审阅 finding that carries no mark. */
  markId: string | null;
  decisionId: string;
  revisionId: string;
  journalSequence: number;
  blockDigest: string | null;
  materialKey: string;
  materialDigest: string;
  reasonRevision: number;
  reviewRunId: string | null;
  findingId: string | null;
  resultSetRevisionId: string | null;
}

export interface DecisionLearningSignal {
  signalId: string;
  kind: 'accepted' | 'accepted-with-edit' | 'rejected' | 'review-finding-ignored' | 'proactive-reason';
  ask?: {
    askId: string;
    state: 'offered' | 'suppressed' | 'answered' | 'dismissed';
    disposition: string;
    choice: string | null;
    text: string | null;
  };
  source: LearningSourceReference;
  rewriteDistance: number | null;
  attribution: { peopleVersion: number; authors: ReadonlyArray<string>; editors: ReadonlyArray<string> };
  eligibility: { choice: LearningEligibilityChoice; decisionId: string | null; basisVersion: number };
  recordedAt: string;
}

/** Local evidence from a Word import; it has no editorial decision or memory-source ancestry. */
export interface WordTrackedEditLearningSource {
  bookId: string;
  sampleId: string;
  sampleDigest: string;
  sourceVersionId: string;
  sourceDigest: string;
  graphDigest: string;
  importCommitId: string;
  admissionDigest: string;
  materialKey: string;
  materialDigest: string;
}
export interface WordTrackedEditLearningSignal {
  schema: 'ai7.word-import-learning-signal/1';
  signalId: string;
  kind: 'word-tracked-edit';
  source: WordTrackedEditLearningSource;
  rewriteDistance: null;
  ask?: never;
  attribution: DecisionLearningSignal['attribution'];
  eligibility: DecisionLearningSignal['eligibility'];
  recordedAt: string;
}
/** Exact producer pin retained at the manual journal transaction, never reconstructed from text similarity. */
export type ManualCommandRequestPin =
  | { readonly origin: 'journal-edit'; readonly windowStartBlockId: string }
  | { readonly origin: 'manual-search-replacement'; readonly previewId: string };
export interface ManualCommandSource {
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly baseRevisionId: string;
  readonly journalEntryId: string;
  readonly journalSequence: number;
  readonly clientEditId: string;
  readonly requestFingerprint: string;
  readonly durableAt: string;
  readonly commandGroupId: string;
  readonly commandKind: 'edit' | 'replacement';
  readonly commandOrdinal: number;
  readonly sourceGroupId: null;
  readonly beforeWorkingDigest: string;
  readonly afterWorkingDigest: string;
  readonly evidenceDigest: string;
  readonly memberCount: number;
  readonly request: ManualCommandRequestPin;
}
export interface ManualEditLearningSignal {
  schema: 'ai7.manual-edit-learning-signal/1';
  signalId: string;
  kind: 'manual-edit-journal';
  source: ManualCommandSource & { materialKey: string; materialDigest: string };
  operationalScope: TrustedOperationalScope;
  rewriteDistance: null;
  ask?: never;
  attribution: DecisionLearningSignal['attribution'];
  eligibility: DecisionLearningSignal['eligibility'];
  recordedAt: string;
}
export type LearningSignal = DecisionLearningSignal | WordTrackedEditLearningSignal | ManualEditLearningSignal;

export type LearningExampleText = { kind: 'text'; text: string } | { kind: 'paragraph-boundary' };
/** Only these fields reach curation. Operational source identities remain in the local manifest. */
export type QualifiedLearningExample = { exampleId: string; sourceRef: string } & (
  | { sourceKind: 'proposal-decision'; decision: 'accepted' | 'accepted-with-edit' | 'rejected'; editorialDimension: 'typos-and-usage';
      before: string; proposal: string; after: string; afterSemantics: 'chosen-text-not-apply-proof';
      reason: string | null; reasonSource: 'reason-field' | 'suggested' | 'free-text' | null; reasonRevision: number }
  | { sourceKind: 'manual-edit-journal'; before: readonly string[]; after: readonly string[]; operation: 'edit' | 'replacement' }
  | { sourceKind: 'word-tracked-edit'; before: readonly LearningExampleText[]; after: readonly LearningExampleText[];
      operation: 'insert' | 'delete' | 'replace' | 'move' | 'paragraph-boundary'; intakeMode: 'suggestions' | 'accepted-baseline' }
);
export interface LearningCurationSource {
  signalId: string;
  sourceKey: string;
  source: LearningSignal['source'];
  sourceKind: QualifiedLearningExample['sourceKind'];
  eligibility: 'book' | 'house';
  controls: LearningControlSnapshot;
  currentnessDigest: string;
}
export interface LearningCurationBundle {
  schema: 'ai7.qualified-learning-curation/1';
  bookId: string;
  signalIds: readonly string[];
  sources: readonly LearningCurationSource[];
  examples: readonly QualifiedLearningExample[];
  coverage: readonly { signalId: string; state: 'included' | 'held'; reason: string | null }[];
  state: 'ready' | 'held';
  supervisionDigest: string;
  emittedText: string | null;
  emittedDigest: string | null;
  digest: string;
}

/** Where a signal stands now: its eligibility, or `superseded` once a later decision or a revised reason replaced its source. */
export type LearningSignalStanding = LearningEligibilityChoice | 'superseded';

export interface LegacyEditorialMemoryVersion {
  schema?: 'ai7.global-editorial-memory/1';
  itemId: string;
  versionId: string;
  ordinal: number;
  supersedes: string | null;
  title: string;
  editorialDimension: string;
  positiveExamples: ReadonlyArray<LearningSourceReference>;
  negativeExamples: ReadonlyArray<LearningSourceReference>;
  confidence: number;
  activation: 'active' | 'inactive';
  signalIds: ReadonlyArray<string>;
  supervisionDirectiveRefs: ReadonlyArray<string>;
  actor: 'editor';
  recordedAt: string;
}

export interface LearningControlSnapshot {
  switchEntryId: string | null;
  bookEntryId: string | null;
}
export type EditorialMemoryAdmission = {
  kind: 'explicit'; decisionId: string; ordinal: number; basis: { policy: string; mode: string; version: number };
  materialDigest: string; controls: LearningControlSnapshot;
} | {
  kind: 'automatic'; basis: { policy: string; mode: 'opt-out-local'; version: 2 };
  signalId: string; materialDigest: string; controls: LearningControlSnapshot;
};
interface EditorialMemorySourceBase {
  sourceKey: string;
  feedbackKey: string;
  signalId: string;
  operationalScope: TrustedOperationalScope;
  eligibility: 'book' | 'house';
  admission: EditorialMemoryAdmission;
  attribution: LearningSignal['attribution'];
  bookTitle: string;
}
export type EditorialMemorySourceSnapshot = EditorialMemorySourceBase & (
  | { sourceKind?: never; source: LearningSourceReference; editorialDimension: string }
  | { sourceKind: 'manual-edit-journal'; source: ManualEditLearningSignal['source']; editorialDimension: null }
  | { sourceKind: 'word-tracked-edit'; source: WordTrackedEditLearningSource; editorialDimension: null }
);
export type EditorialMemoryApplicability = { kind: 'house' } | { kind: 'book'; bookId: string };
export interface EditorialMemoryVersion {
  /** Legacy-only projection field; never serialized on /2 records. */
  activation?: never;
  schema: 'ai7.global-editorial-memory/2';
  itemId: string; versionId: string; ordinal: number; supersedes: string | null; recordedAt: string;
  operationalScope: TrustedOperationalScope;
  applicability: EditorialMemoryApplicability;
  editorialDimension: string; title: string; confidence: number;
  state: 'proposed' | 'active' | 'inactive' | 'frozen';
  actor: 'editor' | 'AI7'; actionId: string;
  curation?: { taskIntentId: string; runRecordId: string; bundleDigest: string };
  action: 'create' | 'accept' | 'merge' | 'correct' | 'deactivate' | 'freeze';
  signalIds: ReadonlyArray<string>;
  positiveExamples: ReadonlyArray<LearningSourceReference>;
  negativeExamples: ReadonlyArray<LearningSourceReference>;
  sources: ReadonlyArray<EditorialMemorySourceSnapshot>;
  parentVersions: ReadonlyArray<{ itemId: string; versionId: string }>;
  supervisionDirectiveRefs: ReadonlyArray<string>;
}
export type GlobalEditorialMemoryVersion = LegacyEditorialMemoryVersion | EditorialMemoryVersion;

export interface EditorialLearningProjection {
  curation?: { available: boolean; disclosure: string; envelope: EnabledLearningEnvelope | null; passesUsed: number; reservedTokens: number;
    recentRuns: ReadonlyArray<{ runRecordId: string; state: string; summary: string }> };
  basis: string;
  enabled: boolean;
  controlEntries: number;
  excludedBooks: ReadonlyArray<{ bookId: string; title: string }>;
  excludedMaterials: ReadonlyArray<{ bookId: string; materialKey: string }>;
  signals: ReadonlyArray<LearningSignal & { currentEligibility: LearningSignalStanding; bookTitle: string;
    memoryCandidate?: { editorialDimension: string; operationalScope: TrustedOperationalScope } | null }>;
  items: ReadonlyArray<{ current: GlobalEditorialMemoryVersion; usable: boolean; history: ReadonlyArray<GlobalEditorialMemoryVersion>;
    sources?: ReadonlyArray<EditorialMemorySourceSnapshot>; nextSourceOffset?: number | null; nextHistoryOffset?: number | null }>;
  nextSignalOffset: number | null;
  nextItemOffset: number | null;
  nextExclusionOffset: number | null;
}

export interface InspectEditorialLearningInput {
  signalOffset: number; itemOffset: number; exclusionOffset?: number;
  detailItemId?: string; historyOffset?: number; sourceOffset?: number;
}
export type ChangeEditorialLearningInput =
  | { kind: 'switch'; enabled: boolean; expectedEntries: number; curation?: LearningCurationBudget }
  | { kind: 'book'; bookId: string; excluded: boolean; expectedEntries: number }
  | { kind: 'material'; signalId: string };

export interface LearningCurationBudget { maxPasses: number; totalTokens: number; perPassTokens: number }
export interface EnabledLearningEnvelope {
  schema: 'ai7.enabled-learning-envelope/1';
  budget: LearningCurationBudget;
  contractDigest: string;
  policy: import('../protocol.js').SelectedPolicyIdentity;
  binding: { route: 'opencode-go' | 'deepseek-open-platform'; endpoint: string; model: string; credentialSlot: import('../protocol.js').CredentialSlotId; credentialReference: string };
  sourceKinds: readonly ['proposal-decision', 'manual-edit-journal', 'word-tracked-edit'];
  scope: 'eligible-local-books';
  supervisionDigest: string;
  disclosure: string;
  disableStopsLaterDispatchAndUse: true;
}
export interface LegacyCreateEditorialMemoryInput {
  clientMemoryId: string;
  signalId: string;
  title: string;
  editorialDimension: string;
  confidence: number;
}
export type CreateEditorialMemoryInput = LegacyCreateEditorialMemoryInput | {
  schema: 'ai7.global-editorial-memory/2'; actionId: string; signalIds: ReadonlyArray<string>;
  applicability: EditorialMemoryApplicability; title: string; editorialDimension: string; confidence: number;
};
export interface AcceptEditorialMemoryInput { itemId: string; expectedVersionId: string; actionId: string }
export interface DeactivateEditorialMemoryInput { itemId: string; expectedVersionId: string; actionId?: string }

export interface LearningReasonAskProjection {
  askId: string;
  decisionId: string;
  question: string;
  options: ReadonlyArray<string>;
}
export type LearningReasonAskFrequency = 'often' | 'occasionally' | 'off';
export const LEARNING_REASON_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  rejected: ['证据不足', '方向不合适', '保持作者风格'],
  'accepted-with-edit': ['语言更准确', '保持作者风格'],
  accepted: ['语言更准确', '保持作者风格'],
  ignored: ['证据不足', '方向不合适', '保持作者风格'],
};
/** The shell supplies the persisted frequency; a renderer cannot override it. */
export type LearningReasonAskInput =
  | { action: 'offer'; decisionId: string }
  | { action: 'answer'; askId: string; choice: string | null; text: string | null }
  | { action: 'dismiss'; askId: string };

export interface PreferenceAdoptionCounts {
  findings: number;
  accepted: number;
  rejected: number;
  rate: number | null;
}
export interface PreferenceAdoptionProjection {
  bookId: string;
  bookTitle: string;
  versionId: string | null;
  ordinal: number | null;
  referenced: PreferenceAdoptionCounts;
  unreferenced: PreferenceAdoptionCounts;
  mostlyRejected: boolean;
}
export interface PreferenceAdoptionCursor { bookId: string; versionId: string | null }

/** Exact local rule snapshot from the request producing the finding; no examples or names. */
export interface ReferencedRuleVersion {
  versionId: string;
  ordinal: number;
  lineIndex: number;
  text: string;
}
