import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import deepseekDocument from '../../config/providers/search-backends/search-deepseek.json' with { type: 'json' };
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { evaluateSearchCandidateProbe, redeemSearchCandidateProbe, type SearchCandidateProbeTicket } from '../../src/service/provider/egress-gate.js';
import {
  SEARCH_BACKEND_DECLARATIONS, SEARCH_BACKEND_EVALUATION, SEARCH_BACKENDS, defaultSearchBackend, searchBackendCandidate, searchBackendCandidateOf,
  searchBackendDeclarationOf, searchBackendOutcome,
} from '../../src/service/provider/search-backends.js';
import { searchFailureClass } from '../../src/service/provider/search-service.js';
import { candidateConfigurationDigestOf, legacyConfigurationDigestOf, searchBackendConfigurationDigest } from '../../src/service/provider/search-backends/index.js';
import { deepseekBackend, deepseekDirectFetchRequest, deepseekDirectSearchRequest, readDeepseekDirectFetch, readDeepseekDirectSearch } from '../../src/service/provider/search-backends/deepseek.js';
import type { SearchConnectionTestPolicy } from '../../src/shared/protocol.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// Issue #1055 into W22-S10a #1181: the DeepSeek direct-search candidate is declared beside the legacy Messages backend and
// inherits none of it. Nothing here sends: transports are captures and credentials are placeholders.
installNodeNetworkDenial();

const LEGACY_DIGEST_AT_BASE = 'dedaa07ba29f83e07b0c666b79b5de3f1d6d8f192b7b5db08447b8a29577b300';
const document = (): Record<string, any> => structuredClone(deepseekDocument) as Record<string, any>;
const profileOf = (id: string) => SEARCH_BACKENDS.find((entry) => entry.id === id)!.profile;

describe('the closed DeepSeek direct-search candidate namespace', () => {
  it('leaves the legacy digest, profile, ranking, default and request exactly as they were', () => {
    expect(searchBackendConfigurationDigest('search-deepseek')).toBe(LEGACY_DIGEST_AT_BASE);
    const withoutCandidate = document();
    delete withoutCandidate['candidate'];
    expect(legacyConfigurationDigestOf(withoutCandidate, profileOf('search-deepseek'))).toBe(LEGACY_DIGEST_AT_BASE);
    expect(searchBackendDeclarationOf(withoutCandidate)).toEqual(SEARCH_BACKEND_DECLARATIONS.find((entry) => entry.id === 'search-deepseek'));
    expect(SEARCH_BACKENDS.map((entry) => [entry.id, entry.rank])).toEqual([['search-tinyfish', 1], ['search-deepseek', 2], ['search-brave', 3], ['search-parallel', 4], ['search-bochaai', 5]]);
    expect(defaultSearchBackend()!.id).toBe('search-tinyfish');
    const request = deepseekBackend.request('q', { credential: 'placeholder', count: 10 });
    expect([request.url, JSON.parse(request.body!).model, JSON.parse(request.body!).tools]).toEqual(['https://api.deepseek.com/anthropic/v1/messages', 'deepseek-flash',
      [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }]]);
  });

  it('changes only the candidate digest across two candidate revisions, and every legacy field still moves the legacy digest', () => {
    const second = document();
    second['candidate'].revision = 2;
    second['candidate'].displayName = 'DeepSeek 搜索 API（直连，修订 2）';
    expect(candidateConfigurationDigestOf(second)).not.toBe(candidateConfigurationDigestOf(document()));
    expect(legacyConfigurationDigestOf(second, profileOf('search-deepseek'))).toBe(LEGACY_DIGEST_AT_BASE);
    expect(searchBackendDeclarationOf(second)).toEqual(searchBackendDeclarationOf(document()));
    const altered = document();
    altered['notes'] = [...altered['notes'], 'one more note'];
    expect(legacyConfigurationDigestOf(altered, profileOf('search-deepseek'))).not.toBe(LEGACY_DIGEST_AT_BASE);
  });

  it('keeps the old measurement on its historical subject only: an altered legacy request is unmeasured, the candidate never measured', () => {
    const altered = document();
    altered['request'].endpoint = 'https://api.deepseek.com/v1/tools/search';
    const declarations = SEARCH_BACKEND_DECLARATIONS.map((entry) => entry.id === 'search-deepseek' ? searchBackendDeclarationOf(altered) : entry);
    const outcome = searchBackendOutcome(declarations, SEARCH_BACKEND_EVALUATION.profiles, SEARCH_BACKEND_EVALUATION.cnyPerUsd);
    expect(outcome.excluded).toContainEqual({ backendId: 'search-deepseek', reason: 'not-measured' });
    const candidate = searchBackendCandidateOf(document())!;
    expect([candidate.measurement, candidate.search.endpoint, candidate.fetch.endpoint, candidate.price.amount, candidate.price.per])
      .toEqual(['not-measured', 'https://api.deepseek.com/v1/tools/search', 'https://api.deepseek.com/v1/tools/fetch', 0.75, 1000]);
    expect(() => searchBackendCandidate('search-brave', candidate.candidateId)).toThrow('SEARCH_CANDIDATE_UNKNOWN');
    expect(() => searchBackendCandidate('search-deepseek', 'deepseek-direct-search-v2')).toThrow('SEARCH_CANDIDATE_UNKNOWN');
  });

  it('speaks the documented direct Search and Fetch shapes: Bearer, exactly the arguments, nothing else', () => {
    const candidate = searchBackendCandidate('search-deepseek', 'deepseek-direct-search-v1');
    const search = deepseekDirectSearchRequest(candidate, candidate.search.probeArguments, 'placeholder');
    expect(search).toEqual({ url: 'https://api.deepseek.com/v1/tools/search', method: 'POST',
      body: '{"count":10,"need_content":false,"query":"UNESCO World Book and Copyright Day April 23"}',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: 'Bearer placeholder' } });
    expect(deepseekDirectFetchRequest(candidate, 'https://www.unesco.org/', 'placeholder').body).toBe('{"url":"https://www.unesco.org/"}');
    expect(() => deepseekDirectSearchRequest(candidate, candidate.search.probeArguments, '')).toThrow('SEARCH_SERVICE_CREDENTIAL_REQUIRED');
    expect(readDeepseekDirectSearch('{"results":[]}')).toEqual([]);
    expect(readDeepseekDirectSearch('{"results":[{"title":"t","url":"http://127.0.0.1/"},{"title":"u","url":"https://www.unesco.org/"}]}')!.map((hit) => hit.url)).toEqual(['https://www.unesco.org/']);
    for (const body of ['{}', '{"results":{}}', 'not json']) expect(readDeepseekDirectSearch(body)).toBeNull();
    expect(readDeepseekDirectFetch('{"title":"T","content":"# M"}')).toEqual({ title: 'T', content: '# M' });
    expect(readDeepseekDirectFetch('{"title":"T"}')).toBeNull();
  });
});

const POLICY: SearchConnectionTestPolicy = Object.freeze<SearchConnectionTestPolicy>({
  ruleId: 'ordinary-production-direct-search-connection-test', purpose: 'fixed-public-search-connection-test', backendId: 'search-deepseek',
  candidateId: 'deepseek-direct-search-v1', endpoint: 'https://api.deepseek.com/v1/tools/search', method: 'POST', protocol: 'deepseek-direct-search',
  credentialSlot: 'search-deepseek', headerForm: 'authorization-bearer', arguments: { query: 'UNESCO World Book and Copyright Day April 23', count: 10, need_content: false },
  argumentsCanonicalSha256: 'ae23d5c44e8eec9398f100d153f0f5042bd7fe388f50c6c57aba1825659f629c', maximumRequests: 1, timeoutMilliseconds: 25_000,
  responseMaxBytes: 2_097_152, resultsMaximum: 3, titleMaximumCharacters: 120, urlMaximumCharacters: 2048,
  rejectedOperationalScopes: ['development-ci', 'fixture-recording', 'developer-live'],
});

function decide(overrides: Partial<Parameters<typeof evaluateSearchCandidateProbe>[0]> = {}, reads = { connection: 0 }) {
  const candidate = searchBackendCandidate('search-deepseek', 'deepseek-direct-search-v1');
  return evaluateSearchCandidateProbe({ operationalScope: 'ordinary-production', providerProcessingVersion: 'v32', policy: POLICY,
    candidate: { ...candidate.search, backendId: candidate.backendId, candidateId: candidate.candidateId, credentialSlot: candidate.credentialSlot, arguments: candidate.search.probeArguments },
    configurationDigest: candidateConfigurationDigestOf(document()), developmentReference: () => false,
    connection: () => { reads.connection += 1; return { credentialReference: '6f9c1d2e-3b4a-4c5d-8e6f-7a8b9c0d1e2f', credentialOperationState: 'ready' }; }, ...overrides });
}

describe('the candidate probe decision and its single credential release', () => {
  it('refuses development-ci, fixture-recording, developer-live and a missing policy before reading the connection', () => {
    for (const operationalScope of ['development-ci', 'fixture-recording', 'developer-live', null]) {
      const reads = { connection: 0 };
      expect(decide({ operationalScope }, reads)).toMatchObject({ decision: 'refuse', code: 'SEARCH_CANDIDATE_PROBE_SCOPE_REFUSED' });
      expect(reads.connection).toBe(0);
    }
    expect(decide({ policy: undefined })).toMatchObject({ decision: 'refuse', code: 'SEARCH_CANDIDATE_PROBE_SCOPE_REFUSED' });
  });

  it('refuses a candidate the policy does not name exactly, a missing key and a development reference', () => {
    for (const policy of [{ ...POLICY, endpoint: 'https://api.deepseek.com/v1/tools/fetch' }, { ...POLICY, candidateId: 'other' },
      { ...POLICY, arguments: { ...POLICY.arguments, count: 50 } }, { ...POLICY, argumentsCanonicalSha256: '0'.repeat(64) }]) {
      expect(decide({ policy })).toMatchObject({ decision: 'refuse', code: 'SEARCH_CANDIDATE_PROBE_POLICY_MISMATCH' });
    }
    expect(decide({ connection: () => ({ credentialReference: randomUUID(), credentialOperationState: 'missing' }) })).toMatchObject({ code: 'SEARCH_CREDENTIAL_MISSING' });
    expect(decide({ connection: () => undefined })).toMatchObject({ code: 'SEARCH_CREDENTIAL_MISSING' });
    expect(decide({ developmentReference: () => true })).toMatchObject({ code: 'SEARCH_CREDENTIAL_MISSING' });
  });

  it('freezes every pin in one ticket that redeems once and releases only its own slot and reference, once', async () => {
    const decision = decide();
    if (decision.decision !== 'call-search-candidate-probe') throw new Error('expected a ticket');
    const ticket: SearchCandidateProbeTicket = decision.ticket;
    expect(ticket).toMatchObject({ backendId: 'search-deepseek', candidateId: 'deepseek-direct-search-v1', endpoint: POLICY.endpoint, method: 'POST',
      protocol: 'deepseek-direct-search', arguments: POLICY.arguments, argumentsDigest: POLICY.argumentsCanonicalSha256, credentialSlot: 'search-deepseek',
      policy: { operationalScope: 'ordinary-production', providerProcessingVersion: 'v32' } });
    expect(Object.isFrozen(ticket)).toBe(true);
    let reads = 0;
    const broker = new CredentialBroker({ resolve: async () => { reads += 1; return 'placeholder'; } }, { developmentReferences: 'refused' });
    const binding = { bindingDigest: ticket.bindingDigest, modelRole: 'Main Editorial Role' as const, slot: ticket.credentialSlot, credentialReference: ticket.credentialReference };
    await expect(broker.releaseTo(binding, ticket, async () => 'sent')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    expect(redeemSearchCandidateProbe(ticket)).toBe(true);
    expect(redeemSearchCandidateProbe(ticket)).toBe(false);
    await expect(broker.releaseTo({ ...binding, credentialReference: randomUUID() }, ticket, async () => 'sent')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    await expect(broker.releaseTo(binding, ticket, async (value) => value)).resolves.toBe('placeholder');
    await expect(broker.releaseTo(binding, ticket, async () => 'again')).rejects.toMatchObject({ code: 'CREDENTIAL_RELEASE_REFUSED' });
    expect(reads).toBe(1);
  });
});

describe('the closed search failure classes', () => {
  it('reads a class from the HTTP status or an AI7 error code, never from a body', () => {
    expect([200, 400, 401, 402, 403, 404, 429, 500, 504].map((status) => searchFailureClass({ status })))
      .toEqual(['malformed', 'rejected', 'auth', 'quota', 'auth', 'rejected', 'rate', 'server', 'server']);
    expect(['SEARCH_SERVICE_CREDENTIAL_REQUIRED', 'CREDENTIAL_MISSING', 'PLATFORM_TOOL_TIMEOUT', 'PLATFORM_TOOL_FAILED', 'PLATFORM_TOOL_BODY_TOO_LARGE', 'PLATFORM_TOOL_TICKET_REFUSED']
      .map((code) => searchFailureClass({ code }))).toEqual(['credential-missing', 'credential-missing', 'transport', 'transport', 'malformed', 'refused']);
  });
});
