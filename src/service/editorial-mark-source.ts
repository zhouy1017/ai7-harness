import type { DatabaseSync } from 'node:sqlite';
import type { EditorialMarkBasisProjection, EditorialMarkSourceProjection } from '../shared/protocol.js';
import { MODEL_SERVICE_ROUTE_BINDINGS, modelServiceChannelOf } from '../shared/protocol/model-service.js';
import { CONFIGURED_RUNTIME_MODEL_LABELS } from '../shared/provider-configuration.generated.js';

export interface MarkModelBinding { route: string; model: string }
type ModelLabels = Pick<EditorialMarkSourceProjection, 'modelLabel' | 'modelTechnicalLabel'>;

/** Existing basis JSON remains readable; new marks freeze author labels alongside their evidence (#1379). */
export function readMarkEvidence(json: string): { basis: ReadonlyArray<EditorialMarkBasisProjection>; source?: ModelLabels } {
  const value = JSON.parse(json);
  return Array.isArray(value) ? { basis: value } : value;
}

export function markModelLabels(binding: MarkModelBinding | null): ModelLabels {
  if (binding === null) return {};
  if (binding.route === 'ai7-local-deterministic') return { modelLabel: 'AI7 本地检查', modelTechnicalLabel: `AI7 本地检查 · ${binding.model}` };
  const channel = modelServiceChannelOf(binding.route);
  if (channel === null) return { modelLabel: 'AI7', modelTechnicalLabel: `${binding.route} · ${binding.model}` };
  const provider = MODEL_SERVICE_ROUTE_BINDINGS[channel].providerLabel;
  const display = (CONFIGURED_RUNTIME_MODEL_LABELS as Readonly<Record<string, string>>)[`${binding.route}/${binding.model}`];
  return {
    modelLabel: display && display !== binding.model ? `${provider} · ${display}` : provider,
    modelTechnicalLabel: `${provider} · ${binding.model}`,
  };
}

/** Read only the producing record, never today's model selection. Workspace rounds use dialogue attempts. */
export function recordedMarkModel(db: DatabaseSync, taskId: string, at: string, attemptId?: string): MarkModelBinding | null {
  const dialogue = attemptId === undefined
    ? db.prepare(`SELECT b.route, b.model FROM dialogue_attempts a JOIN dialogue_execution_bindings b USING(attempt_id)
        WHERE a.dialogue_id = ? AND b.bound_at <= ? ORDER BY a.ordinal DESC LIMIT 1`).get(taskId, at)
    : db.prepare('SELECT route, model FROM dialogue_execution_bindings WHERE attempt_id = ?').get(attemptId);
  if (dialogue) return { route: String(dialogue.route), model: String(dialogue.model) };
  const plan = db.prepare(`SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ?
    AND component = 'provider-resolution-plan' AND created_at <= ? ORDER BY plan_version DESC LIMIT 1`).get(taskId, at);
  if (!plan) return null;
  const route = JSON.parse(String(plan.canonical_json)).executionRoute;
  return route && typeof route.kind === 'string' && typeof route.model === 'string' ? { route: route.kind, model: route.model } : null;
}
