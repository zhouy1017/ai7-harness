import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// Issue #643: J-08 failed once on hosted macOS at snapshot-none-comparison, and the hosted marker could not say which wait
// passed its bound or what the product showed then. J-08 runs as it is imported, so its two waits are read from its source
// and run here against a renderer that answers as the product would.
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const controller = (await import(new URL('../../e2e/controller.mjs', import.meta.url).href)) as {
  journeyCheckFailure(journey: string, check: string, options?: object): Error;
  journeyCheckLabel(error: unknown): string | null;
};

const source = readFileSync(resolve(ROOT, 'e2e', 'run-j08.mjs'), 'utf8').replace(/\r\n/gu, '\n');
const start = source.indexOf('function screenWord(');
const end = source.indexOf('\n}\n', source.indexOf('async function waitForRestoredEditor(')) + 3;
const helpers = new Function('journeyCheckFailure', `${source.slice(start, end)}\nreturn { waitForRecoveryScreen, waitForRestoredEditor };`)(
  controller.journeyCheckFailure,
) as {
  waitForRecoveryScreen(renderer: unknown, name: string): Promise<void>;
  waitForRestoredEditor(renderer: unknown, name: string, timeout: number): Promise<void>;
};

/** A renderer whose waits never hold and whose state, read once they pass, is `seen`. */
function rendererShowing(seen: Record<string, unknown> | null) {
  return { evaluate: async (expression: string) => (expression.startsWith('Boolean(') ? false : seen) };
}

async function labelOf(wait: Promise<void>): Promise<string | null> {
  const outcome = wait.then(() => null, (error: unknown) => controller.journeyCheckLabel(error));
  await vi.runAllTimersAsync();
  return outcome;
}

describe('J-08 names what the product showed when a recovery wait passed its bound (#643)', () => {
  it('uses the named waits in the recovery screen and the no-snapshot restore', () => {
    expect(source).toContain('await waitForRecoveryScreen(renderer, `recovery-${stateToken}`);');
    expect(source).toContain("await waitForRestoredEditor(renderer, 'none-restored', 120_000);");
    expect(source).toContain("error instanceof PlaywrightTimeoutError ? 'browser-launch-timeout' : 'browser-launch-refused'");
  });

  it('says whether the product was ready or interrupted, and on which screen, when the recovery screen never came', async () => {
    vi.useFakeTimers();
    try {
      expect(await labelOf(helpers.waitForRecoveryScreen(rendererShowing({ screen: 'landing', ready: true, interrupted: false }), 'recovery-none')))
        .toBe('recovery-none-ready-on-landing');
      expect(await labelOf(helpers.waitForRecoveryScreen(rendererShowing({ screen: null, ready: false, interrupted: false }), 'recovery-none')))
        .toBe('recovery-none-not-ready-on-none');
      expect(await labelOf(helpers.waitForRecoveryScreen(rendererShowing({ screen: 'import-recovery', ready: true, interrupted: true }), 'recovery-eligible')))
        .toBe('recovery-eligible-interrupted-on-other');
      expect(await labelOf(helpers.waitForRecoveryScreen(rendererShowing(null), 'recovery-none'))).toBe('recovery-none-not-ready-on-none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says how far a restore came when the editor never showed the recovered state', async () => {
    vi.useFakeTimers();
    try {
      const restored = (seen: Record<string, unknown>) => labelOf(helpers.waitForRestoredEditor(rendererShowing(seen), 'none-restored', 120_000));
      expect(await restored({ screen: 'editor', tone: 'success' })).toBe('none-restored-editor-unmarked');
      expect(await restored({ screen: 'manuscript-recovery', tone: 'busy' })).toBe('none-restored-on-manuscript-recovery-busy');
      expect(await restored({ screen: 'manuscript-recovery', tone: 'error' })).toBe('none-restored-on-manuscript-recovery-error');
      expect(await restored({ screen: 'landing', tone: '稿件' })).toBe('none-restored-on-landing-none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns at once when the wait holds', async () => {
    const holding = { evaluate: async () => true };
    await expect(helpers.waitForRecoveryScreen(holding, 'recovery-none')).resolves.toBeUndefined();
    await expect(helpers.waitForRestoredEditor(holding, 'none-restored', 120_000)).resolves.toBeUndefined();
  });
});
