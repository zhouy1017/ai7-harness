import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { OUTCOME_UNKNOWN_CARRIED, OUTCOME_UNKNOWN_NOT_RESENT, saysCarried, saysOutcomeUnknown } from '../../src/service/analysis/outcome-unknown.js';
import { unconfirmedOutcomeKey } from '../../src/service/analysis/baseline-analysis-store.js';
import { composeGlobalAttention, type GlobalAttentionReadings, type UnconfirmedAttentionReading } from '../../src/service/global-attention.js';
import { categoryResendDisclosure, resendDisclosure, withResend } from '../../src/service/task-plan.js';
import { decodeRequest, ProtocolError } from '../../src/service/request-frames.js';
import { globalAttentionObjectLabel, globalAttentionReason, GLOBAL_ATTENTION_NEXT_STEP_LABELS, GLOBAL_ATTENTION_STATE_LABELS } from '../../src/renderer/global-attention-labels.js';
import {
  TASK_BAR_VIEW_UNCONFIRMED,
  UNCONFIRMED_KEEP_AS_GAP,
  unconfirmedLine,
  unconfirmedStatement,
  unconfirmedWhat,
} from '../../src/renderer/task-drawer-labels.js';
import { MAX_FRAME_BYTES, type ServiceRequest, type TaskPlanProjection } from '../../src/shared/protocol.js';

// Unit suite for 结果待确认 a completed Run left (Issue #757; ATTN-002, NOTIF-004, CTRL-007, CONT-011): the words that mark a
// step's reason as 结果待确认's, the outcome keys a resolution names, the 待我处理 item, the plan's re-send disclosure, the
// drawer's and 待我处理's words, and the one request frame 保留为缺口 sends.

const NOW = new Date('2026-10-10T10:00:00.000Z');
const NONE: GlobalAttentionReadings = {
  imports: [], recoveries: [], conflicts: [], analysisTasks: [], analysisOutcomes: [], reviewRuns: [], reviewCompletions: [],
  maintenance: [], libraryMaterials: [], learningMaterials: [], busy: false, waitingFor: 'admitting',
};

function reading(overrides: Partial<UnconfirmedAttentionReading> = {}): UnconfirmedAttentionReading {
  return {
    bookId: randomUUID(), bookTitle: '归纳之书', surface: 'baseline-analysis', ref: null, ranges: 0, steps: ['cross-unit-reduction'],
    at: '2026-10-10T09:00:00.000Z', runRecordIds: [randomUUID()], ...overrides,
  };
}

function frame(request: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(request));
}

describe('结果待确认 words a Run writes and the ledger reads back', () => {
  it('marks a step\'s reason by its own closing clause, and a carried range by the carried one', () => {
    const said = `结果待确认：请求已发出，但回答没有完整传回，无法确认模型服务是否已处理并计费。（AI7_OUTCOME_UNKNOWN）；${OUTCOME_UNKNOWN_NOT_RESENT}。`;
    expect(saysOutcomeUnknown(said)).toBe(true);
    expect(saysOutcomeUnknown('运行反思被中断。')).toBe(false);
    expect(saysOutcomeUnknown(`适配器失败（AI7_FIXTURE_MISMATCH）；${OUTCOME_UNKNOWN_NOT_RESENT}`)).toBe(false);
    expect(saysCarried(`…；${OUTCOME_UNKNOWN_CARRIED}`)).toBe(true);
    expect(saysCarried(`…；${OUTCOME_UNKNOWN_NOT_RESENT}`)).toBe(false);
  });

  it('names an outcome by its kind, its Run, and its range\'s content key or its step — never by an ordinal', () => {
    const run = randomUUID();
    expect(unconfirmedOutcomeKey('writing', run, { contentKey: 'a'.repeat(64) })).toBe(`writing\n${run}\nrange:${'a'.repeat(64)}`);
    expect(unconfirmedOutcomeKey('writing', run, { stage: 'cross-unit-reduction' })).toBe(`writing\n${run}\nstep:cross-unit-reduction`);
    expect(unconfirmedOutcomeKey('writing', run, { stage: 'cross-unit-reduction' })).not.toBe(unconfirmedOutcomeKey('evaluation', run, { stage: 'cross-unit-reduction' }));
  });
});

describe('待我处理 over 结果待确认 a completed Run left', () => {
  it('lists it in 异常与结果待确认, counted and never blocking, opening the kind\'s plan with 查看未确认的部分', () => {
    const baseline = reading();
    const review = reading({ surface: 'review-run', ref: randomUUID(), ranges: 2, steps: [] });
    const projection = composeGlobalAttention({ ...NONE, unconfirmed: [baseline, review] }, NOW);
    const exceptions = projection.groups.find((entry) => entry.key === 'exceptions')!;
    expect(exceptions.items.map((entry) => entry.itemId).sort()).toEqual([`unconfirmed:${baseline.bookId}:baseline-analysis`, `unconfirmed:${review.bookId}:review-run`].sort());
    const item = exceptions.items.find((entry) => entry.itemId === `unconfirmed:${review.bookId}:review-run`)!;
    expect(item).toMatchObject({
      state: 'analysis-outcome-unconfirmed', blocked: false, nextStep: 'view-unconfirmed', at: review.at,
      book: { bookId: review.bookId, title: '归纳之书' },
      object: { kind: 'unconfirmed', taskKind: 'review-run', ranges: 2, steps: [] },
      target: { kind: 'task-plan', bookId: review.bookId, taskKind: 'review-run', ref: review.ref },
    });
    expect(item.technical.map((row) => row.key)).toEqual(['run-records', 'state-at']);
    expect(projection.actionableCount).toBe(2);
    expect(projection.running).toBe(false);
    // Nothing else is read: the other groups stay empty.
    expect(projection.groups.filter((entry) => entry.key !== 'exceptions').every((entry) => entry.total === 0)).toBe(true);
  });

  it('says it in the drawer\'s own words: 结果待确认, what is unconfirmed, and 查看未确认的部分', () => {
    const projection = composeGlobalAttention({ ...NONE, unconfirmed: [reading({ ranges: 1, steps: ['assurance-sampling', 'run-report-reflection'] })] }, NOW);
    const item = projection.groups[0]!.items[0]!;
    expect(GLOBAL_ATTENTION_STATE_LABELS[item.state]).toBe('结果待确认');
    expect(globalAttentionObjectLabel(item.object)).toBe('基线分析 · 1 个阅读范围、保证抽样、运行反思');
    expect(globalAttentionReason(item)).toBe('任务已完成，但有请求已发出而回答没有完整传回，无法确认模型服务是否已处理并计费；这些部分记为结果待确认的缺口，AI7 没有自动再发。');
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS[item.nextStep]).toBe(TASK_BAR_VIEW_UNCONFIRMED);
    expect(globalAttentionObjectLabel({ kind: 'unconfirmed', taskKind: 'writing', ranges: 3, steps: [] })).toBe('写作任务 · 3 个阅读范围');
  });
});

describe('the drawer\'s 结果待确认 block', () => {
  it('says what is known, what is missing, and that 保留为缺口 sends and changes nothing', () => {
    expect(unconfirmedWhat(0, ['cross-unit-reduction'])).toBe('跨单元归纳');
    expect(unconfirmedWhat(2, [])).toBe('2 个阅读范围');
    const listed: NonNullable<TaskPlanProjection['unconfirmed']> = {
      ranges: [{ unitOrdinal: 3, category: '错别字与规范用语', recordedAt: NOW.toISOString() }],
      steps: [{ stage: 'assurance-sampling', category: null, recordedAt: NOW.toISOString() }, { stage: 'assurance-sampling', category: null, recordedAt: NOW.toISOString() }],
      digest: 'c'.repeat(64),
    };
    expect(unconfirmedStatement(listed)).toBe('1 个阅读范围、保证抽样的请求已发出，但回答没有完整传回，无法确认模型服务是否已处理并计费；任务已完成，这些部分在结果里记为结果待确认的缺口，AI7 没有自动再发。' +
      '保留为缺口只记下你的确认：不发送任何内容，不改变结果；以后再读这些阅读范围的任务仍会在计划里说明会再发一次。');
    expect(unconfirmedLine({ unitOrdinal: 3, category: '错别字与规范用语' })).toBe('「错别字与规范用语」第 3 个阅读范围 · 请求已发出 · 回答没有完整传回');
    expect(unconfirmedLine({ stage: 'run-report-reflection', category: null })).toBe('运行反思 · 请求已发出 · 回答没有完整传回');
    expect(UNCONFIRMED_KEEP_AS_GAP).toBe('保留为缺口');
  });
});

describe('a re-send disclosed in the plan of a kind that keeps no progress', () => {
  it('names the ranges as the baseline\'s plan does, and a Review Run\'s by category', () => {
    const plan = { resend: null } as unknown as TaskPlanProjection;
    expect(withResend(plan, [])).toBe(plan);
    expect(withResend(plan, [2, 5]).resend).toEqual({ units: [2, 5], statement: resendDisclosure([2, 5]) });
    expect(categoryResendDisclosure([{ category: '事实核查', units: [4] }, { category: '体例与格式', units: [1, 2] }])).toBe(
      '「事实核查」第 4 个，「体例与格式」第 1、2 个阅读范围上一次的请求已发出、结果待确认，可能已被模型服务处理并计费；这项任务会再发一次它们的请求，开始任务即重新授权这次发送。');
  });
});

describe('the 保留为缺口 frame', () => {
  it('names the plan it was read on and the digest of its list, never the fixed task, and a review always by its Run', () => {
    const bookId = randomUUID();
    const accepted: ServiceRequest[] = [
      { id: randomUUID(), op: 'resolveUnconfirmedOutcomes', input: { bookId, kind: 'baseline-analysis', ref: null, digest: 'a'.repeat(64) } },
      { id: randomUUID(), op: 'resolveUnconfirmedOutcomes', input: { bookId, kind: 'review-run', ref: randomUUID(), digest: 'b'.repeat(64) } },
      { id: randomUUID(), op: 'resolveUnconfirmedOutcomes', input: { bookId, kind: 'writing', ref: randomUUID(), digest: 'c'.repeat(64) } },
    ];
    for (const request of accepted) expect(decodeRequest(frame(request))).toEqual(request);
    const refused: unknown[] = [
      { bookId, kind: 'fixed-task', ref: null, digest: 'a'.repeat(64) },
      { bookId, kind: 'review-run', ref: null, digest: 'a'.repeat(64) },
      { bookId, kind: 'baseline-analysis', ref: null, digest: 'A'.repeat(64) },
      { bookId, kind: 'baseline-analysis', ref: null, digest: 'a'.repeat(63) },
      { bookId, kind: 'baseline-analysis', ref: null },
      { bookId: 'not-a-uuid', kind: 'baseline-analysis', ref: null, digest: 'a'.repeat(64) },
      { bookId, kind: 'baseline-analysis', ref: null, digest: 'a'.repeat(64), outcomes: [] },
    ];
    for (const input of refused) {
      expect(() => decodeRequest(frame({ id: randomUUID(), op: 'resolveUnconfirmedOutcomes', input }))).toThrow(ProtocolError);
    }
    expect(MAX_FRAME_BYTES).toBeGreaterThan(256);
  });
});
