import { IMPORT_RETENTION_SCHEMA_SQL } from '../../src/service/import-retention.js';
import type { FidelityCategoryProjection } from '../../src/shared/protocol.js';

/**
 * The four import-retention relations schema revision 27 adds (Issue #410), in an order that drops every
 * relation before the one it refers to. A suite that plants a store at an earlier revision drops them with
 * whatever else later revisions added: a store that old never held them. Revision 27 also widened
 * `import_fidelity_categories`; a planted store keeps the widened text and the rows this build wrote, which
 * every earlier revision's exact validation accepts beside revision 26's own text.
 */
export const IMPORT_RETENTION_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(IMPORT_RETENTION_SCHEMA_SQL).reverse();

/**
 * The eight rows exact `sample1` carried under parser identity `ai7-docx-fflate-saxes/1`, as the frozen
 * builder must still rebuild them for every review recorded before ADR 0086.
 */
export const SAMPLE1_V1_REPORT: ReadonlyArray<FidelityCategoryProjection> = [
  { key: 'inline-styles', label: '行内样式', count: 266, status: 'degraded', statusLabel: '降级导入', detail: '检测到字体与字号（rFonts、sz、szCs）等行内样式；可编辑内容块仅保留文字顺序，后续导出无法恢复这些样式。' },
  { key: 'comments-revisions', label: '批注与修订', count: 0, status: 'preserved', statusLabel: '完整保留', detail: '未检测到批注或修订标记。' },
  { key: 'notes', label: '脚注与尾注', count: 0, status: 'preserved', statusLabel: '完整保留', detail: '未检测到脚注或尾注。' },
  { key: 'tables', label: '表格', count: 0, status: 'preserved', statusLabel: '完整保留', detail: '未检测到表格。' },
  { key: 'images-captions', label: '图片与图注', count: 0, status: 'preserved', statusLabel: '完整保留', detail: '未检测到图片或图注。' },
  { key: 'sections', label: '分节', count: 1, status: 'degraded', statusLabel: '降级导入', detail: '检测到页尺寸、页边距、分栏与文档网格等分节设置；正文按单一连续稿件顺序导入，后续导出无法恢复原分节版式。' },
  { key: 'headers-footers', label: '页眉与页脚', count: 0, status: 'preserved', statusLabel: '完整保留', detail: '未检测到页眉或页脚。' },
  { key: 'round-trip-export', label: 'DOCX 往返与导出预期', count: 0, status: 'unsupported', statusLabel: '不支持导入', detail: '本导入功能不提供 DOCX 导出，因此无法建立往返行为、版式复原或导出结果保证。' },
];
