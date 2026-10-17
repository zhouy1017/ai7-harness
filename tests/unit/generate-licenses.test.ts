import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// #939 slice 11f: the generated third-party license list must equal a fresh generation from the committed
// lockfile and the installed closure, cover every production dependency, and never depend on the host.
type LockfileEntry = { readonly name: string; readonly version: string; readonly hostSpecific: boolean };
interface LicensesDocument {
  readonly lockfileSha256: string;
  readonly packages: ReadonlyArray<{
    readonly name: string; readonly version: string; readonly license: string;
    readonly repository: string | null; readonly homepage: string | null;
    readonly licenseText: string; readonly licenseTextDigest: string;
  }>;
}
type LicensesTool = {
  readonly OUTPUT_RELATIVE_PATH: string;
  readonly LICENSE_TEXT_ABSENT: string;
  readonly PLATFORM_LICENSE_ABSENT: string;
  readLockfilePackages(lockfileText: string): ReadonlyArray<LockfileEntry>;
  generateLicensesAt(root: string): string;
  licensesDocumentMatches(committed: LicensesDocument, fresh: LicensesDocument): boolean;
  readLicenseText(directory: string): string;
};

// @ts-expect-error tools/*.mjs carry no declarations; the tool is exercised as the plain module it is.
const tool = (await import('../../tools/generate-licenses.mjs')) as unknown as LicensesTool;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT_PATH = new URL('../../src/renderer/third-party-licenses.generated.json', import.meta.url);
const document: LicensesDocument = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));

describe('the generated third-party license list', () => {
  it('equals a fresh generation from the committed lockfile and installed closure', () => {
    expect(tool.OUTPUT_RELATIVE_PATH).toBe('src/renderer/third-party-licenses.generated.json');
    const fresh = JSON.parse(tool.generateLicensesAt(ROOT)) as LicensesDocument;
    expect(tool.licensesDocumentMatches(document, fresh), 'Third-party license list is stale; run "pnpm run generate:licenses".').toBe(true);
  });

  it('lists every production dependency of package.json and is sorted by name then version', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
    const names = new Set(document.packages.map((entry) => entry.name));
    for (const name of Object.keys(packageJson.dependencies)) expect(names.has(name)).toBe(true);
    const sorted = [...document.packages].sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
    expect(document.packages).toEqual(sorted);
    expect(new Set(document.packages.map((entry) => `${entry.name}@${entry.version}`)).size).toBe(document.packages.length);
  });

  it('digests each license text and discloses the exact text when a package ships none', () => {
    for (const entry of document.packages) {
      expect(entry.licenseTextDigest).toBe(createHash('sha256').update(entry.licenseText, 'utf8').digest('hex'));
    }
    const absent = document.packages.filter((entry) => entry.licenseText === tool.LICENSE_TEXT_ABSENT);
    expect(tool.LICENSE_TEXT_ABSENT).toBe('文本未随包提供');
    expect(absent.length).toBeGreaterThan(0);
  });

  it('includes the full lockfile union, including every platform carrier', () => {
    const resolved = tool.readLockfilePackages(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8'));
    expect(document.packages.map(({ name, version }) => `${name}@${version}`).sort()).toEqual(resolved.map(({ name, version }) => `${name}@${version}`).sort());
    expect(document.lockfileSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects stale installed text, metadata and membership while accepting unavailable-platform text from another host', () => {
    const fresh = JSON.parse(tool.generateLicensesAt(ROOT)) as LicensesDocument;
    const installedIndex = fresh.packages.findIndex((entry) => entry.license !== tool.PLATFORM_LICENSE_ABSENT);
    const altered = { ...fresh, packages: fresh.packages.map((entry, index) => index === installedIndex ? { ...entry, licenseText: 'stale' } : entry) };
    expect(tool.licensesDocumentMatches(altered, fresh)).toBe(false);
    expect(tool.licensesDocumentMatches({ ...fresh, packages: fresh.packages.slice(1) }, fresh)).toBe(false);
    expect(tool.licensesDocumentMatches({ ...fresh, lockfileSha256: 'stale' }, fresh)).toBe(false);
    const otherHost = { ...fresh, packages: fresh.packages.map((entry, index) => index === installedIndex ? { ...entry, license: tool.PLATFORM_LICENSE_ABSENT } : entry) };
    expect(tool.licensesDocumentMatches(fresh, otherHost)).toBe(true);
  });

  it('retains all shipped license and notice files with case-insensitive discovery', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai7-license-'));
    try {
      writeFileSync(join(directory, 'license-mit'), 'MIT notice\r\n');
      writeFileSync(join(directory, 'COPYING'), 'COPYING notice');
      writeFileSync(join(directory, 'NOTICE.txt'), 'Attribution');
      expect(tool.readLicenseText(directory)).toBe('COPYING\n\nCOPYING notice\n\nNOTICE.txt\n\nAttribution\n\nlicense-mit\n\nMIT notice');
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it('reads the lockfile set and marks only os/cpu/libc-constrained packages as host-specific', () => {
    const entries = tool.readLockfilePackages(readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url), 'utf8'));
    const byName = new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry]));
    expect(byName.get('@esbuild/win32-x64@0.28.2')?.hostSpecific).toBe(true);
    expect(byName.get('fsevents@2.3.3')?.hostSpecific).toBe(true);
    expect(byName.get('prosemirror-view@1.42.3')?.hostSpecific).toBe(false);
  });
});
