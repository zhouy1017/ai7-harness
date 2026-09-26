import {
  MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS,
  MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED,
  publicationText,
  type BookDeliveryPackageConditionProjection,
  type BookDeliveryPackageExportFileOutcomeProjection,
  type BookDeliveryPackageExportFileProjection,
  type BookDeliveryPackageExportOptions,
  type BookDeliveryPackageExportProjection,
  type BookDeliveryPackageExportReviewFileProjection,
  type BookDeliveryPackageExportReviewProjection,
  type BookDeliveryPackageExportSummaryProjection,
  type BookDeliveryPackageItemProjection,
  type BookDeliveryPackageProjection,
  type BookDeliveryPackageVersionProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  PACKAGE_CONDITION_STATE,
  PACKAGE_CONDITIONS_HEADING,
  PACKAGE_CURRENT_MARK,
  PACKAGE_EXCLUDED_HEADING,
  PACKAGE_EXPORT_ACTION_LABELS,
  PACKAGE_EXPORT_APPROVE_REASON,
  PACKAGE_EXPORT_FILES_LABEL,
  PACKAGE_EXPORT_FILES_TRUNCATED,
  PACKAGE_EXPORT_FOLDER_UNCHOSEN,
  PACKAGE_EXPORT_OPTIONS_NOTE,
  PACKAGE_EXPORT_STATUS_LINES,
  PACKAGE_EXPORTS_TRUNCATED,
  PACKAGE_HEADING,
  PACKAGE_INCLUDED_HEADING,
  PACKAGE_INCLUDED_TRUNCATED,
  PACKAGE_LIMITATIONS_HEADING,
  PACKAGE_LIMITATIONS_TRUNCATED,
  PACKAGE_PREPARE,
  PACKAGE_PREVIEW_HEADING,
  PACKAGE_PURPOSE_HINT,
  PACKAGE_PURPOSE_LABEL,
  PACKAGE_PURPOSE_NEEDED,
  PACKAGE_STATUS_LINES,
  PACKAGE_VERSIONS_HEADING,
  PACKAGE_VERSIONS_TRUNCATED,
  packageChangedLine,
  packageExportFidelitySummary,
  packageExportFileName,
  packageExportFolderLine,
  packageExportHeading,
  packageExportHistoryLine,
  packageExportOpenAccessibleName,
  packageExportsAccessibleName,
  packageExportStoppedLine,
  packageNotReadyLine,
  packagePreparedLine,
  packageUnchangedLine,
  packageVersionLine,
  packageVersionMeta,
  type PackageExportAction,
} from './book-delivery-package-labels.js';
import {
  EXPORT_DEGRADED_NOTE,
  EXPORT_OPTION_LABELS,
  exportOptionNote,
  EXPORT_OPTIONS_LEGEND,
} from './manuscript-export-labels.js';
import { renderExportFidelity } from './manuscript-export.js';
import { localInstantLabel } from './plan-preview-labels.js';

/** 含批注 and 含修改建议（作为修订）, in S64's order, both on until the editor turns one off (EXP-023). */
const PACKAGE_EXPORT_OPTION_ORDER: ReadonlyArray<keyof BookDeliveryPackageExportOptions> = ['includeAnnotations', 'includeSuggestions'];

/** Where a condition row's route leads: the 发稿 block, one type's card, or 审阅. */
export type BookDeliveryPackageRoute = { kind: 'publication' } | { kind: 'document'; typeId: string } | { kind: 'review' };

export interface MountBookDeliveryPackageOptions {
  root: HTMLElement;
  bookId: string;
  api: Pick<RendererApi, 'inspectBookDeliveryPackage' | 'prepareBookDeliveryPackage' | 'reviewBookDeliveryPackageExport' |
    'chooseBookDeliveryPackageExportFolder' | 'approveBookDeliveryPackageExport' | 'cancelBookDeliveryPackageExport' | 'revealManuscriptExport'>;
  technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** Follow a condition row's route; the destination around the block owns what it opens. */
  route(route: BookDeliveryPackageRoute): void;
}

export interface BookDeliveryPackageSurface {
  /** Read the package again, as when something it depends on changed: a designation, a document or a delivery. */
  refresh(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `book-delivery-package-${prefix}-${identities}`;
}

function fact(term: string, value: string): HTMLElement[] {
  return [el('dt', undefined, term), el('dd', 'technical-identity', value)];
}

/** Where a version's export stands: its files listed, a folder being chosen, prepared, being written, or done. */
type ExportPhase = 'reviewing' | 'ready' | 'choosing' | 'prepared' | 'writing' | 'done';

interface ExportState {
  packageVersionId: string;
  versionLabel: string;
  /** The switches as the editor left them; the review answers for the ones it was asked with. */
  options: BookDeliveryPackageExportOptions;
  /** The files whose fidelity review the editor opened, or closed when it opened by itself. */
  disclosed: Map<string, boolean>;
  selected: Set<string>;
  offset: number;
  review: BookDeliveryPackageExportReviewProjection | null;
  prepared: BookDeliveryPackageExportProjection | null;
  result: BookDeliveryPackageExportProjection | null;
  phase: ExportPhase;
  problem: string | null;
}

/** Where focus goes once the card is drawn. */
type Focus = 'keep' | 'prepare' | 'version' | 'export-heading' | 'export-choose' | 'export-approve' | 'export-result' | { opener: string };

/**
 * 图书交付包 on 交付物 (Issue #416, plan slice S67a; editor-surfaces §9; V2-UX-BUNDLE-001 to 005): the third of the
 * page's three things, apart from 发稿 and 交付 · 生产文档. It states what a package is and is not, lists the conditions
 * with a route beside each one that does not hold, shows what a package made now would hold and leave out, and
 * offers `准备图书交付包` — unavailable, with the unmet conditions named beside it, until every one holds and a purpose
 * is written. Each prepared version is listed newest first with its purpose and its Package Export History.
 *
 * A version's `导出…` (Issue #416, S67b; BUNDLE-004, EXP-010 to EXP-022) lists the files it writes; `选择位置…` asks the
 * system's own folder dialog and prepares them there; `按上述方式导出` — never preselected, and available only once the
 * folder is bound — writes them one by one, each with its receipt. What each file came to, the file that stopped the rest
 * and why, and 在文件夹中显示 follow; nothing is retried by itself, and the package itself never changes.
 *
 * Everything reads the service's projection; the digest of the content the editor saw goes with `准备`, so a package
 * is never frozen from content the page did not show, and the review's digest goes with the folder.
 */
export function mountBookDeliveryPackage(options: MountBookDeliveryPackageOptions): BookDeliveryPackageSurface {
  const { api, bookId } = options;
  let destroyed = false;
  let generation = 0;
  let working = false;
  let projection: BookDeliveryPackageProjection | null = null;
  let purpose = '';
  let problem: string | null = null;
  let section: HTMLElement | undefined;
  let exporting: ExportState | null = null;
  let exportTicket = 0;

  const exportWorking = (): boolean =>
    exporting !== null && (exporting.phase === 'reviewing' || exporting.phase === 'choosing' || exporting.phase === 'writing');
  /** One call of the card at a time: 准备 and an export's steps wait for each other. */
  const busy = (): boolean => working || exportWorking();

  function refresh(): void {
    if (destroyed) return;
    const ticket = ++generation;
    void api.inspectBookDeliveryPackage().then(
      (next) => {
        if (destroyed || ticket !== generation || !options.root.isConnected || next.bookId !== bookId) return;
        projection = next;
        draw('keep');
      },
      (error) => {
        if (destroyed || ticket !== generation || !options.root.isConnected) return;
        options.setStatus(options.errorMessage(error, PACKAGE_STATUS_LINES.refreshFailed), 'error');
      },
    );
  }

  /** A control's identity across a redraw, so focus stays where the editor was. */
  function focusKeyOf(node: HTMLElement): string {
    return [
      node.tagName,
      node.dataset['packageAction'] ?? '',
      node.dataset['packageField'] ?? '',
      node.dataset['packageMember'] ?? '',
      node.dataset['packageRoute'] ?? '',
      node.closest<HTMLElement>('ol.package-condition-list > li')?.dataset['conditionId'] ?? '',
      node.closest<HTMLElement>('ol.package-version-list > li')?.dataset['packageVersionId'] ?? '',
      node.closest<HTMLElement>('ol.package-export-list > li')?.dataset['packageExportId'] ?? '',
    ].join('|');
  }

  function draw(focus: Focus): void {
    if (projection === null) return;
    const next = projection;
    // A version no longer listed takes its export along, unless a call of it is in flight.
    if (exporting !== null && !exportWorking() && !next.versions.some((version) => version.packageVersionId === exporting!.packageVersionId)) exporting = null;
    const active = document.activeElement;
    const restore = focus === 'keep' && active instanceof HTMLElement && section?.contains(active) === true ? focusKeyOf(active) : null;
    // A switch has no caret: only a text field's selection is put back.
    const selection = active instanceof HTMLInputElement && restore !== null && active.selectionStart !== null
      ? [active.selectionStart, active.selectionEnd] as const
      : null;
    const view = el('section', 'deliverables-package');
    view.dataset['packageReady'] = String(next.ready);
    view.dataset['packageVersions'] = String(next.versions.length);
    view.dataset['packageChanged'] = String(next.changedSinceLatest);
    const heading = el('h3', undefined, PACKAGE_HEADING);
    heading.id = uid('heading');
    view.setAttribute('aria-labelledby', heading.id);
    view.append(heading, el('p', 'field-note package-statement', next.statement));
    view.append(renderConditions(next.conditions), renderPreview(next), renderPrepare(next));
    if (next.versions.length > 0) view.append(renderVersions(next.versions, next.versionsTruncated));
    if (section?.isConnected === true) section.replaceWith(view);
    else options.root.replaceChildren(view);
    section = view;
    if (restore !== null) {
      const again = Array.from(view.querySelectorAll<HTMLElement>('button, input')).find((node) => focusKeyOf(node) === restore);
      again?.focus();
      if (again instanceof HTMLInputElement && selection !== null) again.setSelectionRange(selection[0], selection[1]);
    } else if (focus === 'prepare') {
      view.querySelector<HTMLElement>('[data-package-action="prepare"]')?.focus();
    } else if (focus === 'version') {
      view.querySelector<HTMLElement>('ol.package-version-list > li[data-package-current="true"] .package-version-line')?.focus();
    } else if (focus === 'export-heading') {
      view.querySelector<HTMLElement>('.package-export h5')?.focus();
    } else if (focus === 'export-choose') {
      view.querySelector<HTMLElement>('.package-export [data-package-action="export-choose"]')?.focus();
    } else if (focus === 'export-approve') {
      const approve = view.querySelector<HTMLButtonElement>('.package-export [data-package-action="export-approve"]');
      (approve !== null && !approve.disabled ? approve : view.querySelector<HTMLElement>('.package-export [data-package-action="export-choose"]'))?.focus();
    } else if (focus === 'export-result') {
      view.querySelector<HTMLElement>('.package-export-result [data-package-action]')?.focus();
    } else if (typeof focus === 'object') {
      view.querySelector<HTMLElement>(`[data-package-action="export"][data-package-version-id="${CSS.escape(focus.opener)}"]`)?.focus();
    }
  }

  function renderConditions(conditions: ReadonlyArray<BookDeliveryPackageConditionProjection>): HTMLElement {
    const block = el('section', 'package-conditions');
    block.append(el('h4', undefined, PACKAGE_CONDITIONS_HEADING));
    const list = el('ol', 'package-condition-list');
    for (const condition of conditions) {
      const item = el('li');
      item.dataset['conditionKey'] = condition.key;
      item.dataset['conditionId'] = condition.typeId === null ? condition.key : `${condition.key}:${condition.typeId}`;
      if (condition.typeId !== null) item.dataset['typeId'] = condition.typeId;
      item.dataset['conditionMet'] = String(condition.met);
      const line = el('p', 'package-condition-line');
      line.append(
        el('strong', 'package-condition-label', condition.label),
        el('span', `status-pill package-condition-state${condition.met ? ' is-met' : ' is-unmet'}`, condition.met ? PACKAGE_CONDITION_STATE.met : PACKAGE_CONDITION_STATE.unmet),
        el('span', 'package-condition-detail', condition.stateLabel),
      );
      item.append(line);
      if (condition.notice !== null) item.append(el('p', 'attention-note package-condition-notice', condition.notice));
      if (condition.route !== null && condition.routeLabel !== null) {
        const route = el('button', 'quiet', condition.routeLabel);
        route.type = 'button';
        route.dataset['packageRoute'] = condition.route;
        route.setAttribute('aria-label', `${condition.routeLabel}：${condition.label}`);
        route.disabled = busy();
        const target: BookDeliveryPackageRoute = condition.route === 'document' && condition.typeId !== null
          ? { kind: 'document', typeId: condition.typeId }
          : condition.route === 'review' ? { kind: 'review' } : { kind: 'publication' };
        route.addEventListener('click', () => options.route(target));
        item.append(route);
      }
      list.append(item);
    }
    block.append(list);
    return block;
  }

  function itemList(className: string, items: ReadonlyArray<BookDeliveryPackageItemProjection>): HTMLElement {
    const list = el('ul', className);
    for (const entry of items) {
      const item = el('li');
      item.dataset['itemKind'] = entry.kind;
      item.append(el('span', 'package-item-label', entry.label));
      if (entry.detail !== null) item.append(el('span', 'field-note package-item-detail', entry.detail));
      list.append(item);
    }
    return list;
  }

  function renderPreview(next: BookDeliveryPackageProjection): HTMLElement {
    const block = el('section', 'package-preview');
    block.dataset['contentDigest'] = next.content.digest;
    block.append(el('h4', undefined, PACKAGE_PREVIEW_HEADING));
    block.append(el('h5', undefined, PACKAGE_INCLUDED_HEADING), itemList('package-included', next.content.included));
    if (next.content.includedTruncated) block.append(el('p', 'field-note', PACKAGE_INCLUDED_TRUNCATED));
    block.append(el('h5', undefined, PACKAGE_EXCLUDED_HEADING), itemList('package-excluded', next.content.excluded));
    const limitations = el('ul', 'package-limitations');
    for (const line of next.content.limitations) limitations.append(el('li', undefined, line));
    block.append(el('h5', undefined, PACKAGE_LIMITATIONS_HEADING), limitations);
    if (next.content.limitationsTruncated) block.append(el('p', 'field-note', PACKAGE_LIMITATIONS_TRUNCATED));
    return block;
  }

  /** Why `准备图书交付包` is unavailable, first the conditions and then the purpose. */
  function blocker(next: BookDeliveryPackageProjection): string | null {
    if (!next.ready) return packageNotReadyLine(next.unmet);
    if (publicationText(purpose, MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS) === null) return PACKAGE_PURPOSE_NEEDED;
    return null;
  }

  function renderPrepare(next: BookDeliveryPackageProjection): HTMLElement {
    const form = el('form', 'package-prepare');
    form.noValidate = true;
    form.addEventListener('submit', (event) => event.preventDefault());
    if (next.changedSinceLatest && next.versions[0] !== undefined) {
      form.append(el('p', 'attention-note package-changed', packageChangedLine(next.versions[0].label)));
    }
    const label = el('label', 'package-purpose');
    const input = el('input');
    input.type = 'text';
    input.dataset['packageField'] = 'purpose';
    input.value = purpose;
    input.disabled = busy();
    const hint = el('small', 'field-note', PACKAGE_PURPOSE_HINT);
    hint.id = uid('purpose-hint');
    input.setAttribute('aria-describedby', hint.id);
    label.append(el('span', undefined, PACKAGE_PURPOSE_LABEL), input, hint);
    form.append(label);
    const prepare = el('button', 'primary', PACKAGE_PREPARE);
    prepare.type = 'button';
    prepare.dataset['packageAction'] = 'prepare';
    const reason = el('p', 'field-note package-prepare-reason');
    reason.id = uid('prepare-reason');
    prepare.setAttribute('aria-describedby', reason.id);
    const sync = (): void => {
      const why = blocker(next);
      reason.textContent = why ?? '';
      reason.hidden = why === null;
      prepare.disabled = busy() || why !== null;
    };
    input.addEventListener('input', () => {
      purpose = input.value;
      problem = null;
      sync();
    });
    prepare.addEventListener('click', () => void prepareVersion());
    if (problem !== null) form.append(el('p', 'attention-note package-problem', problem));
    const row = el('div', 'button-row compact-actions');
    row.append(prepare);
    form.append(row, reason);
    sync();
    return form;
  }

  function renderVersions(versions: ReadonlyArray<BookDeliveryPackageVersionProjection>, truncated: boolean): HTMLElement {
    const block = el('section', 'package-versions');
    block.append(el('h4', undefined, PACKAGE_VERSIONS_HEADING));
    const list = el('ol', 'package-version-list');
    for (const version of versions) {
      const item = el('li');
      item.dataset['packageVersionId'] = version.packageVersionId;
      item.dataset['packageVersion'] = String(version.version);
      item.dataset['packageCurrent'] = String(version.current);
      const line = el('p', 'package-version-line', packageVersionLine(version));
      line.tabIndex = -1;
      if (version.current) line.append(el('span', 'package-current-mark', PACKAGE_CURRENT_MARK));
      const open = exportButton('open', 'secondary', () => openExport(version));
      open.dataset['packageAction'] = 'export';
      open.dataset['packageVersionId'] = version.packageVersionId;
      open.setAttribute('aria-label', packageExportOpenAccessibleName(version.label));
      open.disabled = busy();
      const actions = el('div', 'button-row compact-actions');
      actions.append(open);
      item.append(
        line,
        el('p', 'field-note package-version-meta', packageVersionMeta(version.purpose, localInstantLabel(version.preparedAt))),
        el('p', 'package-version-summary', version.summary),
      );
      if (version.exports.length > 0) item.append(renderHistory(version));
      item.append(actions);
      if (exporting !== null && exporting.packageVersionId === version.packageVersionId) item.append(renderExport(exporting));
      item.append(
        options.technicalDetails(
          'deliverables-facts',
          ...fact('交付包', version.packageId),
          ...fact('交付包版本', version.packageVersionId),
          ...fact('内容摘要', version.technical.contentDigest),
          ...fact('记录摘要', version.technical.digest),
          ...fact('上一版本', version.technical.priorVersionId ?? '—'),
        ),
      );
      list.append(item);
    }
    block.append(list);
    if (truncated) block.append(el('p', 'field-note', PACKAGE_VERSIONS_TRUNCATED));
    return block;
  }

  function exportButton(action: PackageExportAction, className: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', className, PACKAGE_EXPORT_ACTION_LABELS[action]);
    button.type = 'button';
    button.dataset['packageAction'] = `export-${action}`;
    button.addEventListener('click', onClick);
    return button;
  }

  /** The version's Package Export History (DPKG-011): each export in one line, its folder, and 在文件夹中显示. */
  function renderHistory(version: BookDeliveryPackageVersionProjection): HTMLElement {
    const block = el('div', 'package-exports');
    const list = el('ol', 'package-export-list');
    list.setAttribute('aria-label', packageExportsAccessibleName(version.label));
    for (const entry of version.exports) list.append(historyEntry(entry));
    block.append(list);
    if (version.exportsTruncated) block.append(el('p', 'field-note', PACKAGE_EXPORTS_TRUNCATED));
    return block;
  }

  function historyEntry(entry: BookDeliveryPackageExportSummaryProjection): HTMLElement {
    const item = el('li');
    item.dataset['packageExportId'] = entry.exportId;
    item.dataset['packageExportState'] = entry.state;
    item.append(
      el('p', 'package-export-line', packageExportHistoryLine(entry.summary, localInstantLabel(entry.exportedAt))),
      el('p', 'field-note package-export-folder', entry.folder),
    );
    if (entry.revealPreparationId !== null) {
      const preparationId = entry.revealPreparationId;
      const reveal = el('button', 'quiet', PACKAGE_EXPORT_ACTION_LABELS.reveal);
      reveal.type = 'button';
      reveal.dataset['packageAction'] = 'reveal-export';
      reveal.addEventListener('click', () => void revealExport(preparationId));
      item.append(reveal);
    }
    return item;
  }

  /** The export card of one version, below its lines: the files, the folder, and the approval or what it came to. */
  function renderExport(current: ExportState): HTMLElement {
    const inFlight = exportWorking();
    const panel = el('section', 'package-export');
    panel.dataset['packageExportPhase'] = current.phase;
    panel.setAttribute('aria-busy', inFlight ? 'true' : 'false');
    const heading = el('h5', undefined, packageExportHeading(current.versionLabel));
    heading.id = uid('export-heading');
    heading.tabIndex = -1;
    panel.setAttribute('aria-labelledby', heading.id);
    panel.append(heading);
    const shown = current.result ?? current.prepared;
    if (current.review !== null) panel.append(el('p', 'export-local-line', current.review.statement));
    panel.append(renderExportOptions(current));
    if (current.review !== null) {
      const review = current.review;
      panel.dataset['packageExportDegraded'] = String(review.degraded);
      const label = el('p', 'package-export-files-label', PACKAGE_EXPORT_FILES_LABEL);
      label.id = uid('export-files');
      const list = el('ol', 'package-export-files');
      list.setAttribute('aria-labelledby', label.id);
      for (const file of shown?.files ?? review.files) {
        list.append(exportFile(file, review.files.find((entry) => entry.key === file.key) ?? null, current));
      }
      panel.append(label, list);
      if (shown === null) {
        panel.append(el('p', 'field-note', '勾选本次要导出的文件，每次最多选择本页的 40 个。翻页会清除选择；其他文件不会一并导出。'));
        const pages = el('div', 'button-row');
        for (const [name, offset] of [['上一页', review.offset > 0 ? Math.max(0, review.offset - MAX_BOOK_DELIVERY_PACKAGE_EXPORT_FILES_LISTED) : null], ['下一页', review.nextOffset]] as const) {
          const button = el('button', 'quiet', name);
          button.type = 'button';
          button.dataset['packageAction'] = name === '上一页' ? 'export-previous' : 'export-next';
          button.disabled = inFlight || offset === null;
          button.addEventListener('click', () => {
            if (exporting !== current || offset === null || exportWorking()) return;
            current.offset = offset;
            current.selected.clear();
            current.disclosed.clear();
            current.review = null;
            current.phase = 'reviewing';
            draw('keep');
            reviewExport(current, 'export-heading');
          });
          pages.append(button);
        }
        panel.append(pages);
      }
      if ((shown?.filesTruncated ?? review.filesTruncated) === true) panel.append(el('p', 'field-note', PACKAGE_EXPORT_FILES_TRUNCATED));
      // EXP-008: what is degraded or cannot be written is said above; the approval accepts it for this export only.
      if (review.degraded) panel.append(el('p', 'export-degraded-note attention-note', EXPORT_DEGRADED_NOTE));
    }
    const folder = el('div', 'package-export-folder-choice');
    folder.dataset['packageExportFolder'] = current.prepared === null ? 'unchosen' : 'chosen';
    folder.append(el('p', 'package-export-folder-line', current.prepared === null ? PACKAGE_EXPORT_FOLDER_UNCHOSEN : packageExportFolderLine(current.prepared.folder)));
    if (current.result === null) {
      const choose = exportButton(current.prepared === null ? 'choose' : 'chooseAgain', 'secondary', () => void chooseFolder());
      choose.dataset['packageAction'] = 'export-choose';
      choose.disabled = inFlight || current.review === null || current.selected.size === 0;
      folder.append(choose);
    }
    panel.append(folder);
    const alert = el('p', 'export-problem', current.problem ?? '');
    alert.setAttribute('role', 'alert');
    alert.hidden = current.problem === null;
    panel.append(alert);
    panel.append(current.result === null ? renderExportActions(current, inFlight) : renderExportResult(current.result));
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || (exportWorking() && current.phase !== 'writing')) return;
      event.preventDefault();
      closeExport(current.result === null);
    });
    return panel;
  }

  /**
   * 含批注 and 含修改建议（作为修订） of the files written from the manuscript and the documents (EXP-023), as S64 offers them;
   * changing one reviews the files again, and a folder chosen before must be chosen again. A review in flight never locks
   * them: a newer choice supersedes it.
   */
  function renderExportOptions(current: ExportState): HTMLElement {
    const fieldset = el('fieldset', 'export-options package-export-options');
    fieldset.append(el('legend', undefined, EXPORT_OPTIONS_LEGEND));
    for (const key of PACKAGE_EXPORT_OPTION_ORDER) {
      const option = el('label', 'export-option');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = current.options[key];
      box.disabled = current.result !== null || current.phase === 'choosing' || current.phase === 'writing';
      box.dataset['packageField'] = key;
      const note = el('small', 'field-note', exportOptionNote(key, 'docx'));
      note.id = uid(`export-${key}-note`);
      box.setAttribute('aria-describedby', note.id);
      box.addEventListener('change', () => changeOption(current, key, box.checked));
      const words = el('span', 'export-option-text');
      words.append(el('strong', undefined, EXPORT_OPTION_LABELS[key]), note);
      option.append(box, words);
      fieldset.append(option);
    }
    fieldset.append(el('p', 'field-note', PACKAGE_EXPORT_OPTIONS_NOTE));
    return fieldset;
  }

  function exportFile(
    file: BookDeliveryPackageExportFileProjection | BookDeliveryPackageExportFileOutcomeProjection,
    reviewed: BookDeliveryPackageExportReviewFileProjection | null,
    current: ExportState,
  ): HTMLElement {
    const item = el('li');
    item.dataset['packageExportFile'] = file.key;
    item.dataset['packageExportFormat'] = file.format;
    if (current.prepared === null && current.result === null) {
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.dataset['packageMember'] = file.key;
      box.checked = current.selected.has(file.key);
      box.disabled = exportWorking();
      box.addEventListener('change', () => {
        if (exporting !== current || exportWorking()) return;
        if (box.checked) current.selected.add(file.key);
        else current.selected.delete(file.key);
        draw('keep');
      });
      label.append(box, el('span', undefined, `选择：${file.label}`));
      item.append(label);
    }
    item.append(el('span', 'package-export-file-label', file.label), el('span', 'field-note package-export-file-name', packageExportFileName(file.fileName, file.format)));
    if ('outcome' in file) {
      item.dataset['packageExportOutcome'] = file.outcome;
      item.append(el('span', `status-pill package-export-outcome is-${file.outcome}`, file.outcomeLabel));
    }
    if (reviewed !== null) {
      // Each file's own Export Fidelity Review (EXP-007): open by itself when something in it is not written as it was.
      item.dataset['packageExportDegraded'] = String(reviewed.degraded);
      const details = el('details', 'package-export-fidelity');
      details.open = current.disclosed.get(file.key) ?? reviewed.degraded;
      details.append(el('summary', undefined, packageExportFidelitySummary(reviewed.degraded)),
        renderExportFidelity(reviewed, { heading: false, degradedNote: false }),
        el('p', 'field-note export-format-line', reviewed.formatLine));
      details.addEventListener('toggle', () => current.disclosed.set(file.key, details.open));
      item.append(details);
    }
    return item;
  }

  /** `按上述方式导出` is never preselected and waits for the folder, with its reason in words (EXP-010). */
  function renderExportActions(current: ExportState, inFlight: boolean): HTMLElement {
    const row = el('div', 'button-row export-actions');
    const approve = exportButton('approve', 'primary', () => void approveExport());
    const reason = el('p', 'field-note export-approve-reason', PACKAGE_EXPORT_APPROVE_REASON);
    reason.id = uid('export-approve-reason');
    reason.hidden = current.prepared !== null;
    approve.disabled = inFlight || current.prepared === null;
    approve.setAttribute('aria-describedby', reason.id);
    const cancel = exportButton('cancel', 'quiet', () => closeExport(true));
    cancel.disabled = inFlight && current.phase !== 'writing';
    row.append(approve, cancel, reason);
    return row;
  }

  /** What the export came to (EXP-012, EXP-013, EXP-021): the files written, the one that stopped the rest, and why. */
  function renderExportResult(result: BookDeliveryPackageExportProjection): HTMLElement {
    const block = el('div', 'package-export-result');
    block.dataset['packageExportState'] = result.state;
    block.setAttribute('role', 'status');
    block.append(el('strong', 'package-export-summary', result.summary));
    if (result.stopped !== null) block.append(el('p', 'attention-note package-export-stopped', packageExportStoppedLine(result.stopped)));
    const row = el('div', 'button-row');
    const shown = result.files.find((file) => file.revealAvailable);
    if (shown !== undefined) row.append(exportButton('reveal', 'secondary', () => void revealExport(shown.preparationId)));
    row.append(exportButton('close', 'quiet', () => closeExport(false)));
    block.append(row);
    return block;
  }

  // ---- a version's export ---------------------------------------------------------------------------------------

  function openExport(version: BookDeliveryPackageVersionProjection): void {
    if (destroyed || busy()) return;
    exporting = {
      packageVersionId: version.packageVersionId,
      versionLabel: version.label,
      options: { includeAnnotations: true, includeSuggestions: true },
      disclosed: new Map(),
      selected: new Set(),
      offset: 0,
      review: null,
      prepared: null,
      result: null,
      phase: 'reviewing',
      problem: null,
    };
    draw('export-heading');
    reviewExport(exporting, 'export-heading');
  }

  /** A switch changed: the files are reviewed again under it, and the folder bound to the review before is let go. */
  function changeOption(current: ExportState, key: keyof BookDeliveryPackageExportOptions, value: boolean): void {
    if (destroyed || exporting !== current || current.result !== null || current.phase === 'choosing' || current.phase === 'writing') return;
    current.options = { ...current.options, [key]: value };
    current.prepared = null;
    current.phase = 'reviewing';
    current.problem = null;
    draw('keep');
    reviewExport(current, 'keep');
  }

  /** Review the version's files under the switches as they stand; only the newest review answers. */
  function reviewExport(current: ExportState, focus: Focus): void {
    const request = ++exportTicket;
    const asked = current.options;
    options.setStatus(PACKAGE_EXPORT_STATUS_LINES.reviewing, 'busy');
    void api.reviewBookDeliveryPackageExport({ packageVersionId: current.packageVersionId, options: asked, offset: current.offset }).then(
      (next) => {
        if (destroyed || exporting !== current || request !== exportTicket) return;
        current.phase = 'ready';
        if (next.bookId !== bookId || next.packageVersionId !== current.packageVersionId || next.offset !== current.offset ||
            next.options.includeAnnotations !== asked.includeAnnotations || next.options.includeSuggestions !== asked.includeSuggestions) {
          // A review that answers for other switches is none: nothing is bound until one answers for these.
          current.review = null;
          current.problem = PACKAGE_EXPORT_STATUS_LINES.reviewFailed;
          draw('keep');
          options.setStatus(current.problem, 'error');
          return;
        }
        current.review = next;
        draw(focus);
        options.setStatus(PACKAGE_EXPORT_STATUS_LINES.reviewed, 'success');
      },
      (error) => {
        if (destroyed || exporting !== current || request !== exportTicket) return;
        current.phase = 'ready';
        current.review = null;
        current.problem = options.errorMessage(error, PACKAGE_EXPORT_STATUS_LINES.reviewFailed);
        draw('keep');
        options.setStatus(current.problem, 'error');
      },
    );
  }

  /** `选择位置…`: the system's folder dialog; a folder chosen prepares every file there, and a cancelled one records nothing. */
  async function chooseFolder(): Promise<void> {
    const current = exporting;
    if (destroyed || current === null || busy() || current.review === null || current.result !== null) return;
    if (current.selected.size === 0) return;
    const reviewed = current.review;
    const request = ++exportTicket;
    current.phase = 'choosing';
    current.problem = null;
    draw('keep');
    options.setStatus(PACKAGE_EXPORT_STATUS_LINES.choosing, 'busy');
    try {
      const chosen = await api.chooseBookDeliveryPackageExportFolder({
        packageVersionId: current.packageVersionId,
        options: reviewed.options,
        reviewDigest: reviewed.reviewDigest,
        offset: reviewed.offset,
        memberKeys: [...current.selected],
      });
      if (destroyed || exporting !== current || request !== exportTicket) return;
      if (chosen.outcome === 'cancelled') {
        current.phase = current.prepared === null ? 'ready' : 'prepared';
        draw('export-choose');
        options.setStatus(PACKAGE_EXPORT_STATUS_LINES.cancelled);
        return;
      }
      if (chosen.export.packageVersionId !== current.packageVersionId) throw new Error(PACKAGE_EXPORT_STATUS_LINES.chooseFailed);
      current.prepared = chosen.export;
      current.phase = 'prepared';
      draw('export-approve');
      options.setStatus(PACKAGE_EXPORT_STATUS_LINES.prepared, 'success');
    } catch (error) {
      if (destroyed || exporting !== current || request !== exportTicket) return;
      current.phase = current.prepared === null ? 'ready' : 'prepared';
      current.problem = options.errorMessage(error, PACKAGE_EXPORT_STATUS_LINES.chooseFailed);
      draw('export-choose');
      options.setStatus(current.problem, 'error');
    }
  }

  /** `按上述方式导出`: every file written in turn with its receipt, and the package read again with its history. */
  async function approveExport(): Promise<void> {
    const current = exporting;
    if (destroyed || current === null || busy() || current.prepared === null || current.result !== null) return;
    const prepared = current.prepared;
    const request = ++exportTicket;
    current.phase = 'writing';
    current.problem = null;
    draw('keep');
    options.setStatus(PACKAGE_EXPORT_STATUS_LINES.writing, 'busy');
    try {
      const outcome = await api.approveBookDeliveryPackageExport({ exportId: prepared.exportId });
      if (destroyed || exporting !== current || request !== exportTicket) return;
      if (outcome.bookId !== bookId || outcome.package.bookId !== bookId || outcome.export.exportId !== prepared.exportId) {
        throw new Error(PACKAGE_EXPORT_STATUS_LINES.approveFailed);
      }
      current.result = outcome.export;
      current.phase = 'done';
      generation += 1;
      projection = outcome.package;
      draw('export-result');
      options.setStatus(outcome.export.summary, outcome.export.state === 'exported' ? 'success' : 'error');
    } catch (error) {
      if (destroyed || exporting !== current || request !== exportTicket) return;
      current.phase = 'prepared';
      current.problem = options.errorMessage(error, PACKAGE_EXPORT_STATUS_LINES.approveFailed);
      draw('export-approve');
      options.setStatus(current.problem, 'error');
      // A file may have been written before the refusal: the history is read again.
      refresh();
    }
  }

  /** Close the card; focus returns to the version's `导出…`. Only a card that wrote nothing says so. */
  function closeExport(announce: boolean): void {
    const current = exporting;
    if (current === null) return;
    if (current.phase === 'writing' && current.prepared !== null) {
      void api.cancelBookDeliveryPackageExport({ exportId: current.prepared.exportId }).then((accepted) => {
        if (destroyed || exporting !== current) return;
        if (accepted) {
          exporting = null;
          exportTicket += 1;
          draw({ opener: current.packageVersionId });
          options.setStatus(PACKAGE_EXPORT_STATUS_LINES.closed);
        } else if (current.phase === 'writing') {
          options.setStatus('文件已开始写入，正在等待导出结果。', 'busy');
        }
      }, (error) => {
        if (!destroyed && exporting === current) options.setStatus(options.errorMessage(error, '未能取消导出。'), 'error');
      });
      return;
    }
    if (exportWorking()) return;
    exporting = null;
    exportTicket += 1;
    draw({ opener: current.packageVersionId });
    if (announce) options.setStatus(PACKAGE_EXPORT_STATUS_LINES.closed);
  }

  async function revealExport(preparationId: string): Promise<void> {
    try {
      await api.revealManuscriptExport({ preparationId });
      options.setStatus(PACKAGE_EXPORT_STATUS_LINES.revealed, 'success');
    } catch (error) {
      options.setStatus(options.errorMessage(error, PACKAGE_EXPORT_STATUS_LINES.revealFailed), 'error');
    }
  }

  async function prepareVersion(): Promise<void> {
    const next = projection;
    if (destroyed || busy() || next === null || blocker(next) !== null) return;
    working = true;
    generation += 1;
    problem = null;
    draw('keep');
    options.setStatus(PACKAGE_STATUS_LINES.preparing, 'busy');
    try {
      const result = await api.prepareBookDeliveryPackage({ purpose, expectedContentDigest: next.content.digest });
      if (destroyed) return;
      if (result.bookId !== bookId || result.package.bookId !== bookId) throw new Error(PACKAGE_STATUS_LINES.prepareFailed);
      working = false;
      projection = result.package;
      draw(result.outcome === 'prepared' ? 'version' : 'prepare');
      options.setStatus(result.outcome === 'prepared' ? packagePreparedLine(`v${result.version}`) : packageUnchangedLine(`v${result.version}`), 'success');
    } catch (error) {
      working = false;
      if (destroyed) return;
      problem = options.errorMessage(error, PACKAGE_STATUS_LINES.prepareFailed);
      options.setStatus(problem, 'error');
      draw('prepare');
      // The content may have moved under the page; it is read again, and the purpose stays as written.
      refresh();
    }
  }

  return {
    refresh,
    destroy: () => {
      destroyed = true;
      generation += 1;
      exportTicket += 1;
    },
  };
}
