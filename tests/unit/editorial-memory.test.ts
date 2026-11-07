import { describe, expect, it } from 'vitest';
import { composeEditorialMemoryBlock, editorialMemoryDigest, editorialMemoryPrompt, withEditorialMemoryDefinition } from '../../src/service/learning/editorial-memory.js';
import { baselineAnalysisKindDefinition } from '../../src/service/analysis/kind-definition.js';
import { selectPreferenceLines, type PreferenceLineCandidate } from '../../src/service/learning/retrieval.js';

const rule = (lineIndex: number, categoryId = 'style-and-format', bookId: string | null = null): PreferenceLineCandidate => ({
  versionId: 'rules', ordinal: 1, lineIndex, text: `保留编辑确认的规则${lineIndex}`, categoryId, bookId,
  active: true, confidence: 0, recordedAt: '2026-11-01T00:00:00Z',
});

describe('shared editorial memory envelope', () => {
  it.each([
    ['editorial-review/typos-and-usage', 'typos-and-usage'], ['factual-review', 'factual-review'],
    ['editorial-dialogue', 'literary-expression'], ['agent-workspace', 'publication-risk'],
    ['global-agent', 'publication-risk'], ['writing', 'literary-expression'], ['readers-report', 'publication-risk'],
    ['evaluation', 'style-and-format'], ['evaluation-rewrite', 'style-and-format'],
    ['baseline-manuscript-analysis', 'plot-consistency'], ['custom-analysis/academic-integrity', 'academic-integrity'],
  ])('recalls confirmed relevant rules for %s with the same authority and format boundary', (taskKind, categoryId) => {
    const bookId = taskKind === 'global-agent' ? null : 'book';
    const memory = composeEditorialMemoryBlock([rule(0, categoryId, bookId), { ...rule(1), active: false }, rule(2, categoryId, 'other')], { bookId, taskKind });
    expect(memory?.lines.map((line) => line.lineIndex)).toEqual([0]);
    expect(memory?.block).toContain('必须优先遵循以下本社偏好');
    expect(memory?.block).toContain('不改变本任务要求的输出格式（如 JSON 结构或字段约束）');
  });

  it('prioritizes book rules over house rules and bounds complete lines to 15 / 1200 graphemes', () => {
    const candidates = Array.from({ length: 64 }, (_, index) => ({ ...rule(index), text: '字'.repeat(80) }));
    const book = { ...rule(64, 'style-and-format', 'book'), text: '书'.repeat(80) };
    const selected = selectPreferenceLines([...candidates, book], { bookId: 'book', taskKind: 'writing' });
    expect(selected).toHaveLength(15); expect(selected[0]).toEqual(book);
    expect(selected.reduce((sum, line) => sum + [...line.text].length, 0)).toBe(1200);
  });

  it('leaves empty-memory identities exact and freezes nonempty request identities without changing the base', () => {
    const base = baselineAnalysisKindDefinition();
    expect(composeEditorialMemoryBlock([], { bookId: null, taskKind: 'global-agent' })).toBeNull();
    expect(withEditorialMemoryDefinition(base, null)).toBe(base);
    expect(editorialMemoryPrompt(base.systemPrompt, null)).toBe(base.systemPrompt);
    expect(editorialMemoryDigest(base.promptContractDigest, null)).toBe(base.promptContractDigest);
    const memory = composeEditorialMemoryBlock([rule(0, 'plot-consistency')], { bookId: 'book', taskKind: base.kind })!;
    const definition = withEditorialMemoryDefinition(base, memory);
    expect(definition.systemPrompt).toContain(memory.block);
    expect(definition.requestDigest(1, 'a'.repeat(64))).not.toBe(base.requestDigest(1, 'a'.repeat(64)));
    expect(base.systemPrompt).not.toContain(memory.block);
    expect(withEditorialMemoryDefinition(base, structuredClone(memory)).promptContractDigest).toBe(definition.promptContractDigest);
  });
});
