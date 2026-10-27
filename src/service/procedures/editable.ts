import { PROCEDURE_STAGE_LABELS, procedureStageUsesModel } from '../../shared/protocol/procedures.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { EditableProcedureProjection, ProcedureDefinitionDocument, ProcedureDefinitionPin, ProcedureLibraryProjection, SaveProcedureDefinitionInput } from '../../shared/protocol/procedures.js';
import { canonicalJson, canonicalRecord, requireAnalysis } from '../analysis/canonical.js';
import { resolveProcedureDefinition, readProcedurePlanPin, readProcedurePlanDocument } from './definition-store.js';
import { allPreinstalledProcedureDefinitions, BASELINE_PROCEDURE_ID, FACTUAL_CLAIM_PROCEDURE_ID } from './preinstalled.js';

export const PROCEDURE_INSTRUCTION_LIMIT = 1200;
const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
const size = (text: string): number => [...segmenter.segment(text)].length;
export const procedureVersionId = (pin: ProcedureDefinitionPin): string => `${pin.procedureId}@${pin.version}`;

export function resolveProcedurePin(db: DatabaseSync, pin: ProcedureDefinitionPin): ProcedureDefinitionDocument {
  const resolved = resolveProcedureDefinition(db, pin.procedureId, pin.version);
  requireAnalysis(resolved.pin.digest === pin.digest, 'PROCEDURE_VERSION_MOVED', '工序版本已变化，请重新选择。');
  return resolved.document;
}

export function procedureExecutorKind(db: DatabaseSync, pin: ProcedureDefinitionPin): string {
  const origin = db.prepare('SELECT executor_kind FROM procedure_version_origins WHERE version_id = ?').get(procedureVersionId(pin));
  if (origin !== undefined) return String(origin.executor_kind);
  if (pin.procedureId === BASELINE_PROCEDURE_ID) return 'baseline-manuscript-analysis';
  if (pin.procedureId === FACTUAL_CLAIM_PROCEDURE_ID || pin.procedureId === 'ai7-procedure/review-factual-review') return 'factual-review';
  return pin.procedureId.startsWith('ai7-procedure/review-') ? `editorial-review/${pin.procedureId.slice('ai7-procedure/review-'.length)}`
    : pin.procedureId.slice('ai7-procedure/'.length);
}

export function procedureStopped(db: DatabaseSync, pin: ProcedureDefinitionPin): boolean {
  return db.prepare('SELECT 1 FROM procedure_version_stops WHERE version_id = ?').get(procedureVersionId(pin)) !== undefined;
}

/** Executor-owned inputs/templates/tools are fixed; editable order must respect their data dependencies. */
export function validateProcedureEdit(base: ProcedureDefinitionDocument, input: SaveProcedureDefinitionInput): void {
  if (base.stages.some((stage) => stage.stageType === 'deterministic-check')) {
    requireAnalysis(input.editorInstruction === '' && input.stages.every((stage) => stage.exemptionRules.length === 0 && stage.budgetShare === 0),
      'PROCEDURE_LOCAL_TEXT_UNSUPPORTED', '确定性检查不发送给模型，不能解释文字说明或豁免规则；请在运行时选择明确的检查选项，模型预算保持为零。');
  }
  requireAnalysis(typeof input.title === 'string' && input.title.trim().length > 0 && size(input.title) <= 120,
    'PROCEDURE_TITLE_INVALID', '工序名称须为 1 至 120 个字。');
  requireAnalysis(typeof input.editorInstruction === 'string' && Array.isArray(input.stages) && input.stages.length === base.stages.length,
    'PROCEDURE_STAGES_INVALID', '工序须保留所选任务的阶段和输入输出契约。');
  for (const [index, stage] of input.stages.entries()) {
    const expected = base.stages[index]!;
    requireAnalysis(procedureStageUsesModel(expected, base.stages) || stage.exemptionRules.length === 0 && stage.budgetShare === 0,
      'PROCEDURE_DETERMINISTIC_SETTINGS', `「${PROCEDURE_STAGE_LABELS[expected.stageType]}」由固定本地规则生成，不解释文字豁免，模型预算须为零。`);
    requireAnalysis(stage.stageType === expected.stageType, 'PROCEDURE_STAGE_ORDER_INVALID',
      `第 ${index + 1} 阶段须为「${PROCEDURE_STAGE_LABELS[expected.stageType]}」：这个任务的后续阶段依赖前一阶段的结果，不能交换。`);
    const { exemptionRules: _rules, budgetShare: _share, ...fixed } = expected;
    const { exemptionRules, budgetShare, ...offered } = stage;
    requireAnalysis(canonicalJson(fixed) === canonicalJson(offered), 'PROCEDURE_STAGE_CONTRACT_INVALID', '阶段类型、输入、工具和输出契约由所选任务固定。');
    requireAnalysis(Array.isArray(exemptionRules) && exemptionRules.length <= 20 && exemptionRules.every((rule) => typeof rule === 'string') &&
      Number.isFinite(budgetShare) && budgetShare >= 0 && budgetShare <= 1,
    'PROCEDURE_STAGE_SETTINGS_INVALID', '每个阶段最多 20 条豁免规则，预算份额须在 0 至 1 之间。');
  }
  requireAnalysis(size(input.editorInstruction) + input.stages.reduce((sum, stage) => sum + stage.exemptionRules.reduce((n: number, rule: string) => n + size(rule), 0), 0) <= PROCEDURE_INSTRUCTION_LIMIT,
    'PROCEDURE_INSTRUCTION_TOO_LONG', '编辑任务说明和豁免规则合计不能超过 1200 个字。');
  requireAnalysis(input.stages.reduce((sum, stage) => sum + stage.budgetShare, 0) <= 1.000001,
    'PROCEDURE_BUDGET_INVALID', '阶段预算份额合计不能超过 100%。');
}

/** Called inside the Store transaction: every save appends a version, including changes to pre-installed procedures. */
export function saveProcedureDefinition(db: DatabaseSync, input: SaveProcedureDefinitionInput, now: Date): EditableProcedureProjection {
  const source = input.captureRunId === undefined ? null : completedProcedureRuns(db, input.captureRunId)[0];
  const base = source?.document ?? resolveProcedurePin(db, input.basedOn);
  validateProcedureEdit(base, input);
  requireAnalysis(input.procedureId === null || input.procedureId === base.id, 'PROCEDURE_PARENT_INVALID', '新版本必须属于当前编辑的工序。');
  if (input.captureRunId !== undefined) {
    requireAnalysis(source !== undefined && source !== null && canonicalJson(source.procedure) === canonicalJson(input.basedOn),
      'PROCEDURE_CAPTURE_UNAVAILABLE', '只能从已完成且固定了此工序版本的运行捕获。');
  }
  requireAnalysis(base.stages.some((stage) => procedureStageUsesModel(stage, base.stages)) || input.editorInstruction === '',
    'PROCEDURE_LOCAL_TEXT_UNSUPPORTED', '这个工序只包含固定本地规则，不解释文字说明。');
  const id = input.procedureId ?? `ai7-procedure/${randomUUID()}`;
  const createdAt = now.toISOString();
  const previous = input.procedureId === null ? null : resolveProcedureDefinition(db, id);
  requireAnalysis(previous === null || previous.pin.version === input.basedOn.version, 'PROCEDURE_VERSION_MOVED', '已有更新版本，请重新打开后编辑。');
  const document: ProcedureDefinitionDocument = { ...base, id, version: (previous?.pin.version ?? 0) + 1,
    title: input.title.trim(), editorInstruction: input.editorInstruction, stages: structuredClone(input.stages) };
  if (previous === null) {
    const identity = canonicalRecord({ procedureId: id, preInstalled: false, createdAt });
    db.prepare('INSERT INTO procedure_definitions VALUES (?,0,?,?,?)').run(id, createdAt, identity.json, identity.digest);
  }
  const record = canonicalRecord(document), versionId = `${id}@${document.version}`;
  const version = canonicalRecord({ versionId, procedureId: id, version: document.version,
    documentDigest: record.digest, previousDocumentDigest: previous?.pin.digest ?? null, createdAt });
  db.prepare('INSERT INTO procedure_definition_versions VALUES (?,?,?,?,?,?,?,?,?)')
    .run(versionId, id, document.version, record.json, record.digest, previous?.pin.digest ?? null, createdAt, version.json, version.digest);
  db.prepare('INSERT INTO procedure_version_origins VALUES (?,?,?,?,?)')
    .run(versionId, source?.executorKind ?? procedureExecutorKind(db, input.basedOn), procedureVersionId(input.basedOn), input.basedOn.digest, input.captureRunId ?? null);
  return inspectProcedureDefinition(db, id);
}

export function inspectProcedureDefinition(db: DatabaseSync, id: string): EditableProcedureProjection {
  const { document, pin } = resolveProcedureDefinition(db, id);
  const origin = db.prepare('SELECT source_run_id FROM procedure_version_origins WHERE version_id = ?').get(procedureVersionId(pin));
  const identity = db.prepare('SELECT pre_installed FROM procedure_definitions WHERE procedure_id = ?').get(id)!;
  const versions = db.prepare('SELECT version, document_sha256 FROM procedure_definition_versions WHERE procedure_id = ? ORDER BY version DESC').all(id)
    .map((row) => ({ procedureId: id, version: Number(row.version), digest: String(row.document_sha256) }));
  return { ...pin, document, executorKind: procedureExecutorKind(db, pin), preInstalled: identity.pre_installed === 1,
    stopped: procedureStopped(db, pin), sourceRunId: origin?.source_run_id == null ? null : String(origin.source_run_id), versions,
    documents: versions.map((version) => resolveProcedurePin(db, version)),
    uses: Number(db.prepare(`SELECT (SELECT count(*) FROM procedure_plan_pins p JOIN analysis_run_authorizations a ON a.plan_envelope_sha256 = p.plan_envelope_sha256
      WHERE json_extract(p.canonical_json, '$.procedure.procedureId') = ?) + (SELECT count(*) FROM review_runs r JOIN review_run_authorizations a ON a.review_run_id = r.review_run_id
      WHERE json_extract(r.canonical_json, '$.localPlan.procedure.procedureId') = ?) total`).get(id, id)!.total) };
}

export function completedProcedureRuns(db: DatabaseSync, runId?: string): ProcedureLibraryProjection['completedRuns'] {
  const analysis = db.prepare(`SELECT r.run_record_id, t.book_id, t.kind, b.title, a.plan_envelope_sha256 FROM analysis_run_records r
    JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id JOIN books b ON b.book_id = t.book_id
    JOIN analysis_run_authorizations a ON a.authorization_id = r.authorization_id
    WHERE (? IS NULL OR r.run_record_id = ?) AND (SELECT state FROM analysis_run_states s WHERE s.run_record_id = r.run_record_id ORDER BY sequence DESC LIMIT 1)
      IN ('completed','completed-with-gaps') ORDER BY r.rowid DESC LIMIT 50`).all(runId ?? null, runId ?? null).flatMap((row) => {
    const pin = readProcedurePlanPin(db, String(row.plan_envelope_sha256));
    if (pin === null) return [];
    return [{ runId: String(row.run_record_id), bookId: String(row.book_id), bookTitle: String(row.title),
      title: readProcedurePlanDocument(db, String(row.plan_envelope_sha256))!.title, procedure: pin,
      document: readProcedurePlanDocument(db, String(row.plan_envelope_sha256))!, executorKind: String(row.kind) }];
  });
  const local = db.prepare(`SELECT r.review_run_id, r.book_id, b.title, r.canonical_json FROM review_runs r JOIN books b ON b.book_id = r.book_id
    WHERE (? IS NULL OR r.review_run_id = ?) AND (SELECT state FROM review_local_stage_artifacts a WHERE a.review_run_id = r.review_run_id ORDER BY sequence DESC LIMIT 1) = 'materialized'
    ORDER BY r.rowid DESC LIMIT 50`).all(runId ?? null, runId ?? null).map((row) => {
    const snapshot = JSON.parse(String(row.canonical_json)) as { localPlan: { procedure: ProcedureDefinitionPin; procedureDefinition?: ProcedureDefinitionDocument } };
    const pin = snapshot.localPlan.procedure;
    const document = snapshot.localPlan.procedureDefinition ?? resolveProcedurePin(db, pin);
    return { runId: String(row.review_run_id), bookId: String(row.book_id), bookTitle: String(row.title), title: document.title,
      procedure: pin, document, executorKind: 'local-text-check' };
  });
  return [...analysis, ...local];
}

export function readProcedureLibrary(db: DatabaseSync): ProcedureLibraryProjection {
  return { procedures: db.prepare('SELECT procedure_id FROM procedure_definitions ORDER BY pre_installed DESC, rowid').all()
    .map((row) => inspectProcedureDefinition(db, String(row.procedure_id))), completedRuns: completedProcedureRuns(db) };
}

export function selectProcedureForBook(db: DatabaseSync, bookId: string, pin: ProcedureDefinitionPin): void {
  resolveProcedurePin(db, pin);
  requireAnalysis(!procedureStopped(db, pin), 'PROCEDURE_STOPPED', '这个工序版本已停用，请选择另一个版本。');
  db.prepare(`INSERT INTO procedure_run_choices VALUES (?,?,?) ON CONFLICT(book_id, executor_kind) DO UPDATE SET version_id = excluded.version_id`)
    .run(bookId, procedureExecutorKind(db, pin), procedureVersionId(pin));
}

export function selectedProcedureForBook(db: DatabaseSync, bookId: string, kind: string): ProcedureDefinitionPin | null {
  const row = db.prepare(`SELECT v.procedure_id, v.version FROM procedure_run_choices c JOIN procedure_definition_versions v ON v.version_id = c.version_id
    WHERE c.book_id = ? AND c.executor_kind = ?`).get(bookId, kind);
  if (row === undefined) return null;
  const { pin } = resolveProcedureDefinition(db, String(row.procedure_id), Number(row.version));
  requireAnalysis(!procedureStopped(db, pin), 'PROCEDURE_STOPPED', '所选工序版本已停用，请在「工序与规则」选择另一个版本。');
  return pin;
}

/** Unselected stock tasks keep the product version, never silently pick an editor's later version. */
export function currentPreinstalledVersion(id: string): number {
  return Math.max(...allPreinstalledProcedureDefinitions().filter((document) => document.id === id).map((document) => document.version));
}
