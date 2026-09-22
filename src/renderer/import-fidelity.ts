import type {
  FidelityCategoryProjection,
  ManuscriptConversionProjection,
  TextBoxDisposition,
} from '../shared/protocol.js';
import {
  FIDELITY_DETAILS_SUMMARY,
  TEXT_BOX_CHOICE_LEGEND,
  TEXT_BOX_CHOICE_OPTIONS,
  conversionNoteText,
  fidelityCountText,
  fidelityPillText,
  fidelityRows,
  fidelitySummaryLine,
  needsDegradationDecision,
  offersTextBoxChoice,
  roundTripCard,
  textBoxChoiceStatement,
} from './import-fidelity-labels.js';

/**
 * ④ 保真审阅 (Issue #410, plan slice S61; editor-surfaces §7, V2-UX-IMP-002 to 005, IMP-055; ADR 0086): the
 * Import Fidelity Review as the target screen, the Review Before Import and a converted file's review draw
 * it. The first nine classes are rows — 内容类 · 数量 · 怎样进来 · 以后导出 — and the tenth closes them as the
 * 预计往返 card. Each status reads in text and shape as well as colour; a class kept with the file reads
 * `完整保留（随文件保留）`. The text-box row carries the one choice the review makes, `保留为文本框` preselected
 * and `并入正文`. A review that asks for no decision reads as one concise line whose rows expand; one that
 * does lays its rows out, because the editor decides on exactly them.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Where the text-box choice stands on this surface: `offer` on the target screen, where the editor makes
 * it; `stated` on the review, which was formed with it; `none` wherever the review is only read back.
 */
export type TextBoxChoiceMode =
  | { kind: 'offer' }
  | { kind: 'stated'; disposition: TextBoxDisposition | null }
  | { kind: 'none' };

export interface FidelityReviewView {
  readonly elements: ReadonlyArray<HTMLElement>;
  /** The choice as the editor has left it: `retain` until they choose otherwise. */
  textBoxDisposition(): TextBoxDisposition;
}

function textBoxChoice(
  mode: 'offer' | 'stated',
  current: TextBoxDisposition,
  onChange: (disposition: TextBoxDisposition) => void,
): HTMLElement {
  const fieldset = el('fieldset', 'text-box-choice');
  fieldset.dataset['textBoxChoice'] = mode === 'offer' ? 'offered' : 'stated';
  fieldset.setAttribute('role', 'radiogroup');
  fieldset.append(el('legend', undefined, TEXT_BOX_CHOICE_LEGEND));
  for (const option of TEXT_BOX_CHOICE_OPTIONS) {
    const label = el('label', 'choice');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'text-box-disposition';
    radio.value = option.disposition;
    radio.id = `text-box-disposition-${option.disposition}`;
    radio.checked = option.disposition === current;
    radio.disabled = mode === 'stated';
    radio.dataset['textBoxDisposition'] = option.disposition;
    radio.addEventListener('change', () => {
      if (radio.checked) onChange(option.disposition);
    });
    const copy = el('span');
    copy.append(el('strong', undefined, option.label), el('small', undefined, option.hint));
    label.append(radio, copy);
    fieldset.append(label);
  }
  if (mode === 'stated') fieldset.append(el('p', 'field-note', textBoxChoiceStatement(current)));
  return fieldset;
}

function fidelityRow(category: FidelityCategoryProjection, choice: HTMLElement | null): HTMLElement {
  const row = el('div', 'fidelity-row');
  row.setAttribute('role', 'row');
  row.dataset['fidelityCategory'] = category.key;
  const name = el('div', 'fidelity-name');
  name.setAttribute('role', 'cell');
  name.append(document.createTextNode(category.label), el('span', 'count', fidelityCountText(category.count)));
  const status = el('div', `status-pill status-${category.status}`, fidelityPillText(category));
  status.setAttribute('role', 'cell');
  const detail = el('div', 'fidelity-detail', category.detail);
  detail.setAttribute('role', 'cell');
  if (choice !== null) detail.append(choice);
  row.append(name, status, detail);
  return row;
}

/** The closing 预计往返 card: what a DOCX export will restore, and that the style sheet goes with the file. */
function roundTripCardElement(category: FidelityCategoryProjection): HTMLElement {
  const card = el('section', 'roundtrip-card');
  card.dataset['fidelityCategory'] = category.key;
  card.append(el('h4', undefined, category.label), el('p', 'fidelity-detail', category.detail));
  return card;
}

export function renderFidelityReview(
  fidelity: ReadonlyArray<FidelityCategoryProjection>,
  conversion: ManuscriptConversionProjection | null,
  textBox: TextBoxChoiceMode,
): FidelityReviewView {
  let chosen: TextBoxDisposition = textBox.kind === 'stated' && textBox.disposition !== null ? textBox.disposition : 'retain';
  const offered = textBox.kind === 'offer' && offersTextBoxChoice(fidelity, conversion);
  const stated = textBox.kind === 'stated' && textBox.disposition !== null;
  const table = el('div', 'fidelity-list');
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', '导入保真审阅');
  for (const category of fidelityRows(fidelity)) {
    const choice = category.key === 'text-boxes' && category.count > 0 && (offered || stated)
      ? textBoxChoice(offered ? 'offer' : 'stated', chosen, (disposition) => { chosen = disposition; })
      : null;
    table.append(fidelityRow(category, choice));
  }
  const card = roundTripCard(fidelity);
  const body: HTMLElement[] = card === undefined ? [table] : [table, roundTripCardElement(card)];
  const elements: HTMLElement[] = [];
  if (conversion !== null) {
    const note = el('p', 'attention-note', conversionNoteText(conversion));
    note.dataset['importConversionNote'] = conversion.sourceFormat;
    elements.push(note);
  }
  if (needsDegradationDecision(fidelity)) {
    elements.push(...body);
  } else {
    const summary = el('p', 'fidelity-summary', fidelitySummaryLine(fidelity));
    summary.dataset['fidelitySummary'] = 'no-decision';
    const details = el('details', 'fidelity-details');
    // The rows stay folded unless the editor has a choice to make in them.
    details.open = offered;
    details.append(el('summary', undefined, FIDELITY_DETAILS_SUMMARY), ...body);
    elements.push(summary, details);
  }
  return { elements, textBoxDisposition: () => chosen };
}
