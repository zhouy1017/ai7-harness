import type { AnalysisRevisionWireProjection, BaselineAnalysisWireProjection, HydratedAnalysisRevisionProjection, RendererApi,
  ServiceOperationMap } from '../shared/protocol.js';
import { ANALYSIS_READ_FAILED } from './analysis-paging-labels.js';

/** Short books incur no read. Larger immutable overviews are verified in full before any panel sees them. */
export async function hydrateAnalysisRevision(api: Pick<RendererApi, 'getAnalysisRevisionOverview'>,
  revision: AnalysisRevisionWireProjection): Promise<HydratedAnalysisRevisionProjection> {
  if (revision.sections !== undefined && revision.synthesis !== undefined) return { ...revision, sections: revision.sections, synthesis: revision.synthesis };
  const expected = revision.overviewPage;
  if (expected === undefined) throw new Error(ANALYSIS_READ_FAILED);
  const chunks: string[] = [];
  let cursor: number | null = 0;
  do {
    const page = await api.getAnalysisRevisionOverview({ revisionId: revision.revisionId, afterIndex: cursor });
    if (page.revisionId !== revision.revisionId || page.next !== null && page.next <= cursor) throw new Error(ANALYSIS_READ_FAILED);
    chunks.push(page.text);
    cursor = page.next;
  } while (cursor !== null && chunks.length < expected.chunkCount);
  const text = chunks.join('');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (value) => value.toString(16).padStart(2, '0')).join('');
  let totalLength = 0;
  for (const _point of text) totalLength += 1;
  if (cursor !== null || chunks.length !== expected.chunkCount || totalLength !== expected.totalLength || digest !== expected.sha256) {
    throw new Error(ANALYSIS_READ_FAILED);
  }
  const overview = JSON.parse(text) as Pick<HydratedAnalysisRevisionProjection, 'sections' | 'synthesis'>;
  if (!Array.isArray(overview.sections) || typeof overview.synthesis !== 'object' || overview.synthesis === null) throw new Error(ANALYSIS_READ_FAILED);
  return { ...revision, ...overview };
}

/** Copy only the path being appended so an already hydrated overview keeps its identity. */
export function appendBaselineSummaryPage(projection: BaselineAnalysisWireProjection,
  page: ServiceOperationMap['getBaselineAnalysisPage']['output']): BaselineAnalysisWireProjection {
  const meta = projection.listPages[page.path];
  if (meta === undefined) throw new Error(ANALYSIS_READ_FAILED);
  const append = (value: unknown, keys: string[]): unknown => {
    if (keys.length === 0) {
      if (!Array.isArray(value)) throw new Error(ANALYSIS_READ_FAILED);
      return [...value, ...page.items];
    }
    if (value === null || typeof value !== 'object') throw new Error(ANALYSIS_READ_FAILED);
    const record = value as Record<string, unknown>;
    const key = keys[0]!;
    return { ...record, [key]: append(record[key], keys.slice(1)) };
  };
  return { ...append(projection, page.path.split('.')) as BaselineAnalysisWireProjection,
    listPages: { ...projection.listPages, [page.path]: { ...meta, shown: meta.shown + page.items.length, nextOrdinal: page.nextOrdinal } } };
}
