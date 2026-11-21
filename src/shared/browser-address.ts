/**
 * 在浏览器中打开 (Issue #1641): the one rule a recorded source address passes before AI7 hands it to the system browser. The
 * main process enforces it on the address the service holds; the interface may read it to decide whether to offer the control.
 * Only an `http:` / `https:` address with a host, no credentials, no control character or whitespace, no backslash, and at
 * most {@link BROWSER_ADDRESS_MAX_LENGTH} characters is accepted. An accepted address is opened exactly as recorded.
 */
export const BROWSER_ADDRESS_MAX_LENGTH = 2048;

export type BrowserAddressRefusal = 'not-web' | 'credentials' | 'too-long' | 'malformed';

export const BROWSER_ADDRESS_REFUSALS: Readonly<Record<BrowserAddressRefusal, string>> = {
  'not-web': '这个地址不是网页地址，不能在浏览器中打开。',
  credentials: '这个地址带有登录信息，不在浏览器中打开。',
  'too-long': '这个地址过长，不能在浏览器中打开。',
  malformed: '这个地址格式不正确，不能在浏览器中打开。',
};

export type BrowserAddressCheck =
  | { readonly ok: true; readonly address: string; readonly host: string }
  | { readonly ok: false; readonly refusal: BrowserAddressRefusal; readonly sentence: string };

const WEB_PREFIX = /^https?:\/\//iu;
// C0/C1 controls, format controls (bidi overrides, zero-width), separators and any other whitespace; a backslash (a path or UNC name).
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Z}\s\\]/u;

const refused = (refusal: BrowserAddressRefusal): BrowserAddressCheck => ({ ok: false, refusal, sentence: BROWSER_ADDRESS_REFUSALS[refusal] });

export function checkBrowserAddress(raw: unknown): BrowserAddressCheck {
  if (typeof raw !== 'string' || raw.length === 0) return refused('malformed');
  if (raw.length > BROWSER_ADDRESS_MAX_LENGTH) return refused('too-long');
  if (!WEB_PREFIX.test(raw)) return refused('not-web');
  if (FORBIDDEN.test(raw)) return refused('malformed');
  const rest = raw.slice(raw.indexOf('//') + 2);
  const authority = rest.slice(0, rest.search(/[/?#]|$/u));
  if (authority.length === 0) return refused('malformed');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return refused('malformed');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return refused('not-web');
  if (authority.includes('@') || parsed.username !== '' || parsed.password !== '') return refused('credentials');
  if (parsed.hostname === '') return refused('malformed');
  return { ok: true, address: raw, host: parsed.host };
}
