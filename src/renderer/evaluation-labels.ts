import type {
  EvaluationComparisonProjection,
  EvaluationConclusion,
  EvaluationProfileProjection,
  EvaluationRecordProjection,
  EvaluationRecordSummaryProjection,
  EvaluationTotalProjection,
  EvaluationWorkspaceProjection,
} from '../shared/protocol.js';
import { evaluationBand, type EvaluationRiskLevel } from '../shared/evaluation-scoring.js';

/**
 * ②C 评估's words (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005, EVAL-007, EVAL-012): the
 * page, each item by its 满分 and 得分 and never a weight, the risk items and the conclusion the editor chooses, the versions
 * and how one compares with the one before, and 知识库 › 评估方案's lines. Pure, so the unit suite pins every one.
 */

export const EVALUATION_TITLE = '评估';
export const EVALUATION_LEDE = '按本社评估方案打分：总分 100，每一项只看满分与得分，可以给半分；风险项不计入总分，只影响结论。';
export const EVALUATION_AI7_PENDING = 'AI7 初评尚未接通：这一版由你打分。';
export const EVALUATION_START = { first: '开始评估', again: '重新评估' } as const;
export const EVALUATION_SAVE = '保存评估';
export const EVALUATION_FINALIZE = '定稿';
export const EVALUATION_STATE_LABELS: Readonly<Record<EvaluationRecordSummaryProjection['state'], string>> = { editing: '编辑评分中', finalized: '定稿' };
export const EVALUATION_NOT_RATED = '不评';
export const EVALUATION_NOT_RATED_REASON = '不评的理由';
export const EVALUATION_SCORE = '得分';
export const EVALUATION_COMMENT = '评语';
export const EVALUATION_RISK_LEVELS: Readonly<Record<EvaluationRiskLevel, string>> = { low: '低', medium: '中', high: '高' };
export const EVALUATION_RISK_STATEMENT = '风险说明';
export const EVALUATION_RISK_REVIEWED = '已由人工复核';
export const EVALUATION_RISKS_HEADING = '风险项（不计入总分）';
export const EVALUATION_READINESS = '就绪清单：距离可出版还差什么（每行一条）';
export const EVALUATION_STRENGTHS = '主要优点（每行一条）';
export const EVALUATION_WEAKNESSES = '主要问题（每行一条）';
export const EVALUATION_VERDICT = '总评';
export const EVALUATION_CONCLUSION_LEGEND = '结论（由你选定）';
export const EVALUATION_RECOMMEND_BLOCKED = '有「高」风险还没有经人工复核，「推荐出版」暂不能选。';
export const EVALUATION_VERSIONS_HEADING = '版本';
export const EVALUATION_EMPTY = '这本书还没有评估。开始评估后，按本社评估方案逐项打分，定稿后留作记录。';
export const EVALUATION_STATUS = {
  loading: '正在读取评估…',
  opened: '评估已打开',
  unavailable: '无法读取评估。',
  starting: '正在开始评估…',
  saving: '正在保存评估…',
  saved: '评估已保存。',
  finalizing: '正在定稿…',
  failed: '无法保存评估。',
} as const;

export function evaluationStarted(ordinal: number): string {
  return `已开始第 ${ordinal} 版评估。`;
}

export function evaluationFinalized(ordinal: number): string {
  return `第 ${ordinal} 版评估已定稿。`;
}

/** A score as the editor reads it: whole points plainly, a half point as .5. */
export function evaluationScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function evaluationBandLabel(profile: Pick<EvaluationProfileProjection, 'bands'>, score: number, fullMarks: number): string {
  const band = evaluationBand(score, fullMarks);
  return profile.bands.find((entry) => entry.band === band)?.label ?? '';
}

/** The total out of the 满分 still rated, its band, and what is left `不评` or unscored. */
export function evaluationTotalLine(profile: Pick<EvaluationProfileProjection, 'bands'>, total: EvaluationTotalProjection): string {
  const band = total.unscored === 0 && total.fullMarks > 0 ? ` · ${evaluationBandLabel(profile, total.score, total.fullMarks)}` : '';
  const notRated = total.notRated === 0 ? '' : `（${total.notRated} 项不评）`;
  const unscored = total.unscored === 0 ? '' : ` · 还有 ${total.unscored} 项没有打分`;
  return `总分 ${evaluationScore(total.score)} / ${total.fullMarks}${band}${notRated}${unscored}`;
}

export function evaluationItemLegend(item: { label: string; fullMarks: number }): string {
  return `${item.label} · 满分 ${item.fullMarks}`;
}

export function evaluationHeading(record: Pick<EvaluationRecordSummaryProjection, 'ordinal' | 'state'>): string {
  return `第 ${record.ordinal} 版 · ${EVALUATION_STATE_LABELS[record.state]}`;
}

/** The revision a version evaluated, and whether edits waited in the journal beyond it then. */
export function evaluationRevisionLine(record: Pick<EvaluationRecordProjection, 'revisionLabel' | 'uncheckpointed'>): string {
  return `评估的是修订版 ${record.revisionLabel}${record.uncheckpointed ? '（当时另有写入修订日志、尚未保存为修订版的改动）' : ''}`;
}

export function evaluationFinalizedLine(record: Pick<EvaluationRecordProjection, 'finalized'>, instant: (iso: string) => string): string | null {
  return record.finalized === null ? null : `定稿 · ${record.finalized.actor} · ${instant(record.finalized.at)}`;
}

export function evaluationConclusionLabel(profile: Pick<EvaluationProfileProjection, 'conclusions'>, conclusion: EvaluationConclusion | null): string {
  return conclusion === null ? '结论未定' : profile.conclusions.find((entry) => entry.conclusion === conclusion)?.label ?? conclusion;
}

/** One version in the list: its number and state, the revision, the total and — once chosen — the conclusion. */
export function evaluationVersionLine(profile: Pick<EvaluationProfileProjection, 'bands' | 'conclusions'>, summary: EvaluationRecordSummaryProjection): string {
  const conclusion = summary.conclusion === null ? '' : ` · ${evaluationConclusionLabel(profile, summary.conclusion)}`;
  return `${evaluationHeading(summary)} · 修订版 ${summary.revisionLabel} · ${evaluationTotalLine(profile, summary.total)}${conclusion}`;
}

/** The Book's 评估 on 工作概览, in one line. */
export function evaluationOverviewLine(workspace: Pick<EvaluationWorkspaceProjection, 'records' | 'profile'>): string {
  const latest = workspace.records[0];
  if (latest === undefined) return '还没有评估。';
  return evaluationVersionLine(workspace.profile, latest);
}

function compared(value: number | 'not-rated' | null): string {
  return value === null ? '未打分' : value === 'not-rated' ? EVALUATION_NOT_RATED : evaluationScore(value);
}

/** 与第 N 版相比 (EVAL-012): each item that moved, each risk that moved, the total and the conclusion. */
export function evaluationComparisonLines(profile: EvaluationProfileProjection, comparison: EvaluationComparisonProjection): { heading: string; lines: string[] } {
  const lines: string[] = [];
  for (const item of comparison.items) {
    if (item.previous === item.current) continue;
    const label = profile.items.find((entry) => entry.itemId === item.itemId)?.label ?? item.itemId;
    lines.push(`${label}：${compared(item.previous)} → ${compared(item.current)}`);
  }
  for (const risk of comparison.risks) {
    if (risk.previous === risk.current) continue;
    const label = profile.risks.find((entry) => entry.riskId === risk.riskId)?.label ?? risk.riskId;
    lines.push(`${label}：${risk.previous === null ? '未定' : EVALUATION_RISK_LEVELS[risk.previous]} → ${risk.current === null ? '未定' : EVALUATION_RISK_LEVELS[risk.current]}`);
  }
  const before = comparison.total.previous;
  const now = comparison.total.current;
  lines.push(`总分：${evaluationScore(before.score)} / ${before.fullMarks} → ${evaluationScore(now.score)} / ${now.fullMarks}`);
  if (comparison.conclusion.previous !== comparison.conclusion.current) {
    lines.push(`结论：${evaluationConclusionLabel(profile, comparison.conclusion.previous)} → ${evaluationConclusionLabel(profile, comparison.conclusion.current)}`);
  }
  return { heading: `与第 ${comparison.previousOrdinal} 版相比`, lines };
}

// ---- 知识库 › 评估方案 (Issue #429, S81a; KB-001, EVAL-003, EVAL-005) --------------------------------------------------

export function evaluationProfilePill(profile: Pick<EvaluationProfileProjection, 'version' | 'issuer'>): string {
  return `第 ${profile.version} 版 · ${profile.issuer}`;
}

/** A band as the profile states it: its floor on the 100-point total, applied to an item by its 满分, and its anchor. */
export function evaluationBandLine(band: EvaluationProfileProjection['bands'][number]): string {
  return band.floor === 0 ? `${band.label} · 其余：${band.anchor}` : `${band.label} · ${band.floor} 分及以上（单项按满分折算）：${band.anchor}`;
}

export function evaluationProfileUse(profile: { records: number; books: number }): string {
  return profile.records === 0 ? '还没有评估用过' : `已用于 ${profile.books} 本书的 ${profile.records} 版评估`;
}
