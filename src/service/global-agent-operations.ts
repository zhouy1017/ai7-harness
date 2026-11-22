import type { ResolvedModelRole } from './model-search-settings.js';
import { editorialMemoryGovernanceItem, governedPreferences, preferenceItems, preferenceRow, supervisionSourceCandidates } from './learning/supervision-directives.js';
import { reviewCategoryDisplayLabel } from '../shared/review-synthesis-wording.js';
import { procedureStopped } from './procedures/editable.js';
import { sha256Hex } from './analysis/canonical.js';
import type { EditorialMemoryFacade } from './learning/memory-facade.js';
import { buildDialogueMessage, dialogueQuestionDigest, dialogueQuestion } from './dialogue/contract.js';
import { fragmentsText } from './dialogue/fragments.js';
import {
  globalAgentDialogueProjection,
  readGlobalAgentHistory,
  type GlobalAgentTurnHistory,
} from './dialogue/global-agent-session.js';
import {
  type AskGlobalAgentInput,
  type GlobalAgentDialogueProjection,
  type GlobalAgentAttemptInput,
  type GlobalAgentProcedure,
  type GlobalAgentProcedurePin,
  type GlobalAgentScope,
  type GlobalAgentScopeInput,
  type GlobalMemoryPin,
  type GlobalAgentSourceCandidate,
  type HouseReviewPreferenceVersion,
  type PrepareGlobalAgentTurnInput,
  GLOBAL_AGENT_POLICY_BLOCKED,
  MODEL_SERVICE_SETUP_REQUIRED_REASON,
  type GlobalAgentProjection,
  modelServiceChannelOf,
  type ManuscriptWindowProjection,
  type LaunchPolicyProjection,
} from '../shared/protocol.js';
import { PROCEDURE_STAGE_LABELS, type ProcedureDefinitionDocument } from '../shared/protocol/procedures.js';
import {
  selectedPolicyIdentityOf,
  resolveSourceCheckoutLaunchPolicySync,
  type ConfiguredProviderBinding,
} from './launch-policy.js';
import { resolveProcedureDefinition } from './procedures/definition-store.js';
import { LocalFixturePolicyCatalog, type LocalFixtureRuntimeContext } from './provider/model-fixture.js';
import { DatabaseSync } from 'node:sqlite';
import { asString, canonicalJson, requireStore, type SqlRow } from './store-records.js';
import { BaselineAnalysisStore } from './analysis/baseline-analysis-store.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryEntry } from './review/category-configuration.js';
import {
  DialogueLedger,
  type DialogueTurnStart,
  type QualifiedGlobalAttemptMetadata,
  qualifiedGlobalAttemptMetadataOf,
} from './dialogue/dialogue-ledger.js';
import { resolveAttempts, type DialogueHistoryReader, type LiveAnswer } from './dialogue/dialogue-history.js';

export interface GlobalAgentOperationsHost {
  resolveModelRole: (role: import('../shared/protocol.js').ModelRoleId) => ResolvedModelRole;
  readonly authority: DatabaseSync;
  readonly baselineAnalysis: BaselineAnalysisStore;
  readonly codeRoot: string;
  dialogueCall: <T>(operation: () => T) => T;
  readonly dialogueHistory: DialogueHistoryReader;
  readonly dialogues: DialogueLedger;
  learningCall: <T>(operation: () => T) => T;
  memoryFacade: () => EditorialMemoryFacade;
  localFixtureCatalog: LocalFixturePolicyCatalog | null;
  transaction: <T>(db: DatabaseSync, operation: () => T) => T;
  getConfiguredModelRoleBinding: (role: 'main-editorial' | 'fast-interaction') => ConfiguredProviderBinding | null;
  getManuscriptWindow: (manuscriptId: string, branchId: string, cursor: string | null) => ManuscriptWindowProjection;
  globalAgentAttempt: (input: GlobalAgentAttemptInput, kind: 'continue' | 'regenerate' | 'stop', now?: Date, preview?: boolean, qualification?: QualifiedGlobalAttemptMetadata) => DialogueTurnStart | string;
  globalAgentModelConnection: () => { binding: ConfiguredProviderBinding; credentialUpdatedAt: string; policy: LaunchPolicyProjection };
  globalAgentProcedureDocument: (pin: GlobalAgentProcedurePin) => ProcedureDefinitionDocument;
  globalAgentRedact: (text: string) => string;
  globalAgentScopeCurrent: (scope: GlobalAgentScope) => boolean;
  globalAgentSourcesCurrent: (pins: ReadonlyArray<GlobalMemoryPin>) => boolean;
  inspectGlobalAgent: (live?: (attemptId: string) => LiveAnswer | null, dialogueAdmitted?: boolean, scopedAdmitted?: boolean) => GlobalAgentProjection;
  prepareGlobalAgentTurn: (input: PrepareGlobalAgentTurnInput) => DialogueTurnStart['message'];
}

export function inspectGlobalAgent(host: GlobalAgentOperationsHost, live: (attemptId: string) => LiveAnswer | null = () => null, dialogueAdmitted = false, scopedAdmitted = false): GlobalAgentProjection {
  return host.learningCall(() => {
    const operationalScope = host.baselineAnalysis.launch.operationalScope;
    const memory = host.memoryFacade();
    const basis = memory.globalSourceBasis(operationalScope);
    const facts = memory.globalSources(operationalScope, internalGlobalOriginalFieldsSelected(host), basis);
    const base = basis.preference === null ? null : { ...basis.preference, lines: basis.preference.governance?.baseLines ?? basis.preference.lines };
    const redact = (text: string) => memory.redact(text, facts.names);
    // Each line's own revision is its row pin (Issue #1655); the listed and sent revision keeps the newest directive's suffix.
    const items = [...governedPreferences(preferenceItems(base), facts.legacyDirectives).values()].filter((entry) => !entry.retired)
      .map((entry) => ({ ...entry.item, text: redact(entry.item.text), revisionId: entry.item.revisionId + '@' + (basis.directives.at(-1)?.directiveId ?? 'base'),
        row: preferenceRow(entry, basis.preference?.recordedAt) }));
    const mutableMemories = facts.revisions.map(entry => ({ ...editorialMemoryGovernanceItem(entry, entry.current.editorialDimension), text: redact(entry.current.title) }));
    const sources: GlobalAgentSourceCandidate[] = [
      ...facts.revisions.flatMap(entry => entry.sourceRevision === null ? [] : [{ itemId: entry.current.itemId,
        revisionId: entry.sourceRevision, kind: 'memory' as const, title: redact(entry.current.title), text: redact(entry.current.title) }]),
      ...facts.legacy.map(entry => ({ itemId: entry.itemId, revisionId: entry.versionId, kind: 'memory' as const, title: redact(entry.title), text: redact(entry.title) })),
      ...supervisionSourceCandidates(basis.directives).map(entry => ({ ...entry, text: redact(entry.text) })),
    ];
    const blocked = operationalScope === 'ordinary-production' && host.getConfiguredModelRoleBinding('fast-interaction') === null
      ? MODEL_SERVICE_SETUP_REQUIRED_REASON : GLOBAL_AGENT_POLICY_BLOCKED;
    return { operationalScope, dialogueState: dialogueAdmitted ? 'available' : blocked,
      scopedDialogueState: scopedAdmitted ? 'available' : blocked, procedures: internalGlobalAgentProcedures(host),
      explanation: dialogueAdmitted ? '只使用明确勾选的已启用记忆版本，不读取稿件；治理仍须单独操作。'
        : '此处暂不能调用模型。记忆与学习监督操作仅在本机记录，不读取稿件。',
      categories: BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories.map(({ categoryId, label }) => ({ categoryId, label })),
      books: host.authority.prepare('SELECT book_id, title FROM books ORDER BY title, book_id').all().map((row) => ({ bookId: String(row.book_id), title: String(row.title) })),
      items: [...items, ...mutableMemories], sourceCandidates: [
        ...items.filter(item => item.state === 'active').map((item) => ({ itemId: item.itemId, revisionId: item.revisionId, kind: item.kind,
          title: `本社审阅偏好 · ${reviewCategoryDisplayLabel(item.categoryId, reviewCategoryEntry(item.categoryId)?.label)}`, text: item.text })),
        ...sources,
      ], directives: basis.directives, history: internalGlobalAgentHistory(host, live) };
  });
}

export function internalGlobalAgentHistory(host: GlobalAgentOperationsHost, live: (attemptId: string) => LiveAnswer | null): GlobalAgentDialogueProjection[] {
  const operationalScope = host.baselineAnalysis.launch.operationalScope;
  return host.dialogues.globalTasks().filter((task) => task.operationalScope === operationalScope)
    .map((task) => globalAgentDialogueProjection(task, host.dialogues, host.dialogueHistory, live));
}

export function globalAgentSourcesCurrent(host: GlobalAgentOperationsHost, pins: ReadonlyArray<GlobalMemoryPin>): boolean {
  const items = host.inspectGlobalAgent().sourceCandidates ?? [];
  return pins.every((pin) => items.some((item) => item.itemId === pin.itemId && item.revisionId === pin.revisionId));
}

export function internalGlobalAgentProcedures(host: GlobalAgentOperationsHost): GlobalAgentProcedure[] {
  return host.authority.prepare('SELECT procedure_id FROM procedure_definitions ORDER BY pre_installed DESC, rowid').all().flatMap((row) => {
    const { document, pin } = resolveProcedureDefinition(host.authority, String(row.procedure_id));
    return procedureStopped(host.authority, pin) ? [] : [{ ...pin, title: document.title, editorInstruction: document.editorInstruction,
      stages: document.stages.map((stage) => ({ stageType: stage.stageType, label: PROCEDURE_STAGE_LABELS[stage.stageType] })) }];
  });
}

export function internalPinGlobalAgentScope(host: GlobalAgentOperationsHost, input: GlobalAgentScopeInput): GlobalAgentScope {
  requireStore(input.bookIds.length <= 8 && new Set(input.bookIds).size === input.bookIds.length && input.procedures.length <= 8 &&
    new Set(input.procedures.map((pin) => pin.procedureId)).size === input.procedures.length, 'GLOBAL_AGENT_SCOPE_CHANGED', '对话范围无效，请重新选择。');
  const books = input.bookIds.map((bookId) => {
    const row = host.authority.prepare(`SELECT b.title, m.manuscript_id, mb.branch_id FROM books b JOIN manuscripts m ON m.book_id = b.book_id AND m.role = 'primary'
        JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id AND mb.name = '主分支' WHERE b.book_id = ?`).get(bookId) as SqlRow | undefined;
    requireStore(row !== undefined, 'GLOBAL_AGENT_SCOPE_CHANGED', '所选图书没有可读取的稿件，请重新选择。');
    const manuscriptId = asString(row.manuscript_id);
    return { bookId, title: asString(row.title), manuscriptId, revisionId: host.getManuscriptWindow(manuscriptId, asString(row.branch_id), null).revisionId };
  });
  const scope = { books, procedures: input.procedures.map((pin) => ({ ...pin, title: host.globalAgentProcedureDocument(pin).title })) };
  requireStore(host.globalAgentScopeCurrent(scope), 'GLOBAL_AGENT_SCOPE_CHANGED', '所选图书或工序版本已不可用，请重新选择。');
  return scope;
}

export function globalAgentScopeCurrent(host: GlobalAgentOperationsHost, scope: GlobalAgentScope): boolean {
  const excluded = host.memoryFacade().controls().excludedBooks;
  return scope.books.every((book) => !excluded.has(book.bookId) && host.authority.prepare(`SELECT 1 FROM manuscript_revisions mr JOIN manuscripts m
      ON m.manuscript_id = mr.manuscript_id AND m.role = 'primary' WHERE m.book_id = ? AND mr.manuscript_id = ? AND mr.revision_id = ?`)
    .get(book.bookId, book.manuscriptId, book.revisionId) !== undefined) && scope.procedures.every((pin) => {
    try {
      const { document, pin: current } = resolveProcedureDefinition(host.authority, pin.procedureId, pin.version);
      return current.digest === pin.digest && document.title === pin.title && !procedureStopped(host.authority, current);
    } catch { return false; }
  });
}

export function globalAgentProcedureDocument(host: GlobalAgentOperationsHost, pin: GlobalAgentProcedurePin): ProcedureDefinitionDocument {
  const { document, pin: current } = resolveProcedureDefinition(host.authority, pin.procedureId, pin.version);
  requireStore(current.digest === pin.digest, 'GLOBAL_AGENT_SCOPE_CHANGED', '工序版本已经变化，请重新选择。');
  return document;
}

export function globalAgentGovernancePin(host: GlobalAgentOperationsHost, pin: GlobalMemoryPin): GlobalMemoryPin | null {
  const item = host.inspectGlobalAgent().items.find((entry) => entry.itemId === pin.itemId &&
    (entry.revisionId === pin.revisionId || pin.revisionId.startsWith(`${entry.revisionId}@`)));
  return item === undefined ? null : { itemId: item.itemId, revisionId: item.revisionId };
}

export function localFixtureRuntime(host: GlobalAgentOperationsHost): LocalFixtureRuntimeContext | null {
  const policy = host.baselineAnalysis.launch.policy;
  if (policy?.providerProcessing.version !== 'v29') return null;
  const selected = selectedPolicyIdentityOf(policy.selectedPolicyIdentity);
  requireStore(policy.integrityState === 'verified' && policy.operationalScope === 'development-ci' &&
    selected?.providerProcessingVersion === 'v29', 'LOCAL_FIXTURE_POLICY_INVALID', '本地夹具策略身份无法核实。');
  host.localFixtureCatalog ??= LocalFixturePolicyCatalog.read(host.codeRoot);
  return { selectedPolicyIdentity: selected, catalog: host.localFixtureCatalog };
}

export function internalGlobalOriginalFieldsSelected(host: GlobalAgentOperationsHost): boolean {
  const policy = host.baselineAnalysis.launch.policy;
  if (policy?.providerProcessing.version !== 'v30' && policy?.providerProcessing.version !== 'v31' && (policy?.providerProcessing.version !== 'v32' && policy?.providerProcessing.version !== 'v33' && policy?.providerProcessing.version !== 'v34' && policy?.providerProcessing.version !== 'v35')) return false;
  requireStore(policy.integrityState === 'verified' && policy.operationalScope === 'ordinary-production' &&
    selectedPolicyIdentityOf(policy.selectedPolicyIdentity)?.providerProcessingVersion === policy.providerProcessing.version,
    'GLOBAL_AGENT_POLICY_BLOCKED', '当前处理策略身份无法核实；未发送任何内容。');
  return true;
}

export function globalAgentModelConnection(host: GlobalAgentOperationsHost): { binding: ConfiguredProviderBinding; credentialUpdatedAt: string; policy: LaunchPolicyProjection } {
  const resolved = host.resolveModelRole('underlying-flash');
  const binding = host.getConfiguredModelRoleBinding('fast-interaction');
  const used = resolved.usedChoice;
  const connection = resolved.connection;
  requireStore(used !== null && binding !== null && connection !== null && connection.credentialOperationState === 'ready' &&
    connection.connectionId === used.connectionId && connection.credentialReference === binding.credentialReference &&
    connection.binding.providerId === modelServiceChannelOf(binding.route) && connection.binding.credentialSlot === binding.credentialSlot &&
    used.modelId === binding.model && used.reasoningEffort === binding.reasoningEffort &&
    resolved.binding !== null && canonicalJson(resolved.binding) === canonicalJson(binding),
    'GLOBAL_AGENT_POLICY_BLOCKED', '模型服务连接已变化；未发送任何内容。');
  const policy = resolveSourceCheckoutLaunchPolicySync(host.codeRoot, 'ordinary-production',
    host.getConfiguredModelRoleBinding('main-editorial'), binding);
  requireStore(policy.integrityState === 'verified' && (policy.providerProcessing.version === 'v30' || policy.providerProcessing.version === 'v31' || (policy.providerProcessing.version === 'v32' || policy.providerProcessing.version === 'v33' || (policy.providerProcessing.version === 'v34' || policy.providerProcessing.version === 'v35'))) &&
    canonicalJson(policy.selectedPolicyIdentity) === canonicalJson(host.baselineAnalysis.launch.policy?.selectedPolicyIdentity),
    'GLOBAL_AGENT_POLICY_BLOCKED', '当前策略字节或已选身份无法核实；未发送任何内容。');
  return { binding, credentialUpdatedAt: connection.credentialUpdatedAt, policy };
}

export function globalAgentHistory(host: GlobalAgentOperationsHost, input: { dialogueId: string; attemptId: string }, kind: 'continue' | 'regenerate'): GlobalAgentTurnHistory {
  return host.dialogueCall(() => {
    const task = host.dialogues.globalTask(input.dialogueId);
    requireStore(task?.operationalScope === 'ordinary-production', 'DIALOGUE_NOT_FOUND', '全域对话不存在。');
    const attempts = host.dialogues.attempts(input.dialogueId);
    const through = attempts.findIndex((attempt) => attempt.attemptId === input.attemptId);
    requireStore(through >= 0, 'DIALOGUE_ATTEMPT_STALE', '回答已经变化，请重新查看。');
    return readGlobalAgentHistory(task, attempts.slice(0, through + 1), host.dialogueHistory, kind);
  });
}

export function internalRequireGlobalQualification(host: GlobalAgentOperationsHost, qualification: QualifiedGlobalAttemptMetadata | undefined, message: DialogueTurnStart['message']): void {
  if (!internalGlobalOriginalFieldsSelected(host)) {
    requireStore(qualification === undefined, 'GLOBAL_AGENT_POLICY_BLOCKED', '当前处理策略不接收原文字段身份。');
    return;
  }
  const metadata = qualifiedGlobalAttemptMetadataOf(qualification);
  const connection = host.globalAgentModelConnection();
  requireStore(metadata !== null && metadata.messageSha256 === sha256Hex(buildDialogueMessage(message)) &&
    canonicalJson({ providerProcessingVersion: metadata.providerProcessingVersion, providerProcessingSha256: metadata.providerProcessingSha256,
      activePolicySetVersion: metadata.activePolicySetVersion, activePolicySetSha256: metadata.activePolicySetSha256 }) ===
      canonicalJson(selectedPolicyIdentityOf(host.baselineAnalysis.launch.policy?.selectedPolicyIdentity)) &&
    metadata.route === connection.binding.route && metadata.model === connection.binding.model && metadata.credentialSlot === connection.binding.credentialSlot &&
    metadata.credentialReference === connection.binding.credentialReference && metadata.credentialUpdatedAt === connection.credentialUpdatedAt,
    'GLOBAL_AGENT_SCOPE_CHANGED', '发送内容或模型服务已经变化；未发送任何内容。');
}

export function globalAgentRedact(host: GlobalAgentOperationsHost, text: string): string {
  const memory = host.memoryFacade();
  return memory.redact(text, memory.names(memory.history(host.baselineAnalysis.launch.operationalScope).at(-1) ?? null));
}

export function internalGlobalAgentNames(host: GlobalAgentOperationsHost, preference: HouseReviewPreferenceVersion | null): string[] {
  return host.memoryFacade().names(preference);
}

export function prepareGlobalAgentTurn(host: GlobalAgentOperationsHost, input: PrepareGlobalAgentTurnInput): DialogueTurnStart['message'] {
  if (input.kind !== 'ask') {
    const turn = host.globalAgentAttempt(input, input.kind, new Date(), true);
    requireStore(typeof turn !== 'string', 'DIALOGUE_INVALID', '回答标识无效。');
    return turn.message;
  }
  const question = internalGlobalOriginalFieldsSelected(host) ? dialogueQuestion(input.question)
    : dialogueQuestion(host.globalAgentRedact(dialogueQuestion(input.question)));
  requireStore(input.sources.length <= 12 && new Set(input.sources.map((pin) => pin.itemId)).size === input.sources.length &&
    host.globalAgentSourcesCurrent(input.sources), 'GLOBAL_AGENT_SCOPE_CHANGED', '记忆版本已经变化，请重新选择。');
  const candidates = host.inspectGlobalAgent().sourceCandidates ?? [];
  return { kind: 'ask', selection: '', question, kept: null, globalSources: input.sources.map((pin) => ({ ...pin,
    text: candidates.find((entry) => entry.itemId === pin.itemId && entry.revisionId === pin.revisionId)!.text })),
    ...(input.scope === undefined ? {} : { globalScope: internalPinGlobalAgentScope(host, input.scope) }) };
}

export function askGlobalAgent(host: GlobalAgentOperationsHost, input: AskGlobalAgentInput, now = new Date(), qualification?: QualifiedGlobalAttemptMetadata): DialogueTurnStart {
  return host.dialogueCall(() => {
    const message = host.prepareGlobalAgentTurn({ ...input, kind: 'ask' });
    internalRequireGlobalQualification(host, qualification, message);
    const { task, attemptId } = host.transaction(host.authority, () => host.dialogues.askGlobal(host.baselineAnalysis.launch.operationalScope, input.sources, dialogueQuestionDigest(message.question), now, qualification));
    return { dialogueId: task.dialogueId, attemptId, message, ...(qualification === undefined ? {} : { qualification }) };
  });
}

export function inspectGlobalAgentDialogue(host: GlobalAgentOperationsHost, dialogueId: string, live: (attemptId: string) => LiveAnswer | null = () => null): GlobalAgentDialogueProjection {
  return host.dialogueCall(() => {
    const task = host.dialogues.globalTask(dialogueId);
    requireStore(task !== null && task.operationalScope === host.baselineAnalysis.launch.operationalScope, 'DIALOGUE_NOT_FOUND', '全域对话不存在。');
    return globalAgentDialogueProjection(task, host.dialogues, host.dialogueHistory, live);
  });
}

export function globalAgentAttempt(host: GlobalAgentOperationsHost, input: GlobalAgentAttemptInput, kind: 'continue' | 'regenerate' | 'stop', now = new Date(), preview = false, qualification?: QualifiedGlobalAttemptMetadata): DialogueTurnStart | string {
  return host.dialogueCall(() => {
    const task = host.dialogues.globalTask(input.dialogueId);
    requireStore(task !== null && task.operationalScope === host.baselineAnalysis.launch.operationalScope, 'DIALOGUE_NOT_FOUND', '全域对话不存在。');
    const attempts = host.dialogues.attempts(task.dialogueId);
    const last = attempts.at(-1);
    requireStore(last?.attemptId === input.attemptId, 'DIALOGUE_ATTEMPT_STALE', '回答已经变化，请重新查看。');
    if (kind === 'stop') {
      requireStore(last.outcome === null, 'DIALOGUE_NOT_ANSWERING', '回答已结束。');
      return last.attemptId;
    }
    const pins = input.sources ?? task.sources;
    requireStore(pins.length <= 12 && new Set(pins.map((pin) => pin.itemId)).size === pins.length &&
      pins.every((pin) => task.sources.some((original) => original.itemId === pin.itemId && original.revisionId === pin.revisionId)) &&
      host.globalAgentSourcesCurrent(pins), 'GLOBAL_AGENT_SCOPE_CHANGED', '记忆版本已经变化，请重新提问。');
    const qualified = internalGlobalOriginalFieldsSelected(host);
    const resolved = resolveAttempts(attempts, host.dialogueHistory, () => null);
    const first = resolved.first;
    requireStore(first?.globalSources !== undefined, 'DIALOGUE_HISTORY_MISSING', '对话记录无法读取。');
    const answer = resolved.attempts.at(-1)!;
    const fragmentCount = answer.fragments.length;
    requireStore(last.outcome !== null && (kind === 'regenerate' ||
      (last.outcome.outcome === 'stopped' || last.outcome.outcome === 'interrupted') && fragmentCount > 0), 'DIALOGUE_NOT_STOPPED', '回答尚不能继续。');
    const prepareText = (text: string): string => qualified ? text : host.globalAgentRedact(text);
    const message: DialogueTurnStart['message'] = { kind: kind === 'continue' ? 'continue' : 'ask', selection: '',
      question: prepareText(first.question), globalSources: pins.map((pin) => ({ ...pin,
        text: prepareText(first.globalSources!.find((source) => source.itemId === pin.itemId && source.revisionId === pin.revisionId)!.text) })),
      kept: kind === 'continue' ? prepareText(fragmentsText(answer.fragments)) : null,
      ...(first.globalScope === undefined ? {} : { globalScope: first.globalScope }) };
    if (!preview) {
      internalRequireGlobalQualification(host, qualification, message);
    }
    const attemptId = preview ? last.attemptId : host.transaction(host.authority, () => host.dialogues.nextAttempt(task.dialogueId, kind, () => fragmentCount, now, qualification));
    return { dialogueId: task.dialogueId, attemptId, message, ...(qualification === undefined ? {} : { qualification }) };
  });
}
