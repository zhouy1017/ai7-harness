import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Socket } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { ImportedSkills, MAX_SKILL_PACKAGE_BYTES } from '../../src/service/imported-skills.js';
import { initializeImportedSkillSchema, IMPORTED_SKILL_SCHEMA_SQL } from '../../src/service/imported-skill-schema.js';
import { MAX_FRAME_BYTES } from '../../src/shared/protocol.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

const fixture = (name: string) => resolve('tests/fixtures/skills', name);
const bookId = randomUUID();
let db: DatabaseSync;
let skills: ImportedSkills;
let scratch: string;
beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'ai7-skills-'));
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE books(book_id TEXT PRIMARY KEY) STRICT');
  db.prepare('INSERT INTO books VALUES (?)').run(bookId);
  initializeImportedSkillSchema(db);
  skills = new ImportedSkills(db);
});
afterEach(async () => { vi.restoreAllMocks(); db.close(); await rm(scratch, { recursive: true, force: true }); });

describe('foreign Skill inert lifecycle (ADR 0045, ADR 0090)', () => {
  it('preserves files and exact identity; import/validation cannot install or enable; separate confirmation pins the ceiling', async () => {
    const acquired = await skills.importPackage(fixture('plain'));
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
  });

  it('preserves resources and notices; the same digest has one snapshot and one unchanged revision', async () => {
    const first = await skills.importPackage(fixture('resources'));
    const repeat = await skills.importPackage(fixture('resources'));
    expect(repeat.revisionId).toBe(first.revisionId);
    expect(repeat.snapshotId).toBe(first.snapshotId);
    expect(first.notices).toEqual(['NOTICE']);
    expect(first.files.map((file) => file.path)).toEqual(['NOTICE', 'SKILL.md', 'resources/note.md']);
    expect(first.workingFiles).toEqual(first.files);
    expect(skills.validate(first.revisionId).state).toBe('validated');
  });

  it('keeps restricted and malformed exact revisions inspectable; repair appends and never rewrites history', async () => {
    const restricted = await skills.importPackage(fixture('script'));
    const verdict = skills.validate(restricted.revisionId);
    expect(verdict.state).toBe('restricted');
    expect(verdict.conversion.unsupported.join('')).toContain('marker.sh');
    expect(() => skills.install(verdict.revisionId, verdict.previewDigest)).toThrow();
    const source = join(scratch, 'repair');
    await cp(fixture('malformed'), source, { recursive: true });
    const bad = skills.validate((await skills.importPackage(source)).revisionId);
    expect(bad.state).toBe('rejected');
    await writeFile(join(source, 'SKILL.md'), await readFile(join(fixture('plain'), 'SKILL.md')));
    const repaired = await skills.importPackage(source);
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
    expect((await skills.importPackage(zip)).name).toBe('synthetic-style-review');
    await writeFile(zip, zipSync({ '../SKILL.md': strToU8('synthetic') }, { mtime: fixedArchiveTime() }));
    await expect(skills.importPackage(zip)).rejects.toMatchObject({ code: 'SKILL_PATH_RESTRICTED' });
    await writeFile(zip, zipSync({ 'SKILL.md': strToU8('x'.repeat(MAX_SKILL_PACKAGE_BYTES + 1)) }, { mtime: fixedArchiveTime() }));
    await expect(skills.importPackage(zip)).rejects.toMatchObject({ code: 'SKILL_SIZE_INVALID' });
    const directory = join(scratch, 'oversized'); await mkdir(directory);
    await writeFile(join(directory, 'SKILL.md'), 'x'.repeat(MAX_SKILL_PACKAGE_BYTES + 1));
    await expect(skills.importPackage(directory)).rejects.toMatchObject({ code: 'SKILL_SIZE_OR_PATH_INVALID' });
    expect(skills.inspect(null, null).skills).toHaveLength(1);
  });

  it('does not touch sockets or fetch during acquisition, validation, installation or enablement', async () => {
    const socket = vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => { throw new Error('SOCKET_DENIED'); });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('NETWORK_DENIED'); });
    const acquired = await skills.importPackage(fixture('plain'));
    const validated = skills.validate(acquired.revisionId);
    const installed = skills.install(validated.revisionId, validated.previewDigest);
    skills.enable(installed.revisionId, bookId, installed.previewDigest);
    expect(socket).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('maps host tool declarations to an empty ceiling and rejects hooks without executing them', async () => {
    const source = join(scratch, 'host'); await mkdir(source);
    await writeFile(join(source, 'SKILL.md'), '---\nname: synthetic-host\ndescription: Synthetic host declaration.\nallowed-tools: Read Bash\nhooks: synthetic-marker\n---\nInert synthetic content.\n');
    const acquired = await skills.importPackage(source);
    expect(acquired.conversion.mapped.join('')).toContain('allowed-tools');
    expect(acquired.ceiling.requestedCapabilities).toContain('allowed-tools: Read Bash');
    expect(skills.validate(acquired.revisionId).state).toBe('restricted');
  });

  it('pins append-only table constraints and keeps the maximum accepted detail within one frame', async () => {
    const revision = await skills.importPackage(fixture('plain'));
    skills.validate(revision.revisionId);
    for (const table of Object.keys(IMPORTED_SKILL_SCHEMA_SQL)) {
      expect(() => db.exec(`DELETE FROM ${table}`)).toThrow(/IMPORTED_SKILL_IMMUTABLE/u);
      expect(() => db.exec(`UPDATE ${table} SET sha256 = '${'a'.repeat(64)}'`)).toThrow(/IMPORTED_SKILL_IMMUTABLE/u);
    }
    const source = join(scratch, 'bounded'); await mkdir(source);
    const skill = await readFile(join(fixture('plain'), 'SKILL.md'));
    await writeFile(join(source, 'SKILL.md'), Buffer.concat([skill, Buffer.alloc(MAX_SKILL_PACKAGE_BYTES - skill.length, 120)]));
    const largest = await skills.importPackage(source);
    expect(Buffer.byteLength(JSON.stringify({ id: 1, ok: true, result: largest }))).toBeLessThan(MAX_FRAME_BYTES);
    expect(skills.inspect(revision.revisionId, null).revision?.revisionId).toBe(revision.revisionId);
  });
});
