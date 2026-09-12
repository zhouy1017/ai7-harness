import { describe, expect, it } from 'vitest';
import { OPENCODE_GO_ROUTE } from '../../src/service/provider/egress-gate.js';
import {
  DEEPSEEK_V4_PRO_PROFILE,
  OPENCODE_GO_V4_FLASH_PROFILE,
  PROVIDER_MODEL_PROFILES,
  modelProfileFor,
} from '../../src/service/provider/model-profile.js';

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
    // The table's size is unchanged: this slice is inert and declares no new profile (ADR 0080 §7.8 step 1).
    expect(Object.keys(PROVIDER_MODEL_PROFILES)).toHaveLength(18);
  });

  it('declares no profile with webSearchTool: provider-tool, because this slice adds no such evidence', () => {
    // Every reading ADR 0080 §3 records for the routes this table declares (DeepSeek official,
    // OpenCode Go/Zen) finds no server-side search tool; a future provider document may change this,
    // never a declaration made without a vendor page behind it.
    for (const profile of Object.values(PROVIDER_MODEL_PROFILES)) {
      expect(profile.capabilities.webSearchTool, profile.key).toBe('none');
    }
  });
});
