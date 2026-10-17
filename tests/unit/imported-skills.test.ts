import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Socket } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { acquireSkillPackage, ImportedSkills, MAX_SKILL_PACKAGE_BYTES, SkillAcquisitions } from '../../src/service/imported-skills.js';
import { initializeImportedSkillSchema, initializeImportedSkillUpdateSchema, IMPORTED_SKILL_SCHEMA_SQL } from '../../src/service/imported-skill-schema.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { MAX_FRAME_BYTES } from '../../src/shared/protocol.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

const fixture = (name: string) => resolve('tests/fixtures/skills', name);
const bookId = randomUUID();
let db: DatabaseSync;
let skills: ImportedSkills;
let scratch: string;
/** Acquire, then keep: the two separate steps 导入 Skill… takes. */
const kept = async (path: string) => skills.keep(await acquireSkillPackage(path));
const rowCounts = (): number[] => Object.keys(IMPORTED_SKILL_SCHEMA_SQL).map((table) => Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n));
beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ai7-skills-'));
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE books(book_id TEXT PRIMARY KEY) STRICT');
  db.prepare('INSERT INTO books VALUES (?)').run(bookId);
  initializeImportedSkillSchema(db, 0);
  // Synchronized delta with #89: a Skill's current selection is read from revision 83's relation.
  initializeImportedSkillUpdateSchema(db, 0);
  skills = new ImportedSkills(db);
});
afterEach(async () => { vi.restoreAllMocks(); db.close(); await rm(scratch, { recursive: true, force: true }); });

describe('foreign Skill inert lifecycle (ADR 0045, ADR 0090)', () => {
  it('discloses identity, provenance, license and digest before keeping anything, and keeps no package without SKILL.md', async () => {
    const acquired = await acquireSkillPackage(fixture('plain'));
    const disclosed = skills.disclose(acquired, randomUUID());
    expect(disclosed).toMatchObject({
      name: 'synthetic-style-review', sourceRevision: '1.0.0', kind: 'DSH Skill', license: 'MIT', notices: [], problems: [], keepable: true, keptRevisionId: null,
    });
    expect(disclosed.sourcePath.toLowerCase()).toBe(fixture('plain').toLowerCase());
    expect(disclosed.contentSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(disclosed.files.map((file) => Object.keys(file).sort())).toEqual([['bytes', 'path', 'sha256']]);
    expect(rowCounts()).toEqual([0, 0, 0, 0]);
    const notes = join(scratch, 'notes'); await mkdir(notes);
    await writeFile(join(notes, 'notes.txt'), 'synthetic notes, not a Skill');
    const stray = await acquireSkillPackage(notes);
    expect(skills.disclose(stray, randomUUID()).keepable).toBe(false);
    expect(() => skills.keep(stray)).toThrow(/不是 Skill 包/u);
    expect(rowCounts()).toEqual([0, 0, 0, 0]);
    const revision = skills.keep(acquired);
    expect(skills.disclose(acquired, randomUUID()).keptRevisionId).toBe(revision.revisionId);
  });

  it('holds disclosed acquisitions in memory only, a few at a time, and refuses one it no longer holds', async () => {
    const staged = new SkillAcquisitions();
    const acquired = await acquireSkillPackage(fixture('plain'));
    const ids = Array.from({ length: 5 }, () => staged.stage(acquired));
    expect(() => staged.read(ids[0]!)).toThrow(/重新选择/u);
    expect(staged.read(ids[4]!)).toBe(acquired);
    staged.release(ids[4]!);
    expect(() => staged.read(ids[4]!)).toThrow(/重新选择/u);
    expect(() => staged.read('not-an-id')).toThrow(/重新选择/u);
  });

  it('preserves files and exact identity; import/validation cannot install or enable; separate confirmation pins the ceiling', async () => {
    const acquired = await kept(fixture('plain'));
    expect(acquired).toMatchObject({ name: 'synthetic-style-review', sourceRevision: '1.0.0', kind: 'DSH Skill', state: 'pending-validation', enabledBooks: [] });
    expect(Buffer.from(acquired.files[0]!.base64, 'base64')).toEqual(await readFile(join(fixture('plain'), 'SKILL.md')));
    expect(acquired.conversion.preserved).toEqual(['SKILL.md']);
    expect(() => skills.install(acquired.revisionId, acquired.previewDigest)).toThrow(/先验证通过/u);
    expect(() => skills.enable(acquired.revisionId, bookId, acquired.previewDigest)).toThrow(/先安装/u);
    const validated = skills.validate(acquired.revisionId);
    expect(validated.state).toBe('validated');
    expect(validated.enabledBooks).toEqual([]);
    expect(() => skills.install(validated.revisionId, acquired.previewDigest)).toThrow(/有了变化/u);
    const installed = skills.install(validated.revisionId, validated.previewDigest);
    expect(installed.state).toBe('installed-disabled');
    expect(installed.enabledBooks).toEqual([]);
    const enabled = skills.enable(installed.revisionId, bookId, installed.previewDigest);
    expect(enabled.state).toBe('enabled');
    expect(enabled.enabledBooks).toEqual([bookId]);
    expect(enabled.ceiling).toEqual({ requestedCapabilities: [], executor: false, runSourceScope: 'none', provider: false, effect: false, credentials: false, network: false, backgroundAnalysis: false, apply: false });
    // Reviewer (#66): installation and enablement each record the preview the editor confirmed and the ceiling it showed.
    const events = (db.prepare('SELECT state, canonical_json FROM imported_skill_states WHERE revision_id = ? ORDER BY sequence').all(enabled.revisionId))
      .map((row) => ({ ...JSON.parse(String(row.canonical_json)) as Record<string, unknown>, state: row.state }) as Record<string, unknown>);
    expect(events.map((event) => [event.state, event.confirmedPreviewDigest ?? null, event.ceiling ?? null])).toEqual([
      ['validated', null, null],
      ['installed-disabled', validated.previewDigest, validated.ceiling],
      ['enabled', installed.previewDigest, installed.ceiling],
    ]);
  });

  it('preserves resources and notices; the same digest has one snapshot and one unchanged revision', async () => {
    const first = await kept(fixture('resources'));
    const repeat = await kept(fixture('resources'));
    expect(repeat.revisionId).toBe(first.revisionId);
    expect(repeat.snapshotId).toBe(first.snapshotId);
    expect(first.notices).toEqual(['NOTICE']);
    expect(first.files.map((file) => file.path)).toEqual(['NOTICE', 'SKILL.md', 'resources/note.md']);
    expect(first.workingFiles).toEqual(first.files);
    expect(skills.validate(first.revisionId).state).toBe('validated');
  });

  it('keeps one snapshot to one Skill: a source changed to content another source holds joins that Skill, never its snapshot alone', async () => {
    const one = join(scratch, 'one'); const other = join(scratch, 'other');
    await cp(fixture('plain'), one, { recursive: true });
    await cp(fixture('resources'), other, { recursive: true });
    const first = await kept(one);
    const second = await kept(other);
    expect(second.skillId).not.toBe(first.skillId);
    await rm(other, { recursive: true }); await cp(fixture('plain'), other, { recursive: true });
    const same = await kept(other);
    expect([same.skillId, same.snapshotId, same.revisionId]).toEqual([first.skillId, first.snapshotId, first.revisionId]);
    expect(skills.revision(second.revisionId)).toEqual(second);
    // The pair is one reference: a revision naming another Skill's snapshot is refused by the relation itself.
    expect(() => db.prepare('INSERT INTO imported_skill_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), second.skillId, first.snapshotId, 2, second.revisionId, 'c'.repeat(64), 'now', '{}', 'd'.repeat(64))).toThrow(/FOREIGN KEY/u);
  });

  it('reads a kept report and ceiling as recorded, whatever a later converter would say of the same files', async () => {
    const first = await kept(fixture('plain'));
    const row = db.prepare('SELECT * FROM imported_skill_revisions WHERE revision_id = ?').get(first.revisionId)!;
    const earlier = JSON.parse(String(row.canonical_json)) as Record<string, unknown>;
    const revisionId = randomUUID();
    const record = canonicalRecord({
      ...earlier, revisionId, ordinal: 2, previousRevisionId: first.revisionId,
      conversion: { preserved: ['SKILL.md'], mapped: ['an earlier converter’s synthetic line'], reviewRequired: [], unsupported: [] },
    });
    db.prepare('INSERT INTO imported_skill_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(revisionId, first.skillId, first.snapshotId, 2, first.revisionId, first.workingSha256, 'now', record.json, record.digest);
    expect(skills.revision(revisionId).conversion.mapped).toEqual(['an earlier converter’s synthetic line']);
    // Synchronized delta with #89: a revision is the Skill's current one by its selection, which a row planted past `keep` has to make.
    skills.appendSelection(first.skillId, revisionId, 'import', null, null);
    expect(skills.inspect(null, null).skills.map((skill) => skill.revisionId)).toEqual([revisionId]);
  });

  it('keeps restricted and malformed exact revisions inspectable; repair appends and never rewrites history', async () => {
    const restricted = await kept(fixture('script'));
    const verdict = skills.validate(restricted.revisionId);
    expect(verdict.state).toBe('restricted');
    expect(verdict.conversion.unsupported.join('')).toContain('marker.sh');
    expect(() => skills.install(verdict.revisionId, verdict.previewDigest)).toThrow();
    const source = join(scratch, 'repair');
    await cp(fixture('malformed'), source, { recursive: true });
    const bad = skills.validate((await kept(source)).revisionId);
    expect(bad.state).toBe('rejected');
    await writeFile(join(source, 'SKILL.md'), await readFile(join(fixture('plain'), 'SKILL.md')));
    const repaired = await kept(source);
    expect(repaired.skillId).toBe(bad.skillId);
    expect(repaired.ordinal).toBe(2);
    expect(repaired.previousRevisionId).toBe(bad.revisionId);
    expect(repaired.snapshotId).not.toBe(bad.snapshotId);
    expect(skills.revision(bad.revisionId)).toEqual(bad);
    expect(skills.validate(repaired.revisionId).state).toBe('validated');
  });

  it('reads ZIP files without extracting or executing members and refuses path escape and oversized content', async () => {
    const zip = join(scratch, 'plain.zip');
    await writeFile(zip, zipSync({ 'SKILL.md': new Uint8Array(await readFile(join(fixture('plain'), 'SKILL.md'))) }, { mtime: fixedArchiveTime() }));
    expect((await kept(zip)).name).toBe('synthetic-style-review');
    await writeFile(zip, zipSync({ '../SKILL.md': strToU8('synthetic') }, { mtime: fixedArchiveTime() }));
    await expect(acquireSkillPackage(zip)).rejects.toMatchObject({ code: 'SKILL_PATH_RESTRICTED' });
    await writeFile(zip, zipSync({ 'SKILL.md': strToU8('x'.repeat(MAX_SKILL_PACKAGE_BYTES + 1)) }, { mtime: fixedArchiveTime() }));
    await expect(acquireSkillPackage(zip)).rejects.toMatchObject({ code: 'SKILL_SIZE_INVALID' });
    const directory = join(scratch, 'oversized'); await mkdir(directory);
    await writeFile(join(directory, 'SKILL.md'), 'x'.repeat(MAX_SKILL_PACKAGE_BYTES + 1));
    await expect(acquireSkillPackage(directory)).rejects.toMatchObject({ code: 'SKILL_SIZE_OR_PATH_INVALID' });
    expect(skills.inspect(null, null).skills).toHaveLength(1);
  });

  it('does not touch sockets or fetch during acquisition, disclosure, keeping, validation, installation or enablement', async () => {
    const socket = vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('SOCKET_DENIED'); });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('NETWORK_DENIED'); });
    const package_ = await acquireSkillPackage(fixture('plain'));
    skills.disclose(package_, randomUUID());
    const acquired = skills.keep(package_);
    const validated = skills.validate(acquired.revisionId);
    const installed = skills.install(validated.revisionId, validated.previewDigest);
    skills.enable(installed.revisionId, bookId, installed.previewDigest);
    expect(socket).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('maps host tool declarations to an empty ceiling and rejects hooks without executing them', async () => {
    const source = join(scratch, 'host'); await mkdir(source);
    await writeFile(join(source, 'SKILL.md'), '---\nname: synthetic-host\ndescription: Synthetic host declaration.\nallowed-tools: Read Bash\nhooks: synthetic-marker\n---\nInert synthetic content.\n');
    const acquired = await kept(source);
    expect(acquired.conversion.mapped.join('')).toContain('allowed-tools');
    expect(acquired.ceiling.requestedCapabilities).toContain('allowed-tools: Read Bash');
    expect(skills.validate(acquired.revisionId).state).toBe('restricted');
  });

  it('restricts synthetic executable headers in resources even when their names look like inert data', async () => {
    const source = join(scratch, 'renamed');
    await cp(fixture('plain'), source, { recursive: true });
    // Synthetic markers only, not executable programs or third-party content.
    await writeFile(join(source, 'native.dat'), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00]));
    await writeFile(join(source, 'note.txt'), '#! synthetic inert marker\n');
    const acquired = await kept(source);
    const verdict = skills.validate(acquired.revisionId);
    expect(verdict.state).toBe('restricted');
    expect(verdict.conversion.unsupported.join('')).toContain('native.dat');
    expect(verdict.conversion.unsupported.join('')).toContain('note.txt');
    expect(() => skills.install(verdict.revisionId, verdict.previewDigest)).toThrow();
  });

  it('pins append-only table constraints and keeps the maximum accepted detail within one frame', async () => {
    const revision = await kept(fixture('plain'));
    skills.validate(revision.revisionId);
    for (const table of Object.keys(IMPORTED_SKILL_SCHEMA_SQL)) {
      expect(() => db.exec(`DELETE FROM ${table}`)).toThrow(/IMPORTED_SKILL_IMMUTABLE/u);
      expect(() => db.exec(`UPDATE ${table} SET sha256 = '${'a'.repeat(64)}'`)).toThrow(/IMPORTED_SKILL_IMMUTABLE/u);
    }
    const source = join(scratch, 'bounded'); await mkdir(source);
    const skill = await readFile(join(fixture('plain'), 'SKILL.md'));
    await writeFile(join(source, 'SKILL.md'), Buffer.concat([skill, Buffer.alloc(MAX_SKILL_PACKAGE_BYTES - skill.length, 120)]));
    const largest = await acquireSkillPackage(source);
    const keptLargest = skills.keep(largest);
    expect(Buffer.byteLength(JSON.stringify({ id: 1, ok: true, result: { acquisition: skills.disclose(largest, randomUUID()), revision: keptLargest } }))).toBeLessThan(MAX_FRAME_BYTES);
    expect(Buffer.byteLength(JSON.stringify({ id: 1, ok: true, result: skills.inspect(keptLargest.revisionId, null) }))).toBeLessThan(MAX_FRAME_BYTES);
    expect(skills.inspect(revision.revisionId, null).revision?.revisionId).toBe(revision.revisionId);
  });
});
