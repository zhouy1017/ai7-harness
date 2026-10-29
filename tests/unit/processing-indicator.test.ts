import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { composeGlobalAttention, readGlobalAttention, type GlobalAttentionReadings } from '../../src/service/global-attention.js';
import { processingIndicatorLabel } from '../../src/renderer/processing-indicator.js';
import type { GlobalAgentDialogueProjection } from '../../src/shared/protocol.js';

// The context header's live processing indicator (ADR 0096 §3; Issue #1177): derived from the execution state, sending wins
// over a Connectivity Wait, which wins over local. Synthetic readings only.

const NOW = new Date('2026-10-29T12:00:00.000Z');
const NONE: GlobalAttentionReadings = {
  imports: [], recoveries: [], conflicts: [], analysisTasks: [], analysisOutcomes: [], reviewRuns: [], reviewCompletions: [],
  maintenance: [], libraryMaterials: [], learningMaterials: [], busy: false, waitingFor: 'admitting',
};
const waitingForNetwork: Partial<GlobalAttentionReadings> = {
  waitingFor: 'network',
  analysisTasks: [{ bookId: randomUUID(), bookTitle: '等网之书', taskIntentId: randomUUID(), mode: 'first-baseline', createdAt: NOW.toISOString(),
    planRevision: null, run: { runRecordId: randomUUID(), state: 'awaiting-connectivity', stateAt: NOW.toISOString(), recordedAt: NOW.toISOString(), progress: null } }],
};
const answering = (route: string): GlobalAgentDialogueProjection => ({ dialogueId: randomUUID(), bookId: null, question: '合成问题', sources: [],
  askedAt: NOW.toISOString(), actions: { stop: true, continue: false, regenerate: false }, provider: { route, model: 'm', policyRuleId: 'r' },
  attempts: [{ attemptId: randomUUID(), ordinal: 1, kind: 'ask', state: 'answering', fragments: [], fragmentsFrom: 0, fragmentTotal: 0,
    source: 'live', causeCode: null, startedAt: NOW.toISOString(), settledAt: null, convertedMarkIds: [] }] });
const compose = (partial: Partial<GlobalAttentionReadings>) => composeGlobalAttention({ ...NONE, ...partial }, NOW).processing;

describe('the live processing indicator', () => {
  it('reads 本地处理 when nothing is in flight, and 等待网络 during a Connectivity Wait for the network', () => {
    expect(compose({})).toEqual({ state: 'local' });
    expect(processingIndicatorLabel(compose({}))).toBe('本地处理');
    expect(compose(waitingForNetwork)).toEqual({ state: 'waiting-network' });
    expect(processingIndicatorLabel(compose(waitingForNetwork))).toBe('等待网络');
  });

  it('names the channel of an answering dialogue, ahead of a Connectivity Wait, and never a route that is no model service', () => {
    const sending = compose({ ...waitingForNetwork, globalDialogues: [answering('opencode-go')] });
    expect(sending).toEqual({ state: 'sending', channels: ['opencode-go'] });
    expect(processingIndicatorLabel(sending)).toBe('正在发送至OpenCode Go');
    expect(compose({ globalDialogues: [answering('ai7-local-deterministic')] })).toEqual({ state: 'local' });
  });

  it('adds the execution owner\'s requests in the transport, once each in 设置 › 模型服务 order', async () => {
    const store = { waitingTaskRuns: () => [], inspectGlobalAttention: () => composeGlobalAttention({ ...NONE, globalDialogues: [answering('opencode-go')] }, NOW) };
    const read = await readGlobalAttention(store, () => null, false, async () => 'admitting', ['deepseek-open-platform', 'opencode-go']);
    expect(read.processing).toEqual({ state: 'sending', channels: ['opencode-go', 'deepseek-open-platform'] });
    expect(processingIndicatorLabel(read.processing)).toBe('正在发送至OpenCode Go、DeepSeek 开放平台（官方）');
    const idle = await readGlobalAttention({ ...store, inspectGlobalAttention: () => composeGlobalAttention(NONE, NOW) }, () => null, false, async () => 'admitting', []);
    expect(idle.processing).toEqual({ state: 'local' });
  });
});
