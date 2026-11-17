
import { navigation, type NavigationCheckpoint } from './navigation-generation.js';
import { technicalLayerVisible } from './technical-layer.js';
import { APPEARANCE_BACK, APPEARANCE_CHOICES, APPEARANCE_LEDE, APPEARANCE_LEGEND, APPEARANCE_SAVED, APPEARANCE_SAVE_FAILED, APPEARANCE_SECTION, APPEARANCE_STATUS, APPEARANCE_TITLE } from './appearance-labels.js';
import { mountLearningAskFrequency } from './learning-settings.js';
import { NOTIFICATION_SETTINGS_WORDS } from './notification-labels.js';
import { mountEvaluationCalibration } from './evaluation-calibration.js';
import { configureCommandLabels } from './commands.js';
import { mountKeyboardSettings } from './keyboard-settings.js';
import { KEYBOARD_SECTION_LABEL, KEYBOARD_TITLE } from './keyboard-labels.js';
import { mountUsage } from './usage.js';
import { USAGE_RETURN, USAGE_SECTION_LABEL, USAGE_TITLE, USAGE_RUN_TITLE, USAGE_RUN_REPORT_ABSENT, usageRunIdentity } from './usage-labels.js';
import { CALIBRATION_PAGE_GROUP, CALIBRATION_PAGE_TITLE, CALIBRATION_STATUS } from './evaluation-calibration-labels.js';
import { ViewPreferences, renderViewSettings } from './layout.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { type ShellPlace } from './shell.js';
import { developerModeRow, mountHelp } from './help.js';
import { HELP_OPENED } from './help-labels.js';
import { SETTINGS_HUB_GROUPS, SETTINGS_HUB_WORDS, type SettingsRoute } from './shell-labels.js';
import type { RendererApi } from '../shared/protocol.js';

interface Options {
  setStatus: (message: string, tone?: "busy" | "success" | "error") => void;
  panel: () => HTMLElement;
  element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  button: (label: string, className: "primary" | "secondary" | "quiet", action: () => void | Promise<void>) => HTMLButtonElement;
  returnToOrigin: () => Promise<void>;
  replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
  api: RendererApi & import("../shared/preferences.js").PreferencesRendererApi & import("../shared/appearance.js").AppearanceRendererApi & import("../shared/preferences.js").NotificationsRendererApi;
  rendererErrorMessage: (error: unknown, fallback: string) => string;
  screen: HTMLElement;
  renderRunReport: (report: import("../shared/protocol.js").AnalysisRunReportSummaryProjection) => HTMLElement;
  applyKeyboardBindings: (bindings: Parameters<typeof configureCommandLabels>[1]) => void;
  keyboardSettingsOff: (() => void) | undefined;
  renderModelServiceSettings: (focus?: "search") => Promise<void>;
  renderDataAndStorage: () => Promise<void>;
  renderDiagnostics: () => void;
  appearance: { ready: Promise<void>; readonly preference: import("../shared/appearance.js").ThemePreference; subscribe(listener: () => void): () => boolean; choose(value: import("../shared/appearance.js").ThemePreference): Promise<void>; };
  initializeStartup: (navigationRoute?: NavigationCheckpoint) => Promise<void>;
  viewPreferences: ViewPreferences;
}

export function createSettingsScreens(state: Options) {
  const { setStatus, panel, element, button, returnToOrigin, replaceScreen, api, rendererErrorMessage, screen, renderRunReport, applyKeyboardBindings, renderModelServiceSettings, renderDataAndStorage, renderDiagnostics, appearance, initializeStartup, viewPreferences } = state;


async function renderEvaluationCalibration(focusBookId: string | null): Promise<void> {
  if (!technicalLayerVisible) {
    renderSettingsHub();
    setStatus('该页在开发者模式下显示');
    return;
  }
  const content = panel();
  content.classList.add('evaluation-calibration-page');
  const host = element('div');
  const back = element('div', 'button-row');
  back.append(button('返回', 'quiet', () => void returnToOrigin()));
  content.append(
    element('p', 'section-label', `设置 · ${CALIBRATION_PAGE_GROUP}`),
    element('h2', undefined, CALIBRATION_PAGE_TITLE),
    host,
    back,
  );
  replaceScreen('evaluation-calibration', content);
  const page = navigation.read(content);
  setStatus(CALIBRATION_STATUS.loading, 'busy');
  const surface = mountEvaluationCalibration({ root: host, focusBookId, api: api, setStatus, errorMessage: rendererErrorMessage });
  try {
    await surface.load();
    if (!page.isCurrent()) return;
    setStatus(CALIBRATION_STATUS.opened);
  } catch (error) {
    if (!navigation.errorIsCurrent(error, page)) return;
    setStatus(rendererErrorMessage(error, CALIBRATION_STATUS.unavailable), 'error');
  }
}

/** 设置 › 本机 › 通知 (Issue #937; NOTIF-005 to 007): four local switches, all off by default; none grants authority. */
async function renderNotificationSettings(): Promise<void> {
  const navigationRoute = navigation.begin();
  const preferences = await api.getPreferences();
  if (!navigationRoute.isCurrent()) return;
  let values = preferences.values;
  const content = panel();
  content.dataset['notificationSettings'] = 'true';
  content.append(element('h2', undefined, NOTIFICATION_SETTINGS_WORDS.title), element('p', 'field-note', NOTIFICATION_SETTINGS_WORDS.note));
  if (preferences.notice) content.append(element('p', 'attention-note', preferences.notice));
  const rows = [
    ['notifications.enabled', NOTIFICATION_SETTINGS_WORDS.enabled],
    ['notifications.completions', NOTIFICATION_SETTINGS_WORDS.completions],
    ['notifications.sound', NOTIFICATION_SETTINGS_WORDS.sound],
    ['notifications.bookName', NOTIFICATION_SETTINGS_WORDS.bookName],
  ] as const;
  const controls = new Map<string, HTMLInputElement>();
  const paint = (): void => {
    for (const [key] of rows) {
      const control = controls.get(key)!;
      control.checked = values[key];
      control.disabled = key === 'notifications.completions' && !values['notifications.enabled'];
    }
  };
  for (const [key, label] of rows) {
    const row = element('label', 'settings-row');
    const control = document.createElement('input');
    control.type = 'checkbox';
    control.setAttribute('role', 'switch');
    control.dataset['notificationPreference'] = key;
    controls.set(key, control);
    control.addEventListener('change', () => {
      const value = control.checked;
      control.disabled = true;
      void api.savePreference({ key, value }).then((saved) => {
        values = saved.values;
        setStatus(NOTIFICATION_SETTINGS_WORDS.saved, 'success');
      }).catch((error: unknown) => setStatus(rendererErrorMessage(error, NOTIFICATION_SETTINGS_WORDS.unsaved), 'error')).finally(() => {
        control.disabled = false;
        paint();
      });
    });
    const toggle = element('span', 'settings-switch');
    toggle.append(control);
    row.append(element('span', 'settings-row-copy', label), toggle);
    content.append(row);
  }
  paint();
  content.append(button(NOTIFICATION_SETTINGS_WORDS.back, 'secondary', renderSettingsHub));
  replaceScreen('notifications', content);
  setStatus(NOTIFICATION_SETTINGS_WORDS.opened);
}

/**
 * The exact persisted report of one historical Run, using the existing read-only report renderer (brief revision 2).
 * No current-plan lookup can redirect this link to another Run or make an old Run inaccessible.
 */
async function openUsageRun(run: import('../shared/protocol.js').UsageRunLinkProjection): Promise<void> {
  const current = navigation.begin();
  if (!technicalLayerVisible) {
    renderSettingsHub();
    setStatus('该页在开发者模式下显示');
    return;
  }
  const origin = screen.firstElementChild;
  try {
    const usage = await api.inspectUsage({ range: 'all', groupBy: 'book', runRecordId: run.runRecordId });
    if (!current.isCurrent() || screen.firstElementChild !== origin) return;
    if (usage.detail === null || usage.detail === undefined) throw new Error('USAGE_RUN_UNAVAILABLE');
    run = usage.detail;
    const content = panel();
    content.dataset['usageRunDetail'] = run.runRecordId;
    content.append(element('p', 'section-label', USAGE_SECTION_LABEL), element('h2', undefined, USAGE_RUN_TITLE),
      element('p', undefined, run.bookTitle), element('p', 'technical-identity', usageRunIdentity(run.runRecordId)));
    if (run.report === null) content.append(element('p', 'field-note', USAGE_RUN_REPORT_ABSENT));
    else {
      const report = renderRunReport(run.report);
      report.setAttribute('open', '');
      content.append(report);
    }
    content.append(button(USAGE_RETURN, 'quiet', () => renderUsage()));
    replaceScreen('usage-run', content);
    setStatus(USAGE_RUN_TITLE, 'success');
  } catch (error) {
    if (!navigation.errorIsCurrent(error, current)) return;
    setStatus(rendererErrorMessage(error, USAGE_RUN_REPORT_ABSENT), 'error');
  }
}

/** 设置 › 服务 › 用量 (Issue #936, plan slice 11c; V2-UX-MSET-010). */
function renderUsage(): void {
  if (!technicalLayerVisible) {
    renderSettingsHub();
    setStatus('该页在开发者模式下显示');
    return;
  }
  const content = panel();
  content.classList.add('usage-screen');
  content.append(element('p', 'section-label', USAGE_SECTION_LABEL), element('h2', undefined, USAGE_TITLE));
  const body = element('div');
  mountUsage({
    root: body, api: api, setStatus, errorMessage: rendererErrorMessage, instant: localInstantLabel,
    openRun: (run) => void openUsageRun(run),
  });
  const actions = element('div', 'button-row');
  actions.append(button(USAGE_RETURN, 'quiet', () => renderSettingsHub()));
  content.append(body, actions);
  replaceScreen('usage', content);
  setStatus(USAGE_TITLE, 'success');
}

/** 设置 › 本机 › 键盘与无障碍 › 快捷键 (Issue #936, plan slice 11c; V2-UX-KEY-002, KEY-003, KEY-011). */
function renderKeyboardSettings(): void {
  const content = panel();
  content.classList.add('keyboard-screen');
  content.append(element('p', 'section-label', KEYBOARD_SECTION_LABEL), element('h2', undefined, KEYBOARD_TITLE));
  const body = element('div');
  const unmount = mountKeyboardSettings({
    root: body, api: api, setStatus, errorMessage: rendererErrorMessage, onChanged: applyKeyboardBindings,
  });
  const actions = element('div', 'button-row');
  actions.append(button(USAGE_RETURN, 'quiet', () => renderSettingsHub()));
  content.append(body, actions);
  replaceScreen('keyboard', content);
  state.keyboardSettingsOff = unmount;
  setStatus(KEYBOARD_TITLE, 'success');
}

/**
 * 设置 (Issue #934; editor-surfaces §8.6): 服务 · 编辑工作 · 本机, one row per page. A page that exists keeps its own render
 * function and its `data-settings-route`; a row whose page a later slice of the wave brings is unavailable, 即将提供.
 */

function settingsPages(): Partial<Record<SettingsRoute, () => void>> {
  return {
    'model-service': () => void renderModelServiceSettings(),
    'evaluation-calibration': () => void renderEvaluationCalibration(null),
    'data-storage': () => void renderDataAndStorage(),
    appearance: renderAppearance,
    diagnostics: renderDiagnostics,
    help: renderHelp,
    usage: renderUsage,
    keyboard: renderKeyboardSettings,
    notifications: () => void renderNotificationSettings(),
  };
}

function settingsNavigation(state: string): HTMLElement {
  const nav = element('nav', 'settings-navigation');
  nav.setAttribute('aria-label', '设置分类');
  const hub = button('全部设置', 'quiet', renderSettingsHub);
  if (state === 'settings') hub.setAttribute('aria-current', 'page');
  nav.append(hub);
  const pages = settingsPages();
  for (const group of SETTINGS_HUB_GROUPS) {
    const section = element('section');
    section.append(element('h3', undefined, group.label));
    for (const row of group.rows.filter((row) => technicalLayerVisible || !row.developerOnly)) {
      const entry = button(row.label, 'quiet', () => pages[row.route]?.());
      entry.dataset['settingsNav'] = row.route;
      if (state === row.route) entry.setAttribute('aria-current', 'page');
      section.append(entry);
    }
    if (group.key === 'local') {
      const developer = button('开发者模式', 'quiet', () => {
        renderSettingsHub();
        screen.querySelector<HTMLInputElement>('.help-developer-mode input')?.focus();
      });
      section.append(developer);
    }
    nav.append(section);
  }
  return nav;
}

function renderSettingsHub(): void {
  const content = panel();
  content.classList.add('settings-hub');
  content.append(
    element('p', 'section-label', SETTINGS_HUB_WORDS.section),
    element('h2', undefined, SETTINGS_HUB_WORDS.title),
    element('p', 'lede', SETTINGS_HUB_WORDS.lede),
  );
  const pages = settingsPages();
  for (const group of SETTINGS_HUB_GROUPS) {
    const rows = group.rows.filter((row) => technicalLayerVisible || row.developerOnly !== true);
    if (rows.length === 0) continue;
    const section = element('section', 'settings-group');
    section.dataset['settingsGroup'] = group.key;
    const heading = element('h3', undefined, group.label);
    heading.id = `settings-group-${group.key}`;
    section.setAttribute('aria-labelledby', heading.id);
    const list = element('ul', 'settings-rows');
    for (const row of rows) {
      const item = element('li', 'settings-row');
      item.dataset['settingsEntry'] = row.route;
      const open = pages[row.route];
      const entry = button('打开', 'secondary', () => open?.());
      entry.classList.add('settings-hub-row');
      entry.setAttribute('aria-label', row.label);
      entry.dataset['settingsRoute'] = row.route;
      if (technicalLayerVisible && row.developerOnly === true) entry.dataset['developerOnly'] = 'true';
      const note = element('p', 'field-note', row.note);
      note.id = `settings-note-${row.route}`;
      entry.setAttribute('aria-describedby', note.id);
      const copy = element('div', 'settings-row-copy');
      copy.append(element('strong', undefined, row.label), note);
      item.append(copy, entry);
      if (open === undefined) {
        entry.disabled = true;
        item.dataset['settingsAvailability'] = 'coming-soon';
        const soon = element('span', 'settings-coming-soon', SETTINGS_HUB_WORDS.comingSoon);
        soon.id = `settings-soon-${row.route}`;
        entry.setAttribute('aria-describedby', `${soon.id} ${note.id}`);
        copy.append(soon);
      }
      list.append(item);
    }
    if (group.key === 'local') {
      const item = element('li');
      item.append(developerModeRow(() => {
        renderSettingsHub();
        screen.querySelector<HTMLInputElement>('.help-developer-mode input')?.focus();
      }));
      list.append(item);
    }
    section.append(heading, list);
    content.append(section);
  }
  if (technicalLayerVisible) mountLearningAskFrequency(content, api);
  replaceScreen('settings', content);
  setStatus(SETTINGS_HUB_WORDS.opened);
}

/**
 * Settings › Help (#1376 / #1382): a
 * 使用帮助 · 隐私说明 · 第三方许可 tab set and the 关于 line. Its versions come from the same service read 设置 › 数据与存储
 * uses, so the two screens cannot disagree.
 */
function renderHelp(): void {
  const content = panel();
  content.classList.add('help-screen');
  mountHelp({
    root: content,
    loadVersions: () => api.inspectDataVersion(),
    back: renderSettingsHub,
    modeChanged: () => {
      renderHelp();
      screen.querySelector<HTMLInputElement>('.help-developer-mode input')?.focus();
    },
  });
  replaceScreen('help', content);
  content.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  setStatus(HELP_OPENED);
}

function renderAppearance(): void {
  const content = panel();
  content.classList.add('appearance-settings');
  content.append(element('p', 'section-label', APPEARANCE_SECTION), element('h2', undefined, APPEARANCE_TITLE),
    element('p', 'lede', APPEARANCE_LEDE));
  const choices = element('fieldset', 'appearance-choices');
  choices.append(element('legend', undefined, APPEARANCE_LEGEND));
  const radios: HTMLInputElement[] = [];
  for (const choice of APPEARANCE_CHOICES) {
    const label = element('label', 'appearance-choice');
    const input = element('input');
    input.type = 'radio'; input.name = 'appearance-theme'; input.value = choice.value;
    input.dataset['appearanceTheme'] = choice.value;
    input.checked = appearance.preference === choice.value;
    // The radios stay enabled while saving: disabling the focused one would drop keyboard focus (KEY-013).
    input.addEventListener('change', () => {
      if (!input.checked) return;
      void appearance.choose(choice.value).then(() => { setStatus(APPEARANCE_SAVED, 'success'); }, () => {
        for (const radio of radios) radio.checked = radio.value === appearance.preference;
        setStatus(APPEARANCE_SAVE_FAILED, 'error');
      });
    });
    radios.push(input);
    label.append(input, element('strong', undefined, choice.label));
    choices.append(label);
  }
  const unsubscribe = appearance.subscribe(() => { for (const radio of radios) radio.checked = radio.value === appearance.preference; });
  const observer = new MutationObserver(() => { if (!content.isConnected) { unsubscribe(); observer.disconnect(); } });
  observer.observe(screen, { childList: true });
  const actions = element('div', 'button-row');
  actions.append(button(APPEARANCE_BACK, 'quiet', () => void initializeStartup()));
  // 工作区密度, 稿件阅读预设, 稿件排版 and 区域宽度 (Issue #951, wave 12 slice 12a; VIEW-001 to VIEW-009) share this page.
  const viewSettings = renderViewSettings(viewPreferences, setStatus);
  const viewObserver = new MutationObserver(() => { if (!content.isConnected) { viewSettings.destroy(); viewObserver.disconnect(); } });
  viewObserver.observe(screen, { childList: true });
  content.append(choices, viewSettings.element, actions);
  replaceScreen('appearance', content);
  setStatus(APPEARANCE_STATUS);
}

return { renderEvaluationCalibration, renderNotificationSettings, openUsageRun, renderUsage, renderKeyboardSettings, settingsPages, settingsNavigation, renderSettingsHub, renderHelp, renderAppearance };
}
