import type {
  DefaultExecutionRuleReference,
  BaselineAnalysisProjection,
  FactualReviewProjection,
  ReviewCategoryProjection,
  InitialEvaluationProjection,
  ReadersReportProjection,
  EvaluationRewriteProjection,
  WritingProjection,
  ManuscriptBlockProjection,
  ImportStartupProjection,
  ManuscriptWindowProjection,
} from '../protocol.js';

// ---- 书系 › 成员与共享范围 (Issue #63, plan slice S28a; V2-UX-SER-001 to SER-012; ADR 0002, ADR 0036) ----------------------

/** A Series name, in characters (code points) once NFC-normalized and trimmed; its 说明 likewise. */
export const MAX_SERIES_TITLE_CHARACTERS = 40;
export const MAX_SERIES_NOTE_CHARACTERS = 500;
/**
 * How many Series, members, Books offered for 加入书系, and change records one answer carries at most (Issue #63 review).
 * Every list is read a page at a time, so none is out of reach, and no page weighs more than the service's byte budget.
 */
export const MAX_SERIES_LIST_PAGE = 50;
export const MAX_SERIES_MEMBERS_PAGE = 50;
export const MAX_SERIES_CANDIDATES_PAGE = 50;
export const MAX_SERIES_HISTORY_PAGE = 20;
/** How many of the Series a Book is in its 工作概览 names; every one is also reached from 书系. */
export const MAX_BOOK_SERIES_MEMBERSHIPS = 50;
/** The words 查找 matches in a Book's title for 加入书系, at most. */
export const MAX_SERIES_CANDIDATE_QUERY_CHARACTERS = 40;

/** Where the next page of 书系 starts: after this Series, by name. */
export interface SeriesListCursor {
  readonly title: string;
  readonly seriesId: string;
}

/** Where the next page of a Series' members starts: after this member, newest joined first. */
export interface SeriesMembersCursor {
  readonly joinedAt: string;
  readonly bookId: string;
}

/** Where the next page of Books offered for 加入书系 starts: after this Book, by title. */
export interface SeriesCandidatesCursor {
  readonly title: string;
  readonly bookId: string;
}

/** Where the next page of membership change records starts: after this record, newest first. */
export interface SeriesHistoryCursor {
  readonly recordedAt: string;
  readonly seriesId: string;
  readonly bookId: string;
  readonly ordinal: number;
}

export type SeriesMembershipChangeKind = 'add' | 'remove';

/** One Series as 书系 lists it. */
export interface SeriesSummaryProjection {
  readonly seriesId: string;
  readonly title: string;
  readonly note: string;
  readonly memberCount: number;
  readonly createdAt: string;
}

/** One page of 书系, by name; `nextCursor` reads the next (`更多书系…`). */
export interface SeriesListProjection {
  readonly series: ReadonlyArray<SeriesSummaryProjection>;
  readonly nextCursor: SeriesListCursor | null;
}

export interface CreateSeriesInput {
  readonly title: string;
  readonly note: string;
}

export interface SeriesCreationProjection {
  readonly seriesId: string;
  /** `已新建书系「…」`. */
  readonly completionLabel: string;
  /** The new Series as the list shows it: the answer never carries the whole list (Issue #63 review). */
  readonly series: SeriesSummaryProjection;
}

/** One of the preview's four consequence groups (SER-003): what changes, and what stays as it is. */
export interface SeriesImpactGroupProjection {
  readonly key: 'future-tasks' | 'runs' | 'knowledge-learning' | 'history';
  readonly title: '未来任务' | '已授权或正在运行' | '书系知识与学习' | '历史记录';
  readonly changes: ReadonlyArray<string>;
  readonly unchanged: ReadonlyArray<string>;
}

/** A Series Membership Change Record (SER-009): the Book, the Series, the change, who, when, and the impact it showed. */
export interface SeriesMembershipChangeProjection {
  readonly changeId: string;
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly bookId: string;
  readonly bookTitle: string;
  readonly kind: SeriesMembershipChangeKind;
  readonly label: '加入书系' | '移出书系';
  readonly priorMember: boolean;
  readonly newMember: boolean;
  readonly actor: '本机编辑';
  readonly recordedAt: string;
  readonly impact: ReadonlyArray<SeriesImpactGroupProjection>;
}

/** One member Book as 成员与共享范围 lists it. */
export interface SeriesMemberProjection {
  readonly bookId: string;
  readonly title: string;
  readonly authors: ReadonlyArray<string>;
  readonly editors: ReadonlyArray<string>;
  readonly joinedAt: string;
  /** When the Book's 书系一致性 findings were last put on its manuscript; `null` while they never were. */
  readonly seriesConsistencyReview: { readonly reviewedAt: string } | null;
  /** Why 书系一致性 cannot be chosen for the Book now — no knowledge taken in for it, too much, no manuscript; `null` when it can (Issue #64, S29a). */
  readonly seriesConsistencyUnavailableReason: string | null;
}

// ---- 书系知识 (Issue #63, plan slice S28b; V2-UX-SER-013 to SER-019; ADR 0036) -------------------------------------------

/** The stable knowledge classes a Series Knowledge Item belongs to (CONTEXT: Series Knowledge). */
export const SERIES_KNOWLEDGE_CLASSES = ['canon', 'characters', 'places', 'chronology', 'terminology', 'continuity', 'style', 'positioning'] as const;
export type SeriesKnowledgeClass = (typeof SERIES_KNOWLEDGE_CLASSES)[number];
export const SERIES_KNOWLEDGE_CLASS_LABELS: Readonly<Record<SeriesKnowledgeClass, string>> = {
  canon: '正典设定',
  characters: '人物',
  places: '地点',
  chronology: '时间线',
  terminology: '术语',
  continuity: '连续性规则',
  style: '共同文风',
  positioning: '定位',
};
/** Where a promoted revision may later be chosen (SER-014, SER-015): named at review, none preselected. */
export const SERIES_KNOWLEDGE_REUSE_SCOPES = ['series-tasks', 'consistency-review'] as const;
export type SeriesKnowledgeReuseScope = (typeof SERIES_KNOWLEDGE_REUSE_SCOPES)[number];
export const SERIES_KNOWLEDGE_REUSE_LABELS: Readonly<Record<SeriesKnowledgeReuseScope, string>> = {
  'series-tasks': '以后的书系范围任务都可以选用',
  'consistency-review': '只用于书系一致性审阅',
};
export const MAX_SERIES_KNOWLEDGE_SUBJECT_CHARACTERS = 40;
export const MAX_SERIES_KNOWLEDGE_CONTENT_CHARACTERS = 2_000;
/**
 * How many knowledge items, open candidates and one item's revisions an answer carries at most (Issue #63 review): each list
 * is read a page at a time and weighed as well, and an item comes with its current revision only.
 */
export const MAX_SERIES_KNOWLEDGE_ITEMS_PAGE = 30;
export const MAX_SERIES_KNOWLEDGE_CANDIDATES_PAGE = 30;
export const MAX_SERIES_KNOWLEDGE_REVISIONS_PAGE = 10;
/** How much of a cited passage a list or a review shows; the record keeps all of it. */
export const MAX_SERIES_KNOWLEDGE_QUOTE_GRAPHEMES = 200;
/** How many disclosed conflicts a review lists; it says how many there are in all. */
export const MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN = 50;
/** The words 查找条目 matches in an item's name, at most. */
export const MAX_SERIES_KNOWLEDGE_QUERY_CHARACTERS = 40;

/** Where the next page of a Series' knowledge items starts: after this item, by name. */
export interface SeriesKnowledgeItemsCursor {
  readonly subject: string;
  readonly itemId: string;
}

/** Where the next page of open candidates starts: after this candidate, oldest proposed first. */
export interface SeriesKnowledgeCandidatesCursor {
  readonly firstAt: string;
  readonly candidateId: string;
}
export const SERIES_KNOWLEDGE_CONFLICT_LABEL = '存在书系知识冲突 · 需要处理' as const;

/** The Series Knowledge Item a candidate proposes: a new one, named and classed, or one exact existing item. */
export type SeriesKnowledgeTarget =
  | { readonly kind: 'new'; readonly subject: string; readonly knowledgeClass: SeriesKnowledgeClass }
  | { readonly kind: 'existing'; readonly itemId: string };

/** The exact span of a member Book's working manuscript a candidate cites, as the editor selected it (SER-013). */
export interface SeriesKnowledgeSpanInput {
  readonly manuscriptId: string;
  readonly branchId: string;
  readonly windowStartBlockId: string;
  readonly baseRevisionId: string;
  readonly expectedJournalSequence: number;
  readonly blockId: string;
  readonly baseBlockDigest: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  readonly selectedText: string;
}

export interface ProposeSeriesKnowledgeInput {
  readonly seriesId: string;
  readonly target: SeriesKnowledgeTarget;
  readonly content: string;
  /** `null` for the editor's own words; the exact span of a member Book's manuscript otherwise. */
  readonly span: SeriesKnowledgeSpanInput | null;
}

/** Where a provenance-bound candidate came from: one member Book's manuscript, at an exact revision and journal position. */
export interface SeriesKnowledgeProvenanceProjection {
  readonly kind: 'manuscript-revision';
  readonly bookId: string;
  readonly bookTitle: string;
  readonly manuscriptId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly blockId: string;
  readonly fromGrapheme: number;
  readonly toGrapheme: number;
  /** The cited words — whole up to `MAX_SERIES_KNOWLEDGE_QUOTE_GRAPHEMES`, beyond that their opening and `…`. */
  readonly quote: string;
  /**
   * Whether the manuscript held changes beyond that revision, not yet saved as one, when the words were cited (Issue #63
   * review): the words may come from those changes rather than the revision itself.
   */
  readonly uncheckpointed: boolean;
}

/**
 * A disclosed conflict (SER-016), found by identity: the same item or name, never by meaning. Its line names the item or the
 * candidate and its version, never their words (Issue #63 review).
 */
export interface SeriesKnowledgeConflictProjection {
  readonly kind: 'existing-item' | 'competing-candidate' | 'item-updated';
  readonly line: string;
}

export interface SeriesKnowledgeTargetProjection {
  readonly kind: 'new' | 'existing';
  readonly itemId: string | null;
  readonly subject: string;
  readonly knowledgeClass: SeriesKnowledgeClass;
  readonly classLabel: string;
  /** For an existing item: the revision the candidate was written against. */
  readonly baseRevisionOrdinal: number | null;
}

/** A Series Knowledge Candidate as it stands: non-authoritative, read by no Task (SER-014). */
export interface SeriesKnowledgeCandidateProjection {
  readonly candidateId: string;
  readonly version: number;
  readonly target: SeriesKnowledgeTargetProjection;
  readonly content: string;
  readonly authoring: 'editor' | 'manuscript-revision';
  readonly provenance: SeriesKnowledgeProvenanceProjection | null;
  readonly recordedAt: string;
  readonly conflicts: number;
}

/** One immutable Series Knowledge Revision with the decision that made it (SER-017). */
export interface SeriesKnowledgeRevisionProjection {
  readonly revisionId: string;
  readonly ordinal: number;
  readonly content: string;
  readonly authoring: 'editor' | 'manuscript-revision';
  readonly provenance: SeriesKnowledgeProvenanceProjection | null;
  /** The first bounded page of conflicts kept with this revision; never a verification. */
  readonly conflicts: ReadonlyArray<SeriesKnowledgeConflictProjection>;
  readonly conflictCount: number;
  readonly reuseScope: SeriesKnowledgeReuseScope;
  readonly reuseLabel: string;
  readonly decisionId: string;
  readonly outcome: 'created' | 'updated';
  readonly recordedAt: string;
}

/**
 * A stable Series Knowledge Item with its current revision and how many it holds in all: the earlier ones are read on demand
 * (历次版本, Issue #63 review).
 */
export interface SeriesKnowledgeItemProjection {
  readonly itemId: string;
  readonly subject: string;
  readonly knowledgeClass: SeriesKnowledgeClass;
  readonly classLabel: string;
  readonly createdAt: string;
  readonly current: SeriesKnowledgeRevisionProjection;
  readonly revisionCount: number;
}

/**
 * A Series' knowledge as its page first shows it (Issue #63 review): the first page of items by name and of open candidates
 * oldest first, how many each holds in all, and where each next page starts.
 */
export interface SeriesKnowledgeProjection {
  readonly items: ReadonlyArray<SeriesKnowledgeItemProjection>;
  readonly itemCount: number;
  readonly itemsNext: SeriesKnowledgeItemsCursor | null;
  readonly candidates: ReadonlyArray<SeriesKnowledgeCandidateProjection>;
  readonly candidateCount: number;
  readonly candidatesNext: SeriesKnowledgeCandidatesCursor | null;
}

/** A page of a Series' knowledge items by name, narrowed by 查找条目 when words are given (`更多条目…`). */
export interface SeriesKnowledgeItemsPageProjection {
  readonly items: ReadonlyArray<SeriesKnowledgeItemProjection>;
  readonly nextCursor: SeriesKnowledgeItemsCursor | null;
}

/** A further page of open candidates (`更多候选项…`). */
export interface SeriesKnowledgeCandidatesPageProjection {
  readonly candidates: ReadonlyArray<SeriesKnowledgeCandidateProjection>;
  readonly nextCursor: SeriesKnowledgeCandidatesCursor | null;
}

/** A page of one item's revisions, newest first, and the ordinal the next page reads below (历次版本). */
/** A bounded page of the conflicts preserved on one exact immutable revision. */
export interface SeriesKnowledgeConflictsProjection {
  readonly itemId: string;
  readonly revisionId: string;
  readonly conflicts: ReadonlyArray<SeriesKnowledgeConflictProjection>;
  readonly total: number;
  readonly nextAfter: number | null;
}

export interface SeriesKnowledgeRevisionsProjection {
  readonly itemId: string;
  readonly revisions: ReadonlyArray<SeriesKnowledgeRevisionProjection>;
  readonly nextBefore: number | null;
}

/**
 * 书系 › one Series › 成员与共享范围 (SER-001): the first page of its member Books, newest joined first — a Book just added is
 * always on it — and of its membership changes, newest first, each with where the next page starts, and how many Books the
 * Series and the house hold, which is what 加入书系… can offer. Its Series Knowledge comes with it (Issue #63, S28b).
 * It is not a reader of the member manuscripts.
 */
export interface SeriesProjection {
  readonly tasks?: ReadonlyArray<{ readonly bookId: string; readonly bookTitle: string; readonly taskIntentId: string; readonly kind: string; readonly title: string; readonly runRecordId: string | null }>;
  readonly seriesId: string;
  readonly title: string;
  readonly note: string;
  readonly createdAt: string;
  readonly memberCount: number;
  readonly bookCount: number;
  readonly members: ReadonlyArray<SeriesMemberProjection>;
  readonly membersNext: SeriesMembersCursor | null;
  readonly history: ReadonlyArray<SeriesMembershipChangeProjection>;
  readonly historyCount: number;
  readonly historyNext: SeriesHistoryCursor | null;
  readonly knowledge: SeriesKnowledgeProjection;
  /** 书系检索排除 (Issue #64, S29b): the exclusions in force and their revisions, newest first. */
  readonly exclusions: SeriesExclusionsProjection;
}

/** A further page of a Series' members (`更多成员…`). */
export interface SeriesMembersPageProjection {
  readonly members: ReadonlyArray<SeriesMemberProjection>;
  readonly nextCursor: SeriesMembersCursor | null;
}

/** A page of the Books 加入书系… offers — every Book not in the Series, by title — narrowed by 查找 when words are given. */
export interface SeriesCandidatesProjection {
  readonly candidates: ReadonlyArray<{ readonly bookId: string; readonly title: string }>;
  readonly nextCursor: SeriesCandidatesCursor | null;
}

/** A further page of membership change records, of one Series or of one Book (`更早的记录…`). */
export interface SeriesHistoryPageProjection {
  readonly history: ReadonlyArray<SeriesMembershipChangeProjection>;
  readonly nextCursor: SeriesHistoryCursor | null;
}

export interface SeriesKnowledgeProposalProjection {
  readonly candidateId: string;
  /** `已提议为书系「…」的知识候选项`. */
  readonly completionLabel: string;
  /** The candidate as it now stands: the answer carries it alone, and the page reads its lists again (Issue #63 review). */
  readonly candidate: SeriesKnowledgeCandidateProjection;
}

/**
 * 书系知识纳入审阅 (SER-015 to SER-019): the exact Series and item, the candidate's content and provenance, the item's current
 * revision when it would be superseded, the disclosed conflicts, and where it may later be used — none preselected.
 */
export interface SeriesKnowledgeReviewProjection {
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly candidate: SeriesKnowledgeCandidateProjection;
  readonly current: SeriesKnowledgeRevisionProjection | null;
  /** At most `MAX_SERIES_KNOWLEDGE_CONFLICTS_SHOWN` of them, with how many there are in all. */
  readonly conflicts: ReadonlyArray<SeriesKnowledgeConflictProjection>;
  readonly conflictCount: number;
  readonly conflictsAfter: number;
  readonly conflictsNextAfter: number | null;
  readonly conflictLabel: typeof SERIES_KNOWLEDGE_CONFLICT_LABEL | null;
  readonly reuseScopes: ReadonlyArray<{ readonly scope: SeriesKnowledgeReuseScope; readonly label: string }>;
  /** Why the candidate cannot be taken in at all now, or `null`. */
  readonly blocked: string | null;
  readonly reviewDigest: string;
  readonly actionLabel: '纳入书系知识';
}

/** Every page remains bound to the candidate and complete conflict set the editor reviewed. */
export interface InspectSeriesKnowledgeReviewInput {
  readonly seriesId: string;
  readonly candidateId: string;
  readonly conflictsPage?: { readonly candidateVersion: number; readonly reviewDigest: string; readonly after: number };
}

export interface EditSeriesKnowledgeCandidateInput {
  readonly seriesId: string;
  readonly candidateId: string;
  readonly expectedVersion: number;
  readonly target: SeriesKnowledgeTarget;
  readonly content: string;
}

export interface PromoteSeriesKnowledgeInput {
  readonly seriesId: string;
  readonly candidateId: string;
  readonly candidateVersion: number;
  readonly reviewDigest: string;
  readonly reuseScope: SeriesKnowledgeReuseScope;
  /** `preserved` only when the review disclosed a conflict and the editor chose 保留已披露冲突. */
  readonly conflictDisposition: 'none' | 'preserved';
}

// ---- 书系检索排除 (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-029; ADR 0037) --------------------------------------

/**
 * What a Series Retrieval Exclusion may name (SER-020): one exact Series Knowledge Item (its current and later revisions), one
 * stable knowledge class (its items now and later), one member Book (the Series Knowledge taken from its manuscript, now and
 * later), or one Source Version of a member Book — which no Series read reaches yet, so it is recorded and read by nothing.
 */
export const SERIES_EXCLUSION_TARGET_KINDS = ['knowledge-item', 'knowledge-class', 'book', 'source-version'] as const;
export type SeriesExclusionTargetKind = (typeof SERIES_EXCLUSION_TARGET_KINDS)[number];
export const SERIES_EXCLUSION_TARGET_KIND_LABELS: Readonly<Record<SeriesExclusionTargetKind, string>> = {
  'knowledge-item': '书系知识条目',
  'knowledge-class': '知识类别',
  book: '成员图书',
  'source-version': '来源版本',
};
/** `添加检索排除`, `修改检索排除` (its reason) and `停止此排除`: each appends one revision, never edits one. */
export const SERIES_EXCLUSION_ACTIONS = ['add', 'change', 'end'] as const;
export type SeriesExclusionAction = (typeof SERIES_EXCLUSION_ACTIONS)[number];
export type SeriesExclusionActionLabel = '添加检索排除' | '修改检索排除' | '停止此排除';
export const SERIES_EXCLUSION_ACTION_LABELS: Readonly<Record<SeriesExclusionAction, SeriesExclusionActionLabel>> = {
  add: '添加检索排除',
  change: '修改检索排除',
  end: '停止此排除',
};
/** An exclusion's optional reason, in characters once NFC-normalized and trimmed. */
export const MAX_SERIES_EXCLUSION_REASON_CHARACTERS = 200;
/** How many exclusions one Series holds in force at once; every one is listed on its page. */
export const MAX_SERIES_EXCLUSIONS = 100;
export const MAX_SERIES_EXCLUSION_HISTORY_PAGE = 20;
export const MAX_SERIES_EXCLUSION_TARGETS_PAGE = 50;
/** The state an affected Run stops in, whose only ways on are `修改计划并重新授权` and `取消任务` (SER-024). */
export const SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL = '书系检索范围已变化 · 需要重新确认计划' as const;
/** The Historically Affected Result Marker (SER-026). */
export const HISTORICALLY_AFFECTED_RESULT_MARKER = '此结果使用的材料后来被排除' as const;
/**
 * The state a Run stops in when a Learning Material its pinned 本社审阅偏好 version read was 停止今后使用 (Issue #912; LAUD-008):
 * the Run is `scope-changed` — its only ways on are 重新执行（不含该影响） and 取消任务 — in these words, never the Series one.
 */
export const LEARNING_INFLUENCE_WITHDRAWN_LABEL = '所参考的本社审阅偏好已停止使用 · 需要重新确认计划' as const;
/** The outcome summary the stop records, by which the Review Run tells it apart from any other interruption. */
export const LEARNING_INFLUENCE_STOP_SUMMARY = `${LEARNING_INFLUENCE_WITHDRAWN_LABEL}：它参考的偏好版本中有学习材料已停止今后使用，运行在下一个阅读范围前停下；已读完的结果保留，已经发给模型服务的内容无法收回。` as const;
/** The Historically Affected Result Marker for a result that read such a version (Issue #912; LAUD-008). */
export const LEARNING_INFLUENCE_RESULT_MARKER = '此结果参考的学习材料后来停止今后使用' as const;
/** The marker where the exclusion ledger no longer reads (Issue #64 review): history that cannot be checked says so. */
export const HISTORICAL_MARKER_UNVERIFIABLE = '此结果使用的材料是否后来被排除：无法核对' as const;

/** What an exclusion names: an item, a class key, a Book or a Source Version identity. */
export interface SeriesExclusionTargetInput {
  readonly kind: SeriesExclusionTargetKind;
  readonly id: string;
}

/** A target in the editor's words: what it is, and how it keeps applying (SER-021). */
export interface SeriesExclusionTargetProjection {
  readonly kind: SeriesExclusionTargetKind;
  readonly id: string;
  /** `书系知识条目「海边小城」（地点）`, `知识类别「地点」`, `成员图书《星河之三》`, `来源版本「….docx」（《…》）`. */
  readonly label: string;
  /** Continuing or fixed (SER-021): what later material it also covers, or that it covers this one alone. */
  readonly continuing: string;
  /** Whether any Series read reads this kind of material yet: never for a Source Version (SER-028), which none reaches. */
  readonly read: boolean;
}

/** Where the next page of targets starts: after this one, in the kind's own order. */
export interface SeriesExclusionTargetsCursor {
  readonly key: string;
  readonly id: string;
}

export interface InspectSeriesExclusionTargetsInput {
  readonly seriesId: string;
  readonly kind: SeriesExclusionTargetKind;
  readonly after: SeriesExclusionTargetsCursor | null;
}

/** A page of what `添加检索排除…` may name, each saying whether an exclusion in force names it already. */
export interface SeriesExclusionTargetsProjection {
  readonly kind: SeriesExclusionTargetKind;
  readonly targets: ReadonlyArray<SeriesExclusionTargetProjection & { readonly excluded: boolean }>;
  readonly nextCursor: SeriesExclusionTargetsCursor | null;
}

/** One of the impact preview's four groups (SER-022): what changes, and what stays as it is. */
export interface SeriesExclusionImpactGroupProjection {
  readonly key: 'future-reads' | 'runs' | 'history' | 'unaffected';
  readonly title: '今后的检索' | '已排队、已授权或正在运行的任务' | '已完成的历史' | '不受影响的授权';
  readonly changes: ReadonlyArray<string>;
  readonly unchanged: ReadonlyArray<string>;
}

/** One appended revision of an exclusion: what it did, why, who, when, and the impact it showed. */
export interface SeriesExclusionRevisionProjection {
  readonly revisionId: string;
  readonly exclusionId: string;
  readonly revision: number;
  readonly action: SeriesExclusionAction;
  readonly actionLabel: SeriesExclusionActionLabel;
  readonly target: SeriesExclusionTargetProjection;
  readonly reason: string;
  readonly actor: '本机编辑';
  readonly recordedAt: string;
  readonly impact: ReadonlyArray<SeriesExclusionImpactGroupProjection>;
}

/** An exclusion in force now: its target, its reason, and since when it applies. */
export interface SeriesExclusionProjection {
  readonly exclusionId: string;
  readonly target: SeriesExclusionTargetProjection;
  readonly reason: string;
  /** When its first revision took effect: the instant it was recorded. */
  readonly effectiveSince: string;
  readonly revision: number;
}

/** Where the next page of exclusion revisions starts: after this one, newest first. */
export interface SeriesExclusionHistoryCursor {
  readonly recordedAt: string;
  readonly revisionId: string;
}

/** A Series' 检索排除: every exclusion in force, and its revisions newest first, a page at a time. */
export interface SeriesExclusionsProjection {
  readonly effective: ReadonlyArray<SeriesExclusionProjection>;
  readonly history: ReadonlyArray<SeriesExclusionRevisionProjection>;
  readonly historyCount: number;
  readonly historyNext: SeriesExclusionHistoryCursor | null;
}

export interface InspectSeriesExclusionHistoryInput {
  readonly seriesId: string;
  readonly after: SeriesExclusionHistoryCursor;
}

export interface SeriesExclusionHistoryPageProjection {
  readonly history: ReadonlyArray<SeriesExclusionRevisionProjection>;
  readonly nextCursor: SeriesExclusionHistoryCursor | null;
}

/** `添加检索排除` names a target; `修改检索排除` and `停止此排除` name the exclusion they supersede. */
export interface PreviewSeriesExclusionInput {
  readonly seriesId: string;
  readonly action: SeriesExclusionAction;
  readonly exclusionId: string | null;
  readonly target: SeriesExclusionTargetInput | null;
  readonly reason: string;
}

/** 书系检索排除影响预览 (SER-021, SER-022): exact target, scope, effective time, reason and actor, then the four groups. */
export interface SeriesExclusionPreviewProjection {
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly action: SeriesExclusionAction;
  readonly actionLabel: SeriesExclusionActionLabel;
  readonly exclusionId: string | null;
  readonly target: SeriesExclusionTargetProjection;
  /** The reason as it would be recorded: empty when none is given. */
  readonly reason: string;
  /** `只限书系「…」的书系检索`: the one retrieval path it restricts (SER-029). */
  readonly scope: string;
  /** `记录后立即生效`: the exclusion is the current-read guard from the instant it is recorded (SER-023). */
  readonly effectiveTime: string;
  readonly actor: '本机编辑';
  readonly groups: ReadonlyArray<SeriesExclusionImpactGroupProjection>;
  /** What the commit names, so a preview the exclusions, the knowledge or the Runs moved past is refused. */
  readonly previewDigest: string;
}

export interface RecordSeriesExclusionInput extends PreviewSeriesExclusionInput {
  readonly previewDigest: string;
}

export interface SeriesExclusionResultProjection {
  readonly exclusionId: string;
  readonly revisionId: string;
  readonly completionLabel: '书系检索排除已生效' | '检索排除已修改' | '已停止此排除';
  /** How many authorized Runs it stopped at once, before their next read. */
  readonly stoppedRuns: number;
  /** The revision it appended: the answer carries it alone, and the page reads the Series again. */
  readonly revision: SeriesExclusionRevisionProjection;
}

/**
 * A Book's side of 书系 (SER-009): the Series it is in now, by name — at most `MAX_BOOK_SERIES_MEMBERSHIPS`, with how many in
 * all — and the first page of its membership changes, newest first, with how many there are and where the next page starts.
 */
export interface InspectBookSeriesInput {
  readonly bookId: string;
  readonly membershipsAfter?: SeriesListCursor | null;
}

export interface BookSeriesProjection {
  readonly bookId: string;
  readonly memberships: ReadonlyArray<{ readonly seriesId: string; readonly title: string; readonly joinedAt: string }>;
  readonly membershipCount: number;
  readonly membershipsNext: SeriesListCursor | null;
  readonly history: ReadonlyArray<SeriesMembershipChangeProjection>;
  readonly historyCount: number;
  readonly historyNext: SeriesHistoryCursor | null;
}

/** One bounded fragment of an immutable eligibility decision's complete note. */
export const LIBRARY_REASON_PAGE_UNITS = 1024;
export interface LibraryDecisionReasonPage {
  readonly text: string;
  readonly nextOffset: number | null;
  readonly previousOffset: number | null;
}

/** The drawer's `设为快速开始默认…` for one plan, and the rule that started its Task, when one did. */
export interface TaskPlanDefaultRuleProjection {
  canSet: boolean;
  /** Why the plan cannot be set as the quick-start default, in the editor's words; `null` when it can. */
  reason: string | null;
  /** The exact Plan Envelope a set binds — the plan on show; `null` when it cannot be set. */
  planEnvelopeDigest: string | null;
  /** The Book's rule for this plan's pattern — in force or turned off — and whether this plan set it; `null` when none was set. */
  current: null | (DefaultExecutionRuleReference & { state: 'active' | 'deactivated'; fromThisPlan: boolean });
  /** What a rule set from this plan binds, in the editor's words: the confirmation lists exactly these. */
  binds: ReadonlyArray<{ label: string; value: string }>;
  /** The rule version 快速开始 started this Task under; `null` for a Task started from its plan. */
  startedBy: null | DefaultExecutionRuleReference;
}

/** What one quick start did: started the Task under the rule, or stopped at the plan with the reasons. */
export interface QuickStartBaselineAnalysisResult {
  outcome: 'started' | 'fell-back';
  /** Why the Task was not started, in the editor's words; empty once it started. */
  reasons: ReadonlyArray<string>;
  projection: BaselineAnalysisProjection;
}

/** Every analysis projection, discriminated on `kind`. */
export type AnalysisProjection = BaselineAnalysisProjection | FactualReviewProjection | ReviewCategoryProjection | InitialEvaluationProjection |
  ReadersReportProjection | EvaluationRewriteProjection | WritingProjection;

export interface HistoricalRevisionProjection {
  mode: 'historical-revision';
  readOnly: true;
  bookId: string;
  bookTitle: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  parentRevisionId: string | null;
  sourceVersionId: string;
  createdAt: string;
  previousCursor: string | null;
  nextCursor: string | null;
  position: {
    startBlock: number;
    endBlock: number;
    totalBlocks: number;
    startCharacter: number;
    endCharacter: number;
    totalCharacters: number;
    structureLabel: string | null;
    label: string;
  };
  blocks: ReadonlyArray<ManuscriptBlockProjection>;
}

export type ManuscriptWindowTarget =
  | { kind: 'start' }
  | { kind: 'cursor'; cursor: string }
  | { kind: 'block'; blockId: string }
  | { kind: 'window-start'; blockId: string }
  | { kind: 'character'; character: number }
  | { kind: 'proportion'; proportion: number };

export interface OutlineEntryProjection {
  outlineId: string;
  blockId: string;
  kind: 'title' | 'heading';
  level: number;
  text: string;
  displayTextTruncated: boolean;
  character: number;
  proportion: number;
}

export interface OutlineProjection {
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  workingDigest: string;
  entries: ReadonlyArray<OutlineEntryProjection>;
  previousCursor: string | null;
  nextCursor: string | null;
}

export interface PriorWorkItemProjection {
  bookId: string;
  bookTitle: string;
  manuscriptId: string;
  branchId: string;
  branchName: string;
  revisionId: string;
  revisionLabel: string;
  journalSequence: number;
  workingDigest: string;
  totalCharacters: number;
  latestMilestone: null | { milestoneId: string; label: string; purpose: string; revisionLabel: string };
  recoveryAttention: null | {
    attentionId: string;
    attentionVersion: number;
    status: 'pending' | 'deferred';
    label: '恢复待确认状态';
  };
}

export type RecoverySelection =
  | { kind: 'journal' }
  | { kind: 'checkpoint' }
  | { kind: 'snapshot'; snapshotId: string };

export interface RecoveryCandidateProjection {
  kind: 'journal' | 'checkpoint' | 'snapshot';
  candidateId: string;
  title: string;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  journalSequence: number;
  durableAt: string;
  coveredChangeExtent: string;
  verification:
    | '已由 SQLite 权威记录核对'
    | '已从检查点有界重放并与 SQLite 持久工作状态核对'
    | '已独立校验快照对象';
  limitation: string;
  snapshotId: string | null;
}

export type RecoverySnapshotComparisonProjection =
  | { state: 'eligible'; candidate: RecoveryCandidateProjection & { kind: 'snapshot'; snapshotId: string } }
  | {
      state: 'unavailable';
      snapshotId: string;
      verification: '对象缺失' | '摘要不匹配' | '对象不完整';
      limitation: string;
    }
  | { state: 'none'; limitation: '没有适用的恢复快照' };

export interface RecoveryComparisonProjection {
  attentionId: string;
  attentionVersion: number;
  status: 'pending' | 'deferred';
  unresolvedCount: number;
  bookId: string;
  bookTitle: string;
  manuscriptId: string;
  branchId: string;
  branchName: string;
  lastDurableEditBoundary: {
    journalSequence: number;
    durableAt: string;
    coveredChangeExtent: string;
    uncertainty: string;
  };
  journal: RecoveryCandidateProjection & { kind: 'journal'; snapshotId: null };
  checkpoint: RecoveryCandidateProjection & { kind: 'checkpoint'; snapshotId: null };
  snapshot: RecoverySnapshotComparisonProjection;
  otherPriorWork: ReadonlyArray<PriorWorkItemProjection>;
}

export type RecoveryWindowTarget = { kind: 'start' } | { kind: 'after'; position: number };

export interface RecoveryWindowProjection {
  attentionId: string;
  selection: RecoverySelection;
  title: string;
  revisionId: string;
  revisionLabel: string;
  readonly: true;
  blocks: ReadonlyArray<ManuscriptBlockProjection>;
  nextTarget: RecoveryWindowTarget | null;
}

export interface RecoveryDeferralProjection {
  attentionId: string;
  attentionVersion: number;
  status: 'deferred';
  completionLabel: '已保留恢复待确认状态';
  next:
    | { state: 'import'; startup: ImportStartupProjection }
    | { state: 'prior-work'; priorWork: ReadonlyArray<PriorWorkItemProjection> };
}

export interface RecoveryRestorationProjection {
  restorationId: string;
  attentionId: string;
  selected: RecoverySelection;
  sourceRevisionId: string;
  descendantRevisionId: string;
  descendantRevisionLabel: string;
  reviewStatus: '当前为恢复的工作状态';
  preservedHistoryLabel: string;
  window: ManuscriptWindowProjection;
}

export type StartupProjection =
  | { state: 'manuscript-recovery'; recovery: RecoveryComparisonProjection }
  | { state: 'import'; startup: ImportStartupProjection }
  | { state: 'prior-work'; priorWork: ReadonlyArray<PriorWorkItemProjection> };

export interface SearchMatchProjection {
  matchId: string;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  globalCharacter: number;
  headingLabel: string;
  context: string;
  rangeDigest: string;
}

export interface SearchSummaryProjection {
  searchId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
  query: string;
  scopeLabel: '全稿';
  totalMatches: number;
}

export interface SearchResultsProjection extends SearchSummaryProjection {
  results: ReadonlyArray<SearchMatchProjection>;
  previousCursor: string | null;
  nextCursor: string | null;
}

export interface ReplacementPreviewProjection {
  previewId: string;
  searchId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
  query: string;
  replacement: string;
  scopeLabel: '全稿';
  matchingRule: '精确字素匹配；从左向右；重叠时保留最早匹配';
  inclusionRule: '仅提交冻结时明确纳入的非重叠精确匹配';
  revisionLabel: string;
  totalMatches: number;
  includedMatches: number;
  excludedMatches: number;
  state: 'reviewing' | 'frozen';
  excludedMatchIds: ReadonlyArray<string>;
  representativeContexts: ReadonlyArray<SearchMatchProjection>;
}

export interface ReplacementDismissalProjection {
  previewId: string;
  state: 'cancelled';
}

export interface ReplacementCommitProjection {
  previewId: string;
  branchId: string;
  revisionId: string;
  journalSequence: number;
  workingDigest: string;
  committedCount: number;
  completionLabel: string;
}

/**
 * The purpose of a Milestone Version (IA › Milestone Versions; V2-UX-MILE-003, MILE-009): one of the four
 * frozen purposes — 阶段留档 / 送审候选 / 交付候选 / 其他 — or the editor's own words through 自行输入. A purpose
 * states the intended next use only and grants nothing.
 *
 * The kind is not stored beside the words: a frozen purpose is stored as its own label, so every
 * milestone ever saved — the free-text purposes of rows saved before the kinds existed included — reads
 * its kind back from the words it holds (`milestonePurposeKindOf`), and a purpose typed through 自行输入
 * that is exactly a frozen label is that purpose.
 */
export type MilestonePurposeKind = 'stage-archive' | 'review-candidate' | 'delivery-candidate' | 'other' | 'custom';
export const MILESTONE_PURPOSE_KINDS: readonly MilestonePurposeKind[] = [
  'stage-archive',
  'review-candidate',
  'delivery-candidate',
  'other',
  'custom',
];
/** Each purpose's own label: the four frozen purposes, and 自行输入 for the editor's own words. */
export const MILESTONE_PURPOSE_LABELS: Readonly<Record<MilestonePurposeKind, string>> = {
  'stage-archive': '阶段留档',
  'review-candidate': '送审候选',
  'delivery-candidate': '交付候选',
  other: '其他',
  custom: '自行输入',
};
/** A purpose's words once trimmed, in UTF-16 code units: the bound the store has always kept. */
export const MAX_MILESTONE_PURPOSE_CODE_UNITS = 120;

/** The kind a stored purpose reads as: a frozen purpose by its exact label, and anything else the editor's own words. */
export function milestonePurposeKindOf(purpose: string): MilestonePurposeKind {
  return MILESTONE_PURPOSE_KINDS.find((kind) => kind !== 'custom' && MILESTONE_PURPOSE_LABELS[kind] === purpose) ?? 'custom';
}

/**
 * What a save request's purpose comes to, or `null` when it names none: a frozen purpose carries no words
 * of its own and is stored as its label; 自行输入 carries 1–120 code units once NFC-normalized and trimmed,
 * and words that are exactly a frozen label are that frozen purpose.
 */
export function resolveMilestonePurpose(kind: unknown, purpose: unknown): { kind: MilestonePurposeKind; purpose: string } | null {
  if (typeof kind !== 'string' || !MILESTONE_PURPOSE_KINDS.includes(kind as MilestonePurposeKind)) return null;
  const purposeKind = kind as MilestonePurposeKind;
  if (purposeKind !== 'custom') return purpose === null ? { kind: purposeKind, purpose: MILESTONE_PURPOSE_LABELS[purposeKind] } : null;
  if (typeof purpose !== 'string' || !purpose.isWellFormed()) return null;
  const words = purpose.normalize('NFC').trim();
  if (words.length === 0 || words.length > MAX_MILESTONE_PURPOSE_CODE_UNITS) return null;
  return { kind: milestonePurposeKindOf(words), purpose: words };
}

/** 保存里程碑版本 (V2-UX-MILE-003): a label, a purpose, and an optional note. */
export interface SaveMilestoneInput {
  manuscriptId: string;
  branchId: string;
  label: string;
  /** One of the four frozen purposes, or `custom` for 自行输入. */
  purposeKind: MilestonePurposeKind;
  /** The editor's own words for `custom`; `null` for a frozen purpose, whose label is the purpose. */
  purpose: string | null;
  note: string;
}

export interface MilestoneProjection {
  milestoneId: string;
  manuscriptId: string;
  branchId: string;
  revisionId: string;
  revisionLabel: string;
  label: string;
  /** The purpose as stored: a frozen purpose's label, or the editor's own words. */
  purpose: string;
  purposeKind: MilestonePurposeKind;
  note: string | null;
  createdAt: string;
  journalSequence: number;
  workingDigest: string;
  signoffRecordId: string;
  workflowEvidenceDigest: string;
  actor: '本机编辑';
  signedAt: string;
  statedNextUse: string;
  completionLabel: string;
  recoverySnapshot: {
    snapshotId: string;
    blockCount: number;
    verification: '已独立校验快照对象';
  };
}
