import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

export function frozenReviewUnits(dataRoot: string, reviewRunId: string): number {
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const row = db.prepare(`SELECT sum(json_array_length(p.canonical_json, '$.units')) units
      FROM review_runs r, json_each(r.canonical_json, '$.categories') c JOIN analysis_plan_records p
        ON p.task_intent_id = json_extract(c.value, '$.task.taskIntentId')
      WHERE r.review_run_id = ? AND p.component = 'coverage-manifest' AND p.plan_version = 1`).get(reviewRunId)!;
    return row.units === null ? Number(db.prepare("SELECT json_array_length(canonical_json, '$.localPlan.blocks') units FROM review_runs WHERE review_run_id = ?").get(reviewRunId)!.units ?? 0) : Number(row.units);
  } finally { db.close(); }
}

/** Compare the frozen options and contracts, excluding each new Task's identity and clock. */
export function frozenReviewOptions(dataRoot: string, reviewRunId: string): unknown {
  const db = new DatabaseSync(join(dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try { return db.prepare(`SELECT json_extract(c.value, '$.categoryId') category, p.component, p.canonical_json
    FROM review_runs r, json_each(r.canonical_json, '$.categories') c JOIN analysis_plan_records p
      ON p.task_intent_id = json_extract(c.value, '$.task.taskIntentId')
    WHERE r.review_run_id = ? AND p.plan_version = (SELECT max(p2.plan_version) FROM analysis_plan_records p2 WHERE p2.task_intent_id = p.task_intent_id)
      AND p.component IN ('execution-plan', 'provider-resolution-plan') ORDER BY category, p.component`).all(reviewRunId).map(row => {
      const record = JSON.parse(String(row.canonical_json));
      return { category: row.category, component: row.component, ...(row.component === 'execution-plan'
        ? { editorEdits: record.editorEdits ?? null, promptContractDigest: record.promptContractDigest }
        : { runBudgetCeiling: record.runBudgetCeiling }) };
    }); }
  finally { db.close(); }
}

