import type { PreinstalledProcedureProjection } from '../shared/protocol/procedures.js';
import { PROCEDURE_PREDECESSOR_NOTE, PROCEDURE_STATE_LABELS, procedureLine, procedureStagesLine } from './knowledge-base-labels.js';

/** The pre-installed library is read-only in F-26a; Book-dependent availability stays on the ordinary task sheet. */
export function renderProcedureLibrary(procedures: readonly PreinstalledProcedureProjection[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'preinstalled-procedure-library';
  section.dataset['procedureCount'] = String(procedures.length);
  const list = document.createElement('ul');
  list.className = 'knowledge-procedure-list';
  for (const procedure of procedures) {
    const item = document.createElement('li');
    item.dataset['procedureId'] = procedure.procedureId;
    item.dataset['procedureVersion'] = String(procedure.version);
    item.dataset['procedureState'] = procedure.state;
    item.dataset['procedureRuns'] = String(procedure.uses);
    const pill = document.createElement('span');
    pill.className = `status-pill procedure-state-${procedure.state}`;
    pill.textContent = PROCEDURE_STATE_LABELS[procedure.state];
    const words = document.createElement('span');
    words.textContent = ` ${procedureLine(procedure)}`;
    const stages = document.createElement('span');
    stages.className = 'field-note procedure-stages';
    stages.textContent = ` · ${procedureStagesLine(procedure)}`;
    item.append(pill, words, stages);
    list.append(item);
  }
  const predecessor = document.createElement('p');
  predecessor.className = 'field-note procedure-predecessor';
  predecessor.textContent = PROCEDURE_PREDECESSOR_NOTE;
  section.append(list, predecessor);
  return section;
}
