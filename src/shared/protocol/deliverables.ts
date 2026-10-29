import type {
  MilestonePurposeKind,
} from './series.js';
import type {
  PublicationActualsProjection,
  ManuscriptExportReceiptProjection,
  SourceFormat,
  ManuscriptExportFormat,
  ManuscriptExportOptions,
  ExportRetentionDisclosure,
  ExportFidelityRowProjection,
} from '../protocol.js';

// ---- ⑥ 交付物 · 发稿 (Issue #414, plan slice S65) --------------------------------------------------------
//
// Milestone Versions and the Publication Version belong to the primary Manuscript only (V2-UX-MILE-014).
// 设为发稿版本 is one deterministic, local interaction over one exact milestone; it publishes, sends and
// delivers nothing (V2-UX-PUB-008, PUB-009). The words below are the service's, so the surface shows
// exactly what the records mean.

/** The fixed sentence beside 设为发稿版本 (V2-UX-PUB-004): what a designation means, and what AI7 will not do. */
export const PUBLICATION_VERSION_STATEMENT = '仅表示此版本可用于上述发稿范围；AI7 不会发布或发送' as const;
/** How the milestone the current 发稿版本 designates is marked in the list (interaction spec › Publication Version). */
export const PUBLICATION_VERSION_LABEL = '发稿版本' as const;
/** The Publication Version Change Notice: the manuscript changed after the current designation (V2-UX-PUB-006). */
export const PUBLICATION_CHANGE_NOTICE = '自发稿版本后有修改' as const;
/** Why 设为发稿版本 cannot be offered yet: it designates an existing milestone, never the current text (PUB-002). */
export const PUBLICATION_NEEDS_MILESTONE = '先保存里程碑版本' as const;
export const PUBLICATION_NEEDS_MANUSCRIPT = '先导入稿件，再保存里程碑版本' as const;
/**
 * The pending line a designation leaves in the 发稿 block: the reminder to enter the 定价与首印 actuals
 * (V2-UX-EVAL-010). It is recorded now and offers no action until the evaluation features take it up.
 */
export const PUBLICATION_ACTUALS_PROMPT_LABEL = '录入定价与首印' as const;
export const PUBLICATION_ACTUALS_PROMPT_STATE = '尚未录入' as const;
/** The line once the editor entered the 发稿版本's actuals (Issue #430, S82). */
export const PUBLICATION_ACTUALS_RECORDED_STATE = '已录入' as const;
/** Words AI7 never uses for a Publication Version (V2-UX-PUB-009): no projection of 交付物 contains them. */
export const PUBLICATION_FORBIDDEN_WORDS = ['已发布', '已发送', '已交付', '已确认送达'] as const;
/** 发稿范围 and 依据, in characters (code points) once NFC-normalized and trimmed. */
export const MAX_PUBLICATION_SCOPE_CHARACTERS = 80;
export const MAX_PUBLICATION_BASIS_CHARACTERS = 500;
/**
 * The most milestones and designations one 交付物 answer lists, newest first. At its widest a listed
 * milestone weighs about 2.8 KB on the wire and a designation about 3.3 KB, so both lists together stay
 * under 400 KB of the frame; an older milestone stays designatable by its identity.
 */
export const MAX_DELIVERABLE_MILESTONES = 100;
export const MAX_PUBLICATION_VERSIONS_LISTED = 30;

/**
 * What a designation leaves for later slices, recorded in the same interaction: the prompt to enter the
 * 定价与首印 actuals (V2-UX-EVAL-010) and the archiving of the Book's 审稿意见 into 范例 (V2-UX-KB-006).
 */
export type PublicationEventKind = 'actuals-prompt' | 'exemplar-archive';
export const PUBLICATION_EVENT_KINDS: readonly PublicationEventKind[] = ['actuals-prompt', 'exemplar-archive'];

/** `自「标签」后有修改` (V2-UX-MILE-007): the manuscript changed after this milestone. */
export function milestoneChangedSinceLabel(label: string): string {
  return `自「${label}」后有修改`;
}

/** The completion of 设为发稿版本 (interaction spec › Publication-version rules): the exact version and scope. */
export function publicationDesignatedLabel(milestoneLabel: string, revisionLabel: string, scope: string): string {
  return `已设为发稿版本 · 「${milestoneLabel}」 · ${revisionLabel} · ${scope}`;
}

/** An identical repeat of the current designation records nothing and says so. */
export function publicationUnchangedLabel(milestoneLabel: string, revisionLabel: string, scope: string): string {
  return `已是当前发稿版本 · 「${milestoneLabel}」 · ${revisionLabel} · ${scope}`;
}

/**
 * 发稿范围 or 依据 as it is recorded, or `null` when it cannot be: well formed, NFC-normalized and trimmed,
 * and 1 to `maximum` characters counted as code points — as SQLite's `length()` counts them.
 */
export function publicationText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || !value.isWellFormed()) return null;
  const text = value.normalize('NFC').trim();
  const characters = [...text].length;
  return characters >= 1 && characters <= maximum ? text : null;
}

/** One Milestone Version of the Book's primary Manuscript as 交付物 lists it (V2-UX-MILE-008). */
export interface MilestoneListItemProjection {
  milestoneId: string;
  label: string;
  purposeKind: MilestonePurposeKind;
  /** What the purpose reads as: a frozen purpose's own label, or the editor's own words. */
  purposeLabel: string;
  revisionId: string;
  /** The exact revision the milestone designates, `rN`. */
  revisionLabel: string;
  actor: '本机编辑';
  createdAt: string;
  note: string | null;
  /** Whether the manuscript changed after this milestone (V2-UX-MILE-007). Nothing here marks a milestone final (MILE-006). */
  changedSince: boolean;
  /** `自「标签」后有修改` exactly when `changedSince`. */
  changedSinceLabel: string | null;
  /** `发稿版本` on the milestone the current Publication Version designates; `null` on every other. */
  designation: null | { publicationVersionId: string; label: typeof PUBLICATION_VERSION_LABEL };
  /** 查看技术详情 only: the internal Signoff Record saved with the milestone (MILE-005). */
  technical: { signoffRecordId: string };
}

/** One 设为发稿版本 as recorded (V2-UX-PUB-003, PUB-007): append-only, and never retargeted. */
export interface PublicationVersionProjection {
  publicationVersionId: string;
  /** 第 N 次 设为发稿版本 of this Book. */
  ordinal: number;
  /** The newest designation of the Book is its current 发稿版本. */
  current: boolean;
  milestoneId: string;
  milestoneLabel: string;
  revisionId: string;
  revisionLabel: string;
  scope: string;
  basis: string;
  actor: '本机编辑';
  createdAt: string;
  /** 查看技术详情 only: the exact identities behind the designation, never ordinary editorial wording. */
  technical: {
    revisionDigest: string;
    digest: string;
    /** The separately identified internal Public Release Permission recorded with the designation. */
    permissionId: string;
    events: ReadonlyArray<{ eventId: string; kind: PublicationEventKind }>;
  };
  /** Its 维护事项 (Issue #426, S68a; MAINT-001): the cases bound to this exact designation, and the internal states they set. */
  maintenance: PublicationMaintenanceProjection;
}

// ---- 维护事项 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011, ADR 0040) ----------------------------------------

/** The six classifications (MAINT-002), in the order the form shows them, none preselected. */
export type MaintenanceClassification = 'correction' | 'errata' | 'supersession' | 'withdrawal' | 'reissue' | 'archive';
export const MAINTENANCE_CLASSIFICATIONS: readonly MaintenanceClassification[] = [
  'correction', 'errata', 'supersession', 'withdrawal', 'reissue', 'archive',
];
/** A case's status as its newest revision records it (MAINT-007, MAINT-011). */
export type MaintenanceCaseStatus = 'unresolved' | 'waiting' | 'complete';
/** What one revision of a case recorded (MAINT-003): the case itself, a link, a 勘误 version, or a conclusion. */
export type MaintenanceCaseStep = 'recorded' | 'proposal-linked' | 'publication-linked' | 'errata-saved' | 'concluded';
/** The step a case offers next, named by the action the case shows for it. */
export type MaintenanceNextStep = 'link-proposal' | 'link-publication' | 'write-errata' | 'conclude';

/** 原因, 依据 and a conclusion's 结论说明, in characters (code points) once NFC-normalized and trimmed. */
export const MAX_MAINTENANCE_REASON_CHARACTERS = 500;
export const MAX_MAINTENANCE_EVIDENCE_CHARACTERS = 500;
/** One 勘误 version's words. */
export const MAX_MAINTENANCE_ERRATA_CHARACTERS = 4000;
/** At most this many cases of one designation are listed on 交付物, newest first; the count says how many there are. */
export const MAX_MAINTENANCE_CASES_LISTED = 5;
/** At most this many revisions of one case are read; the count says how many there are. */
export const MAX_MAINTENANCE_REVISIONS_LISTED = 60;
/** At most this many 修改建议 are offered to 关联. */
export const MAX_MAINTENANCE_PROPOSALS_OFFERED = 20;
/** At most this many later designations are offered to 关联发稿版本, the nearest first. */
export const MAX_MAINTENANCE_PUBLICATIONS_OFFERED = 30;
/** `更早的维护事项…` reads this many older cases of one designation at a time. */
export const MAX_MAINTENANCE_CASES_PAGE = 20;

/** One case as its designation lists it: what it is, where it stands and what it asks next. */
export interface MaintenanceCaseSummaryProjection {
  caseId: string;
  /** 第 N 项维护事项 of the Book. */
  ordinal: number;
  classification: MaintenanceClassification;
  classificationLabel: string;
  status: MaintenanceCaseStatus;
  statusLabel: string;
  nextStep: MaintenanceNextStep | null;
  revisions: number;
  recordedAt: string;
  latestAt: string;
}

/** A designation's 维护事项, as far as 交付物's one read carries them. */
export interface PublicationMaintenanceProjection {
  cases: ReadonlyArray<MaintenanceCaseSummaryProjection>;
  total: number;
  /** A 撤回 case holds it: in AI7 it is no longer used for 发稿 (ADR 0040), and it stays readable. */
  withdrawn: boolean;
  /** An 归档 case holds it: its maintenance is closed; its use and its history are unchanged. */
  archived: boolean;
}

/**
 * What one revision links (MAINT-010), in the linked record's own words; linking grants the case nothing. A 勘误 version is
 * named by its number: its words are the case's newest `errata`, so a case's answer stays within one frame however many
 * versions it saved.
 */
export type MaintenanceCaseLinkProjection =
  | { kind: 'proposal'; markId: string; label: string; stateLabel: string }
  | { kind: 'publication-version'; publicationVersionId: string; label: string }
  | { kind: 'errata'; errataVersionId: string; version: number };

/** One immutable revision of a case, on its timeline (MAINT-003, MAINT-010). */
export interface MaintenanceCaseRevisionProjection {
  revision: number;
  step: MaintenanceCaseStep;
  stepLabel: string;
  status: MaintenanceCaseStatus;
  statusLabel: string;
  reason: string | null;
  evidence: string | null;
  link: MaintenanceCaseLinkProjection | null;
  actor: '本机编辑';
  recordedAt: string;
  /** 查看技术详情 only. */
  digest: string;
}

/** One 维护事项 in its workspace: its target, its timeline oldest first, and what it offers next. */
export interface MaintenanceCaseProjection {
  bookId: string;
  caseId: string;
  ordinal: number;
  classification: MaintenanceClassification;
  classificationLabel: string;
  /** What the classification does, in the editor's words (ADR 0040). */
  consequence: string;
  /** 撤回 and 归档 only: MAINT-008's sentence, standing with the case. */
  internalOnly: string | null;
  /** The exact designation it is bound to, never retargeted. */
  target: { publicationVersionId: string; ordinal: number; label: string; revisionId: string; revisionLabel: string };
  status: MaintenanceCaseStatus;
  statusLabel: string;
  nextStep: MaintenanceNextStep | null;
  revisions: ReadonlyArray<MaintenanceCaseRevisionProjection>;
  revisionsTotal: number;
  revisionsBefore: number | null;
  inspectedErrata: null | { errataVersionId: string; version: number; body: string; recordedAt: string };
  /** The newest 勘误 version, with how many there are; `null` before the first. */
  errata: null | { errataVersionId: string; version: number; body: string; recordedAt: string };
  /**
   * The conclusions 记录维护事项结论… may record now: both while the case is open, and only 仍未解决 while a 替代 or 再版
   * still waits for its separately designated version (MAINT-007); none once complete.
   */
  conclusions: ReadonlyArray<'unresolved' | 'complete'>;
  /** What 关联… offers: the manuscript's 修改建议 made after the designation, and the designations after it. */
  choices: {
    proposals: ReadonlyArray<{ markId: string; label: string; stateLabel: string; createdAt: string }>;
    publications: ReadonlyArray<{ publicationVersionId: string; label: string }>;
    publicationsAfter: number | null;
  };
  /** The revision the editor read: the next step names it, and a step against another is refused. */
  expectedRevision: number;
  technical: { caseDigest: string };
}

/** `记录维护事项` (MAINT-002, MAINT-003): one case and its first revision, bound to one exact designation. */
export interface RecordMaintenanceCaseInput {
  bookId: string;
  publicationVersionId: string;
  classification: MaintenanceClassification;
  reason: string;
  evidence: string | null;
}

export interface InspectMaintenanceCaseInput {
  bookId: string;
  caseId: string;
  beforeRevision?: number;
  afterPublicationOrdinal?: number;
  errataVersionId?: string;
}

/** `更早的维护事项…`: the older cases of one designation of the route's Book, before the oldest one shown. */
export interface ListMaintenanceCasesInput {
  bookId: string;
  publicationVersionId: string;
  /** The ordinal of the oldest case shown: the page holds the cases before it, newest first. */
  beforeOrdinal: number;
}

/** One page of a designation's older cases (MAINT-001): every case it holds can be opened, however old. */
export interface MaintenanceCasePageProjection {
  bookId: string;
  publicationVersionId: string;
  cases: ReadonlyArray<MaintenanceCaseSummaryProjection>;
  /** Cases older still. */
  more: boolean;
}

/** One later step of a case, appended as its next revision against the one the editor read. */
export type MaintenanceCaseStepInput =
  | { kind: 'link-proposal'; markId: string }
  | { kind: 'link-publication'; publicationVersionId: string }
  | { kind: 'conclude'; status: 'unresolved' | 'complete'; outcome: string };

export interface AppendMaintenanceCaseRevisionInput {
  bookId: string;
  caseId: string;
  expectedRevision: number;
  step: MaintenanceCaseStepInput;
}

/** `保存勘误版本` (MAINT-005): the 勘误's next version, linked by the case's next revision. */
export interface SaveMaintenanceErrataInput {
  bookId: string;
  caseId: string;
  expectedRevision: number;
  body: string;
}

/** What a step came to: the case as it stands and the completion words (`维护事项已记录` or `维护事项结论已记录`). */
export interface MaintenanceCaseResultProjection {
  bookId: string;
  maintenanceCase: MaintenanceCaseProjection;
  completion: string;
}

/**
 * The 录入定价与首印 line the current designation leaves (EVAL-010): `尚未录入` until the editor enters the actuals for this
 * 发稿版本 in 设置 › 评估校准与预测 (Issue #430, S82), then `已录入` with them.
 */
export interface PublicationActualsPromptProjection {
  eventId: string;
  publicationVersionId: string;
  label: typeof PUBLICATION_ACTUALS_PROMPT_LABEL;
  stateLabel: typeof PUBLICATION_ACTUALS_PROMPT_STATE | typeof PUBLICATION_ACTUALS_RECORDED_STATE;
  recordedAt: string;
  /** The actuals entered for this 发稿版本; `null` while none were. */
  actuals: PublicationActualsProjection | null;
}

/**
 * The 交付物 destination of one Book, as far as S65 reaches: the 发稿 · 稿件 block (⑥) — the Manuscript's
 * milestones, 设为发稿版本 and what followed it. Production Documents and the 图书交付包 are later slices'.
 */
export interface DeliverablesProjection {
  bookId: string;
  bookTitle: string;
  /** The Book's primary Manuscript as it stands now; `null` for a Book without one. */
  manuscript: null | { manuscriptId: string; branchId: string; revisionId: string; revisionLabel: string; journalSequence: number; workingDigest: string };
  publication: {
    /** The milestones newest first, at most `MAX_DELIVERABLE_MILESTONES`; none is preselected or final. */
    milestones: ReadonlyArray<MilestoneListItemProjection>;
    milestonesTruncated: boolean;
    /** Every designation newest first, at most `MAX_PUBLICATION_VERSIONS_LISTED`; the first is the current 发稿版本. */
    designations: ReadonlyArray<PublicationVersionProjection>;
    designationsTruncated: boolean;
    /** `自发稿版本后有修改` once the manuscript changed after the current designation's exact revision. */
    changeNotice: null | { label: typeof PUBLICATION_CHANGE_NOTICE; publicationVersionId: string; revisionLabel: string };
    /** Whether 设为发稿版本 can be offered, and why not. */
    designate: { available: boolean; unavailableReason: string | null };
    statement: typeof PUBLICATION_VERSION_STATEMENT;
    actualsPrompt: PublicationActualsPromptProjection | null;
  };
  /**
   * The Book's approved exports newest first, at most `MAX_EXPORT_RECORDS_LISTED` (Issue #413): each with what it
   * came to — a receipt, a failure that changed nothing, or `结果待确认`.
   */
  exports: ReadonlyArray<ManuscriptExportReceiptProjection>;
}

// ---- ⑥ 交付物 · 生产文档 (Issue #415, plan slice S66; V2-UX-DELIV-001, DELIV-002, WORK-013) ----------------

/** The most versions one document's card lists, newest first; an older version stays in the document's history. */
export const MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED = 20;
/** The most source materials 从来源材料创建 offers, newest first. */
export const MAX_PRODUCTION_DOCUMENT_SOURCES_LISTED = 20;
/** The most paragraphs a document may start with; a longer material is not offered as one. */
export const MAX_PRODUCTION_DOCUMENT_BLOCKS = 2_000;

/** One saved version of a Production Document: `版本 N`, never a milestone (V2-UX-MILE-014). */
export interface ProductionDocumentVersionProjection {
  revisionId: string;
  /** `版本 N`. */
  label: string;
  ordinal: number;
  createdAt: string;
  revisionDigest: string;
}

/** A Production Document as it stands: its versions and whether its working text moved past the latest one. */
export interface ProductionDocumentProjection {
  documentId: string;
  branchId: string;
  createdAt: string;
  /**
   * The Book's source material it was made from, and how many of its 批注与修订 the document did not carry (Issue #547):
   * its text was read with every tracked change rejected and its comments left out. `null` for a document made before
   * the count was recorded. `drafted`: the document began as AI7's writing draft (Issue #432, S84a) — its words were read from
   * no file, and the Source Version is the manuscript file of the revision its writing Task read.
   */
  origin: { sourceVersionId: string; displayName: string; marksNotCarried: number | null; drafted: boolean };
  /** Newest first, at most `MAX_PRODUCTION_DOCUMENT_VERSIONS_LISTED`. */
  versions: ReadonlyArray<ProductionDocumentVersionProjection>;
  versionsTruncated: boolean;
  /** The working text differs from the latest version: `保存为版本` would make a new one. */
  changedSinceVersion: boolean;
  journalSequence: number;
  workingDigest: string;
  /** Every Delivery Record newest first, at most `MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED` (Issue #415, S66b). */
  deliveries: ReadonlyArray<ProductionDocumentDeliveryProjection>;
  deliveriesTruncated: boolean;
  /** `交付后有修改` (DELIV-004): an edit after a delivery — the document was delivered, and its text is no version it was delivered at. */
  changedSinceDelivery: boolean;
  /** Its Deliverable Workflow Lens (Issue #415, S66c; V2-UX-WORK-001 to 009): the pinned profile and its seven phases. */
  workflow: ProductionDocumentWorkflowProjection;
}

/** The seven shared phases of a Deliverable Workflow (V2-UX-WORK-003), in the profile's order. */
export type ProductionDocumentPhaseId =
  | 'intake'
  | 'source-development'
  | 'drafting'
  | 'review-verification'
  | 'finalization'
  | 'delivery'
  | 'maintenance';
export const PRODUCTION_DOCUMENT_PHASE_IDS: readonly ProductionDocumentPhaseId[] = [
  'intake', 'source-development', 'drafting', 'review-verification', 'finalization', 'delivery', 'maintenance',
];
export const PRODUCTION_DOCUMENT_PHASE_LABELS: Readonly<Record<ProductionDocumentPhaseId, string>> = {
  intake: '接收与准备',
  'source-development': '来源建设',
  drafting: '起草',
  'review-verification': '审阅与核查',
  finalization: '定稿',
  delivery: '交付',
  maintenance: '维护',
};

/**
 * A phase's recorded state (WORK-004): only the editor's deterministic commands move it (WORK-008). `等待你处理` is read
 * beside it from the document's own facts, never recorded.
 */
export type ProductionDocumentPhaseState = 'not-started' | 'in-progress' | 'completed' | 'skipped' | 'reopened';
export const PRODUCTION_DOCUMENT_PHASE_STATE_LABELS: Readonly<Record<ProductionDocumentPhaseState, string>> = {
  'not-started': '未开始',
  'in-progress': '进行中',
  completed: '已完成',
  skipped: '已跳过',
  reopened: '已重新打开',
};
/** The pill of a phase that is open and has something the editor must handle (WORK-004). */
export const PRODUCTION_DOCUMENT_PHASE_WAITING_LABEL = '等待你处理';

export type ProductionDocumentPhaseAction = 'start' | 'complete' | 'skip' | 'reopen';
export const PRODUCTION_DOCUMENT_PHASE_ACTIONS: readonly ProductionDocumentPhaseAction[] = ['start', 'complete', 'skip', 'reopen'];

/** Why a phase is skipped (WORK-009): choices shown unselected, and 自行输入, which needs the editor's words. */
export type ProductionDocumentSkipReason = 'not-needed' | 'done-elsewhere' | 'later' | 'custom';
export const PRODUCTION_DOCUMENT_SKIP_REASONS: Readonly<Record<ProductionDocumentSkipReason, string>> = {
  'not-needed': '这份文档不需要这一阶段',
  'done-elsewhere': '这一阶段已在别处完成',
  later: '暂时跳过，之后再补',
  custom: '自行输入',
};
/** Why a completed or skipped phase is reopened (WORK-009), the same way. */
export type ProductionDocumentReopenReason = 'needs-change' | 'sources-changed' | 'redo-after-delivery' | 'custom';
export const PRODUCTION_DOCUMENT_REOPEN_REASONS: Readonly<Record<ProductionDocumentReopenReason, string>> = {
  'needs-change': '发现需要再改的地方',
  'sources-changed': '来源或事实有变化',
  'redo-after-delivery': '交付后需要重做',
  custom: '自行输入',
};
/** The editor's own words beside a reason, in characters once NFC-normalized and trimmed. */
export const MAX_PRODUCTION_DOCUMENT_PHASE_REASON_CHARACTERS = 200;

/** One recorded move of a phase (WORK-009): what it did, from which state to which, why, and when. */
export interface ProductionDocumentPhaseTransitionProjection {
  action: ProductionDocumentPhaseAction;
  fromState: ProductionDocumentPhaseState;
  toState: ProductionDocumentPhaseState;
  /** A skip's or a reopen's reason: the choice, its words, and the editor's own; `null` for 开始 and 完成. */
  reason: null | { choice: string; label: string; text: string | null };
  recordedAt: string;
}

export interface ProductionDocumentPhaseProjection {
  phaseId: ProductionDocumentPhaseId;
  label: string;
  state: ProductionDocumentPhaseState;
  /** The state's words, or `等待你处理` for an open phase with something to handle. */
  stateLabel: string;
  /** What the open phase waits for the editor on, read from the document now; `null` when nothing. */
  waiting: string | null;
  /** What the editor may do to it now, in the order the lens offers them. */
  actions: ReadonlyArray<ProductionDocumentPhaseAction>;
  /**
   * The move that brought the phase to its state — a skip's or a reopen's with its reason — or `null` before any. Every
   * earlier move stays recorded (WORK-009); 交付物's one read carries only this one for each phase, to stay one frame.
   */
  latest: ProductionDocumentPhaseTransitionProjection | null;
  /** How many moves the phase has had. */
  moves: number;
}

/**
 * A Production Document's Deliverable Workflow Lens (Issue #415, S66c; V2-UX-WORK-001 to 009): the profile it follows,
 * pinned when the document began (WORK-002), a factual summary with no percentage (WORK-007), 下一项需要处理
 * (WORK-005), and its seven phases, several of which may be open at once (WORK-004).
 */
export interface ProductionDocumentWorkflowProjection {
  profile: { id: string; name: string; version: string; activatedAt: string };
  summary: string;
  /** Waiting items first, then the open phases, in phase order; empty when nothing needs the editor. */
  next: ReadonlyArray<{ phaseId: ProductionDocumentPhaseId; text: string }>;
  phases: ReadonlyArray<ProductionDocumentPhaseProjection>;
  /** How many moves the document's phases have had: a move names it, so one made since the editor looked is refused. */
  transitions: number;
}

/**
 * One deterministic move of one phase of a document of the route's Book (WORK-008, WORK-009): 开始, 完成, 跳过 or 重新打开,
 * the last two with a reason. `expectedTransitions` is the count the editor saw.
 */
export interface TransitionProductionDocumentPhaseInput {
  bookId: string;
  documentId: string;
  phaseId: ProductionDocumentPhaseId;
  action: ProductionDocumentPhaseAction;
  expectedTransitions: number;
  reason: null | { choice: string; text: string | null };
}

/** Who a delivery is for: the house's list, or the editor's own words (DELIV-003). */
export type ProductionDocumentRecipientKind = 'publicity' | 'editorial' | 'external-media' | 'other' | 'custom';
export const PRODUCTION_DOCUMENT_RECIPIENT_KINDS: readonly ProductionDocumentRecipientKind[] = ['publicity', 'editorial', 'external-media', 'other', 'custom'];
/** The house's recipients in their order; `custom` is the editor's own words. */
export const PRODUCTION_DOCUMENT_RECIPIENT_LABELS: Readonly<Record<Exclude<ProductionDocumentRecipientKind, 'custom'>, string>> = {
  publicity: '宣传部',
  editorial: '编辑部',
  'external-media': '外部媒体',
  other: '其他',
};
/** A recipient in the editor's own words, and a delivery's note, in characters once NFC-normalized and trimmed. */
export const MAX_PRODUCTION_DOCUMENT_RECIPIENT_CHARACTERS = 40;
export const MAX_PRODUCTION_DOCUMENT_DELIVERY_NOTE_CHARACTERS = 500;
export const MAX_PRODUCTION_DOCUMENT_DELIVERIES_LISTED = 20;

/**
 * One Delivery Record (DELIV-003): which version went to whom, with the editor's note, and what its export came to —
 * the file written to the chosen place, or nothing yet. A delivery never sends, designates or publishes anything.
 */
export interface ProductionDocumentDeliveryProjection {
  deliveryId: string;
  /** 第 N 次交付 of the document. */
  ordinal: number;
  revisionId: string;
  versionLabel: string;
  recipient: { kind: ProductionDocumentRecipientKind; label: string };
  note: string | null;
  recordedAt: string;
  /**
   * The delivered version's export recorded after this delivery and before the next: the newest that wrote its file, else the
   * newest attempt; `null` when none.
   */
  export: null | { preparationId: string; outcome: 'created' | 'replaced' | 'ambiguous' | 'failed'; outcomeLabel: string; fileName: string };
}

/** One house type's card in 交付物. */
export interface ProductionDocumentTypeProjection {
  typeId: string;
  label: string;
  /** `本书不做` for this Book, as its latest decision records it. */
  notForThisBook: boolean;
  document: ProductionDocumentProjection | null;
}

/** A source-only material of the Book a document can be made from. */
export interface ProductionDocumentSourceProjection {
  sourceVersionId: string;
  displayName: string;
  format: SourceFormat;
  createdAt: string;
}

/**
 * 交付 · 生产文档 of one Book (Issue #415, S66), read on its own beside the 发稿 block: one card per house type and the
 * materials a document can start from. A read of its own, since a document's versions and Delivery Records would not
 * fit one service frame beside the Manuscript's milestones and designations.
 */
export interface ProductionDocumentsProjection {
  bookId: string;
  /** The house type configuration in force: its schema, version and digest. */
  configuration: { schema: string; version: string; digest: string };
  /** Why no document can be made yet, or `null`. */
  unavailableReason: string | null;
  types: ReadonlyArray<ProductionDocumentTypeProjection>;
  sources: ReadonlyArray<ProductionDocumentSourceProjection>;
  sourcesTruncated: boolean;
}

/** 从来源材料创建: a document of one type, made from one source-only material of the route's Book. */
export interface CreateProductionDocumentInput {
  bookId: string;
  typeId: string;
  sourceVersionId: string;
}

/** `本书不做` or `恢复` for one type of the route's Book. */
export interface DecideProductionDocumentTypeInput {
  bookId: string;
  typeId: string;
  notForThisBook: boolean;
}

/**
 * The version `交付` hands over (DELIV-003): one the document saved, or its current text — saved as the next version
 * first when it moved past the latest — bound to the working digest the form read, so an edit made since is never
 * delivered unseen.
 */
export type ProductionDocumentDeliveryVersionInput =
  | { kind: 'saved'; revisionId: string }
  | { kind: 'current'; workingDigest: string };

/** `交付`: one exact version of a document of the route's Book, to one recipient, with an optional note (DELIV-003). */
export interface RecordProductionDocumentDeliveryInput {
  bookId: string;
  documentId: string;
  version: ProductionDocumentDeliveryVersionInput;
  recipient: { kind: ProductionDocumentRecipientKind; custom: string | null };
  note: string | null;
}

/** `保存为版本`: the document's working text becomes its next version. */
export interface SaveProductionDocumentVersionInput {
  bookId: string;
  documentId: string;
  branchId: string;
}

/** The read of 交付 · 生产文档: the route's Book, supplied by the main process. */
export interface InspectProductionDocumentsInput {
  bookId: string;
}

/** What a document operation came to: 交付 · 生产文档 as they stand after it, and the document it was about. */
export interface ProductionDocumentResultProjection {
  bookId: string;
  documents: ProductionDocumentsProjection;
  document: ProductionDocumentProjection | null;
  typeId: string;
  /** What 从来源材料创建 did not carry into the document, said where the document opens; `null` when it carried everything. */
  notice: string | null;
}

// ---- 图书交付包 (Issue #416, plan slice S67a; V2-UX-BUNDLE-001 to 005, DPKG-001 to 015) -------------------------------

/** 交付包用途, in characters (code points) once NFC-normalized and trimmed. */
export const MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS = 80;
/**
 * The most package versions, review reports and review limitation lines one answer lists, newest first; the rest stay
 * in the records and in the content a package freezes.
 */
export const MAX_BOOK_DELIVERY_PACKAGE_VERSIONS_LISTED = 20;
export const MAX_BOOK_DELIVERY_PACKAGE_REPORTS_LISTED = 20;

/**
 * One row of the condition table (BUNDLE-002): the Publication Version, one per house type, and the work records —
 * whether it holds, in words, and where to go when it does not. A notice is a change the editor may act on without
 * the condition failing: the manuscript changed after 发稿, or a document after its delivery.
 */
export interface BookDeliveryPackageConditionProjection {
  key: 'publication' | 'document' | 'work-records';
  /** The house type a `document` row is about; `null` for the other two. */
  typeId: string | null;
  label: string;
  met: boolean;
  stateLabel: string;
  notice: string | null;
  /** Where the row's route leads, when it is unmet or carries a notice; `null` when there is nothing to do. */
  route: 'publication' | 'document' | 'review' | null;
  routeLabel: string | null;
}

/** One line of the Manifest Preview (DPKG-004, DPKG-006): what it is, and a detail in words. */
export interface BookDeliveryPackageItemProjection {
  /** `evaluation-record` and `readers-report` (Issue #429, BUNDLE-001) are included when the Book has them, else excluded with the reason. */
  kind: 'publication' | 'document' | 'review-report' | 'evaluation-record' | 'readers-report' | 'not-for-this-book' | 'exclusion';
  label: string;
  detail: string | null;
}

/**
 * What a package prepared now would hold (the Manifest Preview), without its purpose. `digest` names exactly this
 * content: `准备图书交付包` freezes it or refuses, so the editor never prepares a package they did not see.
 */
export interface BookDeliveryPackageContentProjection {
  digest: string;
  included: ReadonlyArray<BookDeliveryPackageItemProjection>;
  /** More review reports are included than the answer lists. */
  includedTruncated: boolean;
  excluded: ReadonlyArray<BookDeliveryPackageItemProjection>;
  limitations: ReadonlyArray<string>;
  /** More review Runs carry a limitation than the answer lists. */
  limitationsTruncated: boolean;
}

/** One frozen version of the Book's package (DPKG-007, DPKG-011): immutable, and never itself an export or a delivery. */
export interface BookDeliveryPackageVersionProjection {
  packageVersionId: string;
  /** The package's stable identity, the same for every version of a Book's package. */
  packageId: string;
  version: number;
  /** `v1`, `v2` … */
  label: string;
  purpose: string;
  preparedAt: string;
  /** The newest version is the current one. */
  current: boolean;
  /** What the version holds, in one line. */
  summary: string;
  /** The derived Package Export History (DPKG-011): `暂无导出记录`, or how many exports wrote files and when the latest did. */
  exportHistoryLabel: string;
  /** The version's exports newest first (Issue #416, S67b), at most `MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED`, each in one line. */
  exports: ReadonlyArray<BookDeliveryPackageExportSummaryProjection>;
  exportsTruncated: boolean;
  /** 查看技术详情 only. */
  technical: { contentDigest: string; digest: string; priorVersionId: string | null };
}

/** 图书交付包 of one Book, read on its own beside 发稿 and 交付 · 生产文档. */
export interface BookDeliveryPackageProjection {
  bookId: string;
  /** BUNDLE-005's sentence: the package is neither 发稿 nor 交付, and preparing it changes no record. */
  statement: string;
  conditions: ReadonlyArray<BookDeliveryPackageConditionProjection>;
  ready: boolean;
  /** The unmet conditions' labels in the table's order, named beside `准备图书交付包` while it is unavailable. */
  unmet: ReadonlyArray<string>;
  content: BookDeliveryPackageContentProjection;
  versions: ReadonlyArray<BookDeliveryPackageVersionProjection>;
  versionsTruncated: boolean;
  /** The content differs from the newest version's, so preparing again makes the next version (BUNDLE-004). */
  changedSinceLatest: boolean;
}

/** The read of 图书交付包: the route's Book, supplied by the main process. */
export interface InspectBookDeliveryPackageInput {
  bookId: string;
}

/** `准备图书交付包`: the content the editor saw, by its digest, and the purpose they wrote. */
export interface PrepareBookDeliveryPackageInput {
  bookId: string;
  purpose: string;
  expectedContentDigest: string;
}

/** What `准备图书交付包` came to: a new version, or the newest one unchanged, and the package as it stands. */
export interface BookDeliveryPackageResultProjection {
  bookId: string;
  outcome: 'prepared' | 'unchanged';
  version: number;
  package: BookDeliveryPackageProjection;
}

// ---- 图书交付包's export (Issue #416, plan slice S67b; BUNDLE-004, DPKG-011, DPKG-013, DPKG-014, EXP-010 to EXP-022) --------

/** At most this many exports of one package version are listed, newest first; the count says how many there were. */
export const MAX_BOOK_DELIVERY_PACKAGE_EXPORTS_LISTED = 2;
/** A review page and one explicitly selected export batch contain at most this many files. */
export const MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED = 40;

/** One file a package export writes: what it holds, its file name and its format. */
export interface BookDeliveryPackageExportFileProjection {
  /** `publication`, `document:<typeId>`, `report:<reportId>` or `manifest`. */
  key: string;
  /** What the file holds, in the editor's words: `稿件 · 发稿版本「一审稿」 · r1`. */
  label: string;
  fileName: string;
  format: ManuscriptExportFormat;
}

/**
 * 含批注 and 含修改建议（作为修订） of the files a package export writes from the manuscript and the documents (EXP-023): both
 * on until the editor turns one off, and bound into the review. 备注 never go with a package.
 */
export type BookDeliveryPackageExportOptions = Pick<ManuscriptExportOptions, 'includeAnnotations' | 'includeSuggestions'>;

/**
 * One file as `导出…` reviews it (EXP-007 to EXP-009): how it is written, what its format keeps and each class's fidelity —
 * the Export Fidelity Review S64 shows for one file, so no loss in a package's file is silent.
 */
export interface BookDeliveryPackageExportReviewFileProjection extends BookDeliveryPackageExportFileProjection, ExportRetentionDisclosure {
  restoration: 'from-original' | 'regenerated';
  restorationLine: string;
  formatLine: string;
  fidelity: ReadonlyArray<ExportFidelityRowProjection>;
  /** Some class is `降级导出` or `无法导出`: `按上述方式导出` then accepts it for this export (EXP-008). */
  degraded: boolean;
}

/** `导出…` of one package version: the files it writes under the options chosen, and the review they bind (EXP-010). */
export interface BookDeliveryPackageExportReviewProjection {
  bookId: string;
  packageVersionId: string;
  /** `v2`. */
  versionLabel: string;
  options: BookDeliveryPackageExportOptions;
  /** At most `MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED`, in the order they are written. */
  files: ReadonlyArray<BookDeliveryPackageExportReviewFileProjection>;
  /** More candidate files can be reviewed on the next page; none are implicitly selected. */
  filesTruncated: boolean;
  offset: number;
  nextOffset: number | null;
  /** Some file on this page is degraded. */
  degraded: boolean;
  /** EXP-014 and EXP-015: the files go to a folder the editor chooses, and nothing is sent anywhere. */
  statement: string;
  /** Binds the folder's preparation to exactly this review, its options included. */
  reviewDigest: string;
}

/** What one file of a package export came to (EXP-013, EXP-021). */
export interface BookDeliveryPackageExportFileOutcomeProjection extends BookDeliveryPackageExportFileProjection {
  preparationId: string;
  /** `prepared` until `按上述方式导出`; then the receipt's own outcome, or `not-written` for a file after one that stopped. */
  outcome: 'prepared' | 'created' | 'failed' | 'ambiguous' | 'not-written';
  outcomeLabel: string;
  /** Whether 在文件夹中显示 can be offered: only for a verified file. */
  revealAvailable: boolean;
}

/** One export of one package version (DPKG-014): its folder, its files and what each came to. It never changes the package. */
export interface BookDeliveryPackageExportProjection {
  kind?: 'archive';
  archiveReceipt?: BookDeliveryPackageArchiveReceiptProjection;
  exportId: string;
  packageVersionId: string;
  versionLabel: string;
  /** The folder as the system dialog returned it. */
  folder: string;
  /** `prepared` before `按上述方式导出`; `exported` once every file was written; `incomplete` when a file stopped it. */
  state: 'prepared' | 'exported' | 'incomplete';
  /** `已导出到所选位置 · 4 个文件`, `已准备，尚未导出 · 4 个文件`, or how many files were written and how many were not. */
  summary: string;
  createdAt: string;
  files: ReadonlyArray<BookDeliveryPackageExportFileOutcomeProjection>;
  /** More files than the answer lists. */
  filesTruncated: boolean;
  /** In `按上述方式导出`'s own answer: the file that stopped the rest, and why; `null` otherwise. */
  stopped: { fileName: string; reason: string } | null;
}

/**
 * One export of a version as its history lists it (DPKG-011): what it came to, where and when, in one line. What each
 * file came to is the export's own answer; 交付物's one read of every version stays one frame. A folder chosen and never
 * approved is no export, and the history never lists one.
 */
export interface BookDeliveryPackageExportSummaryProjection {
  kind?: 'archive';
  exportId: string;
  folder: string;
  state: Exclude<BookDeliveryPackageExportProjection['state'], 'prepared'>;
  summary: string;
  /** When its last file's outcome was recorded. */
  exportedAt: string;
  fileCount: number;
  /** A file it wrote and verified, for 在文件夹中显示 to show the folder by; `null` when it wrote none. */
  revealPreparationId: string | null;
}

/** `导出…` of one version of the route's Book's package, under the options chosen. */
export interface ReviewBookDeliveryPackageExportInput {
  route?: 'archive';
  offset?: number;
  bookId: string;
  packageVersionId: string;
  options: BookDeliveryPackageExportOptions;
}

/** `选择位置…`: the folder the system dialog returned, bound to the review the editor read and its options. */
export interface PrepareBookDeliveryPackageExportInput {
  offset?: number;
  memberKeys: ReadonlyArray<string>;
  bookId: string;
  packageVersionId: string;
  options: BookDeliveryPackageExportOptions;
  reviewDigest: string;
  folder: string;
}

/** The archive binds every content member of the version (Issue #959), so it names no members. */
export type PrepareBookDeliveryPackageArchiveInput = Omit<PrepareBookDeliveryPackageExportInput, 'folder' | 'memberKeys'> & { destination: string };

export interface BookDeliveryPackageArchiveReceiptProjection {
  receiptId: string;
  finalPath: string;
  outcome: 'created' | 'replaced' | 'failed' | 'ambiguous';
  byteLength: number | null;
  sha256: string | null;
  memberCount: number;
  members: ReadonlyArray<{ path: string; sha256: string; receiptId: string | null }>;
  membersTruncated?: boolean;
  metadata: ReadonlyArray<{ path: string; byteLength: number; sha256: string }>;
  stopped: { fileName: string; reason: string } | null;
}

/** `按上述方式导出` of one prepared package export. */
export interface ApproveBookDeliveryPackageExportInput {
  bookId: string;
  exportId: string;
}

/** What the folder dialog came to: nothing is recorded when it was cancelled (EXP-020), else the prepared export. */
export type ChooseBookDeliveryPackageExportFolderResult =
  | { outcome: 'cancelled' }
  | { outcome: 'prepared'; export: BookDeliveryPackageExportProjection };

/** What `按上述方式导出` came to, and the package as it stands, its export history included. */
export interface BookDeliveryPackageExportResultProjection {
  bookId: string;
  export: BookDeliveryPackageExportProjection;
  package: BookDeliveryPackageProjection;
}

/**
 * The inputs of the 交付物 operations. The Book is always the route's, never the renderer's: every
 * renderer member takes the input without `bookId`, and the main process supplies the Book its window
 * is showing.
 */
export interface InspectDeliverablesInput {
  bookId: string;
}

/** 设为发稿版本: one exact milestone of the Book's primary Manuscript, a 发稿范围 and a 依据 (PUB-002, PUB-004). */
export interface DesignatePublicationVersionInput {
  bookId: string;
  milestoneId: string;
  scope: string;
  basis: string;
}

/** What 设为发稿版本 came to: a separate append, or — for an identical repeat of the current one — no change. */
export interface PublicationDesignationProjection {
  bookId: string;
  outcome: 'designated' | 'unchanged';
  completionLabel: string;
  /** The designation the answer is about: the one appended, or the current one an identical repeat named. */
  publicationVersionId: string;
  deliverables: DeliverablesProjection;
}
