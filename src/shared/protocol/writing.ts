import type { SalvagedModelResult } from './analysis.js';
import type { ProductionDocumentProjection } from './deliverables.js';
import type {
  ReviewCategoryResultSetRevisionProjection,
  ReviewCategoryRevisionUpdateProjection,
  ReviewCategoryUnitLineage,
  ReviewCategoryUpdateActionProjection,
  ReviewCategoryUpdateProjection,
  ReviewScopePlanCounts,
} from './review-runs.js';
import {
  WRITING_CONTRACT_VERSION,
  WRITING_EXPECTED_OUTCOME,
  WRITING_KIND,
  type WritingGoal,
  type WritingTaskMode,
} from './task-kinds.js';
import type { AnalysisGapProjection } from './analysis.js';
import type {
  BaselineAnalysisHistoryEntryProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisQuickStartProjection,
  BaselineAnalysisUpdateControlsProjection,
} from './analysis-plan.js';

// ---- 写作任务 (Issue #432, plan slice S84a; V2-UX-DELIV-007) ------------------------------------------------------------

/** What a passage the document can draw on is: a highlight to lead with, a character, or a theme or background. */
export type WritingPassageKind = 'highlight' | 'character' | 'theme';

export const WRITING_PASSAGE_KINDS: readonly WritingPassageKind[] = ['highlight', 'character', 'theme'];

/** One passage AI7 noted in one reading range for the document, with the blocks it rests on. */
export interface WritingPassageProjection {
  unitOrdinal: number;
  kind: WritingPassageKind;
  note: string;
  blockIds: ReadonlyArray<string>;
}

/** The document as the book-level synthesis wrote it: a title, then each section's heading and paragraphs. */
export interface WritingDraftWordsProjection {
  readonly usable?: boolean;
  readonly withheld?: ReadonlyArray<{ readonly section: number; readonly paragraph: number | null; readonly reason: string }>;
  title: string;
  sections: ReadonlyArray<{ heading: string; paragraphs: ReadonlyArray<string> }>;
}

/** The writing kind's own component of a Result Set Revision. */
export interface WritingResultProjection {
  /** The house type the draft is of, by its identity and its label. */
  typeId: string;
  typeLabel: string;
  /** The house's 范例 of the type the draft referenced, and what the plan said of them. */
  exemplars: { count: number; statement: string };
  passages: ReadonlyArray<WritingPassageProjection>;
  /** `null` when the book-level synthesis did not close — a refused copy of an exemplar included: AI7 then wrote no draft. */
  draft: WritingDraftWordsProjection | null;
  synthesis: { state: 'closed' | 'gap' | 'not-run'; reason: string | null };
}

export interface WritingRevisionUpdateProjection extends Omit<ReviewCategoryRevisionUpdateProjection, 'mode'> {
  mode: WritingTaskMode;
}

export type WritingUnitProjection =
  | {
      readonly salvaged?: SalvagedModelResult['salvaged'];
      unitOrdinal: number;
      state: 'closed';
      requestDigest: string;
      responseDigest: string;
      usage: { inputTokens: number; outputTokens: number } | null;
      lineage: ReviewCategoryUnitLineage;
      passages: ReadonlyArray<{ kind: WritingPassageKind; note: string; blockOrdinals: ReadonlyArray<number> }>;
    }
  | { unitOrdinal: number; state: 'gap'; requestDigest: string; lineage: ReviewCategoryUnitLineage; gap: AnalysisGapProjection };

export interface WritingResultSetRevisionProjection extends Omit<
  ReviewCategoryResultSetRevisionProjection,
  'contractVersion' | 'update' | 'category' | 'findings' | 'excluded' | 'findingCounts' | 'units'
> {
  contractVersion: typeof WRITING_CONTRACT_VERSION;
  update: WritingRevisionUpdateProjection;
  writing: WritingResultProjection;
  units: ReadonlyArray<WritingUnitProjection>;
}

export interface WritingUpdateProjection extends Omit<ReviewCategoryUpdateProjection, 'mode'> {
  mode: 'writing-again';
}

export interface WritingUpdateControlsProjection extends Omit<BaselineAnalysisUpdateControlsProjection, 'actions'> {
  actions: { 'writing-again': Omit<ReviewCategoryUpdateActionProjection, 'mode'> & { mode: 'writing-again' } };
}

export interface WritingHistoryEntryProjection extends Omit<BaselineAnalysisHistoryEntryProjection, 'mode' | 'contractVersion' | 'counts'> {
  mode: WritingTaskMode;
  contractVersion: typeof WRITING_CONTRACT_VERSION;
  counts: ReviewScopePlanCounts;
}

export interface WritingHistoryProjection {
  resultSetId: string;
  kind: typeof WRITING_KIND;
  createdAt: string;
  latestOrdinal: number;
  entries: ReadonlyArray<WritingHistoryEntryProjection>;
}

/** The writing kind's Task projection: a member of the analysis projection union, discriminated on `kind`. */
export interface WritingProjection extends Omit<
  BaselineAnalysisProjection,
  'kind' | 'contractVersion' | 'taskIntent' | 'executionPlan' | 'resultSetRevision' | 'update' | 'updateControls' | 'history' | 'inspectedRevision'
> {
  kind: typeof WRITING_KIND;
  contractVersion: typeof WRITING_CONTRACT_VERSION;
  taskIntent: null | {
    taskIntentId: string;
    goal: WritingGoal;
    expectedOutcome: typeof WRITING_EXPECTED_OUTCOME;
    createdAt: string;
    mode: WritingTaskMode;
    modeLabel: string;
  };
  executionPlan: null | {
    steps: ReadonlyArray<string>;
    effects: readonly [];
    unitCount: number;
    recomputedUnitCount?: number;
    reusedUnitCount?: number;
    unreviewedUnitCount?: number;
    reducerStages: readonly ['unit-validation', 'cross-unit-reduction', 'book-synthesis'];
    stopCondition: string;
  };
  resultSetRevision: null | WritingResultSetRevisionProjection;
  update: null | WritingUpdateProjection;
  updateControls: null | WritingUpdateControlsProjection;
  history: null | WritingHistoryProjection;
  inspectedRevision: null | { revision: WritingResultSetRevisionProjection; current: boolean; readOnly: true };
}

/** One house type in 新建文档 · 写作任务 (DELIV-007): whether a writing Task may draft it now, and what it would reference. */
export interface WritingTaskTypeProjection {
  readonly typeId: string;
  readonly label: string;
  /** 先看计划, or why this type cannot be drafted now — it has a document, it is 本书不做, or a Task is under way. */
  readonly prepare: { readonly allowed: true; readonly mode: WritingTaskMode } | { readonly allowed: false; readonly reason: string };
  /** The house's 范例 of this type from other Books a draft would reference — never copy — and the plan's line for them. */
  readonly exemplars: { readonly count: number; readonly statement: string };
  /** The newest drafted result of this type whose document has not been made yet: 打开草稿 makes it the document. */
  readonly drafted: null | { readonly revisionId: string; readonly createdAt: string };
  /**
   * 快速开始 of this type (Issue #432, S84b; S75 D5, D6): offered only while the Book has this type's writing 默认执行规则 in
   * force that still matches the Book's facts, this launch may use one, and the type can be drafted now. A rule covers only the
   * type of the plan it was set from (Commander ruling on #701: TASK-026, no widened source). One activation prepares the Task
   * exactly as 先看计划 does and starts it exactly as 开始任务 would, its authorization naming the rule version; whatever would
   * make the start differ from the rule stops at the plan with the reason. Without a rule it is shown, disabled, with why.
   */
  readonly quickStart: BaselineAnalysisQuickStartProjection;
}

/** One 资料库 item a writing Task may list under 允许参考 (Issue #428; TASK-030, TASK-032): the product record, never a path. */
export interface WritingTaskMaterialProjection {
  readonly materialId: string;
  readonly title: string;
  /** 已提取的字数, as the item's card states it: what the bound is counted in. */
  readonly characters: number;
  /** Whose the item is: this Book's, or the house's. */
  readonly scope: 'book' | 'house';
  /** Whether a plan may list it now; when not, why — it is longer than one item may be. */
  readonly selectable: boolean;
  readonly reason: string | null;
}

/**
 * 新建文档 · 写作任务 on ⑥ 交付物 (Issue #432, S84a; V2-UX-DELIV-007): the house types, what every draft references — each
 * line saying what is there or that there is none — the four consequence rows, the Book's latest writing Task, and for each
 * type whether 快速开始 starts one under that type's writing 默认执行规则 (S84b), or why not.
 */
export interface WritingTaskProjection {
  readonly bookId: string;
  /** Why no writing Task can be prepared at all — no manuscript, a live scope, or a damaged record — or `null`. */
  readonly unavailable: string | null;
  readonly references: {
    /** 梗概与人物: the Book's latest baseline analysis, or that it has none. */
    readonly synopsis: string;
    /** 评估结论与营销要点: the latest 定稿 version, or that there is none. */
    readonly evaluation: string;
    /** 图书信息: title, authors, editors and 书系 as they stand. */
    readonly book: string;
    /**
     * 资料库 (Issue #428): the items this Book's Tasks may list under 允许参考 whose Material Index extracted text — the editor
     * ticks the ones the draft references — each with whether it may be ticked or why not, and how many more were not listed.
     */
    readonly materials: {
      readonly statement: string;
      readonly items: ReadonlyArray<WritingTaskMaterialProjection>;
      readonly more: number;
    };
  };
  /** The four rows (editor-surfaces §9: 四行后果): 会读取 · 会发送 · 不会做 · 费用. */
  readonly consequences: { readonly read: string; readonly send: string; readonly notDo: string; readonly cost: string };
  readonly types: ReadonlyArray<WritingTaskTypeProjection>;
  /** The Book's latest writing Task, which the Task Drawer opens; `null` before the first is prepared. */
  readonly task: null | {
    readonly taskIntentId: string;
    readonly typeId: string;
    readonly typeLabel: string;
    readonly state: BaselineAnalysisProjection['state'];
    readonly label: string;
    /** Why the Task's settled Run wrote no draft — a copy of an exemplar refused, or a synthesis that did not close — or `null`. */
    readonly refusal: string | null;
    /** The Plan Envelope the Task froze — the exact plan a 快速开始 starts (S84b) — or `null` while none is frozen. */
    readonly planEnvelopeDigest: string | null;
  };
}

/** What one 快速开始 of a writing Task did: started it under the rule, or stopped at its plan with the reasons (S84b). */
export interface QuickStartWritingTaskResult {
  outcome: 'started' | 'fell-back';
  reasons: ReadonlyArray<string>;
  /** 新建文档 · 写作任务 as it stands after it. */
  projection: WritingTaskProjection;
}

/** 打开草稿's answer: the document the draft became, of its type, and 新建文档 · 写作任务 as it stands after it. */
export interface WritingDraftCreatedProjection {
  readonly writing: WritingTaskProjection;
  readonly typeId: string;
  readonly typeLabel: string;
  readonly document: ProductionDocumentProjection;
}
