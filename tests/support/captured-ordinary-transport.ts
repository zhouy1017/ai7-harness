import { strictEqual } from 'node:assert';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BaselineAnalysisExecutionOwner, type ExecutionOwnerDependencies, type ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import type { AnalysisRequestIdentity, LaunchBinding } from '../../src/service/analysis/baseline-analysis-store.js';
import { assuranceSamplingRequestDigest, parseAssuranceSamplingListedRefs, parseAssuranceSamplingMessageHeader } from '../../src/service/analysis/assurance-sampling-contract.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { clarificationMessageRequestDigest } from '../../src/service/provider/clarification-contract.js';
import { parseCrossUnitCitedBlocks } from '../../src/service/analysis/cross-unit-contract.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicySync } from '../../src/service/launch-policy.js';
import { OPENCODE_GO_SESSION_HEADER } from '../../src/service/provider/deepseek-adapter.js';
import { ownBlockIdsOf, substituteBlockPlaceholders, substituteCrossUnitBlockPlaceholders,
  substituteAssuranceSamplingBlockPlaceholders, substituteAssuranceSamplingRefPlaceholders } from '../../src/service/provider/local-deterministic-adapter.js';
import { resolveFixtureEntry, type ModelFixtureEntry, type ModelFixtureResponse } from '../../src/service/provider/model-fixture.js';
import type { EditorialStore } from '../../src/service/store.js';

export type CapturedOrdinaryAnswer = (request: AnalysisRequestIdentity, message: string) => ModelFixtureResponse | undefined;

/** A response schedule, not a policy fixture: entries carry no admitted fixture identity or digest on this route. */
export function capturedMapAnswer(entries: ReadonlyMap<string, ModelFixtureEntry>): CapturedOrdinaryAnswer {
  return (request, message) => {
    const ordinal = ['cross-unit-reduction', 'assurance-sampling', 'run-report-reflection'].includes(request.stage) ? 0 : request.unitOrdinal ?? 0;
    // Sampling's physical receipt names its complete message; its response schedule uses the frozen sampling header.
    // This is a closed stage translation for controlled ordinary response bytes, never a local fixture admission fallback.
    const sampling = request.stage === 'assurance-sampling' ? parseAssuranceSamplingMessageHeader(message) : null;
    const unitDigest = request.stage === 'units' ? clarificationMessageRequestDigest(message) : null;
    const digest = sampling === null ? unitDigest ?? request.requestDigest : request.requestDigest === canonicalRecord(message).digest
      ? assuranceSamplingRequestDigest(request.contractDigest, sampling.unitOrdinal, sampling.unitDigest, sampling.sampleDigest) : '';
    const entry = resolveFixtureEntry(entries, ordinal, digest, request.attemptIndex);
    if (entry?.capture !== undefined) throw new Error('CAPTURED_ORDINARY_RECORDED_REPLAY_FORBIDDEN');
    return entry?.response;
  };
}

/**
 * The existing ordinary-production L2 composition: actual accepted policy/connection, Store/Plan/DSH/Egress/Broker and
 * fixture:null, with a captured nativeFetch that never opens a socket or reads an enrolled/OS credential. Every response
 * must name the real persisted physical request admission, including stage and attempt. Unmatched requests fail closure.
 * Ordinary execution uses a technical Session per unit and can run three units concurrently under an unset ceiling;
 * callers that specifically need serial behavior must select a genuine finite Plan through the public editor API.
 */
export function capturedOrdinaryExecution(store: EditorialStore, codeRoot: string, dataRoot: string, requestGovernor: ModelRequestGovernor,
  answer: CapturedOrdinaryAnswer,
  controls: Pick<ExecutionOwnerDependencies, 'capacity' | 'unitHold' | 'stageHold' | 'materialGuard' | 'influenceGuard' | 'seriesScopeGuard'> = {}) {
  const allowed = ORDINARY_PRODUCTION_ALLOWED_BINDINGS.find((binding) => binding.route === 'opencode-go')!;
  let connection = store.getModelServiceRouteConnection('opencode-go');
  if (connection === null) connection = store.saveModelServiceConnection('Captured ordinary response schedule', null, 'needs-attention', 'opencode-go');
  store.saveModelServiceConnection(connection.connectionName, connection.credentialReference, 'ready', 'opencode-go');
  store.selectModelServiceRoute('opencode-go');
  const binding = { ...allowed, credentialReference: connection.credentialReference };
  const policy = resolveSourceCheckoutLaunchPolicySync(codeRoot, 'ordinary-production', binding);
  strictEqual(policy.integrityState, 'verified'); strictEqual(policy.denialReason, null);
  const launch: LaunchBinding = { operationalScope: 'ordinary-production', policy,
    live: { ...binding, scope: 'ordinary-production', runBudgetCeiling: 'unset' } };
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.initialEvaluationLedger.bindLaunch(launch);
  store.factualReviewLedger.bindLaunch(launch);
  const unmatched: string[] = [];
  const requests: AnalysisRequestIdentity[] = [];
  const nativeFetch: typeof fetch = async (url, init) => {
    const refuse = (reason = 'unmatched-request'): never => { unmatched.push(reason); throw new Error('CAPTURED_ORDINARY_UNMATCHED_REQUEST'); };
    if (String(url) !== allowed.endpoint || init === undefined) return refuse();
    const sessionId = new Headers(init.headers).get(OPENCODE_GO_SESSION_HEADER);
    const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    let request: AnalysisRequestIdentity | undefined;
    try {
      const row = db.prepare(`SELECT canonical_json FROM analysis_run_states
        WHERE json_extract(canonical_json, '$.requestAdmission.data.event.kind') = 'admit'
        AND json_extract(canonical_json, '$.requestAdmission.data.event.request.sessionId') = ? ORDER BY rowid DESC LIMIT 1`).get(sessionId);
      if (typeof row?.canonical_json === 'string') request = (JSON.parse(row.canonical_json) as {
        requestAdmission: { data: { event: { request: AnalysisRequestIdentity } } } }).requestAdmission.data.event.request;
    } finally { db.close(); }
    const body = JSON.parse(String(init.body)) as { model: string; messages: Array<{ role: string; content: string }> };
    const message = body.messages.findLast((entry) => entry.role === 'user')?.content;
    if (request === undefined || body.model !== binding.model || typeof message !== 'string') return refuse();
    requests.push(request);
    let response: ModelFixtureResponse | undefined;
    try { response = answer(request, message); } catch (error) { unmatched.push('invalid-response-schedule'); throw error; }
    if (response === undefined) return refuse(`${request.stage}:${request.unitOrdinal ?? 'none'}:response-missing`);
    // A fixture's status-less permanent adapter error becomes an actual non-retryable HTTP failure on this route.
    if (response.kind === 'adapter-failure') return new Response(JSON.stringify({ error: { message: response.message } }), { status: response.status ?? 400 });
    if (response.kind === 'quota-exceeded') return new Response(JSON.stringify({ error: { message: response.message } }), { status: response.status });
    // An accepted HTTP response cut off mid-JSON exercises the real adapter's AI7_OUTCOME_UNKNOWN classification.
    if (response.kind === 'outcome-unknown') return new Response('{"choices":[', { status: 200, headers: { 'content-type': 'application/json' } });
    if (response.kind === 'interrupted') throw new Error(response.kind);
    if (response.kind !== 'unit-result') return refuse();
    const text = substituteAssuranceSamplingBlockPlaceholders(substituteAssuranceSamplingRefPlaceholders(
      substituteCrossUnitBlockPlaceholders(substituteBlockPlaceholders(response.text, ownBlockIdsOf(message)), parseCrossUnitCitedBlocks(message)),
      parseAssuranceSamplingListedRefs(message)), message);
    return new Response(JSON.stringify({ model: binding.model,
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: response.usage.inputTokens, completion_tokens: response.usage.outputTokens } }), { status: 200 });
  };
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy: policy,
    currentLaunchPolicy: () => policy, productionPolicyFor: (frozen) => resolveSourceCheckoutLaunchPolicySync(codeRoot, 'ordinary-production', frozen),
    fixture: null, production: { scope: 'ordinary-production', nativeFetch },
    secretResolver: { resolve: async () => 'synthetic-captured-transport-placeholder' }, ...controls });
  return { owner, policy, launch, nativeFetch, requests, assertMatched: () => strictEqual(unmatched.length, 0,
    `CAPTURED_ORDINARY_UNMATCHED_REQUEST ${unmatched.join(', ')}`) };
}
