import { filterChoices } from './components/controls.js';
import { identityWords } from './technical-layer.js';
import { triageKeyAction } from './triage-keys.js';
import { factStateBadge, type EvidenceCardHooks, type EvidenceWorkspaceSurface } from './evidence-workspace.js';
import {
  FACT_CLOSE_WORKSPACE,
  FACT_LENS_EMPTY_FILTERED,
  FACT_LENS_FILTER_LABELS,
  FACT_LENS_HEADING,
  FACT_LENS_MORE,
  FACT_LENS_NOTE,
  FACT_OPEN_WORKSPACE,
  FACT_SEVERITY_LABELS,
  factCardSentence,
  factLensCountsLine,
  factLocationLine,
} from './evidence-workspace-labels.js';
import {
  FACTUAL_ACTION_NEED_LABELS,
  FACTUAL_SOURCE_CONDITION_LABELS,
  FACTUAL_VERIFICATION_OUTCOMES,
  type FactualActionNeed,
  type FactualSourceCondition,
  type FactualVerificationLensFilters,
  type FactualVerificationLensProjection,
  type FactualVerificationResultProjection,
  type ReviewFindingProjection,
} from '../shared/protocol.js';

/**
 * The Fact-check Lens and its fact cards (Issue #901; V2-UX-FACT-004/005/007/008; Issue #1683 item 12.2). A card stands collapsed
 * in the list — one conclusion badge with its place, the quoted wording, one sentence on where the sources and the editor's
 * decision stand, and 展开 / 回到原文 / 忽略 — and expanded holds its Evidence Workspace: 结论 → 为这句核对的来源 → 你的决定. Exactly
 * one frame is drawn between a source row and the category: the card's own. The lens reads nothing; every read and every
 * action is the review workspace's, handed in.
 */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = identityWords(text, className);
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

type Control = HTMLButtonElement | HTMLSelectElement;

export interface FactLensOptions {
  readonly lens: FactualVerificationLensProjection;
  readonly results: ReadonlyArray<FactualVerificationResultProjection>;
  readonly filters: FactualVerificationLensFilters;
  readonly filtersOpen: boolean;
  readonly setFiltersOpen: (open: boolean) => void;
  readonly filter: (name: keyof FactualVerificationLensFilters, value: string | null) => void;
  /** 显示更多核查结果; `null` at the end of the results. */
  readonly more: (() => void) | null;
  readonly row: (result: FactualVerificationResultProjection) => HTMLElement;
  readonly allLabel: string;
  readonly headingId: string;
  readonly hold: (...controls: Control[]) => void;
}

export function renderFactLens(options: FactLensOptions): HTMLElement {
  const { lens } = options;
  const section = el('section', 'fact-lens');
  section.dataset['factLensTotal'] = String(lens.total);
  const heading = el('h6', undefined, FACT_LENS_HEADING);
  heading.id = options.headingId;
  section.setAttribute('aria-labelledby', options.headingId);
  const counts = el('p', 'fact-lens-counts', `${factLensCountsLine(lens)} · ${options.results.length === 0 ? FACT_LENS_NOTE.replace(/。$/u, '') : FACT_LENS_NOTE}`);
  if (options.results.length === 0) counts.append(`；${FACT_LENS_EMPTY_FILTERED}`);
  section.append(heading, counts);
  if (lens.run?.disclosure != null) section.append(el('p', 'fact-lens-disclosure', lens.run.disclosure));
  const filters = el('div', 'review-filters fact-lens-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', '筛选核查结果');
  const select = (name: keyof FactualVerificationLensFilters, choices: ReadonlyArray<readonly [string, string]>): HTMLElement => {
    const label = el('div', 'review-filter');
    const title = FACT_LENS_FILTER_LABELS[name === 'chapterBlockId' ? 'chapter' : name];
    label.append(el('span', undefined, title));
    const control = filterChoices({ label: title, choices: [['', options.allLabel], ...choices], value: options.filters[name] ?? '', disabled: false,
      change: (value) => options.filter(name, value || null) });
    control.dataset['factFilter'] = name;
    options.hold(...control.querySelectorAll('button'));
    label.append(control);
    return label;
  };
  filters.append(
    select('chapterBlockId', lens.chapters.map((chapter) => [chapter.blockId, chapter.heading] as const)),
    select('outcome', FACTUAL_VERIFICATION_OUTCOMES.map((outcome) => [outcome, outcome] as const)),
    select('severity', (['A', 'B', 'C'] as const).map((severity) => [severity, FACT_SEVERITY_LABELS[severity]] as const)),
    select('sourceCondition', (Object.keys(FACTUAL_SOURCE_CONDITION_LABELS) as FactualSourceCondition[]).map((value) => [value, FACTUAL_SOURCE_CONDITION_LABELS[value]] as const)),
    select('actionNeed', (Object.keys(FACTUAL_ACTION_NEED_LABELS) as FactualActionNeed[]).map((value) => [value, FACTUAL_ACTION_NEED_LABELS[value]] as const)),
  );
  const filterFold = el('details', 'review-fact-filter-fold');
  filterFold.open = options.filtersOpen;
  filterFold.addEventListener('toggle', () => options.setFiltersOpen(filterFold.open));
  filterFold.append(el('summary', undefined, '筛选 ▾'), filters);
  section.append(filterFold);
  const list = el('ol', 'fact-lens-rows');
  for (const result of options.results) list.append(options.row(result));
  section.append(list);
  if (options.more !== null) {
    const more = el('button', 'secondary', FACT_LENS_MORE);
    more.type = 'button';
    more.dataset['factAction'] = 'fact-more';
    more.addEventListener('click', options.more);
    options.hold(more);
    section.append(more);
  }
  return section;
}

export interface FactCardOptions {
  readonly result: FactualVerificationResultProjection;
  readonly finding: ReviewFindingProjection | undefined;
  /** The wording as the review cards quote it. */
  readonly quote: string;
  /** The open Evidence Workspace: the card stands expanded while it holds one. */
  readonly workspace: EvidenceWorkspaceSurface | undefined;
  readonly toggle: () => void;
  /** The finding's own actions (set A) by `data-review-action`, as its card draws them, built afresh at each call. */
  readonly actions: () => ReadonlyMap<string, HTMLElement>;
  readonly hooks: Pick<EvidenceCardHooks, 'lead' | 'note' | 'translation'>;
  /** 忽略并备注… for the card's R key; `null` when the finding cannot be ignored. */
  readonly openIgnore: (() => void) | null;
  readonly busy: () => boolean;
  readonly hold: (...controls: Control[]) => void;
  /** What follows the card's body: the reason ask, an open 忽略 / 转为修改建议 form, developer details. */
  readonly after: ReadonlyArray<HTMLElement>;
}

const pick = (set: ReadonlyMap<string, HTMLElement>, names: ReadonlyArray<string>): HTMLElement[] =>
  names.map((name) => set.get(name)).filter((node): node is HTMLElement => node !== undefined);

export function renderFactCard(options: FactCardOptions): HTMLElement {
  const { result, finding, workspace } = options;
  const row = el('li', 'fact-lens-row');
  row.dataset['factResultId'] = result.resultId;
  row.dataset['outcome'] = result.states.factualVerification;
  row.dataset['anchor'] = result.anchor.state;
  row.dataset['version'] = String(result.version);
  const article = el('article', 'review-finding fact-card');
  article.dataset['factCard'] = workspace === undefined ? 'collapsed' : 'expanded';
  if (finding !== undefined) {
    article.dataset['findingId'] = finding.findingId;
    article.dataset['severity'] = finding.severity;
    article.dataset['status'] = finding.status;
    article.dataset['markId'] = finding.markId ?? '';
    article.dataset['output'] = finding.output;
    article.tabIndex = 0;
  }
  article.addEventListener('keydown', (event) => {
    // A key decides the card only while the card itself has focus: Enter 回到原文, R 忽略并备注….
    if (event.target !== article || options.busy() || event.defaultPrevented || event.repeat) return;
    const enter = event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (enter) {
      const go = article.querySelector<HTMLButtonElement>('button[data-review-action="go-to-text"]');
      if (go !== null && !go.disabled) { event.preventDefault(); go.click(); }
    } else if (triageKeyAction(event) === 'reject' && options.openIgnore !== null) {
      event.preventDefault();
      options.openIgnore();
    }
  });
  const head = el('div', 'fact-card-head');
  head.append(factStateBadge(result), el('span', 'review-finding-location', factLocationLine(result)));
  const toggle = el('button', 'quiet', workspace === undefined ? FACT_OPEN_WORKSPACE : FACT_CLOSE_WORKSPACE);
  toggle.type = 'button';
  toggle.dataset['factAction'] = 'fact-workspace';
  toggle.setAttribute('aria-expanded', workspace === undefined ? 'false' : 'true');
  toggle.addEventListener('click', options.toggle);
  options.hold(toggle);
  if (workspace === undefined) {
    const actions = el('div', 'button-row review-finding-actions fact-card-actions');
    actions.append(toggle, ...pick(options.actions(), ['go-to-text', 'ignore-now']));
    article.append(head, el('blockquote', 'review-finding-quote', options.quote), el('p', 'fact-card-sentence', factCardSentence(result, finding?.status ?? null)), actions);
  } else {
    head.append(toggle);
    // The open workspace is the same element across repaints, so what the editor pinned, chose or typed stays.
    article.append(head, workspace.element);
    workspace.attach({
      ...options.hooks,
      goToText: () => options.actions().get('go-to-text') ?? null,
      actions: () => {
        const set = options.actions();
        return { direct: pick(set, ['mark-handled', 'ignore-now']), more: pick(set, ['convert-to-suggestion', 'ignore']) };
      },
    });
  }
  article.append(...options.after);
  row.append(article);
  return row;
}
