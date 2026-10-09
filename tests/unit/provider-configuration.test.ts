import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTEXT_WINDOW_EXCEEDED_CODE, INVALID_CREDENTIAL_CODE, QUOTA_EXCEEDED_CODE, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { DEVELOPER_LIVE_POLICY_BINDING } from '../../src/service/launch-policy.js';
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
  CONFIGURED_DEVELOPMENT_SLOTS,
  CONFIGURED_PROVIDER_LABELS,
  CONFIGURED_ROUTE_IDS,
} from '../../src/shared/provider-configuration.generated.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

// ADR 0073 §2–§4, Issue #435 (S55a): a provider whose request shape AI7 implements is configured by a
// schema-validated document under `config/providers/` and a generator. Nothing here transmits: every
// credential is a placeholder from a fake resolver and every transport is a local capture.

installNodeNetworkDenial();

type Document = Record<string, unknown> & { providerId: string };
type RecordedItem = Record<string, unknown> & { itemId: string; route: string; model: string; observedOn: string; issue: string };
type RecordedBaseline = Record<string, unknown> & { since: string; route: string; models: string[]; issue: string };
type RecordedEvidence = {
  schema: unknown;
  data: Record<string, unknown> & { liveTestItems: RecordedItem[]; frozenRequestBaselines: RecordedBaseline[] };
};
type Input = { schema: unknown; documents: Array<{ file: string; data: Document }>; recordedEvidence: RecordedEvidence };
type LedgerLine = Record<string, unknown> & { itemId: string };
type Generator = {
  RECORDED_EVIDENCE_FILE: string;
  readProviderDocuments: (directory?: string) => Input;
  resolveProviderConfiguration: (input: { schema: unknown; documents: Array<{ file: string; data: unknown }>; recordedEvidence: unknown }) => {
    providers: Array<{ providerId: string; routes: Array<{ profile: { route: string } }> }>;
    recordedEvidence: { liveTestItems: RecordedItem[]; frozenRequestBaselines: RecordedBaseline[] };
  };
  renderProviderConfiguration: (resolved: unknown) => Record<string, string>;
  generateProviderConfiguration: (options?: { root?: string; check?: boolean }) => string[];
  compareRecordedEvidenceWithLedger: (recordedEvidence: RecordedEvidence, lines: LedgerLine[], env?: Record<string, string | undefined>) => string[];
};

// @ts-expect-error tools/*.mjs carry no declarations; the generator is exercised as the plain module it is.
const generator = (await import('../../tools/generate-provider-configuration.mjs')) as unknown as Generator;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GENERATOR_PATH = join(ROOT, 'tools', 'generate-provider-configuration.mjs');

function freshInput(): Input {
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
      // The evidence records themselves are schema-checked (the object form of `additionalProperties`).
      ['schema', (input) => { (documentOf(input, 'minimax').evidence as any)['minimax-platform-docs'].readOn = 'yesterday'; }],
      ['schema', (input) => { (documentOf(input, 'minimax').evidence as any)['minimax-platform-docs'].source = ''; }],
      ['schema', (input) => { (documentOf(input, 'minimax').evidence as any)['minimax-platform-docs'].source = 42; }],
      ['schema', (input) => { (documentOf(input, 'opencode-go').evidence as any)['first-live-run'].itemIds = 'S40/first-baseline/1'; }],
      ['schema', (input) => { (documentOf(input, 'opencode-go').evidence as any)['first-live-run'].observedOn = 'some day'; }],
      ['schema', (input) => { (documentOf(input, 'minimax').evidence as any)['minimax-platform-docs'].kind = 'vendor-docs'; }],
      ['schema', (input) => { (documentOf(input, 'minimax').evidence as any)['minimax-platform-docs'].note = ''; }],
      ['evidence-day', (input) => { (documentOf(input, 'minimax').evidence as any)['minimax-platform-docs'].readOn = '2026-02-30'; }],
      // Endpoint hosts: no local, internal, literal or dotless address, on a new route or a bound one.
      ...['https://localhost/v1/chat/completions', 'https://127.0.0.1/v1', 'https://169.254.169.254/latest', 'https://intranet/x',
        'https://../x', 'https://-/x', 'https://api.minimax.cn:8443/v1', 'https://user@api.minimax.cn/v1', 'https://api.minimax.cn/v1?x=1']
        .map((endpoint): [string, (input: ReturnType<typeof freshInput>) => void] => ['schema', (input) => { route(documentOf(input, 'minimax')).endpoint = endpoint; }]),
      ['schema', (input) => { route(documentOf(input, 'opencode-go')).endpoint = 'https://10.0.0.1/v1/chat/completions'; }],
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.localhost/v1/chat/completions'; }],
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://gateway.local/v1/chat/completions'; }],
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://minimax.internal/v1/chat/completions'; }],
      ['anthropic-version', (input) => { (documentOf(input, 'anthropic-claude').credential as any).anthropicVersion = '2023-13-45'; }],
      // Evidence no page can supply is admitted only where the Provider Test Ledger holds it.
      ['live-item-unrecorded', (input) => {
        (documentOf(input, 'minimax').evidence as any)['invented'] = { kind: 'live-test-item', itemIds: ['NOPE/1'], observedOn: '2026-10-09' };
        route(documentOf(input, 'minimax')).models[0].capabilities = { answerChannel: { value: 'message-content-string', evidence: 'invented' } };
      }],
      ['live-item-unrecorded', (input) => { (documentOf(input, 'opencode-go').evidence as any)['first-live-run'].itemIds = ['S40/first-baseline/9']; }],
      ['live-item-unrecorded', (input) => {
        (documentOf(input, 'minimax').evidence as any)['borrowed'] = { kind: 'live-test-item', itemIds: ['S40/first-baseline/1'], observedOn: '2026-09-07' };
        route(documentOf(input, 'minimax')).models[0].capabilities = { answerChannel: { value: 'message-content-string', evidence: 'borrowed' } };
      }],
      ['baseline-unrecorded', (input) => { (documentOf(input, 'deepseek-open-platform').evidence as any)['production-baseline'].since = 'adapter revision 2'; }],
      ['baseline-unrecorded', (input) => {
        (documentOf(input, 'minimax').evidence as any)['baseline'] = { kind: 'frozen-request-baseline', since: 'adapter revision 1' };
        route(documentOf(input, 'minimax')).models[0].capabilities = { answerChannel: { value: 'message-content-string', evidence: 'baseline' } };
      }],
      // DeepSeek's thinking parameters, the DSH attribution headers and the OpenCode session header stay where they belong.
      ['deepseek-thinking', (input) => { route(documentOf(input, 'minimax')).models[0].capabilities = { reasoningControl: { value: 'deepseek-thinking', evidence: 'minimax-platform-docs' } }; }],
      ['dsh-attribution', (input) => { Object.assign(route(documentOf(input, 'minimax')), { dshAttribution: true, dshAttributionEvidence: 'minimax-platform-docs' }); }],
      ['dsh-attribution', (input) => {
        (documentOf(input, 'deepseek-open-platform').evidence as any)['unverified'] = { kind: 'unverified' };
        route(documentOf(input, 'deepseek-open-platform')).dshAttributionEvidence = 'unverified';
      }],
      ['session-header', (input) => { Object.assign(route(documentOf(input, 'minimax')), { sessionHeader: true, sessionHeaderEvidence: 'minimax-platform-docs' }); }],
      ['session-header', (input) => { Object.assign(route(documentOf(input, 'opencode-zen')), { sessionHeader: true, sessionHeaderEvidence: 'unverified' }); }],
      // Zen's own reading says its page names no session header: the rule admits OpenCode Go alone (Issue #715).
      ['session-header', (input) => { Object.assign(route(documentOf(input, 'opencode-zen')), { sessionHeader: true, sessionHeaderEvidence: 'zen-page' }); }],
      ['session-header', (input) => { Object.assign(route(documentOf(input, 'opencode-zen'), 1), { sessionHeader: true, sessionHeaderEvidence: 'zen-page' }); }],
      // The names RFC 2606 and RFC 6761 reserve never resolve on the public Internet (Issue #715).
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.test/v1/chat/completions'; }],
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.example/v1/chat/completions'; }],
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.invalid/v1/chat/completions'; }],
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://gateway.lan/v1'; }],
      ['endpoint-host', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://in-addr.arpa/v1'; }],
      // The endpoint literal is the URL that is requested: a `.` or `..` segment is not (Issue #715).
      ['endpoint-path', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.cn/../v1/chat/completions'; }],
      ['endpoint-path', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.cn/./v1/chat/completions'; }],
      ['endpoint-path', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.cn/v1/../v1/chat/completions'; }],
      ['endpoint-path', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.cn/v1/chat/completions/..'; }],
      ['endpoint-path', (input) => { route(documentOf(input, 'minimax')).endpoint = 'https://api.minimax.cn'; }],
      // A ledger-backed record is cited only from the row it was observed on (Issue #715): the four borrowings the
      // #712 re-review probed, a route-wide fact from another path, and a model inheriting a baseline that never pinned it.
      ['evidence-row', (input) => {
        route(documentOf(input, 'deepseek-open-platform')).models[1].capabilities = {
          requestShape: { value: 'openai-chat-completions', evidence: 'models-and-pricing' },
          reasoningControl: { value: 'deepseek-thinking', evidence: 'production-baseline' },
        };
      }],
      ['evidence-row', (input) => {
        route(documentOf(input, 'deepseek-open-platform')).models[1].capabilities = {
          requestShape: { value: 'openai-chat-completions', evidence: 'models-and-pricing' },
          answerChannel: { value: 'message-content-string', evidence: 'production-baseline' },
        };
      }],
      ['evidence-row', (input) => {
        route(documentOf(input, 'opencode-go')).models[1].capabilities = {
          requestShape: { value: 'openai-chat-completions', evidence: 'adr-0067-go-docs' },
          answerChannel: { value: 'message-content-string', evidence: 'first-live-run' },
        };
      }],
      ['evidence-row', (input) => { route(documentOf(input, 'opencode-go'), 1).models[0].capabilities = { answerChannel: { value: 'content-text-blocks', evidence: 'first-live-run' } }; }],
      ['evidence-row', (input) => { route(documentOf(input, 'opencode-go'), 1).requestShapeEvidence = 'first-live-run'; }],
      ['evidence-row', (input) => { route(documentOf(input, 'opencode-go'), 2).limitPolicyEvidence = 'json-object-live-item'; }],
      ['evidence-row', (input) => {
        (documentOf(input, 'deepseek-open-platform').evidence as any)['unverified'] = { kind: 'unverified' };
        route(documentOf(input, 'deepseek-open-platform')).models.push({ modelId: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', context: { tokens: null, evidence: 'unverified' } });
      }],
      ['evidence-row', (input) => { input.recordedEvidence.data.frozenRequestBaselines[0]!.models = ['deepseek-flash']; }],
      // The item's day is the ledger's, not the document's.
      ['live-item-day', (input) => { (documentOf(input, 'opencode-go').evidence as any)['first-live-run'].observedOn = '2026-09-08'; }],
      ['live-item-day', (input) => { input.recordedEvidence.data.liveTestItems[8]!.observedOn = '2026-09-07'; }],
      // The record itself: schema-validated, no duplicate, calendar days, and only rows the documents declare.
      ['recorded-evidence-schema', (input) => { input.recordedEvidence.data.liveTestItems[0]!.itemId = 'S40 first baseline 1'; }],
      ['recorded-evidence-schema', (input) => { delete (input.recordedEvidence.data.liveTestItems[0] as Record<string, unknown>).route; }],
      ['recorded-evidence-schema', (input) => { input.recordedEvidence.data.liveTestItems[0]!.issue = '307'; }],
      ['recorded-evidence-schema', (input) => { input.recordedEvidence.data.liveTestItems[0]!.observedOn = 'yesterday'; }],
      ['recorded-evidence-schema', (input) => { input.recordedEvidence.data.liveTestItems[0]!.extra = true; }],
      ['recorded-evidence-schema', (input) => { input.recordedEvidence.data.frozenRequestBaselines[0]!.models = []; }],
      ['recorded-evidence-schema', (input) => { input.recordedEvidence.data.frozenRequestBaselines[0]!.since = ' adapter revision 1'; }],
      ['recorded-evidence-schema', (input) => { input.recordedEvidence.data.schemaVersion = 2; }],
      ['recorded-evidence-schema', (input) => { (input.recordedEvidence.data as any).ledgerPath = 'C:/somewhere/ledger.jsonl'; }],
      ['recorded-evidence-duplicate', (input) => { const items = input.recordedEvidence.data.liveTestItems; items.push({ ...items[0]! }); }],
      ['recorded-evidence-duplicate', (input) => { const baselines = input.recordedEvidence.data.frozenRequestBaselines; baselines.push({ ...baselines[0]! }); }],
      ['evidence-day', (input) => { input.recordedEvidence.data.liveTestItems[0]!.observedOn = '2026-02-30'; (documentOf(input, 'opencode-go').evidence as any)['first-live-run'].observedOn = '2026-02-30'; }],
      ['recorded-evidence-row-unknown', (input) => { input.recordedEvidence.data.liveTestItems.push({ itemId: 'S99/nobody/1', route: 'opencode-go', model: 'nobody-model', observedOn: '2026-10-09', issue: '#715' }); }],
      ['recorded-evidence-row-unknown', (input) => { input.recordedEvidence.data.liveTestItems.push({ itemId: 'S99/nobody/1', route: 'bytedance-doubao', model: 'doubao-seed', observedOn: '2026-10-09', issue: '#715' }); }],
      ['recorded-evidence-row-unknown', (input) => { input.recordedEvidence.data.frozenRequestBaselines.push({ since: 'adapter revision 2', route: 'opencode-zen', models: ['nobody-model'], issue: '#715' }); }],
      ['baseline-unrecorded', (input) => { input.recordedEvidence.data.frozenRequestBaselines[0]!.route = 'opencode-zen'; }],
      ['live-item-unrecorded', (input) => { input.recordedEvidence.data.liveTestItems[0]!.route = 'opencode-zen'; }],
      ['evidence-unknown', (input) => { route(documentOf(input, 'minimax')).limitPolicyEvidence = 'nobody-read-this'; }],
      ['schema', (input) => { delete route(documentOf(input, 'minimax')).sessionHeaderEvidence; }],
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

describe('recorded evidence and the Provider Test Ledger (Issue #715, ADR 0067)', () => {
  const NINE_ITEMS = [
    'S40/first-baseline/1', 'S40/first-baseline/2', 'S40/first-baseline/3', 'S40/first-baseline/4',
    'S40/first-baseline/5', 'S40/first-baseline/6', 'S40/first-baseline/7', 'S40/first-baseline/8',
    'S40/reanalyze-range/1',
  ];
  /** A synthetic ledger line in the shape `ProviderLedgerLine` writes; the digests are placeholders, never a response. */
  const ledgerLine = (itemId: string, model: string, recordedAt: string, extra: Record<string, unknown> = {}): LedgerLine => ({
    itemId, purpose: 'synthetic', model, promptContractDigest: '0'.repeat(64), requestDigest: '1'.repeat(64),
    outcome: 'transmitted', status: 200, usage: { inputTokens: 1, outputTokens: 1 }, recordedAt, ...extra,
  });
  /** Lines that agree with the checked-in record, one per item, at a different hour each. */
  const agreeingLines = (): LedgerLine[] => freshInput().recordedEvidence.data.liveTestItems
    .map((item, index) => ledgerLine(item.itemId, item.model, `${item.observedOn}T${String(index).padStart(2, '0')}:30:00.000Z`));
  /** The host environment without any CI marker: what a developer host looks like to the comparison. */
  const developerEnv = (): Record<string, string | undefined> => {
    const env: Record<string, string | undefined> = { ...process.env };
    for (const name of ['CI', 'GITHUB_ACTIONS', 'AI7_E2E_JOURNEY']) delete env[name];
    return env;
  };

  it('records the nine live items and the one baseline on declared rows, and every generated profile cites them from its own row only', () => {
    const { recordedEvidence } = freshInput();
    expect(recordedEvidence.data.liveTestItems.map((item) => item.itemId)).toEqual(NINE_ITEMS);
    for (const item of recordedEvidence.data.liveTestItems) {
      expect(item.route, item.itemId).toBe('opencode-go');
      expect(item.model, item.itemId).toBe('deepseek-v4-flash');
      expect(item.observedOn, item.itemId).toBe(item.itemId === 'S40/reanalyze-range/1' ? '2026-09-08' : '2026-09-07');
    }
    expect(recordedEvidence.data.frozenRequestBaselines).toEqual([{ since: 'adapter revision 1', route: 'deepseek-open-platform', models: ['deepseek-v4-pro'], issue: '#310' }]);
    const resolved = generator.resolveProviderConfiguration(freshInput());
    expect(resolved.recordedEvidence.liveTestItems.map((item) => item.itemId)).toEqual(NINE_ITEMS);
    // In the generated profiles, an item or a baseline appears as evidence only on the row the record names for it.
    const itemRow = new Map(recordedEvidence.data.liveTestItems.map((item) => [item.itemId, `${item.route}/${item.model}`]));
    const baselineRows = new Map(recordedEvidence.data.frozenRequestBaselines.map((baseline) => [baseline.since, baseline.models.map((model) => `${baseline.route}/${model}`)]));
    let ledgerBacked = 0;
    for (const profile of GENERATED_MODEL_PROFILES) {
      for (const [capability, record] of Object.entries(profile.evidence) as Array<[string, { kind: string; itemIds?: string[]; since?: string }]>) {
        if (record.kind === 'live-test-item') {
          ledgerBacked += 1;
          for (const itemId of record.itemIds!) expect(itemRow.get(itemId), `${profile.key} ${capability} ${itemId}`).toBe(profile.key);
        }
        if (record.kind === 'frozen-request-baseline') {
          ledgerBacked += 1;
          expect(baselineRows.get(record.since!), `${profile.key} ${capability}`).toContain(profile.key);
        }
      }
    }
    // The developer-live model's four ledger-backed capabilities; the production model's two and its inherited shape.
    expect(ledgerBacked).toBe(7);
    expect(Object.values(GENERATED_ROUTE_PROFILES).filter((profile) => profile.credentialHeaderEvidence.kind === 'frozen-request-baseline').map((profile) => profile.route)).toEqual(['deepseek-open-platform']);
    // The support page renders the record, and the generated TypeScript does not: nothing the product runs reads it.
    const support = readFileSync(`${ROOT}docs/development/provider-support.md`, 'utf8');
    expect(support).toContain('## Recorded evidence');
    expect(support).toContain('| `S40/reanalyze-range/1` | `opencode-go` | `deepseek-v4-flash` | 2026-09-08 | #306 |');
    expect(support).toContain('| adapter revision 1 | `deepseek-open-platform` | `deepseek-v4-pro` | #310 |');
    expect(support).toContain('--ledger <cache root>');
    expect(readFileSync(`${ROOT}src/service/provider/provider-profiles.generated.ts`, 'utf8')).not.toContain(generator.RECORDED_EVIDENCE_FILE);
    // Everything that reads `config/providers/*.json` reads a provider document (J-12's `configuredUnboundProviderNames`
    // among them), so the record and its schema live in their own subdirectory and every `.json` directly under the
    // providers directory is a document or the document schema.
    const providersDirectory = join(ROOT, 'config', 'providers');
    for (const file of readdirSync(providersDirectory).filter((name) => name.endsWith('.json') && !name.endsWith('.schema.json'))) {
      const document = JSON.parse(readFileSync(join(providersDirectory, file), 'utf8')) as { providerId?: string; displayName?: string; routes?: unknown[] };
      expect(typeof document.providerId, file).toBe('string');
      expect(typeof document.displayName, file).toBe('string');
      expect(Array.isArray(document.routes), file).toBe(true);
    }
    expect(readdirSync(join(providersDirectory, 'recorded-evidence')).sort()).toEqual(['recorded-evidence.json', 'recorded-evidence.v1.schema.json']);
    // A recorded item nobody cites yet is a fact about the ledger, not a document error, as long as its row is declared.
    expect(refusalAfter((input) => { input.recordedEvidence.data.liveTestItems.push({ itemId: 'S99/spare/1', route: 'opencode-go', model: 'glm-5.3', observedOn: '2026-10-09', issue: '#715' }); })).toBeNull();
  });

  it('compares the record with the ledger on a developer host: agreement is empty, every difference is one sentence', () => {
    const { recordedEvidence } = freshInput();
    const compare = (lines: LedgerLine[]) => generator.compareRecordedEvidenceWithLedger(recordedEvidence, lines, developerEnv());
    expect(compare(agreeingLines())).toEqual([]);
    // Replayed, failed and stale lines, and the platform-tool lines, are not transmissions the record mirrors.
    expect(compare([
      ...agreeingLines(),
      ledgerLine('S40/first-baseline/1', 'deepseek-v4-flash', '2026-09-09T00:00:00.000Z', { outcome: 'replayed' }),
      ledgerLine('S41/failed/1', 'deepseek-v4-flash', '2026-09-09T00:00:00.000Z', { outcome: 'failed', status: 500 }),
      ledgerLine('S41/stale/1', 'deepseek-v4-flash', '2026-09-09T00:00:00.000Z', { stale: true }),
      { itemId: 'S87/search/1', kind: 'websearch', outcome: 'transmitted', recordedAt: '2026-10-08T00:00:00.000Z' },
    ])).toEqual([]);
    expect(compare(agreeingLines().slice(1))).toEqual(['S40/first-baseline/1 is recorded but the ledger holds no transmitted line for it']);
    expect(compare([...agreeingLines().slice(0, 8), ledgerLine('S40/reanalyze-range/1', 'deepseek-v4-pro', '2026-09-08T10:00:00.000Z')]))
      .toEqual(['S40/reanalyze-range/1 is recorded for deepseek-v4-flash but the ledger transmitted it to deepseek-v4-pro']);
    // The day is the UTC day of `recordedAt`: 2026-09-08 01:00 in UTC+8 is still 2026-09-07 to the ledger.
    expect(compare([...agreeingLines().slice(0, 8), ledgerLine('S40/reanalyze-range/1', 'deepseek-v4-flash', '2026-09-07T17:00:00.000Z')]))
      .toEqual(['S40/reanalyze-range/1 is recorded as observed on 2026-09-08 but the ledger recorded it on 2026-09-07']);
    expect(compare([...agreeingLines().slice(0, 8), ledgerLine('S40/reanalyze-range/1', 'deepseek-v4-flash', '2026-09-08T01:00:00+08:00')]))
      .toEqual(['S40/reanalyze-range/1 is recorded as observed on 2026-09-08 but the ledger recorded it on 2026-09-07']);
    expect(compare([...agreeingLines().slice(0, 8), ledgerLine('S40/reanalyze-range/1', 'deepseek-v4-flash', 'not a time')]))
      .toEqual(['S40/reanalyze-range/1 is recorded as observed on 2026-09-08 but the ledger recorded it on no day']);
    expect(compare([...agreeingLines(), ledgerLine('S99/unrecorded/1', 'glm-5.3', '2026-10-09T00:00:00.000Z')])).toEqual(['S99/unrecorded/1 was transmitted but is not recorded']);
    // Where CI is present there is no ledger and must never need to be one.
    for (const marker of ['CI', 'GITHUB_ACTIONS', 'AI7_E2E_JOURNEY']) {
      expect(() => generator.compareRecordedEvidenceWithLedger(recordedEvidence, agreeingLines(), { ...developerEnv(), [marker]: '1' }), marker).toThrowError('PROVIDER_CONFIGURATION/ledger-on-ci');
    }
    // A record that breaks its own rules is refused before any line is read.
    const broken = structuredClone(recordedEvidence);
    broken.data.liveTestItems.push({ ...broken.data.liveTestItems[0]! });
    expect(() => generator.compareRecordedEvidenceWithLedger(broken, agreeingLines(), developerEnv())).toThrowError('PROVIDER_CONFIGURATION/recorded-evidence-duplicate');
  });

  it('--ledger reads the ledger through the fixture tooling at an absolute cache root, on a developer host only', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'ai7-provider-ledger-'));
    const run = (args: string[], env: Record<string, string | undefined>) => {
      const result = spawnSync(process.execPath, [GENERATOR_PATH, ...args], { cwd: scratch, env, encoding: 'utf8' });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    };
    try {
      const write = (lines: LedgerLine[]) => writeFileSync(join(scratch, 'ledger.jsonl'), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
      write(agreeingLines());
      expect(run(['--ledger', scratch], developerEnv())).toEqual({ status: 0, stdout: 'PROVIDER_CONFIGURATION/ledger-agrees: 9 items\n', stderr: '' });
      write([...agreeingLines().slice(0, 8), ledgerLine('S40/reanalyze-range/1', 'deepseek-v4-pro', '2026-09-08T10:00:00.000Z'), ledgerLine('S99/unrecorded/1', 'glm-5.3', '2026-10-09T00:00:00.000Z')]);
      const differing = run(['--ledger', scratch], developerEnv());
      expect(differing.status).toBe(1);
      expect(differing.stdout).toBe('');
      expect(differing.stderr).toBe([
        'PROVIDER_CONFIGURATION/ledger-differs: S40/reanalyze-range/1 is recorded for deepseek-v4-flash but the ledger transmitted it to deepseek-v4-pro',
        'PROVIDER_CONFIGURATION/ledger-differs: S99/unrecorded/1 was transmitted but is not recorded',
        '',
      ].join('\n'));
      expect(run(['--ledger', 'relative/cache'], developerEnv())).toMatchObject({ status: 1, stderr: expect.stringContaining('PROVIDER_CONFIGURATION/ledger-root') });
      expect(run(['--ledger'], developerEnv())).toMatchObject({ status: 1, stderr: expect.stringContaining('PROVIDER_CONFIGURATION/ledger-root') });
      expect(run(['--ledger', scratch], { ...developerEnv(), CI: 'true' })).toMatchObject({ status: 1, stderr: expect.stringContaining('PROVIDER_CONFIGURATION/ledger-on-ci') });
      rmSync(join(scratch, 'ledger.jsonl'));
      expect(run(['--ledger', scratch], developerEnv())).toMatchObject({ status: 1, stderr: expect.stringContaining('FIXTURE_GEN/ledger-unreadable') });
      // `--ledger` neither generates nor checks: the scratch directory holds no generated file afterwards.
      expect(existsSync(join(scratch, 'docs'))).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe('the generated configuration (ADR 0073 §3, §4)', () => {
  it('declares the closed unions from the documents: every route profiled, labelled and on a configured slot', () => {
    expect(Object.keys(GENERATED_ROUTE_PROFILES)).toEqual([...CONFIGURED_ROUTE_IDS]);
    expect(Object.keys(CONFIGURED_PROVIDER_LABELS)).toEqual([...CONFIGURED_ROUTE_IDS]);
    expect(Object.keys(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)).toEqual([...CONFIGURED_DEVELOPMENT_SLOTS]);
    expect(new Set(Object.values(CONFIGURED_DEVELOPMENT_CREDENTIAL_REFERENCES)).size).toBe(CONFIGURED_DEVELOPMENT_SLOTS.length);
    // Every development slot is a configured slot; the production connection's slot has no development reference.
    expect(CONFIGURED_CREDENTIAL_SLOTS.filter((slot) => !(CONFIGURED_DEVELOPMENT_SLOTS as readonly string[]).includes(slot))).toEqual(['deepseek-api-key']);
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
    // The developer-live binding the policy pins and the route the document declares are one binding: an endpoint, slot
    // or model edit to `opencode-go.json` that the policy does not also say fails here (the adapter sends to the
    // document's endpoint; the frozen plan and the network allowance use the policy's).
    expect(OPENCODE_GO_ROUTE_PROFILE.route).toBe(DEVELOPER_LIVE_POLICY_BINDING.route);
    expect(OPENCODE_GO_ROUTE_PROFILE.endpoint).toBe(DEVELOPER_LIVE_POLICY_BINDING.endpoint);
    expect(OPENCODE_GO_ROUTE_PROFILE.credentialSlot).toBe(DEVELOPER_LIVE_POLICY_BINDING.credentialSlot);
    expect(modelProfileFor(DEVELOPER_LIVE_POLICY_BINDING.route, DEVELOPER_LIVE_POLICY_BINDING.model)).toBe(OPENCODE_GO_V4_FLASH_PROFILE);
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
      attribution: () => attributionHeaders(),
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
    // The exact header set each route that predates the documents transmits — any header a new form adds, on any of
    // the four, fails here. The production route alone carries the DSH attribution headers; the Go paths the session pair.
    const attribution = Object.keys(attributionHeaders());
    expect(attribution.length).toBeGreaterThan(0);
    const exact: Array<[RemoteExecutionRoute, string, string[]]> = [
      [DEEPSEEK_ROUTE, 'deepseek-v4-pro', ['accept', 'authorization', 'content-type', ...attribution]],
      [OPENCODE_GO_ROUTE, 'deepseek-v4-flash', ['accept', 'authorization', 'content-type', 'user-agent', 'x-opencode-session']],
      ['opencode-go-messages', 'qwen3.7-plus', ['accept', 'authorization', 'content-type', 'user-agent', 'x-opencode-session']],
      ['opencode-go-responses', 'grok-4.6', ['accept', 'authorization', 'content-type', 'user-agent', 'x-opencode-session']],
    ];
    for (const [routeId, modelId, keys] of exact) {
      const call = await transmitOnce(routeId, modelId);
      expect(Object.keys(call.headers).sort(), routeId).toEqual([...keys].sort());
      expect(call.headers.authorization, routeId).toBe(`Bearer ${SECRET}`);
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
