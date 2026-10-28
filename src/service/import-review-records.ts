import type { ImportFidelityPlan } from './docx.js';

/**
 * What a Review Before Import says it will create and what it will not (ADR 0086 §3; Issue #411), moved out of `store.ts`
 * (Issue #1205, F-25) unchanged: the records an import makes, in the order the review lists them, and its named non-effects.
 */

const BASE_RECORDS_TO_CREATE = [
  '图书与稳定标识',
  '图书编辑维度集（8 项）',
  '源材料版本与来源记录',
  '导入保真审阅',
  '主稿件',
  '稿件分支',
  '稿件修订版 r1 与有序稳定内容块',
  // ADR 0086 §3: which source paragraph each block of r1 came from, so an unedited block can be
  // restored from it on export.
  '来源段落对应',
  '工作流程实例与精确方案版本绑定',
  '稿件导入记录',
] as const;
const NON_EFFECTS = [
  '不创建书系或书系成员关系',
  '不创建编辑学习准入决定',
  '不授予或执行模型提供方传输',
  '不创建发稿版本',
  '不创建公开发布许可或公开发布事实',
  '不导出、不发送、不交付、不发布',
  // ADR 0086 §3: the original stays whole with the Source Version; import reads it and changes nothing.
  '不修改所选原文件',
] as const;
const CLEAN_IMPORT_NON_EFFECT = '符合当前范围的导入不创建导入降级决定';
/** What an import that converts a file's comments and tracked changes also creates (Issue #411, D4). */
export function importedMarksRecord(count: number): string {
  return `来自文件作者的批注与修改建议 ${count} 条`;
}

export function recordsToCreate(
  plan: ImportFidelityPlan,
  targetKind: 'new-book' | 'existing-book' = 'new-book',
  word?: { reusedSourceVersionId: string | null; eligibleSamples: number },
): ReadonlyArray<string> {
  let base: ReadonlyArray<string> = targetKind === 'existing-book' ? BASE_RECORDS_TO_CREATE.slice(2) : BASE_RECORDS_TO_CREATE;
  if (word !== undefined) {
    // A Word intake maps blocks through its own source segments, never the one-paragraph rows, and may reuse
    // the exact same-byte Source Version this empty Book already retains instead of creating one.
    base = base.flatMap((record) => record === '源材料版本与来源记录' && word.reusedSourceVersionId !== null
      ? [`沿用本书已保留的同一来源版本 ${word.reusedSourceVersionId}（不新建来源版本）`]
      : record === '来源段落对应'
        ? ['Word 修订来源、导入选择与稿件来源片段对应',
          ...(word.eligibleSamples > 0 ? [`Word 修改样本、导入准入与本机学习信号 ${word.eligibleSamples} 条`] : [])]
        : [record]);
  }
  // The marks stand on r1's blocks, so they follow the block-source mapping.
  const sourcesIndex = base.indexOf(word === undefined ? '来源段落对应' : 'Word 修订来源、导入选择与稿件来源片段对应');
  const records = plan.importedMarks === 0
    ? base
    : [...base.slice(0, sourcesIndex + 1), importedMarksRecord(plan.importedMarks), ...base.slice(sourcesIndex + 1)];
  if (plan.degradations.length === 0) return records;
  const fidelityIndex = records.indexOf('导入保真审阅');
  return [...records.slice(0, fidelityIndex + 1), '导入降级决定', ...records.slice(fidelityIndex + 1)];
}

export function nonEffects(plan: ImportFidelityPlan): ReadonlyArray<string> {
  return plan.degradations.length === 0 ? [...NON_EFFECTS, CLEAN_IMPORT_NON_EFFECT] : NON_EFFECTS;
}
