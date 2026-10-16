import { randomUUID } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import type {
  ImportedSkillCeiling, ImportedSkillFile, ImportedSkillRevisionProjection, ImportedSkillsProjection,
  ImportedSkillState, SkillConversionReport,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex, UUID_PATTERN } from './analysis/canonical.js';

/** ADR 0045 / ADR 0090: acquisition, conversion, validation, installation and scoped enablement are separate inert stages.
 * This module owns all snapshot/revision/state writes so #89 can extend their provenance without another write path.
 * No imported text is evaluated, dispatched, interpolated into a prompt, or treated as authority.
 */
export const MAX_SKILL_PACKAGE_BYTES = 96 * 1024;
export const MAX_SKILL_FILES = 32;
const MAX_ARCHIVE_BYTES = 256 * 1024;
const LABELS: Record<ImportedSkillState, string> = {
  'pending-validation': '待验证', validated: '验证通过（未安装）', restricted: '已拒绝（受限）', rejected: '已拒绝',
  'installed-disabled': '已安装（未启用）', enabled: '已启用',
};
const EXECUTABLE = /(?:^|\/)(?:hooks?|scripts?|node_modules|\.git)(?:\/|$)|\.(?:[cm]?js|jsx|tsx?|py|pyc|sh|bash|ps1|bat|cmd|exe|dll|so|dylib|wasm|jar|class|com|vbs|rb|pl|php|lua|go|rs|c|cpp|h)$/iu;
const HOST_FIELDS = /^(?:allowed-tools|tools|permissions?|hooks?|subagents?|agents?|runtime|dependencies|scripts|mcp|network|provider|paths?)$/iu;

export class ImportedSkillError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImportedSkillError'; }
}
function requireSkill(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new ImportedSkillError(code, message);
}
function safeMember(path: string): boolean {
  return path.length > 0 && path.length <= 240 && path.isWellFormed() &&
    !path.split('/').some((part) => part === '' || part === '.' || part === '..' || /[\\:\u0000-\u001f\u007f]/u.test(part)) &&
    !/(?:^|\/)\.git(?:\/|$)/iu.test(path) && !/\.key\.txt$/iu.test(path);
}
async function boundedFile(path: string, limit: number): Promise<Uint8Array> {
  requireSkill(!/\.key\.txt$/iu.test(path), 'SKILL_PATH_RESTRICTED', '此类文件不能获取。');
  const before = await lstat(path);
  requireSkill(before.isFile() && !before.isSymbolicLink() && before.size <= limit, 'SKILL_SIZE_OR_PATH_INVALID', '文件过大或不是普通本地文件。');
  const handle = await open(path, 'r');
  try {
    const actual = await handle.stat();
    requireSkill(actual.isFile() && actual.size === before.size && actual.ino === before.ino, 'SKILL_SOURCE_CHANGED', '获取时文件有了变化。');
    const bytes = new Uint8Array(limit + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    requireSkill(offset <= limit, 'SKILL_SIZE_INVALID', '文件超过大小上限。');
    return bytes.slice(0, offset);
  } finally { await handle.close(); }
}
function fileRecord(path: string, bytes: Uint8Array): ImportedSkillFile {
  return { path, bytes: bytes.byteLength, sha256: sha256Hex(bytes), base64: Buffer.from(bytes).toString('base64') };
}

/** Read one directory or ZIP in bounded memory. ZIP members are never extracted to disk. */
export async function readSkillPackage(path: string): Promise<{ sourcePath: string; files: ImportedSkillFile[] }> {
  requireSkill(typeof path === 'string' && path.isWellFormed() && isAbsolute(path) && path.length <= 2048 &&
    !path.startsWith('\\\\') && !path.startsWith('//') && !/\.key\.txt$/iu.test(path), 'SKILL_PATH_INVALID', '请选择本地 Skill 文件或目录。');
  const root = await realpath(path);
  const info = await lstat(path);
  requireSkill(!info.isSymbolicLink(), 'SKILL_PATH_RESTRICTED', '不能从链接获取 Skill。');
  const files: ImportedSkillFile[] = [];
  let size = 0;
  const add = (name: string, bytes: Uint8Array): void => {
    requireSkill(safeMember(name) && !files.some((file) => file.path.toLowerCase() === name.toLowerCase()), 'SKILL_PATH_INVALID', '包内存在不安全或重复的文件路径。');
    size += bytes.byteLength;
    requireSkill(size <= MAX_SKILL_PACKAGE_BYTES && files.length < MAX_SKILL_FILES, 'SKILL_SIZE_INVALID', 'Skill 文件总量超过上限（96 KiB、32 个文件）。');
    files.push(fileRecord(name, bytes));
  };
  if (info.isDirectory()) {
    const walk = async (directory: string, depth: number): Promise<void> => {
      requireSkill(depth <= 8, 'SKILL_PATH_INVALID', 'Skill 目录层级过深。');
      const entries = await readdir(directory, { withFileTypes: true });
      requireSkill(entries.length <= MAX_SKILL_FILES, 'SKILL_SIZE_INVALID', 'Skill 目录项过多。');
      for (const entry of entries) {
        const target = join(directory, entry.name);
        const name = relative(root, target).split(sep).join('/');
        requireSkill(safeMember(name) && !entry.isSymbolicLink(), 'SKILL_PATH_RESTRICTED', '包内存在链接或受限路径。');
        const canonical = await realpath(target);
        requireSkill(canonical === target && relative(root, canonical) !== '..' && !relative(root, canonical).startsWith(`..${sep}`), 'SKILL_PATH_INVALID', '包内文件越出目录。');
        if (entry.isDirectory()) await walk(target, depth + 1);
        else {
          requireSkill(entry.isFile(), 'SKILL_PATH_INVALID', '包内只可有普通文件。');
          add(name, await boundedFile(target, MAX_SKILL_PACKAGE_BYTES - size));
        }
      }
    };
    await walk(root, 0);
  } else {
    requireSkill(info.isFile() && extname(root).toLowerCase() === '.zip', 'SKILL_FORMAT_INVALID', '请选择 .zip 或含 SKILL.md 的目录。');
    const archive = await boundedFile(root, MAX_ARCHIVE_BYTES);
    let count = 0;
    let expanded = 0;
    const archiveNames = new Set<string>();
    let members: Record<string, Uint8Array>;
    try {
      members = unzipSync(archive, { filter: (member) => {
        const directory = member.name.endsWith('/');
        requireSkill(safeMember(directory ? member.name.slice(0, -1) : member.name), 'SKILL_PATH_RESTRICTED', '压缩包包含受限路径。');
        if (directory) return false;
        requireSkill(!archiveNames.has(member.name.toLowerCase()), 'SKILL_PATH_INVALID', '压缩包包含重复的文件路径。');
        archiveNames.add(member.name.toLowerCase());
        count += 1; expanded += member.originalSize;
        requireSkill(count <= MAX_SKILL_FILES && expanded <= MAX_SKILL_PACKAGE_BYTES, 'SKILL_SIZE_INVALID', '压缩包展开后超过上限。');
        return true;
      } });
    } catch (error) {
      if (error instanceof ImportedSkillError) throw error;
      throw new ImportedSkillError('SKILL_ARCHIVE_INVALID', '无法读取这个 ZIP 包。');
    }
    for (const [name, bytes] of Object.entries(members)) add(name, bytes);
    // A single enclosing directory is packaging, not a host-path mapping. Exact member paths remain in the source snapshot.
  }
  requireSkill(files.length > 0, 'SKILL_EMPTY', 'Skill 包里没有文件。');
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { sourcePath: root, files };
}

interface Conversion {
  readonly name: string;
  readonly sourceRevision: string;
  readonly license: string | null;
  readonly notices: readonly string[];
  readonly conversion: SkillConversionReport;
  readonly ceiling: ImportedSkillCeiling;
  readonly problems: readonly string[];
}
/** Deliberately bounded front-matter subset: scalar fields, scalar lists and description blocks; uncertain YAML is rejected. */
export function convertSkillFiles(files: readonly ImportedSkillFile[], digest: string, fallback: string): Conversion {
  const report: { preserved: string[]; mapped: string[]; reviewRequired: string[]; unsupported: string[] } = {
    preserved: files.map((file) => file.path), mapped: [], reviewRequired: [], unsupported: [],
  };
  const problems: string[] = [];
  const skillFiles = files.filter((file) => file.path === 'SKILL.md' || file.path.endsWith('/SKILL.md'));
  const fields = new Map<string, string>();
  const skillFile = skillFiles.length === 1 ? skillFiles[0] : undefined;
  if (skillFile === undefined) problems.push('包中必须有唯一的 SKILL.md。');
  else {
    let text = '';
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(skillFile.base64, 'base64')); }
    catch { problems.push('SKILL.md 不是有效的 UTF-8。'); }
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
    if (match === null) problems.push('SKILL.md 缺少有效的前置信息。');
    else {
      let lastKey = '';
      for (const line of match[1]!.split(/\r?\n/u)) {
        if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
        const field = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u.exec(line);
        if (field !== null) {
          const key = field[1]!.toLowerCase();
          if (fields.has(key)) { problems.push(`前置信息字段重复：${key}`); continue; }
          let value = field[2]!.trim();
          if (/^["']/u.test(value)) {
            const quote = value[0]!;
            if (!value.endsWith(quote) || value.length < 2) problems.push(`前置信息字段未闭合：${key}`);
            else value = value.slice(1, -1);
          } else if (/[&*!{}]/u.test(value)) problems.push(`前置信息字段需要人工整理：${key}`);
          fields.set(key, value);
          lastKey = key;
        } else if (/^[ \t]+\S/u.test(line) && lastKey !== '') {
          if (lastKey === 'description' || HOST_FIELDS.test(lastKey)) fields.set(lastKey, `${fields.get(lastKey) ?? ''} ${line.trim()}`);
          else problems.push(`不支持这个前置信息结构：${lastKey}`);
        } else problems.push('前置信息包含不能确定解释的行。');
      }
      if (!fields.get('name')?.trim() || !fields.get('description')?.trim()) problems.push('前置信息需要非空的 name 和 description。');
      for (const [key, value] of fields) {
        if (key === 'description' || ['name', 'version', 'revision', 'source-revision', 'license'].includes(key)) continue;
        if (HOST_FIELDS.test(key)) {
          report.mapped.push(`${key}：保留声明，AI7 不提供这些宿主能力。`);
          if (/hooks?|scripts|dependencies|runtime|subagents?|agents?/iu.test(key)) report.unsupported.push(`${key} 需要此版本不提供的执行环境。`);
        } else report.reviewRequired.push(`未识别字段 ${key}：保留原文，未解释其语义。`);
        if (value.length > 4096) problems.push(`前置信息字段过长：${key}`);
      }
    }
  }
  for (const file of files) {
    // Static signatures catch renamed native/script resources too; recognizing bytes never requires executing them.
    const head = Buffer.from(file.base64.slice(0, 16), 'base64');
    const magic = head.subarray(0, 4).toString('hex');
    const executableBytes = head.subarray(0, 2).toString('ascii') === '#!' || head.subarray(0, 2).toString('ascii') === 'MZ' ||
      ['7f454c46', '0061736d', 'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(magic);
    if (executableBytes || EXECUTABLE.test(file.path) || /(?:^|\/)(?:package\.json|requirements\.txt|Cargo\.toml|Makefile|cordis\.patch\.ya?ml)$/iu.test(file.path)) {
      report.unsupported.push(`${file.path}：脚本、宿主配置或代码不会执行。`);
    }
  }
  const capabilities = [...fields].filter(([key]) => HOST_FIELDS.test(key)).map(([key, value]) => `${key}: ${value}`);
  const ceiling: ImportedSkillCeiling = {
    requestedCapabilities: capabilities, executor: false, runSourceScope: 'none', provider: false, effect: false,
    credentials: false, network: false, backgroundAnalysis: false, apply: false,
  };
  const bounded = (value: string | undefined, max: number): string | undefined => value === undefined ? undefined : value.slice(0, max);
  return {
    name: bounded(fields.get('name'), 120) ?? fallback.slice(0, 120),
    sourceRevision: bounded(fields.get('version') ?? fields.get('source-revision') ?? fields.get('revision'), 160) ?? digest,
    license: bounded(fields.get('license'), 4096) ?? null,
    notices: files.filter((file) => /(?:^|\/)(?:LICENSE|NOTICE|COPYING)(?:\.[^/]*)?$/iu.test(file.path)).map((file) => file.path),
    conversion: report, ceiling, problems,
  };
}

type Row = Record<string, string | number | bigint | Uint8Array | null>;
function recordOf(row: Row): Record<string, unknown> {
  requireSkill(typeof row.canonical_json === 'string' && sha256Hex(row.canonical_json) === row.sha256, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 记录摘要不一致。');
  const record = parseCanonicalJson(row.canonical_json);
  requireSkill(isRecord(record), 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 记录无效。');
  return record;
}
function filesOf(value: unknown, expected: string): ImportedSkillFile[] {
  requireSkill(Array.isArray(value) && value.length > 0 && value.length <= MAX_SKILL_FILES, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 文件清单无效。');
  let bytes = 0;
  const seen = new Set<string>();
  for (const file of value as unknown[]) {
    requireSkill(isRecord(file) && typeof file.path === 'string' && safeMember(file.path) && !seen.has(file.path.toLowerCase()) && typeof file.base64 === 'string' && typeof file.bytes === 'number', 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 文件记录无效。');
    const content = Buffer.from(file.base64, 'base64');
    requireSkill(content.toString('base64') === file.base64 && content.length === file.bytes && sha256Hex(content) === file.sha256, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 文件摘要不一致。');
    bytes += content.length; seen.add(file.path.toLowerCase());
  }
  requireSkill(bytes <= MAX_SKILL_PACKAGE_BYTES && sha256Hex(canonicalJson(value)) === expected, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 内容摘要不一致。');
  return value as ImportedSkillFile[];
}

export class ImportedSkills {
  constructor(readonly db: DatabaseSync) {}

  /** Acquisition produces immutable source + inert working revision only. A repeat with unchanged content is idempotent. */
  async importPackage(path: string): Promise<ImportedSkillRevisionProjection> {
    const source = await readSkillPackage(path);
    const contentSha256 = sha256Hex(canonicalJson(source.files));
    const conversion = convertSkillFiles(source.files, contentSha256, basename(source.sourcePath));
    return this.#transaction(() => {
      const existing = this.db.prepare('SELECT * FROM imported_skill_snapshots WHERE content_sha256 = ?').get(contentSha256) as Row | undefined;
      const sourceKey = sha256Hex(process.platform === 'win32' ? source.sourcePath.toLowerCase() : source.sourcePath);
      const identity = this.db.prepare('SELECT * FROM imported_skills WHERE source_key = ?').get(sourceKey) as Row | undefined;
      const now = new Date().toISOString();
      const skillId = identity !== undefined ? String(identity.skill_id) : existing !== undefined ? String(existing.skill_id) : randomUUID();
      if (identity !== undefined) recordOf(identity);
      if (existing === undefined && identity === undefined) {
        const record = canonicalRecord({ schema: 'ai7.imported-skill/1', skillId, sourceKey, createdAt: now });
        this.db.prepare('INSERT INTO imported_skills VALUES (?, ?, ?, ?, ?)').run(skillId, sourceKey, now, record.json, record.digest);
      }
      const snapshotId = existing === undefined ? randomUUID() : String(existing.snapshot_id);
      if (existing === undefined) {
        const record = canonicalRecord({ schema: 'ai7.source-skill-snapshot/1', snapshotId, skillId, ...source, contentSha256, createdAt: now });
        this.db.prepare('INSERT INTO imported_skill_snapshots VALUES (?, ?, ?, ?, ?, ?)').run(snapshotId, skillId, contentSha256, now, record.json, record.digest);
      }
      const latest = this.db.prepare('SELECT * FROM imported_skill_revisions WHERE skill_id = ? ORDER BY ordinal DESC LIMIT 1').get(skillId) as Row | undefined;
      if (latest !== undefined && latest.snapshot_id === snapshotId && latest.working_sha256 === contentSha256) return this.revision(String(latest.revision_id));
      const revisionId = randomUUID();
      const ordinal = latest === undefined ? 1 : Number(latest.ordinal) + 1;
      const previousRevisionId = latest === undefined ? null : String(latest.revision_id);
      const record = canonicalRecord({
        schema: 'ai7.imported-skill-working-revision/1', revisionId, skillId, snapshotId, ordinal, previousRevisionId,
        files: source.files, workingSha256: contentSha256, ...conversion, createdAt: now,
      });
      this.db.prepare('INSERT INTO imported_skill_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(revisionId, skillId, snapshotId, ordinal, previousRevisionId, contentSha256, now, record.json, record.digest);
      return this.revision(revisionId);
    });
  }

  inspect(revisionId: string | null, before: string | null): ImportedSkillsProjection {
    requireSkill(before === null || UUID_PATTERN.test(before), 'IMPORTED_SKILL_INVALID', 'Skill 分页位置无效。');
    const rows = this.db.prepare(`SELECT r.revision_id FROM imported_skill_revisions r
      WHERE r.ordinal = (SELECT max(v.ordinal) FROM imported_skill_revisions v WHERE v.skill_id = r.skill_id)
        AND (? IS NULL OR r.skill_id < ?) ORDER BY r.skill_id DESC LIMIT 21`).all(before, before) as Row[];
    const skills = rows.slice(0, 20).map((row) => {
      const revision = this.revision(String(row.revision_id));
      const { skillId, revisionId, ordinal, name, sourceRevision, kind, state, stateLabel } = revision;
      return { skillId, revisionId, ordinal, name, sourceRevision, kind, state, stateLabel };
    });
    return { skills, nextBefore: rows.length > 20 ? skills.at(-1)!.skillId : null, revision: revisionId === null ? null : this.revision(revisionId) };
  }

  revision(revisionId: string): ImportedSkillRevisionProjection {
    requireSkill(typeof revisionId === 'string' && UUID_PATTERN.test(revisionId), 'IMPORTED_SKILL_INVALID', 'Skill 修订标识无效。');
    const row = this.db.prepare('SELECT * FROM imported_skill_revisions WHERE revision_id = ?').get(revisionId) as Row | undefined;
    requireSkill(row !== undefined, 'IMPORTED_SKILL_NOT_FOUND', '这一版 Skill 不存在。');
    const record = recordOf(row);
    requireSkill(record.schema === 'ai7.imported-skill-working-revision/1' && record.revisionId === revisionId && record.skillId === row.skill_id && record.snapshotId === row.snapshot_id && record.ordinal === row.ordinal && record.workingSha256 === row.working_sha256, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 修订记录不一致。');
    const source = this.db.prepare('SELECT * FROM imported_skill_snapshots WHERE snapshot_id = ?').get(String(row.snapshot_id)) as Row | undefined;
    requireSkill(source !== undefined, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 来源快照缺失。');
    const snapshot = recordOf(source);
    requireSkill(snapshot.schema === 'ai7.source-skill-snapshot/1' && snapshot.snapshotId === source.snapshot_id && snapshot.skillId === source.skill_id && snapshot.contentSha256 === source.content_sha256 && typeof snapshot.sourcePath === 'string', 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 快照记录不一致。');
    const files = filesOf(snapshot.files, String(source.content_sha256));
    const workingFiles = filesOf(record.files, String(row.working_sha256));
    const converted = convertSkillFiles(workingFiles, String(row.working_sha256), basename(snapshot.sourcePath));
    requireSkill(canonicalJson(record.conversion) === canonicalJson(converted.conversion) && canonicalJson(record.ceiling) === canonicalJson(converted.ceiling), 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 转换或权限上限记录不一致。');
    const states = this.db.prepare('SELECT * FROM imported_skill_states WHERE revision_id = ? ORDER BY sequence').all(revisionId) as Row[];
    let state: ImportedSkillState = 'pending-validation';
    let reasons: readonly string[] = [];
    const enabledBooks: string[] = [];
    for (const [index, stateRow] of states.entries()) {
      const event = recordOf(stateRow);
      requireSkill(event.schema === 'ai7.imported-skill-state/1' && event.revisionId === revisionId && event.sequence === index + 1 && event.state === stateRow.state && event.bookId === stateRow.book_id, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 状态记录不一致。');
      state = String(stateRow.state) as ImportedSkillState;
      reasons = Array.isArray(event.reasons) ? event.reasons.filter((reason): reason is string => typeof reason === 'string') : [];
      if (stateRow.book_id !== null) enabledBooks.push(String(stateRow.book_id));
    }
    const projection = {
      skillId: String(row.skill_id), revisionId, ordinal: Number(row.ordinal), name: String(record.name),
      sourceRevision: String(record.sourceRevision), kind: 'DSH Skill' as const, state, stateLabel: LABELS[state],
      snapshotId: String(row.snapshot_id), previousRevisionId: row.previous_revision_id === null ? null : String(row.previous_revision_id),
      sourcePath: snapshot.sourcePath, snapshotSha256: String(source.content_sha256), workingSha256: String(row.working_sha256),
      files, workingFiles, license: converted.license, notices: converted.notices, conversion: converted.conversion,
      reasons, enabledBooks, ceiling: converted.ceiling, createdAt: String(row.created_at),
    };
    return { ...projection, previewDigest: sha256Hex(canonicalJson({ revisionId, sha256: row.sha256, state, enabledBooks, ceiling: converted.ceiling, conversion: converted.conversion })) };
  }

  validate(revisionId: string): ImportedSkillRevisionProjection {
    return this.#transaction(() => {
      const revision = this.revision(revisionId);
      if (revision.state !== 'pending-validation') return revision;
      const converted = convertSkillFiles(revision.workingFiles, revision.workingSha256, revision.name);
      const reasons = [...converted.problems, ...converted.conversion.unsupported, ...converted.conversion.reviewRequired];
      const state = converted.problems.length > 0 ? 'rejected' : converted.conversion.unsupported.length + converted.conversion.reviewRequired.length > 0 ? 'restricted' : 'validated';
      this.appendState(revisionId, state, null, reasons);
      return this.revision(revisionId);
    });
  }

  install(revisionId: string, previewDigest: string): ImportedSkillRevisionProjection {
    return this.#transaction(() => {
      const revision = this.#confirmed(revisionId, previewDigest);
      requireSkill(revision.state === 'validated', 'IMPORTED_SKILL_NOT_VALIDATED', '先验证通过，才能另行安装；受限内容不能安装。');
      this.appendState(revisionId, 'installed-disabled', null, []);
      return this.revision(revisionId);
    });
  }

  enable(revisionId: string, bookId: string, previewDigest: string): ImportedSkillRevisionProjection {
    return this.#transaction(() => {
      requireSkill(typeof bookId === 'string' && UUID_PATTERN.test(bookId) && this.db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(bookId) !== undefined, 'BOOK_INVALID', '请选择启用的图书。');
      const revision = this.#confirmed(revisionId, previewDigest);
      requireSkill(revision.state === 'installed-disabled' || revision.state === 'enabled', 'IMPORTED_SKILL_NOT_INSTALLED', '先安装，再另行为图书启用。');
      if (!revision.enabledBooks.includes(bookId)) this.appendState(revisionId, 'enabled', bookId, []);
      return this.revision(revisionId);
    });
  }

  #confirmed(revisionId: string, previewDigest: string): ImportedSkillRevisionProjection {
    const revision = this.revision(revisionId);
    requireSkill(revision.previewDigest === previewDigest, 'IMPORTED_SKILL_PREVIEW_STALE', 'Skill 状态在你查看后有了变化，请重新查看。');
    return revision;
  }

  /** The sole append path for this lifecycle; importer/validator never call installation or enablement. */
  private appendState(revisionId: string, state: Exclude<ImportedSkillState, 'pending-validation'>, bookId: string | null, reasons: readonly string[]): void {
    const sequence = Number(this.db.prepare('SELECT coalesce(max(sequence), 0) + 1 AS n FROM imported_skill_states WHERE revision_id = ?').get(revisionId)?.n);
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({ schema: 'ai7.imported-skill-state/1', revisionId, sequence, state, bookId, reasons, actor: '本机编辑', recordedAt });
    this.db.prepare('INSERT INTO imported_skill_states VALUES (?, ?, ?, ?, ?, ?, ?)').run(revisionId, sequence, state, bookId, recordedAt, record.json, record.digest);
  }

  #transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
