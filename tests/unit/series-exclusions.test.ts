import { describe, expect, it } from 'vitest';
import {
  SERIES_EXCLUSION_CONTINUING,
  coveringExclusions,
  excludedAfter,
  seriesExclusionCovers,
  seriesExclusionImpact,
  seriesExclusionPreviewDigest,
  seriesExclusionReason,
  seriesExclusionTarget,
  seriesScopeChangedReason,
  seriesScopeStopDetail,
  type SeriesExclusionImpactFacts,
  type SeriesKnowledgeMaterial,
  type StoredExclusion,
  type StoredExclusionRevision,
} from '../../src/service/series-exclusions.js';
import { seriesConsistencyExcludedReason, seriesConsistencyFromSources } from '../../src/service/review/series-consistency.js';
import { REVIEW_RUN_CANCELLED, SERIES_RETRIEVAL_SCOPE_CHANGED, reviewRunCategoryStopLabel, reviewRunState, reviewRunStateLabel } from '../../src/service/review/review-run-state.js';
import { SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL, type SeriesExclusionAction, type SeriesExclusionTargetKind } from '../../src/shared/protocol.js';

// Unit suite for the Series Retrieval Exclusion's pure parts (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-027): what a
// target reaches, the marker's reading of the append-only ledger, the reason as recorded, the four-part preview's words, the
// digest a stale preview is refused by, and the Review Run states a stop and its cancellation read as.

const SERIES = 'series-a';
const material = (over: Partial<SeriesKnowledgeMaterial> = {}): SeriesKnowledgeMaterial =>
  ({ seriesId: SERIES, itemId: 'item-1', knowledgeClass: 'places', sourceBookId: 'book-1', ...over });

function chain(kind: SeriesExclusionTargetKind, id: string, actions: ReadonlyArray<[SeriesExclusionAction, string]>, seriesId = SERIES): StoredExclusion {
  const target = seriesExclusionTarget(kind, id, { subject: '海边小城', knowledgeClass: 'places', bookTitle: '星河之一', displayName: '星河之一.docx' });
  const revisions: StoredExclusionRevision[] = actions.map(([action, recordedAt], index) => ({
    revisionId: `r${index + 1}`, exclusionId: `x-${kind}-${id}`, revision: index + 1, seriesId, target, action, reason: '', previewDigest: 'a'.repeat(64),
    impact: [], supersedes: index === 0 ? null : `r${index}`, recordedAt,
  }));
  const current = revisions.at(-1)!;
  return { exclusionId: current.exclusionId, seriesId, target, revisions, current, effective: current.action !== 'end', since: revisions[0]!.recordedAt };
}

const facts = (over: Partial<SeriesExclusionImpactFacts> = {}): SeriesExclusionImpactFacts => ({
  seriesTitle: '星河三部曲',
  target: seriesExclusionTarget('knowledge-item', 'item-1', { subject: '海边小城', knowledgeClass: 'places' }),
  reason: '',
  priorReason: null,
  itemsNamed: ['「海边小城」'],
  itemCount: 1,
  runsNamed: [],
  runCount: 0,
  preparedCount: 0,
  completedNamed: [],
  completedCount: 0,
  ...over,
});

describe('what a Series Retrieval Exclusion reaches', () => {
  it('reaches an item by itself, a class by its items, a member Book by what was taken from it, and no Source Version', () => {
    expect(seriesExclusionCovers(SERIES, { kind: 'knowledge-item', id: 'item-1' }, material())).toBe(true);
    expect(seriesExclusionCovers(SERIES, { kind: 'knowledge-item', id: 'item-2' }, material())).toBe(false);
    expect(seriesExclusionCovers(SERIES, { kind: 'knowledge-class', id: 'places' }, material())).toBe(true);
    expect(seriesExclusionCovers(SERIES, { kind: 'knowledge-class', id: 'characters' }, material())).toBe(false);
    expect(seriesExclusionCovers(SERIES, { kind: 'book', id: 'book-1' }, material())).toBe(true);
    expect(seriesExclusionCovers(SERIES, { kind: 'book', id: 'book-1' }, material({ sourceBookId: null }))).toBe(false);
    expect(seriesExclusionCovers(SERIES, { kind: 'source-version', id: 'item-1' }, material())).toBe(false);
    // An exclusion restricts its own Series' retrieval only (SER-029).
    expect(seriesExclusionCovers('series-b', { kind: 'knowledge-item', id: 'item-1' }, material())).toBe(false);
  });

  it('counts only the exclusions in force now, and marks history from every revision that was ever in force after the use', () => {
    const ended = chain('knowledge-item', 'item-1', [['add', '2026-10-01T00:00:00.000Z'], ['end', '2026-10-02T00:00:00.000Z']]);
    const inForce = chain('knowledge-class', 'places', [['add', '2026-10-03T00:00:00.000Z'], ['change', '2026-10-04T00:00:00.000Z']]);
    expect(coveringExclusions([ended, inForce], material()).map((entry) => entry.target.label)).toEqual(['知识类别「地点」']);
    // Ended or not, an exclusion recorded after the result was made marks it; one ended before it does not.
    expect(excludedAfter([ended], material(), '2026-09-30T00:00:00.000Z')).toBe(true);
    expect(excludedAfter([ended], material(), '2026-10-01T12:00:00.000Z')).toBe(false);
    expect(excludedAfter([inForce], material(), '2026-10-03T12:00:00.000Z')).toBe(true);
    expect(excludedAfter([inForce], material({ knowledgeClass: 'characters' }), '2026-09-30T00:00:00.000Z')).toBe(false);
  });
});

describe('an exclusion as recorded', () => {
  it('keeps a reason on one line, NFC and trimmed, up to 200 characters, or none', () => {
    expect(seriesExclusionReason('  待与\n第一部\t核对  ')).toBe('待与 第一部 核对');
    expect(seriesExclusionReason('')).toBe('');
    expect(seriesExclusionReason('长'.repeat(200))).toBe('长'.repeat(200));
    expect(seriesExclusionReason('长'.repeat(201))).toBeNull();
    expect(seriesExclusionReason('\u0000')).toBeNull();
    expect(seriesExclusionReason(7)).toBeNull();
  });

  it('names each kind of target in the editor\'s words, continuing or fixed', () => {
    expect(seriesExclusionTarget('knowledge-item', 'i', { subject: '海边小城', knowledgeClass: 'places' }))
      .toEqual({ kind: 'knowledge-item', id: 'i', label: '书系知识条目「海边小城」（地点）', continuing: SERIES_EXCLUSION_CONTINUING['knowledge-item'], read: true });
    expect(seriesExclusionTarget('knowledge-class', 'characters', {}).label).toBe('知识类别「人物」');
    expect(seriesExclusionTarget('book', 'b', { bookTitle: '星河之一' }).label).toBe('成员图书《星河之一》');
    expect(seriesExclusionTarget('source-version', 's', { displayName: '星河之一.docx', bookTitle: '星河之一' }))
      .toMatchObject({ label: '来源版本「星河之一.docx」（《星河之一》）', read: false });
    expect(SERIES_EXCLUSION_CONTINUING['knowledge-class']).toContain('以后新纳入的同类条目都一并排除');
  });
});

describe('书系检索排除影响预览', () => {
  it('separates four groups and never says what a membership change says', () => {
    const groups = seriesExclusionImpact('add', facts({ runsNamed: ['《星河之三》第 2 次审阅'], runCount: 1, preparedCount: 1, completedNamed: ['《星河之三》第 1 次审阅'], completedCount: 1 }));
    expect(groups.map((group) => group.title)).toEqual(['今后的检索', '已排队、已授权或正在运行的任务', '已完成的历史', '不受影响的授权']);
    expect(groups[1]!.changes).toEqual([
      `1 个已授权或正在运行的任务会在下一次读取前停下，显示「${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}」：《星河之三》第 2 次审阅。`,
      '它们只能「修改计划并重新授权」或「取消任务」，不能续行、重试，也不会改用别的材料。',
      '1 次已准备、尚未授权的审阅不能再授权，需要重新准备。',
    ]);
    expect(groups[1]!.unchanged).toEqual(['已经冻结的计划、授权和已经读到的内容保持原样；已经发给模型服务的内容无法收回。']);
    expect(groups[2]!.changes).toEqual(['1 个已完成的结果用过这些材料，会标上「此结果使用的材料后来被排除」：《星河之三》第 1 次审阅。']);
    expect(JSON.stringify(groups)).not.toContain('按各自冻结的范围继续');
  });

  it('names a few and counts the rest, and says when nothing is reached yet', () => {
    const many = seriesExclusionImpact('add', facts({ runsNamed: ['甲', '乙'], runCount: 7 }));
    expect(many[1]!.changes[0]).toContain('：甲、乙等 7 个。');
    expect(seriesExclusionImpact('add', facts({ itemsNamed: [], itemCount: 0 }))[0]!.changes[1]).toBe('现在还没有书系知识条目属于书系知识条目「海边小城」（地点）；以后纳入的也会被排除。');
    const source = seriesExclusionTarget('source-version', 's', { displayName: 'a.docx', bookTitle: '甲' });
    expect(seriesExclusionImpact('add', facts({ target: source, itemsNamed: [], itemCount: 0 }))[0]!.changes[1]).toContain('现在还没有哪项书系检索读取');
  });

  it('says that 修改 changes the reason alone and that 停止 restores nothing it stopped', () => {
    expect(seriesExclusionImpact('change', facts({ reason: '另有安排' }))[0]!.changes).toEqual(['排除理由改为「另有安排」。']);
    expect(seriesExclusionImpact('change', facts({ reason: '' }))[0]!.changes).toEqual(['去掉排除理由。']);
    const end = seriesExclusionImpact('end', facts());
    expect(end[1]!.unchanged).toEqual(['因这条排除停下的任务不会自动恢复，旧的授权和来源范围也不会恢复；要继续，需修改计划并重新授权。']);
    expect(end[2]!.unchanged[0]).toContain('保留这个标记');
    // It reopens only what no other exclusion in force still reaches (Issue #64 review).
    const partly = seriesExclusionImpact('end', facts({ itemCount: 3, itemsNamed: ['「甲」', '「乙」', '「丙」'], stillCount: 1, stillNamed: ['「乙」'] }));
    expect([partly[0]!.changes, partly[0]!.unchanged]).toEqual([
      ['以后的书系检索重新可以读取书系知识条目「海边小城」（地点）涉及的 2 个书系知识条目；要用到它们，仍要重新准备计划并授权。'],
      ['1 个条目仍被其他在生效的检索排除覆盖，以后的书系检索仍然不读取它们：「乙」。'],
    ]);
  });

  it('digests every line it shows, the chain it follows and what governs it', () => {
    const groups = seriesExclusionImpact('add', facts());
    const base = { seriesId: SERIES, action: 'add' as const, exclusionId: null, target: facts().target, reason: '', chainHead: null, governingDigest: 'g'.repeat(64), groups };
    const digest = seriesExclusionPreviewDigest(base);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(seriesExclusionPreviewDigest({ ...base })).toBe(digest);
    expect(seriesExclusionPreviewDigest({ ...base, governingDigest: 'h'.repeat(64) })).not.toBe(digest);
    expect(seriesExclusionPreviewDigest({ ...base, reason: '理由' })).not.toBe(digest);
    expect(seriesExclusionPreviewDigest({ ...base, chainHead: 'r1' })).not.toBe(digest);
    expect(seriesExclusionPreviewDigest({ ...base, groups: seriesExclusionImpact('add', facts({ runCount: 1, runsNamed: ['甲'] })) })).not.toBe(digest);
  });
});

describe('a stop for an exclusion, as a Review Run reads it', () => {
  it('reads 书系检索范围已变化 · 需要重新确认计划 once not driven, never 可继续审阅, and 已取消 once cancelled', () => {
    const left = { pending: true, materialized: false };
    const done = { pending: false, materialized: true };
    expect(reviewRunState({ authorized: true, driving: false, categories: [left], stop: 'scope-changed' })).toEqual({ state: 'scope-changed', canContinue: false });
    expect(reviewRunState({ authorized: true, driving: true, categories: [left], stop: 'scope-changed' })).toEqual({ state: 'running', canContinue: false });
    expect(reviewRunState({ authorized: true, driving: false, categories: [done], stop: 'cancelled' })).toEqual({ state: 'cancelled', canContinue: false });
    expect(reviewRunState({ authorized: false, driving: false, categories: [left], stop: 'scope-changed' })).toEqual({ state: 'prepared', canContinue: false });
    expect(reviewRunState({ authorized: true, driving: false, categories: [left], stop: null })).toEqual({ state: 'partial', canContinue: true });
    expect(reviewRunStateLabel('scope-changed', false)).toBe(SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL);
    expect(reviewRunStateLabel('cancelled', false)).toBe('已取消');
    expect(reviewRunCategoryStopLabel(SERIES_RETRIEVAL_SCOPE_CHANGED)).toBe(SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL);
    expect(reviewRunCategoryStopLabel(REVIEW_RUN_CANCELLED)).toBe('已取消');
    expect(reviewRunCategoryStopLabel('REVIEW_PLAN_CHANGED')).toBeNull();
  });

  it('says what was excluded and what is left to do', () => {
    expect(seriesScopeStopDetail(['知识类别「地点」'])).toBe(`${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}：这一类所依据的知识类别「地点」在这次审阅准备之后被排除在书系检索之外，它在读取前停下，没有发送任何内容。只能修改计划并重新授权，或取消任务。`);
    expect(seriesScopeChangedReason('书系一致性', ['甲', '乙'])).toBe(`「书系一致性」：${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}——它所依据的甲、乙在这次审阅准备之后被排除在书系检索之外；请重新准备这次审阅。`);
  });

  it('tells a review left with nothing because of exclusions from one that never had knowledge', () => {
    const memberships = [{ seriesId: SERIES, title: '星河三部曲' }];
    expect(seriesConsistencyFromSources(memberships, [{ seriesId: SERIES, title: '星河三部曲', items: [] }], 1))
      .toEqual({ kind: 'unavailable', reason: seriesConsistencyExcludedReason(['星河三部曲']) });
    expect(seriesConsistencyFromSources(memberships, [{ seriesId: SERIES, title: '星河三部曲', items: [] }], 0).kind).toBe('unavailable');
    expect(seriesConsistencyExcludedReason(['甲', '乙'])).toBe('这本书所在的书系「甲」、「乙」可用于一致性审阅的书系知识都已排除在书系检索之外；停止排除或纳入其他书系知识后才能选。');
  });
});
