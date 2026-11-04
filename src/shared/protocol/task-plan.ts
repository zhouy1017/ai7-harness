import type { TaskPlanCustomDimension } from './custom-analysis-redo.js';
import type { TaskPlanDefaultRuleProjection } from './series.js';
import type { EvidenceAssuranceLevel } from './factual-verification.js';
import type {
  BaselineAnalysisProjection,
  BaselineAnalysisUpdateRequest,
  MaterialPlanInputsProjection,
} from './analysis-plan.js';
import type { BaselineAnalysisGoal } from './task-kinds.js';
import type { RunBudgetCeilingState } from '../protocol.js';
import type { FrozenSeriesScope } from './review-runs.js';

// ---- The Task Drawer (Issue #418, plan slice S72; editor-surfaces §6 ③) ----------------------------------

/**
 * The Task kinds the Task Drawer shows a plan for: the three that hold a plan today (S72 D1) — J-03's
 * fixed task, the baseline analysis, and a Review Run. A kind with no ledger of its own arrives with the
 * slice that brings its ledger; nothing here is an authority record of its own. AI7's 初评 (Issue #429, S81b1) joins them
 * with its own ledger.
 */
export type TaskPlanKind = 'fixed-task' | 'baseline-analysis' | 'review-run' | 'initial-evaluation' | 'readers-report' | 'evaluation-rewrite' | 'writing';

export const TASK_PLAN_KINDS: readonly TaskPlanKind[] = [
  'fixed-task', 'baseline-analysis', 'review-run', 'initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing',
];

/** A step after the ranges whose sent request's result cannot be known (Issue #757): the reduction, a sample, the reflection. */
export type UnconfirmedStageId = 'cross-unit-reduction' | 'assurance-sampling' | 'run-report-reflection';

/**
 * 结果待确认 left by Runs that reached their Task Outcome (Issue #757): a kind that keeps no progress reads on past a range whose
 * request was sent and whose answer never came back whole, and any kind reads on past such a step. Each is listed until a later
 * Run of the kind reads it or the editor determines it — 保留为缺口, a Manual Outcome Resolution retained with its manual
 * evidence class, which sends nothing and leaves every gap as it is.
 */
export interface TaskPlanUnconfirmedProjection {
  /**
   * Each range by its ordinal in the latest revision that holds it, and, in a Review Run, its category; `earlierText` when that
   * revision read a manuscript revision other than the Book's latest, so the ordinal counts in the text as it was then.
   */
  ranges: ReadonlyArray<{ unitOrdinal: number; category: string | null; recordedAt: string; earlierText: boolean; rereadFailed?: boolean }>;
  /** Each step of the latest Run that reached its Task Outcome, and, in a Review Run, its category. */
  steps: ReadonlyArray<{ stage: UnconfirmedStageId; category: string | null; recordedAt: string }>;
  /** What 保留为缺口 settles: the service records exactly these, and refuses a list that changed since (`UNCONFIRMED_CHANGED`). */
  digest: string;
}

/** Which plan the drawer reads. The Book is always the route's; the renderer never names it. */
/**
 * The kinds whose 联网后开始任务 goes through `startTaskWhenOnline` (Issue #760, S74c): every kind with a plan and 开始任务 but the
 * baseline analysis, which keeps its own `startBaselineAnalysisWhenOnline` (Issue #502), and J-03's fixed Task, which only ever
 * records and never reaches a model service, so it is never offline (ADR 0055).
 */
export type StartWhenOnlineTaskKind = 'review-run' | 'initial-evaluation' | 'readers-report' | 'evaluation-rewrite' | 'writing';

export const START_WHEN_ONLINE_TASK_KINDS: readonly StartWhenOnlineTaskKind[] = ['review-run', 'initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing'];

export function isStartWhenOnlineTaskKind(kind: TaskPlanKind): kind is StartWhenOnlineTaskKind {
  return (START_WHEN_ONLINE_TASK_KINDS as readonly TaskPlanKind[]).includes(kind);
}

/**
 * 联网后开始任务 for one Task (Issue #760, S74c; AUTH-004, OFF-005): exactly the digests 开始任务 would bind — the plan envelope's
 * for a ledger Task (`planDigests` empty), every Task-backed category's for a Review Run (`planEnvelopeDigest` `null`).
 */
export interface StartTaskWhenOnlineInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  /** The Task Intent of a ledger Task; the Review Run of a review. */
  ref: string;
  planEnvelopeDigest: string | null;
  planDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>;
}

/** 取消 while a Task's Run waits to start (Issue #760; OFF-010): terminal, before anything is sent. */
export interface CancelWaitingTaskInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  ref: string;
}

export interface InspectTaskPlanInput {
  bookId: string;
  kind: TaskPlanKind;
  /**
   * The Task: its Task Intent for the fixed task and the baseline analysis, its Review Run for a review.
   * `null` reads the Book's current Task of the kind; a review is always named.
   */
  ref: string | null;
}

/** Controls use the same ledger Run and authorization for every planned task kind. */
export interface ControlTaskRunInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  ref: string;
  action: 'pause' | 'resume' | 'cancel';
}

export interface EditTaskPlanInput {
  bookId: string;
  kind: StartWhenOnlineTaskKind;
  ref: string;
  planEnvelopeDigest: string;
  removedSteps: ReadonlyArray<string>;
  disallowedAdaptations: ReadonlyArray<string>;
  askFirstAdaptations?: ReadonlyArray<string>;
  runBudgetCeiling?: { kind: 'tokens'; maxTotalTokens: number } | null;
  /** The factual-review Task's Evidence Assurance Level (Issue #901); left out keeps the version's own. */
  evidenceAssuranceLevel?: EvidenceAssuranceLevel;
}

/**
 * Where a plan stands, as the drawer's state pill says it (editor-surfaces §6 状态). `unconnected` is 模型未连接:
 * the plan's route sends to a model service whose credential is not ready (Issue #420, S74a). `offline` is 离线,
 * before authorization: the route reaches its model service over a network this device does not have now.
 * `waiting` is a Run in Connectivity Wait, whose label says what it waits for — 等待网络, 需要处理模型连接 or
 * 等待运行名额 (OFF-006) — and `cancelled` one the editor cancelled before it read anything (Issue #502).
 * `cancelling` is 正在取消: the editor cancelled a Run under way, which stops at the next unit boundary, and
 * `cancelled-after-start` the 已取消 of a Run cancelled after it began reading (Issue #422, CTRL-005). `pausing`,
 * `paused` and `resumable` are 正在暂停, 已暂停 and 任务已中断 · 可续行 (S76b; CTRL-001, CONT-014), and
 * `awaiting-clarification` 任务等待你的说明: the Run read what it could and waits for the editor's answer (S76d; CLAR-004).
 */
export type TaskPlanStateKey =
  | 'ready' | 'changed' | 'unconnected' | 'offline' | 'recorded' | 'blocked' | 'waiting' | 'running' | 'settled' | 'stopped'
  | 'cancelled' | 'cancelling' | 'cancelled-after-start' | 'pausing' | 'paused' | 'resumable' | 'awaiting-clarification' | 'budget-reached'
  | 'account-limit' | 'plan-moved'
  // 结果待确认 (Issue #51, S16c): the Run stopped on sent requests whose results cannot be known.
  | 'outcome-unknown'
  // 等待运行名额 (Issue #49, S14; CONC-007): authorized, and waiting on the governor for a place; nothing has begun.
  | 'queued';

/**
 * A started Run's controls in the drawer's bar and its activity above the plan (Issue #422, plan slice S76a;
 * V2-UX-AUTH-010, AUTH-011, CTRL-001 to CTRL-009, CONT-014, CONT-015). `取消任务` opens one inline Cancellation Impact
 * Summary, and only its confirmation records anything; `暂停` is one click (CTRL-001); a paused Run, or one AI7 stopped
 * under, offers `续行` once its revalidation holds. `改计划重做` is offered on a stopped Run (S76c) and waits, with its
 * reason, on one under way.
 */
export interface TaskPlanRunControlProjection {
  /** The one Run every control names (CTRL-009). */
  runRecordId: string;
  /** Number of durable Harness Execution Spans currently recorded for this Run. */
  executionSpanCount?: number;
  /** The editor-facing reason this Run stopped and may be resumed. */
  stopReason?: import('../protocol.js').ResumableStopReason;
  /** When that stop was recorded, used by the continuation note. */
  stopAt?: string;
  /** 正在取消: the editor's cancellation is recorded and the Run is stopping; nothing more is offered. */
  cancelling: boolean;
  /** 正在暂停: the editor's pause is recorded and the Run stops at the next unit boundary; nothing more is offered. */
  pausing: boolean;
  /** `reason` is `null` while 取消任务 is offered; `impact` is the Cancellation Impact Summary, one line each. */
  cancel: { reason: string | null; impact: ReadonlyArray<string> };
  /** `reason` is `null` while 暂停 is offered: a Run executing its units. */
  pause: { reason: string | null };
  /**
   * 续行 for a paused Run or one left 可续行: `reason` is `null` while its revalidation holds, else why it cannot go on
   * as it was authorized (CONT-016). `null` for a Run that is not stopped.
   */
  resume: { reason: string | null } | null;
  /** `reason` is `null` while 改计划重做 is offered — the plan's `redo` then says what it does. */
  redo: { reason: string | null };
  /**
   * The activity card's facts (AUTH-011; RUN-001 to 004, LIVE-001 to 003): the Run Liveness Signal the execution
   * owner reports, as ②A reads it. `null` when this service holds no execution of the Run.
   */
  activity: NonNullable<NonNullable<BaselineAnalysisProjection['run']>['progress']> | null;
  /** When the Run began executing its units; `null` before it did. */
  executingSince: string | null;
  /**
   * An update Run's counts (CTRL-004): the manuscript's reading ranges and how many of them the Run reuses from its
   * predecessor, so the activity card names a range among the whole manuscript and the Cancellation Impact Summary
   * keeps the reused ranges in view. `null` for a first baseline, which reads every range.
   */
  update: null | { manuscriptUnits: number; reusedUnits: number };
  /**
   * A stopped Run's continuation point (S76b): how many of the units it submits it has kept — `unitsSettled` is `null`
   * when that progress no longer reads back — and `null` while it runs. `pendingAnswerUnits` are the reading ranges whose
   * Clarification answer is recorded and not yet carried out (Issue #784): 续行 handles those first, then continues the unfinished work.
   */
  continuation: { unitsSettled: number | null; unitsTotal: number; pendingAnswerUnits: ReadonlyArray<number> } | null;
  /**
   * 模型服务账户限额 (Issue #51, S16b; V2-UX-MODEL-018): the provider's account limit stopped the Run — at the reading range it
   * refused, or `null` for the reduction or the sample after them — with the refusal as AI7 classified it; `续行` goes on
   * in the same Run once the condition clears. `null` for every other Run.
   */
  accountLimit: null | { unitOrdinal: number | null; condition: string };
  /**
   * 结果待确认 (Issue #51, S16c; V2-UX-CTRL-007, COPY-009, CONT-011, CONT-016): the stopped Run holds reading ranges whose requests
   * were sent and whose results cannot be known — each may have been processed and billed — kept as their own gaps that
   * nothing in this Run sends again. `stopped` is a Run that stopped 结果待确认 itself, which has no `续行`. `null` for every
   * Run that holds none, and while a Run executes.
   */
  outcomeUnknown: null | { units: ReadonlyArray<{ unitOrdinal: number; attempts: number }>; stopped: boolean };
}

/**
 * What the Task Drawer's authorization bar offers for one plan now (Issue #420, plan slice S74a;
 * editor-surfaces §6 常驻授权条, V2-UX-AUTH-001 to 007, MODEL-008, OFF-009):
 * - `ready`: one activation of 开始任务 records the exact Run Authorization and Run Record and hands the Run
 *   to the one execution slot (AUTH-004);
 * - `record-only`: J-03's fixed task — one activation records the Run, which never enters the scheduler
 *   (ADR 0055);
 * - `no-route`: no executable route is bound — one activation records the Run, which is blocked before
 *   dispatch;
 * - `needs-connection`: the plan's route sends to a model service and the credential it resolves is not
 *   ready — 开始任务 is disabled with that reason; this is never plan drift (OFF-009);
 * - `changed`: the plan's key content changed — 开始任务 is removed (AUTH-006); 重新确认计划 when `reconfirm`
 *   is set;
 * - `offline`: the plan's route reaches its model service over the network and this device has none now —
 *   联网后开始任务 records the exact Run Authorization and a Run that waits in Connectivity Wait until
 *   Reconnect Preflight admits it (AUTH-002, AUTH-004, OFF-004, OFF-005, Issue #502); a Review Run cannot wait
 *   yet, so its start is disabled with that reason;
 * - `started`: an authorization exists — the bar is the Run's state (AUTH-007).
 */
export type TaskPlanStartReadiness = 'ready' | 'record-only' | 'no-route' | 'needs-connection' | 'changed' | 'offline' | 'started' | 'unavailable';

/**
 * What one Reconnect Preflight did (Issue #502; OFF-007, OFF-008, OFF-009): each waiting Run is admitted to the
 * one execution slot when the model service can be reached and nothing material moved, blocked with its reason
 * when something material did, or left waiting — for the network, for the model connection, or for the slot.
 */
export interface ReconnectPreflightProjection {
  connectivity?: { classification: 'offline' | 'proxy-unreachable' | 'model-service-unreachable'; label: '离线' | '代理不可达' | '模型服务不可达' };
  admitted: number;
  blocked: number;
  waiting: number;
}

/** The authorization bar's facts, derived from the records the plan already reads: nothing here is written. */
export interface TaskPlanStartProjection {
  readiness: TaskPlanStartReadiness;
  /** Whether the plan's route sends to a model service, so starting it needs the credential that route resolves. */
  needsModelConnection: boolean;
  /**
   * The exact Plan Envelope digest one activation binds (ADR 0009, AUTH-005); `null` for a Review Run, which
   * binds one per category, and whenever 开始任务 is not offered.
   */
  planEnvelopeDigest: string | null;
  /** A Review Run's one approval: each Task-backed category's exact digest; empty for every other kind. */
  categoryDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>;
  /**
   * 重新确认计划: the preparation that yields the next plan version of the same Task Intent (V2-UX-PLAN-009);
   * `null` unless the plan changed and can be reconfirmed.
   */
  reconfirm: null | { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null };
  /**
   * Why this plan can never be started, with readiness `unavailable` (Issue #432 re-review): a writing Task whose 范例 is no
   * longer here. Absent or `null` for every other plan.
   */
  unavailableReason?: string | null;
}

/** One editorial business step and what it leaves behind (V2-UX-PLAN-003). */
export interface TaskPlanStepProjection {
  /** The step's identity in this plan, stable across versions, so an edit can name it (Issue #419). */
  id: string;
  label: string;
  result: string;
  /** Whether the editor may leave this step out (PLAN-011): only a step the Run can do without. */
  removable: boolean;
  /** Left out of this plan version at the editor's word. */
  removed: boolean;
}

/** One adaptation AI7 may make on its own during the Run (PLAN-004, PLAN-011), with whether the editor withdrew it. */
export interface TaskPlanAdaptationProjection {
  id: string;
  label: string;
  /** Whether the editor may withdraw it (= 不允许). */
  removable: boolean;
  /** Withdrawn from this plan version at the editor's word. */
  removed: boolean;
  /** Whether the editor may move it into 先问你 (Issue #422, S76d; PLAN-011). */
  movable: boolean;
  /** Moved into 先问你 in this plan version: the Run asks the editor before it makes it. */
  askFirst: boolean;
}

/**
 * The editable plan (Issue #419, plan slice S73; V2-UX-PLAN-011): whether the editor can change this plan now, and
 * the last change they made to it.
 */
export interface TaskPlanEditProjection {
  /** The plan takes edits now: a baseline analysis Task prepared and not yet started, with no key-content change pending. */
  editable: boolean;
  /** Why it does not, when it is a kind that could; `null` when editable, or for a kind that keeps no plan versions. */
  reason: string | null;
  /** The editor's last edit, which made the version shown: its version, time, and each change. */
  lastEdit: null | { ordinal: number; recordedAt: string; entries: ReadonlyArray<TaskPlanDriftEntryProjection> };
  /**
   * The envelope digest of the version shown, which 更新计划 edits; `null` when the plan takes no edit. It is the
   * edit's own: 模型未连接 or 离线 withholds 开始任务's digest, never this one.
   */
  planEnvelopeDigest: string | null;
  /**
   * 设置上限… (Issue #51, S16a; §6 ⑤, V2-UX-MODEL-013, MODEL-015): the Run Budget Ceiling this version freezes, and whether
   * the editor can set it here — `reason` says why not, on a plan that is not editable or whose launch sets the ceiling.
   * `null` for a kind whose plan takes no ceiling.
   */
  budget: null | { ceiling: RunBudgetCeilingState; settable: boolean; reason: string | null };
  /**
   * The Evidence Assurance Level selector of a factual-review Task (Issue #901; EASSURE-001, EASSURE-008): the level this
   * version freezes, each option with its consequence and, below a policy minimum, disabled with the concrete requirement.
   * Absent for every other kind.
   */
  assurance?: {
    level: EvidenceAssuranceLevel;
    settable: boolean;
    reason: string | null;
    options: ReadonlyArray<{ level: EvidenceAssuranceLevel; label: string; consequence: string; disabled: boolean; requirement: string | null }>;
  };
}

/**
 * One line of the concise diff of a plan whose key content changed (V2-UX-PLAN-009, PLAN-012). The words
 * are the drawer's own, derived from the field key the stored diff names — never the stored label, whose
 * bytes are part of an immutable record.
 */
export interface TaskPlanDriftEntryProjection {
  field: string;
  label: string;
  prior: string;
  proposed: string;
  /** `edited` for a line of the editor's own edit (Issue #419). */
  materiality: 'material' | 'derived' | 'edited';
}

/**
 * The plan of one Task as the Task Drawer shows it (V2-UX-PLAN-001 to 012, TASK-030, TASK-039/040,
 * LAYER-002, MODEL-013/014). It is a read of records that already exist, in the editor's words: no
 * envelope, row or digest is written or changed to produce it, and every exact identity it names is in
 * `technical`, unabridged. It states the plan and grants nothing (PLAN-007); `start` states what the
 * drawer's authorization bar offers, and only the bar's own activation records anything (Issue #420).
 */
export interface TaskPlanProjection {
  /** Transport-only pages; derivation and authority records remain complete. String cursors count Unicode code points. */
  listPages?: Readonly<Record<string, { shown: number; total: number; nextOrdinal: number | null; digest: string }>>;
  readonly seriesScopes?: ReadonlyArray<FrozenSeriesScope>;
  bookId: string; /** A 自定义分析维度 Task's dimension (Issue #931): its redo, 重新准备 and 重新确认 prepare on it, never the baseline. */ custom?: TaskPlanCustomDimension;
  kind: TaskPlanKind;
  /** The Task Intent or the Review Run this plan belongs to. */
  ref: string;
  state: { key: TaskPlanStateKey; label: string };
  /** The plan version shown; `null` for a kind that keeps no plan versions. */
  planVersion: number | null;
  goal: {
    sentence: string;
    chips: {
      book: string;
      /** The chapter headings the range holds, `第 a–b 段` when it holds none, `全书`, or the scope's own words. */
      position: string;
      /** Graphemes of the current plan version's range of the Task Input revision; `null` when the scope names no one range. */
      selectedGraphemes: number | null;
      /** The Task Input revision's label (`r2`). */
      taskInputRevision: string;
      procedure: string;
    };
    /** Preparing the Task saved its Task Input revision for acknowledged edits (TASK-039/040). */
    savedForEdits: boolean;
    /**
     * The Task Intent Draft this Task was prepared from with 准备计划 (Issue #423, slice 7a): its sentence, which the 目标块 shows
     * with 修改 back to the composer. Absent for every Task prepared otherwise.
     */
    draft?: { draftId: string; sentence: string };
  };
  /** 要处理 · 允许参考 · 可能发送 · 不会读, each stated apart (TASK-030). */
  scope: { process: string; reference: ReadonlyArray<string>; send: string; notRead: string };
  steps: ReadonlyArray<TaskPlanStepProjection>;
  /** Where the editor takes part (PLAN-005): during the Run, and afterwards. */
  participation: { during: string; after: string | null };
  service: {
    role: string;
    provider: string;
    /** The Provider decision (LAYER-002). */
    decision: string;
    send: string;
    /** The Outbound Data Category in the editor's words (LAYER-002). */
    sendCategory: string;
    /** 用量上限: what the Run may use at most, or that it uses nothing. */
    usage: string;
    /** Whether `usage` is a ceiling, which is labelled a ceiling and never a prediction. */
    usageIsCeiling: boolean;
    duration: string;
    /** The exact Run Budget Ceiling state (MODEL-013): `未设置任务预算上限` by default. */
    budgetCeiling: string;
    /** The Provider Account Limit, never a fabricated value (MODEL-014). */
    accountLimit: string;
  };
  outcomes: ReadonlyArray<string>;
  /** 不会做, split (editor-surfaces §10): what the editor cares about, and the technical statements. */
  notDo: { editorial: ReadonlyArray<string>; technical: ReadonlyArray<string> };
  /** The Plan Boundary Split in the editor's words (PLAN-004, PLAN-012). */
  boundary: { adaptable: ReadonlyArray<TaskPlanAdaptationProjection>; askFirst: ReadonlyArray<string> };
  /** Whether and how the editor can edit this plan (Issue #419). */
  edit: TaskPlanEditProjection;
  /** The plan's key content changed since it froze, and how that is settled; `null` while it stands. */
  drift: null | {
    reasons: ReadonlyArray<string>;
    entries: ReadonlyArray<TaskPlanDriftEntryProjection>;
    resolution: string;
  };
  /** Every exact identity of the plan (LAYER-001, LAYER-007), one step below the decision content. */
  technical: ReadonlyArray<{ key: string; label: string; value: string }>;
  /** The authorization bar: what 开始任务 does for this plan now, and exactly what it binds (Issue #420). */
  start: TaskPlanStartProjection;
  /** `设为快速开始默认…` and the rule that started the Task, when one did (Issue #421). */
  defaultRule: TaskPlanDefaultRuleProjection;
  /** A started Run's controls and activity (Issue #422); `null` while no Run of this Task is under way. */
  runControl: TaskPlanRunControlProjection | null;
  /** 改计划重做 while it can be made (Issue #422, S76c): on a stopped Run, or one cancelled after it began; else `null`. */
  redo: TaskPlanRedoProjection | null;
  /**
   * 结果待确认 after the Run that left it ended (Issue #51, S16c; CONT-011): the ranges this Task sends again whose earlier
   * request's result could not be known, and the Plan Preview's statement of it; `null` when there are none.
   */
  resend: null | { units: ReadonlyArray<number>; statement: string };
  /**
   * 结果待确认 a Run of this Task's kind left on this Book that reached its Task Outcome (Issue #757; ATTN-002, NOTIF-004,
   * CTRL-007): the ranges and steps whose sent requests' results cannot be known, which no later Run of the kind has read and
   * the editor has not kept as gaps (保留为缺口, 人工结果确认); `null` when there are none.
   */
  unconfirmed: TaskPlanUnconfirmedProjection | null;
  /** 重新准备 for a waiting Run whose plan moved before it could start (Issue #536); else `null`. */
  reprepare: TaskPlanReprepareProjection | null;
  /**
   * Why a waiting Run of a kind with no 重新准备 in the drawer never started (Issue #760, S74c; OFF-008): what moved, in
   * 需要重新确认计划's words. The kind's own surface prepares it again. Absent for every other plan.
   */
  planMovedReason?: string;
  /** What the Task's Run asked the editor (Issue #422, S76d; CLAR-001 to CLAR-007): open questions first; empty when none. */
  clarifications: ReadonlyArray<TaskPlanClarificationProjection>;
  /**
   * 已停止 · 预算已达上限 (Issue #51, S16a; V2-UX-MODEL-016, MODEL-017): the ceiling, what the Run used, and what it read
   * before the ceiling stopped it; `redo` is then 调整预算并重做. `null` for every other plan.
   */
  budgetStop: null | {
    maxTotalTokens: number;
    usedTokens: number;
    unitsSettled: number;
    unitsTotal: number;
    /** The launch set the ceiling (developer-live): only a launch with a higher one raises it, never the plan. */
    launchSetsCeiling: boolean;
  };
}

/** The answers a question about a safe retry can have (Issue #422, S76d; CLAR-006, INPUT-002). */
export type ClarificationOptionId = 'retry' | 'record-gap' | `model-option-${0 | 1 | 2 | 3}` | 'free-text' | 'no-answer';

/**
 * One Clarification Request of the Task's Run as the drawer's card shows it (Issue #422, S76d; V2-UX-CLAR-001 to
 * CLAR-007, INPUT-001 to INPUT-004): the question and why it is asked, what waits and what goes on, what happens after an
 * answer, the choices — none chosen, one 推荐 with its reason — and the note that may qualify one; once answered, the
 * answer as it was recorded. `unanswered` is a question whose Run ended before an answer came.
 */
export interface TaskPlanClarificationProjection {
  origin?: 'product' | 'model';
  freeTextAllowed?: boolean;
  taskIntentId?: string;
  requestId: string;
  unitOrdinal: number;
  planVersion: number;
  raisedAt: string;
  question: string;
  why: string;
  /** What the model service reported, in the Run's own words. */
  detail: string;
  /** 「该步骤等待说明 · 其他步骤仍在继续」 while other units go on; 「任务等待你的说明」 once nothing else can. */
  scope: string;
  after: string;
  options: ReadonlyArray<{ id: ClarificationOptionId; label: string; consequence: string; recommended: string | null }>;
  note: { label: string; hint: string; maxLength: number };
  state: 'open' | 'answered' | 'unanswered';
  answer: null | { optionId: ClarificationOptionId; label: string; note: string | null; answeredAt: string; line: string };
  /** Why the editor cannot answer now; `null` when they can. */
  answerable: { reason: string | null };
}

/**
 * 改计划重做 (Issue #422, plan slice S76c; V2-UX-AUTH-010, CONT-013): a new Task under a plan the editor may change first,
 * carrying what the Run read. A Run still stopped is cancelled first — `summary` says, before anything is recorded, what
 * stops, what is kept and what the new Task does — and a Run already cancelled is redone at once (`summary` empty).
 * `prepare` is the exact preparation the new Task takes once the Run reads 已取消.
 */
/**
 * 需要重新确认计划 (Issue #536; V2-UX-OFF-008): a Run that waited in Connectivity Wait and was blocked because the plan its
 * authorization bound moved meanwhile. A Task Intent holds one Run, so the Plan Revision and the renewed Run Authorization
 * OFF-008 routes through are a new preparation of the same goal and range: `prepare` is that exact request, and nothing
 * starts until the editor reads the new plan and starts it. `reason` names what moved.
 */
export interface TaskPlanReprepareProjection {
  reason: string;
  prepare: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null };
}

export interface TaskPlanRedoProjection {
  summary: ReadonlyArray<string>;
  prepare: { goal: BaselineAnalysisGoal; update: BaselineAnalysisUpdateRequest | null; redoOf: string }
    | { kind: StartWhenOnlineTaskKind; ref: string; redoOf: string };
}

/**
 * 默认执行规则 (Issue #421, plan slice S75; V2-UX-TASK-017, TASK-019, TASK-020, TASK-028, AUTH-009): the task
 * patterns a rule may cover — the baseline analysis's two updates of the whole Book, which ask for no range, and
 * (Issue #432, S84b) the writing Task of 新建文档 of one house type, `writing:<typeId>`: a rule covers only the type of the
 * plan it was set from (Commander ruling on #701: TASK-026, no widened source), while the editor's audience, channel and
 * requirements are each Task's own, as a range is.
 */
export type BaselineDefaultExecutionRulePattern = 'sync-current' | 'reanalyze-book';

export type WritingDefaultExecutionRulePattern = `writing:${string}`;

export type ReviewDefaultExecutionRulePattern = `review:${string}`;

export type DefaultExecutionRulePattern = BaselineDefaultExecutionRulePattern | WritingDefaultExecutionRulePattern | ReviewDefaultExecutionRulePattern;

/** The baseline's two patterns; a writing pattern is one per house type. */
export const DEFAULT_EXECUTION_RULE_PATTERNS: readonly BaselineDefaultExecutionRulePattern[] = ['sync-current', 'reanalyze-book'];

/** The analysis kind each pattern's Tasks are of, as the analysis ledger names it. */
export type DefaultExecutionRuleKind = 'baseline-analysis' | 'writing' | 'review-run';

/**
 * What a rule version binds: the material inputs of the plan the editor viewed when setting it that stay the same
 * from one Run to the next — the model service binding, the procedure pin, the Run Budget Ceiling, the outbound
 * data category and the outcome class. The range and the predecessor revision are each Run's own, never a rule's.
 */
export interface DefaultExecutionRuleBinding {
  providerBinding: MaterialPlanInputsProjection['providerBinding'];
  artifactPin: MaterialPlanInputsProjection['artifactPin'];
  runBudgetCeiling: RunBudgetCeilingState;
  outboundDataCategory: MaterialPlanInputsProjection['outboundDataCategory'];
  expectedOutcome: string;
}

/** One rule version, as a quick start or a started Task names it. */
export interface DefaultExecutionRuleReference {
  ruleId: string;
  ruleVersionId: string;
  ordinal: number;
  /** `开始同步 · 第 2 版`: the quick start the rule gives and the version in force. */
  name: string;
}

/** One 默认执行规则 as 知识库 › 工序与规则 lists it. */
export interface DefaultExecutionRuleProjection extends DefaultExecutionRuleReference {
  bookId: string;
  bookTitle: string;
  taskKind: DefaultExecutionRuleKind;
  pattern: DefaultExecutionRulePattern;
  state: 'active' | 'deactivated';
  stateLabel: string;
  /** What 快速开始 does under the rule, in one sentence. */
  does: string;
  /** What the rule binds, in the editor's words — the same rows the confirmation listed. */
  binds: ReadonlyArray<{ label: string; value: string }>;
  setBy: '本机编辑';
  /** When this version was set, from the plan it names. */
  setAt: string;
  /** When the rule was last set or turned off. */
  stateRecordedAt: string;
  sourceTaskIntentId: string;
  sourcePlanEnvelopeDigest: string;
  binding: DefaultExecutionRuleBinding;
}

// ---- 后台分析登记 (Issue #95, plan slice S39; ADR 0048; V2-UX-ANALYSIS-016 to 021) ------------------------------------

/** Where an Enrollment starts: only what changes after it is made, or the text as it stands too. */
export type BackgroundAnalysisStartingPoint = 'prospective' | 'backfill';

/**
 * What an Enrollment covers (Issue #864): this one Book, every Book of one Series it is in, or every Book of the house. A Series or
 * all-Books Enrollment is scheduled per Book in the scope's Book order, each Book's Runs held to its equal share of the ceiling.
 */
export type BackgroundAnalysisScopeKind = 'book' | 'series' | 'all-books';

/** The largest tokens ceiling 登记 takes, the same bound as a plan's own 设置上限 (Issue #51). */
export const BACKGROUND_ANALYSIS_CEILING_MAX = 999_999_999_999;

/** One scope `登记…` offers: its words and its Books in the scope's order, the first of which takes the ceiling's remainder. */
export interface BackgroundAnalysisScopeOffer {
  kind: BackgroundAnalysisScopeKind;
  /** The Series, for a `series` scope; `null` otherwise. */
  seriesId: string | null;
  /** `《甲》这一本书`, `书系《乙》的 3 本书`, `全部 5 本图书`. */
  label: string;
  books: ReadonlyArray<{ bookId: string; title: string }>;
}

/** One Book's 后台分析登记 on ②A: what it is, its state, what it would do now and why, and the decisions it offers. */
export interface BackgroundAnalysisEnrollmentProjection {
  kind?: string;
  kinds?: readonly { kind: string; label: string; enabled: boolean; reason: string | null }[];
  bookId: string;
  bookTitle: string;
  /**
   * `paused`: the editor paused it, and it starts nothing until they resume it (Issue #864); `suspended`: AI7 suspended it when the
   * local data was replaced or rolled back, and it starts nothing until the editor confirms it again (待你确认); `damaged`: its
   * record does not read back, and only this Book's background analysis stops.
   */
  state: 'none' | 'active' | 'paused' | 'suspended' | 'revoked' | 'damaged';
  stateLabel: string;
  statement: string;
  /** The version in force — or the last one, once revoked; `null` before the Book was ever enrolled. */
  enrollment: null | {
    enrollmentId: string;
    enrollmentVersionId: string;
    ordinal: number;
    /** `后台分析登记 · 第 1 版`. */
    name: string;
    startingPoint: BackgroundAnalysisStartingPoint;
    startingPointLabel: string;
    enrolledBy: '本机编辑';
    enrolledAt: string;
    stateRecordedAt: string;
    /** What the version binds, in the words its disclosure listed. */
    binds: ReadonlyArray<{ label: string; value: string }>;
    /** The tokens ceiling set at 登记 for the whole scope; `null` for a version made before a ceiling was required. */
    ceilingTokens: number | null;
    /** This Book's share of it, which each of its background Runs is held to; `null` with the ceiling. */
    shareTokens: number | null;
    /** What the version covers, its Books in order, and where this Book stands among them (1 is the first). */
    scope: { kind: BackgroundAnalysisScopeKind; label: string; books: ReadonlyArray<{ bookId: string; title: string }>; position: number };
  };
  /** The Enrollment's newest states, newest first (at most 10); revoking never shortens it. */
  history: ReadonlyArray<{ state: 'active' | 'paused' | 'suspended' | 'revoked'; stateLabel: string; ordinal: number; recordedAt: string }>;
  historyCount: number;
  /**
   * A Series or all-Books Enrollment's Books the dispatcher's latest look skipped, in the scope's order, each with why: their
   * working text has nothing new to analyse. Empty for a Book scope and before the dispatcher has looked.
   */
  skipped: ReadonlyArray<{ bookId: string; title: string; reason: string }>;
  /** What the Enrollment would do now, and why — `start` only while every condition holds. */
  next: { kind: 'start' | 'none' | 'wait' | 'stopped'; reason: string };
  /** The dispatcher's latest look at the Book in this service's lifetime, and what it found; `null` before its first. */
  lastLook: null | { at: string; kind: 'start' | 'none' | 'wait' | 'stopped'; reason: string };
  /** Why the dispatcher's latest pass that began preparing did not start, until it next starts or the Book is enrolled again. */
  lastNotStarted: null | { at: string; reason: string };
  /** The Runs the Enrollment started on this Book, newest first (at most 10), and how many there are. */
  startedRuns: ReadonlyArray<{ taskIntentId: string; modeLabel: string; enrollmentOrdinal: number | null; authorizedAt: string }>;
  startedRunCount: number;
  /** `登记…`'s disclosure: everything the Enrollment would bind, before the editor chooses where it starts. */
  offer: {
    canEnroll: boolean;
    reason: string | null;
    /** The digest `enrollBackgroundAnalysis` must name; `null` while it cannot be enrolled. */
    disclosureDigest: string | null;
    /** This Book's own scope, in words: what `范围` reads when only the Book is offered. */
    scope: string;
    /** Every scope 登记 may cover, this Book's first, then each Series it is in, then every Book of the house. */
    scopes: ReadonlyArray<BackgroundAnalysisScopeOffer>;
    what: string;
    when: string;
    binds: ReadonlyArray<{ label: string; value: string }>;
    startingPoints: ReadonlyArray<{ value: BackgroundAnalysisStartingPoint; label: string; note: string }>;
    notGranted: ReadonlyArray<string>;
    /** How a Series or all-Books ceiling is shared among its Books, in words. */
    ceilingRule: string;
  };
  /** `暂停` and `续行` of the Enrollment: they hold and release what it would start, and change nothing else. */
  hold: { canPause: boolean; canResume: boolean };
  revoke: { canRevoke: boolean; consequences: ReadonlyArray<string> };
}

export interface DefaultExecutionRulesProjection {
  /** Every rule of every Book, the Book's rules together, active before turned off. */
  rules: ReadonlyArray<DefaultExecutionRuleProjection>;
  /** The page's statement: a rule starts nothing by itself. */
  statement: string;
}
