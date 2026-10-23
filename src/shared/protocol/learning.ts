import type { LearningEligibilityChoice } from '../protocol.js';

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
  kind: 'accepted' | 'accepted-with-edit' | 'rejected' | 'review-finding-ignored';
  source: LearningSourceReference;
  rewriteDistance: number | null;
  attribution: { peopleVersion: number; authors: ReadonlyArray<string>; editors: ReadonlyArray<string> };
  eligibility: { choice: LearningEligibilityChoice; decisionId: string | null; basisVersion: number };
  recordedAt: string;
}

/** Where a signal stands now: its eligibility, or `superseded` once a later decision or a revised reason replaced its source. */
export type LearningSignalStanding = LearningEligibilityChoice | 'superseded';

export interface GlobalEditorialMemoryVersion {
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

export interface EditorialLearningProjection {
  basis: string;
  enabled: boolean;
  controlEntries: number;
  excludedBooks: ReadonlyArray<{ bookId: string; title: string }>;
  excludedMaterials: ReadonlyArray<{ bookId: string; materialKey: string }>;
  signals: ReadonlyArray<LearningSignal & { currentEligibility: LearningSignalStanding; bookTitle: string }>;
  items: ReadonlyArray<{ current: GlobalEditorialMemoryVersion; usable: boolean; history: ReadonlyArray<GlobalEditorialMemoryVersion> }>;
  nextSignalOffset: number | null;
  nextItemOffset: number | null;
  nextExclusionOffset: number | null;
}

export interface InspectEditorialLearningInput { signalOffset: number; itemOffset: number; exclusionOffset?: number }
export type ChangeEditorialLearningInput =
  | { kind: 'switch'; enabled: boolean; expectedEntries: number }
  | { kind: 'book'; bookId: string; excluded: boolean; expectedEntries: number }
  | { kind: 'material'; signalId: string };
export interface CreateEditorialMemoryInput {
  clientMemoryId: string;
  signalId: string;
  title: string;
  editorialDimension: string;
  confidence: number;
}
export interface DeactivateEditorialMemoryInput { itemId: string; expectedVersionId: string }
