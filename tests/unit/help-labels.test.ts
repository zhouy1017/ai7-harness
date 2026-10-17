import { describe, expect, it } from 'vitest';
import {
  HELP_ABOUT_HEADING, HELP_ENTRY, HELP_LICENSE_TEXT_ABSENT, HELP_TABS, helpAboutLine, helpLicenseCount,
} from '../../src/renderer/help-labels.js';
import { HELP_PRIVACY_SECTIONS, HELP_USAGE_SECTIONS } from '../../src/renderer/help-text.js';
import { SETTINGS_HUB_GROUPS, SHELL_BOOK_GROUPS, SHELL_DESTINATIONS, SHELL_SETTINGS } from '../../src/renderer/shell-labels.js';

// #939 slice 11f: 帮助's words. The entry sits beside 设置, the tabs are fixed, the 关于 line carries the three version
// readings, 使用帮助 mirrors the destinations with their exact labels, and 隐私说明 claims only what the policies enforce.
describe('the 帮助 entry and tabs', () => {
  it('names 帮助 beside 设置 with a one-character icon', () => {
    expect(HELP_ENTRY.label).toBe('帮助');
    expect([...HELP_ENTRY.icon]).toHaveLength(1);
    expect(HELP_ENTRY.label).toContain(HELP_ENTRY.icon);
    expect(SHELL_SETTINGS.label).toBe('设置');
  });

  it('keeps the three tabs in their fixed order', () => {
    expect(HELP_TABS.map((entry) => [entry.tab, entry.label])).toEqual([
      ['usage', '使用帮助'], ['privacy', '隐私说明'], ['licenses', '第三方许可'],
    ]);
  });

  it('states the software version, the Data Version and the service protocol', () => {
    expect(HELP_ABOUT_HEADING).toBe('关于');
    expect(helpAboutLine('0.1.0', 83, 151)).toBe('软件版本 0.1.0 · 数据版本 83 · 服务协议 151');
  });

  it('counts the filter result against the whole list', () => {
    expect(helpLicenseCount(3, 88)).toBe('3 / 88 个组件');
  });

  it('uses the same absent-text sentence the license tool writes', async () => {
    // @ts-expect-error tools/*.mjs carry no declarations; the constant is read as the plain module it is.
    const tool = (await import('../../tools/generate-licenses.mjs')) as unknown as { LICENSE_TEXT_ABSENT: string };
    expect(HELP_LICENSE_TEXT_ABSENT).toBe(tool.LICENSE_TEXT_ABSENT);
  });
});

describe('使用帮助', () => {
  it('mirrors the destinations and Book sections with their exact labels', () => {
    const text = HELP_USAGE_SECTIONS.map((section) => `${section.heading}${section.paragraphs.join('')}`).join('\n');
    const usedDestinations = SHELL_DESTINATIONS.filter((entry) => ['library', 'attention', 'series', 'knowledge'].includes(entry.key));
    const labels = [
      ...usedDestinations.map((entry) => entry.label),
      SHELL_SETTINGS.label,
      ...SETTINGS_HUB_GROUPS.flatMap((group) => group.rows.map((row) => row.label)),
      ...SHELL_BOOK_GROUPS.flatMap((group) => group.sections)
        .filter((section) => ['manuscript', 'review', 'evaluation', 'deliverables'].includes(section.key))
        .map((section) => section.label),
    ];
    for (const label of labels) expect(text).toContain(label);
    expect(text).toContain('新建图书');
    expect(text).toContain('导入稿件');
    expect(HELP_USAGE_SECTIONS.map((section) => section.heading)).toEqual([
      '书库与稿件导入', '任务与运行', '审阅与评估', '交付物', '知识库与工序', '书系', '设置',
    ]);
  });

  it('stays task-oriented: no marketing and at most 120 characters per paragraph', () => {
    expect(HELP_USAGE_SECTIONS).toHaveLength(7);
    for (const section of HELP_USAGE_SECTIONS) {
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) {
        expect([...paragraph].length).toBeLessThanOrEqual(120);
        for (const banned of ['最好', '免费', '强大', '立即体验', '😀']) expect(paragraph).not.toContain(banned);
      }
    }
  });
});

describe('隐私说明', () => {
  it('states the facts the active policy set enforces and nothing stronger', () => {
    const text = HELP_PRIVACY_SECTIONS.map((section) => section.paragraphs.join('')).join('\n');
    expect(text).toContain('本机');
    expect(text).toContain('不联网');
    expect(text).toContain('开始任务');
    expect(text).toContain('模型处理策略');
    expect(text).toContain('凭据');
    expect(text).toContain('诊断包');
    expect(text).toContain('遥测');
    for (const forbidden of ['法律', '律师', '绝对安全', '保证不']) expect(text).not.toContain(forbidden);
    for (const section of HELP_PRIVACY_SECTIONS) {
      for (const paragraph of section.paragraphs) expect([...paragraph].length).toBeLessThanOrEqual(120);
    }
  });
});
