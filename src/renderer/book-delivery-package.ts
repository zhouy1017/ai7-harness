import {
  MAX_BOOK_DELIVERY_PACKAGE_PURPOSE_CHARACTERS,
  publicationText,
  type BookDeliveryPackageConditionProjection,
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
  packageNotReadyLine,
  packagePreparedLine,
  packageUnchangedLine,
  packageVersionLine,
  packageVersionMeta,
} from './book-delivery-package-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/** Where a condition row's route leads: the 发稿 block, one type's card, or 审阅. */
export type BookDeliveryPackageRoute = { kind: 'publication' } | { kind: 'document'; typeId: string } | { kind: 'review' };

export interface MountBookDeliveryPackageOptions {
  root: HTMLElement;
  bookId: string;
  api: Pick<RendererApi, 'inspectBookDeliveryPackage' | 'prepareBookDeliveryPackage'>;
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

/**
 * 图书交付包 on 交付物 (Issue #416, plan slice S67a; editor-surfaces §9; V2-UX-BUNDLE-001 to 005): the third of the
 * page's three things, apart from 发稿 and 交付 · 生产文档. It states what a package is and is not, lists the conditions
 * with a route beside each one that does not hold, shows what a package made now would hold and leave out, and
 * offers `准备图书交付包` — unavailable, with the unmet conditions named beside it, until every one holds and a purpose
 * is written. Each prepared version is listed newest first with its purpose and `暂无导出记录`. No percentage, no
 * file and no destination: the export of a version is S67b's.
 *
 * Everything reads the service's projection; the digest of the content the editor saw goes with `准备`, so a package
 * is never frozen from content the page did not show.
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
      node.dataset['packageRoute'] ?? '',
      node.closest<HTMLElement>('ol.package-condition-list > li')?.dataset['conditionId'] ?? '',
    ].join('|');
  }

  function draw(focus: 'keep' | 'prepare' | 'version'): void {
    if (projection === null) return;
    const next = projection;
    const active = document.activeElement;
    const restore = focus === 'keep' && active instanceof HTMLElement && section?.contains(active) === true ? focusKeyOf(active) : null;
    const selection = active instanceof HTMLInputElement && restore !== null ? [active.selectionStart, active.selectionEnd] as const : null;
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
        route.disabled = working;
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
    input.disabled = working;
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
      prepare.disabled = working || why !== null;
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
      item.append(
        line,
        el('p', 'field-note package-version-meta', packageVersionMeta(version.purpose, localInstantLabel(version.preparedAt))),
        el('p', 'package-version-summary', version.summary),
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

  async function prepareVersion(): Promise<void> {
    const next = projection;
    if (destroyed || working || next === null || blocker(next) !== null) return;
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
    },
  };
}
