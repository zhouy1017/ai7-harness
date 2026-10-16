import type { HouseReviewPreferenceProjection, RendererApi } from '../shared/protocol.js';
import { learningChoiceLabel } from './quality-learning-labels.js';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
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
