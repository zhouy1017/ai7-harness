import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_OBJECT_DIRECTORY } from '../../src/service/library-materials.js';
import { MATERIAL_INDEXER_IDENTITY, MATERIAL_INDEX_SCHEMA_SQL, MATERIAL_INDEX_TRIGGER_SQL, MATERIAL_INDEX_WORK_DIRECTORY } from '../../src/service/material-index.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL } from '../../src/service/background-analysis-enrollments.js';
import { replacementBlockedBy } from '../../src/service/replacement-gate.js';
import { MATERIAL_INDEX_SCHEMA_VERSION, WRITING_TASK_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { buildManuscriptPackage } from '../../src/service/text-manuscript.js';
import { MAX_FRAME_BYTES, MAX_MATERIAL_SEGMENTS_PAGE, type LibraryMaterialKind, type LibraryMaterialProjection } from '../../src/shared/protocol.js';
import { sample1Path } from '../support/sample1-baseline.js';
import { analysisRunAuthorizationsShape, downgradeAnalysisRunAuthorizationsToRevision65 } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

// Service-integration suite (L2) for ⑤ 资料库 · 资料索引 (Issue #428, plan slice S80a; editor-surfaces §8.4, V2-UX-KB-009,
// ATTN-009) over the real store on a temporary Agent Data Root. The collected book is exact `sample1` — an admitted Public
// SampleBook — and every other file is the suite's own synthetic words, never a manuscript. The Owner's option 乙
// (2026-10-09) builds four layers — original, metadata, extracted text, sentence-anchored segments — and states similarity
// vectors, recognition and machine 来源译文 as not provided. A Task reads the index read-only, only within its plan boundary.

/** An archive as every writer in the product writes one: at the fixed archive time (#611). */
const archive = (files: Zippable): Uint8Array => zipSync(files, { mtime: fixedArchiveTime() });

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-material-index-');
});

afterEach(async () => {
  await roots.dispose();
});

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function emptyBook(store: EditorialStore, title: string): string {
  const creation = store.prepareBookCreation(title, null);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

function file(name: string, content: string | Uint8Array): string {
  const directory = join(roots.inputRoot, 'library-index');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

async function put(store: EditorialStore, path: string, title: string, kind: LibraryMaterialKind = 'document'): Promise<LibraryMaterialProjection> {
  const preview = await store.previewLibraryMaterial(path);
  return store.addLibraryMaterial({ previewId: preview.previewId, title, kind });
}

/** Nothing else that would write is under way: what the service's gate reads besides the builder. */
const QUIET = { runsIdle: true, reviewRunsDriving: false, jobsBusy: false, exportRunning: false, backgroundBusy: false } as const;

const storePath = (): string => join(roots.dataRoot, 'store', 'ai7.sqlite');

/** What another connection sees change: SQLite's data version moves whenever any other connection commits. */
function watcher(): { changed(): boolean; close(): void } {
  const database = new DatabaseSync(storePath(), { readOnly: true });
  const version = (): number => (database.prepare('PRAGMA data_version').get() as { data_version: number }).data_version;
  const before = version();
  return { changed: () => version() !== before, close: () => database.close() };
}

const CHINESE = '第一章 春\n\n她推开窗。风从河上吹来，带着潮湿的气味！他问：“你还记得吗？”\n\n第二段只有一句话\n\n圆周率约等于3.14。最后一句……';

describe('资料索引 over the real store', () => {
  it('builds the four layers of a collected book on this machine, pages its sentence anchors, and says 索引完成', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const added = await put(store, sample1Path(roots.codeRoot), '样书一', 'book');
      // A store that does not serve builds nothing by itself: the item waits, every layer but the original pending, the
      // deferred ones not provided from the start.
      expect(added.index).toEqual({
        state: 'queued', reason: null, builtAt: null, digest: null, metadata: null,
        layers: { original: 'complete', metadata: 'pending', text: 'pending', recognition: 'not-needed', translation: 'pending', segments: 'pending', vectors: 'deferred' },
      });
      expect(await refusal(() => store.inspectLibraryMaterialSegments({ materialId: added.materialId, from: 1 }))).toBe('MATERIAL_INDEX_NOT_READY');

      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const built = store.inspectLibraryMaterial(added.materialId).index;
      expect(built.state).toBe('complete');
      expect(built.reason).toBeNull();
      expect(built.layers).toEqual({ original: 'complete', metadata: 'complete', text: 'complete', recognition: 'not-needed', translation: 'not-needed', segments: 'complete', vectors: 'deferred' });
      expect(built.metadata!.language).toBe('zh');
      expect(built.metadata!.paragraphs).toBeGreaterThan(MAX_MATERIAL_SEGMENTS_PAGE);
      expect(built.metadata!.sentences).toBeGreaterThanOrEqual(built.metadata!.paragraphs);
      expect(built.metadata!.characters).toBeGreaterThan(built.metadata!.paragraphs);
      expect(built.digest).toMatch(/^[0-9a-f]{64}$/u);

      // 查看分段: a page at a time, every sentence a range of its paragraph, in order, without white space around it.
      const first = store.inspectLibraryMaterialSegments({ materialId: added.materialId, from: 1 });
      expect([first.from, first.total, first.segments.length, first.previous, first.next, first.indexDigest, first.title])
        .toEqual([1, built.metadata!.paragraphs, MAX_MATERIAL_SEGMENTS_PAGE, null, MAX_MATERIAL_SEGMENTS_PAGE + 1, built.digest, '样书一']);
      let sentences = 0;
      let ordinal = 0;
      for (let from: number | null = 1; from !== null;) {
        const page = store.inspectLibraryMaterialSegments({ materialId: added.materialId, from });
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(MAX_FRAME_BYTES);
        for (const segment of page.segments) {
          expect(segment.ordinal).toBe(++ordinal);
          let end = 0;
          for (const [start, stop] of segment.sentences) {
            expect(start).toBeGreaterThanOrEqual(end);
            expect(stop).toBeGreaterThan(start);
            expect(segment.text.slice(start, stop).trim()).toBe(segment.text.slice(start, stop));
            end = stop;
          }
          sentences += segment.sentences.length;
        }
        expect(page.previous).toBe(from === 1 ? null : Math.max(1, from - MAX_MATERIAL_SEGMENTS_PAGE));
        from = page.next;
      }
      expect([ordinal, sentences]).toEqual([built.metadata!.paragraphs, built.metadata!.sentences]);
      expect(await refusal(() => store.inspectLibraryMaterialSegments({ materialId: added.materialId, from: ordinal + 1 }))).toBe('MATERIAL_INDEX_CURSOR_INVALID');

      // 索引完成 is a 最近完成 item (ATTN-009): counted nowhere, naming the item and where it belongs, opening its card.
      const attention = store.inspectGlobalAttention(() => null, false);
      const recent = attention.groups.find((group) => group.key === 'recent')!.items.filter((item) => item.object.kind === 'library-index');
      expect(recent.map((item) => [item.state, item.itemId, item.object, item.nextStep, item.target, item.book.title])).toEqual([[
        'indexing-completed', `library-index:${added.materialId}`,
        { kind: 'library-index', title: '样书一', materialKind: 'book', scope: 'none', outcome: 'complete' },
        'view-material-index', { kind: 'library-material', materialId: added.materialId }, null,
      ]]);
      // The item still waits for its attribution: 索引完成 asks nothing and the count is the decision's alone.
      expect(attention.actionableCount).toBe(1);

      // The ledger is append-only and the build is the current indexer's.
      const database = new DatabaseSync(storePath());
      try {
        expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MATERIAL_INDEX_SCHEMA_VERSION);
        expect(database.prepare('SELECT indexer, state, segment_count FROM material_index_builds').all())
          .toEqual([{ indexer: MATERIAL_INDEXER_IDENTITY, state: 'complete', segment_count: built.metadata!.paragraphs }]);
        for (const table of ['material_index_builds', 'material_index_segments']) {
          expect(() => database.exec(`UPDATE ${table} SET canonical_json = canonical_json`)).toThrowError(/MATERIAL_INDEX_LEDGER_IMMUTABLE/u);
          expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/MATERIAL_INDEX_LEDGER_IMMUTABLE/u);
        }
        expect(Object.keys(MATERIAL_INDEX_TRIGGER_SQL)).toHaveLength(4);
      } finally {
        database.close();
      }
      // Built once: asking again builds nothing more.
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(added.materialId).index).toEqual(built);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('reads plain text and Markdown, states 来源译文 by the language, and names what it cannot read and why', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const chinese = await put(store, file('中文笔记.txt', CHINESE), '中文笔记');
      const english = await put(store, file('notes.md', '# Field notes\n\nThe river rose at dawn. Nobody slept.\n\nA second paragraph, with pi near 3.14 inside it.\n'), 'Field notes');
      const pdf = await put(store, file('scan.pdf', '%PDF-1.4\n% synthetic test bytes, not a real document\n'), '扫描件');
      const page = await put(store, file('page.html', '<!doctype html><html><body><p>网页</p></body></html>'), '网页', 'web');
      const blank = await put(store, file('blank.txt', '   \n\n  \n'), '空白');
      // A Word file AI7 itself would write for no paragraphs at all: the parser finds no text block in it.
      const hollow = await put(store, file('hollow.docx', buildManuscriptPackage([])), '空文档');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();

      const zh = store.inspectLibraryMaterial(chinese.materialId).index;
      expect([zh.state, zh.metadata, zh.layers.translation]).toEqual(['complete',
        { documentTitle: null, language: 'zh', paragraphs: 4, headings: 0, sentences: 7, characters: zh.metadata!.characters }, 'not-needed']);
      const segments = store.inspectLibraryMaterialSegments({ materialId: chinese.materialId, from: 1 }).segments;
      expect(segments.map((segment) => segment.sentences.map(([start, end]) => segment.text.slice(start, end)))).toEqual([
        ['第一章 春'],
        ['她推开窗。', '风从河上吹来，带着潮湿的气味！', '他问：“你还记得吗？”'],
        ['第二段只有一句话'],
        ['圆周率约等于3.14。', '最后一句……'],
      ]);

      const en = store.inspectLibraryMaterial(english.materialId).index;
      // Non-Chinese text: its 来源译文 needs a Model Role and is not provided — never a fabricated translation.
      expect([en.state, en.metadata!.language, en.metadata!.headings, en.layers.translation, en.layers.segments]).toEqual(['complete', 'other', 1, 'deferred', 'complete']);
      expect(store.inspectLibraryMaterialSegments({ materialId: english.materialId, from: 1 }).segments.map((segment) => segment.sentences.length)).toEqual([1, 2, 1]);

      // A PDF's text and recognition need a local dependency the Owner has not admitted; a file with no text has none. Each
      // is a build that says so, and the original and metadata stand. A web page is read since Issue #428's formats.
      expect(store.inspectLibraryMaterial(pdf.materialId).index).toMatchObject({
        state: 'unsupported', reason: 'needs-local-dependency',
        layers: { original: 'complete', metadata: 'complete', text: 'deferred', recognition: 'deferred', translation: 'deferred', segments: 'deferred', vectors: 'deferred' },
      });
      expect(store.inspectLibraryMaterial(page.materialId).index).toMatchObject({
        state: 'complete', reason: null, layers: { text: 'complete', recognition: 'not-needed', segments: 'complete' },
      });
      // No text at all is said as that (#725 review, P2-1), never as a file that could not be read.
      expect(store.inspectLibraryMaterial(blank.materialId).index).toMatchObject({ state: 'failed', reason: 'empty', layers: { text: 'failed' } });
      expect(store.inspectLibraryMaterial(hollow.materialId).index).toMatchObject({ state: 'failed', reason: 'empty', layers: { text: 'failed' } });
      expect(await refusal(() => store.inspectLibraryMaterialSegments({ materialId: pdf.materialId, from: 1 }))).toBe('MATERIAL_INDEX_NO_TEXT');

      const outcomes = store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items)
        .filter((item) => item.object.kind === 'library-index').map((item) => item.object.kind === 'library-index' ? [item.object.title, item.object.outcome] : null).sort();
      expect(outcomes).toEqual([['Field notes', 'complete'], ['中文笔记', 'complete'], ['扫描件', 'unsupported'], ['空文档', 'failed'], ['空白', 'failed'], ['网页', 'complete']]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('reads HTML, EPUB, ODT and RTF into sentence-anchored segments, and names DRM and declared entities as the reasons it will not', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const page = await put(store, file('网页.html', '<!doctype html><html><head><meta charset="utf-8"><title>河边</title><script>alert("不读")</script></head>' +
        '<body><h1>第一章</h1><p>她推开窗。风从河上吹来！</p><p>第二段&mdash;只有一句</p></body></html>'), '网页', 'web');
      const chapter = (body: string): string => '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>章</title></head>' +
        `<body>${body}</body></html>`;
      const book = (extra: Record<string, string>): Uint8Array => archive({
        mimetype: [strToU8('application/epub+zip'), { level: 0 }],
        'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
          '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
        'OEBPS/content.opf': strToU8('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
          '<dc:title>合成样书</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>' +
          '<item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'),
        'OEBPS/a.xhtml': strToU8(chapter('<h2>上卷</h2><p>第一句。第二句？</p>')),
        'OEBPS/b.xhtml': strToU8(chapter('<p>下一章的话。</p>')),
        ...Object.fromEntries(Object.entries(extra).map(([name, value]) => [name, strToU8(value)])),
      });
      const epub = await put(store, file('样书.epub', book({})), '样书', 'book');
      const drm = await put(store, file('加密.epub', book({ 'META-INF/rights.xml': '<rights/>' })), '加密书', 'book');
      const odt = await put(store, file('文档.odt', archive({
        mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
        'content.xml': strToU8('<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
          'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h text:outline-level="1">开头</text:h>' +
          '<text:p>一句话。<text:span>又一句。</text:span></text:p></office:text></office:body></office:document-content>'),
        'meta.xml': strToU8('<?xml version="1.0"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
          'xmlns:dc="http://purl.org/dc/elements/1.1/"><office:meta><dc:title>开放文档</dc:title></office:meta></office:document-meta>'),
      })), '文档');
      // 「标题」 and 「好。」 as GB2312 bytes in a font of charset 134, and 「富文本」「他说。」 as Unicode escapes.
      const unicode = (text: string): string => Array.from(text, (character) => `\\u${character.codePointAt(0)}?`).join('');
      const rtf = await put(store, file('富文本.rtf', String.raw`{\rtf1\ansi\ansicpg936{\fonttbl{\f0\fnil\fcharset134 SimSun;}}{\info{\title ` + unicode('富文本') + '}}' +
        String.raw`\f0\pard\outlinelevel0 \'b1\'ea\'cc\'e2\par\pard ` + unicode('他说。') + String.raw`\'ba\'c3\'a1\'a3\par}`), '富文本');
      const unsafe = await put(store, file('实体.html', '<!DOCTYPE html [<!ENTITY x SYSTEM "file:///etc/hosts">]><html><body><p>&x;</p></body></html>'), '实体', 'web');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();

      const segmentsOf = (materialId: string) => store.inspectLibraryMaterialSegments({ materialId, from: 1 }).segments;
      const cases = [
        [page, '河边', [['第一章'], ['她推开窗。', '风从河上吹来！'], ['第二段—只有一句']]],
        [epub, '合成样书', [['上卷'], ['第一句。', '第二句？'], ['下一章的话。']]],
        [odt, '开放文档', [['开头'], ['一句话。', '又一句。']]],
        [rtf, '富文本', [['标题'], ['他说。', '好。']]],
      ] as const;
      for (const [item, title, sentences] of cases) {
        const index = store.inspectLibraryMaterial(item.materialId).index;
        expect([index.state, index.reason, index.metadata?.documentTitle, index.metadata?.language, index.metadata?.headings, index.metadata?.paragraphs])
          .toEqual(['complete', null, title, 'zh', 1, sentences.length]);
        expect(index.layers).toEqual({ original: 'complete', metadata: 'complete', text: 'complete', recognition: 'not-needed', translation: 'not-needed', segments: 'complete', vectors: 'deferred' });
        const segments = segmentsOf(item.materialId);
        expect(segments.map((segment) => segment.sentences.map(([start, end]) => segment.text.slice(start, end)))).toEqual(sentences);
        expect(segments.map((segment) => segment.kind)).toEqual(['heading', ...sentences.slice(1).map(() => 'paragraph')]);
        // 「已提取 N 字」 counts what was extracted, and is what 允许参考's bounds read (#758).
        expect(index.metadata?.characters).toBe(segments.map((segment) => segment.text).join('').length);
      }
      expect([page, epub, odt, rtf].map((item) => item.source.format)).toEqual(['HTML', 'EPUB', 'ODT', 'RTF']);
      // DRM and a declared entity are refused with their own reasons, never read and never called a damaged file.
      expect(store.inspectLibraryMaterial(drm.materialId).index).toMatchObject({ state: 'failed', reason: 'encrypted', layers: { text: 'failed', segments: 'failed' } });
      expect(store.inspectLibraryMaterial(unsafe.materialId).index).toMatchObject({ state: 'failed', reason: 'external-entity', layers: { text: 'failed' } });
      const database = new DatabaseSync(storePath(), { readOnly: true });
      try {
        const converters = (database.prepare('SELECT material_id, canonical_json FROM material_index_builds').all() as Array<{ material_id: string; canonical_json: string }>)
          .map((row) => [row.material_id, (JSON.parse(row.canonical_json) as { converter: string }).converter]);
        expect(Object.fromEntries(converters)).toEqual({
          [page.materialId]: 'ai7-html-text/1+ai7-docx-fflate-saxes/3', [epub.materialId]: 'ai7-epub-text/1+ai7-docx-fflate-saxes/3',
          [drm.materialId]: 'ai7-epub-text/1+ai7-docx-fflate-saxes/3', [odt.materialId]: 'ai7-odt-text/1+ai7-docx-fflate-saxes/3',
          [rtf.materialId]: 'ai7-rtf-text/1+ai7-docx-fflate-saxes/3', [unsafe.materialId]: 'ai7-html-text/1+ai7-docx-fflate-saxes/3',
        });
      } finally {
        database.close();
      }
      // No working copy is left behind.
      expect(readdirSync(join(roots.dataRoot, MATERIAL_INDEX_WORK_DIRECTORY))).toEqual([]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('refuses to read an original that no longer matches its arrival, and records that as the reason', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const added = await put(store, file('改过.txt', CHINESE), '改过');
      const kept = join(roots.dataRoot, LIBRARY_OBJECT_DIRECTORY, 'sha256', added.source.sha256.slice(0, 2), `${added.source.sha256}.txt`);
      writeFileSync(kept, CHINESE.replace('春', '夏'));
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(added.materialId).index).toMatchObject({ state: 'failed', reason: 'original-changed', layers: { text: 'failed', segments: 'failed' } });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('holds a build back while a replacement freezes the data, and builds it in the same lifetime once 取消替换 lifts it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // A package of this very data, to replace it with: what 替换本机全部数据 would be given.
      const destination = join(roots.inputRoot, 'same.ai7db');
      const preparation = await store.prepareDatabaseExport(destination, true);
      expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
      const preview = await store.inspectDatabaseImport(destination);
      const materialId = (await put(store, file('late.txt', '第一句。第二句。'), '迟到')).materialId;
      store.startMaterialIndexing();
      // The builder could still write, so the service's gate prepares no replacement now (#729), as for a Run under way.
      expect(store.materialIndexing()).toBe(true);
      expect(replacementBlockedBy({ ...QUIET, indexing: store.materialIndexing() })).not.toBeNull();
      // Asked of the store directly, past that gate: the build has passed its first check and awaits the original, and the
      // replacement freezes the data synchronously meanwhile (#725 review, P2-2). The store's own re-check after the
      // extraction is the defence in depth that holds the write back.
      const preparing = store.prepareDatabaseReplacement(preview.previewId, new Date());
      expect(store.replacementFrozen()).toBe(true);
      await store.settleMaterialIndexing();
      // Nothing was recorded: a write after the backup would be lost with the data the replacement replaces.
      expect(store.inspectLibraryMaterial(materialId).index.state).toBe('queued');
      const pending = (await preparing).pending;
      expect(pending).not.toBeNull();
      expect([store.materialIndexing(), replacementBlockedBy({ ...QUIET, indexing: store.materialIndexing() })]).toEqual([false, null]);
      expect(store.inspectLibraryMaterial(materialId).index.state).toBe('queued');
      // 取消替换 builds what the freeze held back, without waiting for the next start (#729).
      await store.cancelDatabaseReplacement(pending!.replacementId);
      expect(store.replacementFrozen()).toBe(false);
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(materialId).index.state).toBe('complete');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('builds nothing while it starts frozen, then what waited and every later arrival once 取消替换 lifts the freeze', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const destination = join(roots.inputRoot, 'same.ai7db');
      const preparation = await store.prepareDatabaseExport(destination, true);
      expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
      const preview = await store.inspectDatabaseImport(destination);
      const waited = (await put(store, file('waited.txt', '等过的一句。'), '等过')).materialId;
      const pending = (await store.prepareDatabaseReplacement(preview.previewId, new Date())).pending;
      expect(pending).not.toBeNull();
      // The service starts its indexing while the replacement waits: nothing is built, nothing is under way (#729).
      store.startMaterialIndexing();
      expect(store.materialIndexing()).toBe(false);
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(waited).index.state).toBe('queued');
      await store.cancelDatabaseReplacement(pending!.replacementId);
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(waited).index.state).toBe('complete');
      // The builder was started though it was frozen then: a later arrival is built as it arrives.
      const later = (await put(store, file('later.txt', '后到的一句。'), '后到')).materialId;
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(later).index.state).toBe('complete');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('builds what a refused preparation or roll-back held back, without 取消替换 (#751 review, P3-1)', async () => {
    const lifetimes: Array<['prepare' | 'roll-back', string]> = [['prepare', 'DATABASE_IMPORT_PREVIEW_STALE'], ['roll-back', 'DATABASE_REPLACEMENT_ROLLBACK_STALE']];
    for (const [step, code] of lifetimes) {
      const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const materialId = (await put(store, file(`${step}.txt`, `被拦下的一句（${step}）。`), step)).materialId;
        // The freeze is held from the call's first step; the service starts its indexing meanwhile, which builds nothing.
        const refused = step === 'prepare'
          ? store.prepareDatabaseReplacement(randomUUID(), new Date())
          : store.rollBackDatabaseReplacement(randomUUID(), new Date());
        expect(store.replacementFrozen()).toBe(true);
        store.startMaterialIndexing();
        expect(store.materialIndexing()).toBe(false);
        expect(await refusal(() => refused)).toBe(code);
        // Nothing waits to replace the data: the freeze lifted with the refusal, and what it held back is built now.
        expect(store.replacementFrozen()).toBe(false);
        await store.settleMaterialIndexing();
        expect(store.inspectLibraryMaterial(materialId).index.state).toBe('complete');
        store.markCleanShutdown();
      } finally {
        store.close();
      }
    }
  }, 120_000);

  it('lets a Task read the index only within its plan boundary, read-only, at the version its plan pinned', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const bookA = emptyBook(store, '索引之书甲');
      const bookB = emptyBook(store, '索引之书乙');
      const listed = await put(store, file('参考.txt', CHINESE), '参考');
      const unlisted = await put(store, file('另一份.txt', `${CHINESE}\n\n另一份资料。`), '另一份');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();

      // Indexed, but no Task may list it before the editor decides where it belongs and its Learning Eligibility (KB-007).
      expect(await refusal(() => store.pinMaterialReference(bookA, listed.materialId))).toBe('MATERIAL_REFERENCE_UNAVAILABLE');
      store.decideLibraryMaterial({ materialId: listed.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'book', bookId: bookA } } });
      expect(await refusal(() => store.pinMaterialReference(bookA, listed.materialId))).toBe('MATERIAL_REFERENCE_UNAVAILABLE');
      store.decideLibraryMaterial({ materialId: listed.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'book', reason: null } });
      // Another Book's Tasks may not list an item that belongs to this one.
      expect(await refusal(() => store.pinMaterialReference(bookB, listed.materialId))).toBe('MATERIAL_REFERENCE_UNAVAILABLE');
      const pin = store.pinMaterialReference(bookA, listed.materialId);
      expect(pin).toEqual({ materialId: listed.materialId, indexDigest: store.inspectLibraryMaterial(listed.materialId).index.digest });

      const watch = watcher();
      try {
        const reading = store.readMaterialIndexForTask({ bookId: bookA, references: [pin] }, listed.materialId, 1);
        expect([reading.total, reading.next, reading.indexDigest]).toEqual([4, null, pin.indexDigest]);
        expect(reading.segments[1]!.sentences).toEqual([
          { ordinal: 1, text: '她推开窗。', citation: '《参考》第 2 段第 1 句' },
          { ordinal: 2, text: '风从河上吹来，带着潮湿的气味！', citation: '《参考》第 2 段第 2 句' },
          { ordinal: 3, text: '他问：“你还记得吗？”', citation: '《参考》第 2 段第 3 句' },
        ]);
        // Outside the boundary: an item the plan does not list, another Book's plan, a moved version.
        expect(await refusal(() => store.readMaterialIndexForTask({ bookId: bookA, references: [pin] }, unlisted.materialId, 1))).toBe('MATERIAL_OUTSIDE_PLAN');
        expect(await refusal(() => store.readMaterialIndexForTask({ bookId: bookB, references: [pin] }, listed.materialId, 1))).toBe('MATERIAL_REFERENCE_UNAVAILABLE');
        expect(await refusal(() => store.readMaterialIndexForTask({ bookId: bookA, references: [{ ...pin, indexDigest: 'f'.repeat(64) }] }, listed.materialId, 1)))
          .toBe('MATERIAL_INDEX_MOVED');
        expect(await refusal(() => store.readMaterialIndexForTask({ bookId: bookA, references: [pin] }, listed.materialId, 5))).toBe('MATERIAL_INDEX_CURSOR_INVALID');
        // Reading committed nothing at all.
        expect(watch.changed()).toBe(false);
      } finally {
        watch.close();
      }
      // An eligibility left for later takes the item out of every plan's reach at once.
      store.decideLibraryMaterial({ materialId: listed.materialId, expectedDecisions: 2, decision: { kind: 'eligibility', choice: 'deferred', reason: null } });
      expect(await refusal(() => store.readMaterialIndexForTask({ bookId: bookA, references: [pin] }, listed.materialId, 1))).toBe('MATERIAL_REFERENCE_UNAVAILABLE');
      // An item of the house may be listed by any Book's Tasks.
      store.decideLibraryMaterial({ materialId: unlisted.materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'house' } } });
      store.decideLibraryMaterial({ materialId: unlisted.materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'excluded', reason: null } });
      const house = store.pinMaterialReference(bookB, unlisted.materialId);
      expect(store.readMaterialIndexForTask({ bookId: bookB, references: [house] }, unlisted.materialId, 1).total).toBe(5);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('builds at the next start what a closing service stopped, what arrived at revision 65, and removes stray working copies', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let materialId: string;
    try {
      materialId = (await put(store, file('早到.txt', CHINESE), '早到')).materialId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // A revision-65 store: the item arrived before revision 66's enrollments and revision 67's index existed, so its open
    // takes the two steps 65 → 66 → 67 before it builds (#725 re-review; #729).
    const plant = new DatabaseSync(storePath());
    try {
      plant.exec('PRAGMA foreign_keys = OFF');
      for (const table of [...Object.keys(MATERIAL_INDEX_SCHEMA_SQL).reverse(), ...Object.keys(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_SQL).reverse()]) plant.exec(`DROP TABLE ${table}`);
      plant.exec('PRAGMA foreign_keys = ON');
      downgradeAnalysisRunAuthorizationsToRevision65(plant);
      plant.exec(`PRAGMA user_version = ${WRITING_TASK_SCHEMA_VERSION}`);
      expect(analysisRunAuthorizationsShape(plant)).toBe('revision-65');
    } finally {
      plant.close();
    }
    const work = join(roots.dataRoot, MATERIAL_INDEX_WORK_DIRECTORY);
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, `.work-${randomUUID()}.docx`), 'left behind');
    writeFileSync(join(work, 'keep-me.txt'), 'not a working copy');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(readdirSync(work)).toEqual(['keep-me.txt']);
      expect(store.inspectLibraryMaterial(materialId).index.state).toBe('queued');
      // Stopped as the service closes: the build under way records nothing.
      store.startMaterialIndexing();
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const database = new DatabaseSync(storePath(), { readOnly: true });
      try {
        expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MATERIAL_INDEX_SCHEMA_VERSION);
        expect(analysisRunAuthorizationsShape(database)).toBe('current');
        expect((database.prepare('SELECT count(*) count FROM material_index_builds').get() as { count: number }).count).toBeLessThanOrEqual(1);
      } finally {
        database.close();
      }
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(materialId).index.state).toBe('complete');
      expect(existsSync(work) ? readdirSync(work) : []).toEqual(['keep-me.txt']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(readFileSync(join(work, 'keep-me.txt'), 'utf8')).toBe('not a working copy');
  }, 120_000);
});
