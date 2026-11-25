import { screen } from 'electron';

/**
 * The window a Journey asks for through the E2E-only `AI7_E2E_WINDOW` (Issue #1602; the 1080p baseline of the Owner's decision
 * of 2026-11-25). Nothing here applies unless a Journey drives the product: ordinary production always opens at its own size
 * and is never maximised by this module.
 */
type Size = { width: number; height: number };

function askedSize(env: NodeJS.ProcessEnv): Size | null {
  const asked = env.AI7_E2E_JOURNEY ? /^([1-9]\d*)x([1-9]\d*)$/.exec(env.AI7_E2E_WINDOW ?? '') : null;
  return asked ? { width: Number(asked[1]), height: Number(asked[2]) } : null;
}

/** The outer size the window is created at: the Journey's, or the product's `own`. */
export function e2eWindowSize(own: Size, env: NodeJS.ProcessEnv = process.env): Size {
  return askedSize(env) ?? own;
}

/**
 * A Journey that asks for the whole primary display (or more) gets a really maximised window, as an editor who maximises it
 * does: created at that size the window is only trimmed to the work area and keeps its frame. A smaller request stays restored.
 */
export function maximizeE2eWindow(window: { maximize(): void }, env: NodeJS.ProcessEnv = process.env): void {
  const asked = askedSize(env);
  if (asked === null) return;
  const display = screen.getPrimaryDisplay().size;
  if (asked.width >= display.width && asked.height >= display.height) window.maximize();
}
