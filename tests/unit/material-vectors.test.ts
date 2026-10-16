import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { cosineSimilarity, vectorBytes, vectorFromBytes, vectorNorm } from '../../src/service/knowledge/embedding.js';
import { STUB_EMBEDDING_DIMENSIONS, STUB_EMBEDDING_IDENTITY, StubEmbeddingProvider, stubEmbedding, stubFeatures } from '../../src/service/knowledge/embedding-stub.js';
import { initializeLibraryMaterialSchema } from '../../src/service/library-materials.js';
import {
  MATERIAL_INDEX_LAYER_SCHEMA_SQL,
  MaterialIndexError,
  MaterialIndexLedger,
  initializeMaterialIndexLayerSchema,
  initializeMaterialIndexSchema,
  materialCitation,
  materialParagraphCitation,
  type MaterialEmbeddingFacts,
  type MaterialExtraction,
  type MaterialLayerActivity,
} from '../../src/service/material-index.js';

// Unit suite (L1) for the Material Index's two on-request layers (Issue #892): the built-in similarity provider, the vectors
// and 来源译文 a build keeps beside it, the similarity search an editor and a Task make, and the boundary every Task read keeps.
// Every text is the suite's own synthetic words.

describe('the built-in similarity provider', () => {
  it('is deterministic, provider-free and of unit length, and nothing makes no vector', async () => {
    const provider = new StubEmbeddingProvider();
    expect([provider.identity, provider.dimensions, provider.readiness()]).toEqual([STUB_EMBEDDING_IDENTITY, STUB_EMBEDDING_DIMENSIONS, { state: 'ready' }]);
    expect([STUB_EMBEDDING_IDENTITY, STUB_EMBEDDING_DIMENSIONS]).toEqual(['ai7-embedding/stub-1', 256]);
    const [first, again, blank] = await provider.embed(['河边的小屋里住着一位老人。', '河边的小屋里住着一位老人。', '  。！ ']);
    expect(first).toEqual(again);
    expect(first).toHaveLength(256);
    expect(vectorNorm(first!)).toBeCloseTo(1, 6);
    expect(vectorNorm(blank!)).toBe(0);
    // Han characters count one by one and in adjacent pairs; every other run of letters or digits is one lower-cased word.
    expect(stubFeatures('老人 Old-man 42')).toEqual(['h:老', 'h:人', 'b:老人', 'w:old', 'w:man', 'w:42']);
  });

  it('puts paragraphs that share words nearer each other than ones that share none', () => {
    const query = stubEmbedding('老人住在河边');
    const near = stubEmbedding('河边的小屋里住着一位老人。');
    const far = stubEmbedding('会计报表需要按季度提交。');
    const score = (vector: Float32Array): number => cosineSimilarity(vector, vectorNorm(vector), query, vectorNorm(query));
    expect(score(near)).toBeGreaterThan(score(far));
    expect(score(near)).toBeGreaterThan(0.3);
    expect(cosineSimilarity(near, 0, query, 1)).toBe(0);
  });

  it('stores a vector as little-endian float32 bytes and reads it back exactly, refusing a wrong length', () => {
    const vector = stubEmbedding('round trip');
    const bytes = vectorBytes(vector);
    expect(bytes.byteLength).toBe(256 * 4);
    expect(vectorFromBytes(bytes, 256)).toEqual(vector);
    expect(vectorFromBytes(bytes.subarray(4), 256)).toBeNull();
  });
});

describe('the vectors and 来源译文 a build keeps beside it', () => {
  const MATERIAL = '11111111-1111-4111-8111-111111111111';
  const OTHER = '33333333-3333-4333-8333-333333333333';
  const BOOK = '22222222-2222-4222-8222-222222222222';
  const SHA = 'a'.repeat(64);
  const STUB: MaterialEmbeddingFacts = { identity: STUB_EMBEDDING_IDENTITY, dimensions: STUB_EMBEDDING_DIMENSIONS, readiness: { state: 'ready' } };
  const ACTIVITY: MaterialLayerActivity = {
    embedding: STUB, vectorsBuilding: false, translating: false, translationRequest: { available: true, reason: null }, translationFailure: null,
  };
  const anyone = (): boolean => true;
  const nobody = (): boolean => false;
  const titleOf = (materialId: string): string => (materialId === MATERIAL ? '英文资料' : '另一份');

  function store(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
    initializeLibraryMaterialSchema(db);
    initializeMaterialIndexSchema(db);
    initializeMaterialIndexLayerSchema(db, 75);
    for (const [id, sha, object] of [[MATERIAL, SHA, 'b'.repeat(64)], [OTHER, 'c'.repeat(64), 'd'.repeat(64)]] as const) {
      db.prepare('INSERT INTO library_materials(material_id, object_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
        .run(id, object, '2026-10-09T00:00:00.000Z', '{}', sha);
    }
    return db;
  }

  const block = (text: string, index: number, page?: { page: number; paragraph: number }) =>
    ({ kind: 'paragraph' as const, level: null, text, graphemeLength: [...text].length, sourceParagraphIndex: index, ...(page === undefined ? {} : { page }) });
  const english: MaterialExtraction = {
    state: 'complete', converter: 'test', documentTitle: null,
    blocks: [block('The river rose at dawn.', 0), block('Nobody in the village slept that night.', 1), block('Accounts are filed every quarter.', 2)],
  };

  /** Every paragraph's vector made by the stub and recorded, as the store's builder does a batch at a time. */
  function buildVectors(ledger: MaterialIndexLedger, materialId: string): void {
    const next = ledger.vectorTargets(materialId, STUB.identity, 100);
    ledger.recordVectors(next, STUB, next.targets.map((target) => ({ ordinal: target.ordinal, sha256: target.sha256, vector: stubEmbedding(target.text) })));
  }

  it('creates revision 76\'s two relations once, exactly, and refuses a store stamped 76 without them', () => {
    const db = store();
    expect(Object.keys(MATERIAL_INDEX_LAYER_SCHEMA_SQL)).toEqual(['material_index_vectors', 'material_index_translations']);
    initializeMaterialIndexLayerSchema(db, 76);
    const bare = new DatabaseSync(':memory:');
    bare.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
    initializeLibraryMaterialSchema(bare);
    initializeMaterialIndexSchema(bare);
    expect(() => initializeMaterialIndexLayerSchema(bare, 76)).toThrowError(MaterialIndexError);
    // A relation whose text differs is refused, never used.
    db.exec('DROP TRIGGER material_index_vectors_no_delete');
    expect(() => initializeMaterialIndexLayerSchema(db, 76)).toThrowError(/结构不兼容/u);
  });

  it('builds vectors only when asked, keyed to the build and its segments, and says where they stand', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, english);
    const projected = (activity: MaterialLayerActivity = ACTIVITY) => ledger.projection({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, 'queued', activity);
    expect(projected().vectors).toMatchObject({ state: 'not-built', built: 0, total: 3 });
    expect(projected({ ...ACTIVITY, vectorsBuilding: true }).layers.vectors).toBe('building');
    expect(projected({ ...ACTIVITY, embedding: { ...STUB, readiness: { state: 'needs-model', expectedDigest: 'f'.repeat(64) } } }).vectors)
      .toMatchObject({ state: 'needs-model', expectedDigest: 'f'.repeat(64) });
    // One batch of two, then the rest.
    const first = ledger.vectorTargets(MATERIAL, STUB.identity, 2);
    expect(first.targets.map((target) => target.ordinal)).toEqual([1, 2]);
    ledger.recordVectors(first, STUB, first.targets.map((target) => ({ ordinal: target.ordinal, sha256: target.sha256, vector: stubEmbedding(target.text) })), '2026-10-16T01:00:00.000Z');
    expect(projected().vectors).toMatchObject({ state: 'not-built', built: 2, builtAt: '2026-10-16T01:00:00.000Z' });
    // A paragraph whose segment digest is not the one the vector was made from is refused, and so is a vector made twice.
    const rest = ledger.vectorTargets(MATERIAL, STUB.identity, 5);
    expect(() => ledger.recordVectors(rest, STUB, [{ ordinal: 3, sha256: 'e'.repeat(64), vector: stubEmbedding('x') }])).toThrowError(/分段已不是/u);
    expect(() => ledger.recordVectors(first, STUB, [{ ordinal: 1, sha256: first.targets[0]!.sha256, vector: stubEmbedding('x') }])).toThrow();
    expect(() => ledger.recordVectors(rest, STUB, [{ ordinal: 3, sha256: rest.targets[0]!.sha256, vector: new Float32Array(3) }])).toThrowError(/相似向量无效/u);
    expect(() => ledger.recordVectors({ ...rest, indexSha256: 'f'.repeat(64) }, STUB, [])).toThrowError(/索引版本已不在本机/u);
    ledger.recordVectors(rest, STUB, rest.targets.map((target) => ({ ordinal: target.ordinal, sha256: target.sha256, vector: stubEmbedding(target.text) })));
    expect(projected().vectors).toMatchObject({ state: 'complete', built: 3, total: 3, embedding: STUB_EMBEDDING_IDENTITY });
    // Vectors of another identity are not this provider's: they are not built for it.
    expect(projected({ ...ACTIVITY, embedding: { ...STUB, identity: 'ai7-embedding/other' } }).vectors).toMatchObject({ state: 'not-built', built: 0 });
    // Append-only.
    expect(() => db.exec('DELETE FROM material_index_vectors')).toThrowError(/MATERIAL_INDEX_LEDGER_IMMUTABLE/u);
    expect(() => db.exec('UPDATE material_index_vectors SET norm = 0')).toThrowError(/MATERIAL_INDEX_LEDGER_IMMUTABLE/u);
  });

  it('pins every vector column by CHECK', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, english);
    const next = ledger.vectorTargets(MATERIAL, STUB.identity, 1);
    const insert = (blob: Uint8Array, dimensions: number, norm: number): void => {
      db.prepare(`INSERT INTO material_index_vectors(index_id, index_sha256, embedding, ordinal, segment_sha256, dimensions, vector, norm, recorded_at)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'now')`).run(next.indexId, next.indexSha256, STUB.identity, next.targets[0]!.sha256, dimensions, blob, norm);
    };
    expect(() => insert(new Uint8Array(12), 4, 1)).toThrowError(/CHECK/u);
    expect(() => insert(new Uint8Array(16), 4, -1)).toThrowError(/CHECK/u);
    expect(() => insert(new Uint8Array(0), 0, 0)).toThrowError(/CHECK/u);
  });

  it('searches an item\'s vectors for the editor, nearest first, refusing before they are built', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, english);
    expect(() => ledger.search(MATERIAL, STUB, stubEmbedding('river'), 3)).toThrowError(/还没有建好/u);
    buildVectors(ledger, MATERIAL);
    const found = ledger.search(MATERIAL, STUB, stubEmbedding('the river at dawn'), 5);
    expect(found.candidates[0]).toMatchObject({ ordinal: 1, page: null, pageParagraph: null, preview: 'The river rose at dawn.' });
    // A paragraph nothing like the query is no candidate.
    expect(found.candidates.map((candidate) => candidate.ordinal)).not.toContain(3);
    expect(() => ledger.search(MATERIAL, { ...STUB, readiness: { state: 'needs-model', expectedDigest: null } }, stubEmbedding('x'), 1)).toThrowError(/模型文件/u);
    expect(() => ledger.search(MATERIAL, STUB, stubEmbedding('x'), 33)).toThrowError(MaterialIndexError);
    // A vector whose bytes were changed is refused, never ranked.
    db.exec('DROP TRIGGER material_index_vectors_no_update');
    db.exec('UPDATE material_index_vectors SET norm = norm + 1 WHERE ordinal = 2');
    expect(() => new MaterialIndexLedger(db).search(MATERIAL, STUB, stubEmbedding('x'), 1)).toThrowError(/相似向量记录已损坏/u);
  });

  it('searches for a Task only within its plan boundary, exactly as its reads, and grants nothing', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, english);
    ledger.record({ materialId: OTHER, sha256: 'c'.repeat(64), format: 'TXT' }, { ...english, blocks: [block('The river is quiet.', 0)] });
    buildVectors(ledger, MATERIAL);
    const pin = ledger.referencePin(MATERIAL, BOOK, anyone);
    const otherPin = ledger.referencePin(OTHER, BOOK, anyone);
    const boundary = { bookId: BOOK, references: [pin, otherPin] };
    const query = stubEmbedding('river');
    const result = ledger.queryForTask(boundary, undefined, STUB, query, 4, anyone, titleOf);
    expect(result.embedding).toBe(STUB_EMBEDDING_IDENTITY);
    expect(result.candidates.map((candidate) => [candidate.materialId, candidate.ordinal, candidate.anchor])).toEqual([[MATERIAL, 1, '《英文资料》第 1 段']]);
    expect(result.candidates[0]!.indexDigest).toBe(pin.indexDigest);
    // The other pinned item has no vectors: it is said not searched, never built here.
    expect(result.unsearched).toEqual([{ materialId: OTHER, reason: 'vectors-not-built' }]);
    expect((db.prepare('SELECT count(*) AS n FROM material_index_vectors WHERE index_id = (SELECT index_id FROM material_index_builds WHERE material_id = ?)').get(OTHER) as { n: number }).n).toBe(0);
    // An item named that the plan does not list, an item no longer referable, and a pinned build gone each refuse the search.
    expect(() => ledger.queryForTask({ bookId: BOOK, references: [pin] }, [OTHER], STUB, query, 4, anyone, titleOf)).toThrowError(/不在这项任务计划/u);
    expect(() => ledger.queryForTask(boundary, undefined, STUB, query, 4, nobody, titleOf)).toThrowError(/现在不能列进/u);
    expect(() => ledger.queryForTask({ bookId: BOOK, references: [{ ...pin, indexDigest: 'f'.repeat(64) }] }, undefined, STUB, query, 4, anyone, titleOf))
      .toThrowError(/索引版本已不在本机/u);
    // An empty boundary searches nothing: a built index is no Run scope.
    expect(ledger.queryForTask({ bookId: BOOK, references: [] }, undefined, STUB, query, 4, anyone, titleOf)).toEqual({ embedding: STUB_EMBEDDING_IDENTITY, candidates: [], unsearched: [] });
    // A provider that cannot embed searches nothing and says so.
    expect(ledger.queryForTask(boundary, [MATERIAL], { ...STUB, readiness: { state: 'needs-model', expectedDigest: null } }, null, 4, anyone, titleOf).unsearched)
      .toEqual([{ materialId: MATERIAL, reason: 'embedding-not-ready' }]);
  });

  it('records 来源译文 beside the paragraphs it translates, labelled and attributed, and reads them as a separate layer', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    const paged: MaterialExtraction = {
      state: 'complete', converter: 'test', documentTitle: null, pageCount: 2,
      blocks: [block('The river rose at dawn.', 0, { page: 1, paragraph: 1 }), block('Nobody slept.', 1, { page: 2, paragraph: 1 })],
    };
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'PDF' }, paged);
    const projected = (activity: MaterialLayerActivity = ACTIVITY) => ledger.projection({ materialId: MATERIAL, sha256: SHA, format: 'PDF' }, 'queued', activity);
    expect(projected().metadata).toMatchObject({ language: 'other', pages: 2 });
    expect(projected().translation).toEqual({ state: 'not-built', translated: 0, total: 2, model: null, request: { available: true, reason: null }, lastFailure: null });
    const made = { model: 'deepseek-v4-flash', route: 'opencode-go', policyRuleId: 'rule', promptContractDigest: 'd'.repeat(64) };
    const next = ledger.translationTargets(MATERIAL, 20);
    ledger.recordTranslations(next, made, [{ ordinal: 1, sha256: next.targets[0]!.sha256, text: '黎明时河水上涨。' }], '2026-10-16T02:00:00.000Z');
    expect(projected().translation).toMatchObject({ state: 'partial', translated: 1, model: 'deepseek-v4-flash' });
    expect(projected({ ...ACTIVITY, translating: true, translationFailure: '结果待确认' }).translation)
      .toMatchObject({ state: 'building', request: { available: false, reason: '正在生成来源译文。' }, lastFailure: '结果待确认' });
    // The page shows each paragraph's translation beside it; the original stands.
    const page = ledger.page(MATERIAL, '英文资料', 1);
    expect(page.segments.map((segment) => [segment.text, segment.page, segment.pageParagraph, segment.translation])).toEqual([
      ['The river rose at dawn.', 1, 1, { text: '黎明时河水上涨。', model: 'deepseek-v4-flash' }],
      ['Nobody slept.', 2, 1, null],
    ]);
    // A Task reads them as their own labelled layer, attributed to the paragraph; the citations name the page.
    const pin = ledger.referencePin(MATERIAL, BOOK, anyone);
    const reading = ledger.readForTask({ bookId: BOOK, references: [pin] }, MATERIAL, '英文资料', 1, anyone);
    expect(reading.segments.map((segment) => segment.text)).toEqual(['The river rose at dawn.', 'Nobody slept.']);
    expect(reading.segments[0]!.sentences[0]!.citation).toBe('《英文资料》第 1 页第 1 段第 1 句');
    expect(materialCitation('英文资料', 2, 1, { page: 2, paragraph: 1 })).toBe('《英文资料》第 2 页第 1 段第 1 句');
    expect(reading.translations).toEqual([{ ordinal: 1, label: '来源译文', text: '黎明时河水上涨。', model: 'deepseek-v4-flash', attribution: '《英文资料》第 1 页第 1 段' }]);
    expect(materialParagraphCitation('英文资料', 2)).toBe('《英文资料》第 2 段');
    // A translation made twice, of a paragraph that changed, or of a build gone, is refused; nothing is rewritten.
    expect(() => ledger.recordTranslations(next, made, [{ ordinal: 1, sha256: next.targets[0]!.sha256, text: '再译。' }])).toThrow();
    expect(() => ledger.recordTranslations(next, made, [{ ordinal: 2, sha256: 'e'.repeat(64), text: '无人入睡。' }])).toThrowError(/分段已不是/u);
    expect(() => ledger.recordTranslations({ ...next, indexSha256: 'f'.repeat(64) }, made, [])).toThrowError(/索引版本已不在本机/u);
    const rest = ledger.translationTargets(MATERIAL, 20);
    ledger.recordTranslations(rest, made, [{ ordinal: 2, sha256: rest.targets[0]!.sha256, text: '无人入睡。' }]);
    expect(projected().translation).toMatchObject({ state: 'complete', translated: 2, request: { available: false, reason: '每段都已有来源译文。' } });
    expect(ledger.translationTargets(MATERIAL, 20).targets).toEqual([]);
    // A record whose text was changed is refused wherever it is read.
    db.exec('DROP TRIGGER material_index_translations_no_update');
    db.exec("UPDATE material_index_translations SET canonical_json = replace(canonical_json, '黎明', '傍晚') WHERE ordinal = 1");
    expect(() => new MaterialIndexLedger(db).page(MATERIAL, '英文资料', 1)).toThrowError(/来源译文记录已损坏/u);
  });

  it('asks no 来源译文 of a Chinese item', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, { ...english, blocks: [block('河边的小屋。', 0)] });
    expect(ledger.projection({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, 'queued', ACTIVITY).translation).toBeNull();
    expect(() => ledger.translationTargets(MATERIAL, 20)).toThrowError(/不需要来源译文/u);
  });
});
