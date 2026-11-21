import type { DatabaseSync } from 'node:sqlite';

/**
 * `model_service_connections`, the Model Service routes' connection rows (Issues #712, #811, #1044, #1225): every text the relation
 * has had, and the rebuilds between them. Each rebuild copies every row byte for byte, rowid included, so a protected credential
 * behind a Credential Reference keeps answering; nothing references this relation.
 */
export const MODEL_SERVICE_ROW_COLUMNS = 'connection_id, role_id, connection_name, provider_id, model_id, adapter_revision, configuration_revision, ' +
  'approved_fallback_chain, credential_slot, credential_reference, credential_operation_state, created_at, updated_at, credential_updated_at';

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

/** Channel and credential slot constraints stay exact; model IDs are editor/provider configuration (#1281). */
const MODEL_SERVICE_CHANNEL_BINDINGS = MODEL_SERVICE_ROW_BINDINGS_103.replace(/\s+AND model_id (?:IN \([^)]*\)|= '[^']*')/gu, '');

/** Revision 114: independent role defaults; existing rows retain their predecessor effective effort, otherwise no explicit effort. */
export const MODEL_SERVICE_CONNECTION_SCHEMA_SQL = `CREATE TABLE model_service_connections (
  connection_id TEXT PRIMARY KEY CHECK(connection_id IN ('main-editorial-deepseek-v4-pro', 'main-editorial-opencode-go', 'openai-platform', 'opencode-zen', 'anthropic-claude', 'google-gemini')),
  role_id TEXT NOT NULL CHECK(role_id = 'main-editorial'),
  connection_name TEXT NOT NULL CHECK(length(connection_name) BETWEEN 1 AND 80),
  provider_id TEXT NOT NULL CHECK(provider_id IN ('deepseek-open-platform', 'opencode-go', 'openai-platform', 'opencode-zen', 'anthropic-claude', 'google-gemini')),
  model_id TEXT NOT NULL CHECK(length(model_id) BETWEEN 1 AND 128),
  fast_model_id TEXT NOT NULL DEFAULT '' CHECK(length(fast_model_id) <= 128),
  cached_models TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cached_models)),
  reasoning_effort TEXT CHECK(reasoning_effort IS NULL OR length(reasoning_effort) BETWEEN 1 AND 40),
  fast_reasoning_effort TEXT CHECK(fast_reasoning_effort IS NULL OR length(fast_reasoning_effort) BETWEEN 1 AND 40),
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
  CHECK((connection_id = 'main-editorial-deepseek-v4-pro' AND provider_id = 'deepseek-open-platform' AND credential_slot = 'deepseek-api-key') OR
    (connection_id = 'main-editorial-opencode-go' AND provider_id = 'opencode-go' AND credential_slot = 'opencode-go') OR
    (connection_id = 'openai-platform' AND provider_id = 'openai-platform' AND credential_slot = 'openai-platform') OR
    (connection_id = 'opencode-zen' AND provider_id = 'opencode-zen' AND credential_slot = 'opencode-zen') OR
    (connection_id = 'anthropic-claude' AND provider_id = 'anthropic-claude' AND credential_slot = 'anthropic-claude') OR
    (connection_id = 'google-gemini' AND provider_id = 'google-gemini' AND credential_slot = 'google-gemini'))
) STRICT`;

/** Whether any row, under whichever text the relation holds, falls outside every exact revision-103 binding. */
export function modelServiceRowsOutsideBindings(db: DatabaseSync): boolean {
  return db.prepare(`SELECT 1 FROM model_service_connections WHERE NOT (${MODEL_SERVICE_CHANNEL_BINDINGS})
    OR role_id != 'main-editorial' OR adapter_revision != 1 OR configuration_revision != 1 OR approved_fallback_chain != '[]' LIMIT 1`).get() !== undefined;
}
