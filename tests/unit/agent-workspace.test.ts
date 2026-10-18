import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_WORKSPACE_CAPABILITIES, AGENT_WORKSPACE_COMPOSITION_OPTIONS, agentWorkspaceComposition } from '../../src/service/agent-workspace/capabilities.js';
import { readAgentWorkspaceAnswer } from '../../src/service/agent-workspace/change-set.js';
import {
  AGENT_WORKSPACE_FRAGMENT,
  AGENT_WORKSPACE_PROMPT_CONTRACT,
  AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST,
  AGENT_WORKSPACE_RESULT_SCHEMA,
  DIALOGUE_PROMPT_CONTRACT,
  DIALOGUE_PROMPT_CONTRACT_DIGEST,
  MAX_AGENT_WORKSPACE_ITEMS,
} from '../../src/service/dialogue/contract.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, OPENCODE_GO_MODEL, OPENCODE_GO_ROUTE } from '../../src/service/provider/egress-gate.js';

// The Agent 工作区's declaration and its answer reader (Issue #90, wave 13 slice 13a; ADR 0045 incl. Revision 2, ADR 0017,
// HARNESS-INTEGRATION §capability seam): the Reviewer's checklist object, the tool-free composition a workspace turn runs in,
// the frozen dialogue contract left unchanged, and the change-set reading — anchors inside the selection only.

const SELECTION = '作为器物的评价，可见此事非同寻常。作为器物的评价，再说一遍。';
const answer = (items: unknown[]): string => JSON.stringify({ schema: AGENT_WORKSPACE_RESULT_SCHEMA, items });
const item = (anchor: string, proposedText = '替换', rationale = '一行理由。'): Record<string, string> => ({ anchor, proposedText, rationale });

describe('the Agent 工作区 capability declaration', () => {
  it('declares no filesystem, shell, network or Apply and only the two Revision 2 current-Book scope kinds, frozen', () => {
    expect(AGENT_WORKSPACE_CAPABILITIES).toEqual({
      filesystem: false,
      shell: false,
      network: false,
      apply: false,
      scopes: ['current-book-primary-manuscript-revision', 'current-book-source-version'],
      safetyLabel: '未联网 · 无文件系统 · 无 shell · 不能应用修改',
    });
    expect(Object.isFrozen(AGENT_WORKSPACE_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(AGENT_WORKSPACE_CAPABILITIES.scopes)).toBe(true);
  });

  it('runs a workspace turn in a composition with an empty tool registry on every route', () => {
    expect(AGENT_WORKSPACE_COMPOSITION_OPTIONS).toEqual({ sessionLog: true });
    for (const [route, model] of [[LOCAL_DETERMINISTIC_ROUTE, LOCAL_DETERMINISTIC_MODEL], [OPENCODE_GO_ROUTE, OPENCODE_GO_MODEL]] as const) {
      const composition = agentWorkspaceComposition(route, model);
      expect(composition.tools.registeredTools).toBe(0);
      expect(composition.platformTools).toBeUndefined();
      expect(composition.localTools).toBeUndefined();
      expect(composition.researchDeclaration).toBeUndefined();
      expect(composition.subagents).toBe(false);
      expect(composition.agentLoop.configuredAgents).toBe(0);
      expect(composition.services).toHaveLength(6);
      expect(composition.promptContractDigest).toBe(AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST);
    }
  });

  it('adds the workspace fragment to the dialogue contract and leaves the frozen dialogue contract byte-identical', () => {
    // The dialogue contract's digest before Issue #90: every dialogue fixture key is a function of it.
    expect(DIALOGUE_PROMPT_CONTRACT_DIGEST).toBe('81cf644d1c52f63aa5db1e1a84c24e5256e96686fea0c8b69e4d1d71fe0d09ee');
    expect(AGENT_WORKSPACE_PROMPT_CONTRACT.systemPrompt).toBe(`${DIALOGUE_PROMPT_CONTRACT.systemPrompt}\n${AGENT_WORKSPACE_FRAGMENT}`);
    expect(AGENT_WORKSPACE_PROMPT_CONTRACT.messageHeader).toBe(DIALOGUE_PROMPT_CONTRACT.messageHeader);
    expect(AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST).not.toBe(DIALOGUE_PROMPT_CONTRACT_DIGEST);
    expect(AGENT_WORKSPACE_FRAGMENT).toContain(AGENT_WORKSPACE_RESULT_SCHEMA);
  });

  it('keeps the workspace modules free of filesystem, process and network modules, and of any Apply', () => {
    const root = new URL('../../src/service/agent-workspace/', import.meta.url);
    const sources = readdirSync(root).filter((name) => name.endsWith('.ts')).map((name) => readFileSync(new URL(name, root), 'utf8'));
    sources.push(readFileSync(new URL('../../src/renderer/agent-workspace.ts', import.meta.url), 'utf8'));
    expect(sources.length).toBeGreaterThanOrEqual(4);
    for (const source of sources) {
      // Type-only imports name shapes and load nothing.
      const imports = [...source.matchAll(/^import (?!type )[^;]*?from '([^']+)';/gmu)].map((match) => match[1]!);
      for (const specifier of imports) {
        expect(specifier).not.toMatch(/^(?:node:)?(?:fs|fs\/promises|child_process|net|tls|http|https|http2|dgram|dns|worker_threads|cluster)$/u);
        expect(specifier).not.toMatch(/manuscript-apply|provider\/|egress|keyring|credential/u);
      }
      expect(source).not.toMatch(/applyChangeSuggestion|approveManuscriptExport|fetch\(/u);
    }
    // The renderer reaches the service through these members only; none is named for an apply, effect, export, send, session
    // or a chat, conversation or stream.
    const renderer = sources.at(-1)!;
    const picked = /export type AgentWorkspaceApi = Pick<RendererApi,([^>]*)>/u.exec(renderer)![1]!;
    const members = [...picked.matchAll(/'([A-Za-z]+)'/gu)].map((match) => match[1]!);
    expect(members).toEqual(['inspectAgentWorkspace', 'proposeAgentWorkspaceChangeSet', 'promoteAgentWorkspaceProposals', 'discardAgentWorkspaceProposals',
      'getBookOverview', 'getManuscriptWindow']);
    for (const member of members) expect(member).not.toMatch(/apply|effect|export|send|session|chat|conversation|stream|dialog/iu);
  });
});

describe('a workspace answer read as a change set', () => {
  it('keeps anchors that stand exactly once inside the selection, with their grapheme range', () => {
    const reading = readAgentWorkspaceAnswer(answer([item('可见此事'), item('再说一遍', '再讲一次')]), SELECTION);
    expect(reading).toEqual({
      kind: 'read',
      candidates: [
        { ordinal: 1, anchor: '可见此事', proposedText: '替换', rationale: '一行理由。', fromGrapheme: 8, toGrapheme: 12 },
        { ordinal: 2, anchor: '再说一遍', proposedText: '再讲一次', rationale: '一行理由。', fromGrapheme: 25, toGrapheme: 29 },
      ],
      dropped: [],
    });
  });

  it('drops and says why: outside the range, twice in it, overlapping, unchanged, malformed, or past the bound', () => {
    const items = [
      item('不在这里的话'),
      item('作为器物的评价'),
      item('可见此事非同寻常'),
      item('此事', '这件事'),
      item('非同寻常', '非同寻常'),
      { anchor: '再说', proposedText: '又说' },
      item('再说一遍', '再讲', '两行\n理由'),
      item(''),
    ];
    const reading = readAgentWorkspaceAnswer(answer(items), SELECTION);
    expect(reading.kind).toBe('read');
    if (reading.kind !== 'read') return;
    expect(reading.candidates.map((candidate) => candidate.anchor)).toEqual(['可见此事非同寻常']);
    expect(reading.dropped).toEqual([
      { ordinal: 1, reason: '摘出的文字不在所选范围内' },
      { ordinal: 2, reason: '摘出的文字在所选范围内不止一处，无法确定位置' },
      { ordinal: 4, reason: '与前面的提议重叠' },
      { ordinal: 5, reason: '替换后的文字与原文相同' },
      { ordinal: 6, reason: '提议不是约定的格式' },
      { ordinal: 7, reason: '理由要是一行，最多 200 个字' },
      { ordinal: 8, reason: '提议没有摘出要替换的文字' },
    ]);
    const many = readAgentWorkspaceAnswer(answer(Array.from({ length: MAX_AGENT_WORKSPACE_ITEMS + 1 }, () => item('不在'))), SELECTION);
    expect(many.kind === 'read' && many.dropped.at(-1)).toEqual({ ordinal: MAX_AGENT_WORKSPACE_ITEMS + 1, reason: `超过 ${MAX_AGENT_WORKSPACE_ITEMS} 项的提议不予提供` });
  });

  it('withholds an answer outside the contract whole, and reads one fenced as a code block the same', () => {
    for (const text of ['这段可以改得更凝练。', JSON.stringify({ schema: 'other', items: [] }), JSON.stringify({ schema: AGENT_WORKSPACE_RESULT_SCHEMA, items: [], extra: 1 }), '[]']) {
      expect(readAgentWorkspaceAnswer(text, SELECTION)).toEqual({ kind: 'withheld', reason: '模型的回答不是约定格式的变更集' });
    }
    expect(readAgentWorkspaceAnswer(`\`\`\`json\n${answer([item('可见此事')])}\n\`\`\``, SELECTION).kind).toBe('read');
    expect(readAgentWorkspaceAnswer(answer([]), SELECTION)).toEqual({ kind: 'read', candidates: [], dropped: [] });
  });

  it('never cuts a grapheme: an anchor ending inside one is dropped', () => {
    const selection = '家👨‍👩‍👧人';
    const reading = readAgentWorkspaceAnswer(answer([item('家👨')]), selection);
    expect(reading).toEqual({ kind: 'read', candidates: [], dropped: [{ ordinal: 1, reason: '摘出的文字没有落在完整的字上' }] });
  });
});
