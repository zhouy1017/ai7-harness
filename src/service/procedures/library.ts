import type { DatabaseSync } from 'node:sqlite';
import type { PreinstalledProcedureProjection } from '../../shared/protocol/procedures.js';
import { BASELINE_ANALYSIS_KIND } from '../../shared/protocol.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION } from '../review/category-configuration.js';
import { resolveProcedureDefinition } from './definition-store.js';
import { BASELINE_PROCEDURE_ID, preinstalledProcedureDefinitions, reviewProcedureId } from './preinstalled.js';
import { PROCEDURE_STAGE_LABELS } from './stage-types.js';
import { LOCAL_CHECK_CATEGORY, LOCAL_CHECK_PROCEDURE } from '../review/deterministic/rules.js';

/**
 * 知识库's procedure library (Issue #1081, F-26a; ADR 0095 §1). A version 1 re-expresses its kind byte for byte, so its uses
 * are the approved runs of that kind — each category's approved Review Runs, as `reviewRuns` counts them, and every authorized
 * baseline Run — including those recorded before revision 85 pinned a procedure.
 */
export function readPreinstalledProcedures(db: DatabaseSync, reviewRuns: ReadonlyMap<string, number>): readonly PreinstalledProcedureProjection[] {
  const uses = new Map([
    [LOCAL_CHECK_PROCEDURE, reviewRuns.get(LOCAL_CHECK_CATEGORY) ?? 0] as const,
    ...BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map((entry) => [reviewProcedureId(entry.categoryId), reviewRuns.get(entry.categoryId) ?? 0] as const),
    [BASELINE_PROCEDURE_ID, Number(db.prepare(`SELECT count(*) total FROM analysis_run_records r
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id WHERE t.kind = ?`).get(BASELINE_ANALYSIS_KIND)!.total)] as const,
  ]);
  return preinstalledProcedureDefinitions().map((definition) => {
    const { document, pin } = resolveProcedureDefinition(db, definition.id);
    return { ...pin, title: document.title, state: 'enabled' as const, uses: uses.get(document.id) ?? 0,
      ...(pin.version === 1 ? {} : { previousVersions: preinstalledProcedureDefinitions(1).filter((previous) => previous.id === document.id).map((previous) => {
        const retained = resolveProcedureDefinition(db, previous.id, previous.version);
        return { ...retained.pin, stages: retained.document.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })) };
      }) }),
      stages: document.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })) };
  });
}
