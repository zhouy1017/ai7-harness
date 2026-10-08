import { journeyCheckFailure } from './controller.mjs';
/**
 * Publication and the package load independently after relaunch. Wait for the current package's
 * own action using the Journey's usual readiness bound, then check and click in one renderer turn.
 */
export async function openRemainingPackageExport(renderer) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const opened = await renderer.evaluate(`(() => {
      const button = document.querySelector('[data-screen="book-deliverables"] ol.package-version-list > li[data-package-current="true"] [data-package-action="export"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`);
    if (opened) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw journeyCheckFailure('J-07', 'package-export-remaining-open');
}
