import { checkBrowserAddress } from '../shared/browser-address.js';
import type { RendererApi, SourceIdentityInput } from '../shared/protocol.js';
import { copyPlainText } from './clipboard-text.js';
import { rendererApi } from './navigation-generation.js';

/**
 * One web source's address controls (Issue #1683, item 12.1): its domain in ordinary words, 「复制链接」 for exactly the recorded
 * address, and 「在浏览器中打开 · <域名>」 only when the one rule main enforces (`checkBrowserAddress`) accepts that address. The
 * renderer never builds, edits or sends an address: the opener receives the source's identity alone, and a refusal is shown as
 * the sentence it carries. An in-Book source has none of this, so callers draw it only for a web source.
 */
export const SOURCE_COPY_LINK = '复制链接';
export const SOURCE_LINK_COPIED = '已复制链接。';
export const SOURCE_LINK_COPY_FAILED = '没有复制成功，请再试一次。';
export const SOURCE_OPEN_IN_BROWSER = '在浏览器中打开';
export const SOURCE_OPENED = '已在浏览器中打开。';
export const SOURCE_OPEN_FAILED = '系统浏览器没有打开这个地址，可以复制链接后自己打开。';
export const SOURCE_UNNAMED = '网页来源';

export type SourceLinkApi = Pick<RendererApi, 'openSourceInBrowser' | 'runEditorClipboardCommand'>;

/** The domain a recorded address names: the check's host, else the host when the address parses at all, else `null`. */
export function sourceDomain(address: string): string | null {
  const check = checkBrowserAddress(address);
  if (check.ok) return check.host;
  try {
    const host = new URL(address).host;
    return host === '' ? null : host;
  } catch {
    return null;
  }
}

/** A web source's name: its title, else its domain — never the raw address. */
export function webSourceName(title: string | null | undefined, address: string): string {
  const trimmed = title?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== address ? trimmed : sourceDomain(address) ?? SOURCE_UNNAMED;
}

interface Painted { readonly control: HTMLButtonElement; readonly status: HTMLElement }

// A press in flight, by identity: a control drawn again while it runs starts disabled and hears the same answer.
const inFlight = new Map<string, { readonly painted: Set<Painted> }>();

function errorSentence(error: unknown): string {
  const message = error !== null && typeof error === 'object' && 'message' in error ? (error as { message: unknown }).message : null;
  return typeof message === 'string' && message.trim().length > 0 ? message : SOURCE_OPEN_FAILED;
}

export interface SourceLinkOptions {
  /** Exactly the recorded address: `EvidenceSourceCardProjection.sourceRef`, `ReviewEvidenceSource.url` or `ResearchEvidenceProjection.url`. */
  readonly address: string;
  /** The source's identity for 在浏览器中打开; `null` when the surface holds none (a report row with no retained row). */
  readonly identity: SourceIdentityInput | null;
  readonly api?: SourceLinkApi;
}

export function sourceLinkControls(options: SourceLinkOptions): HTMLElement {
  const api = options.api ?? rendererApi;
  const wrap = document.createElement('div');
  wrap.className = 'source-link';
  const domain = sourceDomain(options.address);
  if (domain !== null) {
    const name = document.createElement('span');
    name.className = 'source-link-domain';
    name.textContent = domain;
    wrap.append(name);
  }
  const status = document.createElement('span');
  status.className = 'source-link-status';
  status.setAttribute('role', 'status');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'quiet btn';
  copy.dataset['sourceAction'] = 'copy-link';
  copy.textContent = SOURCE_COPY_LINK;
  copy.addEventListener('click', () => {
    void copyPlainText(api, options.address).then(() => { status.textContent = SOURCE_LINK_COPIED; }, () => { status.textContent = SOURCE_LINK_COPY_FAILED; });
  });
  wrap.append(copy);
  const check = checkBrowserAddress(options.address);
  if (!check.ok) {
    const refusal = document.createElement('span');
    refusal.className = 'source-link-refusal';
    refusal.textContent = check.sentence;
    wrap.append(refusal);
  } else if (options.identity !== null) {
    const identity = options.identity;
    const key = JSON.stringify(identity);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'quiet btn';
    open.dataset['sourceAction'] = 'open-in-browser';
    open.dataset['sourceHost'] = check.host;
    open.textContent = `${SOURCE_OPEN_IN_BROWSER} · ${check.host}`;
    const painted: Painted = { control: open, status };
    const running = inFlight.get(key);
    if (running !== undefined) { open.disabled = true; running.painted.add(painted); }
    open.addEventListener('click', () => {
      if (open.disabled || inFlight.has(key)) return;
      const press = { painted: new Set([painted]) };
      inFlight.set(key, press);
      open.disabled = true;
      status.textContent = '';
      const settle = (sentence: string): void => {
        inFlight.delete(key);
        // A late answer paints only a control still on screen; one removed meanwhile is left as it was.
        for (const entry of press.painted) {
          if (!entry.control.isConnected) continue;
          entry.control.disabled = false;
          entry.status.textContent = sentence;
        }
      };
      void api.openSourceInBrowser(identity).then(() => settle(SOURCE_OPENED), (error: unknown) => settle(errorSentence(error)));
    });
    wrap.append(open);
  }
  wrap.append(status);
  return wrap;
}
