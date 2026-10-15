import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluationRequest, readEvaluationAnswer } from './search-backend-evaluation/vendors.mjs';

/**
 * The development search backend evaluation (Issue #883; Owner decisions 24″, 24⁵). A developer-host tool, never a product
 * path and never a ladder rung: it measures each search backend a document under `config/providers/search-backends/`
 * declares, over the fixed public query set `tools/search-backend-evaluation/queries.json`, and writes the report
 * `docs/development/search-backend-evaluation.md` and the sanitized profiles
 * `config/providers/recorded-evidence/search-backend-profiles.json` that the registry reads.
 *
 *   node tools/search-backend-evaluation.mjs --run <backend id>   measure one backend once over the 30 queries
 *   node tools/search-backend-evaluation.mjs --report             write the report and the profiles from the recorded runs
 *   node tools/search-backend-evaluation.mjs --probe <backend id> one fixed public query: reachability, latency, count, ≤3 titles/URLs
 *
 * **Credentials — the ADR 0067 amendment clause of Issue #883, evaluation only.** The tool never opens a key file. For each
 * backend it asks the Credential Broker whether the slot's development Credential Reference holds a value
 * (`checkPlanReadiness`) and refuses when it does not; it then reads the value through the same read-only Protected Secret
 * Store resolver the broker uses (same keyring identity and entry naming), in this process only, places it in the one
 * documented header of the request, and never prints, logs, stores or echoes it. It fabricates no gate ticket: this is a
 * development measurement, not product egress, and the Egress Gate admits no search backend host. It refuses to run when
 * CI is present or on a background test guest, which hold no search key.
 *
 * **Network.** The measurement runs with the proxy OFF for this process alone: the proxy environment variables are removed
 * from the process, every request goes through an explicit direct `undici` Agent (so neither `NODE_USE_ENV_PROXY` nor any
 * environment proxy applies; Node never reads the Windows system proxy), and the host's system proxy setting is read and
 * recorded, never changed. One call is one request, without automatic retries: a timeout or interrupted body may already
 * have been processed and billed (ADR 0067). Calls are sequential and paced. An exclusive run record is persisted before
 * any request and checkpointed after each answer; an interrupted or concurrent run cannot silently repeat the measurement.
 *
 * **Output.** The console shows the query id, the status class, the latency and hit or miss; the run record under the
 * ignored `.cache/search-evaluation/` keeps the top five titles and URLs per query and nothing else of a body. The report
 * and the profiles carry titles and URLs at most.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QUERIES_PATH = 'tools/search-backend-evaluation/queries.json';
const REPORT_PATH = 'docs/development/search-backend-evaluation.md';
const PROFILES_PATH = 'config/providers/recorded-evidence/search-backend-profiles.json';
const RUNS_DIRECTORY = join(ROOT, '.cache', 'search-evaluation');
const OWNERS_BUNDLE = join(ROOT, 'node_modules', '.cache', 'ai7-search-evaluation', 'owners.mjs');
const TOP_K = 5;
const PROBE_TITLES = 3;
const PACE_MS = 2100;
const CALL_TIMEOUT_MS = Object.freeze({ default: 30_000, 'anthropic-messages-web-search': 120_000 });
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const PROXY_VARIABLES = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NODE_USE_ENV_PROXY'];
/** The fixed rate that orders CNY and USD prices inside a tier (it orders, it does not bill). */
const CNY_PER_USD = Object.freeze({ rate: 6.7313, source: 'CFETS central parity of the renminbi against the US dollar as published by Xinhua (news.cn), 2026-10-12', readOn: '2026-10-16' });

export class SearchEvaluationError extends Error {
  constructor(code, detail) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'SearchEvaluationError';
    this.code = code;
  }
}

/** CI and the background test guests are never a measuring host: they hold no search key (Issue #883 Journey disposition). */
export function measuringHostRefusal(env = process.env, host = hostname()) {
  if (env.CI !== undefined || env.GITHUB_ACTIONS !== undefined || env.AI7_E2E_JOURNEY !== undefined) return 'SEARCH_EVALUATION/ci-refused';
  if (/^ai7-testbed-/iu.test(host)) return 'SEARCH_EVALUATION/guest-refused';
  return null;
}

export function parseArguments(argv) {
  const [mode, value, ...rest] = argv;
  if (rest.length > 0) throw new SearchEvaluationError('SEARCH_EVALUATION/arguments');
  if (mode === '--report' && value === undefined) return { mode: 'report' };
  if ((mode === '--run' || mode === '--probe') && typeof value === 'string' && /^search-[a-z][a-z0-9-]*$/u.test(value)) return { mode: mode.slice(2), backendId: value };
  throw new SearchEvaluationError('SEARCH_EVALUATION/arguments', '--run <backend id> | --probe <backend id> | --report');
}

/** Whether a URL's host is a judged domain or under one. */
export function onDomain(url, domains) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return domains.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
}

/** The rubric applied to one query's top five: a hit, a primary hit, and how many results sit on a judged domain. */
export function judgeQuery(query, referenceDomains, hits) {
  const top = hits.slice(0, TOP_K);
  const judged = [...query.primary, ...referenceDomains[query.language], ...query.reference];
  const matched = top.find((hit) => onDomain(hit.url, judged) !== null) ?? null;
  return {
    hit: matched !== null,
    matchedUrl: matched?.url ?? null,
    primaryHit: query.primary.length > 0 && top.some((hit) => onDomain(hit.url, query.primary) !== null),
    listed: top.filter((hit) => onDomain(hit.url, judged) !== null).length,
    results: top.length,
  };
}

export function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

export function statusClass(status) {
  return status === null ? 'none' : `${String(status).slice(0, 1)}xx`;
}

/** One backend's sanitized profile from its run record, judged by the rubric. */
export function profileOf(backendId, run, querySet) {
  const statusClasses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, none: 0 };
  const hits = { overall: 0, chinese: 0, international: 0 };
  const totals = { overall: 0, chinese: 0, international: 0 };
  const quality = { primaryHits: 0, primaryEligible: 0, listedResults: 0, results: 0 };
  const latencies = [];
  const costs = [];
  let answered = 0;
  let transportErrors = 0;
  let transportRetries = 0;
  for (const query of querySet.queries) {
    const call = run.calls.find((entry) => entry.id === query.id);
    if (call === undefined) throw new SearchEvaluationError('SEARCH_EVALUATION/run-incomplete', `${backendId} ${query.id}`);
    statusClasses[statusClass(call.status)] += 1;
    if (call.status === null) transportErrors += 1;
    if (call.retried) transportRetries += 1;
    if (call.status !== null) latencies.push(call.latencyMs);
    if (call.costUsd !== null) costs.push(call.costUsd);
    totals.overall += 1;
    if (query.language === 'zh') totals.chinese += 1;
    if (query.international) totals.international += 1;
    if (query.primary.length > 0) quality.primaryEligible += 1;
    if (call.hits === null) continue;
    answered += 1;
    const verdict = judgeQuery(query, querySet.referenceDomains, call.hits);
    quality.listedResults += verdict.listed;
    quality.results += verdict.results;
    if (verdict.primaryHit) quality.primaryHits += 1;
    if (!verdict.hit) continue;
    hits.overall += 1;
    if (query.language === 'zh') hits.chinese += 1;
    if (query.international) hits.international += 1;
  }
  const verdict = statusClasses.none === querySet.queries.length ? 'unreachable' : answered === 0 ? 'no-authenticated-response' : 'measured';
  return {
    backendId,
    verdict,
    queries: querySet.queries.length,
    answered,
    transportErrors,
    transportRetries,
    statusClasses,
    hits,
    totals,
    sourceQuality: quality,
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
    costPerCallUsd: costs.length === 0 ? null : Number((costs.reduce((sum, cost) => sum + cost, 0) / costs.length).toFixed(6)),
    note: run.note ?? null,
  };
}

/** The registry, the broker and the store resolver, bundled from their TypeScript owners with the pinned esbuild. */
async function loadOwners() {
  const { build } = await import('esbuild');
  await mkdir(dirname(OWNERS_BUNDLE), { recursive: true });
  await build({
    stdin: {
      contents: [
        "export { CredentialBroker } from './src/service/provider/credential-broker.ts';",
        "export { createKeyringSecretResolver } from './src/service/provider/keyring-secret-resolver.ts';",
        "export { CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES } from './src/shared/provider-configuration.generated.ts';",
        "export { SEARCH_BACKEND_DECLARATIONS, searchBackendOutcome, overallHitRate, pricePerCallUsd } from './src/service/provider/search-backends.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', outfile: OWNERS_BUNDLE, logLevel: 'silent', legalComments: 'none',
  });
  return import(`${pathToFileURL(OWNERS_BUNDLE).href}?t=${Date.now()}`);
}

async function readQuerySet() {
  const bytes = await readFile(join(ROOT, QUERIES_PATH));
  const querySet = JSON.parse(bytes.toString('utf8'));
  return { querySet, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Remove every proxy variable from this process (never from the host) and record what was there. */
function clearProcessProxy(env = process.env) {
  const present = PROXY_VARIABLES.filter((name) => env[name] !== undefined);
  for (const name of PROXY_VARIABLES) delete env[name];
  return present.length === 0 ? 'unset' : 'cleared-in-process';
}

/** The Windows system proxy switch, read; Node's fetch never uses it, so `enabled` is recorded as enabled-not-used. */
function systemProxyState() {
  if (process.platform !== 'win32') return 'unknown';
  const read = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'], { encoding: 'utf8', windowsHide: true });
  const match = /ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/iu.exec(read.stdout ?? '');
  if (match === null) return 'unknown';
  return Number.parseInt(match[1], 16) === 0 ? 'disabled' : 'enabled-not-used';
}

/** The broker's readiness, then the value through the broker's own store resolver; refuses when the slot holds nothing. */
async function credentialFor(owners, declaration) {
  const reference = owners.CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES[declaration.credentialSlot];
  if (typeof reference !== 'string') throw new SearchEvaluationError('SEARCH_EVALUATION/slot-unknown', declaration.credentialSlot);
  const resolver = owners.createKeyringSecretResolver();
  const broker = new owners.CredentialBroker(resolver, { developmentReferences: 'admitted' });
  const readiness = await broker.checkPlanReadiness(declaration.credentialSlot, reference);
  if (readiness !== 'present') throw new SearchEvaluationError('SEARCH_EVALUATION/slot-absent', `${declaration.credentialSlot}: enrol it with tools/enroll-dev-credential.mjs`);
  const value = await resolver.resolve(reference);
  if (typeof value !== 'string' || value.length === 0) throw new SearchEvaluationError('SEARCH_EVALUATION/slot-absent', declaration.credentialSlot);
  return value;
}

async function readBounded(response) {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new SearchEvaluationError('SEARCH_EVALUATION/body-too-large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const TRANSPORT_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'AbortError', 'TimeoutError',
]);

/** One request only, including when its outcome is unknown; the answer keeps titles and URLs alone. */
export async function measuredCall(transport, declaration, query, credential) {
  const timeout = CALL_TIMEOUT_MS[declaration.protocol] ?? CALL_TIMEOUT_MS.default;
  const request = evaluationRequest(declaration, query, credential);
  const started = performance.now();
  let status = null;
  try {
    const response = await transport.fetch(request.url, {
      method: request.method, headers: request.headers, body: request.body ?? undefined, redirect: 'manual',
      dispatcher: transport.agent, signal: AbortSignal.timeout(timeout),
    });
    status = response.status;
    const text = await readBounded(response);
    const latencyMs = Math.round(performance.now() - started);
    let answer = { hits: null, shape: null, costUsd: null };
    if (status >= 200 && status < 300) {
      try {
        answer = readEvaluationAnswer(declaration, JSON.parse(text));
      } catch {
        answer = { hits: null, shape: 'unparsable', costUsd: null };
      }
    }
    return { status, latencyMs, retried: false, transportError: null, ...answer };
  } catch (error) {
    const code = error?.cause?.code ?? error?.name;
    const transportError = error instanceof SearchEvaluationError && error.code === 'SEARCH_EVALUATION/body-too-large'
      ? error.code : TRANSPORT_ERROR_CODES.has(code) ? code : 'transport-error';
    return { status, latencyMs: Math.round(performance.now() - started), retried: false, transportError, hits: null, shape: null, costUsd: null };
  }
}

async function directTransport() {
  const { Agent, fetch } = await import('undici');
  return { agent: new Agent(), fetch };
}

function declarationFor(owners, backendId) {
  const declaration = owners.SEARCH_BACKEND_DECLARATIONS.find((entry) => entry.id === backendId);
  if (declaration === undefined) throw new SearchEvaluationError('SEARCH_EVALUATION/backend-unknown', backendId);
  return declaration;
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const runPath = (backendId) => join(RUNS_DIRECTORY, `${backendId}.json`);
/** What the measuring developer observed beside the runs (probes before a run, the host's routing), one sentence each. */
const DISCLOSURES_PATH = join(RUNS_DIRECTORY, 'disclosures.json');

/** Claim before sending; even an incomplete record fences a retry after interruption or a concurrent invocation. */
export async function recordRunOnce(path, run, measure) {
  await mkdir(dirname(path), { recursive: true });
  const serialize = () => `${JSON.stringify(run, null, 2)}\n`;
  try {
    await writeFile(path, serialize(), { encoding: 'utf8', flag: 'wx', flush: true });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new SearchEvaluationError('SEARCH_EVALUATION/already-run', run.backendId);
    throw error;
  }
  const checkpoint = () => writeFile(path, serialize(), { encoding: 'utf8', flush: true });
  await measure(checkpoint);
  run.finishedAt = new Date().toISOString();
  await checkpoint();
}

async function runBackend(backendId) {
  if (existsSync(runPath(backendId))) throw new SearchEvaluationError('SEARCH_EVALUATION/already-run', `${backendId} was measured once; its run record is kept`);
  const proxyEnvironment = clearProcessProxy();
  const systemProxy = systemProxyState();
  const owners = await loadOwners();
  const declaration = declarationFor(owners, backendId);
  const { querySet, sha256 } = await readQuerySet();
  const startedAt = new Date().toISOString();
  const run = { backendId, startedAt, finishedAt: null, querySetSha256: sha256, network: { proxyEnvironment, nodeEnvironmentProxy: 'off', systemProxy }, note: null, calls: [] };
  const supported = declaration.support === 'supported';
  const credential = supported ? await credentialFor(owners, declaration) : null;
  const transport = supported ? await directTransport() : null;
  try {
    await recordRunOnce(runPath(backendId), run, async (checkpoint) => {
      if (!supported) {
        run.note = 'not-supported: nothing was sent';
        return;
      }
      console.log(`${backendId}: ${querySet.queries.length} queries, proxy environment ${proxyEnvironment}, system proxy ${systemProxy}`);
      for (const [index, query] of querySet.queries.entries()) {
        if (index > 0) await pause(PACE_MS);
        const call = await measuredCall(transport, declaration, query.query, credential);
        const hits = call.hits === null ? null : call.hits.slice(0, TOP_K);
        run.calls.push({ id: query.id, status: call.status, latencyMs: call.latencyMs, retried: call.retried, transportError: call.transportError, shape: call.shape, costUsd: call.costUsd, hits });
        await checkpoint();
        const judged = hits === null ? 'no results' : judgeQuery(query, querySet.referenceDomains, hits).hit ? 'hit' : 'miss';
        console.log(`${backendId} ${query.id} ${statusClass(call.status)} ${call.latencyMs}ms ${judged}`);
      }
    });
  } finally {
    await transport?.agent.close();
  }
  console.log(`${backendId}: run recorded`);
}

async function probeBackend(backendId) {
  clearProcessProxy();
  const owners = await loadOwners();
  const declaration = declarationFor(owners, backendId);
  if (declaration.support !== 'supported') {
    console.log(`${backendId}: 尚未支持 — nothing sent`);
    return;
  }
  const { querySet } = await readQuerySet();
  const credential = await credentialFor(owners, declaration);
  const transport = await directTransport();
  const call = await measuredCall(transport, declaration, querySet.probe.query, credential);
  await transport.agent.close();
  console.log(formatProbeResult(backendId, call));
}

/** The bounded probe projection: counts and at most three titles/URLs, with no raw body or error detail. */
export function formatProbeResult(backendId, call) {
  const singleLine = (value, limit) => value.replace(/[\r\n\u0000-\u001f\u007f]/gu, ' ').slice(0, limit);
  return [
    `${backendId}: ${call.status === null ? `unreachable (${call.transportError})` : `reachable, HTTP ${statusClass(call.status)}`}, ${call.latencyMs}ms, ${call.hits === null ? 'no readable results' : `${call.hits.length} results`}`,
    ...(call.hits ?? []).slice(0, PROBE_TITLES).map((hit) => `  ${singleLine(hit.title, 120)} — ${singleLine(hit.url, 200)}`),
  ].join('\n');
}

async function readRuns(owners) {
  const runs = new Map();
  for (const declaration of owners.SEARCH_BACKEND_DECLARATIONS) {
    if (!existsSync(runPath(declaration.id))) continue;
    runs.set(declaration.id, JSON.parse(await readFile(runPath(declaration.id), 'utf8')));
  }
  return runs;
}

async function writeReport() {
  const owners = await loadOwners();
  const { querySet, sha256 } = await readQuerySet();
  const runs = await readRuns(owners);
  if (runs.size === 0) throw new SearchEvaluationError('SEARCH_EVALUATION/no-runs');
  for (const [backendId, run] of runs) {
    if (run.querySetSha256 !== sha256) throw new SearchEvaluationError('SEARCH_EVALUATION/query-set-changed', backendId);
    if (typeof run.finishedAt !== 'string') throw new SearchEvaluationError('SEARCH_EVALUATION/run-incomplete', backendId);
  }
  const profiles = [];
  for (const declaration of owners.SEARCH_BACKEND_DECLARATIONS) {
    const run = runs.get(declaration.id);
    if (run === undefined) continue;
    profiles.push(declaration.support === 'supported' ? profileOf(declaration.id, run, querySet) : notSupportedProfile(declaration.id, querySet));
  }
  const days = [...runs.values()].map((run) => run.startedAt.slice(0, 10)).sort();
  const networks = [...runs.values()].map((run) => run.network);
  const network = {
    condition: "The Owner's developer host in mainland China, with the proxy off for the measuring process only: the proxy environment variables removed from the process, every request through an explicit direct undici Agent, the host's own proxy settings left as they were.",
    proxyEnvironment: networks.some((entry) => entry.proxyEnvironment === 'cleared-in-process') ? 'cleared-in-process' : 'unset',
    nodeEnvironmentProxy: 'off',
    systemProxy: networks.some((entry) => entry.systemProxy === 'enabled-not-used') ? 'enabled-not-used' : networks.every((entry) => entry.systemProxy === 'disabled') ? 'disabled' : 'unknown',
  };
  const evaluation = {
    measuredOn: days[days.length - 1],
    report: REPORT_PATH,
    querySet: {
      path: QUERIES_PATH,
      sha256,
      queries: querySet.queries.length,
      chinese: querySet.queries.filter((query) => query.language === 'zh').length,
      english: querySet.queries.filter((query) => query.language === 'en').length,
      international: querySet.queries.filter((query) => query.international).length,
    },
    network,
    cnyPerUsd: { ...CNY_PER_USD },
    tierWidth: 0.1,
  };
  const outcome = owners.searchBackendOutcome(owners.SEARCH_BACKEND_DECLARATIONS, profiles, CNY_PER_USD.rate);
  const record = { schemaVersion: 1, evaluation, profiles, outcome: { excluded: outcome.excluded, ranking: outcome.ranking, default: outcome.default } };
  const disclosures = existsSync(DISCLOSURES_PATH) ? JSON.parse(await readFile(DISCLOSURES_PATH, 'utf8')) : [];
  if (!Array.isArray(disclosures) || !disclosures.every((entry) => typeof entry === 'string')) throw new SearchEvaluationError('SEARCH_EVALUATION/disclosures-invalid');
  const report = renderReport({ owners, querySet, runs, record, disclosures });
  await writeFile(join(ROOT, PROFILES_PATH), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await writeFile(join(ROOT, REPORT_PATH), report, 'utf8');
  console.log(`wrote ${PROFILES_PATH} and ${REPORT_PATH}`);
}

function notSupportedProfile(backendId, querySet) {
  const zero = { overall: 0, chinese: 0, international: 0 };
  return {
    backendId, verdict: 'not-supported', queries: querySet.queries.length, answered: 0, transportErrors: 0, transportRetries: 0,
    statusClasses: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, none: 0 }, hits: zero, totals: zero,
    sourceQuality: { primaryHits: 0, primaryEligible: 0, listedResults: 0, results: 0 }, latencyMs: { p50: null, p95: null }, costPerCallUsd: null, note: '尚未支持: nothing was sent',
  };
}

const EXCLUSION_TEXT = Object.freeze({
  'not-supported': '尚未支持 — no documented search interface AI7 can speak',
  unreachable: 'unreachable from the measuring host without a proxy (no HTTP response to any query)',
  'no-authenticated-response': 'reached, but no call answered with a usable result (the key was refused or the interface did not search)',
  'zero-hits-both-halves': 'no judged-correct source on either the Chinese or the international half',
  'not-measured': 'not measured',
});

const percent = (part, whole) => (whole === 0 ? '—' : `${Math.round((part / whole) * 1000) / 10}%`);
const cell = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');

function priceText(declaration, profile) {
  const { amount, currency, per } = declaration.price;
  if (amount === null) return profile?.costPerCallUsd === null || profile === undefined ? 'tokens (not measured)' : `tokens, measured ${profile.costPerCallUsd} USD per call`;
  return `${amount} ${currency} per ${per === 1 ? 'call' : `${per.toLocaleString('en-US')} calls`}${declaration.priceSource.verified ? '' : ' (source unverified; re-verify before 设置 display)'}`;
}

function renderReport({ owners, querySet, runs, record, disclosures = [] }) {
  const declarations = owners.SEARCH_BACKEND_DECLARATIONS;
  const byId = new Map(declarations.map((declaration) => [declaration.id, declaration]));
  const profileOfId = new Map(record.profiles.map((profile) => [profile.backendId, profile]));
  const { evaluation, outcome } = record;
  const lines = [
    '# Search backend evaluation',
    '',
    '<!-- Written by tools/search-backend-evaluation.mjs --report from the recorded runs (Issue #883). Do not edit by hand; the measured numbers are in config/providers/recorded-evidence/search-backend-profiles.json. -->',
    '',
    `The development evaluation of the five web search backends the Owner listed (Issue #883; Owner decisions 24″ and 24⁵), measured on ${evaluation.measuredOn} (UTC; the runs spanned ${[...runs.values()].map((run) => run.startedAt).sort()[0].slice(11, 16)}–${[...runs.values()].map((run) => run.finishedAt).sort().at(-1).slice(11, 16)} UTC). Each backend is declared by a document under [\`config/providers/search-backends/\`](../../config/providers/search-backends/) ([provider support](provider-support.md#search-backends)); the sanitized profiles are recorded in [\`search-backend-profiles.json\`](../../${PROFILES_PATH}), which the registry (\`src/service/provider/search-backends.ts\`) reads for the default order. Fixture-free numbers from one run per backend on one host on one day: they compare the backends, they do not establish real editorial research quality.`,
    '',
    '## Outcome (decision 24⁵, applied mechanically)',
    '',
    `- **Excluded:** ${outcome.excluded.length === 0 ? 'none' : outcome.excluded.map((entry) => `\`${entry.backendId}\` — ${EXCLUSION_TEXT[entry.reason]}`).join('; ')}.`,
    `- **Ranking (default order):** ${outcome.ranking.length === 0 ? 'none' : outcome.ranking.map((entry, index) => `${index + 1}. \`${entry.backendId}\` (tier ${entry.tier})`).join(', ')}.`,
    `- **Default selection:** ${outcome.default === null ? 'none' : `\`${outcome.default}\``}.`,
    '',
    'The rule: exclude only the clearly unusable — 尚未支持, unreachable from the mainland host without a proxy, no working authenticated response, or no hit on both the Chinese and the international half. Rank the rest by overall hit rate; every backend within 10 percentage points of the best is the top tier, ordered by price per call (cheapest first; an unknown price last); lower tiers follow in hit-rate order. The first ranked is the default; the Commander confirms it from this report.',
    '',
    '## Method',
    '',
    `- **Query set:** [\`${QUERIES_PATH}\`](../../${QUERIES_PATH}) (sha256 \`${evaluation.querySet.sha256}\`): ${evaluation.querySet.queries} queries, ${evaluation.querySet.chinese} Chinese and ${evaluation.querySet.english} English, ${evaluation.querySet.international} whose best source is an international site. Each is authored from a public fact (constitutional and statistical records, museums and libraries, literary prizes, publishing standards, space missions, international conventions); none quotes or derives from a manuscript.`,
    `- **Judgement rubric:** ${querySet.rubric.hit} ${querySet.rubric.primary} ${querySet.rubric.halves}`,
    `- **Network condition:** ${evaluation.network.condition} Observed: proxy environment \`${evaluation.network.proxyEnvironment}\`, Node environment proxy \`${evaluation.network.nodeEnvironmentProxy}\`, Windows system proxy \`${evaluation.network.systemProxy}\` (read, not changed; Node's fetch does not use it).`,
    `- **Procedure:** each backend run once over all ${evaluation.querySet.queries} queries, sequentially, ${PACE_MS / 1000} s apart, ${CALL_TIMEOUT_MS.default / 1000} s per call (${CALL_TIMEOUT_MS['anthropic-messages-web-search'] / 1000} s for the token-billed DeepSeek call); one retry only when no HTTP response came back, disclosed per backend; nothing retried for a better answer. Latency is the wall time to the full body of every call that got an HTTP response.`,
    '- **Review correction after capture:** the original harness allowed an automatic transport retry and claimed a run only after completion. The reviewed harness sends each request once and persists an exclusive run claim before sending, checkpointing after each answer; interrupted or concurrent invocations refuse to repeat it. The historical profiles and probe disclosure below are unchanged; no measurement was repeated for this correction.',
    '- **Credentials:** each slot enrolled by path with `tools/enroll-dev-credential.mjs` under the ADR 0067 amendment clause of Issue #883; the tool asks the Credential Broker for readiness and reads the value through the broker\'s own read-only store resolver in-process, never from a file, and prints no key and no payload beyond titles and URLs.',
    `- **Price order:** USD as stated; CNY converted at ${CNY_PER_USD.rate} CNY per USD (${CNY_PER_USD.source}, read ${CNY_PER_USD.readOn}) for ordering only; DeepSeek bills tokens, so its price is the measured mean token cost per call at the documented peak price of \`deepseek-flash\`.`,
    '',
    '## Measured profiles',
    '',
    '| Backend | Verdict | Reached / answered | Hit rate overall | Chinese | International | Primary source | Listed results | p50 | p95 | Price | Key | Transport retries |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const declaration of declarations) {
    const profile = profileOfId.get(declaration.id);
    if (profile === undefined) {
      lines.push(`| ${cell(declaration.displayName)} (\`${declaration.id}\`) | not measured | — | — | — | — | — | — | — | — | ${cell(priceText(declaration, undefined))} | ${declaration.keyRequired ? 'required' : 'not required'} | — |`);
      continue;
    }
    const reached = profile.queries - profile.statusClasses.none;
    const latency = (value) => (value === null ? '—' : `${value} ms`);
    lines.push(`| ${cell(declaration.displayName)} (\`${declaration.id}\`) | ${profile.verdict} | ${reached} / ${profile.answered} of ${profile.queries} | ${percent(profile.hits.overall, profile.totals.overall)} | ${percent(profile.hits.chinese, profile.totals.chinese)} | ${percent(profile.hits.international, profile.totals.international)} | ${profile.sourceQuality.primaryHits} of ${profile.sourceQuality.primaryEligible} | ${percent(profile.sourceQuality.listedResults, profile.sourceQuality.results)} | ${latency(profile.latencyMs.p50)} | ${latency(profile.latencyMs.p95)} | ${cell(priceText(declaration, profile))} | ${declaration.keyRequired ? 'required' : 'not required'} | ${profile.transportRetries} |`);
  }
  lines.push('');
  lines.push('Status classes per backend (2xx / 3xx / 4xx / 5xx / no response):', '');
  for (const profile of record.profiles) {
    const s = profile.statusClasses;
    const shapes = [...new Set((runs.get(profile.backendId)?.calls ?? []).map((call) => call.shape).filter((shape) => shape !== null))];
    const errors = [...new Set((runs.get(profile.backendId)?.calls ?? []).map((call) => call.transportError).filter((error) => error !== null))];
    lines.push(`- \`${profile.backendId}\`: ${s['2xx']} / ${s['3xx']} / ${s['4xx']} / ${s['5xx']} / ${s.none}${shapes.length > 0 ? `; response read at ${shapes.map((shape) => `\`${shape}\``).join(', ')}` : ''}${errors.length > 0 ? `; transport errors ${errors.map((error) => `\`${error}\``).join(', ')}` : ''}${profile.note === null ? '' : `; ${profile.note}`}`);
  }
  lines.push('');
  if (disclosures.length > 0) {
    lines.push('## Disclosures', '');
    for (const disclosure of disclosures) lines.push(`- ${disclosure}`);
    lines.push('');
  }
  lines.push('## Readings', '');
  for (const declaration of declarations.filter((entry) => !entry.priceSource.verified)) {
    lines.push(`- **${declaration.displayName} price source unverified:** ${declaration.priceSource.note} The original price input is retained solely to reproduce the recorded ranking; slice 6b must surface the caveat and re-verify the source before presenting the price in 设置.`, '');
  }
  for (const id of ['search-tinyfish', 'search-deepseek']) {
    const declaration = byId.get(id);
    if (declaration === undefined) continue;
    lines.push(`- **${declaration.displayName}:** ${READINGS[id](profileOfId.get(id))}`);
  }
  lines.push('');
  lines.push('## Per query', '');
  lines.push(`Hit (✓), miss (✗) or no readable answer (—) per backend; the query text is the public query sent.`, '');
  const measuredIds = declarations.filter((declaration) => runs.has(declaration.id) && declaration.support === 'supported').map((declaration) => declaration.id);
  lines.push(`| Id | Query | ${measuredIds.map((id) => `\`${id.slice('search-'.length)}\``).join(' | ')} |`);
  lines.push(`| --- | --- | ${measuredIds.map(() => '---').join(' | ')} |`);
  for (const query of querySet.queries) {
    const marks = measuredIds.map((id) => {
      const call = runs.get(id).calls.find((entry) => entry.id === query.id);
      if (call === undefined || call.hits === null) return '—';
      return judgeQuery(query, querySet.referenceDomains, call.hits).hit ? '✓' : '✗';
    });
    lines.push(`| ${query.id} | ${cell(query.query)} | ${marks.join(' | ')} |`);
  }
  lines.push('');
  lines.push('## Judged sources', '');
  lines.push('The first judged-correct result in the top five, per backend and query (titles and URLs only; a miss names its first result).', '');
  for (const id of measuredIds) {
    lines.push(`### \`${id}\``, '');
    for (const query of querySet.queries) {
      const call = runs.get(id).calls.find((entry) => entry.id === query.id);
      if (call === undefined || call.hits === null) {
        lines.push(`- ${query.id}: ${call?.status === null ? `no response (${call.transportError})` : `HTTP ${call?.status ?? '—'}, no readable results`}`);
        continue;
      }
      const verdict = judgeQuery(query, querySet.referenceDomains, call.hits);
      const shown = verdict.matchedUrl === null ? call.hits[0] : call.hits.find((hit) => hit.url === verdict.matchedUrl);
      lines.push(`- ${query.id}: ${verdict.hit ? '✓' : '✗'} ${shown === undefined ? 'no results' : `${cell(shown.title.slice(0, 100))} — <${shown.url.slice(0, 200)}>`}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd()}\n`;
}

const READINGS = Object.freeze({
  'search-tinyfish': () => 'TinyFish is primarily a web-agent platform (Agent API at $0.016 per step), but its documentation (docs.tinyfish.ai/search-api, read 2026-10-16) documents a plain keyed search endpoint, `GET https://api.search.tinyfish.ai?query=…` with the `X-API-Key` header, answering synchronous JSON results with `title` and `url`. Search is billed at $0.00 per request (www.tinyfish.ai/pricing: 30 requests per minute, 500 per hour; the Search API page says free up to 12,000 per day), never drawing on the wallet. The evaluation measured that search endpoint, never the agent.',
  'search-deepseek': (profile) => `Does the Anthropic-compatible endpoint run server-side \`web_search\`? The documentation lists it (api-docs.deepseek.com/guides/anthropic_api, read 2026-10-16: \`server_tool_use\` and \`web_search_tool_result\` blocks Supported; the \`tools\` rows name no tool type) and the Claude Code guide (api-docs.deepseek.com/quick_start/agent_integrations/claude_code) says web search runs through DeepSeek's API at token cost. Measured with Anthropic's \`web_search_20250305\` server tool on \`deepseek-flash\`: ${profile === undefined ? 'not measured.' : profile.verdict === 'measured' ? `it searched — ${profile.answered} of ${profile.queries} calls returned \`web_search_tool_result\` content read as results (${profile.hits.overall} hits).` : `no usable search result came back (verdict \`${profile.verdict}\`).`}`,
});

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const refusal = measuringHostRefusal();
    if (refusal !== null) throw new SearchEvaluationError(refusal);
    const options = parseArguments(process.argv.slice(2));
    if (options.mode === 'run') await runBackend(options.backendId);
    else if (options.mode === 'probe') await probeBackend(options.backendId);
    else await writeReport();
  } catch (error) {
    // A code and a bounded detail only: no request, header or body is ever part of an error here.
    console.error(error instanceof SearchEvaluationError ? error.message : `SEARCH_EVALUATION/failed: ${String(error?.name ?? 'error')}`);
    process.exitCode = 1;
  }
}
