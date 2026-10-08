import { describe, expect, it } from 'vitest';
import * as labels from '../../src/renderer/dialogue-labels.js';
import { taskPanelCardView } from '../../src/renderer/task-panel-labels.js';
import {
  DIALOGUE_PROMPT_CONTRACT,
  DIALOGUE_PROMPT_CONTRACT_DIGEST,
  buildDialogueMessage,
  dialogueQuestion,
  dialogueQuestionDigest,
  dialogueRequestDigest,
  parseDialogueMessage,
  parseDialogueMessageHeader,
} from '../../src/service/dialogue/contract.js';
import { dialogueProjection, resolveAttempts, type DialogueHistoryReader } from '../../src/service/dialogue/dialogue-history.js';
import type { StoredDialogueAttempt, StoredDialogueTask } from '../../src/service/dialogue/dialogue-ledger.js';
import { decodeRequest } from '../../src/service/request-frames.js';
import type { BookTaskItemProjection, GlobalAttentionStateKey } from '../../src/shared/protocol.js';

// Unit suite for 就这段提问… (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-001 to 016, TASK-044, TASK-046): its words
// byte for byte, a dialogue Task's card in the 任务 panel, the frozen dialogue contract and how its message reads back, the
// attempt state machine over the records and the ledger, and the frames the service takes.

const BOOK = '00000000-0000-4000-8000-000000000000';
const DIALOGUE = '00000000-0000-4000-8000-0000000000d1';
const QUESTION = '这段的叙述视角是否一致？';
const SESSION = '00000000-0000-4000-8000-0000000000e1';

describe('the words of 就这段提问…', () => {
  it('says what is sent, and names each answer state in DIALOG-006 and DIALOG-012’s words', () => {
    expect(labels.DIALOGUE_MENU_LABEL).toBe('就这段提问…');
    expect(labels.DIALOGUE_SENDS_NOTE).toBe('只发送所选文字和你的问题，不改稿件。');
    expect(labels.DIALOGUE_WAITING_LABEL).toBe('等待回答');
    expect(labels.DIALOGUE_STATE_LABELS).toEqual({
      answering: '正在回答 · 内容尚未完成',
      completed: '回答完成',
      stopped: '回答已停止 · 内容不完整',
      interrupted: '回答中断 · 内容不完整',
      failed: '回答未能完成 · 内容不完整',
    });
    expect(labels.DIALOGUE_ACTIONS).toEqual({ stop: '停止回答', continue: '继续回答', regenerate: '重新回答', convert: '转为修改建议' });
    expect(labels.DIALOGUE_AUTHORITY_NOTE).toBe('回答是生成的内容，只供参考：它不改稿件，也不是事实结论或修改建议。');
    expect(labels.DIALOGUE_CONVERT_INCOMPLETE).toBe('内容不完整的回答不能转为修改建议。');
  });

  it('numbers attempts, says why an answer is incomplete, and how many 修改建议 came of it', () => {
    expect(labels.dialogueAttemptHeading({ ordinal: 1, kind: 'ask' })).toBe('第 1 次 · 回答');
    expect(labels.dialogueAttemptHeading({ ordinal: 2, kind: 'regenerate' })).toBe('第 2 次 · 重新回答');
    expect(labels.dialogueAttemptHeading({ ordinal: 3, kind: 'continue' })).toBe('第 3 次 · 继续回答');
    expect(labels.dialogueIncompleteLine({ state: 'stopped', causeCode: null, fragmentTotal: 1 })).toBe('你停止了回答；只保留了完整的句子。');
    expect(labels.dialogueIncompleteLine({ state: 'stopped', causeCode: null, fragmentTotal: 0 })).toBe('你停止了回答；没有留下完整的句子。');
    expect(labels.dialogueIncompleteLine({ state: 'interrupted', causeCode: 'AI7_CLOSED', fragmentTotal: 2 })).toBe('AI7 关闭时回答被中断；只保留了完整的句子。');
    expect(labels.dialogueIncompleteLine({ state: 'interrupted', causeCode: 'SERVICE_STOPPED', fragmentTotal: 2 })).toBe('AI7 关闭时回答被中断；只保留了完整的句子。');
    expect(labels.dialogueIncompleteLine({ state: 'interrupted', causeCode: 'ABORTED', fragmentTotal: 2 })).toBe('回答被中断；只保留了完整的句子。');
    expect(labels.dialogueIncompleteLine({ state: 'failed', causeCode: 'AI7_FIXTURE_MISMATCH', fragmentTotal: 0 })).toBe('回答没有完成（AI7_FIXTURE_MISMATCH）；没有留下完整的句子。');
    expect(labels.dialogueIncompleteLine({ state: 'failed', causeCode: null, fragmentTotal: 0 })).toBe('回答没有完成（原因未知）；没有留下完整的句子。');
    expect(labels.dialogueIncompleteLine({ state: 'completed', causeCode: null, fragmentTotal: 3 })).toBeNull();
    expect(labels.dialogueIncompleteLine({ state: 'answering', causeCode: null, fragmentTotal: 3 })).toBeNull();
    expect(labels.dialogueConvertedLine(1)).toBe('已从这次回答新建 1 条修改建议。');
    expect(labels.DIALOGUE_HISTORY_DAMAGED).toBe('这次回答的记录已损坏，读不出来。');
    expect(labels.dialogueQuestionRefusal(0, 500)).toBe('先写下你的问题。');
    expect(labels.dialogueQuestionRefusal(501, 500)).toBe('问题最多 500 个字。');
    expect(labels.dialogueQuestionRefusal(500, 500)).toBeNull();
    expect(labels.dialogueQuestionLine(QUESTION)).toBe(`提问 · 「${QUESTION}」`);
  });
});

describe('a dialogue Task in the 任务 panel', () => {
  const card = (state: GlobalAttentionStateKey, result: BookTaskItemProjection['result']): ReturnType<typeof taskPanelCardView> => taskPanelCardView({
    item: {
      itemId: `dialogue:${DIALOGUE}`,
      group: state === 'dialogue-answering' ? 'active' : 'recent',
      state,
      blocked: false,
      at: '2026-10-07T04:05:06.000Z',
      book: { bookId: BOOK, title: '对话旅程' },
      object: { kind: 'dialogue', question: QUESTION },
      facts: { progress: null, categories: [], revisionOrdinal: null },
      nextStep: 'open-dialogue',
      target: { kind: 'dialogue', bookId: BOOK, dialogueId: DIALOGUE },
      technical: [],
    },
    result,
  });

  it('offers 回答 and 打开对话 (TASK-044), and only 打开对话 while it answers', () => {
    const answering = card('dialogue-answering', null);
    expect(answering).toMatchObject({ kindLabel: '对话任务 · 就所选文字提问', title: `提问 · 「${QUESTION}」`, stateLabel: '等待回答', pill: { tone: 'neutral', shape: 'ring' } });
    expect(answering.actions.map((action) => [action.key, action.label, action.primary])).toEqual([['next', '打开对话', true]]);
    const answered = card('dialogue-answered', { kind: 'dialogue', dialogueId: DIALOGUE });
    expect(answered.stateLabel).toBe('已回答');
    expect(answered.actions.map((action) => [action.key, action.label, action.primary])).toEqual([['answer', '回答', false], ['next', '打开对话', true]]);
    expect(card('dialogue-stopped', { kind: 'dialogue', dialogueId: DIALOGUE }).stateLabel).toBe('回答已停止 · 内容不完整');
    expect(card('dialogue-interrupted', null).actions.map((action) => action.key)).toEqual(['next']);
    expect(answered.timeLine).toMatch(/^完成于 /u);
  });
});

describe('the Editorial Dialogue Contract', () => {
  it('sends the selected words and the question, and reads back exactly what it sent', () => {
    expect(DIALOGUE_PROMPT_CONTRACT_DIGEST).toMatch(/^[0-9a-f]{64}$/u);
    const message = buildDialogueMessage({ kind: 'ask', selection: '所选的二十个字', question: QUESTION, kept: null });
    expect(message).toBe(`AI7 编辑对话 · 提问 · 问题摘要 ${dialogueQuestionDigest(QUESTION)}\n【所选文字】\n所选的二十个字\n【问题】\n${QUESTION}`);
    expect(parseDialogueMessageHeader(message)).toEqual({ kind: 'ask', questionDigest: dialogueQuestionDigest(QUESTION) });
    expect(parseDialogueMessage(message)).toEqual({ kind: 'ask', selection: '所选的二十个字', question: QUESTION, kept: null });
    const going = buildDialogueMessage({ kind: 'continue', selection: '字', question: `${QUESTION}\n第二行`, kept: '已有的一句。' });
    expect(going.endsWith(`【已有的回答（在这里停下了）】\n已有的一句。\n${DIALOGUE_PROMPT_CONTRACT.continueInstruction}`)).toBe(true);
    expect(parseDialogueMessage(going)).toEqual({ kind: 'continue', selection: '字', question: `${QUESTION}\n第二行`, kept: '已有的一句。' });
    // Anything else is no dialogue message: another header, a question the digest does not name, a tampered body.
    expect(parseDialogueMessageHeader(`分析单元 1/1 · 单元摘要 ${'0'.repeat(64)}`)).toBeNull();
    expect(parseDialogueMessage(message.replace(QUESTION, '别的问题？'))).toBeNull();
    expect(parseDialogueMessage(message.replace('【所选文字】', '【所选】'))).toBeNull();
    expect(parseDialogueMessage(going.replace(DIALOGUE_PROMPT_CONTRACT.continueInstruction, '接着说'))).toBeNull();
    // The request key: the contract, how the turn asks, and the question — never the Book's words.
    const ask = dialogueRequestDigest(DIALOGUE_PROMPT_CONTRACT_DIGEST, 'ask', dialogueQuestionDigest(QUESTION));
    expect(ask).toBe('99d222cfa2aac85a27b6839fed74ea01b00f602a19028cc903f0872c33a206ed');
    expect(dialogueRequestDigest(DIALOGUE_PROMPT_CONTRACT_DIGEST, 'continue', dialogueQuestionDigest(QUESTION))).toBe('e3460da6fdc716fe6a8087d4b408341f661d6c1b5716e5e64b6c0a524e03dad3');
  });

  it('takes a question of the editor’s own words, trimmed, within its bound and without the contract’s marks', () => {
    expect(dialogueQuestion(`  ${QUESTION}\n`)).toBe(QUESTION);
    for (const bad of [' ', '', 42, '问'.repeat(501), '请看【问题】', '【所选文字】是什么', '【已有的回答（在这里停下了）】']) {
      expect(() => dialogueQuestion(bad)).toThrowError();
    }
    expect(dialogueQuestion('问'.repeat(500))).toHaveLength(500);
  });
});

/** The attempt state machine over stored records and a ledger that holds each turn as given. */
describe('a dialogue’s attempts and what each allows', () => {
  const task: StoredDialogueTask = {
    dialogueId: DIALOGUE, bookId: BOOK, manuscriptId: BOOK, branchId: BOOK, revisionId: BOOK, journalSequence: 3,
    blockId: `blk_${'a'.repeat(24)}`, fromGrapheme: 0, toGrapheme: 4, blockDigest: 'b'.repeat(64), selectionSha256: 'c'.repeat(64),
    questionSha256: 'd'.repeat(64), askedAt: '2026-10-07T04:05:06.000Z',
  };
  const attempt = (ordinal: number, kind: StoredDialogueAttempt['kind'], outcome: 'completed' | 'stopped' | 'interrupted' | 'failed' | null): StoredDialogueAttempt => ({
    attemptId: `00000000-0000-4000-8000-00000000000${ordinal}`, dialogueId: DIALOGUE, ordinal, kind,
    priorAttemptId: ordinal === 1 ? null : `00000000-0000-4000-8000-00000000000${ordinal - 1}`, createdAt: `2026-10-07T04:05:0${ordinal}.000Z`,
    binding: null, span: { harnessSessionId: SESSION, startSeq: ordinal * 10, openedAt: '2026-10-07T04:05:06.000Z' },
    outcome: outcome === null ? null : { outcome, endSeq: ordinal * 10 + 5, causeCode: outcome === 'completed' || outcome === 'stopped' ? null : 'X', settledAt: `2026-10-07T04:06:0${ordinal}.000Z` },
    conversions: [],
  });
  const message = { kind: 'ask' as const, selection: '所选文字', question: QUESTION, kept: null };
  const reader = (streams: Record<number, string>): DialogueHistoryReader => ({
    turn: (entry) => ({ message: entry.kind === 'continue' ? { ...message, kind: 'continue', kept: 'x' } : message, streamed: streams[entry.ordinal] ?? '' }),
  });
  const project = (attempts: StoredDialogueAttempt[], streams: Record<number, string>, live: Record<string, string> = {}) =>
    dialogueProjection(task, resolveAttempts(attempts, reader(streams), (id) => id in live ? { message, streamed: live[id]! } : null), 0);

  it('lets an answer in flight only be stopped, and shows only its complete fragments', () => {
    const first = attempt(1, 'ask', null);
    const answering = project([first], {}, { [first.attemptId]: '一句。半' });
    expect(answering.attempts[0]).toMatchObject({ state: 'answering', source: 'live', fragmentTotal: 1, fragments: [{ text: '一句。', breakAfter: false }] });
    expect(answering.actions).toEqual({ stop: true, continue: false, regenerate: false, convert: false });
    expect(answering.question).toBe(QUESTION);
    // An end mark that is the last character received still waits: a closing mark may follow it (DIALOG-006).
    expect(project([first], {}, { [first.attemptId]: '一句。' }).attempts[0]!.fragments).toEqual([]);
    expect(project([attempt(1, 'ask', 'stopped')], { 1: '一句。' }).attempts[0]!.fragments).toEqual([{ text: '一句。', breakAfter: false }]);
  });

  it('reads the question from the earliest turn the ledger holds, and asks nothing again of a turn that does not read back', () => {
    const asked = { ...message, question: '最初的问题？' };
    const turns: DialogueHistoryReader = { turn: (entry) => ({ message: entry.ordinal === 1 ? asked : message, streamed: '一句。' }) };
    expect(dialogueProjection(task, resolveAttempts([attempt(1, 'ask', 'stopped'), attempt(2, 'regenerate', 'stopped')], turns, () => null), 0).question).toBe('最初的问题？');
    const unreadable: DialogueHistoryReader = { turn: () => ({ message: null, streamed: '一句。二' }) };
    const projection = dialogueProjection(task, resolveAttempts([attempt(1, 'ask', 'stopped')], unreadable, () => null), 0);
    expect(projection.attempts[0]!.fragmentTotal).toBe(1);
    expect(projection.actions).toEqual({ stop: false, continue: false, regenerate: false, convert: false });
  });

  it('continues only an incomplete answer that kept something, regenerates any settled one, and converts only a completed one', () => {
    expect(project([attempt(1, 'ask', 'stopped')], { 1: '一句。半' }).actions).toEqual({ stop: false, continue: true, regenerate: true, convert: false });
    expect(project([attempt(1, 'ask', 'stopped')], { 1: '半句' }).actions).toEqual({ stop: false, continue: false, regenerate: true, convert: false });
    expect(project([attempt(1, 'ask', 'interrupted')], { 1: '一句。' }).actions).toEqual({ stop: false, continue: true, regenerate: true, convert: false });
    expect(project([attempt(1, 'ask', 'failed')], { 1: '一句。' }).actions).toEqual({ stop: false, continue: false, regenerate: true, convert: false });
    expect(project([attempt(1, 'ask', 'completed')], { 1: '一句。尾' }).actions).toEqual({ stop: false, continue: false, regenerate: true, convert: true });
    expect(project([attempt(1, 'ask', 'completed')], { 1: '' }).actions).toEqual({ stop: false, continue: false, regenerate: true, convert: false });
    // A 继续回答 carries what the answer it went on from kept, then its own; the whole is what it converts.
    const continued = project([attempt(1, 'ask', 'stopped'), attempt(2, 'continue', 'completed')], { 1: '一句。半', 2: '二句。三' });
    expect(continued.attempts[1]!.fragments.map((fragment) => fragment.text)).toEqual(['一句。', '二句。', '三']);
    expect(continued.actions.convert).toBe(true);
    // Without a turn the ledger holds, there is no question to ask again.
    const missing = dialogueProjection(task, resolveAttempts([attempt(1, 'ask', 'stopped')], { turn: () => 'missing' }, () => null), 0);
    expect(missing).toMatchObject({ question: null, selection: null, actions: { continue: false, regenerate: false, convert: false } });
    expect(missing.attempts[0]!.source).toBe('missing');
    // A record that is here and does not read is told apart from one that is not here.
    const damaged = dialogueProjection(task, resolveAttempts([attempt(1, 'ask', 'stopped')], { turn: () => 'damaged' }, () => null), 0);
    expect(damaged.attempts[0]).toMatchObject({ source: 'damaged', fragmentTotal: 0 });
    expect(damaged.actions).toEqual({ stop: false, continue: false, regenerate: false, convert: false });
  });

  it('gives a reader the latest answer from the fragment it has shown, and every earlier one whole', () => {
    const projection = dialogueProjection(task, resolveAttempts([attempt(1, 'ask', 'stopped'), attempt(2, 'regenerate', 'completed')], reader({ 1: '一。二', 2: '一。二。三' }), () => null), 2);
    expect(projection.attempts[0]).toMatchObject({ fragmentsFrom: 0, fragmentTotal: 1 });
    expect(projection.attempts[1]).toMatchObject({ fragmentsFrom: 2, fragmentTotal: 3, fragments: [{ text: '三', breakAfter: false }] });
    expect(dialogueProjection(task, resolveAttempts([attempt(1, 'ask', 'completed')], reader({ 1: '一。' }), () => null), 9).attempts[0]).toMatchObject({ fragmentsFrom: 1, fragments: [] });
  });
});

describe('the frames the dialogue takes', () => {
  const selection = {
    manuscriptId: BOOK, branchId: BOOK, windowStartBlockId: `blk_${'a'.repeat(24)}`, baseRevisionId: BOOK, expectedJournalSequence: 0,
    blockId: `blk_${'a'.repeat(24)}`, baseBlockDigest: 'b'.repeat(64), fromGrapheme: 0, toGrapheme: 4, selectedText: '四个字儿',
  };
  const frame = (op: string, input: unknown): Buffer => Buffer.from(JSON.stringify({ id: '00000000-0000-4000-8000-0000000000f1', op, input }), 'utf8');
  it('accepts exactly the six operations’ inputs and refuses anything beside them', () => {
    const attemptInput = { bookId: BOOK, dialogueId: DIALOGUE, attemptId: SESSION };
    for (const [op, input] of [
      ['askAboutSelection', { bookId: BOOK, selection, question: QUESTION }],
      ['inspectDialogue', { bookId: BOOK, dialogueId: DIALOGUE, afterFragment: 0 }],
      ['stopDialogueAnswer', attemptInput],
      ['continueDialogueAnswer', attemptInput],
      ['regenerateDialogueAnswer', attemptInput],
      ['convertDialogueToChangeSuggestion', { ...attemptInput, proposedText: '改', rationale: '' }],
    ] as const) {
      expect(decodeRequest(frame(op, input))).toMatchObject({ op, input });
    }
    for (const [op, input] of [
      ['askAboutSelection', { bookId: BOOK, selection: null, question: QUESTION }],
      ['askAboutSelection', { bookId: BOOK, selection, question: '' }],
      ['askAboutSelection', { bookId: BOOK, selection: { ...selection, extra: 1 }, question: QUESTION }],
      ['inspectDialogue', { bookId: BOOK, dialogueId: DIALOGUE, afterFragment: -1 }],
      ['inspectDialogue', { bookId: BOOK, dialogueId: 'bad', afterFragment: 0 }],
      ['stopDialogueAnswer', { ...attemptInput, extra: true }],
      ['convertDialogueToChangeSuggestion', { ...attemptInput, proposedText: '', rationale: '' }],
      ['convertDialogueToChangeSuggestion', { ...attemptInput, proposedText: '改' }],
    ] as const) {
      expect(() => decodeRequest(frame(op, input))).toThrowError();
    }
  });
});
