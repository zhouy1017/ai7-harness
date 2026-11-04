import { describe, expect, it } from 'vitest';
import { boundedText, extractModelJson, graphemeCount, hasExactKeys, hasKeys, normalizeLine, stripModelJsonFence } from '../../src/service/analysis/canonical.js';

describe('shared model JSON extraction (#1311 H1)', () => {
  it('reads fenced and prose-prefixed objects, taking the first object and preserving quoted braces', () => {
    const value = { items: [{ text: 'brace } and escaped " quote; ``` stays text' }] };
    const json = JSON.stringify(value);
    for (const text of [json, `\`\`\`json\n${json}\n\`\`\``, `说明：\n\`\`\`JSON\n${json}\n\`\`\`\n后记`, `说明 {not json} ${json} {"other":true}`]) {
      expect(extractModelJson(text)).toEqual(value);
    }
    expect(extractModelJson('只有说明')).toBeNull();
  });

  it('salvages complete entries and fields, never a truncated sibling or a nested fragment', () => {
    const prefix = '{"schema":"test/1","items":[{"text":"完整"},';
    for (const tail of ['', '{"text":"截断', '{"nested":{"value":1},"unfinished":']) {
      expect(extractModelJson(prefix + tail, { partial: true })).toEqual({ schema: 'test/1', items: [{ text: '完整' }] });
      expect(extractModelJson(prefix + tail)).toBeNull();
    }
    expect(extractModelJson('{"items":[', { partial: true })).toEqual({ items: [] });
    expect(extractModelJson('{"items":[{"text":', { partial: true })).toEqual({ items: [] });
    expect(extractModelJson('{"first":[1,2],"second":[{"ok":true},', { partial: true }))
      .toEqual({ first: [1, 2], second: [{ ok: true }] });
    expect(extractModelJson('{"text":"unfinished', { partial: true })).toBeNull();
  });

  it('keeps strict fence-only extraction available for parsers awaiting their own slice', () => {
    expect(stripModelJsonFence('```json\n{"items":[]}\n```')).toBe('{"items":[]}');
    const prefixed = '说明 ```json\n{"items":[]}\n```';
    expect(stripModelJsonFence(prefixed)).toBe(prefixed);
  });
});

describe('shared model fields and text', () => {
  it('requires own keys, allows extra keys and absent optional keys, and leaves exact checks strict', () => {
    expect(hasKeys({ items: [], extra: true }, ['items'], ['notes'])).toBe(true);
    expect(hasKeys({ items: [], notes: null }, ['items'], ['notes'])).toBe(true);
    expect(hasKeys({}, ['items'], ['notes'])).toBe(false);
    expect(hasKeys(Object.create({ items: [] }), ['items'])).toBe(false);
    for (const value of [null, [], 'text', 1]) expect(hasKeys(value, [])).toBe(false);
    expect(hasExactKeys({ items: [], extra: true }, ['items'])).toBe(false);
  });

  it('counts and bounds whole graphemes without clipping exact text', () => {
    const text = 'e\u0301👨‍👩‍👧‍👦𠀋';
    expect(graphemeCount(text)).toBe(3);
    expect(boundedText(text, 3)).toBe(true);
    expect(boundedText(text, 2)).toBe(false);
    expect(boundedText(' ', 1)).toBe(false);
    expect(boundedText('', 0, true)).toBe(true);
    expect(boundedText('\ud800', 1)).toBe(false);
    expect(boundedText(1, 1)).toBe(false);
  });

  it('normalizes descriptive prose and clips it without splitting a grapheme', () => {
    expect(normalizeLine('  e\u0301\n\t说明  ')).toBe('é 说明');
    expect(normalizeLine('  👨‍👩‍👧‍👦𠀋  说明', 2)).toBe('👨‍👩‍👧‍👦𠀋');
    expect(normalizeLine('文字', 0)).toBe('');
    expect(normalizeLine('   ')).toBe('');
  });
});
