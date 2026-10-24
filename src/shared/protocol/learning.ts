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

export interface LearningSignal {
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
export interface EditorialMemorySourceSnapshot {
  sourceKey: string;
  feedbackKey: string;
  signalId: string;
  source: LearningSourceReference;
  operationalScope: TrustedOperationalScope;
  editorialDimension: string;
  eligibility: 'book' | 'house';
  admission: EditorialMemoryAdmission;
  attribution: LearningSignal['attribution'];
  bookTitle: string;
}
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
  actor: 'editor'; actionId: string;
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
  | { kind: 'switch'; enabled: boolean; expectedEntries: number }
  | { kind: 'book'; bookId: string; excluded: boolean; expectedEntries: number }
  | { kind: 'material'; signalId: string };
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
