import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvaluationProfiles, builtinEvaluationProfile, EVALUATION_PROFILE_COUNT_REASON, EVALUATION_PROFILE_SCHEMA_SQL, initializeEvaluationProfileSchema } from '../../src/service/evaluation-profiles.js';
import type { SaveEvaluationProfileInput } from '../../src/shared/protocol.js';

let db: DatabaseSync;
let profiles: EvaluationProfiles;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE analysis_task_intents(task_intent_id TEXT PRIMARY KEY) STRICT');
  initializeEvaluationProfileSchema(db);
  profiles = new EvaluationProfiles(db);
});
afterEach(() => db.close());
const input = (): SaveEvaluationProfileInput => ({ expectedSha256: profiles.current().sha256,
  items: profiles.current().items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description ?? '' })), readiness: profiles.current().readiness ?? [] });

describe('immutable house evaluation profile versions (KB-002, EVAL-014)', () => {
  it('versions rename, description, readiness, add and remove while keeping the built-in bytes and old snapshots', () => {
    const builtin = profiles.current();
    const changed = profiles.save({ ...input(), items: input().items.map((item, index) => index === 0 ? { ...item, label: '作品品质', description: '看作者声音与文学品质。' } : item), readiness: ['完成事实复核。'] });
    expect(changed).toMatchObject({ version: '2', issuer: '本社', items: expect.arrayContaining([{ itemId: builtin.items[0]!.itemId, label: '作品品质', description: '看作者声音与文学品质。', fullMarks: 20 }]), readiness: ['完成事实复核。'] });
    const removed = profiles.save({ ...input(), items: input().items.slice(0, 4) });
    expect(removed.items.map((item) => item.fullMarks)).toEqual([25, 25, 25, 25]);
    const added = profiles.save({ ...input(), items: [...input().items, { itemId: null, label: '新的评分项', description: '新的说明。' }] });
    expect(added.items[4]!.itemId).not.toBe(builtin.items[4]!.itemId);
    expect(profiles.page().profiles.map((profile) => profile.version)).toEqual(['4', '3', '2', '1']);
    expect(profiles.page().profiles.at(-1)).toEqual(builtinEvaluationProfile());
    expect(profiles.page().profiles[2]).toEqual(changed);
    expect(() => db.exec('UPDATE evaluation_profile_versions SET ordinal = 99')).toThrow('EVALUATION_PROFILE_LEDGER_IMMUTABLE');
    expect(() => db.exec('DELETE FROM evaluation_profile_versions')).toThrow('EVALUATION_PROFILE_LEDGER_IMMUTABLE');
  });

  it('refuses unsupported counts, duplicate/blank labels, no-op, stale writes and removed identity reuse', () => {
    expect(() => profiles.save(input())).toThrow('没有变化');
    expect(() => profiles.save({ ...input(), items: input().items.slice(0, 3) })).toThrow(EVALUATION_PROFILE_COUNT_REASON);
    expect(() => profiles.save({ ...input(), items: input().items.map((item) => ({ ...item, label: '重复' })) })).toThrow('不能重复');
    expect(() => profiles.save({ ...input(), items: input().items.map((item) => ({ ...item, label: '' })) })).toThrow('有效的名称');
    const stale = input();
    profiles.save({ ...input(), items: input().items.slice(0, 4) });
    expect(() => profiles.save(stale)).toThrow('另一个窗口');
    expect(() => profiles.save({ ...input(), items: stale.items })).toThrow('编号无效');
    expect(profiles.page().profiles).toHaveLength(2);
  });

  it('refuses changes outside editable fields and bounded descriptions or readiness', () => {
    expect(() => profiles.save({ ...input(), risks: [] } as SaveEvaluationProfileInput)).toThrow('修改无效');
    expect(() => profiles.save({ ...input(), items: input().items.map((item) => ({ ...item, fullMarks: 99 })) })).toThrow('编号无效');
    expect(() => profiles.save({ ...input(), items: input().items.map((item) => ({ ...item, description: '字'.repeat(501) })) })).toThrow('有效的说明');
    expect(() => profiles.save({ ...input(), readiness: ['字'.repeat(201)] })).toThrow('有效的就绪清单');
    expect(() => profiles.save({ ...input(), readiness: ['重复', '重复'] })).toThrow('不能重复');
    expect(() => profiles.save({ ...input(), readiness: Array.from({ length: 21 }, (_, index) => `第${index}项`) })).toThrow('20');
    expect(profiles.page().profiles).toEqual([builtinEvaluationProfile()]);
  });

  it('leaves a store holding only initial_evaluation_tasks for the exact-schema refusal, not a raw SQLite error (P3-3)', () => {
    const partial = new DatabaseSync(':memory:');
    try {
      partial.exec('CREATE TABLE analysis_task_intents(task_intent_id TEXT PRIMARY KEY) STRICT');
      partial.exec(EVALUATION_PROFILE_SCHEMA_SQL.initial_evaluation_tasks);
      expect(() => initializeEvaluationProfileSchema(partial)).not.toThrow();
      expect(partial.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'evaluation_profile_versions'").get()).toBeUndefined();
    } finally {
      partial.close();
    }
  });

  it('keeps Task snapshots independently readable after house edits and bounds history pages', () => {
    const task = randomUUID();
    db.prepare('INSERT INTO analysis_task_intents VALUES (?)').run(task);
    const before = profiles.current();
    const digest = 'a'.repeat(64);
    profiles.snapshotTask(task, digest, before);
    for (let n = 0; n < 12; n += 1) profiles.save({ ...input(), readiness: [`就绪 ${n}`] });
    expect(new EvaluationProfiles(db).taskProfile(task, digest)).toEqual(before);
    const first = profiles.page();
    expect(first.profiles).toHaveLength(10);
    expect(first.nextBefore).toBe(3);
    expect(profiles.page(first.nextBefore).profiles.map((profile) => profile.version)).toEqual(['3', '2', '1']);
    expect(() => profiles.snapshotTask(task, digest, profiles.current())).toThrow('不能更换');
    db.exec('DROP TRIGGER initial_evaluation_tasks_no_update');
    db.prepare('UPDATE initial_evaluation_tasks SET canonical_json = ?').run('{}');
    expect(() => profiles.taskProfile(task, digest)).toThrow('损坏');
  });
});
