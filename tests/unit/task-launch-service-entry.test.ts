import { readFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const adapter = join(root, '.cache/service', `launch-entry-${process.pid}.mjs`);
let response: (context: Record<string, unknown>) => Promise<unknown>;
beforeAll(async () => {
  await mkdir(join(root, '.cache/service'), { recursive: true });
  const source = await readFile(join(root, 'src/service/index.ts'), 'utf8');
  const boundary = source.lastIndexOf('\nawait run().catch(');
  if (boundary < 0) throw new Error('SERVICE_STARTUP_BOUNDARY_NOT_FOUND');
  // The same adapter seam as wal-checkpoint.test.ts: execute the production dispatcher without booting Electron/service.
  await build({ stdin: { resolveDir: join(root, 'src/service'), sourcefile: 'index.ts', loader: 'ts', contents: source.slice(0, boundary) + `
export async function response(c) {
  return dispatch(c.store, undefined, undefined, c.analysisExecution, c.reviewRuns, undefined, c.fastRole, undefined,
    c.request, undefined, c.policy, c.connectivity, c.background);
}` }, outfile: adapter, bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24.18', logLevel: 'silent' });
  response = (await import(pathToFileURL(adapter).href)).response;
});
afterAll(async () => { await rm(adapter, { force: true }); });

it('routes a scoped launch preview through the fast-role owner at the service entry (#1657 F2)', async () => {
  const answer = { steps: [], scope: '所选文字', units: 1, reference: [], send: '上下文', usage: '一次', adaptations: [] };
  const previewScopedEdit = vi.fn(() => answer), previewTaskLaunch = vi.fn(() => { throw new Error('wrong owner'); });
  const input = { instruction: '检查所选文字' };
  expect(await response({ store: { replacementWaiting: () => false, previewTaskLaunch }, fastRole: { requests: { previewScopedEdit } },
    request: { id: 'request', op: 'previewTaskLaunch', input: { bookId: 'book', launch: { operation: 'startScopedAiEdit', input } } } }))
    .toMatchObject({ ok: true, result: answer });
  expect(previewScopedEdit).toHaveBeenCalledExactlyOnceWith('book', input);
  expect(previewTaskLaunch).not.toHaveBeenCalled();
});

it('holds an idle review launch until the service execution owner reports quiet (#1657 F6)', async () => {
  let release!: () => void;
  const quiet = new Promise<void>(resolve => { release = resolve; });
  const drive = vi.fn(), nudge = vi.fn(), admitIdleReview = vi.fn((_id, start) => start());
  const projection = { run: { reviewRunId: 'review', state: 'waiting' } };
  const launchReviewRun = vi.fn(() => ({ projection, repeated: false }));
  const input = { bookId: 'book', startWhen: 'idle' };
  await response({ store: { replacementWaiting: () => false, launchReviewRun, admitIdleReview, inspectReviewWorkspace: () => projection },
    analysisExecution: { whenBackgroundIdle: () => quiet }, reviewRuns: { drive }, background: { nudge }, policy: {},
    connectivity: { planConnectivity: { reading: () => 'online' }, preflight: async () => undefined },
    request: { id: 'request', op: 'launchReviewRun', input } });
  expect(launchReviewRun).toHaveBeenCalledExactlyOnceWith(input, {}, 'now');
  expect(nudge).toHaveBeenCalledOnce();
  expect(admitIdleReview).not.toHaveBeenCalled();
  expect(drive).not.toHaveBeenCalled();
  release(); await quiet; await Promise.resolve();
  expect(admitIdleReview).toHaveBeenCalledExactlyOnceWith('review', expect.any(Function));
  expect(drive).toHaveBeenCalledExactlyOnceWith('review');
});
