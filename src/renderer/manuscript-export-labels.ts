import type {
  ExportFidelityRowProjection,
  ExportFidelityStatus,
  ManuscriptExportOptions,
  ManuscriptExportPreparationProjection,
  ManuscriptExportReceiptProjection,
  ManuscriptExportTargetProjection,
  ManuscriptExportFormat,
} from '../shared/protocol.js';

/**
 * Every word of ④ 导出 (editor-surfaces §7 导出; V2-UX-EXP-001 to EXP-024) that the service projection does not
 * already carry. The review's rows, the outcome labels and details, and the disposition labels are the
 * service's and are shown as they come; these are the sentences around them. None of them says a file was
 * sent, delivered or published (EXP-017). Pure, so the unit suite pins every string byte for byte; an instant
 * arrives already formatted.
 */

// ---- the actions ---------------------------------------------------------------------------------

/** The label of every `data-export-action` the 交付物 destination carries. */
export const EXPORT_ACTION_LABELS = {
  open: '导出…',
  choose: '选择保存位置…',
  chooseAgain: '重新选择保存位置…',
  approve: '按上述方式导出',
  cancel: '取消',
  close: '完成',
  reveal: '在文件夹中显示',
} as const;
export type ExportAction = keyof typeof EXPORT_ACTION_LABELS;

/** 导出… names the version it exports for a screen reader, since several stand side by side. */
export function exportOpenAccessibleName(target: { kind: 'current' } | { kind: 'milestone'; label: string }): string {
  return target.kind === 'current' ? '导出当前修订版…' : `导出里程碑版本「${target.label}」…`;
}

// ---- the card ------------------------------------------------------------------------------------

export function exportCardHeading(target: ManuscriptExportTargetProjection | null, pending: { kind: 'current' } | { kind: 'milestone'; label: string }): string {
  if (target === null) return pending.kind === 'current' ? '导出 · 当前修订版' : `导出 · 里程碑版本「${pending.label}」`;
  return target.kind === 'current'
    ? `导出 · 当前修订版 ${target.revisionLabel}`
    : `导出 · 里程碑版本「${target.milestoneLabel ?? ''}」 · ${target.revisionLabel}`;
}

/** V2-UX-TASK-040's low ceremony: unsaved edits became a revision for the export, and nothing more. */
export function exportSavedRevisionLine(revisionLabel: string): string {
  return `未保存的修改已为导出保存为修订版 ${revisionLabel}；这不是里程碑版本。`;
}

/** V2-UX-EXP-015, EXP-017: the export ends at the chosen local file. */
export const EXPORT_LOCAL_LINE = '导出只写到本机你选择的位置；AI7 不会发送、上传或发布这个文件。';
export const EXPORT_FORMAT_LEGEND = '格式';
/** The secondary disclosure a fallback format sits under (V2-UX-EXP-005; IA §导出, visual direction). */
export const EXPORT_FALLBACK_FORMATS = '备用格式';
export const EXPORT_OPTIONS_LEGEND = '随文件导出';
export const EXPORT_OPTION_LABELS: Readonly<Record<keyof ManuscriptExportOptions, string>> = {
  includeAnnotations: '含批注',
  includeSuggestions: '含修改建议（作为修订）',
  includeEditorNotes: '含备注',
};
export const EXPORT_OPTION_NOTES: Readonly<Record<keyof ManuscriptExportOptions, string>> = {
  includeAnnotations: '作为 Word 批注写出，保留作者名与回复。',
  includeSuggestions: '待处理的修改建议作为 Word 修订写出，保留作者名。',
  includeEditorNotes: '备注默认不随导出；勾选后作为批注写出，作者为「备注」。',
};
/** What each option writes in the two formats laid out from the manuscript's words (Issue #500, S64b). */
export const EXPORT_OPTION_NOTES_BY_FORMAT: Readonly<Record<'pdf' | 'markdown', Readonly<Record<keyof ManuscriptExportOptions, string>>>> = {
  pdf: {
    includeAnnotations: '在正文中标出编号，连同作者名与回复列在文末。',
    includeSuggestions: '待处理的修改建议以删除线与双下划线标在正文中，并列在文末。',
    includeEditorNotes: '备注默认不随导出；勾选后列在文末，作者为「备注」。',
  },
  markdown: {
    includeAnnotations: '写成脚注，保留作者名与回复。',
    includeSuggestions: '待处理的修改建议写成 CriticMarkup 标记，作者写在脚注里。',
    includeEditorNotes: '备注默认不随导出；勾选后写成脚注，作者为「备注」。',
  },
};
/** The note under one option, in the words of the format the card is reviewing. */
export function exportOptionNote(key: keyof ManuscriptExportOptions, format: ManuscriptExportFormat): string {
  return format === 'docx' ? EXPORT_OPTION_NOTES[key] : EXPORT_OPTION_NOTES_BY_FORMAT[format][key];
}
/** The order the options are offered in (V2-UX-EXP-023, EXP-024). */
export const EXPORT_OPTION_ORDER: ReadonlyArray<keyof ManuscriptExportOptions> = ['includeAnnotations', 'includeSuggestions', 'includeEditorNotes'];
/** Selecting an option changes the file only (V2-UX-EXP-023). */
export const EXPORT_OPTIONS_NOTE = '这些选项只改变导出的文件，不改变稿件和稿件上的标记。';

// ---- the Export Fidelity Review -----------------------------------------------------------------------

export const EXPORT_FIDELITY_HEADING = '导出保真审阅';

/** A status reads in text and in shape as well as in colour (V2-UX-EXP-007, VIS). */
export function exportStatusShape(status: ExportFidelityStatus): string {
  if (status === 'preserved') return '✓';
  if (status === 'degraded') return '△';
  if (status === 'unavailable') return '⊘';
  return '○';
}

export function exportPillText(row: Pick<ExportFidelityRowProjection, 'status' | 'statusLabel'>): string {
  return `${exportStatusShape(row.status)} ${row.statusLabel}`;
}

export function exportCountText(count: number): string {
  return ` · ${count} 项`;
}

/** Where a class is not written as it was, by manuscript position. */
export function exportPositionsLine(row: Pick<ExportFidelityRowProjection, 'positions' | 'positionsTruncated'>): string | null {
  if (row.positions.length === 0) return null;
  return `涉及稿件第 ${row.positions.join('、')} 段${row.positionsTruncated ? ' 等' : ''}。`;
}

/**
 * The rows the review shows one by one: every class that is present, not fully kept, or left out by the
 * editor. A class found nowhere and kept is summarized on one line instead (interaction spec › Local Export
 * Formats and Fidelity: fully preserved rows remain summarized; a degraded one expands).
 */
export function exportShownRows(fidelity: ReadonlyArray<ExportFidelityRowProjection>): ExportFidelityRowProjection[] {
  return fidelity.filter((row) => row.count > 0 || row.status !== 'preserved');
}

export function exportAbsentLine(fidelity: ReadonlyArray<ExportFidelityRowProjection>): string | null {
  const absent = fidelity.filter((row) => row.count === 0 && row.status === 'preserved').map((row) => row.label);
  return absent.length === 0 ? null : `未检测到：${absent.join('、')}。`;
}

/** V2-UX-EXP-008: a degradation is accepted only by the unselected approval, for this one export. */
export const EXPORT_DEGRADED_NOTE =
  '标为「降级导出」或「无法导出」的内容会按上面所说的方式处理；选择「按上述方式导出」即表示只对这一次导出接受这些处理。';

// ---- the destination and the approval ----------------------------------------------------------------

export const EXPORT_DESTINATION_HEADING = '保存位置';
/** V2-UX-EXP-019: a name already there is the system dialog's to ask about, never AI7's. */
export const EXPORT_DESTINATION_UNCHOSEN = '还没有选择保存位置。所选位置已有同名文件时，由系统的保存对话框询问是否替换。';

export function exportDestinationLine(preparation: Pick<ManuscriptExportPreparationProjection, 'destination' | 'dispositionLabel'>): string {
  return `${preparation.destination}（${preparation.dispositionLabel}）`;
}

export const EXPORT_APPROVE_REASON = '先选择保存位置。';

// ---- the result --------------------------------------------------------------------------------------

/** A file's size as an editor reads it. */
export function exportBytesLabel(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} 字节`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function exportReceiptMeta(receipt: Pick<ManuscriptExportReceiptProjection, 'fileName' | 'byteLength'>, recordedAt: string | null): string {
  return `「${receipt.fileName}」 · ${exportBytesLabel(receipt.byteLength)}${recordedAt === null ? '' : ` · ${recordedAt}`}`;
}

export function exportVersionText(target: ManuscriptExportTargetProjection): string {
  return target.kind === 'current' ? `修订版 ${target.revisionLabel}` : `里程碑版本「${target.milestoneLabel ?? ''}」 · ${target.revisionLabel}`;
}

// ---- the records on 交付物 ------------------------------------------------------------------------------

export const EXPORT_RECORDS_HEADING = '导出记录';

export function exportRecordLine(receipt: Pick<ManuscriptExportReceiptProjection, 'outcomeLabel' | 'fileName' | 'target'>, recordedAt: string | null): string {
  return `${receipt.outcomeLabel} · 「${receipt.fileName}」 · ${exportVersionText(receipt.target)}${recordedAt === null ? '' : ` · ${recordedAt}`}`;
}

// ---- the technical layer (V2-UX-LAYER-001) -------------------------------------------------------------

export const EXPORT_TECHNICAL_TERMS = {
  revision: '修订版 ID',
  revisionDigest: '修订版摘要',
  sourceVersion: '来源版本 ID',
  writer: '写出器',
  input: '导出输入摘要',
  review: '保真审阅摘要',
  preparation: '导出准备 ID',
  intent: '效果意图 ID',
  payload: '文件摘要',
  policy: '对外导出策略',
  record: '记录摘要',
  approval: '导出批准 ID',
  receipt: '导出回执 ID',
  receiptDigest: '回执摘要',
  fileSha256: '写入文件摘要',
  failure: '结果代码',
} as const;

// ---- status lines ------------------------------------------------------------------------------------

export const EXPORT_STATUS_LINES = {
  reviewing: '正在准备导出保真审阅…',
  reviewed: '导出保真审阅已就绪',
  reviewFailed: '无法准备导出。',
  choosing: '正在打开系统的保存对话框…',
  cancelled: '已取消选择保存位置，没有写入任何文件。',
  prepared: '已准备好导出文件，等待你确认。',
  chooseFailed: '未能准备导出文件。',
  writing: '正在写入所选位置…',
  approveFailed: '未能导出。',
  closed: '已关闭导出，没有写入任何文件。',
  revealed: '已在文件夹中显示。',
  revealFailed: '无法在文件夹中显示。',
} as const;
