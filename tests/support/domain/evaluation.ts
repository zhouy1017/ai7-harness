import { createBaselineRelations } from '../baseline-relations.js';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { WRITING_TASK_SCHEMA_SQL } from '../../../src/service/writing-tasks.js';
import { BOOK_PEOPLE_SCHEMA_SQL } from '../../../src/service/book-people.js';
import { EvaluationCalibrationError, EvaluationCalibrationLedger, EVALUATION_CALIBRATION_SCHEMA_SQL } from '../../../src/service/evaluation-calibration.js';
import type { EvaluationCalibrationOperationsHost } from '../../../src/service/evaluation-calibration-operations.js';
import type { EvaluationMarketHost } from '../../../src/service/evaluation-market.js';
import { EvaluationError, EvaluationRecords, EVALUATION_INITIAL_DRAFT_SCHEMA_SQL, EVALUATION_RECORD_SCHEMA_SQL } from '../../../src/service/evaluation-records.js';
import { LEARNING_ELIGIBILITY_SCHEMA_SQL } from '../../../src/service/learning-eligibility.js';
import { loadBuiltInManuscriptProfile } from '../../../src/service/native-workflow-profile.js';
import { DERIVATIVE_WORKSPACE_SCHEMA_SQL, seedProductionDocumentCategories } from '../../../src/service/production-document-types.js';
import { PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL, PRODUCTION_DOCUMENT_SCHEMA_SQL } from '../../../src/service/production-document-ledger.js';
import { PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL } from '../../../src/service/production-document-origins.js';
import { PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL } from '../../../src/service/production-document-workflow.js';
import { PublicationVersionError, type PublicationVersionStore } from '../../../src/service/publication-versions.js';
import { READERS_REPORT_SCHEMA_SQL } from '../../../src/service/readers-reports.js';
import { SeriesError, SeriesLedger, SERIES_SCHEMA_SQL } from '../../../src/service/series.js';
import type { StoreControl } from '../../../src/service/store-operation-support.js';
import { StoreError } from '../../../src/service/store-records.js';
import { resolveCodeRoot } from '../temp-data-root.js';
import { initializeOutsideOwnerTables } from './outside-tables.js';
import { transaction } from './transaction.js';
export { transaction };

let profileOnce: ReturnType<typeof loadBuiltInManuscriptProfile> | undefined;
async function builtInProfile() { return (profileOnce ??= resolveCodeRoot().then((root) => loadBuiltInManuscriptProfile(root))); }

/** The workflow profile a Production Document follows, as the store pins it. */
export async function domainWorkflowPin() {
  const { projection } = await builtInProfile();
  return { id: projection.id, name: projection.name, version: projection.version, digest: projection.digest };
}

export const evaluationSchemaTiming = { builds: 0, milliseconds: 0 };

/**
 * The domain's own relations, from the production initializers in the order EditorialStore.open runs them, beside the
 * external-owner stubs of `outside-tables.ts` for the Book, the Manuscripts and the publication designations.
 */
export async function evaluationDomainDatabase(): Promise<DatabaseSync> {
  const profile = await builtInProfile();
  const started = performance.now();
  const db = new DatabaseSync(':memory:');
  try {
    initializeOutsideOwnerTables(db);
    createBaselineRelations(db, BOOK_PEOPLE_SCHEMA_SQL);
    createBaselineRelations(db, PRODUCTION_DOCUMENT_SCHEMA_SQL);
    createBaselineRelations(db, PRODUCTION_DOCUMENT_DELIVERY_SCHEMA_SQL);
    createBaselineRelations(db, PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL);
    createBaselineRelations(db, PRODUCTION_DOCUMENT_ORIGIN_SCHEMA_SQL);
    createBaselineRelations(db, EVALUATION_RECORD_SCHEMA_SQL);
    createBaselineRelations(db, LEARNING_ELIGIBILITY_SCHEMA_SQL);
    createBaselineRelations(db, EVALUATION_CALIBRATION_SCHEMA_SQL);
    createBaselineRelations(db, SERIES_SCHEMA_SQL);
    createBaselineRelations(db, EVALUATION_INITIAL_DRAFT_SCHEMA_SQL);
    createBaselineRelations(db, READERS_REPORT_SCHEMA_SQL);
    createBaselineRelations(db, WRITING_TASK_SCHEMA_SQL);
    
    createBaselineRelations(db, DERIVATIVE_WORKSPACE_SCHEMA_SQL); seedProductionDocumentCategories(db);
    evaluationSchemaTiming.builds += 1; evaluationSchemaTiming.milliseconds += performance.now() - started;
    return db;
  } catch (error) { db.close(); throw error; }
}

// ---- seeds and test-owned hosts ------------------------------------------------------------------------------------------------
// Upstream owners (manuscripts, milestones, publication) are seeded as the minimal rows the domain reads; every relation itself
// was made by its production initializer, so a seed that drifted from the schema fails on insert.

const NOW = '2026-11-17T00:00:00.000Z';

/** The domain relations with upstream rows seeded minimally: foreign keys are off, as the outside-owner stubs declare none. */
export async function seededEvaluationDatabase(): Promise<DatabaseSync> {
  const db = await evaluationDomainDatabase();
  db.exec('PRAGMA foreign_keys = OFF');
  return db;
}

export function seedBook(db: DatabaseSync, title: string, bookId: string = randomUUID()): string {
  db.prepare('INSERT INTO books(book_id, stable_identity, title, created_at) VALUES (?, ?, ?, ?)').run(bookId, randomUUID(), title, NOW);
  return bookId;
}

export interface SeededPublication { readonly publicationVersionId: string; readonly ordinal: number; readonly createdAt: string }

export function seedPublication(db: DatabaseSync, bookId: string, ordinal = 1, createdAt: string = NOW): SeededPublication {
  const publicationVersionId = randomUUID();
  db.prepare('INSERT INTO publication_versions(publication_version_id, book_id, ordinal, created_at) VALUES (?, ?, ?, ?)').run(publicationVersionId, bookId, ordinal, createdAt);
  return { publicationVersionId, ordinal, createdAt };
}

/** The Book's latest 发稿版本 as `PublicationVersionStore.current` reads it, from the seeded rows: an external-owner stand-in. */
export function seededPublicationVersions(db: DatabaseSync, withdrawn: ReadonlySet<string> = new Set()): Pick<PublicationVersionStore, 'current'> {
  return {
    current(bookId: string) {
      const row = db.prepare('SELECT publication_version_id, ordinal, created_at FROM publication_versions WHERE book_id = ? ORDER BY ordinal DESC LIMIT 1').get(bookId) as
        { publication_version_id: string; ordinal: number; created_at: string } | undefined;
      if (row === undefined) return null;
      return { withdrawn: withdrawn.has(row.publication_version_id),
        projection: { publicationVersionId: row.publication_version_id, ordinal: row.ordinal, createdAt: row.created_at } } as unknown as ReturnType<PublicationVersionStore['current']>;
    },
  };
}

/** The store's guarded call, test-owned: the listed owners' own errors read as the store's refusals; nothing else is touched. */
export function guarded(...errors: ReadonlyArray<new (...args: never[]) => Error & { readonly code: string }>): <T>(operation: () => T) => T {
  return <T>(operation: () => T): T => {
    try { return operation(); } catch (error) {
      if (errors.some((type) => error instanceof type)) throw new StoreError((error as { code: string }).code, (error as Error).message);
      throw error;
    }
  };
}

export const calibrationCall = guarded(EvaluationCalibrationError, EvaluationError);
export const seriesCall = guarded(SeriesError);
export const publicationCall = guarded(PublicationVersionError);

export function calibrationHost(db: DatabaseSync, evaluations: EvaluationRecords = domainEvaluationRecords(db)): EvaluationCalibrationOperationsHost {
  return {
    authority: db,
    calibrationCall,
    control: { calibrationMinAdjustments: undefined } as unknown as StoreControl,
    evaluationCalibration: new EvaluationCalibrationLedger(db),
    evaluations,
    publicationCall,
    publicationVersions: seededPublicationVersions(db),
    safeTitle: (input) => input,
    transaction,
  };
}

export function marketHost(db: DatabaseSync, calibration: EvaluationCalibrationLedger = new EvaluationCalibrationLedger(db)): EvaluationMarketHost {
  return { authority: db, calibrationCall, evaluationCalibration: calibration, series: new SeriesLedger(db), seriesCall };
}

/** 评估's record owner over the domain relations, its manuscript binding and AI7's 初评 stubbed as the unit suites stub them. */
export function domainEvaluationRecords(db: DatabaseSync, extras?: ConstructorParameters<typeof EvaluationRecords>[4]): EvaluationRecords {
  return new EvaluationRecords(db, { current: (bookId) => ({ manuscriptId: `m-${bookId}`, revisionId: `r-${bookId}`, revisionLabel: 'r1', uncheckpointed: false }) },
    undefined, undefined, extras);
}
