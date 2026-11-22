import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookFindingsReader, forgetBookFindings, type BookFindingsHost } from '../../src/service/book-findings.js';
import { bookFindingsChunk } from '../../src/service/book-findings-wire.js';
import { readBookFindings } from '../../src/main/book-findings.js';
import { encodeServiceResponse } from '../../src/service/request-frames.js';
import { MAX_FRAME_BYTES, type BookFindingProjection, type BookFindingsReadProjection, type InspectBookFindingsInput } from '../../src/shared/protocol.js';

let root: string, db: DatabaseSync, other: DatabaseSync, reader: BookFindingsReader;
let host: BookFindingsHost;
const item = (id: string, category = 'review:typos-and-usage'): BookFindingProjection => ({
  id, category, categoryLabel: '文字', severity: '建议处理', status: '待处理', summary: '合成发现',
  suggestion: { manuscriptId: 'manuscript', branchId: 'branch', blockId: 'block', markId: id, quote: '', replacement: '', batchAllowed: true },
  target: { kind: 'review', reviewRunId: 'run', findingId: id, blockId: 'block' },
});
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai7-findings-reader-'));
  db = new DatabaseSync(join(root, 'cache.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE readings(value INTEGER); INSERT INTO readings VALUES(1)');
  other = new DatabaseSync(join(root, 'cache.sqlite'));
  host = {
    authority: db, evaluationBookTitle: () => '合成图书', latestAnalysisRevision: () => null,
    reviewFindings: vi.fn(() => [item(String(db.prepare('SELECT value FROM readings').get()!.value))]),
    inspectEvaluation: () => ({ record: null }) as ReturnType<BookFindingsHost['inspectEvaluation']>,
  };
  reader = new BookFindingsReader(host);
});
afterEach(() => { reader.clear(); other.close(); db.close(); rmSync(root, { recursive: true, force: true }); });

it('polls without composing or writing, but authority and other-connection writes invalidate it', () => {
  const initial = reader.inspect('book', { whole: true });
  const bytes = () => ['cache.sqlite', 'cache.sqlite-wal'].map((name) => readFileSync(join(root, name)));
  const before = bytes();
  expect(reader.inspect('book', { whole: true, since: initial.version })).toMatchObject({ unchanged: true, items: [], version: initial.version });
  expect(host.reviewFindings).toHaveBeenCalledTimes(1);
  expect(bytes().every((value, index) => value.equals(before[index]!))).toBe(true);
  db.prepare('UPDATE readings SET value = 2').run(); // Deliberately outside a transaction helper.
  const changed = reader.inspect('book', { whole: true, since: initial.version });
  expect(changed.unchanged).toBe(false);
  expect(changed.items[0]!.id).toBe('2');
  other.prepare('UPDATE readings SET value = 3').run(); // Journal/ingest connection semantics.
  const external = reader.inspect('book', { whole: true, since: changed.version });
  expect(external.unchanged).toBe(false);
  expect(external.items[0]!.id).toBe('3');
  expect(new Set([initial.version, changed.version, external.version]).size).toBe(3);
});

it('returns a new token without rows when another Book or the schema changes but the list does not', () => {
  const initial = reader.inspect('book', { whole: true });
  db.prepare('UPDATE readings SET value = value').run();
  const elsewhere = reader.inspect('book', { whole: true, since: initial.version });
  expect(elsewhere).toMatchObject({ unchanged: true, items: [] });
  expect(elsewhere.version).not.toBe(initial.version);
  db.exec('CREATE TABLE schema_probe(value INTEGER)');
  const schema = reader.inspect('book', { whole: true, since: elsewhere.version });
  expect(schema).toMatchObject({ unchanged: true, items: [] });
  expect(schema.version).not.toBe(elsewhere.version);
  expect(host.reviewFindings).toHaveBeenCalledTimes(3);
  const reopened = new BookFindingsReader(host).inspect('book', { whole: true, since: schema.version });
  expect(reopened.unchanged).toBe(false);
  expect(reopened.version).not.toBe(schema.version);
});

it('returns full data after Book/token eviction, import replacement and store cleanup', () => {
  const first = reader.inspect('first', { whole: true });
  for (let index = 0; index < 8; index++) reader.inspect(`book-${index}`);
  expect(reader.inspect('first', { whole: true, since: first.version }).unchanged).toBe(false);
  const page = reader.inspect('first', { offset: 0 });
  for (let index = 1; index <= 8; index++) reader.inspect('first', { offset: index });
  expect(reader.inspect('first', { offset: 0, since: page.version }).unchanged).toBe(false);
  forgetBookFindings(db, 'first');
  expect(reader.inspect('first', { whole: true, since: first.version }).unchanged).toBe(false);
  reader.clear();
  expect(reader.inspect('first', { whole: true, since: first.version }).unchanged).toBe(false);
});

it('binds tokens to filters, counts whole-list choices, and summarizes only matching batch suggestions', () => {
  vi.mocked(host.reviewFindings).mockReturnValue(Array.from({ length: 83 }, (_, i) => item(String(i), i % 2 ? 'review:style-and-format' : 'review:typos-and-usage')));
  const whole = reader.inspect('book', { whole: true });
  expect(whole).toMatchObject({ total: 83, next: null, batch: { count: 83, sentence: '将把所列 83 条修改建议写入稿件。' } });
  expect(whole.items).toHaveLength(83);
  const filtered = reader.inspect('book', { whole: true, since: whole.version, filters: { category: 'review:style-and-format' } });
  expect(filtered).toMatchObject({ unchanged: false, total: 41, batch: { count: 41, sentence: '将把当前筛选下的 41 条修改建议写入稿件。' } });
  expect(filtered.groups).toEqual(whole.groups);
  expect(reader.inspect('book', { whole: true, filters: { severity: '建议处理' } }).batch.count).toBe(83);
  expect(reader.inspect('book', { whole: true, filters: { severity: '高' } }).batch).toEqual({ count: 0, sentence: null });
  const paged = reader.inspect('book', 40);
  expect(paged).toMatchObject({ total: 83, offset: 40, next: 80, pageSize: 40 });
  expect(paged.items).toEqual(whole.items.slice(40, 80));
});

it('forces another composition when an external commit lands during the previous read', () => {
  const original = host.reviewFindings;
  vi.mocked(host.reviewFindings).mockImplementationOnce((bookId) => {
    const items = original(bookId);
    other.prepare('UPDATE readings SET value = 2').run();
    return items;
  });
  const initial = reader.inspect('book', { whole: true });
  expect(initial.items[0]!.id).toBe('1');
  const next = reader.inspect('book', { whole: true, since: initial.version });
  expect(next.unchanged).toBe(false);
  expect(next.items[0]!.id).toBe('2');
});

function frame(input: InspectBookFindingsInput): BookFindingsReadProjection {
  const result = bookFindingsChunk(reader.inspect('book', input), input.whole === true);
  const encoded = encodeServiceResponse({ id: '11111111-1111-4111-8111-111111111111', ok: true, op: 'inspectBookFindings', result });
  expect(encoded.readUInt32BE(0)).toBeLessThan(MAX_FRAME_BYTES);
  const decoded = JSON.parse(encoded.subarray(4).toString('utf8'));
  expect(decoded.ok).toBe(true);
  return decoded.result;
}

it('collects bounded snapshot chunks across a write, then catches that write on the next poll', async () => {
  const rows = Array.from({ length: 1024 }, (_, index) => ({ ...item(String(index)), summary: '合成'.repeat(250) }));
  vi.mocked(host.reviewFindings).mockReturnValue(rows);
  let chunks = 0;
  const answer = await readBookFindings({ whole: true }, async (input) => {
    if (++chunks === 2) {
      vi.mocked(host.reviewFindings).mockReturnValue([...rows, item('next')]);
      other.prepare('UPDATE readings SET value = 2').run();
    }
    return frame(input);
  });
  expect(chunks).toBeGreaterThan(1);
  expect(answer.items.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  expect(answer).toMatchObject({ next: null, offset: 0, total: 1024 });
  expect(host.reviewFindings).toHaveBeenCalledTimes(1);
  const next = await readBookFindings({ whole: true, since: answer.version }, async (input) => frame(input));
  expect(next).toMatchObject({ unchanged: false, total: 1025 });
  expect(next.version).not.toBe(answer.version);
  expect(next.items.at(-1)!.id).toBe('next');
  expect(host.reviewFindings).toHaveBeenCalledTimes(2);
});

it('restarts an evicted snapshot once and returns the complete list', async () => {
  const rows = Array.from({ length: 1024 }, (_, index) => ({ ...item(String(index)), summary: '合成'.repeat(250) }));
  vi.mocked(host.reviewFindings).mockReturnValue(rows);
  let evicted = false;
  const answer = await readBookFindings({ whole: true }, async (input) => {
    if (!evicted && (input.offset ?? 0) > 0) { evicted = true; reader.forget('book'); }
    return frame(input);
  });
  expect(evicted).toBe(true);
  expect(answer.items.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  expect(answer.next).toBeNull();
});

it('returns the snapshot refusal after the one restart, and refuses a superseded filter snapshot', async () => {
  vi.mocked(host.reviewFindings).mockReturnValue(Array.from({ length: 1024 }, (_, index) => ({ ...item(String(index)), summary: '合成'.repeat(250) })));
  const read = vi.fn(async (input: InspectBookFindingsInput) => {
    if ((input.offset ?? 0) > 0) reader.forget('book');
    return frame(input);
  });
  await expect(readBookFindings({ whole: true }, read)).rejects.toMatchObject({ code: 'FINDINGS_VERSION_CHANGED', message: '待办汇总已变化，请重新读取。' });
  expect(read).toHaveBeenCalledTimes(4);
  const first = frame({ whole: true });
  reader.inspect('book', { whole: true, filters: { severity: '高' } });
  expect(() => frame({ whole: true, since: first.version, offset: first.next! })).toThrow('待办汇总已变化，请重新读取。');
});
