import type { RetrievalSource } from './retrieval/index.js';
import { randomUUID } from 'node:crypto';
import { selectedPolicyIdentityOf, type ConfiguredProviderBinding } from './launch-policy.js';
import { factualClaimVerificationInput } from './analysis/factual-claim-ledger.js';
import { factualClaimVerificationPrompt } from './analysis/factual-claim-contract.js';
import { resolveProcedureDefinition } from './procedures/definition-store.js';
import type { FactualRecheckCandidate, FactualRecheckRun } from './analysis/factual-recheck.js';
import { searchBackend, searchBackendConfigurationDigest } from './provider/search-backends/index.js';
import { DatabaseSync } from 'node:sqlite';
import { StoreError, UUID_PATTERN, asNumber, asString, canonicalJson, requireStore, type SqlRow } from './store-records.js';
import {
  type CoverageManifestProjection,
  type ServiceOperationMap,
  CORRECTION_ASSURANCE_INCOMPLETE_LABEL,
  FACTUAL_VERIFICATION_OUTCOMES,
  type CorrectionProposalDraftProjection,
  type CorrectionProposalSavedProjection,
  type EvidenceWorkspaceProjection,
  type FactualReviewResultSetRevisionProjection,
  type FactualRunAssuranceProjection,
  type FactualVerificationLensProjection,
  type InspectEvidenceWorkspaceInput,
  type InspectFactualVerificationInput,
  type PlanEditsProjection,
  type PrepareCorrectionProposalInput,
  type RecordVerificationReviewDecisionInput,
  type SaveCorrectionProposalInput,
  type VerificationReviewDecisionRecordedProjection,
  SUPPLEMENTARY_CHECK_DEFERRED,
  type ResearchEvidenceBookProjection,
  type ResearchEvidenceCaptureState,
} from '../shared/protocol.js';
import { liveKindRule, modelAdmitsPlatformTools } from './analysis/live-kind-admission.js';
import { platformToolsFromProjection } from './provider/search-service.js';
import { graphemeLength } from './writing-tasks.js';
import { BaselineAnalysisStore } from './analysis/baseline-analysis-store.js';
import { ReviewRunStore } from './review/review-runs.js';
import * as backgroundEnrollments from './background-analysis-enrollments.js';
import {
  BackgroundAnalysisEnrollmentLedger,
  type BackgroundAnalysisEnrollmentRecord,
} from './background-analysis-enrollments.js';
import { ResearchEvidenceLedger } from './research-evidence.js';
import {
  FactualVerificationError,
  FactualVerificationLedger,
  type ManuscriptReader,
  type MaterializedFactualFinding,
} from './factual-verification.js';
import { FACTUAL_VERIFICATION_POLICY_VERSION, sliceGraphemes } from './analysis/factual-review-contract.js';
import { factualFindingId } from './analysis/factual-review-reducers.js';
import type {
  FactualCorrectionEntry,
  FactualEvidenceRelation,
  FactualUnitAssertionV2,
} from './analysis/factual-review-contract-v2.js';
import { planEditAssuranceLevel, planEditsOf } from './analysis/plan-edits.js';
import { canonicalRecord } from './analysis/canonical.js';
import { EditorialMarkStore } from './editorial-marks.js';
import { CORRECTION_MARK_SOURCE_LABEL, FACTUAL_LENS_EMPTY, FACTUAL_LENS_STATEMENT } from './store-operation-support.js';

export interface FactualVerificationOperationsHost {
  analysisCall: <T>(operation: () => T) => T;
  readonly authority: DatabaseSync;
  readonly backgroundEnrollmentHost: backgroundEnrollments.BackgroundEnrollmentStoreHost;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly editorialMarks: EditorialMarkStore;
  readonly enrollments: BackgroundAnalysisEnrollmentLedger;
  evidenceCall: <T>(operation: () => T) => T;
  evidenceSaveRefusal: (source: { captureState: ResearchEvidenceCaptureState; savedMaterialId: string | null }) => string | null;
  readonly factualReview: BaselineAnalysisStore;
  readonly factualVerification: FactualVerificationLedger;
  libraryCall: <T>(operation: () => T) => T;
  markCall: <T>(operation: () => T) => T;
  readonly researchEvidence: ResearchEvidenceLedger;
  reviewCall: <T>(operation: () => T) => T;
  readonly reviewRuns: ReviewRunStore;
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  factualRecheckCurrent: (run: FactualRecheckRun) => boolean;
  getConfiguredModelRoleBinding: (role: 'main-editorial' | 'fast-interaction') => ConfiguredProviderBinding | null;
  getSearchBackendConnections: () => import('../shared/protocol.js').SearchBackendConnectionProjection[];
  replacementFrozen: () => boolean;
  retrievalSourcesForRun: (runRecordId: string, ledger: BaselineAnalysisStore) => RetrievalSource[];
}

export function inspectResearchEvidence(host: FactualVerificationOperationsHost, input: ServiceOperationMap['inspectResearchEvidence']['input']): ResearchEvidenceBookProjection {
  return host.evidenceCall(() => {
    requireStore(host.authority.prepare('SELECT 1 FROM books WHERE book_id = ?').get(input.bookId) !== undefined, 'BOOK_NOT_FOUND', '所选图书不存在。');
    requireStore(input.staleAfterDays === null || (Number.isSafeInteger(input.staleAfterDays) && input.staleAfterDays >= 1 && input.staleAfterDays <= 3650),
        'RESEARCH_EVIDENCE_STALE_AFTER_INVALID', '过期天数无效。');
    let runRecordId: string | undefined;
    let findingId: string | undefined;
    if (input.taskIntentId !== undefined) {
      const run = host.authority.prepare(`SELECT r.run_record_id FROM analysis_run_records r
          JOIN analysis_task_intents t ON t.task_intent_id = r.task_intent_id WHERE t.book_id = ? AND t.task_intent_id = ?`)
        .get(input.bookId, input.taskIntentId) as SqlRow | undefined;
      // An unstarted task has no evidence, never the Book's unrelated latest Run.
      runRecordId = run === undefined ? '' : String(run.run_record_id);
    }
    if (input.reviewFindingId !== undefined) {
      requireStore(input.taskIntentId !== undefined, 'RESEARCH_EVIDENCE_INVALID', '查看发现的来源需要指定任务。');
      const finding = host.authority.prepare(`SELECT f.kind_ref FROM review_findings f
          JOIN review_runs r ON r.review_run_id = f.review_run_id WHERE r.book_id = ? AND f.finding_id = ? AND f.category_id = 'factual-review'`)
        .get(input.bookId, input.reviewFindingId) as SqlRow | undefined;
      findingId = finding === undefined ? '' : String(finding.kind_ref);
    }
    return host.researchEvidence.projection({
      bookId: input.bookId, after: input.after, now: new Date(),
      ...(runRecordId === undefined ? {} : { runRecordId }), ...(findingId === undefined ? {} : { findingId }),
      ...(input.staleAfterDays === null ? {} : { staleAfterDays: input.staleAfterDays }),
      saveRefusal: (source) => host.evidenceSaveRefusal(source),
    });
  });
}

export function recordResearchEvidence(host: FactualVerificationOperationsHost, input: Parameters<ResearchEvidenceLedger['record']>[0]): string[] {
  return host.evidenceCall(() => host.transaction(host.authority, () => host.researchEvidence.record(input)));
}

export function internalFactualRecheckCandidate(host: FactualVerificationOperationsHost, enrollment: BackgroundAnalysisEnrollmentRecord, decisionId: string): FactualRecheckCandidate | null {
  const launch = host.baselineAnalysis.launch;
  const live = launch.live;
  const policy = selectedPolicyIdentityOf(launch.policy?.selectedPolicyIdentity);
  const admitted = liveKindRule(launch.policy, 'factual-recheck', [], 'background');
  const rule = admitted?.factualRecheck;
  if (enrollment.kind !== 'factual-recheck' || enrollment.state !== 'active' || enrollment.paused || enrollment.version.share === null ||
    launch.operationalScope !== 'ordinary-production' || live?.scope !== 'ordinary-production' || (policy?.providerProcessingVersion !== 'v31' && (policy?.providerProcessingVersion !== 'v32' && policy?.providerProcessingVersion !== 'v33')) ||
    rule?.maximumClaims !== 1 || host.replacementFrozen()) return null;
  const binding = host.getConfiguredModelRoleBinding('main-editorial');
  if (binding === null || canonicalJson(binding) !== canonicalJson({ route: live.route, endpoint: live.endpoint, model: live.model,
    credentialSlot: live.credentialSlot, credentialReference: live.credentialReference }) ||
    admitted?.route !== live.route || admitted.model !== live.model || admitted.endpoint !== live.endpoint || admitted.credentialSlot !== live.credentialSlot ||
    !modelAdmitsPlatformTools(live.route, live.model) || platformToolsFromProjection(admitted) === null) return null;
  const enrolledBinding = backgroundEnrollments.enrollmentBinding(host.backgroundEnrollmentHost, enrollment.bookId, 'factual-recheck');
  if (enrolledBinding === null || canonicalJson({ ...enrolledBinding, runBudgetCeiling: enrollment.version.binding.runBudgetCeiling }) !== canonicalJson(enrollment.version.binding)) return null;
  const row = host.authority.prepare('SELECT result_id FROM factual_review_decisions WHERE decision_id = ? AND book_id = ?').get(decisionId, enrollment.bookId);
  if (row === undefined) return null;
  const { reader } = internalResultBinding(host, enrollment.bookId, String(row.result_id));
  const selection = host.factualVerification.recheckSelection(enrollment.bookId, decisionId, reader);
  const checkpoint = host.authority.prepare(`SELECT c.* FROM analysis_task_input_checkpoints c JOIN analysis_run_records r
      ON r.task_intent_id = c.task_intent_id WHERE r.run_record_id = ?`).get(selection.sourceRunRecordId);
  const point = host.factualReview.workingPointOf(enrollment.bookId);
  if (checkpoint === undefined || checkpoint.revision_id !== point.revisionId || checkpoint.revision_digest !== point.workingDigest ||
    Number(checkpoint.journal_sequence) !== point.journalSequence) return null;
  const search = host.getSearchBackendConnections().find((entry) => entry.selected && entry.credentialOperationState === 'ready' && entry.credentialReference !== null);
  if (search === undefined) return null;
  const backend = searchBackend(search.backendId);
  const ledger = host.factualVerification.claims(selection.originalRunRecordId)!;
  const message = factualClaimVerificationInput(ledger, selection.claimId, rule.verificationContract.maximumMetadataUtf8Bytes);
  const prompt = factualClaimVerificationPrompt(selection.level);
  const { pin } = resolveProcedureDefinition(host.authority, 'ai7-procedure/factual-claim-check', 1);
  return { enrollmentId: enrollment.enrollmentId, enrollmentVersionId: enrollment.version.enrollmentVersionId,
    onceKey: canonicalRecord({ enrollmentId: enrollment.enrollmentId, ledgerDigest: ledger.digest, claimId: selection.claimId, decisionId }).digest,
    selection, ledger, policy, binding: { route: live.route, endpoint: live.endpoint, model: live.model, credentialSlot: live.credentialSlot, credentialReference: live.credentialReference },
    search: { backendId: search.backendId, host: backend.declaration.host!, selectedAt: search.selectedAt,
      configurationDigest: searchBackendConfigurationDigest(search.backendId), credentialReference: search.credentialReference! },
    procedure: pin, maximumTokens: enrollment.version.share.maxTotalTokens, message: message.message,
    prompt: prompt.systemPrompt, promptDigest: canonicalRecord(prompt).digest,
    limits: { model: rule.verificationContract.maximumModelRequestsPerSession, tool: rule.verificationContract.maximumPlatformToolRoundsPerSession,
      search: rule.verificationContract.maximumSearchSubmissionsPerClaim } };
}

export function nextFactualRecheck(host: FactualVerificationOperationsHost): FactualRecheckCandidate | null {
  return internalVerificationCall(host, () => {
    for (const enrollment of host.enrollments.active().filter((entry) => entry.kind === 'factual-recheck' && !entry.paused)) {
      for (const row of host.authority.prepare("SELECT decision_id FROM factual_review_decisions WHERE book_id = ? AND disposition = 'request-evidence' ORDER BY rowid").all(enrollment.bookId)) {
        try {
          const candidate = internalFactualRecheckCandidate(host, enrollment, String(row.decision_id));
          if (candidate !== null && !host.factualReview.factualRecheckUsed(candidate.onceKey)) return candidate;
        } catch (error) { if (!(error instanceof FactualVerificationError) && !(error instanceof StoreError)) throw error; }
      }
    }
    return null;
  });
}

export function startFactualRecheck(host: FactualVerificationOperationsHost, candidate: FactualRecheckCandidate): FactualRecheckRun {
  return internalVerificationCall(host, () => host.transaction(host.authority, () => {
    const enrollment = host.enrollments.forBook(candidate.selection.bookId, 'factual-recheck');
    requireStore(enrollment !== null && canonicalJson(internalFactualRecheckCandidate(host, enrollment, candidate.selection.decisionId)) === canonicalJson(candidate),
        'FACTUAL_RECHECK_STALE', '复核登记、决定或冻结来源已变化。');
    return host.factualReview.startFactualRecheck(candidate);
  }));
}

export function factualRecheckCurrent(host: FactualVerificationOperationsHost, run: FactualRecheckRun): boolean {
  try {
    const enrollment = host.enrollments.forBook(run.selection.bookId, 'factual-recheck');
    const current = enrollment === null ? null : internalFactualRecheckCandidate(host, enrollment, run.selection.decisionId);
    return current !== null && current.enrollmentVersionId === run.enrollmentVersionId && current.onceKey === run.onceKey &&
      canonicalJson(current.selection) === canonicalJson(run.selection) && canonicalJson(current.binding) === canonicalJson(run.binding) &&
      canonicalJson(current.policy) === canonicalJson(run.policy) && canonicalJson(current.search) === canonicalJson(run.search) && current.message === run.message;
  } catch { return false; }
}

export function publishFactualRecheck(host: FactualVerificationOperationsHost, run: FactualRecheckRun, round: import('./factual-verification.js').FactualClaimRound, usage: import('./provider/classification.js').UsageFacts | null): void {
  internalVerificationCall(host, () => host.transaction(host.authority, () => {
    requireStore(host.factualRecheckCurrent(run) && round.result !== null, 'FACTUAL_RECHECK_STALE', '复核来源或决定已经变化，未发布结果。');
    const claim = host.factualVerification.claims(run.runRecordId)!.claims.find((entry) => entry.claimId === run.selection.claimId)!;
    host.researchEvidence.record({ bookId: run.selection.bookId, runRecordId: run.runRecordId,
      unitOrdinal: claim.producers[0]!.sourceUnitOrdinal, backendId: run.search.backendId, unit: round.evidence });
    host.factualVerification.materializeRecheck(run, round.result!);
    host.factualReview.settleFactualRecheck(run, 'completed', usage);
  }));
}

export function internalVerificationCall<T>(host: FactualVerificationOperationsHost, operation: () => T): T {
  return host.libraryCall(() => {
    try {
      return operation();
    } catch (error) {
      if (error instanceof FactualVerificationError) throw new StoreError(error.code, error.message);
      throw error;
    }
  });
}

export function internalFrozenPlanEdits(host: FactualVerificationOperationsHost, taskIntentId: string, ordinal: number): PlanEditsProjection {
  const row = host.authority.prepare(
      "SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = ? AND component = 'execution-plan'",
  ).get(taskIntentId, ordinal) as SqlRow | undefined;
  return row === undefined ? planEditsOf({}) : planEditsOf(JSON.parse(asString(row.canonical_json)) as unknown);
}

export function recordFactualRunAssurance(host: FactualVerificationOperationsHost, input: { bookId: string; runRecordId: string; taskIntentId: string; offline: boolean }): FactualRunAssuranceProjection {
  return internalVerificationCall(host, () => {
    const facts = host.analysisCall(() => host.factualReview.loadExecutionPlan(input.runRecordId));
    const plannedLevel = planEditAssuranceLevel(internalFrozenPlanEdits(host, facts.taskIntentId, facts.planVersionOrdinal));
    const contractLevel = host.factualReview.definitionForDigest(facts.promptContractDigest).evidenceAssuranceLevel ?? null;
    return host.transaction(host.authority, () => host.factualVerification.recordRunAssurance({ ...input, plannedLevel, contractLevel }));
  });
}

export function internalManuscriptReader(host: FactualVerificationOperationsHost, branchId: string, manuscriptId: string): ManuscriptReader {
  const working = host.authority.prepare('SELECT text FROM working_blocks WHERE branch_id = ? AND block_id = ?');
  return {
    rangeUntouched: (runRecordId, blockId, fromGrapheme, toGrapheme) => {
      const task = host.authority.prepare(`SELECT t.kind, t.canonical_json FROM analysis_task_intents t JOIN analysis_run_records r
          ON r.task_intent_id = t.task_intent_id WHERE r.run_record_id = ?`).get(runRecordId);
      if (task?.kind === 'factual-recheck') runRecordId = (JSON.parse(String(task.canonical_json)) as { factualDecision: import('./factual-verification.js').FactualRecheckSelection }).factualDecision.sourceRunRecordId;
      const checkpoint = host.authority.prepare(`SELECT c.journal_sequence FROM analysis_task_input_checkpoints c
          JOIN analysis_run_records r ON r.task_intent_id = c.task_intent_id
          WHERE r.run_record_id = ? AND c.branch_id = ? AND c.manuscript_id = ?`).get(runRecordId, branchId, manuscriptId);
      requireStore(checkpoint !== undefined, 'FACTUAL_VERIFICATION_RECORD_INVALID', '核查结果的原文固定点缺失。');
      let from = fromGrapheme;
      let to = toGrapheme;
      const edits = host.authority.prepare(`SELECT from_grapheme, to_grapheme, insert_text FROM edit_journal_entries
          WHERE branch_id = ? AND block_id = ? AND sequence > ? ORDER BY sequence`)
        .all(branchId, blockId, asNumber(checkpoint.journal_sequence)) as SqlRow[];
      for (const edit of edits) {
        const start = asNumber(edit.from_grapheme);
        const end = asNumber(edit.to_grapheme);
        if (start < to && end > from || start === end && start > from && start < to) return false;
        if (end <= from) {
          const delta = graphemeLength(asString(edit.insert_text)) - (end - start);
          from += delta;
          to += delta;
        }
      }
      return true;
    },
    sourceCurrent: (runRecordId, pin) => {
      try {
        const source = host.retrievalSourcesForRun(runRecordId, host.factualReview).find((entry) =>
          entry.sourceKind === pin.sourceKind && entry.sourceId === pin.sourceId && entry.digest === pin.digest);
        return source !== undefined && source.read().digest === pin.digest;
      } catch { return false; }
    },
    currentBlockText: (blockId) => {
      const row = working.get(branchId, blockId) as SqlRow | undefined;
      return row === undefined ? null : asString(row.text);
    },
    revisionBlocks: (manuscriptRevisionId) => {
      let heading: string | null = null;
      return host.factualReview.readRevisionBlocks(manuscriptId, manuscriptRevisionId).map((block) => {
        if (block.kind === 'heading') heading = block.text;
        return { blockId: block.blockId, text: block.text, heading };
      });
    },
  };
}

export function internalReviewRunBranch(host: FactualVerificationOperationsHost, bookId: string, reviewRunId: string): { branchId: string; manuscriptId: string } {
  const row = host.authority.prepare('SELECT branch_id, manuscript_id FROM review_runs WHERE review_run_id = ? AND book_id = ?').get(reviewRunId, bookId) as SqlRow | undefined;
  requireStore(row !== undefined, 'FACTUAL_VERIFICATION_NOT_FOUND', '这次审阅不属于这本书。');
  return { branchId: asString(row.branch_id), manuscriptId: asString(row.manuscript_id) };
}

export function internalBookManuscript(host: FactualVerificationOperationsHost, bookId: string): { branchId: string; manuscriptId: string } | null {
  const row = host.authority.prepare(`SELECT rr.branch_id, rr.manuscript_id FROM review_runs rr WHERE rr.book_id = ? ORDER BY rr.ordinal DESC LIMIT 1`).get(bookId) as SqlRow | undefined;
  return row === undefined ? null : { branchId: asString(row.branch_id), manuscriptId: asString(row.manuscript_id) };
}

export function internalMaterializeFactualVerification(host: FactualVerificationOperationsHost, reviewRunId: string): void {
  const event = host.authority.prepare(`SELECT state, result_set_revision_id, run_record_id FROM review_run_category_events WHERE review_run_id = ? AND category_id = 'factual-review'
      AND (state = 'materialized' OR (state IN ('failed', 'interrupted') AND json_extract(canonical_json, '$.partialFactualRetentionVersion') = 1))
      AND result_set_revision_id IS NOT NULL ORDER BY sequence DESC LIMIT 1`).get(reviewRunId) as SqlRow | undefined;
  if (event === undefined) return;
  const revisionId = asString(event.result_set_revision_id);
  if (event.state !== 'materialized' && host.reviewCall(() => host.reviewRuns.retainedFactualRevision(reviewRunId)) !== revisionId) return;
  const run = host.authority.prepare('SELECT book_id, branch_id, manuscript_id FROM review_runs WHERE review_run_id = ?').get(reviewRunId) as SqlRow;
  const bookId = asString(run.book_id);
  const revisionRow = host.authority.prepare(`SELECT v.task_intent_id, v.run_record_id, v.manuscript_revision_id FROM analysis_result_set_revisions v
      JOIN analysis_result_sets s ON s.result_set_id = v.result_set_id AND s.book_id = ? AND s.kind = 'factual-review'
      WHERE v.revision_id = ? AND v.run_record_id = ?`)
    .get(bookId, revisionId, asString(event.run_record_id)) as SqlRow | undefined;
  if (revisionRow === undefined) return;
  const runRecordId = asString(revisionRow.run_record_id);
  const inspected = host.analysisCall(() => host.factualReview.inspect(bookId, undefined, revisionId)).inspectedRevision;
  if (inspected === null) return;
  const revision = inspected.revision as FactualReviewResultSetRevisionProjection;
  const manuscriptRevisionId = asString(revisionRow.manuscript_revision_id);
  const taskIntentId = asString(revisionRow.task_intent_id);
  const blocks = host.factualReview.readRevisionBlocks(revision.manuscriptPin.manuscriptId, manuscriptRevisionId);
  const blockText = new Map(blocks.map((block) => [block.blockId, block.text] as const));
  let heading: string | null = null;
  const headings = new Map<string, string | null>();
  for (const block of blocks) {
    if (block.kind === 'heading') heading = block.text;
    headings.set(block.blockId, heading);
  }
  // The relations and variants of every assertion, by the finding identity its block and quotation mint.
  const manifestRow = host.authority.prepare(`SELECT canonical_json FROM analysis_plan_records WHERE task_intent_id = ? AND component = 'coverage-manifest'
      ORDER BY plan_version DESC LIMIT 1`).get(taskIntentId) as SqlRow | undefined;
  const manifest = manifestRow === undefined ? null : JSON.parse(asString(manifestRow.canonical_json)) as CoverageManifestProjection;
  const stated = new Map<string, { relations: FactualEvidenceRelation[]; corrections: Array<{ text: string; rationale: string }> }>();
  let relationsStated = false;
  for (const row of host.authority.prepare("SELECT unit_ordinal, canonical_json FROM analysis_unit_results WHERE revision_id = ? AND state = 'closed'").all(revisionId) as SqlRow[]) {
    const record = JSON.parse(asString(row.canonical_json)) as { assertions?: ReadonlyArray<FactualUnitAssertionV2 | { blockOrdinal: number; quote: string }>; corrections?: ReadonlyArray<FactualCorrectionEntry> };
    if (!Object.hasOwn(record, 'corrections')) continue;
    relationsStated = true;
    const unit = manifest?.units.find((entry) => entry.ordinal === asNumber(row.unit_ordinal));
    if (unit === undefined) continue;
    const messageBlockIds = [...unit.overlapBlockIds, ...unit.blockIds];
    (record.assertions ?? []).forEach((assertion, index) => {
      const blockId = messageBlockIds[assertion.blockOrdinal - 1];
      if (blockId === undefined) return;
      const id = factualFindingId(blockId, assertion.quote);
      const entry = stated.get(id) ?? { relations: [], corrections: [] };
      entry.relations.push(...('evidenceRelations' in assertion ? assertion.evidenceRelations : []));
      const correction = (record.corrections ?? []).find((candidate) => candidate.assertionRef === index + 1);
      if (correction !== undefined && entry.corrections.length === 0) entry.corrections.push(...correction.variants.slice(0, 3));
      stated.set(id, entry);
    });
  }
  const claimLedger = host.factualVerification.claims(runRecordId);
  if (claimLedger !== null) {
    relationsStated = true;
    for (const claim of claimLedger.claims) {
      const session = host.factualVerification.claimSession(runRecordId, 'web-verification', claim.claimId);
      const rounds = session === null ? [] : host.factualVerification.claimVerifications(session.sessionId);
      stated.set(`fnd_${claim.claimId.slice(0, 24)}`, { relations: rounds.flatMap((round) => round.evidenceRelations),
        corrections: rounds.flatMap((round) => round.corrections).slice(0, 3) });
    }
  }
  const assurance = host.factualVerification.runAssurance(runRecordId);
  // Local recovery reads the persisted revision's contract/plan pins; it needs no currently executable provider route.
  const contractLevel = host.factualReview.definitionForDigest(revision.bindingPin.promptContractDigest).evidenceAssuranceLevel ?? null;
  const findingsById = new Map(revision.findings.map((finding) => [finding.findingId, finding] as const));
  const findings: MaterializedFactualFinding[] = [];
  for (const row of host.authority.prepare("SELECT finding_id, kind_ref, mark_id FROM review_findings WHERE review_run_id = ? AND category_id = 'factual-review' ORDER BY ordinal")
    .all(reviewRunId) as SqlRow[]) {
    const finding = findingsById.get(asString(row.kind_ref));
    const text = finding === undefined ? undefined : blockText.get(finding.sourceRange.blockId);
    if (finding === undefined || text === undefined) continue;
    const entry = stated.get(finding.findingId);
    findings.push({
      assertionClass: finding.assertionClass,
      reviewFindingId: asString(row.finding_id), findingId: finding.findingId, blockId: finding.sourceRange.blockId,
      fromGrapheme: finding.sourceRange.fromGrapheme, toGrapheme: finding.sourceRange.toGrapheme, quote: finding.quote,
      pinnedText: sliceGraphemes(text, finding.sourceRange.fromGrapheme, finding.sourceRange.toGrapheme), question: finding.question,
      category: finding.category, severity: finding.severity, heading: headings.get(finding.sourceRange.blockId) ?? null,
      markId: row.mark_id === null ? null : asString(row.mark_id),
      unitOrdinals: [finding.unitOrdinal, ...finding.mergedFrom.map((merged) => merged.unitOrdinal)],
      relations: relationsStated ? entry?.relations ?? [] : null, corrections: entry?.corrections ?? [],
    });
  }
  host.transaction(host.authority, () => host.factualVerification.materialize({
    bookId, reviewRunId, runRecordId, taskIntentId, revisionId, manuscriptRevisionId, contractLevel,
    ...(() => { const row = host.authority.prepare('SELECT canonical_json FROM analysis_task_intents WHERE task_intent_id = ?').get(taskIntentId);
      const decision = row === undefined ? undefined : (JSON.parse(String(row.canonical_json)) as { factualDecision?: import('./factual-verification.js').FactualRecheckSelection }).factualDecision;
      return decision === undefined ? {} : { factualDecision: decision }; })(),
    plannedLevel: assurance?.plannedLevel ?? planEditAssuranceLevel(internalFrozenPlanEdits(host, taskIntentId, revision.provenance.planVersion ?? 1)), findings,
  }));
}

export function materializeFactualVerification(host: FactualVerificationOperationsHost, reviewRunId: string): void {
  internalVerificationCall(host, () => internalMaterializeFactualVerification(host, reviewRunId));
}

export function inspectFactualVerification(host: FactualVerificationOperationsHost, input: InspectFactualVerificationInput): FactualVerificationLensProjection {
  return internalVerificationCall(host, () => {
    requireStore(host.authority.prepare('SELECT 1 FROM books WHERE book_id = ?').get(input.bookId) !== undefined, 'BOOK_NOT_FOUND', '所选图书不存在。');
    const binding = input.reviewRunId === null ? internalBookManuscript(host, input.bookId) : internalReviewRunBranch(host, input.bookId, input.reviewRunId);
    const policyPin = { ...FACTUAL_VERIFICATION_POLICY_VERSION };
    if (binding === null) {
      return { bookId: input.bookId, reviewRunId: null, results: [], nextCursor: null, total: 0, counts: FACTUAL_VERIFICATION_OUTCOMES.map((outcome) => ({ outcome, count: 0 })),
        chapters: [], run: null, policyPin, statement: FACTUAL_LENS_EMPTY };
    }
    const reader = internalManuscriptReader(host, binding.branchId, binding.manuscriptId);
    const chapterRows = host.authority.prepare("SELECT block_id, text, position FROM working_blocks WHERE branch_id = ? AND kind = 'heading' ORDER BY position").all(binding.branchId) as SqlRow[];
    const chapters = chapterRows.map((row) => ({ blockId: asString(row.block_id), heading: asString(row.text), position: asNumber(row.position) }));
    const positionOf = host.authority.prepare('SELECT position FROM working_blocks WHERE branch_id = ? AND block_id = ?');
    const chapterOf = (blockId: string): string | null => {
      const row = positionOf.get(binding.branchId, blockId) as SqlRow | undefined;
      if (row === undefined) return null;
      const position = asNumber(row.position);
      return chapters.filter((chapter) => chapter.position <= position).at(-1)?.blockId ?? null;
    };
    const page = host.factualVerification.lens({ bookId: input.bookId, reviewRunId: input.reviewRunId, after: input.after, chapterOf, filters: {
      chapterBlockId: input.chapterBlockId, outcome: input.outcome, severity: input.severity, sourceCondition: input.sourceCondition, actionNeed: input.actionNeed,
    } }, reader);
    const runRecordId = page.results[0]?.runRecordId ?? null;
    return {
      bookId: input.bookId, reviewRunId: input.reviewRunId, results: page.results, nextCursor: page.nextCursor, total: page.total, counts: page.counts,
      chapters: chapters.map(({ blockId, heading }) => ({ blockId, heading })),
      run: runRecordId === null ? null : host.factualVerification.runAssurance(runRecordId), policyPin,
      statement: page.total === 0 ? FACTUAL_LENS_EMPTY : FACTUAL_LENS_STATEMENT,
    };
  });
}

export function internalResultBinding(host: FactualVerificationOperationsHost, bookId: string, resultId: string): { reader: ManuscriptReader } {
  requireStore(typeof resultId === 'string' && UUID_PATTERN.test(resultId), 'FACTUAL_VERIFICATION_INVALID', '核查结果标识无效。');
  const row = host.authority.prepare('SELECT review_run_id FROM factual_verification_results WHERE result_id = ? AND book_id = ?').get(resultId, bookId) as SqlRow | undefined;
  requireStore(row !== undefined, 'FACTUAL_VERIFICATION_NOT_FOUND', '这条核查结果不属于这本书。');
  const binding = internalReviewRunBranch(host, bookId, asString(row.review_run_id));
  return { reader: internalManuscriptReader(host, binding.branchId, binding.manuscriptId) };
}

export function inspectEvidenceWorkspace(host: FactualVerificationOperationsHost, input: InspectEvidenceWorkspaceInput): EvidenceWorkspaceProjection {
  return internalVerificationCall(host, () => {
    const { reader } = internalResultBinding(host, input.bookId, input.resultId);
    return host.factualVerification.workspace(input.bookId, input.resultId, input.sourcesAfter, reader);
  });
}

export function recordVerificationReviewDecision(host: FactualVerificationOperationsHost, input: RecordVerificationReviewDecisionInput): VerificationReviewDecisionRecordedProjection {
  return internalVerificationCall(host, () => {
    const { reader } = internalResultBinding(host, input.bookId, input.resultId);
    const recorded = host.transaction(host.authority, () => {
      const recorded = host.factualVerification.recordDecision(input, reader);
      if (input.excludedSourceRefs !== undefined) {
        requireStore(input.disposition === 'request-evidence', 'FACTUAL_SOURCE_EXCLUSION_INVALID', '排除来源后请要求补充证据。');
        host.factualVerification.excludeClaimSources(input.bookId, input.resultId, recorded.decisionId, input.excludedSourceRefs, reader);
      }
      return recorded;
    });
    const workspace = host.factualVerification.workspace(input.bookId, input.resultId, null, reader);
    // 要求补充证据 (FREV-008): recorded with its range and level; a Book holds one 事实核查 Run until #905, so no Task is prepared.
    return { workspace, supplementary: recorded.requestedLevel === null ? null
      : { blockId: workspace.result.blockId, level: recorded.requestedLevel,
        ...(workspace.claimRecheckAvailable !== true ? { statement: SUPPLEMENTARY_CHECK_DEFERRED }
          : { statement: '已记录补充核查要求；点「补充核查」准备计划，再批准运行。', decisionId: recorded.decisionId }) } };
  });
}

export function prepareCorrectionProposal(host: FactualVerificationOperationsHost, input: PrepareCorrectionProposalInput): CorrectionProposalDraftProjection {
  return internalVerificationCall(host, () => {
    const { reader } = internalResultBinding(host, input.bookId, input.resultId);
    return host.factualVerification.draft(input.bookId, input.resultId, reader);
  });
}

export function saveCorrectionProposal(host: FactualVerificationOperationsHost, input: SaveCorrectionProposalInput): CorrectionProposalSavedProjection {
  return internalVerificationCall(host, () => {
    const { reader } = internalResultBinding(host, input.bookId, input.resultId);
    const prepared = host.factualVerification.prepareSave(input, reader);
    const result = prepared.draft.result;
    const run = internalReviewRunBranch(host, input.bookId, result.reviewRunId);
    const proposalId = randomUUID();
    const label = prepared.draft.assuranceIncomplete ? `${CORRECTION_ASSURANCE_INCOMPLETE_LABEL} · ` : '';
    const markIds = host.markCall(() => host.editorialMarks.createProducedMany(prepared.ranges.map((range) => ({
      manuscriptId: run.manuscriptId,
      branchId: run.branchId,
      blockId: range.blockId,
      fromGrapheme: range.fromGrapheme,
      toGrapheme: range.toGrapheme,
      pinnedText: range.text,
      kind: 'change-suggestion' as const,
      body: '',
      proposedText: prepared.text,
      rationale: prepared.rationale,
      atomicGroupId: null,
      source: { kind: 'ai7' as const, origin: 'task' as const, label: CORRECTION_MARK_SOURCE_LABEL, taskId: result.taskIntentId },
      basis: [{ label: `${label}事实核查 · 核查结果第 ${result.version} 版 · ${result.states.factualVerification}`, blockId: result.blockId,
        fromGrapheme: result.fromGrapheme, toGrapheme: result.toGrapheme, quote: result.quote }],
    })), (created) => {
      requireStore(created.every((markId) => markId !== null), 'CORRECTION_TARGET_CHANGED', '所选位置的文字已经改动；不会改到别处，请重新准备更正提案。');
      const ids = created as string[];
      host.factualVerification.recordProposal({ bookId: input.bookId, proposalId, draft: prepared.draft, markIds: ids, ranges: prepared.ranges,
        text: prepared.text, rationale: prepared.rationale, variant: prepared.variant });
      return ids;
    }));
    return {
      proposalId, markIds, assuranceIncomplete: prepared.draft.assuranceIncomplete, label: prepared.draft.label,
      completionLabel: '已保存为更正提案：它是普通的修改建议，不会自动应用，是否接受由你决定。',
    };
  });
}
