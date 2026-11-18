import { DatabaseSync } from 'node:sqlite';
import { BOOK_PEOPLE_SCHEMA_SQL, initializeBookPeopleSchema } from '../../../src/service/book-people.js';
import { LEARNING_ELIGIBILITY_SCHEMA_SQL, initializeLearningEligibilitySchema } from '../../../src/service/learning-eligibility.js';
import { HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, initializeHouseReviewPreferenceSchema } from '../../../src/service/house-review-preference.js';
import { EDITORIAL_LEARNING_SCHEMA_SQL, initializeEditorialLearningSchema } from '../../../src/service/learning/ledger.js';
import { SUPERVISION_SCHEMA_SQL, initializeSupervisionSchema } from '../../../src/service/learning/supervision-directives.js';
import { DECISION_FEEDBACK_SCHEMA_SQL, initializeDecisionFeedbackSchema } from '../../../src/service/decision-feedback.js';
import { MEMORY_SOURCE_PROJECTION_SQL } from './memory-projections.js';
export { transaction } from './transaction.js';

// Historical predecessor arguments select creation; they do not stamp a schema version.
const BEFORE_HOUSE_REVIEW_PREFERENCES = 78;
const BEFORE_LEARNING_SUPERVISION = 86;
export const MEMORY_DOMAIN_TABLES = [BOOK_PEOPLE_SCHEMA_SQL, LEARNING_ELIGIBILITY_SCHEMA_SQL,
  HOUSE_REVIEW_PREFERENCE_SCHEMA_SQL, EDITORIAL_LEARNING_SCHEMA_SQL, SUPERVISION_SCHEMA_SQL,
  DECISION_FEEDBACK_SCHEMA_SQL].flatMap(schema => Object.keys(schema));
export const memorySchemaTiming = { builds: 0, milliseconds: 0 };

/** Only domain-owned initializers and a labelled Book projection; no store bootstrap or disk database. */
export function editorialMemoryDatabase(options: { mutableEligibility?: boolean } = {}): DatabaseSync {
  const started = performance.now();
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON; PRAGMA trusted_schema = OFF; PRAGMA temp_store = MEMORY;');
    db.exec(MEMORY_SOURCE_PROJECTION_SQL.books);
    initializeBookPeopleSchema(db);
    // Retain the old malformed-record reading test: it uses the production table,
    // but omits its write guards so it can exercise validation of damaged input.
    if (options.mutableEligibility) for (const sql of Object.values(LEARNING_ELIGIBILITY_SCHEMA_SQL)) db.exec(sql);
    else initializeLearningEligibilitySchema(db);
    initializeHouseReviewPreferenceSchema(db, BEFORE_HOUSE_REVIEW_PREFERENCES);
    initializeEditorialLearningSchema(db);
    initializeSupervisionSchema(db, BEFORE_LEARNING_SUPERVISION);
    initializeDecisionFeedbackSchema(db);
    memorySchemaTiming.builds += 1; memorySchemaTiming.milliseconds += performance.now() - started;
    return db;
  } catch (error) { db.close(); throw error; }
}
