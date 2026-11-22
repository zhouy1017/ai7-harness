import type { EditorialLearningProjection, RendererApi, GlobalAgentProjection, HouseReviewPreferenceProjection, RecordLearningSupervisionInput, InspectEditorialLearningInput } from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import { editorialPreferenceEditor } from './quality-learning.js';
type ListedState = 'proposed' | 'active' | 'inactive' | 'frozen';
export interface PreferenceLifecycleState { confirmId: string | null; confirmSentence: string; confirmError: string; focusId: string | null; focusLabel: string; refusalLabel: string }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
/** The ordinary face shared by both entrances; groups and eligibility belong to the service. */
export function renderReviewPreferenceGroups(options: {
  section: HTMLElement; page: EditorialLearningProjection; global: GlobalAgentProjection; house: HouseReviewPreferenceProjection | null;
  api: RendererApi; lifecycleState: PreferenceLifecycleState; paint: () => void;
  run: (operation: () => Promise<EditorialLearningProjection>, message?: string, deleteItemId?: string) => void;
  action: (label: string, operation: () => void) => HTMLButtonElement;
  savePreference: (input: RecordLearningSupervisionInput) => void;
  read: (input: Partial<InspectEditorialLearningInput>, fallback: string) => void;
}): void {
  const { section, page, global, house, api, lifecycleState, paint, run, action, savePreference, read } = options;
  const candidates = el('section', ''); candidates.dataset['memoryCandidates'] = '';
  candidates.append(el('h4', '待你确认的审阅偏好'));
  const active = el('section', ''); active.dataset['memoryPreferences'] = '';
  active.append(el('h4', '已启用的审阅偏好'));
  const disabled = el('section', ''); disabled.dataset['disabledPreferences'] = '';
  const disabledHeading = el('h4', '已停用的审阅偏好'); disabledHeading.tabIndex = -1; disabled.append(disabledHeading);
  active.querySelector('h4')!.tabIndex = -1;
  const groups = { pending: candidates, enabled: active, disabled };
  const face = (row: import('../shared/protocol/learning.js').ReviewPreferenceRow) => `${row.origin === 'ai' ? ' · AI 归纳' : ''}${row.group === 'disabled' ? ` · ${localInstantLabel(row.changedAt)}停用` : row.pausedInUse ? ' · 来源受限，暂停使用' : row.group === 'enabled' ? ' · 已启用' : ' · 待你确认'}`;
  const lifecycle = (item: HTMLElement, controls: HTMLElement, itemId: string, sentence: string, row: import('../shared/protocol/learning.js').ReviewPreferenceRow) => {
    if (row.group !== 'disabled') return;
    if (row.reenable?.standing === 'allowed') controls.append(action('重新启用', () => {
      lifecycleState.focusId = itemId; lifecycleState.focusLabel = '停用'; lifecycleState.refusalLabel = '重新启用';
      run(() => api.reenableReviewPreference({ itemId, expectedRevisionId: row.pin, actionId: crypto.randomUUID() }), '已重新启用这条审阅偏好。');
    })); else if (row.reenable) item.append(el('p', row.reenable.sentence));
    const remove = action('删除…', () => { lifecycleState.confirmId = itemId; lifecycleState.confirmSentence = sentence; lifecycleState.confirmError = ''; paint(); section.querySelector<HTMLButtonElement>('[data-delete-cancel]')?.focus(); }); controls.append(remove);
    if (lifecycleState.confirmId !== itemId) return;
    const strip = el('div', ''); strip.className = 'review-preference-confirm'; strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', '删除审阅偏好');
    strip.append(el('p', `删除审阅偏好「${sentence}」？删除后它不再使用，也不再列在这里；学习回溯里的记录保留。删除后不能恢复。`));
    const cancel = () => { lifecycleState.confirmId = null; lifecycleState.confirmError = ''; paint(); Array.from(section.querySelectorAll<HTMLElement>('article')).find((node) => node.dataset['memoryItem'] === itemId || node.dataset['reviewPreference'] === itemId)?.querySelectorAll('button').forEach((button) => { if (button.textContent === '删除…') button.focus(); }); };
    strip.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } });
    const buttons = el('div', ''); buttons.className = 'preference-actions button-row';
    const confirm = action('确认删除', () => {
      const rows = Array.from(disabled.querySelectorAll<HTMLElement>('article')); const next = rows[rows.indexOf(item) + 1];
      lifecycleState.focusId = next?.dataset['memoryItem'] ?? next?.dataset['reviewPreference'] ?? itemId; lifecycleState.focusLabel = '';
      run(() => api.deleteReviewPreference({ itemId, expectedRevisionId: row.pin, actionId: crypto.randomUUID() }), '已删除这条审阅偏好。', itemId);
    });
    confirm.classList.add('danger');
    const dismiss = action('取消', cancel); dismiss.dataset['deleteCancel'] = ''; buttons.append(confirm, dismiss); strip.append(buttons);
    if (lifecycleState.confirmError) strip.append(el('p', lifecycleState.confirmError)); item.append(strip);
  };
  const category = (id: string): string => global!.categories.find((entry) => entry.categoryId === id)?.label ?? '其他编辑维度';
  const bookTitle = (id: string): string => global!.books.find((book) => book.bookId === id)?.title ?? page.signals.find((signal) => signal.source.bookId === id)?.bookTitle ?? '来源图书';
  for (const { current, history, sources, nextHistoryOffset, nextSourceOffset, row } of page.items) {
    if (!row) { section.append(el('p', '无法读取更多审阅偏好。')); continue; }
    const item = el('article', ''); item.className = 'learning-material preference-row'; item.dataset['memoryItem'] = current.itemId;
    const scope = current.schema === 'ai7.global-editorial-memory/2' && current.applicability.kind === 'book' ? `《${bookTitle(current.applicability.bookId)}》` : '本社';
    item.append(el('p', current.title), el('p', `${category(current.editorialDimension)} · ${scope}${face(row)}`));
    const controls = el('div', ''); controls.className = 'preference-actions';
    const stop = () => { lifecycleState.focusId = current.itemId; lifecycleState.focusLabel = '重新启用'; lifecycleState.refusalLabel = '停用'; run(() => api.deactivateEditorialMemory({ itemId: current.itemId, expectedVersionId: current.versionId,
      ...(current.schema === 'ai7.global-editorial-memory/2' ? { actionId: crypto.randomUUID() } : {}) }), row.group === 'pending' ? '已排除这条待确认的审阅偏好。' : '已停用这条审阅偏好。'); };
    if (row.group === 'pending') {
      controls.append(action('接受', () => run(() => api.acceptEditorialMemory({ itemId: current.itemId, expectedVersionId: current.versionId, actionId: crypto.randomUUID() }))), action('排除', stop));
    } else if (row.group === 'enabled') controls.append(action('停用', stop));
    if (row.group === 'enabled') controls.append(action('编辑偏好', () => {
      controls.replaceChildren(editorialPreferenceEditor({ categories: global.categories, books: global.books,
        existing: { itemId: current.itemId, revisionId: current.versionId, kind: 'memory', text: current.title,
          categoryId: current.editorialDimension, bookId: current.schema === 'ai7.global-editorial-memory/2' && current.applicability.kind === 'book' ? current.applicability.bookId : null,
          state: 'active', lineage: [] }, save: savePreference }));
    }));
    const lineage = el('details', ''); lineage.append(el('summary', '来源与历史'));
    const titles = new Set((sources ?? []).map((source) => source.bookTitle));
    for (const source of [...current.positiveExamples, ...current.negativeExamples]) titles.add(bookTitle(source.bookId));
    for (const title of titles) lineage.append(el('p', `来自《${title}》`));
    for (const version of history) lineage.append(el('p', `${localInstantLabel(version.recordedAt)} · ${{ proposed: '待确认', active: '已启用', inactive: '已停用', frozen: '已冻结' }[(version.schema === 'ai7.global-editorial-memory/2' ? version.state : version.activation) as ListedState]}`));
    if (history.length === 0) lineage.append(el('p', localInstantLabel(current.recordedAt)));
    if (nextHistoryOffset != null) lineage.append(action('更早历史', () => {
      read({ detailItemId: current.itemId, historyOffset: nextHistoryOffset }, '无法读取更早历史。');
    }));
    if (nextSourceOffset != null) lineage.append(action('更多来源', () => {
      read({ detailItemId: current.itemId, sourceOffset: nextSourceOffset }, '无法读取更多来源。');
    }));
    lifecycle(item, controls, current.itemId, current.title, row);
    controls.append(lineage); item.append(controls);
    groups[row.group].append(item);
  }
  for (const preference of global.items.filter((item) => item.kind === 'preference')) {
    const item = el('article', ''); item.className = 'learning-material preference-row';
    const row = preference.row;
    if (!row) { section.append(el('p', '无法读取更多审阅偏好。')); continue; }
    item.dataset['reviewPreference'] = preference.itemId;
    item.append(el('p', preference.text), el('p', `${category(preference.categoryId)} · ${preference.bookId === null ? '本社' : `《${bookTitle(preference.bookId)}》`}${face(row)}`));
    const controls = el('div', ''); controls.className = 'preference-actions';
    if (row.group === 'enabled') controls.append(action('停用', () => { lifecycleState.focusId = preference.itemId; lifecycleState.focusLabel = '重新启用'; lifecycleState.refusalLabel = '停用'; run(async () => {
      await api.recordLearningSupervision({ operation: 'deactivate', targets: [{ itemId: preference.itemId, revisionId: preference.revisionId }],
        scope: preference.bookId === null ? { kind: 'category', categoryId: preference.categoryId } : { kind: 'book', bookId: preference.bookId },
        categoryId: preference.categoryId, text: '', effect: 'guide' });
      return api.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
    }, '已停用这条审阅偏好。'); }));
    if (row.group === 'enabled') controls.append(action('编辑偏好', () => {
      controls.replaceChildren(editorialPreferenceEditor({ categories: global.categories, books: global.books,
        existing: preference, save: savePreference }));
    }));
    const lineage = el('details', ''); lineage.append(el('summary', '来源与历史'));
    const basis = house?.current?.legacyBasis?.lines ?? house?.current?.governance?.baseLines ?? house?.current?.lines ?? [];
    const sourceBooks = (itemId: string, seen = new Set<string>()): string[] => {
      if (seen.has(itemId)) return []; seen.add(itemId);
      const line = basis.find((line) => (line.owner?.itemId ?? `preference:${line.bookId ?? 'house'}:${line.categoryId}`) === itemId);
      const parents = global!.items.find((item) => item.itemId === itemId)?.lineage ?? [];
      return [...(line?.sources.map((source) => source.bookTitle) ?? []), ...parents.flatMap((pin) => sourceBooks(pin.itemId, seen))];
    };
    const sourceTitles = new Set(sourceBooks(preference.itemId));
    if (preference.bookId !== null) sourceTitles.add(bookTitle(preference.bookId));
    for (const title of sourceTitles) lineage.append(el('p', `来自《${title}》`));
    const changes = global.directives.filter((entry) => entry.directiveId === preference.itemId || entry.targets.some((pin) => pin.itemId === preference.itemId));
    for (const entry of changes) lineage.append(el('p', `${localInstantLabel(entry.recordedAt)} · ${entry.operation === 'reactivate' ? '重新启用' : entry.operation === 'retire' ? '删除' : entry.operation === 'deactivate' ? '已停用' : entry.operation === 'supervise' ? entry.effect === 'freeze' ? '已冻结' : '学习方向已更新' : '已启用'}`));
    if (changes.length === 0) lineage.append(el('p', '尚无单独的偏好变更记录。'));
    lifecycle(item, controls, preference.itemId, preference.text, row);
    controls.append(lineage); item.append(controls); groups[row.group].append(item);
  }
  if (candidates.querySelector('article') !== null) section.append(candidates);
  if (active.querySelector('article') === null) active.append(el('p', '尚无已启用的审阅偏好。'));
  section.append(active);
  if (disabled.querySelector('article')) section.append(disabled);
  // A concurrent deletion removes the row; keep its refused confirmation readable after the re-read.
  if (lifecycleState.confirmId && lifecycleState.confirmError && !section.querySelector('.review-preference-confirm')) {
    const strip = el('div', ''); strip.className = 'review-preference-confirm'; strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', '删除审阅偏好');
    strip.append(el('p', `删除审阅偏好「${lifecycleState.confirmSentence}」`), el('p', lifecycleState.confirmError));
    const dismiss = action('取消', () => { lifecycleState.confirmId = null; lifecycleState.confirmError = ''; paint(); section.querySelector<HTMLElement>('[data-memory-preferences] h4')?.focus(); });
    dismiss.dataset['deleteCancel'] = '';
    strip.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); dismiss.click(); } });
    strip.append(dismiss); section.append(strip);
  }
  if (page.nextItemOffset !== null) section.append(action('更多审阅偏好', () => {
    read({ itemOffset: page.nextItemOffset! }, '无法读取更多审阅偏好。');
  }));
}
