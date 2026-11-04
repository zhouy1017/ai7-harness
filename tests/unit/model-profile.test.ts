import { describe, expect, it } from 'vitest';
import { OPENCODE_GO_ROUTE } from '../../src/service/provider/egress-gate.js';
import {
  DEEPSEEK_V4_PRO_PROFILE,
  OPENCODE_GO_V4_FLASH_PROFILE,
  OPENCODE_GO_V41_FLASH_PROFILE,
  PROVIDER_MODEL_PROFILES,
  modelProfileFor,
} from '../../src/service/provider/model-profile.js';
import { GENERATED_MODEL_PROFILES } from '../../src/service/provider/provider-profiles.generated.js';

// ADR 0080 §2/§7.8 step 1: the profile set gains `toolCalling` and `webSearchTool`, each with
// evidence, on every declared profile. This slice is inert — nothing consumes the fields yet — so
// these tests pin only what ADR 0080 §3 establishes, never what a binding does with it.

describe('model capability profiles: toolCalling and webSearchTool (ADR 0080 §2, §3)', () => {
  it('inherits text, stream and function tools for arbitrary IDs on each implemented route', () => {
    for (const route of ['deepseek-open-platform', 'opencode-go', 'opencode-zen', 'opencode-zen-messages', 'opencode-zen-responses', 'openai-platform', 'anthropic-claude', 'google-gemini'] as const) {
      const profile = modelProfileFor(route, 'account/new-model-2027')!;
      expect(profile.model).toBe('account/new-model-2027');
      expect(profile.capabilities.answerChannel).not.toBe('none');
      expect(profile.capabilities.toolCalling).toBe('function');
      expect(profile.capabilities.streaming).toMatch(/-sse$/u);
      expect(profile.context.tokens).toBeNull();
      expect(profile.capabilities.structuredOutput).toBe('none');
      expect(profile.evidence.toolCalling.kind).toBe('adapter-implementation');
    }
    expect(modelProfileFor('opencode-go', '')).toBeNull();
    expect(modelProfileFor('opencode-go', 'bad\nmodel')).toBeNull();
    expect(modelProfileFor('unknown' as never, 'model')).toBeNull();
  });

  it('fails if any profile omits either capability or its evidence', () => {
    for (const profile of Object.values(PROVIDER_MODEL_PROFILES)) {
      expect(profile.capabilities, profile.key).toHaveProperty('toolCalling');
      expect(profile.capabilities, profile.key).toHaveProperty('webSearchTool');
      expect(['none', 'function'], profile.key).toContain(profile.capabilities.toolCalling);
      expect(['none', 'provider-tool'], profile.key).toContain(profile.capabilities.webSearchTool);
      expect(profile.evidence.toolCalling, profile.key).toBeDefined();
      expect(profile.evidence.webSearchTool, profile.key).toBeDefined();
      expect(typeof profile.evidence.toolCalling.kind, profile.key).toBe('string');
      expect(typeof profile.evidence.webSearchTool.kind, profile.key).toBe('string');
    }
    // Every row the provider documents declare is checked, none dropped (Issue #435).
    expect(Object.keys(PROVIDER_MODEL_PROFILES)).toHaveLength(GENERATED_MODEL_PROFILES.length);
  });

  it('declares webSearchTool: provider-tool only where a vendor page documents a search tool on the shape the route speaks', () => {
    // ADR 0080 §2 names the provider tools; §3 records each reading. DeepSeek official, both OpenCode
    // gateways, Qwen (a request parameter, not a tool), MiniMax (no tool on chat completions) and Gemini
    // (documented on a shape this route does not speak) declare none.
    const searching = new Set<string>();
    for (const profile of Object.values(PROVIDER_MODEL_PROFILES)) {
      if (profile.capabilities.webSearchTool !== 'provider-tool') continue;
      searching.add(profile.route);
      expect(profile.evidence.webSearchTool, profile.key).toMatchObject({ kind: 'vendor-documentation' });
    }
    // Kimi's reading names two models, so the third carries no search tool: nothing is assumed from a neighbouring row.
    expect(PROVIDER_MODEL_PROFILES['moonshot-kimi/kimi-k3']!.capabilities.webSearchTool).toBe('provider-tool');
    expect(PROVIDER_MODEL_PROFILES['moonshot-kimi/kimi-k2.6']!.capabilities.webSearchTool).toBe('provider-tool');
    expect(PROVIDER_MODEL_PROFILES['moonshot-kimi/kimi-k2.7-code']!.capabilities.webSearchTool).toBe('none');
    expect(PROVIDER_MODEL_PROFILES['moonshot-kimi/kimi-k2.7-code']!.evidence.webSearchTool).toEqual({ kind: 'unverified' });
    expect([...searching].sort()).toEqual([
      'anthropic-claude', 'baidu-qianfan', 'moonshot-kimi', 'openai-platform', 'tencent-hunyuan', 'xiaomi-mimo', 'zhipu-glm',
    ]);
  });
});
