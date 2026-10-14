import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  EDITORIAL_POLISH_CONTRACT_VERSION,
  EDITORIAL_POLISH_PROMPT_CONTRACT,
  EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST,
  EDITORIAL_POLISH_RESULT_SCHEMA,
  MAX_EDITORIAL_POLISH_SUGGESTIONS,
  buildEditorialPolishMessage,
  editorialPolishContextDigest,
  editorialPolishRequestDigest,
  editorialPolishSelectionDigest,
  holdsEditorialPolishMarks,
  parseEditorialPolishMessage,
  parseEditorialPolishMessageHeader,
  readEditorialPolishAnswer,
} from '../../src/service/fast-role/polish-contract.js';
import {
  CONFLICT_REGENERATE_CONTRACT_VERSION,
  CONFLICT_REGENERATE_PROMPT_CONTRACT,
  CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST,
  CONFLICT_REGENERATE_RESULT_SCHEMA,
  buildConflictRegenerateMessage,
  conflictRegenerateRegionDigest,
  conflictRegenerateRequestDigest,
  holdsConflictRegenerateMarks,
  parseConflictRegenerateMessage,
  parseConflictRegenerateMessageHeader,
  readConflictRegenerateAnswer,
} from '../../src/service/fast-role/conflict-regenerate-contract.js';
import { MAX_MARK_BODY_CODE_UNITS } from '../../src/shared/protocol.js';

// The two Fast Interaction Role contracts of Issue #842. Every text here is synthetic; none is a manuscript's.

const SELECTION = '他慢慢的走进了房间里面，看见桌子上放着一封信件。';
const polish = (suggestions: unknown[]): string => JSON.stringify({ schema: EDITORIAL_POLISH_RESULT_SCHEMA, suggestions });

describe('Editorial Polish Contract v1', () => {
  it('pins the frozen contract by its digest and version', () => {
    expect(EDITORIAL_POLISH_CONTRACT_VERSION).toBe('ai7.editorial-polish/1');
    expect(EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST).toBe(sha256Hex(canonicalJson(EDITORIAL_POLISH_PROMPT_CONTRACT)));
    expect(EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST).toBe('7078415b8216761fca5c85a68d9b25e153dccd5d910dcafbdc447e3f4ff93e8a');
  });

  it('writes one message holding the context and the selection, and reads it back exactly', () => {
    const input = { before: '前面一句。', selection: SELECTION, after: '后面一句。' };
    const message = buildEditorialPolishMessage(input);
    expect(message.split('\n')[0]).toBe(`AI7 润色这段 · 选段摘要 ${editorialPolishSelectionDigest(SELECTION)} · 上下文摘要 ${editorialPolishContextDigest('前面一句。', '后面一句。')}`);
    expect(parseEditorialPolishMessageHeader(message)).toEqual({
      selectionDigest: editorialPolishSelectionDigest(SELECTION),
      contextDigest: editorialPolishContextDigest('前面一句。', '后面一句。'),
    });
    expect(parseEditorialPolishMessage(message)).toEqual(input);
    expect(parseEditorialPolishMessage(buildEditorialPolishMessage({ before: '', selection: SELECTION, after: '' }))).toEqual({ before: '', selection: SELECTION, after: '' });
    // A message whose selection was changed after its header was written reads as nothing.
    expect(parseEditorialPolishMessage(message.replace('信件', '包裹'))).toBeNull();
    expect(parseEditorialPolishMessageHeader('AI7 编辑对话 · 提问 · 问题摘要 ' + 'a'.repeat(64))).toBeNull();
    expect(holdsEditorialPolishMarks(`一句【所选文字】一句`)).toBe(true);
    expect(holdsEditorialPolishMarks(SELECTION)).toBe(false);
  });

  it('keys the request by the contract, the selection and its context', () => {
    const digest = editorialPolishRequestDigest(EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST, 'a'.repeat(64), 'b'.repeat(64));
    expect(digest).toBe(sha256Hex(`ai7.editorial-polish/1\u0000${EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST}\u0000${'a'.repeat(64)}\u0000${'b'.repeat(64)}`));
    expect(editorialPolishRequestDigest(EDITORIAL_POLISH_PROMPT_CONTRACT_DIGEST, 'a'.repeat(64), 'c'.repeat(64))).not.toBe(digest);
  });

  it('keeps anchored replacements inside the selection and places them in graphemes', () => {
    const reading = readEditorialPolishAnswer(polish([
      { original: '慢慢的', replacement: '慢慢地', reason: '状语后用「地」。' },
      { original: '房间里面', replacement: '房间', reason: '「里面」与「走进」重复。' },
    ]), SELECTION);
    expect(reading).toEqual({
      kind: 'read',
      suggestions: [
        { ordinal: 1, original: '慢慢的', replacement: '慢慢地', reason: '状语后用「地」。', fromGrapheme: 1, toGrapheme: 4 },
        { ordinal: 2, original: '房间里面', replacement: '房间', reason: '「里面」与「走进」重复。', fromGrapheme: 7, toGrapheme: 11 },
      ],
      withheld: [],
    });
    // An empty list is an answer: nothing to polish.
    expect(readEditorialPolishAnswer(polish([]), SELECTION)).toEqual({ kind: 'read', suggestions: [], withheld: [] });
  });

  it('withholds every suggestion outside the contract, each with its reason', () => {
    const reading = readEditorialPolishAnswer(polish([
      { original: '不存在的话', replacement: '别的话', reason: '理由。' },
      { original: '慢', replacement: '快', reason: '理由。' },
      { original: '信件', replacement: '信件', reason: '理由。' },
      { original: '信件', replacement: '信', reason: '第一行\n第二行' },
      { original: '信件', replacement: '信', reason: '理由。', note: '多出的字段' },
      { original: '', replacement: '信', reason: '理由。' },
      { original: '信件', replacement: 'x'.repeat(MAX_MARK_BODY_CODE_UNITS + 1), reason: '理由。' },
      { original: '一封信件', replacement: '一封信', reason: '理由。' },
      { original: '封信', replacement: '份信', reason: '与上一条重叠。' },
      '不是对象',
    ]), SELECTION);
    expect(reading.kind).toBe('read');
    if (reading.kind !== 'read') return;
    expect(reading.suggestions.map((suggestion) => suggestion.ordinal)).toEqual([8]);
    expect(reading.withheld).toEqual([
      { ordinal: 1, reason: '摘出的文字不在所选文字中' },
      { ordinal: 2, reason: '摘出的文字在所选文字中不止一处，无法确定位置' },
      { ordinal: 3, reason: '替换后的文字与原文相同' },
      { ordinal: 4, reason: '理由要是一行，最多 120 个字' },
      { ordinal: 5, reason: '建议不是约定的格式' },
      { ordinal: 6, reason: '建议没有摘出要替换的文字' },
      { ordinal: 7, reason: '替换后的文字超过修改建议的长度上限' },
      { ordinal: 9, reason: '与前面的建议重叠' },
      { ordinal: 10, reason: '建议不是约定的格式' },
    ]);
  });

  it('withholds a suggestion past the limit and an answer outside the contract whole', () => {
    const many = Array.from({ length: MAX_EDITORIAL_POLISH_SUGGESTIONS + 1 }, () => ({ original: '不存在', replacement: '别的', reason: '理由。' }));
    const reading = readEditorialPolishAnswer(polish(many), SELECTION);
    expect(reading.kind === 'read' && reading.withheld.at(-1)).toEqual({ ordinal: 21, reason: '超过 20 条的建议不予提供' });
    for (const answer of [
      '这一段可以这样改：……',
      JSON.stringify({ schema: 'ai7.editorial-polish.result/2', suggestions: [] }),
      JSON.stringify({ schema: EDITORIAL_POLISH_RESULT_SCHEMA, suggestions: [], summary: '整体不错。' }),
      JSON.stringify({ schema: EDITORIAL_POLISH_RESULT_SCHEMA, suggestions: {} }),
      JSON.stringify([]),
    ]) {
      expect(readEditorialPolishAnswer(answer, SELECTION)).toEqual({ kind: 'withheld', reason: '模型的回答不是约定格式的建议列表' });
    }
  });
});

const REGION = { intent: '删去重复的「里面」。', base: '走进了房间里面，', current: '走进了屋子里面，', proposed: '走进了房间，', before: '他慢慢地', after: '看见一封信。' };

describe('Conflict Regeneration Contract v1', () => {
  it('pins the frozen contract by its digest and version', () => {
    expect(CONFLICT_REGENERATE_CONTRACT_VERSION).toBe('ai7.conflict-regenerate/1');
    expect(CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST).toBe(sha256Hex(canonicalJson(CONFLICT_REGENERATE_PROMPT_CONTRACT)));
    expect(CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST).toBe('c3a6b351cc1af5bfe2947da5b3f720c2162f65d1c0a5d4b8bca8dd7a91033789');
  });

  it('writes one message holding the unit\'s words and reads it back exactly', () => {
    const message = buildConflictRegenerateMessage(REGION);
    expect(message.split('\n')[0]).toBe(`AI7 冲突重新生成 · 冲突单元摘要 ${conflictRegenerateRegionDigest(REGION)}`);
    expect(parseConflictRegenerateMessageHeader(message)).toEqual({ regionDigest: conflictRegenerateRegionDigest(REGION) });
    expect(parseConflictRegenerateMessage(message)).toEqual(REGION);
    const empty = { ...REGION, intent: '', before: '', after: '' };
    expect(parseConflictRegenerateMessage(buildConflictRegenerateMessage(empty))).toEqual(empty);
    expect(parseConflictRegenerateMessage(message.replace('屋子', '院子'))).toBeNull();
    expect(holdsConflictRegenerateMarks('一句【原提议】一句')).toBe(true);
    expect(holdsConflictRegenerateMarks(REGION.current)).toBe(false);
    expect(conflictRegenerateRequestDigest(CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST, 'a'.repeat(64)))
      .toBe(sha256Hex(`ai7.conflict-regenerate/1\u0000${CONFLICT_REGENERATE_PROMPT_CONTRACT_DIGEST}\u0000${'a'.repeat(64)}`));
  });

  it('offers exactly one text and withholds anything else', () => {
    expect(readConflictRegenerateAnswer(JSON.stringify({ schema: CONFLICT_REGENERATE_RESULT_SCHEMA, text: '走进了屋子，' })))
      .toEqual({ kind: 'read', text: '走进了屋子，' });
    for (const answer of [
      '走进了屋子，',
      JSON.stringify({ schema: CONFLICT_REGENERATE_RESULT_SCHEMA, text: '走进了屋子，', reason: '多出的字段' }),
      JSON.stringify({ schema: CONFLICT_REGENERATE_RESULT_SCHEMA, texts: ['走进了屋子，'] }),
      JSON.stringify({ schema: 'ai7.conflict-regenerate.result/2', text: '走进了屋子，' }),
      JSON.stringify(['走进了屋子，']),
    ]) {
      expect(readConflictRegenerateAnswer(answer)).toEqual({ kind: 'withheld', reason: '模型的回答不是约定格式的建议文字' });
    }
    expect(readConflictRegenerateAnswer(JSON.stringify({ schema: CONFLICT_REGENERATE_RESULT_SCHEMA, text: '  ' })))
      .toEqual({ kind: 'withheld', reason: '模型没有给出新的建议文字' });
    expect(readConflictRegenerateAnswer(JSON.stringify({ schema: CONFLICT_REGENERATE_RESULT_SCHEMA, text: 'x'.repeat(MAX_MARK_BODY_CODE_UNITS + 1) })))
      .toEqual({ kind: 'withheld', reason: '模型给出的文字超过修改建议的长度上限' });
  });
});
