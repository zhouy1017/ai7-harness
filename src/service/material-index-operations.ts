import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StoreError, UUID_PATTERN, requireStore, sha256 } from './store-records.js';
import {
  type ServiceOperationMap,
  type LibraryMaterialProjection,
  MAX_MATERIAL_VECTOR_CANDIDATES,
  MAX_MATERIAL_VECTOR_QUERY_CODE_UNITS,
  type MaterialTranslationProjection,
  type MaterialVectorSearchProjection,
} from '../shared/protocol.js';
import { BackgroundAnalysisEnrollmentLedger } from './background-analysis-enrollments.js';
import { LIBRARY_OBJECT_DIRECTORY, LibraryMaterialLedger, type LibraryMaterialOriginal } from './library-materials.js';
import {
  MaterialIndexError,
  MaterialIndexLedger,
  extractMaterialText,
  prepareMaterialIndexInSlices,
  type MaterialEmbeddingFacts,
  type MaterialLayerActivity,
  type MaterialReferenceBoundary,
  type MaterialReferencePin,
  type MaterialTaskReading,
  type MaterialVectorQuery,
} from './material-index.js';
import type { EmbeddingProvider } from './knowledge/embedding.js';
import {
  MATERIAL_TRANSLATION_BATCH_CODE_UNITS,
  MATERIAL_TRANSLATION_BATCH_PARAGRAPHS,
  MATERIAL_TRANSLATION_NOT_ADMITTED,
  MAX_MATERIAL_TRANSLATION_REQUESTS,
  type MaterialTranslator,
} from './fast-role/material-translation-contract.js';
import { MATERIAL_LAYERS_READ_ONLY, MATERIAL_VECTOR_BATCH } from './store-operation-support.js';

export interface MaterialIndexOperationsHost {
  readonly authority: DatabaseSync;
  readonly dataRoot: string;
  readonly embedding: EmbeddingProvider;
  enrollmentCall: <T>(operation: () => T) => T;
  readonly enrollments: BackgroundAnalysisEnrollmentLedger;
  readonly idleVectorItems: Set<string>;
  indexController: AbortController | null;
  indexEnabled: boolean;
  readonly indexQueue: string[];
  indexRun: Promise<void> | null;
  indexStopped: boolean;
  indexing: string | null;
  libraryCall: <T>(operation: () => T) => T;
  readonly libraryMaterials: LibraryMaterialLedger;
  readonly materialIndex: MaterialIndexLedger;
  readonly poisoned: boolean;
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  translating: string | null;
  readonly translationFailures: Map<string, string>;
  translationRun: Promise<void> | null;
  translator: MaterialTranslator | null;
  vectorBuilding: string | null;
  vectorLaneIdle: boolean;
  readonly vectorQueue: string[];
  vectorRun: Promise<void> | null;
  inspectLibraryMaterial: (materialId: string) => LibraryMaterialProjection;
  replacementFrozen: () => boolean;
  startMaterialIndexing: () => void;
}

export function startMaterialIndexing(host: MaterialIndexOperationsHost): void {
  if (host.indexStopped) return;
  host.indexEnabled = true;
  // A replacement prepared or waiting holds every build back: 取消替换, or a preparation that failed, starts them (#729).
  if (host.replacementFrozen()) return;
  internalScheduleMaterialIndex(host, host.libraryCall(() => host.materialIndex.unindexed()));
}

export function materialIndexing(host: MaterialIndexOperationsHost): boolean {
  // Similarity vectors and 来源译文 asked for write too (Issue #892).
  return host.indexRun !== null || host.vectorRun !== null || host.translationRun !== null;
}

export function internalResumeMaterialIndexing(host: MaterialIndexOperationsHost): void {
  if (!host.indexEnabled) return;
  try { host.startMaterialIndexing(); } catch { /* the next open builds what is still missing */ }
}

export async function settleMaterialIndexing(host: MaterialIndexOperationsHost): Promise<void> {
  while (host.indexRun !== null) await host.indexRun;
}

export async function settleMaterialLayers(host: MaterialIndexOperationsHost): Promise<void> {
  while (host.vectorRun !== null || host.translationRun !== null) {
    await host.vectorRun;
    await host.translationRun;
  }
}

export function internalScheduleMaterialIndex(host: MaterialIndexOperationsHost, materialIds: ReadonlyArray<string>): void {
  if (host.indexStopped || !host.indexEnabled) return;
  for (const materialId of materialIds) {
    if (host.indexing !== materialId && !host.indexQueue.includes(materialId)) host.indexQueue.push(materialId);
  }
  if (host.indexRun === null && host.indexQueue.length > 0) {
    host.indexRun = internalPumpMaterialIndex(host).finally(() => {
      host.indexRun = null;
    });
  }
}

export async function internalPumpMaterialIndex(host: MaterialIndexOperationsHost): Promise<void> {
  while (!host.indexStopped && host.indexQueue.length > 0) {
    const materialId = host.indexQueue.shift()!;
    host.indexing = materialId;
    const controller = new AbortController();
    host.indexController = controller;
    try {
      if (host.poisoned || host.replacementFrozen()) continue;
      if (host.materialIndex.current(materialId) !== null) continue;
      const original: LibraryMaterialOriginal = host.libraryMaterials.original(materialId);
      const extraction = await extractMaterialText({
        originalPath: resolve(host.dataRoot, LIBRARY_OBJECT_DIRECTORY, ...original.objectKey.split('/')),
        format: original.source.format,
        displayName: original.source.displayName,
        objectSha256: original.source.sha256,
        bytes: original.source.bytes,
        dataRoot: host.dataRoot,
        signal: controller.signal,
      });
      // The segments are prepared a slice at a time, the service taking its other work between slices (#729); the freeze is
      // checked again after the last await, right before the one write.
      const prepared = await prepareMaterialIndexInSlices(extraction, controller.signal);
      if (host.indexStopped || host.poisoned || host.replacementFrozen()) continue;
      host.transaction(host.authority, () => {
        if (host.materialIndex.current(materialId) !== null) return;
        host.materialIndex.record({ materialId, sha256: original.sha256, format: original.source.format }, prepared);
      });
    } catch {
      // Stopped, refused, or its item changed meanwhile: nothing is recorded, and the next open tries again. A rollback that
      // itself failed has already left the store unable to write: `#transaction` poisons it and throws `StoreFatalError`.
    } finally {
      host.indexing = null;
      host.indexController = null;
    }
  }
}

export function internalMaterialIndexCall<T>(host: MaterialIndexOperationsHost, operation: () => T): T {
  return host.libraryCall(() => {
    try {
      return operation();
    } catch (error) {
      if (error instanceof MaterialIndexError) throw new StoreError(error.code, error.message);
      throw error;
    }
  });
}

export function inspectLibraryMaterialSegments(host: MaterialIndexOperationsHost, input: ServiceOperationMap['inspectLibraryMaterialSegments']['input']): ServiceOperationMap['inspectLibraryMaterialSegments']['output'] {
  return internalMaterialIndexCall(host, () => {
    const original = host.libraryMaterials.original(input.materialId);
    return host.materialIndex.page(input.materialId, original.title, input.from);
  });
}

export function pinMaterialReference(host: MaterialIndexOperationsHost, bookId: string, materialId: string): MaterialReferencePin {
  return internalMaterialIndexCall(host, () =>
    host.materialIndex.referencePin(materialId, bookId, (id, book) => host.libraryMaterials.available(id, book)));
}

export function readMaterialIndexForTask(host: MaterialIndexOperationsHost, boundary: MaterialReferenceBoundary, materialId: string, from: number): MaterialTaskReading {
  return internalMaterialIndexCall(host, () => {
    const original = host.libraryMaterials.original(materialId);
    return host.materialIndex.readForTask(boundary, materialId, original.title, from, (id, book) => host.libraryMaterials.available(id, book));
  });
}

export function embeddingProvider(host: MaterialIndexOperationsHost): EmbeddingProvider {
  return host.embedding;
}

export function internalEmbeddingFacts(host: MaterialIndexOperationsHost): MaterialEmbeddingFacts {
  return { identity: host.embedding.identity, dimensions: host.embedding.dimensions, readiness: host.embedding.readiness() };
}

export function useMaterialTranslator(host: MaterialIndexOperationsHost, translator: MaterialTranslator | null): void {
  host.translator = translator;
}

export function internalTranslationRequest(host: MaterialIndexOperationsHost, sha256: string): MaterialTranslationProjection['request'] {
  if (host.replacementFrozen()) return { available: false, reason: MATERIAL_LAYERS_READ_ONLY };
  if (host.translating !== null) return { available: false, reason: '另一份资料的来源译文正在生成；请等它完成。' };
  const reason = host.translator === null ? MATERIAL_TRANSLATION_NOT_ADMITTED : host.translator.refusal(sha256);
  return { available: reason === null, reason };
}

export function internalLayerActivity(host: MaterialIndexOperationsHost, materialId: string, sha256: string): MaterialLayerActivity {
  return {
    embedding: internalEmbeddingFacts(host),
    vectorsBuilding: host.vectorBuilding === materialId || host.vectorQueue.includes(materialId),
    translating: host.translating === materialId,
    translationRequest: internalTranslationRequest(host, sha256),
    translationFailure: host.translationFailures.get(materialId) ?? null,
  };
}

export function buildMaterialVectors(host: MaterialIndexOperationsHost, materialId: string): LibraryMaterialProjection {
  requireStore(typeof materialId === 'string' && UUID_PATTERN.test(materialId), 'LIBRARY_MATERIAL_INVALID', '资料标识无效。');
  host.libraryCall(() => host.libraryMaterials.original(materialId));
  const pending = internalMaterialIndexCall(host, () => host.materialIndex.vectorTargets(materialId, host.embedding.identity, 1));
  requireStore(host.embedding.readiness().state === 'ready', 'MATERIAL_VECTORS_NEED_MODEL', '相似索引的模型文件不在本机或摘要不符：请在 设置 › 本机 › 相似索引模型 处理。');
  requireStore(!host.replacementFrozen(), 'MATERIAL_INDEX_READ_ONLY', MATERIAL_LAYERS_READ_ONLY);
  // Asked for by the editor: an item the idle lane queued no longer gives way to the editor's work.
  host.idleVectorItems.delete(materialId);
  if (pending.targets.length > 0 && !host.indexStopped && host.vectorBuilding !== materialId && !host.vectorQueue.includes(materialId)) {
    host.vectorQueue.push(materialId);
    internalStartVectorPump(host);
  }
  return host.inspectLibraryMaterial(materialId);
}

export function internalStartVectorPump(host: MaterialIndexOperationsHost): void {
  if (host.vectorRun === null) {
    host.vectorRun = internalPumpMaterialVectors(host).finally(() => {
      host.vectorRun = null;
    });
  }
}

export function indexIdleMaterialVectors(host: MaterialIndexOperationsHost, idle: boolean): void {
  host.vectorLaneIdle = idle;
  if (!idle || host.vectorRun !== null || host.indexStopped || host.poisoned || host.replacementFrozen() ||
    host.embedding.readiness().state !== 'ready') return;
  const books = new Set(host.enrollmentCall(() => host.enrollments.active())
    .filter((enrollment) => enrollment.kind === 'material-index' && !enrollment.paused).map((enrollment) => enrollment.bookId));
  for (const bookId of books) {
    for (const item of host.libraryCall(() => host.libraryMaterials.referable(bookId))) {
      if (host.vectorQueue.includes(item.materialId)) continue;
      try {
        if (internalMaterialIndexCall(host, () => host.materialIndex.vectorTargets(item.materialId, host.embedding.identity, 1)).targets.length === 0) continue;
      } catch (error) {
        if (!(error instanceof StoreError)) throw error;
        continue; // Not yet read, or its index is not ready: a later pass looks again.
      }
      host.idleVectorItems.add(item.materialId);
      host.vectorQueue.push(item.materialId);
    }
  }
  if (host.vectorQueue.length > 0) internalStartVectorPump(host);
}

export async function internalPumpMaterialVectors(host: MaterialIndexOperationsHost): Promise<void> {
  while (!host.indexStopped && host.vectorQueue.length > 0) {
    const materialId = host.vectorQueue.shift()!;
    host.vectorBuilding = materialId;
    try {
      for (;;) {
        if (host.indexStopped || host.poisoned || host.replacementFrozen() || host.embedding.readiness().state !== 'ready') break;
        if (host.idleVectorItems.has(materialId) && !host.vectorLaneIdle) break;
        const next = internalMaterialIndexCall(host, () => host.materialIndex.vectorTargets(materialId, host.embedding.identity, MATERIAL_VECTOR_BATCH));
        if (next.targets.length === 0) break;
        const vectors = await host.embedding.embed(next.targets.map((target) => target.text));
        requireStore(vectors.length === next.targets.length, 'MATERIAL_INDEX_INVALID', '相似向量无效。');
        await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
        if (host.indexStopped || host.poisoned || host.replacementFrozen()) break;
        host.transaction(host.authority, () => internalMaterialIndexCall(host, () => host.materialIndex.recordVectors(
          next, { identity: host.embedding.identity, dimensions: host.embedding.dimensions },
          next.targets.map((target, index) => ({ ordinal: target.ordinal, sha256: target.sha256, vector: vectors[index]! })))));
      }
    } catch {
      // Refused, or its build changed meanwhile: what was recorded stays, and asking again goes on from there. A rollback that
      // itself failed has already left the store unable to write: `#transaction` poisons it and throws `StoreFatalError`.
    } finally {
      host.vectorBuilding = null;
      host.idleVectorItems.delete(materialId);
    }
  }
}

export async function searchLibraryMaterialVectors(host: MaterialIndexOperationsHost, input: ServiceOperationMap['queryMaterialVectors']['input']): Promise<MaterialVectorSearchProjection> {
  requireStore(typeof input.materialId === 'string' && UUID_PATTERN.test(input.materialId) && typeof input.text === 'string' &&
    input.text.trim().length > 0 && input.text.length <= MAX_MATERIAL_VECTOR_QUERY_CODE_UNITS && input.text.isWellFormed() &&
    Number.isSafeInteger(input.k) && input.k >= 1 && input.k <= MAX_MATERIAL_VECTOR_CANDIDATES, 'MATERIAL_VECTOR_QUERY_INVALID', '检索内容无效：请写 1 到 2,000 字。');
  host.libraryCall(() => host.libraryMaterials.original(input.materialId));
  const embedding = internalEmbeddingFacts(host);
  requireStore(embedding.readiness.state === 'ready', 'MATERIAL_VECTORS_NEED_MODEL', '相似索引的模型文件不在本机或摘要不符：请在 设置 › 本机 › 相似索引模型 处理。');
  const [query] = await host.embedding.embed([input.text]);
  return internalMaterialIndexCall(host, () => host.materialIndex.search(input.materialId, embedding, query!, input.k));
}

export async function queryMaterialVectors(host: MaterialIndexOperationsHost, boundary: MaterialReferenceBoundary, text: string, k: number, materialIds?: readonly string[]): Promise<MaterialVectorQuery> {
  requireStore(typeof text === 'string' && text.trim().length > 0 && text.length <= MAX_MATERIAL_VECTOR_QUERY_CODE_UNITS && text.isWellFormed(),
      'MATERIAL_VECTOR_QUERY_INVALID', '检索内容无效。');
  const embedding = internalEmbeddingFacts(host);
  const query = embedding.readiness.state === 'ready' ? (await host.embedding.embed([text]))[0]! : null;
  return internalMaterialIndexCall(host, () => host.materialIndex.queryForTask(boundary, materialIds, embedding, query, k,
    (id, book) => host.libraryMaterials.available(id, book), (id) => host.libraryMaterials.original(id).title));
}

export function requestMaterialTranslation(host: MaterialIndexOperationsHost, materialId: string): LibraryMaterialProjection {
  requireStore(typeof materialId === 'string' && UUID_PATTERN.test(materialId), 'LIBRARY_MATERIAL_INVALID', '资料标识无效。');
  const original = host.libraryCall(() => host.libraryMaterials.original(materialId));
  const pending = internalMaterialIndexCall(host, () => host.materialIndex.translationTargets(materialId, 1));
  requireStore(pending.targets.length > 0, 'MATERIAL_TRANSLATION_COMPLETE', '每段都已有来源译文。');
  const request = internalTranslationRequest(host, original.source.sha256);
  requireStore(request.available, host.translating !== null ? 'MATERIAL_TRANSLATION_BUSY' : 'MATERIAL_TRANSLATION_NOT_ADMITTED', request.reason ?? MATERIAL_TRANSLATION_NOT_ADMITTED);
  const translator = host.translator!;
  host.translationFailures.delete(materialId);
  host.translating = materialId;
  host.translationRun = internalTranslateMaterial(host, materialId, translator, original.source.sha256).finally(() => {
    host.translating = null;
    host.translationRun = null;
  });
  return host.inspectLibraryMaterial(materialId);
}

export async function internalTranslateMaterial(host: MaterialIndexOperationsHost, materialId: string, translator: MaterialTranslator, originalSha256: string): Promise<void> {
  try {
    for (let requests = 0; ; requests += 1) {
      if (host.indexStopped || host.poisoned) return;
      if (host.replacementFrozen()) {
        host.translationFailures.set(materialId, MATERIAL_LAYERS_READ_ONLY);
        return;
      }
      const next = internalMaterialIndexCall(host, () => host.materialIndex.translationTargets(materialId, MATERIAL_TRANSLATION_BATCH_PARAGRAPHS));
      if (next.targets.length === 0) return;
      // One 生成来源译文 sends at most this many requests (Issue #892, brief revision 5); the rest is asked for again.
      if (requests >= MAX_MATERIAL_TRANSLATION_REQUESTS) {
        const remaining = internalMaterialIndexCall(host, () => host.materialIndex.translationRemaining(materialId));
        host.translationFailures.set(materialId,
            `已达到一次生成的上限（${MAX_MATERIAL_TRANSLATION_REQUESTS} 批，至多 ${(MAX_MATERIAL_TRANSLATION_REQUESTS * MATERIAL_TRANSLATION_BATCH_PARAGRAPHS).toLocaleString('en-US')} 段）；还有 ${remaining} 段未译，可再次「生成来源译文」。`);
        return;
      }
      const batch: typeof next.targets[number][] = [];
      let characters = 0;
      for (const target of next.targets) {
        if (batch.length > 0 && characters + target.text.length > MATERIAL_TRANSLATION_BATCH_CODE_UNITS) break;
        batch.push(target);
        characters += target.text.length;
      }
      if (characters > MATERIAL_TRANSLATION_BATCH_CODE_UNITS) {
        host.translationFailures.set(materialId, `第 ${batch[0]!.ordinal} 段超过一次可译的长度（${MATERIAL_TRANSLATION_BATCH_CODE_UNITS.toLocaleString('en-US')} 字），来源译文停在这一段之前。`);
        return;
      }
      const answer = await translator.translate(originalSha256, batch.map((target) => target.text), `${next.indexSha256.slice(0, 16)}/${batch[0]!.ordinal}`);
      if (answer.kind === 'failed') {
        if (answer.provenance !== undefined) host.transaction(host.authority, () => internalMaterialIndexCall(host, () => host.materialIndex.recordTranslationAttempt(
          next, originalSha256, batch, ['AI7_OUTCOME_UNKNOWN', 'PROVIDER_VALIDATION_OUTCOME_UNKNOWN'].includes(answer.provenance!.failureCode ?? '') ? 'outcome-unknown' : 'failed', answer.provenance!)));
        host.translationFailures.set(materialId, answer.message);
        return;
      }
      if (host.indexStopped || host.poisoned) return;
      if (host.replacementFrozen()) {
        host.translationFailures.set(materialId, MATERIAL_LAYERS_READ_ONLY);
        return;
      }
      host.transaction(host.authority, () => internalMaterialIndexCall(host, () => {
        if (answer.made.provenance !== undefined) host.materialIndex.recordTranslationAttempt(next, originalSha256, batch, 'translated', answer.made.provenance);
        host.materialIndex.recordTranslations(next, answer.made,
          batch.map((target, index) => ({ ordinal: target.ordinal, sha256: target.sha256, text: answer.texts[index]! })));
      }));
    }
  } catch (error) {
    host.translationFailures.set(materialId, error instanceof StoreError ? error.message : '来源译文没有完成；已记录的译文保留。');
  }
}
