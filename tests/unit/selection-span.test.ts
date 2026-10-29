import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import { placeSpanSuggestions } from '../../src/service/fast-role/polish-span.js';
import type { WorkingSpanBlock } from '../../src/service/manuscript/selection-span.js';
import { readSelectionSpan, spanGraphemes, spanPins, type SpanSourceBlock } from '../../src/shared/selection-span.js';

// Cross-paragraph selection (Issue #1176, W22-S5): what the editor's selection becomes as an exact pin, and where a polish
// suggestion read from a span's words is placed. Synthetic words only; no manuscript text.

const digest = (letter: string): string => letter.repeat(64);
const block = (id: string, text: string, kind = 'paragraph'): SpanSourceBlock => ({ blockId: `blk_${id.repeat(24)}`, digest: digest(id), kind, text });
const [a, b, c] = [block('a', '甲乙丙丁戊'), block('b', '子丑寅卯'), block('c', '天地玄黄宇宙')];

describe('a selection across paragraphs as one exact pin', () => {
  it('pins the first block from its grapheme to its end, interior blocks whole and the last from 0, joined by one line break', () => {
    const reading = readSelectionSpan([a, b, c], 2, 3);
    expect(reading).toEqual({
      kind: 'span',
      pins: [
        { blockId: a.blockId, blockDigest: digest('a'), fromGrapheme: 2, toGrapheme: 5 },
        { blockId: b.blockId, blockDigest: digest('b'), fromGrapheme: 0, toGrapheme: 4 },
        { blockId: c.blockId, blockDigest: digest('c'), fromGrapheme: 0, toGrapheme: 3 },
      ],
      text: '丙丁戊\n子丑寅卯\n天地玄',
    });
    if (reading.kind !== 'span') return;
    const range = { ...reading.pins[0]!, span: reading.pins };
    expect(spanGraphemes(range)).toBe(10);
    expect(spanPins(range, digest('a'))).toBe(reading.pins);
  });

  it('keeps a selection whose ends stand at block edges inside one block as today\'s single range', () => {
    // From the end of A to the start of C names only B.
    expect(readSelectionSpan([a, b, c], 5, 0)).toEqual({ kind: 'range', pin: { blockId: b.blockId, blockDigest: digest('b'), fromGrapheme: 0, toGrapheme: 4 }, text: '子丑寅卯' });
    const single = { blockId: a.blockId, fromGrapheme: 1, toGrapheme: 3 };
    expect(spanPins(single, digest('a'))).toEqual([{ ...single, blockDigest: digest('a') }]);
    expect(spanGraphemes(single)).toBe(2);
    expect(readSelectionSpan([a, b], 5, 0)).toEqual({ kind: 'none' });
  });

  it('is no span when a note block lies inside it', () => {
    expect(readSelectionSpan([a, block('n', '注一', 'note'), c], 1, 2)).toEqual({ kind: 'note' });
  });
});

describe('where a span\'s polish suggestions are placed', () => {
  const working = (source: SpanSourceBlock, from: number, to: number): WorkingSpanBlock => ({
    pin: { blockId: source.blockId, blockDigest: source.digest, fromGrapheme: from, toGrapheme: to },
    position: 1, text: source.text, part: [...source.text].slice(from, to).join(''), digest: source.digest,
  });
  // The span's words: 丙丁戊 \n 子丑寅卯 \n 天地玄
  const blocks = [working(a, 2, 5), working(b, 0, 4), working(c, 0, 3)];
  const suggestion = (ordinal: number, original: string, replacement: string, from: number) =>
    ({ ordinal, original, replacement, reason: '理由', fromGrapheme: from, toGrapheme: from + [...original].length });

  it('places one inside a paragraph there, one across a break per paragraph, and withholds one that merges or changes nothing', () => {
    const { placed, withheld } = placeSpanSuggestions([
      suggestion(1, '寅卯', '寅辰', 6),
      suggestion(2, '戊\n子丑', '午\n子丑', 2),
      suggestion(3, '丁戊\n子', '丁戊子', 1),
      suggestion(4, '卯\n天', 'X\nY', 7),
      suggestion(5, '玄', '玄', 11),
    ], blocks);
    expect(placed).toEqual([
      { ordinal: 1, reason: '理由', parts: [{ blockId: b.blockId, fromGrapheme: 2, toGrapheme: 4, original: '寅卯', replacement: '寅辰' }] },
      // Across a break, the paragraph whose words stay is left out: only A's part changes.
      { ordinal: 2, reason: '理由', parts: [{ blockId: a.blockId, fromGrapheme: 4, toGrapheme: 5, original: '戊', replacement: '午' }] },
      { ordinal: 4, reason: '理由', parts: [
        { blockId: b.blockId, fromGrapheme: 3, toGrapheme: 4, original: '卯', replacement: 'X' },
        { blockId: c.blockId, fromGrapheme: 0, toGrapheme: 1, original: '天', replacement: 'Y' },
      ] },
    ]);
    expect(withheld).toEqual([{ ordinal: 3, reason: '替换后的文字会合并或拆分段落' }, { ordinal: 5, reason: '替换后的文字与原文相同' }]);
  });
});

describe('a span on the wire', () => {
  const encoder = new TextEncoder();
  const pins = [
    { blockId: a.blockId, blockDigest: digest('a'), fromGrapheme: 2, toGrapheme: 5 },
    { blockId: b.blockId, blockDigest: digest('b'), fromGrapheme: 0, toGrapheme: 2 },
  ];
  const selection = { manuscriptId: randomUUID(), branchId: randomUUID(), windowStartBlockId: a.blockId, baseRevisionId: randomUUID(),
    expectedJournalSequence: 3, blockId: a.blockId, baseBlockDigest: digest('a'), fromGrapheme: 2, toGrapheme: 5, selectedText: '丙丁戊\n子丑', span: pins };
  const frame = (op: string, input: unknown): Uint8Array => encoder.encode(JSON.stringify({ id: randomUUID(), op, input }));

  it('carries the span to 润色这段, 就这段提问 and a draft, and nowhere a range must stay in one paragraph', () => {
    const bookId = randomUUID();
    expect(decodeRequest(frame('polishSelection', { bookId, selection })).input).toEqual({ bookId, selection });
    expect(() => decodeRequest(frame('askAboutSelection', { bookId, selection, question: '问' }))).not.toThrow();
    expect(() => decodeRequest(frame('saveTaskIntentDraft', { bookId, draftId: null, expectedOrdinal: null, origin: 'composer-selection', goal: '目标',
      target: { kind: 'ranges', ranges: [{ kind: 'new', span: selection }] }, outcomeClass: null }))).not.toThrow();
    expect(() => decodeRequest(frame('polishSelection', { bookId, selection: { ...selection, span: [pins[0]] } }))).toThrow(ProtocolError);
    expect(() => decodeRequest(frame('polishSelection', { bookId, selection: { ...selection, span: [{ ...pins[0], text: '甲' }, pins[1]] } }))).toThrow(ProtocolError);
    const knowledge = { seriesId: randomUUID(), target: { kind: 'existing', itemId: randomUUID() }, content: '内容' };
    const { span: _pins, ...single } = selection;
    expect(() => decodeRequest(frame('proposeSeriesKnowledge', { ...knowledge, span: { ...single, selectedText: '丙丁戊' } }))).not.toThrow();
    expect(() => decodeRequest(frame('proposeSeriesKnowledge', { ...knowledge, span: selection }))).toThrow(ProtocolError);
  });
});
