import type {
  LearningEligibilityChoice,
  LearningMaterialProjection,
  LearningMaterialsBookProjection,
  LearningMaterialsProjection,
  RendererApi,
  WordSampleCursorProjection,
  WordSampleDetailItemProjection,
  WordTrackedEditSampleDetailProjection,
} from '../shared/protocol.js';
import {
  LEARNING_CANCEL,
  LEARNING_CARD_TERMS,
  LEARNING_CHANGED_NOTE,
  LEARNING_CHOICE_LEGEND,
  LEARNING_CHOICES,
  LEARNING_EMPTY,
  LEARNING_INFLUENCE,
  LEARNING_MORE,
  LEARNING_NOTE_LABEL,
  LEARNING_OPEN,
  LEARNING_RECOMMENDED,
  LEARNING_RECORD,
  LEARNING_SERIES,
  LEARNING_SERIES_UNAVAILABLE,
  LEARNING_STATE_LABELS,
  LEARNING_STATUS,
  learningBookHeading,
  learningChoiceConsequence,
  learningDecisionLine,
  learningOriginLine,
  learningPeopleLine,
  wordLearningStandingLine,
} from './quality-learning-labels.js';
import { localInstantLabel } from './plan-preview-labels.js';

/**
 * 质量与学习 › 学习准入 (Issue #61, plan slice S26b; V2-UX-LEARN-002 to LEARN-012, FDBK-013): each Book's Learning Material,
 * grouped by Book with its 作者 and 责编, each with where it stands. `查看…` opens its Review Card in place — the bounded
 * material, where it came from, why it is one, the basis, what it could later influence, and the decision it has — with the
 * choice unselected and `仅纳入当前图书` marked recommended; a wider choice says its consequence beside it before
 * `记录学习准入决定`. Nothing here counts or reminds.
 *
 * Nothing is read whole (Issue #61 review): the materials come forty at a time, `更多学习材料…` reading the next and a Book
 * replacing the previous page; a decision answers with its one material, and a refusal reads that material again.
 */
export interface MountLearningMaterialsOptions {
  readonly root: HTMLElement;
  /** The one Book to show, when the page was opened for it; `null` lists every Book with material. */
  readonly bookId: string | null;
  readonly api: Pick<RendererApi, 'inspectLearningMaterials' | 'inspectLearningMaterial' | 'decideLearningMaterial' | 'inspectWordTrackedEditSample'>;
  readonly openSource: (bookId: string, materialKey: string) => Promise<void>;
  readonly openSourceVersion: (bookId: string, sourceVersionId: string) => Promise<void>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly technicalDetails: (key: string, ...rows: HTMLElement[]) => HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['learningAction'] = name;
  node.addEventListener('click', run);
  return node;
}

/** A page is replaced, never appended: cursors retain positions, not the full source in the DOM. */
export function mountWordTrackedEditDetail(options: {
  root: HTMLElement; api: Pick<RendererApi, 'inspectWordTrackedEditSample'>;
  bookId: string; sampleId: string; sampleDigest: string;
  openSourceVersion: (bookId: string, sourceVersionId: string) => Promise<void>;
}): { load(): Promise<void> } {
  const section = el('section', 'word-sample-detail');
  section.dataset['wordSampleDetail'] = options.sampleId;
  const heading = el('h4', undefined, 'Word 完整修改详情');
  const status = el('p'); status.setAttribute('role', 'status');
  const pageHost = el('div'); pageHost.dataset['wordDetailPage'] = '';
  const navigation = el('div', 'button-row');
  section.append(heading, status, pageHost, navigation); options.root.append(section);
  let busy = false;
  let page: WordTrackedEditSampleDetailProjection | null = null;
  let after: WordSampleCursorProjection | null = null;
  const previous: Array<WordSampleCursorProjection | null> = [];
  const sections = { before: '修改前', after: '修改后', events: '原始修订与批注', imports: '导入与历史学习依据' };
  const fields = { text: '文字', rawId: '原始编号', rawAuthor: '原始作者', rawDate: '原始日期', rangeName: '移动范围名称' };
  const itemNode = (item: WordSampleDetailItemProjection): HTMLElement => {
    const entry = el('article', 'word-detail-item');
    entry.dataset['wordDetailSection'] = item.section; entry.dataset['wordDetailOrdinal'] = String(item.entryOrdinal);
    entry.append(el('h5', undefined, `${sections[item.section]} · ${item.entryOrdinal + 1}`));
    if (item.kind === 'text') {
      entry.dataset['wordDetailField'] = item.field;
      entry.dataset['wordDetailStart'] = String(item.startCodeUnit);
      entry.dataset['wordDetailEnd'] = String(item.endCodeUnit);
      entry.dataset['wordDetailComplete'] = String(item.complete);
      entry.append(el('p', 'field-note', `${fields[item.field]} · UTF-16 ${item.startCodeUnit}–${item.endCodeUnit} / ${item.totalCodeUnits}${item.complete ? '' : ' · 后续页继续'}`));
      const text = el('pre', 'word-detail-text', item.text === null ? '（属性未提供）' : item.text === '' ? '（空字符串）' : item.text);
      text.style.whiteSpace = 'pre-wrap'; text.style.overflowWrap = 'anywhere'; entry.append(text);
      if (item.sha256 !== null || item.fragment !== null) {
        const provenance = el('details'); provenance.append(el('summary', undefined, '原始位置与摘要'),
          el('pre', 'technical-identity', JSON.stringify({ sha256: item.sha256, fragment: item.fragment }, null, 2)));
        entry.append(provenance);
      }
    } else {
      const record = item.record;
      const labels = { fragment: '原始片段位置', event: '修订事件', 'event-link': '修订关联', import: '导入选择与版本', 'import-admission': '导入时的本机学习依据' };
      entry.dataset['wordDetailRecord'] = record.type;
      entry.append(el('p', undefined, record.type === 'fragment' && record.fragment.kind === 'paragraph-boundary'
        ? '段落边界（结构变化，不是空文字）' : labels[record.type]));
      if (record.type === 'import') entry.append(el('p', undefined, record.mode === 'suggestions'
        ? '修改前阅读作为稿件基线，原修订保留为建议。' : '经单独确认，修改后阅读作为稿件基线。'));
      const details = el('details'); details.append(el('summary', undefined, '查看完整原始记录'), el('pre', 'technical-identity', JSON.stringify(record, null, 2)));
      entry.append(details);
    }
    return entry;
  };
  const paintNavigation = (): void => {
    navigation.replaceChildren();
    const back = action('上一页修改详情', 'secondary', 'word-detail-previous', () => {
      const cursor = previous.at(-1); if (busy || previous.length === 0 || cursor === undefined) return;
      void read(cursor, 'previous');
    });
    back.disabled = busy || previous.length === 0;
    const next = action('下一页修改详情', 'secondary', 'word-detail-next', () => {
      if (!busy && page?.nextCursor !== null && page?.nextCursor !== undefined) void read(page.nextCursor, 'next');
    }); next.disabled = busy || page?.nextCursor == null;
    const source = action('查看保留的原始来源版本', 'secondary', 'word-detail-source', () => {
      if (busy || page === null) return;
      void options.openSourceVersion(options.bookId, page.sourceVersionId).catch(() => { status.textContent = '无法打开原始来源版本。'; });
    }); source.disabled = busy || page === null;
    navigation.append(back, next, source);
  };
  const read = async (cursor: WordSampleCursorProjection | null, direction: 'initial' | 'next' | 'previous'): Promise<void> => {
    if (busy) return;
    busy = true; status.textContent = '正在读取完整原始片段…'; paintNavigation();
    try {
      const next = await options.api.inspectWordTrackedEditSample({ bookId: options.bookId, sampleId: options.sampleId, sampleDigest: options.sampleDigest, after: cursor });
      if (!section.isConnected) return;
      if (direction === 'next') previous.push(after);
      else if (direction === 'previous') previous.pop();
      after = cursor; page = next;
      pageHost.replaceChildren(...next.items.map(itemNode));
      status.textContent = `第 ${previous.length + 1} 页 · ${next.nextCursor === null ? '已到完整详情末尾' : '可继续读取'}。历史保留依据与当前学习排除分别记录。`;
    } catch { if (section.isConnected) status.textContent = '无法读取完整详情：原始来源、样本或页游标已变化。请重新打开这条记录。'; }
    finally { busy = false; if (section.isConnected) paintNavigation(); }
  };
  return { load: () => read(null, 'initial') };
}

interface Draft {
  choice: LearningEligibilityChoice | null;
  note: string;
}

export function mountLearningMaterials(options: MountLearningMaterialsOptions): { load(): Promise<void> } {
  const { root, bookId, api, setStatus, errorMessage, technicalDetails } = options;
  root.classList.add('learning-materials');
  let projection: LearningMaterialsProjection | null = null;
  let busy = false;
  let laterPage = false;
  /** The one card open, by Book and material, with what the editor chose and wrote so far. */
  let open: { readonly bookId: string; readonly materialKey: string; readonly draft: Draft } | null = null;
  let refusal: string | null = null;

  const materialSelector = (key: string): string => `[data-material-key="${CSS.escape(key)}"]`;

  /** One material as it now reads, wherever its Book's section shows it. */
  const replace = (bookKey: string, next: LearningMaterialProjection): void => {
    if (projection === null) return;
    projection = {
      ...projection,
      books: projection.books.map((book) => (book.bookId !== bookKey ? book : {
        ...book,
        materials: book.materials.map((material) => (material.materialKey === next.materialKey ? next : material)),
      })),
    };
  };

  const loadPage = async (reset: boolean): Promise<void> => {
    if (busy || open !== null || (!reset && projection?.nextCursor == null)) return;
    const after = reset ? null : projection!.nextCursor;
    busy = true;
    paint(null);
    setStatus(LEARNING_STATUS.loadingMore, 'busy');
    try {
      const page = await api.inspectLearningMaterials({ bookId, after });
      if (!root.isConnected) return;
      projection = page;
      laterPage = !reset;
      busy = false;
      setStatus(LEARNING_STATUS.opened);
      const first = page.books.find((book) => book.materials.length > 0)?.materials[0];
      paint(first === undefined ? (laterPage ? '[data-learning-action="reset"]' : '.learning-empty') : `${materialSelector(first.materialKey)} [data-learning-action="open"]`);
    } catch (error) {
      busy = false;
      if (!root.isConnected) return;
      setStatus(errorMessage(error, LEARNING_STATUS.unavailable), 'error');
      paint(reset ? '[data-learning-action="reset"]' : '[data-learning-action="more"]');
    }
  };

  const paint = (focus: string | null): void => {
    if (projection === null) return;
    root.dataset['learningBooks'] = String(projection.books.length);
    const parts: HTMLElement[] = [el('p', 'field-note learning-basis', projection.basis)];
    const books = projection.books.filter((book) => book.materials.length > 0);
    if (books.length === 0) {
      const empty = el('p', 'field-note learning-empty', LEARNING_EMPTY);
      empty.tabIndex = -1;
      parts.push(empty);
    }
    for (const book of books) parts.push(bookNode(book));
    if (projection.nextCursor !== null || laterPage) {
      const row = el('div', 'button-row learning-more');
      if (projection.nextCursor !== null) {
        const more = action(LEARNING_MORE, 'secondary', 'more', () => void loadPage(false));
        more.disabled = busy || open !== null;
        row.append(more);
      }
      if (laterPage) {
        const reset = action('回到首批学习材料', 'secondary', 'reset', () => void loadPage(true));
        reset.disabled = busy || open !== null;
        row.append(reset);
      }
      parts.push(row);
      if (open !== null) parts.push(el('p', 'field-note', '请先记录或关闭当前审阅卡，再翻阅其他学习材料。'));
    }
    root.replaceChildren(...parts);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const bookNode = (book: LearningMaterialsBookProjection): HTMLElement => {
    const section = el('section', 'learning-book');
    section.dataset['bookId'] = book.bookId;
    section.append(el('h3', undefined, learningBookHeading(book)), el('p', 'field-note learning-people', learningPeopleLine(book)));
    const list = el('ul', 'learning-material-list');
    for (const material of book.materials) list.append(materialNode(book, material));
    section.append(list);
    return section;
  };

  const materialNode = (book: LearningMaterialsBookProjection, material: LearningMaterialProjection): HTMLElement => {
    const item = el('li', 'learning-material');
    item.dataset['materialKey'] = material.materialKey;
    item.dataset['learningState'] = material.state;
    const head = el('div', 'learning-material-head');
    const pill = el('span', `status-pill learning-state learning-state-${material.state}`, material.kind === 'word-tracked-edit'
      ? '原始修改对已保留' : LEARNING_STATE_LABELS[material.state]);
    head.append(el('span', 'learning-origin', learningOriginLine(material, localInstantLabel)), pill);
    item.append(head);
    const isOpen = open !== null && open.bookId === book.bookId && open.materialKey === material.materialKey;
    if (isOpen) {
      item.append(cardNode(book, material, open!.draft));
    } else {
      const view = action(LEARNING_OPEN, 'quiet', 'open', () => {
        if (busy) return;
        open = { bookId: book.bookId, materialKey: material.materialKey, draft: { choice: null, note: '' } };
        refusal = null;
        paint(`${materialSelector(material.materialKey)} .learning-card h4`);
      });
      view.setAttribute('aria-label', `${LEARNING_OPEN.replace('…', '')}：${material.originLabel}`);
      view.disabled = busy;
      item.append(view);
    }
    return item;
  };

  const cardNode = (book: LearningMaterialsBookProjection, material: LearningMaterialProjection, draft: Draft): HTMLElement => {
    const card = el('section', 'learning-card');
    card.setAttribute('aria-label', `学习材料：${material.originLabel}`);
    const heading = el('h4', undefined, material.originLabel);
    heading.tabIndex = -1;
    const excerpt = el('ul', 'learning-excerpt');
    for (const line of material.excerpt) excerpt.append(el('li', undefined, line));
    const facts = el('dl', 'learning-facts');
    const fact = (term: string, value: HTMLElement | string, key: string): void => {
      const dd = typeof value === 'string' ? el('dd', undefined, value) : el('dd');
      if (typeof value !== 'string') dd.append(value);
      dd.dataset['learningFact'] = key;
      facts.append(el('dt', undefined, term), dd);
    };
    fact(LEARNING_CARD_TERMS.excerpt, excerpt, 'excerpt');
    fact(LEARNING_CARD_TERMS.origin, learningOriginLine(material, localInstantLabel), 'origin');
    if (material.sourceTask !== null) fact('来源任务', `${material.sourceTask.label} · ${material.sourceTask.taskIntentId}`, 'task');
    fact(LEARNING_CARD_TERMS.rationale, material.rationale, 'rationale');
    fact(LEARNING_CARD_TERMS.basis, projection?.basis ?? '', 'basis');
    fact(LEARNING_CARD_TERMS.influence, material.kind === 'word-tracked-edit'
      ? '尚未用于编辑记忆、审阅偏好或模型任务。' : LEARNING_INFLUENCE, 'influence');
    fact(LEARNING_CARD_TERMS.decision, learningDecisionLine(material, localInstantLabel), 'decision');
    card.append(heading, facts);
    if (material.target.kind === 'word-tracked-edit') {
      const target = material.target;
      if (material.wordCurrentEligibility !== undefined) card.append(el('p', 'field-note', wordLearningStandingLine(material.wordCurrentEligibility, material.decision !== null)));
      const detail = el('div');
      const view = action('查看完整 Word 修改对', 'secondary', 'word-detail', () => {
        detail.replaceChildren();
        void mountWordTrackedEditDetail({ root: detail, api, ...target, openSourceVersion: options.openSourceVersion }).load();
      });
      card.append(el('p', 'field-note', '原始修改对保留在本机，尚未用于编辑记忆、审阅偏好或模型任务。'), view, detail);
    }
    if (material.target.kind === 'mark' && material.target.detached) {
      card.append(el('p', 'field-note', '来源修改建议所在的段落已不在稿件中。'));
    } else {
      const source = action('打开来源记录', 'secondary', 'source', () => void (async () => {
        if (busy) return;
        busy = true;
        paint(null);
        setStatus('正在打开来源记录…', 'busy');
        try { await options.openSource(book.bookId, material.materialKey); }
        catch (error) {
          if (root.isConnected) setStatus(errorMessage(error, '无法打开来源记录。'), 'error');
        } finally {
          busy = false;
          if (root.isConnected) paint(`${materialSelector(material.materialKey)} [data-learning-action="source"]`);
        }
      })());
      source.disabled = busy;
      card.append(source);
    }
    if (material.state === 'changed') card.append(el('p', 'attention-note learning-changed', LEARNING_CHANGED_NOTE));

    // The choice, none selected; the recommendation is a pill beside it, never a checked box (LEARN-004).
    const choices = el('fieldset', 'learning-choices');
    choices.append(el('legend', undefined, LEARNING_CHOICE_LEGEND));
    const consequence = el('p', 'field-note learning-consequence');
    consequence.setAttribute('aria-live', 'polite');
    const record = action(LEARNING_RECORD, 'primary', 'record', () => void save(book, material, draft));
    const show = (): void => {
      consequence.hidden = draft.choice === null;
      consequence.textContent = draft.choice === null ? '' : learningChoiceConsequence(draft.choice, book.title);
      record.disabled = busy || draft.choice === null;
    };
    const radio = (value: LearningEligibilityChoice | 'series', label: string, disabled: boolean): HTMLLabelElement => {
      const wrapper = el('label', 'learning-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = `learning-choice-${material.materialKey}`;
      input.value = value;
      input.checked = value !== 'series' && draft.choice === value;
      input.disabled = disabled || busy;
      input.addEventListener('change', () => {
        if (!input.checked || value === 'series') return;
        draft.choice = value;
        show();
      });
      wrapper.append(input, el('span', undefined, label));
      return wrapper;
    };
    for (const entry of LEARNING_CHOICES) {
      if (material.kind === 'word-tracked-edit' && entry.choice !== 'excluded') continue;
      const option = radio(entry.choice, entry.label, false);
      if (entry.choice === 'book') option.append(el('span', 'status-pill learning-recommended', LEARNING_RECOMMENDED));
      choices.append(option);
      if (entry.choice === 'book') {
        const series = radio('series', LEARNING_SERIES, true);
        series.append(el('span', 'field-note learning-series-reason', LEARNING_SERIES_UNAVAILABLE));
        choices.append(series);
      }
    }
    const noteField = el('label', 'learning-note');
    const note = el('textarea');
    note.rows = 2;
    note.value = draft.note;
    note.disabled = busy;
    note.dataset['learningField'] = 'note';
    note.addEventListener('input', () => { draft.note = note.value; });
    noteField.append(el('span', undefined, LEARNING_NOTE_LABEL), note);
    const cancel = action(LEARNING_CANCEL, 'secondary', 'cancel', () => {
      if (busy) return;
      open = null;
      refusal = null;
      paint(`${materialSelector(material.materialKey)} [data-learning-action="open"]`);
    });
    cancel.disabled = busy;
    const buttons = el('div', 'button-row learning-actions');
    buttons.append(record, cancel);
    show();
    card.append(choices, consequence, noteField, buttons);
    if (refusal !== null) {
      const alert = el('p', 'attention-note learning-refusal', refusal);
      alert.setAttribute('role', 'alert');
      card.append(alert);
    }
    card.append(technicalDetails('learning-facts',
      el('dt', undefined, '学习材料'), el('dd', 'technical-identity', `${material.materialKey} · ${material.digest}`),
      el('dt', undefined, '决定次数'), el('dd', 'technical-identity', String(material.decisions)),
    ));
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      cancel.click();
    });
    return card;
  };

  const save = async (book: LearningMaterialsBookProjection, material: LearningMaterialProjection, draft: Draft): Promise<void> => {
    if (busy || draft.choice === null) return;
    busy = true;
    refusal = null;
    paint(null);
    setStatus(LEARNING_STATUS.recording, 'busy');
    try {
      const decided = await api.decideLearningMaterial({
        bookId: book.bookId,
        materialKey: material.materialKey,
        materialDigest: material.digest,
        expectedDecisions: material.decisions,
        choice: draft.choice,
        note: draft.note.trim().length === 0 ? null : draft.note,
      });
      replace(book.bookId, decided);
      busy = false;
      open = null;
      paint(`${materialSelector(material.materialKey)} [data-learning-action="open"]`);
      setStatus(LEARNING_STATUS.recorded, 'success');
    } catch (error) {
      busy = false;
      refusal = errorMessage(error, LEARNING_STATUS.failed);
      // What moved since the card opened is read again, so the next 记录 answers what is there now; a material that changed
      // meanwhile is a new version, and a choice made on the old one never carries over to it (Issue #61 review).
      try {
        const fresh = await api.inspectLearningMaterial({ bookId: book.bookId, materialKey: material.materialKey });
        if (fresh.digest !== material.digest) draft.choice = null;
        replace(book.bookId, fresh);
      } catch { /* the page keeps what it had */ }
      paint(`${materialSelector(material.materialKey)} [data-learning-action="record"]`);
      setStatus(refusal, 'error');
    }
  };

  return {
    async load(): Promise<void> {
      root.replaceChildren(el('p', 'field-note', LEARNING_STATUS.loading));
      projection = null;
      laterPage = false;
      projection = await api.inspectLearningMaterials({ bookId, after: null });
      paint(null);
    },
  };
}

/** Passive Apply-ledger metrics: the house or one selected Book, with auditable digests and no time tracking. */
export async function mountEditQualitySignals(root: HTMLElement, api: Pick<import('../shared/protocol.js').RendererApi, 'inspectEditQualitySignals' | 'listBooks'>): Promise<void> {
  const section = document.createElement('section');
  section.dataset['editQualitySignals'] = '';
  const heading = document.createElement('h3');
  heading.textContent = '编辑改动质量信号';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '改动质量信号的图书');
  const all = document.createElement('option');
  all.value = ''; all.textContent = '本社全部图书'; select.append(all);
  let cursor: import('../shared/protocol.js').BookSummaryCursor | null = null;
  const more = document.createElement('button'); more.type = 'button'; more.textContent = '更多图书…';
  const loadBooks = async () => {
    more.disabled = true;
    try {
      const page = await api.listBooks({ after: cursor });
      for (const book of page.items) {
        const option = document.createElement('option'); option.value = book.bookId; option.textContent = book.title; select.append(option);
      }
      cursor = page.nextCursor; more.hidden = cursor === null;
    } finally { more.disabled = false; }
  };
  more.addEventListener('click', () => void loadBooks().catch(() => { body.textContent = '无法读取更多图书。'; }));
  const body = document.createElement('p');
  body.setAttribute('role', 'status');
  let generation = 0;
  const adoption = document.createElement('div'); adoption.dataset['preferenceAdoption'] = '';
  const adoptionMore = el('button', 'button secondary', '更多规则采纳率…'); adoptionMore.type = 'button'; adoptionMore.hidden = true;
  let adoptionAfter: import('../shared/protocol.js').PreferenceAdoptionCursor | null = null;
  let adoptionRows: import('../shared/protocol.js').PreferenceAdoptionProjection[] = [];
  const load = async (reset = true) => {
    const current = ++generation;
    adoptionMore.disabled = true;
    if (reset) { adoptionAfter = null; adoptionRows = []; adoptionMore.hidden = true; }
    const metric = await api.inspectEditQualitySignals({ bookId: select.value || null, preferenceAfter: adoptionAfter }).catch((error: unknown) => {
      if (current === generation) adoptionMore.disabled = false;
      throw error;
    });
    if (current !== generation) return;
    adoptionRows = reset ? [...(metric.preferenceAdoption ?? [])] : [...adoptionRows, ...(metric.preferenceAdoption ?? [])];
    adoptionAfter = metric.preferenceAdoptionNext ?? null;
    adoptionMore.hidden = adoptionAfter === null;
    adoptionMore.disabled = false;
    body.textContent = `建议保留率：${metric.applied === 0 ? '暂无已应用的判定' : `${metric.surviving}/${metric.applied}（${Math.round(metric.surviving / metric.applied * 100)}%）`} · 按类别加权的改写量：${metric.editVolume} 字符单位`;
    body.dataset['lineageDigest'] = metric.lineageDigest;
    adoption.replaceChildren(el('h4', undefined, '已参考规则的采纳率'));
    const share = (count: { accepted: number; findings: number; rate: number | null }) => count.rate === null ? '暂无发现' : `${count.accepted}/${count.findings}（${Math.round(count.rate * 100)}%）`;
    if (!adoptionRows.length) adoption.append(el('p', 'field-note', '尚无可比较的审阅发现。'));
    for (const row of adoptionRows) {
      adoption.append(el('p', 'field-note', `${row.bookTitle} · ${row.versionId === null ? '全部规则' : `本社审阅偏好 v${row.ordinal} · ${row.versionId}`}：已参考 ${share(row.referenced)}；未参考 ${share(row.unreferenced)}${row.mostlyRejected ? ' · 参考后的发现多数被拒绝，请复核这条规则。' : ''}`));
    }
    adoption.append(el('p', 'field-note', '采纳数包含接受、修改后接受及已应用；分母包含尚未处理的发现。此比较不证明规则导致采纳。'));
  };
  adoptionMore.addEventListener('click', () => void load(false).catch(() => { adoptionMore.disabled = false; body.textContent = '无法读取更多规则采纳率。'; }));
  select.addEventListener('change', () => void load().catch(() => { body.textContent = '无法读取编辑改动质量信号。'; }));
  section.append(heading, select, more, body, adoption, adoptionMore); root.append(section);
  await Promise.all([load(), loadBooks()]);
}
