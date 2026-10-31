import { selectedPolicyIdentityOf } from '../../src/shared/protocol.js';
import type { DatabaseSync, SQLInputValue, SQLOutputValue } from 'node:sqlite';
import { ANALYSIS_LEDGER_TRIGGER_SQL } from '../../src/service/task-authorization.js';
import { canonicalRecord, sha256Hex } from '../../src/service/analysis/canonical.js';

/**
 * Construct the accepted reader-93 encoding of otherwise unchanged work, not a historical execution receipt.
 * The one-time comparison uses actual 7cc80f60 output with fixed UUIDs/times (Issue #1161 revision 5). CI needs
 * no Git, network or historical runtime. Prompt/result/source contracts, outcomes and possible-send fences stay.
 * A new-rule local capability or qualified Global attempt has no such predecessor encoding and refuses here.
 * Call before taking a byte-preservation snapshot and before planting an older schema's relation shapes/marker.
 */
export function constructPre94PolicyEncoding(database: DatabaseSync): void {
  type RecordValue = Record<string, unknown>;
  const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
  const fail = (): never => { throw new Error('PRE94_ENCODING_UNSUPPORTED'); };
  const digests = new Map<string, string>();
  const resolved = (value: string): string => {
    const visited = new Set<string>();
    while (digests.has(value)) {
      if (visited.has(value)) fail();
      visited.add(value); value = digests.get(value)!;
    }
    return value;
  };
  const changedDigest = (prior: string, next: string): void => { if (prior !== next) digests.set(prior, next); };
  const transform = (value: unknown): unknown => {
    if (typeof value === 'string') return resolved(value);
    if (Array.isArray(value)) return value.map(transform);
    if (!record(value)) return value;
    if (value.schema === 'ai7.dialogue-attempt/2') fail();
    if (Object.hasOwn(value, 'selectedPolicyIdentity')) {
      const identity = value.selectedPolicyIdentity;
      if (!record(identity) || selectedPolicyIdentityOf(identity) === null) fail();
    }
    if (Object.hasOwn(value, 'localFixtureProfile') && (!record(value.localFixtureProfile) || value.localFixtureProfile.kind !== 'legacy')) fail();
    const next = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'selectedPolicyIdentity' && key !== 'localFixtureProfile')
      .map(([key, entry]) => [key, transform(entry)]));
    if (value.schema === 'ai7.dialogue-execution-binding/2') {
      if (value.route !== 'ai7-local-deterministic' || value.operationalScope !== 'development-ci') fail();
      next.schema = 'ai7.dialogue-execution-binding/1';
    }
    // Only the scope/version fields of actual policy pins change; no /2 prompt, result or body is relabeled.
    if (next.operationalScope === 'development-ci' && next.version === 'v29') next.version = 'v1';
    if (next.operationalScope === 'ordinary-production' && ['v30', 'v31', 'v32'].includes(String(next.version))) next.version = 'v27';
    if (['v21', 'v22', 'v23'].includes(String(next.activePolicySetVersion)) && Object.hasOwn(next, 'providerProcessingVersion')) {
      if (next.operationalScope === 'development-ci' && ['v1', 'v29'].includes(String(next.providerProcessingVersion))) next.providerProcessingVersion = 'v1';
      else if (next.operationalScope === 'ordinary-production' && ['v30', 'v31', 'v32'].includes(String(next.providerProcessingVersion))) next.providerProcessingVersion = 'v27';
      else if (next.operationalScope !== 'developer-live' || next.providerProcessingVersion !== 'v24') fail();
      next.activePolicySetVersion = 'v19';
    }
    if (record(next.boundary) && Array.isArray(next.boundary.material)) {
      const material = next.boundary.material.filter((entry) => !record(entry) ||
        entry.field !== 'selectedPolicyIdentity' && entry.field !== 'localFixtureProfile');
      if (material.length !== 15) fail();
      next.boundary.material = material;
    }
    // J-03's closed local denial text is part of its canonical Plan, independently of covered-analysis text.
    if (typeof next.stopCondition === 'string' && next.stopCondition === 'Provider Processing v29 denies dispatch') next.stopCondition = 'Provider Processing v1 denies dispatch';
    if (next.summary === '计划已冻结；Provider Processing v29 拒绝派发') next.summary = '计划已冻结；Provider Processing v1 拒绝派发';
    // F16's nested digest chain stays present, including unknown/claimed/no-resend evidence. Updating a binding join
    // entails rehashing these same records; it never erases an admission or invents a completed request.
    if (record(value.data) && typeof value.digest === 'string' && typeof value.schema === 'string' &&
        value.schema.startsWith('ai7.analysis.') && Object.keys(value).sort().join(',') === 'data,digest,schema') {
      const prior = canonicalRecord(value.data).digest;
      if (value.digest !== prior) fail();
      next.digest = canonicalRecord(next.data).digest;
      changedDigest(prior, String(next.digest));
    }
    return next;
  };
  const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;
  const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND sql LIKE '%canonical_json%' ORDER BY name")
    .all() as Array<{ name: string }>).filter(({ name }) => (database.prepare(`PRAGMA table_info(${quote(name)})`).all() as Array<{ name: string }>).some((column) => column.name === 'sha256'));
  const rows = tables.flatMap(({ name }) => (database.prepare(`SELECT rowid AS encoding_rowid, * FROM ${quote(name)} ORDER BY rowid`).all())
    .map((row) => {
      const json = row.canonical_json, digest = row.sha256;
      if (typeof json !== 'string' || typeof digest !== 'string') throw new Error('PRE94_ENCODING_UNSUPPORTED');
      const value: unknown = JSON.parse(json);
      if (sha256Hex(json) !== digest) fail();
      return { table: name, row: row as Record<string, SQLOutputValue>, original: value, value, json, digest };
    }));
  // Canonical joins form a finite dependency graph. Revisit parents after changing their child digests; refusal on a
  // cycle prevents a partial recipe from silently manufacturing inconsistent foreign joins.
  let stable = false;
  for (let pass = 0; pass <= rows.length && !stable; pass += 1) {
    stable = true;
    for (const row of rows) {
      const value = transform(row.original), transformed = canonicalRecord(value);
      // Other owners can have a different canonical key order. A semantically unchanged record keeps its exact bytes.
      const encoded = transformed.json === canonicalRecord(row.original).json
        ? { json: String(row.row.canonical_json), digest: String(row.row.sha256) } : transformed;
      if (encoded.digest !== row.digest) {
        changedDigest(row.digest, encoded.digest); changedDigest(String(row.row.sha256), encoded.digest);
        row.value = value; row.json = encoded.json; row.digest = encoded.digest; stable = false;
      }
    }
  }
  if (!stable) fail();
  const triggers = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name").all();
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec('PRAGMA defer_foreign_keys = ON');
    for (const trigger of triggers) database.exec(`DROP TRIGGER ${quote(String(trigger.name))}`);
    for (const entry of rows) {
      const changes: Record<string, SQLInputValue> = {};
      for (const [key, value] of Object.entries(entry.row)) if (key !== 'encoding_rowid' && key !== 'canonical_json' && key !== 'sha256' && typeof value === 'string') {
        const next = resolved(value); if (next !== value) changes[key] = next;
      }
      if (entry.json !== entry.row.canonical_json) { changes.canonical_json = entry.json; changes.sha256 = entry.digest; }
      const columns = Object.keys(changes);
      if (columns.length > 0) database.prepare(`UPDATE ${quote(entry.table)} SET ${columns.map((key) => `${quote(key)} = ?`).join(', ')} WHERE rowid = ?`)
        .run(...columns.map((key) => changes[key]!), entry.row.encoding_rowid!);
    }
    for (const trigger of triggers) database.exec(String(trigger.sql));
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}

/**
 * The three kind-coupled analysis relations schema revisions 24 and 59 rebuilt (Issues #417, #429), in
 * the order a downgrade rebuilds them: the relation that references the other two first.
 */
export const KIND_COUPLED_ANALYSIS_RELATIONS = ['analysis_result_set_revisions', 'analysis_result_sets', 'analysis_task_intents'] as const;

/** The exact text of each kind-coupled relation at one schema revision, as `ANALYSIS_LEDGER_REVISION_23_SQL` or `_58_SQL` holds it. */
export type KindCoupledRelationsSql = Readonly<Record<(typeof KIND_COUPLED_ANALYSIS_RELATIONS)[number], string>>;

/**
 * Take the three kind-coupled relations back to the exact shapes an older revision carried, with every
 * row copied in its original order: `ANALYSIS_LEDGER_REVISION_23_SQL` for a store planted at revision 20
 * to 23, `ANALYSIS_LEDGER_REVISION_58_SQL` for one planted at revision 24 to 58. A suite that plants such
 * a store needs this beside dropping whatever later revisions added: those stores really held these
 * shapes, and the forward migration validates them exactly before it rebuilds them.
 *
 * It opens its own transaction with foreign keys off, so it is called outside any other transaction.
 * The rows it copies must be ones the older revision admits — no Task of a kind it did not know — which
 * is every row a store that old could hold.
 */
export function downgradeKindCoupledRelations(database: DatabaseSync, revisionSql: KindCoupledRelationsSql): void {
  database.exec('PRAGMA foreign_keys = OFF');
  database.exec('BEGIN IMMEDIATE');
  for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
    const columns = (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name).join(', ');
    database.exec(`CREATE TEMP TABLE downgrade_${table} AS SELECT rowid AS r, * FROM ${table}`);
    database.exec(`DROP TABLE ${table}`);
    database.exec(revisionSql[table]);
    database.exec(`INSERT INTO ${table}(${columns}) SELECT ${columns} FROM temp.downgrade_${table} ORDER BY r`);
    database.exec(`DROP TABLE temp.downgrade_${table}`);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_update`]!);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_delete`]!);
  }
  database.exec('COMMIT');
  database.exec('PRAGMA foreign_keys = ON');
}
