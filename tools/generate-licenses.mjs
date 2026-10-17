import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The third-party license list (Issue #939, wave 11 slice 11f): it reads only `pnpm-lock.yaml`
// and the already-installed `node_modules`, makes no network request and adds no dependency.
// The list is sorted by name and version and is written to
// `src/renderer/third-party-licenses.generated.json`; the unit suite regenerates it in memory
// and fails when the committed file is stale, naming the command to run.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT_RELATIVE_PATH = 'src/renderer/third-party-licenses.generated.json';
const LOCKFILE_RELATIVE_PATH = 'pnpm-lock.yaml';
/** The exact sentence the tab and the file use for a package that ships no license text. */
export const LICENSE_TEXT_ABSENT = '文本未随包提供';
/** Candidate license/notice file names, checked in this order inside the installed package. */
const LICENSE_FILE_NAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'COPYING', 'COPYING.md', 'COPYING.txt', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE',
];

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The packages the lockfile resolves, without the host-specific ones. `pnpm-lock.yaml` records a
 * `os:`/`cpu:`/`libc:` constraint for every package that only materializes on some hosts, so
 * excluding those entries keeps the generated file identical on Windows and macOS while every
 * production dependency of `package.json` (none of which is host-constrained) still appears.
 */
export function readLockfilePackages(lockfileText) {
  const lines = lockfileText.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === 'packages:');
  if (start === -1) throw new Error('pnpm-lock.yaml has no packages section.');
  const end = lines.findIndex((line, index) => index > start && /^[A-Za-z]/u.test(line));
  const section = lines.slice(start + 1, end === -1 ? lines.length : end);
  const packages = [];
  let current = null;
  const commit = () => {
    if (current === null) return;
    packages.push({ name: current.name, version: current.version, hostSpecific: current.hostSpecific });
    current = null;
  };
  for (const line of section) {
    const header = /^  (?:'([^']+)'|([^:\s][^:]*)):$/u.exec(line);
    if (header !== null) {
      commit();
      const key = header[1] ?? header[2];
      const separator = key.lastIndexOf('@');
      const name = key.slice(0, separator);
      const version = key.slice(separator + 1);
      if (name.length === 0 || version.length === 0) throw new Error(`Unreadable lockfile package key "${key}".`);
      current = { name, version, hostSpecific: false };
      continue;
    }
    if (current !== null && /^    (os|cpu|libc):/u.test(line)) current.hostSpecific = true;
  }
  commit();
  return packages;
}

/** The pnpm virtual store's package directories, each read for its real `name` and `version` from `package.json`. */
export function readInstalledPackages(nodeModulesDir) {
  const store = join(nodeModulesDir, '.pnpm');
  if (!existsSync(store)) throw new Error('The frozen install produced no pnpm virtual store; run bootstrap first.');
  const found = new Map();
  const record = (directory) => {
    const manifestPath = join(directory, 'package.json');
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) return;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      return;
    }
    if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') return;
    const key = `${manifest.name}@${manifest.version}`;
    if (!found.has(key)) found.set(key, directory);
  };
  for (const entry of readdirSync(store, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const payload = join(store, entry.name, 'node_modules');
    if (!existsSync(payload)) continue;
    for (const child of readdirSync(payload, { withFileTypes: true })) {
      if (child.name.startsWith('.')) continue;
      const childPath = join(payload, child.name);
      if (child.name.startsWith('@') && child.isDirectory()) {
        for (const scoped of readdirSync(childPath, { withFileTypes: true })) record(join(childPath, scoped.name));
      } else if (child.isDirectory()) {
        record(childPath);
      }
    }
  }
  return found;
}

function normalizeLicense(manifest) {
  if (typeof manifest.license === 'string' && manifest.license.trim().length > 0) return manifest.license.trim();
  if (manifest.license !== null && typeof manifest.license === 'object' && typeof manifest.license.type === 'string') return manifest.license.type;
  if (Array.isArray(manifest.licenses)) {
    const types = manifest.licenses.map((entry) => (typeof entry === 'string' ? entry : entry?.type)).filter((type) => typeof type === 'string' && type.length > 0);
    if (types.length > 0) return types.join(' OR ');
  }
  return '未知';
}

function normalizeRepository(manifest) {
  const repository = manifest.repository;
  if (typeof repository === 'string' && repository.length > 0) return repository;
  if (repository !== null && typeof repository === 'object' && typeof repository.url === 'string' && repository.url.length > 0) return repository.url;
  return null;
}

function normalizeHomepage(manifest) {
  return typeof manifest.homepage === 'string' && manifest.homepage.length > 0 ? manifest.homepage : null;
}

/** The package's license text, normalized to LF and stripped of a BOM and trailing whitespace, or `LICENSE_TEXT_ABSENT`. */
export function readLicenseText(packageDir) {
  for (const name of LICENSE_FILE_NAMES) {
    const candidate = join(packageDir, name);
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    const text = readFileSync(candidate, 'utf8').replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trimEnd();
    if (text.length > 0) return text;
  }
  return LICENSE_TEXT_ABSENT;
}

/** One package's record, exactly as the JSON carries it. */
export function licenseRecord(name, version, packageDir) {
  if (packageDir === undefined) {
    return { name, version, license: '未知', repository: null, homepage: null, licenseText: LICENSE_TEXT_ABSENT, licenseTextDigest: sha256(LICENSE_TEXT_ABSENT) };
  }
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const licenseText = readLicenseText(packageDir);
  return {
    name,
    version,
    license: normalizeLicense(manifest),
    repository: normalizeRepository(manifest),
    homepage: normalizeHomepage(manifest),
    licenseText,
    licenseTextDigest: sha256(licenseText),
  };
}

/** The whole document: the lockfile digest plus every non-host-specific package, sorted by name then version. */
export function buildLicensesDocument({ root = ROOT } = {}) {
  const lockfileText = readFileSync(join(root, LOCKFILE_RELATIVE_PATH), 'utf8');
  const installed = readInstalledPackages(join(root, 'node_modules'));
  const resolved = readLockfilePackages(lockfileText).filter((entry) => !entry.hostSpecific);
  const missing = resolved.filter((entry) => !installed.has(`${entry.name}@${entry.version}`)).map((entry) => `${entry.name}@${entry.version}`);
  if (missing.length > 0) throw new Error(`Installed closure is missing lockfile packages: ${missing.join(', ')}. Run bootstrap first.`);
  const packages = resolved
    .map((entry) => licenseRecord(entry.name, entry.version, installed.get(`${entry.name}@${entry.version}`)))
    .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
  return { lockfileSha256: sha256(lockfileText), packages };
}

export function serializeLicensesDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function generateLicensesAt(root) {
  return serializeLicensesDocument(buildLicensesDocument({ root }));
}

function main() {
  const check = process.argv.includes('--check');
  const serialized = generateLicensesAt(ROOT);
  const target = join(ROOT, OUTPUT_RELATIVE_PATH);
  if (check) {
    const committed = existsSync(target) ? readFileSync(target, 'utf8') : '';
    if (committed !== serialized) {
      console.error(`Third-party license list is stale; run "pnpm run generate:licenses".`);
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(target, serialized);
  console.log(`Wrote ${OUTPUT_RELATIVE_PATH} (${JSON.parse(serialized).packages.length} packages).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
