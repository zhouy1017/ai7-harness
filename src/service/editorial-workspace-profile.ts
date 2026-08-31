import { createHash, randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { open, opendir, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type { EditorialWorkspaceProfileProjection } from '../shared/protocol.js';
import { ensureCanonicalDataDirectory, inspectCanonicalDataFile } from '../shared/data-root.js';

export const EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION = 12;
export const EDITORIAL_WORKSPACE_PROFILE_ID = '@ai7/editorial-workspace-profile';
export const EDITORIAL_WORKSPACE_PROFILE_VERSION = '1.0.0';
export const EDITORIAL_WORKSPACE_PROFILE_DIGEST =
  'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d';
export const EDITORIAL_WORKSPACE_PROFILE_BYTES = 263;
export const EDITORIAL_WORKSPACE_PROFILE_RETAINED_KEY = posix.join(
  'sha256',
  EDITORIAL_WORKSPACE_PROFILE_DIGEST.slice(0, 2),
  EDITORIAL_WORKSPACE_PROFILE_DIGEST,
  'package.json',
);

export const NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL = `CREATE TABLE native_artifact_installations (
  artifact_id TEXT PRIMARY KEY CHECK(artifact_id = '@ai7/editorial-workspace-profile'),
  artifact_kind TEXT NOT NULL CHECK(artifact_kind = 'dsh-profile'),
  artifact_version TEXT NOT NULL CHECK(artifact_version = '1.0.0'),
  adapter_kind TEXT NOT NULL CHECK(adapter_kind = 'bundled-local-directory'),
  source_kind TEXT NOT NULL CHECK(source_kind = 'repository-bundled'),
  source_label TEXT NOT NULL CHECK(source_label = 'config/native-artifact-sources/editorial-workspace-profile/package.json'),
  license_label TEXT NOT NULL CHECK(license_label = 'AI7 root license'),
  content_sha256 TEXT NOT NULL UNIQUE CHECK(content_sha256 = 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d'),
  byte_length INTEGER NOT NULL CHECK(byte_length = 263),
  retained_key TEXT NOT NULL UNIQUE CHECK(retained_key = 'sha256/ae/ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d/package.json'),
  compatibility TEXT NOT NULL CHECK(compatibility = 'compatible-declarative-provider-free'),
  model_role_requirement TEXT NOT NULL CHECK(model_role_requirement = 'Main Editorial Role'),
  capabilities_json TEXT NOT NULL CHECK(capabilities_json = '[]'),
  readable_scope_kinds_json TEXT NOT NULL CHECK(readable_scope_kinds_json = '[]'),
  provider_bindings_json TEXT NOT NULL CHECK(provider_bindings_json = '[]'),
  credential_access INTEGER NOT NULL CHECK(credential_access = 0),
  network_access INTEGER NOT NULL CHECK(network_access = 0),
  effect_classes_json TEXT NOT NULL CHECK(effect_classes_json = '[]'),
  background_analysis_enrollment INTEGER NOT NULL CHECK(background_analysis_enrollment = 0),
  apply_authority INTEGER NOT NULL CHECK(apply_authority = 0),
  installed_at TEXT NOT NULL
) STRICT`;

export const NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL = `CREATE TABLE native_artifact_book_enablements (
  book_id TEXT PRIMARY KEY REFERENCES books(book_id),
  artifact_id TEXT NOT NULL REFERENCES native_artifact_installations(artifact_id),
  enabled_at TEXT NOT NULL,
  UNIQUE(artifact_id, book_id)
) STRICT`;

const SOURCE_LABEL = 'config/native-artifact-sources/editorial-workspace-profile/package.json';
const RETAINED_DIRECTORY_ENTRY_LIMIT = 8;
const RETAINED_PARTIAL_NAME_PATTERN =
  /^package\.json\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.partial$/u;
const INSTALL_VALUES = [
  EDITORIAL_WORKSPACE_PROFILE_ID,
  'dsh-profile',
  EDITORIAL_WORKSPACE_PROFILE_VERSION,
  'bundled-local-directory',
  'repository-bundled',
  SOURCE_LABEL,
  'AI7 root license',
  EDITORIAL_WORKSPACE_PROFILE_DIGEST,
  EDITORIAL_WORKSPACE_PROFILE_BYTES,
  EDITORIAL_WORKSPACE_PROFILE_RETAINED_KEY,
  'compatible-declarative-provider-free',
  'Main Editorial Role',
  '[]',
  '[]',
  '[]',
  0,
  0,
  '[]',
  0,
  0,
] as const;

type SqlRow = Record<string, SQLOutputValue>;

export class EditorialWorkspaceProfileError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EditorialWorkspaceProfileError';
  }
}

export class EditorialWorkspaceProfileFatalError extends Error {
  constructor(cause: unknown) {
    super('Native artifact authority transaction boundary failed.', { cause });
    this.name = 'EditorialWorkspaceProfileFatalError';
  }
}

function requireProfile(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EditorialWorkspaceProfileError(code, message);
}

function asNumber(value: SQLOutputValue | undefined): number {
  requireProfile(typeof value === 'number' && Number.isSafeInteger(value), 'NATIVE_ARTIFACT_SCHEMA_INVALID', '原生构件结构值无效。');
  return value;
}

function asString(value: SQLOutputValue | undefined): string {
  requireProfile(typeof value === 'string', 'NATIVE_ARTIFACT_SCHEMA_INVALID', '原生构件结构值无效。');
  return value;
}

function inside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSchemaSql(sql: string): string {
  return sql.replace(/\s+/gu, '').replaceAll('"', '').replaceAll('`', '').replaceAll('[', '').replaceAll(']', '')
    .replace(/^CREATETABLEIFNOTEXISTS/iu, 'CREATETABLE').toLocaleLowerCase('en-US').replaceAll(';', '');
}

function requireExactTable(db: DatabaseSync, name: string, expectedSql: string): void {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name) as SqlRow | undefined;
  requireProfile(
    row !== undefined && typeof row.sql === 'string' && canonicalSchemaSql(row.sql) === canonicalSchemaSql(expectedSql),
    'NATIVE_ARTIFACT_SCHEMA_INVALID',
    `原生构件关系 ${name} 与 schema v12 不一致。`,
  );
  const table = db.prepare("SELECT type, strict, wr FROM pragma_table_list WHERE schema = 'main' AND name = ?").get(name) as SqlRow | undefined;
  requireProfile(
    table !== undefined && table.type === 'table' && table.strict === 1 && table.wr === 0,
    'NATIVE_ARTIFACT_SCHEMA_INVALID',
    `原生构件关系 ${name} 必须是 STRICT 表。`,
  );
}

export function validateEditorialWorkspaceProfileSchema(db: DatabaseSync): void {
  requireExactTable(db, 'native_artifact_installations', NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL);
  requireExactTable(db, 'native_artifact_book_enablements', NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL);
  const invalidInstall = db.prepare(
    `SELECT 1 FROM native_artifact_installations
     WHERE artifact_id != ? OR artifact_kind != ? OR artifact_version != ? OR adapter_kind != ?
        OR source_kind != ? OR source_label != ? OR license_label != ? OR content_sha256 != ?
        OR byte_length != ? OR retained_key != ? OR compatibility != ? OR model_role_requirement != ?
        OR capabilities_json != ? OR readable_scope_kinds_json != ? OR provider_bindings_json != ?
        OR credential_access != ? OR network_access != ? OR effect_classes_json != ?
        OR background_analysis_enrollment != ? OR apply_authority != ?
     LIMIT 1`,
  ).get(...INSTALL_VALUES);
  requireProfile(invalidInstall === undefined, 'NATIVE_ARTIFACT_SCHEMA_INVALID', '原生构件安装记录超出固定允许列表。');
  const counts = db.prepare(
    `SELECT
       (SELECT count(*) FROM native_artifact_installations) installations,
       (SELECT count(*) FROM native_artifact_book_enablements) enablements,
       (SELECT count(*) FROM native_artifact_book_enablements e
          JOIN native_artifact_installations i ON i.artifact_id = e.artifact_id
          JOIN books b ON b.book_id = e.book_id) joined_enablements`,
  ).get() as SqlRow;
  requireProfile(
    asNumber(counts.installations) <= 1 && asNumber(counts.enablements) === asNumber(counts.joined_enablements),
    'NATIVE_ARTIFACT_SCHEMA_INVALID',
    '原生构件安装或图书启用关系无效。',
  );
  requireProfile(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'NATIVE_ARTIFACT_SCHEMA_INVALID', '原生构件引用校验失败。');
}

export function initializeEditorialWorkspaceProfileSchema(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as SqlRow;
  const version = asNumber(row.user_version);
  requireProfile(
    version === 11 || version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION,
    'SCHEMA_UNSUPPORTED',
    '数据库版本不受支持。',
  );
  if (version === EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION) {
    validateEditorialWorkspaceProfileSchema(db);
    return;
  }
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      ${NATIVE_ARTIFACT_INSTALLATIONS_SCHEMA_SQL};
      ${NATIVE_ARTIFACT_BOOK_ENABLEMENTS_SCHEMA_SQL};
      PRAGMA user_version = ${EDITORIAL_WORKSPACE_PROFILE_SCHEMA_VERSION};
    `);
    validateEditorialWorkspaceProfileSchema(db);
    db.exec('COMMIT;');
  } catch (error) {
    try {
      db.exec('ROLLBACK;');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite native-artifact schema migration rollback failed.');
    }
    throw error;
  }
}

async function exactCarrier(path: string): Promise<Uint8Array> {
  try {
    const metadata = await lstat(path);
    requireProfile(metadata.isFile() && !metadata.isSymbolicLink(), 'NATIVE_ARTIFACT_SOURCE_INVALID', '原生构件来源不是固定普通文件。');
    requireProfile(metadata.size === EDITORIAL_WORKSPACE_PROFILE_BYTES, 'NATIVE_ARTIFACT_SOURCE_INVALID', '原生构件来源字节数发生变化。');
    const bytes = await readFile(path);
    requireProfile(bytes.length === EDITORIAL_WORKSPACE_PROFILE_BYTES && digest(bytes) === EDITORIAL_WORKSPACE_PROFILE_DIGEST,
      'NATIVE_ARTIFACT_SOURCE_INVALID', '原生构件来源摘要发生变化。');
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    requireProfile(
      manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest) &&
        Object.keys(manifest).sort().join(',') === 'description,dsh,name,private,version' &&
        (manifest as { name?: unknown }).name === EDITORIAL_WORKSPACE_PROFILE_ID &&
        (manifest as { version?: unknown }).version === EDITORIAL_WORKSPACE_PROFILE_VERSION &&
        (manifest as { private?: unknown }).private === true &&
        JSON.stringify((manifest as { dsh?: unknown }).dsh) === '{"profile":{"bundles":[]}}',
      'NATIVE_ARTIFACT_SOURCE_INVALID',
      '原生构件清单超出固定声明。',
    );
    return bytes;
  } catch (error) {
    if (error instanceof EditorialWorkspaceProfileError) throw error;
    throw new EditorialWorkspaceProfileError('NATIVE_ARTIFACT_SOURCE_INVALID', '原生构件来源缺失或无法验证。');
  }
}

export class EditorialWorkspaceProfileStore {
  readonly #db: DatabaseSync;
  readonly #dataRoot: string;
  readonly #sourceDirectory: string;
  readonly #sourcePath: string;
  readonly #retainedDirectory: string;
  readonly #retainedPath: string;
  #lifecycleTail: Promise<void> = Promise.resolve();
  #recoveryNeedsAttention = false;

  private constructor(
    db: DatabaseSync,
    dataRoot: string,
    sourceDirectory: string,
    sourcePath: string,
    retainedDirectory: string,
    retainedPath: string,
  ) {
    this.#db = db;
    this.#dataRoot = dataRoot;
    this.#sourceDirectory = sourceDirectory;
    this.#sourcePath = sourcePath;
    this.#retainedDirectory = retainedDirectory;
    this.#retainedPath = retainedPath;
  }

  static async open(db: DatabaseSync, dataRoot: string, codeRoot: string): Promise<EditorialWorkspaceProfileStore> {
    requireProfile(isAbsolute(dataRoot) && isAbsolute(codeRoot), 'NATIVE_ARTIFACT_PATH_INVALID', '原生构件路径边界无效。');
    const canonicalCodeRoot = await realpath(codeRoot);
    requireProfile(canonicalCodeRoot === resolve(codeRoot), 'NATIVE_ARTIFACT_PATH_INVALID', '原生构件代码根目录被重定向。');
    const sourceDirectory = resolve(canonicalCodeRoot, 'config', 'native-artifact-sources', 'editorial-workspace-profile');
    requireProfile(inside(canonicalCodeRoot, sourceDirectory), 'NATIVE_ARTIFACT_PATH_INVALID', '原生构件来源逃离代码根目录。');
    const sourcePath = resolve(sourceDirectory, 'package.json');
    const retainedDirectory = await ensureCanonicalDataDirectory(
      dataRoot,
      'native-artifacts',
      'sha256',
      EDITORIAL_WORKSPACE_PROFILE_DIGEST.slice(0, 2),
      EDITORIAL_WORKSPACE_PROFILE_DIGEST,
    );
    const retainedPath = (await inspectCanonicalDataFile(dataRoot, retainedDirectory, 'package.json')).path;
    const store = new EditorialWorkspaceProfileStore(
      db,
      dataRoot,
      sourceDirectory,
      sourcePath,
      retainedDirectory,
      retainedPath,
    );
    await store.#recoverPartials();
    return store;
  }

  async inspect(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    await this.#lifecycleTail;
    return this.#inspect(bookId);
  }

  async #inspect(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    this.#requireBook(bookId);
    const installation = this.#db.prepare(
      'SELECT installed_at FROM native_artifact_installations WHERE artifact_id = ?',
    ).get(EDITORIAL_WORKSPACE_PROFILE_ID) as SqlRow | undefined;
    let sourceAvailable = installation !== undefined;
    if (installation === undefined) {
      try {
        await this.#requireSource();
        sourceAvailable = true;
      } catch (error) {
        if (!(error instanceof EditorialWorkspaceProfileError)) throw error;
        sourceAvailable = false;
      }
    }
    const enabled = installation === undefined ? undefined : this.#db.prepare(
      'SELECT enabled_at FROM native_artifact_book_enablements WHERE artifact_id = ? AND book_id = ?',
    ).get(EDITORIAL_WORKSPACE_PROFILE_ID, bookId) as SqlRow | undefined;
    let retainedAvailable = false;
    try {
      const retained = await inspectCanonicalDataFile(this.#dataRoot, this.#retainedDirectory, 'package.json');
      retainedAvailable = retained.exists ? await this.#retainedIsExact() : installation === undefined;
    } catch {
      retainedAvailable = false;
    }
    const needsAttention = this.#recoveryNeedsAttention || !sourceAvailable || !retainedAvailable;
    const lifecycle: EditorialWorkspaceProfileProjection['lifecycle'] = needsAttention
      ? { state: 'unavailable-needs-attention' as const, label: '不可用 · 需要处理', installed: installation !== undefined, enabledForCurrentBook: false }
      : installation === undefined
        ? { state: 'available-to-install' as const, label: '可获取 · 尚未安装', installed: false, enabledForCurrentBook: false }
        : enabled === undefined
          ? { state: 'installed-disabled' as const, label: '已安装 · 本图书停用', installed: true, enabledForCurrentBook: false }
          : { state: 'enabled-for-book' as const, label: '已安装 · 已为本图书启用', installed: true, enabledForCurrentBook: true };
    return {
      bookId,
      identity: EDITORIAL_WORKSPACE_PROFILE_ID,
      kind: 'DSH Profile',
      version: EDITORIAL_WORKSPACE_PROFILE_VERSION,
      provenance: '仓库内置',
      license: 'AI7 root license',
      source: SOURCE_LABEL,
      byteLength: EDITORIAL_WORKSPACE_PROFILE_BYTES,
      sha256: EDITORIAL_WORKSPACE_PROFILE_DIGEST,
      compatibility: '声明式 · Provider-free · 兼容',
      authorityCeiling: {
        modelRoles: ['Main Editorial Role'],
        capabilities: [],
        readableScopeKinds: [],
        providerBindings: [],
        credentialAccess: false,
        networkAccess: false,
        effectClasses: [],
        backgroundAnalysisEnrollment: false,
        applyAuthority: false,
      },
      lifecycle,
      actions: {
        canInstall: lifecycle.state === 'available-to-install',
        canEnable: lifecycle.state === 'installed-disabled',
      },
      namedNonEffects: [
        '不创建 Task、Plan、Run 或 Session',
        '不读取图书、稿件或来源内容',
        '不授予 Provider、凭据、网络、Effect、Enrollment 或 Apply 权限',
      ],
    };
  }

  install(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#serialize(async () => {
      this.#requireBook(bookId);
      requireProfile(
        !this.#recoveryNeedsAttention,
        'NATIVE_ARTIFACT_RECOVERY_NEEDS_ATTENTION',
        '原生构件保留目录需要处理，当前不能安装。',
      );
      const prior = this.#db.prepare(
        'SELECT artifact_id FROM native_artifact_installations WHERE artifact_id = ?',
      ).get(EDITORIAL_WORKSPACE_PROFILE_ID);
      if (prior !== undefined) {
        requireProfile(await this.#retainedIsExact(), 'NATIVE_ARTIFACT_RETAINED_DRIFT', '已保留的原生构件字节缺失或发生变化。');
        return this.#inspect(bookId);
      }
      const bytes = await this.#requireSource();
      const retained = await inspectCanonicalDataFile(this.#dataRoot, this.#retainedDirectory, 'package.json');
      if (retained.exists) {
        requireProfile(await this.#retainedIsExact(), 'NATIVE_ARTIFACT_RETAINED_DRIFT', '已保留的原生构件字节需要处理。');
      } else {
        const partialName = `package.json.${randomUUID()}.partial`;
        const partial = (await inspectCanonicalDataFile(this.#dataRoot, this.#retainedDirectory, partialName)).path;
        const handle = await open(partial, 'wx', 0o600);
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await exactCarrier(partial);
        await rename(partial, this.#retainedPath);
        requireProfile(await this.#retainedIsExact(), 'NATIVE_ARTIFACT_RETAINED_DRIFT', '原生构件原子保留后校验失败。');
      }
      const installedAt = new Date().toISOString();
      this.#db.exec('BEGIN IMMEDIATE');
      try {
        this.#db.prepare(
          `INSERT INTO native_artifact_installations(
             artifact_id, artifact_kind, artifact_version, adapter_kind, source_kind, source_label,
             license_label, content_sha256, byte_length, retained_key, compatibility, model_role_requirement,
             capabilities_json, readable_scope_kinds_json, provider_bindings_json, credential_access,
             network_access, effect_classes_json, background_analysis_enrollment, apply_authority, installed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(...INSTALL_VALUES, installedAt);
        validateEditorialWorkspaceProfileSchema(this.#db);
        this.#db.exec('COMMIT');
      } catch (error) {
        try { this.#db.exec('ROLLBACK'); } catch (rollbackError) {
          throw new EditorialWorkspaceProfileFatalError(
            new AggregateError([error, rollbackError], 'SQLite native-artifact installation rollback failed.'),
          );
        }
        throw error;
      }
      return this.#inspect(bookId);
    });
  }

  enable(bookId: string): Promise<EditorialWorkspaceProfileProjection> {
    return this.#serialize(async () => {
      this.#requireBook(bookId);
      requireProfile(
        !this.#recoveryNeedsAttention,
        'NATIVE_ARTIFACT_RECOVERY_NEEDS_ATTENTION',
        '原生构件保留目录需要处理，当前不能启用。',
      );
      const installation = this.#db.prepare(
        'SELECT artifact_id FROM native_artifact_installations WHERE artifact_id = ?',
      ).get(EDITORIAL_WORKSPACE_PROFILE_ID);
      requireProfile(installation !== undefined, 'NATIVE_ARTIFACT_NOT_INSTALLED', '请先获取并安装原生构件。');
      requireProfile(await this.#retainedIsExact(), 'NATIVE_ARTIFACT_RETAINED_DRIFT', '已保留的原生构件字节缺失或发生变化。');
      this.#db.exec('BEGIN IMMEDIATE');
      try {
        this.#db.prepare(
          `INSERT INTO native_artifact_book_enablements(book_id, artifact_id, enabled_at)
           VALUES (?, ?, ?) ON CONFLICT(book_id) DO NOTHING`,
        ).run(bookId, EDITORIAL_WORKSPACE_PROFILE_ID, new Date().toISOString());
        validateEditorialWorkspaceProfileSchema(this.#db);
        this.#db.exec('COMMIT');
      } catch (error) {
        try { this.#db.exec('ROLLBACK'); } catch (rollbackError) {
          throw new EditorialWorkspaceProfileFatalError(
            new AggregateError([error, rollbackError], 'SQLite native-artifact enablement rollback failed.'),
          );
        }
        throw error;
      }
      return this.#inspect(bookId);
    });
  }

  async #requireSource(): Promise<Uint8Array> {
    try {
      const directory = await realpath(this.#sourceDirectory);
      const metadata = await lstat(this.#sourceDirectory);
      requireProfile(
        directory === this.#sourceDirectory && metadata.isDirectory() && !metadata.isSymbolicLink(),
        'NATIVE_ARTIFACT_SOURCE_INVALID',
        '原生构件来源目录被重定向。',
      );
      const entries = await readdir(this.#sourceDirectory, { withFileTypes: true });
      requireProfile(
        entries.length === 1 && entries[0]?.name === 'package.json' && entries[0].isFile() && !entries[0].isSymbolicLink(),
        'NATIVE_ARTIFACT_SOURCE_INVALID',
        '原生构件来源目录发生变化。',
      );
      return await exactCarrier(this.#sourcePath);
    } catch (error) {
      if (error instanceof EditorialWorkspaceProfileError) throw error;
      throw new EditorialWorkspaceProfileError('NATIVE_ARTIFACT_SOURCE_INVALID', '原生构件来源缺失或无法验证。');
    }
  }

  #requireBook(bookId: string): void {
    requireProfile(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(bookId) &&
        this.#db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(bookId) !== undefined,
      'BOOK_NOT_FOUND',
      '图书不存在。',
    );
  }

  async #retainedIsExact(): Promise<boolean> {
    try {
      const inspected = await inspectCanonicalDataFile(this.#dataRoot, this.#retainedDirectory, 'package.json');
      if (!inspected.exists || inspected.path !== this.#retainedPath) return false;
      await exactCarrier(inspected.path);
      return true;
    } catch {
      return false;
    }
  }

  async #recoverPartials(): Promise<void> {
    let directory: Awaited<ReturnType<typeof opendir>> | undefined;
    try {
      directory = await opendir(this.#retainedDirectory);
      for (let count = 0; ; count += 1) {
        const entry = await directory.read();
        if (entry === null) break;
        if (count === RETAINED_DIRECTORY_ENTRY_LIMIT) {
          this.#recoveryNeedsAttention = true;
          break;
        }
        if (entry.name === 'package.json') continue;
        if (!RETAINED_PARTIAL_NAME_PATTERN.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) {
          this.#recoveryNeedsAttention = true;
          continue;
        }
        try {
          const partial = (await inspectCanonicalDataFile(this.#dataRoot, this.#retainedDirectory, entry.name)).path;
          await exactCarrier(partial);
          await rm(partial);
        } catch {
          this.#recoveryNeedsAttention = true;
        }
      }
    } catch {
      this.#recoveryNeedsAttention = true;
    } finally {
      try {
        await directory?.close();
      } catch {
        this.#recoveryNeedsAttention = true;
      }
    }
  }

  async #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#lifecycleTail;
    let release = (): void => {};
    this.#lifecycleTail = new Promise<void>((resolveRelease) => { release = resolveRelease; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
