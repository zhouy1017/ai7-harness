import { describe, expect, it } from 'vitest';
import {
  IME_COMPOSITION_RESERVE,
  PROTECTION_RETRY_DELAYS_MS,
  SAFETY_BUFFER_CAPACITY,
  SAFETY_BUFFER_SOFT_LIMIT,
  bufferAdmits,
  bufferReachedLimit,
  changedCharacters,
  unacknowledgedCharacters,
  classifyJournalFailure,
  protectionAttribute,
  retryDelayMs,
  type ProtectionView,
} from '../../src/renderer/editor-protection.js';
import {
  PROTECTION_CLEARED,
  PROTECTION_HEADLINE,
  PROTECTION_OPTIONS_ACTION,
  PROTECTION_RETRY_ACTION,
  PROTECTION_COPY_ACTION,
  atRiskLine,
  atRiskLocation,
  blockedActionLine,
  lastDurableLine,
  readOnlyLine,
  retryLine,
} from '../../src/renderer/editor-protection-labels.js';
import { decodeRequest } from '../../src/service/request-frames.js';
import {
  EDIT_JOURNAL_FAULT_CODE,
  MAX_BLOCK_GRAPHEMES,
  editJournalFaultControlAdmitted,
  isEditJournalFaultMode,
  SERVICE_PROTOCOL_VERSION,
} from '../../src/shared/protocol.js';

// Unit suite for Editing Protection Mode (Issue #951, wave 12 slice 12a; V2-UX-DUR-001 to DUR-012, ED-055, ED-056): the
// bounded safety buffer's arithmetic, how a refused journal write is read, the retry pace, the words, and when the test-only
// write-failure injection may be armed.

const split = (text: string): string[] => Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);

function view(overrides: Partial<ProtectionView> = {}): ProtectionView {
  return {
    cause: 'journal-unavailable',
    readOnly: null,
    lastDurable: { sequence: 7, durableAt: '2026-10-18T02:00:00.000Z' },
    atRisk: { characters: 3, blocks: 1, firstBlockPosition: 12, location: '第 12 段' },
    retrying: false,
    attempts: 0,
    nextRetryAt: null,
    salvageExport: 'unavailable',
    ...overrides,
  };
}

describe('the Bounded Edit Safety Buffer', () => {
  it('has a declared capacity that is a constant, with an input-method reserve inside it (DUR-002, DUR-008)', () => {
    expect(SAFETY_BUFFER_CAPACITY).toBe(5_840);
    expect(IME_COMPOSITION_RESERVE).toBeGreaterThan(0);
    expect(SAFETY_BUFFER_SOFT_LIMIT).toBe(SAFETY_BUFFER_CAPACITY - IME_COMPOSITION_RESERVE);
    // The limits take no manuscript size: a ten-million-character manuscript and a one-paragraph one share them.
    expect(bufferAdmits.length).toBe(2);
    expect(bufferReachedLimit.length).toBe(2);
  });

  it('takes input up to the soft limit, and a composition up to the capacity, never past it', () => {
    expect(bufferAdmits(SAFETY_BUFFER_SOFT_LIMIT, false)).toBe(true);
    expect(bufferAdmits(SAFETY_BUFFER_SOFT_LIMIT + 1, false)).toBe(false);
    expect(bufferAdmits(SAFETY_BUFFER_SOFT_LIMIT + 1, true)).toBe(true);
    expect(bufferAdmits(SAFETY_BUFFER_CAPACITY, true)).toBe(true);
    expect(bufferAdmits(SAFETY_BUFFER_CAPACITY + 1, true)).toBe(false);
  });

  it('reserves a full admitted block replacement even when earlier pending edits fill the soft limit', () => {
    const replacement = changedCharacters(Array(MAX_BLOCK_GRAPHEMES).fill('甲'), Array(MAX_BLOCK_GRAPHEMES).fill('乙'));
    expect(bufferAdmits(SAFETY_BUFFER_SOFT_LIMIT + replacement, true)).toBe(true);
    expect(bufferAdmits(SAFETY_BUFFER_SOFT_LIMIT + replacement, false)).toBe(false);
  });

  it('pauses input at the soft limit only once no composition is open, so a composition is never cut short', () => {
    expect(bufferReachedLimit(SAFETY_BUFFER_SOFT_LIMIT - 1, false)).toBe(false);
    expect(bufferReachedLimit(SAFETY_BUFFER_SOFT_LIMIT, false)).toBe(true);
    expect(bufferReachedLimit(SAFETY_BUFFER_SOFT_LIMIT + 100, true)).toBe(false);
    expect(bufferReachedLimit(SAFETY_BUFFER_SOFT_LIMIT + 100, false)).toBe(true);
  });

  it('measures a block\'s unacknowledged text by what the shared prefix and suffix leave, in graphemes', () => {
    expect(changedCharacters(split('甲乙丙丁'), split('甲乙丙丁'))).toBe(0);
    expect(changedCharacters(split('甲乙丙丁'), split('甲乙新增丙丁'))).toBe(2);
    expect(changedCharacters(split('甲乙丙丁'), split('甲丁'))).toBe(2);
    expect(changedCharacters(split('甲乙丙丁'), split('甲戊丁'))).toBe(3);
    expect(changedCharacters(split('👨‍👩‍👧'), split('👨‍👩‍👧一'))).toBe(1);
  });

  it('retains the risk of an outstanding command after the editor reverses its visible text', () => {
    const base = split('甲乙');
    const pending = { fromGrapheme: 2, toGrapheme: 2, inserted: split('丙') };
    expect(unacknowledgedCharacters(base, base, pending)).toBe(1);
    expect(unacknowledgedCharacters(base, split('甲乙丙丁'), pending)).toBe(2);
    expect(unacknowledgedCharacters(base, base)).toBe(0);
    expect(unacknowledgedCharacters(base, split('甲'), pending)).toBe(2);
  });
});

describe('a refused journal write', () => {
  it('reads a moved target as drift, which stops replay (DUR-007)', () => {
    for (const code of ['EDIT_BINDING_CHANGED', 'EDIT_SEQUENCE_CHANGED', 'EDIT_BLOCK_CHANGED', 'EDIT_RANGE_INVALID', 'IDEMPOTENCY_CONFLICT', 'AI7_EDITOR_CAPABILITY_INVALID', 'EDITOR_ACK_MISMATCH', 'JOURNAL_ACK_FAILED']) {
      expect(classifyJournalFailure({ code, message: '' })).toBe('drift');
    }
  });

  it('reads an unavailable acknowledgement or service as a write to retry (DUR-001, DUR-006)', () => {
    expect(classifyJournalFailure({ code: EDIT_JOURNAL_FAULT_CODE, message: '' })).toBe('unavailable');
    expect(classifyJournalFailure({ code: 'SERVICE_STOPPED', message: '' })).toBe('unavailable');
    expect(classifyJournalFailure({ code: 'SERVICE_REQUEST_FAILED', message: '' })).toBe('unavailable');
    expect(classifyJournalFailure(new Error('timeout'))).toBe('unavailable');
    expect(classifyJournalFailure(null)).toBe('unavailable');
  });

  it('retries at a widening pace that settles at its last step', () => {
    expect(PROTECTION_RETRY_DELAYS_MS).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect([0, 1, 2, 3, 4, 50].map(retryDelayMs)).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });
});

describe('the protection words (ED-055, DUR-003, DUR-004, DUR-005, DUR-009)', () => {
  it('replaces every saved implication with the exact headline and one direct action', () => {
    expect(PROTECTION_HEADLINE).toBe('本地写入中断 · 当前更改尚未持久保存');
    expect(PROTECTION_OPTIONS_ACTION).toBe('查看保护选项');
    expect(PROTECTION_RETRY_ACTION).toBe('重试写入');
    expect(PROTECTION_COPY_ACTION).toBe('复制受影响内容');
    expect(PROTECTION_CLEARED).toBe('已写入修订日志');
  });

  it('states the Last Durable Edit Boundary, the At-risk Edit Extent and the retry state in editor terms', () => {
    const at = '2026-10-18T02:00:00.000Z';
    expect(lastDurableLine(1234, at)).toBe(`最后确认写入：修订日志序号 1,234 · ${new Date(at).toLocaleString('zh-CN', { hour12: false })}`);
    expect(atRiskLocation(null, 12, 1)).toBe('第 12 段');
    expect(atRiskLocation('第三章', 1200, 3)).toBe('第三章 · 第 1,200 段起 3 段');
    expect(atRiskLine('第 12 段', 1500)).toBe('未确认内容：第 12 段，约 1,500 字');
    expect(atRiskLine(null, 0)).toBe('未确认内容：无');
    expect(retryLine('journal-unavailable', true, 2, null)).toBe('自动重试：正在重试写入（已重试 2 次）');
    expect(retryLine('journal-unavailable', false, 1, 4)).toBe('自动重试：4 秒后重试（已重试 1 次）');
    expect(retryLine('drift', false, 3, null)).toContain('已停止');
    expect(retryLine('service-stopped', false, 0, null)).toContain('无法自动重试');
    expect(readOnlyLine('capacity')).toContain('输入法组合已完整保留');
  });

  it('names the attempted action beside its refusal', () => {
    expect(blockedActionLine('返回图书工作概览')).toBe('本地写入中断，当前更改尚未持久保存：暂不能执行「返回图书工作概览」。请先重试写入，或复制受影响内容。');
    expect(blockedActionLine(null)).toContain('这项操作');
  });

  it('marks the document as active or read-only for the surfaces beside the manuscript', () => {
    expect(protectionAttribute(null)).toBeNull();
    expect(protectionAttribute(view())).toBe('active');
    expect(protectionAttribute(view({ readOnly: 'capacity' }))).toBe('read-only');
  });
});

describe('the Edit Journal write-failure injection launch rule (T0-1)', () => {
  it('is protocol 156, provisional for onboarding until the merge slot', () => {
    expect(SERVICE_PROTOCOL_VERSION).toBe(156);
  });

  it('arms only J-02\'s `armed` launch in the development-ci scope and refuses every other present control', () => {
    expect(editJournalFaultControlAdmitted(undefined, undefined, 'development-ci')).toBe(false);
    expect(editJournalFaultControlAdmitted(undefined, 'J-02', 'ordinary-production')).toBe(false);
    expect(editJournalFaultControlAdmitted('armed', 'J-02', 'development-ci')).toBe(true);
    expect(editJournalFaultControlAdmitted('armed', undefined, 'development-ci')).toBeNull();
    expect(editJournalFaultControlAdmitted('armed', 'J-01', 'development-ci')).toBeNull();
    expect(editJournalFaultControlAdmitted('armed', 'J-02', 'ordinary-production')).toBeNull();
    expect(editJournalFaultControlAdmitted('armed', 'J-02', 'developer-live')).toBeNull();
    expect(editJournalFaultControlAdmitted('on', 'J-02', 'development-ci')).toBeNull();
  });

  it('knows exactly three modes', () => {
    expect(['off', 'fail-next', 'fail-all'].every(isEditJournalFaultMode)).toBe(true);
    expect(isEditJournalFaultMode('fail-some')).toBe(false);
  });

  it('takes a frame that names one mode and nothing else', () => {
    const frame = (input: unknown): Buffer => Buffer.from(JSON.stringify({ id: '00000000-0000-4000-8000-0000000009f1', op: 'setEditJournalFault', input }), 'utf8');
    for (const mode of ['off', 'fail-next', 'fail-all']) expect(decodeRequest(frame({ mode }))).toMatchObject({ op: 'setEditJournalFault', input: { mode } });
    for (const input of [{}, { mode: 'fail-some' }, { mode: 'off', extra: true }, null]) expect(() => decodeRequest(frame(input))).toThrowError();
  });
});
