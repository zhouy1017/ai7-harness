import type { EvaluationCalibrationBookProjection, EvaluationCalibrationProjection, RendererApi } from '../shared/protocol.js';
import { formatPriceFen, parseFirstPrint, parsePriceYuan } from '../shared/evaluation-calibration.js';
import {
  ACTUALS_CANCEL,
  ACTUALS_CHANGE,
  ACTUALS_EMPTY,
  ACTUALS_ENTER,
  ACTUALS_HEADING,
  ACTUALS_PRICE_INVALID,
  ACTUALS_PRICE_LABEL,
  ACTUALS_PRINT_INVALID,
  ACTUALS_PRINT_LABEL,
  ACTUALS_SAVE,
  CALIBRATION_HEADING,
  CALIBRATION_SCOPE,
  CALIBRATION_STATUS,
  CALIBRATION_SWITCH,
  CALIBRATION_WAITING,
  PREDICTION_ADDS,
  PREDICTION_HEADING,
  PREDICTION_SWITCH,
  actualsBookLine,
  calibrationProgressLine,
  predictionProgressLine,
} from './evaluation-calibration-labels.js';

/**
 * 设置 › 编辑工作 › 评估校准与预测 (Issue #430, plan slice S82; V2-UX-EVAL-010, EVAL-011, EVAL-014): calibration's progress toward
 * its threshold with its switch, the prediction switch that stays closed until enough published Books carry actuals, and
 * every Book with a 发稿版本 with its 定价与首印 — entered, or changed, in place.
 */
export interface MountEvaluationCalibrationOptions {
  readonly root: HTMLElement;
  /** The Book whose entry to open at once, when 交付物 sent the editor here for it. */
  readonly focusBookId: string | null;
  readonly api: Pick<RendererApi, 'inspectEvaluationCalibration' | 'recordPublicationActuals' | 'setEvaluationPreferences'>;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly errorMessage: (error: unknown, fallback: string) => string;
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
  node.dataset['calibrationAction'] = name;
  node.addEventListener('click', run);
  return node;
}

export function mountEvaluationCalibration(options: MountEvaluationCalibrationOptions): { load(): Promise<void> } {
  const { root, api, setStatus, errorMessage } = options;
  root.classList.add('evaluation-calibration');
  let projection: EvaluationCalibrationProjection | null = null;
  let busy = false;
  /** The one entry form open, with what the editor typed so far. */
  let form: { bookId: string; price: string; print: string } | null = null;
  let refusal: { readonly where: string; readonly message: string } | null = null;

  const paint = (focus: string | null): void => {
    if (projection === null) return;
    const { calibration, prediction } = projection;
    root.dataset['calibrationAdjustments'] = String(calibration.adjustments);
    root.dataset['predictionBooks'] = String(prediction.booksWithActuals);

    const calibrationSection = el('section', 'calibration-section calibration-calibration');
    const calibrationSwitch = switchNode('calibration', CALIBRATION_SWITCH, calibration.enabled, false, (on) =>
      void savePreferences({ predictionEnabled: prediction.enabled, calibrationEnabled: on }, 'calibration'));
    calibrationSection.append(
      el('h3', undefined, CALIBRATION_HEADING),
      el('p', 'calibration-progress', calibrationProgressLine(calibration)),
      el('p', 'field-note', CALIBRATION_SCOPE),
      // Said while AI7 gives no 初评 to adjust (Issue #430 review), not by the count: after S81b a count below ten is progress.
      ...(!calibration.initialScoresConnected ? [el('p', 'field-note calibration-waiting', CALIBRATION_WAITING)] : []),
      calibrationSwitch,
    );
    refusalFor('calibration', calibrationSection);

    const predictionSection = el('section', 'calibration-section calibration-prediction');
    // Closed until enough published Books carry actuals; a switch already on can always be turned off (EVAL-010).
    const predictionSwitch = switchNode('prediction', PREDICTION_SWITCH, prediction.enabled, !prediction.available && !prediction.enabled, (on) =>
      void savePreferences({ predictionEnabled: on, calibrationEnabled: calibration.enabled }, 'prediction'));
    predictionSection.append(
      el('h3', undefined, PREDICTION_HEADING),
      el('p', 'calibration-progress', predictionProgressLine(prediction)),
      el('p', 'field-note', PREDICTION_ADDS),
      predictionSwitch,
    );
    refusalFor('prediction', predictionSection);

    const actualsSection = el('section', 'calibration-section calibration-actuals');
    actualsSection.append(el('h3', undefined, ACTUALS_HEADING));
    if (projection.books.length === 0) actualsSection.append(el('p', 'field-note calibration-actuals-empty', ACTUALS_EMPTY));
    const list = el('ul', 'calibration-actuals-list');
    for (const book of projection.books) list.append(bookNode(book));
    if (projection.books.length > 0) actualsSection.append(list);
    root.replaceChildren(calibrationSection, predictionSection, actualsSection);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const refusalFor = (where: string, section: HTMLElement): void => {
    if (refusal === null || refusal.where !== where) return;
    const alert = el('p', 'attention-note calibration-refusal', refusal.message);
    alert.setAttribute('role', 'alert');
    section.append(alert);
  };

  const switchNode = (name: string, label: string, checked: boolean, disabled: boolean, change: (on: boolean) => void): HTMLLabelElement => {
    const wrapper = el('label', 'calibration-switch');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = disabled || busy;
    input.dataset['calibrationSwitch'] = name;
    input.addEventListener('change', () => change(input.checked));
    wrapper.append(input, el('span', undefined, label));
    return wrapper;
  };

  const bookNode = (book: EvaluationCalibrationBookProjection): HTMLElement => {
    const item = el('li', 'calibration-book');
    item.dataset['bookId'] = book.bookId;
    item.dataset['actualsState'] = book.actuals === null || !book.actuals.current ? 'missing' : 'recorded';
    item.append(el('p', 'calibration-book-title', `《${book.title}》`), el('p', 'calibration-book-line', actualsBookLine(book)));
    if (form !== null && form.bookId === book.bookId) {
      item.append(formNode(book));
    } else {
      const open = action(book.actuals === null || !book.actuals.current ? ACTUALS_ENTER : ACTUALS_CHANGE, 'quiet', 'open', () => {
        if (busy) return;
        const current = book.actuals !== null && book.actuals.current ? book.actuals : null;
        form = {
          bookId: book.bookId,
          price: current === null ? '' : formatPriceFen(current.priceFen).slice(1),
          print: current === null ? '' : String(current.firstPrint),
        };
        refusal = null;
        paint(`[data-book-id="${book.bookId}"] input[data-calibration-field="price"]`);
      });
      open.disabled = busy;
      open.setAttribute('aria-label', `${open.textContent?.replace('…', '')}：《${book.title}》的定价与首印`);
      item.append(open);
    }
    return item;
  };

  const formNode = (book: EvaluationCalibrationBookProjection): HTMLElement => {
    const box = el('div', 'calibration-form');
    const field = (name: 'price' | 'print', label: string): HTMLLabelElement => {
      const wrapper = el('label', 'calibration-field');
      const input = el('input');
      input.type = 'text';
      input.inputMode = name === 'price' ? 'decimal' : 'numeric';
      input.value = form![name];
      input.disabled = busy;
      input.dataset['calibrationField'] = name;
      input.addEventListener('input', () => { if (form !== null) form[name] = input.value; });
      wrapper.append(el('span', undefined, label), input);
      return wrapper;
    };
    const buttons = el('div', 'button-row');
    const save = action(ACTUALS_SAVE, 'primary', 'save', () => void saveActuals(book));
    const cancel = action(ACTUALS_CANCEL, 'secondary', 'cancel', () => {
      if (busy) return;
      form = null;
      refusal = null;
      paint(`[data-book-id="${book.bookId}"] [data-calibration-action="open"]`);
    });
    save.disabled = busy;
    cancel.disabled = busy;
    buttons.append(save, cancel);
    box.append(field('price', ACTUALS_PRICE_LABEL), field('print', ACTUALS_PRINT_LABEL), buttons);
    if (refusal !== null && refusal.where === book.bookId) {
      const alert = el('p', 'attention-note calibration-refusal', refusal.message);
      alert.setAttribute('role', 'alert');
      box.append(alert);
    }
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      cancel.click();
    });
    return box;
  };

  const saveActuals = async (book: EvaluationCalibrationBookProjection): Promise<void> => {
    if (busy || form === null) return;
    const priceFen = parsePriceYuan(form.price);
    const firstPrint = parseFirstPrint(form.print);
    if (priceFen === null || firstPrint === null) {
      refusal = { where: book.bookId, message: priceFen === null ? ACTUALS_PRICE_INVALID : ACTUALS_PRINT_INVALID };
      paint(`[data-book-id="${book.bookId}"] input[data-calibration-field="${priceFen === null ? 'price' : 'print'}"]`);
      return;
    }
    busy = true;
    refusal = null;
    paint(null);
    setStatus(CALIBRATION_STATUS.saving, 'busy');
    try {
      projection = await api.recordPublicationActuals({ bookId: book.bookId, publicationVersionId: book.publicationVersionId, expectedEntries: book.entries, priceFen, firstPrint });
      busy = false;
      form = null;
      paint(`[data-book-id="${book.bookId}"] [data-calibration-action="open"]`);
      setStatus(CALIBRATION_STATUS.actualsSaved, 'success');
    } catch (error) {
      busy = false;
      refusal = { where: book.bookId, message: errorMessage(error, CALIBRATION_STATUS.failed) };
      try { projection = await api.inspectEvaluationCalibration(); } catch { /* the page keeps what it had */ }
      paint(`[data-book-id="${book.bookId}"] [data-calibration-action="save"]`);
      setStatus(refusal.message, 'error');
    }
  };

  const savePreferences = async (next: { predictionEnabled: boolean; calibrationEnabled: boolean }, where: string): Promise<void> => {
    if (busy || projection === null) return;
    busy = true;
    refusal = null;
    paint(null);
    setStatus(CALIBRATION_STATUS.saving, 'busy');
    try {
      projection = await api.setEvaluationPreferences({ expectedEntries: projection.preferenceEntries, ...next });
      busy = false;
      paint(`[data-calibration-switch="${where}"]`);
      setStatus(CALIBRATION_STATUS.preferencesSaved, 'success');
    } catch (error) {
      busy = false;
      refusal = { where, message: errorMessage(error, CALIBRATION_STATUS.failed) };
      try { projection = await api.inspectEvaluationCalibration(); } catch { /* the page keeps what it had */ }
      paint(`[data-calibration-switch="${where}"]`);
      setStatus(refusal.message, 'error');
    }
  };

  return {
    async load(): Promise<void> {
      root.replaceChildren(el('p', 'field-note', CALIBRATION_STATUS.loading));
      projection = await api.inspectEvaluationCalibration();
      const focus = options.focusBookId;
      if (focus !== null && projection.books.some((book) => book.bookId === focus)) {
        const book = projection.books.find((entry) => entry.bookId === focus)!;
        const current = book.actuals !== null && book.actuals.current ? book.actuals : null;
        form = { bookId: focus, price: current === null ? '' : formatPriceFen(current.priceFen).slice(1), print: current === null ? '' : String(current.firstPrint) };
        paint(`[data-book-id="${focus}"] input[data-calibration-field="price"]`);
      } else {
        paint(null);
      }
    },
  };
}
