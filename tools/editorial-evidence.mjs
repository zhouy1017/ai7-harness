import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The provider-free editorial evidence harness (Issue #812).
 *
 *   node tools/editorial-evidence.mjs --replay fixtures [--case <id>]... [--out <dir>] [--ledger <provider-cache-root>]
 *     [--baseline <file> | --update-baseline <file>]
 *
 * Runs every case of `tests/editorial-cases/cases/` through the product's own path — the store, the execution owners, the marks
 * and Apply authority — on its model fixture, and writes `metrics.json` and `metrics.md` (default `test-results/editorial-evidence/`,
 * which Git ignores). Review and 润色这段 cases go finding → mark → simulated editor decision → Apply → reversal; 初评, 审稿意见
 * and writing cases go result → delivery record. Nothing sends: the global `fetch` refuses for the whole process, and the
 * developer-live replay's transport is the product's deterministic adapter in memory.
 *
 * Evidence source. In `--replay fixtures` every case is replayed, so by default each is labelled `fixture`. On the developer host,
 * `--ledger <provider-cache-root>` reads the Provider Test Ledger's metadata lines (never an entry or a claim) and labels each
 * recorded capture by the ledger line of the item that captured it: `fresh` (a transmitted first capture, configuration or input
 * delta, or declared retry) or `cache` (an exact replay); a case whose captures are all fresh is `fresh`. A capture made under
 * another cache root reads `not-in-ledger`. Authored fixtures have no ledger item and stay `fixture`.
 *
 * Output carries counts, states, identities, digests, dates and case ids only — never manuscript or model text — so it is safe in
 * a log. The TypeScript runner (`tests/editorial-cases/runner/`) is bundled with the repository's pinned esbuild into the ignored
 * `node_modules/.cache/`, where its package imports resolve; nothing is built under `dist/`.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASES_DIRECTORY = join(ROOT, 'tests', 'editorial-cases', 'cases');
const FIXTURES_ROOT = join(ROOT, 'tests', 'fixtures', 'model');
const RUNNER_ENTRY = join(ROOT, 'tests', 'editorial-cases', 'runner', 'index.ts');
const RUNNER_BUNDLE = join(ROOT, 'node_modules', '.cache', 'ai7-editorial-evidence', 'runner.mjs');
const METRICS_SCHEMA = 'ai7.editorial-evidence/1';
const CASE_TIMEOUT_MS = 180_000;
const FRESH_DECISIONS = new Set(['first-capture', 'config-delta', 'input-delta', 'retry-unknown']);

export class EditorialEvidenceError extends Error {
  constructor(code, detail) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.code = code;
  }
}

export function parseArguments(argv) {
  const options = { replay: null, cases: [], out: join(ROOT, 'test-results', 'editorial-evidence'), ledger: null, baseline: null, updateBaseline: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    const take = () => {
      if (value === undefined || value.startsWith('--')) throw new EditorialEvidenceError('EDITORIAL_EVIDENCE/argument-missing', flag);
      index += 1;
      return value;
    };
    if (flag === '--replay') options.replay = take();
    else if (flag === '--case') options.cases.push(take());
    else if (flag === '--out') options.out = resolve(take());
    else if (flag === '--ledger') options.ledger = resolve(take());
    else if (flag === '--baseline') options.baseline = resolve(take());
    else if (flag === '--update-baseline') options.updateBaseline = resolve(take());
    else throw new EditorialEvidenceError('EDITORIAL_EVIDENCE/argument-unknown', String(flag).slice(0, 40));
  }
  if (options.replay !== 'fixtures') throw new EditorialEvidenceError('EDITORIAL_EVIDENCE/replay-required', '--replay fixtures');
  if (options.baseline !== null && options.updateBaseline !== null) throw new EditorialEvidenceError('EDITORIAL_EVIDENCE/baseline-ambiguous');
  if (options.baseline === null && options.updateBaseline === null) options.baseline = join(ROOT, 'tests', 'editorial-cases', 'replay-baseline.json');
  return options;
}

/** No case may send: a `fetch` reached from anywhere in this process refuses. The replay transport never calls it. */
function refuseNetwork() {
  globalThis.fetch = async () => { throw new EditorialEvidenceError('EDITORIAL_EVIDENCE/network-refused'); };
}

async function loadRunner() {
  const { build } = await import('esbuild');
  await mkdir(dirname(RUNNER_BUNDLE), { recursive: true });
  await build({ entryPoints: [RUNNER_ENTRY], bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external',
    outfile: RUNNER_BUNDLE, logLevel: 'silent', legalComments: 'none' });
  return import(`${pathToFileURL(RUNNER_BUNDLE).href}?t=${Date.now()}`);
}

async function loadCases(runner, selected) {
  const names = (await readdir(CASES_DIRECTORY)).filter((name) => name.endsWith('.json')).sort();
  const cases = [];
  for (const name of names) {
    const id = name.slice(0, -'.json'.length);
    if (selected.length > 0 && !selected.includes(id)) continue;
    let parsed;
    try { parsed = JSON.parse(await readFile(join(CASES_DIRECTORY, name), 'utf8')); } catch { throw new EditorialEvidenceError('EDITORIAL_CASE/unreadable', id); }
    cases.push(runner.validateCase(parsed, id));
  }
  for (const id of selected) if (!cases.some((entry) => entry.id === id)) throw new EditorialEvidenceError('EDITORIAL_CASE/unknown', id.slice(0, 64));
  return cases;
}

/** The ledger's metadata lines, keyed by item: the lines only, never an entry or a claim, and no line is ever written. */
export async function readLedgerItems(cacheRoot) {
  const raw = await readFile(join(cacheRoot, 'ledger.jsonl'), 'utf8');
  const items = new Map();
  let position = 0;
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    position += 1;
    let parsed;
    try { parsed = JSON.parse(line); } catch { throw new EditorialEvidenceError('EDITORIAL_EVIDENCE/ledger-invalid'); }
    if (typeof parsed.itemId !== 'string') continue;
    const list = items.get(parsed.itemId) ?? [];
    list.push({ outcome: parsed.outcome ?? null, decision: parsed.validation?.decision ?? null, family: parsed.validation?.family ?? null,
      case: parsed.validation?.case ?? null, recordedAt: parsed.recordedAt ?? null, incurredUsage: parsed.incurredUsage ?? null, position });
    items.set(parsed.itemId, list);
  }
  return items;
}

/** Ledger observations only: an orphaned pre-send claim has no line and is disclosed separately in the evidence document. */
export function measuredPassLedger(items) {
  if (items === null) return null;
  const all = [...items.values()].flat().sort((a, b) => a.position - b.position);
  const pass = all.filter((line) => line.family === 'editorial-evidence');
  if (pass.length === 0) return null;
  const first = pass[0].position;
  const last = pass.at(-1).position;
  const totals = (lines) => ({ lines: lines.length, transmitted: lines.filter((line) => line.outcome === 'transmitted').length,
    failed: lines.filter((line) => line.outcome === 'failed').length, refused: lines.filter((line) => line.outcome === 'refused').length,
    inputTokens: lines.reduce((n, line) => n + (line.incurredUsage?.inputTokens ?? 0), 0),
    outputTokens: lines.reduce((n, line) => n + (line.incurredUsage?.outputTokens ?? 0), 0) });
  return { before: { lines: first - 1, transmitted: all.filter((line) => line.position < first && line.outcome === 'transmitted').length },
    after: { lines: last, transmitted: all.filter((line) => line.position <= last && line.outcome === 'transmitted').length },
    totals: totals(pass), byCase: Object.fromEntries([...new Set(pass.map((line) => line.case))].map((id) => [id, totals(pass.filter((line) => line.case === id))])),
    orphanedClaims: 'not read; see the measured-pass incident disclosure' };
}

/** Label one capture by the ledger line of the item that captured it. */
export function captureSource(capture, ledgerItems) {
  if (ledgerItems === null || capture.itemId === null) return 'fixture';
  const lines = ledgerItems.get(capture.itemId) ?? [];
  if (lines.some((line) => line.outcome === 'transmitted' && FRESH_DECISIONS.has(line.decision))) return 'fresh';
  if (lines.some((line) => line.outcome === 'replayed')) return 'cache';
  return lines.length === 0 ? 'not-in-ledger' : 'unknown';
}

export function caseSource(metrics, ledgerItems) {
  const labels = [...new Set(metrics.evidence.captures.map((capture) => captureSource(capture, ledgerItems)))];
  if (labels.length === 0) return 'fixture';
  return labels.length === 1 ? labels[0] : labels.sort().join('+');
}

/** Stable outcomes, contract agreement and fixture bytes; elapsed time, source labels and generated Task identities vary. */
export function comparable(metrics) {
  return { outcome: metrics.outcome, findings: metrics.findings, concerns: metrics.concerns, checks: metrics.checks, effort: metrics.effort,
    delivery: metrics.delivery, result: metrics.result, replay: { answered: metrics.replay.answered, unmatched: metrics.replay.unmatched },
    recordedUsage: metrics.evidence.recordedUsage, contractsAgree: metrics.evidence.contractsAgree,
    fixtures: metrics.evidence.fixtures.map((fixture) => fixture.sha256) };
}

/** Aggregate concerns by kind without mixing the measured pass, earlier captures and authored synthetic controls. */
export function byKind(cases) {
  const groups = new Map();
  for (const entry of cases) {
    if (entry.error !== undefined) continue;
    const cohort = entry.measuredPass !== null ? 'measured-pass' : entry.evidence.fixtures.every((fixture) => fixture.provenance === 'authored') ? 'authored' : 'earlier-capture';
    const key = `${entry.kind}/${cohort}`;
    const group = groups.get(key) ?? { kind: entry.kind, cohort, cases: 0, concerns: 0, matched: 0, missed: 0, unmeasured: 0,
      raisedButExcluded: 0, falsePositiveChecks: 0, usefulFindings: 0, falsePositiveFindings: 0 };
    group.cases += 1;
    group.concerns += entry.concerns.total;
    group.matched += entry.concerns.met.length;
    group.missed += entry.concerns.missed.length;
    group.unmeasured += entry.concerns.unmeasured?.length ?? 0;
    group.raisedButExcluded += entry.concerns.excludedOnly?.length ?? 0;
    group.falsePositiveChecks += entry.checks.triggered.length;
    group.usefulFindings += entry.findings?.useful ?? 0;
    group.falsePositiveFindings += entry.findings?.falsePositives ?? 0;
    groups.set(key, group);
  }
  return [...groups.values()];
}

const cell = (value) => String(value).replace(/\|/gu, '/');
const count = (list) => (Array.isArray(list) ? list.length : 0);

export function markdownTable(report) {
  const lines = [
    `Editorial evidence (${report.mode}) — ${report.cases.length} cases. Counts only; expected concerns are editorial plausibility, not ground truth.`,
    '',
    '| Case | Kind | Source | Model / route | Outcome | Concerns met | Useful / precise | False positives | Unclassified | Listed / located / excluded | Effort adopt / edit / reject / leave | Applied correct / applied | Reversal exact | Delivery | Recorded usage in / out | Elapsed ms |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of report.cases) {
    if (entry.error !== undefined) { lines.push(`| ${cell(entry.id)} | — | — | — | error \`${cell(entry.error)}\` | — | — | — | — | — | — | — | — | — | — | — |`); continue; }
    const f = entry.findings;
    const e = entry.effort;
    const outcome = entry.kind === 'clarification'
      ? `normal ${entry.outcome.normal.questions} q / ambiguous ${entry.outcome.ambiguous.questions} q`
      : `${entry.outcome.state}${entry.outcome.synthesis ? ` · synthesis ${entry.outcome.synthesis}` : ''}${count(entry.outcome.gaps) > 0 ? ` · ${count(entry.outcome.gaps)} gaps` : ''}`;
    lines.push([
      entry.id, entry.kind, entry.source, `${entry.evidence.model ?? 'authored'} / ${entry.evidence.route ?? entry.evidence.binding}`, outcome,
      `${entry.concerns.met.length}/${entry.concerns.total}`,
      f === null ? '—' : `${f.useful} / ${f.precise}`,
      `${entry.checks.triggered.length}/${entry.checks.total}${f === null ? '' : ` (${f.falsePositives} findings)`}`,
      f === null ? '—' : f.unclassified,
      f === null ? '—' : `${f.listed} / ${f.located} / ${f.excluded}`,
      e === null ? '—' : `${e.adopted} / ${e.edited} / ${e.rejected} / ${e.left}`,
      e === null ? '—' : `${e.appliedCorrect} / ${e.applied}`,
      e === null ? '—' : (e.restoredExactly ? 'yes' : 'NO'),
      entry.delivery === null ? '—' : `${entry.delivery.kind}: ${entry.delivery.recorded ? 'recorded' : 'not recorded'}`,
      `${entry.evidence.recordedUsage.inputTokens} / ${entry.evidence.recordedUsage.outputTokens}`,
      entry.replay.elapsedMs,
    ].map(cell).join(' | ').replace(/^/u, '| ').replace(/$/u, ' |'));
  }
  lines.push('', 'Missed concerns and triggered checks:', '');
  for (const entry of report.cases) {
    if (entry.error !== undefined) continue;
    const ids = (list) => (list === undefined || list.length === 0 ? 'none' : list.map((id) => `\`${id}\``).join(', '));
    lines.push(`- \`${entry.id}\`: missed ${ids(entry.concerns.missed)} (raised by the model but excluded by the product: ${ids(entry.concerns.excludedOnly)}); unmeasured ${ids(entry.concerns.unmeasured)}; triggered ${ids(entry.checks.triggered)}`);
  }
  lines.push('', '| Kind | Capture cohort | Cases | Matched / concerns | Missed (raised but excluded) | Unmeasured | FP checks |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const group of report.byKind ?? []) lines.push(`| ${group.kind} | ${group.cohort} | ${group.cases} | ${group.matched}/${group.concerns} | ${group.missed} (${group.raisedButExcluded}) | ${group.unmeasured} | ${group.falsePositiveChecks} |`);
  return `${lines.join('\n')}\n`;
}

async function withTimeout(promise, ms, id) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new EditorialEvidenceError('EDITORIAL_EVIDENCE/case-timeout', id)), ms); })]);
  } finally { clearTimeout(timer); }
}

function boundedCode(error) {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  const match = /^[A-Z][A-Z0-9_]*(?:\/[A-Za-z0-9_-]+)*(?::\s[A-Za-z0-9/_.-]{0,96})?/u.exec(message);
  return match === null ? 'EDITORIAL_EVIDENCE/case-failed' : match[0];
}

export async function main(argv) {
  const options = parseArguments(argv);
  refuseNetwork();
  const runner = await loadRunner();
  const cases = await loadCases(runner, options.cases);
  const ledgerItems = options.ledger === null ? null : await readLedgerItems(options.ledger);
  const results = [];
  for (const testCase of cases) {
    try {
      const metrics = await withTimeout(runner.runEditorialCase({ codeRoot: ROOT, fixturesRoot: FIXTURES_ROOT, testCase }), CASE_TIMEOUT_MS, testCase.id);
      const captures = metrics.evidence.captures.map((capture) => ({ ...capture, source: captureSource(capture, ledgerItems) }));
      results.push({ ...metrics, source: caseSource(metrics, ledgerItems), evidence: { ...metrics.evidence, captures } });
    } catch (error) {
      results.push({ id: testCase.id, error: boundedCode(error) });
    }
  }
  const report = { schema: METRICS_SCHEMA, mode: options.ledger === null ? 'replay fixtures' : 'replay fixtures, sources from the Provider Test Ledger',
    cases: results, byKind: byKind(results), measuredPassLedger: measuredPassLedger(ledgerItems) };
  await mkdir(options.out, { recursive: true });
  await writeFile(join(options.out, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(options.out, 'metrics.md'), markdownTable(report));
  let failed = results.filter((entry) => entry.error !== undefined).length;
  for (const entry of results) {
    console.log(entry.error !== undefined ? `EDITORIAL_EVIDENCE/case/${entry.id}/error ${entry.error}`
      : `EDITORIAL_EVIDENCE/case/${entry.id} source=${entry.source} concerns=${entry.concerns.met.length}/${entry.concerns.total} checks=${entry.checks.triggered.length}/${entry.checks.total} ms=${entry.replay.elapsedMs}`);
  }
  if (options.updateBaseline !== null) {
    if (failed > 0) { console.log('EDITORIAL_EVIDENCE/baseline-update-refused'); return 1; }
    const baseline = Object.fromEntries(results.filter((entry) => entry.error === undefined).map((entry) => [entry.id, comparable(entry)]));
    await writeFile(options.updateBaseline, `${JSON.stringify({ schema: 'ai7.editorial-evidence-baseline/1', cases: baseline }, null, 2)}\n`);
  }
  if (options.baseline !== null) {
    const baseline = JSON.parse(await readFile(options.baseline, 'utf8')).cases;
    for (const entry of results) {
      if (entry.error !== undefined) continue;
      if (selectedOrAll(options, entry.id) && JSON.stringify(comparable(entry)) !== JSON.stringify(baseline[entry.id])) {
        console.log(`EDITORIAL_EVIDENCE/baseline-mismatch/${entry.id}`);
        failed += 1;
      }
    }
    for (const id of Object.keys(baseline)) {
      if (options.cases.length === 0 && !results.some((entry) => entry.id === id)) { console.log(`EDITORIAL_EVIDENCE/baseline-case-absent/${id}`); failed += 1; }
    }
  }
  const shown = relative(ROOT, options.out);
  console.log(`EDITORIAL_EVIDENCE/written ${isAbsolute(shown) || shown.startsWith('..') ? 'out-dir' : shown.split('\\').join('/')}/metrics.json metrics.md`);
  return failed === 0 ? 0 : 1;
}

function selectedOrAll(options, id) {
  return options.cases.length === 0 || options.cases.includes(id);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(boundedCode(error));
    process.exitCode = 1;
  });
}
