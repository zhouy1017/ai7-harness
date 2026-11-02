import { MODEL_REQUEST_ADMISSION_SCHEMA_VERSION } from '../task-authorization.js';
import type { DatabaseSync } from 'node:sqlite';
import { UUID_PATTERN, canonicalRecord, parseCanonicalJson, requireAnalysis } from './canonical.js';
import type {
  CarriedStages,
  RequestAdmissionReading,
  SqlRow,
  UnitCheckpoint,
  UnitResultRecord,
} from './baseline-analysis-types.js';
import { CARRIED_STAGES, UNIT_CHECKPOINT_SCHEMA, asNumber, asString } from './run-state.js';

export interface RunCheckpointOperationsHost {
  readonly db: DatabaseSync;
  unitResultOfRecord: (record: Record<string, unknown>, unitOrdinal: number) => unknown;
  requestAdmissionOf: (runRecordId: string) => RequestAdmissionReading | null;
}

export function recordUnitCheckpoint(host: RunCheckpointOperationsHost, input: {
    runRecordId: string;
    attemptId: string;
    unit: UnitResultRecord;
    observation: UnitCheckpoint['observation'];
    requests?: readonly string[];
  }): void {
  if (input.requests !== undefined) requireAnalysis(Number(host.db.prepare('PRAGMA user_version').get()?.user_version) >= MODEL_REQUEST_ADMISSION_SCHEMA_VERSION, 'ANALYSIS_RECORD_INVALID', '请求检查点写入需要已验证的读者修订。');
  const recordedAt = new Date().toISOString();
  const record = canonicalRecord({
    schema: UNIT_CHECKPOINT_SCHEMA,
    runRecordId: input.runRecordId,
    attemptId: input.attemptId,
    unit: input.unit,
    observation: input.observation,
    ...(input.requests === undefined ? {} : { requests: input.requests }),
    recordedAt,
  });
  host.db.prepare(
      'INSERT INTO analysis_unit_checkpoints(run_record_id, unit_ordinal, state, recorded_at, canonical_json, sha256) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(input.runRecordId, input.unit.unitOrdinal, input.unit.closed.state, recordedAt, record.json, record.digest);
}

export function carriedUsageOf(host: RunCheckpointOperationsHost, runRecordId: string): { inputTokens: number; outputTokens: number; stages: CarriedStages | null; webVerification?: { inputTokens: number; outputTokens: number } } | null {
  const rows = host.db.prepare(
      `SELECT canonical_json, sha256 FROM analysis_run_states WHERE run_record_id = ? AND
       (state IN ('paused', 'resumable', 'awaiting-clarification') OR
        json_extract(canonical_json, '$.requestAdmission.schema') = 'ai7.analysis.request-admission/1' AND json_type(canonical_json, '$.carriedUsage') IS NOT NULL)
       ORDER BY sequence DESC`,
  ).all(runRecordId) as SqlRow[];
  const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
  for (const row of rows) {
    const record = parseCanonicalJson(asString(row.canonical_json)) as { carriedUsage?: unknown; requestAdmission?: unknown };
    if (record.requestAdmission !== undefined) {
      requireAnalysis(canonicalRecord(record).digest === row.sha256, 'ANALYSIS_RECORD_INVALID', '阶段用量记录无法核对。');
      host.requestAdmissionOf(runRecordId);
    }
    const carried = record.carriedUsage;
    if (carried === undefined) continue;
    const usage = carried as { inputTokens?: unknown; outputTokens?: unknown; stages?: unknown; webVerification?: { inputTokens?: unknown; outputTokens?: unknown } };
    requireAnalysis(carried !== null && typeof carried === 'object' && count(usage.inputTokens) && count(usage.outputTokens),
        'ANALYSIS_RECORD_INVALID', '运行记录的已用量无效。');
    // The stages a stop kept its usage by (Issue #541); a stop recorded before they were kept names none.
    let stages: CarriedStages | null = null;
    if (usage.stages !== undefined) {
      const kept = usage.stages as Record<string, { requests?: unknown; inputTokens?: unknown; outputTokens?: unknown } | undefined>;
      requireAnalysis(usage.stages !== null && typeof usage.stages === 'object' && Object.keys(usage.stages).length === CARRIED_STAGES.length &&
        CARRIED_STAGES.every((stage) => kept[stage] !== undefined && count(kept[stage]!.requests) && count(kept[stage]!.inputTokens) && count(kept[stage]!.outputTokens)),
        'ANALYSIS_RECORD_INVALID', '运行记录的已用量无效。');
      stages = Object.fromEntries(CARRIED_STAGES.map((stage) => [stage, {
        requests: kept[stage]!.requests as number, inputTokens: kept[stage]!.inputTokens as number, outputTokens: kept[stage]!.outputTokens as number,
      }])) as CarriedStages;
      const summed = CARRIED_STAGES.reduce((total, stage) => ({
        inputTokens: total.inputTokens + stages![stage].inputTokens, outputTokens: total.outputTokens + stages![stage].outputTokens,
      }), { inputTokens: 0, outputTokens: 0 });
      requireAnalysis(summed.inputTokens <= (usage.inputTokens as number) && summed.outputTokens <= (usage.outputTokens as number),
          'ANALYSIS_RECORD_INVALID', '运行记录的已用量无效。');
    }
    const web = usage.webVerification;
    requireAnalysis(web === undefined || web !== null && count(web.inputTokens) && count(web.outputTokens) &&
      web.inputTokens <= (usage.inputTokens as number) && web.outputTokens <= (usage.outputTokens as number),
      'ANALYSIS_RECORD_INVALID', '联网取证阶段的已用量无效。');
    return { inputTokens: usage.inputTokens as number, outputTokens: usage.outputTokens as number, stages,
      ...(web === undefined ? {} : { webVerification: { inputTokens: web.inputTokens as number, outputTokens: web.outputTokens as number } }) };
  }
  return null;
}

export function unitCheckpoints(host: RunCheckpointOperationsHost, runRecordId: string): UnitCheckpoint[] {
  requireAnalysis(UUID_PATTERN.test(runRecordId), 'ANALYSIS_RUN_INVALID', '运行记录标识无效。');
  const rows = host.db.prepare('SELECT * FROM analysis_unit_checkpoints WHERE run_record_id = ? ORDER BY unit_ordinal').all(runRecordId) as SqlRow[];
  return rows.map((row) => {
    const json = asString(row.canonical_json);
    const record = parseCanonicalJson(json) as {
      schema: string; runRecordId: string; attemptId: string; unit: UnitResultRecord; observation: UnitCheckpoint['observation'];
    };
    const unitOrdinal = asNumber(row.unit_ordinal);
    requireAnalysis(canonicalRecord(record).digest === asString(row.sha256) && record.schema === UNIT_CHECKPOINT_SCHEMA &&
      record.runRecordId === runRecordId && record.unit.unitOrdinal === unitOrdinal && record.unit.closed.state === asString(row.state),
      'ANALYSIS_RECORD_INVALID', '运行的阅读进度记录与其摘要不一致。');
    return {
      attemptId: record.attemptId,
      unit: record.unit,
      observation: record.observation,
      result: record.unit.closed.state === 'closed'
        ? host.unitResultOfRecord(record.unit.closed.result as Record<string, unknown>, unitOrdinal)
        : null,
    };
  });
}
