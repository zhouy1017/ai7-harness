import { describe, expect, it } from 'vitest';
import { BROWSER_ADDRESS_MAX_LENGTH, BROWSER_ADDRESS_REFUSALS, checkBrowserAddress } from '../../src/shared/browser-address.js';

// Issue #1641: the one rule an address passes before it reaches the system browser — http / https only, opened as recorded.

describe('the browser address rule', () => {
  it.each([
    ['https://museum.example.org/zenghouyi/zunpan', 'museum.example.org'],
    ['http://example.org', 'example.org'],
    ['HTTPS://Example.ORG/Path?q=1&utm_source=x#part', 'example.org'],
    ['https://example.org:8443/a', 'example.org:8443'],
    ['https://例子.中国/页面', 'xn--fsqu00a.xn--fiqs8s'],
    ['https://example.org/%E9%A1%B5', 'example.org'],
  ])('accepts %s exactly as recorded and answers its ASCII host', (address, host) => {
    expect(checkBrowserAddress(address)).toEqual({ ok: true, address, host });
  });

  it('accepts an address of exactly the limit and refuses one character more', () => {
    const base = 'https://example.org/';
    const longest = base + 'a'.repeat(BROWSER_ADDRESS_MAX_LENGTH - base.length);
    expect(checkBrowserAddress(longest).ok).toBe(true);
    expect(checkBrowserAddress(`${longest}a`)).toMatchObject({ ok: false, refusal: 'too-long' });
  });

  it.each([
    // Another scheme, a path or a UNC name: not a web address.
    ['file:///C:/Windows/notepad.exe', 'not-web'],
    ['javascript:alert(1)', 'not-web'],
    ['data:text/html,<script>alert(1)</script>', 'not-web'],
    ['ms-settings:privacy', 'not-web'],
    ['ai7://open', 'not-web'],
    ['mailto:someone@example.org', 'not-web'],
    ['tel:+861234567', 'not-web'],
    ['ftp://example.org/file', 'not-web'],
    ['\\\\server\\share\\file', 'not-web'],
    ['C:\\Windows\\notepad.exe', 'not-web'],
    ['/etc/passwd', 'not-web'],
    ['//example.org/path', 'not-web'],
    ['https:example.org', 'not-web'],
    ['example.org', 'not-web'],
    // Embedded credentials.
    ['https://user:pass@example.org/', 'credentials'],
    ['https://user@example.org/', 'credentials'],
    ['https://@example.org/', 'credentials'],
    ['https://example.org@evil.example/', 'credentials'],
    // Control characters, whitespace, a backslash, no host or an address that does not parse.
    ['https://example.org/a b', 'malformed'],
    ['https://example.org/\tx', 'malformed'],
    ['https://example.org/\nx', 'malformed'],
    ['https://example.org/\u0000', 'malformed'],
    ['https://example.org/\u0085', 'malformed'],
    ['https://example.org/\u00a0', 'malformed'],
    ['https://example.org/\u3000', 'malformed'],
    ['https://example.org/\u202e', 'malformed'],
    ['https://example.org/\u200b', 'malformed'],
    [' https://example.org/', 'not-web'],
    ['https://example.org\\@evil.example/', 'malformed'],
    ['https:///example.org', 'malformed'],
    ['https://', 'malformed'],
    ['https://exa[mple.org/', 'malformed'],
    ['', 'malformed'],
  ] as const)('refuses %j as %s with its sentence', (address, refusal) => {
    expect(checkBrowserAddress(address)).toEqual({ ok: false, refusal, sentence: BROWSER_ADDRESS_REFUSALS[refusal] });
  });

  it.each([null, undefined, 7, {}, ['https://example.org/']])('refuses a value that is no string: %j', (value) => {
    expect(checkBrowserAddress(value)).toMatchObject({ ok: false, refusal: 'malformed' });
  });
});
