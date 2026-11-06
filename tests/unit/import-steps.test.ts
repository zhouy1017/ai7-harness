import { expect, it, vi } from 'vitest';
import { focusImportStep, importSteps } from '../../src/renderer/components/import-steps.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

it.each([false, true])('reveals collapsed fidelity rows before navigating and focusing them (developer=%s, #1383)', (developer) => {
  const restore = installMiniDom(); setTechnicalLayerVisible(developer);
  try {
    const folded = document.createElement('details'); folded.className = 'fidelity-details';
    const target = document.createElement('ul'); target.className = 'fidelity-list'; folded.append(target);
    const choices = document.createElement('fieldset');
    const steps = importSteps('choices', { fidelity: true, go: (step) => focusImportStep(step === 'fidelity' ? target : choices) });
    miniDocument.body.append(steps as never, choices as never, folded as never);
    steps.querySelector<HTMLButtonElement>('[data-import-step="3"] button')!.click();
    expect(folded.open).toBe(true);
    expect(document.activeElement).toBe(target);
    expect(steps.querySelector('[aria-current="step"]')?.getAttribute('data-import-step')).toBe('3');
    steps.querySelector<HTMLButtonElement>('[data-import-step="2"] button')!.click();
    expect(document.activeElement).toBe(choices);
    expect(steps.querySelector('[aria-current="step"]')?.getAttribute('data-import-step')).toBe('2');
  } finally { setTechnicalLayerVisible(true); restore(); }
});

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
