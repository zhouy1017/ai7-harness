import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ImportedSkillCeiling, ImportedSkillFile, ImportedSkillRevisionProjection, ImportedSkillsProjection, ImportedSkillUpdateCandidateProjection,
  ImportedSkillUpdateCandidateSummary, ImportedSkillUpdateCheckProjection, ImportedSkillUpdateDisposition, ImportedSkillUpdateFileReport,
  ImportedSkillUpdateRuleProjection,
} from '../shared/protocol.js';
import { canonicalJson, canonicalRecord, sha256Hex, UUID_PATTERN } from './analysis/canonical.js';
import { IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION } from './imported-skill-schema.js';
import {
  convertSkillFiles, ImportedSkills, isSkillFile, MAX_SKILL_FILES, MAX_SKILL_PACKAGE_BYTES, recordOf, requireSkill, validationVerdict,
  type AcquiredSkillPackage, type Conversion, type Row,
} from './imported-skills.js';

/**
 * ADR 0090 §3 and ADR 0045 § Update and rollback (REUSE-032 to REUSE-035): a foreign Skill's update is read from one local package,
 * kept as a new immutable Source Skill Snapshot, and reconciled against the Skill's prior snapshot and its current working revision
 * into ONE inert, attributed candidate. Nothing here fetches, runs, interprets or sends anything; a candidate changes no revision,
 * state, enablement, rule or pin until the editor adopts it — or, for a clean one only, the Skill's own Artifact Update Rule does.
 * Adoption writes a new working revision through the same primitive an import does, and never an enablement.
 */
const NO_IDENTITY = '\u0000no-identity';
const CREATED = 'ai7.imported-skill-update-candidate/1';
const RESOLVED = 'ai7.imported-skill-update-resolution/1';
const RULE = 'ai7.imported-skill-update-rule/1';
const NOT_THE_SAME = '这不是同一个 Skill 的新版本。';

/** The stable identity of a Skill across its versions: the `name` its SKILL.md front matter declares, or none when it declares none. */
export function skillIdentity(files: readonly ImportedSkillFile[], digest: string): string | null {
  const name = convertSkillFiles(files, digest, NO_IDENTITY).name.trim();
  return name === '' || name === NO_IDENTITY ? null : name;
}

/** Three-way, file by file: what changed upstream since the prior snapshot, what changed locally in the working revision, and both. */
export function reconcileFiles(
  prior: readonly ImportedSkillFile[], working: readonly ImportedSkillFile[], incoming: readonly ImportedSkillFile[],
): ImportedSkillUpdateFileReport[] {
  const sha = (files: readonly ImportedSkillFile[]): Map<string, string> => new Map(files.map((file) => [file.path, file.sha256]));
  const [before, now, after] = [sha(prior), sha(working), sha(incoming)];
  return [...new Set([...before.keys(), ...now.keys(), ...after.keys()])].sort().map((path) => {
    const [priorSha256, workingSha256, incomingSha256] = [before.get(path) ?? null, now.get(path) ?? null, after.get(path) ?? null];
    const upstream = priorSha256 !== incomingSha256;
    const local = priorSha256 !== workingSha256;
    // Both sides arriving at the same bytes is agreement, not a conflict.
    const change = !upstream && !local ? 'unchanged' : upstream && !local ? 'upstream' : !upstream ? 'local' : workingSha256 === incomingSha256 ? 'upstream' : 'conflict';
    return { path, change, priorSha256, workingSha256, incomingSha256 };
  });
}

/** What the incoming version asks of AI7 that the revision it would follow did not: a new script, resource class, tool, dependency or declaration. */
export function authorityChanges(
  base: Pick<ImportedSkillRevisionProjection, 'conversion' | 'ceiling' | 'files' | 'workingFiles'>, incoming: Conversion, incomingFiles: readonly ImportedSkillFile[],
): string[] {
  const items: string[] = [];
  const unsupported = new Set(base.conversion.unsupported);
  for (const line of incoming.conversion.unsupported) if (!unsupported.has(line)) items.push(`新增脚本、依赖或宿主配置：${line}`);
  const declared = new Set(base.ceiling.requestedCapabilities);
  for (const capability of incoming.ceiling.requestedCapabilities) if (!declared.has(capability)) items.push(`新增或改变的权限、工具声明：${capability}`);
  const resourceClass = (path: string): string => path.includes('/') ? `${path.slice(0, path.indexOf('/'))}/` : '（根目录）';
  const known = new Set([...base.workingFiles, ...base.files].map((file) => resourceClass(file.path)));
  for (const kind of [...new Set(incomingFiles.map((file) => resourceClass(file.path)))].sort()) if (!known.has(kind)) items.push(`新增资源类别：${kind}`);
  for (const key of Object.keys(incoming.ceiling) as Array<keyof ImportedSkillCeiling>) {
    if (key !== 'requestedCapabilities' && incoming.ceiling[key] !== base.ceiling[key]) items.push(`权限上限扩大：${key}`);
  }
  return items;
}

/** One disposition from the findings, the gravest first; only a candidate with none of them is clean (REUSE-034). */
function dispositionOf(authority: readonly string[], validator: string, conflicts: readonly string[]): ImportedSkillUpdateDisposition {
  return authority.length > 0 ? 'authority-change' : validator !== 'validated' ? 'validator-failed' : conflicts.length > 0 ? 'conflict' : 'clean';
}

interface CreatedRecord {
  readonly candidateId: string;
  readonly skillId: string;
  readonly fromSnapshotId: string;
  readonly toSnapshotId: string;
  readonly baseRevisionId: string;
  readonly disposition: ImportedSkillUpdateDisposition;
  readonly prior: { readonly sha256: string; readonly sourceRevision: string };
  readonly working: { readonly ordinal: number; readonly sha256: string };
  readonly incoming: { readonly name: string; readonly sourceRevision: string; readonly sourcePath: string; readonly sha256: string };
  readonly files: readonly ImportedSkillUpdateFileReport[];
  readonly validator: { readonly state: 'validated' | 'restricted' | 'rejected'; readonly reasons: readonly string[] };
  readonly authorityChanges: readonly string[];
  readonly conflicts: readonly string[];
  readonly acceptItems: readonly string[];
  readonly recordedAt: string;
}
interface Candidate {
  readonly created: Row;
  readonly record: CreatedRecord;
  readonly resolution: Row | undefined;
  readonly status: 'open' | 'adopted' | 'dismissed';
  readonly stale: boolean;
}
type Adopter = { readonly kind: 'editor' } | { readonly kind: 'rule'; readonly ruleId: string };

export class ImportedSkillUpdates {
  constructor(readonly db: DatabaseSync, readonly skills: ImportedSkills) {}

  #base(skillId: string): ImportedSkillRevisionProjection {
    requireSkill(typeof skillId === 'string' && UUID_PATTERN.test(skillId), 'IMPORTED_SKILL_INVALID', 'Skill 标识无效。');
    return this.skills.revision(this.skills.currentRevisionId(skillId));
  }

  /** How the picked package stands to the Skill it would update; a package that is not that Skill is refused before anything is staged or kept. */
  #relation(base: ImportedSkillRevisionProjection, acquired: AcquiredSkillPackage): ImportedSkillUpdateCheckProjection['relation'] {
    requireSkill(acquired.files.some(isSkillFile), 'SKILL_NOT_A_PACKAGE', '所选内容里没有 SKILL.md，不是 Skill 包；不会保留。');
    const identity = skillIdentity(acquired.files, acquired.contentSha256);
    requireSkill(identity !== null && identity === base.name, 'SKILL_UPDATE_IDENTITY_DIFFERS', NOT_THE_SAME);
    const existing = this.db.prepare('SELECT snapshot_id, skill_id FROM imported_skill_snapshots WHERE content_sha256 = ?').get(acquired.contentSha256);
    if (existing === undefined) return 'newer';
    requireSkill(existing.skill_id === base.skillId, 'SKILL_UPDATE_IDENTITY_DIFFERS', NOT_THE_SAME);
    if (existing.snapshot_id === base.snapshotId) return 'same-as-current';
    // A snapshot some revision of the Skill already holds is in its history; one only a dismissed candidate named is still an update.
    return this.db.prepare('SELECT 1 FROM imported_skill_revisions WHERE snapshot_id = ?').get(String(existing.snapshot_id)) === undefined ? 'newer' : 'already-kept';
  }

  /** Refuses a package that is not this Skill's; answers how it stands to the Skill. A read. */
  verify(skillId: string, acquired: AcquiredSkillPackage): ImportedSkillUpdateCheckProjection['relation'] {
    return this.#relation(this.#base(skillId), acquired);
  }

  /** What 检查更新（从文件）… shows of the picked package before anything of it is kept. A read. */
  disclose(skillId: string, acquired: AcquiredSkillPackage, acquisitionId: string): ImportedSkillUpdateCheckProjection {
    const relation = this.#relation(this.#base(skillId), acquired);
    return { skillId, acquisition: this.skills.disclose(acquired, acquisitionId), relation, candidate: null };
  }

  /**
   * Keeping the disclosed package: the new Source Skill Snapshot and one candidate, and — only when the Skill has an active Artifact
   * Update Rule and the candidate is clean — the adoption that rule makes. With no rule, nothing but those two rows is written.
   */
  keep(skillId: string, acquired: AcquiredSkillPackage, acquisitionId: string): ImportedSkillUpdateCheckProjection {
    return this.skills.transaction(() => {
      const base = this.#base(skillId);
      const relation = this.#relation(base, acquired);
      requireSkill(relation === 'newer', 'SKILL_UPDATE_NOT_NEWER',
        relation === 'same-as-current' ? '这已是此 Skill 保留的版本，没有新的更新。' : '这个版本已经保留过；请在版本历史里「回到此版本」。');
      const known = this.db.prepare('SELECT snapshot_id FROM imported_skill_snapshots WHERE content_sha256 = ?').get(acquired.contentSha256);
      const snapshotId = known === undefined ? this.skills.insertSnapshot(skillId, acquired) : String(known.snapshot_id);
      const open = this.db.prepare(`SELECT c.candidate_id FROM imported_skill_update_candidates c WHERE c.sequence = 1 AND c.skill_id = ? AND c.base_revision_id = ? AND c.to_snapshot_id = ?
        AND NOT EXISTS (SELECT 1 FROM imported_skill_update_candidates r WHERE r.candidate_id = c.candidate_id AND r.sequence = 2)`).get(skillId, base.revisionId, snapshotId);
      let candidateId = open === undefined ? null : String(open.candidate_id);
      if (candidateId === null) {
        candidateId = this.#create(base, snapshotId, acquired);
        const rule = this.#activeRuleId(skillId);
        if (rule !== null && this.#read(candidateId).record.disposition === 'clean') this.#adopt(candidateId, { kind: 'rule', ruleId: rule }, null);
      }
      return { skillId, acquisition: this.skills.disclose(acquired, acquisitionId), relation, candidate: this.#projection(this.#read(candidateId)) };
    });
  }

  #create(base: ImportedSkillRevisionProjection, snapshotId: string, acquired: AcquiredSkillPackage): string {
    const files = reconcileFiles(base.files, base.workingFiles, acquired.files);
    // The validator is today's, over the incoming snapshot exactly as kept (REUSE-023); it records nothing here.
    const verdict = validationVerdict(acquired.conversion);
    const authority = authorityChanges(base, acquired.conversion, acquired.files);
    const conflicts = files.filter((file) => file.change === 'conflict').map((file) => file.path);
    const disposition = dispositionOf(authority, verdict.state, conflicts);
    // What an explicit adoption of a candidate that is not clean names, so no finding is accepted unseen.
    const acceptItems = disposition === 'clean' ? [] : [...new Set([...authority, ...(verdict.state === 'validated' ? [] : verdict.reasons), ...conflicts.map((path) => `文件冲突：${path}`)])];
    const candidateId = randomUUID();
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: CREATED, candidateId, sequence: 1, event: 'created', skillId: base.skillId, fromSnapshotId: base.snapshotId, toSnapshotId: snapshotId,
      baseRevisionId: base.revisionId, disposition, prior: { sha256: base.snapshotSha256, sourceRevision: base.sourceRevision },
      working: { ordinal: base.ordinal, sha256: base.workingSha256 },
      incoming: { name: acquired.conversion.name, sourceRevision: acquired.conversion.sourceRevision, sourcePath: acquired.sourcePath, sha256: acquired.contentSha256 },
      files, validator: verdict, authorityChanges: authority, conflicts, acceptItems, recordedAt,
    });
    this.db.prepare('INSERT INTO imported_skill_update_candidates VALUES (?, 1, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)')
      .run(candidateId, base.skillId, 'created', base.snapshotId, snapshotId, base.revisionId, disposition, recordedAt, record.json, record.digest);
    return candidateId;
  }

  #read(candidateId: string): Candidate {
    requireSkill(typeof candidateId === 'string' && UUID_PATTERN.test(candidateId), 'IMPORTED_SKILL_UPDATE_INVALID', '更新候选标识无效。');
    const rows = this.db.prepare('SELECT * FROM imported_skill_update_candidates WHERE candidate_id = ? ORDER BY sequence').all(candidateId) as Row[];
    requireSkill(rows.length > 0, 'IMPORTED_SKILL_UPDATE_NOT_FOUND', '这个更新候选不存在。');
    const created = rows[0]!;
    const data = recordOf(created);
    requireSkill(data.schema === CREATED && data.candidateId === candidateId && data.skillId === created.skill_id && data.fromSnapshotId === created.from_snapshot_id &&
      data.toSnapshotId === created.to_snapshot_id && data.baseRevisionId === created.base_revision_id && data.disposition === created.disposition && created.event === 'created',
    'IMPORTED_SKILL_RECORD_INVALID', 'Skill 更新候选记录不一致。');
    const resolution = rows[1];
    if (resolution !== undefined) {
      const resolved = recordOf(resolution);
      requireSkill(resolved.schema === RESOLVED && resolved.candidateId === candidateId && resolved.event === resolution.event, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 更新候选记录不一致。');
    }
    const status = resolution === undefined ? 'open' : resolution.event === 'adopted' ? 'adopted' : 'dismissed';
    const stale = status === 'open' && this.skills.currentRevisionId(String(created.skill_id)) !== created.base_revision_id;
    return { created, record: data as unknown as CreatedRecord, resolution, status, stale };
  }

  #summary(candidate: Candidate): ImportedSkillUpdateCandidateSummary {
    const { record, resolution } = candidate;
    return {
      candidateId: record.candidateId, skillId: record.skillId, disposition: record.disposition, status: candidate.status, stale: candidate.stale,
      adoptedBy: resolution?.adopted_by === undefined || resolution.adopted_by === null ? null : String(resolution.adopted_by) as 'editor' | 'rule',
      adoptedRevisionId: resolution?.adopted_revision_id === undefined || resolution.adopted_revision_id === null ? null : String(resolution.adopted_revision_id),
      incomingName: record.incoming.name, incomingSourceRevision: record.incoming.sourceRevision, createdAt: record.recordedAt,
    };
  }

  #projection(candidate: Candidate): ImportedSkillUpdateCandidateProjection {
    const { record } = candidate;
    return {
      ...this.#summary(candidate),
      prior: { snapshotId: record.fromSnapshotId, sha256: record.prior.sha256, sourceRevision: record.prior.sourceRevision },
      working: { revisionId: record.baseRevisionId, ordinal: record.working.ordinal, sha256: record.working.sha256 },
      incoming: { snapshotId: record.toSnapshotId, sha256: record.incoming.sha256, sourcePath: record.incoming.sourcePath },
      files: record.files, validator: record.validator, authorityChanges: record.authorityChanges, conflicts: record.conflicts,
      acceptItems: record.acceptItems, reviewDigest: String(candidate.created.sha256),
    };
  }

  inspectCandidate(candidateId: string): ImportedSkillUpdateCandidateProjection {
    return this.#projection(this.#read(candidateId));
  }

  /** The Skills page as 7c reads it, and, for the Skill of the revision asked for, its update candidates and its Artifact Update Rule. */
  inspect(revisionId: string | null, before: string | null): ImportedSkillsProjection {
    const page = this.skills.inspect(revisionId, before);
    if (page.revision === null) return page;
    const ids = this.db.prepare('SELECT candidate_id FROM imported_skill_update_candidates WHERE skill_id = ? AND sequence = 1 ORDER BY rowid DESC LIMIT 20').all(page.revision.skillId) as Row[];
    return { ...page, candidates: ids.map((row) => this.#summary(this.#read(String(row.candidate_id)))), rule: this.rule(page.revision.skillId) };
  }

  /** 采纳: the editor's explicit, reviewed adoption. A candidate that is not clean is adopted only when every item it names is named back. */
  adopt(candidateId: string, input: { reviewDigest: string; acceptItems: readonly string[]; upstreamPaths: readonly string[] }): ImportedSkillUpdateCandidateProjection {
    return this.skills.transaction(() => this.#projection(this.#adopt(candidateId, { kind: 'editor' }, input)));
  }

  #adopt(candidateId: string, by: Adopter, input: { reviewDigest: string; acceptItems: readonly string[]; upstreamPaths: readonly string[] } | null): Candidate {
    const candidate = this.#read(candidateId);
    const { record, created } = candidate;
    requireSkill(candidate.status === 'open', 'IMPORTED_SKILL_UPDATE_RESOLVED', '这个更新已经处理过了。');
    requireSkill(!candidate.stale, 'IMPORTED_SKILL_UPDATE_STALE', '这个 Skill 已经换了修订，这个更新不再对得上；请重新检查更新。');
    let upstream = new Set<string>();
    if (by.kind === 'editor') {
      requireSkill(input !== null && input.reviewDigest === created.sha256, 'IMPORTED_SKILL_UPDATE_PREVIEW_STALE', '更新候选在你查看后有了变化，请重新查看。');
      const named = [...new Set(input.acceptItems)].sort();
      requireSkill(Array.isArray(input.acceptItems) && named.length === input.acceptItems.length && canonicalJson(named) === canonicalJson([...record.acceptItems].sort()),
        'IMPORTED_SKILL_UPDATE_ITEMS_UNNAMED', '采纳前需要逐项确认候选里列出的每一项。');
      requireSkill(Array.isArray(input.upstreamPaths) && input.upstreamPaths.every((path) => record.conflicts.includes(path)) && new Set(input.upstreamPaths).size === input.upstreamPaths.length,
        'IMPORTED_SKILL_UPDATE_PATHS_INVALID', '「以上游为准」只能用于有冲突的文件。');
      upstream = new Set(input.upstreamPaths);
    } else requireSkill(record.disposition === 'clean', 'IMPORTED_SKILL_UPDATE_NOT_CLEAN', '只有无冲突、校验通过、未扩权的更新才会被自动采纳。');
    const base = this.skills.revision(record.baseRevisionId);
    const incoming = this.skills.snapshot(record.toSnapshotId);
    const working = new Map(base.workingFiles.map((file) => [file.path, file]));
    const taken = new Map(incoming.files.map((file) => [file.path, file]));
    const files: ImportedSkillFile[] = [];
    for (const entry of record.files) {
      // Unresolved conflicts are shown, never silently merged: a conflicting file takes upstream only when the editor ticked it.
      const file = entry.change === 'upstream' || (entry.change === 'conflict' && upstream.has(entry.path)) ? taken.get(entry.path) : working.get(entry.path);
      if (file !== undefined) files.push(file);
    }
    const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    requireSkill(files.length > 0 && files.length <= MAX_SKILL_FILES && bytes <= MAX_SKILL_PACKAGE_BYTES, 'IMPORTED_SKILL_UPDATE_SIZE', '采纳后的文件数量或总量超过上限。');
    const workingSha256 = sha256Hex(canonicalJson(files));
    const converted = convertSkillFiles(files, workingSha256, base.name);
    // The source revision a revision names is the upstream's, whichever files it kept.
    const conversion: Conversion = { ...converted, sourceRevision: convertSkillFiles(incoming.files, incoming.contentSha256, base.name).sourceRevision };
    const revisionId = this.skills.insertRevision({
      skillId: record.skillId, snapshotId: record.toSnapshotId, previousRevisionId: base.revisionId, files, conversion,
      provenance: { adoptedBy: by.kind, candidateId, ruleId: by.kind === 'rule' ? by.ruleId : null, upstreamPaths: [...upstream].sort() },
    });
    this.skills.appendSelection(record.skillId, revisionId, by.kind === 'rule' ? 'rule' : 'adopt', candidateId, null);
    this.#resolve(candidate, 'adopted', by, revisionId, input?.acceptItems ?? [], [...upstream].sort());
    return this.#read(candidateId);
  }

  /** 忽略: marked, not deleted; the snapshot it named stays kept. */
  dismiss(candidateId: string): ImportedSkillUpdateCandidateProjection {
    return this.skills.transaction(() => {
      const candidate = this.#read(candidateId);
      requireSkill(candidate.status === 'open', 'IMPORTED_SKILL_UPDATE_RESOLVED', '这个更新已经处理过了。');
      this.#resolve(candidate, 'dismissed', { kind: 'editor' }, null, [], []);
      return this.#projection(this.#read(candidateId));
    });
  }

  #resolve(candidate: Candidate, event: 'adopted' | 'dismissed', by: Adopter, revisionId: string | null, acceptedItems: readonly string[], upstreamPaths: readonly string[]): void {
    const { record } = candidate;
    const recordedAt = new Date().toISOString();
    const adoptedBy = event === 'adopted' ? by.kind : null;
    const ruleId = event === 'adopted' && by.kind === 'rule' ? by.ruleId : null;
    const written = canonicalRecord({
      schema: RESOLVED, candidateId: record.candidateId, sequence: 2, event, skillId: record.skillId, adoptedBy, adoptedRevisionId: revisionId, ruleId,
      acceptedItems, upstreamPaths, actor: by.kind === 'rule' ? '更新规则' : '本机编辑', recordedAt,
    });
    this.db.prepare('INSERT INTO imported_skill_update_candidates VALUES (?, 2, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)')
      .run(record.candidateId, record.skillId, event, adoptedBy, revisionId, ruleId, recordedAt, written.json, written.digest);
  }

  /** The Artifact Update Rule of one Skill: its confirmation line, whether it is active, and every creation and revocation. A read. */
  rule(skillId: string): ImportedSkillUpdateRuleProjection {
    requireSkill(typeof skillId === 'string' && UUID_PATTERN.test(skillId), 'IMPORTED_SKILL_INVALID', 'Skill 标识无效。');
    const rows = this.db.prepare('SELECT * FROM imported_skill_update_rules WHERE skill_id = ? ORDER BY sequence').all(skillId) as Row[];
    const history = rows.map((row) => {
      const data = recordOf(row);
      requireSkill(data.schema === RULE && data.ruleId === row.rule_id && data.action === row.action && data.skillId === skillId, 'IMPORTED_SKILL_RECORD_INVALID', 'Skill 更新规则记录不一致。');
      return { action: String(row.action) as 'create' | 'revoke', recordedAt: String(row.recorded_at) };
    });
    const last = rows.at(-1);
    const active = last !== undefined && last.action === 'create';
    return { active, ruleId: active ? String(last.rule_id) : null, confirmation: IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION, since: active ? String(last.recorded_at) : null, history: history.slice(-20) };
  }

  #activeRuleId(skillId: string): string | null {
    return this.rule(skillId).ruleId;
  }

  createRule(skillId: string, confirmation: string): ImportedSkillUpdateRuleProjection {
    return this.skills.transaction(() => {
      this.#base(skillId);
      requireSkill(confirmation === IMPORTED_SKILL_UPDATE_RULE_CONFIRMATION, 'IMPORTED_SKILL_RULE_UNCONFIRMED', '请先确认规则的说明。');
      requireSkill(this.#activeRuleId(skillId) === null, 'IMPORTED_SKILL_RULE_ACTIVE', '这个 Skill 已有更新规则。');
      this.#appendRule(skillId, 'create', null, confirmation);
      return this.rule(skillId);
    });
  }

  revokeRule(skillId: string): ImportedSkillUpdateRuleProjection {
    return this.skills.transaction(() => {
      this.#base(skillId);
      const active = this.#activeRuleId(skillId);
      requireSkill(active !== null, 'IMPORTED_SKILL_RULE_NONE', '这个 Skill 没有生效的更新规则。');
      this.#appendRule(skillId, 'revoke', active, null);
      return this.rule(skillId);
    });
  }

  #appendRule(skillId: string, action: 'create' | 'revoke', revokes: string | null, confirmation: string | null): void {
    const ruleId = randomUUID();
    const sequence = Number(this.db.prepare('SELECT coalesce(max(sequence), 0) + 1 AS n FROM imported_skill_update_rules WHERE skill_id = ?').get(skillId)?.n);
    const recordedAt = new Date().toISOString();
    const record = canonicalRecord({
      schema: RULE, ruleId, skillId, sequence, action, revokesRuleId: revokes, confirmation, scope: 'imported-skill-clean-updates', actor: '本机编辑', recordedAt,
    });
    this.db.prepare('INSERT INTO imported_skill_update_rules VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(ruleId, skillId, sequence, action, revokes, confirmation, recordedAt, record.json, record.digest);
  }

  /** 回到此版本: a new current selection of an earlier revision. History is not rewritten, and the revision is not enabled again. */
  rollback(skillId: string, revisionId: string): ImportedSkillRevisionProjection {
    return this.skills.transaction(() => {
      const base = this.#base(skillId);
      requireSkill(typeof revisionId === 'string' && UUID_PATTERN.test(revisionId), 'IMPORTED_SKILL_INVALID', 'Skill 修订标识无效。');
      const target = this.db.prepare('SELECT skill_id FROM imported_skill_revisions WHERE revision_id = ?').get(revisionId);
      requireSkill(target !== undefined && target.skill_id === skillId, 'IMPORTED_SKILL_NOT_FOUND', '这个 Skill 没有这一版。');
      requireSkill(base.revisionId !== revisionId, 'IMPORTED_SKILL_ALREADY_CURRENT', '这已经是当前修订。');
      const through = Number(this.db.prepare('SELECT coalesce(max(sequence), 0) AS n FROM imported_skill_states WHERE revision_id = ?').get(revisionId)?.n);
      this.skills.appendSelection(skillId, revisionId, 'rollback', null, through);
      return this.skills.revision(revisionId);
    });
  }
}
