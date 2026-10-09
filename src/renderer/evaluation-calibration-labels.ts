import type { EvaluationCalibrationBookProjection, EvaluationCalibrationProjection, PublicationActualsProjection } from '../shared/protocol.js';
import { formatCalibrationOffset, formatPriceFen } from '../shared/evaluation-calibration.js';

/**
 * 设置 › 评估校准与预测's words (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014; ADR 0076 §7): calibration's
 * progress and what it touches, the prediction switch and what it waits for, and the central entry of 定价与首印. Pure, so
 * the unit suite pins every one.
 */

export const CALIBRATION_PAGE_TITLE = '评估校准与预测';
export const CALIBRATION_PAGE_GROUP = '编辑工作';
/** True with the prediction switch on as off (Issue #430 review): AI7 predicts nothing unless the editor turns it on. */
export const CALIBRATION_PAGE_LEDE = '这里的两个开关只影响 AI7 的初评与预测，不改你的评分；定价与首印由你录入，AI7 默认不预测。';
export const CALIBRATION_HEADING = '校准';
/** What calibration touches, and what it never does (EVAL-011). */
export const CALIBRATION_SCOPE = '校准只调整 AI7 给出的初评分数，不改你的评分，也不改风险项。';
/** Why there is nothing to count, for a service that gives no AI7 初评 scores to adjust (`initialScoresConnected` false). */
export const CALIBRATION_WAITING = 'AI7 初评尚未接通：你改过 AI7 的初评分数后，调分记录才开始累积。';
export const CALIBRATION_SWITCH = '启用校准';
/** How the house offset is computed (EVAL-011; EVAL-011a), said in the editor's words. */
export const CALIBRATION_METHOD = '校准偏移 = 各本书最新一次从 AI7 初评开始并定稿的评估里，你的定稿分数减去 AI7 初评分数的平均值，取到半分；每次读取时重新计算，不另存。';
/** Below the gate: what the offset waits for. */
export const CALIBRATION_OFFSET_WAITING = '校准偏移尚未计算：满 10 本调分记录后，按上述方法得出，新版本从 AI7 初评开始时按偏移调整起始分数。';
/** With the switch off: what a new version does instead, and that the switch can be turned on again. */
export const CALIBRATION_OFF_EFFECT = '校准已关闭：新版本从 AI7 初评开始时直接用 AI7 的原始分数；可以随时再打开，关闭和打开都有记录。';
/** The heading of the per-item offsets, with the Books they rest on. */
export function calibrationBasisLine(offset: NonNullable<EvaluationCalibrationProjection['calibration']['offset']>): string {
  return `校准依据：${offset.basisBooks} 本书的定稿评估；各评分项的偏移如下（正数表示你的定稿分数通常高于 AI7 初评）。`;
}
/** One item's offset: `+1.5`, `−0.5`, `0`, or that no Book gives it a value, with the Books it rests on. */
export function calibrationOffsetLine(item: NonNullable<EvaluationCalibrationProjection['calibration']['offset']>['items'][number]): string {
  if (item.offset === null) return `${item.label}：暂无数据（没有书同时有你的定稿分数和 AI7 初评分数）`;
  return `${item.label}：${formatCalibrationOffset(item.offset)}（依据 ${item.books} 本书，满分 ${item.fullMarks}，调整后不超出 0 到 ${item.fullMarks}）`;
}

/** Books left out of the count because their evaluation records are damaged (Issue #702 review); `null` when none are. */
export function calibrationUnreadableLine(books: number): string | null {
  return books === 0 ? null : `另有 ${books} 本书的评估记录已损坏，未计入调分记录。`;
}
export const PREDICTION_HEADING = '定价与首印预测';
/** What turning it on would add (EVAL-014). */
export const PREDICTION_ADDS = '打开后，评估的市场部分会给出定价与首印的预测区间，标注「预测 · 低确定性」；关闭时不预测。';
export const PREDICTION_SWITCH = '启用定价与首印预测';
export const ACTUALS_HEADING = '定价与首印实际数据';
export const ACTUALS_EMPTY = '还没有已发稿的图书。设为发稿版本后，在这里录入它的定价与首印。';
export const ACTUALS_ENTER = '录入…';
export const ACTUALS_CHANGE = '修改…';
export const ACTUALS_SAVE = '保存';
export const ACTUALS_CANCEL = '取消';
export const ACTUALS_PRICE_LABEL = '定价（元）';
export const ACTUALS_PRINT_LABEL = '首印（册）';
export const ACTUALS_PRICE_INVALID = '定价要是大于 0 的金额，最多两位小数。';
export const ACTUALS_PRINT_INVALID = '首印要是大于 0 的整数册数。';
export const CALIBRATION_STATUS = {
  loading: '正在读取评估校准与预测…',
  opened: '评估校准与预测已打开',
  unavailable: '无法读取评估校准与预测。',
  saving: '正在保存…',
  actualsSaved: '定价与首印已录入。',
  preferencesSaved: '设置已保存。',
  failed: '无法保存。',
} as const;

/**
 * Calibration's progress toward its threshold, and whether it applies (EVAL-011, EVAL-014): 已生效 once the gate is passed with
 * the switch on, since the offset is computed at every read past it (EVAL-011a).
 */
export function calibrationProgressLine(calibration: Pick<EvaluationCalibrationProjection['calibration'], 'adjustments' | 'threshold' | 'enabled' | 'active'>): string {
  const progress = `调分记录 ${calibration.adjustments} / ${calibration.threshold} 本`;
  if (!calibration.enabled) return `${progress} · 已关闭`;
  return calibration.active ? `${progress} · 已生效` : `${progress} · 满 ${calibration.threshold} 本后生效`;
}

/** The prediction switch's state, and what it waits for until it may be turned on (EVAL-010). */
export function predictionProgressLine(prediction: EvaluationCalibrationProjection['prediction']): string {
  const progress = `已录入实际数据的已发稿图书 ${prediction.booksWithActuals} / ${prediction.threshold} 本`;
  if (!prediction.available) return `${progress} · 满 ${prediction.threshold} 本后才能打开`;
  return prediction.enabled ? `${progress} · 已打开` : `${progress} · 可以打开`;
}

/** 定价与首印 as a line: price and first print run. */
export function actualsLine(actuals: Pick<PublicationActualsProjection, 'priceFen' | 'firstPrint'>): string {
  return `定价 ${formatPriceFen(actuals.priceFen)} · 首印 ${actuals.firstPrint.toLocaleString('zh-CN')} 册`;
}

/** One published Book's line in the central entry: its 发稿版本 and its actuals, or what is missing. */
export function actualsBookLine(book: Pick<EvaluationCalibrationBookProjection, 'publicationOrdinal' | 'actuals'>): string {
  const version = `第 ${book.publicationOrdinal} 次发稿版本`;
  if (book.actuals === null) return `${version} · 尚未录入`;
  if (!book.actuals.current) return `${version} · 尚未录入（第 ${book.actuals.publicationOrdinal} 次发稿版本录入过：${actualsLine(book.actuals)}）`;
  return `${version} · ${actualsLine(book.actuals)}`;
}
