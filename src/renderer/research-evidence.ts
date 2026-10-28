import { SOURCE_TRANSLATION_LABEL, type RendererApi, type ResearchEvidenceBookProjection, type ResearchEvidenceProjection, type ReviewEvidenceSource } from '../shared/protocol.js';
import { FINDING_EVIDENCE_HEADING } from '../shared/report-wording.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  FINDING_EVIDENCE_OPEN,
  SOURCES_MORE,
  SOURCES_STATUS,
  SOURCE_ORIGINAL_LABEL,
  SOURCE_SAVE_ACTION,
  SOURCE_SAVE_NOTE,
  SOURCE_TRANSLATION_MACHINE,
  SOURCE_UNITS_HEADING,
  researchUnitLine,
  sourceAlignmentLine,
  sourceCaptureLine,
  sourceName,
  sourceStalenessLine,
  sourceTranslationView,
} from './research-evidence-labels.js';

/**
 * ② 资料与记录 › 来源与证据 (Issue #425, plan slice S70; V2-UX-SRC-013, EGR-003, KB-008): the Book's retained external
 * sources, newest first, a page at a time. Each card names the source and its link, how and when it was captured, its
 * 可能已过期 with the capture time, what the alignment found, the captured passage, and a 来源译文 beside the original when
 * there is one; 保存为来源材料 is the one action, explicit and offered only for a whole capture. Nothing here fetches or sends.
 */
export interface MountResearchEvidenceOptions {
  readonly root: HTMLElement;
  readonly bookId: string;
  readonly focusEvidenceId?: string;
  readonly api: Pick<RendererApi, 'inspectResearchEvidence' | 'saveEvidenceAsMaterial'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountResearchEvidence(options: MountResearchEvidenceOptions): { load(): Promise<void> } {
  const { root, api, bookId } = options;
  root.classList.add('research-evidence');
  let records: ResearchEvidenceProjection[] = [];
  let last: ResearchEvidenceBookProjection | null = null;
  let saving: string | null = null;

  const card = (record: ResearchEvidenceProjection, staleAfterDays: number): HTMLElement => {
    const article = el('article', 'source-card research-evidence-card');
    article.dataset['evidenceId'] = record.evidenceId;
    article.dataset['captureState'] = record.captureState;
    article.dataset['alignment'] = record.alignment;
    article.dataset['staleness'] = record.staleness.state;
    // The address as text: the renderer never navigates, and the editor copies it to read the page outside AI7.
    article.append(el('h3', undefined, sourceName(record)), el('p', 'research-evidence-url technical-identity', record.url));
    article.append(el('p', 'research-evidence-capture', sourceCaptureLine(record, localInstantLabel)));
    const stale = sourceStalenessLine(record, staleAfterDays, localInstantLabel);
    if (stale !== null) article.append(el('p', 'research-evidence-stale', stale));
    article.append(el('p', 'research-evidence-alignment', sourceAlignmentLine(record)));
    const translation = sourceTranslationView(record);
    if (translation !== null && 'refused' in translation) {
      if (record.passage !== null) article.append(el('blockquote', 'research-evidence-passage', record.passage));
      article.append(el('p', 'field-note research-evidence-translation-refused', translation.refused));
    } else if (translation !== null) {
      // The original and its 来源译文 side by side: the translation is labelled and never replaces the original (SRC-013).
      const pair = el('div', 'research-evidence-translation');
      const original = el('figure', 'research-evidence-original');
      original.append(el('figcaption', undefined, SOURCE_ORIGINAL_LABEL), el('blockquote', undefined, translation.original));
      const translated = el('figure', 'research-evidence-translated');
      translated.append(el('figcaption', undefined, translation.label), el('blockquote', undefined, translation.text), el('p', 'field-note', translation.note));
      pair.append(original, translated);
      article.append(pair);
    } else if (record.passage !== null) {
      article.append(el('blockquote', 'research-evidence-passage', record.passage));
    }
    const actions = el('div', 'button-row');
    if (record.saveRefusal === null) {
      const save = el('button', 'button secondary', SOURCE_SAVE_ACTION);
      save.type = 'button';
      save.dataset['evidenceAction'] = 'save-as-material';
      save.disabled = saving !== null;
      save.addEventListener('click', () => void saveAsMaterial(record));
      actions.append(save);
      article.append(actions, el('p', 'field-note', SOURCE_SAVE_NOTE));
    } else {
      article.append(el('p', 'field-note research-evidence-save-refusal', record.saveRefusal));
    }
    const facts = el('details', 'technical-details');
    facts.append(el('summary', undefined, '查看技术详情'));
    const list = el('dl');
    const row = (term: string, value: string): void => { list.append(el('dt', undefined, term), el('dd', 'technical-identity', value)); };
    row('运行', `${record.runRecordId} · 阅读范围 ${record.unitOrdinal}`);
    row('检索后端', record.backendId ?? '—');
    row('查询类别', record.queryClass);
    row('内容摘要', record.contentSha256 ?? '—');
    row('页面摘要', record.pageSha256 ?? '—');
    row('研究快照', record.snapshotDigest ?? '—');
    facts.append(list);
    article.append(facts);
    return article;
  };

  const draw = (): void => {
    if (last === null) return;
    const children: HTMLElement[] = [el('p', 'field-note research-evidence-statement', last.statement)];
    if (last.units.length > 0) {
      const units = el('section', 'research-evidence-units');
      units.append(el('h3', undefined, SOURCE_UNITS_HEADING));
      const list = el('ul');
      for (const unit of last.units) {
        const item = el('li', undefined, researchUnitLine(unit));
        item.dataset['unitState'] = unit.state;
        list.append(item);
      }
      units.append(list);
      children.push(units);
    }
    for (const record of records) children.push(card(record, last.staleAfterDays));
    if (last.next !== null) {
      const more = el('button', 'button quiet', SOURCES_MORE);
      more.type = 'button';
      more.dataset['evidenceAction'] = 'more';
      more.addEventListener('click', () => void page(last!.next));
      children.push(more);
    }
    root.replaceChildren(...children);
    root.dataset['evidenceCount'] = String(records.length);
  };

  const page = async (after: number | null): Promise<void> => {
    const answer = await api.inspectResearchEvidence({ bookId, after });
    records = after === null ? [...answer.records] : [...records, ...answer.records];
    last = answer;
    draw();
  };

  const saveAsMaterial = async (record: ResearchEvidenceProjection): Promise<void> => {
    if (saving !== null) return;
    saving = record.evidenceId;
    draw();
    options.setStatus(SOURCES_STATUS.saving, 'busy');
    try {
      await api.saveEvidenceAsMaterial({ bookId, evidenceId: record.evidenceId, title: null });
      saving = null;
      await page(null);
      options.setStatus(SOURCES_STATUS.saved, 'success');
    } catch (error) {
      saving = null;
      draw();
      options.setStatus(options.errorMessage(error, SOURCES_STATUS.saveFailed), 'error');
    }
  };

  return { load: async () => {
    await page(null);
    // A read-only deep link follows bounded existing pages; ordinary source navigation remains one page at a time.
    const target = options.focusEvidenceId;
    if (target === undefined) return;
    for (let count = 1; count < 20 && !records.some((record) => record.evidenceId === target) && last?.next != null; count += 1) {
      if (!root.isConnected) return;
      await page(last.next);
    }
    if (!records.some((record) => record.evidenceId === target)) options.setStatus('目标来源尚未显示；可继续读取更多来源。');
  } };
}

/**
 * A factual finding's sources on its card (ADR 0095 §5; Issue #1174), on the review card and the mark card alike: each one's
 * name and address, the verification note, the exact excerpt, and its 来源译文 beside a machine-translation note. The rows are
 * the ones 来源与证据 archives; `openSource` opens that archive on the row when one was retained.
 */
export function findingEvidenceList(sources: ReadonlyArray<ReviewEvidenceSource>, openSource?: (evidenceId: string) => void): HTMLElement {
  const section = el('section', 'finding-evidence');
  section.dataset['evidenceCount'] = String(sources.length);
  section.append(el('p', 'finding-evidence-heading', FINDING_EVIDENCE_HEADING));
  const list = el('ul', 'finding-evidence-list');
  for (const source of sources) {
    const item = el('li', 'finding-evidence-source');
    item.dataset['evidenceId'] = source.evidenceId ?? '';
    item.append(el('strong', 'finding-evidence-name', source.name));
    if (source.url !== null) item.append(el('p', 'finding-evidence-url research-evidence-url technical-identity', source.url));
    item.append(el('p', 'field-note finding-evidence-note', source.note));
    if (source.snippet !== null) item.append(el('blockquote', 'finding-evidence-snippet research-evidence-passage', source.snippet));
    if (source.translation !== null) {
      const translated = el('figure', 'finding-evidence-translation');
      translated.append(el('figcaption', undefined, SOURCE_TRANSLATION_LABEL), el('blockquote', 'research-evidence-passage', source.translation), el('p', 'field-note', SOURCE_TRANSLATION_MACHINE));
      item.append(translated);
    }
    if (source.evidenceId !== null && openSource !== undefined) {
      const open = el('button', 'button quiet', FINDING_EVIDENCE_OPEN);
      open.type = 'button';
      open.dataset['evidenceAction'] = 'open-source';
      const evidenceId = source.evidenceId;
      open.addEventListener('click', () => openSource(evidenceId));
      item.append(open);
    }
    list.append(item);
  }
  section.append(list);
  return section;
}
