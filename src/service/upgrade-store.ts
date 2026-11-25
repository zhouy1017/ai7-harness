import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { baselineSchemaObjects, createBaselineSchema, requireBaselineSchema } from './baseline-schema.js';
import { snapshotWorkingRevision } from './bounded-manuscript.js';
import { canonicalSchemaSql } from './manuscript/bounded-kernel.js';
import { openPackageStore } from './database-exports.js';
import { assignKeysAndPages, validateBranchPositions } from './manuscript/working-positions.js';
import { mapRevision116ModelRoleChoices, writeModelRoleChoice, type Revision116ModelRoleRow } from './model-service-connections.js';
import { installPreinstalledStandardTables } from './standard-tables.js';
import { validateProcedureDefinitions } from './procedures/definition-store.js';
import { inventoryStore, NOT_COUNTED } from './store-inventory.js';
import { requireStore } from './store-records.js';

// The complete sqlite_schema dump from the supported revision, including implicit indexes.
const SOURCE_SHAPE = '5090023e9251e80bc2d89ab3592561c73efae079e8d76365e7132210032bf0e7';

export function requireUpgradeSource(db: DatabaseSync): void {
  const rows = db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name').all()
    .map(row => ({ ...row, sql: row.sql === null ? null : canonicalSchemaSql(String(row.sql)) }));
  requireStore(db.prepare('PRAGMA user_version').get()?.user_version === 116 &&
    createHash('sha256').update(JSON.stringify(rows)).digest('hex') === SOURCE_SHAPE,
    'UPGRADE_SOURCE_INVALID', '无法识别这份旧数据库的结构。请先用 0.7.3 打开并重新导出。');
  validateProcedureDefinitions(db);
}

const lateGuards = new Set([
  'imported_skill_update_candidates_transition', 'imported_skill_current_selections_transition',
  'source_import_record_excludes_manuscript_result', 'source_import_record_excludes_reimport_result',
  'manuscript_import_record_excludes_source_result', 'manuscript_import_record_excludes_reimport_result',
  'reimport_record_excludes_other_results',
]);

function check(ok: boolean, item: string): void {
  requireStore(ok, 'UPGRADE_MISMATCH', `升级核对失败（${item}），原数据库仍然保留。`);
}

function verifyGuards(db: DatabaseSync): void {
  const invalid = (sql: string, item: string): void => check(!db.prepare(sql + ' LIMIT 1').get(), item);
  invalid(`SELECT commit_id FROM (SELECT commit_id FROM source_import_records UNION ALL
    SELECT commit_id FROM manuscript_import_records UNION ALL SELECT commit_id FROM manuscript_reimport_records)
    GROUP BY commit_id HAVING count(*) > 1`, '导入结果');
  for (const [table, identity] of [['imported_skill_update_candidates', 'candidate_id'], ['imported_skill_current_selections', 'skill_id']]) {
    invalid(`SELECT 1 FROM (SELECT sequence, row_number() OVER (PARTITION BY ${identity} ORDER BY sequence) n FROM ${table}) WHERE n != sequence`, '技能更新顺序');
  }
  invalid(`SELECT 1 FROM imported_skill_update_candidates c
    JOIN imported_skill_update_candidates first ON first.candidate_id=c.candidate_id AND first.sequence=1
    LEFT JOIN imported_skill_snapshots f ON f.snapshot_id=c.from_snapshot_id
    LEFT JOIN imported_skill_snapshots t ON t.snapshot_id=c.to_snapshot_id
    LEFT JOIN imported_skill_revisions b ON b.revision_id=c.base_revision_id
    LEFT JOIN imported_skill_revisions a ON a.revision_id=c.adopted_revision_id
    LEFT JOIN imported_skill_update_rules r ON r.rule_id=c.rule_id
    WHERE c.sequence > 2 OR first.skill_id != c.skill_id OR
    (c.event='created' AND (f.skill_id IS NOT c.skill_id OR t.skill_id IS NOT c.skill_id OR b.skill_id IS NOT c.skill_id OR
      b.snapshot_id IS NOT c.from_snapshot_id OR c.from_snapshot_id=c.to_snapshot_id)) OR
    (c.event='adopted' AND (a.skill_id IS NOT c.skill_id OR a.snapshot_id IS NOT first.to_snapshot_id OR
      (c.adopted_by='rule' AND (r.skill_id IS NOT c.skill_id OR first.disposition IS NOT 'clean'))))`, '技能更新记录');
  invalid(`SELECT 1 FROM imported_skill_current_selections s LEFT JOIN imported_skill_revisions r ON r.revision_id=s.revision_id
    LEFT JOIN imported_skill_update_candidates c ON c.candidate_id=s.candidate_id AND c.sequence=1
    WHERE r.skill_id IS NOT s.skill_id OR (s.candidate_id IS NOT NULL AND c.skill_id IS NOT s.skill_id)`, '技能版本选择');
}

function copyTable(source: DatabaseSync, target: DatabaseSync, name: string): void {
  const columns = target.prepare(`PRAGMA table_info("${name}")`).all().map(row => String(row.name));
  const fields = columns.map(c => {
    if (name === 'manuscript_revisions' && c === 'upgrade_snapshot') return '0 AS upgrade_snapshot';
    if (name === 'working_blocks' && c === 'order_key') return 'position AS order_key';
    if (name === 'branch_working_state' && c === 'history_boundary_sequence') return 'history_sequence AS history_boundary_sequence';
    if (name === 'model_service_connections' && c === 'fast_model_id') return "CASE WHEN fast_selected=1 AND fast_model_id='' THEN model_id ELSE fast_model_id END AS fast_model_id";
    return `"${c}"`;
  });
  const insert = target.prepare(`INSERT INTO "${name}" (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  const read = source.prepare(`SELECT ${fields.join(',')} FROM "${name}" ORDER BY rowid`);
  read.setReadBigInts(true);
  for (const row of read.iterate()) insert.run(...columns.map(column => row[column]!));
}

function textDigest(db: DatabaseSync, order: string): string {
  const digest = createHash('sha256');
  for (const row of db.prepare(`SELECT branch_id, block_id, kind, level, text FROM working_blocks ORDER BY branch_id, ${order}`).iterate()) {
    digest.update(JSON.stringify(row)).update('\n');
  }
  return digest.digest('hex');
}

function rowDigest(db: DatabaseSync, table: string): string {
  const digest = createHash('sha256');
  for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate()) digest.update(JSON.stringify(row)).update('\n');
  return digest.digest('hex');
}

function upgradeVersions(db: DatabaseSync): void {
  const branches = db.prepare(`SELECT w.*, r.source_version_id FROM branch_working_state w
    JOIN manuscript_revisions r ON r.revision_id=w.base_revision_id ORDER BY w.manuscript_id,w.branch_id`).all();
  for (const branch of branches) {
    const id = String(branch.branch_id);
    const total = assignKeysAndPages(db, id);
    check(total === branch.total_graphemes, '稿件字数');
    const revision = randomUUID();
    db.prepare(`INSERT INTO manuscript_revisions (revision_id, manuscript_id, branch_id, ordinal, revision_label,
      parent_revision_id, source_version_id, revision_digest, created_at, upgrade_snapshot)
      SELECT ?, ?, ?, max(ordinal)+1, 'r' || (max(ordinal)+1), ?, ?, ?, ?, 1 FROM manuscript_revisions WHERE manuscript_id=?`)
      .run(revision, branch.manuscript_id!, id, branch.base_revision_id!, branch.source_version_id!,
        branch.working_digest!, new Date().toISOString(), branch.manuscript_id!);
    snapshotWorkingRevision(db, id, revision, total);
    db.prepare('UPDATE branch_working_state SET base_revision_id=?, last_checkpoint_sequence=journal_sequence WHERE branch_id=?').run(revision, id);
    db.prepare('UPDATE manuscript_branches SET base_revision_id=? WHERE branch_id=?').run(revision, id);
  }
}

export function convertUpgradeStore(oldPath: string, newPath: string): void {
  const source = openPackageStore(oldPath);
  try {
    source.exec('BEGIN');
    requireUpgradeSource(source);
    const target = new DatabaseSync(newPath);
    try {
      target.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON');
      createBaselineSchema(target);
      const guards = baselineSchemaObjects().filter(obj => lateGuards.has(obj.name));
      for (const guard of guards) target.exec(`DROP TRIGGER ${guard.name}`);
      const tables = source.prepare(`SELECT name FROM sqlite_schema WHERE type='table'
        ORDER BY name='import_abandonment_cleanup_intents', name`).all();
      for (const row of tables) {
        const name = String(row.name);
        if (Object.hasOwn(NOT_COUNTED, name) || ['working_offset_nodes', 'material_index_vectors', 'manuscript_outline'].includes(name)) continue;
        copyTable(source, target, name);
      }
      const roles = source.prepare('SELECT * FROM model_service_connections').all() as unknown as Revision116ModelRoleRow[];
      for (const choice of mapRevision116ModelRoleChoices(roles)) writeModelRoleChoice(target, choice.roleId, choice);
      verifyGuards(target);
      check(rowDigest(source, 'imported_skill_update_candidates') === rowDigest(target, 'imported_skill_update_candidates'), '技能采用记录');
      for (const guard of guards) target.exec(guard.sql);
      installPreinstalledStandardTables(target);
      upgradeVersions(target);
      check(!target.prepare('PRAGMA foreign_key_check').get(), '数据库引用');
      target.exec('COMMIT');
    } finally { target.close(); }
  } finally { source.close(); }
}

export function verifyUpgradeStore(oldPath: string, newPath: string, recordedUpgrade = false): string {
  const before = JSON.parse(inventoryStore(oldPath));
  const after = JSON.parse(inventoryStore(newPath));
  const source = openPackageStore(oldPath);
  try {
    const target = openPackageStore(newPath);
    try {
      requireUpgradeSource(source);
      requireBaselineSchema(target);
      check(target.prepare('PRAGMA integrity_check').get()?.integrity_check === 'ok', '数据库完整性');
      check(!target.prepare('PRAGMA foreign_key_check').get(), '数据库引用');
      check(textDigest(source, 'position') === textDigest(target, 'order_key'), '稿件段落顺序与正文');
      for (const { branch_id } of target.prepare('SELECT branch_id FROM branch_working_state').all()) validateBranchPositions(target, String(branch_id));
      const roleChoices = mapRevision116ModelRoleChoices(source.prepare('SELECT * FROM model_service_connections').all() as unknown as Revision116ModelRoleRow[]);
      for (const role of roleChoices) {
        const stored = target.prepare('SELECT connection_id,model_id,reasoning_effort FROM model_role_choices WHERE role_id=?').get(role.roleId);
        check(stored?.connection_id === role.connectionId && stored.model_id === role.modelId && stored.reasoning_effort === (role.reasoningEffort ?? null), '模型角色');
      }
      const expected = {
        ...before.tables, standard_tables: 4, standard_table_versions: 4, standard_table_entries: 68507,
        store_versions: before.tables.store_versions + Number(recordedUpgrade),
        manuscript_revisions: before.tables.manuscript_revisions + before.tables.manuscripts,
        manuscript_block_versions: before.tables.manuscript_block_versions + before.tables.working_blocks,
        model_role_choices: roleChoices.length,
        working_pages: source.prepare(`SELECT coalesce(sum(max(1, (n + 192) / 256)),0) n
          FROM (SELECT count(*) n FROM working_blocks GROUP BY branch_id)`).get()!.n
      };
      for (const [name, count] of Object.entries(expected)) check(after.tables[name] === count, name);
      const entities = { ...before.entities, library: { tables: 4, versions: 4, entries: 68507, sourceFiles: 0 } };
      for (const name of Object.keys(entities)) check(JSON.stringify(entities[name]) === JSON.stringify(after.entities[name]), name);
      const counts = before.tables;
      return `升级前后均为 ${counts.books} 本书、${counts.manuscripts} 份稿件、${counts.editorial_marks} 条批注和 ${counts.review_reports} 份审阅报告。`;
    } finally { target.close(); }
  } finally { source.close(); }
}
