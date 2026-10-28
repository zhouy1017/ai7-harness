import type { FidelityCategoryProjection, ManuscriptConversionProjection } from '../shared/protocol.js';
import type { ConversionLoss } from './text-manuscript.js';

/** The six body signals a revision-1 report counted; kept only to rebuild such a report exactly. */
export interface DocumentSignalsV1 {
  inlineStyles: number;
  commentsRevisions: number;
  notes: number;
  tables: number;
  imagesCaptions: number;
  sections: number;
}

/** A revision-1 conversion: the seven counted classes that report carried. */
interface FidelityConversionV1 {
  identity: string;
  sourceFormat: ManuscriptConversionProjection['sourceFormat'];
  loss: Omit<ConversionLoss, 'textBoxes' | 'fields'>;
}

/**
 * The eight classes exactly as parser identity `ai7-docx-fflate-saxes/1` reported them. Frozen: it
 * builds nothing new and exists so that a review recorded under revision 1 — staged, committed, or
 * reimported — still rebuilds byte for byte from its counts. Nothing may change a character of it.
 */
export function buildFidelityReportV1(
  signals: DocumentSignalsV1,
  headersFooters: number,
  phrases: Readonly<Record<string, string>>,
  conversion?: FidelityConversionV1,
): FidelityCategoryProjection[] {
  const loss = conversion?.loss;
  const count = {
    inlineStyles: signals.inlineStyles + (loss?.inlineStyles ?? 0),
    commentsRevisions: signals.commentsRevisions + (loss?.commentsRevisions ?? 0),
    notes: signals.notes + (loss?.notes ?? 0),
    tables: signals.tables + (loss?.tables ?? 0),
    imagesCaptions: signals.imagesCaptions + (loss?.imagesCaptions ?? 0),
    sections: signals.sections + (loss?.sections ?? 0),
    headersFooters: headersFooters + (loss?.headersFooters ?? 0),
  };
  const phrase = conversion === undefined ? undefined : phrases[conversion.identity];
  if (conversion !== undefined && phrase === undefined) throw new Error('DOCX_REJECTED:unknown converter identity');
  const detail = (key: keyof typeof count, text: string): string =>
    conversion && loss![key] > 0
      ? `由 ${conversion.identity} 从 ${conversion.sourceFormat} ${phrase}：${text}`
      : text;
  return [
    {
      key: 'inline-styles', label: '行内样式', count: count.inlineStyles,
      status: count.inlineStyles === 0 ? 'preserved' : 'degraded',
      statusLabel: count.inlineStyles === 0 ? '完整保留' : '降级导入',
      detail: detail('inlineStyles', count.inlineStyles === 0 ? '未检测到行内样式。' : '检测到字体与字号（rFonts、sz、szCs）等行内样式；可编辑内容块仅保留文字顺序，后续导出无法恢复这些样式。'),
    },
    {
      key: 'comments-revisions', label: '批注与修订', count: count.commentsRevisions,
      status: count.commentsRevisions === 0 ? 'preserved' : 'unsupported',
      statusLabel: count.commentsRevisions === 0 ? '完整保留' : '不支持导入',
      detail: detail('commentsRevisions', count.commentsRevisions === 0 ? '未检测到批注或修订标记。' : '本次受限导入不导入批注或修订标记。'),
    },
    {
      key: 'notes', label: '脚注与尾注', count: count.notes,
      status: count.notes === 0 ? 'preserved' : 'unsupported',
      statusLabel: count.notes === 0 ? '完整保留' : '不支持导入',
      detail: detail('notes', count.notes === 0 ? '未检测到脚注或尾注。' : '本次受限导入不导入脚注或尾注。'),
    },
    {
      key: 'tables', label: '表格', count: count.tables,
      status: count.tables === 0 ? 'preserved' : 'degraded',
      statusLabel: count.tables === 0 ? '完整保留' : '降级导入',
      detail: detail('tables', count.tables === 0 ? '未检测到表格。' : '表格会退化为连续文本；本次受限导入不提交该分支。'),
    },
    {
      key: 'images-captions', label: '图片与图注', count: count.imagesCaptions,
      status: count.imagesCaptions === 0 ? 'preserved' : 'degraded',
      statusLabel: count.imagesCaptions === 0 ? '完整保留' : '降级导入',
      detail: detail('imagesCaptions', count.imagesCaptions === 0 ? '未检测到图片或图注。' : '图片不会进入可编辑稿件；本次受限导入不提交该分支。'),
    },
    {
      key: 'sections', label: '分节', count: count.sections,
      status: count.sections === 0 ? 'preserved' : 'degraded',
      statusLabel: count.sections === 0 ? '完整保留' : '降级导入',
      detail: detail('sections', count.sections === 0 ? '未检测到额外分节；单节正文顺序完整保留，且不据此建立版式往返保证。' : '检测到页尺寸、页边距、分栏与文档网格等分节设置；正文按单一连续稿件顺序导入，后续导出无法恢复原分节版式。'),
    },
    {
      key: 'headers-footers', label: '页眉与页脚', count: count.headersFooters,
      status: count.headersFooters === 0 ? 'preserved' : 'degraded',
      statusLabel: count.headersFooters === 0 ? '完整保留' : '降级导入',
      detail: detail('headersFooters', count.headersFooters === 0 ? '未检测到页眉或页脚。' : '页眉页脚不进入稿件正文；本次受限导入不提交该分支。'),
    },
    {
      key: 'round-trip-export', label: 'DOCX 往返与导出预期', count: 0, status: 'unsupported', statusLabel: '不支持导入',
      detail: '本导入功能不提供 DOCX 导出，因此无法建立往返行为、版式复原或导出结果保证。',
    },
  ];
}
