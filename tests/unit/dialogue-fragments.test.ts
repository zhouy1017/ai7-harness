import { describe, expect, it } from 'vitest';
import { fragmentsText, splitFragments, type DialogueFragment } from '../../src/service/dialogue/fragments.js';

// The Interactive Answer Stream's semantic fragments (Issue #52, S17a; DIALOG-006, 007, 012).

const texts = (fragments: ReadonlyArray<DialogueFragment>): string[] => fragments.map((fragment) => fragment.text);

describe('splitFragments', () => {
  it('gives a sentence only once something after its end mark is known', () => {
    expect(splitFragments('第一句。', 'streaming')).toEqual([]);
    expect(texts(splitFragments('第一句。第', 'streaming'))).toEqual(['第一句。']);
    expect(texts(splitFragments('第一句。第二句还没', 'streaming'))).toEqual(['第一句。']);
    expect(texts(splitFragments('第一句。第二句还没完。下', 'streaming'))).toEqual(['第一句。', '第二句还没完。']);
  });

  it('keeps closing marks and further end marks with their sentence', () => {
    expect(texts(splitFragments('他说：“好。”然后走了。再', 'streaming'))).toEqual(['他说：“好。”', '然后走了。']);
    expect(texts(splitFragments('真的吗？！是的……好', 'streaming'))).toEqual(['真的吗？！', '是的……']);
    // A closing mark may still come: the end mark at the very end holds its sentence back.
    expect(splitFragments('他说：“好。', 'streaming')).toEqual([]);
    expect(splitFragments('他说：“好。”', 'streaming')).toEqual([]);
    expect(texts(splitFragments('（见上文。）后', 'streaming'))).toEqual(['（见上文。）']);
  });

  it('ends a fragment at a line break, which also ends a list item, and says so', () => {
    expect(splitFragments('一、人物\n二、地点\n三', 'streaming')).toEqual([
      { text: '一、人物', breakAfter: true },
      { text: '二、地点', breakAfter: true },
    ]);
    expect(splitFragments('结论。\n下一段', 'streaming')).toEqual([{ text: '结论。', breakAfter: true }]);
    expect(splitFragments('结论。  \n下一段', 'streaming')).toEqual([{ text: '结论。', breakAfter: true }]);
    expect(splitFragments('结论。  下一句。后', 'streaming')).toEqual([{ text: '结论。', breakAfter: false }, { text: '下一句。', breakAfter: false }]);
    // Spaces after an end mark decide nothing until what follows them arrives.
    expect(splitFragments('结论。  ', 'streaming')).toEqual([]);
    expect(splitFragments('\n\n  \n', 'settled')).toEqual([]);
  });

  it('reads a full stop only before a space', () => {
    expect(texts(splitFragments('约 3.5 万字。Done. Next', 'streaming'))).toEqual(['约 3.5 万字。', 'Done.']);
    expect(splitFragments('a.b', 'settled')).toEqual([{ text: 'a.b', breakAfter: false }]);
    expect(splitFragments('End.', 'streaming')).toEqual([]);
    expect(splitFragments('End.', 'cut')).toEqual([{ text: 'End.', breakAfter: false }]);
    expect(texts(splitFragments('Wait!Yes', 'settled'))).toEqual(['Wait!', 'Yes']);
    expect(texts(splitFragments('Why? Because; then', 'settled'))).toEqual(['Why?', 'Because;', 'then']);
  });

  it('cuts a stopped answer at its last complete fragment, and settles a completed one whole', () => {
    expect(texts(splitFragments('第一句。第二句没写', 'cut'))).toEqual(['第一句。']);
    expect(texts(splitFragments('第一句。第二句写完了。', 'cut'))).toEqual(['第一句。', '第二句写完了。']);
    expect(texts(splitFragments('第一句。第二句没有句号', 'settled'))).toEqual(['第一句。', '第二句没有句号']);
    expect(splitFragments('', 'settled')).toEqual([]);
    expect(splitFragments('只有半句', 'cut')).toEqual([]);
  });

  it('never takes back or changes a fragment it gave: every prefix reads as a prefix', () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const alphabet = ['字', '词', 'a', '3', ' ', '\n', '。', '！', '？', '；', '…', '.', '!', '?', '”', '」', '）', '"', '　'];
    for (let round = 0; round < 400; round += 1) {
      const text = Array.from({ length: Math.floor(random() * 40) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      const whole = splitFragments(text, 'settled');
      const cut = splitFragments(text, 'cut');
      const streaming = splitFragments(text, 'streaming');
      expect(cut.slice(0, streaming.length)).toEqual(streaming);
      expect(whole.slice(0, cut.length)).toEqual(cut);
      const characters = [...text];
      for (let length = 0; length <= characters.length; length += 1) {
        const prefix = splitFragments(characters.slice(0, length).join(''), 'streaming');
        expect(streaming.slice(0, prefix.length)).toEqual(prefix);
      }
      // Nothing is lost or added: the settled fragments hold every visible character of the answer, in order.
      expect(texts(whole).join('').replace(/\s/gu, '')).toBe(text.replace(/\s/gu, ''));
      for (const fragment of whole) expect(fragment.text).toBe(fragment.text.trim());
    }
  });

  it('reads fragments back as prose with their line breaks', () => {
    expect(fragmentsText(splitFragments('一句。二句。\n新段。', 'settled'))).toBe('一句。二句。\n新段。');
    expect(fragmentsText([{ text: '末句。', breakAfter: true }])).toBe('末句。');
  });
});
