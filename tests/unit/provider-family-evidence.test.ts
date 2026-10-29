import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import type { CallId, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { canonicalJson } from '../../src/service/analysis/canonical.js';
import {
  DIALOGUE_PROMPT_CONTRACT, DIALOGUE_PROMPT_CONTRACT_DIGEST, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT, DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST, buildDialogueMessage,
} from '../../src/service/dialogue/contract.js';
import { CredentialBroker } from '../../src/service/provider/credential-broker.js';
import { DeepSeekOpenAiCompatibleAdapter, PROVIDER_ROUTE_PROFILES, type DeepSeekTransport } from '../../src/service/provider/deepseek-adapter.js';
import { modelProfileFor, type ModelCapabilities, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { LEGACY_LOCAL_TOOL_SCHEMAS } from '../../src/service/provider/platform-tools.js';
import type { ConfiguredRouteId } from '../../src/shared/provider-configuration.generated.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

/**
 * Provider-free contract evidence per protocol family (Issue #1180): each fixture under
 * `tests/fixtures/model/provider-families/` records, per supported shape, the exact request the adapter assembles
 * (URL, every non-credential header, body bytes), the wire the service answers with (a buffered body or SSE frames) and
 * the normalized result — the stream chunks the harness sees, the canonical result and the usage. Every text is
 * synthetic; the only credential is a placeholder; the only transport is a stub, and the network is denied.
 */

installNodeNetworkDenial();

const ROOT = resolve('tests/fixtures/model/provider-families');
const SECRET = 'placeholder-not-a-credential';
const FAMILIES = ['openai-chat-completions', 'openai-responses', 'anthropic-messages', 'google-generate-content'] as const;
const TOOL = { name: 'synthetic_lookup', description: '合成查询工具。', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } };

type Turn = 'unit' | 'dialogue' | 'tool' | 'tool-history' | 'retrieval';
interface FamilyCase {
  readonly name: string;
  readonly turn: Turn;
  /** The call id the history turn carries; a provider-issued one unless the case names AI7's own. */
  readonly callId?: string;
  readonly stream: boolean;
  readonly request: { readonly url: string; readonly headers: Record<string, string>; readonly credentialHeader: string; readonly body: unknown };
  readonly response: { readonly status: number; readonly headers?: Record<string, string>; readonly body?: unknown; readonly frames?: ReadonlyArray<string> };
  readonly chunks: ReadonlyArray<unknown>;
  readonly result: unknown;
  readonly usage: unknown;
}
interface FamilyFixture {
  readonly family: (typeof FAMILIES)[number];
  readonly route: ConfiguredRouteId;
  readonly model: string;
  /** Capabilities this fixture declares on the shipped row, test-locally: fixture evidence is not live evidence. */
  readonly declared: Partial<ModelCapabilities>;
  readonly cases: ReadonlyArray<FamilyCase>;
}

const fixture = (family: string): FamilyFixture => JSON.parse(readFileSync(join(ROOT, `${family}.json`), 'utf8')) as FamilyFixture;

function modelOf(entry: FamilyFixture): ProviderModelProfile {
  const shipped = modelProfileFor(entry.route, entry.model)!;
  return { ...shipped, capabilities: { ...shipped.capabilities, ...entry.declared } };
}

type Message = GenerateOptions['messages'][number];
const user = (text: string): Message => ({ id: 'synthetic-user' as never, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] });
const dialogue = (): Message => user(buildDialogueMessage({ kind: 'ask', selection: '合成选区。', question: '合成问题？', kept: null }));

/** The synthetic turn each case sends, and the prompt contract it is sent under. */
function turnOf(turn: Turn, model: ProviderModelProfile, rawCallId: string): { payload: GenerateOptions; digest: string } {
  const base = { provider: model.route, model: model.model };
  const callId = rawCallId as CallId;
  const unit = user('合成段落：春风吹过合成的小镇。');
  const call: Message = { id: 'synthetic-call' as never, role: 'assistant', source: { kind: 'model', provider: model.route, model: model.model }, content: [{ type: 'text', text: '先查一下。' }, { type: 'tool-call', id: callId, name: TOOL.name, arguments: '{"query":"合成"}' }] };
  const result: Message = { id: 'synthetic-result' as never, role: 'user', source: { kind: 'tool', callId }, content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: '合成结果。' }] }] };
  const shapes: Record<Turn, { payload: Omit<GenerateOptions, 'provider' | 'model'>; digest: string }> = {
    unit: { payload: { system: '合成系统提示。', messages: [unit] }, digest: BASELINE_PROMPT_CONTRACT_DIGEST },
    dialogue: { payload: { system: DIALOGUE_PROMPT_CONTRACT.systemPrompt, messages: [dialogue()] }, digest: DIALOGUE_PROMPT_CONTRACT_DIGEST },
    tool: { payload: { system: '合成系统提示。', tools: [TOOL], messages: [unit] }, digest: BASELINE_PROMPT_CONTRACT_DIGEST },
    'tool-history': { payload: { system: '合成系统提示。', tools: [TOOL], messages: [unit, call, result] }, digest: BASELINE_PROMPT_CONTRACT_DIGEST },
    retrieval: { payload: { system: DIALOGUE_RETRIEVAL_PROMPT_CONTRACT.systemPrompt, tools: [...LEGACY_LOCAL_TOOL_SCHEMAS], messages: [dialogue()] }, digest: DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST },
  };
  return { payload: { ...base, ...shapes[turn].payload } as GenerateOptions, digest: shapes[turn].digest };
}

/** Run one case through the adapter over a stub transport that answers with the recorded wire. */
async function replay(entry: FamilyFixture, item: FamilyCase) {
  const profile = PROVIDER_ROUTE_PROFILES[entry.route];
  const model = modelOf(entry);
  const { payload, digest } = turnOf(item.turn, model, item.callId ?? 'call_synthetic_1');
  const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const transport: DeepSeekTransport = async (url, init) => {
    sent.push({ url, headers: init.headers, body: init.body });
    const headers = { 'content-type': item.response.frames === undefined ? 'application/json' : 'text/event-stream', ...item.response.headers };
    return item.response.frames === undefined
      ? { status: item.response.status, json: async () => item.response.body, headers: new Headers(headers) }
      : new Response(item.response.frames.join(''), { status: item.response.status, headers });
  };
  let ticket: { decision: 'transmit-remote'; bindingDigest: string; payloadDigest: string } | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
  const adapter = new DeepSeekOpenAiCompatibleAdapter({
    broker: new CredentialBroker({ resolve: async () => SECRET }),
    slotBinding: { bindingDigest: 'a'.repeat(64), modelRole: 'Fast Interaction Role', slot: profile.credentialSlot, credentialReference: 'c8c4e0f8-27dd-45ad-8c60-580a5d58b799' },
    tickets: { take: () => { const current = ticket; ticket = null; return current; } },
    attribution: () => ({}), promptContractDigest: digest, profile, modelProfile: model, transport,
    codes: { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE },
    ...(profile.sessionHeader ? { sessionId: () => 'synthetic-session' } : {}),
    ...(item.stream ? { requestShape: 'editorial-dialogue-sse' as const } : {}),
  });
  const chunks: StreamChunk[] = [];
  for await (const chunk of adapter.stream(payload)) chunks.push(chunk);
  return { sent, chunks, result: adapter.lastCanonicalResult, usage: adapter.lastUsage };
}

for (const family of FAMILIES) {
  const entry = fixture(family);
  describe(`${family} family evidence (${entry.route} · ${entry.model})`, () => {
    for (const item of entry.cases) {
      it(`${item.name}: request bytes, wire and normalized result match the record`, async () => {
        const { sent, chunks, result, usage } = await replay(entry, item);
        expect(sent).toHaveLength(1);
        const { [item.request.credentialHeader]: credential, ...headers } = sent[0]!.headers;
        expect(credential).toContain(SECRET);
        expect(sent[0]!.url).toBe(item.request.url);
        expect(headers).toEqual(item.request.headers);
        // The body is the record's bytes exactly: canonical JSON of the recorded value, with no credential in it.
        expect(sent[0]!.body).toBe(canonicalJson(item.request.body));
        expect(sent[0]!.body).not.toContain(SECRET);
        expect(chunks).toEqual(item.chunks);
        expect(result).toEqual(item.result);
        expect(usage).toEqual(item.usage);
      });
    }
  });
}
