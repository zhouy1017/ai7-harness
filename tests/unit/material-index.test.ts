import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  MATERIAL_INDEX_SCHEMA_SQL,
  MaterialIndexError,
  MaterialIndexLedger,
  classifyLanguage,
  initializeMaterialIndexSchema,
  materialCitation,
  splitSentences,
  type MaterialExtraction,
} from '../../src/service/material-index.js';
import { LIBRARY_MATERIAL_SCHEMA_SQL, initializeLibraryMaterialSchema } from '../../src/service/library-materials.js';

// Unit suite (L1) for the Material Index's own rules (Issue #428, plan slice S80a; V2-UX-KB-009): the sentence anchors, the
// language the Source Translation layer reads, and the ledger's projection and boundary over a minimal in-memory store. Every
// text here is the suite's own synthetic words.

const sentences = (text: string): string[] => splitSentences(text).map(([start, end]) => text.slice(start, end));

describe('the sentence anchors of a paragraph', () => {
  it('ends a sentence after its end marks and the closing quotes or brackets that follow, trimming white space', () => {
    expect(sentences('她推开窗。风吹进来！他问：“你记得吗？”最后')).toEqual(['她推开窗。', '风吹进来！', '他问：“你记得吗？”', '最后']);
    expect(sentences('  前有空白。  后也有。  ')).toEqual(['前有空白。', '后也有。']);
    expect(sentences('（括号里的话。）接着说')).toEqual(['（括号里的话。）', '接着说']);
    expect(sentences('等一等……再说吧？！好')).toEqual(['等一等……', '再说吧？！', '好']);
    expect(sentences('《书名》很好。」')).toEqual(['《书名》很好。」']);
  });

  it('keeps a Latin full stop inside a number or a word, and ends at one before white space or the end', () => {
    expect(sentences('Pi is 3.14 here. Next one.')).toEqual(['Pi is 3.14 here.', 'Next one.']);
    expect(sentences('e.g.no space')).toEqual(['e.g.no space']);
    expect(sentences('Done.')).toEqual(['Done.']);
    expect(sentences('Really?! Yes')).toEqual(['Really?!', 'Yes']);
  });

  it('ends a sentence at a line break, gives none for white space, and one for a paragraph without end marks', () => {
    expect(sentences('第一行\n第二行\r\n第三行')).toEqual(['第一行', '第二行', '第三行']);
    expect(sentences('   ')).toEqual([]);
    expect(sentences('')).toEqual([]);
    expect(sentences('没有句号的一段')).toEqual(['没有句号的一段']);
  });

  it('never splits a surrogate pair and covers each sentence exactly once, in order', () => {
    const text = '𠀀字在前。😀表情在后！𠀁';
    const ranges = splitSentences(text);
    expect(sentences(text)).toEqual(['𠀀字在前。', '😀表情在后！', '𠀁']);
    for (const [start, end] of ranges) {
      expect(text.slice(start, end).isWellFormed()).toBe(true);
    }
    for (let index = 1; index < ranges.length; index += 1) expect(ranges[index]![0]).toBeGreaterThanOrEqual(ranges[index - 1]![1]);
  });
});

describe('the language a text is mostly in', () => {
  it('is Chinese when Han characters are at least half of the letters, another language when fewer, none without letters', () => {
    expect(classifyLanguage(['中文书 ab'])).toBe('zh');
    expect(classifyLanguage(['中文 text'])).toBe('other');
    expect(classifyLanguage(['中文', 'ab'])).toBe('zh');
    expect(classifyLanguage(['中', 'abc'])).toBe('other');
    expect(classifyLanguage(['The river rose.'])).toBe('other');
    expect(classifyLanguage(['123 —— ！', ''])).toBe('none');
    expect(classifyLanguage([])).toBe('none');
  });
});

describe('the ledger over a minimal store', () => {
  const MATERIAL = '11111111-1111-4111-8111-111111111111';
  const BOOK = '22222222-2222-4222-8222-222222222222';
  const SHA = 'a'.repeat(64);

  function store(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE books (book_id TEXT PRIMARY KEY) STRICT');
    initializeLibraryMaterialSchema(db);
    initializeMaterialIndexSchema(db);
    db.prepare('INSERT INTO library_materials(material_id, object_sha256, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?)')
      .run(MATERIAL, 'b'.repeat(64), '2026-10-09T00:00:00.000Z', '{}', SHA);
    return db;
  }

  const complete: MaterialExtraction = {
    state: 'complete', converter: 'test', documentTitle: '自带标题',
    blocks: [
      { kind: 'title', level: null, text: '标题', graphemeLength: 2, sourceParagraphIndex: 0 },
      { kind: 'paragraph', level: null, text: '第一句。第二句。', graphemeLength: 8, sourceParagraphIndex: 2 },
    ],
  };

  it('creates its relations once and records one build per item, with the metadata it read', () => {
    const db = store();
    initializeMaterialIndexSchema(db);
    expect(Object.keys(MATERIAL_INDEX_SCHEMA_SQL)).toEqual(['material_index_builds', 'material_index_segments']);
    expect(Object.keys(LIBRARY_MATERIAL_SCHEMA_SQL)).toContain('library_materials');
    const ledger = new MaterialIndexLedger(db);
    expect(ledger.unindexed()).toEqual([MATERIAL]);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'DOCX' }, complete, '2026-10-09T01:00:00.000Z');
    expect(ledger.unindexed()).toEqual([]);
    const projection = ledger.projection({ materialId: MATERIAL, sha256: SHA, format: 'DOCX' }, 'queued');
    expect(projection).toMatchObject({
      state: 'complete', reason: null, builtAt: '2026-10-09T01:00:00.000Z',
      metadata: { documentTitle: '自带标题', language: 'zh', paragraphs: 2, headings: 1, sentences: 3, characters: 10 },
    });
    expect(() => ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'DOCX' }, complete)).toThrowError(MaterialIndexError);
    // A record of an item that moved is refused.
    const other = store();
    expect(() => new MaterialIndexLedger(other).record({ materialId: MATERIAL, sha256: 'c'.repeat(64), format: 'DOCX' }, complete)).toThrowError(MaterialIndexError);
    const page = ledger.page(MATERIAL, '资料', 1);
    expect(page.segments.map((segment) => [segment.ordinal, segment.kind, segment.sentences])).toEqual([[1, 'title', [[0, 2]]], [2, 'paragraph', [[0, 4], [4, 8]]]]);
    expect(page.next).toBeNull();
    expect(page.previous).toBeNull();
  });

  it('refuses a damaged segment and a damaged build, wherever it is read', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'DOCX' }, complete);
    db.exec('DROP TRIGGER material_index_segments_no_update');
    db.exec("UPDATE material_index_segments SET canonical_json = replace(canonical_json, '第一句', '第三句') WHERE ordinal = 2");
    expect(() => new MaterialIndexLedger(db).page(MATERIAL, '资料', 1)).toThrowError(/MATERIAL_INDEX_RECORD_INVALID|已损坏/u);
    // A segment rewritten with a digest of its own still breaks the build's digest over every segment.
    const forged = store();
    const third = new MaterialIndexLedger(forged);
    third.record({ materialId: MATERIAL, sha256: SHA, format: 'DOCX' }, complete);
    forged.exec('DROP TRIGGER material_index_segments_no_update');
    const row = forged.prepare('SELECT canonical_json FROM material_index_segments WHERE ordinal = 2').get() as { canonical_json: string };
    const json = row.canonical_json.replace('第一句', '第三句');
    forged.prepare('UPDATE material_index_segments SET canonical_json = ?, sha256 = ? WHERE ordinal = 2').run(json, createHash('sha256').update(json).digest('hex'));
    expect(() => new MaterialIndexLedger(forged).page(MATERIAL, '资料', 1)).toThrowError(MaterialIndexError);
    const fresh = store();
    const second = new MaterialIndexLedger(fresh);
    second.record({ materialId: MATERIAL, sha256: SHA, format: 'DOCX' }, complete);
    fresh.exec('DROP TRIGGER material_index_builds_no_update');
    fresh.exec("UPDATE material_index_builds SET recorded_at = '2000-01-01T00:00:00.000Z'");
    expect(() => second.current(MATERIAL)).toThrowError(MaterialIndexError);
  });

  it('pins and reads only within the boundary its availability allows', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'TXT' }, complete);
    const nobody = (): boolean => false;
    const anyone = (): boolean => true;
    expect(() => ledger.referencePin(MATERIAL, BOOK, nobody)).toThrowError(/这份资料还不能列进/u);
    const pin = ledger.referencePin(MATERIAL, BOOK, anyone);
    const reading = ledger.readForTask({ bookId: BOOK, references: [pin] }, MATERIAL, '资料', 1, anyone);
    expect(reading.segments[1]!.sentences.map((sentence) => sentence.citation)).toEqual([materialCitation('资料', 2, 1), materialCitation('资料', 2, 2)]);
    expect(materialCitation('资料', 2, 1)).toBe('《资料》第 2 段第 1 句');
    expect(() => ledger.readForTask({ bookId: BOOK, references: [] }, MATERIAL, '资料', 1, anyone)).toThrowError(/不在这项任务计划/u);
    expect(() => ledger.readForTask({ bookId: BOOK, references: [pin] }, MATERIAL, '资料', 1, nobody)).toThrowError(/现在不能列进/u);
  });

  it('records a build that read no text with its reason and no segments', () => {
    const db = store();
    const ledger = new MaterialIndexLedger(db);
    ledger.record({ materialId: MATERIAL, sha256: SHA, format: 'PDF' }, { state: 'unsupported', reason: 'needs-local-dependency', converter: null });
    expect(ledger.projection({ materialId: MATERIAL, sha256: SHA, format: 'PDF' }, 'indexing')).toMatchObject({
      state: 'unsupported', reason: 'needs-local-dependency', metadata: { language: null, paragraphs: 0 },
      layers: { text: 'deferred', recognition: 'deferred', segments: 'deferred', translation: 'deferred', vectors: 'deferred' },
    });
    expect(() => ledger.page(MATERIAL, '资料', 1)).toThrowError(/没有提取出可分段的文字/u);
    expect((db.prepare('SELECT count(*) count FROM material_index_segments').get() as { count: number }).count).toBe(0);
    expect(ledger.completions('2000-01-01T00:00:00.000Z', 5).map((entry) => entry.state)).toEqual(['unsupported']);
    expect(ledger.completions('2999-01-01T00:00:00.000Z', 5)).toEqual([]);
  });
});
