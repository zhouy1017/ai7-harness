import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ADR 0098: one x.y.z version names the software in package.json, the version ledger, PROGRESS and
// the development plan. This developer check (L0, run by tools/check.mjs) fails when they disagree.
// It reads three marked places only — the ledger table, PROGRESS's version line and the plan's
// "Wave N → x.y.z" pairs — never prose at large, so a wording change elsewhere cannot break it.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VERSION = /^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$/u;
const STATUSES = new Set(['integrated', 'released', 'planned']);

/** The ledger rows of `## Version ledger`, in table order: { version, status, scope }. */
export function parseLedger(markdown) {
  // Working trees on Windows carry CRLF; the check reads the same text either way.
  const section = String(markdown).replace(/\r\n?/gu, '\n').split(/^## Version ledger[ ]*$/mu)[1];
  if (section === undefined) return { rows: [], findings: ['ledger-section-missing'] };
  const body = section.split(/^## /mu)[0];
  const rows = [];
  const findings = [];
  for (const line of body.split(/\r?\n/u)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3 || cells[0] === 'Version' || /^-+$/u.test(cells[0])) continue;
    const version = cells[0].replace(/`/gu, '');
    const status = cells[1].toLowerCase();
    if (!VERSION.test(version)) { findings.push(`ledger-version-invalid:${version}`); continue; }
    if (!STATUSES.has(status)) { findings.push(`ledger-status-invalid:${version}`); continue; }
    rows.push({ version, status, scope: cells[2] });
  }
  if (rows.length === 0) findings.push('ledger-empty');
  return { rows, findings };
}

const compare = (left, right) => {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
};

/**
 * Findings for the four records. Empty when package.json, the ledger's newest integrated or released
 * row, PROGRESS's "integrated **x.y.z**, next **x.y.z**" line and the plan's planned wave pairs agree.
 */
export function checkVersionConsistency({ packageJson, ledgerMarkdown, progressMarkdown, planMarkdown }) {
  const findings = [];
  const packageVersion = packageJson?.version;
  if (typeof packageVersion !== 'string' || !VERSION.test(packageVersion)) findings.push('package-version-invalid');
  const ledger = parseLedger(ledgerMarkdown);
  findings.push(...ledger.findings);
  const seen = new Set();
  for (const [index, row] of ledger.rows.entries()) {
    if (seen.has(row.version)) findings.push(`ledger-version-duplicate:${row.version}`);
    seen.add(row.version);
    if (index > 0 && compare(ledger.rows[index - 1].version, row.version) >= 0) findings.push(`ledger-order:${row.version}`);
  }
  const integrated = ledger.rows.filter((row) => row.status !== 'planned').at(-1);
  const planned = ledger.rows.filter((row) => row.status === 'planned');
  if (!integrated) findings.push('ledger-no-integrated-row');
  else if (packageVersion !== integrated.version) findings.push(`package-ledger-mismatch:${packageVersion}!=${integrated.version}`);
  if (integrated && planned.some((row) => compare(row.version, integrated.version) <= 0)) findings.push('ledger-planned-not-after-integrated');
  const normalizedProgress = String(progressMarkdown).replace(/\r\n?/gu, '\n');
  const progress = /integrated [*][*]([0-9]+[.][0-9]+[.][0-9]+)[*][*], next [*][*]([0-9]+[.][0-9]+[.][0-9]+)[*][*]/u.exec(normalizedProgress);
  if (!progress) findings.push('progress-version-line-missing');
  else {
    if (integrated && progress[1] !== integrated.version) findings.push(`progress-integrated-mismatch:${progress[1]}`);
    if (planned[0] && progress[2] !== planned[0].version) findings.push(`progress-next-mismatch:${progress[2]}`);
    if (!planned[0]) findings.push('progress-next-without-planned-row');
  }
  for (const row of planned) {
    const wave = /Wave ([0-9]+)/u.exec(row.scope);
    if (!wave) { findings.push(`ledger-planned-without-wave:${row.version}`); continue; }
    if (!planMarkdown.includes(`Wave ${wave[1]} → ${row.version}`)) findings.push(`plan-pair-missing:Wave ${wave[1]} → ${row.version}`);
  }
  return findings;
}

export async function main() {
  const read = (path) => readFile(resolve(ROOT, path), 'utf8');
  const findings = checkVersionConsistency({
    packageJson: JSON.parse(await read('package.json')),
    ledgerMarkdown: await read('docs/development/versioning.md'),
    progressMarkdown: await read('PROGRESS.md'),
    planMarkdown: await read('docs/development/development-plan.md'),
  });
  for (const finding of findings) console.error(`VERSION/${finding}`);
  console.log(`VERSION/${findings.length === 0 ? 'pass' : 'fail'}: ${findings.length} findings`);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('VERSION/check-failed');
    process.exitCode = 1;
  });
}
