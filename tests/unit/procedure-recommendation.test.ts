import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { capturedProcedureDocument } from '../../src/service/captured-procedures.js';
import { recommendProcedures, type RecommendationReading } from '../../src/service/procedure-recommendation.js';
import { reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import type { ProcedureRecommendationInput } from '../../src/shared/protocol.js';
import { ProcedureRecommendationSelection, recommendationIntentFromSlot } from '../../src/renderer/procedure-choice.js';

const input: ProcedureRecommendationInput = { bookId: 'b', goal: '体例审阅', taskKind: 'review-run', scope: 'whole', categoryIds: ['style-and-format'] };
function reading(id: string, fit: 'all' | 'partial' | 'none' = 'all'): RecommendationReading {
  const document = capturedProcedureDocument('体例复核', [reviewCategoryEntry('style-and-format')!], 'whole');
  return { document, documentSha256: sha256Hex(canonicalJson(document)), labels: ['体例与格式'], applicability: {
    procedureId: id, title: document.title, latestEligible: { versionId: `${id}-v2`, version: 2 }, fit,
    stepCount: 1, availableCount: fit === 'none' ? 0 : 1, chosenApart: [], chosenApartSteps: [], leftOut: [],
  } };
}
describe('deterministic recommendation under ADR 0090', () => {
  it('reads the relayed 7a editorial outcome classes and preserves the exact goal digest and scope', () => {
    const digest = 'a'.repeat(64);
    expect(recommendationIntentFromSlot('review', 'whole-book', digest)).toEqual({ goal: digest, taskKind: 'review-run', scope: 'whole', categoryIds: [] });
    expect(recommendationIntentFromSlot('factual', 'selection', digest)).toEqual({ goal: digest, taskKind: 'review-run', scope: 'selection', categoryIds: ['factual-review'] });
    expect(recommendationIntentFromSlot('analysis', 'whole-book', digest).taskKind).toBe('baseline-analysis');
    expect(recommendationIntentFromSlot('writing', 'whole-book', digest).taskKind).toBe('writing');
    expect(recommendationIntentFromSlot('review', 'deliverable', digest).taskKind).toBe('unclassified');
    expect(recommendationIntentFromSlot('', 'whole-book', digest).taskKind).toBe('unclassified');
  });
  it('shows one exact newest eligible version for a clear fit without selecting or mutating it', () => {
    const source = [reading('one')];
    const before = canonicalJson(source);
    const answer = recommendProcedures(input, source);
    expect(answer.status).toBe('clear');
    expect(answer.selectedVersionId).toBeNull();
    expect(answer.candidates[0]).toMatchObject({ procedureId: 'one', versionId: 'one-v2', version: 2, purpose: '体例复核', kind: '可复用工序', effectClasses: [] });
    expect(answer.candidates[0]!.rationale.join('')).toContain('目标类别匹配 1/1');
    expect(answer.candidates[0]!.requiredInputs).toContain('当前图书稿件');
    expect(canonicalJson(source)).toBe(before);
  });
  it('shows at most three unselected candidates when fit is ambiguous', () => {
    const answer = recommendProcedures(input, ['a', 'b', 'c', 'd'].map((id) => reading(id, 'partial')));
    expect(answer.status).toBe('ambiguous'); expect(answer.candidates).toHaveLength(3); expect(answer.selectedVersionId).toBeNull();
    expect(recommendProcedures(input, [reading('a'), reading('b')]).candidates).toHaveLength(2);
  });
  it('states no fit for unavailable work, a different task kind, or different requested categories', () => {
    for (const answer of [recommendProcedures(input, [reading('a', 'none')]), recommendProcedures({ ...input, taskKind: 'writing' }, [reading('a')]), recommendProcedures({ ...input, categoryIds: ['factual-review'] }, [reading('a')])]) {
      expect(answer.status).toBe('none'); expect(answer.note).toBe('暂无适合的可用工序'); expect(answer.candidates).toEqual([]);
    }
  });
  it('changes the intent digest on a material goal change and excludes imported Skills with a stated reason', () => {
    const first = recommendProcedures(input, [reading('a')]);
    const changed = recommendProcedures({ ...input, goal: '事实核查' }, [reading('a')]);
    expect(changed.intentDigest).not.toBe(first.intentDigest);
    expect(first.excludedSkillReason).toContain('外部 Skill'); expect(first.excludedSkillReason).toContain('没有执行器');
  });
  it('marks goal edits stale, drops an old answer and keeps the selected exact revision through refresh', () => {
    const state = new ProcedureRecommendationSelection();
    const first = recommendProcedures(input, [reading('a')]);
    const firstKey = state.update(input);
    expect(state.receive(firstKey, first)).toBe(true);
    state.choose(first.candidates[0]!);
    const changed = { ...input, goal: '事实核查' };
    const changedKey = state.update(changed);
    expect(state.stale).toBe(true);
    expect(state.selected?.versionId).toBe('a-v2');
    expect(state.receive(firstKey, first)).toBe(false);
    const refreshed = recommendProcedures(changed, [reading('b')]);
    expect(state.receive(changedKey, refreshed)).toBe(true);
    expect(state.stale).toBe(false);
    expect(state.selectedNeedsUpdate).toBe(true);
    expect(state.selected?.versionId).toBe('a-v2');
    state.choose(refreshed.candidates[0]!);
    expect(state.selectedNeedsUpdate).toBe(false);
    expect(state.selected?.versionId).toBe('b-v2');
    state.clear(); expect(state.selected).toBeNull();
  });
});
