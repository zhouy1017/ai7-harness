import type { EditorialMarkSourceProjection } from './protocol.js';

export type EditorialMarkCategoryKey = 'factual' | 'consistency' | 'literary' | 'language' | 'style' | 'risk' | 'editor' | 'other';

export const EDITORIAL_MARK_CATEGORIES = {
  factual: { key: 'factual', label: '事实与知识核查', badgeText: '【事实核查】' },
  consistency: { key: 'consistency', label: '剧情与人物逻辑', badgeText: '【剧情逻辑】' },
  literary: { key: 'literary', label: '文学性与表达', badgeText: '【文学表达】' },
  language: { key: 'language', label: '错别字与规范', badgeText: '【字词规范】' },
  style: { key: 'style', label: '格式与体例', badgeText: '【格式体例】' },
  risk: { key: 'risk', label: '合规与风险提示', badgeText: '【合规风险】' },
  editor: { key: 'editor', label: '编辑人工修订', badgeText: '【编辑修订】' },
  other: { key: 'other', label: '常规批注', badgeText: '【批注】' },
} as const;

/** Source labels carry the category; manuscript words and rationale never guess one. */
export function resolveEditorialMarkCategory(input: {
  sourceKind: EditorialMarkSourceProjection['kind'];
  sourceOrigin: EditorialMarkSourceProjection['origin'];
  sourceLabel: string | null;
  note?: string | null;
}): { key: EditorialMarkCategoryKey; label: string; badgeText: string } {
  if (input.sourceKind === 'editor') return EDITORIAL_MARK_CATEGORIES.editor;
  const label = input.sourceLabel?.trim() ?? '';
  // Specific risk/consistency labels precede generic words such as 规范 and 表达.
  const rules: ReadonlyArray<readonly [RegExp, EditorialMarkCategoryKey]> = [
    [/风险|合规|敏感/u, 'risk'],
    [/情节|人物|逻辑|时间线|一致性|跨交付物/u, 'consistency'],
    [/事实|知识|考证|核查/u, 'factual'],
    [/文学|表达|润色|文风|修辞|改写/u, 'literary'],
    [/错别字|病句|规范|本地文字|标点|语病/u, 'language'],
    [/体例|格式|排版/u, 'style'],
  ];
  for (const [pattern, key] of rules) if (pattern.test(label)) return EDITORIAL_MARK_CATEGORIES[key];
  return { key: 'other', label: label || '常规批注', badgeText: `【${label || '批注'}】` };
}
