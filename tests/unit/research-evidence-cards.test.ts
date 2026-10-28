import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingEvidenceList } from '../../src/renderer/research-evidence.js';
import { readFindingSources } from '../../src/renderer/research-evidence-labels.js';
import { findingEvidenceSources } from '../../src/shared/report-wording.js';
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
    expect(items[0]!.querySelector('.finding-evidence-translation figcaption')?.textContent).toBe('来源译文');
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
