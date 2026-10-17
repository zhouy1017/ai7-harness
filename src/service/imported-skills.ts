import { randomUUID } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import type {
  ImportedSkillAcquisitionProjection, ImportedSkillCeiling, ImportedSkillFile, ImportedSkillHistoryEntry, ImportedSkillRevisionProjection,
  ImportedSkillSelectionReason, ImportedSkillsProjection, ImportedSkillState, SkillConversionReport,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, hasExactKeys, isRecord, parseCanonicalJson, sha256Hex, UUID_PATTERN } from './analysis/canonical.js';

/** ADR 0045 / ADR 0090: acquisition, conversion, validation, installation and scoped enablement are separate inert stages.
 * Acquisition discloses before anything is kept; keeping is the editor's separate act (ADR 0090 §2, REUSE-021).
 * This module owns all snapshot/revision/state/selection writes; `imported-skill-updates.ts` (#89) reconciles updates through the
 * same primitives (`insertRevision`, `appendSelection`), so a revision has one write path whichever way it came about.
 * No imported text is evaluated, dispatched, interpolated into a prompt, or treated as authority.
 */
export const MAX_SKILL_PACKAGE_BYTES = 96 * 1024;
export const MAX_SKILL_FILES = 32;
export const MAX_SKILL_DECLARATION_CHARACTERS = 4096;
const MAX_ARCHIVE_BYTES = 256 * 1024;
export const STATE_LABELS: Record<ImportedSkillState, string> = {
  'pending-validation': '待验证', validated: '验证通过（未安装）', restricted: '已拒绝（受限）', rejected: '已拒绝',
  'installed-disabled': '已安装（未启用）', enabled: '已启用',
};
const EXECUTABLE = /(?:^|\/)(?:hooks?|scripts?|node_modules|\.git)(?:\/|$)|\.(?:[cm]?js|jsx|tsx?|py|pyc|sh|bash|ps1|bat|cmd|exe|dll|so|dylib|wasm|jar|class|com|vbs|rb|pl|php|lua|go|rs|c|cpp|h)$/iu;
const HOST_FIELDS = /^(?:allowed-tools|tools|permissions?|hooks?|subagents?|agents?|runtime|dependencies|scripts|mcp|network|provider|paths?)$/iu;

export class ImportedSkillError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImportedSkillError'; }
}
export function requireSkill(value: unknown, code: string, message: string): asserts value {
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

export interface Conversion {
  readonly name: string;
  readonly sourceRevision: string;
  readonly license: string | null;
  readonly notices: readonly string[];
  readonly conversion: SkillConversionReport;
  readonly ceiling: ImportedSkillCeiling;
  readonly problems: readonly string[];
}
export function isSkillFile(file: Pick<ImportedSkillFile, 'path'>): boolean {
  return file.path === 'SKILL.md' || file.path.endsWith('/SKILL.md');
}

/** Deliberately bounded front-matter subset: scalar fields, scalar lists and description blocks; uncertain YAML is rejected. */
export function convertSkillFiles(files: readonly ImportedSkillFile[], digest: string, fallback: string): Conversion {
  const report: { preserved: string[]; mapped: string[]; reviewRequired: string[]; unsupported: string[] } = {
    preserved: files.map((file) => file.path), mapped: [], reviewRequired: [], unsupported: [],
  };
  const problems: string[] = [];
  const skillFiles = files.filter(isSkillFile);
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
        if (value.length > MAX_SKILL_DECLARATION_CHARACTERS) problems.push(`前置信息字段过长：${key}`);
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

export type Row = Record<string, string | number | bigint | Uint8Array | null>;
export function recordOf(row: Row): Record<string, unknown> {
  requireSkill(typeof row.canonical_json === 'string' && sha256Hex(row.canonical_json) === row.sha256, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 记录摘要不一致。');
  const record = parseCanonicalJson(row.canonical_json);
  requireSkill(isRecord(record), 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 记录无效。');
  return record;
}
export function filesOf(value: unknown, expected: string): ImportedSkillFile[] {
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
export function textsOf(value: unknown): string[] {
  requireSkill(Array.isArray(value) && value.every((item) => typeof item === 'string'), 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 记录无效。');
  return value as string[];
}
/** The conversion report and ceiling as recorded when kept: history reads as it was written, whatever a later converter says. */
export function conversionOf(value: unknown): SkillConversionReport {
  requireSkill(isRecord(value) && hasExactKeys(value, ['preserved', 'mapped', 'reviewRequired', 'unsupported']), 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 转换报告记录无效。');
  return { preserved: textsOf(value.preserved), mapped: textsOf(value.mapped), reviewRequired: textsOf(value.reviewRequired), unsupported: textsOf(value.unsupported) };
}
export function ceilingOf(value: unknown): ImportedSkillCeiling {
  requireSkill(isRecord(value) && hasExactKeys(value, ['requestedCapabilities', 'executor', 'runSourceScope', 'provider', 'effect', 'credentials', 'network', 'backgroundAnalysis', 'apply']) &&
    value.executor === false && value.runSourceScope === 'none' && value.provider === false && value.effect === false && value.credentials === false &&
    value.network === false && value.backgroundAnalysis === false && value.apply === false, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 权限上限记录无效。');
  return {
    requestedCapabilities: textsOf(value.requestedCapabilities), executor: false, runSourceScope: 'none', provider: false, effect: false,
    credentials: false, network: false, backgroundAnalysis: false, apply: false,
  };
}

/** What the provider-free validator says of converted files: the state it would record and the reasons it gives. */
export function validationVerdict(converted: Conversion): { state: 'validated' | 'restricted' | 'rejected'; reasons: string[] } {
  const reasons = [...converted.problems, ...converted.conversion.unsupported, ...converted.conversion.reviewRequired];
  const state = converted.problems.length > 0 ? 'rejected' : converted.conversion.unsupported.length + converted.conversion.reviewRequired.length > 0 ? 'restricted' : 'validated';
  return { state, reasons };
}

/** One local package read and converted in memory, before anything of it is kept. */
export interface AcquiredSkillPackage {
  readonly sourcePath: string;
  readonly files: readonly ImportedSkillFile[];
  readonly contentSha256: string;
  readonly conversion: Conversion;
}
export async function acquireSkillPackage(path: string): Promise<AcquiredSkillPackage> {
  const source = await readSkillPackage(path);
  const contentSha256 = sha256Hex(canonicalJson(source.files));
  return { ...source, contentSha256, conversion: convertSkillFiles(source.files, contentSha256, basename(source.sourcePath)) };
}

/** Acquisitions disclosed and not yet kept (ADR 0090 §2): a few, in this process's memory only, never written. */
export class SkillAcquisitions {
  readonly #staged = new Map<string, { acquired: AcquiredSkillPackage; updateSkillId: string | null }>();
  /** null is an import; an update is bound to the exact Skill whose disclosure the editor saw. */
  stage(acquired: AcquiredSkillPackage, updateSkillId: string | null = null): string {
    const acquisitionId = randomUUID();
    while (this.#staged.size >= 4) this.#staged.delete(this.#staged.keys().next().value!);
    this.#staged.set(acquisitionId, { acquired, updateSkillId });
    return acquisitionId;
  }
  read(acquisitionId: string, updateSkillId: string | null = null): AcquiredSkillPackage {
    const staged = typeof acquisitionId === 'string' && UUID_PATTERN.test(acquisitionId) ? this.#staged.get(acquisitionId) : undefined;
    requireSkill(staged !== undefined, 'SKILL_ACQUISITION_GONE', '请重新选择要导入的 Skill。');
    requireSkill(staged.updateSkillId === updateSkillId, 'SKILL_ACQUISITION_PURPOSE_DIFFERS', '请从原来的导入或检查更新卡片保留所选内容。');
    return staged.acquired;
  }
  release(acquisitionId: string): void { this.#staged.delete(acquisitionId); }
}

interface Placement {
  readonly existing: Row | undefined;
  readonly identity: Row | undefined;
  readonly sourceKey: string;
  readonly skillId: string | null;
  readonly latest: Row | undefined;
  readonly kept: string | null;
}

export class ImportedSkills {
  constructor(readonly db: DatabaseSync) {}

  /**
   * Where kept content goes: the Skill an identical snapshot already belongs to — exact content is one snapshot, of one Skill —
   * else the Skill first kept from this source, else a new one; and the working revision already holding it, if any.
   */
  #placement(acquired: AcquiredSkillPackage): Placement {
    const existing = this.db.prepare('SELECT * FROM imported_skill_snapshots WHERE content_sha256 = ?').get(acquired.contentSha256) as Row | undefined;
    const sourceKey = sha256Hex(process.platform === 'win32' ? acquired.sourcePath.toLowerCase() : acquired.sourcePath);
    const identity = this.db.prepare('SELECT * FROM imported_skills WHERE source_key = ?').get(sourceKey) as Row | undefined;
    const skillId = existing !== undefined ? String(existing.skill_id) : identity !== undefined ? String(identity.skill_id) : null;
    const latest = skillId === null ? undefined
      : this.db.prepare('SELECT * FROM imported_skill_revisions WHERE skill_id = ? ORDER BY ordinal DESC LIMIT 1').get(skillId) as Row | undefined;
    const identical = existing === undefined ? undefined : this.db.prepare(
      'SELECT revision_id FROM imported_skill_revisions WHERE snapshot_id = ? AND working_sha256 = ? ORDER BY ordinal DESC LIMIT 1',
    ).get(String(existing.snapshot_id), acquired.contentSha256);
    const kept = identical === undefined ? null : String(identical.revision_id);
    return { existing, identity, sourceKey, skillId, latest, kept };
  }

  /** What acquisition discloses (REUSE-021): identity, kind, source revision, provenance, license and notices, digest. A read. */
  disclose(acquired: AcquiredSkillPackage, acquisitionId: string): ImportedSkillAcquisitionProjection {
    const { conversion } = acquired;
    return {
      acquisitionId, name: conversion.name, sourceRevision: conversion.sourceRevision, kind: 'DSH Skill', sourcePath: acquired.sourcePath,
      contentSha256: acquired.contentSha256, license: conversion.license, notices: conversion.notices,
      files: acquired.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
      conversion: conversion.conversion, ceiling: conversion.ceiling, problems: conversion.problems,
      keepable: acquired.files.some(isSkillFile), keptRevisionId: this.#placement(acquired).kept,
    };
  }

  /** Keeping a disclosed package: immutable source + inert working revision only. Keeping unchanged content again is idempotent. */
  keep(acquired: AcquiredSkillPackage): ImportedSkillRevisionProjection {
    requireSkill(acquired.files.some(isSkillFile), 'SKILL_NOT_A_PACKAGE', '所选内容里没有 SKILL.md，不是 Skill 包；不会保留。');
    return this.transaction(() => {
      const placed = this.#placement(acquired);
      if (placed.identity !== undefined) recordOf(placed.identity);
      if (placed.kept !== null) return this.revision(placed.kept);
      if (placed.skillId !== null && placed.latest !== undefined) {
        const current = this.revision(this.currentRevisionId(placed.skillId));
        // Keep 7c's repair of a rejected package with no declared identity: it cannot be matched by check-update.
        const source = convertSkillFiles(current.files, current.snapshotSha256, '');
        requireSkill(current.state === 'rejected' && source.name.trim() === '', 'SKILL_IMPORT_REQUIRES_UPDATE',
          '这个 Skill 已有修订；请在它的卡片里用「检查更新（从文件）…」查看并采纳新版本。');
      }
      const now = new Date().toISOString();
      const skillId = placed.skillId ?? randomUUID();
      if (placed.skillId === null) {
        const record = canonicalRecord({ schema: 'ai7.imported-skill/1', skillId, sourceKey: placed.sourceKey, createdAt: now });
        this.db.prepare('INSERT INTO imported_skills VALUES (?, ?, ?, ?, ?)').run(skillId, placed.sourceKey, now, record.json, record.digest);
      }
      const snapshotId = placed.existing === undefined ? this.insertSnapshot(skillId, acquired) : String(placed.existing.snapshot_id);
      const revisionId = this.insertRevision({
        skillId, snapshotId, previousRevisionId: placed.latest === undefined ? null : String(placed.latest.revision_id),
        files: acquired.files, conversion: acquired.conversion,
      });
      this.appendSelection(skillId, revisionId, 'import', null, null);
      return this.revision(revisionId);
    });
  }

  /** The one place a Source Skill Snapshot is written: the exact files as read, immutable, belonging to one Skill. */
  insertSnapshot(skillId: string, acquired: AcquiredSkillPackage): string {
    const snapshotId = randomUUID();
    const now = new Date().toISOString();
    const record = canonicalRecord({
      schema: 'ai7.source-skill-snapshot/1', snapshotId, skillId, sourcePath: acquired.sourcePath, files: acquired.files,
      contentSha256: acquired.contentSha256, createdAt: now,
    });
    this.db.prepare('INSERT INTO imported_skill_snapshots VALUES (?, ?, ?, ?, ?, ?)').run(snapshotId, skillId, acquired.contentSha256, now, record.json, record.digest);
    return snapshotId;
  }

  /** One Source Skill Snapshot as it was kept, its files verified against their digests. */
  snapshot(snapshotId: string): { skillId: string; sourcePath: string; contentSha256: string; files: ImportedSkillFile[] } {
    requireSkill(typeof snapshotId === 'string' && UUID_PATTERN.test(snapshotId), 'IMPORTED_SKILL_INVALID', 'Skill 快照标识无效。');
    const source = this.db.prepare('SELECT * FROM imported_skill_snapshots WHERE snapshot_id = ?').get(snapshotId) as Row | undefined;
    requireSkill(source !== undefined, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 来源快照缺失。');
    const snapshot = recordOf(source);
    requireSkill(snapshot.schema === 'ai7.source-skill-snapshot/1' && snapshot.snapshotId === source.snapshot_id && snapshot.skillId === source.skill_id && snapshot.contentSha256 === source.content_sha256 && typeof snapshot.sourcePath === 'string', 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 快照记录不一致。');
    return { skillId: String(source.skill_id), sourcePath: snapshot.sourcePath, contentSha256: String(source.content_sha256), files: filesOf(snapshot.files, String(source.content_sha256)) };
  }

  /**
   * The one place a working revision is written, whether it was kept from a package or adopted from an update candidate: the next
   * ordinal of its Skill, the revision it follows, the exact files it holds and the conversion read over them.
   */
  insertRevision(input: {
    readonly skillId: string; readonly snapshotId: string; readonly previousRevisionId: string | null; readonly files: readonly ImportedSkillFile[];
    readonly conversion: Conversion; readonly provenance?: Readonly<Record<string, unknown>>;
  }): string {
    const revisionId = randomUUID();
    const ordinal = Number(this.db.prepare('SELECT coalesce(max(ordinal), 0) + 1 AS n FROM imported_skill_revisions WHERE skill_id = ?').get(input.skillId)?.n);
    const workingSha256 = sha256Hex(canonicalJson(input.files));
    const now = new Date().toISOString();
    const record = canonicalRecord({
      schema: 'ai7.imported-skill-working-revision/1', revisionId, skillId: input.skillId, snapshotId: input.snapshotId, ordinal,
      previousRevisionId: input.previousRevisionId, files: input.files, workingSha256, ...input.conversion, ...input.provenance, createdAt: now,
    });
    this.db.prepare('INSERT INTO imported_skill_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(revisionId, input.skillId, input.snapshotId, ordinal, input.previousRevisionId, workingSha256, now, record.json, record.digest);
    return revisionId;
  }

  /** The revision a Skill is on now: its latest selection, else — for a Skill kept before selections existed — its latest ordinal. */
  currentRevisionId(skillId: string): string {
    const selected = this.db.prepare('SELECT revision_id FROM imported_skill_current_selections WHERE skill_id = ? ORDER BY sequence DESC LIMIT 1').get(skillId);
    const found = selected ?? this.db.prepare('SELECT revision_id FROM imported_skill_revisions WHERE skill_id = ? ORDER BY ordinal DESC LIMIT 1').get(skillId);
    requireSkill(found !== undefined, 'IMPORTED_SKILL_NOT_FOUND', '这个 Skill 不存在。');
    return String(found.revision_id);
  }

  /** The sole append path for current selections. A rollback records how many state events the revision had, which it then no longer counts. */
  appendSelection(skillId: string, revisionId: string, reason: ImportedSkillSelectionReason, candidateId: string | null, statesThrough: number | null): void {
    const sequence = Number(this.db.prepare('SELECT coalesce(max(sequence), 0) + 1 AS n FROM imported_skill_current_selections WHERE skill_id = ?').get(skillId)?.n);
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({ schema: 'ai7.imported-skill-selection/1', skillId, sequence, revisionId, reason, candidateId, statesThrough, actor: '本机编辑', recordedAt });
    this.db.prepare('INSERT INTO imported_skill_current_selections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(skillId, sequence, revisionId, reason, candidateId, statesThrough, recordedAt, record.json, record.digest);
  }

  /**
   * Enablement is not carried across a rollback (REUSE-035): the state events a revision had when it was last returned to are
   * history, not enablement, so it stands at installed-disabled until the editor enables it again.
   */
  #statesThrough(revisionId: string): number {
    const row = this.db.prepare("SELECT states_through FROM imported_skill_current_selections WHERE revision_id = ? AND reason = 'rollback' ORDER BY sequence DESC LIMIT 1").get(revisionId);
    return row === undefined ? 0 : Number(row.states_through);
  }

  /** Every revision of a Skill, newest first, with the one the Skill is on marked and how each came about. */
  history(skillId: string): ImportedSkillHistoryEntry[] {
    const current = this.currentRevisionId(skillId);
    const selected = this.db.prepare('SELECT reason FROM imported_skill_current_selections WHERE skill_id = ? ORDER BY sequence DESC LIMIT 1').get(skillId);
    // Keep the current marker visible even after returning to a revision older than the recent history window.
    const rows = this.db.prepare(`SELECT revision_id FROM imported_skill_revisions WHERE skill_id = ? AND
      (revision_id = ? OR revision_id IN (SELECT revision_id FROM imported_skill_revisions WHERE skill_id = ? ORDER BY ordinal DESC LIMIT 20))
      ORDER BY ordinal DESC`).all(skillId, current, skillId) as Row[];
    return rows.map((row) => {
      const revision = this.revision(String(row.revision_id));
      const origin = this.db.prepare('SELECT canonical_json FROM imported_skill_revisions WHERE revision_id = ?').get(revision.revisionId);
      const provenance = parseCanonicalJson(String(origin?.canonical_json));
      const adoptedBy = isRecord(provenance) && (provenance.adoptedBy === 'editor' || provenance.adoptedBy === 'rule') ? provenance.adoptedBy : null;
      return {
        revisionId: revision.revisionId, ordinal: revision.ordinal, state: revision.state, stateLabel: revision.stateLabel, sourceRevision: revision.sourceRevision,
        previousRevisionId: revision.previousRevisionId, createdAt: revision.createdAt, current: revision.revisionId === current,
        origin: adoptedBy === null ? 'import' : adoptedBy === 'rule' ? 'rule' : 'adopt',
        selectedReason: revision.revisionId === current && selected !== undefined ? String(selected.reason) as ImportedSkillSelectionReason : null,
      };
    });
  }

  /** Each Skill on the revision it is on now (its current selection), a page at a time; and the history of the Skill of `revisionId`. */
  inspect(revisionId: string | null, before: string | null): ImportedSkillsProjection {
    requireSkill(before === null || UUID_PATTERN.test(before), 'IMPORTED_SKILL_INVALID', 'Skill 分页位置无效。');
    const rows = this.db.prepare('SELECT skill_id FROM imported_skills WHERE (? IS NULL OR skill_id < ?) ORDER BY skill_id DESC LIMIT 21').all(before, before) as Row[];
    const skills = rows.slice(0, 20).map((row) => {
      const revision = this.revision(this.currentRevisionId(String(row.skill_id)));
      const { skillId, revisionId, ordinal, name, sourceRevision, kind, state, stateLabel } = revision;
      return { skillId, revisionId, ordinal, name, sourceRevision, kind, state, stateLabel };
    });
    const revision = revisionId === null ? null : this.revision(revisionId);
    return {
      skills, nextBefore: rows.length > 20 ? skills.at(-1)!.skillId : null, revision,
      history: revision === null ? [] : this.history(revision.skillId), candidates: [], rule: null,
    };
  }

  revision(revisionId: string): ImportedSkillRevisionProjection {
    requireSkill(typeof revisionId === 'string' && UUID_PATTERN.test(revisionId), 'IMPORTED_SKILL_INVALID', 'Skill 修订标识无效。');
    const row = this.db.prepare('SELECT * FROM imported_skill_revisions WHERE revision_id = ?').get(revisionId) as Row | undefined;
    requireSkill(row !== undefined, 'IMPORTED_SKILL_NOT_FOUND', '这一版 Skill 不存在。');
    const record = recordOf(row);
    requireSkill(record.schema === 'ai7.imported-skill-working-revision/1' && record.revisionId === revisionId && record.skillId === row.skill_id &&
      record.snapshotId === row.snapshot_id && record.ordinal === row.ordinal && record.workingSha256 === row.working_sha256 &&
      typeof record.name === 'string' && typeof record.sourceRevision === 'string' && (record.license === null || typeof record.license === 'string'),
    'IMPORTED_SKILL_RECORD_INVALID', 'Skill 修订记录不一致。');
    const snapshot = this.snapshot(String(row.snapshot_id));
    requireSkill(snapshot.skillId === row.skill_id, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 来源快照缺失。');
    const files = snapshot.files;
    const workingFiles = filesOf(record.files, String(row.working_sha256));
    // The report and ceiling read as recorded when kept, never as a later converter would say them.
    const conversion = conversionOf(record.conversion);
    const ceiling = ceilingOf(record.ceiling);
    const notices = textsOf(record.notices);
    const states = this.db.prepare('SELECT * FROM imported_skill_states WHERE revision_id = ? ORDER BY sequence').all(revisionId) as Row[];
    const through = this.#statesThrough(revisionId);
    let state: ImportedSkillState = 'pending-validation';
    let reasons: readonly string[] = [];
    const enabledBooks: string[] = [];
    for (const [index, stateRow] of states.entries()) {
      const event = recordOf(stateRow);
      requireSkill(event.schema === 'ai7.imported-skill-state/1' && event.revisionId === revisionId && event.sequence === index + 1 && event.state === stateRow.state && event.bookId === stateRow.book_id, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 状态记录不一致。');
      state = String(stateRow.state) as ImportedSkillState;
      reasons = Array.isArray(event.reasons) ? event.reasons.filter((reason): reason is string => typeof reason === 'string') : [];
      if (stateRow.book_id !== null && Number(stateRow.sequence) > through) enabledBooks.push(String(stateRow.book_id));
    }
    // A revision returned to is capped at installed-disabled until the editor enables it again (REUSE-035).
    if (state === 'enabled' && enabledBooks.length === 0) { state = 'installed-disabled'; reasons = []; }
    const projection = {
      skillId: String(row.skill_id), revisionId, ordinal: Number(row.ordinal), name: record.name,
      sourceRevision: record.sourceRevision, kind: 'DSH Skill' as const, state, stateLabel: STATE_LABELS[state],
      snapshotId: String(row.snapshot_id), previousRevisionId: row.previous_revision_id === null ? null : String(row.previous_revision_id),
      sourcePath: snapshot.sourcePath, snapshotSha256: snapshot.contentSha256, workingSha256: String(row.working_sha256),
      files, workingFiles, license: record.license, notices, conversion,
      reasons, enabledBooks, ceiling, createdAt: String(row.created_at),
    };
    return { ...projection, previewDigest: sha256Hex(canonicalJson({ revisionId, sha256: row.sha256, state, enabledBooks, ceiling, conversion })) };
  }

  validate(revisionId: string): ImportedSkillRevisionProjection {
    return this.transaction(() => {
      const revision = this.#onCurrent(this.revision(revisionId));
      if (revision.state !== 'pending-validation') return revision;
      // Validation is its own provider-free stage: today's validator over the exact working files, never their execution.
      const { state, reasons } = validationVerdict(convertSkillFiles(revision.workingFiles, revision.workingSha256, revision.name));
      this.appendState(revisionId, state, null, reasons, null);
      return this.revision(revisionId);
    });
  }

  install(revisionId: string, previewDigest: string): ImportedSkillRevisionProjection {
    return this.transaction(() => {
      const revision = this.#confirmed(revisionId, previewDigest);
      requireSkill(revision.state === 'validated', 'IMPORTED_SKILL_NOT_VALIDATED', '先验证通过，才能另行安装；受限内容不能安装。');
      this.appendState(revisionId, 'installed-disabled', null, [], revision);
      return this.revision(revisionId);
    });
  }

  enable(revisionId: string, bookId: string, previewDigest: string): ImportedSkillRevisionProjection {
    return this.transaction(() => {
      requireSkill(typeof bookId === 'string' && UUID_PATTERN.test(bookId) && this.db.prepare('SELECT 1 FROM books WHERE book_id = ?').get(bookId) !== undefined, 'BOOK_INVALID', '请选择启用的图书。');
      const revision = this.#confirmed(revisionId, previewDigest);
      requireSkill(revision.state === 'installed-disabled' || revision.state === 'enabled', 'IMPORTED_SKILL_NOT_INSTALLED', '先安装，再另行为图书启用。');
      if (!revision.enabledBooks.includes(bookId)) this.appendState(revisionId, 'enabled', bookId, [], revision);
      return this.revision(revisionId);
    });
  }

  /** Only the revision a Skill is on can move through validation, installation or enablement: an earlier one is returned to first. */
  #onCurrent(revision: ImportedSkillRevisionProjection): ImportedSkillRevisionProjection {
    requireSkill(this.currentRevisionId(revision.skillId) === revision.revisionId, 'IMPORTED_SKILL_NOT_CURRENT', '这一修订不是当前修订；请先「回到此版本」，再继续。');
    return revision;
  }

  #confirmed(revisionId: string, previewDigest: string): ImportedSkillRevisionProjection {
    const revision = this.#onCurrent(this.revision(revisionId));
    requireSkill(revision.previewDigest === previewDigest, 'IMPORTED_SKILL_PREVIEW_STALE', 'Skill 状态在你查看后有了变化，请重新查看。');
    return revision;
  }

  /**
   * The sole append path for this lifecycle; importer/validator never call installation or enablement. An installation or an
   * enablement records the preview the editor confirmed and the authority ceiling it showed (REUSE-027).
   */
  private appendState(revisionId: string, state: Exclude<ImportedSkillState, 'pending-validation'>, bookId: string | null, reasons: readonly string[],
    confirmed: Pick<ImportedSkillRevisionProjection, 'previewDigest' | 'ceiling'> | null): void {
    const sequence = Number(this.db.prepare('SELECT coalesce(max(sequence), 0) + 1 AS n FROM imported_skill_states WHERE revision_id = ?').get(revisionId)?.n);
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: 'ai7.imported-skill-state/1', revisionId, sequence, state, bookId, reasons, actor: '本机编辑', recordedAt,
      ...(confirmed === null ? {} : { confirmedPreviewDigest: confirmed.previewDigest, ceiling: confirmed.ceiling }),
    });
    this.db.prepare('INSERT INTO imported_skill_states VALUES (?, ?, ?, ?, ?, ?, ?)').run(revisionId, sequence, state, bookId, recordedAt, record.json, record.digest);
  }

  /** One immediate transaction; a caller already inside one uses the primitives above and never this. */
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
