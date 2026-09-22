import { describe, expect, it } from 'vitest';
import type {
  AnalysisConflictProjection,
  ProviderProcessingPin,
  ResultSetPolicyPin,
  RunBudgetCeilingState,
} from '../../src/shared/protocol.js';
import {
  ANALYSIS_CONFLICT_KIND_LABELS,
  ANALYSIS_ENTITY_KIND_LABELS,
  RUN_REPORT_STAGE_LABELS,
  analysisFourSentences,
  durationLabel,
  runReportUnitsSentence,
  RUN_LIVENESS_UNMEASURED_STALE_MS,
  analysisBlockCountLabel,
  analysisKindSubtitle,
  analysisProvenanceSummary,
  attemptStateLabel,
  elapsedLabel,
  launchPolicyIntegritySentence,
  localInstantLabel,
  runBudgetCeilingLabel,
  runStepIsStale,
  taskAuthorizationDispatchNote,
} from '../../src/renderer/plan-preview-labels.js';

/*
 * The renderer scope statements of #337 derive from the launch their projection carries. Under
 * `development-ci` every one of them must still render the exact bytes it rendered as a fixed string
 * at `dev@5f3c4b44`, which is what these literals are: captured before the derivation existed, asserted
 * here so a derivation that drifts fails in `test` rather than in a Journey. The frozen plan's own
 * readings — its remote binding and its Provider Processing pin — moved with the plan into the Task
 * Drawer (Issue #418), and are pinned where the drawer's projection makes them (tests/unit/task-plan.test.ts).
 */
const CAPTURED_DEVELOPMENT_CI = {
  analysisKindSubtitle: '一个精确版本化的覆盖式分析种类；远程绑定被 Provider Processing v1 拒绝，结果集修订版不修改稿件。',
  taskAuthorizationDispatchNote: '本流程只冻结并记录本次标准直接授权；Provider Processing v1 固定拒绝派发。',
  launchPolicyIntegritySentence: '策略完整性：已验证。当前开发与持续集成范围保持零次实时传输。',
} as const;

const DENIED_PIN: ProviderProcessingPin = {
  operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0,
};
const ELIGIBLE_PIN: ProviderProcessingPin = {
  operationalScope: 'developer-live', version: 'v5', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run',
};
const DENIED_POLICY_PIN: ResultSetPolicyPin = {
  operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v5', liveTransmissions: 0,
};
const ELIGIBLE_POLICY_PIN: ResultSetPolicyPin = {
  operationalScope: 'developer-live', providerProcessingVersion: 'v5', activePolicySetVersion: 'v5', liveTransmissions: 'bounded-by-run',
};

describe('runBudgetCeilingLabel', () => {
  it('states unset for the development-ci reading and the token ceiling for a set developer-live ceiling', () => {
    expect(runBudgetCeilingLabel('unset' satisfies RunBudgetCeilingState)).toBe('未设置任务预算上限');
    expect(runBudgetCeilingLabel({ kind: 'tokens', maxTotalTokens: 250_000 } satisfies RunBudgetCeilingState))
      .toBe('任务运行预算上限：250000 tokens');
  });
});

describe('taskAuthorizationDispatchNote', () => {
  it('reproduces the development-ci bytes the note rendered as a fixed string', () => {
    expect(taskAuthorizationDispatchNote(DENIED_PIN)).toBe(CAPTURED_DEVELOPMENT_CI.taskAuthorizationDispatchNote);
  });

  it('states the bounded live permission of an eligible-only plan instead of a fixed refusal', () => {
    expect(taskAuthorizationDispatchNote(ELIGIBLE_PIN))
      .toBe('本流程只冻结并记录本次标准直接授权；Provider Processing v5 仅允许运行边界内的实时传输。');
  });

  it('states only what the flow does before a plan has frozen a pin', () => {
    expect(taskAuthorizationDispatchNote(null)).toBe('本流程只冻结并记录本次标准直接授权。');
    expect(taskAuthorizationDispatchNote(null)).not.toContain('Provider Processing');
  });
});

describe('analysisKindSubtitle', () => {
  it('reproduces the development-ci bytes the analysis card rendered as a fixed string', () => {
    expect(analysisKindSubtitle(DENIED_PIN)).toBe(CAPTURED_DEVELOPMENT_CI.analysisKindSubtitle);
  });

  it('reads the same denial from a Result Set Revision policy pin when only a Revision exists', () => {
    expect(analysisKindSubtitle(DENIED_POLICY_PIN)).toBe(CAPTURED_DEVELOPMENT_CI.analysisKindSubtitle);
  });

  it('states an eligible-only binding from either pin shape', () => {
    const eligible = '一个精确版本化的覆盖式分析种类；远程绑定在 Provider Processing v5 下仅限资格，结果集修订版不修改稿件。';
    expect(analysisKindSubtitle(ELIGIBLE_PIN)).toBe(eligible);
    expect(analysisKindSubtitle(ELIGIBLE_POLICY_PIN)).toBe(eligible);
  });

  it('drops the binding clause, and only that clause, when neither a plan nor a Revision exists', () => {
    expect(analysisKindSubtitle(null)).toBe('一个精确版本化的覆盖式分析种类；结果集修订版不修改稿件。');
    expect(analysisKindSubtitle(null)).not.toContain('Provider Processing');
  });
});

describe('launchPolicyIntegritySentence', () => {
  it('reproduces the development-ci bytes J-12 pins, from the label alone', () => {
    expect(launchPolicyIntegritySentence('开发与持续集成：零次实时传输'))
      .toBe(CAPTURED_DEVELOPMENT_CI.launchPolicyIntegritySentence);
  });

  it('reads a developer-live launch as its own scope and bound', () => {
    expect(launchPolicyIntegritySentence('开发者实时：实时传输受运行边界约束'))
      .toBe('策略完整性：已验证。当前开发者实时范围保持实时传输受运行边界约束。');
  });
});

describe('runStepIsStale', () => {
  // V2-UX-LIVE-003 states two thresholds and this is the whole of the stale rule: the measured bar
  // once the Run has settled a step, the fixed one only until then. Both are exclusive comparisons,
  // so a step exactly at the bar is still ordinary — the surface accuses nothing it has not measured.
  it('uses the fixed threshold only before this Run has settled a step', () => {
    expect(RUN_LIVENESS_UNMEASURED_STALE_MS).toBe(180_000);
    expect(runStepIsStale(179_999, null)).toBe(false);
    expect(runStepIsStale(180_000, null)).toBe(false);
    expect(runStepIsStale(180_001, null)).toBe(true);
  });

  it('measures against twice the longest settled step of this Run once one exists', () => {
    expect(runStepIsStale(200_000, 150_000)).toBe(false);
    expect(runStepIsStale(300_000, 150_000)).toBe(false);
    expect(runStepIsStale(300_001, 150_000)).toBe(true);
    // A Run of fast steps is judged by its own pace, not by the three-minute stand-in.
    expect(runStepIsStale(21_000, 10_000)).toBe(true);
    // And a Run of slow steps is not accused merely for passing three minutes.
    expect(runStepIsStale(240_000, 150_000)).toBe(false);
  });

  it('never reads a step at zero elapsed as stale', () => {
    expect(runStepIsStale(0, null)).toBe(false);
    expect(runStepIsStale(0, 150_000)).toBe(false);
  });
});

describe('elapsedLabel', () => {
  it('reads as mm:ss, floors partial seconds, and carries hours into the minutes place', () => {
    expect(elapsedLabel(0)).toBe('00:00');
    expect(elapsedLabel(999)).toBe('00:00');
    expect(elapsedLabel(1_000)).toBe('00:01');
    expect(elapsedLabel(90_500)).toBe('01:30');
    expect(elapsedLabel(3_723_000)).toBe('62:03');
  });

  it('never reads negative, so a clock that stepped backwards shows no minus sign', () => {
    expect(elapsedLabel(-5_000)).toBe('00:00');
  });
});

describe('attemptStateLabel', () => {
  it('names each Provider attempt state in the vocabulary of the Decision Layer', () => {
    expect(attemptStateLabel('dispatched')).toBe('已派发');
    expect(attemptStateLabel('awaiting-response')).toBe('等待模型响应');
    expect(attemptStateLabel('retrying')).toBe('安全重试中');
  });
});

describe('localInstantLabel', () => {
  it('renders an absolute local date and time to the second, never the ISO instant itself', () => {
    const at = new Date('2026-09-07T13:45:07.250Z');
    const label = localInstantLabel(at.toISOString());
    expect(label).toMatch(/^\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}:\d{2}$/u);
    expect(label).not.toBe(at.toISOString());
    // The components are this host's local reading of that instant, not UTC re-printed.
    expect(label).toContain(String(at.getFullYear()));
    expect(label).toContain(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:07`);
  });

  it('reads midnight as hour 00 rather than 24', () => {
    const midnight = new Date(2026, 8, 7, 0, 0, 0);
    expect(localInstantLabel(midnight.toISOString())).toMatch(/ 00:00:00$/u);
  });

  it('returns an unparsable value unchanged rather than inventing a time', () => {
    expect(localInstantLabel('not-an-instant')).toBe('not-an-instant');
  });
});

/** Every conflict kind the analysis types admit; the labels are asserted over exactly this list. */
const ANALYSIS_CONFLICT_KINDS: ReadonlyArray<AnalysisConflictProjection['kind']> = [
  'unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence',
];

const range = (blockId: string, fromGrapheme: number | null = null, toGrapheme: number | null = null) =>
  ({ blockId, fromGrapheme, toGrapheme });

describe('analysisBlockCountLabel', () => {
  it('counts distinct blocks, whole-block and partial ranges alike', () => {
    expect(analysisBlockCountLabel([range('blk_a'), range('blk_b', 0, 12), range('blk_c')])).toBe('3 个内容块');
  });

  it('counts a block once however many ranges of it an item carries', () => {
    expect(analysisBlockCountLabel([range('blk_a', 0, 5), range('blk_a', 9, 40), range('blk_a')])).toBe('1 个内容块');
  });

  it('reads no exact range rather than zero blocks when the collection is empty', () => {
    expect(analysisBlockCountLabel([])).toBe('无精确范围');
  });
});

describe('analysisProvenanceSummary', () => {
  // V2-UX-LAYER-006's own example, so the Decision Layer's reading is pinned literally.
  it('reads as units and a block count, in ascending deduplicated unit order', () => {
    const ranges = Array.from({ length: 25 }, (_, index) => range(`blk_${index}`));
    expect(analysisProvenanceSummary([5, 1, 2, 1], ranges)).toBe('来自单元 1、2、5 · 25 个内容块');
  });

  it('sorts units by ordinal rather than by their decimal text', () => {
    expect(analysisProvenanceSummary([10, 2], [range('blk_a')])).toBe('来自单元 2、10 · 1 个内容块');
  });

  it('reads a single-unit item with its one ordinal', () => {
    expect(analysisProvenanceSummary([3], [range('blk_a'), range('blk_b', 2, 8)])).toBe('来自单元 3 · 2 个内容块');
  });

  it('states the block count alone when the item records no unit, and never an empty unit list', () => {
    expect(analysisProvenanceSummary([], [range('blk_a')])).toBe('1 个内容块');
    expect(analysisProvenanceSummary([], [])).toBe('无精确范围');
  });

  it('says no exact range for an item with units but no recorded range', () => {
    expect(analysisProvenanceSummary([2, 4], [])).toBe('来自单元 2、4 · 无精确范围');
  });
});

describe('ANALYSIS_CONFLICT_KIND_LABELS', () => {
  it('labels every conflict kind the union admits, and no kind it does not', () => {
    expect(Object.keys(ANALYSIS_CONFLICT_KIND_LABELS).sort()).toStrictEqual([...ANALYSIS_CONFLICT_KINDS].sort());
  });

  it('gives each kind a distinct, non-empty label that is never the reducer token itself', () => {
    const labels = ANALYSIS_CONFLICT_KINDS.map((kind) => ANALYSIS_CONFLICT_KIND_LABELS[kind]);
    for (const [index, kind] of ANALYSIS_CONFLICT_KINDS.entries()) {
      expect(labels[index]).not.toBe('');
      expect(labels[index]).not.toBe(kind);
    }
    expect(new Set(labels).size).toBe(ANALYSIS_CONFLICT_KINDS.length);
  });
});

describe('analysisFourSentences', () => {
  const STATEMENT = '仅为模型输出的结构化归纳；不构成事实判定、编辑评审或稿件变更。' as const;
  const settled = {
    coverage: { state: 'partial', unitsTotal: 8, unitsClosed: 7, gapCount: 1 },
    reducerClosure: { state: 'closed-with-gaps' },
    freshness: { state: 'current' },
    assurance: { unresolvedConflictCount: 4, unresolvedItemCount: 2, lowConfidenceUnitCount: 1, crossUnitFindingCount: 3, sampledPrecision: { size: 5, upheld: 4, estimate: 0.8 }, statement: STATEMENT },
    manuscriptPin: { revisionLabel: 'r1' },
  } as const;

  it('reads the four axes in the order and under the headings ANALYSIS-025 fixes', () => {
    const sentences = analysisFourSentences(settled);
    expect(sentences.map((sentence) => [sentence.axis, sentence.heading])).toEqual([
      ['coverage', '覆盖范围'], ['reducer-closure', '全书综合'], ['freshness', '与当前稿件'], ['assurance', '可信程度'],
    ]);
    expect(sentences.every((sentence) => sentence.nextAction.length > 0)).toBe(true);
  });

  it('says what was not read and sends the editor to where it is fixed', () => {
    const [coverage, synthesis] = analysisFourSentences(settled);
    expect(coverage!.sentence).toBe('全稿分成 8 个阅读范围，已读完 7 个；还有 1 个没有读成，在「各章」里标为尚未分析。');
    expect(coverage!.target).toBe('history');
    expect(synthesis!.sentence).toContain('没有读成的范围不在其中');
    const complete = analysisFourSentences({ ...settled, coverage: { state: 'complete', unitsTotal: 8, unitsClosed: 8, gapCount: 0 }, reducerClosure: { state: 'closed' } });
    expect(complete[0]!.sentence).toBe('全稿分成 8 个阅读范围，全部读完。');
    expect([complete[0]!.target, complete[1]!.target]).toEqual([null, null]);
  });

  it('states freshness against the manuscript the analysis read, in all three states', () => {
    const reading = (state: 'current' | 'stale' | 'superseded'): string => analysisFourSentences({ ...settled, freshness: { state } })[2]!.sentence;
    expect(reading('current')).toBe('这份分析读的是 r1，稿件此后没有改动。');
    expect(reading('stale')).toBe('这份分析读的是 r1，稿件此后有改动，分析已不是最新。');
    expect(reading('superseded')).toContain('之后已有更新的分析');
  });

  it('counts the leads and points at 审阅 without listing them, and keeps the kind’s own statement whole', () => {
    const trust = analysisFourSentences(settled)[3]!;
    expect(trust.sentence.startsWith(STATEMENT)).toBe(true);
    // Deterministic conflicts and model-driven cross-unit findings are one reading for the editor: leads.
    expect(trust.sentence).toContain('另有 7 处前后不一致的线索、2 项未决事项，归入审阅的「情节逻辑与前后一致」');
    expect(trust.sentence).toContain('抽样复核了 5 条，4 条成立。');
    expect(trust.sentence).toContain('其中 1 个阅读范围模型自评把握较低。');
    const clean = analysisFourSentences({ ...settled, assurance: { ...settled.assurance, unresolvedConflictCount: 0, unresolvedItemCount: 0, crossUnitFindingCount: 0, lowConfidenceUnitCount: 0, sampledPrecision: null } })[3]!;
    expect(clean.sentence).toBe(STATEMENT);
  });

  it('never speaks a technical word in the decision layer', () => {
    const text = analysisFourSentences(settled).map((sentence) => sentence.sentence + sentence.nextAction).join('');
    for (const word of ['单元', 'Revision', 'reducer', '归约', '摘要', 'digest', 'token']) expect(text).not.toContain(word);
  });
});

describe('Run Report labels', () => {
  it('names every stage and entity kind in editorial Chinese', () => {
    expect(Object.values(RUN_REPORT_STAGE_LABELS)).toEqual(['逐个阅读范围分析', '跨范围比对', '抽样复核', '合并整理']);
    expect(Object.values(ANALYSIS_ENTITY_KIND_LABELS).every((label) => /^[一-鿿]+$/u.test(label))).toBe(true);
  });

  it('states a duration in the reader’s units and never invents one', () => {
    expect([durationLabel(null), durationLabel(0), durationLabel(999), durationLabel(1500), durationLabel(61_000), durationLabel(125_400)])
      .toEqual(['—', '不到 1 秒', '不到 1 秒', '2 秒', '1 分 1 秒', '2 分 5 秒']);
  });

  it('reads the unit accounting as one sentence of the record’s own counts', () => {
    expect(runReportUnitsSentence({ submitted: 8, reused: 6, recomputed: 2, gaps: 1, retried: 1 }))
      .toBe('共 8 个阅读范围：沿用上一份 6 个，重新分析 2 个，其中 1 个没有读成，1 个安全重试过。');
  });
});
