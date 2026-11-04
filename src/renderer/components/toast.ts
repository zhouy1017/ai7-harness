export const TOAST_MS = 2_500;
let host: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let remaining = TOAST_MS;
let since = 0;

/** All transient messages replace one capsule, including completion notices. */
export function showToast(message: string, options: { tone?: string; action?: { label: string; run(): void } } = {}): void {
  if (host === null || !host.isConnected) {
    host = document.createElement('aside');
    host.className = 'toast';
    host.dataset['toast'] = '';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.addEventListener('mouseenter', pause);
    host.addEventListener('mouseleave', resume);
    host.addEventListener('focusin', pause);
    host.addEventListener('focusout', () => queueMicrotask(resume));
    document.body.append(host);
  }
  clearTimeout(timer);
  const text = document.createElement('span');
  text.textContent = message;
  host.replaceChildren(text);
  host.dataset['tone'] = options.tone ?? 'neutral';
  if (options.action) {
    const action = options.action;
    const button = document.createElement('button');
    button.className = 'btn small quiet';
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => { hideToast(); action.run(); });
    host.append(button);
  }
  host.hidden = false;
  remaining = TOAST_MS;
  since = 0;
  resume();
}

export function hideToast(): void { clearTimeout(timer); if (host) host.hidden = true; }
function pause(): void { if (since) remaining = Math.max(0, remaining - (Date.now() - since)); since = 0; clearTimeout(timer); }
function resume(): void {
  clearTimeout(timer);
  if (!host || host.hidden || host.matches(':hover') || host.contains(document.activeElement)) return;
  since = Date.now();
  timer = setTimeout(hideToast, remaining);
}
