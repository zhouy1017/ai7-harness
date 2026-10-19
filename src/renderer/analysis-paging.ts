import type { AnalysisRevisionWireProjection, HydratedAnalysisRevisionProjection, RendererApi } from '../shared/protocol.js';
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
  if (cursor !== null || chunks.length !== expected.chunkCount || Array.from(text).length !== expected.totalLength || digest !== expected.sha256) {
    throw new Error(ANALYSIS_READ_FAILED);
  }
  const overview = JSON.parse(text) as Pick<HydratedAnalysisRevisionProjection, 'sections' | 'synthesis'>;
  if (!Array.isArray(overview.sections) || typeof overview.synthesis !== 'object' || overview.synthesis === null) throw new Error(ANALYSIS_READ_FAILED);
  return { ...revision, ...overview };
}
