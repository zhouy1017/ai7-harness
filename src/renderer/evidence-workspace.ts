import {
  EVIDENCE_MATRIX_MAX_PINNED,
  type CorrectionProposalDraftProjection,
  type CorrectionProposalSavedProjection,
  type EvidenceSourceCardProjection,
  type EvidenceWorkspaceProjection,
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
  DECISION_NOTE,
  DECISION_OWN_WORDS_LABEL,
  DECISION_REASON_FIELD,
  DECISION_REASON_FREE,
  DECISION_REASON_HEADING,
  DECISION_RECORD,
  DECISION_RECORDED,
  DECISION_SUPERSEDED,
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
  EVIDENCE_STATEMENT_NOTE,
  EVIDENCE_SUMMARY_HEADING,
  EVIDENCE_SUMMARY_NOT_EVIDENCE,
  EVIDENCE_UNPIN,
  EVIDENCE_WORDING_LABEL,
  EVIDENCE_WORKSPACE_HEADING,
  factDecisionLine,
  factLevelLine,
  factSourceCountsLine,
  factStateLines,
  outcomeTone,
  sourceCardFacts,
  sourceCardTitle,
} from './evidence-workspace-labels.js';

/**
 * The Assertion-centered Evidence Workspace (Issue #901; V2-UX-EVID-001 to 013, FREV-004 to 011, CORR-001 to 012): one result,
 * its exact wording apart from AI7's statement, its sources as discrete-state cards — two to four pinned into a comparison,
 * the rest one page after another — conflicts side by side, the non-evidentiary summary, and directly after the result the
 * Factual Review Decision Card and, where offered, the Correction Proposal draft. Reading it changes nothing: only
 * 记录核查审阅决定 and 保存为更正提案 record anything, each the editor's explicit action. Free text is typed into ordinary fields
 * that are never redrawn while the editor types, so Chinese input methods compose undisturbed.
 */
export interface EvidenceWorkspaceSurface {
  readonly element: HTMLElement;
  readonly resultId: string;
  load(): Promise<void>;
  destroy(): void;
}

export interface MountEvidenceWorkspaceOptions {
  readonly bookId: string;
  readonly resultId: string;
  readonly api: Pick<RendererApi, 'inspectEvidenceWorkspace' | 'recordVerificationReviewDecision' | 'prepareCorrectionProposal' | 'saveCorrectionProposal'>;
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
  disposition: VerificationReviewDisposition | null;
  ownWords: string;
  suggestion: string | null;
  reasonText: string;
  reasonEdited: boolean;
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
  if (text !== undefined) node.textContent = text;
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

export function mountEvidenceWorkspace(options: MountEvidenceWorkspaceOptions): EvidenceWorkspaceSurface {
  const { api, bookId, resultId } = options;
  const element = el('section', 'evidence-workspace');
  element.dataset['resultId'] = resultId;
  const headingId = uid('heading');
  element.setAttribute('aria-labelledby', headingId);
  let destroyed = false;
  let working = false;
  let projection: EvidenceWorkspaceProjection | null = null;
  let sources: EvidenceSourceCardProjection[] = [];
  let nextCursor: number | null = null;
  const pinned: string[] = [];
  let decision: DecisionForm = { disposition: null, ownWords: '', suggestion: null, reasonText: '', reasonEdited: false, problem: null };
  let draft: CorrectionProposalDraftProjection | null = null;
  let correction: CorrectionForm | null = null;
  let saved: CorrectionProposalSavedProjection | null = null;

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
    element.querySelector<HTMLElement>(`[data-evidence-focus="${CSS.escape(key)}"]`)?.focus();
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

  // ---- rendering ------------------------------------------------------------------------------------------------------

  function render(): void {
    if (destroyed || projection === null) return;
    const key = focusKey();
    const current = projection;
    const result = current.result;
    element.dataset['outcome'] = result.states.factualVerification;
    element.dataset['version'] = String(result.version);
    element.dataset['anchor'] = result.anchor.state;
    const heading = el('h6', undefined, EVIDENCE_WORKSPACE_HEADING);
    heading.id = headingId;
    const header = el('div', 'evidence-header');
    const wording = el('div', 'evidence-wording');
    wording.append(el('span', 'evidence-term', EVIDENCE_WORDING_LABEL), el('blockquote', 'evidence-quote', result.quote));
    const statement = el('div', 'evidence-statement');
    statement.append(el('span', 'evidence-term', EVIDENCE_STATEMENT_LABEL), el('p', undefined, result.normalizedStatement), el('p', 'field-note', EVIDENCE_STATEMENT_NOTE));
    header.append(wording, statement);
    const states = el('div', 'evidence-states');
    for (const [term, value] of factStateLines(result)) {
      const state = el('span', 'evidence-state');
      state.dataset['stateTerm'] = term;
      state.append(el('span', 'evidence-term', term), el('span', `status-pill evidence-pill evidence-pill-${term === '事实核查' ? outcomeTone(result.states.factualVerification) : 'neutral'}`, value));
      states.append(state);
    }
    const children: HTMLElement[] = [heading, header, states, el('p', 'evidence-level', factLevelLine(result)), el('p', 'evidence-counts', factSourceCountsLine(result))];
    if (result.anchor.label !== null) children.push(el('p', 'evidence-anchor-stale', `${result.anchor.label}：稿件在这段文字处已经改动；这条结果只作为历史保留，不会移到相似的文字上。`));
    if (result.limitations.length > 0) {
      const limits = el('div', 'evidence-limitations');
      limits.append(el('span', 'evidence-term', EVIDENCE_LIMITATIONS_HEADING));
      const list = el('ul');
      for (const line of result.limitations) list.append(el('li', undefined, line));
      limits.append(list);
      children.push(limits);
    }
    children.push(renderSources(), renderMatrix(), renderConflicts(current), renderSummary(current), renderHistory(current), renderDecision(current));
    const correctionSection = renderCorrection(current);
    if (correctionSection !== null) children.push(correctionSection);
    children.push(el('p', 'field-note evidence-no-mutation', EVIDENCE_NO_MUTATION));
    element.replaceChildren(...children);
    restoreFocus(key);
  }

  function renderCard(card: EvidenceSourceCardProjection): HTMLElement {
    const article = el('article', 'evidence-card');
    article.dataset['cardId'] = card.cardId;
    article.dataset['checkState'] = card.checkState;
    article.dataset['relation'] = card.relation;
    article.tabIndex = -1;
    article.append(el('h6', undefined, sourceCardTitle(card)));
    if (card.sourceKind === 'web') article.append(el('p', 'technical-identity evidence-card-url', card.sourceRef));
    // An excerpt is shown only when it was obtained exactly; a candidate is never quoted (EVID-004, EVID-005).
    if (card.excerpt !== null) article.append(el('blockquote', 'evidence-excerpt', card.excerpt));
    article.append(facts(sourceCardFacts(card, options.instant)));
    const actions = el('div', 'button-row evidence-card-actions');
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
    pinLabel.append(pin, el('span', undefined, isPinned ? EVIDENCE_UNPIN : EVIDENCE_PIN));
    actions.append(pinLabel);
    if (!isPinned && pinned.length >= EVIDENCE_MATRIX_MAX_PINNED) actions.append(el('span', 'field-note', EVIDENCE_PIN_FULL));
    if (card.evidenceId !== null) {
      const evidenceId = card.evidenceId;
      actions.append(button(EVIDENCE_OPEN_SOURCE, 'open-source', 'quiet', () => options.openSource(evidenceId)));
    }
    article.append(actions);
    return article;
  }

  function renderSources(): HTMLElement {
    const section = el('section', 'evidence-sources');
    section.dataset['totalSources'] = String(projection?.totalSources ?? 0);
    section.append(el('h6', undefined, EVIDENCE_SOURCES_HEADING));
    if (sources.length === 0) section.append(el('p', 'field-note', EVIDENCE_SOURCES_NONE));
    for (const card of sources) section.append(renderCard(card));
    if (nextCursor !== null) section.append(button(EVIDENCE_SOURCES_MORE, 'more-sources', 'secondary', () => void moreSources()));
    return section;
  }

  function renderMatrix(): HTMLElement {
    const section = el('section', 'evidence-matrix');
    section.dataset['pinnedCount'] = String(pinned.length);
    section.append(el('h6', undefined, EVIDENCE_MATRIX_HEADING));
    const cards = pinned.map((id) => sources.find((card) => card.cardId === id)).filter((card): card is EvidenceSourceCardProjection => card !== undefined);
    if (cards.length < 2) {
      section.append(el('p', 'field-note', EVIDENCE_MATRIX_HINT));
      return section;
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
    section.append(table);
    return section;
  }

  function renderConflicts(current: EvidenceWorkspaceProjection): HTMLElement {
    const section = el('section', 'evidence-conflicts');
    section.dataset['conflictCount'] = String(current.conflicts.length);
    if (current.conflicts.length === 0) return section;
    section.append(el('h6', undefined, EVIDENCE_CONFLICTS_HEADING));
    for (const conflict of current.conflicts) {
      const pair = el('div', 'evidence-conflict');
      for (const [label, id] of [['支持', conflict.supportingCardId], ['反驳', conflict.refutingCardId]] as const) {
        const card = sources.find((entry) => entry.cardId === id);
        const side = el('div', 'evidence-conflict-side');
        side.append(el('span', 'evidence-term', label), el('p', undefined, card === undefined ? id : sourceCardTitle(card)));
        if (card?.excerpt != null) side.append(el('blockquote', 'evidence-excerpt', card.excerpt));
        pair.append(side);
      }
      pair.append(el('p', 'evidence-conflict-point', conflict.point));
      section.append(pair);
    }
    return section;
  }

  function renderSummary(current: EvidenceWorkspaceProjection): HTMLElement {
    const section = el('section', 'evidence-summary');
    section.dataset['label'] = current.summary.label;
    section.append(el('h6', undefined, `${EVIDENCE_SUMMARY_HEADING} · ${current.summary.label}`), el('p', 'field-note', EVIDENCE_SUMMARY_NOT_EVIDENCE));
    const list = el('ul');
    for (const statement of current.summary.statements) {
      const item = el('li', undefined, statement.text);
      for (const id of statement.cardIds) {
        const card = sources.find((entry) => entry.cardId === id);
        if (card === undefined) continue;
        const link = button(sourceCardTitle(card), 'focus-source', 'quiet', () => {
          element.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)?.focus();
        });
        link.dataset['summaryLink'] = id;
        item.append(' ', link);
      }
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function renderHistory(current: EvidenceWorkspaceProjection): HTMLElement {
    const section = el('section', 'evidence-history');
    section.append(el('h6', undefined, EVIDENCE_HISTORY_HEADING));
    const list = el('ol');
    for (const entry of current.history) {
      list.append(el('li', entry.resultId === current.result.resultId ? 'evidence-history-current' : undefined,
        `第 ${entry.version} 版 · ${entry.outcome} · ${options.instant(entry.recordedAt)}`));
    }
    section.append(list);
    return section;
  }

  // ---- the Factual Review Decision Card (FREV-004 to FREV-011) -----------------------------------------------------------

  function renderDecision(current: EvidenceWorkspaceProjection): HTMLElement {
    const section = el('section', 'evidence-decision');
    const titleId = uid('decision');
    const title = el('h6', undefined, DECISION_HEADING);
    title.id = titleId;
    section.append(title, el('p', 'field-note', DECISION_NOTE));
    for (const recorded of current.decisions) {
      const line = el('p', 'evidence-decision-recorded', factDecisionLine(recorded));
      line.dataset['decisionId'] = recorded.decisionId;
      line.dataset['superseded'] = recorded.superseded ? 'true' : 'false';
      section.append(line);
      if (recorded.superseded) section.append(el('p', 'field-note', DECISION_SUPERSEDED));
    }
    const card = current.decisionCard;
    if (card.recommendation !== null) {
      section.append(el('p', 'evidence-decision-recommendation',
        `AI7 建议「${current.decisionCard.choices.find((choice) => choice.disposition === card.recommendation!.disposition)?.label ?? ''}」：${card.recommendation.rationale}（未预选）`));
    }
    if (card.drift !== null) {
      const drift = el('p', 'evidence-decision-drift', card.drift);
      drift.setAttribute('role', 'alert');
      section.append(drift);
    }
    if (!current.result.pendingReview && card.drift === null) return section;
    const group = el('fieldset', 'evidence-decision-choices');
    group.setAttribute('aria-labelledby', titleId);
    const name = uid('choice');
    for (const choice of card.choices) {
      const label = el('label', 'evidence-choice');
      const input = el('input');
      input.type = 'radio';
      input.name = name;
      input.value = choice.disposition;
      input.checked = decision.disposition === choice.disposition;
      input.disabled = working || card.drift !== null;
      input.dataset['decisionChoice'] = choice.disposition;
      input.dataset['evidenceFocus'] = `choice:${choice.disposition}`;
      input.addEventListener('change', () => {
        decision = { ...decision, disposition: choice.disposition, problem: null };
        render();
      });
      label.append(input, el('span', undefined, choice.label));
      group.append(label);
    }
    section.append(group);
    if (decision.disposition === 'own-words') {
      const field = el('label', 'evidence-field');
      const area = el('textarea');
      area.value = decision.ownWords;
      area.rows = 2;
      area.dataset['decisionField'] = 'own-words';
      area.dataset['evidenceFocus'] = 'own-words';
      area.addEventListener('input', () => { decision.ownWords = area.value; });
      field.append(el('span', undefined, DECISION_OWN_WORDS_LABEL), area);
      section.append(field);
    }
    // The optional reason (FREV-009): suggestions unselected; one taken as is, corrected, or the editor's own words.
    const reasons = el('div', 'evidence-decision-reasons');
    reasons.append(el('span', 'evidence-term', DECISION_REASON_HEADING));
    for (const suggestion of card.reasonSuggestions) {
      const chip = button(suggestion, 'reason-suggestion', decision.suggestion === suggestion ? 'secondary' : 'quiet', () => {
        decision = decision.suggestion === suggestion
          ? { ...decision, suggestion: null, reasonText: '', reasonEdited: false }
          : { ...decision, suggestion, reasonText: suggestion, reasonEdited: false };
        render();
      });
      chip.setAttribute('aria-pressed', decision.suggestion === suggestion ? 'true' : 'false');
      chip.dataset['reasonSuggestion'] = suggestion;
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
    section.append(reasons);
    if (decision.problem !== null) section.append(el('p', 'form-error', decision.problem));
    const record = button(DECISION_RECORD, 'record-decision', 'primary', () => void recordDecision());
    record.disabled = working || decision.disposition === null || card.drift !== null;
    record.dataset['evidenceFocus'] = 'record-decision';
    section.append(record);
    return section;
  }

  async function recordDecision(): Promise<void> {
    const current = projection;
    if (current === null || decision.disposition === null) return;
    const text = decision.reasonText.trim();
    let state: VerificationReasonState | null = null;
    if (text.length > 0) state = decision.suggestion === null ? 'replaced' : !decision.reasonEdited || text === decision.suggestion ? 'selected' : 'corrected';
    working = true;
    render();
    options.setStatus('正在记录核查审阅决定…', 'busy');
    try {
      const recorded = await api.recordVerificationReviewDecision({
        bookId, resultId, resultVersion: current.result.version, disposition: decision.disposition,
        ownWords: decision.disposition === 'own-words' ? decision.ownWords : null,
        reason: state === null ? null : { state, text: state === 'selected' ? decision.suggestion! : text, suggestion: state === 'replaced' ? null : decision.suggestion },
      });
      if (destroyed) return;
      projection = recorded.workspace;
      sources = [...recorded.workspace.sources];
      nextCursor = recorded.workspace.nextSourceCursor;
      decision = { disposition: null, ownWords: '', suggestion: null, reasonText: '', reasonEdited: false, problem: null };
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
      if (first !== undefined) done.append(button(CORRECTION_SAVED_GO, 'go-to-correction', 'secondary', () => void options.goToText({ blockId: current.result.blockId, markId: first })));
      return done;
    }
    if (draft === null || correction === null) {
      if (!current.result.correctionAvailable) return null;
      const section = el('section', 'evidence-correction');
      section.append(button(CORRECTION_PREPARE, 'prepare-correction', 'secondary', () => void prepareCorrection()));
      return section;
    }
    const form = correction;
    const section = el('section', 'evidence-correction');
    section.append(el('h6', undefined, CORRECTION_HEADING));
    if (draft.label !== null) {
      const label = el('p', 'correction-assurance-label', draft.label);
      label.dataset['assuranceIncomplete'] = 'true';
      section.append(label);
      if (draft.missingChecks.length > 0) section.append(el('p', 'field-note', `尚缺：${draft.missingChecks.join('、')}`));
    }
    section.append(el('p', 'field-note', draft.scopeStatement));
    const group = el('fieldset', 'correction-variants');
    const name = uid('variant');
    if (draft.variants.length === 0) group.append(el('p', 'field-note', CORRECTION_NO_VARIANTS));
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
      body.append(el('span', undefined, choice.label));
      for (const line of choice.lines) body.append(el('span', 'field-note', line));
      label.append(input, body);
      group.append(label);
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
    ranges.append(el('legend', undefined, CORRECTION_RANGES_HEADING), el('p', 'field-note', CORRECTION_RANGES_NOTE));
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
    options.setStatus('正在准备更正提案…', 'busy');
    try {
      const next = await api.prepareCorrectionProposal({ bookId, resultId });
      if (destroyed) return;
      draft = next;
      correction = { choice: null, text: '', rationale: '', ranges: new Set(next.ranges.filter((range) => range.primary && range.current).map((range) => range.rangeId)), problem: null };
      options.setStatus('更正提案已准备：方案都没有预选，请选择一个方案或自行编辑。');
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
    options.setStatus('正在保存为更正提案…', 'busy');
    try {
      saved = await api.saveCorrectionProposal({
        bookId, resultId, resultVersion: offer.result.version, variantId: form.choice === 'own-edit' ? null : form.choice,
        text: form.text, rationale: form.rationale, rangeIds: [...form.ranges],
      });
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
    destroy: () => {
      destroyed = true;
      element.remove();
    },
  };
}
