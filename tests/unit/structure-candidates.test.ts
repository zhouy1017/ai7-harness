import { describe, expect, it } from 'vitest';
import { headingCandidates, type CandidateSourceBlock } from '../../src/service/manuscript/structure-candidates.js';

// The two candidate rules the Public SampleBook variants do not reach (Issue #1205): a table of contents and a short standalone
// line. Every text is test-authored structure — titles, numbers and filler — never manuscript prose.
function blocks(texts: ReadonlyArray<string>): CandidateSourceBlock[] {
  return texts.map((text, index) => ({ position: index + 1, kind: 'paragraph', text, graphemeLength: Array.from(text).length }));
}
const LONG = '甲'.repeat(90);

describe('candidate structure rules (#1205)', () => {
  it('offers the body lines a table of contents names, never the contents lines themselves', () => {
    const found = headingCandidates(blocks(['目录', '序言……1', '起源……3', '尾声……9', LONG, '起源', LONG, '尾声', LONG]));
    expect(found.map((candidate) => [candidate.position, candidate.rule, candidate.suggestedLevel])).toEqual([[6, 'contents', 1], [8, 'contents', 1]]);
  });

  it('offers a short line between long paragraphs one level below the deepest numbered family', () => {
    const found = headingCandidates(blocks(['第一章 起源', LONG, '一、缘起', LONG, '插曲', LONG, '短句，带逗号', LONG]));
    expect(found.map((candidate) => [candidate.position, candidate.rule, candidate.suggestedLevel]))
      .toEqual([[1, 'numbered', 1], [3, 'numbered', 2], [5, 'short-line', 3]]);
  });

  it('offers nothing when the reading already made a heading', () => {
    expect(headingCandidates([...blocks(['第一章 起源', LONG]), { position: 3, kind: 'heading', text: '第二章', graphemeLength: 3 }])).toEqual([]);
  });
});
