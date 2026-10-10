import {
  CAPTURED_PROCEDURE_SCOPE_LABELS,
  CAPTURED_PROCEDURE_CAPTURE_SLOTS,
  type CapturedProcedureScopeSlot,
  type ProcedureCaptureProjection,
  type ProcedureCaptureResultKind,
  type RendererApi,
} from '../shared/protocol.js';
import {
  CAPTURE_CLASSIFICATION_LEGEND,
  CAPTURE_CLOSE_NOTE,
  CAPTURE_EXTRACT_HEADING,
  CAPTURE_NEW_PROCEDURE,
  CAPTURE_NOT_SAVED,
  CAPTURE_NOT_SAVED_HEADING,
  CAPTURE_ORDER_NOTE,
  CAPTURE_PICK_STEP,
  CAPTURE_PICK_TITLE,
  CAPTURE_RESULT_CONSEQUENCES,
  CAPTURE_RESULT_LABELS,
  CAPTURE_SAVE,
  CAPTURE_SCOPE_LEGEND,
  CAPTURE_SCOPE_NOTE,
  CAPTURE_SOURCE_LEGEND,
  CAPTURE_TARGET_LABEL,
  CAPTURE_TITLE,
  CAPTURE_TITLE_LABEL,
  CAPTURE_WHY,
  CAPTURE_WHY_HEADING,
  PROPOSAL_FIELDS,
  PROPOSAL_PICK_CAPABILITY,
  PROPOSAL_PICK_TITLE,
  PROPOSAL_SAVE,
  captureExtractLines,
  captureNextVersionOption,
  captureSavedLine,
  captureSourceLine,
  captureStepLine,
  proposalSavedLine,
} from './captured-procedure-labels.js';

/**
 * `将以上工序保存为可复用工序` (Issue #65, plan slice S30; ADR 0087 §2, §6; V2-UX-REUSE-001 to REUSE-020, REUSE-063, REUSE-064):
 * one native modal sheet over a finished Review Run. The source set comes first — every category of the Run, the unfinished
 * ones left out with why — then the scope slot, the deterministic classification with 为什么这样分类, and for the type chosen
 * its 将提取什么 and 不会保存什么 and the one save. Closing it saves nothing; everything it shows is the service's reading.
 */
type CaptureApi = Pick<RendererApi, 'inspectProcedureCapture' | 'saveCapturedProcedure' | 'saveDeveloperProposal'>;

export interface ProcedureCaptureOptions {
  readonly host: HTMLElement;
  readonly api: CaptureApi;
  readonly reviewRunId: string;
  readonly opener: HTMLElement;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
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
  return `procedure-capture-${prefix}-${identities}`;
}

function textField(label: string, field: string, multiline: boolean, value = ''): { wrap: HTMLLabelElement; input: HTMLInputElement | HTMLTextAreaElement } {
  const wrap = el('label', 'procedure-capture-field');
  const input = multiline ? el('textarea') : el('input');
  if (input instanceof HTMLInputElement) input.type = 'text';
  else input.rows = 3;
  input.value = value;
  input.dataset['captureField'] = field;
  wrap.append(el('span', undefined, label), input);
  return { wrap, input };
}

/** Open the capture sheet for one Review Run; resolves once it closes, with whether something was saved. */
export async function openProcedureCapture(options: ProcedureCaptureOptions): Promise<boolean> {
  const { api } = options;
  options.setStatus('正在读取这次审阅的工序…', 'busy');
  let capture: ProcedureCaptureProjection;
  try {
    capture = await api.inspectProcedureCapture({ reviewRunId: options.reviewRunId });
  } catch (error) {
    options.setStatus(options.errorMessage(error, '无法读取这次审阅的工序。'), 'error');
    return false;
  }
  if (!capture.available) {
    options.setStatus(capture.unavailableReason ?? '这次审阅不能保存为可复用工序。', 'error');
    return false;
  }
  const dialog = el('dialog', 'procedure-capture');
  const titleId = uid('title');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.dataset['reviewRunId'] = capture.reviewRunId;
  const form = el('form', 'procedure-capture-form');
  form.noValidate = true;
  const heading = el('h3', undefined, CAPTURE_TITLE);
  heading.id = titleId;
  heading.tabIndex = -1;
  form.append(heading, el('p', 'field-note', `${captureSourceLine(capture.runLabel, capture.sourceScopeLabel)}${CAPTURE_CLOSE_NOTE}`));

  const state = {
    kept: new Set(capture.steps.filter((step) => step.eligible).map((step) => step.categoryId)),
    scope: capture.scopeSlot as CapturedProcedureScopeSlot,
    kind: 'captured-procedure' as ProcedureCaptureResultKind,
    saving: false,
  };

  // The source set (REUSE-011, REUSE-012, REUSE-019): remove, never reorder or add.
  const source = el('fieldset', 'procedure-capture-source');
  source.append(el('legend', undefined, CAPTURE_SOURCE_LEGEND), el('p', 'field-note', CAPTURE_ORDER_NOTE));
  for (const step of capture.steps) {
    const label = el('label', 'procedure-capture-step');
    label.dataset['captureStep'] = step.categoryId;
    label.dataset['captureEligible'] = String(step.eligible);
    const box = el('input');
    box.type = 'checkbox';
    box.name = 'capture-step';
    box.value = step.categoryId;
    box.checked = step.eligible;
    box.disabled = !step.eligible;
    const words = el('span', 'procedure-capture-step-text', captureStepLine(step));
    label.append(box, words);
    if (!step.eligible) {
      const why = el('small', 'field-note', step.excludedReason ?? '');
      why.id = uid('excluded');
      box.setAttribute('aria-describedby', why.id);
      label.append(why);
    }
    box.addEventListener('change', () => {
      if (box.checked) state.kept.add(step.categoryId);
      else state.kept.delete(step.categoryId);
      problem.textContent = '';
      update();
    });
    source.append(label);
  }

  const scopes = el('fieldset', 'procedure-capture-scope');
  scopes.append(el('legend', undefined, CAPTURE_SCOPE_LEGEND));
  // 全书 or 选定章节: a selection is handed over at each run from the manuscript, never saved as a setting (Issue #423).
  for (const slot of CAPTURED_PROCEDURE_CAPTURE_SLOTS) {
    const label = el('label', 'procedure-capture-scope-option');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'capture-scope';
    radio.value = slot;
    radio.checked = state.scope === slot;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.scope = slot;
      update();
    });
    label.append(radio, el('span', undefined, CAPTURED_PROCEDURE_SCOPE_LABELS[slot]));
    scopes.append(label);
  }
  scopes.append(el('p', 'field-note', CAPTURE_SCOPE_NOTE));

  // The Classification Preview (REUSE-002 to REUSE-009): one recommendation, why, and the other types with why not.
  const classification = el('fieldset', 'procedure-capture-classification');
  classification.append(el('legend', undefined, CAPTURE_CLASSIFICATION_LEGEND));
  const kinds: Array<{ kind: ProcedureCaptureResultKind; available: boolean }> = [
    { kind: capture.classification.recommended, available: true },
    ...capture.classification.alternatives,
  ];
  for (const { kind, available } of kinds) {
    const label = el('label', 'procedure-capture-kind');
    label.dataset['captureKind'] = kind;
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'capture-kind';
    radio.value = kind;
    radio.checked = kind === state.kind;
    radio.disabled = !available;
    const consequence = el('small', 'field-note', CAPTURE_RESULT_CONSEQUENCES[kind]);
    consequence.id = uid('consequence');
    radio.setAttribute('aria-describedby', consequence.id);
    const name = el('span', undefined, kind === capture.classification.recommended ? `${CAPTURE_RESULT_LABELS[kind]}（推荐）` : CAPTURE_RESULT_LABELS[kind]);
    label.append(radio, name, consequence);
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.kind = kind;
      problem.textContent = '';
      update();
    });
    classification.append(label);
  }
  const why = el('div', 'procedure-capture-why');
  why.append(el('h4', undefined, CAPTURE_WHY_HEADING), el('p', undefined, CAPTURE_WHY));

  // A Captured Procedure: its title, which procedure it joins, and what extraction keeps and leaves.
  const procedurePart = el('section', 'procedure-capture-procedure');
  const titleField = textField(CAPTURE_TITLE_LABEL, 'title', false);
  const target = el('label', 'procedure-capture-field');
  const targetSelect = el('select');
  targetSelect.dataset['captureField'] = 'target';
  targetSelect.append(new Option(CAPTURE_NEW_PROCEDURE, ''));
  for (const existing of capture.procedures) targetSelect.append(new Option(captureNextVersionOption(existing.title, existing.latestVersion), existing.procedureId));
  target.append(el('span', undefined, CAPTURE_TARGET_LABEL), targetSelect);
  targetSelect.addEventListener('change', () => {
    const chosen = capture.procedures.find((existing) => existing.procedureId === targetSelect.value);
    if (chosen !== undefined && titleField.input.value.trim().length === 0) titleField.input.value = chosen.title;
    update();
  });
  titleField.input.addEventListener('input', () => {
    problem.textContent = '';
    update();
  });
  const extract = el('ul', 'procedure-capture-extract');
  procedurePart.append(titleField.wrap, target, el('h4', undefined, CAPTURE_EXTRACT_HEADING), extract);

  // A Developer Capability Proposal (REUSE-063, REUSE-064): what is missing, in the editor's words; no Book material.
  const proposalPart = el('section', 'procedure-capture-proposal');
  const proposalTitle = textField(PROPOSAL_FIELDS.title, 'proposal-title', false);
  const missing = textField(PROPOSAL_FIELDS.missingCapability, 'missing-capability', true);
  const affected = textField(PROPOSAL_FIELDS.affectedProcedure, 'affected-procedure', true);
  const direction = textField(PROPOSAL_FIELDS.direction, 'direction', true);
  const plugin = textField(PROPOSAL_FIELDS.pluginCandidate, 'plugin-candidate', false);
  proposalPart.append(proposalTitle.wrap, missing.wrap, affected.wrap, direction.wrap, plugin.wrap);
  for (const field of [proposalTitle, missing]) field.input.addEventListener('input', () => { problem.textContent = ''; });

  const notSaved = el('ul', 'procedure-capture-not-saved');
  for (const line of CAPTURE_NOT_SAVED) notSaved.append(el('li', undefined, line));
  const notSavedPart = el('section', 'procedure-capture-not-saved-part');
  notSavedPart.append(el('h4', undefined, CAPTURE_NOT_SAVED_HEADING), notSaved);

  const problem = el('p', 'review-problem procedure-capture-problem');
  problem.setAttribute('role', 'alert');
  const save = el('button', 'primary', CAPTURE_SAVE);
  save.type = 'button';
  save.dataset['captureAction'] = 'save';
  const cancel = el('button', 'quiet', '取消');
  cancel.type = 'button';
  cancel.dataset['captureAction'] = 'cancel';
  const actions = el('div', 'button-row procedure-capture-actions');
  actions.append(save, cancel);
  form.append(source, scopes, classification, why, procedurePart, proposalPart, notSavedPart, problem, actions);
  form.addEventListener('submit', (event) => event.preventDefault());
  dialog.append(form);

  const keptSteps = () => capture.steps.filter((step) => state.kept.has(step.categoryId));

  /** After a refused save, every control is offered again as it was: ineligible steps and closed types stay closed. */
  function restoreControls(): void {
    state.saving = false;
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input, button, select, textarea')) {
      control.disabled = control instanceof HTMLInputElement && control.name === 'capture-step'
        ? capture.steps.find((step) => step.categoryId === control.value)?.eligible !== true
        : control instanceof HTMLInputElement && control.name === 'capture-kind'
          ? kinds.find((entry) => entry.kind === control.value)?.available !== true
          : false;
    }
  }

  function update(): void {
    const procedure = state.kind === 'captured-procedure';
    procedurePart.hidden = !procedure;
    proposalPart.hidden = procedure;
    scopes.hidden = !procedure;
    dialog.dataset['captureKind'] = state.kind;
    dialog.dataset['captureKept'] = keptSteps().map((step) => step.categoryId).join(',');
    save.textContent = procedure ? CAPTURE_SAVE : PROPOSAL_SAVE;
    extract.replaceChildren(...captureExtractLines(titleField.input.value, keptSteps(), state.scope).map((line) => el('li', undefined, line)));
    if (!procedure && affected.input.value.length === 0) affected.input.value = keptSteps().map((step) => step.label).join('、');
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input, button, select, textarea')) {
      if (state.saving) control.disabled = true;
    }
  }

  return new Promise<boolean>((resolveClosed) => {
    let saved = false;
    const close = (): void => {
      if (dialog.open) dialog.close();
    };
    cancel.addEventListener('click', close);
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (options.opener.isConnected) options.opener.focus();
      resolveClosed(saved);
    });
    save.addEventListener('click', () => void (async () => {
      if (state.saving) return;
      if (state.kind === 'captured-procedure') {
        const categoryIds = keptSteps().map((step) => step.categoryId);
        const title = titleField.input.value.trim();
        problem.textContent = categoryIds.length === 0 ? CAPTURE_PICK_STEP : title.length === 0 ? CAPTURE_PICK_TITLE : '';
        if (problem.textContent !== '') return;
        state.saving = true;
        update();
        options.setStatus('正在保存可复用工序…', 'busy');
        try {
          const result = await api.saveCapturedProcedure({
            reviewRunId: capture.reviewRunId,
            categoryIds,
            scopeSlot: state.scope,
            title,
            procedureId: targetSelect.value === '' ? null : targetSelect.value,
          });
          saved = true;
          options.setStatus(captureSavedLine(result.versions[0]!.title, result.versions[0]!.version), 'success');
          close();
        } catch (error) {
          restoreControls();
          problem.textContent = options.errorMessage(error, '无法保存可复用工序。');
          options.setStatus(problem.textContent, 'error');
        }
        return;
      }
      const title = proposalTitle.input.value.trim();
      problem.textContent = title.length === 0 ? PROPOSAL_PICK_TITLE : missing.input.value.trim().length === 0 ? PROPOSAL_PICK_CAPABILITY : '';
      if (problem.textContent !== '') return;
      state.saving = true;
      update();
      options.setStatus('正在保存开发建议…', 'busy');
      try {
        const result = await api.saveDeveloperProposal({
          proposalId: null,
          title,
          missingCapability: missing.input.value,
          affectedProcedure: affected.input.value,
          direction: direction.input.value,
          pluginCandidate: plugin.input.value,
        });
        saved = true;
        options.setStatus(proposalSavedLine(result.title, result.versions[0]!.version), 'success');
        close();
      } catch (error) {
        restoreControls();
        problem.textContent = options.errorMessage(error, '无法保存开发建议。');
        options.setStatus(problem.textContent, 'error');
      }
    })());
    update();
    options.host.append(dialog);
    dialog.showModal();
    heading.focus();
    options.setStatus('可以选择要保存的步骤了。');
  });
}
