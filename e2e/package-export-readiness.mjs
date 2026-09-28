/** Open the current package's second export batch after the Journey relaunches. */
export async function openRemainingPackageExport(renderer) {
  const opened = await renderer.evaluate(`(() => {
    const button = document.querySelector('[data-screen="book-deliverables"] ol.package-version-list > li[data-package-current="true"] [data-package-action="export"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!opened) throw new Error('J-07/package-export-remaining-open');
}
