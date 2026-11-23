/** Remember this chip's arrival announcement even if another notice replaces the shared toast before a poll. */
export function watchReturnArrival(chip) {
  const expected = `已${chip.textContent}。`;
  let started = false, arrived = false;
  const observer = new MutationObserver(records => {
    if (!started) return;
    for (const record of records) {
      if (record.target instanceof HTMLElement && record.target.matches('[data-toast]') &&
        Array.from(record.addedNodes).some(node => node.textContent === expected)) arrived = true;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const begin = () => { observer.takeRecords(); started = true; };
  chip.addEventListener('click', begin, { capture: true, once: true });
  return { arrived: () => arrived, disconnect: () => { observer.disconnect(); chip.removeEventListener('click', begin, true); } };
}
