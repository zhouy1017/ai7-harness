import {
  EVIDENCE_ASSURANCE_LEVEL_LABELS,
  FACTUAL_ACTION_NEED_LABELS,
  FACTUAL_SOURCE_CONDITION_LABELS,
  type EvidenceSourceCardProjection,
  type FactualReviewDecisionProjection,
  type FactualVerificationLensProjection,
  type FactualVerificationOutcome,
  type FactualVerificationResultProjection,
} from '../shared/protocol.js';

/**
 * The words of the Fact-check Lens and the Evidence Workspace (Issue #901; V2-UX-FACT-004 to 013, EVID-001 to 013, EASSURE-001,
 * FREV-004 to 011, CORR-001 to 012). Pure: every line is a function of the projection it reads, so the unit suite reads exactly
 * what the editor reads. No line calls a result 已验证, a source a verdict, or a level a quality: the three states stay apart and
 * a candidate is always said to be unchecked.
 */
export const FACT_LENS_HEADING = '事实核查 · 核查结果';
export const FACT_LENS_NOTE = '每条断言的三项状态分开显示：引文完整性、断言支持、事实核查。核查结果是证据评估，不是事实定论，也不构成审阅决定。';
export const FACT_LENS_MORE = '显示更多核查结果';
export const FACT_LENS_EMPTY_FILTERED = '没有符合筛选的核查结果。';
export const FACT_LENS_FILTER_LABELS = {
  chapter: '章',
  outcome: '核查状态',
  severity: '风险',
  sourceCondition: '来源情况',
  actionNeed: '需要处理',
} as const;
export const FACT_LENS_FILTER_ALL = '全部';
export const FACT_SEVERITY_LABELS = { A: '高（A）', B: '中（B）', C: '低（C）' } as const;
export const FACT_STATE_TERMS = ['引文完整性', '断言支持', '事实核查'] as const;
export const FACT_OPEN_WORKSPACE = '查看证据';
export const FACT_CLOSE_WORKSPACE = '收起证据';

export const EVIDENCE_WORKSPACE_HEADING = '证据工作区';
export const EVIDENCE_WORDING_LABEL = '稿件原文';
export const EVIDENCE_STATEMENT_LABEL = 'AI7 核查的表述';
export const EVIDENCE_STATEMENT_NOTE = 'AI7 的表述只说明在核查什么，不替代稿件原文。';
export const EVIDENCE_SOURCES_HEADING = '来源';
export const EVIDENCE_SOURCES_NONE = '这条断言没有来源：这次运行没有为它找到或取回任何来源。';
export const EVIDENCE_SOURCES_MORE = '更多来源';
export const EVIDENCE_PIN = '加入对比';
export const EVIDENCE_UNPIN = '移出对比';
export const EVIDENCE_PIN_FULL = '对比最多 4 个来源；先移出一个再加入。';
export const EVIDENCE_MATRIX_HEADING = '来源对比';
export const EVIDENCE_MATRIX_HINT = '选 2 至 4 个来源加入对比；对比不增加任何来源的证明力。';
export const EVIDENCE_OPEN_SOURCE = '在来源与证据中查看';
export const EVIDENCE_CONFLICTS_HEADING = '相互冲突的来源';
export const EVIDENCE_SUMMARY_HEADING = 'AI7 对比摘要';
export const EVIDENCE_SUMMARY_NOT_EVIDENCE = '非证据：这段摘要只整理下面的来源卡片，每一句都链接到它所说的来源；它本身不是证据。';
export const EVIDENCE_HISTORY_HEADING = '核查结果的各个版本';
export const EVIDENCE_LIMITATIONS_HEADING = '局限';
export const EVIDENCE_NO_MUTATION = '证据工作区只用于阅读与比较：它不改稿、不作出提案或审阅决定、不批准任何应用。';

export const DECISION_HEADING = '核查审阅决定';
export const DECISION_NOTE = '五项都没有预选；记录后不可更改，后续的新结果版本会另行等待你的决定。';
export const DECISION_RECORD = '记录核查审阅决定';
export const DECISION_OWN_WORDS_LABEL = '你的结论';
export const DECISION_REASON_HEADING = '理由（可不填）';
export const DECISION_REASON_FREE = '自己写理由';
export const DECISION_REASON_FIELD = '理由';
export const DECISION_RECORDED = '已记录核查审阅决定。';
export const DECISION_FAILED = '无法记录核查审阅决定。';
export const DECISION_SUPERSEDED = '这项决定针对的是较早的结果版本；当前版本等待你的决定。';

export const CORRECTION_PREPARE = '准备更正提案';
export const CORRECTION_HEADING = '更正提案';
export const CORRECTION_OWN_EDIT = '自行编辑';
export const CORRECTION_OWN_TEXT_LABEL = '改为';
export const CORRECTION_RATIONALE_LABEL = '更正理由';
export const CORRECTION_RANGES_HEADING = '要更正的位置';
export const CORRECTION_RANGES_NOTE = '只列出与这段文字完全相同的出现处；默认只改这条发现所在的一处。相似但不相同的文字不会被列入。';
export const CORRECTION_SAVE = '保存为更正提案';
export const CORRECTION_SAVED_GO = '在稿件中查看';
export const CORRECTION_FAILED = '无法保存为更正提案。';
export const CORRECTION_PREPARE_FAILED = '无法准备更正提案。';
export const CORRECTION_NO_VARIANTS = '这次运行没有给出更正方案；可以自行编辑。';

export const FACTUAL_LINEAGE_HEADING = '事实核查来源';

const OUTCOME_TONES: Readonly<Record<FactualVerificationOutcome, 'neutral' | 'positive' | 'warning' | 'danger'>> = {
  待核查: 'neutral', 证据支持: 'positive', 疑似错误: 'danger', 证据不足: 'warning', 证据冲突: 'warning', 无法核实: 'neutral',
};

export function outcomeTone(outcome: FactualVerificationOutcome): 'neutral' | 'positive' | 'warning' | 'danger' {
  return OUTCOME_TONES[outcome];
}

/** The three states of a result, each with its own term: never one badge (FACT-007). */
export function factStateLines(result: Pick<FactualVerificationResultProjection, 'states'>): ReadonlyArray<readonly [string, string]> {
  return [
    [FACT_STATE_TERMS[0], result.states.referenceIntegrity === 'verified' ? '引文已在原文中定位' : '引文未能定位'],
    [FACT_STATE_TERMS[1], result.states.claimSupport],
    [FACT_STATE_TERMS[2], result.states.factualVerification],
  ];
}

/** Where the result stands in the manuscript: its chapter heading, when it has one. */
export function factLocationLine(result: Pick<FactualVerificationResultProjection, 'heading' | 'category'>): string {
  return `${result.heading ?? '正文'} · ${result.category}`;
}

/** The level the Run executed, and the level the plan named when an offline start lowered it (EASSURE-002). */
export function factLevelLine(result: Pick<FactualVerificationResultProjection, 'level' | 'plannedLevel' | 'disclosure'>): string {
  const line = `证据保证级别：${EVIDENCE_ASSURANCE_LEVEL_LABELS[result.level]}`;
  return result.disclosure === null ? line : `${line}（计划为${EVIDENCE_ASSURANCE_LEVEL_LABELS[result.plannedLevel]}；${result.disclosure}）`;
}

export function factSourceCountsLine(result: Pick<FactualVerificationResultProjection, 'sourceCounts' | 'sourceCondition'>): string {
  const { checked, candidates, independent, reused } = result.sourceCounts;
  const parts = [`已核对来源 ${checked} 个`, `候选来源 ${candidates} 个`];
  if (checked > 0) parts.push(`相互独立 ${independent} 组`);
  if (reused > 0) parts.push(`沿用此前取回 ${reused} 个`);
  return `${FACTUAL_SOURCE_CONDITION_LABELS[result.sourceCondition]} · ${parts.join(' · ')}`;
}

export function factDecisionLine(decision: FactualReviewDecisionProjection | null): string {
  if (decision === null) return '尚未作出核查审阅决定';
  const own = decision.ownWords === null ? '' : `：${decision.ownWords}`;
  return `${decision.dispositionLabel}${own} · 针对第 ${decision.boundVersion} 版${decision.superseded ? ' · 已有新版本' : ''}`;
}

export function factActionLine(result: Pick<FactualVerificationResultProjection, 'actionNeed'>): string {
  return FACTUAL_ACTION_NEED_LABELS[result.actionNeed];
}

export function factLensCountsLine(lens: Pick<FactualVerificationLensProjection, 'counts' | 'total'>): string {
  const counted = lens.counts.filter((entry) => entry.count > 0).map((entry) => `${entry.outcome} ${entry.count}`);
  return counted.length === 0 ? '还没有核查结果' : `共 ${lens.total} 条 · ${counted.join(' · ')}`;
}

/** One source card's discrete check states (EVID-003): each field stated, a missing one said to be missing. */
export function sourceCardFacts(card: EvidenceSourceCardProjection, instant: (iso: string) => string): ReadonlyArray<readonly [string, string]> {
  return [
    ['核对状态', card.checkLabel],
    ['与断言的关系', card.relation],
    ['来源版本', card.sourceVersion === null ? '未取回' : card.sourceVersion.slice(0, 12)],
    ['发布方', card.publisher ?? '未知'],
    ['获取时间', card.capturedAt === null ? '未取回' : instant(card.capturedAt)],
    ['新鲜度', card.freshnessLabel],
    ['引文完整性', card.integrityLabel],
    ['来源关系', card.lineageLabel],
    ...(card.reused ? [['取回', '沿用此前运行精确取回的内容'] as const] : []),
  ];
}

export function sourceCardTitle(card: Pick<EvidenceSourceCardProjection, 'title' | 'sourceRef' | 'sourceKind'>): string {
  if (card.title !== null && card.title.trim().length > 0) return card.title.trim();
  return card.sourceKind === 'in-book' ? '书内来源' : card.sourceRef;
}
