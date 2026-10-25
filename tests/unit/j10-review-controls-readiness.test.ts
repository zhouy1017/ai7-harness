import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Renderer {
  evaluate(expression: string): Promise<unknown>;
}

const { journeyCheckFailure } = (await import(
  new URL('../../e2e/controller.mjs', import.meta.url).href
)) as { journeyCheckFailure(journey: string, label: string): Error };

const REVIEW_REF = '00000000-0000-4000-8000-000000000010';
const RUN_ID = '00000000-0000-4000-8000-000000000020';
const CANCEL = '[data-task-drawer-control="cancel-run"]';

// Execute the real resume-to-impact caller and its real helpers without importing the Electron runner.
// This controlled authority-refresh interleaving is a regression counterfactual, not a historical-cause claim.
function resumeToImpactFromJourney(renderer: Renderer): Promise<void> {
  const source = ts.createSourceFile('run-j10.mjs', readFileSync(new URL('../../e2e/run-j10.mjs', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const boundaries: { label: string; block: ts.Block; index: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBlock(node)) {
      node.statements.forEach((statement, index) => {
        if (!ts.isExpressionStatement(statement) || !ts.isAwaitExpression(statement.expression) ||
            !ts.isCallExpression(statement.expression.expression)) return;
        const call = statement.expression.expression;
        if (!ts.isIdentifier(call.expression) || call.expression.text !== 'clickSelector') return;
        for (const argument of call.arguments) {
          if (ts.isStringLiteral(argument) && ['review-controls-resume', 'review-controls-impact'].includes(argument.text)) {
            boundaries.push({ label: argument.text, block: node, index });
          }
        }
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const starts = boundaries.filter(({ label }) => label === 'review-controls-resume');
  const ends = boundaries.filter(({ label }) => label === 'review-controls-impact');
  const start = starts[0];
  const end = ends[0];
  if (starts.length !== 1 || ends.length !== 1 || start === undefined || end === undefined ||
      start.block !== end.block || start.index >= end.index) {
    throw new Error('J10 resume-to-impact boundary missing, ambiguous, or reordered');
  }
  const helpers = ['requireJourney', 'waitFor', 'assertRenderer', 'clickSelector'].map((name) => {
    const matches = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    const helper = matches[0];
    if (matches.length !== 1 || helper === undefined) throw new Error(`J10 helper ${name} missing or ambiguous`);
    return helper.getText(source);
  });
  const statements = start.block.statements.slice(start.index, end.index + 1).map((statement) => statement.getText(source));
  return runInContext(`(async () => { ${helpers.join('\n')} ${statements.join('\n')} })()`, createContext({
    renderer, journeyCheckFailure, reviewRef: REVIEW_REF, reviewStarted: { runControl: { runRecordId: RUN_ID } },
    at: () => undefined,
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay), Date: { now: () => Date.now() },
  })) as Promise<void>;
}

class Button {
  disabled = false;
  clicks = 0;
  constructor(readonly textContent: string, private readonly action: () => void) {}
  click(): void {
    this.clicks += 1;
    if (!this.disabled) this.action();
  }
}

interface ControlsOptions {
  authorityDelay?: number | null;
  drawerKind?: string;
  drawerRef?: string;
  runId?: string;
  unit?: number;
}

function reviewControls(options: ControlsOptions = {}) {
  const unexpected: string[] = [];
  const successfulCancels: number[] = [];
  let resumed = false;
  const cancel = new Button('停止任务', () => { successfulCancels.push(Date.now()); });
  cancel.disabled = true;
  const drawer = {
    dataset: { taskPlanKind: options.drawerKind ?? 'review-run', taskPlanRef: options.drawerRef ?? REVIEW_REF },
    querySelector(selector: string) {
      if (selector === CANCEL) return cancel;
      unexpected.push(selector);
      return null;
    },
  };
  const resume = new Button('继续任务', () => {
    resumed = true;
    // The service observes resumed unit 2 before endWork's authority read can repaint the enabled control.
    const delay = options.authorityDelay === undefined ? 200 : options.authorityDelay;
    if (delay !== null) setTimeout(() => { cancel.disabled = false; }, delay);
  });
  const document = {
    querySelector(selector: string) {
      if (selector === '#task-drawer') return drawer;
      if (selector === '#task-drawer [data-task-drawer-control="resume"]') return resume;
      if (selector === `#task-drawer ${CANCEL}`) return cancel;
      unexpected.push(selector);
      return null;
    },
  };
  const window = { ai7: {
    inspectTaskPlan: async (request: { kind: string; ref: string }) => {
      if (request.kind !== 'review-run' || request.ref !== REVIEW_REF) {
        unexpected.push('inspectTaskPlan target');
        return {};
      }
      return { runControl: { runRecordId: options.runId ?? RUN_ID, activity: { currentUnitOrdinal: resumed ? options.unit ?? 2 : 1 } } };
    },
  } };
  const page = createContext({ document, window, HTMLButtonElement: Button });
  const renderer: Renderer = { evaluate: async (expression) => runInContext(expression, page) as unknown };
  return { renderer, cancel, resume, successfulCancels, unexpected };
}

function observe(operation: Promise<void>) {
  const state: { result: 'pending' | 'opened' | 'failed'; error?: unknown } = { result: 'pending' };
  const settled = operation.then(
    () => { state.result = 'opened'; },
    (error: unknown) => { state.result = 'failed'; state.error = error; },
  );
  return { state, settled };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe('J-10 review controls wait for resumed Task authority (Issue #1158 rev 3)', () => {
  it('waits for the delayed authority refresh before one enabled impact click', async () => {
    const controls = reviewControls();
    const opening = observe(resumeToImpactFromJourney(controls.renderer));
    await vi.advanceTimersByTimeAsync(199);
    expect({ result: opening.state.result, error: (opening.state.error as Error | undefined)?.message,
      cancelClicks: controls.cancel.clicks, successfulCancels: controls.successfulCancels })
      .toEqual({ result: 'pending', error: undefined, cancelClicks: 0, successfulCancels: [] });
    expect(controls.cancel.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await opening.settled;
    expect(opening.state).toEqual({ result: 'opened' });
    expect(controls.resume.clicks).toBe(1);
    expect(controls.cancel.clicks).toBe(1);
    expect(controls.successfulCancels).toEqual([200]);
    expect(controls.unexpected).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { refusal: 'cancel never becomes enabled', options: { authorityDelay: null }, check: 'review-controls-cancel-ready' },
    { refusal: 'an enabled cancel belongs to another Task ref', options: { drawerRef: '00000000-0000-4000-8000-000000000030' }, check: 'review-controls-cancel-ready' },
    { refusal: 'an enabled cancel belongs to another Task kind', options: { drawerKind: 'word-edit' }, check: 'review-controls-cancel-ready' },
    { refusal: 'the service reports a different Run', options: { runId: '00000000-0000-4000-8000-000000000040' }, check: 'review-controls-same-run' },
    { refusal: 'the service has not reached unit 2', options: { unit: 1 }, check: 'review-controls-same-run' },
  ] satisfies { refusal: string; options: ControlsOptions; check: string }[])(
    'refuses within the existing deadline when $refusal', async ({ options, check }) => {
      const controls = reviewControls(options);
      const opening = observe(resumeToImpactFromJourney(controls.renderer));
      await vi.advanceTimersByTimeAsync(59_999);
      expect(opening.state).toEqual({ result: 'pending' });
      expect(controls.cancel.clicks).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      await opening.settled;
      expect(opening.state).toEqual({ result: 'failed', error: new Error(`J-10/${check}`) });
      expect(controls.resume.clicks).toBe(1);
      expect(controls.cancel.clicks).toBe(0);
      expect(controls.successfulCancels).toEqual([]);
      expect(controls.unexpected).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
