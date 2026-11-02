import { BrowserWindow } from 'electron';
import type { ResolvedBookWorkbenchRoute } from '../shared/protocol.js';

export type ImportMutationKind = 'manuscript-import' | 'source-import' | 'manuscript-reimport';

export type ImportTargetBinding =
  | { kind: 'new-book'; mutation: ImportMutationKind; expectedBookId?: string }
  | { kind: 'existing-book'; mutation: ImportMutationKind; bookId: string };

export interface ManuscriptCapability {
  bookId: string;
  manuscriptId: string;
  branchId: string;
  routeGeneration: number;
}

export interface EditorResourceCapability {
  kind: 'job' | 'search' | 'preview';
  operation: 'search' | 'replacement' | 'reimport' | 'task-authorization' | 'baseline-analysis' | 'review-run' | 'initial-evaluation' |
    'readers-report' | 'evaluation-rewrite' | 'writing';
  bookId: string;
  manuscriptId: string | null;
  branchId: string | null;
  routeGeneration: number;
}

export interface OwnedRendererWindow {
  window: BrowserWindow;
  bookId: string | null;
  route: ResolvedBookWorkbenchRoute | null;
  routeGeneration: number;
  routeRequestSequence: number;
  closeRisk: boolean;
  injectedPickerPath: string | undefined;
  commitBindings: Map<string, {
    draftId: string;
    expectedDraftVersion: number;
    reviewDigest: string;
    commitId: string;
  }>;
  importTargets: Map<string, ImportTargetBinding>;
  importDraftIds: Set<string>;
  recoveryAttentionIds: Set<string>;
  /**
   * The Recovery Attention States this window's last 待我处理 read showed it (Issue #424). Showing one claims
   * nothing: opening it from there claims it for this window, and only while no other window holds it.
   */
  attentionOffers: Set<string>;
  importCommitIds: Set<string>;
  manuscriptCapabilities: Map<string, ManuscriptCapability>;
  editorResourceCapabilities: Map<string, EditorResourceCapability>;
  restorationBindings: Map<string, Map<string, {
    restorationId: string;
    bookId: string;
    bookTitle: string;
    manuscriptId: string;
    branchId: string;
  }>>;
  restorationBindingCount: number;
}

export interface ApplicationAuthorityClaims {
  requireNewDraftCapacity(owned: OwnedRendererWindow): void;
  claimImportState(owned: OwnedRendererWindow, draftId: string, commitId: string | null): void;
  requireDraft(owned: OwnedRendererWindow, draftId: string): void;
  releaseDraft(owned: OwnedRendererWindow, draftId: string): void;
  claimAttentions(owned: OwnedRendererWindow, attentionIds: ReadonlyArray<string>): void;
  requireAttention(owned: OwnedRendererWindow, attentionId: string): void;
  releaseAttention(owned: OwnedRendererWindow, attentionId: string): void;
  claimCommit(owned: OwnedRendererWindow, commitId: string): void;
  requireCommit(owned: OwnedRendererWindow, commitId: string): void;
  releaseCommit(owned: OwnedRendererWindow, commitId: string): void;
}
