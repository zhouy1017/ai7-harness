import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

type Result = { stderr: string };
type Failure = { location: string; errorClass: string };
type Renderer = { evaluate(expression: string): Promise<unknown> };
const { observeCompletion, collectCompletionDiagnostic } = await import(new URL('../../e2e/completion-diagnostic.mjs', import.meta.url).href) as {
  observeCompletion(renderer: Renderer, refs: Record<string, string>): Promise<{ sample(stage: string): Promise<void>; failed(): Promise<void>; dispose(): Promise<void> }>;
  collectCompletionDiagnostic(result: Result, journey: string, failure: Failure): string | null;
};
const failure = { location: 'open-completion', errorClass: 'journey-failure' };
const prefix = 'COMPLETION_DIAGNOSTIC/J-09/';

async function capture(failed = true) {
  const refs = { bookId: 'book-reference', itemId: 'task-reference', revisionId: 'revision-reference', selector: 'result-control', card: 'expected-card' };
  const listeners = new Map<string, (event: object) => void>();
  const result = { disabled: false, contains: (node: unknown) => node === result,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 110, bottom: 44, width: 100, height: 34 }) };
  const context = createContext({ innerWidth: 1008, innerHeight: 681,
    window: { ai7: { getBookWorkbenchRoute: async () => ({ bookId: refs.bookId }), inspectTaskOverview: async () => ({ groups: [{ items: [{ itemId: refs.itemId, bookId: refs.bookId, result: { kind: 'analysis-revision', revisionId: refs.revisionId } }] }] }) } },
    document: {
      visibilityState: 'visible', hasFocus: () => true, elementFromPoint: () => result,
      addEventListener: (type: string, listener: (event: object) => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
      get textContent(): never { throw new Error('Page text must not be read'); },
      querySelector: (selector: string) => selector === refs.selector ? result : selector === refs.card ? { dataset: { inspectedRevisionId: refs.revisionId } } :
        selector === '[data-screen="book-analysis"] .book-analysis' ? { dataset: { bookId: refs.bookId } } : selector === '[data-screen="book-analysis"]' || selector === '.baseline-analysis-card' ? {} : null,
    },
  });
  const renderer = { evaluate: async (expression: string) => await runInContext(expression, context) };
  const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    const observation = await observeCompletion(renderer, refs);
    await observation.sample('before-attention');
    for (const type of ['pointerdown', 'pointerup', 'click']) listeners.get(type)!({ type, target: result, isTrusted: true });
    await observation.sample('after-result');
    if (failed) await observation.failed();
    await observation.dispose();
    expect(listeners.size).toBe(0);
    return { lines: write.mock.calls.map(([line]) => String(line)), refs };
  } finally { write.mockRestore(); }
}

it('emits only fixed stages and Boolean comparisons, with trusted input receipt and no source identities', async () => {
  const { lines, refs } = await capture();
  expect(lines).toHaveLength(1);
  const admitted = collectCompletionDiagnostic({ stderr: lines[0]! }, 'J-09', failure)!;
  const samples = JSON.parse(admitted) as Array<Record<string, unknown>>;
  expect(samples.map(sample => sample['stage'])).toEqual(['before-attention', 'after-result', 'failed']);
  expect(samples.at(-1)).toMatchObject({ routeMatches: true, entryBookMatches: true, entryRevisionMatches: true, displayedMatches: true, trustedClickReceived: true });
  for (const sample of samples) for (const [key, value] of Object.entries(sample)) if (key !== 'stage') expect(typeof value).toBe('boolean');
  for (const ref of Object.values(refs)) expect(admitted).not.toContain(ref);
});

it('is silent on a passing observation', async () => { expect((await capture(false)).lines).toEqual([]); });

it('rejects extra fields, non-Boolean values, unknown stages, duplicate stages and excessive samples', async () => {
  const { lines } = await capture();
  const valid = JSON.parse(lines[0]!.slice(prefix.length)) as Array<Record<string, unknown>>;
  const first = valid[0]!;
  const rejected = [[{ ...first, extra: 'unexpected-value' }], [{ ...first, routeMatches: 'unexpected-value' }],
    [{ ...first, stage: 'unexpected-value' }], [first, first], Array(6).fill(first), [null], {}];
  for (const value of rejected) expect(collectCompletionDiagnostic({ stderr: prefix + JSON.stringify(value) }, 'J-09', failure)).toBeNull();
});

it('does not forward another failure, duplicate carrier, malformed JSON or oversized output', async () => {
  const { lines } = await capture();
  const result = { stderr: lines[0]! };
  expect(collectCompletionDiagnostic(result, 'J-01', failure)).toBeNull();
  expect(collectCompletionDiagnostic(result, 'J-09', { ...failure, location: 'other' })).toBeNull();
  expect(collectCompletionDiagnostic(result, 'J-09', { ...failure, errorClass: 'controller-exit' })).toBeNull();
  for (const stderr of [lines.join('') + lines.join(''), prefix + '{', prefix + ' '.repeat(16384)]) expect(collectCompletionDiagnostic({ stderr }, 'J-09', failure)).toBeNull();
});

it('forwards the safe carrier through the actual Full Gate runner alongside its unchanged failure', async () => {
  const { lines } = await capture();
  const source = readFileSync(new URL('../../e2e/run-all.mjs', import.meta.url), 'utf8');
  const imports = /^import \{\n([\s\S]*?)\} from '\.\/controller\.mjs';/mu.exec(source)?.[1];
  expect(imports).toBeDefined();
  const controller = await import(new URL('../../e2e/controller.mjs', import.meta.url).href);
  const output = { log: vi.fn(), error: vi.fn() }, process = { argv: ['node', 'run-all.mjs'], exitCode: 0 };
  const owners = { ...controller, collectCompletionDiagnostic, ADMITTED_JOURNEYS: ['J-09'], runJourneyProcess: async () => ({
    code: 1, signal: null, controllerSignal: null, spawnError: false, outputOverflow: false, stdout: '',
    stderr: 'J-09/open-completion\nJ-09/open-completion/check/completion-record\n' + lines[0],
  }) };
  const run = Function('owners', 'console', 'process', `return(async()=>{const {${imports}}=owners;const collectCompletionDiagnostic=owners.collectCompletionDiagnostic;${source.slice(source.indexOf('// A scenario'))}})()`);
  await run(owners, output, process);
  expect(output.error.mock.calls.map(([line]) => line)).toContain('LOCAL_COMPLETION/J-09/fail/open-completion/check/completion-record');
  expect(output.error.mock.calls.map(([line]) => line)).toContain(prefix + collectCompletionDiagnostic({ stderr: lines[0]! }, 'J-09', failure));
  expect(process.exitCode).toBe(1);
});
