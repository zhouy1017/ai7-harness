// 帮助's content (Issue #939, wave 11 slice 11f; Owner decision 27): the task-oriented 使用帮助 sections and the plain-word
// 隐私说明. Every section names the exact Chinese labels the renderer shows, taken from the label owners, so a reader can
// follow a sentence straight to the screen it points at. 隐私说明 states only what the active policy set enforces
// (docs/policies/README.md, MSET-008, slice 11e) and makes no legal promise.

import { SETTINGS_HUB_GROUPS, SHELL_BOOK_GROUPS, SHELL_DESTINATIONS, SHELL_SETTINGS } from './shell-labels.js';
import { TASK_PANEL_TITLE } from './task-panel-labels.js';
import { TASK_BAR_START } from './task-drawer-labels.js';
import { KNOWLEDGE_BASE_TAB_VIEWS } from './knowledge-base-labels.js';
import { MILESTONE_FORM_WORDS, PUBLICATION_ACTION_LABELS } from './deliverables-labels.js';

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
    `在「${sectionLabel('manuscript')}」打开「${TASK_PANEL_TITLE}」，或在「${sectionLabel('deliverables')}」发起任务；完成后需要你确认的事项出现在「${destinationLabel('attention')}」。`,
  ] },
  { heading: '审阅与评估', paragraphs: [
    `${sectionLabel('review')}按类别给出结果与审阅报告，${sectionLabel('evaluation')}给出评估与审稿意见；两者都要你在原页面作出决定。`,
  ] },
  { heading: '交付物', paragraphs: [
    `${sectionLabel('deliverables')}管理发稿、交付与图书交付包：先在稿件里选「${MILESTONE_FORM_WORDS.summary}」，再到交付物选「${PUBLICATION_ACTION_LABELS.designate}」，然后按关口推进。`,
  ] },
  { heading: '知识库与工序', paragraphs: [
    `${destinationLabel('knowledge')}七类：${KNOWLEDGE_BASE_TAB_VIEWS.map((entry) => entry.label).join('、')}；任务只选用并记版本。`,
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
    'AI7 默认在本机处理文档、索引与检索；本地处理不联网。',
  ] },
  { heading: '什么会离开本机', paragraphs: [
    `任务计划由你选择「${TASK_BAR_START}」开始；模型请求只按当前生效的模型处理策略发送，可能包含任务获准读取的稿件、资料与提问。`,
    '你主动提问、润色、翻译或快速开始时，也可能发送策略允许的模型请求；已登记的后台分析可在登记范围与预算内运行。',
    '联网检索只发送模型提出的查询；抓取只读取模型引用的公开网页，两者都须当前策略允许，并限于获准使用它们的任务。',
  ] },
  { heading: '凭据', paragraphs: [
    '模型服务凭据保存在系统保护位置，界面只显示连接名与状态；凭据不会被显示、复制、导出，也不会进入任务文本或诊断包。',
  ] },
  { heading: '不上传', paragraphs: [
    'AI7 不发送遥测，不自动上传诊断包。',
  ] },
  { heading: '诊断包', paragraphs: [
    '诊断包由你手动导出到本机，导出前已去掉稿件内容与凭据。',
  ] },
]);
