import type { CustomAnalysisPreparationFrom } from './custom-analysis-redo.js';
import type { FactualSourceRangeProjection } from './factual-verification.js';
import type { AnalysisCoverageAxis, AnalysisFreshnessAxis, AnalysisGapProjection } from './analysis.js';
import type { BaselineAnalysisProjection, BaselineAnalysisUpdateRequest } from './analysis-plan.js';

export const BASELINE_ANALYSIS_KIND = 'baseline-manuscript-analysis' as const;

export const BASELINE_ANALYSIS_CONTRACT_VERSION = 'ai7.baseline-manuscript-analysis/1' as const;

export const BASELINE_ANALYSIS_TASK_GOAL = '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。' as const;

/**
 * The three exact update meanings (ADR 0047; editorial CONTEXT) beside the first baseline. Each mode
 * has one fixed Task goal text and one exact action label; a Task carries exactly one mode.
 */
export type BaselineAnalysisUpdateMode = 'sync-current' | 'reanalyze-range' | 'reanalyze-book';

export type BaselineAnalysisTaskMode = 'first-baseline' | BaselineAnalysisUpdateMode;

export const BASELINE_ANALYSIS_UPDATE_MODES: readonly BaselineAnalysisUpdateMode[] = ['sync-current', 'reanalyze-range', 'reanalyze-book'];

export const BASELINE_ANALYSIS_MODE_GOALS = {
  'first-baseline': BASELINE_ANALYSIS_TASK_GOAL,
  'sync-current': '将基线稿件分析同步到当前稿件：复用内容一致的兼容单元，仅重算失效闭包，追加一个结果集修订版。',
  'reanalyze-range': '重新分析所选范围：绕过所选内容块范围及其重叠闭包的既有模型结果，复用其余兼容单元，追加一个结果集修订版。',
  'reanalyze-book': '重新分析全书：绕过全部既有模型结果，按当前覆盖清单重算每个分析单元，追加一个结果集修订版。',
} as const satisfies Record<BaselineAnalysisTaskMode, string>;

export type BaselineAnalysisGoal = (typeof BASELINE_ANALYSIS_MODE_GOALS)[BaselineAnalysisTaskMode];

export const BASELINE_ANALYSIS_MODE_LABELS = {
  'first-baseline': '首次基线分析',
  'sync-current': '同步到当前稿件',
  'reanalyze-range': '重新分析所选范围',
  'reanalyze-book': '重新分析全书',
} as const satisfies Record<BaselineAnalysisTaskMode, string>;

export const BASELINE_ANALYSIS_MODE_MEANINGS = {
  'first-baseline': '对固定的任务输入修订版派生覆盖清单并逐单元执行基线稿件分析契约 v1，形成首个结果集修订版。',
  'sync-current': '复用与前一修订版内容一致（自身内容块与重叠内容块摘要逐一相同）的已闭合单元，仅重算确定性失效/依赖闭包，并针对当前稿件 pin 重新归约四个状态轴。',
  'reanalyze-range': '绕过所选内容块范围内的单元及其重叠上下文来自这些单元的单元的既有模型结果，其余兼容单元按血缘复用，并针对当前稿件 pin 重新归约四个状态轴。',
  'reanalyze-book': '绕过全部既有模型结果，按当前覆盖清单重算每个分析单元，即使清单与前一修订版完全相同也不复用任何单元。',
} as const satisfies Record<BaselineAnalysisTaskMode, string>;

/**
 * The second analysis kind (plan slice S18a): a **factual review** of the same Book, on the same real
 * path, with its own exact-versioned contract, Result Set identity, and Task modes. It lists the
 * Manuscript Assertions of each Analysis Unit and anchors each to the exact quotation position it
 * claims; it fetches no evidence, so nothing it records is a factual judgement (ADR 0066, ADR 0074).
 */
export const FACTUAL_REVIEW_KIND = 'factual-review' as const;

export const FACTUAL_REVIEW_CONTRACT_VERSION = 'ai7.factual-review/1' as const;

export const FACTUAL_REVIEW_TASK_GOAL = '对当前书稿执行事实核查，逐单元列出可核查断言并精确定位其引文，形成结果集修订版。' as const;

export const FACTUAL_REVIEW_EXPECTED_OUTCOME = '事实核查结果集修订版（事实核查契约 v1）' as const;

/**
 * The factual kind's two Task modes: the whole manuscript, or one explicitly selected block range.
 * `range` is admitted by the durable schema (revision 20) and carries its fixed goal; the Task surface
 * that offers it arrives with S18b, so this slice prepares only `whole-manuscript`.
 */
export type FactualReviewTaskMode = 'whole-manuscript' | 'range';

export const FACTUAL_REVIEW_TASK_MODES: readonly FactualReviewTaskMode[] = ['whole-manuscript', 'range'];

export const FACTUAL_REVIEW_MODE_GOALS = {
  'whole-manuscript': FACTUAL_REVIEW_TASK_GOAL,
  range: '对所选内容块范围执行事实核查，逐单元列出可核查断言并精确定位其引文，形成结果集修订版。',
} as const satisfies Record<FactualReviewTaskMode, string>;

export type FactualReviewGoal = (typeof FACTUAL_REVIEW_MODE_GOALS)[FactualReviewTaskMode];

export const FACTUAL_REVIEW_MODE_LABELS = {
  'whole-manuscript': '全书事实核查',
  range: '所选范围事实核查',
} as const satisfies Record<FactualReviewTaskMode, string>;

export const FACTUAL_REVIEW_MODE_MEANINGS = {
  'whole-manuscript': '对固定的任务输入修订版派生覆盖清单并逐单元执行事实核查契约 v1，列出可核查断言并按内容块文本确定性校验每条引文。',
  range: '仅对所选内容块范围内的分析单元执行事实核查契约 v1，其余单元不进入本次运行。',
} as const satisfies Record<FactualReviewTaskMode, string>;

/**
 * AI7 初评 (Issue #429, plan slice S81b1; V2-UX-EVAL-001, EVAL-005 to EVAL-007): the evaluation kind, on the same real path
 * as the others, read under its own exact-versioned contract `ai7.evaluation/1`. Each Analysis Unit is read for what bears on
 * each scored item of the house Evaluation Profile, every observation citing the blocks it rests on; one book-level synthesis
 * then scores each item in half points within its 满分, with a comment, and states the strengths, the weaknesses, a next step
 * and the conclusion it would suggest. The scores are AI7's draft beside the editor's; the record keeps the editor's.
 */
export const INITIAL_EVALUATION_KIND = 'evaluation' as const;

export const INITIAL_EVALUATION_CONTRACT_VERSION = 'ai7.evaluation/1' as const;

export const INITIAL_EVALUATION_EXPECTED_OUTCOME = 'AI7 初评结果集修订版（评估契约 v1）' as const;

/** The first 初评 of a Book, and every later one: the whole manuscript read again, nothing carried over. */
export type InitialEvaluationTaskMode = 'evaluation-first' | 'evaluation-again';

export const INITIAL_EVALUATION_TASK_MODES: readonly InitialEvaluationTaskMode[] = ['evaluation-first', 'evaluation-again'];

export const INITIAL_EVALUATION_UPDATE_MODES: readonly InitialEvaluationTaskMode[] = ['evaluation-again'];

export const INITIAL_EVALUATION_MODE_GOALS = {
  'evaluation-first': '按本社评估方案对当前书稿做 AI7 初评：逐单元记下各评分项的依据并引用内容块，再就全书给出各项初评分数与评语，形成结果集修订版。',
  'evaluation-again': '重新做 AI7 初评：按当前覆盖清单重读每个分析单元，不沿用以前的结果，就全书重新给出各项初评分数与评语，追加一个结果集修订版。',
} as const satisfies Record<InitialEvaluationTaskMode, string>;

export type InitialEvaluationGoal = (typeof INITIAL_EVALUATION_MODE_GOALS)[InitialEvaluationTaskMode];

export const INITIAL_EVALUATION_MODE_LABELS = {
  'evaluation-first': 'AI7 初评',
  'evaluation-again': '重新初评',
} as const satisfies Record<InitialEvaluationTaskMode, string>;

export const INITIAL_EVALUATION_MODE_MEANINGS = {
  'evaluation-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行评估契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'evaluation-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<InitialEvaluationTaskMode, string>;

/**
 * 审稿意见 (Issue #429, plan slice S81c; V2-UX-EVAL-013; editor-surfaces §5): the reader's report kind, on the same real path
 * as the others, read under its own exact-versioned contract `ai7.readers-report/1`. It is drafted from one finalized
 * Evaluation Record under one of the two V1 templates: each Analysis Unit is read for the passages the report can point to —
 * what bears out a strength, shows a problem, or where a revision applies — each citing its blocks; one book-level synthesis
 * then writes the five sections from the record and those passages. The draft is an Editorial Artifact the editor edits;
 * nothing of it is delivered or sent.
 */
export const READERS_REPORT_KIND = 'readers-report' as const;

export const READERS_REPORT_CONTRACT_VERSION = 'ai7.readers-report/1' as const;

export const READERS_REPORT_EXPECTED_OUTCOME = '审稿意见草稿结果集修订版（审稿意见契约 v1）' as const;

/** The first draft of a Book's 审稿意见, and every later one: the whole manuscript read again, nothing carried over. */
export type ReadersReportTaskMode = 'readers-report-first' | 'readers-report-again';

export const READERS_REPORT_TASK_MODES: readonly ReadersReportTaskMode[] = ['readers-report-first', 'readers-report-again'];

export const READERS_REPORT_UPDATE_MODES: readonly ReadersReportTaskMode[] = ['readers-report-again'];

export const READERS_REPORT_MODE_GOALS = {
  'readers-report-first': '从定稿的评估记录起草审稿意见：逐单元找出可以引用的段落并引用内容块，再按所选模板写出总体评价、主要优点、主要问题、修改建议与结论，形成结果集修订版。',
  'readers-report-again': '重新起草审稿意见：按当前覆盖清单重读每个分析单元，不沿用以前的结果，按所选模板重新写出五个部分，追加一个结果集修订版。',
} as const satisfies Record<ReadersReportTaskMode, string>;

export type ReadersReportGoal = (typeof READERS_REPORT_MODE_GOALS)[ReadersReportTaskMode];

export const READERS_REPORT_MODE_LABELS = {
  'readers-report-first': '起草审稿意见',
  'readers-report-again': '重新起草审稿意见',
} as const satisfies Record<ReadersReportTaskMode, string>;

export const READERS_REPORT_MODE_MEANINGS = {
  'readers-report-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行审稿意见契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'readers-report-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<ReadersReportTaskMode, string>;

/** The two V1 templates (EVAL-013): for the author, or for the editorial board and its topic meeting. */
export type ReadersReportTemplate = 'author' | 'editorial';

export const READERS_REPORT_TEMPLATES: readonly ReadersReportTemplate[] = ['author', 'editorial'];

export const READERS_REPORT_TEMPLATE_LABELS: Readonly<Record<ReadersReportTemplate, string>> = {
  author: '给作者的修改意见',
  editorial: '给编辑部 / 选题会的审读报告',
};

/** The five sections every 审稿意见 is structured in (EVAL-013), in their order. */
export type ReadersReportSectionId = 'overall' | 'strengths' | 'problems' | 'suggestions' | 'conclusion';

export const READERS_REPORT_SECTIONS: readonly ReadersReportSectionId[] = ['overall', 'strengths', 'problems', 'suggestions', 'conclusion'];

export const READERS_REPORT_SECTION_LABELS: Readonly<Record<ReadersReportSectionId, string>> = {
  overall: '总体评价',
  strengths: '主要优点',
  problems: '主要问题',
  suggestions: '修改建议',
  conclusion: '结论',
};

/**
 * What the plan says when the house holds no 审稿意见 among its 范例 (the Owner's answer of 2026-10-07): the draft is written
 * without one, and the plan says so.
 */
export const READERS_REPORT_NO_EXEMPLAR = '本社暂无审稿意见范例，本次不参考范例' as const;

/** Under a live scope no Provider Processing policy names 审稿意见 yet: nothing is prepared or started there. */
export const READERS_REPORT_LIVE_UNAVAILABLE =
  '审稿意见暂不可用：当前的模型处理策略没有写明审稿意见可以发送给模型，在这个运行范围下不能准备或开始起草。' as const;

/**
 * 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008): the evaluation rewrite kind, on the same real path as the
 * others, read under its own exact-versioned contract `ai7.evaluation-rewrite/1`. It is asked of one version begun from AI7's
 * 初评 at one saved entry, once the editor's scores depart from AI7's: each Analysis Unit is read for what bears out the
 * editor's score of each item, citing its blocks; one book-level synthesis then rewrites each scored item's 评语 and the 总评
 * to the editor's scores, reasons and comments. It never writes a number: the result is a proposal the editor 采用 or 放弃,
 * and only 采用 records it — as a new entry of the version, every score as the editor left it.
 */
export const EVALUATION_REWRITE_KIND = 'evaluation-rewrite' as const;

export const EVALUATION_REWRITE_CONTRACT_VERSION = 'ai7.evaluation-rewrite/1' as const;

export const EVALUATION_REWRITE_EXPECTED_OUTCOME = '按编辑评分重写的评语结果集修订版（评语重写契约 v1）' as const;

/** The first rewrite of a Book's 评语, and every later one: the whole manuscript read again, nothing carried over. */
export type EvaluationRewriteTaskMode = 'evaluation-rewrite-first' | 'evaluation-rewrite-again';

export const EVALUATION_REWRITE_TASK_MODES: readonly EvaluationRewriteTaskMode[] = ['evaluation-rewrite-first', 'evaluation-rewrite-again'];

export const EVALUATION_REWRITE_UPDATE_MODES: readonly EvaluationRewriteTaskMode[] = ['evaluation-rewrite-again'];

export const EVALUATION_REWRITE_MODE_GOALS = {
  'evaluation-rewrite-first': '按编辑的评分重写评语：逐单元找出能说明编辑所给分数的依据并引用内容块，再把各评分项的评语与总评改写得与编辑的分数一致，不改任何分数，形成结果集修订版。',
  'evaluation-rewrite-again': '再次按编辑的评分重写评语：按当前覆盖清单重读每个分析单元，不沿用以前的结果，重新改写各评分项的评语与总评，不改任何分数，追加一个结果集修订版。',
} as const satisfies Record<EvaluationRewriteTaskMode, string>;

export type EvaluationRewriteGoal = (typeof EVALUATION_REWRITE_MODE_GOALS)[EvaluationRewriteTaskMode];

export const EVALUATION_REWRITE_MODE_LABELS = {
  'evaluation-rewrite-first': '按我的评分重写评语',
  'evaluation-rewrite-again': '再次按我的评分重写评语',
} as const satisfies Record<EvaluationRewriteTaskMode, string>;

export const EVALUATION_REWRITE_MODE_MEANINGS = {
  'evaluation-rewrite-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行评语重写契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'evaluation-rewrite-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<EvaluationRewriteTaskMode, string>;

/** Under a live scope no Provider Processing policy names the rewrite yet: nothing is prepared or started there. */
export const EVALUATION_REWRITE_LIVE_UNAVAILABLE =
  '按我的评分重写评语暂不可用：当前的模型处理策略没有写明评语重写可以发送给模型，在这个运行范围下不能准备或开始。' as const;

/**
 * 写作任务 (Issue #432, plan slice S84a; V2-UX-DELIV-007, KB-004; editor-surfaces §9 新建文档 · 写作任务): the writing kind, on
 * the same real path as the others, read under its own exact-versioned contract `ai7.writing/1`. It drafts one Production
 * Document of a house type: each Analysis Unit is read for the passages the document can draw on — a highlight, a character,
 * a theme or background — each citing its blocks; one book-level synthesis then writes the document's title and sections from
 * those passages, the Book's metadata, its synopsis and characters, its 定稿 evaluation's conclusion and marketing points, the
 * house's 范例 of the type — referenced, never copied — and the audience, channel and requirements the editor wrote. The draft
 * is an Editorial Artifact in the document's 起草 phase; nothing of it is delivered or sent.
 */
export const WRITING_KIND = 'writing' as const;

export const WRITING_CONTRACT_VERSION = 'ai7.writing/1' as const;

export const WRITING_EXPECTED_OUTCOME = '生产文档草稿结果集修订版（写作契约 v1）' as const;

/** The first writing Task of a Book, and every later one, of whatever type: the whole manuscript read again, nothing carried over. */
export type WritingTaskMode = 'writing-first' | 'writing-again';

export const WRITING_TASK_MODES: readonly WritingTaskMode[] = ['writing-first', 'writing-again'];

export const WRITING_UPDATE_MODES: readonly WritingTaskMode[] = ['writing-again'];

export const WRITING_MODE_GOALS = {
  'writing-first': '起草生产文档：逐单元找出文档可以取用的看点、人物与主题并引用内容块，再依据所列参考材料与编辑写的受众、渠道和要求写出文档的标题与各部分，范例只作参照，形成结果集修订版。',
  'writing-again': '再次起草生产文档：按当前覆盖清单重读每个分析单元，不沿用以前的结果，依据所列参考材料重新写出文档的标题与各部分，范例只作参照，追加一个结果集修订版。',
} as const satisfies Record<WritingTaskMode, string>;

export type WritingGoal = (typeof WRITING_MODE_GOALS)[WritingTaskMode];

export const WRITING_MODE_LABELS = {
  'writing-first': '起草文档',
  'writing-again': '再次起草文档',
} as const satisfies Record<WritingTaskMode, string>;

export const WRITING_MODE_MEANINGS = {
  'writing-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行写作契约 v1，再做一次全书综合，形成首个结果集修订版。',
  'writing-again': '绕过全部既有单元结果，按当前覆盖清单重读每个分析单元并重新做全书综合，追加一个结果集修订版。',
} as const satisfies Record<WritingTaskMode, string>;

/** Under a live scope no Provider Processing policy names the writing kind yet: nothing is prepared or started there. */
export const WRITING_LIVE_UNAVAILABLE =
  '写作任务暂不可用：当前的模型处理策略没有写明写作任务可以发送给模型，在这个运行范围下不能准备或开始起草。' as const;

/** The editor's own words for the draft: who reads it, where it appears, and anything else it must do. */
export const MAX_WRITING_AUDIENCE_GRAPHEMES = 60;

export const MAX_WRITING_CHANNEL_GRAPHEMES = 60;

export const MAX_WRITING_REQUIREMENTS_GRAPHEMES = 300;

/**
 * 资料库 under a writing Task's 允许参考 (Issue #428; V2-UX-TASK-030, TASK-032, KB-007, KB-009): at most this many items, each at
 * most this many characters as its Material Index extracted them (the card's 「已提取 N 字」), and all of them together at most
 * this many. An item longer than one may be is offered disabled and refused with words, never cut: a plan references an item
 * whole or not at all.
 */
export const MAX_WRITING_MATERIALS = 4;

export const MAX_WRITING_MATERIAL_GRAPHEMES = 3_000;

export const MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES = 6_000;

/** At most this many 资料库 items are offered in 新建文档 · 写作任务, the latest arrivals first; the rest are counted. */
export const MAX_WRITING_MATERIAL_OFFERS = 50;

/**
 * Under a live scope no Provider Processing policy admits a 资料库 item: an item is the editor's own material, and developer-live
 * transmits only the Owner-designated Public SampleBooks (provider-processing-policy v7, ADR 0065; since v24 the five of ADR 0043 and ADR 0091). A plan that lists one is
 * never prepared or started there.
 */
export const WRITING_MATERIAL_LIVE_UNAVAILABLE =
  '资料库资料不能列进这个运行范围的写作计划：资料是编辑自己收集的材料，当前的模型处理策略只允许发送本社指定的公开样书，不能把资料库的文字发送给模型。' as const;

/**
 * The review-category kind family (Issue #417, plan slice S69): one analysis kind per Review Category,
 * `editorial-review/<categoryId>`, all read under the one exact-versioned contract
 * `ai7.editorial-review/1`. The categories themselves are configuration (V2-UX-REV-002: a house may
 * add one), so nothing here — and no durable CHECK — names a category: the family is admitted by the
 * shape of its kind identity, and the category's identity, label, guideline clauses and procedure are
 * frozen into each Task's prompt contract instead.
 */
export const EDITORIAL_REVIEW_KIND_PREFIX = 'editorial-review/' as const;

export const EDITORIAL_REVIEW_CONTRACT_VERSION = 'ai7.editorial-review/2' as const;

export type ReviewCategoryKindId = `${typeof EDITORIAL_REVIEW_KIND_PREFIX}${string}`;

/** A category identity: lower-case words joined by single hyphens, as the built-in nine are spelled. */
export const REVIEW_CATEGORY_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export const MAX_REVIEW_CATEGORY_ID_LENGTH = 48;

export function isReviewCategoryId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_REVIEW_CATEGORY_ID_LENGTH && REVIEW_CATEGORY_ID_PATTERN.test(value);
}

export function reviewCategoryKindId(categoryId: string): ReviewCategoryKindId {
  if (!isReviewCategoryId(categoryId)) throw new Error('REVIEW_CATEGORY_ID_INVALID');
  return `${EDITORIAL_REVIEW_KIND_PREFIX}${categoryId}`;
}

/** The category a kind identity of the family names; `null` for every other kind and for a malformed one. */
export function reviewCategoryIdOfKind(kind: unknown): string | null {
  if (typeof kind !== 'string' || !kind.startsWith(EDITORIAL_REVIEW_KIND_PREFIX)) return null;
  const categoryId = kind.slice(EDITORIAL_REVIEW_KIND_PREFIX.length);
  return isReviewCategoryId(categoryId) ? categoryId : null;
}

export function isReviewCategoryKindId(kind: unknown): kind is ReviewCategoryKindId {
  return reviewCategoryIdOfKind(kind) !== null;
}

/**
 * The family's five Task modes. Two start a category's Result Set — the whole manuscript, or one
 * explicitly selected block range with every other unit left unreviewed — and three append to it:
 * again over the whole manuscript, only what changed since the predecessor, or one selected range.
 * A range review never reads a unit outside its range: chapter-by-chapter work must not need a
 * whole-book Run first, and 选章 must not silently send other chapters.
 */
export type ReviewCategoryInitialMode = 'review-first' | 'review-first-range';

export type ReviewCategoryUpdateMode = 'review-sync' | 'review-range' | 'review-again';

export type ReviewCategoryTaskMode = ReviewCategoryInitialMode | ReviewCategoryUpdateMode;

export const REVIEW_CATEGORY_TASK_MODES: readonly ReviewCategoryTaskMode[] =
  ['review-first', 'review-first-range', 'review-again', 'review-sync', 'review-range'];

export const REVIEW_CATEGORY_UPDATE_MODES: readonly ReviewCategoryUpdateMode[] = ['review-sync', 'review-range', 'review-again'];

export const REVIEW_CATEGORY_MODE_LABELS = {
  'review-first': '全书审阅',
  'review-first-range': '所选范围审阅',
  'review-again': '全书重新审阅',
  'review-sync': '只审改动过的章',
  'review-range': '所选范围重新审阅',
} as const satisfies Record<ReviewCategoryTaskMode, string>;

export const REVIEW_CATEGORY_MODE_MEANINGS = {
  'review-first': '对固定的任务输入修订版派生覆盖清单并逐单元执行编辑审阅契约 v1，列出该类别的发现并按内容块文本确定性定位每条引文，形成首个结果集修订版。',
  'review-first-range': '仅对所选内容块范围及其重叠闭包内的分析单元执行编辑审阅契约 v1；其余单元不进入本次运行，在结果集修订版中记为“不在本次审阅范围内”。',
  'review-again': '绕过全部既有单元结果，按当前覆盖清单重审每个分析单元，即使清单与前一修订版完全相同也不复用任何单元。',
  'review-sync': '复用与前一修订版内容一致的已审单元，仅重审内容改动过的单元；此前未审且内容未变的单元保持未审。',
  'review-range': '重审所选内容块范围及其重叠闭包内的单元，其余内容一致的已审单元按血缘复用；范围外没有可复用结果的单元不进入本次运行，记为“不在本次审阅范围内”。',
} as const satisfies Record<ReviewCategoryTaskMode, string>;

/**
 * The fixed goal text of one mode of one category. It is derived from the category's label and the
 * mode alone, so the same category and mode always carry the same goal; the durable schema bounds
 * its length and the ledger checks the text itself (`ANALYSIS_GOAL_INVALID`).
 */
export type ReviewCategoryGoal = `${string}「${string}」${string}`;

export const MAX_REVIEW_CATEGORY_GOAL_LENGTH = 400;

/**
 * The longest goal any Task Intent holds, in characters (Issue #423, slice 7a): a Task Intent Draft's sentence — which a promoted
 * Task keeps as its goal — and every kind's own goal. Counted in code points, so it never holds more than as many graphemes.
 */
export const MAX_TASK_INTENT_GOAL_LENGTH = 400;

export function reviewCategoryModeGoal(label: string, mode: ReviewCategoryTaskMode): ReviewCategoryGoal {
  switch (mode) {
    case 'review-first':
      return `对当前书稿执行「${label}」审阅，逐单元列出发现并精确定位其引文，形成结果集修订版。`;
    case 'review-first-range':
      return `对所选内容块范围执行「${label}」审阅，逐单元列出发现并精确定位其引文，其余单元保持未审，形成结果集修订版。`;
    case 'review-again':
      return `重新执行「${label}」全书审阅：绕过全部既有单元结果，按当前覆盖清单重审每个分析单元，追加一个结果集修订版。`;
    case 'review-sync':
      return `将「${label}」审阅同步到当前稿件：复用内容一致的已审单元，仅重审改动过的单元，追加一个结果集修订版。`;
    case 'review-range':
      return `重新审阅所选范围的「${label}」：重审所选内容块范围及其重叠闭包，复用其余已审单元，追加一个结果集修订版。`;
  }
}

export function reviewCategoryExpectedOutcome(label: string): string {
  return `「${label}」审阅结果集修订版（编辑审阅契约 v1）`;
}

/**
 * 自定义分析维度 (Issue #922, wave 10 slice 7f; ADR 0090 item 4): an AI7-owned document the editor writes in 知识库 › 工序与规则 —
 * a title that is only a label, one bounded per-unit question template, and the answer schema and Authority Ceiling AI7 fixes — run
 * as the analysis kind family `custom-analysis/<dimension-id>` under the one contract `ai7.custom-analysis/1`. It is not a DSH
 * Skill and carries no prompt of its own beyond the template: AI7's framing around it is fixed. Each dimension is its own kind,
 * so each keeps its own Result Set (ANALYSIS-009), and its Tasks take the baseline's four modes.
 */
export const CUSTOM_ANALYSIS_KIND_PREFIX = 'custom-analysis/' as const;

export const CUSTOM_ANALYSIS_CONTRACT_VERSION = 'ai7.custom-analysis/1' as const;

export const CUSTOM_ANALYSIS_DIMENSION_SCHEMA = 'ai7.custom-analysis-dimension/1' as const;

export type CustomAnalysisKindId = `${typeof CUSTOM_ANALYSIS_KIND_PREFIX}${string}`;

/** A dimension identity is a lower-case UUID, which the durable kind GLOB `custom-analysis/[a-z0-9-]*` admits. */
export const CUSTOM_ANALYSIS_DIMENSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const MAX_CUSTOM_ANALYSIS_TITLE_GRAPHEMES = 40;

/** The template bound is the Provider Processing v22/v23 term `EDITOR_AUTHORED_QUESTION_TEMPLATE_MAX_GRAPHEMES` states. */
export const MAX_CUSTOM_ANALYSIS_TEMPLATE_GRAPHEMES = 400;

export const MAX_CUSTOM_ANALYSIS_ANSWER_GRAPHEMES = 300;

export const MAX_CUSTOM_ANALYSIS_QUOTE_GRAPHEMES = 80;

export const MAX_CUSTOM_ANALYSIS_CONFIDENCE_NOTE_GRAPHEMES = 120;

/** At most this many answer rows one unit may return; more is a refused unit result, never a cut. */
export const MAX_CUSTOM_ANALYSIS_ROWS_PER_UNIT = 12;

/** The one placeholder a template may carry: where the unit's text stands in the question. */
export const CUSTOM_ANALYSIS_UNIT_PLACEHOLDER = '{本单元}' as const;

/** At most this many dimensions, versions of one dimension, and answer rows of one revision a projection lists. */
export const MAX_CUSTOM_ANALYSIS_DIMENSIONS_SHOWN = 40;

export const MAX_CUSTOM_ANALYSIS_VERSIONS_SHOWN = 12;

export const MAX_CUSTOM_ANALYSIS_ROWS_SHOWN = 120;

export function isCustomAnalysisDimensionId(value: unknown): value is string {
  return typeof value === 'string' && CUSTOM_ANALYSIS_DIMENSION_ID_PATTERN.test(value);
}

export function customAnalysisKindId(dimensionId: string): CustomAnalysisKindId {
  if (!isCustomAnalysisDimensionId(dimensionId)) throw new Error('CUSTOM_ANALYSIS_DIMENSION_ID_INVALID');
  return `${CUSTOM_ANALYSIS_KIND_PREFIX}${dimensionId}`;
}

/** The dimension a kind identity of the family names; `null` for every other kind and for a malformed one. */
export function customAnalysisDimensionIdOfKind(kind: unknown): string | null {
  if (typeof kind !== 'string' || !kind.startsWith(CUSTOM_ANALYSIS_KIND_PREFIX)) return null;
  const dimensionId = kind.slice(CUSTOM_ANALYSIS_KIND_PREFIX.length);
  return isCustomAnalysisDimensionId(dimensionId) ? dimensionId : null;
}

export function isCustomAnalysisKindId(kind: unknown): kind is CustomAnalysisKindId {
  return customAnalysisDimensionIdOfKind(kind) !== null;
}

/** A kind's mode goal stays stable across document versions; the plan separately names its exact dimension version and title. */
export type CustomAnalysisGoal = `自定义分析：${string}`;

export function customAnalysisModeGoal(mode: BaselineAnalysisTaskMode): CustomAnalysisGoal {
  switch (mode) {
    case 'first-baseline':
      return '自定义分析：逐单元回答该维度的提问并定位所依据的原文，形成结果集修订版。';
    case 'sync-current':
      return '自定义分析：同步到当前稿件，复用内容一致的单元，仅重新回答改动过的单元，追加一个结果集修订版。';
    case 'reanalyze-range':
      return '自定义分析：重新回答所选范围及其重叠闭包，复用其余单元，追加一个结果集修订版。';
    case 'reanalyze-book':
      return '自定义分析：绕过全部既有单元结果，逐单元重新回答全书，追加一个结果集修订版。';
  }
}

export function customAnalysisExpectedOutcome(title: string): string {
  return `自定义分析「${title}」结果集修订版（自定义分析契约 v1）`;
}

/** The AI7-owned dimension document, exactly as one version freezes it and its digest covers it. */
export interface CustomAnalysisDimensionDocument {
  schema: typeof CUSTOM_ANALYSIS_DIMENSION_SCHEMA;
  /** The editor's label for the dimension; shown in AI7 and never sent to a model service. */
  title: string;
  /** The editor's per-unit question, bounded, carrying no manuscript text; `{本单元}` at most marks where the unit stands. */
  questionTemplate: string;
  /** The answer every unit returns, fixed by AI7 (ADR 0090 item 4): the editor cannot change it. */
  answerSchema: {
    unitResultSchema: 'ai7.custom-analysis.unit-result/1';
    row: { answerMaxGraphemes: 300; anchor: 'block-ordinal-and-verbatim-quote'; quoteMaxGraphemes: 80; confidenceNoteMaxGraphemes: 120; score: 'never' };
    maxRowsPerUnit: 12;
  };
  /** What a Run of the dimension may do, fixed by AI7: read the current Book's run source, change nothing, call no tool, synthesize nothing across units. */
  authorityCeiling: { runSourceScope: 'current-book'; mutation: 'none'; platformTools: 'none'; localTools: 'none'; crossUnitSynthesis: 'none' };
}

export type CustomAnalysisDimensionState = 'pending-validation' | 'enabled' | 'stopped';

export const CUSTOM_ANALYSIS_DIMENSION_STATE_LABELS = {
  'pending-validation': '待验证',
  enabled: '已启用',
  stopped: '已停用',
} as const satisfies Record<CustomAnalysisDimensionState, string>;

export interface CustomAnalysisDimensionVersionProjection {
  versionId: string;
  version: number;
  title: string;
  questionTemplate: string;
  documentDigest: string;
  /** The version this one supersedes; `null` for version 1. */
  supersedes: null | { versionId: string; version: number };
  state: CustomAnalysisDimensionState;
  stateLabel: string;
  createdAt: string;
  stateRecordedAt: string;
  /** How many Tasks of any Book were prepared under this exact version; historical Runs keep naming it after 停用. */
  taskCount: number;
}

/** One answer row of one unit as the reducer kept it: the model's answer and the anchor the service itself located. */
export interface CustomAnalysisRowProjection {
  rowId: string;
  unitOrdinal: number;
  answer: string;
  confidenceNote: string;
  /** The block the model named, by its position in the unit message, and the quotation it gave. */
  blockOrdinal: number;
  quote: string;
  /** Where the quotation stands, located deterministically in that block; `null` when it was not found exactly once. */
  sourceRange: null | FactualSourceRangeProjection;
  anchorState: 'located' | 'not-found' | 'ambiguous';
}

/** The latest Result Set Revision of one dimension on one Book, as ②A's 自定义 tab reads it (ANALYSIS-001, ANALYSIS-009). */
export interface CustomAnalysisRevisionSummaryProjection {
  revisionId: string;
  ordinal: number;
  createdAt: string;
  /** The dimension version the revision was read under. */
  dimensionVersion: { versionId: string; version: number; documentDigest: string };
  manuscriptRevisionLabel: string;
  coverage: AnalysisCoverageAxis;
  freshness: AnalysisFreshnessAxis;
  gaps: ReadonlyArray<{ unitOrdinal: number; code: AnalysisGapProjection['code']; reason: string }>;
  rowCounts: { units: number; rows: number; located: number; unlocated: number };
  rows: ReadonlyArray<CustomAnalysisRowProjection>;
  rowsTruncated: boolean;
}

export interface CustomAnalysisDimensionProjection {
  dimensionId: string;
  kind: CustomAnalysisKindId;
  /** The latest version's title. */
  title: string;
  /** The newest version in 已启用: what 运行 prepares under; `null` while none is. */
  enabledVersion: null | { versionId: string; version: number };
  versions: ReadonlyArray<CustomAnalysisDimensionVersionProjection>;
  versionsTruncated: boolean;
  /** Present when the projection was read for a Book: that Book's Task and latest revision of the dimension. */
  book: null | {
    taskState: null | { taskIntentId: string; state: BaselineAnalysisProjection['state']; stateLabel: string };
    latest: null | CustomAnalysisRevisionSummaryProjection;
    /** Why 运行 is unavailable here; `null` when it can prepare. */
    unavailableReason: string | null;
  };
}

export interface CustomAnalysisDimensionsProjection {
  bookId: string | null;
  dimensions: ReadonlyArray<CustomAnalysisDimensionProjection>;
  truncated: boolean;
  /** What AI7 fixes for every dimension, as the editor reads it beside the template. */
  fixed: { answerSchema: CustomAnalysisDimensionDocument['answerSchema']; authorityCeiling: CustomAnalysisDimensionDocument['authorityCeiling'] };
}

export interface SaveCustomAnalysisDimensionInput {
  /** `null` saves version 1 of a new dimension; otherwise the next version of that dimension, superseding its latest. */
  dimensionId: string | null;
  title: string;
  questionTemplate: string;
}

export interface PrepareCustomAnalysisInput {
  bookId: string;
  dimensionId: string;
  update: BaselineAnalysisUpdateRequest | null; /** 同类型重做 / 重新准备 / 重新确认 (Issue #931): on the version that Task froze. */ from?: CustomAnalysisPreparationFrom | null;
}
