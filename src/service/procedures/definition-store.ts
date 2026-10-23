import type { DatabaseSync } from 'node:sqlite';
import type { ProcedureDefinitionDocument, ProcedureDefinitionPin } from '../../shared/protocol/procedures.js';
import { canonicalJson, canonicalRecord, parseCanonicalJson, requireAnalysis, sha256Hex } from '../analysis/canonical.js';
import { preinstalledProcedureDefinitions, allPreinstalledProcedureDefinitions } from './preinstalled.js';
import { REVIEW_CONTRACT_SCHEMA_VERSION } from '../task-authorization.js';

export const PROCEDURE_DEFINITION_SCHEMA_SQL = {
  procedure_definitions: `CREATE TABLE procedure_definitions (
  procedure_id TEXT PRIMARY KEY,
  pre_installed INTEGER NOT NULL CHECK(pre_installed IN (0, 1)),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
  procedure_definition_versions: `CREATE TABLE procedure_definition_versions (
  version_id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL REFERENCES procedure_definitions(procedure_id),
  version INTEGER NOT NULL CHECK(version >= 1),
  document_json TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256) = 64),
  previous_document_sha256 TEXT CHECK(previous_document_sha256 IS NULL OR length(previous_document_sha256) = 64),
  created_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  CHECK((version = 1) = (previous_document_sha256 IS NULL)),
  UNIQUE(procedure_id, version)
) STRICT`,
  procedure_plan_pins: `CREATE TABLE procedure_plan_pins (
  plan_envelope_sha256 TEXT PRIMARY KEY REFERENCES analysis_plan_versions(plan_envelope_sha256),
  task_intent_id TEXT NOT NULL REFERENCES analysis_task_intents(task_intent_id),
  version_id TEXT NOT NULL REFERENCES procedure_definition_versions(version_id),
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64)
) STRICT`,
} as const;

export const PROCEDURE_DEFINITION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(PROCEDURE_DEFINITION_SCHEMA_SQL).flatMap((table) => ['update', 'delete'].map((operation) => [
    `${table}_no_${operation}`,
    `CREATE TRIGGER ${table}_no_${operation} BEFORE ${operation.toUpperCase()} ON ${table}
    BEGIN SELECT RAISE(ABORT, 'PROCEDURE_DEFINITION_IMMUTABLE'); END`,
  ])),
);
export const PROCEDURE_DEFINITION_FOREIGN_KEYS = {
  procedure_definition_versions: ['procedure_id>procedure_definitions.procedure_id:NO ACTION/NO ACTION/NONE'],
  procedure_plan_pins: [
    'plan_envelope_sha256>analysis_plan_versions.plan_envelope_sha256:NO ACTION/NO ACTION/NONE',
    'task_intent_id>analysis_task_intents.task_intent_id:NO ACTION/NO ACTION/NONE',
    'version_id>procedure_definition_versions.version_id:NO ACTION/NO ACTION/NONE',
  ],
} as const;

/** The three tables and the initial ten versions commit together, before the terminal schema stamp. */
function insertProcedureVersions(db: DatabaseSync, documents: readonly ProcedureDefinitionDocument[]): void {
  const createdAt = new Date().toISOString();
  for (const document of documents) {
    if (document.version === 1) {
      const identity = canonicalRecord({ procedureId: document.id, preInstalled: true, createdAt });
      db.prepare('INSERT INTO procedure_definitions VALUES (?, 1, ?, ?, ?)').run(document.id, createdAt, identity.json, identity.digest);
    }
    const record = canonicalRecord(document);
    const versionId = `${document.id}@${document.version}`;
    const previous = document.version === 1 ? null : db.prepare('SELECT document_sha256 FROM procedure_definition_versions WHERE procedure_id = ? AND version = ?').get(document.id, document.version - 1)?.document_sha256;
    requireAnalysis(previous === null || typeof previous === 'string', 'PROCEDURE_RECORD_INVALID', '工序前一版本缺失。');
    const version = canonicalRecord({ versionId, procedureId: document.id, version: document.version,
      documentDigest: record.digest, previousDocumentDigest: previous, createdAt });
    db.prepare('INSERT INTO procedure_definition_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(versionId, document.id, document.version, record.json, record.digest, previous, createdAt, version.json, version.digest);
  }
}

export function initializeProcedureDefinitionSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'procedure_definitions'").get() !== undefined;
  if (existing) {
    const legacy = Number(db.prepare('PRAGMA user_version').get()?.user_version) < REVIEW_CONTRACT_SCHEMA_VERSION;
    validateProcedureDefinitions(db, legacy);
    const count = Number(db.prepare('SELECT count(*) total FROM procedure_definition_versions').get()!.total);
    if (count === allPreinstalledProcedureDefinitions().length) return;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!existing) {
      for (const sql of Object.values(PROCEDURE_DEFINITION_SCHEMA_SQL)) db.exec(sql);
      for (const sql of Object.values(PROCEDURE_DEFINITION_TRIGGER_SQL)) db.exec(sql);
    }
    insertProcedureVersions(db, existing ? preinstalledProcedureDefinitions().filter((document) => document.version === 2) : allPreinstalledProcedureDefinitions());
    validateProcedureDefinitions(db);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Procedure definition schema rollback failed.');
    }
    throw error;
  }
}

/** Both generations have fixed bytes; a current store may lose neither predecessors nor successors. */
export function validateProcedureDefinitions(db: DatabaseSync, allowLegacy = false): void {
  const identities = db.prepare('SELECT * FROM procedure_definitions').all();
  const versions = db.prepare('SELECT * FROM procedure_definition_versions').all();
  const expected = allowLegacy && versions.length === 10 ? preinstalledProcedureDefinitions(1) : allPreinstalledProcedureDefinitions();
  requireAnalysis(identities.length === 10 && versions.length === expected.length,
    'PROCEDURE_RECORD_INVALID', '预装工序版本不完整。');
  for (const document of expected) {
    const identity = identities.find((row) => row.procedure_id === document.id);
    const row = versions.find((version) => version.procedure_id === document.id && version.version === document.version);
    requireAnalysis(identity !== undefined && row !== undefined, 'PROCEDURE_RECORD_INVALID', '预装工序版本缺失。');
    const previous = document.version === 1 ? null : sha256Hex(canonicalJson(expected.find((entry) => entry.id === document.id && entry.version === document.version - 1)!));
    const identityRecord = canonicalRecord({ procedureId: document.id, preInstalled: true, createdAt: identity.created_at });
    const versionRecord = canonicalRecord({ versionId: `${document.id}@${document.version}`, procedureId: document.id,
      version: document.version, documentDigest: sha256Hex(canonicalJson(document)), previousDocumentDigest: previous, createdAt: row.created_at });
    requireAnalysis(identity.pre_installed === 1 && identity.canonical_json === identityRecord.json && identity.sha256 === identityRecord.digest &&
      row.version_id === `${document.id}@${document.version}` && row.previous_document_sha256 === previous &&
      row.document_json === canonicalJson(document) && row.document_sha256 === sha256Hex(canonicalJson(document)) &&
      row.canonical_json === versionRecord.json && row.sha256 === versionRecord.digest,
    'PROCEDURE_RECORD_INVALID', '预装工序版本或摘要无效。');
  }
}

export function resolveProcedureDefinition(db: DatabaseSync, procedureId: string, version?: number): {
  document: ProcedureDefinitionDocument; pin: ProcedureDefinitionPin;
} {
  const row = version === undefined
    ? db.prepare('SELECT document_json, document_sha256, version FROM procedure_definition_versions WHERE procedure_id = ? ORDER BY version DESC LIMIT 1').get(procedureId)
    : db.prepare('SELECT document_json, document_sha256, version FROM procedure_definition_versions WHERE procedure_id = ? AND version = ?').get(procedureId, version);
  requireAnalysis(row !== undefined && typeof row.document_json === 'string' && typeof row.document_sha256 === 'string' &&
    sha256Hex(row.document_json) === row.document_sha256, 'PROCEDURE_RECORD_INVALID', '工序版本不可用。');
  const document = parseCanonicalJson(row.document_json) as ProcedureDefinitionDocument;
  requireAnalysis(document.id === procedureId && document.version === row.version, 'PROCEDURE_RECORD_INVALID', '工序版本标识无效。');
  return { document, pin: { procedureId, version: document.version, digest: row.document_sha256 } };
}

/** New plans pin the latest matching contract; existing pins are immutable. */
export function recordProcedurePlanPin(db: DatabaseSync, taskIntentId: string, envelopeDigest: string, procedureId: string, version?: number): void {
  const { pin } = resolveProcedureDefinition(db, procedureId, version);
  const record = canonicalRecord({ taskIntentId, planEnvelopeDigest: envelopeDigest, procedure: pin });
  db.prepare('INSERT INTO procedure_plan_pins VALUES (?, ?, ?, ?, ?)')
    .run(envelopeDigest, taskIntentId, `${pin.procedureId}@${pin.version}`, record.json, record.digest);
}

export function readProcedurePlanPin(db: DatabaseSync, envelopeDigest: string): ProcedureDefinitionPin | null {
  const row = db.prepare('SELECT * FROM procedure_plan_pins WHERE plan_envelope_sha256 = ?').get(envelopeDigest);
  if (row === undefined) return null; // History predating revision 85 is never retroactively pinned.
  const version = db.prepare('SELECT procedure_id, version FROM procedure_definition_versions WHERE version_id = ?').get(row.version_id!);
  requireAnalysis(version !== undefined, 'PROCEDURE_RECORD_INVALID', '工序计划引用无效。');
  const { pin } = resolveProcedureDefinition(db, String(version.procedure_id), Number(version.version));
  const expected = canonicalRecord({ taskIntentId: row.task_intent_id, planEnvelopeDigest: envelopeDigest, procedure: pin });
  requireAnalysis(row.canonical_json === expected.json && row.sha256 === expected.digest,
    'PROCEDURE_RECORD_INVALID', '工序计划摘要无效。');
  return pin;
}

export function validateProcedurePlanPins(db: DatabaseSync): void {
  for (const row of db.prepare('SELECT plan_envelope_sha256, task_intent_id FROM procedure_plan_pins').iterate()) {
    readProcedurePlanPin(db, String(row.plan_envelope_sha256));
    requireAnalysis(db.prepare('SELECT 1 FROM analysis_plan_versions WHERE plan_envelope_sha256 = ? AND task_intent_id = ?')
      .get(row.plan_envelope_sha256!, row.task_intent_id!) !== undefined, 'PROCEDURE_RECORD_INVALID', '工序计划任务引用无效。');
  }
}
