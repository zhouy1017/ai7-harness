import { createBaselineRelations } from '../support/baseline-relations.js';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { MAX_FRAME_BYTES, MAX_MATERIAL_SEGMENTS_PAGE } from '../../src/shared/protocol.js';
import { MAX_MATERIAL_TRANSLATION_CODE_UNITS } from '../../src/service/fast-role/material-translation-contract.js';
import { LIBRARY_MATERIAL_SCHEMA_SQL } from '../../src/service/library-materials.js';
import { MATERIAL_INDEX_LAYER_SCHEMA_SQL, MaterialIndexError, MaterialIndexLedger, MATERIAL_INDEX_SCHEMA_SQL, materialCitation, materialParagraphCitation, type MaterialExtraction, type MaterialLayerActivity } from '../../src/service/material-index.js';

// Unit suite (L1) for the Material Index's on-request layer (Issue #892): the 来源译文 a build keeps beside it, the paragraphs
// 相似段落检索 ranks (R5-F2c: by words, with nothing built), and the boundary every Task read keeps. Every text is the suite's
// own synthetic words.

describe('the 来源译文 a build keeps beside it, and the paragraphs 相似段落检索 ranks', () => {
  const MATERIAL = '11111111-1111-4111-8111-111111111111';
  const OTHER = '33333333-3333-4333-8333-333333333333';
  const BOOK = '22222222-2222-4222-8222-222222222222';
  const SHA = 'a'.repeat(64);
  const ACTIVITY: MaterialLayerActivity = { translating: false, translationRequest: { available: true, reason: null }, translationFailure: null };
  const anyone = (): boolean => true;

  function store(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
    createBaselineRelations(db, LIBRARY_MATERIAL_SCHEMA_SQL);
    createBaselineRelations(db, MATERIAL_INDEX_SCHEMA_SQL);
    createBaselineRelations(db, MATERIAL_INDEX_LAYER_SCHEMA_SQL);
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

  it('hands 相似段落检索 every paragraph of the current build with its anchor and preview, and nothing before it is built', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    expect(() => ledger.searchableParagraphs(MATERIAL)).toThrowError(/还没有建好/u);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, english);
    const build = ledger.searchableParagraphs(MATERIAL);
    expect(build.indexDigest).toBe(ledger.referencePin(MATERIAL, BOOK, anyone).indexDigest);
    expect(build.paragraphs.map(({ ordinal, page, pageParagraph, preview }) => [ordinal, page, pageParagraph, preview])).toEqual([
      [1, null, null, 'The river rose at dawn.'], [2, null, null, 'Nobody in the village slept that night.'], [3, null, null, 'Accounts are filed every quarter.']]);
    // The projection names no similarity layer: the index's layers are its six (R5-F2c).
    expect(Object.keys(ledger.projection({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, 'queued', ACTIVITY).layers))
      .toEqual(['original', 'metadata', 'text', 'recognition', 'translation', 'segments']);
    // A segment whose bytes were changed is refused, never ranked.
    db.exec('DROP TRIGGER material_index_segments_no_update');
    db.exec("UPDATE material_index_segments SET canonical_json = replace(canonical_json, 'river', 'ocean') WHERE ordinal = 1");
    expect(() => new MaterialIndexLedger(db).searchableParagraphs(MATERIAL)).toThrowError(MaterialIndexError);
    db.close();
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

  it.each(['译', '\u0001'])('pages long translations within the response frame without losing originals (%j)', (character) => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    const blocks = Array.from({ length: MAX_MATERIAL_SEGMENTS_PAGE * 2 + 1 }, (_, index) => block(`Synthetic paragraph ${index + 1}.`, index));
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, { ...english, blocks });
    const next = ledger.translationTargets(MATERIAL, blocks.length);
    const text = character.repeat(MAX_MATERIAL_TRANSLATION_CODE_UNITS);
    ledger.recordTranslations(next, { model: 'synthetic-model', route: 'test', policyRuleId: 'test', promptContractDigest: 'd'.repeat(64) },
      next.targets.map((target) => ({ ordinal: target.ordinal, sha256: target.sha256, text })));
    const seen: number[] = [];
    let from: number | null = 1;
    while (from !== null) {
      const page = ledger.page(MATERIAL, 'Synthetic notes', from);
      expect(Buffer.byteLength(JSON.stringify({ id: 'r', ok: true, op: 'inspectLibraryMaterialSegments', result: page }))).toBeLessThanOrEqual(MAX_FRAME_BYTES);
      expect(page.segments.length).toBeGreaterThan(0);
      for (const segment of page.segments) {
        expect(segment.text).toBe(blocks[segment.ordinal - 1]!.text);
        expect(segment.translation?.text).toBe(text);
        seen.push(segment.ordinal);
      }
      if (page.previous !== null) {
        const previous = ledger.page(MATERIAL, 'Synthetic notes', page.previous);
        expect(previous.segments[0]!.ordinal).toBeLessThan(from);
        expect(previous.segments.at(-1)!.ordinal).toBeGreaterThanOrEqual(from - 1);
      }
      from = page.next;
    }
    expect(seen).toEqual(blocks.map((_, index) => index + 1));
    db.close();
  });

  it('asks no 来源译文 of a Chinese item', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, { ...english, blocks: [block('河边的小屋。', 0)] });
    expect(ledger.projection({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, 'queued', ACTIVITY).translation).toBeNull();
    expect(() => ledger.translationTargets(MATERIAL, 20)).toThrowError(/不需要来源译文/u);
  });
});
