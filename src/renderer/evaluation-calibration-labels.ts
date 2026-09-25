import type { EvaluationCalibrationBookProjection, EvaluationCalibrationProjection, PublicationActualsProjection } from '../shared/protocol.js';
import { formatPriceFen } from '../shared/evaluation-calibration.js';

/**
 * 设置 › 评估校准与预测's words (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014; ADR 0076 §7): calibration's
 * progress and what it touches, the prediction switch and what it waits for, and the central entry of 定价与首印. Pure, so
 * the unit suite pins every one.
 */

export const CALIBRATION_PAGE_TITLE = '评估校准与预测';
export const CALIBRATION_PAGE_GROUP = '编辑工作';
export const CALIBRATION_PAGE_LEDE = '这里的两个开关只影响 AI7 的初评与预测，不改你的评分；定价与首印由你录入，AI7 不预测。';
export const CALIBRATION_HEADING = '校准';
/** What calibration touches, and what it never does (EVAL-011). */
export const CALIBRATION_SCOPE = '校准只调整 AI7 给出的初评分数，不改你的评分，也不改风险项。';
/** Why there is nothing to count yet: AI7's 初评 arrives with S81b (Issue #429). */
export const CALIBRATION_WAITING = 'AI7 初评尚未接通：你改过 AI7 的初评分数后，调分记录才开始累积。';
export const CALIBRATION_SWITCH = '启用校准';
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

/** Calibration's progress toward its threshold, and whether it applies (EVAL-011, EVAL-014). */
export function calibrationProgressLine(calibration: EvaluationCalibrationProjection['calibration']): string {
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
