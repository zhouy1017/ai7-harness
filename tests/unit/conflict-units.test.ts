import { describe, expect, it } from 'vitest';
import {
  conflictUnits,
  draftText,
  hasNonConflictingChanges,
  includeNonConflictingChanges,
  initialResolutions,
  resolutionsFit,
  resolvedUnitText,
  segmentPhrases,
  unresolvedUnits,
  type ConflictUnit,
  type ConflictUnitResolution,
} from '../../src/shared/conflict-units.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';

/** Every unit's words, side by side, join back into each of the three texts. */
function expectJoins(units: ReadonlyArray<ConflictUnit>, base: string, current: string, proposed: string): void {
  expect(units.map((unit) => unit.base).join('')).toBe(base);
  expect(units.map((unit) => unit.current).join('')).toBe(current);
  expect(units.map((unit) => unit.proposed).join('')).toBe(proposed);
}

describe('a Three-way Proposal Conflict cuts its texts into Chinese phrases (V2-UX-CONFLICT-007)', () => {
  it('ends a phrase after a clause or sentence mark, and keeps the mark with the words before it', () => {
    expect(segmentPhrases('一、二，三；四：五！六？七…八——九。十')).toEqual(['一、', '二，', '三；', '四：', '五！', '六？', '七…', '八——', '九。', '十']);
    expect(segmentPhrases('Hi, there. Ok; fine: yes! no? end')).toEqual(['Hi,', ' there.', ' Ok;', ' fine:', ' yes!', ' no?', ' end']);
    expect(segmentPhrases('全角句点．半角句点.')).toEqual(['全角句点．', '半角句点.']);
  });

  it('keeps a run of marks — a closing quotation after a full stop, an ellipsis, a dash — together', () => {
    expect(segmentPhrases('他说：“你好。”然后走了。')).toEqual(['他说：', '“你好。”', '然后走了。']);
    expect(segmentPhrases('什么？！……好吧——算了。')).toEqual(['什么？！……', '好吧——', '算了。']);
    expect(segmentPhrases('「引文」『书中』‘单引’（注）《书名》【按】后文')).toEqual(['「引文」', '『书中』', '‘单引’', '（注）', '《书名》', '【按】', '后文']);
  });

  it('ends a phrase at a line break, however the break is written', () => {
    expect(segmentPhrases('第一行\n第二行')).toEqual(['第一行\n', '第二行']);
    expect(segmentPhrases('第一行\r\n第二行')).toEqual(['第一行\r\n', '第二行']);
    expect(segmentPhrases('结束。\n')).toEqual(['结束。\n']);
  });

  it('cuts nothing out of an empty text and one phrase out of a text without marks', () => {
    expect(segmentPhrases('')).toEqual([]);
    expect(segmentPhrases('没有标点的一段文字')).toEqual(['没有标点的一段文字']);
  });

  it('cuts only between graphemes: emoji sequences, surrogate pairs and combining marks stay whole', () => {
    const text = '家人👨‍👩‍👧，旗🇨🇳。𠀀𠀁字！é好…👍🏽';
    const phrases = segmentPhrases(text);
    expect(phrases).toEqual(['家人👨‍👩‍👧，', '旗🇨🇳。', '𠀀𠀁字！', 'é好…', '👍🏽']);
    expect(phrases.join('')).toBe(text);
    // Each phrase is whole graphemes of the text, in order, and well-formed on its own.
    expect(phrases.flatMap((phrase) => graphemesOf(phrase))).toEqual(graphemesOf(text));
    for (const phrase of phrases) expect(phrase.isWellFormed()).toBe(true);
    // A mark that a combining sequence carries is part of that grapheme, and ends nothing by itself.
    expect(segmentPhrases('甲。́乙')).toEqual(['甲。́乙']);
  });
});

describe('the three-way comparison of 提案基准, 当前权威稿件 and 提议内容', () => {
  it('reads a short suggestion whose own words were edited as one conflict unit', () => {
    const base = '示例称谓乙';
    const current = '示例X称谓乙';
    const proposed = '示例称谓甲';
    expect(conflictUnits(base, current, proposed)).toEqual([{ kind: 'conflict', base, current, proposed }]);
  });

  it('keeps a change made only in the manuscript apart from a change only the proposal makes', () => {
    const base = '一，二，三，四。';
    const current = '零，二，三，四。';
    const proposed = '一，二，三，五。';
    const units = conflictUnits(base, current, proposed);
    expect(units).toEqual([
      { kind: 'current-only', base: '一，', current: '零，', proposed: '一，' },
      { kind: 'same', base: '二，三，', current: '二，三，', proposed: '二，三，' },
      { kind: 'proposed-only', base: '四。', current: '四。', proposed: '五。' },
    ]);
    expectJoins(units, base, current, proposed);
  });

  it('reads the same change on both sides as both-same, and different changes of one phrase as a conflict', () => {
    expect(conflictUnits('甲，乙。', '甲，丙。', '甲，丙。')).toEqual([
      { kind: 'same', base: '甲，', current: '甲，', proposed: '甲，' },
      { kind: 'both-same', base: '乙。', current: '丙。', proposed: '丙。' },
    ]);
    expect(conflictUnits('他来了，我走了。', '他来了，你走了。', '他来了，我留下了。')).toEqual([
      { kind: 'same', base: '他来了，', current: '他来了，', proposed: '他来了，' },
      { kind: 'conflict', base: '我走了。', current: '你走了。', proposed: '我留下了。' },
    ]);
  });

  it('groups changes whose base spans overlap into one unit', () => {
    const base = '一，二，三，四。';
    const current = '一，二，叁，肆。';
    const proposed = '一，二，三，五。';
    const units = conflictUnits(base, current, proposed);
    expect(units).toEqual([
      { kind: 'same', base: '一，二，', current: '一，二，', proposed: '一，二，' },
      { kind: 'conflict', base: '三，四。', current: '叁，肆。', proposed: '三，五。' },
    ]);
    expectJoins(units, base, current, proposed);
  });

  it('keeps changes that only touch apart: they keep their order', () => {
    // One side changes a phrase, the other the next one.
    expect(conflictUnits('甲，乙。', '丙，乙。', '甲，丁。')).toEqual([
      { kind: 'current-only', base: '甲，', current: '丙，', proposed: '甲，' },
      { kind: 'proposed-only', base: '乙。', current: '乙。', proposed: '丁。' },
    ]);
    // One side inserts right where the other's change begins.
    const units = conflictUnits('甲，乙。', '甲，插入，乙。', '甲，乙改。');
    expect(units).toEqual([
      { kind: 'same', base: '甲，', current: '甲，', proposed: '甲，' },
      { kind: 'current-only', base: '', current: '插入，', proposed: '' },
      { kind: 'proposed-only', base: '乙。', current: '乙。', proposed: '乙改。' },
    ]);
    expectJoins(units, '甲，乙。', '甲，插入，乙。', '甲，乙改。');
    // One side inserts right where the other's change ends.
    expect(conflictUnits('一，二，三，四。', '一，二，三，四。追加', '一，二，三，五。')).toEqual([
      { kind: 'same', base: '一，二，三，', current: '一，二，三，', proposed: '一，二，三，' },
      { kind: 'proposed-only', base: '四。', current: '四。', proposed: '五。' },
      { kind: 'current-only', base: '', current: '追加', proposed: '' },
    ]);
  });

  it('reads two insertions at one place, or one inside the other side\'s change, as one unit', () => {
    expect(conflictUnits('甲，乙。', '甲，插一，乙。', '甲，插二，乙。')).toEqual([
      { kind: 'same', base: '甲，', current: '甲，', proposed: '甲，' },
      { kind: 'conflict', base: '', current: '插一，', proposed: '插二，' },
      { kind: 'same', base: '乙。', current: '乙。', proposed: '乙。' },
    ]);
    expect(conflictUnits('甲，乙。', '甲，插，乙。', '甲，插，乙。')).toEqual([
      { kind: 'same', base: '甲，', current: '甲，', proposed: '甲，' },
      { kind: 'both-same', base: '', current: '插，', proposed: '插，' },
      { kind: 'same', base: '乙。', current: '乙。', proposed: '乙。' },
    ]);
    expect(conflictUnits('甲，乙，丙。', '甲，乙，插，丙。', '甲，丁。')).toEqual([
      { kind: 'same', base: '甲，', current: '甲，', proposed: '甲，' },
      { kind: 'conflict', base: '乙，丙。', current: '乙，插，丙。', proposed: '丁。' },
    ]);
  });

  it('compares against an empty current text when the words were deleted, and an empty base when an Apply deleted them', () => {
    expect(conflictUnits('甲，乙。', '', '甲，丙。')).toEqual([{ kind: 'conflict', base: '甲，乙。', current: '', proposed: '甲，丙。' }]);
    expect(conflictUnits('原文', '', '新文')).toEqual([{ kind: 'conflict', base: '原文', current: '', proposed: '新文' }]);
    // Reversing an Apply that deleted its words: the Apply wrote nothing, and the reversal would write them again.
    expect(conflictUnits('', '后来写的', '原文')).toEqual([{ kind: 'conflict', base: '', current: '后来写的', proposed: '原文' }]);
    expect(conflictUnits('', '', '原文')).toEqual([{ kind: 'proposed-only', base: '', current: '', proposed: '原文' }]);
    expect(conflictUnits('', '', '')).toEqual([]);
  });

  it('compares emoji and characters outside the Basic Multilingual Plane exactly', () => {
    const base = '👍很好，𠀀字。';
    const current = '👍👍很好，𠀀字。';
    const proposed = '👍很好，𠀁字。';
    const units = conflictUnits(base, current, proposed);
    expect(units).toEqual([
      { kind: 'current-only', base: '👍很好，', current: '👍👍很好，', proposed: '👍很好，' },
      { kind: 'proposed-only', base: '𠀀字。', current: '𠀀字。', proposed: '𠀁字。' },
    ]);
    expectJoins(units, base, current, proposed);
  });

  it('finds the same units in a long paragraph, cheaply, whatever lies between the changes', () => {
    const phrases = Array.from({ length: 300 }, (_, index) => `第${index}句，`);
    const base = phrases.join('');
    const current = phrases.map((phrase, index) => (index === 150 ? '改过的第一百五十句，' : phrase)).join('');
    const proposed = phrases.map((phrase, index) => (index === 10 ? '建议的第十句，' : phrase)).join('');
    const units = conflictUnits(base, current, proposed);
    expect(units.map((unit) => unit.kind)).toEqual(['same', 'proposed-only', 'same', 'current-only', 'same']);
    expect(units[1]).toEqual({ kind: 'proposed-only', base: '第10句，', current: '第10句，', proposed: '建议的第十句，' });
    expect(units[3]).toEqual({ kind: 'current-only', base: '第150句，', current: '改过的第一百五十句，', proposed: '第150句，' });
    expectJoins(units, base, current, proposed);
  });

  it('is the same comparison every time it is asked', () => {
    const args = ['甲，乙，甲，乙。', '甲，乙。', '乙，甲，乙。'] as const;
    const first = conflictUnits(...args);
    expect(conflictUnits(...args)).toEqual(first);
    expectJoins(first, ...args);
  });
});

describe('a Resolution Draft over the units (V2-UX-CONFLICT-006, CONFLICT-008 to CONFLICT-010)', () => {
  const units = conflictUnits('一，二，三。', '零，二，叁。', '一，二，三改。');
  // current-only 一，→零，  same 二，  conflict 三。 / 叁。 / 三改。
  const fresh = initialResolutions(units);

  it('starts with nothing resolved and reads, until resolved, as the current manuscript', () => {
    expect(units.map((unit) => unit.kind)).toEqual(['current-only', 'same', 'conflict']);
    expect(fresh).toEqual([
      { resolution: 'unresolved', text: null },
      { resolution: null, text: null },
      { resolution: 'unresolved', text: null },
    ]);
    expect(unresolvedUnits(units, fresh)).toEqual([0, 2]);
    expect(draftText(units, fresh)).toBe('零，二，叁。');
  });

  it('takes the current or the proposed words, both in the chosen order, or the editor\'s own', () => {
    const conflict = units[2]!;
    expect(resolvedUnitText(conflict, { resolution: 'current', text: null })).toBe('叁。');
    expect(resolvedUnitText(conflict, { resolution: 'proposed', text: null })).toBe('三改。');
    expect(resolvedUnitText(conflict, { resolution: 'both-current-first', text: null })).toBe('叁。三改。');
    expect(resolvedUnitText(conflict, { resolution: 'both-proposed-first', text: null })).toBe('三改。叁。');
    expect(resolvedUnitText(conflict, { resolution: 'edited', text: '叁改。' })).toBe('叁改。');
    expect(resolvedUnitText(conflict, { resolution: 'edited', text: '' })).toBe('');
    const resolved: ConflictUnitResolution[] = [{ resolution: 'proposed', text: null }, { resolution: null, text: null }, { resolution: 'edited', text: '叁改。' }];
    expect(draftText(units, resolved)).toBe('一，二，叁改。');
    expect(unresolvedUnits(units, resolved)).toEqual([]);
  });

  it('includes every unresolved non-conflicting change on its changed side and leaves conflicts and choices alone', () => {
    expect(hasNonConflictingChanges(units, fresh)).toBe(true);
    const bulk = includeNonConflictingChanges(units, fresh);
    expect(bulk).toEqual({
      resolutions: [{ resolution: 'current', text: null }, { resolution: null, text: null }, { resolution: 'unresolved', text: null }],
      included: 1,
      conflictsLeft: 1,
    });
    expect(hasNonConflictingChanges(units, bulk.resolutions)).toBe(false);
    // A unit the editor already resolved keeps the editor's choice.
    const chosen: ConflictUnitResolution[] = [{ resolution: 'proposed', text: null }, { resolution: null, text: null }, { resolution: 'unresolved', text: null }];
    expect(includeNonConflictingChanges(units, chosen)).toEqual({ resolutions: chosen, included: 0, conflictsLeft: 1 });
    expect(hasNonConflictingChanges(units, chosen)).toBe(false);
    // A proposed-only unit takes the proposal; one both sides changed alike takes that shared change.
    const both = conflictUnits('甲，乙，丙。', '甲，乙，丁。', '戊，乙，丁。');
    expect(both.map((unit) => unit.kind)).toEqual(['proposed-only', 'same', 'both-same']);
    expect(draftText(both, includeNonConflictingChanges(both, initialResolutions(both)).resolutions)).toBe('戊，乙，丁。');
    // A lone conflict offers nothing to include.
    const lone = conflictUnits('原文', '原文改', '新文');
    expect(hasNonConflictingChanges(lone, initialResolutions(lone))).toBe(false);
  });

  it('accepts only a draft of exactly these units', () => {
    expect(resolutionsFit(units, fresh)).toBe(true);
    expect(resolutionsFit(units, fresh.slice(1))).toBe(false);
    expect(resolutionsFit(units, [fresh[0]!, { resolution: 'current', text: null }, fresh[2]!])).toBe(false);
    expect(resolutionsFit(units, [{ resolution: null, text: null }, fresh[1]!, fresh[2]!])).toBe(false);
    expect(resolutionsFit(units, [{ resolution: 'edited', text: null }, fresh[1]!, fresh[2]!])).toBe(false);
    expect(resolutionsFit(units, [{ resolution: 'current', text: '多余' }, fresh[1]!, fresh[2]!])).toBe(false);
    expect(resolutionsFit(units, [{ resolution: 'edited', text: '\uD800' }, fresh[1]!, fresh[2]!])).toBe(false);
    expect(resolutionsFit(units, [{ resolution: 'guessed' as never, text: null }, fresh[1]!, fresh[2]!])).toBe(false);
    expect(resolutionsFit(units, [{ resolution: 'edited', text: '' }, fresh[1]!, { resolution: 'both-proposed-first', text: null }])).toBe(true);
  });
});
