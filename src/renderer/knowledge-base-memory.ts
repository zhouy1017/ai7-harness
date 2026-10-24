import type { EditorialLearningProjection, HouseReviewPreferenceProjection, LearningSignal, RendererApi } from '../shared/protocol.js';
import { learningChoiceLabel } from './quality-learning-labels.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

/** What the editor did, in the words of the decision itself (Issue #1082). */
const SIGNAL_KIND_LABELS: Readonly<Record<LearningSignal['kind'], string>> = {
  accepted: '接受', 'accepted-with-edit': '修改后接受', rejected: '拒绝并说明原因', 'review-finding-ignored': '忽略并说明',
  'proactive-reason': '学习询问原因',
};

/** A signal the opt-out default admitted is never shown as the editor's own 纳入 choice (ADR 0094 §3; the policy's rule 2). */
function signalStandingLabel(signal: EditorialLearningProjection['signals'][number]): string {
  if (signal.currentEligibility === 'superseded') return '已被后来的决定或原因取代';
  if (signal.currentEligibility === 'house' && signal.eligibility.decisionId === null) return '默认纳入本机学习';
  return learningChoiceLabel(signal.currentEligibility);
}

/** Explicit, reference-only memory management alongside the existing 本社审阅偏好. */
export async function mountEditorialMemory(root: HTMLElement, api: RendererApi): Promise<void> {
  const section = el('section', '');
  section.dataset['editorialMemory'] = '';
  section.className = 'learning-materials'; section.style.overflowWrap = 'anywhere';
  root.append(section);
  let page = await api.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0 });
  let signalOffset = 0; let itemOffset = 0; let exclusionOffset = 0;
  let busy = false;
  const status = el('p', ''); status.setAttribute('role', 'status');
  const run = (operation: () => Promise<EditorialLearningProjection>): void => {
    if (busy) return;
    busy = true; paint();
    void operation().then((next) => { page = next; signalOffset = 0; itemOffset = 0; exclusionOffset = 0; status.textContent = '学习记录已更新。'; })
      .catch(() => { status.textContent = '无法更新学习记录，请重新查看。'; })
      .finally(() => { busy = false; if (section.isConnected) paint(); });
  };
  const action = (label: string, operation: () => void): HTMLButtonElement => {
    const button = el('button', label); button.type = 'button'; button.disabled = busy;
    button.addEventListener('click', operation); return button;
  };
  const paint = (): void => {
    section.replaceChildren(el('h3', '编辑记忆'), el('p', page.basis));
    const switchLabel = el('label', '本机学习');
    const enabled = el('input', ''); enabled.type = 'checkbox'; enabled.checked = page.enabled; enabled.disabled = busy;
    enabled.dataset['learningEnabled'] = '';
    enabled.addEventListener('change', () => run(() => api.changeEditorialLearning({ kind: 'switch', enabled: enabled.checked, expectedEntries: page.controlEntries })));
    switchLabel.prepend(enabled); section.append(switchLabel, status);
    const exclusions = el('details', ''); exclusions.append(el('summary', '学习排除范围'));
    if (page.excludedBooks.length + page.excludedMaterials.length === 0) exclusions.append(el('p', '尚无排除记录。'));
    for (const book of page.excludedBooks) {
      const row = el('p', `已排除《${book.title}》`);
      row.append(action('恢复本书学习', () => run(() => api.changeEditorialLearning({ kind: 'book', bookId: book.bookId, excluded: false, expectedEntries: page.controlEntries }))));
      exclusions.append(row);
    }
    for (const material of page.excludedMaterials) exclusions.append(el('p', `已排除材料 · ${material.bookId} · ${material.materialKey}`));
    if (page.nextExclusionOffset !== null) exclusions.append(action('更多排除范围', () => {
      exclusionOffset = page.nextExclusionOffset!;
      void api.inspectEditorialLearning({ signalOffset, itemOffset, exclusionOffset }).then((next) => { page = next; paint(); }).catch(() => { status.textContent = '无法读取更多排除范围。'; });
    }));
    section.append(exclusions, el('h4', '记忆条目'));
    if (page.items.length === 0) section.append(el('p', '尚无编辑记忆。可从下方处理记录新建记忆。'));
    for (const { current, usable, history } of page.items) {
      const item = el('article', ''); item.className = 'learning-material'; item.dataset['memoryItem'] = current.itemId;
      item.append(el('h4', current.title), el('p', `${current.editorialDimension} · 信心 ${Math.round(current.confidence * 100)}% · ${current.activation === 'inactive' ? '已停用' : usable ? '已启用' : '来源受限，暂停使用'}`));
      const lineage = el('details', ''); lineage.append(el('summary', '来源与版本历史'));
      for (const source of [...current.positiveExamples, ...current.negativeExamples]) {
        lineage.append(el('p', `图书 ${source.bookId} · 标记 ${source.markId ?? '无'} · 决定 ${source.decisionId} · 修订 ${source.revisionId} · 日志 ${source.journalSequence} · 原因版本 ${source.reasonRevision}`));
      }
      for (const version of history) lineage.append(el('p', `v${version.ordinal} · ${version.activation === 'active' ? '启用' : '停用'} · ${version.recordedAt}`));
      item.append(lineage);
      if (current.activation === 'active') item.append(action('停用', () => run(() => api.deactivateEditorialMemory({ itemId: current.itemId, expectedVersionId: current.versionId }))));
      const bookId = [...current.positiveExamples, ...current.negativeExamples][0]?.bookId;
      if (bookId !== undefined && !page.excludedBooks.some((book) => book.bookId === bookId)) item.append(action('排除本书', () => run(() => api.changeEditorialLearning({ kind: 'book', bookId, excluded: true, expectedEntries: page.controlEntries }))));
      section.append(item);
    }
    if (page.nextItemOffset !== null) section.append(action('更多记忆', () => {
      itemOffset = page.nextItemOffset!;
      void api.inspectEditorialLearning({ signalOffset, itemOffset, exclusionOffset }).then((next) => { page = next; paint(); }).catch(() => { status.textContent = '无法读取更多记忆。'; });
    }));
    section.append(el('h4', '学习信号 · 从处理记录新建记忆'), el('p', '这里只记录来源引用；原文、建议和你的改写留在各自的处理记录中。新建记忆由你明确提交，后续任务尚不读取这些记忆。'));
    if (page.signals.length === 0) section.append(el('p', '尚无符合准入的学习信号。'));
    for (const signal of page.signals) {
      const row = el('article', ''); row.className = 'learning-material'; row.dataset['learningSignal'] = signal.signalId;
      row.append(el('p', `《${signal.bookTitle}》 · ${SIGNAL_KIND_LABELS[signal.kind]} · ${signal.recordedAt}`),
        el('p', `作者：${signal.attribution.authors.join('、') || '未记录'} · 责编：${signal.attribution.editors.join('、') || '未记录'} · ${signalStandingLabel(signal)}`),
        el('p', `决定 ${signal.source.decisionId} · 修订 ${signal.source.revisionId} · 日志 ${signal.source.journalSequence}${signal.rewriteDistance === null ? '' : ` · 改写距离 ${signal.rewriteDistance}`}`));
      if (signal.currentEligibility !== 'excluded' && signal.currentEligibility !== 'superseded') row.append(action('排除此材料', () => run(() => api.changeEditorialLearning({ kind: 'material', signalId: signal.signalId }))));
      if (!page.excludedBooks.some((book) => book.bookId === signal.source.bookId)) row.append(action('排除本书', () => run(() => api.changeEditorialLearning({ kind: 'book', bookId: signal.source.bookId, excluded: true, expectedEntries: page.controlEntries }))));
      if (signal.currentEligibility === 'house') {
        const form = el('form', '');
        const titleLabel = el('label', '记忆标题'); const title = el('input', ''); title.maxLength = 160; title.required = true; title.name = 'memory-title'; titleLabel.append(title);
        const dimensionLabel = el('label', '编辑维度'); const dimension = el('input', ''); dimension.maxLength = 80; dimension.required = true; dimension.name = 'memory-dimension'; dimensionLabel.append(dimension);
        const confidenceLabel = el('label', '信心（0–100）'); const confidence = el('input', ''); confidence.type = 'number'; confidence.min = '0'; confidence.max = '100'; confidence.value = '50'; confidence.required = true; confidenceLabel.append(confidence);
        const create = el('button', '新建记忆'); create.type = 'submit'; create.disabled = busy;
        form.append(titleLabel, dimensionLabel, confidenceLabel, create);
        form.addEventListener('submit', (event) => {
          event.preventDefault(); if (!form.reportValidity()) return;
          run(() => api.createEditorialMemory({ clientMemoryId: crypto.randomUUID(), signalId: signal.signalId, title: title.value, editorialDimension: dimension.value, confidence: Number(confidence.value) / 100 }));
        });
        row.append(form);
      }
      section.append(row);
    }
    if (page.nextSignalOffset !== null) section.append(action('更多学习信号', () => {
      signalOffset = page.nextSignalOffset!;
      void api.inspectEditorialLearning({ signalOffset, itemOffset, exclusionOffset }).then((next) => { page = next; paint(); }).catch(() => { status.textContent = '无法读取更多学习信号。'; });
    }));
  };
  if (section.isConnected) paint();
}

/** A local record, with its explicit eligibility basis and attribution; rebuilding never calls a model. */
export function renderHouseReviewPreference(root: HTMLElement, projection: HouseReviewPreferenceProjection, api: Pick<RendererApi, 'rebuildHouseReviewPreference'>,
  announce: string | null = null): void {
  root.replaceChildren();
  const section = el('section', '');
  section.dataset['houseReviewPreference'] = '';
  section.append(el('h3', '本社审阅偏好'), el('p', '已判定反馈形成的偏好，供后续审阅参考；不改变审阅规范或编辑定稿。'), el('p', projection.basis));
  const update = el('button', '更新本社审阅偏好');
  update.type = 'button';
  const status = el('p', announce ?? '');
  status.setAttribute('role', 'status');
  update.addEventListener('click', () => {
    update.disabled = true;
    status.textContent = '正在更新本社审阅偏好…';
    void api.rebuildHouseReviewPreference().then((next) => {
      const changed = next.current?.versionId !== projection.current?.versionId;
      renderHouseReviewPreference(root, next, api, changed ? `已更新为本社审阅偏好 v${next.current!.ordinal}。` : '本社审阅偏好没有变化。');
      // The new rendering's own button keeps the keyboard where the editor left it.
      root.querySelector<HTMLButtonElement>('[data-house-review-preference] button')?.focus();
    }).catch(() => {
      update.disabled = false;
      status.textContent = '无法更新本社审阅偏好，请稍后重试。';
    });
  });
  section.append(update, status);
  if (projection.current === null || projection.current.lines.length === 0) section.append(el('p', '尚无符合学习准入的审阅反馈。'));
  if (projection.current !== null) {
    const version = projection.current;
    section.append(el('h4', `本社审阅偏好 v${version.ordinal}`), el('p', `来源：${version.sourceCount} 条已判定反馈 · ${version.recordedAt}`));
    const lines = el('ul', '');
    for (const line of version.lines) {
      const item = el('li', line.text);
      const bookTitle = line.bookId === null ? null : line.sources.find((source) => source.bookId === line.bookId)?.bookTitle ?? null;
      item.append(el('p', `学习准入：${learningChoiceLabel(line.bookId === null ? 'house' : 'book')}${bookTitle === null ? '' : `《${bookTitle}》`}`));
      const books = new Map<string, Set<string>>();
      const authors = new Map<string, Set<string>>();
      const editors = new Map<string, Set<string>>();
      for (const source of line.sources) {
        const count = (map: Map<string, Set<string>>, key: string) => map.set(key, new Set([...(map.get(key) ?? []), source.eligibilityDecisionId]));
        count(books, source.bookId);
        for (const name of source.attribution.authors) count(authors, name);
        for (const name of source.attribution.editors) count(editors, name);
      }
      item.append(el('p', `图书来源：${[...books].map(([id, ids]) => `《${line.sources.find((source) => source.bookId === id)!.bookTitle}》（${ids.size} 条）`).join('、')}`),
        el('p', `作者：${[...authors].map(([name, ids]) => `${name}（${ids.size} 条）`).join('、') || '未记录'}`),
        el('p', `责编：${[...editors].map(([name, ids]) => `${name}（${ids.size} 条）`).join('、') || '未记录'}`));
      lines.append(item);
    }
    section.append(lines);
  }
  const history = el('details', '');
  history.append(el('summary', '版本历史'));
  for (const version of [...projection.history].reverse()) history.append(el('p', `v${version.ordinal} · ${version.sourceCount} 条反馈 · ${version.recordedAt}`));
  section.append(history);
  root.append(section);
}
