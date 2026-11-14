import { afterEach, expect, it, vi } from 'vitest';

const { applyRendererDiagnostics } = await import(new URL('../../e2e/controller.mjs', import.meta.url).href) as {
  applyRendererDiagnostics(journey: string, send: (method: string, params: { rate: number }) => Promise<void>): Promise<void>;
};

afterEach(() => vi.unstubAllEnvs());

function debugEnvironment() {
  for (const name of ['CI', 'GITHUB_ACTIONS', 'AI7_CI_WINDOWS_SERVER_2025']) vi.stubEnv(name, undefined);
  vi.stubEnv('AI7_E2E_LOCAL_DEBUG', '1');
}

it('leaves the renderer alone by default and outside local debug/repeat', async () => {
  const send = vi.fn(async () => {});
  debugEnvironment();
  vi.stubEnv('AI7_E2E_CPU_THROTTLE', undefined);
  await applyRendererDiagnostics('J-02', send);
  vi.stubEnv('AI7_E2E_CPU_THROTTLE', '6');
  vi.stubEnv('AI7_E2E_LOCAL_DEBUG', undefined);
  await applyRendererDiagnostics('J-02', send);
  vi.stubEnv('AI7_E2E_LOCAL_DEBUG', '1');
  vi.stubEnv('CI', 'true');
  await applyRendererDiagnostics('J-02', send);
  expect(send).not.toHaveBeenCalled();
});

it('applies the requested CDP rate only in local debug/repeat', async () => {
  debugEnvironment();
  vi.stubEnv('AI7_E2E_CPU_THROTTLE', '6');
  const send = vi.fn(async () => {});
  await applyRendererDiagnostics('J-02', send);
  expect(send).toHaveBeenCalledExactlyOnceWith('Emulation.setCPUThrottlingRate', { rate: 6 });
});

it.each(['0', '21', 'NaN', ''])('rejects an invalid local diagnostic rate %s', async value => {
  debugEnvironment();
  vi.stubEnv('AI7_E2E_CPU_THROTTLE', value);
  const send = vi.fn(async () => {});
  await expect(applyRendererDiagnostics('J-02', send)).rejects.toThrow('AI7_E2E_CPU_THROTTLE');
  expect(send).not.toHaveBeenCalled();
});
