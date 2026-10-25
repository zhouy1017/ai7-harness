import { IMPORT_RETENTION_SCHEMA_SQL, WORD_IMPORT_RETENTION_SCHEMA_SQL } from '../../src/service/import-retention.js';
import type { FidelityCategoryProjection, StagedImportProjection } from '../../src/shared/protocol.js';
import type { EditorialStore } from '../../src/service/store.js';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

/**
 * Historical /3 draft fixture, not a new public Word import: source-only preparation invokes the actual preserved old reader
 * to stage its real blocks, fidelity, source map and marks. Removing only the successor inventory and resetting the transient
 * review models the draft an old reader left; subsequent preparation/commit/reopen still run the unchanged historical owner.
 */
export function stageHistoricalTrackedDocxFixture(store: EditorialStore, dataRoot: string, staged: StagedImportProjection) {
  if (staged.wordTrackedChanges === undefined) throw new Error('historical tracked fixture requires a revision inventory');
  const target = staged.targetChoices.find((choice) => choice.kind === 'new-book');
  if (target === undefined) throw new Error('historical fixture requires its actual new-Book target choice');
  const sourceReview = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: target.id, confirmedTitle: staged.titleSuggestion.value, relationship: 'source-only' });
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'));
  let fidelity: unknown;
  try {
    db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
    db.prepare('DELETE FROM staged_word_revision_intakes WHERE draft_id = ?').run(staged.draftId);
    const changed = db.prepare(`UPDATE import_drafts SET state = 'staged', reviewed_title = NULL, reviewed_target_choice_id = NULL,
      reviewed_target_kind = NULL, reviewed_existing_book_id = NULL, reviewed_relationship = NULL,
      reviewed_book_state_digest = NULL, reviewed_reuse_source_version_id = NULL, review_digest = NULL, reviewed_at = NULL
      WHERE draft_id = ? AND state = 'reviewed' AND draft_version = ?`).run(staged.draftId, sourceReview.draftVersion);
    if (changed.changes !== 1) throw new Error('historical draft fixture lost its exact transient parent');
    const snapshot = db.prepare('SELECT fidelity_json FROM staged_import_snapshots WHERE draft_id = ?').get(staged.draftId);
    if (typeof snapshot?.fidelity_json !== 'string') throw new Error('historical reader did not retain its real fidelity');
    fidelity = JSON.parse(snapshot.fidelity_json);
    db.exec('COMMIT');
  } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
  return { draftId: staged.draftId, draftVersion: sourceReview.draftVersion, titleSuggestion: staged.titleSuggestion, fidelity };
}

/**
 * The four import-retention relations schema revision 27 adds (Issue #410), in an order that drops every
 * relation before the one it refers to. A suite that plants a store at an earlier revision drops them with
 * whatever else later revisions added: a store that old never held them. Revision 27 also widened
 * `import_fidelity_categories`; a planted store keeps the widened text and the rows this build wrote, which
 * every earlier revision's exact validation accepts beside revision 26's own text.
 */
export const IMPORT_RETENTION_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(IMPORT_RETENTION_SCHEMA_SQL).reverse();
/** Every Word relation, transient included, before its own parent relation. */
export const WORD_IMPORT_RETENTION_RELATIONS_DROP_ORDER: ReadonlyArray<string> = Object.keys(WORD_IMPORT_RETENTION_SCHEMA_SQL).reverse();

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
