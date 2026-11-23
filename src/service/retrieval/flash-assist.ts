import type { ServiceOperationMap } from '../../shared/protocol.js';
import type { FlashTaskResult, RerankInput } from '../fast-role/flash-task-contract.js';
import type { LibraryMaterialLedger } from '../library-materials.js';
import type { MaterialReferenceBoundary, MaterialReferencePin, MaterialTaskReading } from '../material-index.js';
import { requireStore, UUID_PATTERN } from '../store-records.js';
import { RetrievalIndex, RETRIEVAL_LEXICAL, RETRIEVAL_MAX_CANDIDATES, type RetrievalCandidate } from './index.js';
import { materialRetrievalSources } from './source-readers.js';

/** Each executor returns only results checked by its registered Flash contract; either task may be unavailable. */
export interface RetrievalAssist {
  expand?: (query: string) => Promise<FlashTaskResult<string[]>>;
  rerank?: (input: RerankInput) => Promise<FlashTaskResult<string[]>>;
}

async function checked<Input>(execute: ((input: Input) => Promise<FlashTaskResult<string[]>>) | undefined, input: Input): Promise<string[] | null> {
  try {
    const result = await execute?.(input);
    return result?.state === 'checked' ? result.value : null;
  } catch { return null; } // Optional model transport failure never disables local search or retries an uncertain call.
}

/** Flash contributes phrasings and candidate IDs only; the disposable local index owns every byte and anchor. */
export async function retrieveWithFlash(index: RetrievalIndex, query: string, k: number, assist: RetrievalAssist | null): Promise<RetrievalCandidate[]> {
  const queries = (await checked(assist?.expand, query))?.slice(0, RETRIEVAL_LEXICAL.maxQueries) ?? [query];
  const poolSize = Math.min(RETRIEVAL_MAX_CANDIDATES, Math.max(k, 4));
  const candidates = await index.retrieve(query, poolSize, ['material'], queries);
  const ids = candidates.length === 0 ? null : await checked(assist?.rerank, {
    query, candidates: candidates.map(candidate => ({ id: candidate.candidateId, preview: candidate.preview })),
  });
  const byId = new Map(candidates.map(candidate => [candidate.candidateId, candidate]));
  // A checked empty list excludes the whole pool; it is not the fallback signal.
  const ranked = ids === null ? candidates : ids.map(id => byId.get(id)!);
  // A source may have moved or been withdrawn while Flash answered. Recheck its locked bytes before exposing a preview.
  return ranked.filter(candidate => {
    try { index.exactFetch(candidate.candidateId); return true; } catch { return false; }
  }).slice(0, k);
}

interface MaterialSearchReader {
  pinMaterialReference(bookId: string, materialId: string): MaterialReferencePin;
  readMaterialIndexForTask(boundary: MaterialReferenceBoundary, materialId: string, from: number): MaterialTaskReading;
}

/** Editor-side discovery pins only referable materials; it creates no Run or implicit reference selection. */
export async function searchReferableMaterials(input: ServiceOperationMap['searchReferableMaterials']['input'],
  materials: Pick<LibraryMaterialLedger, 'referable'>, reader: MaterialSearchReader, assist: RetrievalAssist | null,
): Promise<ServiceOperationMap['searchReferableMaterials']['output']> {
  requireStore(UUID_PATTERN.test(input.bookId) && input.query.isWellFormed() && input.query.trim().length > 0 && input.query.length <= 1_000 &&
    Number.isSafeInteger(input.k) && input.k >= 1 && input.k <= RETRIEVAL_MAX_CANDIDATES,
  'RETRIEVAL_ARGUMENTS_INVALID', '检索文字须在 1 至 1,000 字符之间，最多显示 8 项。');
  const references = materials.referable(input.bookId).flatMap(item => {
    try { return [reader.pinMaterialReference(input.bookId, item.materialId)]; } catch { return []; }
  });
  const boundary = { bookId: input.bookId, references };
  const index = new RetrievalIndex(materialRetrievalSources(boundary, (scope, id, from) => reader.readMaterialIndexForTask(scope, id, from)));
  try { return { candidates: await retrieveWithFlash(index, input.query, input.k, assist) }; } finally { index.dispose(); }
}
