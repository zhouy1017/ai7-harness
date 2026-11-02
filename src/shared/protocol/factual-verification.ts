import {
  FACTUAL_REVIEW_CONTRACT_VERSION,
  FACTUAL_REVIEW_EXPECTED_OUTCOME,
  FACTUAL_REVIEW_KIND,
  type FactualReviewGoal,
  type FactualReviewTaskMode,
} from './task-kinds.js';
import type { ExecutionRouteId, ResultSetPolicyPin } from '../protocol.js';
import type {
  AnalysisUnitLineage,
  BaselineAnalysisHistoryEntryProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisRevisionUpdateProjection,
} from './analysis-plan.js';
import type {
  AnalysisAssuranceAxis,
  AnalysisAssuranceSampleProjection,
  AnalysisCoverageAxis,
  AnalysisFreshnessAxis,
  AnalysisGapProjection,
  AnalysisReducerClosureAxis,
} from './analysis.js';

/**
 * The assertion classes of kick-in 17's two-axis evidence model. Only `real-world-fact` and
 * `quotation` become findings; the other three are listed and counted so that an editor can see what
 * the model declined to treat as a checkable fact rather than having it silently dropped.
 */
export type FactualAssertionClass = 'real-world-fact' | 'quotation' | 'report-about-manuscript' | 'fictional-canon' | 'judgment';

export const FACTUAL_ASSERTION_CLASSES: readonly FactualAssertionClass[] =
  ['real-world-fact', 'quotation', 'report-about-manuscript', 'fictional-canon', 'judgment'];

/** The classes an assertion must carry to become a finding; the rest are counted only. */
export const FACTUAL_FINDING_CLASSES: readonly FactualAssertionClass[] = ['real-world-fact', 'quotation'];

/** The closed category set of the Factual Review Contract v1. */
export type FactualAssertionCategory = '时间' | '地点' | '人物' | '机构' | '器物' | '数字' | '引文' | '史实' | '技术' | '其他';

export const FACTUAL_ASSERTION_CATEGORIES: readonly FactualAssertionCategory[] =
  ['时间', '地点', '人物', '机构', '器物', '数字', '引文', '史实', '技术', '其他'];

/** ADR 0066's severity tiers: `A` confirmed, `B` probable, `C` advisory. */
export type FactualSeverityTier = 'A' | 'B' | 'C';

export const FACTUAL_SEVERITY_TIERS: readonly FactualSeverityTier[] = ['A', 'B', 'C'];

/**
 * ADR 0066's six verdicts. Until a research egress is accepted and its slice integrates (ADR 0074,
 * proposed), every model-judged finding is `未外部复核`: the model raised a question that no
 * admissible evidence has answered.
 */
export type FactualVerdict = '确证' | '部分成立' | '存疑' | '无法核实' | '未外部复核' | '误报';

export const FACTUAL_VERDICTS: readonly FactualVerdict[] = ['确证', '部分成立', '存疑', '无法核实', '未外部复核', '误报'];

export const FACTUAL_UNREVIEWED_VERDICT = '未外部复核' as const;

/**
 * The three checks of kick-in 17 rule 5, reported independently and never collapsed into one badge.
 * Reference Integrity is deterministic; Claim Support and Factual Verification are model-judged over
 * captured evidence, and with no evidence fetched they read `未核查`.
 */
export type FactualReferenceIntegrityState = 'verified' | 'failed';

export type FactualEvidenceState = '未核查' | '成立' | '不成立' | '冲突' | '不适用';

export const FACTUAL_UNCHECKED_STATE = '未核查' as const;

/** The research capability's disclosed state; `外部研究未获准` is the only one this slice can produce. */
export type FactualResearchState = '外部研究未获准' | '研究预算已用尽' | '已检索';

export const FACTUAL_RESEARCH_NOT_AUTHORIZED = '外部研究未获准' as const;

/**
 * The exact grapheme range Reference Integrity located. Unlike a model-supplied source range it is
 * never open-ended: a finding exists only because the service found its quotation at these offsets.
 */
export interface FactualSourceRangeProjection {
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
}

/** The identity of one listed assertion inside its unit: the block it named and its position in the list. */
export interface FactualAssertionIdentityProjection {
  unitOrdinal: number;
  blockOrdinal: number;
  assertionOrdinal: number;
}

/**
 * One factual finding in ADR 0066's record shape. `sourceRange` is the exact grapheme range the
 * service located in the committed block, never an offset the model supplied; a finding exists only
 * because Reference Integrity verified its quotation there.
 */
export interface FactualReviewFindingProjection {
  findingId: string;
  unitOrdinal: number;
  blockId: string;
  sourceRange: FactualSourceRangeProjection;
  quote: string;
  assertionClass: FactualAssertionClass;
  category: FactualAssertionCategory;
  severity: FactualSeverityTier;
  question: string;
  basis: string;
  verdict: FactualVerdict;
  states: {
    referenceIntegrity: FactualReferenceIntegrityState;
    claimSupport: FactualEvidenceState;
    factualVerification: FactualEvidenceState;
  };
  /** Captured evidence records; empty under every scope until ADR 0074's slice admits a lookup. */
  evidence: readonly [];
  research: { state: FactualResearchState; budget: null };
  /** The identities of the duplicate assertions merged into this record; empty when none were. */
  mergedFrom: ReadonlyArray<FactualAssertionIdentityProjection>;
}

/** Why an assertion never became a finding: its quotation could not be anchored in the block it named. */
export type FactualExclusionReason = 'quote-not-found' | 'quote-ambiguous' | 'not-exact-fetched';

/**
 * The excluded appendix (ADR 0066): an assertion the model listed whose quotation Reference Integrity
 * could not verify. It keeps its identity and its reason and never carries a source range — the
 * service does not rewrite a quotation to make it match.
 */
export interface FactualReviewExcludedProjection {
  findingId: string;
  unitOrdinal: number;
  /** The block the model named, when its ordinal resolved to one of the unit's blocks. */
  blockId: string;
  blockOrdinal: number;
  quote: string;
  assertionClass: FactualAssertionClass;
  category: FactualAssertionCategory;
  severity: FactualSeverityTier;
  question: string;
  basis: string;
  states: {
    referenceIntegrity: 'failed';
    claimSupport: FactualEvidenceState;
    factualVerification: FactualEvidenceState;
  };
  reason: FactualExclusionReason;
  reasonLabel: string;
}

/**
 * What the model listed, by class, category, and tier, before any of it became a finding.
 *
 * Each breakdown is an ordered list rather than a keyed map, in its closed set's own order. A durable
 * record is canonicalized by more than one owner, and two canonicalizers need not agree on how to
 * order non-ASCII object keys; a list depends on no collation at all.
 */
export interface FactualReviewAssertionCountsProjection {
  listed: number;
  byClass: ReadonlyArray<{ assertionClass: FactualAssertionClass; count: number }>;
  byCategory: ReadonlyArray<{ category: FactualAssertionCategory; count: number }>;
  bySeverity: ReadonlyArray<{ severity: FactualSeverityTier; count: number }>;
  /** Assertions of a finding class whose quotation verified, before duplicates merged. */
  verified: number;
  excluded: number;
  merged: number;
}

/** The research capability's disclosed outcome for the whole Run: what it was allowed to do, and what it did. */
export interface FactualReviewResearchProjection {
  state: FactualResearchState;
  fetched: 0;
  statement: string;
}

// ---- Evidence Assurance, verification review and Correction Proposals (Issue #901; FACT/EVID/EASSURE/FREV/CORR) ------------

/**
 * The three Evidence Assurance Levels of a factual-review Task (ui-ux-v2 ADR 0004; V2-UX-EASSURE-001 to 013). A level is a
 * term of the Task's Plan Envelope, not a model role, a provider choice or an authority: it decides how much assurance work the
 * Run does and the formal outcome it may record. `standard` is the default and is never named in a plan edit.
 */
export type EvidenceAssuranceLevel = 'quick' | 'standard' | 'strict';

export const EVIDENCE_ASSURANCE_LEVELS: readonly EvidenceAssuranceLevel[] = ['quick', 'standard', 'strict'];

export const EVIDENCE_ASSURANCE_DEFAULT_LEVEL = 'standard' as const;

export const EVIDENCE_ASSURANCE_LEVEL_LABELS: Readonly<Record<EvidenceAssuranceLevel, string>> = {
  quick: '快速整理',
  standard: '标准核查',
  strict: '严格核查',
};

/** The one-line consequence each level states beside the selector (EASSURE-001); never `更正确` or a quality ladder. */
export const EVIDENCE_ASSURANCE_LEVEL_CONSEQUENCES: Readonly<Record<EvidenceAssuranceLevel, string>> = {
  quick: '只列出断言与候选方向，不联网、不检索；结果一律为待核查，不能记录支持或反驳的正式结论。',
  standard: '联网检索并在书内精确取文；只有精确取文的来源计入，结论按证据关系确定。',
  strict: '在标准核查之上，支持或反驳须有两个以上相互独立的已核对来源，否则为证据不足；复用已留存的有效证据。',
};

/** The disclosure a Run carries when an offline verdict at its start lowered its effective level (EASSURE-002; D9). */
export const EVIDENCE_ASSURANCE_OFFLINE_DEGRADE = '已自动降为快速整理：未联网' as const;

/** The user-facing Factual Verification sub-states (V2-UX-FACT-006), mapped from evidence relations, never from a score. */
export type FactualVerificationOutcome = '待核查' | '证据支持' | '疑似错误' | '证据不足' | '证据冲突' | '无法核实';

export const FACTUAL_VERIFICATION_OUTCOMES: readonly FactualVerificationOutcome[] = ['待核查', '证据支持', '疑似错误', '证据不足', '证据冲突', '无法核实'];

/** Each sub-state's policy outcome (Factual Verification Policy §Outcomes and conflicts). */
export const FACTUAL_VERIFICATION_POLICY_OUTCOMES: Readonly<Record<FactualVerificationOutcome, 'supported' | 'contradicted' | 'conflicting' | 'unresolved'>> = {
  待核查: 'unresolved',
  证据支持: 'supported',
  疑似错误: 'contradicted',
  证据不足: 'unresolved',
  证据冲突: 'conflicting',
  无法核实: 'unresolved',
};

/** How one source relates to one assertion (V2-UX-EVID-007); relations are never counted into a verdict. */
export type EvidenceRelation = '支持' | '部分支持' | '反驳' | '仅提供背景' | '关系待判断';

export const EVIDENCE_RELATIONS: readonly EvidenceRelation[] = ['支持', '部分支持', '反驳', '仅提供背景', '关系待判断'];

/** Evidence Source Lineage (V2-UX-EVID-008): only `original` material can count as independent corroboration. */
export type EvidenceLineageClass = 'original' | 'quoted' | 'syndicated' | 'translated' | 'summarized';

export const EVIDENCE_LINEAGE_CLASSES: readonly EvidenceLineageClass[] = ['original', 'quoted', 'syndicated', 'translated', 'summarized'];

export const EVIDENCE_LINEAGE_LABELS: Readonly<Record<EvidenceLineageClass, string>> = {
  original: '原始来源', quoted: '转引', syndicated: '转载', translated: '译介', summarized: '摘述',
};

/** Whether a source's exact excerpt was obtained (EVID-004, EVID-005). */
export type EvidenceCheckState = 'candidate' | 'exact';

export const EVIDENCE_CHECK_LABELS: Readonly<Record<EvidenceCheckState, string>> = {
  candidate: '候选来源 · 尚未核对',
  exact: '已精确取文',
};

/** What the Fact-check Lens filters a result by besides chapter, status and risk (V2-UX-FACT-005). */
export type FactualSourceCondition = 'no-source' | 'candidates-only' | 'checked' | 'conflicting';

export const FACTUAL_SOURCE_CONDITION_LABELS: Readonly<Record<FactualSourceCondition, string>> = {
  'no-source': '没有来源',
  'candidates-only': '只有候选来源',
  checked: '有已核对来源',
  conflicting: '来源相互冲突',
};

export type FactualActionNeed = 'review' | 'correction' | 'none';

export const FACTUAL_ACTION_NEED_LABELS: Readonly<Record<FactualActionNeed, string>> = {
  review: '待你审阅',
  correction: '可准备更正',
  none: '无需处理',
};

/** The Verification Review Dispositions of the Factual Review Decision Card (V2-UX-FREV-005), never preselected. */
export type VerificationReviewDisposition = 'accept' | 'request-evidence' | 'keep-pending' | 'decline' | 'own-words';

export const VERIFICATION_REVIEW_DISPOSITIONS: readonly VerificationReviewDisposition[] = ['accept', 'request-evidence', 'keep-pending', 'decline', 'own-words'];

export const VERIFICATION_REVIEW_DISPOSITION_LABELS: Readonly<Record<VerificationReviewDisposition, string>> = {
  accept: '接受当前核查结论',
  'request-evidence': '要求补充证据',
  'keep-pending': '维持未决',
  decline: '不采纳该核查判断',
  'own-words': '自行输入',
};

/** How the editor treated an optional reason suggestion (FREV-009): picked it as is, corrected it, or wrote their own. */
export type VerificationReasonState = 'selected' | 'corrected' | 'replaced';

export const MAX_VERIFICATION_REASON_CHARACTERS = 500;

export const MAX_VERIFICATION_OWN_WORDS_CHARACTERS = 500;

export const MAX_CORRECTION_TEXT_GRAPHEMES = 200;

export const MAX_CORRECTION_RATIONALE_GRAPHEMES = 120;

/** One Fact-check Lens page and one source page of the workspace, bounded so a read always fits a frame. */
export const MAX_FACTUAL_VERIFICATION_PAGE = 50;

export const MAX_EVIDENCE_SOURCE_PAGE = 12;

/** The Evidence Comparison Matrix holds two to four pinned cards (V2-UX-EVID-006). */
export const EVIDENCE_MATRIX_MIN_PINNED = 2;

export const EVIDENCE_MATRIX_MAX_PINNED = 4;

/** The exact Factual Verification Policy Document version a result binds (V2-UX-FACT-002): its path and the digest of its bytes. */
export interface FactualVerificationPolicyPinProjection {
  document: string;
  sha256: string;
  /** The minimum Evidence Assurance Level the document requires; `null` while it names none (EASSURE-008). */
  minimumLevel: EvidenceAssuranceLevel | null;
}

/** The level a Run executed under, decided once at its start (EASSURE-002). */
export interface FactualRunAssuranceProjection {
  runRecordId: string;
  plannedLevel: EvidenceAssuranceLevel;
  effectiveLevel: EvidenceAssuranceLevel;
  /** `EVIDENCE_ASSURANCE_OFFLINE_DEGRADE` when an offline verdict at Run start lowered it; `null` otherwise. */
  disclosure: string | null;
  recordedAt: string;
}

/** One Evidence Source Card (V2-UX-EVID-003): every check a discrete state, a candidate never quoted (EVID-004). */
export interface EvidenceSourceCardProjection {
  excluded?: boolean;
  /** The relation's own identity within the result: stable across pages and pinning. */
  cardId: string;
  sourceRef: string;
  sourceKind: 'web' | 'in-book';
  title: string | null;
  checkState: EvidenceCheckState;
  checkLabel: string;
  relation: EvidenceRelation;
  /** The exact excerpt, only when `exact`; a candidate is never quoted or summarized as checked evidence. */
  excerpt: string | null;
  /** The retained Source Version: the content digest of what AI7 captured; `null` when nothing was captured. */
  sourceVersion: string | null;
  publisher: string | null;
  registrableDomain: string | null;
  capturedAt: string | null;
  freshness: 'current' | 'possibly-stale' | 'unknown';
  freshnessLabel: string;
  /** 引文完整性: whether the excerpt stands verbatim in the captured text. */
  integrity: 'located' | 'not-located' | 'not-captured';
  integrityLabel: string;
  lineage: EvidenceLineageClass | null;
  lineageLabel: string;
  /** The independence group the source counts in under strict assurance; dependent material shares no group. */
  independenceGroup: string | null;
  /** The retained evidence row the 来源与证据 view opens on; `null` for an in-Book or uncaptured source. */
  evidenceId: string | null;
  /** Reused from an earlier Run's retained evidence rather than captured by this Run (EASSURE-009). */
  reused: boolean;
}

/** The AI7 Evidence Comparison Summary (V2-UX-EVID-010): non-evidentiary, every statement linked to cards. */
export interface EvidenceComparisonSummaryProjection {
  label: '非证据';
  statements: ReadonlyArray<{ text: string; cardIds: ReadonlyArray<string> }>;
}

/** One Factual Review Decision (V2-UX-FREV-006): immutable, bound to one result version. */
export interface FactualReviewDecisionProjection {
  decisionId: string;
  resultId: string;
  boundVersion: number;
  disposition: VerificationReviewDisposition;
  dispositionLabel: string;
  ownWords: string | null;
  reason: null | { state: VerificationReasonState; text: string; suggestion: string | null };
  /** A later result version exists, so this decision binds an older version (FREV-007). */
  superseded: boolean;
  /** The level 要求补充证据 asked the supplementary range Task to run at: the same or higher than this result's (FREV-008). */
  requestedLevel: EvidenceAssuranceLevel | null;
  recordedAt: string;
}

/** One Versioned Verification Result (V2-UX-FREV-001) as the Fact-check Lens and the workspace read it. */
export interface FactualVerificationResultProjection {
  resultId: string;
  version: number;
  assertionKey: string;
  reviewRunId: string;
  reviewFindingId: string;
  findingId: string;
  runRecordId: string;
  taskIntentId: string;
  markId: string | null;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  /** The exact manuscript wording, the Textual Source of Record (EVID-002). */
  quote: string;
  /** AI7's normalized statement of what is checked, kept apart from the wording. */
  normalizedStatement: string;
  heading: string | null;
  category: FactualAssertionCategory;
  severity: FactualSeverityTier;
  plannedLevel: EvidenceAssuranceLevel;
  level: EvidenceAssuranceLevel;
  levelLabel: string;
  disclosure: string | null;
  states: {
    referenceIntegrity: FactualReferenceIntegrityState;
    claimSupport: FactualEvidenceState;
    factualVerification: FactualVerificationOutcome;
  };
  sourceCondition: FactualSourceCondition;
  actionNeed: FactualActionNeed;
  sourceCounts: { checked: number; candidates: number; independent: number; reused: number };
  limitations: ReadonlyArray<string>;
  policyPin: FactualVerificationPolicyPinProjection;
  producer: string;
  recordedAt: string;
  /** 锚点已失效 when the manuscript changed inside the range since (FACT-010); the result stays historical. */
  anchor: { state: 'current' | 'stale'; label: string | null };
  decision: FactualReviewDecisionProjection | null;
  /** No decision binds this version yet. */
  pendingReview: boolean;
  /** `准备更正提案` is offered (FREV-008, EASSURE-004). */
  correctionAvailable: boolean;
}

export interface FactualChapterOptionProjection {
  blockId: string;
  heading: string;
}

/** The Fact-check Lens (V2-UX-FACT-004/005/007): one bounded page of the latest results with the three states apart. */
export interface FactualVerificationLensProjection {
  bookId: string;
  reviewRunId: string | null;
  results: ReadonlyArray<FactualVerificationResultProjection>;
  /** The cursor of the next page; `null` at the end. */
  nextCursor: number | null;
  total: number;
  counts: ReadonlyArray<{ outcome: FactualVerificationOutcome; count: number }>;
  chapters: ReadonlyArray<FactualChapterOptionProjection>;
  run: FactualRunAssuranceProjection | null;
  policyPin: FactualVerificationPolicyPinProjection;
  statement: string;
}

export interface FactualVerificationLensFilters {
  chapterBlockId: string | null;
  outcome: FactualVerificationOutcome | null;
  severity: FactualSeverityTier | null;
  sourceCondition: FactualSourceCondition | null;
  actionNeed: FactualActionNeed | null;
}

/** The decision card's offer (FREV-004/005/011): five unselected choices, or why recording is refused now. */
export interface FactualDecisionCardProjection {
  choices: ReadonlyArray<{ disposition: VerificationReviewDisposition; label: string }>;
  /** AI7 may recommend one with a rationale, never preselect it. */
  recommendation: null | { disposition: VerificationReviewDisposition; rationale: string };
  reasonSuggestions: ReadonlyArray<string>;
  /** Why 记录核查审阅决定 cannot record now: the exact changed dependency (FREV-011); `null` when it can. */
  drift: string | null;
}

/** The Assertion-centered Evidence Workspace (V2-UX-EVID-001 to 013): a read, it mutates nothing (EVID-012). */
export interface EvidenceWorkspaceProjection {
  claimRecheckAvailable?: boolean;
  bookId: string;
  result: FactualVerificationResultProjection;
  sources: ReadonlyArray<EvidenceSourceCardProjection>;
  /** The cursor of the next source page; `null` at the end. */
  nextSourceCursor: number | null;
  totalSources: number;
  conflicts: ReadonlyArray<{ supportingCardId: string; refutingCardId: string; point: string }>;
  summary: EvidenceComparisonSummaryProjection;
  history: ReadonlyArray<{ resultId: string; version: number; outcome: FactualVerificationOutcome; level: EvidenceAssuranceLevel; recordedAt: string }>;
  decisions: ReadonlyArray<FactualReviewDecisionProjection>;
  decisionCard: FactualDecisionCardProjection;
  matrix: { minPinned: number; maxPinned: number };
}

/** One occurrence in a Linked Correction Range Set (V2-UX-CORR-007): exact-equal text only, each include/exclude visible. */
export interface CorrectionRangeProjection {
  rangeId: string;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  text: string;
  heading: string | null;
  /** The finding's own range: included by default. */
  primary: boolean;
  /** The current manuscript still holds these words here, so a mark can stand on them. */
  current: boolean;
}

/** One Correction Variant (V2-UX-CORR-002/003): resulting text, rationale, evidence links, unresolved evidence, limitations. */
export interface CorrectionVariantProjection {
  variantId: string;
  text: string;
  rationale: string;
  evidenceCardIds: ReadonlyArray<string>;
  unresolved: ReadonlyArray<string>;
  limitations: ReadonlyArray<string>;
}

/** 准备更正提案 (V2-UX-CORR-001): the Correction Proposal Draft offer; a read, nothing is written. */
export interface CorrectionProposalDraftProjection {
  bookId: string;
  result: FactualVerificationResultProjection;
  decisionId: string | null;
  variants: ReadonlyArray<CorrectionVariantProjection>;
  ownEditAllowed: true;
  scope: 'minimal';
  scopeStatement: string;
  ranges: ReadonlyArray<CorrectionRangeProjection>;
  assuranceIncomplete: boolean;
  missingChecks: ReadonlyArray<string>;
  label: string | null;
}

/** 保存为更正提案 (V2-UX-CORR-011): what one save created. */
export interface CorrectionProposalSavedProjection {
  proposalId: string;
  markIds: ReadonlyArray<string>;
  assuranceIncomplete: boolean;
  label: string | null;
  completionLabel: string;
}

/** The lineage the 依据与核查 region of a Correction Proposal's 修改建议 card shows (V2-UX-CORR-012, EASSURE-012). */
export interface FactualCorrectionLineageProjection {
  proposalId: string;
  resultId: string;
  resultVersion: number;
  decisionId: string | null;
  level: EvidenceAssuranceLevel;
  levelLabel: string;
  states: FactualVerificationResultProjection['states'];
  checkedSources: number;
  candidateSources: number;
  policyPin: FactualVerificationPolicyPinProjection;
  /** `证据核查未完成` while the level was quick or the gate was not met; kept through review, Apply and reversal. */
  assuranceLabel: string | null;
  missingChecks: ReadonlyArray<string>;
}

/** The inputs of the five factual-verification operations (Issue #901). The Book is the route's, as for 来源与证据. */
export interface InspectFactualVerificationInput extends FactualVerificationLensFilters {
  bookId: string;
  /** The Review Run whose results to read; `null` reads the Book's latest result of every assertion. */
  reviewRunId: string | null;
  after: number | null;
}

export interface InspectEvidenceWorkspaceInput {
  bookId: string;
  resultId: string;
  sourcesAfter: number | null;
}

export interface RecordVerificationReviewDecisionInput {
  excludedSourceRefs?: readonly string[];
  bookId: string;
  resultId: string;
  /** The result version the editor read; a later version refuses the decision (FREV-011). */
  resultVersion: number;
  disposition: VerificationReviewDisposition;
  ownWords: string | null;
  reason: null | { state: VerificationReasonState; text: string; suggestion: string | null };
}

/**
 * What 记录核查审阅决定 answers: the workspace as it now reads, and — for 要求补充证据 — the supplementary check it recorded: the
 * result's own block and the level, the same or higher, it must run at (FREV-008). A Book holds one 事实核查 Run until the
 * factual update modes land (#905), so no Task is prepared now and the statement says so.
 */
export interface VerificationReviewDecisionRecordedProjection {
  workspace: EvidenceWorkspaceProjection;
  supplementary: null | { blockId: string; level: EvidenceAssuranceLevel; statement: string; decisionId?: string };
}

/** Why 要求补充证据 prepares no Task yet (Issue #901 rev 4; follow-up #905). */
export const SUPPLEMENTARY_CHECK_DEFERRED = '已记录补充核查的要求（同一段文字、同级或更高级别）。这本书的事实核查目前只能运行一次；补充核查任务将在事实核查的更新方式接入后开放（#905）。' as const;

export interface PrepareCorrectionProposalInput {
  bookId: string;
  resultId: string;
}

export interface SaveCorrectionProposalInput {
  bookId: string;
  resultId: string;
  resultVersion: number;
  /** The Run's variant chosen, or `null` for 自行编辑. */
  variantId: string | null;
  text: string;
  rationale: string;
  rangeIds: ReadonlyArray<string>;
}

export const CORRECTION_ASSURANCE_INCOMPLETE_LABEL = '证据核查未完成' as const;

export const STALE_VERIFICATION_ANCHOR_LABEL = '锚点已失效' as const;

// ---- External Evidence Retention (Issue #425, plan slice S70; V2-UX-SRC-013, EGR-003, KB-008/009, FACT-009) -------------

/** How a retained source was captured: AI7's own fetch of the page, the excerpt the search returned, or nothing (EGR-003). */
export type ResearchEvidenceCaptureState = 'full-text' | 'snippet-only' | 'failed';

export const RESEARCH_EVIDENCE_CAPTURE_STATES: readonly ResearchEvidenceCaptureState[] = ['full-text', 'snippet-only', 'failed'];

export const RESEARCH_EVIDENCE_CAPTURE_LABELS: Readonly<Record<ResearchEvidenceCaptureState, string>> = {
  'full-text': '来源全文',
  'snippet-only': '来源仅片段',
  failed: '未能取回',
};

/** Whether the words a citation names are in the captured text: all of them, some of them, or none (sentence alignment). */
export type ResearchEvidenceAlignment = 'aligned' | 'partial' | 'unaligned';

export const RESEARCH_EVIDENCE_ALIGNMENTS: readonly ResearchEvidenceAlignment[] = ['aligned', 'partial', 'unaligned'];

export const RESEARCH_EVIDENCE_ALIGNMENT_LABELS: Readonly<Record<ResearchEvidenceAlignment, string>> = {
  aligned: '对应',
  partial: '部分对应',
  unaligned: '未能对应',
};

/** The age after which a retained source reads 可能已过期 unless the caller names another. */
export const RESEARCH_EVIDENCE_STALE_AFTER_DAYS = 90;

export const RESEARCH_EVIDENCE_STALE_LABEL = '可能已过期';

/** The label every model-produced translation of a retained passage carries; it never replaces the original. */
export const SOURCE_TRANSLATION_LABEL = '来源译文';

/** Query class: the assertion category of the finding a source was retained for, or `uncited` for a page no finding named. */
export type ResearchEvidenceQueryClass = FactualAssertionCategory | 'uncited';

/** How a unit's search ended (ADR 0080 §7.4): its one search answered, cut short (联网核查未完成), or never made. */
export type ResearchEvidenceUnitState = 'completed' | 'incomplete' | 'not-searched';

export const RESEARCH_EVIDENCE_UNIT_LABELS: Readonly<Record<ResearchEvidenceUnitState, string>> = {
  completed: '联网核查已完成',
  incomplete: '联网核查未完成',
  'not-searched': '本单元未联网检索',
};

/** A finding's research outcome: a retained source names it, its unit's search ended without one, or the search was cut short. */
export type ResearchEvidenceFindingState = 'sourced' | 'unsupported' | 'incomplete';

export const RESEARCH_EVIDENCE_FINDING_LABELS: Readonly<Record<ResearchEvidenceFindingState, string>> = {
  sourced: '已留存外部来源',
  unsupported: '没有找到可留存的外部来源',
  incomplete: '联网核查未完成',
};

export const MAX_RESEARCH_EVIDENCE_PAGE = 32;

/** One range of the captured text the citation's words occupy (UTF-16 offsets), and the 1-based sentence it starts in. */
export interface ResearchEvidenceAnchor {
  from: number;
  to: number;
  sentence: number;
}

/** 来源译文: produced only under a rule that admits it, labelled as machine translation and attributed to the original. */
export type ResearchEvidenceTranslation =
  | {
    state: 'translated';
    label: typeof SOURCE_TRANSLATION_LABEL;
    machine: true;
    targetLanguage: 'zh-Hans';
    text: string;
    route: string;
    model: string;
    attribution: { url: string; contentSha256: string; from: number; to: number };
  }
  | { state: 'refused'; reason: string };

export interface ResearchEvidenceProjection {
  evidenceId: string;
  bookId: string;
  runRecordId: string;
  unitOrdinal: number;
  /** The finding the source was retained for; `null` for a page the model fetched that no finding named. */
  findingId: string | null;
  backendId: string | null;
  queryClass: ResearchEvidenceQueryClass;
  url: string;
  sourceTitle: string | null;
  capturedAt: string;
  captureState: ResearchEvidenceCaptureState;
  captureLabel: string;
  contentSha256: string | null;
  pageSha256: string | null;
  /** The Research Snapshot the capture was read from: the fetched page's, or the search answer's for an excerpt. */
  snapshotDigest: string | null;
  /** The words the alignment looked for: the model's quotation in its basis, else the finding's own quotation. */
  claim: { text: string; origin: 'basis-quotation' | 'finding-quote' } | null;
  alignment: ResearchEvidenceAlignment;
  alignmentLabel: string;
  anchors: ReadonlyArray<ResearchEvidenceAnchor>;
  /** Bounded captured passage; when unaligned, the source's beginning. A translation shows its exact attributed original. */
  passage: string | null;
  translation: ResearchEvidenceTranslation | null;
  staleness: { state: 'current' | 'possibly-stale'; reasons: ReadonlyArray<'age' | 'hash-changed'>; label: string | null };
  savedMaterialId: string | null;
  /** Why 保存为来源材料 is not offered; `null` when it is. */
  saveRefusal: string | null;
}

export interface ResearchEvidenceUnitProjection {
  retentionFailure?: 'capture-processing' | 'storage';
  runRecordId: string;
  unitOrdinal: number;
  backendId: string | null;
  state: ResearchEvidenceUnitState;
  label: string;
  searchCalls: number;
  retentionFetches: number;
  failedRetrievals: number;
  unsupportedFindings: number;
}

export interface ResearchEvidenceFindingProjection {
  findingId: string;
  runRecordId: string;
  unitOrdinal: number;
  blockId: string;
  quote: string;
  state: ResearchEvidenceFindingState;
  label: string;
  sources: number;
}

/** 来源与证据 (②): a Book's retained external sources, newest first, a page at a time, with each research unit's outcome. */
export interface ResearchEvidenceBookProjection {
  bookId: string;
  staleAfterDays: number;
  records: ReadonlyArray<ResearchEvidenceProjection>;
  /** The rowid cursor of the next page, or `null` when this page is the last. */
  next: number | null;
  units: ReadonlyArray<ResearchEvidenceUnitProjection>;
  findings: ReadonlyArray<ResearchEvidenceFindingProjection>;
  statement: string;
}

/**
 * The factual kind's Result Set Revision: the findings, the excluded appendix, the assertion counts,
 * and the research disclosure in place of the baseline kind's entities, events, relationships, and
 * settings. Every shared component — coverage, gaps, usage, lineage, freshness, assurance — is the
 * same reading the baseline kind carries, computed by the same reducers.
 */
export interface FactualReviewResultSetRevisionProjection {
  resultSetId: string;
  revisionId: string;
  ordinal: number;
  createdAt: string;
  digest: string;
  contractVersion: typeof FACTUAL_REVIEW_CONTRACT_VERSION;
  manuscriptPin: { bookId: string; manuscriptId: string; revisionId: string; revisionLabel: string; revisionDigest: string };
  coverageManifestDigest: string;
  schemaDigest: string;
  reducerDigest: string;
  adapterPin: { route: ExecutionRouteId; model: string; fixtureIdentity: string | null; fixtureSha256: string | null };
  bindingPin: { attemptId: string; bindingDigest: string; harnessSessionId: string; behaviorCompositionDigest: string; promptContractDigest: string };
  policyPin: ResultSetPolicyPin;
  provenance: { taskIntentId: string; runRecordId: string; attemptId: string; planVersion?: number; adaptations?: { count: number; unitOrdinals: ReadonlyArray<number> } };
  usage: { inputTokens: number; outputTokens: number; requests: number };
  /** Which mode produced this revision and with what unit counts; the same fact every kind records. */
  update: BaselineAnalysisRevisionUpdateProjection;
  lineage: ReadonlyArray<{ unitOrdinal: number } & AnalysisUnitLineage>;
  coverage: AnalysisCoverageAxis;
  reducerClosure: AnalysisReducerClosureAxis;
  freshness: AnalysisFreshnessAxis;
  assurance: AnalysisAssuranceAxis;
  gaps: ReadonlyArray<AnalysisGapProjection>;
  findings: ReadonlyArray<FactualReviewFindingProjection>;
  excluded: ReadonlyArray<FactualReviewExcludedProjection>;
  assertionCounts: FactualReviewAssertionCountsProjection;
  research: FactualReviewResearchProjection;
  /** The adversarial sample drawn over `findings` after the reduction; it edits none of them. */
  assuranceSample: AnalysisAssuranceSampleProjection;
  units: ReadonlyArray<FactualReviewUnitProjection>;
}

export type FactualReviewUnitProjection =
  | {
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: AnalysisUnitLineage;
      assertions: ReadonlyArray<{
        blockOrdinal: number;
        quote: string;
        assertionClass: FactualAssertionClass;
        category: FactualAssertionCategory;
        severity: FactualSeverityTier;
        question: string;
        basis: string;
      }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: AnalysisUnitLineage; gap: AnalysisGapProjection };

export interface FactualReviewHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion'> {
  mode: FactualReviewTaskMode;
  contractVersion: typeof FACTUAL_REVIEW_CONTRACT_VERSION;
}

export interface FactualReviewHistoryProjection {
  resultSetId: string;
  kind: typeof FACTUAL_REVIEW_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<FactualReviewHistoryEntryProjection>;
}

/**
 * The factual kind's Task projection. Every member the two kinds share is the member the baseline
 * projection declares; only the kind discriminator, the contract version, the Task mode, the declared
 * reducer stages, and the Result Set Revision differ. The baseline shape is therefore unchanged, and
 * a reader discriminates on `kind` (protocol 26).
 */
export interface FactualReviewProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof FACTUAL_REVIEW_KIND;
  contractVersion: typeof FACTUAL_REVIEW_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: FactualReviewGoal;
    expectedOutcome: typeof FACTUAL_REVIEW_EXPECTED_OUTCOME;
    createdAt: string;
    mode: FactualReviewTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    reducerStages: readonly ['unit-validation', 'reference-integrity', 'finding-reduction'];
    stopCondition: string;
  };
  resultSetRevision: null | FactualReviewResultSetRevisionProjection;
  /** The factual kind declares no update mode yet; its update surfaces arrive with S18b and S19. */
  update: null;
  updateControls: null;
  history: null | FactualReviewHistoryProjection;
  inspectedRevision: null | { revision: FactualReviewResultSetRevisionProjection; current: boolean; readOnly: true };
}
