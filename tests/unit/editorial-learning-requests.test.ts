import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeRequest } from '../../src/service/request-frames.js';

const id = randomUUID();
const frame = (op: string, input: unknown) => new TextEncoder().encode(JSON.stringify({ id, op, input }));

describe('local learning request boundary', () => {
  it('accepts bounded page reads and explicit reference-based memory operations', () => {
    for (const [op, input] of [
      ['inspectEditorialLearning', { signalOffset: 0, itemOffset: 0, exclusionOffset: 30 }],
      ['changeEditorialLearning', { kind: 'switch', enabled: false, expectedEntries: 0 }],
      ['changeEditorialLearning', { kind: 'book', bookId: id, excluded: true, expectedEntries: 1 }],
      ['changeEditorialLearning', { kind: 'material', signalId: id }],
      ['createEditorialMemory', { clientMemoryId: id, signalId: id, title: '统一标点', editorialDimension: '规范', confidence: 0.5 }],
      ['deactivateEditorialMemory', { itemId: id, expectedVersionId: id }],
    ] as const) expect(decodeRequest(frame(op, input))).toEqual({ id, op, input });
  });

  it('refuses unbounded cursors, invalid mutations and caller-supplied source text', () => {
    for (const [op, input] of [
      ['inspectEditorialLearning', { signalOffset: -1, itemOffset: 0 }],
      ['inspectEditorialLearning', { signalOffset: 0, itemOffset: 0, exclusionOffset: '0' }],
      ['changeEditorialLearning', { kind: 'switch', enabled: 'false', expectedEntries: 0 }],
      ['changeEditorialLearning', { kind: 'book', bookId: id, excluded: true, expectedEntries: -1 }],
      ['changeEditorialLearning', { kind: 'material', signalId: id, text: '调用者输入' }],
      ['createEditorialMemory', { clientMemoryId: id, signalId: id, title: '统一标点', editorialDimension: '规范', confidence: 1.1 }],
      ['createEditorialMemory', { clientMemoryId: id, signalId: id, title: '统一标点', editorialDimension: '规范', confidence: 0.5, positiveExamples: [{ text: '调用者输入' }] }],
      ['deactivateEditorialMemory', { itemId: id, expectedVersionId: 'latest' }],
    ] as const) expect(() => decodeRequest(frame(op, input))).toThrow();
  });
});
