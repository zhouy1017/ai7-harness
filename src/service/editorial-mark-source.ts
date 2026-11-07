import type { DatabaseSync } from 'node:sqlite';
import type { EditorialMarkBasisProjection, EditorialMarkSourceProjection } from '../shared/protocol.js';
import { MODEL_SERVICE_ROUTE_BINDINGS, modelServiceChannelOf } from '../shared/protocol/model-service.js';
import { CONFIGURED_RUNTIME_MODEL_LABELS } from '../shared/provider-configuration.generated.js';

export interface MarkModelBinding { route: string; model: string; reasoningEffort?: string | null }
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
  const provider = channel === null ? binding.route : MODEL_SERVICE_ROUTE_BINDINGS[channel].providerLabel;
  const display = CONFIGURED_RUNTIME_MODEL_LABELS[`${binding.route}/${binding.model}`] ?? binding.model;
  const effort = binding.model.includes('@') || !binding.reasoningEffort ? '' : `@${binding.reasoningEffort}`;
  return {
    modelLabel: `${display}${effort}`,
    modelTechnicalLabel: `${provider} · ${binding.model}${effort}`,
  };
}

/** Read only the producing record, never today's model selection. Workspace rounds use dialogue attempts. */
export function recordedMarkModel(db: DatabaseSync, taskId: string, at: string, attemptId?: string): MarkModelBinding | null {
  const dialogue = attemptId === undefined
    ? db.prepare(`SELECT b.route, b.model, b.canonical_json FROM dialogue_attempts a JOIN dialogue_execution_bindings b USING(attempt_id)
        WHERE a.dialogue_id = ? AND b.bound_at <= ? ORDER BY a.ordinal DESC LIMIT 1`).get(taskId, at)
    : db.prepare('SELECT route, model, canonical_json FROM dialogue_execution_bindings WHERE attempt_id = ?').get(attemptId);
  if (dialogue) return { route: String(dialogue.route), model: String(dialogue.model),
    reasoningEffort: JSON.parse(String(dialogue.canonical_json)).reasoningEffort };
  const plan = db.prepare(`SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ?
    AND component = 'provider-resolution-plan' AND created_at <= ? ORDER BY plan_version DESC LIMIT 1`).get(taskId, at);
  if (!plan) return null;
  const route = JSON.parse(String(plan.canonical_json)).executionRoute;
  return route && typeof route.kind === 'string' && typeof route.model === 'string'
    ? { route: route.kind, model: route.model, reasoningEffort: route.reasoningEffort } : null;
}

/** Old writers froze a provider (possibly with a friendly suffix), while retaining the actual ID in technical detail. */
function legacyFrozenModel(source: ModelLabels): MarkModelBinding | null {
  if (source.modelLabel === 'AI7 本地检查') return null;
  const separator = source.modelTechnicalLabel?.indexOf(' · ') ?? -1;
  if (separator < 0) return null;
  const provider = source.modelTechnicalLabel!.slice(0, separator);
  if (source.modelLabel !== provider && !source.modelLabel?.startsWith(`${provider} · `) && source.modelLabel !== 'AI7') return null;
  const model = source.modelTechnicalLabel!.slice(separator + 3);
  const channel = Object.values(MODEL_SERVICE_ROUTE_BINDINGS).find((entry) => entry.providerLabel === provider);
  return model ? { route: channel?.providerId ?? provider, model } : null;
}

/** A conversion is not a generation. Legacy arrays resolve through the original mark and exact dialogue conversion. */
export function historicalMarkModelLabels(db: DatabaseSync, markId: string): ModelLabels {
  const mark = db.prepare(`SELECT source_kind, source_task_id, created_at, basis_json, converted_from_mark_id
    FROM editorial_marks WHERE mark_id = ?`).get(markId);
  if (!mark || mark.source_kind !== 'ai7') return {};
  const frozen = readMarkEvidence(String(mark.basis_json)).source;
  const legacy = frozen === undefined ? null : legacyFrozenModel(frozen);
  const providerOnly = frozen?.modelLabel === 'AI7' || Object.values(MODEL_SERVICE_ROUTE_BINDINGS)
    .some(({ providerLabel }) => frozen?.modelLabel === providerLabel || frozen?.modelLabel?.startsWith(`${providerLabel} · `));
  if (frozen?.modelLabel && legacy === null && !providerOnly) return frozen;
  if (mark.converted_from_mark_id !== null) return historicalMarkModelLabels(db, String(mark.converted_from_mark_id));
  const conversion = db.prepare('SELECT attempt_id FROM dialogue_conversions WHERE mark_id = ?').get(markId);
  const recorded = mark.source_task_id === null ? null : recordedMarkModel(db, String(mark.source_task_id), String(mark.created_at),
    conversion ? String(conversion.attempt_id) : undefined);
  return markModelLabels(recorded ?? legacy ?? (mark.source_task_id === null
    ? { route: 'ai7-local-deterministic', model: 'local-text-check' } : null));
}
