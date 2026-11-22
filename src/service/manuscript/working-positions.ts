import type { DatabaseSync } from 'node:sqlite';
import type { ManuscriptBlockKind } from '../../shared/protocol.js';
import { BoundedStoreError, asNumber, asString, requireBounded, stagedBlockLength, type SqlRow } from './bounded-kernel.js';

/**
 * The working state's positions (Issue #1654; ADR 0105 §6): the one owner of the reads and writes of `working_blocks`' order,
 * the outline, the page summary and the derived search rows.
 *
 * A working block carries a gapped order key (`ordinal × ORDER_KEY_SPACING` when a branch is built), so a split inserts one
 * row at the midpoint of its neighbours' keys and a join deletes one: no later row moves. `working_pages` sums the blocks
 * page by page (256 when built, split at 512, merged below 64), so the 1-based paragraph number every projection carries as
 * `position`, and the whole-manuscript grapheme offset, are a walk over a few hundred page rows plus one index-only range
 * scan inside a page. The first page of a branch starts at key 0; every other page starts at its first block's key.
 *
 * An exhausted gap is re-spaced at the smallest level with room — the page, the page and its two neighbours, the whole
 * branch — with the new block's slot reserved first, so it lands strictly between its neighbours, and with rows whose key
 * goes down updated in ascending order before rows whose key goes up in descending order, so no key is ever held twice.
 */

export const ORDER_KEY_SPACING = 2 ** 20;
const PAGE_BUILD = 256;
const PAGE_MAX = 512;
const PAGE_MIN = 64;
const AFTER_LAST = Number.MAX_SAFE_INTEGER;

export interface WorkingRow {
  readonly blockId: string;
  readonly key: number;
  /** The 1-based paragraph number. */
  readonly position: number;
  readonly kind: ManuscriptBlockKind;
  readonly level: number | null;
  readonly text: string;
  readonly digest: string;
  readonly graphemeLength: number;
}

export interface BlockContent {
  readonly kind: ManuscriptBlockKind;
  readonly level: number | null;
  readonly text: string;
  readonly digest: string;
}

interface Page { readonly first: number; readonly count: number; readonly graphemes: number }

const ROW_COLUMNS = 'block_id, order_key, kind, level, text, digest, grapheme_length';

const corrupt = (message: string): never => { throw new BoundedStoreError('OFFSET_INDEX_INVALID', message); };

function rowOf(row: SqlRow, position: number): WorkingRow {
  return {
    blockId: asString(row.block_id), key: asNumber(row.order_key), position,
    kind: asString(row.kind) as ManuscriptBlockKind, level: row.level === null ? null : asNumber(row.level),
    text: asString(row.text), digest: asString(row.digest), graphemeLength: asNumber(row.grapheme_length),
  };
}

function pages(db: DatabaseSync, branchId: string): Page[] {
  return (db.prepare('SELECT first_order_key, block_count, grapheme_total FROM working_pages WHERE branch_id = ? ORDER BY first_order_key')
    .all(branchId) as SqlRow[]).map((row) => ({ first: asNumber(row.first_order_key), count: asNumber(row.block_count), graphemes: asNumber(row.grapheme_total) }));
}

function pageOf(db: DatabaseSync, branchId: string, key: number): Page {
  const row = db.prepare('SELECT first_order_key, block_count, grapheme_total FROM working_pages WHERE branch_id = ? AND first_order_key <= ? ORDER BY first_order_key DESC LIMIT 1')
    .get(branchId, key) as SqlRow | undefined;
  requireBounded(row !== undefined, 'OFFSET_INDEX_INVALID', '稿件分页索引缺失。');
  return { first: asNumber(row.first_order_key), count: asNumber(row.block_count), graphemes: asNumber(row.grapheme_total) };
}

/** The first key of the page after the one starting at `first`, or `AFTER_LAST`. */
function pageEnd(db: DatabaseSync, branchId: string, first: number): number {
  const row = db.prepare('SELECT first_order_key FROM working_pages WHERE branch_id = ? AND first_order_key > ? ORDER BY first_order_key LIMIT 1')
    .get(branchId, first) as SqlRow | undefined;
  return row === undefined ? AFTER_LAST : asNumber(row.first_order_key);
}

function before(db: DatabaseSync, branchId: string, first: number): { blocks: number; graphemes: number } {
  const row = db.prepare('SELECT coalesce(sum(block_count), 0) blocks, coalesce(sum(grapheme_total), 0) graphemes FROM working_pages WHERE branch_id = ? AND first_order_key < ?')
    .get(branchId, first) as SqlRow;
  return { blocks: asNumber(row.blocks), graphemes: asNumber(row.graphemes) };
}

// ---- reads ------------------------------------------------------------------------------------------------------------

/** How many blocks the working state holds. */
export function paragraphCount(db: DatabaseSync, branchId: string): number {
  return asNumber((db.prepare('SELECT coalesce(sum(block_count), 0) total FROM working_pages WHERE branch_id = ?').get(branchId) as SqlRow).total);
}

/** The 1-based paragraph number of the block holding `key`. */
export function paragraphAtKey(db: DatabaseSync, branchId: string, key: number): number {
  const page = pageOf(db, branchId, key);
  const inPage = asNumber((db.prepare('SELECT count(*) n FROM working_blocks WHERE branch_id = ? AND order_key >= ? AND order_key <= ?')
    .get(branchId, page.first, key) as SqlRow).n);
  return before(db, branchId, page.first).blocks + inPage;
}

/** A working block with its key and paragraph number, or `undefined` when the working state does not hold it. */
export function workingBlock(db: DatabaseSync, branchId: string, blockId: string): WorkingRow | undefined {
  const row = db.prepare(`SELECT ${ROW_COLUMNS} FROM working_blocks WHERE branch_id = ? AND block_id = ?`).get(branchId, blockId) as SqlRow | undefined;
  return row === undefined ? undefined : rowOf(row, paragraphAtKey(db, branchId, asNumber(row.order_key)));
}

/** The order key of the `paragraph`-th block (1-based). */
export function keyAtParagraph(db: DatabaseSync, branchId: string, paragraph: number): number {
  requireBounded(Number.isSafeInteger(paragraph) && paragraph >= 1, 'OFFSET_INDEX_INVALID', '稿件段落位置无效。');
  let passed = 0;
  for (const page of pages(db, branchId)) {
    if (paragraph <= passed + page.count) {
      const row = db.prepare('SELECT order_key FROM working_blocks WHERE branch_id = ? AND order_key >= ? ORDER BY order_key LIMIT 1 OFFSET ?')
        .get(branchId, page.first, paragraph - passed - 1) as SqlRow | undefined;
      requireBounded(row !== undefined, 'OFFSET_INDEX_INVALID', '稿件分页索引与内容块不一致。');
      return asNumber(row.order_key);
    }
    passed += page.count;
  }
  throw corrupt('稿件段落位置超出范围。');
}

/** Up to `limit` working blocks from the `fromParagraph`-th on, each with its paragraph number. */
export function rowsFrom(db: DatabaseSync, branchId: string, fromParagraph: number, limit: number): WorkingRow[] {
  if (fromParagraph > paragraphCount(db, branchId)) return [];
  const key = keyAtParagraph(db, branchId, fromParagraph);
  return (db.prepare(`SELECT ${ROW_COLUMNS} FROM working_blocks WHERE branch_id = ? AND order_key >= ? ORDER BY order_key LIMIT ?`)
    .all(branchId, key, limit) as SqlRow[]).map((row, index) => rowOf(row, fromParagraph + index));
}

/** The keys a window of `size` blocks starting at the `fromParagraph`-th covers: `[from, to)`. */
export function windowKeys(db: DatabaseSync, branchId: string, fromParagraph: number, size: number): { from: number; to: number } {
  const total = paragraphCount(db, branchId);
  return {
    from: fromParagraph > total ? AFTER_LAST : keyAtParagraph(db, branchId, Math.max(1, fromParagraph)),
    to: fromParagraph + size > total ? AFTER_LAST : keyAtParagraph(db, branchId, fromParagraph + size),
  };
}

/** The graphemes of every block before the one holding `key`. */
export function offsetBefore(db: DatabaseSync, branchId: string, key: number): number {
  const page = pageOf(db, branchId, key);
  const inPage = asNumber((db.prepare('SELECT coalesce(sum(grapheme_length), 0) g FROM working_blocks WHERE branch_id = ? AND order_key >= ? AND order_key < ?')
    .get(branchId, page.first, key) as SqlRow).g);
  return before(db, branchId, page.first).graphemes + inPage;
}

/** The block that holds whole-manuscript grapheme `character`, and the offset its first grapheme stands at. */
export function blockAtCharacter(db: DatabaseSync, branchId: string, character: number): { key: number; position: number; startCharacter: number } {
  let blocks = 0;
  let graphemes = 0;
  for (const page of pages(db, branchId)) {
    if (character < graphemes + page.graphemes) {
      const rows = db.prepare('SELECT order_key, grapheme_length FROM working_blocks WHERE branch_id = ? AND order_key >= ? ORDER BY order_key LIMIT ?')
        .all(branchId, page.first, page.count) as SqlRow[];
      for (const row of rows) {
        blocks += 1;
        const length = asNumber(row.grapheme_length);
        if (character < graphemes + length) return { key: asNumber(row.order_key), position: blocks, startCharacter: graphemes };
        graphemes += length;
      }
      throw corrupt('稿件分页字符总数与内容块不一致。');
    }
    blocks += page.count;
    graphemes += page.graphemes;
  }
  throw corrupt('全稿字符位置无法解析。');
}

/**
 * The paragraph number and whole-manuscript offset of many keys in one pass (ADR 0105 §6's batch rank): the pages are read
 * once, and each page a key falls in is scanned once in key order.
 */
export function placesOfKeys(db: DatabaseSync, branchId: string, keys: Iterable<number>): Map<number, { position: number; offset: number }> {
  const wanted = [...new Set(keys)].sort((a, b) => a - b);
  const places = new Map<number, { position: number; offset: number }>();
  if (wanted.length === 0) return places;
  const all = pages(db, branchId);
  let next = 0;
  let blocks = 0;
  let graphemes = 0;
  const scan = db.prepare('SELECT order_key, grapheme_length FROM working_blocks WHERE branch_id = ? AND order_key >= ? AND order_key < ? ORDER BY order_key');
  for (let index = 0; index < all.length && next < wanted.length; index += 1) {
    const page = all[index]!;
    const end = all[index + 1]?.first ?? AFTER_LAST;
    if (wanted[next]! < end) {
      let rank = blocks;
      let offset = graphemes;
      for (const row of scan.iterate(branchId, page.first, end) as Iterable<SqlRow>) {
        rank += 1;
        const key = asNumber(row.order_key);
        while (next < wanted.length && wanted[next]! < key) next += 1;
        if (wanted[next] === key) { places.set(key, { position: rank, offset }); next += 1; }
        offset += asNumber(row.grapheme_length);
        if (next >= wanted.length || wanted[next]! >= end) break;
      }
      while (next < wanted.length && wanted[next]! < end) next += 1;
    }
    blocks += page.count;
    graphemes += page.graphemes;
  }
  return places;
}

/** The paragraph numbers of many blocks of the working state; a block the working state does not hold is absent. */
export function positionsOfBlocks(db: DatabaseSync, branchId: string, blockIds: Iterable<string>): Map<string, number> {
  const ids = [...new Set(blockIds)];
  if (ids.length === 0) return new Map();
  const keyed = db.prepare('SELECT block_id, order_key FROM working_blocks WHERE branch_id = ? AND block_id IN (SELECT value FROM json_each(?))')
    .all(branchId, JSON.stringify(ids)) as SqlRow[];
  const places = placesOfKeys(db, branchId, keyed.map((row) => asNumber(row.order_key)));
  return new Map(keyed.map((row) => [asString(row.block_id), places.get(asNumber(row.order_key))!.position]));
}

/** The blocks right before and right after `blockId` in the working state. */
export function neighbours(db: DatabaseSync, branchId: string, key: number): { previous: string | null; next: string | null } {
  const previous = db.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? AND order_key < ? ORDER BY order_key DESC LIMIT 1').get(branchId, key) as SqlRow | undefined;
  const next = db.prepare('SELECT block_id FROM working_blocks WHERE branch_id = ? AND order_key > ? ORDER BY order_key LIMIT 1').get(branchId, key) as SqlRow | undefined;
  return { previous: previous === undefined ? null : asString(previous.block_id), next: next === undefined ? null : asString(next.block_id) };
}

// ---- writes -----------------------------------------------------------------------------------------------------------

/**
 * A block's outline row and search row, written again. A search row's rowid is its working block's rowid (Issue #1654): the
 * trigram table indexes only its text, so a row is found and deleted by rowid, never by scanning the table for its block.
 */
function refreshDerived(db: DatabaseSync, branchId: string, blockId: string, rowid: number, key: number, content: BlockContent | null): void {
  db.prepare('DELETE FROM manuscript_outline WHERE branch_id = ? AND block_id = ?').run(branchId, blockId);
  db.prepare('DELETE FROM working_block_search WHERE rowid = ?').run(rowid);
  if (content === null) return;
  db.prepare('INSERT INTO working_block_search(rowid, branch_id, block_id, text) VALUES (?, ?, ?, ?)').run(rowid, branchId, blockId, content.text);
  if (content.kind === 'title' || content.kind === 'heading') {
    db.prepare('INSERT INTO manuscript_outline(branch_id, block_id, order_key, kind, level, text, digest) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(branchId, blockId, key, content.kind, content.level ?? 1, content.text, content.digest);
  }
}

/** The page row starting at `first`, written with its counts read from the blocks it holds. */
function recountPage(db: DatabaseSync, branchId: string, first: number): { count: number; graphemes: number } {
  const end = pageEnd(db, branchId, first);
  const row = db.prepare('SELECT count(*) n, coalesce(sum(grapheme_length), 0) g FROM working_blocks WHERE branch_id = ? AND order_key >= ? AND order_key < ?')
    .get(branchId, first, end) as SqlRow;
  const counts = { count: asNumber(row.n), graphemes: asNumber(row.g) };
  db.prepare('UPDATE working_pages SET block_count = ?, grapheme_total = ? WHERE branch_id = ? AND first_order_key = ?').run(counts.count, counts.graphemes, branchId, first);
  return counts;
}

/**
 * The page starting at `first` written with the blocks it holds now; when they are more than `PAGE_MAX` it splits at its middle
 * block first, so no page row ever counts more than it may hold.
 */
function settlePage(db: DatabaseSync, branchId: string, first: number): void {
  const end = pageEnd(db, branchId, first);
  const count = asNumber((db.prepare('SELECT count(*) n FROM working_blocks WHERE branch_id = ? AND order_key >= ? AND order_key < ?').get(branchId, first, end) as SqlRow).n);
  if (count > PAGE_MAX) {
    const middle = asNumber((db.prepare('SELECT order_key FROM working_blocks WHERE branch_id = ? AND order_key >= ? ORDER BY order_key LIMIT 1 OFFSET ?')
      .get(branchId, first, Math.floor(count / 2)) as SqlRow).order_key);
    db.prepare('INSERT INTO working_pages(branch_id, first_order_key, block_count, grapheme_total) VALUES (?, ?, 1, 0)').run(branchId, middle);
    recountPage(db, branchId, middle);
  }
  recountPage(db, branchId, first);
}

/** The page starting at `first`, smaller than `PAGE_MIN`, merges into its neighbour, which splits again if it then overflows. */
function mergePageIfSmall(db: DatabaseSync, branchId: string, first: number, count: number): void {
  if (count >= PAGE_MIN) return;
  const all = pages(db, branchId);
  if (all.length < 2) return;
  const index = all.findIndex((page) => page.first === first);
  // The first page keeps key 0: it absorbs the page after it instead of being absorbed.
  const [into, gone] = index === 0 ? [all[0]!, all[1]!] : [all[index - 1]!, all[index]!];
  db.prepare('DELETE FROM working_pages WHERE branch_id = ? AND first_order_key = ?').run(branchId, gone.first);
  settlePage(db, branchId, into.first);
}

/**
 * New keys for `rows` (in key order) and one new block right after the row at `insertAfter`, evenly inside `(low, high)`.
 * Rows whose key goes down are written in ascending order, then rows whose key goes up in descending order, so no key is ever
 * held twice; the outline rows follow their blocks, and the pages whose first block moved follow it. Returns the new block's key.
 */
function respace(db: DatabaseSync, branchId: string, rows: ReadonlyArray<{ blockId: string; key: number }>, insertAfter: number, low: number, high: number): number {
  const slots = rows.length + 1;
  const width = high - low;
  const keyAt = (slot: number): number => low + Math.floor(((slot + 1) * width) / (slots + 1));
  const moves: Array<{ blockId: string; from: number; to: number }> = [];
  let newKey = 0;
  let slot = 0;
  for (let index = 0; index < rows.length; index += 1) {
    moves.push({ blockId: rows[index]!.blockId, from: rows[index]!.key, to: keyAt(slot++) });
    if (index === insertAfter) newKey = keyAt(slot++);
  }
  const pageFirsts = new Set((db.prepare('SELECT first_order_key FROM working_pages WHERE branch_id = ? AND first_order_key >= ? AND first_order_key <= ?')
    .all(branchId, rows[0]!.key, rows.at(-1)!.key) as SqlRow[]).map((row) => asNumber(row.first_order_key)));
  const moveBlock = db.prepare('UPDATE working_blocks SET order_key = ? WHERE branch_id = ? AND block_id = ?');
  const moveOutline = db.prepare('UPDATE manuscript_outline SET order_key = ? WHERE branch_id = ? AND block_id = ?');
  const movePage = db.prepare('UPDATE working_pages SET first_order_key = ? WHERE branch_id = ? AND first_order_key = ?');
  const write = (move: { blockId: string; from: number; to: number }): void => {
    moveBlock.run(move.to, branchId, move.blockId);
    moveOutline.run(move.to, branchId, move.blockId);
  };
  const down = moves.filter((move) => move.to < move.from);
  const up = moves.filter((move) => move.to > move.from).reverse();
  for (const move of down) write(move);
  for (const move of up) write(move);
  const pageMoves = moves.filter((move) => pageFirsts.has(move.from) && move.from !== move.to);
  for (const move of pageMoves.filter((item) => item.to < item.from)) movePage.run(move.to, branchId, move.from);
  for (const move of pageMoves.filter((item) => item.to > item.from).reverse()) movePage.run(move.to, branchId, move.from);
  return newKey;
}

/** The key for a block right after the one holding `afterKey`, re-spacing the smallest range with room when the gap is full. */
function keyAfter(db: DatabaseSync, branchId: string, afterKey: number, spacing: number): number {
  const next = db.prepare('SELECT order_key FROM working_blocks WHERE branch_id = ? AND order_key > ? ORDER BY order_key LIMIT 1').get(branchId, afterKey) as SqlRow | undefined;
  if (next === undefined) return afterKey + spacing;
  const nextKey = asNumber(next.order_key);
  if (nextKey - afterKey >= 2) return afterKey + Math.floor((nextKey - afterKey) / 2);
  const all = pages(db, branchId);
  const at = all.findIndex((page, index) => page.first <= afterKey && afterKey < (all[index + 1]?.first ?? AFTER_LAST));
  const range = db.prepare('SELECT block_id, order_key FROM working_blocks WHERE branch_id = ? AND order_key >= ? AND order_key < ? ORDER BY order_key');
  const lastBefore = db.prepare('SELECT order_key FROM working_blocks WHERE branch_id = ? AND order_key < ? ORDER BY order_key DESC LIMIT 1');
  for (const reach of [0, 1]) {
    const firstPage = Math.max(0, at - reach);
    const lastPage = Math.min(all.length - 1, at + reach);
    const from = all[firstPage]!.first;
    const end = all[lastPage + 1]?.first ?? AFTER_LAST;
    const rows = (range.all(branchId, from, end) as SqlRow[]).map((row) => ({ blockId: asString(row.block_id), key: asNumber(row.order_key) }));
    const previous = lastBefore.get(branchId, from) as SqlRow | undefined;
    const low = previous === undefined ? 0 : asNumber(previous.order_key);
    const high = end === AFTER_LAST ? rows.at(-1)!.key + (rows.length + 2) * spacing : end;
    if (high - low - 1 >= rows.length + 1) return respace(db, branchId, rows, rows.findIndex((row) => row.key === afterKey), low, high);
  }
  // The whole branch: back to `ordinal × spacing`, with the new block's slot reserved.
  const rows = (range.all(branchId, 0, AFTER_LAST) as SqlRow[]).map((row) => ({ blockId: asString(row.block_id), key: asNumber(row.order_key) }));
  const index = rows.findIndex((row) => row.key === afterKey);
  return respace(db, branchId, rows, index, 0, (rows.length + 2) * spacing);
}

/**
 * A new block right after `afterBlockId` (a split, or a paragraph a heading made at its end): one row inserted at the middle
 * of the gap, one page row counted. Returns its key.
 */
export function insertBlockAfter(db: DatabaseSync, branchId: string, afterBlockId: string, blockId: string, content: BlockContent,
  spacing = ORDER_KEY_SPACING): number {
  const after = db.prepare('SELECT order_key FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(branchId, afterBlockId) as SqlRow | undefined;
  requireBounded(after !== undefined, 'EDIT_BLOCK_CHANGED', '稳定内容块不存在。');
  const key = keyAfter(db, branchId, asNumber(after.order_key), spacing);
  const length = stagedBlockLength(content.text, 'EDIT_TOO_LARGE', '内容块超出安全范围。');
  const inserted = db.prepare(`INSERT INTO working_blocks(branch_id, block_id, order_key, kind, level, text, digest, grapheme_length) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(branchId, blockId, key, content.kind, content.level, content.text, content.digest, length);
  refreshDerived(db, branchId, blockId, Number(inserted.lastInsertRowid), key, content);
  const page = pageOf(db, branchId, key);
  if (page.count + 1 > PAGE_MAX) settlePage(db, branchId, page.first);
  else {
    db.prepare('UPDATE working_pages SET block_count = block_count + 1, grapheme_total = grapheme_total + ? WHERE branch_id = ? AND first_order_key = ?')
      .run(length, branchId, page.first);
  }
  return key;
}

/** `blockId` leaves the working state (a join): one row deleted, one page row counted, merged into a neighbour when small. */
export function removeBlock(db: DatabaseSync, branchId: string, blockId: string): void {
  const row = db.prepare('SELECT rowid, order_key, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ?').get(branchId, blockId) as SqlRow | undefined;
  requireBounded(row !== undefined, 'EDIT_BLOCK_CHANGED', '稳定内容块不存在。');
  const key = asNumber(row.order_key);
  const page = pageOf(db, branchId, key);
  db.prepare('DELETE FROM working_blocks WHERE branch_id = ? AND block_id = ?').run(branchId, blockId);
  refreshDerived(db, branchId, blockId, asNumber(row.rowid), key, null);
  const count = page.count - 1;
  let first = page.first;
  if (count === 0) {
    db.prepare('DELETE FROM working_pages WHERE branch_id = ? AND first_order_key = ?').run(branchId, page.first);
    return;
  }
  if (page.first === key) {
    // A page starts at its first block: the next one now.
    first = asNumber((db.prepare('SELECT order_key FROM working_blocks WHERE branch_id = ? AND order_key > ? ORDER BY order_key LIMIT 1').get(branchId, key) as SqlRow).order_key);
    db.prepare('UPDATE working_pages SET first_order_key = ? WHERE branch_id = ? AND first_order_key = ?').run(first, branchId, page.first);
  }
  db.prepare('UPDATE working_pages SET block_count = ?, grapheme_total = grapheme_total - ? WHERE branch_id = ? AND first_order_key = ?')
    .run(count, asNumber(row.grapheme_length), branchId, first);
  mergePageIfSmall(db, branchId, first, count);
}

/**
 * A block's content written in place — typing, a replacement, an Apply, an undo or redo, a style — when it still holds
 * `expectedDigest`. Its page's grapheme total, its outline row and its search row follow. `null` when the block is gone or its
 * digest differs, so each caller refuses in its own words; otherwise its key, paragraph-free, and the grapheme change.
 */
export function rewriteBlock(db: DatabaseSync, branchId: string, blockId: string, content: BlockContent, expectedDigest: string): { key: number; delta: number } | null {
  const row = db.prepare('SELECT rowid, order_key, grapheme_length FROM working_blocks WHERE branch_id = ? AND block_id = ? AND digest = ?').get(branchId, blockId, expectedDigest) as SqlRow | undefined;
  if (row === undefined) return null;
  const key = asNumber(row.order_key);
  const length = stagedBlockLength(content.text, 'EDIT_TOO_LARGE', '内容块超出安全范围。');
  db.prepare('UPDATE working_blocks SET kind = ?, level = ?, text = ?, digest = ?, grapheme_length = ? WHERE branch_id = ? AND block_id = ?')
    .run(content.kind, content.level, content.text, content.digest, length, branchId, blockId);
  const delta = length - asNumber(row.grapheme_length);
  if (delta !== 0) {
    db.prepare('UPDATE working_pages SET grapheme_total = grapheme_total + ? WHERE branch_id = ? AND first_order_key = ?').run(delta, branchId, pageOf(db, branchId, key).first);
  }
  refreshDerived(db, branchId, blockId, asNumber(row.rowid), key, content);
  return { key, delta };
}

/**
 * The derived state of a branch whose rows were just written in increasing key order (an import, a new Production Document,
 * a crash-recovery restore, a reimport — and R5-6's converted branch): keys normalized to `ordinal × spacing`, grapheme
 * lengths, the outline, the search rows, pages of 256, and the branch's total. Returns the total graphemes.
 */
export function assignKeysAndPages(db: DatabaseSync, branchId: string, spacing = ORDER_KEY_SPACING): number {
  db.prepare('DELETE FROM manuscript_outline WHERE branch_id = ?').run(branchId);
  db.prepare('DELETE FROM working_block_search WHERE branch_id = ?').run(branchId);
  db.prepare('DELETE FROM working_pages WHERE branch_id = ?').run(branchId);
  const rows = (db.prepare('SELECT block_id, order_key, text FROM working_blocks WHERE branch_id = ? ORDER BY order_key').all(branchId) as SqlRow[]);
  requireBounded(rows.length > 0, 'SCHEMA_MIGRATION_FAILED', '工作稿缺少内容块。');
  // Keys only ever grow here (`ordinal × spacing` ≥ any dense ordinal), so the rows are written from the last one back.
  const moves = rows.map((row, index) => ({ blockId: asString(row.block_id), from: asNumber(row.order_key), to: (index + 1) * spacing }));
  const update = db.prepare('UPDATE working_blocks SET order_key = ?, grapheme_length = ? WHERE branch_id = ? AND block_id = ?');
  const lengths = rows.map((row) => stagedBlockLength(asString(row.text)));
  const down = moves.map((move, index) => ({ ...move, index })).filter((move) => move.to < move.from);
  const up = moves.map((move, index) => ({ ...move, index })).filter((move) => move.to >= move.from).reverse();
  for (const move of [...down, ...up]) update.run(move.to, lengths[move.index]!, branchId, move.blockId);
  const outline = db.prepare(`INSERT INTO manuscript_outline(branch_id, block_id, order_key, kind, level, text, digest)
    SELECT branch_id, block_id, order_key, kind, coalesce(level, 1), text, digest FROM working_blocks
    WHERE branch_id = ? AND kind IN ('title', 'heading')`);
  outline.run(branchId);
  db.prepare('INSERT INTO working_block_search(rowid, branch_id, block_id, text) SELECT rowid, branch_id, block_id, text FROM working_blocks WHERE branch_id = ? ORDER BY order_key').run(branchId);
  const insertPage = db.prepare('INSERT INTO working_pages(branch_id, first_order_key, block_count, grapheme_total) VALUES (?, ?, ?, ?)');
  let total = 0;
  for (let start = 0; start < rows.length; start += PAGE_BUILD) {
    // A last page smaller than PAGE_MIN stays with the page before it.
    const end = rows.length - (start + PAGE_BUILD) < PAGE_MIN ? rows.length : start + PAGE_BUILD;
    const graphemes = lengths.slice(start, end).reduce((sum, length) => sum + length, 0);
    insertPage.run(branchId, start === 0 ? 0 : moves[start]!.to, end - start, graphemes);
    total += graphemes;
    if (end === rows.length) break;
  }
  requireBounded(Number.isSafeInteger(total), 'SCHEMA_MIGRATION_FAILED', '工作稿字符总数无效。');
  db.prepare('UPDATE branch_working_state SET total_graphemes = ? WHERE branch_id = ?').run(total, branchId);
  return total;
}

/**
 * The working state replaced whole (a crash-recovery restore, a reimport; R5-5's restore): every row of the branch goes, the
 * given rows come in their order, and the derived state is built. Returns the total graphemes.
 */
export function replaceWorkingState(db: DatabaseSync, branchId: string, rows: Iterable<{ blockId: string } & BlockContent>, spacing = ORDER_KEY_SPACING): number {
  db.prepare('DELETE FROM working_blocks WHERE branch_id = ?').run(branchId);
  const insert = db.prepare('INSERT INTO working_blocks(branch_id, block_id, order_key, kind, level, text, digest, grapheme_length) VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
  let ordinal = 0;
  for (const row of rows) insert.run(branchId, row.blockId, (ordinal += 1) * spacing, row.kind, row.level, row.text, row.digest);
  return assignKeysAndPages(db, branchId, spacing);
}

/**
 * The open-time and recovery check of a branch's positions: keys increase, the first page starts at 0 and every other page at
 * one of its blocks, each page's counts equal its blocks', and the branch total equals their sum. Returns the total graphemes.
 */
export function validateBranchPositions(db: DatabaseSync, branchId: string, code = 'SCHEMA_MIGRATION_FAILED'): number {
  const fail = (message: string): never => { throw new BoundedStoreError(code, message); };
  const all = pages(db, branchId);
  if (all.length === 0 || all[0]!.first !== 0) fail('工作稿分页索引缺失。');
  let total = 0;
  let blocks = 0;
  all.forEach((page, index) => {
    const end = all[index + 1]?.first ?? AFTER_LAST;
    const rows = db.prepare('SELECT order_key, text, grapheme_length FROM working_blocks WHERE branch_id = ? AND order_key >= ? AND order_key < ? ORDER BY order_key')
      .all(branchId, page.first, end) as SqlRow[];
    let graphemes = 0;
    for (const row of rows) {
      const length = stagedBlockLength(asString(row.text), code, '工作稿文字超出有界校验范围。');
      if (asNumber(row.grapheme_length) !== length) fail('工作稿的内容块字素长度校验失败。');
      graphemes += length;
    }
    if (rows.length !== page.count || rows.length === 0 || graphemes !== page.graphemes || (index > 0 && asNumber(rows[0]!.order_key) !== page.first)) {
      fail('工作稿分页索引与内容块不一致。');
    }
    total += graphemes;
    blocks += rows.length;
  });
  const counted = db.prepare('SELECT count(*) n FROM working_blocks WHERE branch_id = ?').get(branchId) as SqlRow;
  const state = db.prepare('SELECT total_graphemes FROM branch_working_state WHERE branch_id = ?').get(branchId) as SqlRow | undefined;
  if (asNumber(counted.n) !== blocks || state === undefined || asNumber(state.total_graphemes) !== total) fail('工作稿总量或分页索引校验失败。');
  return total;
}
