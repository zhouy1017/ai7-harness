import { expect, it, vi } from 'vitest';
import { importSteps } from '../../src/renderer/components/import-steps.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

it('navigates the shared intake to fidelity and marks review before import complete (#1383)', () => {
  const restore = installMiniDom();
  try {
    const go = vi.fn(); const steps = importSteps('choices', { fidelity: true, go });
    miniDocument.body.append(steps as never);
    steps.querySelector<HTMLButtonElement>('[data-import-step="3"] button')!.click();
    expect(go).toHaveBeenCalledWith('fidelity');
    expect(steps.querySelector('[aria-current="step"]')?.getAttribute('data-import-step')).toBe('3');
    steps.querySelector<HTMLButtonElement>('[data-import-step="2"] button')!.click();
    expect(go).toHaveBeenLastCalledWith('target');
    expect(importSteps('review').querySelector('[aria-current="step"]')?.getAttribute('data-import-step')).toBe('3');
    expect(importSteps('complete').querySelector('[aria-current="step"]')?.getAttribute('data-import-step')).toBe('4');
    expect(importSteps('choices', { fidelity: false, go }).querySelector<HTMLButtonElement>('[data-import-step="3"] button')!.disabled).toBe(true);
  } finally { restore(); }
});
