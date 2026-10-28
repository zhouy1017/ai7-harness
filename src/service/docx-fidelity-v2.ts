import type { FidelityCategoryKey, FidelityCategoryProjection, TextBoxDisposition } from '../shared/protocol.js';
import type { DocumentSignals, FidelityConversion } from './docx.js';

/**
 * The frozen revision-2 fidelity builder and the wording every DOCX review shares, moved out of `docx.ts` (Issue #1205, F-25) so
 * the parser's own file stays within its bound. Nothing here changes a character of what a review says.
 */

/** The eight body signals a revision-2 report counted; kept only to rebuild such a report exactly. */
export type DocumentSignalsV2 = Omit<DocumentSignals, 'commentsRevisionsPresent'>;

/**
 * What each converter did to the content a class counts. A text conversion keeps the author's
 * characters and loses only the structure they spelled out; a `.doc` conversion drops content the
 * reader could not carry across. One prefix cannot say both, so the review says which happened.
 *
 * An identity absent from this map cannot be phrased: `buildFidelityReport` refuses to write such a
 * detail and `deriveImportFidelityPlan` refuses to plan a report that names one, so a converter can
 * never reach the editor with a review nobody can reconstruct.
 */
export const CONVERSION_LOSS_PHRASES: Readonly<Record<string, string>> = {
  'ai7-text-to-docx/1': '转换保留为原文字符',
  'ai7-doc-to-docx/1': '转换时未能保留',
};

/** The status a class present in the file carries when its content stays with the Source Version. */
export const RETAINED = { status: 'retained', statusLabel: '完整保留（随文件保留）' } as const;
export const PRESERVED = { status: 'preserved', statusLabel: '完整保留' } as const;
export const DEGRADED = { status: 'degraded', statusLabel: '降级导入' } as const;
export const UNSUPPORTED = { status: 'unsupported', statusLabel: '不支持导入' } as const;

/** What an edit costs a retained class, stated when it is known — at export — and never guessed here. */
export const EDITED_PARAGRAPH_LINE = '改过的段落，导出时逐段说明格式能否原样恢复。';

/**
 * The text-box row's detail under each disposition (ADR 0086 §2): the one class whose detail depends on
 * a choice, which is why a review is rebuilt from its counts and that choice.
 */
export const TEXT_BOX_DETAILS: Readonly<Record<TextBoxDisposition, string>> = {
  retain: '保留为文本框：文本框随来源版本保留，不显示在稿件中，导出时恢复。',
  merge: '并入正文：文本框中的段落进入稿件，紧接在锚定它的段落之后；导出时不再写出原文本框。',
};

/**
 * The ten content classes exactly as parser identity `ai7-docx-fflate-saxes/2` reported them (ADR 0086).
 * Frozen: it exists so that a review recorded under revision 2 — staged, committed, or reimported — still
 * rebuilds byte for byte from its counts, and revision 3 derives its own report from it. Nine are rows;
 * the tenth, `round-trip-export`, is the closing 预计往返 card and always counts nothing.
 *
 * A class present in a natively read file is `完整保留（随文件保留）` when its content stays with the Source
 * Version and is restored on export — inline styles (links among them), tables, images, sections, headers
 * and footers, text boxes — and `降级导入` when it cannot be retained: notes, until the Manuscript has a
 * note block, and fields, whose displayed text no longer updates. Comments and revisions stay `不支持导入`
 * until S62.
 *
 * A `conversion` adds its loss to the parser's counts and names itself in those classes' details. What a
 * converter lost is not in the working representation, so it cannot be retained: such a class keeps the
 * label it carried before ADR 0086, and the two new classes read `降级导入` (ADR 0086 §3).
 */
export function buildFidelityReportV2(
  signals: DocumentSignalsV2,
  headersFooters: number,
  conversion?: FidelityConversion,
  textBoxDisposition: TextBoxDisposition = 'retain',
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
    textBoxes: signals.textBoxes + (loss?.textBoxes ?? 0),
    fields: signals.fields + (loss?.fields ?? 0),
  };
  const phrase = conversion === undefined ? undefined : CONVERSION_LOSS_PHRASES[conversion.identity];
  if (conversion !== undefined && phrase === undefined) throw new Error('DOCX_REJECTED:unknown converter identity');
  const converted = (key: keyof typeof count): boolean => conversion !== undefined && loss![key] > 0;
  /**
   * One class: `absent` when it counts nothing; otherwise the converter's loss when a conversion
   * carried it, or the native reading when the parser found it.
   */
  const row = (
    key: FidelityCategoryKey,
    label: string,
    signal: keyof typeof count,
    absent: string,
    native: { status: typeof RETAINED | typeof DEGRADED | typeof UNSUPPORTED; detail: string },
    lost: { status: typeof DEGRADED | typeof UNSUPPORTED; detail: string },
  ): FidelityCategoryProjection => {
    const total = count[signal];
    if (total === 0) return { key, label, count: 0, ...PRESERVED, detail: absent };
    if (converted(signal)) {
      return { key, label, count: total, ...lost.status, detail: `由 ${conversion!.identity} 从 ${conversion!.sourceFormat} ${phrase}：${lost.detail}` };
    }
    return { key, label, count: total, ...native.status, detail: native.detail };
  };
  return [
    row('inline-styles', '行内样式', 'inlineStyles', '未检测到行内样式。',
      {
        status: RETAINED,
        // Said of the class rather than of what was found: a file whose only items are links has no font to
        // report, and a file of styled runs has no link to report.
        detail: `字体、字号、粗体、颜色等行内样式与超链接随来源版本保留；稿件只编辑文字，超链接只留下显示的文字；未改过的段落导出时从原文件恢复。${EDITED_PARAGRAPH_LINE}`,
      },
      { status: DEGRADED, detail: '行内样式没有成为可编辑格式；可编辑内容块只保留文字，导出无法恢复这些样式。' }),
    row('comments-revisions', '批注与修订', 'commentsRevisions', '未检测到批注或修订标记。',
      { status: UNSUPPORTED, detail: '本次受限导入不导入批注或修订标记。' },
      { status: UNSUPPORTED, detail: '本次受限导入不导入批注或修订标记。' }),
    row('notes', '脚注与尾注', 'notes', '未检测到脚注或尾注。',
      {
        status: DEGRADED,
        detail: '稿件中既不显示脚注或尾注的引用标记，也不显示注文；注文随来源版本保留，稿件有注释块之前不能在稿件中编辑。未改过的段落导出时连同注释从原文件恢复。',
      },
      { status: UNSUPPORTED, detail: '本次受限导入不导入脚注或尾注。' }),
    row('tables', '表格', 'tables', '未检测到表格。',
      {
        status: RETAINED,
        detail: `单元格文字按阅读顺序作为段落进入稿件；表格结构随来源版本保留，未改过的段落导出时从原文件恢复。${EDITED_PARAGRAPH_LINE}`,
      },
      { status: DEGRADED, detail: '表格结构没有进入工作表示；稿件中只有其文字，导出无法恢复表格结构。' }),
    row('images-captions', '图片与图注', 'imagesCaptions', '未检测到图片或图注。',
      { status: RETAINED, detail: '图片随来源版本保留，导出时恢复；图注作为文字留在稿件中，稿件暂不显示图片占位。' },
      { status: DEGRADED, detail: '图片没有进入工作表示，稿件中不含图片，导出无法恢复。' }),
    row('sections', '分节（含页面设置）', 'sections', '未检测到分节或页面设置；正文按单一连续稿件顺序导入。',
      { status: RETAINED, detail: '页尺寸、页边距、分栏与文档网格等分节设置随来源版本保留，导出时恢复；稿件按单一连续顺序编辑正文。' },
      { status: DEGRADED, detail: '分节与页面设置没有进入工作表示；正文按单一连续稿件顺序导入，导出无法恢复原分节版式。' }),
    row('headers-footers', '页眉与页脚', 'headersFooters', '未检测到页眉或页脚。',
      { status: RETAINED, detail: '页眉与页脚不进入稿件正文，随来源版本保留，导出时恢复。' },
      { status: DEGRADED, detail: '页眉与页脚没有进入工作表示，不进入稿件，导出无法恢复。' }),
    row('text-boxes', '文本框', 'textBoxes', '未检测到文本框。',
      { status: RETAINED, detail: TEXT_BOX_DETAILS[textBoxDisposition] },
      { status: DEGRADED, detail: '文本框没有进入工作表示，不进入稿件，导出无法恢复。' }),
    row('fields', '域（目录等）', 'fields', '未检测到域。',
      {
        status: DEGRADED,
        detail: '目录、交叉引用、页码等域按当前显示的文字进入稿件，之后不再更新；未改过的段落导出时从原文件恢复，改过的段落在导出保真审阅里逐段说明。',
      },
      { status: DEGRADED, detail: '域只保留当前显示的文字，之后不再更新。' }),
    {
      key: 'round-trip-export', label: '预计往返', count: 0, ...UNSUPPORTED,
      detail: 'DOCX 导出将在后续提供。届时从原文件恢复未改过的段落，以及随文件保留的页眉与页脚、页面设置、样式表、图片和保留为文本框的文本框；改过的段落在导出保真审阅里逐段说明能否原样恢复。样式表随文件保留，不单独计数。',
    },
  ];
}
