import { describe, expect, it } from 'vitest';
import { dialogueReplacementText } from '../../src/renderer/dialogue-answer.js';

describe('answer to suggestion text', () => {
  it.each([
    ['建议改为：“天色渐明。”\n理由：更简洁。', '天色渐明。'],
    ['**建议改为：**“天色渐明。”\n理由：更简洁。', '天色渐明。'],
    ['原文：\n```\n天渐渐亮了。\n```\n改写：\n```\n天色渐明。\n```', '天色渐明。'],
    ['可以这样改：\n```text\n天色渐明。\n```\n保留了原意。', '天色渐明。'],
    ['“天色渐明。”', '天色渐明。'],
    ['  可以缩短末句，保留叙述视角。  ', '可以缩短末句，保留叙述视角。'],
  ])('prefills the rewritten passage or the answer itself', (answer, expected) => {
    expect(dialogueReplacementText(answer)).toBe(expected);
  });
});
