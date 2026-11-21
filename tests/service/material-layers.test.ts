import { setLibraryDecision } from '../support/library-materials.js';
import { ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FastRoleExecutionOwner, fastRoleLiveRoutes, productionFastRoleRoutes } from '../../src/service/fast-role/fast-role-execution.js';
import {
  MATERIAL_TRANSLATION_KIND,
  MATERIAL_TRANSLATION_RESULT_SCHEMA,
  MAX_MATERIAL_TRANSLATION_REQUESTS,
  materialTranslator,
  type MaterialTranslator,
} from '../../src/service/fast-role/material-translation-contract.js';
import { ORDINARY_PRODUCTION_ALLOWED_BINDINGS, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { OPENCODE_GO_MODEL } from '../../src/service/provider/egress-gate.js';
import { PROVIDER_LEDGER_FILE, isItemLine, type ProviderLedgerLine } from '../../src/service/provider/provider-result-cache.js';
import { EditorialStore, StoreError, type BackgroundAnalysisRuntime } from '../../src/service/store.js';
import type { LibraryMaterialKind, LibraryMaterialProjection } from '../../src/shared/protocol.js';
import { malformedPdf, sampleTextPdf, syntheticPdf } from '../fixtures/material-formats/synthetic-pdf.js';
import { withoutRuleFor } from '../support/policy-rules.js';
import { sample1Path } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// Service-integration suite (L2) for the Material Index's on-request layers over the real store on a temporary Agent Data Root:
// 相似段落检索 ranked by words with nothing built (R5-F2c; ADR 0107 §4 point 5), the PDF text layer and 来源译文 (Issue #892).
// Every file is exact `sample1` — an admitted Public SampleBook — the suite's own synthetic words or the authored public
// passage, no manuscript. The one live-shaped path replaces only the transport with a stub, so no socket is opened and no
// credential value beyond a local placeholder exists.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-material-layers-');
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

function file(name: string, content: string | Uint8Array): string {
  const directory = join(roots.inputRoot, 'library-vectors');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

async function put(store: EditorialStore, path: string, title: string, kind: LibraryMaterialKind = 'document'): Promise<LibraryMaterialProjection> {
  const preview = await store.previewLibraryMaterial(path);
  return store.addLibraryMaterial({ previewId: preview.previewId, title, kind });
}

function emptyBook(store: EditorialStore, title: string): string {
  const creation = store.prepareBookCreation(title, null);
  return store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
}

/** The house's item, referable by every Book: 定归属 to the house, then 定学习准入. */
function referable(store: EditorialStore, materialId: string): void {
  setLibraryDecision(store, { materialId, expectedDecisions: 0, decision: { kind: 'attribution', attribution: { scope: 'house' } } });
  setLibraryDecision(store, { materialId, expectedDecisions: 1, decision: { kind: 'eligibility', choice: 'house', reason: null } });
}

const ENGLISH = [
  'The old ferryman lived beside the river.',
  'Every morning he rowed the villagers across the water.',
  'Quarterly accounts were filed at the town hall.',
  'At night the river was quiet and the ferry rested.',
].join('\n\n');

const storePath = (): string => join(roots.dataRoot, 'store', 'ai7.sqlite');

function tableCounts(): Record<string, number> {
  const database = new DatabaseSync(storePath(), { readOnly: true });
  try {
    const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'working_block_search%' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
    return Object.fromEntries(tables.map((name) => [name, (database.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]));
  } finally {
    database.close();
  }
}

describe('相似段落检索 over the real store (R5-F2c)', () => {
  it('finds a paragraph of an admitted SampleBook right after its index is built, with nothing built or written for it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const added = await put(store, sample1Path(roots.codeRoot), '样书一', 'book');
      expect(await refusal(() => store.searchLibraryMaterialVectors({ materialId: added.materialId, text: '河边', k: 5 }))).toBe('MATERIAL_INDEX_NOT_READY');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const index = store.inspectLibraryMaterial(added.materialId).index;
      expect([index.state, Object.keys(index.layers).length]).toEqual(['complete', 6]);
      // Words of one of its own paragraphs: that paragraph is found first, holding them verbatim, with its anchor.
      const paragraph = store.inspectLibraryMaterialSegments({ materialId: added.materialId, from: 1 }).segments.find((segment) => segment.kind === 'paragraph' && segment.text.length >= 24)!;
      const words = paragraph.text.slice(4, 16);
      const before = tableCounts();
      const found = await store.searchLibraryMaterialVectors({ materialId: added.materialId, text: words, k: 5 });
      expect(tableCounts()).toEqual(before);
      expect(Object.keys(found).sort()).toEqual(['candidates', 'indexDigest', 'materialId']);
      expect(found.indexDigest).toBe(index.digest);
      expect(found.candidates.length).toBeGreaterThan(0);
      expect(found.candidates.length).toBeLessThanOrEqual(5);
      expect(found.candidates[0]).toMatchObject({ ordinal: paragraph.ordinal, page: null, pageParagraph: null });
      expect(paragraph.text.startsWith(found.candidates[0]!.preview.slice(0, 16))).toBe(true);
      // Each paragraph answers once, however many of its chunks matched.
      expect(new Set(found.candidates.map((candidate) => candidate.ordinal)).size).toBe(found.candidates.length);
      // The ranker's bounds: a blank text, a text over 1,000 code units, or more than 8 candidates is refused in the editor's words.
      expect(await refusal(() => store.searchLibraryMaterialVectors({ materialId: added.materialId, text: '   ', k: 3 }))).toBe('MATERIAL_VECTOR_QUERY_INVALID');
      expect(await refusal(() => store.searchLibraryMaterialVectors({ materialId: added.materialId, text: '字'.repeat(1_001), k: 3 }))).toBe('MATERIAL_VECTOR_QUERY_INVALID');
      expect(await refusal(() => store.searchLibraryMaterialVectors({ materialId: added.materialId, text: words, k: 9 }))).toBe('MATERIAL_VECTOR_QUERY_INVALID');
      // The 资料索引 background enrollment has nothing to make, and says so without a vector word.
      const next = store.inspectBackgroundAnalysisEnrollment(emptyBook(store, '甲书'), quiet(), 'material-index').next.reason;
      expect(next).toBe('资料加入时已在本机建好索引，检索不需要另外构建；这项登记目前没有要在空闲时做的事。');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('searches a 10,000-paragraph item within its bound, reading in no writer transaction', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const paragraphs = Array.from({ length: 10_000 }, (_, index) => `第${index + 1}段：河边的渡口在清晨开船，船夫把村民送到对岸。`);
      const added = await put(store, file('long.txt', paragraphs.join('\n\n')), '一万段');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(added.materialId).index.metadata?.paragraphs).toBe(10_000);
      // A second connection holds the writer lock throughout: the search only reads, so it never waits on it.
      const writer = new DatabaseSync(storePath());
      writer.exec('BEGIN IMMEDIATE');
      try {
        const started = performance.now();
        const found = await store.searchLibraryMaterialVectors({ materialId: added.materialId, text: '第9999段', k: 1 });
        const elapsed = performance.now() - started;
        expect(found.candidates.map((candidate) => candidate.ordinal)).toEqual([9_999]);
        // The stated bound: under 10 s for 10,000 paragraphs on a developer host (measured 280 ms on the host, 2026-11-22); nothing is cached between searches.
        expect(elapsed).toBeLessThan(10_000);
      } finally {
        writer.exec('ROLLBACK');
        writer.close();
      }
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);
});

const quiet = (): BackgroundAnalysisRuntime => ({ routeExecutable: true, placeFree: true, capacity: 2, editorWorkBusy: false, now: Date.now(), quietMs: 30_000 });

describe('a PDF\'s text layer over the real store', () => {
  it('reads a text PDF into paragraphs with page anchors, and names an encrypted or unreadable one', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const bookId = emptyBook(store, '甲书');
      const text = await put(store, file('synthetic.pdf', sampleTextPdf()), '合成 PDF');
      const locked = await put(store, file('locked.pdf', syntheticPdf({ pages: [[['Locked words that are never read.']]], encrypted: true })), '加密 PDF');
      const broken = await put(store, file('broken.pdf', malformedPdf()), '损坏 PDF');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const index = store.inspectLibraryMaterial(text.materialId).index;
      expect(index).toMatchObject({
        state: 'complete', reason: null,
        metadata: { documentTitle: '合成 PDF 资料', paragraphs: 4, pages: 2 },
        layers: { text: 'complete', recognition: 'not-needed', segments: 'complete' },
      });
      const page = store.inspectLibraryMaterialSegments({ materialId: text.materialId, from: 1 });
      expect(page.segments.map((segment) => [segment.ordinal, segment.page, segment.pageParagraph])).toEqual([[1, 1, 1], [2, 1, 2], [3, 2, 1], [4, 2, 2]]);
      referable(store, text.materialId);
      const pin = store.pinMaterialReference(bookId, text.materialId);
      const reading = store.readMaterialIndexForTask({ bookId, references: [pin] }, text.materialId, 1);
      expect(reading.segments[2]!.sentences.map((sentence) => sentence.citation)).toEqual(['《合成 PDF》第 2 页第 1 段第 1 句', '《合成 PDF》第 2 页第 1 段第 2 句']);
      expect(store.inspectLibraryMaterial(locked.materialId).index).toMatchObject({ state: 'failed', reason: 'encrypted', layers: { text: 'failed' } });
      expect(store.inspectLibraryMaterial(broken.materialId).index).toMatchObject({ state: 'failed', reason: 'unreadable', layers: { text: 'failed' } });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);
});

describe('来源译文 over the real store', () => {
  /** A translator double: admitted, answering each paragraph with its number, or refusing as no rule names the kind. */
  function double(options: { admitted?: boolean; misalign?: boolean } = {}): MaterialTranslator & { batches: string[][] } {
    const batches: string[][] = [];
    return {
      batches,
      refusal: () => (options.admitted === false ? '当前策略未开放来源译文' : null),
      async translate(_sha, paragraphs) {
        batches.push([...paragraphs]);
        if (options.misalign === true) return { kind: 'failed', message: '模型给出的来源译文没有与原文逐段对齐；这一批没有记录任何译文。' };
        return {
          kind: 'translated', texts: paragraphs.map((_, index) => `译文 ${batches.length}-${index + 1}`),
          made: { model: 'deepseek-v4-flash', route: 'opencode-go', policyRuleId: 'developer-live-public-samplebook-material-translation', promptContractDigest: 'd'.repeat(64) },
        };
      },
    };
  }

  it('is refused with 「当前策略未开放来源译文」 until a rule names it, and never for a Chinese item', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const english = await put(store, file('ferry.txt', ENGLISH), 'Ferry notes');
      const chinese = await put(store, file('中文.txt', '河边的渡口。船夫送人过河。'), '中文');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      // No translator under this launch: the action is offered and refused, with why.
      expect(store.inspectLibraryMaterial(english.materialId).index.translation).toEqual({
        state: 'not-built', translated: 0, total: 4, model: null, request: { available: false, reason: '当前策略未开放来源译文' }, lastFailure: null,
      });
      expect(await refusal(() => store.requestMaterialTranslation(english.materialId))).toBe('MATERIAL_TRANSLATION_NOT_ADMITTED');
      store.useMaterialTranslator(double({ admitted: false }));
      expect(await refusal(() => store.requestMaterialTranslation(english.materialId))).toBe('MATERIAL_TRANSLATION_NOT_ADMITTED');
      expect(store.inspectLibraryMaterial(chinese.materialId).index.translation).toBeNull();
      expect(await refusal(() => store.requestMaterialTranslation(chinese.materialId))).toBe('MATERIAL_TRANSLATION_NOT_NEEDED');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('records each paragraph\'s translation beside it, labelled, in bounded batches, and stops honestly part way', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const bookId = emptyBook(store, '甲书');
      const long = Array.from({ length: 23 }, (_, index) => `Paragraph ${index + 1} of the ferry notes.`).join('\n\n');
      const english = await put(store, file('ferry-long.txt', long), 'Ferry notes');
      const other = await put(store, file('mill.txt', 'The mill turns.\n\nThe river runs.'), 'Mill notes');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const translator = double();
      store.useMaterialTranslator(translator);
      expect(store.requestMaterialTranslation(english.materialId).index.translation?.state).toBe('building');
      // One item at a time.
      expect(await refusal(() => store.requestMaterialTranslation(other.materialId))).toBe('MATERIAL_TRANSLATION_BUSY');
      await store.settleMaterialLayers();
      expect(translator.batches.map((batch) => batch.length)).toEqual([20, 3]);
      expect(store.inspectLibraryMaterial(english.materialId).index.translation).toMatchObject({ state: 'complete', translated: 23, total: 23, model: 'deepseek-v4-flash', lastFailure: null });
      expect(store.inspectLibraryMaterial(english.materialId).index.layers.translation).toBe('complete');
      const page = store.inspectLibraryMaterialSegments({ materialId: english.materialId, from: 1 });
      expect(page.segments[0]).toMatchObject({ text: 'Paragraph 1 of the ferry notes.', translation: { text: '译文 1-1', model: 'deepseek-v4-flash' } });
      // A Task reads them as a separate, labelled layer; the original words are the segments'.
      referable(store, english.materialId);
      const pin = store.pinMaterialReference(bookId, english.materialId);
      const reading = store.readMaterialIndexForTask({ bookId, references: [pin] }, english.materialId, 1);
      expect(reading.segments[0]!.text).toBe('Paragraph 1 of the ferry notes.');
      expect(reading.translations[0]).toEqual({ ordinal: 1, label: '来源译文', text: '译文 1-1', model: 'deepseek-v4-flash', attribution: '《Ferry notes》第 1 段' });
      expect(await refusal(() => store.requestMaterialTranslation(english.materialId))).toBe('MATERIAL_TRANSLATION_COMPLETE');
      // An answer that does not align records nothing and says why; asking again goes on.
      store.useMaterialTranslator(double({ misalign: true }));
      store.requestMaterialTranslation(other.materialId);
      await store.settleMaterialLayers();
      expect(store.inspectLibraryMaterial(other.materialId).index.translation).toMatchObject({
        state: 'not-built', translated: 0, lastFailure: '模型给出的来源译文没有与原文逐段对齐；这一批没有记录任何译文。', request: { available: true, reason: null },
      });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('splits translation batches at 6,000 code units while retaining each paragraph', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const paragraphs = ['A', 'B', 'C', 'D'].map((letter) => `${letter} ${'word '.repeat(400)}`.trim());
      const added = await put(store, file('bounded-translation.txt', paragraphs.join('\n\n')), 'Bounded reference');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const translator = double();
      store.useMaterialTranslator(translator);
      store.requestMaterialTranslation(added.materialId);
      await store.settleMaterialLayers();
      expect(translator.batches.map((batch) => batch.length)).toEqual([2, 2]);
      expect(translator.batches.flat()).toEqual(paragraphs);
      expect(translator.batches.every((batch) => batch.reduce((sum, paragraph) => sum + paragraph.length, 0) <= 6_000)).toBe(true);
      expect(store.inspectLibraryMaterial(added.materialId).index.translation?.state).toBe('complete');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('holds a translation answer back when replacement freezes the data while the request is in flight', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let release = (): void => {};
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    try {
      const english = await put(store, file('ferry.txt', ENGLISH), 'Ferry notes');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const destination = join(roots.inputRoot, 'same.ai7db');
      const preparation = await store.prepareDatabaseExport(destination, true);
      expect((await store.approveDatabaseExport(preparation.preparationId, true)).outcome).toBe('created');
      const preview = await store.inspectDatabaseImport(destination);
      const translator = double();
      store.useMaterialTranslator({
        refusal: translator.refusal,
        async translate(...args) {
          await waiting;
          return translator.translate(...args);
        },
      });
      store.requestMaterialTranslation(english.materialId);
      expect(store.materialIndexing()).toBe(true);
      // As in the text-index regression, exercise the store's guard below the service replacement gate.
      const preparing = store.prepareDatabaseReplacement(preview.previewId);
      expect(store.replacementFrozen()).toBe(true);
      const pending = (await preparing).pending!;
      release();
      await store.settleMaterialLayers();
      expect(store.inspectLibraryMaterial(english.materialId).index.translation).toMatchObject({
        state: 'not-built', translated: 0, lastFailure: '数据库替换正在等待：资料索引暂不建立新的层。',
      });
      await store.cancelDatabaseReplacement(pending.replacementId);
      store.requestMaterialTranslation(english.materialId);
      await store.settleMaterialLayers();
      expect(store.inspectLibraryMaterial(english.materialId).index.translation?.state).toBe('complete');
      store.markCleanShutdown();
    } finally {
      release();
      await store.settleMaterialLayers();
      store.close();
    }
  }, 120_000);

  it('sends at most 50 requests — 1,000 paragraphs — per 生成来源译文, says how many remain, and goes on when asked again', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const many = Array.from({ length: 1_021 }, (_, index) => `Line ${index + 1} of the ledger.`).join('\n\n');
      const english = await put(store, file('many.txt', many), 'Many lines');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      const translator = double();
      store.useMaterialTranslator(translator);
      store.requestMaterialTranslation(english.materialId);
      await store.settleMaterialLayers();
      expect(MAX_MATERIAL_TRANSLATION_REQUESTS).toBe(50);
      expect(translator.batches).toHaveLength(50);
      expect(store.inspectLibraryMaterial(english.materialId).index.translation).toMatchObject({
        state: 'partial', translated: 1_000, total: 1_021, request: { available: true, reason: null },
        lastFailure: '已达到一次生成的上限（50 批，至多 1,000 段）；还有 21 段未译，可再次「生成来源译文」。',
      });
      store.requestMaterialTranslation(english.materialId);
      await store.settleMaterialLayers();
      expect(translator.batches.slice(50).map((batch) => batch.length)).toEqual([20, 1]);
      expect(store.inspectLibraryMaterial(english.materialId).index.translation).toMatchObject({ state: 'complete', translated: 1_021, lastFailure: null });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('runs under ordinary production on the editor\'s route, sending the house\'s material under its own category, with no development ledger', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const go = store.saveModelServiceConnection('Go', null, 'ready', 'opencode-go');
      const verified = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'ordinary-production', { ...ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0], credentialReference: go.credentialReference });
      expect(verified.integrityState).toBe('verified');
      const policy = verified;
      const calls: Array<{ url: string; body: string }> = [];
      const transport = (async (url: string, init: { body: string }) => {
        calls.push({ url, body: init.body });
        return {
          status: 200,
          json: async () => ({
            model: OPENCODE_GO_MODEL,
            choices: [{ message: { content: JSON.stringify({ schema: MATERIAL_TRANSLATION_RESULT_SCHEMA, translations: [{ n: 1, text: '磨坊在转。' }] }) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 120, completion_tokens: 20 },
          }),
        };
      }) as unknown as typeof fetch;
      const routes = productionFastRoleRoutes({ scope: 'ordinary-production', nativeFetch: transport }, () => policy, () => go.credentialReference,
        { resolve: async () => 'placeholder-production-key' });
      expect(routes.routes[MATERIAL_TRANSLATION_KIND]?.ruleId).toBe('ordinary-production-material-translation');
      const owner = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: routes });
      store.useMaterialTranslator(materialTranslator(owner, 'ordinary-production', () => 1));
      // The house's own material: no public-passage list applies in production.
      const mill = await put(store, file('mill.txt', 'The mill turns.'), 'Mill notes');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      store.requestMaterialTranslation(mill.materialId);
      await store.settleMaterialLayers();
      expect(store.inspectLibraryMaterial(mill.materialId).index.translation).toMatchObject({ state: 'complete', translated: 1, model: OPENCODE_GO_MODEL, lastFailure: null });
      expect(calls.map((call) => call.url)).toEqual([ORDINARY_PRODUCTION_ALLOWED_BINDINGS[0].endpoint]);
      expect(calls[0]!.body).toContain('[1] The mill turns.');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('runs on the Fast Interaction Role under a rule naming the kind, through the live-once ledger, for the public passage only', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-material-translation-cache-'));
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const verified = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
      expect(verified.integrityState).toBe('verified');
      // Exercise the selected v18 rule; only the transport is a double, so no provider is contacted.
      const policy = verified;
      const bodies: string[] = [];
      const transport = (async (_url: string, init: { body: string }) => {
        bodies.push(init.body);
        const content = String((JSON.parse(init.body) as { messages: Array<{ content: unknown }> }).messages.at(-1)!.content);
        const count = (content.match(/^\[\d+\] /gmu) ?? []).length;
        return {
          status: 200,
          json: async () => ({
            model: OPENCODE_GO_MODEL,
            choices: [{ message: { content: JSON.stringify({ schema: MATERIAL_TRANSLATION_RESULT_SCHEMA, translations: Array.from({ length: count }, (_, index) => ({ n: index + 1, text: `第 ${index + 1} 段的译文。` })) }) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 300, completion_tokens: 80 },
          }),
        };
      }) as unknown as typeof fetch;
      const routes = fastRoleLiveRoutes(
        { launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 500_000 }, providerCacheRoot: cacheRoot, validation: { family: 'material-translation', case: 'public-passage-en', delta: null } }, nativeFetch: transport },
        policy,
        { resolve: async () => 'placeholder-development-key' },
      );
      expect(routes.routes[MATERIAL_TRANSLATION_KIND]?.ruleId).toBe('developer-live-public-samplebook-material-translation');
      // A policy without this kind has no route; only the refusal case changes its rules in memory.
      expect(fastRoleLiveRoutes({ launch: { runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 1 }, providerCacheRoot: cacheRoot, validation: null }, nativeFetch: transport }, withoutRuleFor(verified, MATERIAL_TRANSLATION_KIND), { resolve: async () => null })
        .routes[MATERIAL_TRANSLATION_KIND]).toBeNull();
      const owner = new FastRoleExecutionOwner({ requestGovernor, fixture: null, live: routes });
      const rules = (): number => policy.providerProcessing.admittedRules.filter((rule) => rule.taskKinds.includes(MATERIAL_TRANSLATION_KIND)).length;
      store.useMaterialTranslator(materialTranslator(owner, 'developer-live', rules));
      const passage = await put(store, file('public-passage-en.txt', readFileSync(join(roots.codeRoot, 'tests', 'fixtures', 'material-formats', 'public-passage-en.txt'))), 'The Small Bindery');
      const other = await put(store, file('other.txt', 'Some other English words, not the admitted passage.'), 'Other');
      store.startMaterialIndexing();
      await store.settleMaterialIndexing();
      expect(store.inspectLibraryMaterial(other.materialId).index.translation?.request).toEqual({
        available: false, reason: '当前运行范围未允许生成来源译文：这份资料不在开发者实时可发送的公开资料范围内。',
      });
      expect(await refusal(() => store.requestMaterialTranslation(other.materialId))).toBe('MATERIAL_TRANSLATION_NOT_ADMITTED');
      store.requestMaterialTranslation(passage.materialId);
      await store.settleMaterialLayers();
      const index = store.inspectLibraryMaterial(passage.materialId).index;
      expect(index.translation).toMatchObject({ state: 'complete', translated: 4, total: 4, model: OPENCODE_GO_MODEL, lastFailure: null });
      // One request for the whole passage, its own words only, under the contract.
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toContain('[1] The Small Bindery');
      expect(bodies[0]).not.toContain('Some other English words');
      const lines = (await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8')).split('\n').filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as ProviderLedgerLine).filter(isItemLine);
      expect(lines.map((line) => [line.itemId, line.outcome])).toEqual([['S80/material-translation/1', 'transmitted']]);
      store.markCleanShutdown();
    } finally {
      store.close();
      await rm(cacheRoot, { recursive: true, force: true });
    }
  }, 120_000);
});

