import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  HOUSE_PAGE_SIZE, HOUSE_WORD_LIST_SCHEMA, MAX_HOUSE_BYTES, HouseWordListError, houseRequire, houseUtf8Bytes,
  validHousePin, validateHouseEntries, validateInspectHouseWordListInput, validateSaveHouseWordListInput,
  type HouseWordListDocument, type HouseWordListPage, type HouseWordListPin, type HouseWordListVersion,
  type InspectHouseWordListInput, type SaveHouseWordListInput, type SaveHouseWordListResult,
} from '../../shared/protocol/house-word-list.js';
import { canonicalJson, DIGEST_PATTERN, hasExactKeys, isRecord, sha256Hex, UUID_PATTERN } from '../analysis/canonical.js';

/** No schema revision is reserved here. EditorialStore integration is a separately released change. */
export const HOUSE_WORD_LIST_SCHEMA_SQL = { house_word_list_versions: `CREATE TABLE house_word_list_versions (
  version_id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal >= 1),
  previous_version_id TEXT,
  previous_sha256 TEXT,
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(version_id, sha256),
  FOREIGN KEY(previous_version_id, previous_sha256) REFERENCES house_word_list_versions(version_id, sha256),
  CHECK((ordinal = 1 AND previous_version_id IS NULL AND previous_sha256 IS NULL) OR
    (ordinal > 1 AND previous_version_id IS NOT NULL AND previous_sha256 IS NOT NULL))
) STRICT` } as const;
export const HOUSE_WORD_LIST_TRIGGER_SQL = {
  house_word_list_versions_no_update: `CREATE TRIGGER house_word_list_versions_no_update BEFORE UPDATE ON house_word_list_versions
    BEGIN SELECT RAISE(ABORT, 'HOUSE_WORD_LIST_IMMUTABLE'); END`,
  house_word_list_versions_no_delete: `CREATE TRIGGER house_word_list_versions_no_delete BEFORE DELETE ON house_word_list_versions
    BEGIN SELECT RAISE(ABORT, 'HOUSE_WORD_LIST_IMMUTABLE'); END`,
} as const;
export const HOUSE_WORD_LIST_FOREIGN_KEYS = {
  house_word_list_versions: ['previous_version_id>house_word_list_versions.version_id:NO ACTION/NO ACTION/NONE',
    'previous_sha256>house_word_list_versions.sha256:NO ACTION/NO ACTION/NONE'],
} as const;
type Row = Record<string, SQLOutputValue>;
function requireRecord(value: unknown): asserts value { houseRequire(value, 'HOUSE_RECORD_INVALID', '词表历史、结构或摘要损坏；未更改任何词条。'); }
function sqlIdentity(sql: string): string { return sql.replace(/\s+/gu, ' ').trim(); }
function transaction<T>(db: DatabaseSync, run: () => T): T {
  // A savepoint also makes a failed append atomic when called by an existing outer transaction.
  const nested = db.isTransaction;
  db.exec(nested ? 'SAVEPOINT house_word_list_append' : 'BEGIN IMMEDIATE');
  try {
    const result = run(); db.exec(nested ? 'RELEASE house_word_list_append' : 'COMMIT'); return result;
  } catch (error) {
    try {
      db.exec(nested ? 'ROLLBACK TO house_word_list_append' : 'ROLLBACK');
      if (nested) db.exec('RELEASE house_word_list_append');
    } catch (rollbackError) { throw new AggregateError([error, rollbackError], 'House word list rollback failed.'); }
    throw error;
  }
}
export function validateHouseWordListDocument(value: unknown): asserts value is HouseWordListDocument {
  requireRecord(isRecord(value) && hasExactKeys(value, ['schema', 'listId', 'versionId', 'ordinal', 'previous', 'createdAt', 'source', 'entries']));
  requireRecord(value.schema === HOUSE_WORD_LIST_SCHEMA && typeof value.listId === 'string' && UUID_PATTERN.test(value.listId) &&
    typeof value.versionId === 'string' && UUID_PATTERN.test(value.versionId) && Number.isSafeInteger(value.ordinal) && Number(value.ordinal) > 0);
  requireRecord(typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) && new Date(value.createdAt).toISOString() === value.createdAt &&
    isRecord(value.source) && hasExactKeys(value.source, ['kind']) && (value.source.kind === 'editor-entry' || value.source.kind === 'editor-paste'));
  const previous = value.previous;
  requireRecord(value.ordinal === 1 ? previous === null : isRecord(previous) && hasExactKeys(previous, ['versionId', 'digest']) &&
    typeof previous.versionId === 'string' && UUID_PATTERN.test(previous.versionId) && previous.versionId !== value.versionId && typeof previous.digest === 'string' && DIGEST_PATTERN.test(previous.digest));
  validateHouseEntries(value.entries, true);
  requireRecord(houseUtf8Bytes(canonicalJson(value)) <= MAX_HOUSE_BYTES);
}
export function houseWordListPin(document: HouseWordListDocument): HouseWordListPin {
  validateHouseWordListDocument(document);
  return { listId: document.listId, versionId: document.versionId, digest: sha256Hex(canonicalJson(document)) };
}
/** Embedded historical snapshots validate independently of the destination's current House catalog. */
export function validateHouseWordListSnapshot(document: unknown, pin: unknown): asserts document is HouseWordListDocument {
  validateHouseWordListDocument(document);
  requireRecord(validHousePin(pin) && canonicalJson(houseWordListPin(document)) === canonicalJson(pin));
}
function documentOf(row: Row): HouseWordListDocument {
  requireRecord(typeof row.canonical_json === 'string' && row.canonical_json.length <= MAX_HOUSE_BYTES && typeof row.sha256 === 'string');
  let document: unknown;
  try { document = JSON.parse(row.canonical_json); } catch { throw new HouseWordListError('HOUSE_RECORD_INVALID', '词表历史不是有效记录。'); }
  validateHouseWordListDocument(document);
  requireRecord(canonicalJson(document) === row.canonical_json && sha256Hex(row.canonical_json) === row.sha256 &&
    document.versionId === row.version_id && document.listId === row.list_id && document.ordinal === row.ordinal && document.createdAt === row.recorded_at &&
    (document.previous?.versionId ?? null) === row.previous_version_id && (document.previous?.digest ?? null) === row.previous_sha256);
  return document;
}
function metadata(document: HouseWordListDocument): HouseWordListVersion {
  return { pin: houseWordListPin(document), ordinal: document.ordinal, createdAt: document.createdAt, source: document.source,
    previous: document.previous, entryCount: document.entries.length, enabledCount: document.entries.filter((entry) => entry.enabled).length };
}
/** Checks every historical row and both immutable triggers; never repairs a damaged existing relation. */
export function validateHouseWordListStore(db: DatabaseSync): HouseWordListDocument | null {
  for (const [name, sql] of Object.entries({ ...HOUSE_WORD_LIST_SCHEMA_SQL, ...HOUSE_WORD_LIST_TRIGGER_SQL })) {
    const row = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ? AND tbl_name = ?').get(name, 'house_word_list_versions');
    requireRecord(typeof row?.sql === 'string' && sqlIdentity(row.sql) === sqlIdentity(sql));
  }
  const schemaNames = db.prepare("SELECT name FROM sqlite_schema WHERE tbl_name = 'house_word_list_versions' AND type IN ('table', 'trigger')").all();
  requireRecord(schemaNames.length === 3);
  requireRecord(db.prepare('PRAGMA foreign_key_check(house_word_list_versions)').all().length === 0);
  let previous: HouseWordListDocument | null = null;
  const seenEntryIds = new Set<string>();
  for (const row of db.prepare('SELECT * FROM house_word_list_versions ORDER BY ordinal').iterate()) {
    const document = documentOf(row);
    requireRecord(document.ordinal === (previous?.ordinal ?? 0) + 1 && (previous === null ? document.previous === null :
      document.listId === previous.listId && document.previous?.versionId === previous.versionId && document.previous.digest === houseWordListPin(previous).digest));
    // An ID may survive edits/disable, but a removed ID cannot return in a later version.
    if (previous !== null) {
      const previousIds = new Set(previous.entries.map((entry) => entry.entryId));
      for (const entry of document.entries) requireRecord(previousIds.has(entry.entryId) || !seenEntryIds.has(entry.entryId));
    }
    for (const entry of document.entries) seenEntryIds.add(entry.entryId);
    previous = document;
  }
  return previous;
}
/** Disposable-owner tests and, after its release, the normal store initializer use this same DDL. */
export function initializeHouseWordListSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'house_word_list_versions'").get() !== undefined;
  if (existing) { validateHouseWordListStore(db); return; }
  transaction(db, () => {
    db.exec(HOUSE_WORD_LIST_SCHEMA_SQL.house_word_list_versions);
    for (const sql of Object.values(HOUSE_WORD_LIST_TRIGGER_SQL)) db.exec(sql);
    validateHouseWordListStore(db);
  });
}
export class HouseWordLists {
  constructor(private readonly db: DatabaseSync) {}

  inspect(input: InspectHouseWordListInput = { versionId: null, entryOffset: 0, historyOffset: 0 }): HouseWordListPage {
    validateInspectHouseWordListInput(input);
    const current = validateHouseWordListStore(this.db);
    const row = input.versionId === null ? null : this.db.prepare('SELECT * FROM house_word_list_versions WHERE version_id = ?').get(input.versionId);
    houseRequire(input.versionId === null || row !== undefined, 'HOUSE_VERSION_NOT_FOUND', '找不到这个词表版本。');
    const selected = input.versionId === null ? current : row === undefined || row === null ? null : documentOf(row);
    houseRequire(input.entryOffset <= (selected?.entries.length ?? 0), 'HOUSE_PAGE_INVALID', '词条页码已失效。');
    const historyRows = this.db.prepare('SELECT * FROM house_word_list_versions ORDER BY ordinal DESC LIMIT ? OFFSET ?').all(HOUSE_PAGE_SIZE + 1, input.historyOffset);
    const entries = selected?.entries.slice(input.entryOffset, input.entryOffset + HOUSE_PAGE_SIZE) ?? [];
    return { current: current === null ? null : houseWordListPin(current), selected: selected === null ? null : metadata(selected), entries,
      nextEntryOffset: input.entryOffset + entries.length < (selected?.entries.length ?? 0) ? input.entryOffset + entries.length : null,
      history: historyRows.slice(0, HOUSE_PAGE_SIZE).map((item) => metadata(documentOf(item))),
      nextHistoryOffset: historyRows.length > HOUSE_PAGE_SIZE ? input.historyOffset + HOUSE_PAGE_SIZE : null };
  }

  save(input: SaveHouseWordListInput): SaveHouseWordListResult {
    validateSaveHouseWordListInput(input);
    return transaction(this.db, () => {
      const current = validateHouseWordListStore(this.db);
      const currentPin = current === null ? null : houseWordListPin(current);
      const expected = currentPin === null ? null : { versionId: currentPin.versionId, digest: currentPin.digest };
      houseRequire(canonicalJson(input.expectedCurrent) === canonicalJson(expected), 'HOUSE_CURRENT_CHANGED', '词表已有新版本；请保留草稿，重新载入后核对再保存。');
      const ids = new Set(current?.entries.map((entry) => entry.entryId) ?? []);
      for (const entry of input.entries) houseRequire(entry.entryId === null || ids.has(entry.entryId), 'HOUSE_ENTRY_FOREIGN', '词条身份不属于当前版本；移除后重新添加须作为新词条。');
      if (current !== null && canonicalJson(input.entries) === canonicalJson(current.entries)) return { pin: houseWordListPin(current), ordinal: current.ordinal, created: false };
      const document: HouseWordListDocument = { schema: HOUSE_WORD_LIST_SCHEMA, listId: current?.listId ?? randomUUID(), versionId: randomUUID(),
        ordinal: (current?.ordinal ?? 0) + 1, previous: expected, createdAt: new Date().toISOString(), source: { kind: input.sourceKind },
        entries: input.entries.map((entry) => ({ ...entry, entryId: entry.entryId ?? randomUUID() })) };
      validateHouseWordListDocument(document);
      const pin = houseWordListPin(document);
      this.db.prepare('INSERT INTO house_word_list_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(document.versionId, document.listId, document.ordinal,
        document.previous?.versionId ?? null, document.previous?.digest ?? null, document.createdAt, canonicalJson(document), pin.digest);
      validateHouseWordListStore(this.db);
      return { pin, ordinal: document.ordinal, created: true };
    });
  }

  /** Only new preparations require currentness. Prepared/historical snapshots never call this again. */
  selectCurrent(pin: HouseWordListPin): HouseWordListDocument {
    houseRequire(validHousePin(pin), 'HOUSE_PIN_INVALID', '词表版本无效。');
    const current = validateHouseWordListStore(this.db);
    houseRequire(current !== null && canonicalJson(houseWordListPin(current)) === canonicalJson(pin), 'HOUSE_CURRENT_CHANGED', '词表已有新版本，请重新选择。');
    houseRequire(current.entries.some((entry) => entry.enabled), 'HOUSE_NO_ENABLED_ENTRIES', '没有启用词条。');
    return structuredClone(current);
  }
}
