import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  BOOK_PEOPLE_NAME_SEPARATOR,
  MAX_BOOK_AUTHORS,
  MAX_BOOK_EDITORS,
  MAX_BOOK_PERSON_NAME_CHARACTERS,
  MAX_BOOK_RELATED_PEOPLE,
  MAX_BOOK_SUMMARY_FILTER_CHARACTERS,
  publicationText,
  type BookPeopleProjection,
  type BookPeopleResultProjection,
  type BookSummaryFilter,
  type BookSummaryProjection,
  type UpdateBookPeopleInput,
} from '../shared/protocol.js';
import { UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, sha256Hex } from './analysis/canonical.js';

/**
 * 作者 · 责编 · 相关人 of a Book (Issue #431, plan slice S83; V2-UX-BOOK-006, FDBK-013). Authors and editors may be several
 * people; a 相关人 takes a role from the house's list and a name. They are attribution dimensions — later learning and
 * feedback records name them — never accounts or permissions. Each save appends the Book's next version of the whole set,
 * pinned to the role list it was made under; the newest version is the Book's people, and nothing earlier is rewritten.
 *
 * Schema revision 44 owns one relation, a ledger like the others: a row is appended once and never rewritten or removed.
 */

/** The house's 相关人 roles as configuration (BOOK-006): each version pins this list's version and digest. */
export const BUILTIN_BOOK_PEOPLE_ROLES = Object.freeze({
  schema: 'ai7.book-people-roles/1' as const,
  version: '1',
  roles: Object.freeze([
    Object.freeze({ roleId: 'proofreader', label: '校对' }),
    Object.freeze({ roleId: 'designer', label: '美编' }),
    Object.freeze({ roleId: 'translator', label: '译者' }),
    Object.freeze({ roleId: 'external-reviewer', label: '外审专家' }),
    Object.freeze({ roleId: 'agent', label: '作者经纪' }),
    Object.freeze({ roleId: 'marketing', label: '营销' }),
    Object.freeze({ roleId: 'other', label: '其他' }),
  ]),
});
export const BUILTIN_BOOK_PEOPLE_ROLES_DIGEST = sha256Hex(canonicalJson(BUILTIN_BOOK_PEOPLE_ROLES));

/** One 相关人 role list a release shipped, as a version pins it. */
export interface BookPeopleRoleList {
  readonly schema: 'ai7.book-people-roles/1';
  readonly version: string;
  readonly roles: ReadonlyArray<{ readonly roleId: string; readonly label: string }>;
}

/**
 * Every role list a release has shipped, oldest first; the last is the one a save pins now. A version is read under the
 * list it was saved under (Issue #431 review), so a later list — a role added, a label changed — never makes an earlier
 * version unreadable. A list is never removed from here once shipped; a version pinned to a list this build never shipped
 * (a store a newer build wrote) still reads, its roles named by their ids.
 */
export const BOOK_PEOPLE_ROLE_LISTS: BookPeopleRoleList[] = [BUILTIN_BOOK_PEOPLE_ROLES];

/** The list a save pins now, and its digest. */
function currentRoleList(): { list: BookPeopleRoleList; pin: { version: string; digest: string } } {
  const list = BOOK_PEOPLE_ROLE_LISTS.at(-1)!;
  return { list, pin: { version: list.version, digest: sha256Hex(canonicalJson(list)) } };
}

/** The shipped list a version pinned, by its version and digest; `undefined` for one this build does not know. */
function roleListOf(pin: { version: string; digest: string }): BookPeopleRoleList | undefined {
  return BOOK_PEOPLE_ROLE_LISTS.find((list) => list.version === pin.version && sha256Hex(canonicalJson(list)) === pin.digest);
}

export const BOOK_PEOPLE_SCHEMA_SQL = {
  book_people_versions: `CREATE TABLE book_people_versions (
  version_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  role_configuration_version TEXT NOT NULL CHECK(length(role_configuration_version) BETWEEN 1 AND 16),
  role_configuration_digest TEXT NOT NULL CHECK(length(role_configuration_digest) = 64),
  authors_text TEXT NOT NULL,
  editors_text TEXT NOT NULL,
  related_json TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(book_id, version)
) STRICT`,
} as const;

export const BOOK_PEOPLE_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(BOOK_PEOPLE_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BOOK_PEOPLE_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'BOOK_PEOPLE_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const BOOK_PEOPLE_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  book_people_versions: ['book_id>books.book_id:NO ACTION/NO ACTION/NONE'],
};

export class BookPeopleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BookPeopleError';
  }
}

function requirePeople(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new BookPeopleError(code, message);
}

type SqlRow = Record<string, SQLOutputValue>;

const RECORD_SCHEMA = 'ai7.book-people/1';
const ACTOR = '本机编辑';
const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'book_people_versions'";
/** A name never holds a separator, a list comma or a line break: each field is read back as its names. */
const NAME_FORBIDDEN = /[、,，;；\r\n]/u;

/** Revision 44's relation, created once: a store that predates it gains one empty relation and nothing existing moves. */
export function initializeBookPeopleSchema(db: DatabaseSync): void {
  if (db.prepare(TABLE_PRESENT).get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(BOOK_PEOPLE_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(BOOK_PEOPLE_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Book people schema rollback failed.');
    }
    throw error;
  }
  requirePeople(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_INVALID', '图书人员记录与已有记录不一致。');
}

interface PeopleSet {
  authors: string[];
  editors: string[];
  related: Array<{ roleId: string; name: string }>;
}

const roleLabel = (list: BookPeopleRoleList | null, roleId: string): string | undefined => list?.roles.find((role) => role.roleId === roleId)?.label;

function peopleRecord(
  versionId: string,
  bookId: string,
  version: number,
  roles: { version: string; digest: string },
  people: PeopleSet,
  recordedAt: string,
  prior: string | null,
) {
  return canonicalRecord({
    schema: RECORD_SCHEMA,
    versionId,
    bookId,
    version,
    roles: { version: roles.version, digest: roles.digest },
    authors: people.authors,
    editors: people.editors,
    related: people.related,
    actor: ACTOR,
    recordedAt,
    prior,
  });
}

/** One name as the editor typed it, NFC and trimmed; `null` when it cannot be recorded. */
function nameOf(value: unknown): string | null {
  const name = publicationText(value, MAX_BOOK_PERSON_NAME_CHARACTERS);
  return name === null || NAME_FORBIDDEN.test(name) ? null : name;
}

function names(values: unknown, limit: number, field: string): string[] {
  requirePeople(Array.isArray(values) && values.length <= limit, 'BOOK_PEOPLE_INVALID', `${field}最多 ${limit} 人。`);
  const read = values.map((value) => nameOf(value));
  requirePeople(read.every((name) => name !== null), 'BOOK_PEOPLE_NAME_INVALID',
    `${field}的每个名字 1–${MAX_BOOK_PERSON_NAME_CHARACTERS} 个字，不含「${BOOK_PEOPLE_NAME_SEPARATOR}」、逗号或换行。`);
  requirePeople(new Set(read).size === read.length, 'BOOK_PEOPLE_DUPLICATE', `${field}中有重复的名字。`);
  return read as string[];
}

export class BookPeople {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * The Book's people as its newest version records them, each 相关人 named in the role list that version pinned; none yet
   * is version 0 with nothing listed. The roles offered are the list a save pins now.
   */
  current(bookId: string): BookPeopleProjection {
    const latest = this.#latest(bookId);
    return {
      version: latest?.version ?? 0,
      authors: latest?.people.authors ?? [],
      editors: latest?.people.editors ?? [],
      related: (latest?.people.related ?? []).map((person) => ({
        roleId: person.roleId, roleLabel: roleLabel(latest!.roles, person.roleId) ?? person.roleId, name: person.name,
      })),
      roles: currentRoleList().list.roles.map((role) => ({ roleId: role.roleId, label: role.label })),
      recordedAt: latest?.recordedAt ?? null,
    };
  }

  /** The card's lines in 书库. */
  summary(bookId: string): BookSummaryProjection['people'] {
    const people = this.current(bookId);
    return { authors: people.authors, editors: people.editors, related: people.related.map((person) => ({ roleLabel: person.roleLabel, name: person.name })) };
  }

  /**
   * `保存人员`: the whole set, against the version the editor read. The same set as the newest version records nothing and
   * says so; any other appends the next version. The caller holds the transaction.
   */
  update(input: UpdateBookPeopleInput): BookPeopleResultProjection {
    requirePeople(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
      typeof input.expectedVersion === 'number' && Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 0,
    'BOOK_PEOPLE_INVALID', '人员请求无效。');
    requirePeople(this.#db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(input.bookId) !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
    const people: PeopleSet = {
      authors: names(input.authors, MAX_BOOK_AUTHORS, '作者'),
      editors: names(input.editors, MAX_BOOK_EDITORS, '责编'),
      related: [],
    };
    requirePeople(Array.isArray(input.related) && input.related.length <= MAX_BOOK_RELATED_PEOPLE, 'BOOK_PEOPLE_INVALID',
      `相关人最多 ${MAX_BOOK_RELATED_PEOPLE} 人。`);
    const roles = currentRoleList();
    for (const entry of input.related) {
      requirePeople(isRecord(entry) && typeof entry.roleId === 'string' && roleLabel(roles.list, entry.roleId) !== undefined, 'BOOK_PEOPLE_ROLE_INVALID',
        '相关人的角色不在本社的角色清单中。');
      const name = nameOf(entry.name);
      requirePeople(name !== null, 'BOOK_PEOPLE_NAME_INVALID',
        `相关人的名字 1–${MAX_BOOK_PERSON_NAME_CHARACTERS} 个字，不含「${BOOK_PEOPLE_NAME_SEPARATOR}」、逗号或换行。`);
      requirePeople(!people.related.some((person) => person.roleId === entry.roleId && person.name === name), 'BOOK_PEOPLE_DUPLICATE',
        '同一角色下有重复的相关人。');
      people.related.push({ roleId: entry.roleId, name });
    }
    const latest = this.#latest(input.bookId);
    requirePeople((latest?.version ?? 0) === input.expectedVersion, 'BOOK_PEOPLE_CHANGED', '这本书的人员在查看后有了新的记录，请看过再保存。');
    // The same set as the newest version, or no one at all before any version, records nothing.
    if (canonicalJson(latest?.people ?? { authors: [], editors: [], related: [] }) === canonicalJson(people)) {
      return { bookId: input.bookId, outcome: 'unchanged', completionLabel: '人员没有变化', people: this.current(input.bookId) };
    }
    const versionId = randomUUID();
    const version = (latest?.version ?? 0) + 1;
    const recordedAt = new Date().toISOString();
    const record = peopleRecord(versionId, input.bookId, version, roles.pin, people, recordedAt, latest?.digest ?? null);
    this.#db.prepare(
      `INSERT INTO book_people_versions(
         version_id, book_id, version, role_configuration_version, role_configuration_digest, authors_text, editors_text, related_json,
         actor, recorded_at, canonical_json, sha256
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '本机编辑', ?, ?, ?)`,
    ).run(versionId, input.bookId, version, roles.pin.version, roles.pin.digest,
      people.authors.join('\n'), people.editors.join('\n'), canonicalJson(people.related), recordedAt, record.json, record.digest);
    return { bookId: input.bookId, outcome: 'recorded', completionLabel: '人员已保存', people: this.current(input.bookId) };
  }

  /**
   * 书库's search (BOOK-006, IA-008): the SQL that keeps a Book whose 书名, 作者 or 责编 hold the words, over the Book's
   * newest people version, and its parameters. `null` for a filter that holds no words.
   */
  filter(filter: BookSummaryFilter): { where: string; parameters: string[] } {
    requirePeople(isRecord(filter) && (filter.field === 'all' || filter.field === 'title' || filter.field === 'author' || filter.field === 'editor'),
      'BOOK_SUMMARY_FILTER_INVALID', '图书查找条件无效。');
    const text = publicationText(filter.text, MAX_BOOK_SUMMARY_FILTER_CHARACTERS);
    // A Book's names are held one to a line, so words across a line break would find two names as one.
    requirePeople(text !== null && !/[\r\n]/u.test(text), 'BOOK_SUMMARY_FILTER_INVALID', `查找的字词 1–${MAX_BOOK_SUMMARY_FILTER_CHARACTERS} 个字，不含换行。`);
    const newest = (column: 'authors_text' | 'editors_text'): string =>
      `EXISTS (SELECT 1 FROM book_people_versions p WHERE p.book_id = b.book_id AND p.version = (
         SELECT max(q.version) FROM book_people_versions q WHERE q.book_id = b.book_id) AND instr(lower(p.${column}), lower(?)) > 0)`;
    const title = 'instr(lower(b.title), lower(?)) > 0';
    if (filter.field === 'title') return { where: title, parameters: [text] };
    if (filter.field === 'author') return { where: newest('authors_text'), parameters: [text] };
    if (filter.field === 'editor') return { where: newest('editors_text'), parameters: [text] };
    return { where: `(${title} OR ${newest('authors_text')} OR ${newest('editors_text')})`, parameters: [text, text, text] };
  }

  /**
   * The Book's newest version, each version's record verified against its digest, its columns and the role list it pinned
   * — whichever shipped list that was, never only today's.
   */
  #latest(bookId: string): { version: number; people: PeopleSet; roles: BookPeopleRoleList | null; recordedAt: string; digest: string } | undefined {
    if (this.#db.prepare(TABLE_PRESENT).get() === undefined) return undefined;
    const rows = this.#db.prepare('SELECT * FROM book_people_versions WHERE book_id = ? ORDER BY version').iterate(bookId);
    let version = 0;
    let prior: string | null = null;
    let latest: { version: number; people: PeopleSet; roles: BookPeopleRoleList | null; recordedAt: string; digest: string } | undefined;
    for (const row of rows) {
      version += 1;
      requirePeople(typeof row.version_id === 'string' && typeof row.version === 'number' && row.version === version &&
        typeof row.recorded_at === 'string' && typeof row.canonical_json === 'string' && typeof row.sha256 === 'string' &&
        typeof row.authors_text === 'string' && typeof row.editors_text === 'string' && typeof row.related_json === 'string' &&
        typeof row.role_configuration_version === 'string' && typeof row.role_configuration_digest === 'string',
      'BOOK_PEOPLE_RECORD_INVALID', '图书人员记录无效。');
      const pin = { version: row.role_configuration_version, digest: row.role_configuration_digest };
      const roles = roleListOf(pin) ?? null;
      let parsed: unknown;
      try { parsed = JSON.parse(row.canonical_json); } catch { parsed = null; }
      requirePeople(isRecord(parsed) && Array.isArray(parsed.authors) && Array.isArray(parsed.editors) && Array.isArray(parsed.related),
        'BOOK_PEOPLE_RECORD_INVALID', '图书人员记录无效。');
      const people: PeopleSet = {
        authors: parsed.authors as string[],
        editors: parsed.editors as string[],
        related: parsed.related as Array<{ roleId: string; name: string }>,
      };
      const expected = peopleRecord(row.version_id, bookId, row.version, pin, people, row.recorded_at, prior);
      requirePeople(expected.json === row.canonical_json && expected.digest === row.sha256 && sha256Hex(row.canonical_json) === row.sha256 &&
        row.authors_text === people.authors.join('\n') && row.editors_text === people.editors.join('\n') &&
        row.related_json === canonicalJson(people.related) && (roles === null || people.related.every((person) => roleLabel(roles, person.roleId) !== undefined)),
      'BOOK_PEOPLE_RECORD_INVALID', '图书人员记录与其摘要不一致。');
      prior = row.sha256;
      latest = { version: row.version, people, roles, recordedAt: row.recorded_at, digest: row.sha256 };
    }
    return latest;
  }
}
