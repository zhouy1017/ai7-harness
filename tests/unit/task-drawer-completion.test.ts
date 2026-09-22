import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSourceFile, forEachChild, isFunctionDeclaration, ModuleKind, ScriptTarget, transpileModule, type Node } from 'typescript';
import { describe, expect, it } from 'vitest';
import type { TaskPlanRequest } from '../../src/renderer/task-drawer.js';

// Exercise the actual private completion function, not a second copy of its implementation.
// DOM rendering and the asynchronous authority read are stubs: these unit tests cover completion
// state and cache invalidation, not the Electron Journey, focus geometry or service authorization.
const source = readFileSync(new URL('../../src/renderer/task-drawer.ts', import.meta.url), 'utf8');
const parsed = createSourceFile('task-drawer.ts', source, ScriptTarget.ES2022, true);
const matches: string[] = [];
function visit(node: Node): void {
  if (isFunctionDeclaration(node) && node.name?.text === 'endWork') matches.push(node.getText(parsed));
  forEachChild(node, visit);
}
visit(parsed);
if (matches.length !== 1) throw new Error('Expected one Task Drawer completion function.');
const completion = transpileModule(matches[0]!, {
  compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None },
}).outputText;

interface Projection {
  readonly ref: string;
  readonly planVersion: number;
}
interface State {
  request: TaskPlanRequest | null;
  plan: Projection | null;
  working: boolean;
  interrupted: boolean;
  root: { hidden: boolean };
  refusal: string | null;
  focusBar: boolean;
  painted: string;
  disabled: boolean;
  reads: number;
  paints: number;
  focused: number;
  shownRefusal: string | null;
  pending: Array<() => void>;
  paintBar(): void;
  bar: { querySelector(): { focus(): void } };
  read(): void;
  endWork(asked: TaskPlanRequest | null): void;
  flush(): void;
}
const taskA: TaskPlanRequest = { bookId: 'book-a', kind: 'baseline-analysis', ref: 'task-a' };
const taskB: TaskPlanRequest = { ...taskA, ref: 'task-b' };
function harness(overrides: Partial<State> = {}): State {
  const plan: Projection = { ref: 'task-a', planVersion: 1 };
  const state: State = {
    request: taskA, plan, working: true, interrupted: false, root: { hidden: false },
    refusal: null, focusBar: false, painted: JSON.stringify(plan), disabled: true,
    reads: 0, paints: 0, focused: 0, shownRefusal: null, pending: [],
    paintBar() {
      state.disabled = state.working;
      state.shownRefusal = state.refusal;
      state.paints += 1;
    },
    bar: { querySelector: () => ({ focus: () => { state.focused += 1; } }) },
    read() {
      state.reads += 1;
      const asked = state.request;
      state.pending.push(() => {
        if (asked === null || state.request !== asked || state.root.hidden || state.plan === null) return;
        // Reads replace the request object; paint() caches only the projection, not `working`.
        state.request = { ...asked, ref: state.plan.ref };
        const key = JSON.stringify(state.plan);
        if (key === state.painted) return;
        state.painted = key;
        state.paintBar();
      });
    },
    endWork() { throw new Error('Completion function not loaded.'); },
    flush() { for (const read of state.pending.splice(0)) read(); },
    ...overrides,
  };
  runInContext(completion, createContext(state));
  return state;
}

describe('Task Drawer action completion (#420)', () => {
  it('releases an unchanged bar after cancelled reconfirmation and a fresh read', () => {
    const state = harness();
    state.endWork(taskA);
    state.flush();
    expect(state.disabled).toBe(false);
  });

  it('refreshes the same Task after a read replaced its request object', () => {
    const state = harness({ request: { ...taskA } });
    state.endWork(taskA);
    expect(state.reads).toBe(1);
    state.flush();
    expect(state.disabled).toBe(false);
  });

  it('releases the new Task bar when an old Task action completes', () => {
    const plan = { ref: 'task-b', planVersion: 1 };
    const state = harness({ request: taskB, plan, painted: JSON.stringify(plan) });
    state.endWork(taskA);
    state.flush();
    expect(state.disabled).toBe(false);
  });

  it('does not paint an old Task refusal or move focus into a different Task', () => {
    const state = harness({ request: taskB, refusal: 'old-task-error', focusBar: true });
    state.endWork(taskA);
    expect(state.refusal).toBe(null);
    expect(state.shownRefusal).toBe(null);
    expect(state.focusBar).toBe(false);
    expect(state.focused).toBe(0);
  });

  it('includes Book identity when scoping a completion', () => {
    const state = harness({ request: { ...taskA, bookId: 'book-b' }, refusal: 'old-book-error' });
    state.endWork(taskA);
    expect(state.refusal).toBe(null);
    expect(state.focused).toBe(0);
  });

  it('includes Task kind when scoping a completion', () => {
    const state = harness({ request: { ...taskA, kind: 'review-run' }, refusal: 'old-kind-error' });
    state.endWork(taskA);
    expect(state.refusal).toBe(null);
    expect(state.focused).toBe(0);
  });

  it('keeps a successful action disabled until fresh authority is read', () => {
    const state = harness();
    state.endWork(taskA);
    expect(state.disabled).toBe(true);
    expect(state.working).toBe(false);
    expect(state.reads).toBe(1);
  });

  it('retains a same-Task refusal and restores its action focus', () => {
    const state = harness({ refusal: 'execution-busy' });
    state.endWork(taskA);
    expect(state.shownRefusal).toBe('execution-busy');
    expect(state.disabled).toBe(false);
    expect(state.focused).toBe(1);
  });

  it('does not read or repaint a closed drawer', () => {
    const state = harness({ root: { hidden: true }, request: null, plan: null });
    state.endWork(taskA);
    expect(state.reads).toBe(0);
    expect(state.paints).toBe(0);
    expect(state.working).toBe(false);
  });

  it('does not read, repaint or re-enable an interrupted drawer', () => {
    const state = harness({ interrupted: true });
    state.endWork(taskA);
    expect(state.reads).toBe(0);
    expect(state.paints).toBe(0);
    expect(state.disabled).toBe(true);
  });
});
