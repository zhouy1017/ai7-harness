import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BASELINE_PROMPT_CONTRACT_DIGEST } from '../../src/service/analysis/contract.js';
import { CredentialBroker, type CredentialSlotBinding } from '../../src/service/provider/credential-broker.js';
import {
  DEEPSEEK_ROUTE_PROFILE,
  DeepSeekOpenAiCompatibleAdapter,
  OPENCODE_GO_ROUTE_PROFILE,
  PROVIDER_ROUTE_PROFILES,
  assembleProviderRequest,
  credentialHeaders,
  type DeepSeekTransport,
  type ProviderRouteProfile,
} from '../../src/service/provider/deepseek-adapter.js';
import { DEEPSEEK_ROUTE, OPENCODE_GO_ROUTE, type RemoteExecutionRoute } from '../../src/service/provider/egress-gate.js';
import {
  DEEPSEEK_V4_PRO_PROFILE,
  OPENCODE_GO_V4_FLASH_PROFILE,
  PROVIDER_MODEL_PROFILES,
  modelProfileFor,
  type ProviderModelProfile,
} from '../../src/service/provider/model-profile.js';
import { GENERATED_MODEL_PROFILES, GENERATED_ROUTE_PROFILES } from '../../src/service/provider/provider-profiles.generated.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import {
  CONFIGURED_CREDENTIAL_SLOTS,
  CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES,
  CONFIGURED_PROVIDER_LABELS,
  CONFIGURED_ROUTE_IDS,
} from '../../src/shared/provider-configuration.generated.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// ADR 0073 §2–§4, Issue #435 (S55a): a provider whose request shape AI7 implements is configured by a
// schema-validated document under `config/providers/` and a generator. Nothing here transmits: every
// credential is a placeholder from a fake resolver and every transport is a local capture.

installNodeNetworkDenial();

type Document = Record<string, unknown> & { providerId: string };
type Generator = {
  readProviderDocuments: (directory?: string) => { schema: unknown; documents: Array<{ file: string; data: Document }> };
  resolveProviderConfiguration: (input: { schema: unknown; documents: Array<{ file: string; data: unknown }> }) => {
    providers: Array<{ providerId: string; routes: Array<{ profile: { route: string } }> }>;
  };
  renderProviderConfiguration: (resolved: unknown) => Record<string, string>;
  generateProviderConfiguration: (options?: { root?: string; check?: boolean }) => string[];
};

// @ts-expect-error tools/*.mjs carry no declarations; the generator is exercised as the plain module it is.
const generator = (await import('../../tools/generate-provider-configuration.mjs')) as unknown as Generator;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function freshInput(): { schema: unknown; documents: Array<{ file: string; data: Document }> } {
  return structuredClone(generator.readProviderDocuments());
}

function documentOf(input: ReturnType<typeof freshInput>, providerId: string): Document {
  const found = input.documents.find((entry) => entry.data.providerId === providerId);
  if (found === undefined) throw new Error(providerId);
  return found.data;
}

/** Resolve the documents after one mutation and return the refusal's message, or `null` when it resolves. */
function refusalAfter(mutate: (input: ReturnType<typeof freshInput>) => void): string | null {
  const input = freshInput();
  mutate(input);
  try {
    generator.resolveProviderConfiguration(input);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The mutations below reach into parsed JSON by shape. */
const route = (document: Document, index = 0): any => (document.routes as any[])[index];

describe('provider documents and the generator (ADR 0073 §2)', () => {
  it('generates exactly the checked-in files from the checked-in documents, deterministically', () => {
    expect(generator.generateProviderConfiguration({ check: true })).toEqual([]);
    const first = generator.renderProviderConfiguration(generator.resolveProviderConfiguration(freshInput()));
    const second = generator.renderProviderConfiguration(generator.resolveProviderConfiguration(freshInput()));
    expect(second).toEqual(first);
    expect(Object.keys(first).sort()).toEqual([
      'docs/development/provider-support.md',
      'src/service/provider/provider-profiles.generated.ts',
      'src/shared/provider-configuration.generated.ts',
      'tools/provider-credential-slots.generated.mjs',
    ]);
    // No clock reading and no hash of its own output: regeneration on another day is the same bytes.
    for (const text of Object.values(first)) expect(text).not.toMatch(/20\d\d-\d\d-\d\dT\d\d:/u);
  });

  it('names every stale file in check mode and writes nothing, then writes them all when asked', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'ai7-provider-configuration-'));
    try {
      cpSync(join(ROOT, 'config', 'providers'), join(scratch, 'config', 'providers'), { recursive: true });
      for (const directory of ['src/shared', 'src/service/provider', 'tools', 'docs/development']) mkdirSync(join(scratch, directory), { recursive: true });
      const all = [
        'src/shared/provider-configuration.generated.ts', 'src/service/provider/provider-profiles.generated.ts',
        'tools/provider-credential-slots.generated.mjs', 'docs/development/provider-support.md',
      ];
      expect(generator.generateProviderConfiguration({ root: scratch, check: true }).sort()).toEqual([...all].sort());
      expect(all.filter((path) => existsSync(join(scratch, path)))).toEqual([]);
      expect(generator.generateProviderConfiguration({ root: scratch }).sort()).toEqual([...all].sort());
      expect(generator.generateProviderConfiguration({ root: scratch, check: true })).toEqual([]);
      // A hand edit of a generated file is stale, CRLF checkouts are not.
      const support = join(scratch, 'docs/development/provider-support.md');
      writeFileSync(support, readFileSync(support, 'utf8').replaceAll('\n', '\r\n'));
      expect(generator.generateProviderConfiguration({ root: scratch, check: true })).toEqual([]);
      writeFileSync(support, `${readFileSync(support, 'utf8')}hand edit\n`);
      expect(generator.generateProviderConfiguration({ root: scratch, check: true })).toEqual(['docs/development/provider-support.md']);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('lands the supported set of ADR 0080 §5 as one document per provider, Doubao recorded as a task', () => {
    const providers = freshInput().documents.map((entry) => entry.data.providerId).sort();
    expect(providers).toEqual([
      'alibaba-model-studio', 'anthropic-claude', 'baidu-qianfan', 'deepseek-open-platform', 'google-gemini', 'minimax',
      'moonshot-kimi', 'openai-platform', 'opencode-go', 'opencode-zen', 'tencent-hunyuan', 'xiaomi-mimo', 'zhipu-glm',
    ].sort());
    const support = readFileSync(`${ROOT}docs/development/provider-support.md`, 'utf8');
    expect(support).toContain('字节豆包（方舟）');
    expect(support).toContain('a task, not an assumption');
    // The Gemini document records the shape discrepancy and binds nothing (ADR 0080 §3, §6).
    expect(JSON.stringify(documentOf(freshInput(), 'google-gemini').openQuestions)).toContain('Interactions-style API');
  });

  it('refuses a document that breaks a rule, naming the rule and the place', () => {
    const cases: Array<[string, (input: ReturnType<typeof freshInput>) => void]> = [
      ['schema', (input) => { route(documentOf(input, 'minimax')).endpoint = 'http://api.minimax.cn/v1/chat/completions'; }],
      ['schema', (input) => { documentOf(input, 'minimax').extra = true; }],
      ['schema', (input) => { route(documentOf(input, 'minimax')).models[0].modelId = 'MiniMax M3'; }],
      ['file-name', (input) => { input.documents.find((entry) => entry.data.providerId === 'minimax')!.file = 'mini-max.json'; }],
      ['slot-duplicate', (input) => { (documentOf(input, 'minimax').credential as any).slot = 'opencode-go'; }],
      ['reference-duplicate', (input) => { (documentOf(input, 'minimax').credential as any).developmentCredentialReference = DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE; }],
      ['anthropic-version', (input) => { (documentOf(input, 'anthropic-claude').credential as any).anthropicVersion = null; }],
      ['anthropic-version', (input) => { (documentOf(input, 'minimax').credential as any).anthropicVersion = '2023-06-01'; }],
      ['header-form', (input) => { (documentOf(input, 'minimax').credential as any).headerForm = 'x-goog-api-key'; }],
      ['header-form', (input) => { (documentOf(input, 'google-gemini').credential as any).headerForm = 'authorization-bearer'; }],
      ['output-cap', (input) => { route(documentOf(input, 'anthropic-claude')).maxOutputTokens = null; }],
      ['route-id', (input) => { route(documentOf(input, 'opencode-go'), 1).routeId = 'go-messages'; }],
      ['route-id', (input) => { route(documentOf(input, 'minimax')).routeId = 'minimax-chat'; }],
      ['route-duplicate', (input) => { route(documentOf(input, 'opencode-zen'), 1).routeId = 'opencode-zen-responses'; }],
      ['model-duplicate', (input) => { const models = route(documentOf(input, 'minimax')).models; models.push(models[0]); }],
      ['evidence-unknown', (input) => { route(documentOf(input, 'minimax')).requestShapeEvidence = 'nobody-read-this'; }],
      ['evidence-uncited', (input) => { (documentOf(input, 'minimax').evidence as any)['spare'] = { kind: 'unverified' }; }],
      ['evidence-fields', (input) => { (documentOf(input, 'minimax').evidence as any)['minimax-platform-docs'].observedOn = '2026-09-10'; }],
      ['shape-unverified', (input) => { route(documentOf(input, 'minimax')).requestShapeEvidence = 'unverified'; }],
      ['header-unverified', (input) => { (documentOf(input, 'minimax').credential as any).headerEvidence = 'unverified'; }],
      ['capability-unverified', (input) => { route(documentOf(input, 'minimax')).models[0].capabilities = { answerChannel: { value: 'message-content-string', evidence: 'unverified' } }; }],
      ['absent-with-evidence', (input) => { route(documentOf(input, 'minimax')).models[0].capabilities = { structuredOutput: { value: 'none', evidence: 'minimax-platform-docs' } }; }],
      ['capability-value', (input) => { route(documentOf(input, 'minimax')).models[0].capabilities = { toolCalling: { value: 'sometimes', evidence: 'minimax-platform-docs' } }; }],
      ['request-shape', (input) => { route(documentOf(input, 'minimax')).models[0].capabilities = { requestShape: { value: 'openai-responses', evidence: 'minimax-platform-docs' } }; }],
      ['answer-channel', (input) => { route(documentOf(input, 'minimax')).models[0].capabilities = { answerChannel: { value: 'content-text-blocks', evidence: 'minimax-platform-docs' } }; }],
      ['reasoning-channel', (input) => { route(documentOf(input, 'minimax')).models[0].capabilities = { reasoningChannel: { value: 'output-reasoning-items', evidence: 'minimax-platform-docs' } }; }],
      ['shape-capability', (input) => { route(documentOf(input, 'anthropic-claude')).models[0].capabilities = { structuredOutput: { value: 'json-object', evidence: 'claude-platform-docs' } }; }],
      ['shape-capability', (input) => { route(documentOf(input, 'openai-platform')).models[0].capabilities = { toolCalling: { value: 'function', evidence: 'openai-api-docs' } }; }],
      ['context-evidence', (input) => { route(documentOf(input, 'minimax')).models[1].context = { tokens: 200000, evidence: 'unverified' }; }],
      ['route-duplicate', (input) => {
        const copy = structuredClone(documentOf(input, 'minimax'));
        copy.providerId = 'ai7-local-deterministic';
        route(copy).routeId = 'ai7-local-deterministic';
        (copy.credential as any).slot = 'local';
        (copy.credential as any).developmentCredentialReference = randomUUID();
        input.documents.push({ file: 'ai7-local-deterministic.json', data: copy });
      }],
    ];
    for (const [rule, mutate] of cases) {
      const message = refusalAfter(mutate);
      expect(message, rule).not.toBeNull();
      expect(message!, rule).toContain(`PROVIDER_CONFIGURATION/${rule}`);
    }
    // And the unmutated set resolves.
    expect(refusalAfter(() => undefined)).toBeNull();
  });
});

describe('the generated configuration (ADR 0073 §3, §4)', () => {
  it('declares the closed unions from the documents: every route profiled, labelled and on a configured slot', () => {
    expect(Object.keys(GENERATED_ROUTE_PROFILES)).toEqual([...CONFIGURED_ROUTE_IDS]);
    expect(Object.keys(CONFIGURED_PROVIDER_LABELS)).toEqual([...CONFIGURED_ROUTE_IDS]);
    expect(Object.keys(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)).toEqual([...CONFIGURED_CREDENTIAL_SLOTS]);
    expect(new Set(Object.values(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)).size).toBe(CONFIGURED_CREDENTIAL_SLOTS.length);
    for (const profile of Object.values(PROVIDER_ROUTE_PROFILES)) {
      expect(CONFIGURED_CREDENTIAL_SLOTS, profile.route).toContain(profile.credentialSlot);
      expect(profile.credentialHeaderEvidence.kind, profile.route).not.toBe('unverified');
    }
    for (const profile of GENERATED_MODEL_PROFILES) {
      expect(PROVIDER_ROUTE_PROFILES[profile.route], profile.key).toBeDefined();
      expect(profile.key).toBe(`${profile.route}/${profile.model}`);
    }
    // The labels the plan shows beside a model id did not move for the two routes that predate the documents.
    expect(CONFIGURED_PROVIDER_LABELS['deepseek-open-platform']).toBe('DeepSeek 开放平台');
    expect(CONFIGURED_PROVIDER_LABELS['opencode-go']).toBe('OpenCode Go');
    expect(CONFIGURED_PROVIDER_LABELS['opencode-go-messages']).toBe('OpenCode Go');
    expect(DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE).toBe('a7c0de00-5040-4f27-9e13-6b1f2c8d4a55');
  });

  it('moves the two bound routes into configuration without moving a byte of either', () => {
    // The route profiles exactly as they were hand-written before Issue #435, plus the two fields it adds.
    expect(DEEPSEEK_ROUTE_PROFILE).toEqual({
      route: 'deepseek-open-platform', endpoint: 'https://api.deepseek.com/chat/completions', credentialSlot: 'deepseek-api-key',
      credentialHeader: 'authorization-bearer', anthropicVersion: null, limitPolicy: 'rate-limit-retryable', dshAttribution: true,
      sessionHeader: false, maxOutputTokens: null, credentialHeaderEvidence: { kind: 'frozen-request-baseline', since: 'adapter revision 1' },
      displayName: 'DeepSeek 开放平台（官方）',
    });
    expect(OPENCODE_GO_ROUTE_PROFILE).toEqual({
      route: 'opencode-go', endpoint: 'https://opencode.ai/zen/go/v1/chat/completions', credentialSlot: 'opencode-go',
      credentialHeader: 'authorization-bearer', anthropicVersion: null, limitPolicy: 'account-limit-terminal', dshAttribution: false,
      sessionHeader: true, maxOutputTokens: null,
      credentialHeaderEvidence: { kind: 'vendor-documentation', source: 'ADR 0067 · OpenCode Go documentation', readOn: '2026-09-06' },
      displayName: 'OpenCode Go（开发者实时）',
    });
    expect(DEEPSEEK_V4_PRO_PROFILE.context).toEqual({ tokens: 1_000_000, evidence: expect.objectContaining({ kind: 'vendor-documentation', readOn: '2026-09-10' }) });
    expect(OPENCODE_GO_V4_FLASH_PROFILE.context).toEqual({ tokens: null, evidence: { kind: 'unverified' } });
  });

  it('declares every configured model inert except the two active ones, and no configured route bindable', () => {
    for (const profile of Object.values(PROVIDER_MODEL_PROFILES)) {
      if (profile === DEEPSEEK_V4_PRO_PROFILE || profile === OPENCODE_GO_V4_FLASH_PROFILE) continue;
      // A declared format is a claim about the request shape and nothing else (ADR 0073 §3).
      expect(profile.capabilities.answerChannel, profile.key).toBe('none');
      expect(profile.capabilities.reasoningChannel, profile.key).toBe('none');
      expect(profile.capabilities.structuredOutput, profile.key).toBe('none');
      expect(profile.capabilities.reasoningControl, profile.key).toBe('none');
      expect(profile.capabilities.usageAttribution, profile.key).toBe('unknown');
    }
    // A context size names the vendor page that states it, or is none.
    for (const profile of GENERATED_MODEL_PROFILES) {
      if (profile.context.tokens === null) continue;
      expect(profile.context.evidence.kind, profile.key).toBe('vendor-documentation');
      expect(Number.isSafeInteger(profile.context.tokens) && profile.context.tokens > 0, profile.key).toBe(true);
    }
  });
});

describe('credential header forms (ADR 0073 §2)', () => {
  const codes = { QUOTA_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, CONTEXT_WINDOW_EXCEEDED_CODE };
  const SECRET = 'placeholder-not-a-credential';

  function payloadFor(model: ProviderModelProfile): GenerateOptions {
    return {
      provider: model.route,
      model: model.model,
      system: '合成系统提示。',
      messages: [{ id: 'm1' as never, role: 'user', content: [{ type: 'text', text: '合成段落。' }], source: { kind: 'user' } }],
    };
  }

  async function transmitOnce(routeId: RemoteExecutionRoute, modelId: string): Promise<{ url: string; headers: Record<string, string>; body: string }> {
    const profile: ProviderRouteProfile = PROVIDER_ROUTE_PROFILES[routeId];
    const model = modelProfileFor(routeId, modelId)!;
    const slotBinding: CredentialSlotBinding = { bindingDigest: 'a'.repeat(64), modelRole: 'Main Editorial Role', slot: profile.credentialSlot, credentialReference: randomUUID() };
    let ticket: { decision: 'transmit-remote'; bindingDigest: string; payloadDigest: string } | null = { decision: 'transmit-remote', bindingDigest: 'a'.repeat(64), payloadDigest: 'b'.repeat(64) };
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const transport: DeepSeekTransport = async (url, init) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return { status: 200, json: async () => ({}) };
    };
    const adapter = new DeepSeekOpenAiCompatibleAdapter({
      broker: new CredentialBroker({ resolve: async () => SECRET }),
      slotBinding,
      tickets: { take: () => { const current = ticket; ticket = null; return current; } },
      attribution: () => ({}),
      promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
      codes,
      transport,
      profile,
      modelProfile: model,
      ...(profile.sessionHeader ? { sessionId: () => randomUUID() } : {}),
    });
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.stream(payloadFor(model))) chunks.push(chunk);
    expect(calls).toHaveLength(1);
    return calls[0]!;
  }

  it('sends the key in x-api-key beside anthropic-version for Claude official, and in no other header', async () => {
    const call = await transmitOnce('anthropic-claude', 'claude-opus-5');
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.headers['x-api-key']).toBe(SECRET);
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    expect(call.headers).not.toHaveProperty('authorization');
    expect(Object.values(call.headers).filter((value) => value.includes(SECRET))).toHaveLength(1);
    expect(call.body).not.toContain(SECRET);
    expect(JSON.parse(call.body)).toMatchObject({ model: 'claude-opus-5', max_tokens: 32_768 });
  });

  it('sends the key in x-goog-api-key for Gemini official, addressing the model in the path', async () => {
    const call = await transmitOnce('google-gemini', 'gemini-3.8-flash');
    expect(call.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(call.headers['x-goog-api-key']).toBe(SECRET);
    expect(call.headers).not.toHaveProperty('authorization');
    expect(call.headers).not.toHaveProperty('anthropic-version');
  });

  it('keeps authorization: Bearer, and no version header, on every bearer route, the two bound ones included', async () => {
    for (const [routeId, modelId] of [[DEEPSEEK_ROUTE, 'deepseek-v4-pro'], [OPENCODE_GO_ROUTE, 'deepseek-v4-flash'], ['openai-platform', 'gpt-6-astra'], ['opencode-zen-messages', 'claude-opus-5']] as const) {
      const call = await transmitOnce(routeId, modelId);
      expect(call.headers.authorization, routeId).toBe(`Bearer ${SECRET}`);
      expect(call.headers, routeId).not.toHaveProperty('x-api-key');
      expect(call.headers, routeId).not.toHaveProperty('anthropic-version');
    }
    expect(credentialHeaders(DEEPSEEK_ROUTE_PROFILE, SECRET)).toEqual({ authorization: `Bearer ${SECRET}` });
    expect(() => credentialHeaders({ ...DEEPSEEK_ROUTE_PROFILE, credentialHeader: 'cookie' as never }, SECRET)).toThrowError('PROVIDER_CREDENTIAL_HEADER_UNSUPPORTED');
  });

  it('assembles no credential and no version header for a route that predates the field', () => {
    const assembly = assembleProviderRequest(DEEPSEEK_ROUTE_PROFILE, DEEPSEEK_V4_PRO_PROFILE, payloadFor(DEEPSEEK_V4_PRO_PROFILE), {
      attribution: {}, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    });
    expect(Object.keys(assembly.headers).sort()).toEqual(['accept', 'content-type']);
  });
});

describe('the Credential Broker slot set (ADR 0073 §4)', () => {
  it('admits every configured slot and refuses one no document declares', async () => {
    const broker = new CredentialBroker({ resolve: async () => null });
    for (const slot of CONFIGURED_CREDENTIAL_SLOTS) {
      await expect(broker.checkPlanReadiness(slot, randomUUID()), slot).resolves.toBe('missing');
    }
    await expect(broker.checkPlanReadiness('bytedance-doubao' as never, randomUUID())).rejects.toMatchObject({ code: 'CREDENTIAL_BINDING_INVALID' });
  });
});
