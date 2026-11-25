import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { createBaselineSchema } from '../../src/service/baseline-schema.js';
import { validateEditorialWorkspaceProfileNativeSchema } from '../../src/service/editorial-workspace-profile.js';
import { foreignKeyViolations } from '../../src/service/store-records.js';
import { validateTaskAuthorizationRecords } from '../../src/service/task-authorization.js';

// An open walks every relation's references once (`validateBoundedStore`'s whole-database pass). The owners that check again
// (task authorization, the 权限侧车) name their own relations, so a store with many rows elsewhere — the 字表与词表 library holds
// 68,507 — is not walked five times on every launch (R5-L1 review, round 1).

function store(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  createBaselineSchema(db);
  db.exec('PRAGMA foreign_keys = OFF');
  return db;
}

const NOW = '2026-11-21T00:00:00.000Z';
const orphans = {
  manuscriptCore: (db: DatabaseSync): void => { db.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)').run(randomUUID(), randomUUID(), randomUUID()); },
  taskAuthorization: (db: DatabaseSync): void => { db.prepare('INSERT INTO task_manuscript_pins VALUES (?, ?, ?, ?)').run(randomUUID(), '{}', sha256Hex('{}'), NOW); },
  analysisLedger: (db: DatabaseSync): void => { db.prepare('INSERT INTO analysis_plan_records VALUES (?, 1, ?, ?, ?, ?)').run(randomUUID(), 'manuscript-pin', '{}', sha256Hex('{}'), NOW); },
  nativeArtifact: (db: DatabaseSync): void => { db.prepare('INSERT INTO native_artifact_book_enablements VALUES (?, ?, ?)').run(randomUUID(), randomUUID(), NOW); },
};

describe('open-time reference checks are scoped to their owner', () => {
  it('counts only the named relations', () => {
    const db = store();
    try {
      expect(foreignKeyViolations(db, ['manuscript_blocks', 'task_manuscript_pins'])).toBe(0);
      orphans.manuscriptCore(db);
      expect(foreignKeyViolations(db, ['task_manuscript_pins', 'analysis_plan_records'])).toBe(0);
      expect(foreignKeyViolations(db, ['manuscript_blocks'])).toBe(2);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(2);
    } finally { db.close(); }
  });

  it('leaves an owner check blind to another owner\'s relation: the one whole pass is the manuscript core\'s', () => {
    const db = store();
    try {
      validateTaskAuthorizationRecords(db);
      validateEditorialWorkspaceProfileNativeSchema(db);
      orphans.manuscriptCore(db);
      orphans.nativeArtifact(db);
      validateTaskAuthorizationRecords(db);
      orphans.taskAuthorization(db);
      expect(() => validateEditorialWorkspaceProfileNativeSchema(db)).toThrow(/原生构件/u);
    } finally { db.close(); }
  });

  it.each([
    ['task authorization', 'taskAuthorization', /任务授权记录引用校验失败/u],
    ['the analysis ledger', 'analysisLedger', /分析任务账本引用校验失败/u],
  ] as const)('still refuses an orphan row in %s from its own check', (_name, which, message) => {
    const db = store();
    try {
      orphans[which](db);
      expect(() => validateTaskAuthorizationRecords(db)).toThrow(message);
    } finally { db.close(); }
  });

  it('still refuses an orphan row of the 权限侧车 native relations from its own check', () => {
    const db = store();
    try {
      orphans.nativeArtifact(db);
      expect(() => validateEditorialWorkspaceProfileNativeSchema(db)).toThrow(/原生构件/u);
    } finally { db.close(); }
  });
});
