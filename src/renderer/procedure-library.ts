import type { PreinstalledProcedureProjection } from '../shared/protocol/procedures.js';

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
    pill.className = 'status-pill procedure-state-enabled';
    pill.textContent = '已启用';
    const words = document.createElement('span');
    words.textContent = ` ${procedure.title} · 第 ${procedure.version} 版 · 预装 · 已使用 ${procedure.uses} 次`;
    const stages = document.createElement('span');
    stages.className = 'field-note procedure-stages';
    stages.textContent = ` · ${procedure.stages.map((stage) => stage.label).join(' → ')}`;
    item.append(pill, words, stages);
    list.append(item);
  }
  const predecessor = document.createElement('p');
  predecessor.className = 'field-note procedure-predecessor';
  predecessor.textContent = '下方的可复用工序是审阅专用前身，仅用于审阅；已保存的版本仍可查看和运行。';
  section.append(list, predecessor);
  return section;
}
