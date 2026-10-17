import type { DataVersionProjection } from '../shared/protocol.js';
import { SERVICE_PROTOCOL_VERSION } from '../shared/protocol.js';
import licensesDocument from './third-party-licenses.generated.json' with { type: 'json' };
import {
  HELP_ABOUT_FAILED, HELP_ABOUT_HEADING, HELP_ABOUT_LOADING, HELP_BACK, HELP_BREADCRUMB, HELP_LICENSE_EMPTY,
  HELP_LICENSE_FIELD_LICENSE, HELP_LICENSE_FIELD_SOURCE, HELP_LICENSE_FILTER_LABEL, HELP_LICENSE_FILTER_PLACEHOLDER,
  HELP_LICENSE_NO_SOURCE, HELP_LICENSE_TEXT_SUMMARY, HELP_LEDE, HELP_TABS, HELP_TABS_LABEL, HELP_TITLE, helpAboutLine,
  helpLicenseCount, type HelpTab,
} from './help-labels.js';
import { HELP_PRIVACY_SECTIONS, HELP_USAGE_SECTIONS, type HelpSection } from './help-text.js';

// 帮助 (Issue #939, wave 11 slice 11f; Owner decision 27; editor-surfaces §0.3): the screen the sidebar's 帮助 entry opens —
// three tabs (使用帮助 · 隐私说明 · 第三方许可) with keyboard-complete tab switching and a filter on the generated license
// list, plus the 关于 line stating the software version, the Data Version and the service protocol. It reads nothing but the
// committed license list and the versions main already serves; nothing here changes a record.

export interface ThirdPartyLicense {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly repository: string | null;
  readonly homepage: string | null;
  readonly licenseText: string;
  readonly licenseTextDigest: string;
}

export interface LicensesDocument {
  readonly lockfileSha256: string;
  readonly packages: ReadonlyArray<ThirdPartyLicense>;
}

/** The committed list, imported as data; tools/generate-licenses.mjs owns it. */
export const THIRD_PARTY_LICENSES: ReadonlyArray<ThirdPartyLicense> = (licensesDocument as LicensesDocument).packages;

export interface HelpSurfaceOptions {
  readonly root: HTMLElement;
  /** Reads the software version and the Data Version exactly as 设置 › 数据与存储 does. */
  readonly loadVersions: () => Promise<Pick<DataVersionProjection, 'softwareVersion' | 'dataVersion'>>;
  readonly back: () => void;
  readonly licenses?: ReadonlyArray<ThirdPartyLicense>;
  readonly protocolVersion?: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function helpSection(section: HelpSection): HTMLElement {
  const block = el('section', 'help-section');
  block.append(el('h4', undefined, section.heading));
  for (const paragraph of section.paragraphs) block.append(el('p', 'help-paragraph', paragraph));
  return block;
}

export function mountHelp(options: HelpSurfaceOptions): void {
  const { root } = options;
  const licenses = options.licenses ?? THIRD_PARTY_LICENSES;
  const protocolVersion = options.protocolVersion ?? SERVICE_PROTOCOL_VERSION;

  root.classList.add('help');
  root.append(el('p', 'section-label', HELP_BREADCRUMB), el('h2', undefined, HELP_TITLE), el('p', 'lede', HELP_LEDE));

  // 关于: the same two versions 设置 › 数据与存储 shows, plus the service protocol this build speaks.
  const about = el('section', 'source-card help-about');
  const aboutLine = el('p', 'help-about-line', HELP_ABOUT_LOADING);
  about.append(el('h3', undefined, HELP_ABOUT_HEADING), aboutLine);
  root.append(about);
  void options.loadVersions().then(
    (versions) => { aboutLine.textContent = helpAboutLine(versions.softwareVersion, versions.dataVersion, protocolVersion); },
    () => { aboutLine.textContent = HELP_ABOUT_FAILED; },
  );

  const tabs = el('div', 'knowledge-tabs help-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', HELP_TABS_LABEL);
  const buttons = new Map<HelpTab, HTMLButtonElement>();
  const panels = new Map<HelpTab, HTMLElement>();

  const usagePanel = el('section', 'help-panel');
  usagePanel.id = 'help-panel-usage';
  usagePanel.setAttribute('role', 'tabpanel');
  usagePanel.setAttribute('aria-labelledby', 'help-tab-usage');
  usagePanel.append(el('h3', undefined, HELP_TABS[0]!.label));
  for (const section of HELP_USAGE_SECTIONS) usagePanel.append(helpSection(section));

  const privacyPanel = el('section', 'help-panel');
  privacyPanel.id = 'help-panel-privacy';
  privacyPanel.setAttribute('role', 'tabpanel');
  privacyPanel.setAttribute('aria-labelledby', 'help-tab-privacy');
  privacyPanel.append(el('h3', undefined, HELP_TABS[1]!.label));
  for (const section of HELP_PRIVACY_SECTIONS) privacyPanel.append(helpSection(section));

  const licensesPanel = el('section', 'help-panel');
  licensesPanel.id = 'help-panel-licenses';
  licensesPanel.setAttribute('role', 'tabpanel');
  licensesPanel.setAttribute('aria-labelledby', 'help-tab-licenses');
  licensesPanel.append(el('h3', undefined, HELP_TABS[2]!.label));
  const filterLabel = el('label', 'field-note', HELP_LICENSE_FILTER_LABEL);
  filterLabel.htmlFor = 'help-license-filter';
  const filter = el('input');
  filter.id = 'help-license-filter';
  filter.type = 'search';
  filter.placeholder = HELP_LICENSE_FILTER_PLACEHOLDER;
  const count = el('p', 'field-note help-license-count');
  const empty = el('p', 'field-note help-license-empty', HELP_LICENSE_EMPTY);
  empty.hidden = true;
  const list = el('ul', 'help-license-list');
  const items = licenses.map((license) => {
    const item = el('li', 'help-license');
    item.dataset['licenseName'] = license.name;
    const details = el('details', 'help-license-entry');
    const summary = el('summary');
    summary.append(
      el('span', 'help-license-name', license.name),
      el('span', 'help-license-version', license.version),
      el('span', 'help-license-id', `${HELP_LICENSE_FIELD_LICENSE} ${license.license}`),
    );
    const source = [license.repository, license.homepage].filter((value): value is string => value !== null).join(' · ');
    details.append(
      summary,
      el('p', 'field-note help-license-source', `${HELP_LICENSE_FIELD_SOURCE}：${source.length > 0 ? source : HELP_LICENSE_NO_SOURCE}`),
      el('pre', 'help-license-text', license.licenseText),
    );
    details.dataset['licenseTextSummary'] = HELP_LICENSE_TEXT_SUMMARY;
    item.append(details);
    list.append(item);
    return item;
  });
  const applyFilter = (): void => {
    const query = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const item of items) {
      const match = item.dataset['licenseName']!.toLowerCase().includes(query);
      item.hidden = !match;
      if (match) shown += 1;
    }
    count.textContent = helpLicenseCount(shown, items.length);
    empty.hidden = shown > 0;
  };
  filter.addEventListener('input', applyFilter);
  licensesPanel.append(filterLabel, filter, count, empty, list);

  panels.set('usage', usagePanel);
  panels.set('privacy', privacyPanel);
  panels.set('licenses', licensesPanel);

  const select = (tab: HelpTab, focus: boolean): void => {
    root.dataset['helpTab'] = tab;
    for (const [key, node] of buttons) {
      const current = key === tab;
      node.className = current ? 'secondary' : 'quiet';
      node.setAttribute('aria-selected', String(current));
      node.tabIndex = current ? 0 : -1;
    }
    for (const [key, panel] of panels) panel.hidden = key !== tab;
    if (focus) buttons.get(tab)?.focus();
  };

  HELP_TABS.forEach((entry, index) => {
    const node = el('button', entry.tab === 'usage' ? 'secondary' : 'quiet', entry.label);
    node.type = 'button';
    node.id = `help-tab-${entry.tab}`;
    node.dataset['helpTab'] = entry.tab;
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', String(entry.tab === 'usage'));
    node.setAttribute('aria-controls', `help-panel-${entry.tab}`);
    node.tabIndex = entry.tab === 'usage' ? 0 : -1;
    node.addEventListener('click', () => select(entry.tab, true));
    node.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const jump = event.key === 'Home' ? -index : event.key === 'End' ? HELP_TABS.length - 1 - index : 0;
      if (step === 0 && jump === 0) return;
      event.preventDefault();
      const next = HELP_TABS[(index + (step !== 0 ? step : jump) + HELP_TABS.length) % HELP_TABS.length]!;
      select(next.tab, true);
    });
    buttons.set(entry.tab, node);
    tabs.append(node);
  });

  root.append(tabs, usagePanel, privacyPanel, licensesPanel);

  const back = el('div', 'button-row');
  const backButton = el('button', 'quiet', HELP_BACK);
  backButton.type = 'button';
  backButton.addEventListener('click', options.back);
  back.append(backButton);
  root.append(back);

  select('usage', false);
  applyFilter();
  root.dataset['helpReady'] = 'true';
  buttons.get('usage')?.focus();
}
