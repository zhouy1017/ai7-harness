import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingEvidenceList, mountResearchEvidence } from '../../src/renderer/research-evidence.js';
import { readFindingSources, sourceFindingLine, SOURCE_TRANSLATION_MACHINE } from '../../src/renderer/research-evidence-labels.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { findingEvidenceSources } from '../../src/shared/report-wording.js';
import { SOURCE_TRANSLATION_LABEL } from '../../src/shared/protocol.js';
import type {
  EvidenceSourceCardProjection,
  EvidenceWorkspaceProjection,
  FactualVerificationLensProjection,
  ResearchEvidenceBookProjection,
  ResearchEvidenceProjection,
} from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

// Issue #1174 (ADR 0095 §5): a factual finding's sources on its card — the result's source cards less the excluded ones,
// joined to the retained 来源与证据 rows for 来源译文. Synthetic public text only; no manuscript, network or model.

const EVIDENCE_ID = '00000000-0000-4000-8000-0000000000e1';

function card(overrides: Partial<EvidenceSourceCardProjection> = {}): EvidenceSourceCardProjection {
  return {
    cardId: 'src_1', sourceRef: 'https://example.org/vessel', sourceKind: 'web', title: '馆藏说明', checkState: 'exact', checkLabel: '已精确取文',
    relation: '支持', excerpt: '现藏湖北省博物馆', sourceVersion: 'a'.repeat(64), publisher: null, registrableDomain: 'example.org',
    capturedAt: '2026-07-01T00:00:00.000Z', freshness: 'current', freshnessLabel: '当前', integrity: 'located', integrityLabel: '引文完整',
    lineage: 'original', lineageLabel: '原始来源', independenceGroup: 'g1', evidenceId: EVIDENCE_ID, reused: false, ...overrides,
  };
}

const RETAINED = {
  evidenceId: EVIDENCE_ID, sourceTitle: 'Collection note',
  translation: { state: 'translated', label: '来源译文', machine: true, targetLanguage: 'zh-Hans', text: '这件器物现藏湖北省博物馆。', route: 'r', model: 'm',
    attribution: { url: 'https://example.org/vessel', contentSha256: 'a'.repeat(64), from: 0, to: 10 } },
} as unknown as ResearchEvidenceProjection;

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => { restore(); });

describe('a factual finding’s sources on its card', () => {
  it('lists the result’s sources with link, exact excerpt, 来源译文 and note, and leaves the excluded ones out', () => {
    const sources = findingEvidenceSources([
      card(),
      card({ cardId: 'src_2', sourceRef: 'https://example.net/other', title: null, evidenceId: null, excluded: true }),
      card({ cardId: 'src_3', sourceRef: 'https://example.com/page', title: null, checkState: 'candidate', checkLabel: '候选来源 · 尚未核对', relation: '反驳', excerpt: null, evidenceId: null }),
    ], [RETAINED]);
    expect(sources).toEqual([
      { name: '馆藏说明', url: 'https://example.org/vessel', snippet: '现藏湖北省博物馆', translation: '这件器物现藏湖北省博物馆。', note: '已精确取文 · 支持', evidenceId: EVIDENCE_ID },
      { name: 'example.com', url: 'https://example.com/page', snippet: null, translation: null, note: '候选来源 · 尚未核对 · 反驳', evidenceId: null },
    ]);
    expect(findingEvidenceSources([card({ sourceKind: 'in-book', sourceRef: 'retrieval:1', title: null, evidenceId: null })], [])[0])
      .toMatchObject({ name: '书内资料', url: null });
  });

  it('renders each source on the card with its address as text and opens the archived row', () => {
    const opened: string[] = [];
    const [source, candidate] = findingEvidenceSources([card(), card({ cardId: 'src_3', excerpt: null, evidenceId: null })], [RETAINED]);
    const list = findingEvidenceList([source!, candidate!], (evidenceId) => opened.push(evidenceId));
    expect(list.dataset['evidenceCount']).toBe('2');
    const items = Array.from(list.querySelectorAll('li.finding-evidence-source'));
    expect(items[0]!.querySelector('.finding-evidence-name')?.textContent).toBe('馆藏说明');
    expect(items[0]!.querySelector('.finding-evidence-url')?.textContent).toBe('https://example.org/vessel');
    expect(items[0]!.querySelector('.finding-evidence-note')?.textContent).toBe('已精确取文 · 支持');
    expect(items[0]!.querySelector('.finding-evidence-snippet')?.textContent).toBe('现藏湖北省博物馆');
    expect(items[0]!.querySelector('.finding-evidence-translation figcaption')?.textContent).toBe(`${SOURCE_TRANSLATION_LABEL} · ${SOURCE_TRANSLATION_MACHINE}`);
    for (const absent of ['.finding-evidence-snippet', '.finding-evidence-translation', '[data-evidence-action]']) expect(items[1]!.querySelector(absent)).toBeNull();
    expect(items[0]!.querySelector('[data-evidence-action]')).not.toBeNull();
    (items[0]!.querySelector('[data-evidence-action="open-source"]') as HTMLButtonElement).click();
    expect(opened).toEqual([EVIDENCE_ID]);
  });

  it('reads each finding’s latest result in the Run, every source page, and the retained rows it was handed or reads', async () => {
    const bookId = '00000000-0000-4000-8000-000000000001';
    const result = (resultId: string, reviewFindingId: string) => ({ resultId, reviewFindingId, taskIntentId: '00000000-0000-4000-8000-000000000004' });
    const workspaces: string[] = [];
    const research: Array<string | undefined> = [];
    const api = {
      inspectFactualVerification: async (input: { after: number | null }) => ({
        results: input.after === null ? [result('r1', 'rvf_a'), result('r2', 'rvf_b')] : [result('r3', 'rvf_a')], nextCursor: input.after === null ? 2 : null,
      }) as unknown as FactualVerificationLensProjection,
      inspectEvidenceWorkspace: async (input: { resultId: string; sourcesAfter: number | null }) => {
        workspaces.push(`${input.resultId}@${input.sourcesAfter}`);
        return { sources: [card({ cardId: `${input.resultId}-${input.sourcesAfter}` })], nextSourceCursor: input.sourcesAfter === null && input.resultId === 'r3' ? 12 : null } as unknown as EvidenceWorkspaceProjection;
      },
      inspectResearchEvidence: async (input: { reviewFindingId?: string }) => {
        research.push(input.reviewFindingId);
        return { records: [RETAINED], next: null } as unknown as ResearchEvidenceBookProjection;
      },
    };
    const handed = new Map([['rvf_b', { records: [] } as unknown as ResearchEvidenceBookProjection]]);
    const sources = await readFindingSources(api, bookId, '00000000-0000-4000-8000-000000000002', handed);
    expect(workspaces).toEqual(['r3@null', 'r3@12', 'r2@null']);
    expect(research).toEqual(['rvf_a']);
    expect(sources.get('rvf_a')?.map((source) => source.translation)).toEqual(['这件器物现藏湖北省博物馆。', '这件器物现藏湖北省博物馆。']);
    expect(sources.get('rvf_b')?.[0]?.translation).toBeNull();
    expect([...(await readFindingSources(api, bookId, 'run', handed, 'rvf_b')).keys()]).toEqual(['rvf_b']);
  });
});

// Issue #1683 (item 12.1): every list of sources names a web source by its domain in ordinary mode, keeps the full address a
// developer line, and opens the source by the identity its surface holds — never by an address.
describe('a source’s domain, 复制链接 and 在浏览器中打开 on every list (#1683)', () => {
  afterEach(() => { setTechnicalLayerVisible(true); });
  const controls = (item: Element) => ({
    domain: item.querySelector('.source-link-domain')?.textContent ?? null,
    url: item.querySelector('.finding-evidence-url, .research-evidence-url')?.textContent ?? null,
    open: item.querySelector('[data-source-action="open-in-browser"]')?.textContent ?? null,
    copy: item.querySelector('[data-source-action="copy-link"]') !== null,
  });

  it('shows the domain in ordinary mode and the address only in developer mode, and none of it for an in-Book source', () => {
    const rows = findingEvidenceSources([card({ title: null }), card({ cardId: 'src_b', sourceKind: 'in-book', sourceRef: 'retrieval:1', title: null, evidenceId: null })], []);
    setTechnicalLayerVisible(false);
    const ordinary = Array.from(findingEvidenceList(rows).querySelectorAll('li.finding-evidence-source'));
    expect(ordinary.map(controls)).toEqual([{ domain: 'example.org', url: '', open: null, copy: true }, { domain: null, url: null, open: null, copy: false }]);
    expect(ordinary[0]!.querySelector('.finding-evidence-name')?.textContent).toBe('example.org');
    setTechnicalLayerVisible(true);
    expect(controls(findingEvidenceList(rows).querySelector('li.finding-evidence-source')!).url).toBe('https://example.org/vessel');
  });

  it('opens a review-card or mark-card row by its result and card, and a report row by its retained row or not at all', async () => {
    const opened: unknown[] = [];
    Object.assign(globalThis, { window: { ai7: { openSourceInBrowser: async (input: unknown) => { opened.push(input); return { host: 'example.org' }; } } } });
    try {
      const api = {
        inspectFactualVerification: async () => ({ results: [{ resultId: 'r1', reviewFindingId: 'rvf_a', taskIntentId: 't' }], nextCursor: null }) as unknown as FactualVerificationLensProjection,
        inspectEvidenceWorkspace: async () => ({ sources: [card({ cardId: 'src_x', excluded: true }), card()], nextSourceCursor: null }) as unknown as EvidenceWorkspaceProjection,
        inspectResearchEvidence: async () => ({ records: [], next: null }) as unknown as ResearchEvidenceBookProjection,
      };
      const read = (await readFindingSources(api, 'book-1', 'run-1')).get('rvf_a')!;
      expect(read.map(({ identity, ...row }) => [identity, row])).toEqual([[{ bookId: 'book-1', resultId: 'r1', cardId: 'src_1' }, findingEvidenceSources([card()], [])[0]]]);
      (findingEvidenceList(read).querySelector('[data-source-action="open-in-browser"]') as HTMLButtonElement).click();
      const report = findingEvidenceSources([card(), card({ cardId: 'src_2', evidenceId: null })], []);
      const reportItems = Array.from(findingEvidenceList(report, undefined, 'book-1').querySelectorAll('li.finding-evidence-source'));
      expect(reportItems.map((item) => controls(item).open)).toEqual(['在浏览器中打开 · example.org', null]);
      (reportItems[0]!.querySelector('[data-source-action="open-in-browser"]') as HTMLButtonElement).click();
      await Promise.resolve();
      expect(opened).toEqual([{ bookId: 'book-1', resultId: 'r1', cardId: 'src_1' }, { bookId: 'book-1', evidenceId: EVIDENCE_ID }]);
    } finally { Reflect.deleteProperty(globalThis, 'window'); }
  });

  it('says which sentence of the manuscript a retained row was kept for, in all four cases', () => {
    const findings = [{ findingId: 'f1', runRecordId: 'run-a', quote: '书里的那一句' }] as unknown as ResearchEvidenceBookProjection['findings'];
    const row = (findingId: string | null, runRecordId: string, claim: ResearchEvidenceProjection['claim'] = null) => ({ findingId, runRecordId, claim });
    expect(sourceFindingLine(row('f1', 'run-a'), findings)).toBe('为稿件这句找的：「书里的那一句」');
    expect(sourceFindingLine(row('f1', 'run-b', { text: '模型引的那一句', origin: 'finding-quote' }), findings)).toBe('为稿件这句找的：「模型引的那一句」');
    expect(sourceFindingLine(row(null, 'run-a'), findings)).toBe('没有对应稿件里的哪一句。');
    expect(sourceFindingLine(row('f2', 'run-a', { text: '依据里的词句', origin: 'basis-quotation' }), findings)).toBeNull();
  });

  it('draws the 来源与证据 card with its domain, its sentence and 在浏览器中打开 by its retained row', async () => {
    const root = document.createElement('div');
    const opened: unknown[] = [];
    const record = { ...RETAINED, bookId: 'book-1', runRecordId: 'run-a', unitOrdinal: 1, findingId: 'f1', backendId: null, queryClass: 'claim', url: 'https://example.org/vessel', capturedAt: '2026-07-01T00:00:00.000Z',
      captureState: 'captured', captureLabel: '来源全文', contentSha256: null, pageSha256: null, snapshotDigest: null, claim: null, alignment: 'aligned', alignmentLabel: '对应', anchors: [],
      passage: null, translation: null, staleness: { state: 'current', reasons: [], label: null }, savedMaterialId: null, saveRefusal: '不提供' } as unknown as ResearchEvidenceProjection;
    const surface = mountResearchEvidence({ root, bookId: 'book-1', setStatus: () => undefined, errorMessage: (_error, fallback) => fallback, api: {
      inspectResearchEvidence: async () => ({ bookId: 'book-1', staleAfterDays: 90, records: [record], next: null, units: [], statement: '来源。',
        findings: [{ findingId: 'f1', runRecordId: 'run-a', quote: '书里的那一句' }] }) as unknown as ResearchEvidenceBookProjection,
      saveEvidenceAsMaterial: async () => { throw new Error('unused'); },
      openSourceInBrowser: async (input) => { opened.push(input); return { host: 'example.org' }; },
      runEditorClipboardCommand: async () => ({ state: 'done' }),
    } });
    setTechnicalLayerVisible(false);
    await surface.load();
    const article = root.querySelector('article.research-evidence-card')!;
    expect(article.querySelector('.research-evidence-finding')?.textContent).toBe('为稿件这句找的：「书里的那一句」');
    expect(controls(article)).toEqual({ domain: 'example.org', url: '', open: '在浏览器中打开 · example.org', copy: true });
    (article.querySelector('[data-source-action="open-in-browser"]') as HTMLButtonElement).click();
    expect(opened).toEqual([{ bookId: 'book-1', evidenceId: EVIDENCE_ID }]);
  });
});
