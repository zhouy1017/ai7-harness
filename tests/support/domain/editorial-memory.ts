import { DatabaseSync } from 'node:sqlite';
import { configureDatabase, initializeSchema } from '../../../src/service/store-schema.js';
import { initializeBookPeopleSchema } from '../../../src/service/book-people.js';
import { initializeLearningEligibilitySchema } from '../../../src/service/learning-eligibility.js';
import { initializeHouseReviewPreferenceSchema } from '../../../src/service/house-review-preference.js';
import { initializeEditorialLearningSchema } from '../../../src/service/learning/ledger.js';
import { initializeSupervisionSchema } from '../../../src/service/learning/supervision-directives.js';

/** Production-owned domain relations; no database path, file access or copied schema definitions. */
export function editorialMemoryDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  try {
    configureDatabase(db);
    initializeSchema(db);
    initializeBookPeopleSchema(db);
    initializeLearningEligibilitySchema(db);
    initializeHouseReviewPreferenceSchema(db, 78);
    initializeEditorialLearningSchema(db);
    initializeSupervisionSchema(db, 86);
    return db;
  } catch (error) { db.close(); throw error; }
}

/** The test owns this transaction; production operations receive EditorialStore's runner instead. */
export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const value = operation(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
