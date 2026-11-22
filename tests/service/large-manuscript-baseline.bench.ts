import { randomBytes, randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { blockReachesThroughLineage } from '../../src/service/manuscript/structural-edits.js';
import { EditorialStore } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { JournalStructuralEdit, ManuscriptWindowProjection, ManuscriptWindowTarget } from '../../src/shared/protocol.js';
import { admittedSourcePath } from '../support/composed-fixture.js';
import { buildSyntheticDocx, type SyntheticDocxParagraph } from '../support/synthetic-docx.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';

/**
 * Large-manuscript read and write baseline (Issue #1557, round #1540, plan #1516 §11; ADR 0105 §6 targets).
 *
 * NOT a test: the `.bench.ts` name keeps it out of `tests/**` `*.test.ts`, so no ladder layer runs it. Run it on a test guest with
 *   pnpm exec vitest run --config tests/service/large-manuscript-baseline.vitest.config.ts
 * `AI7_BASELINE_SIZES` (default `2000,15000,46000`) and `AI7_BASELINE_REPS` (default 7) narrow a run. The method is in
 * `docs/development/large-manuscript-baseline.md`; the short form:
 *
 * - The manuscript is built only from the five admitted Public SampleBooks (`SampleBooks/`), read through the product parser,
 *   concatenated in file order and repeated cycle by cycle until exactly N blocks; it enters the store through the product's
 *   import path (stage, review, commit) into a fresh Agent Data Root per size. A mark is seeded on every 100th body paragraph.
 * - Every operation goes through the `EditorialStore` method the service calls for it, with the store's own connection settings.
 *   Connections run `wal_autocheckpoint = 0` and this script starts no checkpoint worker, so nothing checkpoints during an
 *   operation. Before each measured operation the store's own idle checkpoint (`checkpointAfterResponse(true)`) truncates the
 *   write-ahead log to zero bytes; the bytes written are then the size of `<data root>/store/ai7.sqlite-wal` after the operation,
 *   cross-checked with the frame count (`PRAGMA wal_checkpoint(NOOP)` on a separate connection) times (page size + 24) + 32.
 * - Time is `process.hrtime.bigint()` around the single store call. One discarded warm-up round, then REPS measured rounds;
 *   median, minimum and maximum are reported. No manuscript text is printed: only counts, durations and byte sizes.
 */

const SOURCES = ['sample1.docx', 'luxun-zhaohua-xishi.docx', 'luxun-nahan.docx', 'liue-laocan-youji.docx', 'wujingzi-rulin-waishi.docx'];
const SIZES = (process.env.AI7_BASELINE_SIZES ?? '2000,15000,46000').split(',').map((value) => Number(value.trim())).filter((value) => value > 0);
const REPS = Number(process.env.AI7_BASELINE_REPS ?? '7');
/** Spread marks for the whole-book mark list (#1654: 10,001, the list's own limit), and the marks of one dense paragraph. */
const SPREAD_MARKS = Number(process.env.AI7_BASELINE_SPREAD_MARKS ?? '10001');
const DENSE_MARKS = Number(process.env.AI7_BASELINE_DENSE_MARKS ?? '10000');
const REPLACE_ALL_PLACES = Number(process.env.AI7_BASELINE_REPLACE_ALL ?? '2000');
const ENTERS = 20;
/** `blockReachesThroughLineage`'s walk, for its query plan. */
const LINEAGE_REACH_SQL = `WITH RECURSIVE reached(block_id) AS (
      SELECT ? UNION
      SELECT l.block_id FROM reached r JOIN manuscript_block_lineage l ON l.related_block_id = r.block_id AND l.relation = 'split-from'
      UNION
      SELECT l.related_block_id FROM reached r JOIN manuscript_block_lineage l ON l.block_id = r.block_id AND l.relation = 'merged-into'
        AND NOT EXISTS(SELECT 1 FROM working_blocks w WHERE w.branch_id = ? AND w.block_id = l.block_id)
    ) SELECT 1 FROM reached WHERE block_id = ? LIMIT 1`;
const MIB = 1024 * 1024;

type Timing = { ms: number[]; bytes: number[]; frames: number[] };
interface SizeResult {
  size: number;
  counts: Record<string, number>;
  graphemes: { total: number; meanPerBlock: number; meanPerBody: number };
  marks: number;
  importSeconds: number;
  pageBytes: number;
  lineagePlan: string[];
  rows: Array<{ operation: string; position: string; ms: number[]; bytes: number[]; frames: number[]; frameCrossCheck: boolean }>;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const walPath = (dataRoot: string): string => join(dataRoot, 'store', 'ai7.sqlite-wal');
const walBytes = (dataRoot: string): number => { try { return statSync(walPath(dataRoot)).size; } catch { return 0; } };
const newBlockId = (): string => `blk_${randomBytes(12).toString('hex')}`;

async function sourceBlocks(): Promise<ParsedDocxBlock[]> {
  const all: ParsedDocxBlock[] = [];
  for (const source of SOURCES) {
    const path = admittedSourcePath(source);
    await parseDocx(path, source, (block) => all.push(block));
  }
  return all;
}

/** `size` paragraphs: the five books in order, cycle after cycle; from the second cycle on a Title is written as Heading1. */
function repeated(blocks: readonly ParsedDocxBlock[], size: number): SyntheticDocxParagraph[] {
  const paragraphs: SyntheticDocxParagraph[] = [];
  for (let index = 0; index < size; index += 1) {
    const block = blocks[index % blocks.length]!;
    const cycle = Math.floor(index / blocks.length);
    if (block.kind === 'paragraph' || block.kind === 'note') paragraphs.push({ text: block.text });
    else if (block.kind === 'title') paragraphs.push({ text: block.text, style: cycle === 0 ? 'Title' : 'Heading1' });
    else paragraphs.push({ text: block.text, style: `Heading${block.level ?? 1}` });
  }
  return paragraphs;
}

async function measureSize(size: number, blocks: readonly ParsedDocxBlock[]): Promise<SizeResult> {
  const roots = await createServiceTestRoots('ai7-baseline-');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
  let probe: DatabaseSync | undefined;
  try {
    // ---- build and import ------------------------------------------------------------------------------------------
    await mkdir(roots.inputRoot, { recursive: true });
    const path = join(roots.inputRoot, `baseline-${size}.docx`);
    await writeFile(path, buildSyntheticDocx({ paragraphs: repeated(blocks, size), coreTitle: `大稿基线 ${size}` }));
    const importStarted = process.hrtime.bigint();
    const staged = await store.stageSelectedManuscript(randomUUID(), path);
    const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
      { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
    const commitId = randomUUID();
    const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
    await store.acknowledgeImportCompletion(commitId);
    const importSeconds = Number(process.hrtime.bigint() - importStarted) / 1e9;
    const book = { manuscriptId: commit.manuscriptId, branchId: commit.branchId };

    probe = new DatabaseSync(databasePath);
    probe.exec('PRAGMA busy_timeout = 5000');
    const pageSize = Number((probe.prepare('PRAGMA page_size').get() as { page_size: number }).page_size);
    const frameBytes = pageSize + 24;
    const one = <T>(sql: string, ...args: Array<string | number>): T => probe!.prepare(sql).get(...args) as T;
    const counts: Record<string, number> = {};
    for (const row of probe.prepare('SELECT kind, count(*) n FROM working_blocks WHERE branch_id = ? GROUP BY kind').all(book.branchId) as Array<{ kind: string; n: number }>) counts[row.kind] = row.n;
    const totals = one<{ n: number; g: number }>('SELECT count(*) n, sum(grapheme_length) g FROM working_blocks WHERE branch_id = ?', book.branchId);
    const body = one<{ n: number; g: number }>("SELECT count(*) n, sum(grapheme_length) g FROM working_blocks WHERE branch_id = ? AND kind = 'paragraph'", book.branchId);
    if (totals.n !== size) throw new Error(`BASELINE_SIZE_MISMATCH ${totals.n} != ${size}`);

    const at = (target: ManuscriptWindowTarget): ManuscriptWindowProjection => store.getManuscriptWindowAt(book.manuscriptId, book.branchId, target);
    const blockTarget = (blockId: string): ManuscriptWindowProjection => at({ kind: 'block', blockId });

    // ---- the reading order: `position` at revision 116, `order_key` from #1654 on --------------------------------------
    const orderColumn = (probe.prepare("SELECT name FROM pragma_table_info('working_blocks') WHERE name IN ('position', 'order_key')").get() as { name: string }).name;
    const ordered = (sql: string): Array<{ block_id: string; grapheme_length: number }> => probe!.prepare(
      `SELECT block_id, grapheme_length FROM working_blocks WHERE branch_id = ? ${sql} ORDER BY ${orderColumn}`).all(book.branchId) as Array<{ block_id: string; grapheme_length: number }>;
    const allBlocks = ordered('').map((row) => row.block_id);
    const paragraphOf = new Map(allBlocks.map((blockId, index) => [blockId, index + 1] as const));

    // ---- the edit positions (first body paragraph, 40 %, the middle), chosen before any mark and never marked -----------
    const editable = ordered("AND kind = 'paragraph' AND grapheme_length >= 30").map((row) => row.block_id);
    const bodyAt = (from: number): string => editable.find((id) => paragraphOf.get(id)! >= from)!;
    const startId = bodyAt(1);
    const midId = bodyAt(Math.floor(size / 2));
    const entersId = bodyAt(Math.floor(size * 0.4));
    const reserved = new Set([startId, midId, entersId]);

    // ---- seed marks: SPREAD_MARKS 批注 over the first 90 % (≤ 10 per paragraph), DENSE_MARKS in one paragraph near 95 % -------
    const seeded = new Set<string>();
    const mark = (blockId: string, from: number, to: number, kind: 'annotation' | 'change-suggestion'): void => {
      const now = blockTarget(blockId);
      const block = now.blocks.find((candidate) => candidate.blockId === blockId)!;
      store.createEditorialMark({
        ...book, windowStartBlockId: now.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: now.revisionId,
        expectedJournalSequence: now.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme: from, toGrapheme: to,
        selectedText: graphemesOf(block.text).slice(from, to).join(''), kind, highlightColor: null,
        body: kind === 'annotation' ? '〔批注〕' : '', proposedText: kind === 'change-suggestion' ? '〔建议〕' : null, rationale: null,
      });
      seeded.add(blockId);
    };
    const candidates = ordered("AND kind = 'paragraph' AND grapheme_length >= 20");
    const front = candidates.filter((row) => paragraphOf.get(row.block_id)! <= size * 0.9 && !reserved.has(row.block_id));
    const perParagraph = Math.min(10, Math.ceil(SPREAD_MARKS / front.length));
    let spread = 0;
    for (let index = 0; spread < SPREAD_MARKS && index < front.length; index += 1) {
      for (let slot = 0; slot < perParagraph && spread < SPREAD_MARKS; slot += 1, spread += 1) {
        mark(front[index]!.block_id, slot * 2, slot * 2 + 1, spread % 2 === 0 ? 'annotation' : 'change-suggestion');
      }
    }
    const dense = candidates.find((row) => paragraphOf.get(row.block_id)! >= size * 0.95 && row.grapheme_length >= 40) ?? candidates.at(-1)!;
    for (let index = 0; index < DENSE_MARKS; index += 1) {
      const from = index % (dense.grapheme_length - 1);
      mark(dense.block_id, from, from + 1, 'annotation');
    }

    store.recordManuscriptEntryPosition(book.manuscriptId, book.branchId, midId, 3);

    // ---- measuring -----------------------------------------------------------------------------------------------------
    const rows = new Map<string, { operation: string; position: string } & Timing & { crossOk: boolean }>();
    const clearWal = (): void => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        store.checkpointAfterResponse(true);
        if (walBytes(roots.dataRoot) === 0) return;
      }
      throw new Error('BASELINE_WAL_NOT_TRUNCATED');
    };
    const measure = <T>(operation: string, position: string, round: number, run: () => T): T => {
      clearWal();
      const started = process.hrtime.bigint();
      const result = run();
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      return finish(operation, position, round, elapsed, result);
    };
    const finish = <T>(operation: string, position: string, round: number, elapsed: number, result: T): T => {
      const bytes = walBytes(roots.dataRoot);
      const frames = Number((probe!.prepare('PRAGMA wal_checkpoint(NOOP)').get() as { log: number }).log);
      if (round >= 0) {
        const key = `${operation}@${position}`;
        const row = rows.get(key) ?? { operation, position, ms: [], bytes: [], frames: [], crossOk: true };
        row.ms.push(elapsed); row.bytes.push(bytes); row.frames.push(frames);
        row.crossOk &&= frames <= 0 ? bytes === 0 : bytes === 32 + frames * frameBytes;
        rows.set(key, row);
      }
      return result;
    };
    /** One operation whose row is named after it ran, from what it did (`null`: not recorded). */
    const measureNamed = <T>(name: (result: T) => string | null, position: string, round: number, run: () => T): T => {
      clearWal();
      const started = process.hrtime.bigint();
      const result = run();
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      const operation = name(result);
      return finish(operation ?? '', position, operation === null ? -1 : round, elapsed, result);
    };
    const measureAsync = async <T>(operation: string, position: string, round: number, run: () => Promise<T>): Promise<T> => {
      clearWal();
      const started = process.hrtime.bigint();
      const result = await run();
      return finish(operation, position, round, Number(process.hrtime.bigint() - started) / 1e6, result);
    };

    const edit = (blockId: string, from: number, insertText: string, structure?: JournalStructuralEdit): { run: () => void } => {
      const now = blockTarget(blockId);
      const block = now.blocks.find((candidate) => candidate.blockId === blockId)!;
      return {
        run: () => { store.flushJournalEdit({
          clientEditId: randomUUID(), ...book, baseRevisionId: now.revisionId, blockId, windowStartBlockId: now.blocks[0]!.blockId,
          baseBlockDigest: block.digest, expectedJournalSequence: now.journalSequence, fromGrapheme: from, toGrapheme: from, insertText,
          ...(structure === undefined ? {} : { structure }),
        }); },
      };
    };
    const splitJoin = (blockId: string, position: string, round: number): void => {
      const created = newBlockId();
      const split = edit(blockId, 10, '', { kind: 'split', newBlockId: created });
      measure('split', position, round, split.run);
      const now = blockTarget(blockId);
      const head = now.blocks.find((block) => block.blockId === blockId)!;
      const tail = now.blocks.find((block) => block.blockId === created)!;
      const join = edit(blockId, graphemesOf(head.text).length, '', { kind: 'merge', mergedBlockId: created, mergedBlockDigest: tail.digest });
      measure('join', position, round, join.run);
    };

    /** `ENTERS` Enters at one caret, one after another (the new paragraph's start each time), then one more; then joined back. */
    const enters = (round: number): void => {
      const created: string[] = [];
      const enterAt = (blockId: string, from: number): string => {
        const next = newBlockId();
        edit(blockId, from, '', { kind: 'split', newBlockId: next }).run();
        created.push(next);
        return next;
      };
      measure(`${ENTERS} Enters at one place (total)`, '40 %', round, () => {
        let caret = enterAt(entersId, 10);
        for (let index = 1; index < ENTERS; index += 1) caret = enterAt(caret, 0);
        return caret;
      });
      measure(`Enter #${ENTERS + 1} at the same place`, '40 %', round, () => enterAt(created.at(-1)!, 0));
      for (let index = created.length - 1; index >= 0; index -= 1) {
        const intoId = index === 0 ? entersId : created[index - 1]!;
        const now = blockTarget(intoId);
        const into = now.blocks.find((block) => block.blockId === intoId)!;
        const merged = now.blocks.find((block) => block.blockId === created[index])!;
        edit(intoId, graphemesOf(into.text).length, '', { kind: 'merge', mergedBlockId: created[index]!, mergedBlockDigest: merged.digest }).run();
      }
    };

    // From #1654 on the working state has pages: fill one page past 512 blocks at 16 carets, then join everything back; the
    // Enter that splits the page and the join that merges one are recorded. Before #1654 there are no pages to measure.
    const pages = probe.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'working_pages'").get() !== undefined;
    const pageCount = (): number => Number((probe!.prepare('SELECT count(*) n FROM working_pages WHERE branch_id = ?').get(book.branchId) as { n: number }).n);
    const pageSplitAndMerge = (round: number): void => {
      const page = probe!.prepare(`SELECT first_order_key k, block_count n FROM working_pages WHERE branch_id = ? AND first_order_key >= (
          SELECT order_key FROM working_blocks WHERE branch_id = ? AND block_id = ?) ORDER BY first_order_key LIMIT 1 OFFSET 1`)
        .get(book.branchId, book.branchId, allBlocks[Math.floor(size * 0.3)]!) as { k: number; n: number };
      const carets = (probe!.prepare(`SELECT block_id FROM working_blocks WHERE branch_id = ? AND order_key >= ? ORDER BY order_key LIMIT 16`)
        .all(book.branchId, page.k) as Array<{ block_id: string }>).map((row) => row.block_id);
      const tails: Array<{ into: string; tail: string }> = [];
      for (let index = 0; index <= 512 - page.n; index += 1) {
        const intoId = carets[index % carets.length]!;
        const now = blockTarget(intoId);
        const into = now.blocks.find((block) => block.blockId === intoId)!;
        const tail = newBlockId();
        const before = pageCount();
        measureNamed(() => pageCount() > before ? 'page split (the Enter that splits a page)' : null, '30 %', round,
          () => edit(intoId, graphemesOf(into.text).length, '', { kind: 'split', newBlockId: tail }).run());
        tails.push({ into: intoId, tail });
      }
      for (const { into: intoId, tail } of tails.reverse()) {
        const now = blockTarget(intoId);
        const into = now.blocks.find((block) => block.blockId === intoId)!;
        const merged = now.blocks.find((block) => block.blockId === tail)!;
        const before = pageCount();
        measureNamed(() => pageCount() < before ? 'page merge (the join that merges a page)' : null, '30 %', round,
          () => edit(intoId, graphemesOf(into.text).length, '', { kind: 'merge', mergedBlockId: tail, mergedBlockDigest: merged.digest }).run());
      }
    };

    // 下一条待处理 from the dense paragraph's start: unfiltered (the first mark answers), and under a filter no mark passes
    // (the walk crosses all DENSE_MARKS marks and the rest of the book).
    const pendingWalk = (round: number): void => {
      const from = { blockId: dense.block_id, grapheme: 0, markId: null };
      measure('findPendingMark, unfiltered, next', 'dense paragraph', round, () => store.findPendingMark({ ...book, from, direction: 'next', categories: [], models: [] }));
      measure('findPendingMark, filtered (none passes), next', 'dense paragraph', round,
        () => store.findPendingMark({ ...book, from, direction: 'next', categories: ['risk'], models: [] }));
      measure('findPendingMark, filtered (none passes), previous', 'dense paragraph', round,
        () => store.findPendingMark({ ...book, from: { blockId: allBlocks.at(-1)!, grapheme: 0, markId: null }, direction: 'previous', categories: ['risk'], models: [] }));
    };

    for (let round = -1; round < REPS; round += 1) {
      splitJoin(startId, 'start', round);
      splitJoin(midId, 'middle', round);
      enters(round);
      if (pages) pageSplitAndMerge(round);
      pendingWalk(round);
      const typing = edit(midId, 1, '的');
      measure('typing', 'middle', round, typing.run);
      await measureAsync('save revision', '-', round, () => store.saveMilestone(book.manuscriptId, book.branchId, `基线${round + 2}`, 'stage-archive', null, ''));
      measure('window (middle, proportion)', 'middle', round, () => at({ kind: 'proportion', proportion: 0.5 }));
      measure('window (start)', 'start', round, () => at({ kind: 'start' }));
      measure('offset→position (window by character)', 'middle', round, () => at({ kind: 'character', character: Math.floor(totals.g / 2) }));
      measure('position→offset (window by block)', 'middle', round, () => blockTarget(midId));
      measure('entry position read', 'middle', round, () => store.readManuscriptEntryPosition(book.manuscriptId, book.branchId));
      measure('outline, first page', 'start', round, () => store.getOutline(book.manuscriptId, book.branchId, null));
      measure('outline, whole book', '-', round, () => {
        let cursor: string | null = null;
        let pages = 0;
        do { const page = store.getOutline(book.manuscriptId, book.branchId, cursor); cursor = page.nextCursor; pages += 1; } while (cursor !== null);
        return pages;
      });
      measure('whole-book mark list (proposal workspace)', '-', round, () => store.inspectProposalWorkspace({ manuscriptId: book.manuscriptId, branchId: book.branchId, resultId: null }));
    }

    // ---- one lineage reach (the reversal guard's walk), and the plan SQLite chooses for it -------------------------------
    const reachFrom = entersId;
    const reachTo = allBlocks[0]!;
    for (let round = -1; round < REPS; round += 1) measure('lineage reach (not reached)', '40 %', round, () => blockReachesThroughLineage(probe!, book.branchId, reachFrom, reachTo));
    const plan = (probe.prepare(`EXPLAIN QUERY PLAN ${LINEAGE_REACH_SQL}`).all(reachFrom, book.branchId, reachTo) as Array<{ detail: string }>).map((row) => row.detail);

    // ---- 全部替换 of REPLACE_ALL_PLACES places, and its undo as one editor step (#1654); before #1654 Ctrl+Z skips every Apply,
    // so the base replaces back instead (not measured) ----------------------------------------------------------------------
    const marker = '〔替〕';
    const replaced = '〔换〕';
    const targets = candidates.filter((row) => row.block_id !== dense.block_id && !reserved.has(row.block_id));
    const stride = Math.max(1, Math.floor(targets.length / REPLACE_ALL_PLACES));
    for (let index = 0, placed = 0; placed < REPLACE_ALL_PLACES && index < targets.length; index += stride, placed += 1) edit(targets[index]!.block_id, 0, marker).run();
    const steps = typeof (store as unknown as { inspectEditorHistory?: unknown }).inspectEditorHistory === 'function';
    const replaceAll = (query: string, replacement: string, operation: string | null, round: number): void => {
      const search = store.createSearch(book.manuscriptId, book.branchId, query).searchId;
      while (!store.advanceSearch(search).done) { /* bounded search */ }
      const preview = store.prepareReplacement(search, replacement, []);
      while (!store.advanceReplacementWork(preview.previewId).done) { /* prepare */ }
      store.freezeReplacement(preview.previewId, []);
      while (!store.advanceReplacementWork(preview.previewId).done) { /* validate */ }
      const input = { previewId: preview.previewId, windowStartBlockId: allBlocks[0]! };
      if (operation === null) store.commitReplacementRevisions(input);
      else measure(operation, '-', round, () => store.commitReplacementRevisions(input));
    };
    for (let round = -1; round < REPS; round += 1) {
      replaceAll(marker, replaced, `全部替换 ${REPLACE_ALL_PLACES} 处`, round);
      if (steps) {
        const digest = at({ kind: 'start' }).workingDigest;
        measure(`undo of 全部替换 ${REPLACE_ALL_PLACES} 处 (one transaction: the write lock)`, '-', round, () => store.undoManuscript(book.manuscriptId, book.branchId, digest));
      } else {
        replaceAll(replaced, marker, null, round);
      }
    }
    return {
      size, counts,
      graphemes: { total: totals.g, meanPerBlock: totals.g / totals.n, meanPerBody: body.g / body.n },
      marks: spread + DENSE_MARKS, importSeconds, pageBytes: pageSize,
      lineagePlan: plan,
      rows: [...rows.values()].map((row) => ({ operation: row.operation, position: row.position, ms: row.ms, bytes: row.bytes, frames: row.frames, frameCrossCheck: row.crossOk })),
    };
  } finally {
    probe?.close();
    store.markCleanShutdown();
    store.close();
    await roots.dispose();
  }
}

function report(result: SizeResult): void {
  const fmt = (value: number, digits = 1): string => value.toFixed(digits);
  console.log(`\n### ${result.size} blocks — ${Object.entries(result.counts).map(([kind, n]) => `${kind} ${n}`).join(', ')}; ` +
    `${result.graphemes.total} graphemes, mean ${fmt(result.graphemes.meanPerBlock)} per block / ${fmt(result.graphemes.meanPerBody)} per body paragraph; ` +
    `${result.marks} marks; lineage plan ${JSON.stringify(result.lineagePlan)}; import ${fmt(result.importSeconds)} s; page ${result.pageBytes} B`);
  console.log('| operation | position | reps | time median ms | min | max | WAL median MiB | min | max | WAL frames median | frame check |');
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const row of result.rows) {
    console.log(`| ${row.operation} | ${row.position} | ${row.ms.length} | ${fmt(median(row.ms), 2)} | ${fmt(Math.min(...row.ms), 2)} | ${fmt(Math.max(...row.ms), 2)} | ` +
      `${fmt(median(row.bytes) / MIB, 3)} | ${fmt(Math.min(...row.bytes) / MIB, 3)} | ${fmt(Math.max(...row.bytes) / MIB, 3)} | ${median(row.frames)} | ${row.frameCrossCheck ? 'ok' : 'MISMATCH'} |`);
  }
  console.log(`AI7_BASELINE_RESULT ${JSON.stringify(result)}`);
}

describe('large-manuscript baseline (#1557)', () => {
  it('measures structural edits, typing, revisions and reads at each size', async () => {
    const blocks = await sourceBlocks();
    console.log(`AI7_BASELINE_ENV ${JSON.stringify({ node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, cpus: cpus().length, sourceBlocksPerCycle: blocks.length, sizes: SIZES, reps: REPS })}`);
    for (const size of SIZES) report(await measureSize(size, blocks));
  });
});
