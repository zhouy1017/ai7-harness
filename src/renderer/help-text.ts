// 帮助's content (Issue #939, wave 11 slice 11f; Owner decision 27): the task-oriented 使用帮助 sections and the plain-word
// 隐私说明. Every section names the exact Chinese labels the renderer shows, taken from the label owners, so a reader can
// follow a sentence straight to the screen it points at. 隐私说明 states only what the active policy set enforces
// (docs/policies/README.md, MSET-008, slice 11e) and makes no legal promise.

import { SETTINGS_HUB_GROUPS, SHELL_BOOK_GROUPS, SHELL_DESTINATIONS, SHELL_SETTINGS } from './shell-labels.js';

export interface HelpSection {
  readonly heading: string;
  readonly paragraphs: ReadonlyArray<string>;
}

function destinationLabel(key: (typeof SHELL_DESTINATIONS)[number]['key']): string {
  return SHELL_DESTINATIONS.find((entry) => entry.key === key)!.label;
}

function sectionLabel(key: string): string {
  return SHELL_BOOK_GROUPS.flatMap((group) => group.sections).find((section) => section.key === key)!.label;
}

/** 使用帮助: seven short sections mirroring the destinations a reader works in. */
export const HELP_USAGE_SECTIONS: ReadonlyArray<HelpSection> = Object.freeze([
  { heading: '书库与稿件导入', paragraphs: [
    `${destinationLabel('library')}是全部图书；点「新建图书」建空图书，点「导入稿件」导入文件。打开一本书会回到它上次的「${sectionLabel('manuscript')}」位置。`,
  ] },
  { heading: '任务与运行', paragraphs: [
    `${sectionLabel('manuscript')}与${sectionLabel('deliverables')}的「任务面」发起任务；完成后需要你确认的事项出现在${destinationLabel('attention')}。`,
  ] },
  { heading: '审阅与评估', paragraphs: [
    `${sectionLabel('review')}按类别给出结果与审阅报告，${sectionLabel('evaluation')}给出评估与审稿意见；两者都要你在原页面作出决定。`,
  ] },
  { heading: '交付物', paragraphs: [
    `${sectionLabel('deliverables')}管理发稿、交付与图书交付包：先保存里程碑版本，再设为发稿版本，然后按关口推进。`,
  ] },
  { heading: '知识库与工序', paragraphs: [
    `${destinationLabel('knowledge')}七类：审阅规范文件、评估方案、工序与规则、社级编辑记忆、范例、资料库、外部来源留存；任务只选用并记版本。`,
  ] },
  { heading: '书系', paragraphs: [
    `${destinationLabel('series')}管理成员与共享范围、书系知识与检索排除；书系一致性审阅在成员图书的「${sectionLabel('review')}」里。`,
  ] },
  { heading: '设置', paragraphs: [
    `${SHELL_SETTINGS.label}分服务、编辑工作、本机三组：${SETTINGS_HUB_GROUPS.flatMap((group) => group.rows.map((row) => row.label)).join('、')}。`,
  ] },
]);

/** 隐私说明: local-first by default, what may leave the machine and under which policy, and what never does. */
export const HELP_PRIVACY_SECTIONS: ReadonlyArray<HelpSection> = Object.freeze([
  { heading: '本机处理', paragraphs: [
    'AI7 默认在本机处理文档、索引与检索，不联网。',
  ] },
  { heading: '什么会离开本机', paragraphs: [
    '只有你选择「开始任务」后，模型请求才会按当前生效的模型处理策略发送；策略允许的联网检索或抓取也只在对应任务里发生。',
  ] },
  { heading: '凭据', paragraphs: [
    '模型服务凭据保存在系统保护位置，界面只显示连接名与状态；凭据不会被显示、复制、导出，也不会进入任务文本或诊断包。',
  ] },
  { heading: '不上传', paragraphs: [
    'AI7 不发送遥测，也不会自动上传任何内容。',
  ] },
  { heading: '诊断包', paragraphs: [
    '诊断包由你手动导出到本机，导出前已去掉稿件内容与凭据。',
  ] },
]);
