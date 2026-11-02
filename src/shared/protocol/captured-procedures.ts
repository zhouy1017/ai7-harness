import type { ReviewCategoryOutputKind } from './review-runs.js';

// ---- 可复用工序 (Issue #65, plan slice S30; ADR 0087; V2-UX-REUSE-001 to 020, 029 to 031, 038 to 054, 063 to 066, KB-010) --

/** The one schema a Captured Procedure version's document is written in (ADR 0087 §1). */
export const CAPTURED_PROCEDURE_SCHEMA = 'ai7.captured-procedure/1' as const;

/** ADR 0090: additive successor; existing /1 documents and their exact digests never move. */
export const CAPTURED_PROCEDURE_SCHEMA_V2 = 'ai7.captured-procedure/2' as const;

/**
 * The one parameter slot a Captured Procedure carries: the review scope kind. The chapters are chosen at each run. `selection`
 * (Issue #423, S77 deferred item a) is the scope a Run pins when the house's procedure runs on the paragraphs 就这段发起任务… handed
 * over, and the scope a selection menu asks the house's procedures to be resolved for: it lives on the pin and that read only. A
 * document names a capture slot — 全书 or 选定章节 (`CAPTURED_PROCEDURE_CAPTURE_SLOTS`) — and never `selection`, so no existing
 * document or digest moves and none can be made that promises a scope 新建审阅 cannot supply.
 */
export type CapturedProcedureScopeSlot = 'whole' | 'chapters' | 'selection';

export const CAPTURED_PROCEDURE_SCOPE_SLOTS: readonly CapturedProcedureScopeSlot[] = ['whole', 'chapters', 'selection'];

/** The slots a document may carry and a capture may set: a selection is handed over at each run from the manuscript, never saved. */
export const CAPTURED_PROCEDURE_CAPTURE_SLOTS: readonly CapturedProcedureScopeSlot[] = ['whole', 'chapters'];

export const CAPTURED_PROCEDURE_SCOPE_LABELS = {
  whole: '全书',
  chapters: '选定章节',
  selection: '所选段落',
} as const satisfies Record<CapturedProcedureScopeSlot, string>;

/** The editor's title of a Captured Procedure: a label, never given to a model — in graphemes, and in UTF-16 code units. */
export const MAX_CAPTURED_PROCEDURE_TITLE_GRAPHEMES = 60;

export const MAX_CAPTURED_PROCEDURE_TITLE_CHARACTERS = 240;

/**
 * What one answer of 工序与规则 carries (Issue #65 review): the newest procedures and proposals as summaries; one procedure's or
 * proposal's versions a page at a time, newest first, each page also held to a byte budget so it always fits one frame; each
 * version naming its newest Runs or files and how many there are.
 */
export const MAX_CAPTURED_PROCEDURES_SHOWN = 50;

export const MAX_CAPTURED_PROCEDURE_VERSIONS_PAGE = 5;

export const MAX_DEVELOPER_PROPOSAL_VERSIONS_PAGE = 3;

export const MAX_CAPTURED_PROCEDURE_RUNS_SHOWN = 10;

/** The 图书交付包 versions one version row links, newest first (Issue #66, S31b; REUSE-031). */
export const MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN = 10;

export const MAX_DEVELOPER_PROPOSAL_FILES_SHOWN = 10;

/** A version's state (KB-010): 待验证 until `验证并启用…` succeeds, 已启用 after, 已停用 for good once stopped (ADR 0087 §3, §5). */
export type CapturedProcedureState = 'pending-validation' | 'enabled' | 'stopped';

export const CAPTURED_PROCEDURE_STATE_LABELS = {
  'pending-validation': '待验证',
  enabled: '已启用',
  stopped: '已停用',
} as const satisfies Record<CapturedProcedureState, string>;

/** One step of a Captured Procedure: a review category AI7 already executes, at the 工序 version the source Run used. */
export interface CapturedProcedureStepDocument {
  readonly categoryId: string;
  readonly procedure: { readonly procedureId: string; readonly version: string };
  readonly output: ReviewCategoryOutputKind;
  readonly model: boolean;
  readonly searchEngine: boolean;
}

/**
 * One Captured Procedure version's document, exactly its keys (ADR 0087 §1): the editor's title, `runAs`, the ordered steps,
 * the scope slot and the Authority Ceiling. It names no Book, chapter, Series, manuscript text, finding, decision,
 * authorization, receipt, plan digest, Provider, route or model, and no guideline clause or version.
 */
export interface CapturedProcedureDocument {
  readonly schema: typeof CAPTURED_PROCEDURE_SCHEMA | typeof CAPTURED_PROCEDURE_SCHEMA_V2;
  readonly title: string;
  readonly runAs: 'review-run';
  readonly steps: ReadonlyArray<CapturedProcedureStepDocument>;
  readonly parameters: { readonly scope: CapturedProcedureScopeSlot };
  /**
   * The most a Run prepared from it may do (ADR 0087 §4): its steps with their executors, the output kinds, whether any step
   * calls a model or a search engine, and the current-Book Run Source Scope.
   */
  readonly authorityCeiling: {
    readonly runSourceScope: 'current-book' | 'series';
    readonly steps: ReadonlyArray<{ readonly categoryId: string; readonly executor: string }>;
    readonly outputs: ReadonlyArray<ReviewCategoryOutputKind>;
    readonly model: boolean;
    readonly searchEngine: boolean;
  };
}

/** One category of a finished Review Run as the capture's source set offers it (REUSE-011, REUSE-012, REUSE-019). */
export interface ProcedureCaptureStepProjection {
  readonly categoryId: string;
  readonly label: string;
  readonly procedureTitle: string;
  readonly procedureVersion: string;
  readonly output: ReviewCategoryOutputKind;
  readonly model: boolean;
  readonly searchEngine: boolean;
  /** Whether the step may be kept: the source Run settled it, and its 工序 is still the current, available one. */
  readonly eligible: boolean;
  /** Why it is left out when it may not be kept; `null` when it may. */
  readonly excludedReason: string | null;
}

/** The kinds a capture could create; in this version only a Captured Procedure or a Developer Capability Proposal is open. */
export type ProcedureCaptureResultKind = 'captured-procedure' | 'developer-proposal' | 'skill-draft' | 'workflow-draft' | 'default-rule';

/**
 * `将以上工序保存为可复用工序` on one finished Review Run (ADR 0087 §2): its source set, what extraction would keep, and the
 * deterministic classification. A read: nothing is created.
 */
export interface ProcedureCaptureProjection {
  readonly bookId: string;
  readonly reviewRunId: string;
  readonly runLabel: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  /** Every category of the source Run, in the configuration's order, which a Captured Procedure keeps. */
  readonly steps: ReadonlyArray<ProcedureCaptureStepProjection>;
  /** The scope slot the source Run suggests: 全书 for a whole-book review, otherwise 选定章节. */
  readonly scopeSlot: CapturedProcedureScopeSlot;
  readonly sourceScopeLabel: string;
  /** The deterministic, provider-free classification (REUSE-002 to REUSE-009): the recommended type, and the others with why. */
  readonly classification: {
    readonly recommended: 'captured-procedure';
    readonly alternatives: ReadonlyArray<{ readonly kind: Exclude<ProcedureCaptureResultKind, 'captured-procedure'>; readonly available: boolean }>;
  };
  /** The Captured Procedures a capture may add its next version to, newest first, by their latest title. */
  readonly procedures: ReadonlyArray<{ readonly procedureId: string; readonly title: string; readonly latestVersion: number }>;
}

/**
 * What a Book must have for one step to run there (Issue #66, plan slice S31b; REUSE-048's declared abstract requirements):
 * `series` — the Book is in a Series, and its Series material is chosen apart at each run (REUSE-050); `baseline-analysis` —
 * the Book has a baseline analysis whose leads the step turns into 批注. A step with neither runs on any Book with a manuscript.
 */
export type CapturedProcedureStepRequirement = 'series' | 'baseline-analysis';

/** One step of a saved version, in the editor's words and with the facts the document holds. */
export interface CapturedProcedureStepProjection {
  readonly categoryId: string;
  readonly label: string;
  readonly procedureTitle: string;
  readonly procedureVersion: string;
  readonly output: ReviewCategoryOutputKind;
  readonly model: boolean;
  readonly searchEngine: boolean;
  /** What a Book must have for this step to run there, from the executor the document names (S31b); `null` for none. */
  readonly requirement: CapturedProcedureStepRequirement | null;
}

/**
 * A 图书交付包 version that holds the report of a Review Run pinned to one Captured Procedure version (Issue #66, S31b;
 * REUSE-031): an exact link through the Run, never a copy of what the package holds.
 */
export interface CapturedProcedurePackageLinkProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly packageVersionId: string;
  readonly version: number;
  readonly preparedAt: string;
}

/** A Review Run that pinned one version (REUSE-031): an exact link, never a copy of what it found. */
export interface CapturedProcedureRunLinkProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly reviewRunId: string;
  readonly label: string;
  readonly createdAt: string;
  /** Where the Run stands now, in the Review Run's own words (Issue #66, S31): 已完成, 计划已冻结 · 待授权 … */
  readonly stateLabel: string;
}

export interface CapturedProcedureVersionProjection {
  readonly versionId: string;
  readonly procedureId: string;
  readonly version: number;
  readonly title: string;
  readonly state: CapturedProcedureState;
  readonly stateLabel: string;
  readonly createdAt: string;
  /** When it was enabled or stopped; `null` while it waits for validation. */
  readonly stateRecordedAt: string | null;
  readonly steps: ReadonlyArray<CapturedProcedureStepProjection>;
  readonly scopeSlot: CapturedProcedureScopeSlot;
  /** Why the last `验证并启用…` failed, while the version still waits; empty otherwise (REUSE-025). */
  readonly validationProblems: ReadonlyArray<string>;
  /** The local provenance outside the digest (REUSE-015): the Review Run it was captured from. */
  readonly source: { readonly bookId: string; readonly bookTitle: string; readonly reviewRunId: string; readonly runLabel: string };
  /** The Review Runs approved under it — ran, or began to (Issue #66, S31 review P3-3). */
  readonly runCount: number;
  /** The Review Runs prepared from it and never approved; each is linked with its state like the others. */
  readonly preparedRunCount: number;
  readonly runs: ReadonlyArray<CapturedProcedureRunLinkProjection>;
  /**
   * The 图书交付包 versions that hold a report of a Review Run pinned to it, newest first, at most
   * `MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN` (Issue #66, S31b; REUSE-031); `packageCount` counts them all. The service reads
   * exactly the newest `min(packageCount, MAX_CAPTURED_PROCEDURE_PACKAGES_SHOWN)` rows and lists those whose digests hold, and
   * the renderer derives how many of the read rows could not be read as that minimum less `packages.length` (Issue #697; #705
   * item 5): a service that reads fewer or pages the links changes this contract, not only its own call.
   */
  readonly packages: ReadonlyArray<CapturedProcedurePackageLinkProjection>;
  readonly packageCount: number;
  readonly technical: { readonly documentSha256: string; readonly previousDocumentSha256: string | null };
}

/** A Captured Procedure as 工序与规则's list names it: its newest title and state, how many versions it has, whether it runs. */
export interface CapturedProcedureSummaryProjection {
  readonly procedureId: string;
  /** Its newest version's title. */
  readonly title: string;
  readonly versionCount: number;
  readonly latestVersion: number;
  readonly latestState: CapturedProcedureState;
  readonly latestStateLabel: string;
  /** Whether `运行此工序…` is offered: one of its versions is 已启用. */
  readonly runnable: boolean;
}

/** One Captured Procedure with one page of its versions, newest first; `versionsBefore` reads the next older page. */
export interface CapturedProcedureProjection extends CapturedProcedureSummaryProjection {
  /**
   * The version a new use resolves to now — the newest 已启用 one that still validates (Issue #66, S31; REUSE-043, REUSE-044) —
   * marked 最新可用 on its row; `null` when none is.
   */
  readonly latestEligibleVersionId: string | null;
  readonly versions: ReadonlyArray<CapturedProcedureVersionProjection>;
  /** The version number the next older page starts below; `null` when this page reaches version 1. */
  readonly versionsBefore: number | null;
}

/** One version of a Developer Capability Proposal (REUSE-063, REUSE-064): no Book material, sent nowhere. */
export interface DeveloperProposalVersionProjection {
  readonly proposalVersionId: string;
  readonly proposalId: string;
  readonly version: number;
  readonly title: string;
  readonly missingCapability: string;
  readonly affectedProcedure: string;
  readonly direction: string;
  readonly pluginCandidate: string;
  readonly createdAt: string;
  /** The newest files it was written to through the Save dialog, at most `MAX_DEVELOPER_PROPOSAL_FILES_SHOWN`: the name only, never where. */
  readonly files: ReadonlyArray<{ readonly fileName: string; readonly writtenAt: string }>;
  readonly fileCount: number;
  readonly technical: { readonly sha256: string };
}

export interface DeveloperProposalSummaryProjection {
  readonly proposalId: string;
  /** Its newest version's title. */
  readonly title: string;
  readonly versionCount: number;
  readonly latestVersion: number;
  readonly latestCreatedAt: string;
}

/** One proposal with one page of its versions, newest first; `versionsBefore` reads the next older page. */
export interface DeveloperProposalProjection extends DeveloperProposalSummaryProjection {
  readonly versions: ReadonlyArray<DeveloperProposalVersionProjection>;
  readonly versionsBefore: number | null;
}

/**
 * 知识库 › 工序与规则's 可复用工序 and 开发建议, apart from the built-in 工序 (ADR 0087 §5, REUSE-029, REUSE-030): summaries only,
 * so the list always fits one frame; each one's versions are read a page at a time.
 */
export interface CapturedProceduresProjection {
  readonly procedures: ReadonlyArray<CapturedProcedureSummaryProjection>;
  readonly proceduresTruncated: boolean;
  readonly proposals: ReadonlyArray<DeveloperProposalSummaryProjection>;
  readonly proposalsTruncated: boolean;
}

/** A guideline document one step applies, today against the source Run (ADR 0087 §3): a run applies today's. */
export interface CapturedProcedureGuidelineProjection {
  readonly title: string;
  readonly issuer: string;
  readonly version: string;
  /** The version the source Run applied; `null` when it applied none of this document. */
  readonly sourceVersion: string | null;
}

export interface CapturedProcedureCheckStepProjection extends CapturedProcedureStepProjection {
  readonly guidelines: ReadonlyArray<CapturedProcedureGuidelineProjection>;
  /** Why this step no longer resolves; `null` when it does. */
  readonly problem: string | null;
}

/**
 * `验证并启用…`'s preview (ADR 0087 §3): deterministic and provider-free. It creates no Task, Plan, Run, Provider call or
 * Session; `enableCapturedProcedure` confirms exactly this preview by its digest.
 */
export interface CapturedProcedureValidationProjection {
  readonly versionId: string;
  readonly procedureId: string;
  readonly version: number;
  readonly title: string;
  readonly state: CapturedProcedureState;
  readonly steps: ReadonlyArray<CapturedProcedureCheckStepProjection>;
  readonly scopeSlot: CapturedProcedureScopeSlot;
  readonly ceiling: CapturedProcedureDocument['authorityCeiling'];
  readonly problems: ReadonlyArray<string>;
  readonly passes: boolean;
  readonly previewDigest: string;
}

/** A step of the resolved version as the current Book can take it, or why it is left out (ADR 0087 §4). */
export interface CapturedProcedureRunStepProjection {
  readonly categoryId: string;
  readonly label: string;
  readonly available: boolean;
  readonly unavailableReason: string | null;
  /**
   * The step reads Series material (Issue #66, S31b; REUSE-049, REUSE-050): the sheet never ticks it for the editor, who
   * chooses it at each run; left unticked, the Run records it as left out by choice.
   */
  readonly chosenApart: boolean;
}

/**
 * `运行此工序…` or `按已保存的工序` for the current Book (ADR 0087 §4; UI ADR 0013, REUSE-043 to REUSE-045, REUSE-054): the newest
 * 已启用 version that still validates, its steps for this Book, and where today's guideline versions differ from the source
 * Run's. A read: it prepares nothing.
 */
export interface CapturedProcedureRunProjection {
  readonly bookId: string;
  readonly procedureId: string;
  readonly title: string;
  readonly resolved: null | {
    readonly runSourceScope?: 'series';
    readonly versionId: string;
    readonly version: number;
    /** Whether it is the latest eligible version — `false` when the editor chose an older eligible one (REUSE-054). */
    readonly latestEligible: boolean;
    readonly documentSha256: string;
    readonly scopeSlot: CapturedProcedureScopeSlot;
    readonly steps: ReadonlyArray<CapturedProcedureRunStepProjection>;
    readonly guidelineChanges: ReadonlyArray<{ readonly categoryId: string; readonly label: string; readonly title: string; readonly sourceVersion: string | null; readonly version: string }>;
  };
  /**
   * Every version newer than the latest eligible one, passed over with why — stopped, still waiting for validation, or no longer
   * validating (REUSE-043, REUSE-044: disclosed, never silent; Issue #66, S31).
   */
  readonly passedOver: ReadonlyArray<{ readonly version: number; readonly reason: string }>;
  /**
   * The versions the editor may choose instead, newest first: each 已启用 and still validating (Issue #66, S31; REUSE-054's manual
   * selector). The first is the latest eligible, which a new use takes unless the editor chooses another.
   */
  readonly eligibleVersions: ReadonlyArray<{ readonly versionId: string; readonly version: number }>;
  /** Why it cannot run now; `null` when `resolved` is set. */
  readonly unavailableReason: string | null;
}

/** A Review Run one version's 停用 touches (Issue #66, S31; REUSE-038, REUSE-041): an exact link and where it stands. */
export interface CapturedProcedureStopRunProjection {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly reviewRunId: string;
  readonly label: string;
  readonly stateLabel: string;
}

/** One version as `停用…`'s preview names it. */
export interface CapturedProcedureStopVersionProjection {
  readonly versionId: string;
  readonly version: number;
  readonly stateLabel: string;
  /** The Review Runs approved under it — ran, or began to: each keeps naming it after the 停用 (REUSE-040). */
  readonly runCount: number;
  /** Prepared from it and not yet approved, still the newest of their Book: they cannot be approved after it and are prepared again. */
  readonly prepared: ReadonlyArray<CapturedProcedureStopRunProjection>;
  readonly preparedCount: number;
  /** Approved and not yet finished: they go on under the version they were approved with; the 停用 does not move them. */
  readonly active: ReadonlyArray<CapturedProcedureStopRunProjection>;
  readonly activeCount: number;
}

/**
 * `停用…`'s preview (Issue #66, S31): the Version Removal Preview (REUSE-038, REUSE-040, REUSE-041) for a 停用, which removes
 * nothing (ADR 0087 §5). It names the Runs it touches, what a new use resolves to afterwards, and what stays; `stopCapturedProcedure`
 * confirms exactly this preview by its digest. A read.
 */
export interface CapturedProcedureStopPreviewProjection {
  readonly procedureId: string;
  readonly title: string;
  /** `null` for 全部停用. */
  readonly versionId: string | null;
  /** The newest versions it takes, as many as one frame holds (S31 review P2-2); `versionCount` counts them all. */
  readonly versions: ReadonlyArray<CapturedProcedureStopVersionProjection>;
  readonly versionCount: number;
  /** The version a new use resolves to afterwards; `null` when none will be runnable. */
  readonly afterVersion: number | null;
  readonly previewDigest: string;
}

/** The pin a Review Run prepared from a Captured Procedure records (ADR 0087 §4): never moved by a later version or a 停用. */
export interface ReviewRunProcedureProjection {
  readonly procedureId: string;
  readonly versionId: string;
  readonly version: number;
  readonly title: string;
  readonly documentSha256: string;
  /** The version was stopped since: a Run not yet authorized cannot be (ADR 0087 §5). */
  readonly stopped: boolean;
  /**
   * This house has no such version — the Book was merged in from another (Issue #65 review): the Run keeps naming what it was
   * prepared from, and one not yet authorized cannot be, as with a stopped version.
   */
  readonly missing: boolean;
  /** The steps the Run left out, with why; `byChoice` for a step the Book could take that the editor did not choose (S31b). */
  readonly leftOut: ReadonlyArray<{ readonly categoryId: string; readonly label: string; readonly reason: string; readonly byChoice: boolean }>;
}

/** How much of one procedure's latest eligible version one Book can take now (Issue #66, S31b). */
export type CapturedProcedureFit = 'all' | 'partial' | 'none' | 'no-version';

/**
 * One enabled Captured Procedure as it applies to one Book (Issue #66, plan slice S31b; REUSE-046, REUSE-053, REUSE-054): the
 * one version a new use takes — the latest eligible — and how many of its steps this Book can take now, with why each other is
 * left out. Deterministic and provider-free. It names no procedure as a recommendation (ADR 0087 §4): every enabled procedure
 * stays open to manual selection, and a mismatch is said, never a prohibition.
 */
export interface CapturedProcedureApplicabilityEntryProjection {
  readonly procedureId: string;
  readonly title: string;
  /** The version a new use takes now; `null` when none of its enabled versions still validates. */
  readonly latestEligible: null | { readonly versionId: string; readonly version: number };
  readonly fit: CapturedProcedureFit;
  readonly stepCount: number;
  /** Steps this Book can take now, the Series steps the editor chooses apart among them. */
  readonly availableCount: number;
  /** The labels of the steps this Book can take that the editor chooses apart at each run (REUSE-050). */
  readonly chosenApart: ReadonlyArray<string>;
  /** The same steps by category and label (Issue #423, S77 deferred item a): the selection composer's boxes carry the category. */
  readonly chosenApartSteps: ReadonlyArray<{ readonly categoryId: string; readonly label: string }>;
  /** The steps this Book cannot take now, with why. */
  readonly leftOut: ReadonlyArray<{ readonly label: string; readonly reason: string }>;
}

/** 按已保存的工序 on one Book's 新建审阅 (Issue #66, S31b): the house's enabled Captured Procedures, as each applies to it. */
export interface CapturedProcedureApplicabilityProjection {
  readonly bookId: string;
  readonly procedures: ReadonlyArray<CapturedProcedureApplicabilityEntryProjection>;
  readonly truncated: boolean;
}

export const MAX_DEVELOPER_PROPOSAL_TITLE_GRAPHEMES = 60;

/** Each field of a 开发建议, in graphemes and in UTF-16 code units: a page of versions then always fits one frame. */
export const MAX_DEVELOPER_PROPOSAL_FIELD_GRAPHEMES = 2000;

export const MAX_DEVELOPER_PROPOSAL_FIELD_CHARACTERS = 4000;

export interface SaveCapturedProcedureInput {
  bookId: string;
  reviewRunId: string;
  /** The steps kept, each a category the source Run settled; their order is the configuration's (ADR 0087 §2). */
  categoryIds: ReadonlyArray<string>;
  scopeSlot: CapturedProcedureScopeSlot;
  title: string;
  /** The Captured Procedure this capture is the next version of; `null` for a new one. */
  procedureId: string | null;
}

export interface SaveDeveloperProposalInput {
  /** The proposal this is the next version of; `null` for a new one. */
  proposalId: string | null;
  title: string;
  missingCapability: string;
  affectedProcedure: string;
  direction: string;
  pluginCandidate: string;
}

export type SaveDeveloperProposalFileOutcome =
  | { readonly outcome: 'cancelled' }
  | { readonly outcome: 'saved'; readonly fileName: string; readonly proposal: DeveloperProposalProjection };
