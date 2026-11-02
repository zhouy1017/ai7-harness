import { join } from 'node:path';
import { StoreError, requireStore, type SqlRow } from './store-records.js';
import type { WritingExemplarSource } from './writing-tasks.js';
import type { WritingCopyRules, WritingExemplarInput } from './writing/writing-contract.js';
import type { BaselineAnalysisRouteFacts } from './analysis/baseline-analysis-store.js';
import type { BaselinePromptContractSelection } from './analysis/kind-definition.js';
import { clarificationPlanBaseDigest } from './provider/clarification-contract.js';
import type { ClassifiedSchemaRevision } from './data-version.js';
import type { StartWhenOnlineTaskKind } from '../shared/protocol.js';

/** The Fact-check Lens's words (Issue #901). */
export const FACTUAL_LENS_EMPTY = '这本书还没有事实核查结果：在 审阅 中选择 事实核查 并开始任务后，这里列出每条断言的核查结果。' as const;

export const FACTUAL_LENS_STATEMENT = '核查结果是证据评估：引文完整性、断言支持与事实核查三项分开显示，不是事实定论，也不构成审阅决定。' as const;

/** The source a Correction Proposal's 修改建议 names (Issue #901; CORR-012). */
export const CORRECTION_MARK_SOURCE_LABEL = '事实核查 · 更正提案' as const;

/** The house's 范例 a writing draft may reference, by type, and the damaged imported versions the scan named and skipped (Issue #789). */
export interface WritingExemplarScan {
  readonly found: Map<string, Array<{ input: WritingExemplarInput; source: WritingExemplarSource }>>;
  readonly damaged: Map<string, string[]>;
}

/** What 写作任务 says of a type's 范例: the line as it reads, and any damaged record named as 评估 names it (Issue #778, #789). */
export function writingExemplarStatement(line: string, readable: number, damaged: ReadonlyArray<string>): string {
  if (damaged.length === 0) return line;
  const names = damaged.map((title) => `《${title}》`).join('、');
  const unread = `另有 ${damaged.length} 份范例记录已损坏，无法读取`;
  return readable === 0 ? `本社没有可以读取的这类范例，本次不参考范例；${unread}：${names}` : `${line}；${unread}，本次不参考：${names}`;
}

/** Material readers rebuild the exact inner contract before the optional clarification instruction is restored. */
export function unwrappedPlanPromptDigest(execution: Record<string, unknown>, envelope: Record<string, unknown>): string {
  const base = clarificationPlanBaseDigest(execution, envelope);
  requireStore(base !== null,
  'ANALYSIS_RECORD_INVALID', '任务澄清指令的基础契约与计划不一致。');
  return base;
}

export function one<T extends SqlRow>(rows: T[], code: string, message: string): T {
  requireStore(rows.length === 1, code, message);
  return rows[0]!;
}

export interface StoreControl {
  induceUnprovableReconciliation: boolean;
  persistLegacyReviewedDraft: boolean;
  induceReimportProofTamper: boolean;
  induceAbandonObjectRemovalFailure: boolean;
  interruptAfterAbandonObjectRemoval: boolean;
  /** The J-04-only local deterministic route resolved at service startup; `null` in every other launch. */
  baselineAnalysisRoute: BaselineAnalysisRouteFacts | null;
  /**
   * The prompt contract the baseline ledger asks under (Issue #826): the service entry sets `retained-v1` only as
   * `baselinePromptContractForLaunch` decides it, for J-04's replay of the recorded /1 Run; absent, the current one. The
   * store refuses it beside any route but that recorded fixture alone.
   */
  baselinePromptContract?: BaselinePromptContractSelection;
  /**
   * The adjusted Books the house calibration offset waits on (Issue #429, EVAL-011a): `CALIBRATION_MIN_ADJUSTMENTS` unless a
   * development-ci J-11 launch lowers it with `--j11-calibration-min-books`, so the Journey proves the gate with two Books.
   */
  calibrationMinAdjustments?: number;
  /**
   * The software version the service entry read from the package the product ships in (Issue #433, S85a): the built
   * carrier holds no package manifest. Absent, the store reads the one at its code root — the source tree's, as the
   * service suites open it.
   */
  softwareVersion?: string;
  /**
   * The suites' own classification of schema revisions (Issue #433, S85b), so an upgrade to a later Data Version can be
   * opened before a later revision is classified breaking. The service entry never sets it.
   */
  schemaRevisionClasses?: ReadonlyArray<ClassifiedSchemaRevision>;
  /**
   * The suites stop an open here (Issue #433 review): after every migration and just before the versions that opened the store
   * are recorded, or just after, before the upgrade's note is cleared. The service entry never sets it.
   */
  interruptUpgradeAt?: 'before-record' | 'after-record';
  /**
   * The suites record a new writing Task under these copy rules (#707): `1` composes its contract, its plan and its row as the
   * software before #698 did — a row naming no rules — so a genuine `/1` Task is driven through the store's authorize, run and
   * parse wiring. The service entry never sets it; absent, every Task is `/2`.
   */
  writingCopyRules?: WritingCopyRules;
}

export function parseStoredJson(value: string, message: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new StoreError('STORE_CORRUPT', message);
  }
}

/**
 * Why a Book's own Source Version cannot take the same file again (Issue #532): an earlier parser read it, and AI7 reads
 * files differently now. Said at the choice, in the editor's words; the way on is a new Book.
 */
/**
 * How many review-category ledgers, and as many category kind definitions, the store keeps (Issue #649). Every distinct
 * category contract — with 书系一致性, every Series Knowledge revision and Series a member Book reviews against — asks
 * for its own, so the store keeps the most recently used and makes any other afresh from the Book database; a ledger
 * with a preparation in flight is always kept, because only that instance holds it.
 */
export const REVIEW_CATEGORY_CACHE_CAPACITY = 16;

/** The kinds whose Tasks run on an analysis ledger and wait with 联网后开始任务 through `startTaskWhenOnline` (Issue #760). */
export type LedgerTaskKind = Exclude<StartWhenOnlineTaskKind, 'review-run'>;

export const TASK_PLAN_NOT_CURRENT_REASON = '这项任务已不是这本书当前的任务；请从它所在的位置重新打开计划。';

/**
 * Records merged from another house keep their own profile by value (KB-002), so they match none of this house's 评估方案
 * versions. 知识库 › 评估方案 counts them under this labelled bucket (Issue #798, P3-6) instead of dropping them from every
 * version's use count. The renderer holds the same id literal to label the card.
 */
export const EVALUATION_PROFILE_UNKNOWN_ID = 'unknown/merged-profile';

export const EVALUATION_PROFILE_UNKNOWN_TITLE = '未知版本';

/** How many paragraphs 构建相似索引 embeds and writes at a time (Issue #892): the service takes its other work between two. */
export const MATERIAL_VECTOR_BATCH = 256;

/** Why the two on-request layers are not made while a database replacement waits (Issue #892). */
export const MATERIAL_LAYERS_READ_ONLY = '数据库替换正在等待：资料索引暂不建立新的层。';

/** 准备计划's draft as a preparation carries it (Issue #423, slice 7a): its version, its sentence, and how the promotion is recorded. */
export interface DraftPromotion {
  readonly versionId: string;
  readonly goal: string;
  readonly paragraphs?: number;
  readonly deliverable?: import('../shared/protocol.js').TaskIntentDeliverablePin;
  promoted(task: { readonly taskIntentId: string | null; readonly reviewRunId: string | null }): void;
}
