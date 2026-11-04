import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { BaselineAnalysisRunState } from '../../shared/protocol.js';
import { canonicalRecord, parseCanonicalJson, requireAnalysis } from './canonical.js';
import { describeComposition } from '../harness/primary-agent-harness.js';
import { transact } from './run-state.js';

export interface CurationRunsHost {
  readonly db: DatabaseSync;
  insertRunState: (runRecordId: string, sequence: number, state: BaselineAnalysisRunState, detail: Record<string, unknown>, recordedAt: string) => void;
  recordRunState: (runRecordId: string, state: BaselineAnalysisRunState, detail: Record<string, unknown>) => void;
  settleCuration: (run: import('../learning/curation.js').CurationRun, state: 'completed' | 'failed' | 'interrupted', evidence: { usage: import('../provider/classification.js').UsageFacts | null; proposals: number; transmitted: boolean; reason: string }) => void;
}

export function curationBudgetUse(host: CurationRunsHost, controlEntryId: string): { passesUsed: number; reservedTokens: number } {
  const rows = host.db.prepare(`SELECT a.canonical_json, o.canonical_json outcome FROM analysis_run_authorizations a
      LEFT JOIN analysis_task_outcomes o ON o.task_intent_id = a.task_intent_id
      WHERE a.origin = 'enabled-learning' AND json_extract(a.canonical_json, '$.controlEntryId') = ?`).all(controlEntryId);
  return { passesUsed: rows.length, reservedTokens: rows.reduce((total, row) => {
    const reserved = Number((parseCanonicalJson(String(row.canonical_json)) as { reservedTokens: number }).reservedTokens);
    const outcome = row.outcome === null ? null : parseCanonicalJson(String(row.outcome)) as { usage: Record<string, number> | null };
    const actual = Object.values(outcome?.usage ?? {}).reduce((sum, count) => sum + count, 0);
    return total + Math.max(reserved, actual);
  }, 0) };
}

export function curationRuns(host: CurationRunsHost): Array<{ runRecordId: string; state: string; summary: string }> {
  return host.db.prepare(`SELECT r.run_record_id, s.state, s.canonical_json FROM analysis_run_records r
      JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id
      JOIN analysis_run_states s ON s.run_record_id = r.run_record_id
      WHERE t.kind = 'learning-curation' AND s.sequence = (SELECT max(sequence) FROM analysis_run_states WHERE run_record_id = r.run_record_id)
      ORDER BY r.rowid DESC LIMIT 10`).all().map((row) => ({ runRecordId: String(row.run_record_id), state: String(row.state),
    summary: String((parseCanonicalJson(String(row.canonical_json)) as { detail: string }).detail) }));
}

export function reconcileCuration(host: CurationRunsHost): void {
  for (const row of host.db.prepare(`SELECT r.*, p.canonical_json plan, p.sha256 plan_digest, scope.canonical_json sources
      FROM analysis_run_records r JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id
      JOIN analysis_plan_records p ON p.task_intent_id = t.task_intent_id AND p.component = 'plan-envelope'
      JOIN analysis_plan_records scope ON scope.task_intent_id = t.task_intent_id AND scope.component = 'run-source-scope'
      WHERE t.kind = 'learning-curation' AND NOT EXISTS (SELECT 1 FROM analysis_task_outcomes o WHERE o.run_record_id = r.run_record_id)`).all()) {
    const plan = parseCanonicalJson(String(row.plan)) as { controlEntryId: string; envelope: import('../../shared/protocol/learning.js').EnabledLearningEnvelope; compositionDigest: string };
    const bundle = parseCanonicalJson(String(row.sources)) as import('../../shared/protocol/learning.js').LearningCurationBundle;
    const run = { taskIntentId: String(row.task_intent_id), runRecordId: String(row.run_record_id), authorizationId: String(row.authorization_id),
      controlEntryId: plan.controlEntryId, envelope: plan.envelope, compositionDigest: plan.compositionDigest, bundle, planDigest: String(row.plan_digest) };
    const possibleSend = host.db.prepare("SELECT 1 FROM analysis_run_states WHERE run_record_id = ? AND state = 'executing'").get(run.runRecordId) !== undefined;
    host.settleCuration(run, 'interrupted', { usage: null, proposals: 0, transmitted: possibleSend,
      reason: possibleSend ? '服务中断，学习整理发送结果不确定；保留预算与来源，不自动重发。' : '服务中断，本次学习整理未完成；保留来源记录，不自动重发。' });
  }
}

export function startCuration(host: CurationRunsHost, bundle: import('../../shared/protocol/learning.js').LearningCurationBundle, control: { entryId: string; envelope: import('../../shared/protocol/learning.js').EnabledLearningEnvelope }): import('../learning/curation.js').CurationRun {
  requireAnalysis(host.db.isTransaction && bundle.state === 'ready', 'ANALYSIS_PLAN_INVALID', '学习整理必须冻结完整来源。');
  const taskIntentId = randomUUID(), runRecordId = randomUUID(), authorizationId = randomUUID(), planVersionId = randomUUID();
  const instant = new Date().toISOString();
  const envelope = control.envelope;
  const compositionDigest = describeComposition(envelope.binding.route, envelope.binding.model, envelope.contractDigest,
    { version: 2, learningCuration: { bundleDigest: bundle.digest, contractDigest: envelope.contractDigest } }).digest;
  const intent = canonicalRecord({ taskIntentId, bookId: bundle.bookId, kind: 'learning-curation', contractVersion: bundle.schema,
    goal: '从完整编辑样例整理待接受的偏好与记忆', expectedOutcome: 'reviewable-learning-proposals', mode: 'learning-curation', createdAt: instant });
  host.db.prepare(`INSERT INTO analysis_task_intents(task_intent_id,book_id,kind,contract_version,goal,created_at,canonical_json,sha256,mode)
      VALUES (?,?,'learning-curation',?,?,?,?,?,'learning-curation')`).run(taskIntentId, bundle.bookId, bundle.schema,
        '从完整编辑样例整理待接受的偏好与记忆', instant, intent.json, intent.digest);
  const plan = canonicalRecord({ schema: 'ai7.learning-curation-plan/1', taskIntentId, controlEntryId: control.entryId,
    envelope, sourceManifestDigest: bundle.digest, compositionDigest, operations: ['model-processing'], startWhen: 'idle', tools: [], retries: 0 });
  for (const [component, value] of [['run-source-scope', bundle], ['provider-resolution-plan', envelope.binding], ['plan-envelope', parseCanonicalJson(plan.json)]] as const) {
    const record = canonicalRecord(value);
    host.db.prepare('INSERT INTO analysis_plan_records VALUES (?,1,?,?,?,?)').run(taskIntentId, component, record.json, record.digest, instant);
  }
  const version = canonicalRecord({ planVersionId, taskIntentId, ordinal: 1, planEnvelopeDigest: plan.digest, createdAt: instant });
  host.db.prepare('INSERT INTO analysis_plan_versions VALUES (?,?,1,NULL,?,?,?,?)')
    .run(planVersionId, taskIntentId, plan.digest, instant, version.json, version.digest);
  const authorization = canonicalRecord({ authorizationId, taskIntentId, origin: 'enabled-learning', authority: 'standard-direct-dispatch',
    startWhen: 'idle', planEnvelopeDigest: plan.digest, controlEntryId: control.entryId, reservedTokens: envelope.budget.perPassTokens, authorizedAt: instant });
  host.db.prepare(`INSERT INTO analysis_run_authorizations VALUES (?,?,?,'enabled-learning','standard-direct-dispatch',?,?,?,'idle')`)
    .run(authorizationId, taskIntentId, plan.digest, instant, authorization.json, authorization.digest);
  const run = canonicalRecord({ runRecordId, taskIntentId, authorizationId, recordedAt: instant });
  host.db.prepare('INSERT INTO analysis_run_records VALUES (?,?,?,?,?,?)').run(runRecordId, taskIntentId, authorizationId, instant, run.json, run.digest);
  host.insertRunState(runRecordId, 1, 'authorized', { detail: '已启用的学习范围授权一次完整样例整理；预算已保留。' }, instant);
  return { taskIntentId, runRecordId, authorizationId, controlEntryId: control.entryId, envelope, bundle, planDigest: plan.digest, compositionDigest };
}

export function bindCuration(host: CurationRunsHost, run: import('../learning/curation.js').CurationRun, sessionId: string): { attemptId: string; bindingDigest: string } {
  const attemptId = randomUUID(), at = new Date().toISOString();
  const attempt = canonicalRecord({ attemptId, runRecordId: run.runRecordId, ordinal: 1, startedAt: at });
  const binding = canonicalRecord({ schema: 'ai7.learning-curation-binding/1', attemptId, harnessSessionId: sessionId,
    planEnvelopeDigest: run.planDigest, sourceManifestDigest: run.bundle.digest, compositionDigest: run.compositionDigest,
    envelope: run.envelope, boundAt: at });
  transact(host.db, () => {
    host.db.prepare('INSERT INTO analysis_execution_attempts VALUES (?,?,1,?,?,?)').run(attemptId, run.runRecordId, at, attempt.json, attempt.digest);
    host.db.prepare('INSERT INTO analysis_execution_bindings VALUES (?,?,?,?,?)').run(attemptId, sessionId, at, binding.json, binding.digest);
    host.recordRunState(run.runRecordId, 'admitted', { detail: '学习整理执行绑定已固定。', attemptId, bindingDigest: binding.digest });
  });
  return { attemptId, bindingDigest: binding.digest };
}

export function settleCuration(host: CurationRunsHost, run: import('../learning/curation.js').CurationRun, state: 'completed' | 'failed' | 'interrupted', evidence: { usage: import('../provider/classification.js').UsageFacts | null; proposals: number; transmitted: boolean; reason: string }): void {
  transact(host.db, () => {
    host.recordRunState(run.runRecordId, state, { detail: evidence.reason, curation: evidence });
    const outcomeId = randomUUID(), recordedAt = new Date().toISOString();
    const outcome = canonicalRecord({ schema: 'ai7.learning-curation-outcome/1', outcomeId, taskIntentId: run.taskIntentId,
      runRecordId: run.runRecordId, classification: state, resultSetRevisionId: null, sourceManifestDigest: run.bundle.digest,
      summary: evidence.reason, safeNextAction: '查看候选记忆；本批来源不会自动重发。', ...evidence, recordedAt });
    host.db.prepare('INSERT INTO analysis_task_outcomes VALUES (?,?,?,?,NULL,?,?,?)')
      .run(outcomeId, run.taskIntentId, run.runRecordId, state, recordedAt, outcome.json, outcome.digest);
  });
}
