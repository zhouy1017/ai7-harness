import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startup = {
  events: [] as string[],
  install: vi.fn(),
  setIdentity: vi.fn(),
  run: vi.fn(),
  exit: vi.fn(),
};

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
let originalExitCode: typeof process.exitCode;

async function start(platform: NodeJS.Platform): Promise<void> {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
  await import('../../src/main/index.js');
  // The entrypoint deliberately does not export its startup promise. Drain its real dynamic imports and handlers.
  await vi.dynamicImportSettled();
}

describe('main entrypoint startup (Issue #1063)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    startup.events.length = 0;
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.stubEnv('AI7_E2E_JOURNEY', 'J-01');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    startup.install.mockImplementation(() => { startup.events.push('network-denial'); });
    startup.setIdentity.mockImplementation(() => { startup.events.push('identity'); });
    startup.run.mockImplementation(() => { startup.events.push('application-run'); });
    vi.doMock('../../src/shared/network-denial.js', () => ({ installNodeNetworkDenial: startup.install }));
    vi.doMock('electron', () => {
      startup.events.push('electron-evaluated');
      return { app: { setAppUserModelId: startup.setIdentity, exit: startup.exit } };
    });
    vi.doMock('../../src/main/application.js', () => {
      startup.events.push('application-evaluated');
      return { runApplication: startup.run };
    });
  });

  afterEach(async () => {
    try {
      await vi.dynamicImportSettled();
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
      process.exitCode = originalExitCode;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      vi.doUnmock('../../src/shared/network-denial.js');
      vi.doUnmock('electron');
      vi.doUnmock('../../src/main/application.js');
      vi.resetModules();
    }
  });

  it('sets the Windows identity once after denial and before application evaluation', async () => {
    await start('win32');
    expect(startup.events).toEqual([
      'network-denial', 'electron-evaluated', 'identity', 'application-evaluated', 'application-run',
    ]);
    expect(startup.install).toHaveBeenCalledTimes(1);
    expect(startup.setIdentity).toHaveBeenCalledExactlyOnceWith('AI7');
    expect(startup.run).toHaveBeenCalledTimes(1);
    expect(startup.exit).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledTimes(2);
    expect(process.stderr.write).toHaveBeenNthCalledWith(1, 'AI7_STARTUP/network-denial\n');
    expect(process.stderr.write).toHaveBeenNthCalledWith(2, 'AI7_STARTUP/application-import\n');
  });

  it.each(['darwin', 'linux'] as const)('excludes the Windows setter on %s', async (platform) => {
    await start(platform);
    expect(startup.events).toEqual(['network-denial', 'application-evaluated', 'application-run']);
    expect(startup.setIdentity).not.toHaveBeenCalled();
    expect(startup.run).toHaveBeenCalledTimes(1);
    expect(startup.exit).not.toHaveBeenCalled();
  });

  it('stops before identity setup and application evaluation when denial fails', async () => {
    startup.install.mockImplementation(() => {
      startup.events.push('network-denial');
      throw new Error('synthetic denial failure');
    });
    await start('win32');
    expect(startup.events).toEqual(['network-denial']);
    expect(startup.setIdentity).not.toHaveBeenCalled();
    expect(startup.run).not.toHaveBeenCalled();
    expect(startup.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledTimes(2);
    expect(process.stderr.write).toHaveBeenNthCalledWith(2, 'AI7_STARTUP_FAILED/network-denial\n');
  });

  it('contains setter failure before application evaluation using the existing failure and exit path', async () => {
    startup.setIdentity.mockImplementation(() => {
      startup.events.push('identity');
      throw new Error('synthetic identity failure');
    });
    await start('win32');
    expect(startup.events).toEqual(['network-denial', 'electron-evaluated', 'identity']);
    expect(startup.setIdentity).toHaveBeenCalledExactlyOnceWith('AI7');
    expect(startup.run).not.toHaveBeenCalled();
    expect(startup.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(process.stderr.write).toHaveBeenCalledTimes(3);
    expect(process.stderr.write).toHaveBeenNthCalledWith(3, 'AI7_STARTUP_FAILED/application-import\n');
  });
});
