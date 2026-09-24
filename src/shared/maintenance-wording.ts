import type { MaintenanceCaseStatus, MaintenanceCaseStep, MaintenanceClassification, MaintenanceNextStep } from './protocol.js';

/**
 * The words of 维护事项 (Issue #426, plan slice S68a; V2-UX-MAINT-001 to 011, ADR 0040) that both the service's records
 * and the page say. A case records an internal AI7 matter about one exact 发稿版本: nothing here says a text was
 * corrected and published, withdrawn, taken down, recalled or reissued anywhere outside AI7 (MAINT-011).
 */

export const MAINTENANCE_CLASSIFICATION_LABELS: Readonly<Record<MaintenanceClassification, string>> = {
  correction: '更正',
  errata: '勘误',
  supersession: '替代',
  withdrawal: '撤回',
  reissue: '再版',
  archive: '归档',
};

/** What each classification does (ADR 0040's table), said beside its choice and on its case. */
export const MAINTENANCE_CONSEQUENCES: Readonly<Record<MaintenanceClassification, string>> = {
  correction: '用修改建议改正文字：接受并应用后得到新的修订版；这个发稿版本不变，新的发稿版本需要另行设定。',
  errata: '写一份勘误，说明发现的错误和更正方式；勘误本身不改动稿件。',
  supersession: '另设一个更新的发稿版本，在 AI7 中取代这一版；这一版保持不变。',
  withdrawal: '这一版在 AI7 中不再用于发稿；它仍可查看，也仍可导出。',
  reissue: '新的印次或版次另设一个发稿版本，可以沿用同一个修订版。',
  archive: '这一版的维护到此结束；它的发稿用途和全部记录都不变。',
};

/** MAINT-008: 撤回 and 归档 are recorded inside AI7 only, and say so wherever they stand. */
export const MAINTENANCE_INTERNAL_ONLY = '仅在 AI7 内记录；不代表已撤稿、下架、召回、通知接收方或删除外部文件';

export const MAINTENANCE_STATUS_LABELS: Readonly<Record<MaintenanceCaseStatus, string>> = {
  unresolved: '未解决',
  waiting: '等待另设发稿版本',
  complete: '已完成（AI7 内记录）',
};

export const MAINTENANCE_STEP_LABELS: Readonly<Record<MaintenanceCaseStep, string>> = {
  recorded: '记录维护事项',
  'proposal-linked': '关联修改建议',
  'publication-linked': '关联发稿版本',
  'errata-saved': '保存勘误版本',
  concluded: '记录维护事项结论',
};

export const MAINTENANCE_NEXT_STEP_LABELS: Readonly<Record<MaintenanceNextStep, string>> = {
  'link-proposal': '关联修改建议',
  'link-publication': '关联发稿版本',
  'write-errata': '编写勘误',
  conclude: '记录维护事项结论',
};

/** The only completion words a step answers with (MAINT-011, the Maintenance rules). */
export const MAINTENANCE_RECORDED = '维护事项已记录';
export const MAINTENANCE_CONCLUDED = '维护事项结论已记录';

/** Words no answer of a case ever uses to say what it came to. */
export const MAINTENANCE_FORBIDDEN_COMPLETIONS = ['已更正发布', '已撤稿', '已下架', '已召回', '已再版'] as const;

/** A 撤回 发稿版本, as its designation and 图书交付包's first condition name it: `发稿版本「一审稿」 · r1 · 已在 AI7 内撤回`. */
export function maintenanceWithdrawnLine(publicationLabel: string): string {
  return `${publicationLabel} · ${MAINTENANCE_WITHDRAWN}`;
}
export const MAINTENANCE_WITHDRAWN = '已在 AI7 内撤回';
export const MAINTENANCE_ARCHIVED = '维护已归档';
