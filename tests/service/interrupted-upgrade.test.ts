import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeClarificationSchema } from '../../src/service/analysis/clarifications.js';
import { initializeRunCheckpointSchema } from '../../src/service/analysis/run-checkpoints.js';
import { initializeBookDeliveryPackageSchema } from '../../src/service/book-delivery-packages.js';
import { BoundedStoreError, initializeManuscriptEntryPositionSchema } from '../../src/service/bounded-manuscript.js';
import { initializeDefaultExecutionRuleSchema } from '../../src/service/default-execution-rules.js';
import { EDITORIAL_MARK_SCHEMA_SQL, initializeEditorialMarkSchema } from '../../src/service/editorial-marks.js';
import { IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL, initializeImportRetentionSchema } from '../../src/service/import-retention.js';
import { initializeImportedMarkSchema } from '../../src/service/imported-marks.js';
import { initializeManuscriptEffectSchema, MANUSCRIPT_EFFECT_SCHEMA_SQL } from '../../src/service/manuscript-apply.js';
import { loadBuiltInManuscriptProfile } from '../../src/service/native-workflow-profile.js';
import { initializeExportLedgerSchema } from '../../src/service/manuscript-export.js';
import {
  initializeProductionDocumentDeliverySchema,
  initializeProductionDocumentSchema,
  PRODUCTION_DOCUMENT_SCHEMA_SQL,
} from '../../src/service/production-document-ledger.js';
import {
  initializeProductionDocumentWorkflowSchema,
  PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL,
  type WorkflowProfilePin,
} from '../../src/service/production-document-workflow.js';
import { initializeProposalConflictSchema } from '../../src/service/proposal-conflicts.js';
import { initializePublicationVersionSchema } from '../../src/service/publication-versions.js';
import { initializeReimportGroupSchema } from '../../src/service/reimport-group-ledger.js';
import { initializeReviewRunSchema } from '../../src/service/review/review-runs.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { downgradeKindCoupledRelationsToRevision23 } from '../support/analysis-ledger-revisions.js';
import { plantRevision34Relations } from '../support/clarifications.js';
import { downgradeAnalysisRunStatesToRevision29 } from '../support/connectivity-wait.js';
import { plantRevision30Relations } from '../support/default-execution-rules.js';
import { downgradeEditorialMarksToRevision22 } from '../support/editorial-mark-revisions.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER } from '../support/import-retention.js';
import { downgradeProposalChangeItemsToRevision27, IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { plantRevision33Relations } from '../support/plan-edits.js';
import { PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER } from '../support/proposal-conflicts.js';
import { PUBLICATION_VERSION_RELATIONS_DROP_ORDER } from '../support/publication-versions.js';
import { dropReimportGroupRelations } from '../support/reimport-groups.js';
import { REVIEW_RUN_RELATIONS_DROP_ORDER } from '../support/review-categories.js';
import { plantRevision31Relations } from '../support/run-cancellation.js';
import { plantRevision32Relations } from '../support/run-continuation.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for an upgrade interrupted before its version stamp (Issue #596). From revision 21 on,
// each upgrade step commits its revision's relations in a transaction of its own, and the terminal version is stamped
// in another. A store whose step committed and whose stamp did not — a power loss, a forced restart, a killed service —
// holds all of a revision's relations below that revision, and the next open finishes the upgrade instead of refusing
// the store. Each case walks a store the current code built down to the revision before, the way the suites' own
// helpers plant one, runs that revision's step alone, and opens it.

let roots: ServiceTestRoots;
/** The profile the store's documents follow, which revision 40's step pins on each instance it creates. */
let profile: WorkflowProfilePin;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-interrupted-upgrade-');
  const { projection } = await loadBuiltInManuscriptProfile(roots.codeRoot);
  profile = { id: projection.id, name: projection.name, version: projection.version, digest: projection.digest };
});

afterEach(async () => {
  await roots.dispose();
});

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

async function opened(): Promise<number> {
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    store.markCleanShutdown();
  } finally {
    store.close();
  }
  const database = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    return (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  } finally {
    database.close();
  }
}

function withDatabase(body: (database: DatabaseSync) => void): void {
  const database = new DatabaseSync(databasePath());
  try {
    body(database);
  } finally {
    database.close();
  }
}

/** Drop relations a later revision added, foreign keys off around it. */
function drop(database: DatabaseSync, relations: ReadonlyArray<string>): void {
  database.exec('PRAGMA foreign_keys = OFF');
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const relation of relations) database.exec(`DROP TABLE IF EXISTS ${relation}`);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } finally {
    database.exec('PRAGMA foreign_keys = ON');
  }
}

interface Revision {
  readonly revision: number;
  /** The product's step that commits the relations the revision adds, without the version stamp; none for a widening. */
  readonly step: ((database: DatabaseSync) => void) | null;
  /** Take a store at this revision back to the one before, as the suites' own plants do. */
  readonly undo: (database: DatabaseSync) => void;
}

// Newest first: a store is walked down one revision at a time.
const REVISIONS: ReadonlyArray<Revision> = [
  {
    revision: 40,
    step: (database) => initializeProductionDocumentWorkflowSchema(database, profile),
    undo: (database) => drop(database, Object.keys(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_SQL).reverse()),
  },
  { revision: 39, step: initializeBookDeliveryPackageSchema, undo: (database) => drop(database, ['book_delivery_package_versions']) },
  { revision: 38, step: initializeProductionDocumentDeliverySchema, undo: (database) => drop(database, ['production_document_deliveries']) },
  // Revision 37 also rebuilt `manuscripts`; every earlier revision's validation accepts the rebuilt relation.
  { revision: 37, step: initializeProductionDocumentSchema, undo: (database) => drop(database, Object.keys(PRODUCTION_DOCUMENT_SCHEMA_SQL).reverse()) },
  { revision: 36, step: initializeReimportGroupSchema, undo: dropReimportGroupRelations },
  { revision: 35, step: initializeClarificationSchema, undo: plantRevision34Relations },
  { revision: 34, step: null, undo: plantRevision33Relations },
  { revision: 33, step: initializeRunCheckpointSchema, undo: plantRevision32Relations },
  { revision: 32, step: null, undo: plantRevision31Relations },
  { revision: 31, step: initializeDefaultExecutionRuleSchema, undo: plantRevision30Relations },
  { revision: 30, step: null, undo: downgradeAnalysisRunStatesToRevision29 },
  { revision: 29, step: initializeExportLedgerSchema, undo: (database) => drop(database, EXPORT_LEDGER_RELATIONS_DROP_ORDER) },
  {
    revision: 28,
    step: initializeImportedMarkSchema,
    undo: (database) => {
      drop(database, IMPORTED_MARK_RELATIONS_DROP_ORDER);
      downgradeProposalChangeItemsToRevision27(database);
    },
  },
  {
    revision: 27,
    step: initializeImportRetentionSchema,
    undo: (database) => {
      drop(database, [...IMPORT_RETENTION_RELATIONS_DROP_ORDER, 'import_fidelity_categories']);
      database.exec(IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL);
    },
  },
  { revision: 26, step: initializeProposalConflictSchema, undo: (database) => drop(database, PROPOSAL_CONFLICT_RELATIONS_DROP_ORDER) },
  { revision: 25, step: initializePublicationVersionSchema, undo: (database) => drop(database, PUBLICATION_VERSION_RELATIONS_DROP_ORDER) },
  {
    revision: 24,
    step: initializeReviewRunSchema,
    undo: (database) => {
      drop(database, REVIEW_RUN_RELATIONS_DROP_ORDER);
      downgradeKindCoupledRelationsToRevision23(database);
    },
  },
  {
    revision: 23,
    step: initializeManuscriptEffectSchema,
    undo: (database) => {
      drop(database, Object.keys(MANUSCRIPT_EFFECT_SCHEMA_SQL).reverse());
      downgradeEditorialMarksToRevision22(database);
    },
  },
  { revision: 22, step: initializeEditorialMarkSchema, undo: (database) => drop(database, Object.keys(EDITORIAL_MARK_SCHEMA_SQL).reverse()) },
  { revision: 21, step: initializeManuscriptEntryPositionSchema, undo: (database) => drop(database, ['manuscript_entry_positions']) },
];

/** Walk a store the current code built down to `version`, and say so in its version. */
function plant(version: number): void {
  withDatabase((database) => {
    for (const entry of REVISIONS) {
      if (entry.revision <= version) break;
      entry.undo(database);
    }
    database.exec(`PRAGMA user_version = ${version}`);
  });
}

const tables = (): string[] => {
  const database = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    return (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
  } finally {
    database.close();
  }
};

describe('an upgrade interrupted before its version stamp', () => {
  for (const { revision, step } of REVISIONS) {
    if (step === null) continue;
    it(`is finished by the next open when revision ${revision}'s relations committed and its stamp did not`, async () => {
      expect(await opened()).toBe(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION);
      const terminal = tables();
      // The plant is a store at the revision before, which opens and upgrades as one.
      plant(revision - 1);
      expect(await opened()).toBe(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION);
      expect(tables()).toEqual(terminal);
      // The step commits the revision's relations, and the process stops before the stamp.
      plant(revision - 1);
      withDatabase((database) => {
        step(database);
        expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(revision - 1);
      });
      expect(await opened()).toBe(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION);
      expect(tables()).toEqual(terminal);
      // Once finished it opens as any store does.
      expect(await opened()).toBe(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION);
    }, 120_000);
  }

  it('still refuses a store holding only some of a revision\'s relations', async () => {
    expect(await opened()).toBe(PRODUCTION_DOCUMENT_WORKFLOW_SCHEMA_VERSION);
    plant(36);
    withDatabase((database) => database.exec(PRODUCTION_DOCUMENT_SCHEMA_SQL.production_documents));
    const refused = await EditorialStore.open(roots.dataRoot, roots.codeRoot).then((store) => {
      store.close();
      return null;
    }, (error: unknown) => error);
    expect(refused instanceof BoundedStoreError || refused instanceof StoreError ? refused.code : refused).toBe('SCHEMA_MIGRATION_FAILED');
  }, 120_000);
});
