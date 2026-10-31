import type { DatabaseSync } from 'node:sqlite';
import { asNumber, asString, requireStore, type SqlRow } from './store-records.js';

/**
 * `model_service_connections`, the Model Service routes' connection rows (Issues #712, #811, #1044, #1225): every text the relation
 * has had, and the rebuilds between them. Each rebuild copies every row byte for byte, rowid included, so a protected credential
 * behind a Credential Reference keeps answering; nothing references this relation.
 */
export const MODEL_SERVICE_ROW_COLUMNS = 'connection_id, role_id, connection_name, provider_id, model_id, adapter_revision, configuration_revision, ' +
  'approved_fallback_chain, credential_slot, credential_reference, credential_operation_state, created_at, updated_at, credential_updated_at';

/** `model_service_connections` as revision 11 created it: the one DeepSeek 官方 `deepseek-v4-pro` row. Kept to recognise and migrate such a store. */
export const MODEL_SERVICE_CONNECTION_REVISION_11_SQL = `CREATE TABLE model_service_connections (
  connection_id TEXT PRIMARY KEY CHECK(connection_id = 'main-editorial-deepseek-v4-pro'),
  role_id TEXT NOT NULL CHECK(role_id = 'main-editorial'),
  connection_name TEXT NOT NULL CHECK(length(connection_name) BETWEEN 1 AND 80),
  provider_id TEXT NOT NULL CHECK(provider_id = 'deepseek-open-platform'),
  model_id TEXT NOT NULL CHECK(model_id = 'deepseek-v4-pro'),
  adapter_revision INTEGER NOT NULL CHECK(adapter_revision = 1),
  configuration_revision INTEGER NOT NULL CHECK(configuration_revision = 1),
  approved_fallback_chain TEXT NOT NULL CHECK(approved_fallback_chain = '[]'),
  credential_slot TEXT NOT NULL CHECK(credential_slot = 'deepseek-api-key'),
  credential_reference TEXT NOT NULL UNIQUE CHECK(length(credential_reference) = 36),
  credential_operation_state TEXT NOT NULL CHECK(credential_operation_state IN ('ready', 'missing', 'needs-attention')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  credential_updated_at TEXT NOT NULL
) STRICT`;

/**
 * Revision 72 (Issue #811): the two ordinary-production route connections of the Main Editorial Role — the DeepSeek 开放平台（官方）
 * row, which keeps its revision-11 identity and moves to the current model id, and an OpenCode Go row — each with its own
 * Credential Reference, and `selected` naming the one the editor chose: `1` on at most one row (a unique column whose other
 * rows hold `NULL`, so the at-most-one rule needs no separate index).
 */
export const MODEL_SERVICE_CONNECTION_REVISION_72_SQL = `CREATE TABLE model_service_connections (
  connection_id TEXT PRIMARY KEY CHECK(connection_id IN ('main-editorial-deepseek-v4-pro', 'main-editorial-opencode-go')),
  role_id TEXT NOT NULL CHECK(role_id = 'main-editorial'),
  connection_name TEXT NOT NULL CHECK(length(connection_name) BETWEEN 1 AND 80),
  provider_id TEXT NOT NULL CHECK(provider_id IN ('deepseek-open-platform', 'opencode-go')),
  model_id TEXT NOT NULL CHECK(model_id IN ('deepseek-v4-pro', 'deepseek-flash', 'deepseek-v4.1-flash')),
  adapter_revision INTEGER NOT NULL CHECK(adapter_revision = 1),
  configuration_revision INTEGER NOT NULL CHECK(configuration_revision = 1),
  approved_fallback_chain TEXT NOT NULL CHECK(approved_fallback_chain = '[]'),
  credential_slot TEXT NOT NULL CHECK(credential_slot IN ('deepseek-api-key', 'opencode-go')),
  credential_reference TEXT NOT NULL UNIQUE CHECK(length(credential_reference) = 36),
  credential_operation_state TEXT NOT NULL CHECK(credential_operation_state IN ('ready', 'missing', 'needs-attention')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  credential_updated_at TEXT NOT NULL,
  -- At most one selected row; unselected rows coexist as NULL (#811 brief revision 8).
  selected INTEGER UNIQUE CHECK(selected = 1),
  CHECK((connection_id = 'main-editorial-deepseek-v4-pro' AND provider_id = 'deepseek-open-platform' AND credential_slot = 'deepseek-api-key'
      AND model_id IN ('deepseek-v4-pro', 'deepseek-flash')) OR
    (connection_id = 'main-editorial-opencode-go' AND provider_id = 'opencode-go' AND credential_slot = 'opencode-go' AND model_id = 'deepseek-v4.1-flash'))
) STRICT`;

/** Revision 84: reviewed OpenAI text models, independent Fast selection and sanitized test status. Kept to recognise and migrate such a store. */
export const MODEL_SERVICE_CONNECTION_REVISION_84_SQL = `CREATE TABLE model_service_connections (
  connection_id TEXT PRIMARY KEY CHECK(connection_id IN ('main-editorial-deepseek-v4-pro', 'main-editorial-opencode-go', 'openai-platform')),
  role_id TEXT NOT NULL CHECK(role_id = 'main-editorial'),
  connection_name TEXT NOT NULL CHECK(length(connection_name) BETWEEN 1 AND 80),
  provider_id TEXT NOT NULL CHECK(provider_id IN ('deepseek-open-platform', 'opencode-go', 'openai-platform')),
  model_id TEXT NOT NULL CHECK(model_id IN ('deepseek-v4-pro', 'deepseek-flash', 'deepseek-v4.1-flash', 'gpt-5.6-luna', 'gpt-5.6-sol')),
  adapter_revision INTEGER NOT NULL CHECK(adapter_revision = 1),
  configuration_revision INTEGER NOT NULL CHECK(configuration_revision = 1),
  approved_fallback_chain TEXT NOT NULL CHECK(approved_fallback_chain = '[]'),
  credential_slot TEXT NOT NULL CHECK(credential_slot IN ('deepseek-api-key', 'opencode-go', 'openai-platform')),
  credential_reference TEXT NOT NULL UNIQUE CHECK(length(credential_reference) = 36),
  credential_operation_state TEXT NOT NULL CHECK(credential_operation_state IN ('ready', 'missing', 'needs-attention')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  credential_updated_at TEXT NOT NULL,
  -- At most one selected row; unselected rows coexist as NULL (#811 brief revision 8).
  selected INTEGER UNIQUE CHECK(selected = 1),
  fast_selected INTEGER UNIQUE CHECK(fast_selected = 1),
  connection_test TEXT CHECK(connection_test IS NULL OR json_valid(connection_test)),
  CHECK(provider_id != 'openai-platform' OR selected IS NULL),
  CHECK((connection_id = 'main-editorial-deepseek-v4-pro' AND provider_id = 'deepseek-open-platform' AND credential_slot = 'deepseek-api-key'
      AND model_id IN ('deepseek-v4-pro', 'deepseek-flash')) OR
    (connection_id = 'main-editorial-opencode-go' AND provider_id = 'opencode-go' AND credential_slot = 'opencode-go' AND model_id = 'deepseek-v4.1-flash') OR
    (connection_id = 'openai-platform' AND provider_id = 'openai-platform' AND credential_slot = 'openai-platform'
      AND model_id IN ('gpt-5.6-luna', 'gpt-5.6-sol')))
) STRICT`;

/**
 * Every exact binding a connection row may hold at revision 103 (Issue #1225): one route row each, its slot, and the models the
 * selected policy (Provider Processing v32) binds on that route's channel — the official row keeping its legacy model id.
 */
const MODEL_SERVICE_ROW_BINDINGS_103 = `(connection_id = 'main-editorial-deepseek-v4-pro' AND provider_id = 'deepseek-open-platform' AND credential_slot = 'deepseek-api-key'
      AND model_id IN ('deepseek-v4-pro', 'deepseek-flash')) OR
    (connection_id = 'main-editorial-opencode-go' AND provider_id = 'opencode-go' AND credential_slot = 'opencode-go' AND model_id = 'deepseek-v4.1-flash') OR
    (connection_id = 'openai-platform' AND provider_id = 'openai-platform' AND credential_slot = 'openai-platform'
      AND model_id IN ('gpt-5.6-luna', 'gpt-5.6-sol')) OR
    (connection_id = 'opencode-zen' AND provider_id = 'opencode-zen' AND credential_slot = 'opencode-zen'
      AND model_id IN ('deepseek-v4.1-flash', 'glm-5.3-flash', 'kimi-k3', 'qwen3.8-max', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5',
        'claude-haiku-5-5', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-luna')) OR
    (connection_id = 'anthropic-claude' AND provider_id = 'anthropic-claude' AND credential_slot = 'anthropic-claude'
      AND model_id IN ('claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5')) OR
    (connection_id = 'google-gemini' AND provider_id = 'google-gemini' AND credential_slot = 'google-gemini'
      AND model_id IN ('gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-pro'))`;

/**
 * Revision 103 (Issue #1225): the OpenCode Zen, Claude 官方 and Gemini 官方 route rows with their v32 models, and an OpenAI row may
 * now be the Main role's choice — revision 84's `provider_id != 'openai-platform' OR selected IS NULL` is gone. CHECKs only.
 */
export const MODEL_SERVICE_CONNECTION_SCHEMA_SQL = `CREATE TABLE model_service_connections (
  connection_id TEXT PRIMARY KEY CHECK(connection_id IN ('main-editorial-deepseek-v4-pro', 'main-editorial-opencode-go', 'openai-platform', 'opencode-zen', 'anthropic-claude', 'google-gemini')),
  role_id TEXT NOT NULL CHECK(role_id = 'main-editorial'),
  connection_name TEXT NOT NULL CHECK(length(connection_name) BETWEEN 1 AND 80),
  provider_id TEXT NOT NULL CHECK(provider_id IN ('deepseek-open-platform', 'opencode-go', 'openai-platform', 'opencode-zen', 'anthropic-claude', 'google-gemini')),
  model_id TEXT NOT NULL CHECK(length(model_id) BETWEEN 1 AND 128),
  adapter_revision INTEGER NOT NULL CHECK(adapter_revision = 1),
  configuration_revision INTEGER NOT NULL CHECK(configuration_revision = 1),
  approved_fallback_chain TEXT NOT NULL CHECK(approved_fallback_chain = '[]'),
  credential_slot TEXT NOT NULL CHECK(credential_slot IN ('deepseek-api-key', 'opencode-go', 'openai-platform', 'opencode-zen', 'anthropic-claude', 'google-gemini')),
  credential_reference TEXT NOT NULL UNIQUE CHECK(length(credential_reference) = 36),
  credential_operation_state TEXT NOT NULL CHECK(credential_operation_state IN ('ready', 'missing', 'needs-attention')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  credential_updated_at TEXT NOT NULL,
  -- At most one selected row; unselected rows coexist as NULL (#811 brief revision 8).
  selected INTEGER UNIQUE CHECK(selected = 1),
  fast_selected INTEGER UNIQUE CHECK(fast_selected = 1),
  connection_test TEXT CHECK(connection_test IS NULL OR json_valid(connection_test)),
  CHECK(${MODEL_SERVICE_ROW_BINDINGS_103})
) STRICT`;

/** Whether any row, under whichever text the relation holds, falls outside every exact revision-103 binding. */
export function modelServiceRowsOutsideBindings(db: DatabaseSync): boolean {
  return db.prepare(`SELECT 1 FROM model_service_connections WHERE NOT (${MODEL_SERVICE_ROW_BINDINGS_103})
    OR role_id != 'main-editorial' OR adapter_revision != 1 OR configuration_revision != 1 OR approved_fallback_chain != '[]' LIMIT 1`).get() !== undefined;
}

/** Revision 84 → 103 (Issue #1225): the relation rebuilt from its widened text, every row and column copied in rowid order. */
export function initializeAdmittedChannelsSchema(db: DatabaseSync): void {
  const fold = (sql: string): string => sql.trim().replace(/\s+/gu, ' ');
  const sql = fold(asString((db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'model_service_connections'").get() as SqlRow).sql));
  if (sql === fold(MODEL_SERVICE_CONNECTION_SCHEMA_SQL)) return;
  requireStore(sql === fold(MODEL_SERVICE_CONNECTION_REVISION_84_SQL), 'SCHEMA_INVALID', '模型服务连接结构不兼容。');
  const total = (): number => asNumber((db.prepare('SELECT count(*) total FROM model_service_connections').get() as SqlRow).total);
  db.exec('BEGIN IMMEDIATE');
  try {
    const before = total();
    db.exec('CREATE TEMP TABLE admitted_channels_migration AS SELECT rowid AS original_rowid, * FROM model_service_connections');
    db.exec('DROP TABLE model_service_connections');
    db.exec(MODEL_SERVICE_CONNECTION_SCHEMA_SQL);
    db.exec(`INSERT INTO model_service_connections(rowid, ${MODEL_SERVICE_ROW_COLUMNS}, selected, fast_selected, connection_test)
      SELECT original_rowid, ${MODEL_SERVICE_ROW_COLUMNS}, selected, fast_selected, connection_test FROM temp.admitted_channels_migration ORDER BY original_rowid`);
    db.exec('DROP TABLE temp.admitted_channels_migration');
    requireStore(total() === before, 'SCHEMA_MIGRATION_FAILED', '模型服务连接表迁移未保留全部记录。');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

/**
 * Revision 11 → 72 for `model_service_connections` (Issue #811): the relation is rebuilt from its current text and its one
 * official row copied byte for byte, rowid included — except that it now names the official route's current model id,
 * `deepseek-flash`, and is the route in use, as the only one configured. Its Credential Reference and state are kept, so the
 * protected credential behind it still answers. Nothing references this relation, so foreign keys stay as they are.
 */
export function initializeModelServiceRoutesSchema(db: DatabaseSync): void {
  const folded = (value: string): string => value.trim().replace(/\s+/gu, ' ');
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'model_service_connections'").get() as SqlRow | undefined;
  requireStore(row !== undefined, 'SCHEMA_MIGRATION_FAILED', '模型服务连接表缺失。');
  const sql = folded(asString(row.sql));
  if ([MODEL_SERVICE_CONNECTION_SCHEMA_SQL, MODEL_SERVICE_CONNECTION_REVISION_84_SQL, MODEL_SERVICE_CONNECTION_REVISION_72_SQL].some((text) => sql === folded(text))) return;
  requireStore(sql === folded(MODEL_SERVICE_CONNECTION_REVISION_11_SQL), 'SCHEMA_MIGRATION_FAILED', '模型服务连接表结构不兼容。');
  const total = (): number => asNumber((db.prepare('SELECT count(*) total FROM model_service_connections').get() as SqlRow).total);
  db.exec('BEGIN IMMEDIATE');
  try {
    const before = total();
    db.exec('CREATE TEMP TABLE migrate_model_service_connections AS SELECT rowid AS migrate_rowid, * FROM model_service_connections');
    db.exec('DROP TABLE model_service_connections');
    db.exec(MODEL_SERVICE_CONNECTION_REVISION_72_SQL);
    db.exec(`INSERT INTO model_service_connections(rowid, ${MODEL_SERVICE_ROW_COLUMNS}, selected)
      SELECT migrate_rowid, connection_id, role_id, connection_name, provider_id, 'deepseek-flash', adapter_revision, configuration_revision,
             approved_fallback_chain, credential_slot, credential_reference, credential_operation_state, created_at, updated_at,
             credential_updated_at, 1
      FROM temp.migrate_model_service_connections ORDER BY migrate_rowid`);
    db.exec('DROP TABLE temp.migrate_model_service_connections');
    requireStore(total() === before, 'SCHEMA_MIGRATION_FAILED', '模型服务连接表迁移未保留全部记录。');
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'SQLite model-service route migration rollback failed.');
    }
    throw error;
  }
}

/** Revision 84: preserve every legacy identity/reference and Main choice, and freeze its old Fast choice independently. */
export function initializeModelSelectionSchema(db: DatabaseSync): void {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'model_service_connections'").get() as SqlRow;
  const fold = (sql: string): string => sql.trim().replace(/\s+/gu, ' ');
  if (fold(asString(row.sql)) === fold(MODEL_SERVICE_CONNECTION_SCHEMA_SQL) || fold(asString(row.sql)) === fold(MODEL_SERVICE_CONNECTION_REVISION_84_SQL)) return;
  requireStore(fold(asString(row.sql)) === fold(MODEL_SERVICE_CONNECTION_REVISION_72_SQL), 'SCHEMA_INVALID', '模型服务连接结构不兼容。');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('CREATE TEMP TABLE model_selection_migration AS SELECT rowid AS original_rowid, * FROM model_service_connections');
    db.exec('DROP TABLE model_service_connections');
    db.exec(MODEL_SERVICE_CONNECTION_REVISION_84_SQL);
    db.exec(`INSERT INTO model_service_connections(rowid, ${MODEL_SERVICE_ROW_COLUMNS}, selected, fast_selected, connection_test)
      SELECT original_rowid, ${MODEL_SERVICE_ROW_COLUMNS}, selected, selected, NULL FROM temp.model_selection_migration ORDER BY original_rowid`);
    db.exec('DROP TABLE temp.model_selection_migration');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
