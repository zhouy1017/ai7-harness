import type { MaintenanceCaseLinkProjection, MaintenanceCaseRevisionProjection, MaintenanceCaseSummaryProjection } from '../shared/protocol.js';
import { MAINTENANCE_NEXT_STEP_LABELS } from '../shared/maintenance-wording.js';

/**
 * Every word of 维护事项 on 交付物 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011) that the service projection does
 * not already carry: the classifications, their consequences, statuses and steps come from the shared wording. A case
 * records an internal AI7 matter, so nothing here says a text was published, sent, withdrawn or taken down anywhere.
 * Pure, so the unit suite pins every string byte for byte; an instant arrives already formatted.
 */

export const MAINTENANCE_HEADING = '维护事项';

/** The label of every `data-maintenance-action`. */
export const MAINTENANCE_ACTION_LABELS = {
  record: '记录维护事项…',
  confirmRecord: '记录维护事项',
  cancel: '取消',
  openCase: '查看',
  closeCase: '收起',
  linkProposal: '关联修改建议…',
  linkPublication: '关联发稿版本…',
  confirmLink: '关联',
  writeErrata: '编写勘误…',
  saveErrata: '保存勘误版本',
  conclude: '记录维护事项结论…',
  confirmConclude: '记录结论',
} as const;
export type MaintenanceAction = keyof typeof MAINTENANCE_ACTION_LABELS;

/** `记录维护事项…` names the designation it records against, since several stand side by side. */
export function maintenanceRecordAccessibleName(ordinal: number): string {
  return `为第 ${ordinal} 次设为发稿版本记录维护事项…`;
}

export const MAINTENANCE_CLASSIFICATION_LEGEND = '维护类型';
export const MAINTENANCE_REASON_LABEL = '原因';
export const MAINTENANCE_EVIDENCE_LABEL = '依据（可选）';
export const MAINTENANCE_EVIDENCE_HINT = '例如读者来信、质检单或核对记录。';

/** MAINT-002: the exact designation the draft binds. */
export function maintenanceDraftTargetLine(label: string): string {
  return `维护事项绑定到：${label}`;
}

/** Why a step waits, in words beside it. */
export const MAINTENANCE_BLOCKERS = {
  classification: '先选择维护类型。',
  reason: '请写明原因（1–500 个字）。',
  evidence: '依据最多 500 个字；不填写时请留空。',
  choice: '先选择一项。',
  errata: '请写下勘误（1–4000 个字）。',
  conclusion: '先选择结论。',
  outcome: '请写明结论（1–500 个字）。',
} as const;

/** One case in its designation's list: `第 1 项 · 勘误 · 未解决 · 下一步：编写勘误`. */
export function maintenanceCaseLine(summary: Pick<MaintenanceCaseSummaryProjection, 'ordinal' | 'classificationLabel' | 'statusLabel' | 'nextStep'>): string {
  return `第 ${summary.ordinal} 项 · ${summary.classificationLabel} · ${summary.statusLabel}${summary.nextStep === null ? '' : ` · 下一步：${MAINTENANCE_NEXT_STEP_LABELS[summary.nextStep]}`}`;
}

export function maintenanceCaseAccessibleName(summary: Pick<MaintenanceCaseSummaryProjection, 'ordinal' | 'classificationLabel'>): string {
  return `查看第 ${summary.ordinal} 项维护事项（${summary.classificationLabel}）`;
}

export const MAINTENANCE_CASES_TRUNCATED = '更早的维护事项保留在记录中。';

export function maintenanceCaseHeading(ordinal: number, classificationLabel: string): string {
  return `第 ${ordinal} 项维护事项 · ${classificationLabel}`;
}

export function maintenanceTargetLine(label: string): string {
  return `绑定的发稿版本：${label}`;
}

export function maintenanceStatusLine(statusLabel: string, nextStep: MaintenanceCaseSummaryProjection['nextStep']): string {
  return `状态：${statusLabel}${nextStep === null ? '' : ` · 下一步：${MAINTENANCE_NEXT_STEP_LABELS[nextStep]}`}`;
}

export const MAINTENANCE_TIMELINE_LABEL = '维护事项的记录';
export const MAINTENANCE_REVISIONS_TRUNCATED = '更早的记录保留在这个维护事项中。';

/** One revision on the timeline: `第 2 条 · 保存勘误版本 · 未解决 · 9月24日 21:30`. */
export function maintenanceRevisionLine(revision: Pick<MaintenanceCaseRevisionProjection, 'revision' | 'stepLabel' | 'statusLabel'>, recordedAt: string): string {
  return `第 ${revision.revision} 条 · ${revision.stepLabel} · ${revision.statusLabel} · ${recordedAt}`;
}

/** What a revision says in words: a conclusion's 结论, anything else's 原因. */
export function maintenanceReasonLine(step: MaintenanceCaseRevisionProjection['step'], reason: string): string {
  return step === 'concluded' ? `结论：${reason}` : `原因：${reason}`;
}

export function maintenanceEvidenceLine(evidence: string): string {
  return `依据：${evidence}`;
}

/** What a revision links, in the linked record's own words (MAINT-010). */
export function maintenanceLinkLine(link: MaintenanceCaseLinkProjection): string {
  if (link.kind === 'proposal') return `关联：${link.label} · ${link.stateLabel}`;
  if (link.kind === 'publication-version') return `关联发稿版本：${link.label}`;
  return `勘误第 ${link.version} 版`;
}

export function maintenanceErrataHeading(version: number): string {
  return `勘误 · 第 ${version} 版`;
}

export const MAINTENANCE_NO_PROPOSALS = '这个发稿版本之后，稿件上还没有修改建议：先在稿件中提出修改建议，再回到这里关联。';
export const MAINTENANCE_NO_PUBLICATIONS = '还没有在这个发稿版本之后另设的发稿版本：先保存里程碑版本，再另行设为发稿版本。';
export const MAINTENANCE_PROPOSALS_LEGEND = '这个发稿版本之后提出的修改建议';
export const MAINTENANCE_PUBLICATIONS_LEGEND = '之后另设的发稿版本';
export const MAINTENANCE_ERRATA_LABEL = '勘误内容';
export const MAINTENANCE_CONCLUSION_LEGEND = '结论';
export const MAINTENANCE_CONCLUSION_CHOICES = { unresolved: '仍未解决', complete: '已完成（AI7 内记录）' } as const;
export const MAINTENANCE_OUTCOME_LABEL = '结论说明';

export const MAINTENANCE_STATUS_LINES = {
  reading: '正在读取维护事项…',
  readFailed: '无法读取维护事项。',
  recording: '正在记录维护事项…',
  recordFailed: '未能记录维护事项。',
  stepping: '正在记录这一步…',
  stepFailed: '未能记录这一步。',
  cancelled: '已取消，没有记录维护事项。',
} as const;

export const MAINTENANCE_TECHNICAL_TERMS = {
  caseId: '维护事项 ID',
  caseDigest: '维护事项记录摘要',
  revisionDigest: '记录摘要',
} as const;
