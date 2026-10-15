import type { EditorialStore } from '../../../src/service/store.js';
import type { BaselineAnalysisExecutionOwner } from '../../../src/service/analysis/execution.js';
import type { BaselineAnalysisStore } from '../../../src/service/analysis/baseline-analysis-store.js';
import type { LaunchPolicyProjection, TaskPlanKind } from '../../../src/shared/protocol.js';
import { finalizeAsJ11 } from '../../support/readers-report.js';
import type { EditorialCase } from './case-file.js';
import type { ImportedBook } from './session.js';
import { type CitedNote, graphemeCount, structuralMet } from './scoring.js';

/**
 * 初评, 审稿意见 and writing-draft cases: the Task prepared, authorized and run to its end on the case's binding (answering any
 * model question with its first option, as the measured pass's driver did), its result read as cited notes and named sections,
 * scored against the case's structural concerns and checks, and its delivery record made: the editor's finalized Evaluation
 * Record (J-11's words), the 审稿意见 draft document, or the writing draft's document recorded as delivered to 宣传部.
 */

export interface StructuralObservation {
  readonly outcome: { state: string; classification: string | null; unitsClosed: number; unitsTotal: number; gaps: ReadonlyArray<string>; synthesis: string | null };
  readonly concerns: { met: ReadonlyArray<string>; missed: ReadonlyArray<string> };
  readonly checks: { triggered: ReadonlyArray<string> };
  readonly delivery: { kind: string; recorded: boolean };
  readonly result: Readonly<Record<string, number | string | null>>;
  readonly clarificationsAnswered: number;
}

interface Settled {
  readonly taskIntentId: string;
  readonly runRecordId: string;
  readonly clarificationsAnswered: number;
}

/** Drive one authorized Run to its end, answering each model question once with its first option. */
async function runToEnd(
  store: EditorialStore,
  owner: BaselineAnalysisExecutionOwner,
  bookId: string,
  kind: TaskPlanKind,
  taskIntentId: string,
  authorized: { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore },
): Promise<Settled> {
  const runRecordId = authorized.dispatchRunRecordId;
  if (runRecordId === null) throw new Error('EDITORIAL_CASE/run-not-dispatched');
  owner.admitAndDispatch(runRecordId, authorized.ledger);
  await owner.whenIdle();
  let answered = 0;
  for (let round = 0; round < 4; round += 1) {
    const open = store.inspectTaskPlan({ bookId, kind, ref: taskIntentId }).clarifications.filter((card) => card.state === 'open' && card.origin === 'model');
    if (open.length === 0) break;
    for (const card of open) {
      store.answerBaselineAnalysisClarification({ bookId, taskIntentId, requestId: card.requestId, optionId: 'model-option-0', note: null });
      answered += 1;
    }
    owner.continueAnswered(runRecordId, store.clarificationLedger(bookId, taskIntentId));
    await owner.whenIdle();
  }
  return { taskIntentId, runRecordId, clarificationsAnswered: answered };
}

function positionsOf(store: EditorialStore, book: ImportedBook): Map<string, number> {
  return new Map(store.baselineAnalysisLedger.readWorkingBlocks(book.branchId).map((block) => [block.blockId, block.position]));
}

function score(testCase: EditorialCase, notes: ReadonlyArray<CitedNote>, sections: Readonly<Record<string, string>>) {
  const met = testCase.expectedConcerns.filter((concern) => structuralMet(concern, notes, sections)).map((concern) => concern.id);
  return {
    concerns: { met, missed: testCase.expectedConcerns.map((concern) => concern.id).filter((id) => !met.includes(id)) },
    checks: { triggered: testCase.falsePositiveChecks.filter((check) => structuralMet(check, notes, sections)).map((check) => check.id) },
  };
}

export async function runInitialEvaluation(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, book: ImportedBook, policy: LaunchPolicyProjection): Promise<Settled> {
  let progress = store.createInitialEvaluationPreparationWork(book.bookId, policy);
  while (!progress.done) progress = store.advanceInitialEvaluationPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  return runToEnd(store, owner, book.bookId, 'initial-evaluation', taskIntentId,
    store.authorizeInitialEvaluation(book.bookId, taskIntentId, prepared.planEnvelope!.digest));
}

export async function initialEvaluationCase(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, book: ImportedBook, policy: LaunchPolicyProjection, testCase: EditorialCase): Promise<StructuralObservation> {
  const settled = await runInitialEvaluation(store, owner, book, policy);
  const projection = store.inspectInitialEvaluation(book.bookId);
  const revision = projection.resultSetRevision;
  const positions = positionsOf(store, book);
  const evaluation = revision?.evaluation ?? null;
  const notes: CitedNote[] = (evaluation?.items ?? []).flatMap((item) => [
    ...item.observations.map((observation) => ({ text: observation.note, item: item.itemId, paragraphs: observation.blockIds.flatMap((id) => positions.get(id) ?? []) })),
    ...(item.comment === null ? [] : [{ text: item.comment, item: item.itemId, paragraphs: [] }]),
  ]);
  const market = evaluation?.market ?? null;
  const sections = {
    market: market === null ? '' : [...market.readers, ...market.sellingPoints, ...market.channels, market.marketReturn?.statement ?? '', market.awards?.statement ?? ''].join('\n'),
    strengths: (evaluation?.strengths ?? []).join('\n'),
    weaknesses: (evaluation?.weaknesses ?? []).join('\n'),
    nextStep: evaluation?.nextStep ?? '',
  };
  let recorded = false;
  if (projection.state === 'settled' && evaluation?.synthesis.state === 'closed') recorded = finalizeAsJ11(store, book.bookId).state === 'finalized';
  return {
    outcome: { state: projection.state, classification: projection.taskOutcome?.classification ?? null, unitsClosed: revision?.coverage.unitsClosed ?? 0,
      unitsTotal: revision?.coverage.unitsTotal ?? 0, gaps: (revision?.gaps ?? []).map((gap) => `${gap.unitOrdinal}:${gap.code}`), synthesis: evaluation?.synthesis.state ?? null },
    ...score(testCase, notes, sections),
    delivery: { kind: 'evaluation-record-finalized', recorded },
    result: {
      itemsScored: (evaluation?.items ?? []).filter((item) => item.score !== null).length,
      totalScore: (evaluation?.items ?? []).reduce((total, item) => total + (item.score ?? 0), 0),
      observations: notes.length,
      suggestedConclusion: evaluation?.suggestedConclusion ?? null,
      marketWithheld: market?.withheld.length ?? 0,
    },
    clarificationsAnswered: settled.clarificationsAnswered,
  };
}

/**
 * The 审稿意见's basis 初评 runs on its own owner, whose transport holds only the basis fixture, and the report on another: a unit
 * key differs between the two kinds only by the task contract, so one transport holding both could answer one with the other.
 */
export async function readersReportCase(store: EditorialStore, basisOwner: BaselineAnalysisExecutionOwner, reportOwner: () => BaselineAnalysisExecutionOwner,
  book: ImportedBook, policy: LaunchPolicyProjection, testCase: EditorialCase): Promise<StructuralObservation> {
  const initial = await runInitialEvaluation(store, basisOwner, book, policy);
  await basisOwner.dispose();
  const owner = reportOwner();
  if (store.inspectInitialEvaluation(book.bookId).state !== 'settled') throw new Error('EDITORIAL_CASE/report-basis-unsettled');
  finalizeAsJ11(store, book.bookId);
  let progress = store.createReadersReportPreparationWork(book.bookId, testCase.input.template as 'author' | 'editorial', policy);
  while (!progress.done) progress = store.advanceReadersReportPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  const settled = await runToEnd(store, owner, book.bookId, 'readers-report', taskIntentId,
    store.authorizeReadersReport(book.bookId, taskIntentId, prepared.planEnvelope!.digest));
  const projection = store.inspectReadersReport(book.bookId)!;
  const revision = projection.resultSetRevision;
  const report = revision?.readersReport ?? null;
  const positions = positionsOf(store, book);
  const notes: CitedNote[] = (report?.passages ?? []).map((passage) => ({ text: passage.note, passageKind: passage.kind,
    paragraphs: passage.blockIds.flatMap((id) => positions.get(id) ?? []) }));
  const sections = report?.sections === null || report?.sections === undefined ? {} : {
    overall: report.sections.overall, strengths: report.sections.strengths.join('\n'), problems: report.sections.problems.join('\n'),
    suggestions: report.sections.suggestions.join('\n'), conclusion: report.sections.conclusion,
  };
  let recorded = false;
  if (revision !== null && report?.sections !== null && report?.sections !== undefined) {
    const workspace = store.createReadersReportDraft(book.bookId, revision.revisionId);
    recorded = workspace.readersReport.templates.some((template) => template.draft !== null);
  }
  return {
    outcome: { state: projection.state, classification: projection.taskOutcome?.classification ?? null, unitsClosed: revision?.coverage.unitsClosed ?? 0,
      unitsTotal: revision?.coverage.unitsTotal ?? 0, gaps: (revision?.gaps ?? []).map((gap) => `${gap.unitOrdinal}:${gap.code}`), synthesis: report?.synthesis.state ?? null },
    ...score(testCase, notes, sections),
    delivery: { kind: 'readers-report-draft', recorded },
    result: {
      passages: notes.length,
      sections: report?.sections === null || report?.sections === undefined ? 0 : 5,
      synthesisReason: report?.synthesis.reason === null || report?.synthesis.reason === undefined ? null : report.synthesis.reason.split(/[:：\s]/u)[0]!.slice(0, 40),
      basisClarificationsAnswered: initial.clarificationsAnswered,
    },
    clarificationsAnswered: settled.clarificationsAnswered,
  };
}

export async function writingDraftCase(store: EditorialStore, owner: BaselineAnalysisExecutionOwner, book: ImportedBook, policy: LaunchPolicyProjection, testCase: EditorialCase): Promise<StructuralObservation> {
  const brief = testCase.input as { typeId: string; audience: string; channel: string; requirements: string | null };
  let progress = store.createWritingPreparationWork(book.bookId, { typeId: brief.typeId, audience: brief.audience, channel: brief.channel, requirements: brief.requirements }, policy);
  while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  const prepared = progress.projection!;
  const taskIntentId = prepared.taskIntent!.taskIntentId;
  const settled = await runToEnd(store, owner, book.bookId, 'writing', taskIntentId, store.authorizeWriting(book.bookId, taskIntentId, prepared.planEnvelope!.digest));
  const projection = store.inspectWriting(book.bookId)!;
  const revision = projection.resultSetRevision;
  const writing = revision?.writing ?? null;
  const positions = positionsOf(store, book);
  const notes: CitedNote[] = (writing?.passages ?? []).map((passage) => ({ text: passage.note, passageKind: passage.kind,
    paragraphs: passage.blockIds.flatMap((id) => positions.get(id) ?? []) }));
  const draftText = writing?.draft === null || writing?.draft === undefined ? ''
    : [writing.draft.title, ...writing.draft.sections.flatMap((section) => [section.heading, ...section.paragraphs])].join('\n');
  let recorded = false;
  if (revision !== null && writing?.draft !== null && writing?.draft !== undefined) {
    const created = store.createWritingDraft(book.bookId, revision.revisionId);
    const version = created.document.versions[0];
    if (version !== undefined) {
      const delivered = await store.recordProductionDocumentDelivery({ bookId: book.bookId, documentId: created.document.documentId,
        version: { kind: 'saved', revisionId: version.revisionId }, recipient: { kind: 'publicity', custom: null }, note: null });
      recorded = (delivered.document?.deliveries.length ?? 0) > 0;
    }
  }
  return {
    outcome: { state: projection.state, classification: projection.taskOutcome?.classification ?? null, unitsClosed: revision?.coverage.unitsClosed ?? 0,
      unitsTotal: revision?.coverage.unitsTotal ?? 0, gaps: (revision?.gaps ?? []).map((gap) => `${gap.unitOrdinal}:${gap.code}`), synthesis: writing?.synthesis.state ?? null },
    ...score(testCase, notes, { draft: draftText }),
    delivery: { kind: 'production-document-delivery', recorded },
    result: {
      passages: notes.length,
      draftGraphemes: draftText.length === 0 ? 0 : graphemeCount(draftText),
      draftSections: writing?.draft?.sections.length ?? 0,
      synthesisReason: writing?.synthesis.reason === null || writing?.synthesis.reason === undefined ? null : writing.synthesis.reason.split(/[:：\s]/u)[0]!.slice(0, 40),
    },
    clarificationsAnswered: settled.clarificationsAnswered,
  };
}
