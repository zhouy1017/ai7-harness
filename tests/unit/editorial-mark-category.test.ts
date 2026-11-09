import { expect, it } from 'vitest';
import { resolveEditorialMarkCategory } from '../../src/shared/editorial-mark-category.js';

it.each([
  ['事实核查', 'factual', '【事实核查】'],
  ['情节与人物一致性', 'consistency', '【剧情逻辑】'],
  ['跨交付物一致性', 'consistency', '【剧情逻辑】'],
  ['文学性与表达改进', 'literary', '【文学表达】'],
  ['错别字与规范用语', 'language', '【字词规范】'],
  ['本地文字检查', 'language', '【字词规范】'],
  ['排版与体例', 'style', '【格式体例】'],
  ['出版风险与合规提示', 'risk', '【合规风险】'],
  ['合规规范表达', 'risk', '【合规风险】'],
  [' 自定类别 ', 'other', '【自定类别】'],
  [null, 'other', '【批注】'],
])('classifies source label %s (#1429)', (sourceLabel, key, badgeText) => {
  expect(resolveEditorialMarkCategory({ sourceKind: 'ai7', sourceOrigin: 'review-category', sourceLabel, note: '事实核查' }))
    .toMatchObject({ key, badgeText });
});

it('gives an editor mark precedence over its source label', () => {
  expect(resolveEditorialMarkCategory({ sourceKind: 'editor', sourceOrigin: null, sourceLabel: '事实核查' }))
    .toEqual({ key: 'editor', label: '编辑人工修订', badgeText: '【编辑修订】' });
});
