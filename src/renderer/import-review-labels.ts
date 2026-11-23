import { localInstantLabel } from './plan-preview-labels.js';

export const IMPORT_RELATIONSHIP_LABELS = {
  'first-manuscript': '作为首份稿件导入',
  'source-only': '存为来源材料',
  reimport: '更新稿件',
} as const;

export function importFileLabel(item: { displayName: string | null; importedAt: string }): string {
  return `${item.displayName ?? '未记录文件名'} · 导入于 ${localInstantLabel(item.importedAt)}`;
}
