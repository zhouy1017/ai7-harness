import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  MAX_EXPORT_DESTINATION_CODE_UNITS,
  MAX_EXPORT_RECORDS_LISTED,
  type ApproveManuscriptExportInput,
  type ExportFidelityRowProjection,
  type InspectManuscriptExportReceiptInput,
  type ManuscriptExportDisposition,
  type ManuscriptExportFormatProjection,
  type ManuscriptExportOptions,
  type ManuscriptExportPreparationProjection,
  type ManuscriptExportReceiptProjection,
  type ManuscriptExportReviewProjection,
  type ManuscriptExportTargetInput,
  type ManuscriptExportTargetProjection,
  type PrepareManuscriptExportInput,
  type ReviewManuscriptExportInput,
} from '../shared/protocol.js';
import { DIGEST_PATTERN, UUID_PATTERN, canonicalJson, canonicalRecord, isRecord, parseCanonicalJson, sha256Hex } from './analysis/canonical.js';
import type { ManuscriptCheckpointBinding, ManuscriptCheckpointProgress, ManuscriptCheckpointPurpose } from './bounded-manuscript.js';
import {
  DOCX_EXPORT_WRITER_IDENTITY,
  DocxExportError,
  EDITOR_AUTHOR_LABEL,
  EDITOR_NOTE_AUTHOR_LABEL,
  renderDocxExport,
  type DocxExportBlock,
  type DocxExportInput,
  type DocxExportMark,
  type DocxExportResult,
  type DocxExportSource,
  type DocxExportSourceRow,
} from './docx-export.js';

/**
 * Local export of a Manuscript version to DOCX (Issue #413, plan slice S64; External Export Policy v2; ADR 0038,
 * ADR 0039, ADR 0079 §3; V2-UX-EXP-007 to EXP-024).
 *
 * Schema revision 29 holds the generic export ledger, three append-only relations whose every row carries its
 * canonical JSON and digest, so a later slice exports a Production Document version, a 图书交付包 or a Report
 * through the same records (the five target kinds of the policy):
 *
 * - `export_preparations`: one frozen Local Export Preparation per file — the exact target and its revision,
 *   the format, the options, the Export Fidelity Review, the file name, the final local path exactly as the
 *   system dialog returned it, create or replace, the payload digest and the policy — recorded only after the
 *   destination was chosen. Its `effect_intent_id` is the stable identity of the Effect Intent it binds.
 * - `export_approvals`: the editor's one exact approval of one unchanged preparation, `按上述方式导出`.
 * - `export_receipts`: what the approved write came to — `created` or `replaced`, verified, with the file's
 *   bytes and digest (the Effect Receipt), or a classified outcome: `failed` when nothing at the destination
 *   changed, `ambiguous` when AI7 cannot tell. An approval with no receipt at all is an interrupted write, and
 *   reads `结果待确认` too. Nothing retries by itself (EXP-021).
 *
 * The file is written atomically in the destination's own folder: staged beside it under a name no one could
 * take for the result, synced and verified, then renamed over the chosen name and verified again. Cancelling
 * before the approval creates nothing but the preparation (EXP-020). Nothing is sent anywhere (EXP-015).
 *
 * Nothing existing moves (ADR 0079 §1.1): the three relations are added once, shape-detected, by
 * `initializeExportLedgerSchema` before `EditorialStore.open` stamps the version.
 */
const TARGET_KINDS = "'manuscript-revision', 'milestone-version', 'production-document-version', 'book-delivery-package-version', 'report', 'database-export-package'";

export const EXPORT_LEDGER_SCHEMA_SQL = {
  export_preparations: `CREATE TABLE export_preparations (
  preparation_id TEXT PRIMARY KEY,
  effect_intent_id TEXT NOT NULL UNIQUE,
  book_id TEXT NOT NULL REFERENCES books(book_id),
  target_kind TEXT NOT NULL CHECK(target_kind IN (${TARGET_KINDS})),
  target_id TEXT NOT NULL,
  revision_id TEXT REFERENCES manuscript_revisions(revision_id),
  revision_digest TEXT CHECK(revision_digest IS NULL OR length(revision_digest) = 64),
  format TEXT NOT NULL CHECK(format IN ('docx', 'pdf', 'markdown')),
  options_json TEXT NOT NULL,
  fidelity_json TEXT NOT NULL,
  degraded INTEGER NOT NULL CHECK(degraded IN (0, 1)),
  review_digest TEXT NOT NULL CHECK(length(review_digest) = 64),
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  destination TEXT NOT NULL CHECK(length(destination) BETWEEN 1 AND 1024),
  disposition TEXT NOT NULL CHECK(disposition IN ('create', 'replace')),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes > 0),
  policy_id TEXT NOT NULL CHECK(policy_id = 'external-export-policy'),
  policy_version TEXT NOT NULL CHECK(policy_version = 'v2'),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK((target_kind IN ('manuscript-revision', 'milestone-version')) = (revision_id IS NOT NULL AND revision_digest IS NOT NULL))
) STRICT`,
  export_approvals: `CREATE TABLE export_approvals (
  approval_id TEXT PRIMARY KEY,
  preparation_id TEXT NOT NULL UNIQUE REFERENCES export_preparations(preparation_id),
  effect_intent_id TEXT NOT NULL UNIQUE,
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
  actor TEXT NOT NULL CHECK(actor = '本机编辑'),
  interaction TEXT NOT NULL CHECK(interaction = 'export-as-stated'),
  approved_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64)
) STRICT`,
  export_receipts: `CREATE TABLE export_receipts (
  receipt_id TEXT PRIMARY KEY,
  preparation_id TEXT NOT NULL UNIQUE REFERENCES export_preparations(preparation_id),
  approval_id TEXT NOT NULL UNIQUE REFERENCES export_approvals(approval_id),
  outcome TEXT NOT NULL CHECK(outcome IN ('created', 'replaced', 'ambiguous', 'failed')),
  final_path TEXT NOT NULL CHECK(length(final_path) BETWEEN 1 AND 1024),
  byte_length INTEGER CHECK(byte_length IS NULL OR byte_length > 0),
  file_sha256 TEXT CHECK(file_sha256 IS NULL OR length(file_sha256) = 64),
  failure_code TEXT,
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  CHECK((outcome IN ('created', 'replaced')) = (byte_length IS NOT NULL AND file_sha256 IS NOT NULL)),
  CHECK((outcome IN ('ambiguous', 'failed')) = (failure_code IS NOT NULL))
) STRICT`,
} as const;

/** Every export relation is a ledger: a row is appended once and never rewritten or removed. */
export const EXPORT_LEDGER_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(EXPORT_LEDGER_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EXPORT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'EXPORT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

/** The foreign keys of the three relations, in the exact-schema validator's own spelling. */
export const EXPORT_LEDGER_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  export_preparations: [
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
  export_approvals: ['preparation_id>export_preparations.preparation_id:NO ACTION/NO ACTION/NONE'],
  export_receipts: [
    'approval_id>export_approvals.approval_id:NO ACTION/NO ACTION/NONE',
    'preparation_id>export_preparations.preparation_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class ExportLedgerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ExportLedgerError';
  }
}

function requireExport(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ExportLedgerError(code, message);
}

/**
 * Revision 29's three relations and their ledger triggers, created once and never rebuilt: a store that
 * predates them gains three empty relations and nothing existing moves. Shape-detected, like revisions 21 to
 * 28, and run before the version is stamped in `task-authorization.ts`.
 */
export function initializeExportLedgerSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'export_preparations'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(EXPORT_LEDGER_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(EXPORT_LEDGER_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Export ledger schema rollback failed.');
    }
    throw error;
  }
  requireExport(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

// ---- words ----------------------------------------------------------------------------------------

/** The low-ceremony state of a current revision whose unsaved edits are saved for the export (V2-UX-TASK-040). */
export const EXPORT_CHECKPOINT_PURPOSE = 'Export Input / 导出输入' as const;
export const EXPORT_OUTCOME_LABELS = {
  exported: '已导出到所选位置',
  ambiguous: '结果待确认',
  failed: '未能导出',
} as const;
export const EXPORT_DISPOSITION_LABELS: Readonly<Record<ManuscriptExportDisposition, string>> = {
  create: '新建文件',
  replace: '替换所选位置的同名文件',
};
export const EXPORT_FORMATS: ReadonlyArray<ManuscriptExportFormatProjection> = [
  { format: 'docx', label: 'DOCX', available: true, note: '主要可编辑格式：可在 Word 中继续修改，批注与修订按下面的选项写出。' },
  { format: 'pdf', label: 'PDF', available: false, note: '随后提供 · 固定版式，不支持可编辑往返。' },
  { format: 'markdown', label: 'Markdown（备用格式）', available: false, note: '随后提供 · 只保留文字与基本结构。' },
];
export const EXPORT_DOCX_LINE = 'DOCX 可在 Word 中继续编辑；稿件本身和稿件上的标记不会因为导出而改变。';
const FAILURE_DETAILS: Readonly<Record<string, string>> = {
  EXPORT_STAGE_FAILED: '无法在所选文件夹中写入导出文件，所选位置没有变化。',
  EXPORT_STAGE_VERIFY_FAILED: '写入的临时文件校验不一致，已经删除，所选位置没有变化。',
  EXPORT_TARGET_CHANGED: '所选位置在批准后发生了变化，没有写入；请重新选择保存位置。',
  EXPORT_COMMIT_FAILED: '无法把导出文件放到所选位置，所选位置没有变化。',
  EXPORT_COMMIT_UNCERTAIN: '系统没有确认文件是否已放到所选位置。请到所选位置核对；AI7 不会自动重试。',
  EXPORT_VERIFY_UNCERTAIN: '文件已放到所选位置，但读回校验没有通过。请到所选位置核对；AI7 不会自动重试。',
  EXPORT_INTERRUPTED: '导出在写入所选位置时中断，AI7 无法确认文件是否已写好。请到所选位置核对；如需重新导出，请重新选择保存位置。',
};

// ---- the store ------------------------------------------------------------------------------------

type SqlRow = Record<string, SQLOutputValue>;

const ACTOR = '本机编辑' as const;
const PREPARATION_SCHEMA = 'ai7.export.preparation/1' as const;
const APPROVAL_SCHEMA = 'ai7.export.approval/1' as const;
const RECEIPT_SCHEMA = 'ai7.export.receipt/1' as const;
const REVIEW_SCHEMA = 'ai7.export.review/1' as const;
const INPUT_SCHEMA = 'ai7.export.input/1' as const;
const POLICY = { id: 'external-export-policy', version: 'v2' } as const;
const INVALID_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001F]/gu;

/** The checkpoint seam the bounded manuscript owns (Issue #413): the same one a Task's input revision uses. */
export interface ExportCheckpointOwner {
  createManuscriptCheckpointWork(manuscriptId: string, branchId: string, purpose: typeof EXPORT_CHECKPOINT_PURPOSE):
    { workId: string | null; total: number; checkpoint: ManuscriptCheckpointBinding | null };
  advanceManuscriptCheckpointWork(workId: string): ManuscriptCheckpointProgress;
  finalizeManuscriptCheckpointWork(
    workId: string,
    persistCheckpointOwner: (checkpoint: ManuscriptCheckpointBinding, purpose: ManuscriptCheckpointPurpose) => void,
  ): ManuscriptCheckpointBinding;
  cancelManuscriptCheckpointWork(workId: string): boolean;
}

/** What the ledger needs of the rest of the store: verified content objects, the data root, the checkpoint. */
export interface ManuscriptExportEnvironment {
  readObject(objectDigest: string): Promise<Uint8Array>;
  /** The Agent Data Root, canonical: no export is ever written inside it (V2-UX-EXP-014). */
  dataRoot: string;
  checkpointOwner: ExportCheckpointOwner;
}

/** One exact version to export, resolved against the Book's primary Manuscript. */
interface ResolvedTarget {
  kind: 'current' | 'milestone';
  targetKind: 'manuscript-revision' | 'milestone-version';
  targetId: string;
  milestoneId: string | null;
  milestoneLabel: string | null;
  revisionId: string;
  revisionLabel: string;
  revisionDigest: string;
  manuscriptId: string;
  branchId: string;
  bookTitle: string;
  savedForExport: boolean;
}

interface ExportPlan {
  input: DocxExportInput;
  inputDigest: string;
  sourceVersionId: string;
}

function text(value: SQLOutputValue | undefined): string {
  requireExport(typeof value === 'string' && value.isWellFormed(), 'EXPORT_RECORD_INVALID', '导出记录无效。');
  return value;
}

function integer(value: SQLOutputValue | undefined): number {
  requireExport(typeof value === 'number' && Number.isSafeInteger(value), 'EXPORT_RECORD_INVALID', '导出记录无效。');
  return value;
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : text(value);
}

function transact<T>(db: DatabaseSync, operation: () => T): T {
  if (db.isTransaction) return operation();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Export ledger transaction rollback failed.');
    }
    throw error;
  }
}

/** A stored record read back: its canonical JSON digests to the recorded SHA-256 and names exactly these facts. */
function requireRecord(json: SQLOutputValue | undefined, digest: SQLOutputValue | undefined, facts: Readonly<Record<string, unknown>>): string {
  const canonical = text(json);
  const recorded = text(digest);
  requireExport(DIGEST_PATTERN.test(recorded) && sha256Hex(canonical) === recorded, 'EXPORT_RECORD_INVALID', '导出记录与其摘要不一致。');
  const record = parseCanonicalJson(canonical);
  requireExport(
    isRecord(record) && Object.entries(facts).every(([key, value]) => canonicalJson(record[key] ?? null) === canonicalJson(value)),
    'EXPORT_RECORD_INVALID',
    '导出记录与其字段不一致。',
  );
  return recorded;
}

function requireOptions(value: unknown): ManuscriptExportOptions {
  requireExport(
    isRecord(value) && Object.keys(value).length === 3 && typeof value.includeAnnotations === 'boolean' &&
      typeof value.includeSuggestions === 'boolean' && typeof value.includeEditorNotes === 'boolean',
    'EXPORT_OPTIONS_INVALID',
    '导出选项无效。',
  );
  return { includeAnnotations: value.includeAnnotations, includeSuggestions: value.includeSuggestions, includeEditorNotes: value.includeEditorNotes };
}

function requireTarget(value: unknown): ManuscriptExportTargetInput {
  requireExport(
    isRecord(value) && ((value.kind === 'current' && Object.keys(value).length === 1) ||
      (value.kind === 'milestone' && Object.keys(value).length === 2 && typeof value.milestoneId === 'string' && UUID_PATTERN.test(value.milestoneId))),
    'EXPORT_TARGET_INVALID',
    '导出对象无效。',
  );
  return value.kind === 'current' ? { kind: 'current' } : { kind: 'milestone', milestoneId: value.milestoneId as string };
}

/** A file name the platform's dialog can offer: the Book's title and the version, without characters a path cannot hold. */
export function suggestedExportFileName(bookTitle: string, versionLabel: string): string {
  const stem = `${bookTitle} · ${versionLabel}`.normalize('NFC').replace(INVALID_FILE_NAME_CHARACTERS, '_').replace(/\s+/gu, ' ').trim();
  const bounded = Array.from(stem).slice(0, 120).join('').replace(/[. ]+$/u, '');
  return `${bounded.length > 0 ? bounded : '稿件'}.docx`;
}

function isInsideOrEqual(parent: string, candidate: string): boolean {
  const relation = relative(parent, candidate);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

async function targetState(path: string): Promise<'absent' | 'file' | 'other'> {
  try {
    const info = await lstat(path);
    return info.isFile() && !info.isSymbolicLink() ? 'file' : 'other';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'other';
  }
}

async function fileDigest(path: string): Promise<{ bytes: number; sha256: string } | null> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) return null;
    const content = await readFile(path);
    return { bytes: content.byteLength, sha256: sha256Hex(content) };
  } catch {
    return null;
  }
}

/** The one stage every write shares with the rest of the store's durable writes: flush the handle before it counts. */
async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return;
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

type WriteOutcome =
  | { outcome: 'created' | 'replaced'; bytes: number; sha256: string }
  | { outcome: 'failed' | 'ambiguous'; code: string };

/**
 * Write `payload` at `destination` atomically (V2-UX-EXP-012): stage it beside the destination under a name no
 * one could take for the result, sync and verify it, check the destination is still what the dialog resolved,
 * rename it over the chosen name and verify the final file. Nothing at the destination changes before the rename;
 * after it, a file that cannot be verified is `ambiguous`, never retried.
 */
async function writeAtomically(
  destination: string,
  payload: Uint8Array,
  payloadSha256: string,
  disposition: ManuscriptExportDisposition,
  effectIntentId: string,
): Promise<WriteOutcome> {
  const directory = dirname(destination);
  const staged = join(directory, `.${basename(destination)}.${effectIntentId.slice(0, 8)}.ai7-partial`);
  const discard = async (): Promise<void> => {
    await rm(staged, { force: true }).catch(() => undefined);
  };
  let handle;
  try {
    handle = await open(staged, 'wx');
    await handle.writeFile(payload);
    await handle.sync();
  } catch {
    await handle?.close().catch(() => undefined);
    handle = undefined;
    await discard();
    return { outcome: 'failed', code: 'EXPORT_STAGE_FAILED' };
  }
  await handle.close();
  const stagedDigest = await fileDigest(staged);
  if (stagedDigest?.sha256 !== payloadSha256 || stagedDigest.bytes !== payload.byteLength) {
    await discard();
    return { outcome: 'failed', code: 'EXPORT_STAGE_VERIFY_FAILED' };
  }
  const state = await targetState(destination);
  if ((disposition === 'create' && state !== 'absent') || (disposition === 'replace' && state !== 'file')) {
    await discard();
    return { outcome: 'failed', code: 'EXPORT_TARGET_CHANGED' };
  }
  try {
    await rename(staged, destination);
  } catch {
    const landed = await fileDigest(destination);
    if (landed?.sha256 === payloadSha256) {
      await discard();
      return { outcome: disposition === 'create' ? 'created' : 'replaced', bytes: landed.bytes, sha256: landed.sha256 };
    }
    if ((await targetState(staged)) === 'file') {
      await discard();
      return { outcome: 'failed', code: 'EXPORT_COMMIT_FAILED' };
    }
    return { outcome: 'ambiguous', code: 'EXPORT_COMMIT_UNCERTAIN' };
  }
  try {
    await syncDirectory(directory);
  } catch {
    // The rename is what publishes the file; a folder that cannot be synced is verified by reading back below.
  }
  const final = await fileDigest(destination);
  if (final?.sha256 !== payloadSha256 || final.bytes !== payload.byteLength) return { outcome: 'ambiguous', code: 'EXPORT_VERIFY_UNCERTAIN' };
  return { outcome: disposition === 'create' ? 'created' : 'replaced', bytes: final.bytes, sha256: final.sha256 };
}

/**
 * 导出 of a Manuscript version (Issue #413): the review, the frozen preparation, the approval with its atomic
 * write, and the receipts. Every read verifies what it shows against the digests it was written with.
 */
export class ManuscriptExportStore {
  readonly #db: DatabaseSync;
  readonly #environment: ManuscriptExportEnvironment;

  constructor(db: DatabaseSync, environment: ManuscriptExportEnvironment) {
    this.#db = db;
    this.#environment = environment;
  }

  /**
   * The Export Fidelity Review of one exact version under one set of options (V2-UX-EXP-007). A current
   * revision with unsaved edits is first saved as a revision for the export, with no milestone and no decision
   * (V2-UX-TASK-040's low ceremony); nothing else is recorded.
   */
  async review(input: ReviewManuscriptExportInput, available: boolean): Promise<ManuscriptExportReviewProjection> {
    this.#requireAvailable(available);
    requireExport(isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId), 'BOOK_INVALID', '图书标识无效。');
    const target = requireTarget(input.target);
    const options = requireOptions(input.options);
    const resolved = await this.#resolve(input.bookId, target, true);
    const plan = await this.#plan(input.bookId, resolved, options);
    const rendered = this.#render(plan.input, false);
    return this.#reviewOf(input.bookId, resolved, options, plan, rendered);
  }

  /**
   * Freeze one Local Export Preparation after the system dialog resolved the destination (External Export
   * Policy v2, per-file step 1; V2-UX-EXP-010): the review it binds must still be exactly the one the editor
   * read, and the destination must be a file the editor may create or replace, outside AI7's own data.
   */
  async prepare(input: PrepareManuscriptExportInput, available: boolean): Promise<ManuscriptExportPreparationProjection> {
    this.#requireAvailable(available);
    requireExport(
      isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
        typeof input.revisionId === 'string' && UUID_PATTERN.test(input.revisionId) &&
        typeof input.reviewDigest === 'string' && DIGEST_PATTERN.test(input.reviewDigest),
      'EXPORT_PREPARATION_INVALID',
      '导出准备请求无效。',
    );
    const target = requireTarget(input.target);
    const options = requireOptions(input.options);
    const destination = await this.#requireDestination(input.destination);
    const resolved = await this.#resolve(input.bookId, target, false);
    requireExport(resolved.revisionId === input.revisionId, 'EXPORT_REVIEW_CHANGED', '稿件在查看导出后有了新的修订版，请重新查看导出。');
    const plan = await this.#plan(input.bookId, resolved, options);
    const rendered = this.#render(plan.input, true);
    const review = this.#reviewOf(input.bookId, resolved, options, plan, rendered);
    requireExport(review.reviewDigest === input.reviewDigest, 'EXPORT_REVIEW_CHANGED', '导出保真审阅在查看后有了变化，请重新查看导出。');
    const payload = rendered.bytes!;
    const preparationId = randomUUID();
    const effectIntentId = randomUUID();
    const createdAt = new Date().toISOString();
    const payloadSha256 = sha256Hex(payload);
    const fidelityJson = canonicalJson(review.fidelity);
    const record = canonicalRecord({
      schema: PREPARATION_SCHEMA,
      preparationId,
      effectIntentId,
      bookId: input.bookId,
      targetKind: resolved.targetKind,
      targetId: resolved.targetId,
      revisionId: resolved.revisionId,
      revisionDigest: resolved.revisionDigest,
      revisionLabel: resolved.revisionLabel,
      milestoneLabel: resolved.milestoneLabel,
      format: 'docx',
      options,
      fidelitySha256: sha256Hex(fidelityJson),
      degraded: review.degraded,
      reviewDigest: review.reviewDigest,
      fileName: destination.fileName,
      destination: destination.path,
      disposition: destination.disposition,
      payloadSha256,
      payloadBytes: payload.byteLength,
      policyId: POLICY.id,
      policyVersion: POLICY.version,
      writer: DOCX_EXPORT_WRITER_IDENTITY,
      createdAt,
    });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO export_preparations(
           preparation_id, effect_intent_id, book_id, target_kind, target_id, revision_id, revision_digest, format,
           options_json, fidelity_json, degraded, review_digest, file_name, destination, disposition, payload_sha256,
           payload_bytes, policy_id, policy_version, created_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'docx', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        preparationId, effectIntentId, input.bookId, resolved.targetKind, resolved.targetId, resolved.revisionId,
        resolved.revisionDigest, canonicalJson(options), fidelityJson, review.degraded ? 1 : 0, review.reviewDigest,
        destination.fileName, destination.path, destination.disposition, payloadSha256, payload.byteLength, POLICY.id,
        POLICY.version, createdAt, record.json, record.digest,
      );
    });
    return this.#preparationProjection(this.#preparationRow(input.bookId, preparationId));
  }

  /**
   * `按上述方式导出` (External Export Policy v2, per-file steps 2 to 5): the payload is written again and must be
   * the prepared one, the destination must still be what the dialog resolved, and only then is the approval
   * recorded and the file written atomically, with its receipt or its classified outcome. An approval already
   * given answers with what it came to — never a second write.
   */
  async approve(input: ApproveManuscriptExportInput, available: boolean): Promise<ManuscriptExportReceiptProjection> {
    this.#requireAvailable(available);
    requireExport(
      isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
        typeof input.preparationId === 'string' && UUID_PATTERN.test(input.preparationId),
      'EXPORT_APPROVAL_INVALID',
      '导出批准请求无效。',
    );
    const row = this.#preparationRow(input.bookId, input.preparationId);
    const preparation = this.#preparationProjection(row);
    const prior = this.#outcomeRow(input.preparationId);
    if (prior !== undefined) return this.#receiptProjection(row, prior);
    const resolved = this.#preparedTarget(input.bookId, row);
    const plan = await this.#plan(input.bookId, resolved, preparation.options);
    const rendered = this.#render(plan.input, true);
    const payload = rendered.bytes!;
    requireExport(sha256Hex(payload) === preparation.technical.payloadDigest, 'EXPORT_PAYLOAD_CHANGED',
      '稿件或标记在准备导出后有了变化，请重新准备导出。');
    const state = await targetState(preparation.destination);
    requireExport(
      (preparation.disposition === 'create' && state === 'absent') || (preparation.disposition === 'replace' && state === 'file'),
      'EXPORT_TARGET_CHANGED',
      '所选位置在准备后发生了变化，请重新选择保存位置。',
    );
    const approvalId = randomUUID();
    const approvedAt = new Date().toISOString();
    const approval = canonicalRecord({
      schema: APPROVAL_SCHEMA,
      approvalId,
      preparationId: input.preparationId,
      effectIntentId: preparation.technical.effectIntentId,
      payloadSha256: preparation.technical.payloadDigest,
      actor: ACTOR,
      interaction: 'export-as-stated',
      approvedAt,
    });
    transact(this.#db, () => {
      requireExport(this.#outcomeRow(input.preparationId) === undefined, 'EXPORT_ALREADY_APPROVED', '这次导出已经批准过。');
      this.#db.prepare(
        `INSERT INTO export_approvals(
           approval_id, preparation_id, effect_intent_id, payload_sha256, actor, interaction, approved_at, canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, 'export-as-stated', ?, ?, ?)`,
      ).run(approvalId, input.preparationId, preparation.technical.effectIntentId, preparation.technical.payloadDigest, ACTOR,
        approvedAt, approval.json, approval.digest);
    });
    const written = await writeAtomically(preparation.destination, payload, preparation.technical.payloadDigest,
      preparation.disposition, preparation.technical.effectIntentId);
    const receiptId = randomUUID();
    const recordedAt = new Date().toISOString();
    const verified = written.outcome === 'created' || written.outcome === 'replaced' ? written : null;
    const failureCode = written.outcome === 'failed' || written.outcome === 'ambiguous' ? written.code : null;
    const receipt = canonicalRecord({
      schema: RECEIPT_SCHEMA,
      receiptId,
      preparationId: input.preparationId,
      approvalId,
      effectIntentId: preparation.technical.effectIntentId,
      outcome: written.outcome,
      finalPath: preparation.destination,
      byteLength: verified?.bytes ?? null,
      fileSha256: verified?.sha256 ?? null,
      failureCode,
      recordedAt,
    });
    transact(this.#db, () => {
      this.#db.prepare(
        `INSERT INTO export_receipts(
           receipt_id, preparation_id, approval_id, outcome, final_path, byte_length, file_sha256, failure_code, recorded_at,
           canonical_json, sha256
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(receiptId, input.preparationId, approvalId, written.outcome, preparation.destination, verified?.bytes ?? null,
        verified?.sha256 ?? null, failureCode, recordedAt, receipt.json, receipt.digest);
    });
    return this.#receiptProjection(row, this.#outcomeRow(input.preparationId)!);
  }

  /** What one approved export came to, as the main process reads it before revealing the file. */
  receipt(input: InspectManuscriptExportReceiptInput): ManuscriptExportReceiptProjection {
    requireExport(
      isRecord(input) && typeof input.bookId === 'string' && UUID_PATTERN.test(input.bookId) &&
        typeof input.preparationId === 'string' && UUID_PATTERN.test(input.preparationId),
      'EXPORT_RECEIPT_INVALID',
      '导出回执请求无效。',
    );
    const row = this.#preparationRow(input.bookId, input.preparationId);
    const outcome = this.#outcomeRow(input.preparationId);
    requireExport(outcome !== undefined, 'EXPORT_RECEIPT_NOT_FOUND', '这次导出还没有批准。');
    return this.#receiptProjection(row, outcome);
  }

  /** The Book's approved exports newest first, each with what it came to, for 交付物. */
  records(bookId: string): ManuscriptExportReceiptProjection[] {
    const rows = this.#db.prepare(
      `SELECT p.preparation_id FROM export_preparations p
       JOIN export_approvals a ON a.preparation_id = p.preparation_id
       WHERE p.book_id = ? ORDER BY a.approved_at DESC, a.rowid DESC LIMIT ?`,
    ).all(bookId, MAX_EXPORT_RECORDS_LISTED) as SqlRow[];
    return rows.map((entry) => {
      const preparationId = text(entry.preparation_id);
      return this.#receiptProjection(this.#preparationRow(bookId, preparationId), this.#outcomeRow(preparationId)!);
    });
  }

  // ---- resolving ------------------------------------------------------------------------------------

  #requireAvailable(available: boolean): void {
    requireExport(available, 'EXPORT_POLICY_UNAVAILABLE', '对外导出策略未通过本次启动的校验，导出不可用。');
  }

  async #requireDestination(value: unknown): Promise<{ path: string; fileName: string; disposition: ManuscriptExportDisposition }> {
    requireExport(
      typeof value === 'string' && value.isWellFormed() && value.length > 0 && value.length <= MAX_EXPORT_DESTINATION_CODE_UNITS &&
        !value.includes('\u0000') && isAbsolute(value),
      'EXPORT_DESTINATION_INVALID',
      '所选保存位置无效。',
    );
    requireExport(extname(value).toLowerCase() === '.docx', 'EXPORT_DESTINATION_INVALID', '请以 .docx 作为文件名的结尾。');
    const fileName = basename(value);
    requireExport(fileName.length > 0 && fileName.length <= 255, 'EXPORT_DESTINATION_INVALID', '所选文件名无效。');
    let directory: string;
    try {
      directory = await realpath(dirname(value));
      requireExport((await lstat(directory)).isDirectory(), 'EXPORT_DESTINATION_INVALID', '所选保存位置不是文件夹。');
    } catch (error) {
      if (error instanceof ExportLedgerError) throw error;
      throw new ExportLedgerError('EXPORT_DESTINATION_INVALID', '所选文件夹无法访问。');
    }
    requireExport(!isInsideOrEqual(this.#environment.dataRoot, directory), 'EXPORT_DESTINATION_INVALID',
      '不能导出到 AI7 保存数据的位置，请选择别的文件夹。');
    const state = await targetState(value);
    requireExport(state !== 'other', 'EXPORT_DESTINATION_INVALID', '所选位置不是可以写入的文件。');
    return { path: value, fileName, disposition: state === 'file' ? 'replace' : 'create' };
  }

  /** The Book's primary Manuscript on its working branch, with how far its working state is ahead of its revision. */
  #head(bookId: string): { manuscriptId: string; branchId: string; revisionId: string; journalSequence: number; lastCheckpointSequence: number; bookTitle: string } {
    const rows = this.#db.prepare(
      `SELECT b.title, m.manuscript_id, bws.branch_id, bws.base_revision_id, bws.journal_sequence, bws.last_checkpoint_sequence
       FROM books b
       JOIN manuscripts m ON m.book_id = b.book_id AND m.role = 'primary'
       JOIN branch_working_state bws ON bws.manuscript_id = m.manuscript_id
       WHERE b.book_id = ?`,
    ).all(bookId) as SqlRow[];
    requireExport(rows.length === 1, 'EXPORT_TARGET_NOT_FOUND', '这本书还没有可以导出的稿件。');
    const row = rows[0]!;
    return {
      bookTitle: text(row.title),
      manuscriptId: text(row.manuscript_id),
      branchId: text(row.branch_id),
      revisionId: text(row.base_revision_id),
      journalSequence: integer(row.journal_sequence),
      lastCheckpointSequence: integer(row.last_checkpoint_sequence),
    };
  }

  #revision(revisionId: string): { revisionLabel: string; revisionDigest: string; manuscriptId: string; branchId: string } {
    const row = this.#db.prepare(
      'SELECT revision_label, revision_digest, manuscript_id, branch_id FROM manuscript_revisions WHERE revision_id = ?',
    ).get(revisionId) as SqlRow | undefined;
    requireExport(row !== undefined, 'EXPORT_TARGET_NOT_FOUND', '所选版本不存在。');
    const revisionDigest = text(row.revision_digest);
    requireExport(DIGEST_PATTERN.test(revisionDigest), 'EXPORT_RECORD_INVALID', '修订版摘要无效。');
    return { revisionLabel: text(row.revision_label), revisionDigest, manuscriptId: text(row.manuscript_id), branchId: text(row.branch_id) };
  }

  /**
   * The exact version a request names. The current revision is the working branch's; when its working state
   * holds edits no revision has, the review saves them as one (`save`) and a preparation refuses, because the
   * review the editor read was of another version.
   */
  async #resolve(bookId: string, target: ManuscriptExportTargetInput, save: boolean): Promise<ResolvedTarget> {
    let head = this.#head(bookId);
    if (target.kind === 'milestone') {
      const row = this.#db.prepare(
        `SELECT mv.milestone_id, mv.label, mv.revision_id FROM milestone_versions mv
         WHERE mv.milestone_id = ? AND mv.manuscript_id = ? AND mv.branch_id = ?`,
      ).get(target.milestoneId, head.manuscriptId, head.branchId) as SqlRow | undefined;
      requireExport(row !== undefined, 'EXPORT_TARGET_NOT_FOUND', '所选里程碑版本不属于这本书的稿件。');
      const revisionId = text(row.revision_id);
      const revision = this.#revision(revisionId);
      return {
        kind: 'milestone', targetKind: 'milestone-version', targetId: text(row.milestone_id), milestoneId: text(row.milestone_id),
        milestoneLabel: text(row.label), revisionId, revisionLabel: revision.revisionLabel, revisionDigest: revision.revisionDigest,
        manuscriptId: head.manuscriptId, branchId: head.branchId, bookTitle: head.bookTitle, savedForExport: false,
      };
    }
    let savedForExport = false;
    if (head.journalSequence > head.lastCheckpointSequence) {
      requireExport(save, 'EXPORT_REVIEW_CHANGED', '稿件在查看导出后又有修改，请重新查看导出。');
      await this.#saveRevision(head.manuscriptId, head.branchId);
      head = this.#head(bookId);
      savedForExport = true;
    }
    const revision = this.#revision(head.revisionId);
    return {
      kind: 'current', targetKind: 'manuscript-revision', targetId: head.revisionId, milestoneId: null, milestoneLabel: null,
      revisionId: head.revisionId, revisionLabel: revision.revisionLabel, revisionDigest: revision.revisionDigest,
      manuscriptId: head.manuscriptId, branchId: head.branchId, bookTitle: head.bookTitle, savedForExport,
    };
  }

  /** Save the working state as a revision for the export, in bounded batches, yielding between them. */
  async #saveRevision(manuscriptId: string, branchId: string): Promise<void> {
    const owner = this.#environment.checkpointOwner;
    const work = owner.createManuscriptCheckpointWork(manuscriptId, branchId, EXPORT_CHECKPOINT_PURPOSE);
    if (work.workId === null) return;
    try {
      for (;;) {
        const progress = owner.advanceManuscriptCheckpointWork(work.workId);
        if (progress.done) break;
        await new Promise<void>((resolveYield) => setImmediate(resolveYield));
      }
      owner.finalizeManuscriptCheckpointWork(work.workId, (_checkpoint, purpose) => {
        requireExport(purpose === EXPORT_CHECKPOINT_PURPOSE, 'EXPORT_CHECKPOINT_INVALID', '导出修订版的用途无效。');
      });
    } catch (error) {
      owner.cancelManuscriptCheckpointWork(work.workId);
      throw error;
    }
  }

  /** The version a preparation froze, read again exactly: a current revision stays that revision. */
  #preparedTarget(bookId: string, row: SqlRow): ResolvedTarget {
    const head = this.#head(bookId);
    const revisionId = text(row.revision_id);
    const revision = this.#revision(revisionId);
    requireExport(revision.revisionDigest === text(row.revision_digest) && revision.manuscriptId === head.manuscriptId,
      'EXPORT_RECORD_INVALID', '导出准备不再对应其精确修订版。');
    const milestone = text(row.target_kind) === 'milestone-version';
    const label = milestone
      ? (this.#db.prepare('SELECT label FROM milestone_versions WHERE milestone_id = ?').get(text(row.target_id)) as SqlRow | undefined)
      : undefined;
    return {
      kind: milestone ? 'milestone' : 'current',
      targetKind: milestone ? 'milestone-version' : 'manuscript-revision',
      targetId: text(row.target_id),
      milestoneId: milestone ? text(row.target_id) : null,
      milestoneLabel: label === undefined ? null : text(label.label),
      revisionId,
      revisionLabel: revision.revisionLabel,
      revisionDigest: revision.revisionDigest,
      manuscriptId: head.manuscriptId,
      branchId: head.branchId,
      bookTitle: head.bookTitle,
      savedForExport: false,
    };
  }

  // ---- the export input ---------------------------------------------------------------------------------

  /** Everything the file is written from: the version's blocks, its source, the mapping and the marks on it. */
  async #plan(bookId: string, target: ResolvedTarget, options: ManuscriptExportOptions): Promise<ExportPlan> {
    const blocks = (this.#db.prepare(
      'SELECT block_id, position, kind, level, text, digest FROM manuscript_block_versions WHERE revision_id = ? ORDER BY position',
    ).all(target.revisionId) as SqlRow[]).map((row): DocxExportBlock => ({
      blockId: text(row.block_id),
      position: integer(row.position),
      kind: text(row.kind) as DocxExportBlock['kind'],
      level: row.level === null ? null : integer(row.level),
      text: text(row.text),
      digest: text(row.digest),
    }));
    requireExport(blocks.length > 0, 'EXPORT_TARGET_NOT_FOUND', '所选版本没有内容块。');
    const source = this.#db.prepare(
      `SELECT sv.source_version_id, sv.object_digest, sv.working_object_digest, sv.converter_identity, sv.parser_identity, sv.format
       FROM manuscript_revisions mr JOIN source_versions sv ON sv.source_version_id = mr.source_version_id
       WHERE mr.revision_id = ? AND sv.book_id = ?`,
    ).get(target.revisionId, bookId) as SqlRow | undefined;
    requireExport(source !== undefined, 'EXPORT_TARGET_NOT_FOUND', '所选版本缺少来源版本。');
    const sourceVersionId = text(source.source_version_id);
    const objectDigest = text(source.object_digest);
    const converter = nullableText(source.converter_identity);
    let exportSource: DocxExportSource;
    let mapping: DocxExportSourceRow[] = [];
    if (converter !== null) {
      const working = nullableText(source.working_object_digest);
      exportSource = { kind: 'fresh', reason: 'converted', scan: working === null ? null : await this.#environment.readObject(working), converter };
    } else if (text(source.format) !== 'DOCX' || source.parser_identity === null) {
      exportSource = { kind: 'fresh', reason: 'no-mapping', scan: null, converter: null };
    } else {
      mapping = this.#mapping(target.revisionId, sourceVersionId);
      const original = await this.#environment.readObject(objectDigest);
      exportSource = mapping.length === 0
        ? { kind: 'fresh', reason: 'no-mapping', scan: original, converter: null }
        : { kind: 'mapped', original, rows: mapping, textBoxes: this.#textBoxChoice(sourceVersionId, mapping) };
    }
    const marks = this.#marks(target.branchId, blocks);
    const input: DocxExportInput = { title: target.bookTitle, blocks, marks, options, source: exportSource };
    const inputDigest = canonicalRecord({
      schema: INPUT_SCHEMA,
      writer: DOCX_EXPORT_WRITER_IDENTITY,
      revisionId: target.revisionId,
      revisionDigest: target.revisionDigest,
      source: exportSource.kind === 'mapped' ? { kind: 'mapped', objectDigest, textBoxes: exportSource.textBoxes } : { kind: 'fresh', reason: exportSource.reason, objectDigest },
      mapping: sha256Hex(canonicalJson(mapping)),
      marks: sha256Hex(canonicalJson(marks)),
      options,
      title: target.bookTitle,
    }).digest;
    return { input, inputDigest, sourceVersionId };
  }

  /**
   * The source-paragraph mapping of the import or reimport that made the version's lineage (ADR 0086 §3): the
   * nearest revision, the version itself or an ancestor with the same Source Version, that recorded one.
   */
  #mapping(revisionId: string, sourceVersionId: string): DocxExportSourceRow[] {
    const revision = this.#db.prepare('SELECT source_version_id, parent_revision_id FROM manuscript_revisions WHERE revision_id = ?');
    const rows = this.#db.prepare(
      `SELECT block_id, source_part, source_paragraph_index, source_paragraph_digest FROM manuscript_block_sources
       WHERE revision_id = ? AND source_version_id = ? ORDER BY source_paragraph_index`,
    );
    let current: string | null = revisionId;
    for (let step = 0; current !== null && step < 100_000; step += 1) {
      const row = revision.get(current) as SqlRow | undefined;
      if (row === undefined || text(row.source_version_id) !== sourceVersionId) return [];
      const found = rows.all(current, sourceVersionId) as SqlRow[];
      if (found.length > 0) {
        return found.map((entry) => ({
          blockId: text(entry.block_id),
          sourcePart: text(entry.source_part) === 'text-box' ? 'text-box' : 'body',
          sourceParagraphIndex: integer(entry.source_paragraph_index),
          sourceParagraphDigest: text(entry.source_paragraph_digest),
        }));
      }
      current = nullableText(row.parent_revision_id);
    }
    return [];
  }

  /** The text-box choice the import recorded, or what its mapping shows when it recorded none (a reimport). */
  #textBoxChoice(sourceVersionId: string, mapping: ReadonlyArray<DocxExportSourceRow>): 'retain' | 'merge' {
    const row = this.#db.prepare(
      `SELECT c.choice FROM import_fidelity_reviews r
       JOIN import_fidelity_choices c ON c.fidelity_review_id = r.fidelity_review_id AND c.category_key = 'text-boxes'
       WHERE r.source_version_id = ?`,
    ).get(sourceVersionId) as SqlRow | undefined;
    if (row !== undefined) return text(row.choice) === 'merge' ? 'merge' : 'retain';
    return mapping.some((entry) => entry.sourcePart === 'text-box') ? 'merge' : 'retain';
  }

  /**
   * Every live 批注, 备注 and pending 修改建议 on the version's blocks, with where it stands on that exact text: the
   * live range when the working block is still the version's block and the mark is exact there, the pinned range
   * when the version holds exactly the text the mark was pinned on, and otherwise nowhere (`moved`). An applied
   * or rejected suggestion is no pending change, and a highlight never leaves.
   */
  #marks(branchId: string, blocks: ReadonlyArray<DocxExportBlock>): DocxExportMark[] {
    const byId = new Map(blocks.map((block) => [block.blockId, block]));
    const rows = this.#db.prepare(
      `SELECT em.mark_id, em.block_id, em.kind, em.status, em.anchor_state, em.from_grapheme, em.to_grapheme,
              em.pinned_block_digest, em.pinned_from_grapheme, em.pinned_to_grapheme, em.body, em.source_kind,
              em.source_label, em.created_at, wb.digest working_digest
       FROM editorial_marks em
       LEFT JOIN working_blocks wb ON wb.branch_id = em.branch_id AND wb.block_id = em.block_id
       WHERE em.branch_id = ? AND em.status IN ('open', 'resolved', 'applied') AND em.kind <> 'personal-highlight'
       ORDER BY em.created_at, em.mark_id`,
    ).all(branchId) as SqlRow[];
    const item = this.#db.prepare('SELECT item_id, current_text, proposed_text FROM proposal_change_items WHERE mark_id = ?');
    const decision = this.#db.prepare('SELECT disposition, edited_text FROM proposal_item_decisions WHERE item_id = ? ORDER BY ordinal DESC LIMIT 1');
    const replies = this.#db.prepare('SELECT body, created_at FROM editorial_mark_replies WHERE mark_id = ? ORDER BY ordinal');
    const marks: DocxExportMark[] = [];
    for (const row of rows) {
      const block = byId.get(text(row.block_id));
      if (block === undefined) continue;
      const kind = text(row.kind) as DocxExportMark['kind'];
      const status = text(row.status);
      let suggestion: DocxExportMark['suggestion'] = null;
      if (kind === 'change-suggestion') {
        if (status !== 'open') continue;
        const found = item.get(text(row.mark_id)) as SqlRow | undefined;
        requireExport(found !== undefined, 'EXPORT_RECORD_INVALID', '修改建议缺少提案修改项。');
        const latest = decision.get(text(found.item_id)) as SqlRow | undefined;
        const disposition = latest === undefined ? null : text(latest.disposition);
        if (disposition === 'rejected') continue;
        suggestion = {
          currentText: text(found.current_text),
          proposedText: disposition === 'accepted-with-edit' ? text(latest!.edited_text) : text(found.proposed_text),
        };
      }
      const exactHere = text(row.anchor_state) === 'exact' && nullableText(row.working_digest) === block.digest;
      const standing: DocxExportMark['standing'] = exactHere
        ? { state: 'exact', fromGrapheme: integer(row.from_grapheme), toGrapheme: integer(row.to_grapheme) }
        : text(row.pinned_block_digest) === block.digest
          ? { state: 'exact', fromGrapheme: integer(row.pinned_from_grapheme), toGrapheme: integer(row.pinned_to_grapheme) }
          : { state: 'moved' };
      const source = text(row.source_kind);
      marks.push({
        markId: text(row.mark_id),
        blockId: block.blockId,
        kind,
        standing,
        authorLabel: kind === 'editor-note' ? EDITOR_NOTE_AUTHOR_LABEL : source === 'editor' ? EDITOR_AUTHOR_LABEL : text(row.source_label),
        createdAt: text(row.created_at),
        body: kind === 'change-suggestion' ? '' : text(row.body),
        replies: kind === 'annotation'
          ? (replies.all(text(row.mark_id)) as SqlRow[]).map((reply) => ({ body: text(reply.body), createdAt: text(reply.created_at) }))
          : [],
        resolved: kind === 'annotation' && status === 'resolved',
        suggestion,
      });
    }
    return marks;
  }

  #render(input: DocxExportInput, emit: boolean): DocxExportResult {
    try {
      return renderDocxExport(input, { emit });
    } catch (error) {
      if (error instanceof DocxExportError && error.code === 'DOCX_EXPORT_SOURCE_UNSUPPORTED' && input.source.kind === 'mapped') {
        // A document that binds WordprocessingML to no prefix is written fresh from its blocks.
        return renderDocxExport({ ...input, source: { kind: 'fresh', reason: 'no-mapping', scan: input.source.original, converter: null } }, { emit });
      }
      if (error instanceof DocxExportError) throw new ExportLedgerError(error.code, error.message);
      throw error;
    }
  }

  #reviewOf(
    bookId: string,
    target: ResolvedTarget,
    options: ManuscriptExportOptions,
    plan: ExportPlan,
    rendered: DocxExportResult,
  ): ManuscriptExportReviewProjection {
    const targetProjection = this.#targetProjection(target);
    const fidelity: ExportFidelityRowProjection[] = rendered.fidelity;
    const reviewDigest = canonicalRecord({
      schema: REVIEW_SCHEMA,
      bookId,
      target: { kind: target.targetKind, id: target.targetId, revisionId: target.revisionId },
      revisionDigest: target.revisionDigest,
      format: 'docx',
      options,
      inputDigest: plan.inputDigest,
      fidelity,
    }).digest;
    const restorationLine = rendered.restoration === 'from-original'
      ? `未改过、也没有带出标记的 ${rendered.restoredBlocks} 段从原文件恢复；其余 ${rendered.regeneratedBlocks} 段按稿件文字重新写出。`
      : '这份稿件没有可以对应的原文件段落，导出按稿件文字重新生成 DOCX。';
    return {
      bookId,
      bookTitle: target.bookTitle,
      target: targetProjection,
      savedForExport: target.savedForExport,
      format: 'docx',
      formats: EXPORT_FORMATS,
      options,
      restoration: rendered.restoration,
      restorationLine,
      formatLine: EXPORT_DOCX_LINE,
      fidelity,
      degraded: rendered.degraded,
      suggestedFileName: suggestedExportFileName(target.bookTitle, target.milestoneLabel ?? target.revisionLabel),
      reviewDigest,
      technical: {
        revisionDigest: target.revisionDigest,
        sourceVersionId: plan.sourceVersionId,
        writerIdentity: DOCX_EXPORT_WRITER_IDENTITY,
        inputDigest: plan.inputDigest,
      },
    };
  }

  #targetProjection(target: ResolvedTarget): ManuscriptExportTargetProjection {
    return {
      kind: target.kind,
      milestoneId: target.milestoneId,
      milestoneLabel: target.milestoneLabel,
      revisionId: target.revisionId,
      revisionLabel: target.revisionLabel,
    };
  }

  // ---- reading the ledger -----------------------------------------------------------------------------

  #preparationRow(bookId: string, preparationId: string): SqlRow {
    const row = this.#db.prepare('SELECT * FROM export_preparations WHERE preparation_id = ?').get(preparationId) as SqlRow | undefined;
    requireExport(row !== undefined && text(row.book_id) === bookId, 'EXPORT_PREPARATION_NOT_FOUND', '这次导出准备不存在或不属于这本书。');
    return row;
  }

  #outcomeRow(preparationId: string): SqlRow | undefined {
    return this.#db.prepare(
      `SELECT a.approval_id, a.effect_intent_id approval_intent_id, a.payload_sha256 approval_payload, a.actor, a.approved_at,
              a.canonical_json approval_json, a.sha256 approval_sha256,
              r.receipt_id, r.approval_id receipt_approval_id, r.outcome, r.final_path, r.byte_length, r.file_sha256, r.failure_code,
              r.recorded_at, r.canonical_json receipt_json, r.sha256 receipt_sha256
       FROM export_approvals a LEFT JOIN export_receipts r ON r.preparation_id = a.preparation_id
       WHERE a.preparation_id = ?`,
    ).get(preparationId) as SqlRow | undefined;
  }

  #preparationProjection(row: SqlRow): ManuscriptExportPreparationProjection {
    const preparationId = text(row.preparation_id);
    const options = requireOptions(parseCanonicalJson(text(row.options_json)));
    const fidelityJson = text(row.fidelity_json);
    const fidelity = parseCanonicalJson(fidelityJson);
    requireExport(Array.isArray(fidelity), 'EXPORT_RECORD_INVALID', '导出保真审阅记录无效。');
    const targetKind = text(row.target_kind);
    const revisionId = text(row.revision_id);
    const revision = this.#revision(revisionId);
    const milestoneLabel = targetKind === 'milestone-version'
      ? text((this.#db.prepare('SELECT label FROM milestone_versions WHERE milestone_id = ?').get(text(row.target_id)) as SqlRow | undefined)?.label)
      : null;
    const disposition = text(row.disposition) as ManuscriptExportDisposition;
    const recordDigest = requireRecord(row.canonical_json, row.sha256, {
      schema: PREPARATION_SCHEMA,
      preparationId,
      effectIntentId: text(row.effect_intent_id),
      bookId: text(row.book_id),
      targetKind,
      targetId: text(row.target_id),
      revisionId,
      revisionDigest: text(row.revision_digest),
      revisionLabel: revision.revisionLabel,
      milestoneLabel,
      format: text(row.format),
      options,
      fidelitySha256: sha256Hex(fidelityJson),
      degraded: integer(row.degraded) === 1,
      reviewDigest: text(row.review_digest),
      fileName: text(row.file_name),
      destination: text(row.destination),
      disposition,
      payloadSha256: text(row.payload_sha256),
      payloadBytes: integer(row.payload_bytes),
      policyId: text(row.policy_id),
      policyVersion: text(row.policy_version),
      createdAt: text(row.created_at),
    });
    return {
      bookId: text(row.book_id),
      preparationId,
      target: {
        kind: targetKind === 'milestone-version' ? 'milestone' : 'current',
        milestoneId: targetKind === 'milestone-version' ? text(row.target_id) : null,
        milestoneLabel,
        revisionId,
        revisionLabel: revision.revisionLabel,
      },
      options,
      fidelity: fidelity as ExportFidelityRowProjection[],
      degraded: integer(row.degraded) === 1,
      fileName: text(row.file_name),
      destination: text(row.destination),
      disposition,
      dispositionLabel: EXPORT_DISPOSITION_LABELS[disposition],
      payloadBytes: integer(row.payload_bytes),
      preparedAt: text(row.created_at),
      technical: {
        effectIntentId: text(row.effect_intent_id),
        payloadDigest: text(row.payload_sha256),
        recordDigest,
        policy: `${text(row.policy_id)} ${text(row.policy_version)}`,
      },
    };
  }

  #receiptProjection(preparationRow: SqlRow, outcome: SqlRow): ManuscriptExportReceiptProjection {
    const preparation = this.#preparationProjection(preparationRow);
    const approvalId = text(outcome.approval_id);
    requireRecord(outcome.approval_json, outcome.approval_sha256, {
      schema: APPROVAL_SCHEMA,
      approvalId,
      preparationId: preparation.preparationId,
      effectIntentId: preparation.technical.effectIntentId,
      payloadSha256: preparation.technical.payloadDigest,
      actor: ACTOR,
      interaction: 'export-as-stated',
      approvedAt: text(outcome.approved_at),
    });
    requireExport(text(outcome.approval_intent_id) === preparation.technical.effectIntentId &&
      text(outcome.approval_payload) === preparation.technical.payloadDigest && text(outcome.actor) === ACTOR,
    'EXPORT_RECORD_INVALID', '导出批准与其准备不一致。');
    const base = {
      bookId: preparation.bookId,
      preparationId: preparation.preparationId,
      target: preparation.target,
      fileName: preparation.fileName,
      destination: preparation.destination,
    };
    if (outcome.receipt_id === null) {
      return {
        ...base,
        outcome: 'ambiguous',
        outcomeLabel: EXPORT_OUTCOME_LABELS.ambiguous,
        detail: FAILURE_DETAILS.EXPORT_INTERRUPTED!,
        byteLength: null,
        recordedAt: null,
        revealAvailable: false,
        technical: { approvalId, receiptId: null, receiptDigest: null, fileSha256: null, failureCode: 'EXPORT_INTERRUPTED' },
      };
    }
    const receiptId = text(outcome.receipt_id);
    const kind = text(outcome.outcome) as ManuscriptExportReceiptProjection['outcome'];
    const byteLength = outcome.byte_length === null ? null : integer(outcome.byte_length);
    const fileSha256 = nullableText(outcome.file_sha256);
    const failureCode = nullableText(outcome.failure_code);
    const receiptDigest = requireRecord(outcome.receipt_json, outcome.receipt_sha256, {
      schema: RECEIPT_SCHEMA,
      receiptId,
      preparationId: preparation.preparationId,
      approvalId,
      effectIntentId: preparation.technical.effectIntentId,
      outcome: kind,
      finalPath: text(outcome.final_path),
      byteLength,
      fileSha256,
      failureCode,
      recordedAt: text(outcome.recorded_at),
    });
    requireExport(text(outcome.receipt_approval_id) === approvalId && text(outcome.final_path) === preparation.destination,
      'EXPORT_RECORD_INVALID', '导出回执与其批准不一致。');
    const exported = kind === 'created' || kind === 'replaced';
    return {
      ...base,
      outcome: kind,
      outcomeLabel: exported ? EXPORT_OUTCOME_LABELS.exported : kind === 'ambiguous' ? EXPORT_OUTCOME_LABELS.ambiguous : EXPORT_OUTCOME_LABELS.failed,
      detail: exported
        ? kind === 'created' ? `已新建「${preparation.fileName}」。` : `已替换所选位置的「${preparation.fileName}」。`
        : FAILURE_DETAILS[failureCode ?? ''] ?? FAILURE_DETAILS.EXPORT_COMMIT_UNCERTAIN!,
      byteLength,
      recordedAt: text(outcome.recorded_at),
      revealAvailable: exported,
      technical: { approvalId, receiptId, receiptDigest, fileSha256, failureCode },
    };
  }
}

/** The options an export starts from (V2-UX-EXP-023, EXP-024). */
export function defaultExportOptions(): ManuscriptExportOptions {
  return { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS };
}
