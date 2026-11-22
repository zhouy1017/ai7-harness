import { technicalWords, identityWords, technicalLayerVisible } from './technical-layer.js';
import { reportResult } from './notifications.js';
import { menuPanel } from './components/controls.js';
import { sourceLinkControls, type SourceLinkApi } from './source-link.js';
import {
  EVIDENCE_MATRIX_MAX_PINNED,
  type CorrectionProposalDraftProjection,
  type CorrectionProposalSavedProjection,
  SOURCE_TRANSLATION_LABEL,
  type EvidenceSourceCardProjection,
  type EvidenceWorkspaceProjection,
  type FactualVerificationResultProjection,
  type RendererApi,
  type VerificationReasonState,
  type VerificationReviewDisposition,
} from '../shared/protocol.js';
import {
  CORRECTION_FAILED,
  CORRECTION_HEADING,
  CORRECTION_NO_VARIANTS,
  CORRECTION_OWN_EDIT,
  CORRECTION_OWN_TEXT_LABEL,
  CORRECTION_PREPARE,
  CORRECTION_PREPARE_FAILED,
  CORRECTION_RANGES_HEADING,
  CORRECTION_RANGES_NOTE,
  CORRECTION_RATIONALE_LABEL,
  CORRECTION_SAVE,
  CORRECTION_SAVED_GO,
  DECISION_FAILED,
  DECISION_HEADING,
  DECISION_LABELS,
  DECISION_NOTE,
  DECISION_OWN_WORDS_LABEL,
  DECISION_OWN_WORDS_RECORD,
  DECISION_REASON_FIELD,
  DECISION_REASON_FREE,
  DECISION_REASON_HEADING,
  DECISION_RECORDED,
  DECISION_RECORDING,
  DECISION_SUPERSEDED,
  EVIDENCE_CONCLUSION_HEADING,
  EVIDENCE_CONFLICTS_HEADING,
  EVIDENCE_HISTORY_HEADING,
  EVIDENCE_LIMITATIONS_HEADING,
  EVIDENCE_MATRIX_HEADING,
  EVIDENCE_MATRIX_HINT,
  EVIDENCE_NO_MUTATION,
  EVIDENCE_OPEN_SOURCE,
  EVIDENCE_PIN,
  EVIDENCE_PIN_FULL,
  EVIDENCE_SOURCES_HEADING,
  EVIDENCE_SOURCES_MORE,
  EVIDENCE_SOURCES_NONE,
  EVIDENCE_STATEMENT_LABEL,
  EVIDENCE_SUMMARY_HEADING,
  EVIDENCE_UNPIN,
  EVIDENCE_WORDING_LABEL,
  FACT_STALE_SENTENCE,
  factDecisionLine,
  factLevelLine,
  factLocationLine,
  factSourceCountsLine,
  outcomeTone,
  sourceCardFacts,
  sourceCardTitle,
  sourceRowDetail,
} from './evidence-workspace-labels.js';
import { SOURCE_TRANSLATION_MACHINE } from './research-evidence-labels.js';

/**
 * The Assertion-centered Evidence Workspace (Issue #901; V2-UX-EVID-001 to 013, FREV-004 to 011, CORR-001 to 012) as the
 * expanded fact card's body (Issue #1683 item 12.2): 结论 — the result, its exact wording apart from AI7's statement and the two
 * other states apart; 为这句核对的来源 — each source one row of a list, two to four pinned into a comparison, conflicts side by
 * side and the non-evidentiary 小结 last; 你的决定 — one row holding the verification review (each button records at once) and the
 * finding's own actions, then the Correction Proposal draft where offered. Reading it changes nothing: only a decision button and
 * 保存为修改建议 record anything, each the editor's explicit action. Free text is typed into ordinary fields that are never redrawn
 * while the editor types, so Chinese input methods compose undisturbed.
 */
export interface EvidenceWorkspaceSurface {
  readonly element: HTMLElement;
  readonly resultId: string;
  load(): Promise<void>;
  /** The fact card that holds the workspace hands it the finding's lines and 批注 actions, and the workspace draws again. */
  attach(hooks: EvidenceCardHooks): void;
  destroy(): void;
}

/**
 * What the fact card adds to the workspace it holds (Issue #1683): the finding's pills and note in 结论, 回到原文 beside the
 * manuscript wording, a source's 来源译文 from the rows the card already read, and the finding's own actions (set A) on the one
 * decision row of 你的决定. Each is called at every draw, so a control is always the card's current one.
 */
export interface EvidenceCardHooks {
  readonly lead: () => HTMLElement[];
  readonly goToText: () => HTMLElement | null;
  readonly note: () => HTMLElement[];
  readonly translation: (cardId: string) => string | null;
  readonly actions: () => { direct: HTMLElement[]; more: HTMLElement[] };
}

export interface MountEvidenceWorkspaceOptions {
  readonly prepareSupplementary?: (decisionId: string) => Promise<void>;
  readonly bookId: string;
  readonly resultId: string;
  readonly api: Pick<RendererApi, 'inspectEvidenceWorkspace' | 'recordVerificationReviewDecision' | 'prepareCorrectionProposal' | 'saveCorrectionProposal'> & Partial<SourceLinkApi>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  readonly instant: (iso: string) => string;
  /** The 来源与证据 view, opened on one retained source. */
  readonly openSource: (evidenceId: string) => void;
  /** 在稿件中查看: the manuscript at a block, with a mark's card open. */
  readonly goToText: (target: { blockId: string; markId: string | null }) => Promise<void>;
  /** A decision or a proposal was recorded: the Fact-check Lens reads its rows again. */
  readonly changed: () => void;
}

interface DecisionForm {
  ownWordsOpen: boolean;
  ownWords: string;
  suggestion: string | null;
  reasonText: string;
  reasonEdited: boolean;
  reasonOpen: boolean;
  problem: string | null;
}

interface CorrectionForm {
  choice: string | null;
  text: string;
  rationale: string;
  ranges: Set<string>;
  problem: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = identityWords(text, className);
  if (tag === 'button') node.className = `${node.className} btn`.trim();
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `evidence-${prefix}-${identities}`;
}

function facts(rows: ReadonlyArray<readonly [string, string]>): HTMLElement {
  const list = el('dl', 'evidence-facts');
  for (const [term, value] of rows) list.append(el('dt', undefined, term), el('dd', undefined, value));
  return list;
}

/** The fact card's one conclusion badge: the 事实核查 state, toned by its outcome (Issue #1683 item 8; FACT-007 keeps the other two apart). */
export function factStateBadge(result: Pick<FactualVerificationResultProjection, 'states'>): HTMLElement {
  const badge = el('span', `state-term status-pill evidence-pill evidence-pill-${outcomeTone(result.states.factualVerification)} fact-card-badge`, result.states.factualVerification);
  badge.dataset['stateTerm'] = '事实核查';
  return badge;
}

const emptyForm = (): DecisionForm => ({ ownWordsOpen: false, ownWords: '', suggestion: null, reasonText: '', reasonEdited: false, reasonOpen: false, problem: null });

export function mountEvidenceWorkspace(options: MountEvidenceWorkspaceOptions): EvidenceWorkspaceSurface {
  const { api, bookId, resultId } = options;
  const element = el('section', 'evidence-workspace');
  element.dataset['resultId'] = resultId;
  const headingId = uid('heading');
  element.setAttribute('aria-labelledby', headingId);
  let destroyed = false;
  let working = false;
  let hooks: EvidenceCardHooks | null = null;
  let projection: EvidenceWorkspaceProjection | null = null;
  let sources: EvidenceSourceCardProjection[] = [];
  let nextCursor: number | null = null;
  const pinned: string[] = [];
  const excludedSources = new Set<string>();
  let decision: DecisionForm = emptyForm();
  let draft: CorrectionProposalDraftProjection | null = null;
  let correction: CorrectionForm | null = null;
  let saved: CorrectionProposalSavedProjection | null = null;
  let savedBlockId: string | null = null;
  const { openSourceInBrowser, runEditorClipboardCommand } = api;
  const linkApi: SourceLinkApi | undefined = openSourceInBrowser === undefined || runEditorClipboardCommand === undefined ? undefined
    : { openSourceInBrowser: (input) => openSourceInBrowser.call(api, input), runEditorClipboardCommand: (input) => runEditorClipboardCommand.call(api, input) };

  const button = (label: string, action: string, variant: 'primary' | 'secondary' | 'quiet', run: () => void): HTMLButtonElement => {
    const node = el('button', variant, label);
    node.type = 'button';
    node.dataset['evidenceAction'] = action;
    node.disabled = working;
    node.addEventListener('click', () => { if (!working) run(); });
    return node;
  };

  const focusKey = (): string | null => {
    const active = document.activeElement;
    return active instanceof HTMLElement && element.contains(active) ? active.dataset['evidenceFocus'] ?? null : null;
  };
  const restoreFocus = (key: string | null): void => {
    if (key === null) return;
    const control = element.querySelector<HTMLElement>(`[data-evidence-focus="${CSS.escape(key)}"]`);
    const target = control === null || (control instanceof HTMLButtonElement && control.disabled)
      ? element.querySelector<HTMLElement>('[data-fact-section="decision"]') : control;
    target?.focus({ preventScroll: true });
  };

  // ---- reading --------------------------------------------------------------------------------------------------------

  async function load(): Promise<void> {
    const next = await api.inspectEvidenceWorkspace({ bookId, resultId, sourcesAfter: null });
    if (destroyed) return;
    projection = next;
    sources = [...next.sources];
    nextCursor = next.nextSourceCursor;
    for (let index = pinned.length - 1; index >= 0; index -= 1) {
      if (!sources.some((card) => card.cardId === pinned[index])) pinned.splice(index, 1);
    }
    render();
  }

  async function moreSources(): Promise<void> {
    if (nextCursor === null) return;
    working = true;
    render();
    try {
      const next = await api.inspectEvidenceWorkspace({ bookId, resultId, sourcesAfter: nextCursor });
      if (destroyed) return;
      sources = [...sources, ...next.sources.filter((card) => !sources.some((existing) => existing.cardId === card.cardId))];
      nextCursor = next.nextSourceCursor;
    } catch (error) {
      options.setStatus(options.errorMessage(error, '无法读取更多来源。'), 'error');
    } finally {
      working = false;
      render();
    }
  }

  async function focusSource(cardId: string): Promise<void> {
    while (!destroyed && !sources.some((card) => card.cardId === cardId) && nextCursor !== null) {
      const before = nextCursor;
      await moreSources();
      if (nextCursor === before) break;
    }
    element.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(cardId)}"]`)?.focus();
  }

  // ---- rendering: 结论 → 为这句核对的来源 → 你的决定 (Issue #1683 item 9) -------------------------------------------------

  function render(): void {
    if (destroyed || projection === null) return;
    const key = focusKey();
    const current = projection;
    const result = current.result;
    element.dataset['outcome'] = result.states.factualVerification;
    element.dataset['version'] = String(result.version);
    element.dataset['anchor'] = result.anchor.state;
    const decisionSection = renderDecision(current);
    const correctionSection = renderCorrection(current);
    if (correctionSection !== null) decisionSection.append(correctionSection);
    element.replaceChildren(renderConclusion(current), renderSources(current), decisionSection);
    restoreFocus(key);
  }

  function section(name: 'conclusion' | 'sources' | 'decision', className: string, title: string): HTMLElement {
    const node = el('section', `${className} fact-section`);
    node.dataset['factSection'] = name;
    const heading = el('h6', 'fact-section-heading', title);
    if (name === 'conclusion') heading.id = headingId;
    node.append(heading);
    return node;
  }

  function renderConclusion(current: EvidenceWorkspaceProjection): HTMLElement {
    const result = current.result;
    const node = section('conclusion', 'evidence-conclusion', EVIDENCE_CONCLUSION_HEADING);
    const line = el('p', 'evidence-conclusion-line');
    line.append(factStateBadge(result), ' ', el('span', 'evidence-level', factLevelLine(result)));
    node.append(line);
    const lead = hooks?.lead() ?? [];
    if (lead.length > 0) {
      const row = el('div', 'evidence-conclusion-lead');
      row.append(...lead);
      node.append(row);
    }
    const noMutation = technicalWords(EVIDENCE_NO_MUTATION);
    if (noMutation !== '') node.append(el('p', 'evidence-no-mutation', noMutation));
    const wording = el('div', 'evidence-wording');
    wording.append(el('span', 'evidence-term', `${EVIDENCE_WORDING_LABEL} · ${factLocationLine(result)}`), el('blockquote', 'evidence-quote', result.quote));
    const go = hooks?.goToText() ?? null;
    if (go !== null) wording.append(go);
    const statement = el('div', 'evidence-statement');
    statement.append(el('span', 'evidence-term', EVIDENCE_STATEMENT_LABEL), el('p', undefined, result.normalizedStatement));
    // The other two states, each with its own term, never merged into the badge (FACT-007, ADR 0074 item 4).
    const states = el('p', 'evidence-states');
    const integrity = el('span', 'evidence-state', result.states.referenceIntegrity === 'verified' ? '引文已在原文中定位' : '引文未能定位');
    integrity.dataset['stateTerm'] = '引文完整性';
    const support = el('span', 'evidence-state', `断言支持：${result.states.claimSupport}`);
    support.dataset['stateTerm'] = '断言支持';
    states.append(integrity, ' · ', support);
    node.append(wording, statement, states, ...(hooks?.note() ?? []));
    if (result.limitations.length > 0) {
      const limits = el('div', 'evidence-limitations');
      limits.append(el('span', 'evidence-term', EVIDENCE_LIMITATIONS_HEADING));
      const list = el('ul');
      for (const entry of result.limitations) list.append(el('li', undefined, entry));
      limits.append(list);
      node.append(limits);
    }
    if (result.anchor.state === 'stale') node.append(el('p', 'evidence-anchor-stale', FACT_STALE_SENTENCE));
    if (current.history.length > 1) node.append(renderHistory(current));
    return node;
  }

  function renderCard(card: EvidenceSourceCardProjection): HTMLElement {
    const article = el('article', 'evidence-card');
    article.dataset['cardId'] = card.cardId;
    article.dataset['checkState'] = card.checkState;
    article.dataset['relation'] = card.relation;
    article.tabIndex = -1;
    const head = el('p', 'evidence-card-head');
    head.append(el('strong', 'evidence-card-name', sourceCardTitle(card)), el('span', 'evidence-card-check', ` · ${card.checkLabel} · ${card.relation}`));
    if (card.excluded) head.append(' · 已排除，来源及核查历史保留');
    article.append(head);
    if (card.sourceKind === 'web') article.append(el('p', 'technical-identity evidence-card-url', card.sourceRef));
    // An excerpt is shown only when it was obtained exactly; a candidate is never quoted (EVID-004, EVID-005).
    if (card.checkState === 'exact' && card.excerpt !== null) article.append(el('blockquote', 'evidence-excerpt', card.excerpt));
    const translation = hooks?.translation(card.cardId) ?? null;
    if (translation !== null) {
      const translated = el('figure', 'evidence-card-translation');
      translated.append(el('figcaption', undefined, `${SOURCE_TRANSLATION_LABEL} · ${SOURCE_TRANSLATION_MACHINE}`), el('blockquote', 'evidence-excerpt', translation));
      article.append(translated);
    }
    const detail = sourceRowDetail(card, options.instant);
    if (detail !== null) article.append(el('p', 'evidence-card-detail', detail));
    // The whole discrete-state table stays for developer mode only (Issue #1683 item 11).
    if (technicalLayerVisible) {
      const table = el('details', 'technical-details evidence-card-facts');
      table.append(el('summary', undefined, '查看技术详情'), facts(sourceCardFacts(card, options.instant)));
      article.append(table);
    }
    const actions = el('div', 'button-row evidence-card-actions');
    if (card.sourceKind === 'web') actions.append(sourceLinkControls({ address: card.sourceRef, identity: { bookId, resultId, cardId: card.cardId }, ...(linkApi === undefined ? {} : { api: linkApi }) }));
    if (card.evidenceId !== null) {
      const evidenceId = card.evidenceId;
      actions.append(button(EVIDENCE_OPEN_SOURCE, 'open-source', 'quiet', () => options.openSource(evidenceId)));
    }
    const isPinned = pinned.includes(card.cardId);
    const pin = el('input');
    pin.type = 'checkbox';
    pin.checked = isPinned;
    pin.disabled = working || (!isPinned && pinned.length >= EVIDENCE_MATRIX_MAX_PINNED);
    pin.dataset['evidencePin'] = card.cardId;
    pin.dataset['evidenceFocus'] = `pin:${card.cardId}`;
    pin.addEventListener('change', () => {
      const at = pinned.indexOf(card.cardId);
      if (at >= 0) pinned.splice(at, 1);
      else if (pinned.length < EVIDENCE_MATRIX_MAX_PINNED) pinned.push(card.cardId);
      render();
    });
    const pinLabel = el('label', 'evidence-pin');
    pinLabel.append(pin, el('span', undefined, isPinned ? EVIDENCE_UNPIN : pinned.length >= EVIDENCE_MATRIX_MAX_PINNED ? `${EVIDENCE_PIN} · ${EVIDENCE_PIN_FULL}` : EVIDENCE_PIN));
    actions.append(pinLabel);
    if (!card.excluded && projection?.claimRecheckAvailable && projection.decisionCard.drift === null) {
      // Excluding marks the source only; it goes with 要补充证据 when that is pressed (Issue #1683 item 10).
      const exclude = el('input');
      exclude.type = 'checkbox';
      exclude.checked = excludedSources.has(card.sourceRef);
      exclude.disabled = working;
      exclude.dataset['evidenceExclude'] = card.cardId;
      exclude.addEventListener('change', () => {
        if (exclude.checked) excludedSources.add(card.sourceRef);
        else excludedSources.delete(card.sourceRef);
        render();
      });
      const label = el('label', 'evidence-exclude');
      label.append(exclude, el('span', undefined, '排除此来源，并要求补充证据'));
      actions.append(label);
    }
    article.append(actions);
    return article;
  }

  function renderSources(current: EvidenceWorkspaceProjection): HTMLElement {
    const node = section('sources', 'evidence-sources', EVIDENCE_SOURCES_HEADING);
    node.dataset['totalSources'] = String(current.totalSources);
    node.append(el('p', 'evidence-counts', factSourceCountsLine(current.result)));
    if (sources.length === 0) node.append(el('p', 'evidence-sources-none', EVIDENCE_SOURCES_NONE));
    const conflicts = renderConflicts(current);
    if (conflicts !== null) node.append(conflicts);
    const list = el('div', 'evidence-source-rows');
    for (const card of sources) list.append(renderCard(card));
    node.append(list);
    if (nextCursor !== null) node.append(button(EVIDENCE_SOURCES_MORE, 'more-sources', 'secondary', () => void moreSources()));
    const matrix = renderMatrix();
    if (matrix !== null) node.append(matrix);
    node.append(renderSummary(current));
    return node;
  }

  function renderMatrix(): HTMLElement | null {
    // 来源对比 appears once a source is pinned: its hint while one is, the table from two (Issue #1683 item 9).
    if (pinned.length === 0) return null;
    const node = el('section', 'evidence-matrix');
    node.dataset['pinnedCount'] = String(pinned.length);
    const heading = el('h6', undefined, EVIDENCE_MATRIX_HEADING);
    node.append(heading);
    const cards = pinned.map((id) => sources.find((card) => card.cardId === id)).filter((card): card is EvidenceSourceCardProjection => card !== undefined);
    if (cards.length < 2) {
      heading.append(` · ${EVIDENCE_MATRIX_HINT}`);
      return node;
    }
    const table = el('table', 'evidence-matrix-table');
    const head = el('tr');
    head.append(el('th', undefined, ''));
    for (const card of cards) head.append(el('th', undefined, sourceCardTitle(card)));
    table.append(head);
    const rows: Array<readonly [string, (card: EvidenceSourceCardProjection) => string]> = [
      ['摘录', (card) => card.excerpt ?? card.checkLabel],
      ...sourceCardFacts(cards[0]!, options.instant).map(([term]) => [term, (card: EvidenceSourceCardProjection) =>
        sourceCardFacts(card, options.instant).find(([candidate]) => candidate === term)?.[1] ?? '—'] as const),
    ];
    for (const [term, value] of rows) {
      const row = el('tr');
      row.append(el('th', undefined, term));
      for (const card of cards) row.append(el('td', undefined, value(card)));
      table.append(row);
    }
    node.append(table);
    return node;
  }

  function renderConflicts(current: EvidenceWorkspaceProjection): HTMLElement | null {
    if (current.conflicts.length === 0) return null;
    const node = el('section', 'evidence-conflicts');
    node.dataset['conflictCount'] = String(current.conflicts.length);
    node.append(el('h6', undefined, EVIDENCE_CONFLICTS_HEADING));
    for (const conflict of current.conflicts) {
      const pair = el('div', 'evidence-conflict');
      for (const [label, id] of [['支持', conflict.supportingCardId], ['反驳', conflict.refutingCardId]] as const) {
        const card = sources.find((entry) => entry.cardId === id);
        const side = el('div', 'evidence-conflict-side');
        side.append(el('span', 'evidence-term', label), button(card === undefined ? '查看关联来源' : sourceCardTitle(card), 'focus-source', 'quiet', () => void focusSource(id)));
        if (card?.excerpt != null) side.append(el('blockquote', 'evidence-excerpt', card.excerpt));
        pair.append(side);
      }
      pair.append(el('p', 'evidence-conflict-point', conflict.point));
      node.append(pair);
    }
    return node;
  }

  function renderSummary(current: EvidenceWorkspaceProjection): HTMLElement {
    const node = el('section', 'evidence-summary');
    node.dataset['label'] = current.summary.label;
    node.append(el('h6', undefined, EVIDENCE_SUMMARY_HEADING));
    const list = el('ul');
    for (const statement of current.summary.statements) {
      const item = el('li', undefined, statement.text);
      for (const id of statement.cardIds) {
        const card = sources.find((entry) => entry.cardId === id);
        const link = button(card === undefined ? '查看关联来源' : sourceCardTitle(card), 'focus-source', 'quiet', () => void focusSource(id));
        link.dataset['summaryLink'] = id;
        item.append(' ', link);
      }
      list.append(item);
    }
    node.append(list);
    return node;
  }

  function renderHistory(current: EvidenceWorkspaceProjection): HTMLElement {
    const node = el('section', 'evidence-history');
    node.append(el('h6', undefined, EVIDENCE_HISTORY_HEADING));
    const list = el('ol');
    for (const entry of current.history) {
      list.append(el('li', entry.resultId === current.result.resultId ? 'evidence-history-current' : undefined,
        `${technicalWords(`第 ${entry.version} 版 · `)}${entry.outcome} · ${options.instant(entry.recordedAt)}`));
    }
    node.append(list);
    return node;
  }

  // ---- 你的决定: one row for the verification review (set B) and the finding's own actions (set A) — Issue #1683 item 10 -----

  function renderDecision(current: EvidenceWorkspaceProjection): HTMLElement {
    const node = section('decision', 'evidence-decision', DECISION_HEADING);
    node.tabIndex = -1;
    node.dataset['evidenceFocus'] = 'decision';
    const card = current.decisionCard;
    const offered = current.result.pendingReview && card.drift === null && card.choices.length > 0;
    const offers = (disposition: VerificationReviewDisposition): boolean => offered && card.choices.some((choice) => choice.disposition === disposition);
    const decide = (disposition: VerificationReviewDisposition, tone: 'primary' | 'secondary' | 'quiet'): HTMLButtonElement => {
      const control = button(DECISION_LABELS[disposition], 'decide', tone, () => {
        if (disposition !== 'own-words') { void recordDecision(disposition); return; }
        decision = { ...decision, ownWordsOpen: true, problem: null };
        render();
        element.querySelector<HTMLElement>('[data-evidence-focus="own-words"]')?.focus();
      });
      control.dataset['decisionChoice'] = disposition;
      control.dataset['evidenceFocus'] = `choice:${disposition}`;
      return control;
    };
    if (offered) node.append(renderReasons(current));
    const row = el('div', 'button-row evidence-decision-row');
    for (const disposition of ['accept', 'request-evidence'] as const) if (offers(disposition)) row.append(decide(disposition, disposition === 'accept' ? 'primary' : 'secondary'));
    if (current.result.correctionAvailable && draft === null && saved === null) row.append(button(CORRECTION_PREPARE, 'prepare-correction', 'secondary', () => void prepareCorrection()));
    const finding = hooks?.actions() ?? { direct: [], more: [] };
    row.append(...finding.direct);
    const more = [...(['decline', 'keep-pending', 'own-words'] as const).filter(offers).map((disposition) => decide(disposition, 'quiet')), ...finding.more];
    if (more.length > 0) {
      const fold = el('details', 'review-more review-card-more evidence-decision-more');
      const summary = el('summary', undefined, '⋯');
      summary.setAttribute('aria-label', '更多决定');
      fold.append(summary, menuPanel(...more));
      row.append(fold);
    }
    if (row.childElementCount > 0) node.append(row);
    if (offers('own-words') && decision.ownWordsOpen) {
      const field = el('label', 'evidence-field');
      const area = el('textarea');
      area.value = decision.ownWords;
      area.rows = 2;
      area.dataset['decisionField'] = 'own-words';
      area.dataset['evidenceFocus'] = 'own-words';
      area.addEventListener('input', () => { decision.ownWords = area.value; });
      field.append(el('span', undefined, DECISION_OWN_WORDS_LABEL), area);
      node.append(field, button(DECISION_OWN_WORDS_RECORD, 'record-own-words', 'primary', () => void recordDecision('own-words')));
    }
    if (decision.problem !== null) node.append(el('p', 'form-error', decision.problem));
    for (const recorded of current.decisions) {
      const line = el('p', 'evidence-decision-recorded', factDecisionLine(recorded));
      line.dataset['decisionId'] = recorded.decisionId;
      line.dataset['superseded'] = recorded.superseded ? 'true' : 'false';
      if (recorded.superseded) line.append(` · ${DECISION_SUPERSEDED}`);
      node.append(line);
    }
    if (offered || current.decisions.length > 0) node.append(el('p', 'field-note evidence-decision-note', DECISION_NOTE));
    if (card.recommendation !== null) {
      node.append(el('p', 'evidence-decision-recommendation', `AI7 建议「${DECISION_LABELS[card.recommendation.disposition].replace(/…$/u, '')}」：${card.recommendation.rationale}`));
    }
    if (card.drift !== null) {
      const drift = el('p', 'evidence-decision-drift', card.drift);
      drift.setAttribute('role', 'alert');
      node.append(drift);
    }
    const latest = current.decisions.at(-1);
    if (current.claimRecheckAvailable && latest?.disposition === 'request-evidence' && latest.resultId === resultId && !latest.superseded && card.drift === null && options.prepareSupplementary !== undefined) {
      node.append(button('补充核查', 'prepare-supplementary', 'secondary', () => {
        working = true; render();
        void options.prepareSupplementary!(latest.decisionId).catch((error: unknown) => {
          options.setStatus(options.errorMessage(error, '无法准备补充核查计划。'), 'error');
        }).finally(() => { working = false; if (!destroyed) render(); });
      }));
    }
    return node;
  }

  /** 写理由 · 可不填 (FREV-009): suggestions unselected; one taken as is, corrected, or the editor's own words — sent with the next set-B button. */
  function renderReasons(current: EvidenceWorkspaceProjection): HTMLElement {
    const fold = el('details', 'evidence-decision-reasons-fold');
    fold.open = decision.reasonOpen;
    fold.addEventListener('toggle', () => { decision.reasonOpen = fold.open; });
    const summary = el('summary', undefined, DECISION_REASON_HEADING);
    summary.dataset['evidenceFocus'] = 'reason-fold';
    const reasons = el('div', 'evidence-decision-reasons');
    for (const suggestion of current.decisionCard.reasonSuggestions) {
      const chip = button(suggestion, 'reason-suggestion', decision.suggestion === suggestion ? 'secondary' : 'quiet', () => {
        decision = decision.suggestion === suggestion
          ? { ...decision, suggestion: null, reasonText: '', reasonEdited: false }
          : { ...decision, suggestion, reasonText: suggestion, reasonEdited: false };
        render();
      });
      chip.setAttribute('aria-pressed', decision.suggestion === suggestion ? 'true' : 'false');
      chip.dataset['reasonSuggestion'] = suggestion;
      chip.dataset['evidenceFocus'] = `reason:${suggestion}`;
      reasons.append(chip);
    }
    const reasonField = el('label', 'evidence-field');
    const reason = el('textarea');
    reason.rows = 2;
    reason.value = decision.reasonText;
    reason.placeholder = DECISION_REASON_FREE;
    reason.dataset['decisionField'] = 'reason';
    reason.dataset['evidenceFocus'] = 'reason';
    reason.addEventListener('input', () => {
      decision.reasonText = reason.value;
      decision.reasonEdited = true;
    });
    reasonField.append(el('span', undefined, DECISION_REASON_FIELD), reason);
    reasons.append(reasonField);
    fold.append(summary, reasons);
    return fold;
  }

  async function recordDecision(disposition: VerificationReviewDisposition): Promise<void> {
    const current = projection;
    if (current === null || working) return;
    const text = decision.reasonText.trim();
    let state: VerificationReasonState | null = null;
    if (text.length > 0) state = decision.suggestion === null ? 'replaced' : !decision.reasonEdited || text === decision.suggestion ? 'selected' : 'corrected';
    working = true;
    render();
    options.setStatus(DECISION_RECORDING, 'busy');
    try {
      const recorded = await api.recordVerificationReviewDecision({
        ...(disposition !== 'request-evidence' || excludedSources.size === 0 ? {} : { excludedSourceRefs: [...excludedSources] }),
        bookId, resultId, resultVersion: current.result.version, disposition,
        ownWords: disposition === 'own-words' ? decision.ownWords : null,
        reason: state === null ? null : { state, text: state === 'selected' ? decision.suggestion! : text, suggestion: state === 'replaced' ? null : decision.suggestion },
      });
      if (destroyed) return;
      projection = recorded.workspace;
      sources = [...recorded.workspace.sources];
      nextCursor = recorded.workspace.nextSourceCursor;
      excludedSources.clear();
      decision = emptyForm();
      options.setStatus(recorded.supplementary === null ? DECISION_RECORDED : `${DECISION_RECORDED}${recorded.supplementary.statement}`, 'success');
      options.changed();
    } catch (error) {
      decision.problem = options.errorMessage(error, DECISION_FAILED);
      options.setStatus(decision.problem, 'error');
    } finally {
      working = false;
      render();
    }
  }

  // ---- the Correction Proposal draft (CORR-001 to CORR-011) -------------------------------------------------------------

  function renderCorrection(current: EvidenceWorkspaceProjection): HTMLElement | null {
    if (saved !== null) {
      const done = el('section', 'evidence-correction');
      const line = el('p', 'correction-saved', saved.completionLabel);
      line.dataset['markIds'] = saved.markIds.join(',');
      done.append(el('h6', undefined, CORRECTION_HEADING), line);
      if (saved.label !== null) done.append(el('p', 'correction-assurance-label', saved.label));
      const first = saved.markIds[0];
      if (first !== undefined) done.append(button(CORRECTION_SAVED_GO, 'go-to-correction', 'secondary', () => void options.goToText({ blockId: savedBlockId ?? current.result.blockId, markId: first })));
      return done;
    }
    // 准备修改建议 stands on the decision row; the draft follows it once prepared.
    if (draft === null || correction === null) return null;
    const form = correction;
    const section = el('section', 'evidence-correction');
    section.append(el('h6', undefined, CORRECTION_HEADING));
    if (draft.label !== null) {
      const label = el('p', 'correction-assurance-label', draft.label);
      label.dataset['assuranceIncomplete'] = 'true';
      if (draft.missingChecks.length > 0) label.append(` · 尚缺：${draft.missingChecks.join('、')}`);
      section.append(label);
    }
    const group = el('fieldset', 'correction-variants');
    const name = uid('variant');
    group.append(el('legend', undefined, `更正方案 · ${draft.variants.length === 0 ? `${draft.scopeStatement.replace(/。$/u, '')}；${CORRECTION_NO_VARIANTS}` : draft.scopeStatement}`));
    const choices: Array<{ id: string; label: string; text: string | null; rationale: string | null; lines: string[] }> = [
      ...draft.variants.map((variant, index) => ({ id: variant.variantId, label: `方案 ${index + 1}：${variant.text}`, text: variant.text, rationale: variant.rationale,
        lines: [variant.rationale, ...variant.unresolved.map((line) => `未解决：${line}`), ...variant.limitations.map((line) => `局限：${line}`)] })),
      { id: 'own-edit', label: CORRECTION_OWN_EDIT, text: null, rationale: null, lines: [] },
    ];
    for (const choice of choices) {
      const label = el('label', 'correction-variant');
      const input = el('input');
      input.type = 'radio';
      input.name = name;
      input.value = choice.id;
      input.checked = form.choice === choice.id;
      input.disabled = working;
      input.dataset['correctionVariant'] = choice.id;
      input.dataset['evidenceFocus'] = `variant:${choice.id}`;
      input.addEventListener('change', () => {
        form.choice = choice.id;
        if (choice.text !== null) form.text = choice.text;
        if (choice.rationale !== null) form.rationale = choice.rationale;
        form.problem = null;
        render();
      });
      const body = el('span', 'correction-variant-body');
      const detail = choice.lines.length === 0 ? '' : ` · ${choice.lines.map((line) => line.replace(/。$/u, '')).join('；')}。`;
      body.append(el('span', undefined, `${choice.label}${detail}`));
      label.append(input, body);
      group.append(label);
      const variant = draft.variants.find((entry) => entry.variantId === choice.id);
      if (variant !== undefined) {
        const links = el('div', 'button-row');
        for (const cardId of variant.evidenceCardIds) {
          const card = sources.find((entry) => entry.cardId === cardId);
          const link = button(card === undefined ? '查看关联来源' : sourceCardTitle(card), 'focus-source', 'quiet', () => void focusSource(cardId));
          link.dataset['correctionEvidenceLink'] = cardId;
          links.append(link);
        }
        group.append(links);
      }
    }
    section.append(group);
    if (form.choice === 'own-edit') {
      const field = el('label', 'evidence-field');
      const area = el('textarea');
      area.rows = 2;
      area.value = form.text;
      area.dataset['correctionField'] = 'text';
      area.dataset['evidenceFocus'] = 'correction-text';
      area.addEventListener('input', () => { form.text = area.value; });
      field.append(el('span', undefined, CORRECTION_OWN_TEXT_LABEL), area);
      section.append(field);
    }
    if (form.choice !== null) {
      const field = el('label', 'evidence-field');
      const area = el('textarea');
      area.rows = 2;
      area.value = form.rationale;
      area.dataset['correctionField'] = 'rationale';
      area.dataset['evidenceFocus'] = 'correction-rationale';
      area.addEventListener('input', () => { form.rationale = area.value; });
      field.append(el('span', undefined, CORRECTION_RATIONALE_LABEL), area);
      section.append(field);
    }
    const ranges = el('fieldset', 'correction-ranges');
    ranges.append(el('legend', undefined, `${CORRECTION_RANGES_HEADING} · ${CORRECTION_RANGES_NOTE}`));
    for (const range of draft.ranges) {
      const label = el('label', 'correction-range');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = form.ranges.has(range.rangeId);
      input.disabled = working || !range.current;
      input.dataset['correctionRange'] = range.rangeId;
      input.dataset['primary'] = range.primary ? 'true' : 'false';
      input.dataset['evidenceFocus'] = `range:${range.rangeId}`;
      input.addEventListener('change', () => {
        if (input.checked) form.ranges.add(range.rangeId);
        else form.ranges.delete(range.rangeId);
      });
      label.append(input, el('span', undefined, `${range.heading ?? '正文'} · 「${range.text}」${range.primary ? ' · 这条发现所在处' : ''}${range.current ? '' : ' · 文字已改动，不能选'}`));
      ranges.append(label);
    }
    section.append(ranges);
    if (form.problem !== null) section.append(el('p', 'form-error', form.problem));
    const save = button(CORRECTION_SAVE, 'save-correction', 'primary', () => void saveCorrection());
    save.disabled = working || form.choice === null;
    save.dataset['evidenceFocus'] = 'save-correction';
    section.append(save);
    return section;
  }

  async function prepareCorrection(): Promise<void> {
    working = true;
    render();
    options.setStatus('正在准备修改建议…', 'busy');
    try {
      const next = await api.prepareCorrectionProposal({ bookId, resultId });
      if (destroyed) return;
      draft = next;
      // The first variant is chosen to begin with (Issue #1410 item 18); the editor picks another or writes their own.
      const first = next.variants[0];
      correction = { choice: first === undefined ? 'own-edit' : first.variantId, text: first?.text ?? '', rationale: first?.rationale ?? '',
        ranges: new Set(next.ranges.filter((range) => range.primary && range.current).map((range) => range.rangeId)), problem: null };
      reportResult(options.setStatus, '修改建议已准备：已选第一个方案，可改选或自行编辑。');
    } catch (error) {
      options.setStatus(options.errorMessage(error, CORRECTION_PREPARE_FAILED), 'error');
    } finally {
      working = false;
      render();
    }
  }

  async function saveCorrection(): Promise<void> {
    const form = correction;
    const offer = draft;
    if (form === null || offer === null || form.choice === null) return;
    working = true;
    render();
    options.setStatus('正在保存为修改建议…', 'busy');
    try {
      saved = await api.saveCorrectionProposal({
        bookId, resultId, resultVersion: offer.result.version, variantId: form.choice === 'own-edit' ? null : form.choice,
        text: form.text, rationale: form.rationale, rangeIds: [...form.ranges],
      });
      savedBlockId = offer.ranges.find((range) => range.rangeId === [...form.ranges][0])?.blockId ?? null;
      if (destroyed) return;
      options.setStatus(saved.completionLabel, 'success');
      options.changed();
    } catch (error) {
      form.problem = options.errorMessage(error, CORRECTION_FAILED);
      options.setStatus(form.problem, 'error');
    } finally {
      working = false;
      render();
    }
  }

  return {
    element,
    resultId,
    load,
    attach: (next) => {
      hooks = next;
      render();
    },
    destroy: () => {
      destroyed = true;
      element.remove();
    },
  };
}
