import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Socket } from 'node:net';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION, IMPORTED_SKILL_UPDATE_SCHEMA_SQL, initializeImportedSkillSchema, initializeImportedSkillUpdateSchema,
} from '../../src/service/imported-skill-schema.js';
import { authorityChanges, ImportedSkillUpdates, reconcileFiles, skillIdentity } from '../../src/service/imported-skill-updates.js';
import { acquireSkillPackage, convertSkillFiles, ImportedSkills } from '../../src/service/imported-skills.js';
import { CapturedProcedures, capturedProcedureDocument, initializeCapturedProcedureSchema, recordReviewRunProcedurePin } from '../../src/service/captured-procedures.js';
import { reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import type { ImportedSkillFile, ImportedSkillUpdateCandidateProjection } from '../../src/shared/protocol.js';

const fixture = (name: string) => resolve('tests/fixtures/skills', name);
const bookId = randomUUID();
let db: DatabaseSync;
let skills: ImportedSkills;
let updates: ImportedSkillUpdates;
const tableCounts = (): Record<string, number> => Object.fromEntries((db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all())
  .map((row) => [String(row.name), Number(db.prepare(`SELECT count(*) AS n FROM "${String(row.name)}"`).get()?.n)]));
const imported = async (name = 'plain') => skills.keep(await acquireSkillPackage(fixture(name)));
/** 检查更新（从文件）…: disclose, then keep, as the store does. */
const check = async (skillId: string, name: string) => {
  const acquired = await acquireSkillPackage(fixture(name));
  updates.verify(skillId, acquired);
  return updates.keep(skillId, acquired, randomUUID());
};
const file = (path: string, text: string): ImportedSkillFile => {
  const bytes = Buffer.from(text);
  return { path, bytes: bytes.length, sha256: sha256Hex(bytes), base64: bytes.toString('base64') };
};
/** A local derivation: a working revision whose SKILL.md is the editor's own, kept beside the snapshot it came from. */
function derive(skillId: string, text: string): string {
  const base = skills.revision(skills.currentRevisionId(skillId));
  const files = base.workingFiles.map((entry) => entry.path === 'SKILL.md' ? file('SKILL.md', text) : entry);
  db.exec('BEGIN IMMEDIATE');
  const revisionId = skills.insertRevision({
    skillId, snapshotId: base.snapshotId, previousRevisionId: base.revisionId, files, conversion: convertSkillFiles(files, sha256Hex(canonicalJson(files)), base.name),
  });
  skills.appendSelection(skillId, revisionId, 'import', null, null);
  db.exec('COMMIT');
  return revisionId;
}
const LOCAL_SKILL = ['---', 'name: synthetic-style-review', 'description: Synthetic package for inert import lifecycle testing.', 'version: 1.0.0', 'license: MIT', '---', '', 'The editor rewrote this synthetic line.', ''].join('\n');
const adopt = (candidate: ImportedSkillUpdateCandidateProjection, upstreamPaths: string[] = []) =>
  updates.adopt(candidate.candidateId, { reviewDigest: candidate.reviewDigest, acceptItems: candidate.acceptItems, upstreamPaths });
const text = (revisionId: string, path = 'SKILL.md'): string => {
  const entry = skills.revision(revisionId).workingFiles.find((member) => member.path === path);
  return Buffer.from(entry!.base64, 'base64').toString('utf8');
};

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE books(book_id TEXT PRIMARY KEY) STRICT');
  db.prepare('INSERT INTO books VALUES (?)').run(bookId);
  initializeImportedSkillSchema(db, 0);
  initializeImportedSkillUpdateSchema(db, 0);
  skills = new ImportedSkills(db);
  updates = new ImportedSkillUpdates(db, skills);
});
afterEach(() => { vi.restoreAllMocks(); db.close(); });

describe('three-way reconciliation of a foreign Skill update (REUSE-032)', () => {
  it('classifies each file against the prior snapshot, the working revision and the incoming snapshot', () => {
    const [a, b, c, d] = [file('a.md', 'a'), file('b.md', 'b'), file('c.md', 'c'), file('d.md', 'd')];
    const [a2, c2, d2, d3] = [file('a.md', 'a2'), file('c.md', 'c2'), file('d.md', 'd2'), file('d.md', 'd3')];
    const report = reconcileFiles([a, b, c, d], [a, b, c2, d2], [a2, b, c, d3, file('e.md', 'e')]);
    expect(report.map((entry) => [entry.path, entry.change])).toEqual([['a.md', 'upstream'], ['b.md', 'unchanged'], ['c.md', 'local'], ['d.md', 'conflict'], ['e.md', 'upstream']]);
    // Both sides arriving at the same bytes is agreement, and a file removed upstream is a change like any other.
    expect(reconcileFiles([a], [a2], [a2]).map((entry) => entry.change)).toEqual(['upstream']);
    expect(reconcileFiles([a, b], [a, b], [a]).map((entry) => [entry.path, entry.change, entry.incomingSha256])).toEqual([['a.md', 'unchanged', a.sha256], ['b.md', 'upstream', null]]);
  });

  it('reads the Skill identity from the front matter name alone, and none from a package that declares none', async () => {
    const plain = await acquireSkillPackage(fixture('plain'));
    expect(skillIdentity(plain.files, plain.contentSha256)).toBe('synthetic-style-review');
    expect(skillIdentity([file('SKILL.md', '---\ndescription: no name\n---\nbody')], 'x')).toBeNull();
    expect(skillIdentity([file('notes.txt', 'not a skill')], 'x')).toBeNull();
  });

  it('names what the incoming version asks of AI7 that the base did not, and nothing for an identical declaration', async () => {
    const base = await imported('plain');
    const same = await acquireSkillPackage(fixture('plain-v2-text'));
    expect(authorityChanges(base, same.conversion, same.files)).toEqual([]);
    const scripts = await acquireSkillPackage(fixture('plain-v2-scripts'));
    expect(authorityChanges(base, scripts.conversion, scripts.files)).toEqual([
      expect.stringContaining('scripts/marker.sh'), '新增资源类别：scripts/',
    ]);
    const tools = await acquireSkillPackage(fixture('plain-v2-tools'));
    expect(authorityChanges(base, tools.conversion, tools.files)).toEqual(['新增或改变的权限、工具声明：allowed-tools: Read']);
    // The same declaration again is no change: a version that already declared it asks for nothing new.
    const declared = await imported('plain-v2-tools');
    expect(authorityChanges(declared, tools.conversion, tools.files)).toEqual([]);
  });
});

describe('checking an update from a file', () => {
  it('compares the full declared identity even when two display names truncate to the same label', async () => {
    const source = await acquireSkillPackage(fixture('plain'));
    const original = Buffer.from(source.files[0]!.base64, 'base64').toString('utf8');
    const identity = `synthetic-${'a'.repeat(120)}-one`;
    const packageOf = (name: string, revision: string) => {
      const files = [file('SKILL.md', original.replace('synthetic-style-review', name).replace('1.0.0', revision))];
      const contentSha256 = sha256Hex(canonicalJson(files));
      return { ...source, files, contentSha256, conversion: convertSkillFiles(files, contentSha256, '') };
    };
    const base = skills.keep(packageOf(identity, '1.0.0'));
    const other = packageOf(identity.replace(/one$/u, 'two'), '1.1.0');
    expect(other.conversion.name).toBe(base.name);
    const before = tableCounts();
    expect(() => updates.keep(base.skillId, other, randomUUID())).toThrow('这不是同一个 Skill 的新版本');
    expect(tableCounts()).toEqual(before);
    expect(updates.verify(base.skillId, packageOf(identity, '1.1.0'))).toBe('newer');
  });

  it('refuses a package whose identity differs, or that is not a Skill, before anything is staged or kept', async () => {
    const base = await imported();
    const before = tableCounts();
    const other = await acquireSkillPackage(fixture('other-skill'));
    expect(() => updates.verify(base.skillId, other)).toThrow('这不是同一个 Skill 的新版本');
    expect(() => updates.keep(base.skillId, other, randomUUID())).toThrow('这不是同一个 Skill 的新版本');
    const bare = await acquireSkillPackage(fixture('malformed'));
    expect(() => updates.keep(base.skillId, bare, randomUUID())).toThrow('这不是同一个 Skill 的新版本');
    expect(tableCounts()).toEqual(before);
  });

  it('records a clean candidate and changes nothing else: no revision, state, selection, rule or enablement (REUSE-032)', async () => {
    const base = await imported();
    const validated = skills.validate(base.revisionId);
    const before = tableCounts();
    const checked = await check(base.skillId, 'plain-v2-text');
    expect(checked.relation).toBe('newer');
    expect(checked.candidate).toMatchObject({
      disposition: 'clean', status: 'open', stale: false, adoptedBy: null, adoptedRevisionId: null, acceptItems: [], conflicts: [], authorityChanges: [],
      validator: { state: 'validated', reasons: [] }, incomingSourceRevision: '1.1.0',
    });
    expect(checked.candidate!.files.map((entry) => [entry.path, entry.change])).toEqual([['SKILL.md', 'upstream']]);
    const after = tableCounts();
    expect(after).toEqual({ ...before, imported_skill_snapshots: before.imported_skill_snapshots! + 1, imported_skill_update_candidates: before.imported_skill_update_candidates! + 1 });
    expect(skills.currentRevisionId(base.skillId)).toBe(base.revisionId);
    expect(skills.revision(base.revisionId)).toEqual({ ...validated, createdAt: validated.createdAt });
    // Checking the same package again while its candidate is open is that candidate, not another.
    const again = await check(base.skillId, 'plain-v2-text');
    expect(again.candidate!.candidateId).toBe(checked.candidate!.candidateId);
    expect(tableCounts()).toEqual(after);
  });

  it('says where a package stands to the Skill: the version it is on, one in its history, or a dismissed one asked again', async () => {
    const base = await imported();
    const acquired = await acquireSkillPackage(fixture('plain'));
    expect(updates.verify(base.skillId, acquired)).toBe('same-as-current');
    expect(() => updates.keep(base.skillId, acquired, randomUUID())).toThrow('没有新的更新');
    const first = (await check(base.skillId, 'plain-v2-text')).candidate!;
    const dismissed = updates.dismiss(first.candidateId);
    expect(dismissed).toMatchObject({ status: 'dismissed', adoptedRevisionId: null });
    // A dismissed candidate is history, not a decision never to look again: the same package is a new candidate on the kept snapshot.
    const second = (await check(base.skillId, 'plain-v2-text')).candidate!;
    expect(second.candidateId).not.toBe(first.candidateId);
    expect(second.incoming.snapshotId).toBe(first.incoming.snapshotId);
    adopt(second);
    expect(updates.verify(base.skillId, acquired)).toBe('already-kept');
    expect(() => updates.keep(base.skillId, acquired, randomUUID())).toThrow('回到此版本');
    expect(updates.verify(base.skillId, await acquireSkillPackage(fixture('plain-v2-text')))).toBe('same-as-current');
  });

  it.each([
    ['plain-v2-scripts', 'authority-change', '新增资源类别：scripts/'],
    ['plain-v2-resources', 'authority-change', '新增资源类别：resources/'],
    ['plain-v2-tools', 'authority-change', '新增或改变的权限、工具声明：allowed-tools: Read'],
  ])('dispositions %s as %s and lists the change', async (name, disposition, item) => {
    const base = await imported();
    const candidate = (await check(base.skillId, name)).candidate!;
    expect(candidate.disposition).toBe(disposition);
    expect(candidate.authorityChanges).toContain(item);
    expect(candidate.acceptItems).toContain(item);
  });

  it('dispositions a version that fails the validator, naming its reasons', async () => {
    const base = await imported();
    const candidate = (await check(base.skillId, 'plain-v2-malformed')).candidate!;
    expect(candidate).toMatchObject({ disposition: 'validator-failed', validator: { state: 'rejected' }, authorityChanges: [], conflicts: [] });
    expect(candidate.validator.reasons).toEqual(['前置信息需要非空的 name 和 description。']);
    expect(candidate.acceptItems).toEqual(candidate.validator.reasons);
  });

  it.each(['data-scope', 'host-behaviour', 'analysis-contract', 'schema', 'reducer', 'budget', 'schedule'])('names a new %s declaration as an authority change even when the converter restricts it', async (key) => {
    const base = await imported();
    const source = await acquireSkillPackage(fixture('plain-v2-text'));
    const original = Buffer.from(source.files[0]!.base64, 'base64').toString('utf8');
    const files = [file('SKILL.md', original.replace('license: MIT', `license: MIT\n${key}: synthetic-new-value`))];
    const contentSha256 = sha256Hex(canonicalJson(files));
    const candidate = updates.keep(base.skillId, { ...source, files, contentSha256, conversion: convertSkillFiles(files, contentSha256, base.name) }, randomUUID()).candidate!;
    expect(candidate).toMatchObject({ disposition: 'authority-change', validator: { state: 'restricted' } });
    expect(candidate.authorityChanges).toContain(`新增或改变的范围、宿主或运行约定：${key}`);
    expect(candidate.acceptItems).toContain(`新增或改变的范围、宿主或运行约定：${key}`);
  });

  it('dispositions a file changed both by the editor and upstream as a conflict', async () => {
    const base = await imported();
    derive(base.skillId, LOCAL_SKILL);
    const conflicting = (await check(base.skillId, 'plain-v2-text')).candidate!;
    expect(conflicting).toMatchObject({ disposition: 'conflict', conflicts: ['SKILL.md'], acceptItems: ['文件冲突：SKILL.md'] });
    expect(conflicting.files).toEqual([expect.objectContaining({ path: 'SKILL.md', change: 'conflict' })]);
  });
});

describe('explicit adoption (REUSE-033)', () => {
  it('adopts into a new working revision at 待验证, current but never enabled, and validation is the existing separate stage', async () => {
    const base = await imported();
    skills.validate(base.revisionId);
    const installed = skills.install(base.revisionId, skills.revision(base.revisionId).previewDigest);
    const enabled = skills.enable(base.revisionId, bookId, installed.previewDigest);
    expect(enabled.enabledBooks).toEqual([bookId]);
    const candidate = (await check(base.skillId, 'plain-v2-text')).candidate!;
    const adopted = adopt(candidate);
    expect(adopted).toMatchObject({ status: 'adopted', adoptedBy: 'editor', stale: false });
    const revision = skills.revision(adopted.adoptedRevisionId!);
    expect(revision).toMatchObject({ ordinal: 2, previousRevisionId: base.revisionId, snapshotId: candidate.incoming.snapshotId, state: 'pending-validation', enabledBooks: [], sourceRevision: '1.1.0' });
    expect(skills.revision(base.revisionId)).toMatchObject({ state: 'enabled', enabledBooks: [bookId] });
    expect(text(revision.revisionId)).toContain('one more synthetic sentence');
    expect(skills.currentRevisionId(base.skillId)).toBe(revision.revisionId);
    // Adoption is not an enablement: the new revision is validated by the existing stage, and stays disabled until installed and enabled.
    expect(() => skills.install(revision.revisionId, revision.previewDigest)).toThrow('先验证通过');
    expect(skills.validate(revision.revisionId)).toMatchObject({ state: 'validated', enabledBooks: [] });
    expect(() => skills.enable(base.revisionId, bookId, enabled.previewDigest)).toThrow('不是当前修订');
    expect(db.prepare("SELECT count(*) AS n FROM imported_skill_states WHERE state = 'enabled'").get()?.n).toBe(1);
  });

  it('adopts a candidate that is not clean only when every item it names is named back, keeping the local derivation unless upstream is ticked', async () => {
    const base = await imported();
    const local = derive(base.skillId, LOCAL_SKILL);
    const candidate = (await check(base.skillId, 'plain-v2-text')).candidate!;
    const input = { candidateId: candidate.candidateId, reviewDigest: candidate.reviewDigest, acceptItems: candidate.acceptItems, upstreamPaths: [] };
    expect(() => updates.adopt(candidate.candidateId, { ...input, acceptItems: [] })).toThrow('逐项确认');
    expect(() => updates.adopt(candidate.candidateId, { ...input, acceptItems: ['文件冲突：SKILL.md', '多出来的一项'] })).toThrow('逐项确认');
    expect(() => updates.adopt(candidate.candidateId, { ...input, reviewDigest: 'f'.repeat(64) })).toThrow('有了变化');
    expect(() => updates.adopt(candidate.candidateId, { ...input, upstreamPaths: ['SKILL.md', 'other.md'] })).toThrow('只能用于有冲突的文件');
    expect(skills.currentRevisionId(base.skillId)).toBe(local);
    const before = tableCounts();
    // Not ticked: the local derivation is kept, byte for byte, on the new revision, which follows it.
    const kept = updates.adopt(candidate.candidateId, input);
    expect(text(kept.adoptedRevisionId!)).toBe(text(local));
    expect(skills.revision(kept.adoptedRevisionId!)).toMatchObject({ previousRevisionId: local, snapshotId: candidate.incoming.snapshotId });
    expect(tableCounts().imported_skill_revisions).toBe(before.imported_skill_revisions! + 1);
  });

  it('takes the upstream file for a ticked conflict and the local derivation for the rest', async () => {
    const base = await imported('plain');
    derive(base.skillId, LOCAL_SKILL);
    const candidate = (await check(base.skillId, 'plain-v2-text')).candidate!;
    const adopted = adopt(candidate, ['SKILL.md']);
    expect(text(adopted.adoptedRevisionId!)).toContain('one more synthetic sentence');
    expect(canonicalJson(skills.revision(adopted.adoptedRevisionId!).workingFiles)).toBe(canonicalJson(skills.snapshot(candidate.incoming.snapshotId).files));
  });

  it('refuses to adopt twice, after a dismissal, or once the Skill has moved on; dismissal deletes nothing', async () => {
    const base = await imported();
    const first = (await check(base.skillId, 'plain-v2-text')).candidate!;
    const second = (await check(base.skillId, 'plain-v2-resources')).candidate!;
    adopt(first);
    expect(() => adopt(first)).toThrow('处理过了');
    // The second candidate was made against the revision the first replaced, so it is stale: dismissed, never adopted.
    expect(updates.inspectCandidate(second.candidateId)).toMatchObject({ status: 'open', stale: true });
    expect(() => adopt(second)).toThrow('不再对得上');
    const before = tableCounts();
    expect(updates.dismiss(second.candidateId)).toMatchObject({ status: 'dismissed' });
    expect(() => updates.dismiss(second.candidateId)).toThrow('处理过了');
    expect(tableCounts()).toEqual({ ...before, imported_skill_update_candidates: before.imported_skill_update_candidates! + 1 });
  });
});

describe('the Artifact Update Rule (REUSE-034)', () => {
  it('is created only with its confirmation line, once at a time, and revoked by appending a revocation', async () => {
    const base = await imported();
    expect(updates.rule(base.skillId)).toMatchObject({ active: false, ruleId: null, confirmation: IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION, history: [] });
    expect(() => updates.createRule(base.skillId, '好')).toThrow('确认规则的说明');
    const created = updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    expect(created).toMatchObject({ active: true, history: [{ action: 'create' }] });
    expect(() => updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION)).toThrow('已有更新规则');
    const revoked = updates.revokeRule(base.skillId);
    expect(revoked).toMatchObject({ active: false, ruleId: null, since: null, history: [{ action: 'create' }, { action: 'revoke' }] });
    expect(() => updates.revokeRule(base.skillId)).toThrow('没有生效的更新规则');
    // History is kept, and a later rule is a new one.
    expect(updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION).ruleId).not.toBe(created.ruleId);
    expect(db.prepare('SELECT count(*) AS n FROM imported_skill_update_rules').get()?.n).toBe(3);
  });

  it('adopts a clean update on its own, attributed to the rule, and enables and validates nothing', async () => {
    const base = await imported();
    const rule = updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    const checked = await check(base.skillId, 'plain-v2-text');
    expect(checked.candidate).toMatchObject({ disposition: 'clean', status: 'adopted', adoptedBy: 'rule' });
    const revision = skills.revision(checked.candidate!.adoptedRevisionId!);
    expect(revision).toMatchObject({ ordinal: 2, state: 'pending-validation', enabledBooks: [] });
    expect(skills.currentRevisionId(base.skillId)).toBe(revision.revisionId);
    expect(db.prepare('SELECT rule_id, adopted_by FROM imported_skill_update_candidates WHERE sequence = 2').get()).toEqual({ rule_id: rule.ruleId, adopted_by: 'rule' });
    expect(db.prepare("SELECT reason FROM imported_skill_current_selections WHERE reason = 'rule'").get()?.reason).toBe('rule');
    expect(db.prepare('SELECT count(*) AS n FROM imported_skill_states').get()?.n).toBe(0);
  });

  it.each(['plain-v2-scripts', 'plain-v2-resources', 'plain-v2-tools', 'plain-v2-malformed'])('returns %s to review instead of adopting it', async (name) => {
    const base = await imported();
    updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    const checked = await check(base.skillId, name);
    expect(checked.candidate).toMatchObject({ status: 'open', adoptedBy: null });
    expect(checked.candidate!.disposition).not.toBe('clean');
    expect(skills.currentRevisionId(base.skillId)).toBe(base.revisionId);
    expect(db.prepare('SELECT count(*) AS n FROM imported_skill_revisions').get()?.n).toBe(1);
  });

  it('returns a conflict to review, and stops adopting once revoked', async () => {
    const base = await imported();
    derive(base.skillId, LOCAL_SKILL);
    updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    expect((await check(base.skillId, 'plain-v2-text')).candidate).toMatchObject({ disposition: 'conflict', status: 'open' });
    updates.revokeRule(base.skillId);
    const other = await imported('resources');
    updates.createRule(other.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    updates.revokeRule(other.skillId);
    expect(updates.rule(other.skillId).active).toBe(false);
    expect(db.prepare("SELECT count(*) AS n FROM imported_skill_update_candidates WHERE adopted_by = 'rule'").get()?.n).toBe(0);
  });

  it('stops adopting after revocation, and applies to its own Skill only', async () => {
    const first = await imported('plain');
    const second = await imported('resources');
    updates.createRule(first.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    updates.revokeRule(first.skillId);
    expect((await check(first.skillId, 'plain-v2-text')).candidate).toMatchObject({ disposition: 'clean', status: 'open' });
    expect(updates.rule(second.skillId).active).toBe(false);
  });
});

describe('current selection and rollback (REUSE-035)', () => {
  it('leaves a recorded Captured Procedure version and its exact Run pin byte for byte through update and rollback', async () => {
    // A minimal Run identity supplies the FK; the version and by-value pin use the product schema and writers.
    // Imported Skills have no executor, so no test invents an executable Run pin to an imported revision.
    db.exec('CREATE TABLE review_runs(review_run_id TEXT PRIMARY KEY) STRICT');
    initializeCapturedProcedureSchema(db);
    const runId = randomUUID();
    db.prepare('INSERT INTO review_runs VALUES (?)').run(runId);
    const procedures = new CapturedProcedures(db);
    const document = capturedProcedureDocument('合成工序', [reviewCategoryEntry('style-and-format')!], 'whole');
    const version = procedures.save({ procedureId: null, document, sourceBookId: bookId, sourceReviewRunId: runId, sourceRunOrdinal: 1 });
    recordReviewRunProcedurePin(db, runId, {
      procedureId: version.procedureId, versionId: version.versionId, version: version.version, title: document.title,
      documentSha256: version.documentSha256, scope: 'whole', steps: ['style-and-format'], chosenApart: [],
    }, ['style-and-format'], [], new Date().toISOString());
    const pins = () => ['captured_procedures', 'captured_procedure_versions', 'review_run_procedure_pins']
      .map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const base = await imported();
    const before = pins();
    const candidate = (await check(base.skillId, 'plain-v2-text')).candidate!;
    expect(pins()).toEqual(before);
    adopt(candidate);
    expect(pins()).toEqual(before);
    updates.rollback(base.skillId, base.revisionId);
    expect(pins()).toEqual(before);
  });

  it('does no network work while checking, adopting, using a rule or rolling back', async () => {
    const connect = vi.spyOn(Socket.prototype, 'connect');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const base = await imported();
    adopt((await check(base.skillId, 'plain-v2-text')).candidate!);
    updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    expect((await check(base.skillId, 'plain-v3-text')).candidate!.adoptedBy).toBe('rule');
    updates.revokeRule(base.skillId);
    updates.rollback(base.skillId, base.revisionId);
    expect(connect).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the current marker visible after rollback beyond the recent twenty revisions', async () => {
    const base = await imported();
    for (let ordinal = 2; ordinal <= 22; ordinal += 1) derive(base.skillId, `${LOCAL_SKILL}\nSynthetic revision ${ordinal}.`);
    updates.rollback(base.skillId, base.revisionId);
    const page = updates.inspect(base.revisionId, null);
    expect(page.history).toHaveLength(21);
    expect(page.history.filter((entry) => entry.current)).toEqual([expect.objectContaining({ revisionId: base.revisionId, selectedReason: 'rollback' })]);
    expect(page.skills[0]!.revisionId).toBe(base.revisionId);
  });

  it('returns to an earlier revision as a new current selection, without rewriting history or restoring enablement', async () => {
    const base = await imported();
    skills.validate(base.revisionId);
    const installed = skills.install(base.revisionId, skills.revision(base.revisionId).previewDigest);
    skills.enable(base.revisionId, bookId, installed.previewDigest);
    const adopted = adopt((await check(base.skillId, 'plain-v2-text')).candidate!);
    const second = adopted.adoptedRevisionId!;
    const history = db.prepare('SELECT * FROM imported_skill_revisions ORDER BY ordinal').all();
    const states = db.prepare('SELECT * FROM imported_skill_states ORDER BY revision_id, sequence').all();
    const returned = updates.rollback(base.skillId, base.revisionId);
    expect(returned).toMatchObject({ revisionId: base.revisionId, state: 'installed-disabled', enabledBooks: [] });
    expect(skills.currentRevisionId(base.skillId)).toBe(base.revisionId);
    expect(db.prepare('SELECT * FROM imported_skill_revisions ORDER BY ordinal').all()).toEqual(history);
    expect(db.prepare('SELECT * FROM imported_skill_states ORDER BY revision_id, sequence').all()).toEqual(states);
    expect(skills.currentRevisionId(base.skillId)).not.toBe(second);
    expect(db.prepare('SELECT reason FROM imported_skill_current_selections ORDER BY sequence').all().map((row) => row.reason)).toEqual(['import', 'adopt', 'rollback']);
    // Enablement is the editor's, again and explicitly.
    const enabledAgain = skills.enable(base.revisionId, bookId, returned.previewDigest);
    expect(enabledAgain).toMatchObject({ state: 'enabled', enabledBooks: [bookId] });
    // The list and the history read the current selection, with the marker on it.
    const page = updates.inspect(base.revisionId, null);
    expect(page.skills.map((skill) => [skill.revisionId, skill.ordinal])).toEqual([[base.revisionId, 1]]);
    expect(page.history.map((entry) => [entry.ordinal, entry.current, entry.origin, entry.selectedReason])).toEqual([[2, false, 'adopt', null], [1, true, 'import', 'rollback']]);
  });

  it('suspends enablement afresh at every return, and refuses to return to the current revision or to another Skill', async () => {
    const base = await imported();
    skills.validate(base.revisionId);
    const installed = skills.install(base.revisionId, skills.revision(base.revisionId).previewDigest);
    skills.enable(base.revisionId, bookId, installed.previewDigest);
    adopt((await check(base.skillId, 'plain-v2-text')).candidate!);
    updates.rollback(base.skillId, base.revisionId);
    skills.enable(base.revisionId, bookId, skills.revision(base.revisionId).previewDigest);
    expect(skills.revision(base.revisionId).enabledBooks).toEqual([bookId]);
    const after = adopt((await check(base.skillId, 'plain-v2-resources')).candidate!);
    expect(skills.revision(after.adoptedRevisionId!)).toMatchObject({ ordinal: 3, previousRevisionId: base.revisionId, enabledBooks: [] });
    updates.rollback(base.skillId, base.revisionId);
    expect(skills.revision(base.revisionId)).toMatchObject({ state: 'installed-disabled', enabledBooks: [] });
    expect(() => updates.rollback(base.skillId, base.revisionId)).toThrow('已经是当前修订');
    const other = await imported('resources');
    expect(() => updates.rollback(base.skillId, other.revisionId)).toThrow('没有这一版');
  });

  it('lets only the current revision be validated, installed or enabled, and keeps a Skill kept before selections existed on its latest', async () => {
    const base = await imported();
    const adopted = adopt((await check(base.skillId, 'plain-v2-text')).candidate!);
    expect(() => skills.validate(base.revisionId)).toThrow('不是当前修订');
    expect(skills.validate(adopted.adoptedRevisionId!).state).toBe('validated');
    // A Skill with no selection row — kept before revision 83 — is on its latest ordinal.
    const legacy = await imported('resources');
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('DROP TRIGGER imported_skill_current_selections_no_delete');
    db.prepare('DELETE FROM imported_skill_current_selections WHERE skill_id = ?').run(legacy.skillId);
    db.exec('PRAGMA foreign_keys = ON');
    expect(skills.currentRevisionId(legacy.skillId)).toBe(legacy.revisionId);
  });
});

describe('the update ledgers are append-only and refuse an unreasoned row', () => {
  it('refuses every update and delete, a second rule, a revocation of nothing, and a selection of another Skill\'s revision', async () => {
    const base = await imported();
    const candidate = adopt((await check(base.skillId, 'plain-v2-text')).candidate!);
    updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    updates.rollback(base.skillId, base.revisionId);
    for (const table of Object.keys(IMPORTED_SKILL_UPDATE_SCHEMA_SQL)) {
      expect(() => db.exec(`UPDATE ${table} SET sha256 = sha256`)).toThrow(/IMPORTED_SKILL_UPDATE_IMMUTABLE|IMMUTABLE/u);
      expect(() => db.exec(`DELETE FROM ${table}`)).toThrow(/IMMUTABLE/u);
    }
    const other = await imported('resources');
    expect(() => skills.appendSelection(base.skillId, other.revisionId, 'import', null, null)).toThrow(/IMPORTED_SKILL_SELECTION_INVALID/u);
    expect(() => skills.appendSelection(base.skillId, base.revisionId, 'adopt', candidate.candidateId.replace(/./u, '0'), null)).toThrow();
    expect(() => db.prepare("INSERT INTO imported_skill_update_rules VALUES (?, ?, 5, 'revoke', ?, NULL, 'x', '{}', ?)")
      .run(randomUUID(), base.skillId, randomUUID(), 'a'.repeat(64))).toThrow();
    expect(() => db.prepare("INSERT INTO imported_skill_update_rules VALUES (?, ?, 2, 'create', NULL, '随便一句', 'x', '{}', ?)")
      .run(randomUUID(), base.skillId, 'b'.repeat(64))).toThrow();
  });

  it('refuses a rule adoption of a candidate that is not clean, and an adoption whose revision follows another snapshot', async () => {
    const base = await imported();
    updates.createRule(base.skillId, IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION);
    const risky = (await check(base.skillId, 'plain-v2-scripts')).candidate!;
    const ruleId = String(db.prepare('SELECT rule_id FROM imported_skill_update_rules').get()?.rule_id);
    db.exec('BEGIN IMMEDIATE');
    const revisionId = skills.insertRevision({
      skillId: base.skillId, snapshotId: risky.incoming.snapshotId, previousRevisionId: base.revisionId,
      files: skills.snapshot(risky.incoming.snapshotId).files, conversion: convertSkillFiles(skills.snapshot(risky.incoming.snapshotId).files, 'x'.repeat(64), base.name),
    });
    expect(() => db.prepare("INSERT INTO imported_skill_update_candidates VALUES (?, 2, ?, 'adopted', NULL, NULL, NULL, NULL, 'rule', ?, ?, ?, '{}', ?)")
      .run(risky.candidateId, base.skillId, revisionId, ruleId, new Date().toISOString(), 'c'.repeat(64))).toThrow(/IMPORTED_SKILL_UPDATE_CANDIDATE_INVALID/u);
    db.exec('ROLLBACK');
  });
});
