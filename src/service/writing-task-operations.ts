import { taskDeliverableStale } from './task-deliverable-target.js';
import { TASK_MATERIAL_OFFER_DAMAGED, type TaskMaterialSource } from './task-material-references.js';
import { randomUUID } from 'node:crypto';
import type { ConfiguredProviderBinding } from './launch-policy.js';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DIGEST_PATTERN,
  StoreError,
  UUID_PATTERN,
  asNumber,
  asString,
  canonicalJson,
  requireStore,
  sha256,
  type SqlRow,
} from './store-records.js';
import {
  type InspectTaskPlanInput,
  type TaskPlanProjection,
  type ExemplarBookCursor,
  type ExemplarsProjection,
  type LaunchPolicyProjection,
  type BaselineAnalysisProjection,
  type BaselineAnalysisQuickStartProjection,
  type DefaultExecutionRulePattern,
  type MaterialPlanInputsProjection,
  type DefaultExecutionRuleProjection,
  type DefaultExecutionRuleReference,
  type TaskPlanDefaultRuleProjection,
  type WritingDraftCreatedProjection,
  type WritingProjection,
  type WritingTaskProjection,
  type WritingTaskTypeProjection,
  MAX_WRITING_AUDIENCE_GRAPHEMES,
  MAX_WRITING_CHANNEL_GRAPHEMES,
  MAX_WRITING_REQUIREMENTS_GRAPHEMES,
  MAX_WRITING_MATERIALS,
  MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES,
  MAX_WRITING_MATERIAL_GRAPHEMES,
  MAX_WRITING_MATERIAL_OFFERS,
  WRITING_KIND,
  WRITING_LIVE_UNAVAILABLE,
  WRITING_MATERIAL_LIVE_UNAVAILABLE,
  WRITING_MODE_GOALS,
} from '../shared/protocol.js';
import { liveMaterialRule } from './analysis/live-kind-admission.js';
import {
  MAX_WRITING_CHARACTERS,
  MAX_WRITING_EXEMPLARS_REFERENCED as MAX_WRITING_EXEMPLARS,
  MAX_WRITING_SYNOPSIS_GRAPHEMES,
  WRITING_COST_BEFORE_PLAN,
  WRITING_DRAFT_PARSER_IDENTITY,
  WRITING_EXEMPLAR_MOVED,
  WRITING_FIELD_CONTROL,
  WRITING_NEEDS_MANUSCRIPT,
  WRITING_NOT_DO,
  WRITING_SEND_CONSEQUENCE,
  WRITING_LIVE_SEND_CONSEQUENCE,
  WRITING_MATERIALS_NONE,
  WRITING_MATERIALS_STATEMENT,
  WRITING_MATERIALS_TOO_MANY,
  WRITING_QUICK_START_MATERIALS,
  WRITING_RULE_MATERIALS,
  WritingTaskError,
  WritingTasks,
  graphemeLength,
  writingMaterialDigest,
  writingMaterialOverBound,
  writingMaterialOverBoundNamed,
  writingMaterialParagraph,
  writingMaterialsOverTotal,
  readWritingExemplarWords,
  writingExemplarDigest,
  writingBlockLength,
  writingDocumentExists,
  writingDraftBlocks,
  writingNotForThisBook,
  writingWords,
  type StoredWritingTask,
  type WritingExemplarSource,
  type WritingMaterialReading,
  type WritingMaterialSource,
} from './writing-tasks.js';
import { writingKindDefinition, writingRecordedKindDefinition } from './writing/writing-kind.js';
import { liveWritingRule } from './writing/live-writing-admission.js';
import {
  WRITING_COPY_RULES,
  writingExemplarLine,
  type WritingCopyRules,
  type WritingBookInput,
  type WritingContractInput,
  type WritingEvaluationInput,
  type WritingExemplarInput,
  type WritingMaterialInput,
  type WritingSynopsisInput,
} from './writing/writing-contract.js';
import {
  AnalysisError,
  BaselineAnalysisStore,
  activeRunReason,
  runIsActive,
  type AnalysisPreparationResult,
  type ProgressReader,
} from './analysis/baseline-analysis-store.js';
import type { TaskPlanConnectivity } from './connectivity.js';
import { RecentCache } from './recent-cache.js';
import { writingTaskStateLabel, noDefaultRule } from './task-plan.js';
import {
  DefaultExecutionRuleLedger,
  QUICK_START_DEVELOPER_LIVE,
  QUICK_START_NEEDS_CONNECTION,
  QUICK_START_NOT_READY,
  QUICK_START_OFFLINE,
  QUICK_START_PLAN_CHANGED,
  QUICK_START_RULE_CHANGED,
  QUICK_START_RESEND,
  SET_RULE_DEVELOPER_LIVE,
  defaultExecutionRuleBindingOf,
  writingRuleOtherTypeReason,
  writingRulePattern,
  writingRuleTypeLabel,
  defaultExecutionRuleDrift,
  defaultExecutionRuleReference,
  quickStartNoRuleReason,
  ruleDriftReason,
  type DefaultExecutionRuleRecord,
} from './default-execution-rules.js';
import { BookPeople } from './book-people.js';
import { LibraryMaterialLedger } from './library-materials.js';
import {
  MaterialIndexLedger,
  type MaterialReferenceBoundary,
  type MaterialReferencePin,
  type MaterialTaskReading,
} from './material-index.js';
import { EvaluationError, EvaluationRecords } from './evaluation-records.js';
import { SeriesLedger } from './series.js';
import { ImportedExemplarError } from './imported-exemplars.js';
import { ProductionDocumentWorkflow } from './production-document-workflow.js';
import { ProductionDocuments } from './production-documents.js';
import { productionDocumentType } from './production-document-types.js';
import { BoundedManuscriptStore } from './bounded-manuscript.js';
import {
  REVIEW_CATEGORY_CACHE_CAPACITY,
  type DraftPromotion,
  type LedgerTaskKind,
  type StoreControl,
  type WritingExemplarScan,
  writingExemplarStatement,
} from './store-operation-support.js';

export interface WritingTaskOperationsHost {
  analysisCall: <T>(operation: () => T) => T;
  assertAvailable: () => void;
  readonly authority: DatabaseSync;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly bookPeople: BookPeople;
  readonly boundedAuthority: BoundedManuscriptStore;
  boundedCall: <T>(operation: () => T) => T;
  readonly control: StoreControl;
  documentCall: <T>(operation: () => T) => T;
  readonly documentWorkflow: ProductionDocumentWorkflow;
  evaluationCall: <T>(operation: () => T) => T;
  readonly evaluations: EvaluationRecords;
  importedCall: <T>(operation: () => T) => T;
  indexedMaterialOffers: (bookId: string) => Array<{ materialId: string; title: string; scope: 'book' | 'house'; characters: number; damaged: boolean }>;
  ledgerTaskOf: (kind: LedgerTaskKind, bookId: string, taskIntentId: string) => BaselineAnalysisStore;
  libraryCall: <T>(operation: () => T) => T;
  readonly libraryMaterials: LibraryMaterialLedger;
  readonly materialIndex: MaterialIndexLedger;
  materialIndexCall: <T>(operation: () => T) => T;
  peopleCall: <T>(operation: () => T) => T;
  readonly productionDocuments: ProductionDocuments;
  requireLedgerKindScope: (kind: LedgerTaskKind, bookId: string, taskIntentId: string) => void;
  ruleCall: <T>(operation: () => T) => T;
  ruleOffer: (bookId: string, pattern: DefaultExecutionRulePattern, plan: {
      planEnvelope: NonNullable<BaselineAnalysisProjection['planEnvelope']>;
      planVersion: NonNullable<BaselineAnalysisProjection['planVersion']>;
      planRevision: BaselineAnalysisProjection['planRevision'];
    }, kindReason: string | null, startedBy: DefaultExecutionRuleReference | null) => TaskPlanDefaultRuleProjection;
  ruleProjection: (record: DefaultExecutionRuleRecord) => DefaultExecutionRuleProjection;
  ruleStartedBy: (bookId: string, kind: DefaultExecutionRuleRecord['taskKind'], authorization: BaselineAnalysisProjection['authorization'], pattern?: DefaultExecutionRulePattern | null) => DefaultExecutionRuleReference | null;
  readonly rules: DefaultExecutionRuleLedger;
  readonly series: SeriesLedger;
  seriesCall: <T>(operation: () => T) => T;
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  readonly writingExemplarCache: Map<string, WritingExemplarScan>;
  readonly writingLedgers: RecentCache<BaselineAnalysisStore>;
  readonly writingRevisionDrafts: Map<string, { typeId: string; drafted: boolean }>;
  readonly writingTasks: WritingTasks;
  readonly writingWork: Map<string, BaselineAnalysisStore>;
  inspectExemplars: (after: ExemplarBookCursor | null, damaged?: Array<{ typeId: string; title: string }>) => ExemplarsProjection;
  inspectTaskPlanWithConnection: (input: InspectTaskPlanInput, credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>, connectivity?: TaskPlanConnectivity, progress?: ProgressReader) => Promise<TaskPlanProjection>;
  inspectWritingTask: (bookId: string) => WritingTaskProjection;
  pinMaterialReference: (bookId: string, materialId: string) => MaterialReferencePin;
  readMaterialIndexForTask: (boundary: MaterialReferenceBoundary, materialId: string, from: number) => MaterialTaskReading;
}

export function internalWritingLedger(host: WritingTaskOperationsHost, input: WritingContractInput, rules: WritingCopyRules = WRITING_COPY_RULES, sources?: ReadonlyArray<TaskMaterialSource>): BaselineAnalysisStore {
  const definition = host.analysisCall(() => writingKindDefinition(input, rules, sources));
  const key = sources === undefined ? definition.promptContractDigest : `${definition.promptContractDigest}:${canonicalJson(sources)}`;
  return host.writingLedgers.obtain(key, () => {
    const ledger = new BaselineAnalysisStore(host.authority, host.boundedAuthority, host.control.baselineAnalysisRoute, definition);
    ledger.bindLaunch(host.baselineAnalysis.launch);
    return ledger;
  });
}

export function internalWritingLedgerOf(host: WritingTaskOperationsHost, task: StoredWritingTask): BaselineAnalysisStore {
  // A Task recorded under `/1` is run and judged under `/1` (#704 P2-2).
  const material = task.materials.find((entry) => entry.refusal !== null)?.refusal ?? null;
  if (task.exemplarsReadable && material === null) return internalWritingLedger(host, task.input, task.copyRules, task.materials.length === 0 ? undefined : task.materials.map((entry) => entry.source));
  // …and one whose 资料库 item no longer reads at its pinned build refuses as one whose 范例 is gone does (Issue #428).
  const moved = task.exemplarsReadable && material !== null ? material : { code: 'WRITING_EXEMPLAR_MOVED', message: WRITING_EXEMPLAR_MOVED };
  const definition = host.analysisCall(() => writingRecordedKindDefinition(task.input, task.promptContractSha256, task.copyRules, moved));
  return host.writingLedgers.obtain(`${task.promptContractSha256}:recorded:${moved.code}`, () => {
    const ledger = new BaselineAnalysisStore(host.authority, host.boundedAuthority, host.control.baselineAnalysisRoute, definition);
    ledger.bindLaunch(host.baselineAnalysis.launch);
    return ledger;
  });
}

export function internalWritingCall<T>(host: WritingTaskOperationsHost, operation: () => T): T {
  host.assertAvailable();
  try {
    return operation();
  } catch (error) {
    if (error instanceof WritingTaskError || error instanceof AnalysisError || error instanceof EvaluationError || error instanceof ImportedExemplarError) {
      throw new StoreError(error.code, error.message);
    }
    throw error;
  }
}

export function internalWritingTaskOf(host: WritingTaskOperationsHost, taskIntentId: string): { task: StoredWritingTask; ledger: BaselineAnalysisStore } | null {
  let task = internalWritingCall(host, () => host.writingTasks.task(taskIntentId));
  if (task === null) return null;
  let ledger = internalWritingLedgerOf(host, task);
  const planContract = internalWritingCall(host, () => host.writingTasks.planContract(taskIntentId));
  if (planContract !== null && planContract !== task.promptContractSha256) {
    task = internalWritingCall(host, () => host.writingTasks.task(taskIntentId, planContract));
    requireStore(task !== null, 'WRITING_RECORD_INVALID', '写作任务的计划与它的记录不一致。');
    ledger = internalWritingLedgerOf(host, task);
  }
  return { task, ledger };
}

export function internalLatestWriting(host: WritingTaskOperationsHost, bookId: string, progress?: ProgressReader): { task: StoredWritingTask; ledger: BaselineAnalysisStore; projection: WritingProjection } | null {
  const intentId = internalWritingCall(host, () => host.writingTasks.latestTaskIntentId(bookId));
  if (intentId === null) return null;
  const found = internalWritingTaskOf(host, intentId);
  if (found === null) return null;
  const projection = host.analysisCall(() => found.ledger.inspect(bookId, progress)) as WritingProjection;
  return { ...found, projection };
}

export function inspectWriting(host: WritingTaskOperationsHost, bookId: string, progress?: ProgressReader): WritingProjection | null {
  host.assertAvailable();
  return internalLatestWriting(host, bookId, progress)?.projection ?? null;
}

export function internalRequireWritingScope(host: WritingTaskOperationsHost): void {
  host.assertAvailable();
  if (internalWritingLiveUnavailable(host)) throw new StoreError('WRITING_UNAVAILABLE', WRITING_LIVE_UNAVAILABLE);
}

export function internalWritingLiveUnavailable(host: WritingTaskOperationsHost): boolean {
  const launch = host.baselineAnalysis.launch;
  return launch.live !== null && liveWritingRule(launch.policy, launch.live) === null;
}

export function internalRequireWritingMaterialScope(host: WritingTaskOperationsHost, listsMaterials: boolean): void {
  host.assertAvailable();
  const launch = host.baselineAnalysis.launch;
  if (listsMaterials && launch.live !== null && liveMaterialRule(launch.policy, WRITING_KIND) === null) throw new StoreError('WRITING_UNAVAILABLE', WRITING_MATERIAL_LIVE_UNAVAILABLE);
}

export function internalReadWritingMaterial(host: WritingTaskOperationsHost, bookId: string, source: Pick<WritingMaterialSource, 'materialId' | 'indexDigest'>): WritingMaterialReading {
  const boundary = { bookId, references: [{ materialId: source.materialId, indexDigest: source.indexDigest }] };
  const paragraphs: string[] = [];
  try {
    for (let from: number | null = 1; from !== null;) {
      const page = host.readMaterialIndexForTask(boundary, source.materialId, from);
      for (const segment of page.segments) paragraphs.push(segment.text);
      from = page.next;
    }
  } catch (error) {
    // Every seam refusal is handed on in its code; the ledger (`WritingTasks.#pinnedMaterial`) alone tells a moved or unavailable
    // item from a corrupt record, which it throws.
    if (error instanceof StoreError && /^(?:MATERIAL_|LIBRARY_MATERIAL_)/u.test(error.code)) return { refusal: { code: error.code, message: error.message } };
    throw error;
  }
  return { paragraphs };
}

export function internalWritingMaterials(host: WritingTaskOperationsHost, bookId: string, materialIds: ReadonlyArray<string>): Array<{ input: WritingMaterialInput; source: WritingMaterialSource }> {
  requireStore(materialIds.length <= MAX_WRITING_MATERIALS, 'WRITING_MATERIALS_INVALID', WRITING_MATERIALS_TOO_MANY);
  let total = 0;
  const found = materialIds.map((materialId) => {
    const original = host.libraryCall(() => host.libraryMaterials.original(materialId));
    const title = writingWords(original.title, 200);
    let pin: MaterialReferencePin;
    try {
      pin = host.pinMaterialReference(bookId, materialId);
    } catch (error) {
      if (error instanceof StoreError) throw new StoreError(error.code, `资料《${title}》：${error.message}`);
      throw error;
    }
    const build = host.materialIndexCall(() => host.materialIndex.current(materialId));
    requireStore(build !== null && build.sha256 === pin.indexDigest, 'MATERIAL_INDEX_MOVED', `资料《${title}》：计划冻结的这份资料的索引版本已不在本机。`);
    const characters = build.metadata.characters;
    requireStore(characters <= MAX_WRITING_MATERIAL_GRAPHEMES, 'WRITING_MATERIAL_OVER_BOUND', writingMaterialOverBoundNamed(title, characters));
    total += characters;
    return { materialId, title, pin, characters };
  });
  requireStore(total <= MAX_WRITING_MATERIALS_TOTAL_GRAPHEMES, 'WRITING_MATERIAL_OVER_BOUND', writingMaterialsOverTotal(total));
  return found.map(({ materialId, title, pin, characters }) => {
    const read = internalReadWritingMaterial(host, bookId, pin);
    if ('refusal' in read) throw new StoreError(read.refusal.code, `资料《${title}》：${read.refusal.message}`);
    const paragraphs = read.paragraphs.map(writingMaterialParagraph).filter((paragraph) => paragraph.length > 0);
    requireStore(paragraphs.length > 0, 'MATERIAL_INDEX_NO_TEXT', `资料《${title}》：这份资料没有提取出可分段的文字。`);
    return {
      input: { title, paragraphs },
      source: { materialId, indexDigest: pin.indexDigest, title, characters, sha256: writingMaterialDigest(paragraphs) },
    };
  });
}

export function internalWritingMaterialOffer(host: WritingTaskOperationsHost, bookId: string): WritingTaskProjection['references']['materials'] {
  const launch = host.baselineAnalysis.launch;
  const live = launch.live !== null && liveMaterialRule(launch.policy, WRITING_KIND) === null;
  let indexed: Array<{ materialId: string; title: string; scope: 'book' | 'house'; characters: number; damaged: boolean }>;
  try {
    indexed = host.indexedMaterialOffers(bookId);
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    return { statement: `资料库暂不可用：${error.message}`, items: [], more: 0 };
  }
  const shown = indexed.slice(0, MAX_WRITING_MATERIAL_OFFERS);
  return {
    statement: live ? WRITING_MATERIAL_LIVE_UNAVAILABLE : indexed.length === 0 ? WRITING_MATERIALS_NONE : WRITING_MATERIALS_STATEMENT,
    items: shown.map((item) => {
      const reason = live ? WRITING_MATERIAL_LIVE_UNAVAILABLE : item.damaged ? TASK_MATERIAL_OFFER_DAMAGED
        : item.characters > MAX_WRITING_MATERIAL_GRAPHEMES ? writingMaterialOverBound(item.characters) : null;
      return { materialId: item.materialId, title: item.title, characters: item.characters, scope: item.scope, selectable: reason === null, reason };
    }),
    more: indexed.length - shown.length,
  };
}

export function internalWritingBook(host: WritingTaskOperationsHost, bookId: string): WritingBookInput {
  const book = host.authority.prepare('SELECT title FROM books WHERE book_id = ?').get(bookId) as SqlRow | undefined;
  requireStore(book !== undefined, 'BOOK_NOT_FOUND', '图书不存在。');
  const people = host.peopleCall(() => host.bookPeople.current(bookId));
  const series = host.seriesCall(() => host.series.seriesOf(bookId)).memberships.map((membership) => membership.title);
  return {
    title: asString(book.title),
    authors: people.authors.slice(0, 20).map((name) => writingWords(name, 80)),
    editors: people.editors.slice(0, 20).map((name) => writingWords(name, 80)),
    series: series.slice(0, 20).map((title) => writingWords(title, 120)),
  };
}

export function internalWritingSynopsis(host: WritingTaskOperationsHost, bookId: string): { input: WritingSynopsisInput; revisionId: string; ordinal: number } | null {
  const baseline = host.analysisCall(() => host.baselineAnalysis.inspect(bookId)) as BaselineAnalysisProjection;
  const revision = baseline.resultSetRevision;
  if (revision === null) return null;
  const synopsis = writingWords(revision.synthesis.synopsis, MAX_WRITING_SYNOPSIS_GRAPHEMES);
  if (synopsis.length === 0) return null;
  return {
    revisionId: revision.revisionId,
    ordinal: revision.ordinal,
    input: {
      text: synopsis,
      excerpt: graphemeLength(revision.synthesis.synopsis.trim()) > MAX_WRITING_SYNOPSIS_GRAPHEMES,
      characters: revision.synthesis.entities
        .filter((entity) => entity.kind === 'person' && writingWords(entity.name, 80).length > 0)
        .slice(0, MAX_WRITING_CHARACTERS)
        .map((entity) => {
          const note = entity.note === null ? '' : writingWords(entity.note, 300);
          return { name: writingWords(entity.name, 80), note: note.length === 0 ? null : note };
        }),
    },
  };
}

export function internalWritingEvaluation(host: WritingTaskOperationsHost, bookId: string): { input: WritingEvaluationInput; recordId: string; ordinal: number } | null {
  const finalized = host.evaluationCall(() => host.evaluations.latestFinalized(bookId));
  if (finalized === null) return null;
  const conclusion = finalized.profile.conclusions.find((entry) => entry.conclusion === finalized.content.conclusion);
  requireStore(conclusion !== undefined, 'WRITING_RECORD_INVALID', '定稿的评估没有结论。');
  const lines = (list: ReadonlyArray<string>, most: number): string[] =>
    list.map((entry) => writingWords(entry, 400)).filter((entry) => entry.length > 0).slice(0, most);
  const market = finalized.initial?.market ?? null;
  return {
    recordId: finalized.recordId,
    ordinal: finalized.ordinal,
    input: {
      conclusion: conclusion.label,
      strengths: lines(finalized.content.strengths, 20),
      market: market === null ? null : { readers: lines(market.readers, 5), sellingPoints: lines(market.sellingPoints, 5), channels: lines(market.channels, 5) },
    },
  };
}

export function internalWritingExemplars(host: WritingTaskOperationsHost, bookId: string, typeId: string): Array<{ input: WritingExemplarInput; source: WritingExemplarSource }> {
  return internalWritingExemplarsByType(host, bookId, [typeId]).found.get(typeId) ?? [];
}

export function internalWritingExemplarsByType(host: WritingTaskOperationsHost, bookId: string, typeIds: ReadonlyArray<string>): WritingExemplarScan {
  const damaged = new Map(typeIds.map((typeId) => [typeId, [] as string[]]));
  const found = new Map(typeIds.map((typeId) => [typeId, [] as Array<{ input: WritingExemplarInput; source: WritingExemplarSource }>]));
  const full = (): boolean => [...found.values()].every((list) => list.length >= MAX_WRITING_EXEMPLARS);
  let after: ExemplarBookCursor | null = null;
  do {
    // A damaged imported version is named and skipped, never raised (Issue #789): the rest of the Book stays offered.
    const unread: Array<{ typeId: string; title: string }> = [];
    const page: ExemplarsProjection = host.inspectExemplars(after, unread);
    for (const entry of unread) {
      if (!damaged.has(entry.typeId)) continue;
      const names = damaged.get(entry.typeId)!;
      names.push(entry.title);
    }
    for (const book of page.books) {
      if (book.bookId === bookId) continue;
      for (const [typeId, list] of found) {
        if (list.length >= MAX_WRITING_EXEMPLARS) continue;
        const exemplar = book.exemplars.find((entry) => entry.typeId === typeId);
        if (exemplar === undefined || exemplar.eligibility !== 'house-only') continue;
        // Its text as the contract takes it, read from its own revision, and the reference that pins it with the facts the
        // plan names it by.
        const words = host.importedCall(() => readWritingExemplarWords(host.authority, exemplar.revisionId));
        if (words === null) continue;
        const input: WritingExemplarInput = { bookTitle: writingWords(book.bookTitle, 200), version: exemplar.version, text: words.text, excerpt: words.excerpt };
        list.push({
          input,
          source: {
            documentId: exemplar.documentId, revisionId: exemplar.revisionId, bookId: book.bookId,
            bookTitle: input.bookTitle, version: input.version, excerpt: input.excerpt, sha256: writingExemplarDigest(words.text),
          },
        });
      }
    }
    after = page.nextCursor;
  } while (after !== null && !full());
  return { found, damaged };
}

export function internalWritingField(host: WritingTaskOperationsHost, value: unknown, most: number, missing: string, field: string): string {
  requireStore(typeof value === 'string', 'WRITING_INVALID', `${field}无效。`);
  const words = value.normalize('NFC').trim();
  requireStore(words.length > 0, 'WRITING_FIELD_REQUIRED', missing);
  requireStore(words.isWellFormed() && !WRITING_FIELD_CONTROL.test(words) && graphemeLength(words) <= most, 'WRITING_FIELD_INVALID',
      `${field}最多 ${most} 个字，只能写在一行里。`);
  return words;
}

export function createWritingPreparationWork(host: WritingTaskOperationsHost, bookId: string, request: { typeId: string; audience: string; channel: string; requirements: string | null; materialIds?: ReadonlyArray<string> }, launchPolicy: LaunchPolicyProjection, redoOf: string | null = null, intentDraft: DraftPromotion | null = null): AnalysisPreparationResult<WritingProjection> {
  // 允许参考's 资料库 items the editor ticked (Issue #428): each once, by identity.
  const materialIds = request.materialIds ?? [];
  requireStore(Array.isArray(materialIds) && materialIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) &&
    new Set(materialIds).size === materialIds.length, 'WRITING_INVALID', '写作任务参数无效。');
  internalRequireWritingMaterialScope(host, materialIds.length > 0);
  internalRequireWritingScope(host);
  requireStore(UUID_PATTERN.test(bookId), 'WRITING_INVALID', '写作任务参数无效。');
  const type = productionDocumentType(request.typeId);
  requireStore(type !== undefined, 'WRITING_TYPE_INVALID', '这个文档类型不在本社的类型配置中。');
  const audience = internalWritingField(host, request.audience, MAX_WRITING_AUDIENCE_GRAPHEMES, '请写下这份文档的受众。', '受众');
  const channel = internalWritingField(host, request.channel, MAX_WRITING_CHANNEL_GRAPHEMES, '请写下这份文档的渠道。', '渠道');
  const requirements = request.requirements === null || request.requirements.trim().length === 0
    ? null
    : internalWritingField(host, request.requirements, MAX_WRITING_REQUIREMENTS_GRAPHEMES, '', '其他要求');
  const primary = host.authority.prepare("SELECT 1 FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(bookId);
  requireStore(primary !== undefined, 'WRITING_NEEDS_MANUSCRIPT', WRITING_NEEDS_MANUSCRIPT);
  requireStore(intentDraft?.deliverable !== undefined || host.documentCall(() => host.productionDocuments.documentOfType(bookId, type.typeId)) === undefined,
      'WRITING_DOCUMENT_EXISTS', writingDocumentExists(type.label));
  requireStore(!host.documentCall(() => host.productionDocuments.notForThisBook(bookId, type.typeId)),
      'WRITING_NOT_FOR_THIS_BOOK', writingNotForThisBook(type.label));
  const latest = internalLatestWriting(host, bookId);
  requireStore(!runIsActive(latest?.projection.run?.state ?? null), 'WRITING_UNAVAILABLE', activeRunReason(latest?.projection.run?.state ?? null, WRITING_KIND));
  const synopsis = internalWritingSynopsis(host, bookId);
  const evaluation = internalWritingEvaluation(host, bookId);
  const exemplars = internalWritingExemplars(host, bookId, type.typeId);
  const materials = internalWritingMaterials(host, bookId, materialIds);
  const input: WritingContractInput = {
    type: { typeId: type.typeId, label: type.label },
    ...(intentDraft?.deliverable === undefined ? {} : { deliverable: intentDraft.deliverable }),
    // The writing policy retains house-person redaction. Freeze no editor names into a live prompt.
    book: { ...internalWritingBook(host, bookId), ...(host.baselineAnalysis.launch.live === null ? {} : { editors: [] }) },
    audience,
    channel,
    requirements,
    synopsis: synopsis?.input ?? null,
    evaluation: evaluation?.input ?? null,
    exemplars: exemplars.map((exemplar) => exemplar.input),
    // A Task that lists 资料库 items is `/3`; one that lists none has no `materials` at all and stays `/2` (Issue #428).
    ...(materials.length === 0 ? {} : { materials: materials.map((material) => material.input) }),
  };
  // `/2` for every Task prepared by the product; the suites may prepare one under `/1`, as software before #698 did (#707).
  const copyRules = host.control.writingCopyRules ?? WRITING_COPY_RULES;
  const ledger = internalWritingLedger(host, input, copyRules, materials.length === 0 ? undefined : materials.map((material) => material.source));
  const mode = latest === null || latest.projection.resultSetRevision === null ? 'writing-first' : 'writing-again';
  // The pins are no words of the contract (Issue #428): a prepared Task that froze other builds of the items — one whose build is
  // gone, say — is never revised in place to these, since its row would keep its own; 改计划重做 makes a Task of its own.
  const pins = (list: ReadonlyArray<Pick<WritingMaterialSource, 'materialId' | 'indexDigest'>>): string =>
    list.map((source) => `${source.materialId}:${source.indexDigest}`).join(',');
  const newTask = latest !== null && pins(latest.task.materials.map((material) => material.source)) !== pins(materials.map((material) => material.source));
  const recordWritingTask = (taskIntentId: string): void => {
    internalWritingCall(host, () => host.writingTasks.recordTask({
      taskIntentId, bookId, evaluationRecordId: evaluation?.recordId ?? null, baselineRevisionId: synopsis?.revisionId ?? null,
      exemplarSources: exemplars.map((exemplar) => exemplar.source), materialSources: materials.map((material) => material.source),
      contract: input, promptContractSha256: ledger.definition.promptContractDigest, copyRules,
    }));
  };
  const result = host.analysisCall(() => ledger.prepare({
    phase: 'start',
    bookId,
    goal: intentDraft === null ? WRITING_MODE_GOALS[mode] : intentDraft.goal as typeof WRITING_MODE_GOALS[typeof mode],
    redoOf,
    update: mode === 'writing-first' ? null : { mode, selectedRange: null },
    reconfirm: false,
    launchPolicy,
    ...(newTask ? { newTask } : {}),
    ...(intentDraft === null ? {} : {
      intentDraft: { ...intentDraft, promoted: (taskIntentId: string) => {
        recordWritingTask(taskIntentId);
        intentDraft.promoted({ taskIntentId, reviewRunId: null });
      } },
    }),
  }));
  // Which type, words and reference set the Task drafts from, recorded once for it and this contract.
  if (intentDraft === null) {
    const taskIntentId = internalWritingCall(host, () => host.writingTasks.latestTaskIntentId(bookId));
    requireStore(taskIntentId !== null, 'WRITING_RECORD_INVALID', '写作任务没有准备出来。');
    host.transaction(host.authority, () => recordWritingTask(taskIntentId));
  }
  if (result.workId !== null) host.writingWork.set(result.workId, ledger);
  return { ...result, projection: result.projection as WritingProjection | null };
}

export function advanceWritingPreparationWork(host: WritingTaskOperationsHost, workId: string): AnalysisPreparationResult<WritingProjection> {
  host.assertAvailable();
  const ledger = host.writingWork.get(workId);
  requireStore(ledger !== undefined, 'ANALYSIS_PREPARATION_NOT_FOUND', '写作任务的计划准备已不存在。');
  let result: AnalysisPreparationResult<unknown>;
  try {
    result = host.analysisCall(() => ledger.prepare({ phase: 'advance', workId }));
  } catch (error) {
    // A preparation that failed is over: nothing holds its work any more (#688 review).
    host.writingWork.delete(workId);
    throw error;
  }
  if (result.done) host.writingWork.delete(workId);
  return { ...result, projection: result.projection as WritingProjection | null };
}

export function cancelWritingPreparationWork(host: WritingTaskOperationsHost, workId: string): boolean {
  const ledger = host.writingWork.get(workId);
  if (ledger === undefined) return false;
  host.writingWork.delete(workId);
  host.analysisCall(() => ledger.prepare({ phase: 'cancel', workId }));
  return true;
}

export function authorizeWriting(host: WritingTaskOperationsHost, bookId: string, taskIntentId: string, planEnvelopeDigest: string, start: 'now' | 'when-online' | 'idle' = 'now'): { dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore } {
  host.requireLedgerKindScope('writing', bookId, taskIntentId);
  const ledger = host.ledgerTaskOf('writing', bookId, taskIntentId);
  const target = internalWritingTaskOf(host, taskIntentId)?.task.input.deliverable;
  requireStore(target === undefined || !taskDeliverableStale(host.authority, bookId, target), 'TASK_INTENT_DRAFT_DELIVERABLE_STALE', '交付物已有新版本；请重新发起任务。');
  const authorized = host.analysisCall(() => ledger.authorize(bookId, taskIntentId, planEnvelopeDigest, start));
  return { dispatchRunRecordId: authorized.dispatchRunRecordId, ledger };
}

export function reconcileStoppedWritingRuns(host: WritingTaskOperationsHost): { settled: number } {
  host.assertAvailable();
  const any = internalWritingCall(host, () => host.writingTasks.anyTask());
  if (any === null) return { settled: 0 };
  return { settled: host.analysisCall(() => internalWritingLedgerOf(host, any).reconcileStoppedRuns()).settled };
}

export function internalWritingDrafted(host: WritingTaskOperationsHost, bookId: string): Map<string, { revisionId: string; createdAt: string }> {
  const drafted = new Map<string, { revisionId: string; createdAt: string }>();
  for (const revision of internalWritingCall(host, () => host.writingTasks.revisions(bookId))) {
    // Whether a revision holds a draft never changes, so each is read once while the store is open (#688 re-review).
    let known = host.writingRevisionDrafts.get(revision.revisionId);
    if (known === undefined) {
      const found = internalWritingTaskOf(host, revision.taskIntentId);
      if (found === null) continue;
      const inspected = host.analysisCall(() => found.ledger.inspect(bookId, undefined, revision.revisionId)) as WritingProjection;
      const draft = inspected.inspectedRevision?.revision.writing.draft;
      known = { typeId: found.task.typeId, drafted: draft != null && draft.usable !== false };
      if (host.writingRevisionDrafts.size >= 1024) host.writingRevisionDrafts.clear();
      host.writingRevisionDrafts.set(revision.revisionId, known);
    }
    if (known.drafted && !drafted.has(known.typeId)) drafted.set(known.typeId, { revisionId: revision.revisionId, createdAt: revision.createdAt });
  }
  return drafted;
}

export function internalWritingRefusal(host: WritingTaskOperationsHost, projection: WritingProjection): string | null {
  const revision = projection.resultSetRevision;
  if (revision === null || projection.taskOutcome === null || projection.taskOutcome.resultSetRevisionId !== revision.revisionId ||
      revision.writing.draft !== null && revision.writing.draft.usable !== false) return null;
  if (revision.writing.draft?.usable === false) return '这份草稿与参考内容过于接近，不能采用。';
  return revision.writing.synthesis.reason;
}

export function inspectWritingTask(host: WritingTaskOperationsHost, bookId: string): WritingTaskProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
  const book = internalWritingBook(host, bookId);
  const manuscript = host.authority.prepare(
      `SELECT count(*) AS blocks FROM working_blocks wb JOIN manuscript_branches mb ON mb.branch_id = wb.branch_id
       JOIN manuscripts m ON m.manuscript_id = mb.manuscript_id AND m.role = 'primary' WHERE m.book_id = ?`,
  ).get(bookId) as SqlRow;
  const blocks = asNumber(manuscript.blocks);
  let unavailable: string | null = internalWritingLiveUnavailable(host) ? WRITING_LIVE_UNAVAILABLE
    : blocks === 0 ? WRITING_NEEDS_MANUSCRIPT : null;
  let latest: { task: StoredWritingTask; ledger: BaselineAnalysisStore; projection: WritingProjection } | null = null;
  let drafted = new Map<string, { revisionId: string; createdAt: string }>();
  try {
    latest = internalLatestWriting(host, bookId);
    drafted = internalWritingDrafted(host, bookId);
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    unavailable = `写作任务暂不可用：${error.message}`;
  }
  // What a draft would reference: a Book whose manuscript no analysis may read, or whose records no longer read, says why.
  let synopsis: { input: WritingSynopsisInput; revisionId: string; ordinal: number } | null = null;
  let evaluation: { input: WritingEvaluationInput; recordId: string; ordinal: number } | null = null;
  try {
    synopsis = blocks === 0 ? null : internalWritingSynopsis(host, bookId);
    evaluation = internalWritingEvaluation(host, bookId);
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    unavailable ??= `写作任务暂不可用：${error.message}`;
  }
  const documents = host.documentCall(() => host.productionDocuments.documents(bookId, blocks > 0));
  const runState = latest?.projection.run?.state ?? null;
  // The house's 范例 of every type in one pass — read again only when no writing Task is under way; a record that no longer
  // reads says so, as any other part does.
  let exemplarsByType: WritingExemplarScan = { found: new Map(), damaged: new Map() };
  const cached = runIsActive(runState) ? host.writingExemplarCache.get(bookId) : undefined;
  if (cached !== undefined) exemplarsByType = cached;
  else {
    try {
      exemplarsByType = internalWritingExemplarsByType(host, bookId, documents.types.map((type) => type.typeId));
      if (host.writingExemplarCache.size >= REVIEW_CATEGORY_CACHE_CAPACITY) host.writingExemplarCache.clear();
      host.writingExemplarCache.set(bookId, exemplarsByType);
    } catch (error) {
      if (!(error instanceof StoreError)) throw error;
      unavailable ??= `写作任务暂不可用：${error.message}`;
    }
  }
  const named = (list: ReadonlyArray<string>, none: string): string => (list.length === 0 ? none : list.join('、'));
  // What each type's 快速开始 compares its rule with, read once and only when some type has one.
  let ruleFacts: { facts: MaterialPlanInputsProjection } | { reason: string } | null = null;
  const facts = () => (ruleFacts ??= internalWritingRuleFacts(host, bookId, latest));
  return {
    bookId,
    unavailable,
    references: {
      synopsis: synopsis === null
        ? '本书尚无基线分析，本次不参考梗概与人物'
        : `基线分析第 ${synopsis.ordinal} 版的梗概${synopsis.input.excerpt ? '（节选开头）' : ''}与 ${synopsis.input.characters.length} 位人物`,
      evaluation: evaluation === null
        ? '本书尚无定稿的评估，本次不参考评估结论与营销要点'
        : `第 ${evaluation.ordinal} 版定稿评估的结论「${evaluation.input.conclusion}」、主要优点${evaluation.input.market === null ? '（这一版没有 AI7 初评的市场部分）' : '与营销要点（目标读者、差异化卖点、渠道与策略）'}`,
      book: `《${book.title}》 · 作者：${named(book.authors, '未填写')} · 责编：${named(book.editors, '未填写')} · 书系：${named(book.series, '不在任何书系中')}`,
      materials: internalWritingMaterialOffer(host, bookId),
    },
    consequences: {
      read: blocks === 0 ? '这本书还没有稿件。' : `当前稿件的全部 ${blocks} 个段落，以及上面列出的参考材料`,
      send: host.baselineAnalysis.launch.live === null || internalWritingLiveUnavailable(host) ? WRITING_SEND_CONSEQUENCE : WRITING_LIVE_SEND_CONSEQUENCE,
      notDo: WRITING_NOT_DO,
      cost: WRITING_COST_BEFORE_PLAN,
    },
    types: documents.types.map((type): WritingTaskTypeProjection => {
      const exemplars: WritingExemplarInput[] = (exemplarsByType.found.get(type.typeId) ?? []).map((exemplar) => exemplar.input);
      const unread = exemplarsByType.damaged.get(type.typeId) ?? [];
      const prepare: WritingTaskTypeProjection['prepare'] =
        unavailable !== null ? { allowed: false, reason: unavailable }
        : type.document !== null ? { allowed: false, reason: writingDocumentExists(type.label) }
        : type.notForThisBook ? { allowed: false, reason: writingNotForThisBook(type.label) }
        : runIsActive(runState) ? { allowed: false, reason: activeRunReason(runState, WRITING_KIND) }
        : { allowed: true, mode: latest === null || latest.projection.resultSetRevision === null ? 'writing-first' : 'writing-again' };
      return {
        typeId: type.typeId,
        label: type.label,
        prepare,
        exemplars: { count: exemplars.length, statement: writingExemplarStatement(writingExemplarLine(type.label, exemplars), exemplars.length, unread) },
        drafted: type.document === null ? drafted.get(type.typeId) ?? null : null,
        quickStart: internalWritingQuickStart(host, bookId, type.typeId, prepare, facts),
      };
    }),
    task: latest === null || latest.projection.taskIntent === null ? null : {
      taskIntentId: latest.projection.taskIntent.taskIntentId,
      typeId: latest.task.typeId,
      typeLabel: latest.task.input.type.label,
      state: latest.projection.state,
      label: writingTaskStateLabel(latest.projection, latest.task.exemplarsReadable, latest.task.materials),
      // A Task not yet run whose exemplar — or 资料库 item's pinned build (Issue #428) — is no longer here says it cannot start;
      // one that ran says why it wrote no draft.
      refusal: latest.projection.authorization !== null ? internalWritingRefusal(host, latest.projection)
        : !latest.task.exemplarsReadable ? WRITING_EXEMPLAR_MOVED
          : latest.task.materials.find((material) => material.refusal !== null)?.refusal?.message ?? internalWritingRefusal(host, latest.projection),
      planEnvelopeDigest: latest.projection.planEnvelope?.digest ?? null,
    },
  };
}

export function internalWritingDefaultRule(host: WritingTaskOperationsHost, projection: WritingProjection, task: StoredWritingTask): TaskPlanDefaultRuleProjection {
  const envelope = projection.planEnvelope;
  const version = projection.planVersion;
  if (projection.taskIntent === null || envelope === null || version === null) return noDefaultRule(QUICK_START_NOT_READY);
  const startedBy = host.ruleStartedBy(projection.bookId, 'writing', projection.authorization, writingRulePattern(task.typeId));
  // A live writing rule requires the selected writing admission, as preparation does.
  // A rule binds no 资料库 item (Issue #428; TASK-023, TASK-026): a plan that lists one sets none.
  const kindReason = internalWritingLiveUnavailable(host) ? SET_RULE_DEVELOPER_LIVE
    : !task.exemplarsReadable && projection.authorization === null ? WRITING_EXEMPLAR_MOVED
      : task.materials.length > 0 ? WRITING_RULE_MATERIALS : null;
  return host.ruleOffer(projection.bookId, writingRulePattern(task.typeId), { planEnvelope: envelope, planVersion: version, planRevision: projection.planRevision }, kindReason, startedBy);
}

export function internalSetWritingDefaultRule(host: WritingTaskOperationsHost, bookId: string, taskIntentId: string, planEnvelopeDigest: string): DefaultExecutionRuleProjection {
  const latest = internalLatestWriting(host, bookId);
  const projection = latest?.projection ?? null;
  requireStore(latest !== null && projection !== null && projection.taskIntent?.taskIntentId === taskIntentId &&
    projection.planEnvelope?.digest === planEnvelopeDigest && projection.planVersion !== null,
    'DEFAULT_EXECUTION_RULE_STALE', '这份计划已经变化；请重新打开计划后再设为快速开始默认。');
  const pattern = writingRulePattern(latest.task.typeId);
  const offer = internalWritingDefaultRule(host, projection, latest.task);
  if (offer.current !== null && offer.current.state === 'active' && offer.current.fromThisPlan) {
    const same = host.ruleCall(() => host.rules.activeFor(bookId, pattern));
    if (same !== null) return host.ruleProjection(same);
  }
  requireStore(offer.canSet, 'DEFAULT_EXECUTION_RULE_UNAVAILABLE', offer.reason ?? QUICK_START_NOT_READY);
  const record = host.ruleCall(() => host.rules.set({
    bookId,
    pattern,
    sourceTaskIntentId: taskIntentId,
    sourcePlanEnvelopeDigest: planEnvelopeDigest,
    binding: defaultExecutionRuleBindingOf(projection.planVersion!.materialInputs),
  }));
  return host.ruleProjection(record);
}

export function internalWritingRuleFacts(host: WritingTaskOperationsHost, bookId: string, latest: { ledger: BaselineAnalysisStore } | null): { facts: MaterialPlanInputsProjection } | { reason: string } {
  if (latest === null) return { reason: QUICK_START_NOT_READY };
  try {
    return { facts: latest.ledger.currentRuleFacts(bookId, 'writing-first') };
  } catch (error) {
    if (error instanceof AnalysisError) return { reason: error.message };
    throw error;
  }
}

export function internalWritingQuickStart(host: WritingTaskOperationsHost, bookId: string, typeId: string, prepare: WritingTaskTypeProjection['prepare'], facts: () => { facts: MaterialPlanInputsProjection } | { reason: string }): BaselineAnalysisQuickStartProjection {
  const pattern = writingRulePattern(typeId);
  let rule: DefaultExecutionRuleRecord | null;
  try {
    rule = host.ruleCall(() => host.rules.activeFor(bookId, pattern));
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    return { available: false, reason: `快速开始暂不可用：${error.message}`, rule: null };
  }
  if (rule === null) return { available: false, reason: quickStartNoRuleReason(pattern), rule: null };
  const reference = defaultExecutionRuleReference(rule, rule.version);
  if (internalWritingLiveUnavailable(host)) return { available: false, reason: QUICK_START_DEVELOPER_LIVE, rule: reference };
  // The page's own terms first — no manuscript, a document of the type, 本书不做, a Run under way — as 先看计划 is held to them.
  if (!prepare.allowed) return { available: false, reason: prepare.reason, rule: reference };
  const read = facts();
  if ('reason' in read) return { available: false, reason: read.reason, rule: reference };
  const drift = defaultExecutionRuleDrift(rule.version.binding, read.facts);
  if (drift.length > 0) return { available: false, reason: ruleDriftReason(reference.name, drift), rule: reference };
  return { available: true, reason: null, rule: reference };
}

export async function quickStartWritingTask(host: WritingTaskOperationsHost, bookId: string, taskIntentId: string, planEnvelopeDigest: string, ruleVersionId: string, runtime: { credentialReadiness: (binding?: ConfiguredProviderBinding | null) => Promise<'present' | 'missing' | null>; connectivity: TaskPlanConnectivity }): Promise<{ outcome: 'started' | 'fell-back'; reasons: ReadonlyArray<string>; dispatchRunRecordId: string | null; ledger: BaselineAnalysisStore | null }> {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(taskIntentId) && DIGEST_PATTERN.test(planEnvelopeDigest) && UUID_PATTERN.test(ruleVersionId),
      'QUICK_START_INVALID', '快速开始的参数无效。');
  const plan = await host.inspectTaskPlanWithConnection({ bookId, kind: 'writing', ref: taskIntentId }, runtime.credentialReadiness, runtime.connectivity);
  const latest = internalLatestWriting(host, bookId);
  const projection = latest?.projection ?? null;
  const envelope = projection?.planEnvelope ?? null;
  const version = projection?.planVersion ?? null;
  requireStore(latest !== null && projection !== null && projection.taskIntent?.taskIntentId === taskIntentId && envelope?.digest === planEnvelopeDigest &&
    version !== null, 'ANALYSIS_AUTHORIZATION_STALE', '任务计划已经变化；无法记录该授权。');
  if (projection.authorization !== null) {
    // The same quick start made twice answers as the first did; a Task started any other way is not started again.
    requireStore(projection.authorization.origin === 'default-execution-rule' && projection.authorization.ruleVersionId === ruleVersionId,
        'ANALYSIS_AUTHORIZATION_STALE', '这项任务已经开始了。');
    return { outcome: 'started', reasons: [], dispatchRunRecordId: null, ledger: null };
  }
  const fellBack = (reason: string) => ({ outcome: 'fell-back' as const, reasons: [reason], dispatchRunRecordId: null, ledger: null });
  const pattern = writingRulePattern(latest.task.typeId);
  // A rule of this Book's other house type never starts this one (TASK-026: no widened source).
  const named = host.ruleCall(() => host.rules.version(ruleVersionId));
  if (named !== null && named.rule.bookId === bookId && named.rule.taskKind === 'writing' && named.rule.pattern !== pattern) {
    return fellBack(writingRuleOtherTypeReason(defaultExecutionRuleReference(named.rule, named.version).name, writingRuleTypeLabel(named.rule.pattern),
      latest.task.input.type.label));
  }
  const rule = host.ruleCall(() => host.rules.activeFor(bookId, pattern));
  if (rule === null || rule.version.ruleVersionId !== ruleVersionId) return fellBack(QUICK_START_RULE_CHANGED);
  if (internalWritingLiveUnavailable(host)) return fellBack(QUICK_START_DEVELOPER_LIVE);
  if (!latest.task.exemplarsReadable) return fellBack(WRITING_EXEMPLAR_MOVED);
  // A rule binds no 资料库 item, so a plan that lists one never starts under it (Issue #428; TASK-026: no widened source).
  if (latest.task.materials.length > 0) return fellBack(WRITING_QUICK_START_MATERIALS);
  if (projection.planRevision !== null) return fellBack(QUICK_START_PLAN_CHANGED);
  const drift = defaultExecutionRuleDrift(rule.version.binding, version.materialInputs);
  if (drift.length > 0) return fellBack(ruleDriftReason(defaultExecutionRuleReference(rule, rule.version).name, drift));
  // 结果待确认 (Issue #757; CONT-011): a writing Task that sends again a range whose earlier result could not be known is started
  // only from its plan, where the editor has read that it will.
  if (plan.resend !== null) return fellBack(QUICK_START_RESEND);
  switch (plan.start.readiness) {
    case 'ready':
    case 'no-route':
      break;
    case 'needs-connection':
      return fellBack(QUICK_START_NEEDS_CONNECTION);
    case 'offline':
      // As the baseline's (Issue #760, S74c; TASK-024): a rule starts only a Run that can begin now, so offline the Task stops
      // at its plan, whose bar offers 联网后开始任务 — never a wait the editor did not choose there.
      return fellBack(QUICK_START_OFFLINE);
    default:
      return fellBack(QUICK_START_NOT_READY);
  }
  const authorized = host.analysisCall(() => latest.ledger.authorize(bookId, taskIntentId, planEnvelopeDigest, 'now',
    { kind: 'default-execution-rule', ruleVersionId }));
  return { outcome: 'started', reasons: [], dispatchRunRecordId: authorized.dispatchRunRecordId, ledger: latest.ledger };
}

export function createWritingDraft(host: WritingTaskOperationsHost, bookId: string, revisionId: string): WritingDraftCreatedProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(bookId) && UUID_PATTERN.test(revisionId), 'WRITING_INVALID', '写作任务参数无效。');
  const revision = internalWritingCall(host, () => host.writingTasks.revisions(bookId)).find((entry) => entry.revisionId === revisionId);
  requireStore(revision !== undefined, 'WRITING_NOT_FOUND', '这本书没有这一次起草的文档。');
  const found = internalWritingTaskOf(host, revision.taskIntentId);
  requireStore(found !== null, 'WRITING_RECORD_INVALID', '这一次起草没有记下它的类型与参考材料。');
  const inspected = host.analysisCall(() => found.ledger.inspect(bookId, undefined, revisionId)) as WritingProjection;
  const draft = inspected.inspectedRevision?.revision.writing.draft ?? null;
  requireStore(draft !== null && draft.usable !== false, 'WRITING_NOT_DRAFTED', '这一次起草没有写出文档草稿，不能打开草稿。');
  const type = productionDocumentType(found.task.typeId);
  requireStore(type !== undefined, 'WRITING_TYPE_INVALID', '这个文档类型不在本社的类型配置中。');
  // Every revision names a Source Version; a draft's names the manuscript file of the revision the Task read (its export is
  // written fresh from its own words, never from that file).
  const source = host.authority.prepare(
      `SELECT mr.source_version_id FROM analysis_task_input_checkpoints c JOIN manuscript_revisions mr ON mr.revision_id = c.revision_id
       WHERE c.task_intent_id = ?`,
  ).get(revision.taskIntentId) as SqlRow | undefined;
  requireStore(source !== undefined, 'WRITING_RECORD_INVALID', '写作任务的输入修订版缺失。');
  const sourceVersionId = asString(source.source_version_id);
  const blocks = writingDraftBlocks(draft).map((block) => ({
    ...block,
    digest: sha256(canonicalJson({ kind: block.kind, level: block.level, text: block.text })),
    graphemeLength: writingBlockLength(block.text),
  }));
  const now = new Date().toISOString();
  const documentId = randomUUID();
  const branchId = randomUUID();
  const draftRevisionId = randomUUID();
  const characterCount = blocks.reduce((total, block) => total + block.graphemeLength, 0);
  const revisionDigest = WritingTasks.draftRevisionDigest(documentId, revisionId, blocks.map(({ kind, level, text }) => ({ kind, level, text })));
  host.documentCall(() => internalWritingCall(host, () => host.transaction(host.authority, () => {
    // The checks again, inside the transaction that writes: a document of the type made meanwhile refuses this one.
    requireStore(host.productionDocuments.documentOfType(bookId, type.typeId) === undefined, 'WRITING_DOCUMENT_EXISTS', writingDocumentExists(type.label));
    requireStore(!host.productionDocuments.notForThisBook(bookId, type.typeId), 'WRITING_NOT_FOR_THIS_BOOK', writingNotForThisBook(type.label));
    host.authority.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'production-document', ?)")
      .run(documentId, bookId, now);
    host.authority.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(branchId, documentId, type.label, now);
    host.authority.prepare(
        `INSERT INTO manuscript_revisions(
           revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
           source_version_id, revision_digest, created_at
         ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
    ).run(draftRevisionId, documentId, branchId, sourceVersionId, revisionDigest, now);
    host.authority.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(draftRevisionId, branchId);
    const insertBlock = host.authority.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)');
    const insertVersion = host.authority.prepare(
        `INSERT INTO manuscript_block_versions(
           revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertWorking = host.authority.prepare(
        `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let offset = 0;
    blocks.forEach((block, index) => {
      const position = index + 1;
      const blockId = `blk_${sha256(`${draftRevisionId}\u0000${position}\u0000${block.digest}`).slice(0, 24)}`;
      insertBlock.run(blockId, documentId, draftRevisionId);
      insertVersion.run(draftRevisionId, blockId, position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
      insertWorking.run(branchId, blockId, position, block.kind, block.level, block.text, block.digest, block.graphemeLength);
      offset += block.graphemeLength;
    });
    host.authority.prepare(
        `INSERT INTO branch_working_state(
           branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
           total_graphemes, history_sequence, last_checkpoint_sequence
         ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
    ).run(branchId, documentId, draftRevisionId, revisionDigest, characterCount);
    requireStore(
      host.boundedCall(() => host.boundedAuthority.initializeImportedBranch(branchId)) === characterCount,
        'WRITING_INVALID', '文档草稿的索引无法由它的文字精确建立。',
    );
    host.productionDocuments.record({
      documentId, bookId, typeId: type.typeId, originSourceVersionId: sourceVersionId, parserIdentity: WRITING_DRAFT_PARSER_IDENTITY, createdAt: now,
    });
    host.documentWorkflow.recordInstance(documentId, now);
    // The draft is the document's 起草 (DELIV-007): the editor's 打开草稿 starts that phase, as 开始 would.
    host.documentWorkflow.transition({ bookId, documentId, phaseId: 'drafting', action: 'start', expectedTransitions: 0, reason: null }, now);
    host.productionDocuments.recordVersion(documentId, draftRevisionId, revisionDigest, 'created');
    host.writingTasks.recordDraft({
      documentId, bookId, typeId: type.typeId, analysisRevisionId: revisionId, taskIntentId: revision.taskIntentId, recordedAt: now,
    });
  })));
  const row = host.documentCall(() => host.productionDocuments.documentById(bookId, documentId));
  requireStore(row !== undefined, 'WRITING_RECORD_INVALID', '文档草稿没有建立。');
  return {
    writing: host.inspectWritingTask(bookId),
    typeId: type.typeId,
    typeLabel: type.label,
    document: host.documentCall(() => host.productionDocuments.document(row)),
  };
}
