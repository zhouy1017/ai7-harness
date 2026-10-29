import type { DatabaseSync } from 'node:sqlite';
import { COMPOSITE_PROCEDURE_EXECUTOR, type PreinstalledProcedureProjection } from '../../shared/protocol/procedures.js';
import type { DefinitionRecommendationReading } from '../procedure-recommendation.js';
import { LOCAL_REVIEW_CATEGORY_V3 } from '../review/category-configuration.js';
import { BASELINE_ANALYSIS_KIND } from '../../shared/protocol.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION } from '../review/category-configuration.js';
import { resolveProcedureDefinition } from './definition-store.js';
import { BASELINE_PROCEDURE_ID, FULL_REVIEW_PROCEDURE_ID, allPreinstalledProcedureDefinitions, preinstalledProcedureDefinitions, reviewProcedureId } from './preinstalled.js';
import { compositeUses, readProcedureLibrary } from './editable.js';
import { compositeMembers } from './composite.js';
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
    [FULL_REVIEW_PROCEDURE_ID, compositeUses(db, FULL_REVIEW_PROCEDURE_ID)] as const,
  ]);
  return preinstalledProcedureDefinitions().map((definition) => {
    const { document, pin } = resolveProcedureDefinition(db, definition.id);
    return { ...pin, title: document.title, state: 'enabled' as const, uses: uses.get(document.id) ?? 0,
      ...(pin.version === 1 ? {} : { previousVersions: allPreinstalledProcedureDefinitions().filter((previous) => previous.id === document.id && previous.version < document.version).map((previous) => {
        const retained = resolveProcedureDefinition(db, previous.id, previous.version);
        return { ...retained.pin, stages: retained.document.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })) };
      }) }),
      stages: document.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })) };
  });
}

/**
 * The library's review procedures as 工序推荐 reads them (Issue #1173): each procedure's newest version that is not stopped and runs
 * review categories — a composite with its members, a category's own version with that category — whichever Book it was made on.
 */
export function definitionRecommendationReadings(db: DatabaseSync): readonly DefinitionRecommendationReading[] {
  const label = (categoryId: string): string => categoryId === LOCAL_CHECK_CATEGORY ? LOCAL_REVIEW_CATEGORY_V3.label
    : BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.find((entry) => entry.categoryId === categoryId)?.label ?? categoryId;
  return readProcedureLibrary(db).procedures.flatMap((procedure) => {
    if (procedure.stopped) return [];
    const categoryIds = procedure.executorKind === COMPOSITE_PROCEDURE_EXECUTOR ? compositeMembers(procedure.document).map((entry) => entry.member.categoryId)
      : procedure.executorKind === LOCAL_CHECK_CATEGORY || procedure.executorKind === 'factual-review' ? [procedure.executorKind]
        : procedure.executorKind.startsWith('editorial-review/') ? [procedure.executorKind.slice('editorial-review/'.length)] : [];
    return categoryIds.length === 0 ? [] : [{ procedure, categoryIds, labels: categoryIds.map(label) }];
  });
}
