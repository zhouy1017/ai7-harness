import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MIN_ANCHOR_CHARACTERS,
  SOURCE_TRANSLATION_NOT_ADMITTED,
  SOURCE_TRANSLATION_UNAVAILABLE,
  alignCitation,
  evidenceCitations,
  evidencePassage,
  evidenceSentences,
  evidenceStaleness,
  needsSourceTranslation,
  researchSnapshotDigest,
  retainUnitEvidence,
  retainedPageOf,
  searchHitsOf,
  sourceTranslation,
  titleSiteLabel,
  type RetainedPage,
  type UnitResearchFinding,
} from '../../src/service/analysis/factual-review-evidence.js';
import type { ResearchSnapshot } from '../../src/service/provider/research-snapshot-cache.js';
import {
  findingResearchLines,
  readFindingResearch,
  findingSourceLine,
  researchUnitLine,
  sourceAlignmentLine,
  sourceStalenessLine,
  sourceTranslationView,
} from '../../src/renderer/research-evidence-labels.js';
import type { ResearchEvidenceBookProjection, ResearchEvidenceProjection } from '../../src/shared/protocol.js';

// Issue #425 (S70): the External Evidence Retention Procedure, provider-free. Every capture here is a synthetic public text
// written for the test; no manuscript text, no network, no model.
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const CAPTURE = '曾侯乙尊盘出土于1978年。它由尊与盘两件器物组成，现藏湖北省博物馆。\n铸造采用失蜡法，这一说法仍有争议！';
const instant = (iso: string): string => `本地 ${iso}`;

describe('sentence alignment against the captured text', () => {
  it('splits the capture into sentences at Chinese and Latin stops and at line breaks', () => {
    const sentences = evidenceSentences(CAPTURE).map((range) => CAPTURE.slice(range.from, range.to));
    expect(sentences).toEqual(['曾侯乙尊盘出土于1978年。', '它由尊与盘两件器物组成，现藏湖北省博物馆。', '铸造采用失蜡法，这一说法仍有争议！']);
    expect(evidenceSentences('First claim. Second one? Third').map((range) => 'First claim. Second one? Third'.slice(range.from, range.to)))
      .toEqual(['First claim.', 'Second one?', 'Third']);
  });

  it('aligns a citation whose words are all in the capture, with exact offsets and the sentence they start in', () => {
    const aligned = alignCitation(['现藏湖北省博物馆'], CAPTURE);
    expect(aligned.alignment).toBe('aligned');
    expect(aligned.coverage).toBe(1);
    expect(aligned.anchors).toHaveLength(1);
    const [anchor] = aligned.anchors;
    expect(CAPTURE.slice(anchor!.from, anchor!.to)).toBe('现藏湖北省博物馆');
    expect(anchor!.sentence).toBe(2);
    expect(evidencePassage(CAPTURE, aligned.anchors)).toBe('它由尊与盘两件器物组成，现藏湖北省博物馆。');
  });

  it('folds width, quotation marks and whitespace, so a citation spelled differently still aligns', () => {
    const aligned = alignCitation(['「出土于１９７８年」'], CAPTURE);
    expect(aligned.alignment).toBe('aligned');
    expect(CAPTURE.slice(aligned.anchors[0]!.from, aligned.anchors[0]!.to)).toBe('出土于1978年');
  });

  it('keeps UTF-16 anchors exact after supplementary characters and reports a broken citation as 未能对应', () => {
    const captured = '😀𠀀。A public source records a blue vessel.';
    const aligned = alignCitation(['blue vessel'], captured);
    expect(captured.slice(aligned.anchors[0]!.from, aligned.anchors[0]!.to)).toBe('blue vessel');
    expect(aligned.anchors[0]!.sentence).toBe(2);
    expect(alignCitation(['unrelated quotation'], captured).alignment).toBe('unaligned');
    expect(alignCitation(['𠀀𠀁'], '😀𠀀𠀁。').anchors).toEqual([{ from: 2, to: 6, sentence: 1 }]);
  });

  it('marks a citation 部分对应 when only some of its pieces are in the capture', () => {
    const partial = alignCitation(['由尊与盘两件器物组成，出土于湖南长沙'], CAPTURE);
    expect(partial.alignment).toBe('partial');
    expect(partial.anchors.map((anchor) => CAPTURE.slice(anchor.from, anchor.to))).toEqual(['由尊与盘两件器物组成']);
    expect(partial.coverage).toBeGreaterThan(0);
    expect(partial.coverage).toBeLessThan(1);
    // A claim with no pieces is partial on a common run of at least half of it.
    expect(alignCitation(['采用失蜡法铸造而成'], CAPTURE).alignment).toBe('partial');
  });

  it('marks a citation 未能对应 when its words are not in the capture, and never stands on a run shorter than four', () => {
    expect(alignCitation(['青铜器出土于陕西宝鸡'], CAPTURE)).toEqual({ alignment: 'unaligned', anchors: [], coverage: 0 });
    expect(MIN_ANCHOR_CHARACTERS).toBe(4);
    expect(alignCitation(['尊'], CAPTURE).alignment).toBe('unaligned');
    expect(alignCitation(['盘的', '器物的'], CAPTURE).alignment).toBe('unaligned');
    expect(alignCitation(['湖北省博物馆'], '').alignment).toBe('unaligned');
  });

  it('aligns several quoted pieces only when every one of them is there', () => {
    expect(alignCitation(['1978年', '湖北省博物馆'], CAPTURE).alignment).toBe('aligned');
    const one = alignCitation(['1978年', '故宫博物院藏品'], CAPTURE);
    expect(one.alignment).toBe('partial');
    expect(one.anchors).toHaveLength(1);
  });
});

const FINDING: UnitResearchFinding = {
  findingId: `fnd_${'a'.repeat(24)}`, blockId: `blk_${'b'.repeat(24)}`, quote: '这件器物现藏湖北省博物馆', category: '机构',
  basis: '检索所见 维基百科 与 https://museum.example.org/zun 均称其「现藏湖北省博物馆」。',
};

describe('citations from the model’s basis', () => {
  const sources = [
    { url: 'https://zh.wikipedia.org/wiki/zun', title: '曾侯乙青铜尊盘 - 维基百科', snippet: '现藏湖北省博物馆。', via: 'search' as const },
    { url: 'https://museum.example.org/zun', title: '馆藏', snippet: null, via: 'search' as const },
    { url: 'https://news.example.com/a', title: '新闻详情', snippet: '一则新闻。', via: 'search' as const },
    { url: 'https://fetched.example.net/page', title: null, snippet: null, via: 'fetch' as const },
  ];

  it('cites a source the basis names by address, by host or by the site its title names; the quoted words are the claim', () => {
    const citations = evidenceCitations([FINDING], sources);
    expect(citations.filter((entry) => entry.findingId === FINDING.findingId).map((entry) => entry.url))
      .toEqual(['https://museum.example.org/zun', 'https://zh.wikipedia.org/wiki/zun']);
    expect(citations[0]!.claim).toEqual({ text: '现藏湖北省博物馆', origin: 'basis-quotation' });
    expect(citations[0]!.queryClass).toBe('机构');
    // A page the model fetched that no finding named is still a source the unit used, kept without a finding.
    expect(citations.at(-1)).toEqual({ findingId: null, queryClass: 'uncited', url: 'https://fetched.example.net/page', claim: null, claimPieces: [] });
    expect(titleSiteLabel('曾侯乙青铜尊盘 - 维基百科')).toBe('维基百科');
    expect(titleSiteLabel('新闻详情')).toBeNull();
  });

  it('looks for the finding’s own quotation when the basis quotes nothing, and cites nothing a basis does not name', () => {
    const plain = { ...FINDING, basis: '可在维基百科核对。' };
    expect(evidenceCitations([plain], sources.slice(0, 3))).toEqual([{
      findingId: FINDING.findingId, queryClass: '机构', url: 'https://zh.wikipedia.org/wiki/zun',
      claim: { text: FINDING.quote, origin: 'finding-quote' }, claimPieces: [FINDING.quote],
    }]);
    expect(evidenceCitations([{ ...FINDING, basis: '模型自己的知识。' }], sources.slice(0, 3))).toEqual([]);
  });

  it('does not turn one precise citation or an ambiguous site name into every result from that site', () => {
    const sameSite = [sources[0]!, { ...sources[0]!, url: 'https://zh.wikipedia.org/wiki/another', title: '另一页 - 维基百科' }];
    expect(evidenceCitations([{ ...FINDING, basis: 'https://zh.wikipedia.org/wiki/zun' }], sameSite).map((entry) => entry.url))
      .toEqual(['https://zh.wikipedia.org/wiki/zun']);
    expect(evidenceCitations([{ ...FINDING, basis: '维基百科' }], sameSite)).toEqual([]);
  });
});

describe('staleness', () => {
  const now = new Date('2026-10-16T00:00:00.000Z');
  it('marks a source older than the threshold — 90 days unless configured — or captured again under another hash', () => {
    expect(evidenceStaleness({ capturedAt: '2026-07-18T00:00:00.000Z', now, laterDifferentHash: false })).toEqual({ state: 'current', reasons: [] });
    expect(evidenceStaleness({ capturedAt: '2026-07-17T23:59:00.000Z', now, laterDifferentHash: false })).toEqual({ state: 'possibly-stale', reasons: ['age'] });
    expect(evidenceStaleness({ capturedAt: '2026-10-01T00:00:00.000Z', now, staleAfterDays: 7, laterDifferentHash: false }).state).toBe('possibly-stale');
    expect(evidenceStaleness({ capturedAt: '2026-10-15T00:00:00.000Z', now, laterDifferentHash: true })).toEqual({ state: 'possibly-stale', reasons: ['hash-changed'] });
  });
});

describe('来源译文', () => {
  const english = 'The bronze zun and pan were excavated in 1978. They are held by the Hubei Provincial Museum.';
  const base = { captured: english, contentSha256: digest(english), url: 'https://example.org/en', anchors: [{ from: 47, to: 92, sentence: 2 }] };
  it('needs none for a Chinese source', async () => {
    expect(needsSourceTranslation(CAPTURE)).toBe(false);
    expect(needsSourceTranslation(english)).toBe(true);
    expect(await sourceTranslation({ ...base, captured: CAPTURE, rule: { operationalScope: 'developer-live', sourceTranslationAllowed: true }, translator: null })).toBeNull();
  });

  it('produces none and calls nothing when the rule refuses — every current rule — or no translator is bound', async () => {
    let calls = 0;
    const translator = async (): Promise<{ text: string; route: string; model: string }> => { calls += 1; return { text: '译文', route: 'r', model: 'm' }; };
    expect(await sourceTranslation({ ...base, rule: { operationalScope: 'developer-live' }, translator })).toEqual({ state: 'refused', reason: SOURCE_TRANSLATION_NOT_ADMITTED });
    expect(await sourceTranslation({ ...base, rule: { operationalScope: 'ordinary-production', sourceTranslationAllowed: true }, translator })).toEqual({ state: 'refused', reason: SOURCE_TRANSLATION_NOT_ADMITTED });
    expect(await sourceTranslation({ ...base, rule: null, translator })).toEqual({ state: 'refused', reason: SOURCE_TRANSLATION_NOT_ADMITTED });
    expect(await sourceTranslation({ ...base, rule: { operationalScope: 'developer-live', sourceTranslationAllowed: true }, translator: null })).toEqual({ state: 'refused', reason: SOURCE_TRANSLATION_UNAVAILABLE });
    expect(calls).toBe(0);
  });

  it('under an admitting rule labels the Run model’s translation, attributes it to the captured range, and keeps the original beside it', async () => {
    const asked: string[] = [];
    const translation = await sourceTranslation({ ...base, rule: { operationalScope: 'developer-live', sourceTranslationAllowed: true },
      translator: async ({ text }) => { asked.push(text); return { text: '它们由湖北省博物馆收藏。', route: 'opencode-go', model: 'deepseek-v4.1-flash' }; } });
    expect(asked).toEqual(['They are held by the Hubei Provincial Museum.']);
    expect(translation).toEqual({ state: 'translated', label: '来源译文', machine: true, targetLanguage: 'zh-Hans', text: '它们由湖北省博物馆收藏。',
      route: 'opencode-go', model: 'deepseek-v4.1-flash', attribution: { url: base.url, contentSha256: base.contentSha256, from: 47, to: 92 } });
    const view = sourceTranslationView({ translation, passage: 'They are held by the Hubei Provincial Museum.' });
    expect(view).toEqual({ original: 'They are held by the Hubei Provincial Museum.', label: '来源译文', text: '它们由湖北省博物馆收藏。', note: '机器翻译，仅供理解；以原文为准。' });
    expect(sourceTranslationView({ translation: { state: 'refused', reason: SOURCE_TRANSLATION_NOT_ADMITTED }, passage: null })).toEqual({ refused: `来源译文：${SOURCE_TRANSLATION_NOT_ADMITTED}` });
  });
});

function fetchSnapshot(url: string, html: string, contentType = 'text/html; charset=utf-8'): ResearchSnapshot {
  const bytes = Buffer.from(html, 'utf8');
  return { kind: 'fetch', origin: 'webfetch', argumentsDigest: digest(url), url, retrievedAt: '2026-10-15T23:21:08.000Z', status: 200, contentType,
    responseDigest: digest(html), responseBytes: bytes.byteLength, bodyBase64: bytes.toString('base64'), text: '（截断的模型文本）' };
}

describe('reading the Research Snapshot Cache', () => {
  it('converts a fetched page again from its whole bytes, never from the text the model read', () => {
    const snapshot = fetchSnapshot('https://example.org/p', '<html><body><h1>尊盘</h1><p>现藏湖北省博物馆。</p></body></html>');
    const page = retainedPageOf(snapshot)!;
    expect(page.text).toContain('现藏湖北省博物馆。');
    expect(page.text).not.toContain('截断');
    expect(page.pageSha256).toBe(snapshot.responseDigest);
    expect(page.snapshotDigest).toBe(researchSnapshotDigest(snapshot));
    expect(retainedPageOf({ ...snapshot, kind: 'search-call' })).toBeNull();
  });

  it('reads a search answer’s results with their excerpts, and the addresses of one that no longer parses', () => {
    const answer = { ...fetchSnapshot('https://s', ''), kind: 'search-call' as const, text: JSON.stringify([{ title: 'A', url: 'https://a.example/x', snippet: '片段' }, { title: 'B', url: 'http://b.example' }]) };
    expect(searchHitsOf(answer)).toEqual([{ url: 'https://a.example/x', title: 'A', snippet: '片段', via: 'search', capturedAt: answer.retrievedAt, snapshotDigest: researchSnapshotDigest(answer) }]);
    expect(searchHitsOf({ ...answer, text: '[{"title":"A","url":"https://a.example/x"' })).toEqual([{ url: 'https://a.example/x', title: null, snippet: null, via: 'search' }]);
  });
});

describe('retaining one research unit', () => {
  const page = (url: string, text: string): RetainedPage => ({ url, capturedAt: '2026-10-15T23:21:08.000Z', text, pageSha256: digest(`${url}-page`), snapshotDigest: digest(`${url}-snap`) });
  const sources = [
    { url: 'https://museum.example.org/zun', title: '馆藏', snippet: '现藏湖北省博物馆的器物。', via: 'search' as const },
    { url: 'https://zh.wikipedia.org/wiki/zun', title: '曾侯乙青铜尊盘 - 维基百科', snippet: null, via: 'search' as const },
  ];
  const other: UnitResearchFinding = { findingId: `fnd_${'c'.repeat(24)}`, blockId: FINDING.blockId, quote: '另一处说法', basis: '没有来源。', category: '史实' };
  const input = {
    findings: [FINDING, other], sources, pages: new Map<string, RetainedPage>(), searchSnapshotDigest: digest('search'), searchState: 'completed' as const,
    searchCalls: 1, rule: { operationalScope: 'developer-live' }, translator: null, now: () => new Date('2026-10-15T23:30:00.000Z'),
  };

  it('fetches each cited page it has no page of once, keeps the whole text, and counts the finding no source names', async () => {
    const asked: string[] = [];
    const unit = await retainUnitEvidence({ ...input, fetchAllowed: true, fetch: async (url) => {
      asked.push(url);
      return url.includes('wikipedia') ? { failed: '未能取回该来源（状态 403）；不重试。' } : page(url, CAPTURE);
    } });
    expect(asked).toEqual(['https://museum.example.org/zun', 'https://zh.wikipedia.org/wiki/zun']);
    expect(unit.retentionFetches).toBe(2);
    const [museum, wiki] = unit.evidence;
    expect(museum).toMatchObject({ captureState: 'full-text', content: CAPTURE, contentSha256: digest(CAPTURE), alignment: 'aligned', failure: null, translation: null });
    // The page AI7 could not get keeps nothing but its address and the reason: no excerpt came with it.
    expect(wiki).toMatchObject({ captureState: 'failed', content: null, contentSha256: null, alignment: 'unaligned', anchors: [], failure: '未能取回该来源（状态 403）；不重试。' });
    expect(unit.failedRetrievals).toBe(1);
    expect(unit.findings).toEqual([
      { findingId: FINDING.findingId, blockId: FINDING.blockId, quote: FINDING.quote, category: '机构', sources: 1 },
      { findingId: other.findingId, blockId: other.blockId, quote: other.quote, category: '史实', sources: 0 },
    ]);
  });

  it('sends nothing once the Run may not, keeping the search excerpt as 来源仅片段, and uses a page the model already read', async () => {
    let calls = 0;
    const unit = await retainUnitEvidence({ ...input, pages: new Map([['https://zh.wikipedia.org/wiki/zun', page('https://zh.wikipedia.org/wiki/zun', CAPTURE)]]),
      fetchAllowed: false, fetch: async () => { calls += 1; return { failed: 'x' }; } });
    expect(calls).toBe(0);
    expect(unit.retentionFetches).toBe(0);
    const museum = unit.evidence.find((entry) => entry.url.includes('museum'))!;
    expect(museum).toMatchObject({ captureState: 'snippet-only', content: '现藏湖北省博物馆的器物。', snapshotDigest: digest('search'), pageSha256: null, alignment: 'aligned' });
    expect(museum.failure).toBe('运行已停止发送；没有取回这个来源。');
    expect(unit.evidence.find((entry) => entry.url.includes('wikipedia'))).toMatchObject({ captureState: 'full-text', alignment: 'aligned' });
  });

  it('rechecks sending permission between citations and preserves the search capture time and digest on excerpt reuse', async () => {
    let allowed = true;
    let calls = 0;
    const old = '2026-01-01T00:00:00.000Z';
    const result = await retainUnitEvidence({ ...input,
      sources: sources.map((source) => ({ ...source, capturedAt: old, snapshotDigest: digest('original search') })),
      fetchAllowed: () => allowed, fetch: async () => { calls += 1; allowed = false; return { failed: 'refused' }; } });
    expect(calls).toBe(1);
    expect(result.evidence[0]).toMatchObject({ capturedAt: old, snapshotDigest: digest('original search'), captureState: 'snippet-only' });
    expect(evidenceStaleness({ capturedAt: result.evidence[0]!.capturedAt, now: input.now(), laterDifferentHash: false }).state).toBe('possibly-stale');
  });

  it('retains the whole admitted page past one million characters instead of making an incomplete full-text material', async () => {
    const text = '公开'.repeat(500_001) + CAPTURE;
    const result = await retainUnitEvidence({ ...input, findings: [{ ...FINDING, basis: 'https://museum.example.org/zun 「现藏湖北省博物馆」' }],
      pages: new Map([['https://museum.example.org/zun', page('https://museum.example.org/zun', text)]]), fetchAllowed: false, fetch: null });
    expect(result.evidence[0]!.content?.length).toBe(text.length);
    expect(result.evidence[0]!.contentSha256).toBe(digest(text));
    expect(result.evidence[0]!.alignment).toBe('aligned');
    expect(alignCitation(['公开事实尚待核对'], text).alignment).toBe('unaligned');
  });
});

describe('the words the editor reads', () => {
  const record: ResearchEvidenceProjection = {
    evidenceId: '00000000-0000-4000-8000-000000000001', bookId: '00000000-0000-4000-8000-000000000002', runRecordId: '00000000-0000-4000-8000-000000000003',
    unitOrdinal: 2, findingId: FINDING.findingId, backendId: 'search-tinyfish', queryClass: '机构', url: 'https://museum.example.org/zun', sourceTitle: '馆藏',
    capturedAt: '2026-07-01T00:00:00.000Z', captureState: 'full-text', captureLabel: '来源全文', contentSha256: digest(CAPTURE), pageSha256: digest('p'),
    snapshotDigest: digest('s'), claim: { text: '现藏湖北省博物馆', origin: 'basis-quotation' }, alignment: 'aligned', alignmentLabel: '对应',
    anchors: [{ from: 25, to: 33, sentence: 2 }], passage: '它由尊与盘两件器物组成，现藏湖北省博物馆。', translation: null,
    staleness: { state: 'possibly-stale', reasons: ['age'], label: '可能已过期' }, savedMaterialId: null, saveRefusal: null,
  };

  it('shows 可能已过期 with the capture time on the finding card and in the source view', () => {
    expect(sourceStalenessLine(record, 90, instant)).toBe('可能已过期（取回于 本地 2026-07-01T00:00:00.000Z，已超过 90 天）');
    expect(sourceStalenessLine({ ...record, staleness: { state: 'possibly-stale', reasons: ['hash-changed'], label: '可能已过期' } }, 90, instant))
      .toBe('可能已过期（取回于 本地 2026-07-01T00:00:00.000Z，之后再次取回时内容已变）');
    expect(sourceStalenessLine({ ...record, staleness: { state: 'current', reasons: [], label: null } }, 90, instant)).toBeNull();
    expect(findingSourceLine(record, 90, instant)).toBe('来源：馆藏 · 来源全文 · 取回于 本地 2026-07-01T00:00:00.000Z · 对应 · 依据中引用的词句 · 第 2 句 · 可能已过期（取回于 本地 2026-07-01T00:00:00.000Z，已超过 90 天）');
  });

  it('says what an alignment found and why one found nothing, never a verdict', () => {
    expect(sourceAlignmentLine({ ...record, alignment: 'unaligned', alignmentLabel: '未能对应', anchors: [] })).toBe('引文对应：未能对应（依据中引用的词句不在取回的文字里）');
    expect(sourceAlignmentLine({ ...record, captureState: 'failed', alignment: 'unaligned', alignmentLabel: '未能对应', anchors: [] })).toBe('引文对应：未能对应（没有取回任何文字）');
    expect(sourceAlignmentLine({ ...record, claim: null, alignment: 'unaligned', alignmentLabel: '未能对应', anchors: [] })).toBe('引文对应：未能对应（没有发现引用这个来源）');
    expect(findingSourceLine(record, 90, instant)).not.toMatch(/已验证|证据支持|事实正确/u);
  });

  it('lists a finding’s sources, or says its search found none or was cut short', () => {
    const projection: ResearchEvidenceBookProjection = {
      bookId: record.bookId, staleAfterDays: 90, records: [record], next: null, statement: '',
      units: [{ runRecordId: record.runRecordId, unitOrdinal: 2, backendId: 'search-tinyfish', state: 'incomplete', label: '联网核查未完成', searchCalls: 1, retentionFetches: 1, failedRetrievals: 1, unsupportedFindings: 1 }],
      findings: [
        { findingId: FINDING.findingId, runRecordId: record.runRecordId, unitOrdinal: 2, blockId: FINDING.blockId, quote: FINDING.quote, state: 'sourced', label: '已留存外部来源', sources: 1 },
        { findingId: `fnd_${'d'.repeat(24)}`, runRecordId: record.runRecordId, unitOrdinal: 2, blockId: FINDING.blockId, quote: '别处', state: 'incomplete', label: '联网核查未完成', sources: 0 },
      ],
    };
    expect(findingResearchLines(projection, { blockId: FINDING.blockId, quote: FINDING.quote }, instant)).toEqual([findingSourceLine(record, 90, instant)]);
    expect(findingResearchLines(projection, { blockId: FINDING.blockId, quote: '别处' }, instant)).toEqual(['联网核查未完成']);
    expect(findingResearchLines(projection, { blockId: FINDING.blockId, quote: '没有研究的发现' }, instant)).toBeNull();
    expect(researchUnitLine(projection.units[0]!)).toBe('阅读范围 2 · 联网核查未完成 · 检索 1 次 · 留存取回 1 次 · 1 个来源未能取回全文 · 1 条发现没有可留存的外部来源');
    expect(findingResearchLines({ ...projection, records: [{ ...record, runRecordId: '00000000-0000-4000-8000-000000000099' }, record] }, FINDING, instant))
      .toEqual([findingSourceLine(record, 90, instant)]);
  });

  it('pages a finding beyond the first 32 sources while preserving its task and finding filters', async () => {
    const taskIntentId = '00000000-0000-4000-8000-000000000004';
    const reviewFindingId = `rvf_${'a'.repeat(24)}`;
    const calls: unknown[] = [];
    const answer = await readFindingResearch({ inspectResearchEvidence: async (input) => {
      calls.push(input);
      return { bookId: record.bookId, staleAfterDays: 90, records: input.after === undefined ? Array.from({ length: 32 }, () => record) : [record],
        next: input.after === undefined ? 33 : null, findings: [], units: [], statement: '' };
    } }, record.bookId, taskIntentId, reviewFindingId);
    expect(answer.records).toHaveLength(33);
    expect(calls).toEqual([{ bookId: record.bookId, taskIntentId, reviewFindingId }, { bookId: record.bookId, taskIntentId, reviewFindingId, after: 33 }]);
  });
});
