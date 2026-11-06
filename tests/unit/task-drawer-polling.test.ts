import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isCallExpression, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { expect, it, vi } from 'vitest';
import { onPollControlEnd, pollControlEngaged, retainPollInteraction } from '../../src/renderer/poll-interaction.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// Like task-drawer-completion, exercise the private production function with authority/leaf blocks stubbed.
const source = createSourceFile('task-drawer.ts', readFileSync(new URL('../../src/renderer/task-drawer.ts', import.meta.url), 'utf8'), ScriptTarget.ES2022, true);
let paint = '', flush = '';
function visit(node: Node): void {
  if (isFunctionDeclaration(node) && node.name?.text === 'paint') paint = node.getText(source);
  if (isCallExpression(node) && node.expression.getText(source) === 'onPollControlEnd') flush = node.getText(source);
  forEachChild(node, visit);
}
visit(source);
const implementation = transpileModule(`${paint}\n${flush}`, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;

function harness() {
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const make = () => miniDocument.createElement('div'); const body = make(), bar = make(), footer = make(), title = make(), pill = make(); root.append(body, bar, footer, title, pill);
  const projection = (state: string) => ({ ref: 'task', kind: 'baseline-analysis', bookId: 'book', planVersion: 1, state: { key: state, label: state }, start: { readiness: 'ready' }, runControl: null, runOutcome: null, redo: null, unconfirmed: null, defaultRule: { startedBy: null }, clarifications: [], drift: null, resend: null, edit: { editable: false }, listPages: {} });
  const state = { root, body, bar, footer, title, pill, plan: projection('running'), deferredPlan: null, painted: '', view: 'plan', mode: 'compact', cancelConfirmShown: true, focusTitle: false, focusBar: false, cancelOnOpen: false, redoOnOpen: false, interrupted: false, editOnOpen: null, redoPending: null, working: false, pendingNote: null, refusal: null, unconfirmedShown: false, redoConfirmShown: false, diffShown: false, unconfirmedRecordShown: false, ruleConfirmShown: false,
    taskPlanWording: (next: unknown) => next, retainPollInteraction, pollControlEngaged, onPollControlEnd, document, HTMLElement: MiniElement, HTMLButtonElement: MiniElement, queueMicrotask,
    TASK_PLAN_STATE_PILLS: { running: { tone: 'busy', shape: 'circle' }, settled: { tone: 'good', shape: 'circle' } }, TASK_DRAWER_FOOTER: '', CANCEL_IMPACT_ID: 'cancel-impact',
    schedulePoll: vi.fn(), paintQuestions: vi.fn(), replaceBody: (...nodes: MiniElement[]) => body.replaceChildren(...nodes), goalBlock: make, compactBlock: make,
    paintBar: (next: ReturnType<typeof projection>) => { bar.textContent = next.state.key; },
  };
  const context = createContext(state); runInContext(implementation, context);
  return { ...state, paint: (next: ReturnType<typeof projection>) => { context['incoming'] = next; runInContext('paint(incoming, false)', context); }, terminal: projection('settled') };
}

it.each([false, true])('paints terminal after inline disclosure or deferred native interaction (native=%s, #1375 F1)', async (native) => {
  const uninstall = installMiniDom(); vi.useFakeTimers();
  try {
    const h = harness(); const control = miniDocument.createElement(native ? 'select' : 'button'); control.setAttribute('aria-expanded', 'true'); h.bar.append(control); control.focus();
    setTimeout(() => h.paint(h.terminal), 2000); await vi.advanceTimersByTimeAsync(2000);
    if (native) {
      expect(h.root.dataset['taskPlanState']).not.toBe('settled'); expect(vi.getTimerCount()).toBe(0);
      miniDocument.body.focus(); h.root.dispatchEvent({ type: 'focusout' }); await vi.advanceTimersByTimeAsync(0);
    }
    expect(h.root.dataset['taskPlanState']).toBe('settled'); expect(h.bar.textContent).toBe('settled');
  } finally { vi.clearAllTimers(); vi.useRealTimers(); uninstall(); }
});
