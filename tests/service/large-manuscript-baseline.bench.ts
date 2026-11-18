import { randomBytes, randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
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
const MARK_EVERY = 100;
const MIB = 1024 * 1024;

type Timing = { ms: number[]; bytes: number[]; frames: number[] };
interface SizeResult {
  size: number;
  counts: Record<string, number>;
  graphemes: { total: number; meanPerBlock: number; meanPerBody: number };
  marks: number;
  importSeconds: number;
  pageBytes: number;
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

    // ---- seed marks: one per MARK_EVERY body paragraphs, alternating 批注 and 修改建议 -----------------------------------
    const seeded = new Set<string>();
    const candidates = probe.prepare("SELECT block_id FROM working_blocks WHERE branch_id = ? AND kind = 'paragraph' AND grapheme_length >= 20 ORDER BY position")
      .all(book.branchId) as Array<{ block_id: string }>;
    for (let index = MARK_EVERY - 1, ordinal = 0; index < candidates.length; index += MARK_EVERY, ordinal += 1) {
      const blockId = candidates[index]!.block_id;
      const now = blockTarget(blockId);
      const block = now.blocks.find((candidate) => candidate.blockId === blockId)!;
      const kind = ordinal % 2 === 0 ? 'annotation' : 'change-suggestion';
      store.createEditorialMark({
        ...book, windowStartBlockId: now.blocks[0]!.blockId, clientMarkId: randomUUID(), baseRevisionId: now.revisionId,
        expectedJournalSequence: now.journalSequence, blockId, baseBlockDigest: block.digest, fromGrapheme: 0, toGrapheme: 2,
        selectedText: graphemesOf(block.text).slice(0, 2).join(''), kind, highlightColor: null,
        body: kind === 'annotation' ? '〔批注〕' : '', proposedText: kind === 'change-suggestion' ? '〔建议〕' : null, rationale: null,
      });
      seeded.add(blockId);
    }

    // ---- the two edit positions: first body paragraph (worst case) and the middle, neither carrying a mark -------------------
    const bodyAt = (from: number): string => (probe!.prepare(
      "SELECT block_id FROM working_blocks WHERE branch_id = ? AND kind = 'paragraph' AND grapheme_length >= 30 AND position >= ? ORDER BY position LIMIT 40",
    ).all(book.branchId, from) as Array<{ block_id: string }>).map((row) => row.block_id).find((id) => !seeded.has(id))!;
    const startId = bodyAt(1);
    const midId = bodyAt(Math.floor(size / 2));
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

    for (let round = -1; round < REPS; round += 1) {
      splitJoin(startId, 'start', round);
      splitJoin(midId, 'middle', round);
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
    return {
      size, counts,
      graphemes: { total: totals.g, meanPerBlock: totals.g / totals.n, meanPerBody: body.g / body.n },
      marks: seeded.size, importSeconds, pageBytes: pageSize,
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
    `${result.marks} marks; import ${fmt(result.importSeconds)} s; page ${result.pageBytes} B`);
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
