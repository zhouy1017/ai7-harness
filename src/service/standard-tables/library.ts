import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { StoreError, requireStore } from '../store-records.js';
import { installPreinstalledStandardTables, PREINSTALLED_TABLE_KEYS, requireStandardTableEntries, standardTableDigest } from '../standard-tables.js';
import { standardsTable, type FlashTaskResult, type StandardRow } from '../fast-role/flash-task-contract.js';
import { standardTableInputs, type StandardTableOperations as Ops, type StandardTableRow as Row, type StandardTableVersion,
  type StandardTablePreview, type StandardTableConversionReport, type StandardTablesProjection, type StandardTableInspection, type StandardTableDiff } from '../../shared/protocol/standard-tables.js';
import { checkedRows, convertTable, counts, holdConflicts, MAX_TABLE_BYTES, rowTuple } from './conversion.js';

export interface StandardTableFormatter { model(): string | null; format(paragraphs: readonly string[]): Promise<FlashTaskResult<StandardRow[]>> }
interface Host {
  db: DatabaseSync; assertAvailable(): void; transaction<T>(operation: () => T): T;
  withObjects<T>(operation: () => Promise<T>): Promise<T>;
  keep(bytes: Uint8Array, digest: string): Promise<string>; objectPath(digest: string, key: string): string;
}
interface Preview { view: StandardTablePreview; rows: Row[]; bytes: Uint8Array; diff: StandardTableDiff | null }
const PAGE = 50;
function page<T>(items: readonly T[], offset: number): T[] {
  const result: T[] = []; let bytes = 0;
  for (const item of items.slice(offset, offset + PAGE)) {
    const size = Buffer.byteLength(JSON.stringify(item));
    if (result.length && bytes + size > 64000) break;
    result.push(item); bytes += size;
  }
  return result;
}
function reportPage(report: StandardTableConversionReport, offset: number): StandardTableConversionReport {
  return { ...report, partsTotal: report.parts.length, parts: page(report.parts, offset) };
}
const VERSION_SELECT = `SELECT version_id versionId, ordinal, version_label versionLabel, source_description sourceDescription, digest,
  source_file_name sourceFileName, source_object_digest sourceObjectDigest, recorded_at recordedAt, entry_count entryCount FROM standard_table_versions`;
const ROW_SELECT = `SELECT position, recommended, discouraged, rank, condition_note AS condition, source, strength, status, review_note reviewNote, source_text sourceText FROM standard_table_entries`;
type DbRow = Omit<Row, 'discouraged'> & { position: number; discouraged: string };
function fromDb(row: DbRow): Row & { position: number } { return { ...row, discouraged: JSON.parse(row.discouraged) }; }
function withoutPosition({ position: _position, ...row }: Row & { position: number }): Row { return row; }
export function standardTableDiff(before: Row[], after: Row[]): StandardTableDiff {
  const removed = new Set(before.map((_, i) => i)); const byForm = new Map<string, number[]>();
  before.forEach((r, i) => { for (const form of [r.recommended, ...r.discouraged]) { const indexes = byForm.get(form) ?? []; indexes.push(i); byForm.set(form, indexes); } });
  const added: Row[] = [], changed: StandardTableDiff['changed'] = [];
  for (const row of after) {
    const candidates = [...new Set([row.recommended, ...row.discouraged].flatMap(f => byForm.get(f) ?? []))].filter(i => removed.has(i));
    const match = candidates.find(i => canonicalJson(before[i]) === canonicalJson(row)) ?? candidates.find(i => before[i]!.recommended === row.recommended) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (match === undefined) added.push(row);
    else { removed.delete(match); if (canonicalJson(before[match]) !== canonicalJson(row)) changed.push({ before: before[match]!, after: row }); }
  }
  const removedRows = [...removed].map(i => before[i]!);
  return { added, removed: removedRows, changed, counts: { added: added.length, removed: removedRows.length, changed: changed.length } };
}
export function formattingParts(paragraphs: string[]): string[][] {
  const parts: string[][] = []; let part: string[] = [];
  for (const paragraph of paragraphs) {
    // Small parts bound the answer as well as the request. Split long paragraphs at code point boundaries.
    const chars = Array.from(paragraph);
    for (let i = 0; i < chars.length; i += 2000) {
      const text = chars.slice(i, i + 2000).join('');
      if (part.length >= 80 || Buffer.byteLength(standardsTable.message([...part, text])) > 16000) { parts.push(part); part = []; }
      part.push(text);
    }
  }
  if (part.length) parts.push(part);
  return parts;
}
export class StandardTableLibrary {
  #formatter: StandardTableFormatter | null = null;
  #offers = new Set<string>();
  #previews = new Map<string, Preview>();
  constructor(private readonly host: Host) {}
  useFormatter(formatter: StandardTableFormatter): void { this.#formatter = formatter; this.#offers.clear(); }
  #input<K extends keyof Ops>(op: K, input: unknown): Ops[K]['input'] {
    this.host.assertAvailable(); const result = standardTableInputs[op].safeParse(input);
    requireStore(result.success, 'STANDARD_TABLE_INPUT_INVALID', '字表操作的内容无效，请核对后重试。'); return result.data as Ops[K]['input'];
  }
  #version(tableId: string, versionId?: string): StandardTableVersion {
    const version = this.host.db.prepare(`${VERSION_SELECT} WHERE table_id = ? AND version_id = COALESCE(?, (SELECT current_version_id FROM standard_tables WHERE table_id = ?))`)
      .get(tableId, versionId ?? null, tableId) as unknown as StandardTableVersion | undefined;
    requireStore(version, 'STANDARD_TABLE_NOT_FOUND', '这份字表或版本已删除，请刷新列表。'); return version;
  }
  #rows(versionId: string): Row[] { return (this.host.db.prepare(`${ROW_SELECT} WHERE version_id = ? ORDER BY position`).all(versionId) as unknown as DbRow[]).map(r => withoutPosition(fromDb(r))); }
  inspectStandardTables(input: Ops['inspectStandardTables']['input'] = {}): StandardTablesProjection {
    this.#input('inspectStandardTables', input);
    const tables = this.host.db.prepare(`SELECT t.table_id tableId, t.name, t.kind, t.origin, t.preinstalled_key preinstalledKey, t.enabled,
      t.current_version_id currentVersionId, v.version_label versionLabel, v.source_description sourceDescription, v.source_file_name sourceFileName, v.recorded_at recordedAt
      FROM standard_tables t JOIN standard_table_versions v ON v.version_id = t.current_version_id ORDER BY t.created_at DESC, t.table_id`).all();
    const recent = this.host.db.prepare(`SELECT canonical_json FROM review_runs WHERE json_type(canonical_json, '$.localPlan') IS NOT NULL ORDER BY rowid DESC LIMIT 20`).all();
    return { tables: tables.map(t => {
      const count = this.host.db.prepare(`SELECT coalesce(sum(status = 'applied'), 0) applied, coalesce(sum(status = 'to-confirm'), 0) toConfirm,
        coalesce(sum(status = 'unrecognized'), 0) unrecognized FROM standard_table_entries WHERE version_id = ?`).get(t.currentVersionId!)!;
      return { ...t, enabled: Boolean(t.enabled), counts: count, recentChecksCount: recent.filter(r => {
        const plan = JSON.parse(String(r.canonical_json)).localPlan;
        return plan?.standardTables?.some((pin: { tableId: string }) => pin.tableId === t.tableId);
      }).length } as unknown as StandardTablesProjection['tables'][number];
    }), missingPreinstalledKeys: PREINSTALLED_TABLE_KEYS.filter(key => !tables.some(t => t.preinstalledKey === key)) };
  }
  async inspectStandardTable(raw: Ops['inspectStandardTable']['input']): Promise<StandardTableInspection> {
    const input = this.#input('inspectStandardTable', raw), selected = this.#version(input.tableId, input.versionId);
    const table = this.inspectStandardTables().tables.find(t => t.tableId === input.tableId)!;
    const offset = input.offset ?? 0, query = input.query ?? '';
    const where = `version_id = ? AND (? = '' OR instr(recommended, ?) OR instr(discouraged, ?) OR instr(coalesce(condition_note, ''), ?) OR instr(coalesce(source, ''), ?))`;
    const args = [selected.versionId, query, query, query, query, query];
    const entries = page((this.host.db.prepare(`${ROW_SELECT} WHERE ${where} ORDER BY position LIMIT ? OFFSET ?`).all(...args, PAGE, offset) as unknown as DbRow[]).map(fromDb), 0);
    const report = this.host.db.prepare('SELECT conversion_report report FROM standard_table_versions WHERE version_id = ?').get(selected.versionId)!.report;
    let sourceContent: StandardTableInspection['sourceContent'] = null;
    if (selected.sourceObjectDigest && selected.sourceFileName) {
      const object = this.host.db.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').get(selected.sourceObjectDigest)!;
      let text = '';
      if (input.sourceOffset !== undefined) {
        const original = await readFile(this.host.objectPath(selected.sourceObjectDigest, String(object.relative_key)));
        text = (await convertTable(original, selected.sourceFileName, 'house')).paragraphs.join('\n');
      }
      sourceContent = { fileName: selected.sourceFileName, digest: selected.sourceObjectDigest, byteLength: Number(object.byte_length),
        offset: input.sourceOffset ?? 0, total: text.length, text: text.slice(input.sourceOffset ?? 0, (input.sourceOffset ?? 0) + 16000) };
    }
    return { table, selected, entries, offset, total: Number(this.host.db.prepare(`SELECT count(*) n FROM standard_table_entries WHERE ${where}`).get(...args)!.n),
      versions: this.host.db.prepare(`${VERSION_SELECT} WHERE table_id = ? ORDER BY ordinal DESC LIMIT 50 OFFSET ?`).all(input.tableId, input.versionsOffset ?? 0) as unknown as StandardTableVersion[],
      versionsTotal: Number(this.host.db.prepare('SELECT count(*) n FROM standard_table_versions WHERE table_id = ?').get(input.tableId)!.n),
      conversionReport: report ? reportPage(JSON.parse(String(report)), input.reportOffset ?? 0) : null, sourceContent };
  }
  #page(preview: Preview, offset = 0): StandardTablePreview {
    const diff = preview.diff;
    return { ...preview.view, offset, conversionReport: reportPage(preview.view.conversionReport, offset), entries: page(preview.rows, offset).map((r, i) => ({ ...r, position: offset + i + 1 })),
      diff: diff ? { ...diff, added: page(diff.added, offset), removed: page(diff.removed, offset), changed: page(diff.changed, offset) } : null };
  }
  async previewStandardTableImport(raw: Ops['previewStandardTableImport']['input']): Promise<StandardTablePreview> {
    const input = this.#input('previewStandardTableImport', raw);
    if (input.previewId) { const preview = this.#previews.get(input.previewId); requireStore(preview, 'STANDARD_TABLE_PREVIEW_EXPIRED', '预览已结束，请重新选择文件。'); return this.#page(preview, input.offset); }
    requireStore([input.path, input.text, input.bytesBase64].filter(v => v !== undefined).length === 1, 'STANDARD_TABLE_INPUT_INVALID', '请选择一个文件或输入一份字表文字。');
    if (input.path) requireStore(isAbsolute(input.path) && (await stat(input.path)).size <= MAX_TABLE_BYTES, 'STANDARD_TABLE_TOO_LARGE', '请选择不超过16 MB的文件。');
    const bytes = input.path ? await readFile(input.path) : input.text !== undefined ? Buffer.from(input.text) : Buffer.from(input.bytesBase64!, 'base64');
    const fileName = basename(input.fileName ?? input.path ?? '字表.txt');
    const current = input.tableId ? this.#version(input.tableId) : null;
    const table = input.tableId ? this.inspectStandardTables().tables.find(t => t.tableId === input.tableId)! : null;
    let read; try { read = await convertTable(bytes, fileName, input.strength ?? 'house'); }
    catch (error) { if (error instanceof StoreError) throw error; throw new StoreError('STANDARD_TABLE_FILE_UNREADABLE', '文件未能读取，请检查格式或另存为文字表格后重试。'); }
    const report: StandardTableConversionReport = { method: 'direct', model: null, counts: counts([]), parts: [] };
    let rows = read.rows;
    if (rows === null) {
      const model = this.#formatter?.model(); requireStore(model && this.#formatter, 'STANDARD_TABLE_FORMAT_UNAVAILABLE', '请先在模型服务中选择可用的底层 Flash 模型，再整理这份文件。');
      const parts = formattingParts(read.paragraphs), digest = sha256Hex(canonicalJson({ digest: sha256Hex(bytes), fileName, tableId: input.tableId ?? null, model }));
      if (!input.formatConfirmed) {
        if (this.#offers.size >= 8) this.#offers.clear(); this.#offers.add(digest);
        const size = parts.reduce((n, part) => n + Buffer.byteLength(standardsTable.message(part)), 0);
        throw new StoreError('STANDARD_TABLE_FORMAT_OFFER', `将把选定文件的 ${read.paragraphs.length} 段文字（${size} 字节）发送给底层 Flash（${model}）整理字表与词表。预计 ${parts.length} 次请求；回答无效的部分最多再试一次，最多 ${parts.length * 2} 次。结果可逐条核对后导入。`);
      }
      requireStore(this.#offers.delete(digest), 'STANDARD_TABLE_CHANGED', '文件或所选模型已变化，请重新预览并确认。');
      report.method = 'model'; report.model = model; rows = []; let paragraph = 1;
      for (const [index, part] of parts.entries()) {
        let result = await this.#formatter.format(part), attempts = 1;
        if (result.state === 'fallback') { result = await this.#formatter.format(part); attempts++; }
        report.parts.push({ part: index + 1, firstParagraph: paragraph, paragraphs: part.length, attempts, state: result.state, reason: result.state === 'checked' ? null : result.reason });
        if (result.state === 'checked') rows.push(...result.value.map(r => ({ recommended: r.recommended, discouraged: r.discouraged, rank: null, condition: null,
          source: `第${paragraph + r.paragraph - 1}段`, strength: input.strength ?? 'house', status: r.status === '未识别' ? 'unrecognized' as const : 'to-confirm' as const,
          reviewNote: r.reason, sourceText: part[r.paragraph - 1] ?? null })));
        paragraph += part.length;
      }
    }
    rows = holdConflicts(checkedRows(rows)); report.counts = counts(rows);
    const previewId = randomUUID();
    const view: StandardTablePreview = { previewId, tableId: input.tableId ?? null, expectedVersionId: current?.versionId ?? null,
      name: input.name ?? read.name ?? table?.name ?? basename(fileName, extname(fileName)), kind: input.kind ?? read.kind ?? table?.kind ?? 'word-forms',
      versionLabel: input.versionLabel ?? read.versionLabel ?? String((current?.ordinal ?? 0) + 1), sourceDescription: input.sourceDescription ?? read.sourceDescription ?? fileName,
      proposedStrength: input.strength ?? rows[0]?.strength ?? 'house', sourceFileName: fileName, entries: [], total: rows.length, offset: 0, conversionReport: report, diff: null };
    const preview = { view, rows, bytes, diff: current ? standardTableDiff(this.#rows(current.versionId), rows) : null };
    if (this.#previews.size >= 8) this.#previews.delete(this.#previews.keys().next().value!); this.#previews.set(previewId, preview);
    return this.#page(preview);
  }
  #edit(rows: Row[], input: Ops['saveStandardTable']['input']): Row[] {
    requireStore(!(input.entries && input.edits), 'STANDARD_TABLE_INPUT_INVALID', '请使用整表保存或逐行修改中的一种方式。');
    // The table-wide choice supplies a default; explicit row edits may choose a different strength.
    let changed = (input.entries ?? rows).map(r => input.strength ? { ...r, strength: input.strength } : r);
    if (input.edits) {
      const edits = new Map<number, Row | null>(); const appended: Row[] = [];
      for (const edit of input.edits) {
        if (edit.position === null) { requireStore(edit.row, 'STANDARD_TABLE_INPUT_INVALID', '新增条目不能为空。'); appended.push(edit.row); }
        else { requireStore(edit.position <= changed.length && !edits.has(edit.position), 'STANDARD_TABLE_CHANGED', '条目位置已变化，请刷新后再保存。'); edits.set(edit.position, edit.row); }
      }
      changed = [...changed.flatMap((r, i) => edits.has(i + 1) ? edits.get(i + 1) ? [edits.get(i + 1)!] : [] : [r]), ...appended];
    }
    return checkedRows(changed);
  }
  #write(input: Ops['saveStandardTable']['input'], rows: Row[], source: { fileName: string; digest: string } | null, report: StandardTableConversionReport): string {
    const current = input.tableId ? this.#version(input.tableId) : null;
    requireStore(!current || current.versionId === input.expectedVersionId, 'STANDARD_TABLE_CHANGED', '字表已有新版本，请刷新后再保存。');
    const previous = input.tableId ? this.inspectStandardTables().tables.find(t => t.tableId === input.tableId)! : null;
    const tableId = input.tableId ?? randomUUID(), versionId = randomUUID(), now = new Date().toISOString(), kind = input.kind ?? previous?.kind ?? 'word-forms';
    requireStore(!previous || kind === previous.kind, 'STANDARD_TABLE_KIND_CHANGED', '已有字表的种类不能改变，请另建一份字表。');
    const name = input.name ?? previous?.name ?? '新建字表或词表';
    const retained = source ?? (current?.sourceObjectDigest ? { fileName: current.sourceFileName!, digest: current.sourceObjectDigest } : null);
    if (!current) this.host.db.prepare('INSERT INTO standard_tables VALUES (?, ?, ?, ?, NULL, 1, ?, ?)').run(tableId, kind, name, 'imported', versionId, now);
    this.host.db.prepare('INSERT INTO standard_table_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(versionId, tableId, (current?.ordinal ?? 0) + 1,
      input.versionLabel ?? String((current?.ordinal ?? 0) + 1), input.sourceDescription ?? current?.sourceDescription ?? '本社自建', standardTableDigest(kind, rows.map(rowTuple)),
      current?.digest ?? null, rows.length, JSON.stringify({ ...report, counts: counts(rows) }), retained?.fileName ?? null, retained?.digest ?? null, now);
    const insert = this.host.db.prepare('INSERT INTO standard_table_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    rows.forEach((r, i) => insert.run(versionId, i + 1, r.recommended, JSON.stringify(r.discouraged), r.rank, r.condition, r.source, r.strength, r.status, r.reviewNote, r.sourceText));
    this.host.db.prepare('UPDATE standard_tables SET name = ?, current_version_id = ? WHERE table_id = ?').run(name, versionId, tableId);
    requireStandardTableEntries(this.host.db); return tableId;
  }
  async commitStandardTableImport(raw: Ops['commitStandardTableImport']['input']): Promise<StandardTableInspection> {
    const input = this.#input('commitStandardTableImport', raw), preview = this.#previews.get(input.previewId);
    requireStore(preview, 'STANDARD_TABLE_PREVIEW_EXPIRED', '预览已结束，请重新选择文件。');
    const rows = holdConflicts(this.#edit(preview.rows, input));
    return this.host.withObjects(async () => {
      if (preview.view.tableId) requireStore(this.#version(preview.view.tableId).versionId === preview.view.expectedVersionId,
        'STANDARD_TABLE_CHANGED', '字表已有新版本，请刷新后再保存。');
      const existed = this.host.db.prepare('SELECT 1 FROM content_objects WHERE object_digest = ?').get(sha256Hex(preview.bytes));
      const digest = sha256Hex(preview.bytes), key = await this.host.keep(preview.bytes, digest), view = preview.view;
      let tableId: string;
      try { tableId = this.host.transaction(() => {
          this.host.db.prepare('INSERT INTO content_objects VALUES (?, ?, ?, ?) ON CONFLICT(object_digest) DO NOTHING').run(digest, key, preview.bytes.length, new Date().toISOString());
          return this.#write({ ...view, ...input, tableId: view.tableId ?? undefined, expectedVersionId: view.expectedVersionId ?? undefined }, rows, { digest, fileName: view.sourceFileName }, view.conversionReport);
        });
      } catch (error) { if (!existed && !this.host.db.prepare('SELECT 1 FROM content_objects WHERE object_digest = ?').get(digest)) unlinkSync(this.host.objectPath(digest, key)); throw error; }
      this.#previews.delete(input.previewId); return this.inspectStandardTable({ tableId });
    });
  }
  async saveStandardTable(raw: Ops['saveStandardTable']['input']): Promise<StandardTableInspection> {
    const input = this.#input('saveStandardTable', raw);
    const rows = this.#edit(input.tableId ? this.#rows(this.#version(input.tableId).versionId) : [], input);
    const tableId = this.host.transaction(() => this.#write(input, rows, null, { method: 'editor', model: null, counts: counts(rows), parts: [] }));
    return this.inspectStandardTable({ tableId });
  }
  setStandardTableEnabled(raw: Ops['setStandardTableEnabled']['input']): StandardTablesProjection {
    const input = this.#input('setStandardTableEnabled', raw); this.#version(input.tableId);
    this.host.transaction(() => { this.host.db.prepare('UPDATE standard_tables SET enabled = ? WHERE table_id = ?').run(Number(input.enabled), input.tableId); requireStandardTableEntries(this.host.db); });
    return this.inspectStandardTables();
  }
  async deleteStandardTable(raw: Ops['deleteStandardTable']['input']): Promise<StandardTablesProjection> {
    const input = this.#input('deleteStandardTable', raw);
    return this.host.withObjects(async () => {
      this.#version(input.tableId); const removed: { path: string; bytes: Uint8Array }[] = [];
      try { this.host.transaction(() => {
        const objects = this.host.db.prepare(`SELECT DISTINCT co.* FROM content_objects co JOIN standard_table_versions v ON v.source_object_digest = co.object_digest WHERE v.table_id = ?`).all(input.tableId);
        this.host.db.prepare('DELETE FROM standard_table_entries WHERE version_id IN (SELECT version_id FROM standard_table_versions WHERE table_id = ?)').run(input.tableId);
        this.host.db.prepare('DELETE FROM standard_table_versions WHERE table_id = ?').run(input.tableId);
        this.host.db.prepare('DELETE FROM standard_tables WHERE table_id = ?').run(input.tableId);
        for (const object of objects) {
          const digest = String(object.object_digest);
          const referenced = this.host.db.prepare(`SELECT 1 FROM standard_table_versions WHERE source_object_digest = ? UNION ALL SELECT 1 FROM source_versions WHERE object_digest = ? OR working_object_digest = ?
            UNION ALL SELECT 1 FROM import_drafts WHERE object_digest = ? OR working_object_digest = ? UNION ALL SELECT 1 FROM word_revision_sources WHERE object_digest = ?
            UNION ALL SELECT 1 FROM import_abandonment_cleanup_intents WHERE object_digest = ? LIMIT 1`).get(digest, digest, digest, digest, digest, digest, digest);
          if (referenced) continue;
          const path = this.host.objectPath(digest, String(object.relative_key)); removed.push({ path, bytes: readFileSync(path) }); unlinkSync(path);
          this.host.db.prepare('DELETE FROM content_objects WHERE object_digest = ?').run(digest);
        }
        requireStandardTableEntries(this.host.db);
      }); } catch (error) { for (const object of removed) writeFileSync(object.path, object.bytes); throw error; }
      return this.inspectStandardTables();
    });
  }
  restorePreinstalledStandardTables(raw: Ops['restorePreinstalledStandardTables']['input']): StandardTablesProjection {
    const input = this.#input('restorePreinstalledStandardTables', raw); this.host.transaction(() => installPreinstalledStandardTables(this.host.db, input.keys));
    return this.inspectStandardTables();
  }
}
