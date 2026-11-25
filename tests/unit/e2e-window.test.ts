import { describe, expect, it, vi } from 'vitest';

// The module reads the primary display from Electron; the test stands a 1920×1080 desktop in for it.
vi.mock('electron', () => ({ screen: { getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 } }) } }));
const { e2eWindowSize, maximizeE2eWindow } = await import('../../src/main/e2e-window.js');

const OWN = { width: 1180, height: 820 };
const journey = (window?: string) => ({ AI7_E2E_JOURNEY: 'J-08', ...(window === undefined ? {} : { AI7_E2E_WINDOW: window }) });
function maximised(env: NodeJS.ProcessEnv): boolean {
  const maximize = vi.fn();
  maximizeE2eWindow({ maximize }, env);
  return maximize.mock.calls.length === 1;
}

describe('the E2E-only window form (Owner decision 2026-11-25: 1080p maximised and an ordinary window)', () => {
  it('ordinary production keeps its own size and is never maximised, whatever the variable says', () => {
    for (const env of [{}, { AI7_E2E_WINDOW: '1920x1080' }, { AI7_E2E_JOURNEY: '', AI7_E2E_WINDOW: '1920x1080' }]) {
      expect(e2eWindowSize(OWN, env)).toEqual(OWN);
      expect(maximised(env)).toBe(false);
    }
  });

  it('a Journey gets the outer size it names, and only a well-formed size', () => {
    expect(e2eWindowSize(OWN, journey('1440x900'))).toEqual({ width: 1440, height: 900 });
    expect(e2eWindowSize(OWN, journey('1024x720'))).toEqual({ width: 1024, height: 720 });
    for (const refused of [undefined, '', 'maximized', '0x720', '1440x', '1440X900', ' 1440x900']) expect(e2eWindowSize(OWN, journey(refused))).toEqual(OWN);
  });

  it('maximises only a Journey window asked for at the whole primary display or more', () => {
    expect(maximised(journey('1920x1080'))).toBe(true);
    expect(maximised(journey('2560x1440'))).toBe(true);
    // An ordinary window, a size that only one side of the display covers, and no request at all stay restored.
    for (const restored of ['1440x900', '1024x720', '1920x1040', '1600x1080', undefined, 'maximized']) expect(maximised(journey(restored))).toBe(false);
  });
});
