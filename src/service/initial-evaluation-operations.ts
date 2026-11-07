import { editorialMemoryBasePromptDigest } from './learning/editorial-memory.js';
import {
  TASK_MATERIAL_LIVE_UNAVAILABLE,
  taskMaterialReferenceLine,
  taskMaterialKindDefinition,
  taskMaterialSources,
  taskMaterialSettled,
  type TaskMaterialBoundary,
  type TaskMaterialReading,
  type TaskMaterialSource,
} from './task-material-references.js';
import { DatabaseSync } from 'node:sqlite';
import { DIGEST_PATTERN, StoreError, asString, canonicalJson, requireStore, sha256, type SqlRow } from './store-records.js';
import {
  type EvaluationProfilesProjection,
  type EvaluationProfileProjection,
  type SaveEvaluationProfileInput,
  type EvaluationWorkspaceProjection,
  type LaunchPolicyProjection,
  type AnalysisProjection,
  type EvaluationInitialProjection,
  type InitialEvaluationProjection,
  type ReviewWorkspaceProjection,
  INITIAL_EVALUATION_MODE_GOALS,
  INITIAL_EVALUATION_KIND,
  READERS_REPORT_KIND,
  EVALUATION_REWRITE_KIND,
  type FrozenSeriesScope,
  HISTORICALLY_AFFECTED_RESULT_MARKER,
} from '../shared/protocol.js';
import {
  INITIAL_EVALUATION_LIVE_UNAVAILABLE,
  initialEvaluationKindDefinition,
} from './evaluation/initial-evaluation-kind.js';
import { EVALUATION_PAYLOAD_CATEGORIES, liveKindRule, liveMaterialRule } from './analysis/live-kind-admission.js';
import {
  AnalysisError,
  BaselineAnalysisStore,
  activeRunReason,
  runIsActive,
  type AnalysisPreparationResult,
  type ProgressReader,
} from './analysis/baseline-analysis-store.js';
import type { AnalysisKindDefinition } from './analysis/kind-definition.js';
import {
  freezeSeriesScope,
  frozenSeriesScopes,
  liveSeriesContract,
  seriesScopeKindDefinition,
  seriesKnowledgeAllowed,
  seriesScopeChanged,
  SERIES_POLICY_CLOSED,
} from './review/series-consistency.js';
import { RecentCache } from './recent-cache.js';
import { analysisTaskStateLabel } from './task-plan.js';
import {
  BUILTIN_EVALUATION_PROFILE,
  EvaluationRecords,
  evaluationProfileDigest,
  type InitialEvaluationFacts,
} from './evaluation-records.js';
import { isRecord } from './analysis/canonical.js';
import { EvaluationProfiles } from './evaluation-profiles.js';
import { BoundedManuscriptStore } from './bounded-manuscript.js';
import {
  EVALUATION_PROFILE_UNKNOWN_ID,
  EVALUATION_PROFILE_UNKNOWN_TITLE,
  TASK_PLAN_NOT_CURRENT_REASON,
  parseStoredJson,
  type LedgerTaskKind,
  type StoreControl,
  unwrappedPlanPromptDigest,
} from './store-operation-support.js';

export interface InitialEvaluationOperationsHost {
  analysisCall: <T>(operation: () => T) => T;
  assertAvailable: () => void;
  readonly authority: DatabaseSync;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly boundedAuthority: BoundedManuscriptStore;
  readonly control: StoreControl;
  evaluationBookTitle: (bookId: string) => string;
  evaluationCall: <T>(operation: () => T) => T;
  readonly evaluationProfiles: EvaluationProfiles;
  readonly evaluations: EvaluationRecords;
  readonly initialEvaluation: BaselineAnalysisStore;
  readonly initialEvaluationLedgers: RecentCache<BaselineAnalysisStore>;
  readonly initialEvaluationWork: Map<string, { ledger: BaselineAnalysisStore; profile: EvaluationProfileProjection }>;
  ledgerTaskOf: (kind: LedgerTaskKind, bookId: string, taskIntentId: string) => BaselineAnalysisStore;
  prepareTaskMaterials: (bookId: string, materialIds: ReadonlyArray<string>) => ReadonlyArray<TaskMaterialSource>;
  requireLedgerKindScope: (kind: LedgerTaskKind, bookId: string, taskIntentId: string) => void;
  taskMaterialOffers: (bookId: string, surface?: '审阅' | '评估') => NonNullable<ReviewWorkspaceProjection['materials']>;
  taskMaterialReadings: (boundary: TaskMaterialBoundary, surface?: '审阅' | '评估') => ReadonlyArray<TaskMaterialReading>;
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  initialEvaluationLedgerForBook: (bookId: string, materials?: TaskMaterialBoundary) => BaselineAnalysisStore;
  inspectEvaluationProfiles: (before?: number | null) => EvaluationProfilesProjection;
  inspectInitialEvaluation: (bookId: string, progress?: ProgressReader, revisionId?: string | null) => InitialEvaluationProjection;
}

export function inspectEvaluationProfiles(host: InitialEvaluationOperationsHost, before: number | null = null): EvaluationProfilesProjection {
  return host.evaluationCall(() => {
    requireStore(before === null || (Number.isSafeInteger(before) && before > 0), 'EVALUATION_PROFILE_PAGE_INVALID', '评估方案版本页码无效。');
    const page = host.evaluationProfiles.page(before);
    const profiles = page.profiles.map((profile) => {
      const use = host.authority.prepare('SELECT count(*) AS records, count(DISTINCT book_id) AS books FROM evaluation_records WHERE profile_sha256 = ?').get(profile.sha256)!;
      return { ...profile, records: Number(use.records), books: Number(use.books) };
    });
    // The first page names the records that came from another house (Issue #798, P3-6). The known set is every house
    // version, not just this page's, so a record from an earlier page's version is never mistaken for an unknown one.
    if (before === null) {
      const unknown = host.authority.prepare(
          `SELECT count(*) AS records, count(DISTINCT book_id) AS books FROM evaluation_records
           WHERE profile_sha256 <> ?
             AND profile_sha256 NOT IN (SELECT json_extract(canonical_json, '$.profile.sha256') FROM evaluation_profile_versions
                                        WHERE json_extract(canonical_json, '$.profile.sha256') IS NOT NULL)`,
      ).get(evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE))!;
      if (Number(unknown.records) > 0) profiles.push({
        profileId: EVALUATION_PROFILE_UNKNOWN_ID, title: EVALUATION_PROFILE_UNKNOWN_TITLE, version: '—', issuer: '',
        total: 100, items: [], readiness: [], bands: BUILTIN_EVALUATION_PROFILE.bands, risks: BUILTIN_EVALUATION_PROFILE.risks,
        conclusions: BUILTIN_EVALUATION_PROFILE.conclusions, sha256: '',
        records: Number(unknown.records), books: Number(unknown.books),
      });
    }
    return { activeSha256: host.evaluationProfiles.current().sha256, nextBefore: page.nextBefore, profiles };
  });
}

export function saveEvaluationProfile(host: InitialEvaluationOperationsHost, input: SaveEvaluationProfileInput): EvaluationProfilesProjection {
  host.evaluationCall(() => host.transaction(host.authority, () => host.evaluationProfiles.save(input)));
  return host.inspectEvaluationProfiles();
}

export function inspectEvaluation(host: InitialEvaluationOperationsHost, bookId: string, recordId: string | null, recordsBefore?: number | null): EvaluationWorkspaceProjection {
  return internalWithEvaluationMaterials(host, host.evaluationCall(() => host.evaluations.workspace(bookId, host.evaluationBookTitle(bookId), recordId, recordsBefore)));
}

export function startEvaluation(host: InitialEvaluationOperationsHost, bookId: string, fromInitial = false, skipDamaged = false): EvaluationWorkspaceProjection {
  return host.evaluationCall(() => {
    const title = host.evaluationBookTitle(bookId);
    const recordId = host.transaction(host.authority, () => host.evaluations.start(bookId, fromInitial, skipDamaged));
    return internalWithEvaluationMaterials(host, host.evaluations.workspace(bookId, title, recordId));
  });
}

export function internalWithEvaluationMaterials(host: InitialEvaluationOperationsHost, page: EvaluationWorkspaceProjection): EvaluationWorkspaceProjection {
  // Only a plan not yet started can be refused for a reference that went away; a started one read it as it was.
  const frozenOf = (task: { taskIntentId: string; state: string } | null): { lines: string[]; blocked: boolean; materialIds: string[] } => {
    const frozen = task === null ? null : internalEvaluationMaterialPlan(host, task.taskIntentId);
    if (frozen === null) return { lines: [], blocked: false, materialIds: [] };
    const readings = host.taskMaterialReadings(frozen.boundary, '评估')
      .map((reading) => task!.state === 'prepared' ? reading : taskMaterialSettled(reading));
    return { lines: readings.map(taskMaterialReferenceLine), blocked: readings.some((reading) => reading.refusal !== null), materialIds: frozen.boundary.references.map((source) => source.materialId) };
  };
  const initial = frozenOf(page.initial.task);
  const readersReport = frozenOf(page.readersReport.task);
  return { ...page, materials: host.taskMaterialOffers(page.bookId, '评估'), materialReferences: {
    initial: initial.lines, readersReport: readersReport.lines, blocked: { initial: initial.blocked, readersReport: readersReport.blocked },
    initialInput: { materialIds: initial.materialIds, seriesId: page.initial.task === null ? null : host.initialEvaluationLedgerForBook(page.bookId).definition.seriesScopes?.[0]?.seriesId ?? null },
    readersReportInput: { materialIds: readersReport.materialIds },
  } };
}

export function internalEvaluationPlanMaterials(host: InitialEvaluationOperationsHost, ledger: BaselineAnalysisStore, bookId: string, authorized: boolean): ReadonlyArray<TaskMaterialReading> {
  const references = ledger.definition.materialReferences?.sources;
  if (references === undefined) return [];
  const readings = host.taskMaterialReadings({ bookId, references }, '评估');
  return authorized ? readings.map(taskMaterialSettled) : readings;
}

export function internalEvaluationMaterialPlan(host: InitialEvaluationOperationsHost, taskIntentId: string): { boundary: TaskMaterialBoundary; baseDigest: string; promptDigest: string } | null {
  const records = host.authority.prepare("SELECT component, canonical_json, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = (SELECT max(plan_version) FROM analysis_plan_records WHERE task_intent_id = ?) AND component IN ('execution-plan', 'plan-envelope')").all(taskIntentId, taskIntentId) as SqlRow[];
  const components = new Map(records.map((record) => {
    const json = asString(record.canonical_json);
    requireStore(sha256(json) === record.sha256, 'ANALYSIS_RECORD_INVALID', '任务计划记录与摘要不一致。');
    return [asString(record.component), JSON.parse(json) as Record<string, unknown>] as const;
  }));
  const execution = components.get('execution-plan');
  if (execution?.materialReferences === undefined) return null;
  const envelope = components.get('plan-envelope');
  const row = host.authority.prepare('SELECT book_id FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId) as SqlRow | undefined;
  requireStore(row !== undefined && typeof execution.materialReferenceBasePromptContractDigest === 'string' && DIGEST_PATTERN.test(execution.materialReferenceBasePromptContractDigest) &&
    typeof envelope?.promptContractDigest === 'string' && DIGEST_PATTERN.test(envelope.promptContractDigest), 'ANALYSIS_RECORD_INVALID', '任务参考资料的基础契约记录无效。');
  return { boundary: { bookId: asString(row.book_id), references: host.analysisCall(() => taskMaterialSources(execution.materialReferences)) },
    baseDigest: execution.materialReferenceBasePromptContractDigest, promptDigest: unwrappedPlanPromptDigest(execution, envelope) };
}

export function internalInitialBaseDefinition(host: InitialEvaluationOperationsHost, profile: EvaluationProfileProjection): AnalysisKindDefinition {
  const builtIn = host.initialEvaluation.definition;
  return profile.sha256 === evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) ? builtIn.clarificationBase ?? builtIn : initialEvaluationKindDefinition(profile);
}

export function internalInitialLedger(host: InitialEvaluationOperationsHost, profile: EvaluationProfileProjection, materials?: TaskMaterialBoundary, frozenPromptDigest?: string, scopes?: ReadonlyArray<FrozenSeriesScope>): BaselineAnalysisStore {
  const base = internalInitialBaseDefinition(host, profile);
  const readings = materials === undefined || materials.references.length === 0 ? [] : host.taskMaterialReadings(materials, '评估');
  if (scopes === undefined && readings.length === 0 && base === (host.initialEvaluation.definition.clarificationBase ?? host.initialEvaluation.definition)) return host.initialEvaluation;
  const material = readings.length === 0 ? base : host.analysisCall(() => taskMaterialKindDefinition(base, materials!, readings, scopes === undefined ? frozenPromptDigest : undefined));
  const definition = seriesScopeKindDefinition(host.authority, material, scopes);
  const make = (): BaselineAnalysisStore => {
    const ledger = new BaselineAnalysisStore(host.authority, host.boundedAuthority, host.control.baselineAnalysisRoute, definition);
    ledger.bindLaunch(host.initialEvaluation.launch);
    return ledger;
  };
  const seriesRule = scopes === undefined ? '' : sha256(canonicalJson(host.initialEvaluation.launch.policy?.providerProcessing.admittedRules ?? []));
  return readings.some((reading) => reading.refusal !== null) ? make() : host.initialEvaluationLedgers.obtain(`${definition.promptContractDigest}\n${canonicalJson(scopes ?? null)}\n${seriesRule}`, make);
}

export function internalInitialBaseDigest(host: InitialEvaluationOperationsHost, ledger: BaselineAnalysisStore): string {
  const definition = ledger.definition.clarificationBase ?? ledger.definition;
  return liveSeriesContract(definition)?.base.materialReferences?.basePromptContractDigest ?? liveSeriesContract(definition)?.base.promptContractDigest
    ?? definition.materialReferences?.basePromptContractDigest ?? definition.promptContractDigest;
}

export function internalInitialProfileForTask(host: InitialEvaluationOperationsHost, taskIntentId: string): EvaluationProfileProjection {
  const row = host.authority.prepare("SELECT component, canonical_json, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'plan-envelope' ORDER BY plan_version DESC LIMIT 1").get(taskIntentId) as SqlRow | undefined;
  if (row === undefined) {
    const pin = host.authority.prepare('SELECT prompt_contract_sha256 FROM initial_evaluation_tasks WHERE task_intent_id = ? ORDER BY rowid DESC LIMIT 1').get(taskIntentId);
    return pin === undefined ? host.evaluationProfiles.current() : host.evaluationProfiles.taskProfile(taskIntentId, asString(pin.prompt_contract_sha256))!;
  }
  requireStore(sha256(asString(row.canonical_json)) === row.sha256, 'EVALUATION_PROFILE_DAMAGED', '初评任务计划已损坏。');
  const envelope = parseStoredJson(asString(row.canonical_json), '初评任务计划已损坏。');
  requireStore(isRecord(envelope) && typeof envelope.promptContractDigest === 'string', 'EVALUATION_PROFILE_DAMAGED', '初评任务方案快照缺失。');
  const scope = frozenSeriesScopes(host.authority, taskIntentId);
  const baseDigest = internalEvaluationMaterialPlan(host, taskIntentId)?.baseDigest ?? (scope === undefined ? editorialMemoryBasePromptDigest(envelope) :
    asString(host.authority.prepare('SELECT prompt_contract_sha256 FROM initial_evaluation_tasks WHERE task_intent_id = ? ORDER BY rowid DESC LIMIT 1').get(taskIntentId)!.prompt_contract_sha256));
  const snapshot = host.evaluationProfiles.taskProfile(taskIntentId, baseDigest);
  if (snapshot !== null) return snapshot;
  requireStore(baseDigest === host.initialEvaluation.definition.promptContractDigest, 'EVALUATION_PROFILE_DAMAGED', '初评任务方案快照缺失。');
  return { ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) };
}

export function internalInitialLedgerForTask(host: InitialEvaluationOperationsHost, taskIntentId: string): BaselineAnalysisStore {
  const profile = internalInitialProfileForTask(host, taskIntentId);
  const frozen = internalEvaluationMaterialPlan(host, taskIntentId);
  if (frozen !== null) {
    requireStore(frozen.baseDigest === internalInitialBaseDefinition(host, profile).promptContractDigest, 'ANALYSIS_RECORD_INVALID', '初评参考资料的基础契约与计划不一致。');
  }
  return internalInitialLedger(host, profile, frozen?.boundary, frozen?.promptDigest, frozenSeriesScopes(host.authority, taskIntentId));
}

export function initialEvaluationLedgerForBook(host: InitialEvaluationOperationsHost, bookId: string, materials?: TaskMaterialBoundary): BaselineAnalysisStore {
  if (materials !== undefined) return internalInitialLedger(host, host.evaluationProfiles.current(), materials);
  const row = host.authority.prepare("SELECT task_intent_id FROM analysis_task_intents WHERE book_id = ? AND kind = 'evaluation' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(bookId) as SqlRow | undefined;
  return row === undefined ? internalInitialLedger(host, host.evaluationProfiles.current()) : internalInitialLedgerForTask(host, asString(row.task_intent_id));
}

export function initialEvaluationLedgerForRun(host: InitialEvaluationOperationsHost, runRecordId: string): BaselineAnalysisStore {
  host.assertAvailable();
  const row = host.authority.prepare("SELECT r.task_intent_id FROM analysis_run_records r JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id WHERE r.run_record_id = ? AND t.kind = 'evaluation'").get(runRecordId);
  requireStore(row !== undefined, 'TASK_PLAN_NOT_CURRENT', TASK_PLAN_NOT_CURRENT_REASON);
  return internalInitialLedgerForTask(host, asString(row.task_intent_id));
}

export function internalSnapshotInitialPreparation(host: InitialEvaluationOperationsHost, result: AnalysisPreparationResult<AnalysisProjection>, profile: EvaluationProfileProjection, ledger: BaselineAnalysisStore): void {
  const projection = result.projection;
  if (result.done && projection?.taskIntent !== null && projection?.taskIntent !== undefined && projection.planEnvelope !== null) {
    host.evaluationCall(() => host.transaction(host.authority, () => host.evaluationProfiles.snapshotTask(projection.taskIntent!.taskIntentId, internalInitialBaseDigest(host, ledger), profile)));
  }
  if (result.workId !== null) host.initialEvaluationWork.set(result.workId, { ledger, profile });
}

export function inspectInitialEvaluation(host: InitialEvaluationOperationsHost, bookId: string, progress?: ProgressReader, revisionId: string | null = null): InitialEvaluationProjection {
  const projection = host.analysisCall(() => host.initialEvaluationLedgerForBook(bookId).inspect(bookId, progress, revisionId)) as InitialEvaluationProjection;
  const scopes = projection.runSourceScope?.seriesScopes;
  if (scopes !== undefined && projection.taskIntent !== null && (projection.run?.state === 'completed' || projection.run?.state === 'completed-with-gaps') &&
      seriesScopeChanged(host.authority, scopes, projection.taskIntent.createdAt) !== null) return { ...projection, historicalMarker: HISTORICALLY_AFFECTED_RESULT_MARKER };
  return projection;
}

export function createInitialEvaluationPreparationWork(host: InitialEvaluationOperationsHost, bookId: string, launchPolicy: LaunchPolicyProjection, materialIds: ReadonlyArray<string> = [], redoOf: string | null = null, seriesId: string | null = null): AnalysisPreparationResult<InitialEvaluationProjection> {
  requireStore(seriesId === null || seriesKnowledgeAllowed(launchPolicy, INITIAL_EVALUATION_KIND), 'SERIES_SCOPE_UNAVAILABLE', SERIES_POLICY_CLOSED);
  const scopes = seriesId === null ? undefined : [freezeSeriesScope(host.authority, bookId, seriesId)];
  internalRequireEvaluationMaterialScope(host, materialIds.length > 0, INITIAL_EVALUATION_KIND);
  internalRequireInitialEvaluationScope(host);
  const current = host.inspectInitialEvaluation(bookId);
  // One reading of the house profile gives both the contract the Task is prepared under and the snapshot it keeps (Issue #427).
  const profile = host.evaluationProfiles.current();
  const ledger = internalInitialLedger(host, profile, { bookId, references: host.prepareTaskMaterials(bookId, materialIds) }, undefined, scopes);
  const mode = current.resultSetRevision === null ? 'evaluation-first' : 'evaluation-again';
  const result = host.analysisCall(() => ledger.prepare({
    phase: 'start',
    bookId,
    goal: INITIAL_EVALUATION_MODE_GOALS[mode],
    redoOf,
    update: mode === 'evaluation-first' ? null : { mode, selectedRange: null },
    reconfirm: false,
    launchPolicy,
    ...(canonicalJson(host.initialEvaluationLedgerForBook(bookId).definition.materialReferences?.sources ?? []) === canonicalJson(ledger.definition.materialReferences?.sources ?? []) ? {} : { newTask: true }),
  }));
  // The snapshot pins the Task the preparation returned, inside `#snapshotInitialPreparation`, never a separate
  // "latest evaluation Task" query (Issue #798, P3-2): that query could pin an unrelated earlier row.
  internalSnapshotInitialPreparation(host, result, profile, ledger);
  return { ...result, projection: result.projection as InitialEvaluationProjection | null };
}

export function advanceInitialEvaluationPreparationWork(host: InitialEvaluationOperationsHost, workId: string): AnalysisPreparationResult<InitialEvaluationProjection> {
  const work = host.initialEvaluationWork.get(workId);
  requireStore(work !== undefined, 'ANALYSIS_PREPARATION_NOT_FOUND', '初评计划准备已不存在。');
  const result = host.analysisCall(() => work.ledger.prepare({ phase: 'advance', workId }));
  internalSnapshotInitialPreparation(host, result, work.profile, work.ledger);
  if (result.done) host.initialEvaluationWork.delete(workId);
  return { ...result, projection: result.projection as InitialEvaluationProjection | null };
}

export function cancelInitialEvaluationPreparationWork(host: InitialEvaluationOperationsHost, workId: string): boolean {
  // As the reader's report's: a preparation already settled or let go has nothing left to cancel.
  const work = host.initialEvaluationWork.get(workId);
  if (work === undefined) return false;
  host.analysisCall(() => work.ledger.prepare({ phase: 'cancel', workId }));
  host.initialEvaluationWork.delete(workId);
  return true;
}

export function authorizeInitialEvaluation(host: InitialEvaluationOperationsHost, bookId: string, taskIntentId: string, planEnvelopeDigest: string, start: 'now' | 'when-online' | 'idle' = 'now'): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } {
  host.requireLedgerKindScope('initial-evaluation', bookId, taskIntentId);
  const ledger = host.ledgerTaskOf('initial-evaluation', bookId, taskIntentId);
  const scopes = ledger.definition.seriesScopes;
  if (scopes !== undefined) {
    requireStore(canonicalJson(scopes) === canonicalJson(scopes.map((scope) => freezeSeriesScope(host.authority, bookId, scope.seriesId))),
        'SERIES_SCOPE_CHANGED', '书系参考范围已变化；请重新准备计划。');
  }
  const authorized = host.analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest, start));
  return { dispatchRunRecordId: authorized.dispatchRunRecordId, ledger };
}

export function internalRequireEvaluationMaterialScope(host: InitialEvaluationOperationsHost, hasReferences: boolean, kind: string): void {
  const launch = host.baselineAnalysis.launch;
  if (hasReferences && launch.live !== null && liveMaterialRule(launch.policy, kind) === null) throw new StoreError('TASK_MATERIAL_UNAVAILABLE', TASK_MATERIAL_LIVE_UNAVAILABLE);
}

export function internalRequireEvaluationMaterialReadings(host: InitialEvaluationOperationsHost, ledger: BaselineAnalysisStore, bookId: string): void {
  const sources = ledger.definition.materialReferences?.sources;
  if (sources === undefined) return;
  const refusal = host.taskMaterialReadings({ bookId, references: sources }, '评估').find((reading) => reading.refusal !== null)?.refusal;
  if (refusal !== undefined) throw new StoreError(refusal.code, refusal.message);
}

export function internalRequireInitialEvaluationScope(host: InitialEvaluationOperationsHost): void {
  host.assertAvailable();
  if (internalEvaluationLiveRefused(host, INITIAL_EVALUATION_KIND)) throw new StoreError('EVALUATION_INITIAL_UNAVAILABLE', INITIAL_EVALUATION_LIVE_UNAVAILABLE);
}

export function internalEvaluationLiveRefused(host: InitialEvaluationOperationsHost, kind: typeof INITIAL_EVALUATION_KIND | typeof READERS_REPORT_KIND | typeof EVALUATION_REWRITE_KIND): boolean {
  // 初评's ledgers take the launch the built-in profile's ledger is bound through; 审稿意见's and the rewrite's, the baseline's.
  const launch = kind === INITIAL_EVALUATION_KIND ? host.initialEvaluation.launch : host.baselineAnalysis.launch;
  return launch.live !== null && liveKindRule(launch.policy, kind, EVALUATION_PAYLOAD_CATEGORIES[kind]) === null;
}

export function internalInitialEvaluationFacts(host: InitialEvaluationOperationsHost, bookId: string): InitialEvaluationFacts | null {
  let projection: InitialEvaluationProjection;
  try {
    projection = host.inspectInitialEvaluation(bookId);
  } catch (error) {
    if (error instanceof AnalysisError || error instanceof StoreError) return null;
    throw error;
  }
  const revision = projection.resultSetRevision;
  if (revision === null) return null;
  const evaluation = revision.evaluation;
  const items = evaluation.items.map((item) => ({
    itemId: item.itemId, score: item.score, comment: item.comment, sufficiency: item.sufficiency, citedBlocks: item.citedBlocks, unitsCited: item.unitsCited,
    // AI7's evidence for the item (EVAL-006), kept with the draft a version begins from so the record shows what each score rests on.
    evidence: item.observations.map((observation) => ({ unitOrdinal: observation.unitOrdinal, note: observation.note, blockIds: [...observation.blockIds] })),
  }));
  return {
    draft: {
      revisionId: revision.revisionId,
      ordinal: revision.ordinal,
      revisionLabel: revision.manuscriptPin.revisionLabel,
      createdAt: revision.createdAt,
      items,
      strengths: [...evaluation.strengths],
      weaknesses: [...evaluation.weaknesses],
      nextStep: evaluation.nextStep,
      suggestedConclusion: evaluation.suggestedConclusion,
      complete: evaluation.synthesis.state === 'closed' && items.every((item) => item.score !== null),
      // A 初评 that completed with gaps scored without these ranges; every version begun from it says so.
      unitsTotal: revision.coverage.unitsTotal,
      unreadUnits: [...new Set(revision.gaps.map((gap) => gap.unitOrdinal))].sort((left, right) => left - right),
      // AI7's market section (S81b2; EVAL-009), snapshotted with the draft like everything AI7 wrote.
      market: evaluation.market,
    },
    manuscriptRevisionId: revision.manuscriptPin.revisionId,
    current: revision.freshness.state === 'current',
    profileSha256: evaluation.profile.sha256,
    profile: internalInitialProfileForTask(host, asString(host.authority.prepare('SELECT task_intent_id FROM analysis_result_set_revisions WHERE revision_id = ?').get(revision.revisionId)!.task_intent_id)),
  };
}

export function internalInitialEvaluationTask(host: InitialEvaluationOperationsHost, bookId: string): Pick<EvaluationInitialProjection, 'task' | 'prepare'> {
  let projection: InitialEvaluationProjection;
  try {
    projection = host.inspectInitialEvaluation(bookId);
  } catch (error) {
    if (error instanceof AnalysisError || error instanceof StoreError) return { task: null, prepare: { allowed: false, reason: `AI7 初评暂不可用：${error.message}` } };
    throw error;
  }
  const runState = projection.run?.state ?? null;
  return {
    task: projection.taskIntent === null ? null : { taskIntentId: projection.taskIntent.taskIntentId, state: projection.state, label: analysisTaskStateLabel(projection),
      ...(projection.historicalMarker === undefined ? {} : { historicalMarker: projection.historicalMarker }) },
    prepare: internalEvaluationLiveRefused(host, INITIAL_EVALUATION_KIND)
      ? { allowed: false, reason: INITIAL_EVALUATION_LIVE_UNAVAILABLE }
      : runIsActive(runState)
      ? { allowed: false, reason: activeRunReason(runState, INITIAL_EVALUATION_KIND) }
      : { allowed: true, mode: projection.resultSetRevision === null ? 'evaluation-first' : 'evaluation-again' },
  };
}
