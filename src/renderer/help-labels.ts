// 帮助's words (Issue #939, wave 11 slice 11f; Owner decision 27; editor-surfaces §0.3): the sidebar entry beside 设置, the
// three tabs, the 关于 line and the 第三方许可 list's chrome. The tab content itself lives in help-text.ts; both name the
// exact labels the rest of the UI uses, so a reader can follow a sentence straight to where it points.

/** The 帮助 entry in the sidebar's bottom area, beside 设置 (11a left `[data-shell-slot="help"]`). */
export const HELP_ENTRY = Object.freeze({ label: '帮助', icon: '帮' });

export const HELP_TITLE = '帮助';
export const HELP_BREADCRUMB = '帮助';
export const HELP_LEDE = '使用说明、隐私说明与第三方许可都在本机读取，打开这里不会更改任何记录。';
export const HELP_OPENED = '帮助已打开';
export const HELP_BACK = '返回';

export type HelpTab = 'usage' | 'privacy' | 'licenses';

/** The three tabs in their fixed order. */
export const HELP_TABS: ReadonlyArray<{ readonly tab: HelpTab; readonly label: string }> = Object.freeze([
  { tab: 'usage', label: '使用帮助' },
  { tab: 'privacy', label: '隐私说明' },
  { tab: 'licenses', label: '第三方许可' },
]);
export const HELP_TABS_LABEL = '帮助分类';

export const HELP_ABOUT_HEADING = '关于';
export const HELP_ABOUT_LOADING = '正在读取版本…';
export const HELP_ABOUT_FAILED = '无法读取版本信息，请稍后重试。';

/** 关于: the software version, the Data Version and the service protocol, as 设置 › 数据与存储 states them. */
export function helpAboutLine(softwareVersion: string, dataVersion: number, protocolVersion: number): string {
  return `软件版本 ${softwareVersion} · 数据版本 ${dataVersion} · 服务协议 ${protocolVersion}`;
}

export const HELP_LICENSE_FILTER_LABEL = '筛选第三方组件';
export const HELP_LICENSE_FILTER_PLACEHOLDER = '输入组件名筛选';
export const HELP_LICENSE_EMPTY = '没有匹配的组件。';
export const HELP_LICENSE_TEXT_SUMMARY = '查看许可文本';
export const HELP_LICENSE_FIELD_LICENSE = '许可';
export const HELP_LICENSE_FIELD_SOURCE = '来源';
export const HELP_LICENSE_NO_SOURCE = '未注明';
export const HELP_LICENSE_LOCAL_NOTE = '本机安装的包附许可文本；其他平台的包只列名称与版本。';
/** The exact sentence a package with no shipped license file states; tools/generate-licenses.mjs writes the same literal. */
export const HELP_LICENSE_TEXT_ABSENT = '文本未随包提供';

/** `12 / 88 个组件` for the current filter, in the same order the list shows them. */
export function helpLicenseCount(listed: number, total: number): string {
  return `${listed} / ${total} 个组件`;
}
