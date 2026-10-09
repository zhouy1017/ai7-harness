import { describe, expect, it } from 'vitest';
import { OPENCODE_GO_ROUTE } from '../../src/service/provider/egress-gate.js';
import {
  DEEPSEEK_V4_PRO_PROFILE,
  OPENCODE_GO_V4_FLASH_PROFILE,
  PROVIDER_MODEL_PROFILES,
  modelProfileFor,
} from '../../src/service/provider/model-profile.js';
import { GENERATED_MODEL_PROFILES } from '../../src/service/provider/provider-profiles.generated.js';

// ADR 0080 §2/§7.8 step 1: the profile set gains `toolCalling` and `webSearchTool`, each with
// evidence, on every declared profile. This slice is inert — nothing consumes the fields yet — so
// these tests pin only what ADR 0080 §3 establishes, never what a binding does with it.

describe('model capability profiles: toolCalling and webSearchTool (ADR 0080 §2, §3)', () => {
  it('declares DeepSeek official able to call functions, and its pages silent on a search tool of its own', () => {
    expect(DEEPSEEK_V4_PRO_PROFILE.capabilities.toolCalling).toBe('function');
    expect(DEEPSEEK_V4_PRO_PROFILE.evidence.toolCalling).toEqual({
      kind: 'vendor-documentation',
      source: 'DeepSeek official Tool Calls guide, api-docs.deepseek.com/guides/tool_calls',
      readOn: '2026-09-11',
    });
    expect(DEEPSEEK_V4_PRO_PROFILE.capabilities.webSearchTool).toBe('none');
    expect(DEEPSEEK_V4_PRO_PROFILE.evidence.webSearchTool).toMatchObject({
      kind: 'vendor-documentation',
      readOn: '2026-09-10',
    });
  });

  it('declares the developer-live gateway model unable to call functions until an item establishes it, and carrying no search tool', () => {
    // ADR 0080 §2: the Owner's own session observed a client tool call through this gateway, but an
    // informal observation is not yet a recorded live-test item, so this stays `none`.
    expect(OPENCODE_GO_V4_FLASH_PROFILE.capabilities.toolCalling).toBe('none');
    expect(OPENCODE_GO_V4_FLASH_PROFILE.evidence.toolCalling).toEqual({ kind: 'unverified' });
    expect(OPENCODE_GO_V4_FLASH_PROFILE.capabilities.webSearchTool).toBe('none');
    expect(OPENCODE_GO_V4_FLASH_PROFILE.evidence.webSearchTool).toMatchObject({
      kind: 'vendor-documentation',
      readOn: '2026-09-11',
    });
  });

  it('declares an inert non-DeepSeek profile the same way as every other undemonstrated model on the gateway', () => {
    const glm = modelProfileFor(OPENCODE_GO_ROUTE, 'glm-5.3');
    expect(glm).not.toBeNull();
    expect(glm!.capabilities.toolCalling).toBe('none');
    expect(glm!.evidence.toolCalling).toEqual({ kind: 'unverified' });
    expect(glm!.capabilities.webSearchTool).toBe('none');
    expect(glm!.evidence.webSearchTool).toMatchObject({
      kind: 'vendor-documentation',
      readOn: '2026-09-11',
    });
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
    expect([...searching].sort()).toEqual([
      'anthropic-claude', 'baidu-qianfan', 'moonshot-kimi', 'openai-platform', 'tencent-hunyuan', 'xiaomi-mimo', 'zhipu-glm',
    ]);
  });
});
