import type { CheckpointOwner } from '../analysis/baseline-analysis-types.js';
import type { FactualVerificationLedger } from '../factual-verification.js';
import type { EditorialMemoryFacade } from '../learning/memory-facade.js';
import { withModelClarification } from '../provider/clarification-contract.js';
import { runSynthesisKind } from './run-synthesis-kind.js';
import { launchFromSnapshot, TaskLaunchError } from '../task-launch-snapshots.js';
import type { RuntimeExecutionConfig } from '../../shared/runtime-execution-config.js';
import { type HouseReviewPreferenceUse, isReviewCategoryKindId, type CoverageManifestProjection, type InspectTaskPlanInput, type TaskPlanProjection, type ManuscriptExportReviewProjection, type ReviewManuscriptExportInput, type LaunchPolicyProjection, type DefaultExecutionRuleBinding, type TaskPlanDefaultRuleProjection, type ReviewCategoryGoal, type ReviewCategoryProjection, type ReviewCategoryTaskRequest, type ReviewFindingPageRequest, type ReviewRunScopeRequest, type ReviewWorkspaceProjection, MAX_WRITING_MATERIALS } from '../../shared/protocol.js';
import { AnalysisError, BaselineAnalysisStore, type AnalysisPreparationResult, type ProgressReader, type ResendPlan } from '../analysis/baseline-analysis-store.js';
import { reviewRunConclusions, reviewRunEvidence, ReviewRunStore, type ReviewRunPlanFacts, type ReviewRunPreparationProgress } from './review-runs.js';
import { canonicalRecord } from '../analysis/canonical.js';
import { resolveSourceCheckoutLaunchPolicySync, type ConfiguredProviderBinding } from '../launch-policy.js';
import { houseReviewPreferenceKindDefinition } from '../house-review-preference.js';
import { TASK_MATERIAL_LIVE_UNAVAILABLE, REVIEW_MATERIAL_CATEGORY_REQUIRED, taskMaterialKindDefinition, taskMaterialSources, type TaskMaterialBoundary, type TaskMaterialReading, type TaskMaterialSource } from '../task-material-references.js';
import type { DatabaseSync } from 'node:sqlite';
import { StoreError, StoreFatalError, UUID_PATTERN, asString, canonicalJson, requireStore, sha256, type SqlRow } from '../store-records.js';
import { liveKindRule, kindLocalTools } from '../analysis/live-kind-admission.js';
import { type AnalysisKindDefinition } from '../analysis/kind-definition.js';
import { frozenSeriesScopes, seriesScopeKindDefinition, seriesConsistencyKindDefinition, procedureOffersSeries } from './series-consistency.js';
import { type TaskPlanConnectivity } from '../connectivity.js';
import type { RecentCache } from '../recent-cache.js';
import { defaultRuleBindingRows, categoryResendDisclosure } from '../task-plan.js';
import type { ManuscriptExportStore } from '../manuscript-export.js';
import { DefaultExecutionRuleLedger, QUICK_START_NOT_READY, QUICK_START_OFFLINE, QUICK_START_PLAN_CHANGED, QUICK_START_RULE_CHANGED, SET_RULE_BUDGET, SET_RULE_CHANGED, SET_RULE_EDITED, defaultExecutionRuleBindingOf, defaultExecutionRuleCovers, reviewRulePattern, defaultExecutionRuleReference, quickStartNoRuleReason, setRuleAlreadyReason } from '../default-execution-rules.js';
import { type ManuscriptReader } from '../factual-verification.js';
import { reviewCategoryContractInput, type ReviewCategoryConfigurationEntry } from './category-configuration.js';
import * as capturedProcedureOperations from '../captured-procedures.js';
import type { ReviewRunDriveSteps } from './review-run-driver.js';
import { historicalReviewCategoryDefinitions, reviewCategoryKindDefinition, withReviewLocalTools } from './review-category-kind.js';
import { type DraftPromotion, type StoreControl, unwrappedPlanPromptDigest } from '../store-operation-support.js';
import type { ReviewEvidenceReader } from './report-evidence.js';
import type { LaunchChoice } from '../task-launch-snapshots.js';

/** Live dependencies owned by EditorialStore; this module owns no connections or caches. */
export interface ReviewOperationsHost extends ReviewEvidenceReader {
  readonly authority: DatabaseSync;
  readonly boundedAuthority: CheckpointOwner;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly factualReview: BaselineAnalysisStore;
  readonly control: StoreControl;
  readonly codeRoot: string;
  readonly reviewRuns: ReviewRunStore;
  readonly reviewCategoryLedgers: RecentCache<BaselineAnalysisStore>;
  readonly reviewCategoryDefinitions: RecentCache<AnalysisKindDefinition>;
  readonly factualVerification: FactualVerificationLedger;
  readonly capturedProcedureHost: capturedProcedureOperations.CapturedProcedureStoreHost;
  readonly rules: DefaultExecutionRuleLedger;
  readonly manuscriptExport: ManuscriptExportStore;
  assertAvailable(): void;
  analysisCall<T>(operation: () => T): T;
  reviewCall<T>(operation: () => T): T;
  verificationCall<T>(operation: () => T): T;
  ruleCall<T>(operation: () => T): T;
  exportCall<T>(operation: () => Promise<T>): Promise<T>;
  transaction<T>(db: DatabaseSync, operation: () => T): T;
  memoryFacade(): EditorialMemoryFacade;
  taskMaterialReadings(boundary: TaskMaterialBoundary, surface?: '审阅' | '评估'): ReadonlyArray<TaskMaterialReading>;
  prepareTaskMaterials(bookId: string, materialIds: ReadonlyArray<string>): ReadonlyArray<TaskMaterialSource>;
  resultBinding(bookId: string, resultId: string): { reader: ManuscriptReader };
  launchChoice(role: 'main-editorial' | 'fast-interaction', override: RuntimeExecutionConfig, remembered?: boolean): LaunchChoice;
  executionLedgerForRun(runRecordId: string): BaselineAnalysisStore;
  materializeFactualVerification(reviewRunId: string): void;
  inspectTaskPlanWithConnection(input: InspectTaskPlanInput, credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>, connectivity: TaskPlanConnectivity, progress?: ProgressReader): Promise<TaskPlanProjection>;
}

/**
 * The append-only ledger of one Review Category: the same ledger class over the same Book database,
 * constructed with that category's kind definition. A category is configuration, so its definition
 * is built by the caller (`reviewCategoryKindDefinition`) and its ledger is made when first asked
 * for rather than at open. It is kept per kind *and* frozen category contract: a ledger holds the
 * preparations in flight, so the same definition must keep finding the same ledger, and a category
 * whose clauses changed is a different contract that must not inherit them. Only the
 * `REVIEW_CATEGORY_CACHE_CAPACITY` most recently used are kept besides those with a preparation in
 * flight (Issue #649); everything else a ledger knows is in the Book database, so one made afresh
 * reads exactly what the one let go would have.
 *
 * The ledger takes the route and the launch the baseline ledger was bound to, so every plan it
 * freezes names the binding this launch actually bound — which the one execution owner then checks.
 */
export function reviewCategoryLedger(host: ReviewOperationsHost, definition: AnalysisKindDefinition, cached = true): BaselineAnalysisStore {
  host.assertAvailable();
  requireStore(isReviewCategoryKindId(definition.kind), 'REVIEW_CATEGORY_INVALID', '该分析种类不是审阅类别。');
  const make = (): BaselineAnalysisStore => {
    const ledger = new BaselineAnalysisStore(host.authority, host.boundedAuthority, host.control.baselineAnalysisRoute, definition);
    ledger.bindLaunch(host.baselineAnalysis.launch);
    return ledger;
  };
  const seriesRule = definition.seriesScopes === undefined ? '' : sha256(canonicalJson(host.baselineAnalysis.launch.policy?.providerProcessing.admittedRules ?? []));
  return cached ? host.reviewCategoryLedgers.obtain(`${definition.kind}\n${definition.promptContractDigest}\n${canonicalJson(definition.seriesScopes ?? null)}\n${seriesRule}\n${definition.structuredInputKey ?? ''}\n${canonicalJson(definition.inheritedBudgetCeiling ?? null)}`, make) : make();
}

/** One category's Task, latest Result Set Revision, history and update controls; `revisionId` opens one exact revision read-only. */
export function inspectReviewCategory(host: ReviewOperationsHost,
  bookId: string,
  definition: AnalysisKindDefinition,
  progress?: ProgressReader,
  revisionId: string | null = null,
): ReviewCategoryProjection {
  const ledger = reviewCategoryLedger(host, definition);
  return host.analysisCall(() => ledger.inspect(bookId, progress, revisionId)) as ReviewCategoryProjection;
}

/**
 * Prepare one category's Task in the requested mode. The goal is the definition's own fixed text for
 * that mode, so a caller names what it wants reviewed and never restates the sentence. `review-first`
 * is the whole first review; every other mode is named to the ledger, the range-bound first mode
 * included.
 */
export function createReviewCategoryPreparationWork(host: ReviewOperationsHost,
  bookId: string,
  definition: AnalysisKindDefinition,
  request: ReviewCategoryTaskRequest,
  launchPolicy: LaunchPolicyProjection,
  reconfirm = false,
): AnalysisPreparationResult<ReviewCategoryProjection> {
  const ledger = reviewCategoryLedger(host, definition);
  const result = host.analysisCall(() => ledger.prepare({
    phase: 'start',
    bookId,
    goal: definition.mode(request.mode).goal as ReviewCategoryGoal,
    update: request.mode === definition.initialMode ? null : { mode: request.mode, selectedRange: request.selectedRange },
    reconfirm,
    launchPolicy,
  }));
  return { ...result, projection: result.projection as ReviewCategoryProjection | null };
}

export function advanceReviewCategoryPreparationWork(host: ReviewOperationsHost, definition: AnalysisKindDefinition, workId: string): AnalysisPreparationResult<ReviewCategoryProjection> {
  const ledger = reviewCategoryLedger(host, definition);
  const result = host.analysisCall(() => ledger.prepare({ phase: 'advance', workId }));
  return { ...result, projection: result.projection as ReviewCategoryProjection | null };
}

export function cancelReviewCategoryPreparationWork(host: ReviewOperationsHost, definition: AnalysisKindDefinition, workId: string): boolean {
  const ledger = reviewCategoryLedger(host, definition);
  host.analysisCall(() => ledger.prepare({ phase: 'cancel', workId }));
  return true;
}

/** Records the standard-direct authorization and the Run; the caller hands the Run and this category's ledger to the execution owner. */
export function authorizeReviewCategory(host: ReviewOperationsHost,
  bookId: string,
  definition: AnalysisKindDefinition,
  taskIntentId: string,
  planEnvelopeDigest: string,
): { projection: ReviewCategoryProjection; dispatchRunRecordId: string | null } {
  const ledger = reviewCategoryLedger(host, definition);
  const authorized = host.analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest));
  return { projection: authorized.projection as ReviewCategoryProjection, dispatchRunRecordId: authorized.dispatchRunRecordId };
}

/**
 * The ledger a Task-backed category of a Review Run executes on: the factual kind's for 事实核查, and
 * otherwise the category's own, built from the configuration entry the Run snapshotted — so a Run keeps
 * finding the ledger of the exact contract it prepared under.
 */
export function reviewLedgerOf(host: ReviewOperationsHost, entry: ReviewCategoryConfigurationEntry, materials?: TaskMaterialBoundary, frozenPromptDigest?: string, latestForBook?: string, preference?: HouseReviewPreferenceUse | null, frozenVersion?: 1 | 2): BaselineAnalysisStore {
  if (entry.executor === 'factual-review-kind') return host.factualReview;
  requireStore(entry.executor === 'review-category-contract', 'REVIEW_CATEGORY_NOT_TASK_BACKED', '这一类没有自己的任务账本。');
  const input = reviewCategoryContractInput(entry);
  const contractVersion = frozenVersion ?? host.control.baselineAnalysisRoute?.reviewContractVersion ?? 2;
  const base = entry.synthesisKey === undefined
    ? host.reviewCategoryDefinitions.obtain(JSON.stringify([input, contractVersion]), () => host.analysisCall(() => reviewCategoryKindDefinition(input, contractVersion)))
    : runSynthesisKind(host.authority, entry.synthesisKey, entry.synthesisSource, contractVersion);
  const toolBase = frozenPromptDigest === undefined ? withReviewLocalTools(base, kindLocalTools(host.baselineAnalysis.launch.policy, base.kind)) : base;
  let scopes = entry.seriesScopes;
  const finish = (definition: AnalysisKindDefinition): AnalysisKindDefinition => scopes === undefined ? definition
    : entry.seriesKnowledge === undefined ? seriesScopeKindDefinition(host.authority, definition, scopes) : definition;
  if (materials === undefined && latestForBook !== undefined) {
    const row = host.authority.prepare("SELECT task_intent_id FROM analysis_task_intents WHERE book_id = ? AND kind = ? ORDER BY rowid DESC LIMIT 1").get(latestForBook, base.kind) as SqlRow | undefined;
    if (row !== undefined) {
      // Current consistency availability is derived from today's knowledge. Its historical Run reconstructs from its
      // snapshot entry instead; mixing today's definition with a prior Run's pins would falsely make a saved step unavailable.
      if (entry.seriesKnowledge === undefined) scopes ??= frozenSeriesScopes(host.authority, asString(row.task_intent_id));
      preference = host.memoryFacade().pinned(asString(row.task_intent_id));
      const records = host.authority.prepare("SELECT component, canonical_json, sha256 FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = (SELECT max(plan_version) FROM analysis_plan_records WHERE task_intent_id = ?) AND component IN ('execution-plan', 'plan-envelope')").all(asString(row.task_intent_id), asString(row.task_intent_id)) as SqlRow[];
      const components = new Map(records.map((record) => {
        const json = asString(record.canonical_json);
        requireStore(sha256(json) === record.sha256, 'ANALYSIS_RECORD_INVALID', '任务计划记录与摘要不一致。');
        return [asString(record.component), JSON.parse(json) as Record<string, unknown>] as const;
      }));
      const pins = components.get('execution-plan')?.materialReferences;
      if (pins !== undefined) {
        const frozenBase = components.get('execution-plan')!.materialReferenceBasePromptContractDigest;
        requireStore(typeof frozenBase === 'string' && /^[0-9a-f]{64}$/u.test(frozenBase), 'ANALYSIS_RECORD_INVALID', '任务参考资料的基础契约记录无效。');
        // A new guideline version is a new current kind contract, not corruption of the previous Task's pins.
        // Its ordinary ledger projection already knows how to offer a fresh preparation under that contract.
        if (frozenBase !== base.promptContractDigest && frozenBase !== toolBase.promptContractDigest &&
            !historicalReviewCategoryDefinitions(input, contractVersion).some((candidate) => candidate.promptContractDigest === frozenBase)) return reviewCategoryLedger(host, base);
        materials = { bookId: latestForBook, references: host.analysisCall(() => taskMaterialSources(pins)) };
        const envelope = components.get('plan-envelope');
        requireStore(envelope !== undefined, 'ANALYSIS_RECORD_INVALID', '任务计划记录不完整。');
        frozenPromptDigest = unwrappedPlanPromptDigest(components.get('execution-plan')!, envelope);
      }
    }
  }
  const readings = materials === undefined ? [] : host.taskMaterialReadings(materials);
  // The frozen digest is the outermost contract's. A readable pin re-derives the material contract and wraps it again, which
  // must give that digest; an unreadable one is the material wrapper's own blocked definition under it, and never sends.
  const refused = readings.some((reading) => reading.refusal !== null);
  const wrap = (candidate: AnalysisKindDefinition): AnalysisKindDefinition => {
    const series = entry.seriesKnowledge !== undefined && scopes !== undefined ? seriesConsistencyKindDefinition(host.authority, candidate, scopes) : candidate;
    const material = materials === undefined ? series : host.analysisCall(() => taskMaterialKindDefinition(series, materials, readings,
      refused && scopes === undefined ? frozenPromptDigest : undefined));
    return finish(refused ? material : houseReviewPreferenceKindDefinition(material, preference ?? null, true));
  };
  let definition: AnalysisKindDefinition;
  let prior: AnalysisKindDefinition;
  if (frozenPromptDigest === undefined) {
    definition = wrap(toolBase);
    prior = toolBase.promptContractDigest === base.promptContractDigest ? definition : wrap(base);
  } else {
    const candidates: AnalysisKindDefinition[] = [];
    for (const historical of entry.synthesisKey === undefined ? historicalReviewCategoryDefinitions(input, contractVersion) : [base]) {
      try { candidates.push(wrap(historical)); }
      catch (error) {
        // Series consistency accepts only its own supported base; another historical form gains no proof.
        if (!(error instanceof AnalysisError && error.code === 'SERIES_SCOPE_INVALID')) throw error;
      }
    }
    const matched = candidates.find((candidate) => candidate.promptContractDigest === frozenPromptDigest);
    requireStore(matched !== undefined, materials === undefined ? 'ANALYSIS_RECORD_INVALID' :
      preference == null ? 'TASK_MATERIAL_RECORD_INVALID' : 'HOUSE_REVIEW_PREFERENCE_INVALID', '固定提示契约与任务计划不一致。');
    definition = matched;
    prior = candidates[0]!;
  }
  requireStore(materials === undefined || scopes !== undefined || frozenPromptDigest === undefined || refused || definition.promptContractDigest === frozenPromptDigest,
    preference == null ? 'TASK_MATERIAL_RECORD_INVALID' : 'HOUSE_REVIEW_PREFERENCE_INVALID', '固定提示契约与任务计划不一致。');
  if (definition !== prior) Object.assign(definition, { toolPromptPredecessor: prior });
  Object.assign(definition, { historicalDefinitionForDigest: (digest: string): AnalysisKindDefinition | null => {
    const row = host.authority.prepare(`SELECT r.canonical_json, r.sha256, member.value category, t.contract_version,
        p.canonical_json envelope_json, p.sha256 envelope_digest, x.canonical_json execution_json, x.sha256 execution_digest FROM review_runs r
        JOIN json_each(r.canonical_json, '$.categories') member
        JOIN analysis_task_intents t ON t.task_intent_id=json_extract(member.value, '$.task.taskIntentId')
        JOIN analysis_plan_records p ON p.task_intent_id=t.task_intent_id AND p.component='plan-envelope'
        JOIN analysis_plan_records x ON x.task_intent_id=t.task_intent_id AND x.plan_version=p.plan_version AND x.component='execution-plan'
        WHERE t.kind=? AND COALESCE(json_extract(p.canonical_json, '$.basePromptContractDigest'),
          json_extract(p.canonical_json, '$.editorialMemoryBasePromptContractDigest'),json_extract(p.canonical_json, '$.promptContractDigest'))=?
        ORDER BY r.ordinal DESC LIMIT 1`).get(definition.kind, digest);
    if (row === undefined) return null;
    requireStore(sha256(String(row.canonical_json)) === row.sha256 && sha256(String(row.envelope_json)) === row.envelope_digest && sha256(String(row.execution_json)) === row.execution_digest,
      'ANALYSIS_RECORD_INVALID', '任务计划记录与摘要不一致。');
    const snapshot = JSON.parse(String(row.canonical_json)) as { materialReferences?: TaskMaterialBoundary };
    const category = JSON.parse(String(row.category)) as { entry: ReviewCategoryConfigurationEntry; task: { taskIntentId: string } };
    if (category.entry.executor !== 'review-category-contract') return null;
    const use = host.memoryFacade().pinned(category.task.taskIntentId);
    const baseDigest = unwrappedPlanPromptDigest(JSON.parse(String(row.execution_json)), JSON.parse(String(row.envelope_json)));
    const historical = reviewLedgerOf(host, category.entry, snapshot.materialReferences, baseDigest, undefined, use,
      row.contract_version === 'ai7.editorial-review/1' ? 1 : 2).definition;
    const base = historical.clarificationBase ?? historical;
    return [historical, base, withModelClarification(base)].find(candidate => candidate.promptContractDigest === digest) ?? null;
  } });
  // A pin unreadable now gives a definition that cannot build requests, under the frozen contract's own key: it is never
  // cached, so the same plan runs once the pin reads again, and a cached readable ledger never outlives its pin.
  return reviewCategoryLedger(host, definition, readings.every((reading) => reading.refusal === null));
}

export function inspectReviewWorkspace(host: ReviewOperationsHost, bookId: string, reviewRunId: string | null, progress?: ProgressReader, page?: ReviewFindingPageRequest, executionConfig?: RuntimeExecutionConfig): ReviewWorkspaceProjection {
  return host.reviewCall(() => {
    if (executionConfig === undefined || Object.keys(executionConfig).length === 0) return host.reviewRuns.workspace(bookId, reviewRunId, progress, page);
    const choice = host.launchChoice('main-editorial', executionConfig);
    const policy = choice.binding !== null && host.baselineAnalysis.launch.operationalScope === 'ordinary-production'
      ? resolveSourceCheckoutLaunchPolicySync(host.codeRoot, 'ordinary-production', choice.binding) : host.baselineAnalysis.launch.policy!;
    const execution = host.baselineAnalysis.withExecutionChoice(choice.binding, policy).launch;
    return host.reviewRuns.workspace(bookId, reviewRunId, progress, page, execution);
  });
}

/**
 * Prepare a Review Run as one cooperative job (B1): each selected Task-backed category's Task on its
 * own ledger, one per step, then the Run itself. The projection is the workspace with the new Run open.
 */
export function createReviewRunPreparationWork(host: ReviewOperationsHost,
  bookId: string,
  categoryIds: ReadonlyArray<string>,
  scope: ReviewRunScopeRequest,
  launchPolicy: LaunchPolicyProjection,
  // The Captured Procedure version the sheet was pre-filled from (Issue #65, S30; ADR 0087 §4): pinned by the Run.
  capturedProcedure: { versionId: string; documentSha256: string } | null = null,
  materialIds: ReadonlyArray<string> = [],
  redoOf: string | null = null,
  // 准备计划 on a Task Intent Draft (Issue #423, slice 7a): the draft the one category's Run is prepared from.
  intentDraft: DraftPromotion | null = null,
  seriesId: string | null = null,
  localCheck?: import('../../shared/protocol/procedures.js').LocalCheckOptions,
  decisionId?: string, procedureDefinition: import('../../shared/protocol/procedures.js').ProcedureDefinitionPin | null = null,
): AnalysisPreparationResult<ReviewWorkspaceProjection> {
  return reviewPreparation(host, () => host.reviewRuns.prepare(reviewRunRequest(host, bookId, categoryIds, scope, launchPolicy, capturedProcedure, materialIds, redoOf, intentDraft, seriesId, localCheck, decisionId, procedureDefinition)));
}

export function reviewRunRequest(host: ReviewOperationsHost,
  bookId: string,
  categoryIds: ReadonlyArray<string>,
  scope: ReviewRunScopeRequest,
  launchPolicy: LaunchPolicyProjection,
  // The Captured Procedure version the sheet was pre-filled from (Issue #65, S30; ADR 0087 §4): pinned by the Run.
  capturedProcedure: { versionId: string; documentSha256: string } | null = null,
  materialIds: ReadonlyArray<string> = [],
  redoOf: string | null = null,
  // 准备计划 on a Task Intent Draft (Issue #423, slice 7a): the draft the one category's Run is prepared from.
  intentDraft: DraftPromotion | null = null,
  seriesId: string | null = null,
  localCheck?: import('../../shared/protocol/procedures.js').LocalCheckOptions,
  decisionId?: string, procedureDefinition: import('../../shared/protocol/procedures.js').ProcedureDefinitionPin | null = null,
): Extract<import('./review-runs.js').ReviewRunPrepareInput, { phase: 'start' }> {
  const factualDecision = decisionId === undefined ? undefined : host.verificationCall(() => {
    const row = host.authority.prepare('SELECT result_id FROM factual_review_decisions WHERE decision_id = ? AND book_id = ?').get(decisionId, bookId);
    requireStore(row !== undefined && categoryIds.length === 1 && categoryIds[0] === 'factual-review', 'FACTUAL_DECISION_INVALID', '补充核查需要当前图书的核查决定。');
    const { reader } = host.resultBinding(bookId, String(row.result_id));
    return host.factualVerification.recheckSelection(bookId, decisionId, reader);
  });
  if (factualDecision !== undefined) {
    const claim = host.factualVerification.claims(factualDecision.originalRunRecordId)!.claims.find((entry) => entry.claimId === factualDecision.claimId)!;
    scope = { kind: 'selection', fromChapterBlockId: claim.occurrence.block, toChapterBlockId: claim.occurrence.block };
  }
  const procedure = capturedProcedure === null ? null : capturedProcedureOperations.procedureCall(host.capturedProcedureHost, () => capturedProcedureOperations.capturedProcedurePin(host.capturedProcedureHost, bookId, capturedProcedure));
  requireStore(seriesId === null || capturedProcedure === null || procedureOffersSeries(capturedProcedureOperations.requireCapturedVersion(host.capturedProcedureHost, capturedProcedure.versionId).document),
    'SERIES_SCOPE_UNAVAILABLE', '这个工序版本只允许参考当前图书。');
  requireStore(Array.isArray(materialIds) && materialIds.length <= MAX_WRITING_MATERIALS && materialIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) && new Set(materialIds).size === materialIds.length,
    'TASK_MATERIALS_INVALID', '请选择不重复的资料库资料，最多 4 份。');
  if (materialIds.length > 0) {
    requireStore(host.baselineAnalysis.launch.live === null || host.reviewCall(() => host.reviewRuns.materialReferencesLiveAllowed(bookId, categoryIds)), 'REVIEW_MATERIAL_UNAVAILABLE', TASK_MATERIAL_LIVE_UNAVAILABLE);
    requireStore(host.reviewCall(() => host.reviewRuns.materialReferencesAllowed(bookId, categoryIds)),
      'REVIEW_MATERIAL_CATEGORY_REQUIRED', REVIEW_MATERIAL_CATEGORY_REQUIRED);
  }
  const references = host.prepareTaskMaterials(bookId, materialIds);
  return { phase: 'start', bookId, categoryIds, scope, launchPolicy, procedure, procedureDefinition, redoOf, seriesId,
    ...(factualDecision === undefined ? {} : { factualDecision }),
    ...(localCheck === undefined ? {} : { localCheck }),
    ...(references.length === 0 ? {} : { materialReferences: { bookId, references } }),
    ...(intentDraft === null ? {} : { intentDraft }),
  };
}

export function launchReviewRun(host: ReviewOperationsHost, input: import('../../shared/protocol.js').ServiceOperationMap['launchReviewRun']['input'], launchPolicy: LaunchPolicyProjection,
  startWhen: 'now' | 'when-online' = 'now'): { projection: ReviewWorkspaceProjection; repeated: boolean } {
  try {
    const { clientCommandId, executionConfig = {}, ...request } = input;
    const launched = launchFromSnapshot(host.authority, { clientCommandId, bookId: input.bookId, kind: 'review-run', input: { ...request, executionConfig } },
      () => !host.reviewRuns.requiresModel(input.bookId, input.categoryIds) ? { executionConfig: {}, binding: null } : host.launchChoice('main-editorial', executionConfig, input.rememberedChoice), (choice, snapshotId) => {
        const policy = choice.binding !== null && host.baselineAnalysis.launch.operationalScope === 'ordinary-production'
          ? resolveSourceCheckoutLaunchPolicySync(host.codeRoot, 'ordinary-production', choice.binding) : launchPolicy;
        const planned = reviewRunRequest(host, input.bookId, input.categoryIds, input.scope, policy,
          input.capturedProcedure ?? null, input.materialIds ?? [], null, null, input.seriesId ?? null, input.localCheck, input.decisionId, input.procedureDefinition ?? null);
        const run = host.reviewRuns.launch(planned, snapshotId, choice.binding, {
          ...(input.evidenceAssuranceLevel === undefined ? {} : { evidenceAssuranceLevel: input.evidenceAssuranceLevel }), startWhen: input.startWhen ?? startWhen });
        return { runId: run.reviewRunId, manuscript: run.manuscript };
      });
    return { projection: { ...host.reviewRuns.workspace(input.bookId, launched.runId), ...(launched.notice === undefined ? {} : { launchNotice: launched.notice }) }, repeated: launched.repeated };
  } catch (error) {
    if (error instanceof TaskLaunchError) throw new StoreError(error.code, error.message);
    return host.reviewCall(() => { throw error; });
  }
}

/**
 * 生成统合总结 (Issue #1506): the summary alone for a settled Run, under the model and 思考强度 chosen now — the role's default
 * when none is chosen. A repeated command answers as the first did and sends nothing again.
 */
export function launchReviewSynthesis(host: ReviewOperationsHost, input: import('../../shared/protocol.js').ServiceOperationMap['generateReviewSynthesis']['input'],
  launchPolicy: LaunchPolicyProjection, startWhen: 'now' | 'when-online' = 'now'): { projection: ReviewWorkspaceProjection; repeated: boolean } {
  try {
    const { clientCommandId, executionConfig = {}, rememberedChoice, ...request } = input;
    const launched = launchFromSnapshot(host.authority, { clientCommandId, bookId: input.bookId, kind: 'review-run', input: { ...request, executionConfig, synthesisOnly: true } },
      () => host.launchChoice('main-editorial', executionConfig, rememberedChoice), (choice, snapshotId) => {
        const policy = choice.binding !== null && host.baselineAnalysis.launch.operationalScope === 'ordinary-production'
          ? resolveSourceCheckoutLaunchPolicySync(host.codeRoot, 'ordinary-production', choice.binding) : launchPolicy;
        const run = host.reviewRuns.launchSynthesis(input.bookId, input.reviewRunId, snapshotId, choice.binding, policy, startWhen);
        // The command's own record names the request, never the Run: a Run may be asked for its summary more than once.
        return { runId: host.reviewRuns.synthesisRequestOf(run.reviewRunId), manuscript: run.manuscript };
      });
    return { projection: { ...host.reviewRuns.workspace(input.bookId, input.reviewRunId), ...(launched.notice === undefined ? {} : { launchNotice: launched.notice }) }, repeated: launched.repeated };
  } catch (error) {
    if (error instanceof TaskLaunchError) throw new StoreError(error.code, error.message);
    return host.reviewCall(() => { throw error; });
  }
}

export function advanceReviewRunPreparationWork(host: ReviewOperationsHost, workId: string): AnalysisPreparationResult<ReviewWorkspaceProjection> {
  return reviewPreparation(host, () => host.reviewRuns.prepare({ phase: 'advance', workId }));
}

export function cancelReviewRunPreparationWork(host: ReviewOperationsHost, workId: string): boolean {
  host.reviewCall(() => host.reviewRuns.prepare({ phase: 'cancel', workId }));
  return true;
}

export function reviewPreparation(host: ReviewOperationsHost, body: () => ReviewRunPreparationProgress): AnalysisPreparationResult<ReviewWorkspaceProjection> {
  return host.reviewCall(() => {
    const progress = body();
    return {
      done: progress.done,
      workId: progress.workId,
      completed: progress.completed,
      total: progress.total,
      projection: progress.reviewRunId === null || progress.bookId === null ? null : host.reviewRuns.workspace(progress.bookId, progress.reviewRunId),
    };
  });
}

/**
 * The editor's one approval of a prepared Review Run, naming the exact plan digest of every
 * Task-backed category (B1). The caller then hands the Run to the drive loop. An approval is recorded even while other
 * Runs hold every place of the governor; the drive loop waits for one (#1080, ADR 0095 §2). `_slotBusy` is no longer read.
 */
export function authorizeReviewRun(host: ReviewOperationsHost,
  bookId: string,
  reviewRunId: string,
  approvedDigests: ReadonlyArray<{ categoryId: string; planEnvelopeDigest: string }>,
  _slotBusy = false,
): ReviewWorkspaceProjection {
  return host.reviewCall(() => {
    host.reviewRuns.recordAuthorization(bookId, reviewRunId, approvedDigests, 'now');
    return host.reviewRuns.workspace(bookId, reviewRunId);
  });
}

/**
 * 忽略并说明: the disposition, its Quality Signal, and the finding's mark set aside, in one transaction
 * (REV-004). A finished category is actionable while the Run goes on (REV-008), so the answer takes the
 * owner's `progress` reader exactly as the inspection does.
 */
export function recordReviewFindingDisposition(host: ReviewOperationsHost,
  bookId: string,
  reviewRunId: string,
  findingId: string,
  reason: string,
  progress?: ProgressReader,
): ReviewWorkspaceProjection {
  return host.reviewCall(() => {
    host.transaction(host.authority, () => {
      host.reviewRuns.ignoreFinding(bookId, reviewRunId, findingId, reason);
      host.memoryFacade().captureIgnoredFinding(bookId, reviewRunId, findingId);
    });
    return host.reviewRuns.workspace(bookId, reviewRunId, progress);
  });
}

/** The next version of the Run's 审阅报告 (REV-009). */
export function generateReviewReport(host: ReviewOperationsHost, bookId: string, reviewRunId: string, progress?: ProgressReader): ReviewWorkspaceProjection {
  return host.reviewCall(() => {
    host.reviewRuns.generateReport(bookId, reviewRunId, () => reviewRunEvidence(host, bookId, reviewRunId),
      { conclusions: () => reviewRunConclusions(host, bookId, reviewRunId) });
    return host.reviewRuns.workspace(bookId, reviewRunId, progress);
  });
}

/** The Review Run and finding a produced mark belongs to, for the Mark Card's `查看任务`; `null` for any other mark. */
export function reviewFindingOfMark(host: ReviewOperationsHost, markId: string): { bookId: string; reviewRunId: string; findingId: string } | null {
  return host.reviewCall(() => host.reviewRuns.findingOfMark(markId));
}

/**
 * Refuses a Review Run that is not this Book's. The drive loop is service-internal and knows no Book,
 * so an operation that hands it a Run the renderer named — 继续审阅 — asks this first.
 */
export function requireReviewRunOfBook(host: ReviewOperationsHost, bookId: string, reviewRunId: string): void {
  host.reviewCall(() => host.reviewRuns.requireRunOfBook(bookId, reviewRunId));
}

/**
 * The drive loop's steps (B2); service-internal. Each is one call into the Review Run ledger with the
 * store's own error handling, so a fatal store error poisons the store exactly as any other call does.
 */
export function reviewRunDriveSteps(host: ReviewOperationsHost): ReviewRunDriveSteps {
  const runs = host.reviewRuns;
  return {
    local: (reviewRunId, stopping) => runs.runLocal(reviewRunId, stopping),
    background: (reviewRunId, categoryId) => runs.backgroundOrigin(reviewRunId, categoryId),
    begin: (reviewRunId) => host.reviewCall(() => runs.beginDrive(reviewRunId)),
    end: (reviewRunId) => runs.endDrive(reviewRunId),
    step: (reviewRunId, categoryId) => host.reviewCall(() => runs.step(reviewRunId, categoryId)),
    start: (reviewRunId, categoryId) => host.reviewCall(() => runs.start(reviewRunId, categoryId)),
    recordDispatch: (reviewRunId, categoryId, runRecordId) => host.reviewCall(() => runs.recordDispatch(reviewRunId, categoryId, runRecordId)),
    refuseDispatch: (reviewRunId, categoryId, runRecordId, code, message) =>
      host.reviewCall(() => runs.refuseDispatch(reviewRunId, categoryId, runRecordId, code, message)),
    settle: (reviewRunId, categoryId, options) => {
      host.reviewCall(() => runs.settle(reviewRunId, categoryId, options));
      if (categoryId === 'factual-review') host.materializeFactualVerification(reviewRunId);
    },
    write: (reviewRunId, categoryId) => {
      host.reviewCall(() => runs.write(reviewRunId, categoryId));
      // The settled 事实核查 category's Versioned Verification Results (Issue #901), once its findings are on the manuscript.
      if (categoryId === 'factual-review') host.materializeFactualVerification(reviewRunId);
    },
    fail: (reviewRunId, categoryId, code, message) => host.reviewCall(() => runs.fail(reviewRunId, categoryId, code, message)),
    waitingForPlace: (reviewRunId, categoryId) => runs.waitingForPlace(reviewRunId, categoryId),
    paused: (reviewRunId) => host.reviewCall(() => runs.paused(reviewRunId)),
    launchDriveMode: (reviewRunId) => host.reviewCall(() => runs.launchDriveMode(reviewRunId)),
  };
}

export function finishCancelledReviewRun(host: ReviewOperationsHost, runRecordId: string): void {
  for (const row of host.authority.prepare(`SELECT DISTINCT rr.review_run_id, rr.book_id FROM review_runs rr
      JOIN review_run_category_events e ON e.review_run_id = rr.review_run_id
      WHERE e.run_record_id = ? AND e.state = 'dispatched'`).all(runRecordId) as SqlRow[]) {
    host.reviewCall(() => host.reviewRuns.finishCancelled(asString(row.book_id), asString(row.review_run_id)));
    host.materializeFactualVerification(asString(row.review_run_id));
  }
}

/** Reconcile stranded Runs to their kept continuation points; queued starts still require an explicit new start. */
export function reconcileStoppedReviewCategoryRuns(host: ReviewOperationsHost): { settled: number } {
  host.assertAvailable();
  const settled = host.reviewCall(() => host.analysisCall(() => host.reviewRuns.reconcileStoppedCategoryRuns()));
  // The category router's existing active-state query excludes terminal reflection and already
  // paused Runs. Their optional physical-request evidence still requires local settlement.
  for (const row of host.authority.prepare(`SELECT DISTINCT r.run_record_id FROM analysis_run_records r
      JOIN analysis_task_intents i ON i.task_intent_id = r.task_intent_id JOIN analysis_run_states s ON s.run_record_id = r.run_record_id
      WHERE substr(i.kind, 1, 17) = 'editorial-review/' AND json_type(s.canonical_json, '$.requestAdmission') IS NOT NULL`).all() as SqlRow[]) {
    try { host.analysisCall(() => host.executionLedgerForRun(asString(row.run_record_id)).reconcileRequestAdmissions(asString(row.run_record_id))); }
    catch (error) {
      if (error instanceof StoreFatalError) throw error;
      // As with the existing category router, a damaged snapshot is its surface's refusal. Its
      // continuation validates the same receipt before admission and cannot silently send again.
    }
  }
  // Retention reads terminal outcomes only after the execution ledger has settled their request evidence.
  for (const reviewRunId of host.reviewCall(() => host.reviewRuns.retainStoppedFactualRuns())) {
    try { host.materializeFactualVerification(reviewRunId); } catch { /* one Run never stops startup; the next open records what is still missing */ }
  }
  return { settled };
}

/** A Review Run approved 「空闲时处理」 begins at the first quiet, after the same preflight 联网后开始任务 makes (OFF-008). */
export function admitIdleReview(host: ReviewOperationsHost, reviewRunId: string, drive: () => void): void {
  host.reviewCall(() => {
    if (!host.reviewRuns.waitsForIdle(reviewRunId)) return;
    const drift = host.reviewRuns.preflightDrift(reviewRunId);
    if (drift.length > 0) { host.reviewRuns.blockWaiting(reviewRunId, drift, 'plan-moved'); return; }
    host.reviewRuns.admitWaiting(reviewRunId, drive);
  });
}

/** Reconnect Preflight starts a waiting Review Run (Issue #760): `drive` hands it to the drive loop, which may take it now. */
export function admitWaitingReviewRun(host: ReviewOperationsHost, reviewRunId: string, drive: () => void): void {
  host.assertAvailable();
  host.reviewCall(() => host.reviewRuns.admitWaiting(reviewRunId, drive));
}

export function reviewRuleFacts(host: ReviewOperationsHost, bookId: string, reviewRunId: string) {
  const review = host.reviewCall(() => host.reviewRuns.planFacts(bookId, reviewRunId));
  const tasks = host.reviewCall(() => host.reviewRuns.controlTasks(bookId, reviewRunId));
  const projections = tasks.map((task) => host.analysisCall(() => task.ledger.inspect(bookId)));
  const pattern = reviewRulePattern(review.categories.map((category) => category.categoryId));
  const digest = canonicalRecord(tasks.map((task) => ({ categoryId: task.categoryId, digest: task.planEnvelopeDigest }))).digest;
  const bindings = projections.map((projection) => projection.planVersion === null ? null : defaultExecutionRuleBindingOf(projection.planVersion.materialInputs));
  const first = bindings[0];
  const binding: DefaultExecutionRuleBinding | null = first == null || bindings.some((value) => value === null) ? null : {
    ...first,
    artifactPin: { ...first.artifactPin, identity: pattern, nativeCarrierSha256: canonicalRecord(bindings).digest,
      sidecarSha256: canonicalRecord(review.categories.map((category) => ({ categoryId: category.categoryId, procedure: category.procedure, basis: category.basisStatement }))).digest },
    expectedOutcome: `审阅类别：${review.categories.map((category) => category.categoryId).sort().join('、')}`,
  };
  const allowed = tasks.every((task) => task.ledger.launch.live === null ||
    liveKindRule(task.ledger.launch.policy, task.ledger.definition.kind)?.matchingActiveDefaultExecutionRuleAllowed === true);
  return { tasks, projections, pattern, digest, binding, allowed, review };
}

export function reviewDefaultRule(host: ReviewOperationsHost, bookId: string, reviewRunId: string): TaskPlanDefaultRuleProjection {
  const facts = reviewRuleFacts(host, bookId, reviewRunId);
  const rule = host.ruleCall(() => host.rules.forPattern(bookId, facts.pattern));
  const current = rule === null ? null : { ...defaultExecutionRuleReference(rule, rule.version), state: rule.state,
    fromThisPlan: rule.version.sourcePlanEnvelopeDigest === facts.digest };
  const reason = !facts.allowed ? '当前模型处理规则未允许审阅快速开始；请先看计划。'
    : facts.binding === null ? '这次审阅没有可设为默认的模型任务。'
      : facts.projections.some((projection, index) => projection.taskIntent?.taskIntentId !== facts.tasks[index]!.taskIntentId || projection.planRevision !== null)
        ? SET_RULE_CHANGED
        : facts.projections.some((projection) => projection.planVersion?.edits.runBudgetCeiling !== undefined) ? SET_RULE_BUDGET
          : facts.projections.some((projection) => { const edits = projection.planVersion?.edits; return edits !== undefined &&
            (edits.removedSteps.length > 0 || edits.disallowedAdaptations.length > 0 || (edits.askFirstAdaptations ?? []).length > 0); }) ? SET_RULE_EDITED
            : current?.state === 'active' && current.fromThisPlan ? setRuleAlreadyReason(current.name) : null;
  const ruleVersionId = host.reviewCall(() => host.reviewRuns.defaultRuleVersion(reviewRunId));
  const started = ruleVersionId === null ? null : host.ruleCall(() => host.rules.version(ruleVersionId));
  return { canSet: reason === null, reason, current, planEnvelopeDigest: reason === null ? facts.digest : null,
    binds: facts.binding === null ? [] : defaultRuleBindingRows(facts.binding, '审阅', defaultExecutionRuleCovers(facts.pattern)),
    startedBy: started === null ? null : defaultExecutionRuleReference(started.rule, started.version) };
}

export async function quickStartReviewRun(host: ReviewOperationsHost, input: { bookId: string; reviewRunId: string; planEnvelopeDigest: string; ruleVersionId: string },
  runtime: { credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>; connectivity: TaskPlanConnectivity },
  progress?: ProgressReader): Promise<{ outcome: 'started' | 'fell-back'; reasons: string[]; dispatch: boolean }> {
  const facts = reviewRuleFacts(host, input.bookId, input.reviewRunId);
  const startedBy = host.reviewCall(() => host.reviewRuns.defaultRuleVersion(input.reviewRunId));
  if (startedBy !== null) {
    requireStore(startedBy === input.ruleVersionId && facts.digest === input.planEnvelopeDigest,
      'ANALYSIS_AUTHORIZATION_STALE', '这次审阅已经按另一份计划或规则开始。');
    return { outcome: 'started', reasons: [], dispatch: false };
  }
  const rule = host.ruleCall(() => host.rules.activeFor(input.bookId, facts.pattern));
  const fallBack = (reason: string) => ({ outcome: 'fell-back' as const, reasons: [reason], dispatch: false });
  if (rule === null || rule.version.ruleVersionId !== input.ruleVersionId) return fallBack(quickStartNoRuleReason(facts.pattern));
  if (!facts.allowed) return fallBack('当前模型处理规则未允许审阅快速开始；请先看计划。');
  if (facts.digest !== input.planEnvelopeDigest || facts.binding === null ||
    canonicalRecord(facts.binding).digest !== canonicalRecord(rule.version.binding).digest) return fallBack(QUICK_START_PLAN_CHANGED);
  if (facts.projections.some((projection) => projection.planVersion?.edits.removedSteps.length !== 0 ||
    projection.planVersion.edits.disallowedAdaptations.length !== 0 || (projection.planVersion.edits.askFirstAdaptations ?? []).length !== 0 ||
    projection.planVersion.edits.runBudgetCeiling !== undefined)) return fallBack(SET_RULE_EDITED);
  const plan = await host.inspectTaskPlanWithConnection({ bookId: input.bookId, kind: 'review-run', ref: input.reviewRunId },
    runtime.credentialReadiness, runtime.connectivity, progress);
  if (plan.start.readiness !== 'ready') return fallBack(plan.start.readiness === 'offline' ? QUICK_START_OFFLINE : QUICK_START_NOT_READY);
  // Re-read every match after asynchronous credential readiness, before recording the one approval.
  const now = reviewRuleFacts(host, input.bookId, input.reviewRunId);
  const active = host.ruleCall(() => host.rules.activeFor(input.bookId, now.pattern));
  if (active?.version.ruleVersionId !== input.ruleVersionId || now.digest !== facts.digest || !now.allowed) return fallBack(QUICK_START_RULE_CHANGED);
  host.reviewCall(() => host.reviewRuns.recordAuthorization(input.bookId, input.reviewRunId, plan.start.categoryDigests, 'now', input.ruleVersionId));
  return { outcome: 'started', reasons: [], dispatch: true };
}

/**
 * 取消任务 of a Review Run an exclusion stopped (SER-024): it then reads 已取消 and offers nothing more; what it put on the
 * manuscript stays as it is. The answer is the Book's 审阅 with the Run open.
 */
export function cancelReviewRun(host: ReviewOperationsHost, bookId: string, reviewRunId: string, progress?: ProgressReader): ReviewWorkspaceProjection {
  return host.reviewCall(() => {
    host.reviewRuns.cancelStoppedRun(bookId, reviewRunId);
    return host.reviewRuns.workspace(bookId, reviewRunId, progress);
  });
}

/**
 * The Export Fidelity Review of one exact version (V2-UX-EXP-007). `available` is the launch's verified
 * External Export Policy: without it nothing about an export proceeds. A current revision with unsaved edits
 * is saved as a revision for the export first.
 */
export async function reviewManuscriptExport(host: ReviewOperationsHost, input: ReviewManuscriptExportInput, available: boolean): Promise<ManuscriptExportReviewProjection> {
  // 导出审阅报告（DOCX） (Issue #1430): the report is compiled first, then reviewed as any recorded version is. Issue #1446:
  // an unchanged report is its latest recorded version; a changed one is recorded only by the preparation of its destination.
  const target = input.target;
  if (target.kind === 'book-review-report') {
    await host.exportCall(async () => host.manuscriptExport.requireAvailable(available));
    const reportId = host.reviewCall(() => host.reviewRuns.compileBookReport(input.bookId, (runId) => reviewRunEvidence(host, input.bookId, runId),
      (runId) => reviewRunConclusions(host, input.bookId, runId), target.reviewRunId));
    return host.exportCall(() => host.manuscriptExport.review({ ...input, target: { kind: 'report', reportId } }, available));
  }
  return host.exportCall(() => host.manuscriptExport.review(input, available));
}

/** A Review Run's categories that send again ranges an earlier Run of their kind left 结果待确认 (Issue #757), before it starts. */
export function reviewResend(host: ReviewOperationsHost, bookId: string, facts: ReviewRunPlanFacts): TaskPlanProjection['resend'] {
  // Until a category runs — prepared, or waiting to start once online (Issue #760) — the plan says what starting it sends.
  if (facts.state !== 'prepared' && facts.state !== 'waiting' && facts.state !== 'plan-moved') return null;
  const entries: Array<{ category: string; units: number[] }> = [];
  for (const category of facts.categories) {
    const task = category.task;
    const manifest = task?.components['coverage-manifest'] as CoverageManifestProjection | undefined;
    if (task === null || manifest === undefined) continue;
    const kind = host.authority.prepare('SELECT kind FROM analysis_task_intents WHERE task_intent_id = ?').get(task.taskIntentId) as SqlRow | undefined;
    if (kind === undefined) continue;
    const plan = (task.components['reuse-plan'] ?? null) as ResendPlan | null;
    const units = host.analysisCall(() => host.baselineAnalysis.resendUnitsByContent(bookId, asString(kind.kind), manifest, plan));
    if (units.length > 0) entries.push({ category: category.label, units });
  }
  if (entries.length === 0) return null;
  const units = [...new Set(entries.flatMap((entry) => entry.units))].sort((left, right) => left - right);
  return { units, statement: categoryResendDisclosure(entries) };
}
