import type { DatabaseSync } from 'node:sqlite';
import type { PreinstalledProcedureProjection } from '../../shared/protocol/procedures.js';
import { resolveProcedureDefinition } from './definition-store.js';
import { preinstalledProcedureDefinitions } from './preinstalled.js';
import { PROCEDURE_STAGE_LABELS } from './stage-types.js';

export function readPreinstalledProcedures(db: DatabaseSync): readonly PreinstalledProcedureProjection[] {
  return preinstalledProcedureDefinitions().map((definition) => {
    const { document, pin } = resolveProcedureDefinition(db, definition.id);
    const uses = document.id === 'ai7-procedure/baseline-analysis'
      ? Number(db.prepare("SELECT count(*) total FROM analysis_run_records WHERE json_extract(canonical_json, '$.procedure.procedureId') = ?")
        .get(document.id)!.total)
      : Number(db.prepare(`SELECT count(DISTINCT r.review_run_id) total FROM review_runs r, json_each(r.canonical_json, '$.preinstalledProcedures') p
          WHERE json_extract(p.value, '$.procedure.procedureId') = ?
          AND EXISTS (SELECT 1 FROM review_run_authorizations a WHERE a.review_run_id = r.review_run_id)`).get(document.id)!.total);
    return { ...pin, title: document.title, state: 'enabled' as const, uses,
      stages: document.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })) };
  });
}
