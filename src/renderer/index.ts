import type {
  AnalysisReusePlanCounts,
  AnalysisReusePlanProjection,
  BaselineAnalysisPlanRevisionProjection,
  BaselineAnalysisProjection,
  BaselineAnalysisResultSetRevisionProjection,
  BaselineAnalysisSelectedRange,
  BaselineAnalysisUpdateMode,
  BaselineAnalysisUpdateRequest,
  PlanBoundarySplitProjection,
  PlanRevisionDiffValue,
  BookCreationReviewProjection,
  BookManuscriptAnchorProjection,
  BookRecordPresentation,
  BookSummaryPageProjection,
  BookWorkbenchRoute,
  BookWorkOverviewProjection,
  FidelityCategoryProjection,
  ContinueImportProjection,
  EditorialWorkspaceProfileProjection,
  ForegroundExecutionBoundaryProjection,
  ImportCommitProjection,
  ImportDraftRecoveryProjection,
  ImportStartupProjection,
  HistoricalRevisionProjection,
  ManuscriptConversionProjection,
  ManuscriptWindowProjection,
  ModelServiceSettingsProjection,
  OutlineProjection,
  PriorWorkItemProjection,
  ReplacementPreviewProjection,
  RecoveryComparisonProjection,
  RecoverySelection,
  RecoveryWindowProjection,
  ResolvedBookWorkbenchRoute,
  ReviewBeforeImportProjection,
  ReviewBeforeManuscriptReimportProjection,
  ReviewBeforeSourceImportProjection,
  RunReportProjection,
  SearchResultsProjection,
  ServiceJobProjection,
  SourceImportCommitProjection,
  StagedImportProjection,
  StartupProjection,
  TaskAuthorizationProjection,
} from '../shared/protocol.js';
import { BASELINE_ANALYSIS_TASK_GOAL, J03_TASK_GOAL, MAX_REPLACEMENT_EXCLUSIONS } from '../shared/protocol.js';
import { mountBoundedEditor, type BoundedEditor, type EditorContinuity } from './editor.js';
import { mountEditorialMarks, type EditorialMarksSurface } from './editorial-marks.js';
import { mountPositionRail, type PositionRail } from './position-rail.js';
import { mountReviewWorkspace, type ReviewFocus, type ReviewWorkspaceSurface } from './review-workspace.js';
import {
  REVIEW_ACTION_LABELS,
  REVIEW_CARD_HEADING,
  REVIEW_DESTINATION_ACTIONS,
  REVIEW_ENTRY_LABEL,
  REVIEW_STATUS_LINES,
  REVIEW_WORK_GROUP_LABEL,
  REVIEW_WORKSPACE_UNAVAILABLE,
  reviewOverviewLine,
} from './review-labels.js';
import {
  ANALYSIS_ENTITY_KIND_LABELS,
  RUN_LIVENESS_STAGE_LABELS,
  RUN_REPORT_CLASSIFICATION_LABELS,
  RUN_REPORT_STAGE_LABELS,
  RUN_REPORT_STAGE_STATE_LABELS,
  analysisFourSentences,
  analysisKindSubtitle,
  analysisProvenanceSummary,
  attemptStateLabel,
  durationLabel,
  elapsedLabel,
  launchPolicyIntegritySentence,
  localInstantLabel,
  providerProcessingLabel,
  remoteBindingPolicyReading,
  remoteBindingRowLabel,
  runBudgetCeilingLabel,
  runReportUnitsSentence,
  runStepIsStale,
  taskAuthorizationDispatchNote,
} from './plan-preview-labels.js';

function requiredElement(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');
  return node;
}

const screen = requiredElement('#screen');
const persistenceStatus = requiredElement('#persistence-status');
if (!window.ai7) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');

let editor: BoundedEditor | undefined;
let editorialMarks: EditorialMarksSurface | undefined;
let manuscriptRail: PositionRail | undefined;
/** ②B 审阅 while it is on screen: its poll and its sheet end with the screen. */
let reviewWorkspace: ReviewWorkspaceSurface | undefined;
let authorityInterrupted = false;

interface RecoveryReturnContext {
  attentionId: string;
  attentionVersion: number;
  bookTitle: string;
}

function recoveryTone(access: ImportDraftRecoveryProjection['originalFileAccess']['state']): string {
  return access === 'available-exact' ? 'success-note' : 'attention-note';
}

interface RendererErrorData {
  readonly code: string;
  readonly message: string;
}

function rendererErrorData(error: unknown): RendererErrorData | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
    ? { code: candidate.code, message: candidate.message }
    : null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return rendererErrorData(error)?.code === code;
}

function rendererErrorMessage(error: unknown, fallback: string): string {
  return rendererErrorData(error)?.message ?? (error instanceof Error ? error.message : fallback);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', () => void action());
  return node;
}

/**
 * The Technical Identity Layer's one affordance for a surface (V2-UX-LAYER-001): that surface's digests,
 * record identifiers, references, schema and version identifiers and exact instants, closed by default,
 * one deliberate step below the decision content it belongs to. The rows keep their labels and their
 * `<dl>` structure — `gridClass` is the surface's own grid, so a disclosed row lines up exactly as it did
 * at full rank — and nothing here is truncated or hidden from the record. `<details>` carries the whole
 * behavior: opening or closing it reads nothing, writes nothing, and settles no decision
 * (V2-UX-LAYER-007), so no surface needs its own toggle state.
 */
function technicalDetails(gridClass: string | undefined, ...rows: ReadonlyArray<HTMLElement>): HTMLElement {
  const disclosure = element('details', 'technical-details');
  const values = element('dl', gridClass);
  values.append(...rows);
  disclosure.append(element('summary', undefined, '查看技术详情'), values);
  return disclosure;
}

/**
 * A Decision Layer row that states an instant (V2-UX-LAYER-004, V2-UX-COPY-011): absolute local date and
 * time, with the exact ISO instant riding inside the same `<dd>` on its own line. This is the shape for a
 * surface with no disclosure of its own — where there is one, the exact instant is a disclosed row
 * instead. Either way the local reading is never the only form shown, and never the exact one alone.
 */
function instantValue(iso: string): HTMLElement {
  const value = element('dd');
  value.append(localInstantLabel(iso), element('span', 'technical-identity', iso));
  return value;
}

function setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void {
  persistenceStatus.textContent = message;
  if (tone) persistenceStatus.dataset['tone'] = tone;
  else delete persistenceStatus.dataset['tone'];
}

function setCloseRisk(risk: boolean): void {
  document.documentElement.dataset['ai7CloseRisk'] = risk ? 'true' : 'false';
}

/** How long the entry notice stays before it removes itself (V2-UX-COPY-015). */
const ENTRY_NOTICE_MS = 6_000;

/**
 * V2-UX-COPY-015's transient floating notice: it floats over the surface rather than taking a row in
 * it, it disappears on its own without any editor action, and it settles nothing — removing it reads
 * nothing and writes nothing, so an editor who never looks at it loses no decision. It is announced
 * politely rather than asserted, so a screen reader hears it without being interrupted.
 */
function showEntryNotice(host: HTMLElement, message: string): void {
  const notice = element('p', 'entry-notice', message);
  notice.setAttribute('role', 'status');
  notice.dataset['entryNotice'] = 'visible';
  host.append(notice);
  window.setTimeout(() => notice.remove(), ENTRY_NOTICE_MS);
}

function applyAuthorityInterruption(): void {
  if (authorityInterrupted) return;
  authorityInterrupted = true;
  for (const control of screen.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) {
    control.disabled = true;
  }
  if (editor) editor.interrupt();
  else setStatus('本地业务服务已中断；当前业务操作已停止。', 'error');
}

function replaceScreen(state: string, content: HTMLElement): void {
  editorialMarks?.destroy();
  editorialMarks = undefined;
  manuscriptRail?.destroy();
  manuscriptRail = undefined;
  reviewWorkspace?.destroy();
  reviewWorkspace = undefined;
  editor?.destroy();
  editor = undefined;
  screen.dataset['screen'] = state;
  screen.replaceChildren(content);
  if (authorityInterrupted) {
    for (const control of screen.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) {
      control.disabled = true;
    }
  }
}

function panel(): HTMLElement {
  return element('section', 'panel');
}

async function returnToRecoveryComparison(attentionId: string): Promise<void> {
  const recovery = await window.ai7.getRecoveryComparison({ attentionId });
  await window.ai7.leaveBookWorkbench();
  renderManuscriptRecovery(recovery);
}

function appendRecoveryReturnAction(content: HTMLElement, context: RecoveryReturnContext | undefined): void {
  if (!context) return;
  const actions = element('div', 'button-row recovery-return-actions');
  const returnButton = button(`返回 ${context.bookTitle} 的恢复待确认`, 'secondary', async () => {
    returnButton.disabled = true;
    setStatus('正在返回稿件恢复比较…', 'busy');
    try {
      await returnToRecoveryComparison(context.attentionId);
    } catch (error) {
      returnButton.disabled = false;
      setStatus(rendererErrorMessage(error, '无法返回恢复比较。'), 'error');
    }
  });
  returnButton.dataset['recoveryReturn'] = context.attentionId;
  returnButton.dataset['recoveryReturnVersion'] = String(context.attentionVersion);
  actions.append(returnButton);
  content.append(actions);
}

/**
 * The one transient notice an entry shows (V2-UX-COPY-015). It names where the manuscript opened and
 * it is the only place a `nearest-anchor` resolution is spoken: a position whose block the current
 * Revision no longer holds is said to have moved, never presented as the position the editor left.
 */
function manuscriptEntryNotice(anchor: BookManuscriptAnchorProjection): string {
  if (anchor.entry === null) return '从稿件开头打开；这本图书还没有记录上次位置。';
  if (anchor.entry.state === 'nearest-anchor') {
    return `上次位置所在的内容块已不在当前修订版，已回到最近的位置 · ${anchor.entry.label}`;
  }
  return `回到上次位置 · ${anchor.entry.label}`;
}

/**
 * Opening a Book that has a primary Manuscript enters the manuscript at the position the editor left
 * it at; 工作概览 is a destination reached from 资料与记录, not the way in (V2-UX-RET-002, IA-012).
 * A Book with no Manuscript still enters the overview, which is where 导入首份稿件 is (BOOK-001).
 *
 * The position rides in the overview projection this route already reads, so entering needs no
 * surface member of its own: the anchor answers both which surface to show and where to open it.
 * `blockId` goes straight into a `block` window target, which is the granularity the remembered
 * position is defined at.
 */
async function renderResolvedBookWorkbenchRoute(
  route: ResolvedBookWorkbenchRoute,
  recoveryReturn?: RecoveryReturnContext,
): Promise<void> {
  if (route.kind === 'book') {
    const overview = await window.ai7.getBookOverview({ bookId: route.bookId, historyCursor: null });
    const anchor = overview.manuscriptAnchor;
    if (anchor === null) {
      renderBookOverview(overview, undefined, recoveryReturn);
      return;
    }
    renderEditorWindow(
      await window.ai7.getManuscriptWindowAt({
        manuscriptId: anchor.manuscriptId,
        branchId: anchor.branchId,
        target: anchor.entry === null ? { kind: 'start' } : { kind: 'block', blockId: anchor.entry.blockId },
      }),
      overview.book.title,
      recoveryReturn?.attentionId,
      manuscriptEntryNotice(anchor),
    );
    return;
  }
  renderHistoricalRevision(await window.ai7.getHistoricalRevision({ revisionId: route.revisionId, cursor: null }));
}

async function requestBookWorkbenchRoute(
  route: BookWorkbenchRoute,
  onRequestingWindow?: (resolved: ResolvedBookWorkbenchRoute) => Promise<void>,
  recoveryReturn?: RecoveryReturnContext,
): Promise<void> {
  const opened = await window.ai7.openBookWorkbench(route);
  if (opened.target === 'requesting-window') {
    if (onRequestingWindow) await onRequestingWindow(opened.route);
    else await renderResolvedBookWorkbenchRoute(opened.route, recoveryReturn);
    return;
  }
  setStatus(
    opened.target === 'new-window'
      ? `已在新的图书工作台打开《${opened.route.bookTitle}》。`
      : `已切换到《${opened.route.bookTitle}》已有的图书工作台。`,
    'success',
  );
}

async function renderOwnedBookWorkbenchRoute(): Promise<void> {
  const route = await window.ai7.getBookWorkbenchRoute();
  if (!route) return;
  setStatus('正在读取精确图书工作台路由…', 'busy');
  try {
    await renderResolvedBookWorkbenchRoute(route);
  } catch (error) {
    setStatus(rendererErrorMessage(error, '无法读取精确图书工作台路由。'), 'error');
  }
}

async function returnToLibrary(): Promise<void> {
  setStatus('正在返回图书列表…', 'busy');
  try {
    await window.ai7.leaveBookWorkbench();
    await initializeStartup();
  } catch (error) {
    setStatus(rendererErrorMessage(error, '无法返回图书列表。'), 'error');
  }
}

function sourceCard(staged: StagedImportProjection): HTMLElement {
  const card = element('section', 'source-card');
  card.append(element('p', 'section-label', '已完成本地暂存'));
  const heading = element('h3', undefined, staged.source.displayName);
  card.append(heading);
  const details = element('dl');
  const sourceBytes = element('dd', undefined, String(staged.source.sourceBytes));
  sourceBytes.setAttribute('data-source-bytes', '');
  const sourceDigest = element('dd', 'technical-identity', staged.source.sourceSha256);
  sourceDigest.setAttribute('data-source-sha256', '');
  const sourceFormat = element('dd', undefined, staged.source.format);
  sourceFormat.setAttribute('data-source-format', staged.source.format);
  details.append(
    element('dt', undefined, '格式'),
    sourceFormat,
    element('dt', undefined, '来源'),
    element('dd', undefined, staged.source.provenanceLabel),
    element('dt', undefined, '来源字节数'),
    sourceBytes,
    // A file the product did not parse detected no blocks, so it says what it retained instead of
    // reporting a count of nothing.
    element('dt', undefined, '检测结果'),
    element('dd', undefined, staged.editableImport.available
      ? `${staged.detectedBlockCount} 个可编辑内容块`
      : '未进行本地解析；仅保留原始文件'),
  );
  card.append(details, technicalDetails(undefined, element('dt', undefined, '来源 SHA-256'), sourceDigest));
  return card;
}

function identityFindingDisclosure(
  findings: StagedImportProjection['identityFindings'],
  reviewTarget?: ReviewBeforeImportProjection['target']['label'] | ReviewBeforeSourceImportProjection['target']['label'],
): HTMLElement {
  const disclosure = element('section', 'source-card identity-finding-disclosure');
  if (reviewTarget) disclosure.classList.add('review-identity-finding-summary');
  disclosure.append(
    element('p', 'section-label', reviewTarget ? '导入身份提示与本次关系' : '发现已有导入身份提示'),
    element('h3', undefined, reviewTarget ? '复核身份提示记录与不同作品后果' : '已有导入与当前文件的身份提示'),
    ...(reviewTarget ? [element('p', undefined, `本次选择：${reviewTarget}`)] : []),
    element(
      'p',
      'field-note',
      reviewTarget
        ? '身份提示不授予目标、关系、去重、覆盖或重新导入权限；现有记录保持不变，本次提交将创建另一图书的完整新记录。'
        : '身份提示仅用于披露，不会选择目标或关系，也不授予去重、覆盖或重新导入权限。',
    ),
  );
  for (const finding of findings) {
    const item = element('section', 'review-section');
    const classes = element('ul', 'degradation-list');
    const row = element('li', undefined, finding.identityClass.label);
    row.dataset['importIdentityClass'] = finding.identityClass.kind;
    classes.append(row);
    const details = element('dl');
    details.append(
      element('dt', undefined, '匹配图书'),
      element('dd', undefined, `${finding.bookTitle} · ${finding.bookId}`),
    );
    item.append(classes, details, technicalDetails(
      undefined,
      element('dt', undefined, '来源材料版本'),
      element('dd', 'technical-identity', finding.sourceVersionId),
      element('dt', undefined, finding.recordLabel),
      element('dd', 'technical-identity', finding.importRecordId),
    ));
    disclosure.append(item);
  }
  return disclosure;
}

function statusIcon(status: FidelityCategoryProjection['status']): string {
  if (status === 'preserved') return '✓';
  if (status === 'degraded') return '△';
  return '⊘';
}

/**
 * A converted file says so above its Import Fidelity Review: what it was read through, that the
 * losses below are the conversion's, and that the original file is kept as it was (ADR 0072 §3).
 * Nothing on this surface presents a converted file as one the product read natively.
 */
function conversionNote(conversion: ManuscriptConversionProjection): HTMLElement {
  const note = element(
    'p',
    'attention-note',
    `本稿件由 ${conversion.converterIdentity} 从 ${conversion.sourceFormat} 转换为 DOCX 工作表示后读取；` +
      '下列损失由转换造成，原始文件原样保留。',
  );
  note.dataset['importConversionNote'] = conversion.sourceFormat;
  return note;
}

/** The review's eight classes, with the conversion that caused their counts named above them. */
function fidelitySection(
  fidelity: ReadonlyArray<FidelityCategoryProjection>,
  conversion: ManuscriptConversionProjection | null,
): ReadonlyArray<HTMLElement> {
  return conversion === null ? [fidelityTable(fidelity)] : [conversionNote(conversion), fidelityTable(fidelity)];
}

function fidelityTable(fidelity: ReadonlyArray<FidelityCategoryProjection>): HTMLElement {
  const table = element('div', 'fidelity-list');
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', '导入保真审阅');
  for (const category of fidelity) {
    const row = element('div', 'fidelity-row');
    row.setAttribute('role', 'row');
    row.dataset['fidelityCategory'] = category.key;
    const name = element('div', 'fidelity-name');
    name.setAttribute('role', 'cell');
    name.append(document.createTextNode(category.label), element('span', 'count', ` · ${category.count} 项`));
    const status = element(
      'div',
      `status-pill status-${category.status}`,
      `${statusIcon(category.status)} ${category.statusLabel}`,
    );
    status.setAttribute('role', 'cell');
    const detail = element('div', 'fidelity-detail', category.detail);
    detail.setAttribute('role', 'cell');
    if (category.key === 'round-trip-export') {
      detail.append(element('span', 'roundtrip-note', '不提供往返保证；此能力限制不阻止本次符合范围的文本导入。'));
    }
    row.append(name, status, detail);
    table.append(row);
  }
  return table;
}

function productIsVisibleAndReady(): boolean {
  return document.visibilityState === 'visible' && document.documentElement.dataset['ai7ProductReady'] === 'true';
}

function waitForVisibleProductReady(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (productIsVisibleAndReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (): void => {
      if (!signal.aborted && !productIsVisibleAndReady()) return;
      observer.disconnect();
      document.removeEventListener('visibilitychange', finish);
      signal.removeEventListener('abort', finish);
      resolve(!signal.aborted);
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ai7-product-ready'],
    });
    document.addEventListener('visibilitychange', finish);
    signal.addEventListener('abort', finish, { once: true });
    finish();
  });
}

function nextVisibleFrame(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let frameId = 0;
    const finish = (presented: boolean): void => {
      signal.removeEventListener('abort', abort);
      if (!presented) cancelAnimationFrame(frameId);
      resolve(presented);
    };
    const abort = (): void => finish(false);
    signal.addEventListener('abort', abort, { once: true });
    frameId = requestAnimationFrame(() => finish(true));
    if (signal.aborted) abort();
  });
}

async function acknowledgeCompletionAfterPaint(result: ImportCommitProjection): Promise<boolean> {
  const presentedCommit = screen.querySelector<HTMLElement>('[data-import-commit-id]');
  if (screen.dataset['screen'] !== 'imported' || presentedCommit?.dataset['importCommitId'] !== result.commitId) {
    return false;
  }
  const presentation = new AbortController();
  const presentationObserver = new MutationObserver(() => presentation.abort());
  presentationObserver.observe(screen, {
    attributes: true,
    attributeFilter: ['data-screen'],
    childList: true,
  });
  presentationObserver.observe(presentedCommit, {
    attributes: true,
    attributeFilter: ['data-import-commit-id'],
  });
  try {
    while (true) {
      if (!await waitForVisibleProductReady(presentation.signal)) return false;
      let eligibilityChanged = false;
      const framePair = new AbortController();
      const recordEligibilityChange = (): void => {
        eligibilityChanged = true;
        framePair.abort();
      };
      const abortFramePair = (): void => framePair.abort();
      const readinessObserver = new MutationObserver(recordEligibilityChange);
      document.addEventListener('visibilitychange', recordEligibilityChange);
      presentation.signal.addEventListener('abort', abortFramePair, { once: true });
      readinessObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-ai7-product-ready'],
      });
      if (presentation.signal.aborted) abortFramePair();
      if (!productIsVisibleAndReady()) recordEligibilityChange();
      let twoFramesPresented = false;
      try {
        twoFramesPresented = await nextVisibleFrame(framePair.signal) &&
          await nextVisibleFrame(framePair.signal);
      } finally {
        if (readinessObserver.takeRecords().length > 0) recordEligibilityChange();
        readinessObserver.disconnect();
        document.removeEventListener('visibilitychange', recordEligibilityChange);
        presentation.signal.removeEventListener('abort', abortFramePair);
      }
      if (presentationObserver.takeRecords().length > 0) presentation.abort();
      if (presentation.signal.aborted) return false;
      const currentCommit = screen.querySelector<HTMLElement>('[data-import-commit-id]');
      if (screen.dataset['screen'] !== 'imported' || currentCommit !== presentedCommit ||
        currentCommit.dataset['importCommitId'] !== result.commitId) return false;
      if (eligibilityChanged || !twoFramesPresented || !productIsVisibleAndReady()) continue;
      break;
    }
  } finally {
    presentationObserver.disconnect();
  }
  document.documentElement.dataset['ai7ImportCompletionPainted'] = 'true';
  try {
    await window.ai7.acknowledgeImportCompletion({ commitId: result.commitId });
    document.documentElement.dataset['ai7ImportCompletionAcknowledged'] = 'true';
    return true;
  } catch {
    setStatus('导入已由权威记录证明；完成提示将在下次启动时再次显示。', 'error');
    return false;
  }
}

async function renderStartupProjection(
  startup: ImportStartupProjection,
  recoveryReturn?: RecoveryReturnContext,
): Promise<void> {
  if (startup.state === 'none') {
    const [priorWork, books] = await Promise.all([
      window.ai7.listPriorWork(),
      window.ai7.listBooks({ after: null }),
    ]);
    renderLanding(priorWork, recoveryReturn, books);
    return;
  }
  if (startup.state === 'committed-recovered') {
    setStatus('已核对中断前的原子提交结果', 'success');
    renderImported(startup.result, recoveryReturn);
    return;
  }
  renderImportRecovery(startup.recovery, recoveryReturn);
}

async function renderApplicationStartup(startup: StartupProjection): Promise<void> {
  if (startup.state === 'manuscript-recovery') {
    renderManuscriptRecovery(startup.recovery);
  } else if (startup.state === 'import') {
    await renderStartupProjection(startup.startup);
  } else {
    renderLanding(startup.priorWork, undefined, await window.ai7.listBooks({ after: null }));
  }
}

async function renderLandingFromAuthority(
  priorWork: ReadonlyArray<PriorWorkItemProjection>,
  recoveryReturn?: RecoveryReturnContext,
): Promise<void> {
  renderLanding(priorWork, recoveryReturn, await window.ai7.listBooks({ after: null }));
}

function recoveryCandidateCard(
  candidate: RecoveryComparisonProjection['journal'] | RecoveryComparisonProjection['checkpoint'] |
    Extract<RecoveryComparisonProjection['snapshot'], { state: 'eligible' }>['candidate'],
  onSelect: (selection: RecoverySelection, candidate: RecoveryComparisonProjection['journal'] |
    RecoveryComparisonProjection['checkpoint'] |
    Extract<RecoveryComparisonProjection['snapshot'], { state: 'eligible' }>['candidate']) => void,
): HTMLElement {
  const label = element('label', 'recovery-candidate choice');
  label.dataset['recoveryCandidate'] = candidate.kind;
  const radio = element('input');
  radio.type = 'radio';
  radio.name = 'recovery-source';
  radio.value = candidate.candidateId;
  radio.checked = false;
  radio.setAttribute('aria-label', candidate.title);
  const copy = element('span');
  copy.append(element('strong', undefined, candidate.title));
  const details = element('dl', 'recovery-candidate-details');
  const revisionIdentity = element('dd', 'technical-identity', candidate.revisionId);
  revisionIdentity.dataset['candidateRevisionId'] = candidate.revisionId;
  const revisionDigest = element('dd', 'technical-identity', candidate.revisionDigest);
  revisionDigest.dataset['candidateRevisionDigest'] = candidate.revisionDigest;
  details.append(
    element('dt', undefined, '修订版'), element('dd', undefined, candidate.revisionLabel),
    element('dt', undefined, '持久边界'), element('dd', undefined, `修订日志序号 ${candidate.journalSequence} · ${localInstantLabel(candidate.durableAt)}`),
    element('dt', undefined, '覆盖范围'), element('dd', undefined, candidate.coveredChangeExtent),
    element('dt', undefined, '校验'), element('dd', undefined, candidate.verification),
    element('dt', undefined, '限制'), element('dd', undefined, candidate.limitation),
  );
  const exact = [
    element('dt', undefined, '修订版身份'), revisionIdentity,
    element('dt', undefined, '修订摘要'), revisionDigest,
    element('dt', undefined, '持久边界（精确时间）'), element('dd', 'technical-identity', candidate.durableAt),
  ];
  if (candidate.snapshotId !== null) {
    const snapshotIdentity = element('dd', 'technical-identity', candidate.snapshotId);
    snapshotIdentity.dataset['snapshotId'] = candidate.snapshotId;
    exact.push(element('dt', undefined, '快照身份'), snapshotIdentity);
  }
  // This disclosure sits inside the candidate's `<label>`, and after its radio. Both matter: `<details>`
  // is interactive content, so a click on the summary never runs the label's activation behavior and can
  // never select this recovery source on the reader's behalf (V2-UX-LAYER-007); and coming after the
  // radio, it adds no tab stop before the choice itself.
  copy.append(details, technicalDetails('recovery-candidate-details', ...exact));
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    onSelect(candidate.kind === 'snapshot'
      ? { kind: 'snapshot', snapshotId: candidate.snapshotId }
      : { kind: candidate.kind }, candidate);
  });
  label.append(radio, copy);
  return label;
}

function focusRecoveryHeading(content: HTMLElement): void {
  const heading = content.querySelector<HTMLElement>('h2');
  if (!heading) return;
  heading.tabIndex = -1;
  requestAnimationFrame(() => heading.focus());
}

function renderManuscriptRecovery(recovery: RecoveryComparisonProjection): void {
  let selection: RecoverySelection | undefined;
  const content = panel();
  content.classList.add('manuscript-recovery-panel');
  content.append(
    element('p', 'section-label', `稿件恢复优先 · ${recovery.unresolvedCount} 项待确认`),
    element('h2', undefined, '先确认中断后的稿件状态'),
    element('p', 'lede', recovery.snapshot.state === 'eligible'
      ? '系统不会替你选择恢复来源。三个已校验证据保持并列，恢复只会形成新的后代修订版。'
      : '系统不会替你选择恢复来源。当前两个可选证据保持并列；快照状态另行披露，恢复只会形成新的后代修订版。'),
  );
  const identity = element('section', 'source-card recovery-identity');
  const identityDetails = element('dl');
  // This card takes the demoting rank but no disclosure of its own. A `<summary>` is focusable and this
  // card sits between the heading and the recovery radiogroup, so a disclosure here puts a tab stop in
  // front of the screen's primary decision — the choice a recovery screen exists to present. The
  // candidates' own disclosures sit after their radio and cost the reader nothing.
  const durableBoundary = instantValue(recovery.lastDurableEditBoundary.durableAt);
  durableBoundary.prepend(`修订日志序号 ${recovery.lastDurableEditBoundary.journalSequence} · `);
  identityDetails.append(
    element('dt', undefined, '图书'), element('dd', undefined, `${recovery.bookTitle} · ${recovery.bookId}`),
    element('dt', undefined, '稿件'), element('dd', 'technical-identity', recovery.manuscriptId),
    element('dt', undefined, '分支'), element('dd', undefined, `${recovery.branchName} · ${recovery.branchId}`),
    element('dt', undefined, '最后持久写入边界'), durableBoundary,
    element('dt', undefined, '覆盖范围'), element('dd', undefined, recovery.lastDurableEditBoundary.coveredChangeExtent),
  );
  identity.append(element('h3', undefined, '精确受影响稿件'), identityDetails,
    element('p', 'uncertain-support', recovery.lastDurableEditBoundary.uncertainty));
  content.append(identity);

  const choices = element('fieldset', 'recovery-comparison');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', '恢复来源比较');
  choices.append(element('legend', undefined, '选择一个证据来源（默认不选择）'));
  const cards = element('div', 'recovery-candidate-grid');
  cards.dataset['eligibleCandidateCount'] = recovery.snapshot.state === 'eligible' ? '3' : '2';
  const consequence = element('p', 'recovery-selection-consequence');
  consequence.hidden = true;
  consequence.setAttribute('aria-live', 'polite');
  const view = button('仅查看', 'secondary', () => {
    if (selection) void openRecoveryViewer(recovery, selection, { kind: 'start' });
  });
  const restore = button('恢复为新版本', 'primary', async () => {
    if (!selection) return;
    view.disabled = true;
    restore.disabled = true;
    defer.disabled = true;
    setStatus('正在原子创建恢复后代修订版…', 'busy');
    try {
      const restored = await window.ai7.restoreRecovery({
        attentionId: recovery.attentionId,
        expectedAttentionVersion: recovery.attentionVersion,
        selection,
      });
      setStatus(`已恢复为新版本 ${restored.descendantRevisionLabel}`, 'success');
      renderEditorWindow(restored.window, recovery.bookTitle);
    } catch (error) {
      setStatus(rendererErrorMessage(error, '恢复未完成。'), 'error');
      view.disabled = false;
      restore.disabled = false;
      defer.disabled = false;
    }
  });
  const selected = (
    next: RecoverySelection,
    candidate: RecoveryComparisonProjection['journal'] | RecoveryComparisonProjection['checkpoint'] |
      Extract<RecoveryComparisonProjection['snapshot'], { state: 'eligible' }>['candidate'],
  ): void => {
    selection = next;
    consequence.textContent = `将以“${candidate.title}”形成当前分支的新后代修订版；来源修订身份 ${candidate.revisionId}，摘要 ${candidate.revisionDigest}。既有历史与稿件固定点保持原位，且不会自动创建里程碑。`;
    consequence.dataset['selectedCandidate'] = candidate.kind;
    consequence.hidden = false;
    view.disabled = false;
    restore.disabled = false;
  };
  cards.append(recoveryCandidateCard(recovery.journal, selected), recoveryCandidateCard(recovery.checkpoint, selected));
  if (recovery.snapshot.state === 'eligible') {
    cards.append(recoveryCandidateCard(recovery.snapshot.candidate, selected));
  }
  choices.append(cards);
  content.append(choices);
  if (recovery.snapshot.state !== 'eligible') {
    const unavailable = element('section', 'recovery-snapshot-disclosure');
    unavailable.dataset['snapshotState'] = recovery.snapshot.state;
    unavailable.append(
      element('strong', undefined, '独立恢复快照不可作为本次选择'),
      element('p', undefined, recovery.snapshot.state === 'none' ? recovery.snapshot.limitation : recovery.snapshot.verification),
      element('p', 'field-note', recovery.snapshot.limitation),
    );
    content.append(unavailable);
  }
  content.append(consequence);
  view.disabled = true;
  restore.disabled = true;
  const defer = button('稍后处理', 'quiet', async () => {
    view.disabled = true;
    restore.disabled = true;
    defer.disabled = true;
    setStatus('正在保留恢复待确认状态…', 'busy');
    try {
      const deferred = await window.ai7.deferRecovery({
        attentionId: recovery.attentionId,
        expectedAttentionVersion: recovery.attentionVersion,
      });
      await window.ai7.leaveBookWorkbench();
      setStatus(deferred.completionLabel, 'success');
      const recoveryReturn = {
        attentionId: deferred.attentionId,
        attentionVersion: deferred.attentionVersion,
        bookTitle: recovery.bookTitle,
      } satisfies RecoveryReturnContext;
      if (deferred.next.state === 'import') await renderStartupProjection(deferred.next.startup, recoveryReturn);
      else await renderLandingFromAuthority(deferred.next.priorWork, recoveryReturn);
    } catch (error) {
      setStatus(rendererErrorMessage(error, '恢复待确认状态未能保留。'), 'error');
      view.disabled = selection === undefined;
      restore.disabled = selection === undefined;
      defer.disabled = false;
    }
  });
  const actions = element('div', 'button-row recovery-decision-actions');
  actions.append(view, defer, restore);
  content.append(actions,
    element('p', 'field-note', '恢复不会改写、删除或移动既有修订版、修订日志、里程碑、恢复快照或稿件固定点。'));
  replaceScreen('manuscript-recovery', content);
  focusRecoveryHeading(content);
  setStatus(recovery.status === 'deferred' ? '恢复待确认状态仍然有效' : '等待你比较并明确选择恢复来源');
}

async function openRecoveryViewer(
  recovery: RecoveryComparisonProjection,
  selection: RecoverySelection,
  target: { kind: 'start' } | { kind: 'after'; position: number },
): Promise<void> {
  setStatus('正在读取有界只读恢复窗口…', 'busy');
  try {
    const projection = await window.ai7.viewRecoveryCandidate({
      attentionId: recovery.attentionId, expectedAttentionVersion: recovery.attentionVersion,
      selection, target,
    });
    renderRecoveryViewer(recovery, projection);
  } catch (error) {
    setStatus(rendererErrorMessage(error, '无法读取恢复证据。'), 'error');
  }
}

function renderRecoveryViewer(recovery: RecoveryComparisonProjection, projection: RecoveryWindowProjection): void {
  const content = panel();
  content.classList.add('recovery-viewer');
  content.append(
    element('p', 'section-label', '仅查看 · 永久只读'),
    element('h2', undefined, projection.title),
    element('p', 'lede', `${projection.revisionLabel} · 此窗口不装载编辑器，也不提供任何写入操作。`),
  );
  const blocks = element('article', 'recovery-readonly-blocks');
  blocks.setAttribute('aria-label', '恢复证据只读内容窗口');
  for (const block of projection.blocks) {
    const node = element(block.kind === 'paragraph' ? 'p' : block.kind === 'title' ? 'h1' : 'h2', undefined, block.text);
    node.dataset['blockId'] = block.blockId;
    blocks.append(node);
  }
  content.append(blocks);
  const actions = element('div', 'button-row');
  actions.append(button('返回比较', 'secondary', () => renderManuscriptRecovery(recovery)));
  if (projection.nextTarget !== null) {
    actions.append(button('查看下一窗口', 'quiet', () =>
      openRecoveryViewer(recovery, projection.selection, projection.nextTarget!)));
  }
  content.append(actions);
  replaceScreen('recovery-viewer', content);
  focusRecoveryHeading(content);
  setStatus('正在仅查看已选择的恢复证据；普通编辑保持关闭');
}

function renderHistoricalRevision(projection: HistoricalRevisionProjection): void {
  if (!projection.readOnly || projection.blocks.length === 0 || projection.blocks.length > 32) {
    throw new Error('AI7_HISTORICAL_REVISION_INVALID');
  }
  const content = panel();
  content.classList.add('recovery-viewer', 'historical-revision-viewer');
  content.dataset['bookId'] = projection.bookId;
  content.dataset['revisionId'] = projection.revisionId;
  content.dataset['readOnly'] = 'true';
  content.dataset['blockCount'] = String(projection.blocks.length);
  content.append(
    element('p', 'section-label', `${projection.bookTitle} · 历史修订版 · 永久只读`),
    element('h2', undefined, `稿件修订版 ${projection.revisionLabel}`),
    element('p', 'lede', `${projection.position.label}。此窗口不装载编辑器，也不提供写入、修订日志、替换、撤销/重做或里程碑操作。`),
  );
  const identity = element('section', 'source-card');
  const values = element('dl');
  // A durable record, so the absolute local time stays in the Decision Layer (V2-UX-COPY-011) and only
  // the exact instant joins the identities one step away.
  values.append(
    element('dt', undefined, '创建时间'), element('dd', undefined, localInstantLabel(projection.createdAt)),
  );
  identity.append(element('h3', undefined, '不可变修订身份'), values, technicalDetails(
    undefined,
    element('dt', undefined, '图书 ID'), element('dd', 'technical-identity', projection.bookId),
    element('dt', undefined, '稿件 ID'), element('dd', 'technical-identity', projection.manuscriptId),
    element('dt', undefined, '分支 ID'), element('dd', 'technical-identity', projection.branchId),
    element('dt', undefined, '修订版 ID'), element('dd', 'technical-identity', projection.revisionId),
    element('dt', undefined, '修订摘要'), element('dd', 'technical-identity', projection.revisionDigest),
    element('dt', undefined, '来源版本 ID'), element('dd', 'technical-identity', projection.sourceVersionId),
    element('dt', undefined, '创建时间（精确）'), element('dd', 'technical-identity', projection.createdAt),
  ));
  const blocks = element('article', 'recovery-readonly-blocks historical-revision-blocks');
  blocks.setAttribute('aria-label', '历史修订版只读内容窗口');
  for (const block of projection.blocks) {
    const tag = block.kind === 'paragraph' ? 'p' : block.kind === 'title' ? 'h1' : 'h2';
    const node = element(tag, undefined, block.text);
    node.dataset['blockId'] = block.blockId;
    node.dataset['blockPosition'] = String(block.position);
    blocks.append(node);
  }
  content.append(identity, blocks);
  const actions = element('div', 'button-row');
  const returnToCurrent = button('返回当前工作状态', 'primary', async () => {
    returnToCurrent.disabled = true;
    setStatus('正在返回当前可编辑工作状态…', 'busy');
    try {
      await requestBookWorkbenchRoute(
        { kind: 'book', bookId: projection.bookId },
        async (route) => {
          if (route.kind !== 'book' || route.bookId !== projection.bookId) {
            throw new Error('AI7_WORKBENCH_ROUTE_INVALID');
          }
          const current = await window.ai7.getManuscriptWindow({
            manuscriptId: projection.manuscriptId,
            branchId: projection.branchId,
            cursor: null,
          });
          if (current.bookId !== projection.bookId) throw new Error('AI7_WORKBENCH_ROUTE_INVALID');
          renderEditorWindow(current, projection.bookTitle);
        },
      );
    } catch (error) {
      returnToCurrent.disabled = false;
      setStatus(rendererErrorMessage(error, '无法返回当前工作状态。'), 'error');
    }
  });
  returnToCurrent.dataset['returnToCurrentRevision'] = projection.revisionId;
  actions.append(returnToCurrent);
  const showPage = async (cursor: string): Promise<void> => {
    setStatus('正在读取下一段只读修订内容…', 'busy');
    try {
      renderHistoricalRevision(await window.ai7.getHistoricalRevision({
        revisionId: projection.revisionId,
        cursor,
      }));
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法读取只读修订内容。'), 'error');
    }
  };
  if (projection.previousCursor) actions.append(button('上一窗口', 'quiet', () => showPage(projection.previousCursor!)));
  if (projection.nextCursor) actions.append(button('下一窗口', 'quiet', () => showPage(projection.nextCursor!)));
  content.append(actions);
  replaceScreen('historical-revision', content);
  focusRecoveryHeading(content);
  setStatus(`只读历史修订版已打开；${projection.position.label}。`);
}

function renderContinuation(
  continuation: ContinueImportProjection,
  recoveryReturn?: RecoveryReturnContext,
): void {
  if (continuation.state === 'target-review-required') {
    setStatus(continuation.reviewInvalidated ? '旧复核已失效，需要重新确认' : '暂存快照已重新校验', 'success');
    renderTargetChoice(continuation.staged, null, continuation.notice, recoveryReturn);
    return;
  }
  if (continuation.state === 'review-ready') {
    setStatus('暂存快照与导入前复核已重新校验', 'success');
    if ('comparison' in continuation.review) {
      renderManuscriptReimportReview(continuation.review, continuation.notice, recoveryReturn);
    } else if ('retainedBoundary' in continuation.review) {
      renderSourceImportReview(continuation.review, continuation.notice, recoveryReturn);
    } else {
      renderReview(continuation.review, continuation.notice, recoveryReturn);
    }
    return;
  }
  if (continuation.state === 'committed-recovered') {
    setStatus('已核对中断前的原子提交结果', 'success');
    renderImported(continuation.result, recoveryReturn);
    return;
  }
  renderImportRecovery(continuation.recovery, recoveryReturn);
}

async function abandonAndContinue(
  recovery: Pick<ImportDraftRecoveryProjection, 'draftId' | 'draftVersion'>,
  recoveryReturn?: RecoveryReturnContext,
): Promise<void> {
  setStatus('正在核对提交证据并放弃非权威草稿…', 'busy');
  try {
    const startup = await window.ai7.abandonImportDraft({
      draftId: recovery.draftId,
      expectedDraftVersion: recovery.draftVersion,
    });
    setStatus(startup.state === 'none' ? '已放弃导入草稿并安全清理暂存引用' : '已核对导入状态', 'success');
    await renderStartupProjection(startup, recoveryReturn);
  } catch (error) {
    renderError(error, () => void initializeStartup());
  }
}

function renderImportRecovery(
  recovery: ImportDraftRecoveryProjection,
  recoveryReturn?: RecoveryReturnContext,
): void {
  const uncertain = recovery.kind === 'outcome-uncertain';
  const cleanup = recovery.kind === 'abandonment-cleanup';
  const content = panel();
  content.classList.add('recovery-panel');
  content.append(
    element(
      'p',
      'section-label',
      cleanup ? '启动恢复 · 持久放弃清理' : uncertain ? '启动恢复 · 原子结果待确认' : '启动恢复 · 非权威导入草稿',
    ),
    element('h2', undefined, cleanup ? '放弃清理尚未完成' : uncertain ? '导入提交结果待确认' : '发现未完成的导入'),
    element(
      'p',
      'lede',
      cleanup
        ? '放弃意图已经持久化。系统已阻止继续导入和任何新的权威引用；只有在暂存字节与权威记录都完成安全清理后才会报告成功。'
        : uncertain
        ? '本地证据目前无法证明这次原子提交已经完成或确定未提交。为避免重复图书或误删来源，系统已阻止重试、放弃和暂存清理。'
        : '启动不会替你继续、选择目标或提交。请明确选择继续导入或放弃。',
    ),
  );
  const summary = element('section', 'source-card recovery-summary');
  summary.append(element('h3', undefined, recovery.sourceDisplayName));
  const details = element('dl');
  details.append(
    element('dt', undefined, '状态'),
    element(
      'dd',
      undefined,
      cleanup
        ? '持久放弃清理 · 阻止继续与新权威引用'
        : uncertain
        ? '非权威草稿 · 提交结果待确认'
        : recovery.snapshotState === 'complete'
          ? '完整暂存快照 · 尚未形成导入权威'
          : '暂存不完整或损坏 · 需要精确重选',
    ),
    element('dt', undefined, '上次完成位置'),
    element(
      'dd',
      undefined,
      recovery.lastCompletedStep === 'abandonment-cleanup'
        ? '已持久化放弃与安全清理意图'
        : recovery.lastCompletedStep === 'review'
        ? '导入前复核'
        : recovery.lastCompletedStep === 'commit-attempt'
          ? '已持久化提交尝试，尚未证明提交'
          : recovery.lastCompletedStep === 'commit-outcome-uncertain'
            ? '原子提交边界'
            : '本地暂存与预检',
    ),
    ...(recovery.reviewedTitle
      ? [element('dt', undefined, '已复核书名'), element('dd', undefined, recovery.reviewedTitle)]
      : []),
    ...(recovery.targetLabel
      ? [element('dt', undefined, '已复核目标'), element('dd', undefined, recovery.targetLabel)]
      : []),
    ...(recovery.targetBookId
      ? [element('dt', undefined, '已复核图书 ID'), element('dd', 'technical-identity', recovery.targetBookId)]
      : []),
    ...(recovery.relationshipLabel
      ? [element('dt', undefined, '已复核关系'), element('dd', undefined, recovery.relationshipLabel)]
      : []),
  );
  summary.append(details);
  if (!cleanup) summary.append(element('p', recoveryTone(recovery.originalFileAccess.state), recovery.originalFileAccess.label));
  content.append(summary);
  if (cleanup) {
    const support = element('section', 'uncertain-support');
    support.append(
      element('h3', undefined, '安全清理状态'),
      element('p', undefined, `状态代码：${recovery.supportCode ?? 'ABANDON_CLEANUP_PENDING'}`),
      element('p', 'field-note', '此状态不包含暂存正文或原始文件路径。请保留 Agent Data Root；重试会继续同一个持久清理意图，不会创建第二次放弃或导入。'),
    );
    const actions = element('div', 'button-row recovery-actions');
    actions.append(button('重试放弃清理', 'primary', () => abandonAndContinue(recovery, recoveryReturn)));
    content.append(support, actions);
    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen('import-cleanup', content);
    setStatus('放弃清理尚未完成；已阻止继续导入和新权威引用', 'error');
    return;
  }
  if (recovery.staged) content.append(sourceCard(recovery.staged));

  if (uncertain) {
    const support = element('section', 'uncertain-support');
    support.append(
      element('h3', undefined, '本地恢复与支持信息'),
      element('p', undefined, `草稿标识：${recovery.draftId}`),
      element('p', undefined, `提交尝试：${recovery.commitAttemptId ?? '未读取'}`),
      element('p', undefined, `状态代码：${recovery.supportCode ?? 'COMMIT_PROOF_INCONCLUSIVE'}`),
      element('p', 'field-note', '这些信息不包含暂存正文、数据库内容、截图、跟踪或网络请求。请保留 Agent Data Root，等待本地核对；不要重复导入或手动删除暂存文件。'),
    );
    content.append(support);
    appendRecoveryReturnAction(content, recoveryReturn);
    replaceScreen('import-uncertain', content);
    setStatus('导入提交结果待确认；已阻止重试、放弃和清理', 'error');
    return;
  }

  const actions = element('div', 'button-row recovery-actions');
  if (recovery.snapshotState === 'complete') {
    const abandonButton = button('放弃', 'secondary', () => abandonAndContinue(recovery, recoveryReturn));
    const continueButton = button('继续导入', 'primary', async () => {
      continueButton.disabled = true;
      abandonButton.disabled = true;
      setStatus('正在重新校验暂存字节、解析器、目标与复核…', 'busy');
      try {
        renderContinuation(
          await window.ai7.continueImportDraft({
            draftId: recovery.draftId,
            expectedDraftVersion: recovery.draftVersion,
          }),
          recoveryReturn,
        );
      } catch (error) {
        renderError(error, () => void initializeStartup());
      }
    });
    actions.append(continueButton, abandonButton);
  } else {
    const abandonButton = button('放弃', 'secondary', () => abandonAndContinue(recovery, recoveryReturn));
    const reselect = button('重新选择原文件', 'primary', async () => {
      reselect.disabled = true;
      abandonButton.disabled = true;
      setStatus('请选择与原暂存来源摘要精确一致的 DOCX…', 'busy');
      try {
        const result = await window.ai7.reselectImportDraft({
          draftId: recovery.draftId,
          expectedDraftVersion: recovery.draftVersion,
        });
        if (result.status === 'cancelled') {
          renderImportRecovery(recovery, recoveryReturn);
          setStatus('已取消文件重选');
          return;
        }
        renderContinuation(result.continuation, recoveryReturn);
      } catch (error) {
        renderError(error, () => void initializeStartup());
      }
    });
    actions.append(reselect, abandonButton);
  }
  content.append(actions);
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen('import-recovery', content);
  setStatus('等待你选择继续导入或放弃');
}

function appendRecordField(values: HTMLElement, label: string, value: string | null, technical = false): void {
  values.append(
    element('dt', undefined, label),
    element('dd', technical ? 'technical-identity' : undefined, value ?? '—'),
  );
}

/**
 * A record's instant. The record detail is itself the Technical Identity Layer, reached by a deliberate
 * click, so it gains no disclosure of its own (the survey judged it conforming); the exact instant rides
 * inside the row beside the absolute local reading V2-UX-COPY-011 requires of a durable receipt.
 */
function appendRecordInstant(values: HTMLElement, label: string, iso: string): void {
  values.append(element('dt', undefined, label), instantValue(iso));
}

function recordPresentation(record: BookRecordPresentation): HTMLElement {
  const detail = element('section', 'source-card record-detail');
  detail.dataset['recordKind'] = record.kind;
  detail.append(element('h3', undefined, record.label));
  const values = element('dl');
  switch (record.kind) {
    case 'book':
      appendRecordField(values, '图书 ID', record.bookId, true);
      appendRecordField(values, '稳定标识', record.stableIdentity, true);
      appendRecordField(values, '书名', record.title);
      appendRecordField(values, '内部编号', record.internalNumber);
      appendRecordInstant(values, '创建时间', record.createdAt);
      appendRecordField(values, '编辑维度集 ID', record.dimensionSetId, true);
      appendRecordField(values, '编辑维度集摘要', record.dimensionSetDigest, true);
      break;
    case 'manuscript':
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '关系', '主稿件');
      appendRecordInstant(values, '创建时间', record.createdAt);
      break;
    case 'revision':
      appendRecordField(values, '修订版 ID', record.revisionId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '分支 ID', record.branchId, true);
      appendRecordField(values, '版本标签', record.revisionLabel);
      appendRecordField(values, '修订摘要', record.revisionDigest, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordInstant(values, '创建时间', record.createdAt);
      break;
    case 'source':
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '原文件名', record.displayName);
      appendRecordField(values, '格式', record.format);
      appendRecordField(values, '原文件 SHA-256', record.sourceDigest, true);
      // A retained original the product never parsed has no content, structure or parser identity,
      // so those rows are absent rather than empty (ADR 0072 §2).
      if (record.parserIdentity !== null) {
        appendRecordField(values, '内容摘要', record.contentDigest, true);
        appendRecordField(values, '结构摘要', record.structureDigest, true);
        appendRecordField(values, '解析器', record.parserIdentity);
      }
      // An original the product read through a converted DOCX names that object and its converter,
      // beside — never instead of — the original's own identity above (ADR 0072 §2).
      if (record.converterIdentity !== null) {
        appendRecordField(values, '工作表示 SHA-256', record.workingObjectDigest, true);
        appendRecordField(values, '转换器', record.converterIdentity);
      }
      appendRecordField(values, '取得方式', '本机文件选择器');
      appendRecordField(values, '处理边界', '本地 · 未调用 Provider');
      break;
    case 'workflow':
      appendRecordField(values, '工作流实例 ID', record.workflowInstanceId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '当前阶段', record.currentPhase);
      appendRecordField(values, '实例状态', record.state);
      appendRecordField(values, 'AI7 投影', `${record.projection.id}@${record.projection.version}`);
      appendRecordField(values, 'AI7 投影摘要', record.projection.digest, true);
      appendRecordField(values, '原生 Profile', `${record.nativeProfile.id}@${record.nativeProfile.version}`);
      appendRecordField(values, '原生 Profile 摘要', record.nativeProfile.digest, true);
      break;
    case 'import-record':
      appendRecordField(values, '稿件导入记录 ID', record.importRecordId, true);
      appendRecordField(values, '原子提交 ID', record.commitId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '导入保真审阅 ID', record.fidelityReviewId, true);
      appendRecordField(
        values,
        '保真结果',
        record.fidelityOutcome === 'degraded-import-no-round-trip' ? '含已接受的降级 · 不提供 DOCX 往返保证' : '完整保留 · 不提供 DOCX 往返保证',
      );
      appendRecordField(values, '导入降级决定 ID', record.degradationDecisionId, true);
      appendRecordField(values, '结果修订版 ID', record.resultingRevisionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordInstant(values, '导入时间', record.importedAt);
      break;
    case 'source-import-record':
      appendRecordField(values, '来源导入记录 ID', record.sourceImportRecordId, true);
      appendRecordField(values, '原子提交 ID', record.commitId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordField(values, '目标类型', record.targetKind === 'new-book' ? '新建图书' : '现有图书');
      appendRecordField(
        values,
        '来源版本结果',
        record.sourceVersionDisposition === 'reused-same-book' ? '复用已明确选择的同图书来源版本' : '创建图书拥有的新来源版本',
      );
      // The boundary claims a parse only where one happened (ADR 0072 §2).
      appendRecordField(values, '保留边界', record.retainedBoundary.contentDigest === null
        ? '完整所选原始文件及其精确身份；未进行本地解析'
        : '完整所选 DOCX 文件及本地解析出的完整内容与结构身份');
      appendRecordField(values, '保留文件名', record.retainedBoundary.displayName);
      appendRecordField(values, '保留格式', record.retainedBoundary.format);
      appendRecordField(values, '保留字节数', String(record.retainedBoundary.sourceBytes));
      appendRecordField(values, '保留文件 SHA-256', record.retainedBoundary.sourceSha256, true);
      if (record.retainedBoundary.contentDigest !== null && record.retainedBoundary.structureDigest !== null) {
        appendRecordField(values, '保留内容摘要', record.retainedBoundary.contentDigest, true);
        appendRecordField(values, '保留结构摘要', record.retainedBoundary.structureDigest, true);
      }
      appendRecordField(values, '记录摘要', record.recordDigest, true);
      appendRecordInstant(values, '导入时间', record.importedAt);
      break;
    case 'manuscript-reimport-record':
      appendRecordField(values, '稿件重新导入记录 ID', record.reimportRecordId, true);
      appendRecordField(values, '原子提交 ID', record.commitId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordField(values, '前一修订版 ID', record.previousRevisionId, true);
      appendRecordField(values, '结果修订版 ID', record.resultingRevisionId, true);
      appendRecordField(values, '结果', record.resultLabel);
      appendRecordField(values, '来源关系', record.lineageLabel);
      appendRecordField(values, '来源关系版本 ID', record.lineageSourceVersionId, true);
      appendRecordField(values, '比较方式', record.comparisonKind === 'three-way' ? '三方比较' : '两方比较');
      appendRecordField(values, '比较摘要', record.comparisonDigest, true);
      appendRecordField(values, '解决摘要', record.resolutionDigest, true);
      appendRecordField(values, '导入保真审阅 ID', record.fidelityReviewId, true);
      appendRecordField(values, '保真结果', record.fidelityOutcome === 'degraded-import-no-round-trip'
        ? '含已接受的降级 · 不提供 DOCX 往返保证'
        : '完整保留 · 不提供 DOCX 往返保证');
      appendRecordField(values, '导入降级决定 ID', record.degradationDecisionId, true);
      appendRecordField(values, '记录摘要', record.recordDigest, true);
      appendRecordInstant(values, '导入时间', record.importedAt);
      break;
  }
  detail.append(values);
  if (record.kind === 'import-record' || record.kind === 'manuscript-reimport-record') {
    const fidelity = element('details', 'degradation-disclosure');
    fidelity.append(element('summary', undefined, '查看导入保真审阅 · 8 类'));
    const categories = element('ul', 'degradation-list');
    for (const category of record.fidelityCategories) {
      categories.append(element(
        'li',
        undefined,
        `${category.label} · ${category.statusLabel} · ${category.count} 项 · ${category.detail}`,
      ));
    }
    fidelity.append(categories);
    detail.append(fidelity);
    if (record.degradationDecision) {
      detail.append(element('p', 'field-note', record.degradationDecision.summaryLabel));
      const acceptedDisclosure = element('details', 'degradation-disclosure');
      acceptedDisclosure.append(element('summary', undefined, '查看受影响类别、示例与导出后果'));
      const accepted = element('ul', 'degradation-list');
      for (const item of record.degradationDecision.acceptedItems) {
        const category = record.fidelityCategories.find((candidate) => candidate.key === item.categoryKey);
        if (!category) throw new Error('AI7_IMPORT_RESULT_INVALID');
        const row = element('li', undefined, `${item.label} · ${item.count} 项 · ${category.detail}`);
        row.dataset['degradationCategory'] = item.categoryKey;
        row.dataset['degradationCount'] = String(item.count);
        accepted.append(row);
      }
      acceptedDisclosure.append(accepted);
      detail.append(acceptedDisclosure);
    }
  }
  if (record.kind === 'source-import-record') {
    detail.append(listSection('明确不会发生', record.namedNonEffects));
  }
  if (record.kind === 'revision') {
    const openRevision = button('打开此历史修订版', 'secondary', async () => {
      openRevision.disabled = true;
      setStatus('正在路由到精确历史修订版…', 'busy');
      try {
        await requestBookWorkbenchRoute({ kind: 'revision', revisionId: record.revisionId });
      } catch (error) {
        openRevision.disabled = false;
        setStatus(rendererErrorMessage(error, '无法打开精确历史修订版。'), 'error');
      }
    });
    openRevision.dataset['openRevisionId'] = record.revisionId;
    const actions = element('div', 'button-row');
    actions.append(openRevision);
    detail.append(actions);
  }
  return detail;
}

async function renderBookWorkbenchChooser(
  currentOverview: BookWorkOverviewProjection,
  accumulated: ReadonlyArray<BookSummaryPageProjection['items'][number]> = [],
  after: BookSummaryPageProjection['nextCursor'] = null,
): Promise<void> {
  setStatus('正在读取其他图书…', 'busy');
  try {
    const page = await window.ai7.listBooks({ after });
    const books = [...accumulated, ...page.items];
    const content = panel();
    content.classList.add('book-workbench-chooser');
    content.dataset['currentBookId'] = currentOverview.book.bookId;
    content.append(
      element('p', 'section-label', `${currentOverview.book.title} · 图书工作台`),
      element('h2', undefined, '在另一本图书工作台打开'),
      element('p', 'lede', '选择会创建或显示目标图书已有的工作台；当前图书工作台保持打开。'),
    );
    const list = element('div', 'recent-work-list');
    for (const summary of books) {
      if (summary.bookId === currentOverview.book.bookId) continue;
      const open = button(`${summary.title} · ${summary.manuscriptStateLabel}`, 'secondary', async () => {
        open.disabled = true;
        setStatus('正在打开精确图书工作台…', 'busy');
        try {
          await requestBookWorkbenchRoute({ kind: 'book', bookId: summary.bookId });
        } catch (error) {
          open.disabled = false;
          setStatus(rendererErrorMessage(error, '无法打开精确图书工作台。'), 'error');
        }
      });
      open.dataset['bookId'] = summary.bookId;
      const row = element('article', 'book-summary-item');
      row.append(
        open,
        element('p', 'field-note', `图书 ID ${summary.bookId} · 稳定标识 ${summary.stableIdentity}`),
      );
      list.append(row);
    }
    if (list.childElementCount === 0) {
      list.append(element('p', 'field-note', '没有其他图书可打开。'));
    }
    content.append(list);
    const actions = element('div', 'button-row');
    if (page.nextCursor) {
      actions.append(button('加载更多图书', 'secondary', () =>
        renderBookWorkbenchChooser(currentOverview, books, page.nextCursor)));
    }
    actions.append(button('返回当前图书', 'quiet', () => renderBookOverview(currentOverview)));
    content.append(actions);
    replaceScreen('book-workbench-chooser', content);
    setStatus('请选择另一图书工作台');
  } catch (error) {
    setStatus(rendererErrorMessage(error, '无法读取其他图书。'), 'error');
  }
}

/**
 * ②A: the baseline analysis as its own destination under 资料与记录 (editor-surfaces §3, ADR 0076 §5).
 * It is reached from the manuscript's 资料与记录 group and from 工作概览, never on the way into a Book.
 * The way back to the manuscript and to the overview sits in a persistent region, because a settled
 * result set is the longest thing this product renders and its way out must survive it (LAYER-005).
 */
function renderBookAnalysis(bookId: string, bookTitle: string): void {
  const content = panel();
  content.classList.add('book-analysis');
  content.dataset['bookId'] = bookId;
  content.append(
    element('p', 'section-label', '资料与记录 · 分析'),
    element('h2', undefined, bookTitle),
    element('p', 'lede', '基线分析是其他任务的底稿：全书梗概、人物与名称、事件、关系、设定和各章。它只读稿件，不改稿件。'),
  );
  const host = element('div');
  host.dataset['analysisBookId'] = bookId;
  const actions = element('div', 'button-row workbench-actions');
  const openManuscript = button('打开稿件', 'primary', async () => {
    openManuscript.disabled = true;
    setStatus('正在打开稿件…', 'busy');
    try {
      await renderResolvedBookWorkbenchRoute({ kind: 'book', bookId, bookTitle });
    } catch (error) {
      openManuscript.disabled = false;
      setStatus(rendererErrorMessage(error, '无法打开稿件。'), 'error');
    }
  });
  const openOverview = button('工作概览', 'secondary', async () => {
    openOverview.disabled = true;
    setStatus('正在打开图书工作概览…', 'busy');
    try {
      renderBookOverview(await window.ai7.getBookOverview({ bookId, historyCursor: null }));
    } catch (error) {
      openOverview.disabled = false;
      setStatus(rendererErrorMessage(error, '无法打开图书工作概览。'), 'error');
    }
  });
  actions.append(openManuscript, openOverview);
  content.append(host, actions);
  replaceScreen('book-analysis', content);
  setStatus('分析已打开');
  void window.ai7.inspectBaselineAnalysis().then(
    (projection) => {
      if (host.isConnected && projection.bookId === host.dataset['analysisBookId']) renderBaselineAnalysis(host, projection, bookTitle);
    },
    (error) => {
      if (!host.isConnected) return;
      const unavailable = element('section', 'baseline-analysis-card attention-note');
      unavailable.dataset['analysisState'] = 'unavailable';
      unavailable.append(
        element('h3', undefined, '基线稿件分析'),
        element('p', undefined, rendererErrorMessage(error, '无法读取本地图书的基线稿件分析记录。')),
      );
      host.replaceChildren(unavailable);
    },
  );
}

/**
 * ②B 审阅 as its own Book destination under 工作 (editor-surfaces §4, V2-UX-REV-001). The surface is
 * `review-workspace.ts`; this only routes to it and gives it the workbench's persistent way out, appended
 * last for the same reason ②A's is (LAYER-005). `focus` opens a named Review Run with one finding in
 * view, which is how a Mark Card's 查看任务 arrives here.
 */
function renderBookReview(bookId: string, bookTitle: string, focus: ReviewFocus | null = null): void {
  const content = panel();
  content.classList.add('book-review');
  content.dataset['bookId'] = bookId;
  const openBook = async (): Promise<void> => {
    await renderResolvedBookWorkbenchRoute({ kind: 'book', bookId, bookTitle });
  };
  const surface = mountReviewWorkspace({
    root: content,
    bookId,
    bookTitle,
    focus,
    api: window.ai7,
    awaitServiceJob,
    technicalDetails,
    setStatus,
    errorMessage: rendererErrorMessage,
    errorCode: (error) => rendererErrorData(error)?.code ?? null,
    openManuscript: async () => {
      setStatus('正在打开稿件…', 'busy');
      try {
        await openBook();
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法打开稿件。'), 'error');
      }
    },
    goToText: async (target) => {
      const opened = await window.ai7.getManuscriptWindowAt({
        manuscriptId: target.manuscriptId,
        branchId: target.branchId,
        target: { kind: 'block', blockId: target.blockId },
      });
      renderEditorWindow(opened, bookTitle, undefined, undefined, target.markId ?? undefined);
    },
  });
  const actions = element('div', 'button-row workbench-actions');
  const openManuscript = button(REVIEW_DESTINATION_ACTIONS[0], 'primary', async () => {
    openManuscript.disabled = true;
    setStatus('正在打开稿件…', 'busy');
    try {
      await openBook();
    } catch (error) {
      openManuscript.disabled = false;
      setStatus(rendererErrorMessage(error, '无法打开稿件。'), 'error');
    }
  });
  const openOverview = button(REVIEW_DESTINATION_ACTIONS[1], 'secondary', async () => {
    openOverview.disabled = true;
    setStatus('正在打开图书工作概览…', 'busy');
    try {
      renderBookOverview(await window.ai7.getBookOverview({ bookId, historyCursor: null }));
    } catch (error) {
      openOverview.disabled = false;
      setStatus(rendererErrorMessage(error, '无法打开图书工作概览。'), 'error');
    }
  });
  actions.append(openManuscript, openOverview);
  content.append(actions);
  replaceScreen('book-review', content);
  reviewWorkspace = surface;
  surface.start();
  setStatus(REVIEW_STATUS_LINES.opened);
}

function renderBookOverview(
  overview: BookWorkOverviewProjection,
  completion?: ImportCommitProjection,
  recoveryReturn?: RecoveryReturnContext,
  emptyBookCreated = false,
): void {
  const sourceCompletion: SourceImportCommitProjection | undefined =
    completion && 'sourceImportRecordId' in completion ? completion : undefined;
  const reimportCompletion = completion && 'reimportRecordId' in completion ? completion : undefined;
  const content = panel();
  content.classList.add('book-overview');
  content.dataset['bookId'] = overview.book.bookId;
  content.dataset['manuscriptState'] = overview.manuscriptState.state;
  if (completion) content.dataset['importCommitId'] = completion.commitId;
  content.append(
    element(
      'p',
      'section-label',
      completion
        ? `${completion.completionLabel} · 图书工作概览`
        : emptyBookCreated ? '图书已创建 · 图书工作概览' : '图书工作概览',
    ),
    element('h2', undefined, overview.book.title),
    element('p', 'lede', overview.manuscriptState.label),
  );
  if (sourceCompletion) {
    content.append(element('p', 'success-note', '来源材料已导入；以下可精确查看图书拥有的来源版本与本次文件专属来源导入记录。'));
  } else if (reimportCompletion) {
    content.append(element('p', 'success-note', reimportCompletion.resultKind === 'changed'
      ? '稿件已重新导入；已形成一份后代修订版和可直接查看的重新导入记录。'
      : '未发现稿件变化；已保留精确证据并且没有创建空修订版。'));
  } else if (completion) {
    content.append(element('p', 'success-note', '稿件已导入；以下为这本图书的精确结果记录。'));
  }
  else if (emptyBookCreated) content.append(element('p', 'success-note', '图书已创建；尚未创建任何稿件或导入记录。'));
  // V2-UX-BOOK-001: with a primary Manuscript the overview leads with it — the Revision, where the
  // editor last was, and whether the edits are in the journal — above the Book's own identity and
  // every record below. Its continuation action is `打开稿件`, the first action of the sticky
  // `.workbench-actions` region, which V2-UX-LAYER-005 keeps on screen for the whole surface; the
  // anchor therefore states the three readings and does not repeat the action's label beside them.
  const anchor = overview.manuscriptAnchor;
  if (anchor !== null) {
    const anchorSection = element('section', 'source-card manuscript-anchor');
    anchorSection.dataset['manuscriptAnchor'] = anchor.entry === null ? 'no-entry-position' : anchor.entry.state;
    const anchorValues = element('dl');
    anchorValues.append(
      element('dt', undefined, '修订版'), element('dd', undefined, anchor.revisionLabel),
      element('dt', undefined, '上次位置'),
      element('dd', undefined, anchor.entry === null
        ? '尚未记录；打开稿件时从稿件开头开始'
        : anchor.entry.state === 'nearest-anchor'
          ? `${anchor.entry.label}（上次位置所在的内容块已不在当前修订版，落到最近的位置）`
          : anchor.entry.label),
      element('dt', undefined, '保存状态'), element('dd', undefined, anchor.journalLabel),
    );
    anchorSection.append(element('h3', undefined, '稿件'), anchorValues, technicalDetails(
      undefined,
      element('dt', undefined, '稿件 ID'), element('dd', 'technical-identity', anchor.manuscriptId),
      element('dt', undefined, '分支 ID'), element('dd', 'technical-identity', anchor.branchId),
      element('dt', undefined, '修订版 ID'), element('dd', 'technical-identity', anchor.revisionId),
      element('dt', undefined, '修订日志序号'), element('dd', 'technical-identity', String(anchor.journalSequence)),
      element('dt', undefined, '上次位置内容块 ID'),
      element('dd', 'technical-identity', anchor.entry === null ? '—' : anchor.entry.blockId),
      element('dt', undefined, '上次位置字素'),
      element('dd', 'technical-identity', anchor.entry === null ? '—' : String(anchor.entry.grapheme)),
    ));
    content.append(anchorSection);
  }
  const identity = element('section', 'source-card');
  const identityValues = element('dl');
  identityValues.append(
    element('dt', undefined, '内部编号'), element('dd', undefined, overview.book.internalNumber ?? '未设置'),
    element('dt', undefined, '稿件状态'), element('dd', undefined, overview.manuscriptState.label),
  );
  identity.append(element('h3', undefined, '图书'), identityValues, technicalDetails(
    undefined,
    element('dt', undefined, '图书 ID'), element('dd', 'technical-identity', overview.book.bookId),
    element('dt', undefined, '稳定标识'), element('dd', 'technical-identity', overview.book.stableIdentity),
  ));
  content.append(identity);

  const artifactHost = element('div');
  artifactHost.dataset['nativeArtifactBookId'] = overview.book.bookId;
  content.append(artifactHost);
  void window.ai7.inspectEditorialWorkspaceProfile().then(
    (projection) => {
      if (artifactHost.isConnected && projection.bookId === artifactHost.dataset['nativeArtifactBookId']) {
        renderEditorialWorkspaceProfile(artifactHost, projection);
      }
    },
    (error) => {
      if (!artifactHost.isConnected) return;
      const unavailable = element('section', 'native-artifact-card attention-note');
      unavailable.dataset['nativeArtifactState'] = 'unavailable-needs-attention';
      unavailable.append(
        element('h3', undefined, '编辑工作区方案'),
        element('p', undefined, rendererErrorMessage(error, '无法读取本地声明式方案。')),
      );
      artifactHost.replaceChildren(unavailable);
    },
  );

  const taskHost = element('div');
  taskHost.dataset['taskAuthorizationBookId'] = overview.book.bookId;
  const inspectTaskAuthorization = (): void => {
    if (!taskHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    void window.ai7.inspectTaskAuthorization().then(
      (projection) => {
        if (taskHost.isConnected && projection.bookId === taskHost.dataset['taskAuthorizationBookId']) {
          renderTaskAuthorization(taskHost, projection);
        }
      },
      (error) => {
        if (!taskHost.isConnected) return;
        const unavailable = element('section', 'task-authorization-card attention-note');
        unavailable.dataset['taskAuthorizationState'] = 'unavailable';
        unavailable.append(
          element('h3', undefined, '任务运行授权'),
          element('p', undefined, rendererErrorMessage(error, '无法读取本地图书任务授权记录。')),
        );
        taskHost.replaceChildren(unavailable);
      },
    );
  };
  // 工作概览 is a destination that shows the Book whole (editor-surfaces §2): the analysis is one line
  // here — what state it is in — and its own destination under 资料与记录 is one step away (§3).
  const analysisHost = element('section', 'book-analysis-summary');
  analysisHost.dataset['analysisBookId'] = overview.book.bookId;
  const inspectBaselineAnalysis = (): void => {
    if (!analysisHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    const open = button('打开分析', 'secondary', () => renderBookAnalysis(overview.book.bookId, overview.book.title));
    open.dataset['analysisAction'] = 'open-analysis';
    void window.ai7.inspectBaselineAnalysis().then(
      (projection) => {
        if (!analysisHost.isConnected || projection.bookId !== analysisHost.dataset['analysisBookId']) return;
        analysisHost.dataset['analysisState'] = projection.state;
        analysisHost.replaceChildren(
          element('h3', undefined, '分析'),
          element('p', undefined, projection.resultSetRevision === null
            ? `基线分析 · ${projection.stateLabel}`
            : `基线分析 · ${projection.stateLabel} · 读的是 ${projection.resultSetRevision.manuscriptPin.revisionLabel} · ${projection.resultSetRevision.freshness.state === 'current' ? '稿件此后没有改动' : '稿件此后有改动'}`),
          open,
        );
      },
      (error) => {
        if (!analysisHost.isConnected) return;
        analysisHost.dataset['analysisState'] = 'unavailable';
        analysisHost.replaceChildren(
          element('h3', undefined, '分析'),
          element('p', 'attention-note', rendererErrorMessage(error, '无法读取本地图书的基线稿件分析记录。')),
        );
      },
    );
  };
  // 审阅 is one line here as well (editor-surfaces §2, §4): the latest Review Run and what waits for the
  // editor, one step from its destination under 工作, which comes before 资料与记录's 分析.
  const reviewHost = element('section', 'book-review-summary');
  reviewHost.dataset['reviewBookId'] = overview.book.bookId;
  const inspectReviewSummary = (): void => {
    if (!reviewHost.isConnected || overview.manuscriptState.state !== 'populated') return;
    const open = button(REVIEW_ACTION_LABELS['open-review'], 'secondary', () => renderBookReview(overview.book.bookId, overview.book.title));
    open.dataset['reviewAction'] = 'open-review';
    // The line needs the Runs and the coverage only, so it asks for the page after the last finding —
    // an empty one — and never carries a Run's findings onto the overview.
    void window.ai7.inspectReviewWorkspace({ reviewRunId: null, findingsAfterOrdinal: Number.MAX_SAFE_INTEGER }).then(
      (workspace) => {
        if (!reviewHost.isConnected || workspace.bookId !== reviewHost.dataset['reviewBookId']) return;
        reviewHost.dataset['reviewState'] = workspace.run === null ? 'empty' : workspace.run.state;
        reviewHost.replaceChildren(element('h3', undefined, REVIEW_CARD_HEADING), element('p', undefined, reviewOverviewLine(workspace)), open);
      },
      (error) => {
        if (!reviewHost.isConnected) return;
        reviewHost.dataset['reviewState'] = 'unavailable';
        reviewHost.replaceChildren(
          element('h3', undefined, REVIEW_CARD_HEADING),
          element('p', 'attention-note', rendererErrorMessage(error, REVIEW_WORKSPACE_UNAVAILABLE)),
          open,
        );
      },
    );
  };
  if (overview.manuscriptState.state === 'populated') {
    content.append(taskHost, reviewHost, analysisHost);
  }

  const detailHost = element('div');
  const actions = element('div', 'button-row workbench-actions');
  const completionActionButtons: HTMLButtonElement[] = [];
  if (sourceCompletion) {
    const sourceRecord = sourceCompletion.receipt.source;
    const sourceImportRecord = sourceCompletion.receipt.record;
    if (sourceRecord.sourceVersionId !== sourceCompletion.sourceVersionId ||
      sourceImportRecord.sourceImportRecordId !== sourceCompletion.sourceImportRecordId) {
      throw new Error('AI7_SOURCE_IMPORT_RESULT_INVALID');
    }
    const viewSource = button('查看来源材料', 'primary', () => detailHost.replaceChildren(recordPresentation(sourceRecord)));
    viewSource.dataset['viewSourceVersionId'] = sourceCompletion.sourceVersionId;
    const viewImportRecord = button('查看来源导入记录', 'secondary', () =>
      detailHost.replaceChildren(recordPresentation(sourceImportRecord)));
    viewImportRecord.dataset['viewSourceImportRecordId'] = sourceCompletion.sourceImportRecordId;
    viewSource.disabled = true;
    viewImportRecord.disabled = true;
    completionActionButtons.push(viewSource, viewImportRecord);
    actions.append(viewSource, viewImportRecord);
  } else if (reimportCompletion) {
    const reimportRecord = reimportCompletion.receipt;
    if (reimportRecord.reimportRecordId !== reimportCompletion.reimportRecordId) {
      throw new Error('AI7_REIMPORT_RESULT_INVALID');
    }
    const viewRecord = button('查看稿件重新导入记录', 'primary', () =>
      detailHost.replaceChildren(recordPresentation(reimportRecord)));
    viewRecord.dataset['viewReimportRecordId'] = reimportCompletion.reimportRecordId;
    const openManuscript = button('打开稿件', 'secondary', () =>
      renderEditorWindow(reimportCompletion.window, overview.book.title, recoveryReturn?.attentionId));
    viewRecord.disabled = true;
    openManuscript.disabled = true;
    completionActionButtons.push(viewRecord, openManuscript);
    actions.append(viewRecord, openManuscript);
  } else if (overview.primaryAction.kind === 'import-first-manuscript') {
    const importFirst = button('导入首份稿件', 'primary', async () => {
      importFirst.disabled = true;
      setStatus('正在本地解析 DOCX…', 'busy');
      try {
        const result = await window.ai7.selectAndStageManuscript();
        if (result.status === 'cancelled') {
          importFirst.disabled = false;
          setStatus('已取消文件选择');
          return;
        }
        let staged = result.staged;
        let exactChoice = staged.targetChoices.find(
          (choice) => choice.kind === 'existing-book' && choice.bookId === overview.book.bookId,
        );
        if (!exactChoice) {
          exactChoice = {
            kind: 'existing-book',
            id: `existing-book:${overview.book.bookId}`,
            bookId: overview.book.bookId,
            label: `${overview.book.title} · ${overview.book.internalNumber === null ? '' : `内部编号 ${overview.book.internalNumber} · `}图书 ID ${overview.book.bookId}`,
            internalNumber: overview.book.internalNumber,
            manuscriptState: 'empty',
            reimportLineageSourceVersionIds: [],
            reimportLineagePageAfter: null,
            reimportLineagePreviousCursor: null,
            reimportLineageNextCursor: null,
            selected: false,
          };
          staged = { ...staged, targetChoices: [...staged.targetChoices, exactChoice] };
        }
        renderTargetChoice(staged, exactChoice.id, undefined, recoveryReturn);
      } catch (error) {
        importFirst.disabled = false;
        setStatus(rendererErrorMessage(error, '无法开始首份稿件导入。'), 'error');
      }
    });
    actions.append(importFirst);
    if (completion) {
      importFirst.disabled = true;
      completionActionButtons.push(importFirst);
    }
  } else {
    const manuscriptAction = overview.primaryAction;
    const primaryActionButton = button('打开稿件', 'primary', async () => {
      setStatus('正在打开稿件…', 'busy');
      try {
        renderEditorWindow(await window.ai7.getManuscriptWindow({
          manuscriptId: manuscriptAction.manuscriptId,
          branchId: manuscriptAction.branchId,
          cursor: null,
        }), overview.book.title, recoveryReturn?.attentionId);
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法打开稿件。'), 'error');
      }
    });
    actions.append(primaryActionButton);
    if (completion) {
      primaryActionButton.disabled = true;
      completionActionButtons.push(primaryActionButton);
    }
  }
  actions.append(
    button('打开另一本图书', 'secondary', () => renderBookWorkbenchChooser(overview)),
    button('返回图书列表', 'secondary', () => returnToLibrary()),
  );

  const records = element('section', 'review-section record-navigation');
  records.append(element('h3', undefined, '精确记录'));
  const recordButtons = element('div', 'button-row');
  for (const record of overview.records) {
    const open = button(record.label, 'secondary', () => detailHost.replaceChildren(recordPresentation(record)));
    open.dataset['recordKind'] = record.kind;
    if (record.kind === 'book') open.dataset['recordId'] = record.bookId;
    else if (record.kind === 'manuscript') open.dataset['recordId'] = record.manuscriptId;
    else if (record.kind === 'revision') open.dataset['recordId'] = record.revisionId;
    else if (record.kind === 'source') open.dataset['recordId'] = record.sourceVersionId;
    else if (record.kind === 'workflow') open.dataset['recordId'] = record.workflowInstanceId;
    else if (record.kind === 'import-record') open.dataset['recordId'] = record.importRecordId;
    else if (record.kind === 'source-import-record') open.dataset['recordId'] = record.sourceImportRecordId;
    else open.dataset['recordId'] = record.reimportRecordId;
    recordButtons.append(open);
  }
  records.append(recordButtons, detailHost);
  const historyNavigation = element('div', 'button-row compact-actions');
  const replaceHistoryPage = async (historyCursor: NonNullable<BookWorkOverviewProjection['historyPage']['nextCursor']>) => {
    setStatus('正在读取图书历史页…', 'busy');
    try {
      renderBookOverview(await window.ai7.getBookOverview({ bookId: overview.book.bookId, historyCursor }),
        undefined, recoveryReturn);
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法读取图书历史页。'), 'error');
    }
  };
  if (overview.historyPage.previousCursor !== null) {
    const previous = button('较早记录', 'quiet', () => void replaceHistoryPage(overview.historyPage.previousCursor!));
    previous.dataset['bookHistoryPrevious'] = overview.historyPage.previousCursor.stableId;
    historyNavigation.append(previous);
  }
  if (overview.historyPage.nextCursor !== null) {
    const next = button('较新记录', 'quiet', () => void replaceHistoryPage(overview.historyPage.nextCursor!));
    next.dataset['bookHistoryNext'] = overview.historyPage.nextCursor.stableId;
    historyNavigation.append(next);
  }
  records.append(historyNavigation);
  // The actions follow the record navigation so the sticky region stays pinned for the whole page: a
  // sticky bar releases once its own flow position scrolls into view, so a mid-page one would be
  // pushed off screen by the record list — exactly what V2-UX-LAYER-005 forbids. This is the slot
  // `.commit-bar` occupies on the three review surfaces.
  content.append(records, actions);
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen(completion ? 'imported' : 'book-overview', content);
  if (completion) {
    void acknowledgeCompletionAfterPaint(completion).then((acknowledged) => {
      if (acknowledged && !authorityInterrupted && content.isConnected) {
        for (const action of completionActionButtons) action.disabled = false;
        setStatus(completion.completionLabel, 'success');
      }
      inspectTaskAuthorization();
      inspectReviewSummary();
      inspectBaselineAnalysis();
    });
  } else {
    inspectTaskAuthorization();
    inspectReviewSummary();
    inspectBaselineAnalysis();
    setStatus('图书工作概览已打开');
  }
}

/**
 * The Technical Identity Layer's form of one item's provenance (V2-UX-LAYER-006): every source range
 * it records, exact and unabridged. It is what a provenance list's disclosure holds, one step below
 * the decision reading `analysisProvenanceSummary` gives the same item.
 */
function analysisRanges(ranges: ReadonlyArray<{ blockId: string; fromGrapheme: number | null; toGrapheme: number | null }>): string {
  if (ranges.length === 0) return '无精确范围';
  return ranges.map((range) => range.fromGrapheme === null || range.toGrapheme === null
    ? `${range.blockId}（整块）`
    : `${range.blockId} · 字素 ${range.fromGrapheme}–${range.toGrapheme}`).join('；');
}

function analysisReturnButton(
  blockId: string,
  manuscriptId: string,
  branchId: string,
  bookTitle: string,
): HTMLButtonElement {
  const returnToRange = button('回到稿件范围', 'quiet', async () => {
    returnToRange.disabled = true;
    setStatus('正在打开对应稿件范围…', 'busy');
    try {
      renderEditorWindow(await window.ai7.getManuscriptWindowAt({ manuscriptId, branchId, target: { kind: 'block', blockId } }), bookTitle);
    } catch (error) {
      returnToRange.disabled = false;
      setStatus(rendererErrorMessage(error, '无法打开对应稿件范围。'), 'error');
    }
  });
  returnToRange.dataset['analysisAction'] = 'return-to-range';
  returnToRange.dataset['analysisBlockId'] = blockId;
  return returnToRange;
}

function reuseCountsText(counts: AnalysisReusePlanCounts): string {
  return `复用 ${counts.reused} · 重算 ${counts.recomputed} · 失效 ${counts.invalidated} · 绕过 ${counts.bypassed}`;
}

/** What an update keeps and what it reads again, in the editor's words; `null` is a plan nobody can state yet. */
function updateReuseReading(expected: AnalysisReusePlanCounts | null, mode: BaselineAnalysisUpdateMode): string {
  if (expected === null) return mode === 'reanalyze-range' ? '选好范围后，这里会说明沿用多少、重新分析多少。' : '现在无法说明会沿用多少、重新分析多少。';
  return `会沿用上一份里 ${expected.reused} 个阅读范围的结果，重新分析 ${expected.recomputed} 个。`;
}

function rangeText(range: BaselineAnalysisSelectedRange | null): string {
  return range === null ? '全部内容块' : `内容块 ${range.startPosition}–${range.endPosition}`;
}

/** The primary branch the Book's analysis navigates into: the frozen checkpoint's, else the working head's. */
function analysisBranchId(projection: BaselineAnalysisProjection): string | null {
  return projection.checkpoint?.branchId ?? projection.updateControls?.working.branchId ?? null;
}

/**
 * ②A's seven tabs (editor-surfaces §3). The first six are what the baseline is for; the last holds
 * everything about how it was made and how it is brought up to date. The order is the specification's.
 */
const ANALYSIS_TABS = [
  ['synopsis', '梗概'],
  ['entities', '人物与名称'],
  ['events', '事件'],
  ['relationships', '关系'],
  ['settings', '设定'],
  ['chapters', '各章'],
  ['history', '历史与更新'],
] as const;
type AnalysisTabId = (typeof ANALYSIS_TABS)[number][0];

/**
 * The tab the editor chose, per Book. The card re-renders on every refresh while a Run executes, and a
 * re-render that threw the editor back to the first tab would take their place away four times a second.
 */
const analysisTabChoice = new Map<string, AnalysisTabId>();

/**
 * The tab strip and its panels. Every panel is always in the document and only `hidden` changes, so a
 * record on an unselected tab is still there to be read, searched and asserted (V2-UX-LAYER-007). Arrow
 * keys move between tabs and only the selected tab is in the Tab order, the pattern a tab list is read by.
 */
function analysisTabs(card: HTMLElement, bookId: string, initial: AnalysisTabId): { panels: Record<AnalysisTabId, HTMLElement>; select: (tab: AnalysisTabId) => void } {
  const list = element('div', 'analysis-tabs');
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', '基线分析');
  const tabs = {} as Record<AnalysisTabId, HTMLButtonElement>;
  const panels = {} as Record<AnalysisTabId, HTMLElement>;
  const select = (chosen: AnalysisTabId): void => {
    card.dataset['analysisTab'] = chosen;
    for (const [id] of ANALYSIS_TABS) {
      const selected = id === chosen;
      tabs[id].setAttribute('aria-selected', selected ? 'true' : 'false');
      tabs[id].tabIndex = selected ? 0 : -1;
      panels[id].hidden = !selected;
    }
  };
  ANALYSIS_TABS.forEach(([id, label], index) => {
    const tab = element('button', 'analysis-tab', label);
    tab.type = 'button';
    tab.id = `analysis-tab-${id}`;
    tab.dataset['analysisTab'] = id;
    tab.dataset['analysisAction'] = 'select-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `analysis-panel-${id}`);
    tab.addEventListener('click', () => {
      analysisTabChoice.set(bookId, id);
      select(id);
    });
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? ANALYSIS_TABS.length - 1
        : step === 0 ? null : (index + step + ANALYSIS_TABS.length) % ANALYSIS_TABS.length;
      if (target === null) return;
      event.preventDefault();
      const next = ANALYSIS_TABS[target]![0];
      analysisTabChoice.set(bookId, next);
      select(next);
      tabs[next].focus();
    });
    const panel = element('section', 'analysis-panel');
    panel.id = `analysis-panel-${id}`;
    panel.dataset['analysisPanel'] = id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tabs[id] = tab;
    panels[id] = panel;
    list.append(tab);
  });
  card.append(list, ...ANALYSIS_TABS.map(([id]) => panels[id]));
  select(analysisTabChoice.get(bookId) ?? initial);
  return { panels, select };
}

/** One list tab: its reading of how many there are, the items, and their exact ranges one step away. */
function renderAnalysisListPanel(
  panel: HTMLElement,
  heading: string,
  emptyReading: string,
  items: ReadonlyArray<{ reading: string; name: string; ranges: BaselineAnalysisResultSetRevisionProjection['synthesis']['entities'][number]['sourceRanges']; blockId: string | undefined }>,
  returnButton: (blockId: string) => HTMLButtonElement,
): HTMLElement {
  panel.append(element('h4', undefined, `${heading} · ${items.length}`));
  const list = element('ul', 'analysis-list');
  if (items.length === 0) list.append(element('li', undefined, emptyReading));
  const exact: HTMLElement[] = [];
  for (const entry of items) {
    const item = element('li');
    item.append(element('span', undefined, `${entry.reading} `));
    if (entry.blockId !== undefined) item.append(returnButton(entry.blockId));
    list.append(item);
    exact.push(element('dt', undefined, entry.name), element('dd', 'technical-identity', analysisRanges(entry.ranges)));
  }
  panel.append(list);
  if (exact.length > 0) panel.append(technicalDetails('analysis-facts', ...exact));
  return list;
}

/**
 * A Run Report as an editor reads it (ADR 0066 §Run Report): what each stage did and how long it took,
 * how the reading ranges were accounted for, what failed and what was adjusted, what the sample found,
 * and what the model would do differently next time. The report counts and never restates, so nothing
 * here can carry manuscript text. Token usage, per-range rows, instants, identities and both digests
 * stay one step away, exact and unabridged (V2-UX-ANALYSIS-025, V2-UX-LAYER-007).
 */
function renderRunReport(report: RunReportProjection): HTMLElement {
  const disclosure = element('details', 'analysis-run-report');
  disclosure.dataset['runReportDigest'] = report.reportDigest;
  disclosure.dataset['runReportRun'] = report.runRecordId;
  disclosure.dataset['runReportClassification'] = report.classification;
  disclosure.append(element('summary', undefined, `查看运行报告 · ${RUN_REPORT_CLASSIFICATION_LABELS[report.classification]} · ${localInstantLabel(report.recordedAt)}`));
  const stages = element('ul', 'analysis-list analysis-run-report-stages');
  for (const stage of report.stages) {
    const item = element('li', undefined, `${RUN_REPORT_STAGE_LABELS[stage.stage]}：${RUN_REPORT_STAGE_STATE_LABELS[stage.state]}${stage.wallMs === null ? '' : ` · 用时 ${durationLabel(stage.wallMs)}`}`);
    item.dataset['runReportStage'] = stage.stage;
    item.dataset['runReportStageState'] = stage.state;
    stages.append(item);
  }
  const failures = element('ul', 'analysis-list analysis-run-report-failures');
  if (report.failures.length === 0) failures.append(element('li', undefined, '无'));
  for (const failure of report.failures) {
    const item = element('li', undefined, `${RUN_REPORT_STAGE_LABELS[failure.stage]}：${failure.reason}`);
    item.dataset['runReportFailureCode'] = failure.code;
    failures.append(item);
  }
  const adaptations = element('ul', 'analysis-list analysis-run-report-adaptations');
  if (report.adaptations.length === 0) adaptations.append(element('li', undefined, '无'));
  for (const adaptation of report.adaptations) {
    adaptations.append(element('li', undefined, `第 ${adaptation.unitOrdinal} 个阅读范围安全重试一次 · ${localInstantLabel(adaptation.recordedAt)}`));
  }
  const sample = report.assurance;
  const sampleReading = sample.state === 'not-run' || sample.size === 0
    ? '这次运行没有抽样复核。'
    : `从 ${sample.candidateCount} 条发现中抽了 ${sample.size} 条复核，${sample.upheld} 条成立。`;
  const redone = element('ul', 'analysis-list analysis-run-report-if-redone');
  redone.dataset['runReportIfRedone'] = report.ifRedone.state;
  if (report.ifRedone.state === 'closed') {
    if (report.ifRedone.items.length === 0) redone.append(element('li', undefined, '模型没有提出不同的做法。'));
    for (const suggestion of report.ifRedone.items) redone.append(element('li', undefined, `${suggestion.suggestion}（依据：${suggestion.basis}）`));
  } else {
    redone.append(element('li', undefined, report.ifRedone.reason));
  }
  const findings = report.findingCounts.length === 0
    ? '这次运行没有记录发现。'
    : `这次运行共记录 ${report.findingCounts.reduce((total, entry) => total + entry.count, 0)} 条发现，分 ${report.findingCounts.length} 类。`;
  const usageRows = (Object.keys(report.usagePerStage) as Array<keyof typeof report.usagePerStage>).flatMap((stage) => {
    const usage = report.usagePerStage[stage];
    return [element('dt', undefined, `用量 · ${stage}`), element('dd', 'technical-identity', `${usage.requests} 次模型请求 · 输入 ${usage.inputTokens} · 输出 ${usage.outputTokens}`)];
  });
  disclosure.append(
    element('h5', undefined, '各阶段'), stages,
    element('h5', undefined, '阅读范围'), element('p', 'analysis-run-report-units', runReportUnitsSentence(report.units)),
    element('h5', undefined, '发现与抽样复核'), element('p', undefined, findings), element('p', 'analysis-run-report-sample', sampleReading),
    element('h5', undefined, '失败'), failures,
    element('h5', undefined, '运行中的调整'), adaptations,
    element('h5', undefined, '如果重做'), redone,
    technicalDetails(
      'analysis-facts',
      element('dt', undefined, '运行报告'), element('dd', 'technical-identity', `${report.schema} · 摘要 ${report.reportDigest} · 账目摘要 ${report.accountingDigest}`),
      element('dt', undefined, '绑定'), element('dd', 'technical-identity', `Run ${report.runRecordId} · Task Intent ${report.taskIntentId} · 执行尝试 ${report.attemptId ?? '无'} · 结果集修订版 ${report.resultSetRevisionId ?? '无'}`),
      element('dt', undefined, '记录时刻'), element('dd', 'technical-identity', report.recordedAt),
      element('dt', undefined, '阶段时刻'), element('dd', 'technical-identity', report.stages.map((stage) => `${stage.stage} ${stage.startedAt ?? '—'} → ${stage.settledAt ?? '—'} · ${stage.wallMs ?? '—'} ms`).join('；')),
      ...usageRows,
      element('dt', undefined, '发现分类'), element('dd', 'technical-identity', report.findingCounts.length === 0 ? '无' : report.findingCounts.map((entry) => `${entry.kind} ${entry.count}`).join('；')),
      element('dt', undefined, '抽样'), element('dd', 'technical-identity', `${sample.state} · seed ${sample.seed ?? '无'} · ${sample.size}/${sample.candidateCount}`),
      element('dt', undefined, '逐范围账目'), element('dd', 'technical-identity', report.unitRows.map((row) => `单元 ${row.unitOrdinal} ${row.state}/${row.lineage} · ${row.attempts} 回合 · ${row.wallMs ?? '—'} ms${row.usage === null ? '' : ` · ${row.usage.inputTokens}/${row.usage.outputTokens}`}${row.gapCode === null ? '' : ` · ${row.gapCode}`}`).join('；')),
    ),
  );
  return disclosure;
}

/** The report where a Run has one, and the exact reason in the reader's language where it has none. */
function runReportOrReason(report: RunReportProjection | null, absentReason: string | null): HTMLElement {
  if (report !== null) return renderRunReport(report);
  const absent = element('p', 'field-note analysis-run-report-absent', absentReason ?? '没有运行报告。');
  absent.dataset['runReportAbsent'] = 'true';
  return absent;
}

/**
 * The six reading tabs of one Result Set Revision (V2-UX-ANALYSIS-001, 004, 025). The decision layer
 * is the four sentences, the synopsis, the four lists and the chapters with what is still unread; the
 * units' technical names, lineage, digests, reducer stages, reuse counts and token usage wait one step
 * away. The revision's contradictions and open questions are not listed here, in either layer: they are
 * the model-free leads of 审阅's 情节逻辑与前后一致 (V2-UX-REV-011), which turns each into a 批注 on the
 * manuscript with its exact ranges as its basis. ②A keeps their counts — the card's `data-conflict-count`,
 * the 可信程度 sentence and the technical assurance row — and the sentence's pointer opens 审阅.
 */
function renderBaselineAnalysisOverview(
  card: HTMLElement,
  panels: Record<AnalysisTabId, HTMLElement>,
  selectTab: (tab: AnalysisTabId) => void,
  projection: BaselineAnalysisProjection,
  revision: BaselineAnalysisResultSetRevisionProjection,
  bookTitle: string,
  view: { historical: boolean; current: boolean },
): void {
  const manuscriptId = revision.manuscriptPin.manuscriptId;
  const branchId = analysisBranchId(projection) ?? '';
  const returnButton = (blockId: string): HTMLButtonElement => analysisReturnButton(blockId, manuscriptId, branchId, bookTitle);
  card.dataset['resultRevisionId'] = projection.resultSetRevision?.revisionId ?? revision.revisionId;
  card.dataset['resultRevisionDigest'] = projection.resultSetRevision?.digest ?? revision.digest;
  card.dataset['resultRevisionOrdinal'] = String(projection.resultSetRevision?.ordinal ?? revision.ordinal);
  card.dataset['gapCount'] = String(revision.gaps.length);
  card.dataset['conflictCount'] = String(revision.conflicts.length);
  card.dataset['freshnessState'] = revision.freshness.state;
  card.dataset['updateMode'] = revision.update.mode;
  card.dataset['reusedCount'] = String(revision.update.counts.reused);
  card.dataset['recomputedCount'] = String(revision.update.counts.recomputed);
  card.dataset['invalidatedCount'] = String(revision.update.counts.invalidated);
  card.dataset['bypassedCount'] = String(revision.update.counts.bypassed);
  if (view.historical) {
    card.dataset['inspectedRevisionId'] = revision.revisionId;
    card.dataset['inspectedRevisionOrdinal'] = String(revision.ordinal);
    card.dataset['inspectedCurrent'] = view.current ? 'true' : 'false';
  }

  const synopsis = panels.synopsis;
  if (view.historical) {
    synopsis.append(
      element('h4', undefined, `历史修订版 Revision ${revision.ordinal}（只读）`),
      element('p', 'attention-note', view.current
        ? `Revision ${revision.ordinal} 是当前最新的结果集修订版；此视图为只读。`
        : `Revision ${revision.ordinal} 已被后续修订版取代；它按其原始稿件 pin ${revision.manuscriptPin.revisionLabel} 呈现，不是当前事实，也未被删除。`),
    );
  }

  // The four sentences, each on its own axis so none of them collapses into one badge (ANALYSIS-001).
  const sentences = element('div', 'analysis-axes');
  for (const reading of analysisFourSentences(revision)) {
    const section = element('section', `analysis-axis analysis-axis-${reading.axis}`);
    const axis = reading.axis === 'coverage' ? revision.coverage : reading.axis === 'reducer-closure' ? revision.reducerClosure
      : reading.axis === 'freshness' ? revision.freshness : revision.assurance;
    section.dataset['analysisAxis'] = reading.axis;
    section.dataset['axisState'] = axis.state;
    section.append(
      element('h5', undefined, reading.heading),
      element('p', 'analysis-axis-sentence', reading.sentence),
      element('p', 'field-note analysis-axis-next', `下一步：${reading.nextAction}`),
    );
    if (reading.target !== null) {
      const target = reading.target;
      const go = button(target === 'history' ? '去「历史与更新」' : '去「各章」', 'quiet', () => selectTab(target));
      go.dataset['analysisAction'] = `go-${target}`;
      section.append(go);
    }
    // 可信程度 points at 审阅's 情节逻辑与前后一致, where the leads it counts are handled (V2-UX-REV-011).
    if (reading.axis === 'assurance') {
      const review = button(REVIEW_ACTION_LABELS['open-review'], 'quiet', () => renderBookReview(projection.bookId, bookTitle));
      review.dataset['analysisAction'] = 'open-review';
      section.append(review);
    }
    sentences.append(section);
  }
  const synthesis = element('section', 'analysis-synthesis');
  synthesis.append(
    element('h4', undefined, '全书梗概'),
    element('p', 'analysis-synopsis', revision.synthesis.synopsis.length > 0 ? revision.synthesis.synopsis : '（还没有读完的范围可供合并）'),
  );
  synopsis.append(sentences, synthesis);

  // Provenance and identity as counts with disclosure (V2-UX-LAYER-006): every list names its items'
  // ranges as a block count and keeps the identifiers one step below it.
  const entityList = renderAnalysisListPanel(panels.entities, '人物与名称', '没有记录人物或名称。', revision.synthesis.entities.map((entity) => ({
    reading: `${entity.name}（${ANALYSIS_ENTITY_KIND_LABELS[entity.kind]}${entity.aliases.length > 0 ? `，别名 ${entity.aliases.join('、')}` : ''}）· ${analysisProvenanceSummary(entity.unitOrdinals, entity.sourceRanges)}`,
    name: entity.name,
    ranges: entity.sourceRanges,
    blockId: entity.sourceRanges[0]?.blockId,
  })), returnButton);
  entityList.classList.add('analysis-entity-list');
  renderAnalysisListPanel(panels.events, '事件', '没有记录事件。', revision.synthesis.events.map((event) => ({
    reading: `${event.summary}${event.chronology === null ? '' : `（${event.chronology}）`}${event.participants.length === 0 ? '' : ` · ${event.participants.join('、')}`} · ${analysisProvenanceSummary([event.unitOrdinal], event.sourceRanges)}`,
    name: event.summary,
    ranges: event.sourceRanges,
    blockId: event.sourceRanges[0]?.blockId,
  })), returnButton).classList.add('analysis-event-list');
  renderAnalysisListPanel(panels.relationships, '关系', '没有记录关系。', revision.synthesis.relationships.map((relationship) => ({
    reading: `${relationship.subject} — ${relationship.relation} — ${relationship.object} · ${analysisProvenanceSummary(relationship.unitOrdinals, relationship.sourceRanges)}`,
    name: `${relationship.subject} · ${relationship.object}`,
    ranges: relationship.sourceRanges,
    blockId: relationship.sourceRanges[0]?.blockId,
  })), returnButton).classList.add('analysis-relationship-list');
  renderAnalysisListPanel(panels.settings, '设定', '没有记录设定。', revision.synthesis.settingClaims.map((claim) => ({
    reading: `${claim.subject}：${claim.claim} · ${analysisProvenanceSummary([claim.unitOrdinal], claim.sourceRanges)}`,
    name: claim.subject,
    ranges: claim.sourceRanges,
    blockId: claim.sourceRanges[0]?.blockId,
  })), returnButton).classList.add('analysis-setting-list');

  // 各章: every reading range by the heading the manuscript gives it, with what the analysis made of it
  // or, where it made nothing, that the range is still unread and why (ANALYSIS-004). The unit's own
  // name, state, lineage, confidence, request digest and usage are its technical half.
  const chapters = panels.chapters;
  const manifestUnits = view.historical ? null : projection.coverageManifest?.units ?? null;
  const adaptedUnits = revision.provenance.adaptations?.unitOrdinals ?? [];
  const units = element('ul', 'analysis-unit-list');
  for (const unit of revision.units) {
    const item = element('li', 'analysis-unit');
    item.dataset['analysisUnit'] = String(unit.unitOrdinal);
    item.dataset['analysisUnitState'] = unit.state;
    item.dataset['analysisUnitLineage'] = unit.lineage.kind;
    if (unit.lineage.kind === 'reused') item.dataset['analysisUnitReusedFrom'] = `${unit.lineage.revisionOrdinal}/${unit.lineage.unitOrdinal}`;
    if (adaptedUnits.includes(unit.unitOrdinal)) item.dataset['analysisUnitAdaptations'] = '1';
    const manifestUnit = manifestUnits?.[unit.unitOrdinal - 1];
    const title = manifestUnit === undefined
      ? `第 ${unit.unitOrdinal} 个阅读范围`
      : `${manifestUnit.headingText === null ? `第 ${unit.unitOrdinal} 个阅读范围` : `「${manifestUnit.headingText}」`}${manifestUnit.subUnitCount > 1 ? `（第 ${manifestUnit.subUnitIndex}/${manifestUnit.subUnitCount} 部分）` : ''} · 内容块 ${manifestUnit.startPosition}–${manifestUnit.endPosition}`;
    item.append(element('h5', undefined, title));
    const lineage = unit.lineage.kind === 'reused' ? `复用自 Revision ${unit.lineage.revisionOrdinal} / 单元 ${unit.lineage.unitOrdinal}` : '本次重算';
    if (unit.state === 'closed') {
      item.append(element('p', undefined, unit.synopsis));
      const firstRange = unit.entities.flatMap((entity) => entity.sourceRanges)[0] ?? unit.events.flatMap((event) => event.sourceRanges)[0];
      if (firstRange !== undefined) item.append(returnButton(firstRange.blockId));
    } else {
      item.append(element('p', 'attention-note', `尚未分析：${unit.gap.reason}`));
      if (unit.gap.blockIds[0] !== undefined) item.append(returnButton(unit.gap.blockIds[0]));
    }
    item.append(technicalDetails(
      'analysis-facts',
      element('dt', undefined, '分析单元'), element('dd', 'technical-identity', unit.state === 'closed'
        ? `单元 ${unit.unitOrdinal} · 已闭合 · 置信 ${unit.confidence} · ${lineage}`
        : `单元 ${unit.unitOrdinal} · 缺口 · ${unit.gap.code} · ${lineage}`),
      element('dt', undefined, '请求摘要'), element('dd', 'technical-identity', unit.requestDigest),
      ...(unit.state !== 'closed' ? [] : [
        element('dt', undefined, '单元内计数'),
        element('dd', 'technical-identity', `实体 ${unit.entities.length} · 事件 ${unit.events.length} · 关系 ${unit.relationships.length} · 设定声明 ${unit.settingClaims.length} · 单元内冲突 ${unit.conflicts.length} · 未解决 ${unit.unresolved.length}${unit.usage === null ? '' : ` · 用量 ${unit.usage.inputTokens}/${unit.usage.outputTokens}`}`),
      ]),
    ));
    units.append(item);
  }
  // The unread ranges once more as their own list, so the editor sees what is missing without reading
  // every chapter to find it; each returns to the manuscript range it names.
  const gaps = element('ul', 'analysis-list analysis-gap-list');
  if (revision.gaps.length === 0) gaps.append(element('li', undefined, '没有尚未分析的范围。'));
  for (const gap of revision.gaps) {
    const item = element('li');
    item.dataset['analysisGapUnit'] = String(gap.unitOrdinal);
    item.dataset['analysisGapCode'] = gap.code;
    item.append(element('span', undefined, `第 ${gap.unitOrdinal} 个阅读范围 · 内容块 ${gap.startPosition}–${gap.endPosition} · ${gap.reason} `));
    if (gap.blockIds[0] !== undefined) item.append(returnButton(gap.blockIds[0]));
    gaps.append(item);
  }
  chapters.append(
    element('h4', undefined, `尚未分析的范围 · ${revision.gaps.length}`), gaps,
    element('h4', undefined, `各章 · ${revision.units.length} 个阅读范围`), units,
  );

  // The technical half of the whole revision, closed by default and complete (V2-UX-LAYER-001, 007).
  const runAdaptations = projection.run !== null && projection.run.runRecordId === revision.provenance.runRecordId ? projection.run.adaptations : [];
  card.dataset['adaptationCount'] = String(revision.provenance.adaptations?.count ?? 0);
  const adaptations = element('ul', 'analysis-list analysis-adaptation-list');
  if (adaptedUnits.length === 0) adaptations.append(element('li', undefined, '无计划内调整'));
  for (const unitOrdinal of adaptedUnits) {
    const recorded = runAdaptations.find((adaptation) => adaptation.unitOrdinal === unitOrdinal);
    const item = element('li', undefined, recorded === undefined ? `计划内调整 · 单元 ${unitOrdinal} 安全重试 1 次` : recorded.label);
    item.dataset['analysisAdaptationUnit'] = String(unitOrdinal);
    item.dataset['analysisAdaptationClass'] = 'safe-retry';
    adaptations.append(item);
  }
  const technical = technicalDetails(
    'analysis-facts',
    element('dt', undefined, '分析契约'), element('dd', 'technical-identity', `${projection.kind} · ${revision.contractVersion}`),
    element('dt', undefined, '精确稿件 pin'), element('dd', 'technical-identity', `${revision.manuscriptPin.revisionLabel} · ${revision.manuscriptPin.revisionId} · ${revision.manuscriptPin.revisionDigest}`),
    element('dt', undefined, '结果集修订版'), element('dd', 'technical-identity', `Revision ${revision.ordinal} · ${revision.revisionId}`),
    element('dt', undefined, '修订版摘要'), element('dd', 'technical-identity', revision.digest),
    element('dt', undefined, '覆盖清单摘要'), element('dd', 'technical-identity', revision.coverageManifestDigest),
    element('dt', undefined, 'Schema / Reducer 摘要'), element('dd', 'technical-identity', `${revision.schemaDigest} · ${revision.reducerDigest}`),
    element('dt', undefined, '模型适配器 pin'), element('dd', 'technical-identity', `${revision.adapterPin.route} · ${revision.adapterPin.model} · ${revision.adapterPin.fixtureIdentity} · ${revision.adapterPin.fixtureSha256}`),
    element('dt', undefined, '执行绑定 pin'), element('dd', 'technical-identity', `${revision.bindingPin.bindingDigest} · Session ${revision.bindingPin.harnessSessionId}`),
    element('dt', undefined, '更新方式'), element('dd', 'technical-identity', revision.update.predecessor === null
      ? `${revision.update.modeLabel} · 无前一修订版`
      : `${revision.update.modeLabel} · 后继于 Revision ${revision.update.predecessor.ordinal} · ${rangeText(revision.update.selectedRange)}`),
    element('dt', undefined, '单元血缘'), element('dd', 'technical-identity', reuseCountsText(revision.update.counts)),
    element('dt', undefined, '覆盖'), element('dd', 'technical-identity', `${revision.coverage.unitsClosed}/${revision.coverage.unitsTotal} 个分析单元闭合 · ${revision.coverage.unitsReused} 个按血缘复用 · ${revision.coverage.gapCount} 处缺口 · ${revision.coverage.label}`),
    element('dt', undefined, '归约/综合闭合'), element('dd', 'technical-identity', `${revision.reducerClosure.label} · ${revision.reducerClosure.stages.map((stage) => `${stage.stage}：${stage.state}（${stage.inputCount} 项输入）`).join('；')}`),
    element('dt', undefined, '精确修订版新鲜度'), element('dd', 'technical-identity', `${revision.freshness.label} · 绑定修订版 ${revision.freshness.boundRevisionId} · 当前修订版 ${revision.freshness.currentRevisionId} · 修订日志序号 ${revision.freshness.currentJournalSequence} · 仅通过本地确定性比较判定；不调用 Provider`),
    element('dt', undefined, '语义/证据保证'), element('dd', 'technical-identity', `${revision.assurance.label} · ${revision.assurance.unresolvedConflictCount} 处未解决冲突 · ${revision.assurance.unresolvedItemCount} 项未解决事项 · ${revision.assurance.lowConfidenceUnitCount} 个低置信单元 · ${revision.assurance.crossUnitFindingCount} 条跨单元发现`),
    element('dt', undefined, '策略 pin'), element('dd', 'technical-identity', `${revision.policyPin.operationalScope} · Provider Processing ${revision.policyPin.providerProcessingVersion} · ${revision.policyPin.liveTransmissions} 次实时传输`),
    element('dt', undefined, '用量'), element('dd', 'technical-identity', `${revision.usage.requests} 次模型请求（仅重算单元，含安全重试）· 输入 ${revision.usage.inputTokens} · 输出 ${revision.usage.outputTokens}`),
    element('dt', undefined, '计划版本'), element('dd', 'technical-identity', revision.provenance.planVersion === undefined ? '未记录' : `版本 ${revision.provenance.planVersion}（运行授权所绑定）`),
    element('dt', undefined, '计划内调整'), element('dd', 'technical-identity', revision.provenance.adaptations === undefined ? '未记录' : `${revision.provenance.adaptations.count} 次${adaptedUnits.length === 0 ? '' : ` · 单元 ${adaptedUnits.join('、')}`}`),
    ...(revision.update.predecessor === null ? [] : [
      element('dt', undefined, '前一修订版'), element('dd', 'technical-identity', `Revision ${revision.update.predecessor.ordinal} · ${revision.update.predecessor.revisionId} · ${revision.update.predecessor.digest}`),
      element('dt', undefined, '复用计划摘要'), element('dd', 'technical-identity', revision.update.reusePlanDigest ?? '无'),
    ]),
  );
  technical.classList.add('analysis-revision-technical');
  // The Run's in-envelope adjustments: exact, complete, and out of the decision layer. The leads are not
  // listed here either — 审阅 carries each one as a 批注 with its exact ranges (V2-UX-REV-011).
  technical.append(element('h5', undefined, `计划内调整 · ${adaptedUnits.length} 次`), adaptations);
  synopsis.append(technical);
}

/** The frozen reuse plan of an update Task, disclosed in Plan Preview before authorization. */
function renderReusePlanPreview(card: HTMLElement, projection: BaselineAnalysisProjection): void {
  const update = projection.update;
  if (update === null || update.reusePlan === null) return;
  const plan: AnalysisReusePlanProjection = update.reusePlan;
  // The plan renders inside 历史与更新 once the Book holds a revision, but what it froze is a fact about
  // the card's Task, so the readings stay on the card itself wherever the section is placed.
  const owner = card.closest<HTMLElement>('.baseline-analysis-card') ?? card;
  owner.dataset['reusePlanDigest'] = update.reusePlanDigest ?? '';
  owner.dataset['planReused'] = String(plan.counts.reused);
  owner.dataset['planRecomputed'] = String(plan.counts.recomputed);
  owner.dataset['planInvalidated'] = String(plan.counts.invalidated);
  owner.dataset['planBypassed'] = String(plan.counts.bypassed);
  owner.dataset['planUpdateMode'] = plan.mode;
  const section = element('section', 'analysis-reuse-plan');
  section.dataset['reusePlanMode'] = plan.mode;
  section.append(element('h4', undefined, `复用计划 · ${update.modeLabel}`));
  const facts = element('dl', 'analysis-facts');
  // Whether the target is still the latest revision is a decision the editor must weigh before starting
  // an update, so it stays at full rank; only the identity of that target goes one step away.
  facts.append(
    element('dt', undefined, '更新含义'), element('dd', undefined, update.meaning),
    element('dt', undefined, '目标修订版'), element('dd', undefined, `Revision ${update.predecessor.ordinal} · 绑定 ${update.predecessor.manuscriptPin.revisionLabel}${update.predecessorCurrent ? '' : ' · 已不再是最新修订版'}`),
    element('dt', undefined, '所选范围'), element('dd', undefined, rangeText(update.selectedRange)),
    element('dt', undefined, '复用与重算'), element('dd', undefined, reuseCountsText(plan.counts)),
  );
  section.append(facts, technicalDetails(
    'analysis-facts',
    element('dt', undefined, '目标修订版身份'), element('dd', 'technical-identity', `${update.predecessor.revisionId} · ${update.predecessor.digest}`),
    element('dt', undefined, '复用计划摘要'), element('dd', 'technical-identity', update.reusePlanDigest ?? ''),
  ));
  const list = element('ul', 'analysis-list analysis-reuse-plan-units');
  for (const unit of plan.units) {
    const item = element('li', undefined, unit.disposition === 'reused' && unit.reusedFrom !== null
      ? `单元 ${unit.unitOrdinal} · 内容块 ${unit.startPosition}–${unit.endPosition} · 复用自 Revision ${unit.reusedFrom.revisionOrdinal} / 单元 ${unit.reusedFrom.unitOrdinal}`
      : `单元 ${unit.unitOrdinal} · 内容块 ${unit.startPosition}–${unit.endPosition} · 重算（${unit.reason}）`);
    item.dataset['reusePlanUnit'] = String(unit.unitOrdinal);
    item.dataset['reuseDisposition'] = unit.disposition;
    item.dataset['reuseReason'] = unit.reason;
    list.append(item);
  }
  section.append(list);
  const predecessors = element('ul', 'analysis-list analysis-reuse-plan-predecessors');
  for (const unit of plan.predecessorUnits) {
    const item = element('li', undefined, `前一修订版单元 ${unit.unitOrdinal}（${unit.state === 'closed' ? '已闭合' : '缺口'}）· ${
      unit.disposition === 'reused' ? `被单元 ${unit.successorUnitOrdinal} 复用` : unit.disposition === 'bypassed' ? `兼容但被绕过（单元 ${unit.successorUnitOrdinal} 重算）` : '失效'}`);
    item.dataset['reusePredecessorUnit'] = String(unit.unitOrdinal);
    item.dataset['reusePredecessorDisposition'] = unit.disposition;
    predecessors.append(item);
  }
  section.append(element('h5', undefined, '前一修订版单元去向'), predecessors);
  card.append(section);
}

function diffValueText(value: PlanRevisionDiffValue): string {
  if (value === null) return '无';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if ('startPosition' in value) return rangeText(value);
  if ('revisionId' in value) return `Revision ${value.ordinal} · ${value.revisionId} · ${value.digest}`;
  if ('kind' in value) return runBudgetCeilingLabel(value);
  return reuseCountsText(value);
}

/** The Plan Boundary Split the canonical envelope carries: declared adaptations, material fields, expected participation, and the preview footer. */
function renderPlanBoundarySplit(card: HTMLElement, boundary: PlanBoundarySplitProjection | null): void {
  const section = element('section', 'analysis-plan-boundary');
  section.dataset['planBoundary'] = boundary === null ? 'absent' : 'present';
  section.append(element('h4', undefined, '计划边界分栏'));
  if (boundary === null) {
    section.append(element('p', 'field-note', '该计划信封记录于计划边界分栏存在之前；重新准备后将携带分栏。'));
    card.append(section);
    return;
  }
  section.dataset['adaptationClasses'] = boundary.adaptable.map((entry) => entry.adaptationClass).join(',');
  section.dataset['materialFieldCount'] = String(boundary.material.length);
  const adaptable = element('ul', 'analysis-list analysis-plan-adaptable');
  for (const entry of boundary.adaptable) {
    const item = element('li', undefined, `${entry.label}（${entry.adaptationClass}）· ${entry.statement}`);
    item.dataset['adaptationClass'] = entry.adaptationClass;
    adaptable.append(item);
  }
  const material = element('ul', 'analysis-list analysis-plan-material');
  for (const entry of boundary.material) {
    const item = element('li', undefined, entry.label);
    item.dataset['materialField'] = entry.field;
    material.append(item);
  }
  const participation = element('p', 'analysis-plan-participation', boundary.participation.statement);
  participation.dataset['participationExpected'] = boundary.participation.expected ? 'true' : 'false';
  section.append(
    element('h5', undefined, '运行中可调整'), adaptable,
    element('h5', undefined, '变化后必须暂停并重新授权'), material,
    element('h5', undefined, '需要你参与的位置'), participation,
    element('p', 'field-note analysis-plan-preview-footer', '计划说明，不是运行授权'),
  );
  card.append(section);
}

/** Every plan version of the Task and every Plan Revision between them, immutable and linked. */
function renderPlanVersions(card: HTMLElement, projection: BaselineAnalysisProjection): void {
  const section = element('section', 'analysis-plan-versions');
  section.dataset['planVersionCount'] = String(projection.planVersions.length);
  section.dataset['planRevisionCount'] = String(projection.planRevisions.length);
  section.append(element('h4', undefined, `计划版本 · ${projection.planVersions.length} 个`));
  const versions = element('ol', 'analysis-list analysis-plan-version-list');
  for (const version of projection.planVersions) {
    const state = version.state === 'bound' ? '已被运行授权绑定' : version.state === 'current' ? '当前 · 待授权' : '已被取代';
    const item = element('li', undefined, `版本 ${version.ordinal} · ${state} · 信封 ${version.planEnvelopeDigest}${version.planRevisionId === null ? '' : ` · 由计划修订 ${version.planRevisionId} 产生`}`);
    item.dataset['planVersionOrdinal'] = String(version.ordinal);
    item.dataset['planVersionState'] = version.state;
    item.dataset['planVersionEnvelope'] = version.planEnvelopeDigest;
    versions.append(item);
  }
  section.append(versions);
  if (projection.planRevisions.length > 0) {
    const revisions = element('ol', 'analysis-list analysis-plan-revision-list');
    for (const revision of projection.planRevisions) {
      const item = element('li', undefined, `${revision.label} · ${revision.resolved ? '已重新确认' : '待重新确认'}${revision.detectedAt === null ? '' : ` · ${localInstantLabel(revision.detectedAt)}`}`);
      if (revision.detectedAt !== null) item.append(element('span', 'technical-identity', revision.detectedAt));
      item.dataset['planRevisionId'] = revision.planRevisionId ?? '';
      item.dataset['planRevisionPrior'] = String(revision.priorOrdinal);
      item.dataset['planRevisionNext'] = revision.nextOrdinal === null ? '' : String(revision.nextOrdinal);
      item.dataset['planRevisionResolved'] = revision.resolved ? 'true' : 'false';
      item.dataset['planRevisionFields'] = revision.changedFields.join(',');
      revisions.append(item);
    }
    section.append(element('h5', undefined, '计划修订'), revisions);
  }
  card.append(section);
}

/**
 * Material drift before authorization (V2-UX-AUTH-006 / V2-UX-PLAN-009): the stale preview keeps no
 * start action; `查看计划修订` opens the concise prior-versus-proposed diff and `重新确认计划` yields
 * the next plan version on the same Task Intent.
 */
function renderPlanRevision(card: HTMLElement, projection: BaselineAnalysisProjection, host: HTMLElement, bookTitle: string): void {
  const revision = projection.planRevision;
  if (revision === null) return;
  const section = element('section', 'attention-note analysis-plan-revision');
  section.dataset['planRevisionState'] = revision.planRevisionId === null ? 'live' : 'pending';
  section.dataset['planRevisionPrior'] = String(revision.priorOrdinal);
  section.dataset['planRevisionFields'] = revision.changedFields.join(',');
  section.append(
    element('h4', undefined, '物质变化 · 计划已被取代'),
    element('p', undefined, `${revision.label}。原计划预览保持不变且不能被授权；查看修订内容并重新确认计划后，新的计划版本才可授权。`),
  );
  const diff = element('div', 'analysis-plan-revision-diff');
  diff.hidden = true;
  const table = element('table', 'analysis-plan-revision-table');
  const head = element('tr');
  head.append(element('th', undefined, '字段'), element('th', undefined, '原值'), element('th', undefined, '拟定值'), element('th', undefined, '性质'));
  table.append(head);
  for (const entry of revision.diff) {
    const row = element('tr');
    row.dataset['planRevisionField'] = entry.field;
    row.dataset['planRevisionMateriality'] = entry.materiality;
    row.append(
      element('td', undefined, entry.label),
      element('td', 'technical-identity', diffValueText(entry.prior)),
      element('td', 'technical-identity', diffValueText(entry.proposed)),
      element('td', undefined, entry.materiality === 'material' ? '物质字段' : '派生后果'),
    );
    table.append(row);
  }
  diff.append(table);
  const actions = element('div', 'button-row analysis-actions');
  const view = button('查看计划修订', 'secondary', () => {
    diff.hidden = !diff.hidden;
    view.setAttribute('aria-expanded', diff.hidden ? 'false' : 'true');
  });
  view.dataset['analysisAction'] = 'view-plan-revision';
  view.setAttribute('aria-expanded', 'false');
  actions.append(view);
  if (projection.actions.canReconfirmPlan) {
    const reconfirm = button('重新确认计划', 'primary', async () => {
      reconfirm.disabled = true;
      setStatus('正在按拟定的物质输入重新确认计划…', 'busy');
      try {
        const mode = projection.taskIntent!.mode;
        const update: BaselineAnalysisUpdateRequest | null = mode === 'first-baseline'
          ? null
          : { mode, selectedRange: mode === 'reanalyze-range' ? revision.proposed.selectedRange : null };
        const initial = await window.ai7.prepareBaselineAnalysis({ goal: projection.taskIntent!.goal, update, reconfirm: true });
        const completed = await awaitServiceJob(initial, (job) => setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy'));
        if (completed.kind !== 'baseline-analysis-preparation' || completed.result === null || !('coverageManifest' in completed.result)) {
          throw new Error('重新确认计划未返回计划。');
        }
        if (host.isConnected && completed.result.bookId === host.dataset['analysisBookId']) {
          renderBaselineAnalysis(host, completed.result, bookTitle);
          setStatus(`计划已重新确认为版本 ${completed.result.planVersion?.ordinal ?? '?'}；等待授权。`, 'success');
        }
      } catch (error) {
        reconfirm.disabled = false;
        setStatus(rendererErrorMessage(error, '无法重新确认计划。'), 'error');
      }
    });
    reconfirm.dataset['analysisAction'] = 'reconfirm-plan';
    actions.append(reconfirm);
  } else {
    section.append(element('p', 'field-note', '该物质变化需要基于最新修订版重新准备更新任务。'));
  }
  section.append(actions, diff);
  card.append(section);
}

/** The Run's timeline: state transitions and in-envelope Plan Adaptations interleaved by record time. */
function renderRunTimeline(run: NonNullable<BaselineAnalysisProjection['run']>): HTMLElement {
  const entries = [
    ...run.transitions.map((transition) => ({ at: transition.recordedAt, order: transition.sequence * 2, kind: 'transition' as const, transition, adaptation: null })),
    ...run.adaptations.map((adaptation) => ({ at: adaptation.recordedAt, order: 0, kind: 'adaptation' as const, transition: null, adaptation })),
  ].sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : left.order - right.order));
  const timeline = element('ol', 'analysis-timeline');
  timeline.dataset['timelineAdaptations'] = String(run.adaptations.length);
  for (const entry of entries) {
    const item = element('li');
    item.dataset['timelineKind'] = entry.kind;
    // Each entry reads as local time, with the exact instant it was recorded at beside it on its own
    // line (V2-UX-LAYER-004) — a timeline whose only reading was an ISO instant said when to a machine.
    if (entry.transition !== null) {
      item.dataset['timelineState'] = entry.transition.state;
      item.textContent = `${entry.transition.sequence}. ${entry.transition.state} · ${localInstantLabel(entry.transition.recordedAt)}${entry.transition.detail === null ? '' : ` · ${entry.transition.detail}`}`;
      item.append(element('span', 'technical-identity', entry.transition.recordedAt));
    } else if (entry.adaptation !== null) {
      item.dataset['adaptationUnit'] = String(entry.adaptation.unitOrdinal);
      item.dataset['adaptationClass'] = entry.adaptation.adaptationClass;
      item.dataset['adaptationOrdinal'] = String(entry.adaptation.ordinal);
      item.textContent = `${entry.adaptation.label} · 第 ${entry.adaptation.attemptIndex} 次尝试 · ${localInstantLabel(entry.adaptation.recordedAt)} · 信封 ${entry.adaptation.planEnvelopeDigest} · 绑定 ${entry.adaptation.bindingDigest}`;
      item.append(element('span', 'technical-identity', entry.adaptation.recordedAt));
    }
    timeline.append(item);
  }
  return timeline;
}

/** Start one preparation job (first baseline or update) and render whatever it settles to. */
async function startAnalysisPreparation(
  host: HTMLElement,
  bookTitle: string,
  input: { goal: string; update: BaselineAnalysisUpdateRequest | null; reconfirm: boolean },
  controls: { start: HTMLButtonElement; cancel: HTMLButtonElement; others: ReadonlyArray<HTMLButtonElement> },
): Promise<void> {
  const { start, cancel, others } = controls;
  start.disabled = true;
  for (const other of others) other.disabled = true;
  cancel.hidden = false;
  setStatus(input.update === null ? '正在有界固定任务输入并派生覆盖清单…' : '正在有界固定任务输入、派生覆盖清单并计算复用计划…', 'busy');
  try {
    const initial = await window.ai7.prepareBaselineAnalysis(input as Parameters<typeof window.ai7.prepareBaselineAnalysis>[0]);
    cancel.dataset['serviceJobId'] = initial.jobId;
    const completed = await awaitServiceJob(initial, (job) => {
      cancel.dataset['serviceJobId'] = job.jobId;
      setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy');
    });
    if (completed.state === 'cancelled') {
      start.disabled = false;
      for (const other of others) other.disabled = false;
      cancel.hidden = true;
      setStatus('基线稿件分析准备已取消；稿件与任务草稿保持不变。', 'success');
      return;
    }
    if (completed.kind !== 'baseline-analysis-preparation' || completed.result === null ||
        !('coverageManifest' in completed.result)) throw new Error('基线稿件分析准备未返回计划。');
    if (host.isConnected && completed.result.bookId === host.dataset['analysisBookId']) {
      renderBaselineAnalysis(host, completed.result, bookTitle);
      setStatus(completed.result.planRevision !== null
        ? '物质输入已变化：计划已被取代，请查看计划修订并重新确认计划。'
        : input.update === null ? '覆盖清单已派生，计划已冻结；等待授权。' : '覆盖清单与复用计划已派生，计划已冻结；等待授权。', 'success');
    }
  } catch (error) {
    start.disabled = false;
    for (const other of others) other.disabled = false;
    cancel.hidden = true;
    setStatus(rendererErrorMessage(error, '无法开始基线稿件分析。'), 'error');
  }
}

function analysisCancelButton(): HTMLButtonElement {
  const cancel = button('取消准备', 'quiet', async () => {
    const jobId = cancel.dataset['serviceJobId'];
    if (!jobId) return;
    cancel.disabled = true;
    try {
      await window.ai7.cancelServiceJob({ jobId });
    } catch (error) {
      cancel.disabled = false;
      setStatus(rendererErrorMessage(error, '无法取消基线稿件分析准备。'), 'error');
    }
  });
  cancel.dataset['analysisAction'] = 'cancel-preparation';
  cancel.hidden = true;
  return cancel;
}

/**
 * The exact three Analysis Update Controls. Each states its meaning, the exact target revision and
 * range, the expected reuse-versus-recompute counts, the Provider / outbound / budget consequence,
 * and the successor behavior before any Task is issued; the range is an explicit unpreselected choice.
 */
function renderAnalysisUpdateControls(card: HTMLElement, projection: BaselineAnalysisProjection, host: HTMLElement, bookTitle: string): void {
  const controls = projection.updateControls;
  if (controls === null) return;
  const section = element('section', 'analysis-update-controls');
  section.dataset['updateTargetOrdinal'] = String(controls.target.ordinal);
  section.dataset['updateTargetRevisionId'] = controls.target.revisionId;
  section.dataset['updateTargetFreshness'] = controls.target.freshness;
  section.dataset['updateBlocked'] = controls.blockedByActiveRun ? 'true' : 'false';
  section.dataset['workingUnits'] = String(controls.working.unitCount);
  section.dataset['workingBlocks'] = String(controls.working.totalBlocks);
  section.append(element('h4', undefined, '更新这份分析'));
  const facts = element('dl', 'analysis-facts');
  // Freshness and the work an update would cover are what the editor weighs before issuing a Task, so
  // both readings stay at full rank; the digests that identify them go one step away.
  facts.append(
    element('dt', undefined, '目标修订版'), element('dd', undefined, `Revision ${controls.target.ordinal} · 绑定 ${controls.target.manuscriptPin.revisionLabel} · 新鲜度 ${controls.target.freshness === 'stale' ? '已过期' : '当前'}`),
    element('dt', undefined, '当前稿件'), element('dd', undefined, `${controls.working.revisionLabel} + 修订日志序号 ${controls.working.journalSequence} · ${controls.working.totalBlocks} 个内容块 · 将派生 ${controls.working.unitCount} 个分析单元 / ${controls.working.sectionCount} 个结构段`),
    element('dt', undefined, '模型提供方 / 外发 / 预算'), element('dd', undefined, controls.providerConsequence),
    element('dt', undefined, '后继修订版'), element('dd', undefined, controls.successorBehavior),
  );
  section.append(facts, technicalDetails(
    'analysis-facts',
    element('dt', undefined, '目标修订版身份'), element('dd', 'technical-identity', `${controls.target.revisionId} · ${controls.target.digest}`),
    element('dt', undefined, '当前稿件摘要'), element('dd', 'technical-identity', controls.working.workingDigest),
  ));
  if (controls.blockedByActiveRun) section.append(element('p', 'attention-note', '当前已有分析任务在调度或执行中；在其结束前不能准备新的更新任务。'));
  const actionButtons: HTMLButtonElement[] = [];
  const cancel = analysisCancelButton();
  const modes: BaselineAnalysisUpdateMode[] = ['sync-current', 'reanalyze-range', 'reanalyze-book'];
  for (const mode of modes) {
    const action = controls.actions[mode];
    const block = element('section', 'analysis-update-action');
    block.dataset['updateAction'] = mode;
    block.dataset['updateAvailable'] = action.available ? 'true' : 'false';
    if (action.expected !== null) {
      block.dataset['expectedReused'] = String(action.expected.reused);
      block.dataset['expectedRecomputed'] = String(action.expected.recomputed);
      block.dataset['expectedInvalidated'] = String(action.expected.invalidated);
      block.dataset['expectedBypassed'] = String(action.expected.bypassed);
    }
    // What each mode keeps and what it reads again is the decision (ADR 0076 §5): one sentence in the
    // editor's words at full rank, the four exact lineage counts and the fixed goal one step away.
    block.append(element('h5', undefined, action.label), element('p', undefined, action.meaning));
    const expected = element('p', 'analysis-update-expected', updateReuseReading(action.expected, mode));
    const expectedExact = element('dd', 'technical-identity', action.expected === null ? '由所选范围决定' : reuseCountsText(action.expected));
    block.append(expected, technicalDetails('analysis-facts',
      element('dt', undefined, '预期单元血缘'), expectedExact,
      element('dt', undefined, '固定任务目标'), element('dd', 'technical-identity', action.goal)));
    if (action.unavailableReason !== null) block.append(element('p', 'attention-note', action.unavailableReason));
    let selectedRange: BaselineAnalysisSelectedRange | null = null;
    if (mode === 'reanalyze-range') {
      const fieldset = element('fieldset', 'analysis-range-options');
      fieldset.append(element('legend', undefined, '选择要重新分析的连续范围（未预选；按当前稿件将派生的结构单元列出）'));
      for (const option of controls.actions['reanalyze-range'].options) {
        const row = element('div', 'analysis-range-option');
        row.dataset['rangeOption'] = String(option.unitOrdinal);
        row.dataset['rangeStart'] = String(option.startPosition);
        row.dataset['rangeEnd'] = String(option.endPosition);
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'analysis-range';
        radio.id = `analysis-range-${option.unitOrdinal}`;
        radio.value = `${option.startPosition}-${option.endPosition}`;
        radio.disabled = !action.available;
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          selectedRange = { startPosition: option.startPosition, endPosition: option.endPosition };
          block.dataset['selectedRange'] = radio.value;
          block.dataset['expectedReused'] = String(option.expected.reused);
          block.dataset['expectedRecomputed'] = String(option.expected.recomputed);
          block.dataset['expectedInvalidated'] = String(option.expected.invalidated);
          block.dataset['expectedBypassed'] = String(option.expected.bypassed);
          expected.textContent = `所选内容块 ${option.startPosition}–${option.endPosition}：${updateReuseReading(option.expected, mode)}`;
          expectedExact.textContent = reuseCountsText(option.expected);
          start.disabled = !action.available;
        });
        const label = element('label', undefined, `${option.label} · 重新分析 ${option.expected.recomputed} 个阅读范围，沿用 ${option.expected.reused} 个`);
        label.htmlFor = radio.id;
        row.append(radio, label);
        fieldset.append(row);
      }
      block.append(fieldset);
    }
    const start = button('先看计划', 'secondary', async () => {
      const update: BaselineAnalysisUpdateRequest = { mode, selectedRange: mode === 'reanalyze-range' ? selectedRange : null };
      if (mode === 'reanalyze-range' && update.selectedRange === null) {
        setStatus('请先选择要重新分析的范围。', 'error');
        return;
      }
      await startAnalysisPreparation(host, bookTitle, { goal: action.goal, update, reconfirm: false }, {
        start,
        cancel,
        others: actionButtons.filter((other) => other !== start),
      });
    });
    start.dataset['analysisAction'] = mode;
    start.disabled = !action.available || mode === 'reanalyze-range';
    actionButtons.push(start);
    // The mode's own button opens the two ways to begin (editor-surfaces §3). 先看计划 prepares the Task
    // and shows its plan, which is the only way a Run is authorized today. The quick start is a Default
    // Execution Rule's to give (S75, B11); until one exists it is shown, disabled, with the reason — a
    // Run never starts behind a plan the editor has not seen and no rule has spoken for.
    const quick = button(mode === 'sync-current' ? '开始同步' : mode === 'reanalyze-range' ? '开始重新分析' : '开始全部重来', 'primary', () => undefined);
    quick.dataset['analysisAction'] = `quick-${mode}`;
    quick.disabled = true;
    const choice = element('div', 'analysis-update-choice');
    choice.id = `analysis-update-choice-${mode}`;
    choice.hidden = true;
    const choiceActions = element('div', 'button-row analysis-actions');
    choiceActions.append(quick, start);
    choice.append(choiceActions, element('p', 'field-note', '快速开始要先有「快速开始默认」，目前还没有设定；请先看计划，再开始任务。'));
    const chooser = button(action.label, mode === 'sync-current' ? 'primary' : 'secondary', () => {
      choice.hidden = !choice.hidden;
      chooser.setAttribute('aria-expanded', choice.hidden ? 'false' : 'true');
    });
    chooser.dataset['analysisAction'] = `choose-${mode}`;
    chooser.setAttribute('aria-expanded', 'false');
    chooser.setAttribute('aria-controls', choice.id);
    chooser.disabled = !action.available;
    actionButtons.push(chooser);
    const actions = element('div', 'button-row analysis-actions');
    actions.append(chooser);
    block.append(actions, choice);
    section.append(block);
  }
  section.append(cancel);
  card.append(section);
}

/** The Analysis Result Revision History: every revision in ordinal order, each openable read-only. */
function renderAnalysisHistory(card: HTMLElement, projection: BaselineAnalysisProjection, host: HTMLElement, bookTitle: string): void {
  const history = projection.history;
  if (history === null) return;
  const section = element('section', 'analysis-history');
  section.dataset['historyLatestOrdinal'] = String(history.latestOrdinal);
  section.dataset['historyCount'] = String(history.entries.length);
  section.dataset['historyResultSetId'] = history.resultSetId;
  // How many revisions there are and which one is latest are decisions, not identities: they stay at
  // full rank, and only the result set's own identity and kind step down into the disclosure.
  section.append(
    element('h4', undefined, '历次分析'),
    element('p', 'field-note', `共 ${history.entries.length} 份分析 · 最新的是第 ${history.latestOrdinal} 份`),
    technicalDetails('analysis-facts',
      element('dt', undefined, '结果集'), element('dd', 'technical-identity', `${history.resultSetId} · ${history.kind}`)),
  );
  const open = async (revisionId: string | null): Promise<void> => {
    setStatus(revisionId === null ? '正在返回最新修订版…' : '正在只读打开历史修订版…', 'busy');
    try {
      const next = await window.ai7.inspectBaselineAnalysis({ revisionId });
      if (host.isConnected && next.bookId === host.dataset['analysisBookId']) {
        renderBaselineAnalysis(host, next, bookTitle);
        setStatus(revisionId === null ? '已返回最新修订版。' : '历史修订版已只读打开。', 'success');
      }
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法打开该结果集修订版。'), 'error');
    }
  };
  const list = element('ol', 'analysis-history-list');
  for (const entry of history.entries) {
    const item = element('li', 'analysis-history-entry');
    item.dataset['historyOrdinal'] = String(entry.ordinal);
    item.dataset['historyRevisionId'] = entry.revisionId;
    item.dataset['historyMode'] = entry.mode;
    item.dataset['historyCurrent'] = entry.current ? 'true' : 'false';
    item.dataset['historyFreshness'] = entry.freshness;
    item.dataset['historyPredecessorOrdinal'] = entry.predecessor === null ? '' : String(entry.predecessor.ordinal);
    // What the entry is and what it cost stay at full rank; its identities — the revision's own and
    // the Run that produced it — travel together in the entry's one disclosure, in the order they read
    // in before (V2-UX-LAYER-001).
    item.append(
      element('p', undefined, `第 ${entry.ordinal} 份 · ${entry.modeLabel} · 读的是 ${entry.manuscriptPin.revisionLabel} · ${localInstantLabel(entry.createdAt)} · ${entry.current ? '当前最新' : '已被后来的分析取代 · 按原样保留'}`),
      element('p', 'field-note', `沿用上一份 ${entry.counts.reused} 个阅读范围，重新分析 ${entry.counts.recomputed} 个；读完 ${entry.unitsClosed} 个，${entry.gapCount} 个没有读成。`),
      technicalDetails('analysis-facts',
        element('dt', undefined, '修订版'),
        element('dd', 'technical-identity', `Revision ${entry.ordinal} · ${entry.freshnessLabel} · 前一修订版 ${entry.predecessor === null ? '无' : `Revision ${entry.predecessor.ordinal}`} · 创建于 ${entry.createdAt}`),
        element('dt', undefined, '单元血缘与计数'),
        element('dd', 'technical-identity', `${reuseCountsText(entry.counts)} · 缺口 ${entry.gapCount} · 冲突 ${entry.conflictCount} · 覆盖 ${entry.unitsClosed}/${entry.unitsTotal}`),
        element('dt', undefined, '修订版身份'),
        element('dd', 'technical-identity', `${entry.revisionId} · 摘要 ${entry.digest} · 稿件 pin ${entry.manuscriptPin.revisionId} · ${entry.manuscriptPin.revisionDigest}`),
        element('dt', undefined, '产出 Run 与用量'),
        element('dd', 'technical-identity', `Run ${entry.producingRun.runRecordId} · ${entry.producingRun.classification ?? '无结果'} · ${entry.usage.requests} 次模型请求 · 输入 ${entry.usage.inputTokens} · 输出 ${entry.usage.outputTokens}`),
      ),
    );
    item.append(runReportOrReason(entry.report, entry.reportAbsentReason));
    const view = button('查看这一份（只读）', 'quiet', () => open(entry.revisionId));
    view.dataset['analysisAction'] = 'open-revision';
    view.dataset['analysisRevisionId'] = entry.revisionId;
    view.dataset['analysisRevisionOrdinal'] = String(entry.ordinal);
    if (projection.inspectedRevision?.revision.revisionId === entry.revisionId) view.disabled = true;
    item.append(view);
    list.append(item);
  }
  section.append(list);
  if (projection.inspectedRevision !== null) {
    const back = button('返回最新的一份', 'quiet', () => open(null));
    back.dataset['analysisAction'] = 'close-revision';
    section.append(back);
  }
  card.append(section);
}

function renderBaselineAnalysis(host: HTMLElement, projection: BaselineAnalysisProjection, bookTitle: string): void {
  const card = element('section', 'baseline-analysis-card');
  card.dataset['analysisState'] = projection.state;
  card.dataset['analysisBookId'] = projection.bookId;
  if (projection.taskIntent) card.dataset['taskIntentId'] = projection.taskIntent.taskIntentId;
  if (projection.planEnvelope) card.dataset['planEnvelopeDigest'] = projection.planEnvelope.digest;
  if (projection.planVersion) {
    card.dataset['planVersion'] = String(projection.planVersion.ordinal);
    card.dataset['planVersionCount'] = String(projection.planVersions.length);
    card.dataset['planRevisionPending'] = projection.planRevision === null ? 'false' : 'true';
  }
  if (projection.coverageManifest) {
    card.dataset['coverageManifestDigest'] = projection.coverageManifest.digest;
    card.dataset['analysisUnits'] = String(projection.coverageManifest.units.length);
  }
  if (projection.run) card.dataset['runState'] = projection.run.state;
  if (projection.taskOutcome) {
    card.dataset['taskOutcomeId'] = projection.taskOutcome.outcomeId;
    card.dataset['taskOutcomeClassification'] = projection.taskOutcome.classification;
  }
  const heading = element('div', 'baseline-analysis-heading');
  heading.append(
    element('h3', undefined, '基线稿件分析'),
    element('span', `status-pill analysis-state analysis-state-${projection.state}`, projection.stateLabel),
  );
  // The binding clause reads the launch this Book actually bound: the frozen plan's pin first, then the
  // pin the latest Revision recorded, and before either exists there is no launch to state.
  card.append(heading, element('p', 'field-note', analysisKindSubtitle(
    projection.providerResolutionPlan?.remoteBinding.providerProcessing ?? projection.resultSetRevision?.policyPin ?? null,
  )));

  const refreshLater = (): void => {
    window.setTimeout(async () => {
      if (!host.isConnected || host.dataset['analysisBookId'] !== projection.bookId) return;
      try {
        const next = await window.ai7.inspectBaselineAnalysis();
        if (host.isConnected && next.bookId === host.dataset['analysisBookId']) renderBaselineAnalysis(host, next, bookTitle);
      } catch (error) {
        if (host.isConnected) setStatus(rendererErrorMessage(error, '无法刷新基线稿件分析状态。'), 'error');
      }
    }, 250);
  };

  // The first-baseline form exists only while the Book holds no Result Set Revision; afterwards every
  // new Task is one of the three Analysis Update Controls below the Overview.
  if (projection.state === 'available' && projection.history === null) {
    const form = element('section', 'form-row analysis-form');
    const label = element('label', undefined, '固定任务目标');
    label.htmlFor = 'j04-analysis-goal';
    const goal = element('input');
    goal.id = 'j04-analysis-goal';
    goal.value = BASELINE_ANALYSIS_TASK_GOAL;
    goal.readOnly = true;
    const actions = element('div', 'button-row analysis-actions');
    const cancel = analysisCancelButton();
    const start = button('开始基线稿件分析', 'primary', () =>
      startAnalysisPreparation(host, bookTitle, { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null, reconfirm: false }, { start, cancel, others: [] }));
    start.dataset['analysisAction'] = 'prepare';
    actions.append(start, cancel);
    form.append(label, goal, element('p', 'field-note', '开始后先固定任务输入修订版并派生确定性覆盖清单；不会构造模型请求。'), actions);
    card.append(form);
    host.replaceChildren(card);
    return;
  }

  // Once the Book holds a revision the card reads as ②A's seven tabs, and everything about how the
  // analysis was made and is brought up to date — the current Task's plan and Run, its outcome and Run
  // Report, the three update modes, the history — lives under 历史与更新. Before that there is nothing
  // to tab through, and the first baseline's plan reads straight down the card as it always has.
  const revision = projection.inspectedRevision?.revision ?? projection.resultSetRevision;
  let records: HTMLElement = card;
  if (revision !== null) {
    // A Task in flight is what the editor came for, so the card opens where its plan and its Run are;
    // a choice the editor made themselves always wins over either default.
    const taskInFlight = projection.state === 'prepared' || projection.state === 'authorized-blocked' ||
      projection.state === 'admitted' || projection.state === 'executing';
    const { panels, select } = analysisTabs(card, projection.bookId, taskInFlight ? 'history' : 'synopsis');
    renderBaselineAnalysisOverview(card, panels, select, projection, revision, bookTitle, projection.inspectedRevision !== null
      ? { historical: true, current: projection.inspectedRevision.current }
      : { historical: false, current: true });
    records = panels.history;
  }
  if (projection.checkpoint !== null) renderFrozenAnalysisPlan(records, projection, host, bookTitle);

  if (projection.taskOutcome) {
    const outcome = element('section', 'success-note analysis-outcome');
    outcome.dataset['taskOutcomeId'] = projection.taskOutcome.outcomeId;
    outcome.dataset['taskOutcomeClassification'] = projection.taskOutcome.classification;
    outcome.append(
      element('h4', undefined, projection.taskOutcome.label),
      element('p', undefined, `安全的下一步：${projection.taskOutcome.safeNextAction}`),
      runReportOrReason(projection.taskOutcome.report, projection.taskOutcome.reportAbsentReason),
      technicalDetails('analysis-facts',
        element('dt', undefined, '任务结果'),
        element('dd', 'technical-identity', `Task Outcome ${projection.taskOutcome.outcomeId} · 链接结果集修订版 ${projection.taskOutcome.resultSetRevisionId ?? '无'}`)),
    );
    records.append(outcome);
  }

  renderAnalysisUpdateControls(records, projection, host, bookTitle);
  renderAnalysisHistory(records, projection, host, bookTitle);

  const nonEffects = element('ul', 'analysis-list');
  for (const statement of projection.namedNonEffects) nonEffects.append(element('li', undefined, statement));
  card.append(element('h4', undefined, '明确不会发生'), nonEffects);
  host.replaceChildren(card);
  if (projection.state === 'admitted' || projection.state === 'executing') refreshLater();
}

/** The execution route of the frozen plan: the deterministic fixture pin, or the live route's endpoint. */
function executionRouteLabel(route: NonNullable<BaselineAnalysisProjection['providerResolutionPlan']>['executionRoute']): string {
  if (route.kind === 'none') return '无（未提供 J-04 本地确定性模型适配器控制）';
  if (route.kind === 'opencode-go') return `${route.kind} · ${route.model} · ${route.endpoint}`;
  return `${route.kind} · ${route.model} · 夹具 ${route.fixtureIdentity} · ${route.fixtureSha256}`;
}

/** The frozen plan of the latest Task: checkpoint, manifest, Provider plan, envelope, reuse plan, authorization, Run. */
function renderFrozenAnalysisPlan(card: HTMLElement, projection: BaselineAnalysisProjection, host: HTMLElement, bookTitle: string): void {
  const checkpoint = projection.checkpoint!;
  const manifest = projection.coverageManifest!;
  const provider = projection.providerResolutionPlan!;
  const envelope = projection.planEnvelope!;
  const facts = element('dl', 'analysis-facts');
  facts.append(
    element('dt', undefined, '任务目标'), element('dd', undefined, projection.taskIntent!.goal),
    element('dt', undefined, '更新方式'), element('dd', undefined, projection.taskIntent!.modeLabel),
    element('dt', undefined, '预期结果'), element('dd', undefined, projection.taskIntent!.expectedOutcome),
    element('dt', undefined, '任务输入修订版'), element('dd', undefined, checkpoint.revisionLabel),
    // How much of the manuscript this Run would cover is what the plan costs, so it reads at full rank.
    element('dt', undefined, '覆盖清单'), element('dd', undefined, `${manifest.units.length} 个分析单元 · ${manifest.sectionCount} 个结构段 · ${manifest.totalBlocks} 个内容块 · ${manifest.totalGraphemes} 字素 · 单元预算 ${manifest.parameters.unitBudgetGraphemes} 字素 · 重叠 ${manifest.parameters.overlapBlocks} 块`),
    element('dt', undefined, '模型角色'), element('dd', undefined, provider.role),
    element('dt', undefined, remoteBindingRowLabel(provider.remoteBinding.providerProcessing.decision)),
    element('dd', undefined, `${provider.remoteBinding.providerId} · ${provider.remoteBinding.modelId} · adapter r${provider.remoteBinding.adapterRevision} · config r${provider.remoteBinding.configurationRevision} · 凭据 ${provider.remoteBinding.credentialReadiness} · ${remoteBindingPolicyReading(provider.remoteBinding.providerProcessing)}`),
    element('dt', undefined, '外发数据类别'), element('dd', undefined, provider.outboundDataCategory),
    element('dt', undefined, '任务运行预算上限'), element('dd', undefined, runBudgetCeilingLabel(provider.runBudgetCeiling)),
    element('dt', undefined, '计划版本'), element('dd', undefined, projection.planVersion === null
      ? '未记录'
      : `版本 ${projection.planVersion.ordinal} · ${projection.planVersion.state === 'bound' ? '已被运行授权绑定' : projection.planVersion.state === 'current' ? '当前 · 待授权' : '已被取代'}`),
    element('dt', undefined, '派发状态'), element('dd', undefined, envelope.summary),
  );
  card.append(element('h4', undefined, '覆盖清单与计划预览'), facts, technicalDetails(
    'analysis-facts',
    element('dt', undefined, '任务输入修订版身份'), element('dd', 'technical-identity', `${checkpoint.revisionId} · ${checkpoint.revisionDigest}`),
    element('dt', undefined, '覆盖清单摘要'), element('dd', 'technical-identity', manifest.digest),
    element('dt', undefined, '执行路由'), element('dd', 'technical-identity', executionRouteLabel(provider.executionRoute)),
    element('dt', undefined, '提示契约摘要'), element('dd', 'technical-identity', envelope.promptContractDigest),
    element('dt', undefined, '行为组合摘要'), element('dd', 'technical-identity', envelope.behaviorCompositionDigest),
    element('dt', undefined, '计划权限边界'), element('dd', 'technical-identity', envelope.digest),
  ));
  const unitList = element('ul', 'analysis-list analysis-manifest-units');
  for (const unit of manifest.units) {
    const item = element('li', undefined, `单元 ${unit.ordinal} · 结构段 ${unit.sectionOrdinal}${unit.headingText === null ? '' : `「${unit.headingText}」`} ${unit.subUnitIndex}/${unit.subUnitCount} · 内容块 ${unit.startPosition}–${unit.endPosition} · ${unit.graphemes} 字素 · 重叠 ${unit.overlapBlockIds.length} 块`);
    item.dataset['manifestUnit'] = String(unit.ordinal);
    unitList.append(item);
  }
  card.append(unitList);
  renderReusePlanPreview(card, projection);
  renderPlanBoundarySplit(card, envelope.boundary);
  renderPlanVersions(card, projection);
  if (projection.authorization === null) renderPlanRevision(card, projection, host, bookTitle);

  if (projection.actions.canAuthorize) {
    const actions = element('div', 'button-row analysis-actions');
    const authorize = button(envelope.dispatchAllowed ? '授权并开始任务' : '记录运行授权（将于派发前阻止）', 'primary', async () => {
      authorize.disabled = true;
      setStatus(envelope.dispatchAllowed ? '正在记录标准直接运行授权并进入调度…' : '正在记录标准直接运行授权…', 'busy');
      try {
        const authorized = await window.ai7.authorizeBaselineAnalysis({
          taskIntentId: projection.taskIntent!.taskIntentId,
          planEnvelopeDigest: envelope.digest,
        });
        if (host.isConnected && authorized.bookId === host.dataset['analysisBookId']) {
          renderBaselineAnalysis(host, authorized, bookTitle);
          // The refusal is a message about an action that failed, so it belongs in the status line. The
          // success path's state does not: the card's header pill carries it and re-renders with every
          // refresh, while a toast reading `已进入调度器` would outlive the state that produced it
          // (V2-UX-LIVE-004) — which is exactly what the first live Run showed.
          if (authorized.state === 'authorized-blocked') setStatus(authorized.run?.stateLabel ?? '已记录授权');
        }
      } catch (error) {
        authorize.disabled = false;
        setStatus(rendererErrorMessage(error, '无法记录基线稿件分析运行授权。'), 'error');
      }
    });
    authorize.dataset['analysisAction'] = 'authorize';
    actions.append(authorize);
    card.append(actions);
  }

  const run = projection.run;
  if (run) {
    const runSection = element('section', 'analysis-run');
    runSection.dataset['runState'] = run.state;
    runSection.append(element('h4', undefined, `任务运行记录 · ${run.stateLabel}`));
    const runFacts = element('dl', 'analysis-facts');
    // Who authorized this Run, on whose authority and against which plan version, is the decision behind
    // it; only the identifiers and the envelope digest that name them go one step away.
    runFacts.append(
      element('dt', undefined, '运行授权'), element('dd', undefined, `${projection.authorization!.origin} · ${projection.authorization!.authority} · 计划版本 ${projection.authorization!.planVersionOrdinal ?? '未记录'}`),
      element('dt', undefined, '状态转换'), element('dd', undefined, run.transitions.map((transition) => `${transition.sequence}. ${transition.state}`).join(' → ')),
      element('dt', undefined, '计划内调整'), element('dd', undefined, run.adaptations.length === 0
        ? '无'
        : `${run.adaptations.length} 次 · 单元 ${run.adaptations.map((adaptation) => adaptation.unitOrdinal).join('、')} · 安全重试；执行绑定与计划信封未变`),
    );
    // When the Run last changed state, in the Decision Layer's local time with the exact instant beside
    // it (V2-UX-LAYER-004). It reads from the transitions rather than from `progress`, so it stays
    // legible after the Run settles and `progress` is gone — a settled Run still answers "when".
    const lastTransition = run.transitions[run.transitions.length - 1]!;
    const lastTransitionValue = element('dd');
    lastTransitionValue.dataset['runLastTransitionAt'] = lastTransition.recordedAt;
    lastTransitionValue.append(
      `${localInstantLabel(lastTransition.recordedAt)} · ${lastTransition.state}`,
      element('span', 'technical-identity', lastTransition.recordedAt),
    );
    runFacts.append(element('dt', undefined, '上次状态更新'), lastTransitionValue);
    runSection.dataset['runAdaptations'] = String(run.adaptations.length);
    if (run.attempt) {
      // That the credential readiness check released no value is a Provider decision the editor is owed
      // at full rank; the attempt's identity and binding digest are the technical half of the same fact.
      runFacts.append(
        element('dt', undefined, '凭据就绪检查'), element('dd', undefined, `${run.attempt.credentialReadinessCheck.readiness} · 未释放任何值`),
        element('dt', undefined, 'Harness 执行区段'), element('dd', undefined, `${run.attempt.spans.length} 个区段（按标识引用，不复制内容）`),
      );
    }
    runSection.append(runFacts, technicalDetails(
      'analysis-facts',
      element('dt', undefined, '任务运行记录'), element('dd', 'technical-identity', run.runRecordId),
      element('dt', undefined, '任务运行授权'), element('dd', 'technical-identity', `${projection.authorization!.authorizationId} · 信封 ${projection.authorization!.planEnvelopeDigest}`),
      ...(run.attempt === null ? [] : [
        element('dt', undefined, '执行尝试'), element('dd', 'technical-identity', run.attempt.attemptId),
        element('dt', undefined, '执行绑定'), element('dd', 'technical-identity', run.attempt.executionBinding === null ? '尚未持久化' : `${run.attempt.executionBinding.bindingDigest} · Session ${run.attempt.executionBinding.harnessSessionId}`),
      ]),
    ), element('h5', undefined, '时间线'), renderRunTimeline(run));
    if (run.blockedReasons) {
      const reasons = element('ul', 'analysis-list attention-note');
      reasons.dataset['analysisBlocked'] = 'blocked-before-dispatch';
      for (const reason of run.blockedReasons) reasons.append(element('li', undefined, reason));
      runSection.append(reasons);
    }
    if (run.progress) {
      // The Run Liveness Signal (ADR 0071 §3): Measured Run Progress, then only facts the system
      // already holds — which unit is in flight and since when, what the attempt is doing, when the Run
      // last changed state, how many model turns are done. Elapsed time is computed here from a shown
      // instant, so the reader can check it; nothing is estimated, and no percentage is invented.
      const facts = run.progress;
      const elapsedMs = facts.currentUnitStartedAt === null ? null : Date.now() - Date.parse(facts.currentUnitStartedAt);
      const stale = elapsedMs !== null && runStepIsStale(elapsedMs, facts.longestSettledUnitMs);
      const progress = element('p', 'analysis-progress');
      progress.dataset['analysisProgress'] = `${facts.unitsSettled}/${facts.unitsTotal}`;
      progress.dataset['runCompletedAttempts'] = String(facts.completedAttempts);
      if (facts.attemptState !== null) progress.dataset['runAttemptState'] = facts.attemptState;
      // The stale reading is an attribute as well as a sentence so a Journey can observe it without
      // matching prose, and so the surface can style it without a second element.
      if (stale) progress.dataset['runLiveness'] = 'stale';
      progress.setAttribute('aria-live', 'polite');
      const reading = [
        RUN_LIVENESS_STAGE_LABELS[facts.stage],
        `已读完 ${facts.unitsSettled} / ${facts.unitsTotal} 个阅读范围${projection.update === null ? '' : '（只算要重新分析的）'}`,
        ...(facts.currentUnitOrdinal === null ? [] : [`正在读第 ${facts.currentUnitOrdinal} 个`]),
        ...(elapsedMs === null ? [] : [`本步已用时 ${elapsedLabel(elapsedMs)}`]),
        ...(facts.attemptState === null ? [] : [attemptStateLabel(facts.attemptState)]),
        `上次状态更新 ${localInstantLabel(facts.lastTransitionAt)}`,
        `已完成模型回合 ${facts.completedAttempts} 次`,
      ].join(' · ');
      // Over the bar this Run measured for itself, the surface says so and shows the same facts. It
      // adds no action: cancelling is already the safe one, and it never claims the Run has died.
      progress.textContent = stale ? `本步骤用时已超过通常水平。${reading}` : reading;
      progress.append(element('span', 'technical-identity', facts.currentUnitStartedAt === null
        ? `上次状态更新 ${facts.lastTransitionAt}`
        : `本单元开始 ${facts.currentUnitStartedAt} · 上次状态更新 ${facts.lastTransitionAt}`));
      runSection.append(progress);
    }
    card.append(runSection);
  }
}

function renderForegroundExecutionBoundary(
  host: HTMLElement,
  projection: ForegroundExecutionBoundaryProjection,
): void {
  const result = element('section', 'attention-note task-foreground-execution-boundary');
  result.dataset['foregroundExecutionState'] = projection.state;
  const lineage = element('dl', 'task-authorization-facts');
  lineage.append(
    element('dt', undefined, '任务运行权限'), element('dd', undefined, projection.runAuthority),
    element('dt', undefined, '当前可信策略'),
    element('dd', undefined, `${projection.launchPolicy.operationalScope} · Provider Processing ${projection.launchPolicy.providerProcessing.version} · ${projection.launchPolicy.providerProcessing.authorizedLiveTransmissionCount} 次实时传输`),
  );
  const reasons = element('ul', 'task-authorization-non-effects');
  for (const reason of projection.reasons) reasons.append(element('li', undefined, reason));
  // The blocker and the policy that produced it stay at full rank (V2-UX-LAYER-002); the five lineage
  // identifiers that let a reader trace it are what goes one step away.
  result.append(element('h4', undefined, projection.terminalLabel), lineage, reasons, technicalDetails(
    'task-authorization-facts',
    element('dt', undefined, '图书'), element('dd', 'technical-identity', projection.bookId),
    element('dt', undefined, '任务意图'), element('dd', 'technical-identity', projection.taskIntentId),
    element('dt', undefined, '计划权限边界'), element('dd', 'technical-identity', projection.planEnvelopeDigest),
    element('dt', undefined, '任务运行授权'), element('dd', 'technical-identity', projection.authorizationId),
    element('dt', undefined, '任务运行记录'), element('dd', 'technical-identity', projection.runRecordId),
  ));
  host.replaceChildren(result);
}

function renderTaskAuthorization(host: HTMLElement, projection: TaskAuthorizationProjection): void {
  const card = element('section', 'task-authorization-card');
  card.dataset['taskAuthorizationState'] = projection.state;
  card.dataset['taskAuthorizationBookId'] = projection.bookId;
  if (projection.taskIntent) card.dataset['taskIntentId'] = projection.taskIntent.taskIntentId;
  if (projection.planEnvelope) card.dataset['planEnvelopeDigest'] = projection.planEnvelope.digest;
  const heading = element('div', 'task-authorization-heading');
  heading.append(
    element('h3', undefined, '任务运行授权'),
    element(
      'span',
      `status-pill task-authorization-status task-authorization-status-${projection.state}`,
      projection.state === 'available' ? '待准备' : projection.state === 'prepared' ? '计划待授权' : '已记录授权 · 未派发',
    ),
  );
  card.append(
    heading,
    element('p', 'field-note', taskAuthorizationDispatchNote(projection.providerResolutionPlan?.providerProcessing ?? null)),
  );
  if (projection.state === 'available' || (projection.taskIntent !== null && projection.checkpoint === null)) {
    const form = element('section', 'form-row task-authorization-form');
    const label = element('label', undefined, '固定任务目标');
    label.htmlFor = 'j03-task-goal';
    const goal = element('input');
    goal.id = 'j03-task-goal';
    goal.value = J03_TASK_GOAL;
    goal.maxLength = J03_TASK_GOAL.length;
    goal.autocomplete = 'off';
    const actions = element('div', 'button-row task-authorization-actions');
    const prepare = button('准备任务授权计划', 'primary', async () => {
      if (goal.value !== J03_TASK_GOAL) {
        goal.setAttribute('aria-invalid', 'true');
        setStatus('任务目标必须与本次固定目标完全一致。', 'error');
        return;
      }
      goal.removeAttribute('aria-invalid');
      prepare.disabled = true;
      cancel.hidden = false;
      setStatus('正在有界固定任务输入并准备计划…', 'busy');
      try {
        const initial = await window.ai7.prepareTaskAuthorization({ goal: J03_TASK_GOAL });
        cancel.dataset['serviceJobId'] = initial.jobId;
        const completed = await awaitServiceJob(initial, (job) => {
          cancel.dataset['serviceJobId'] = job.jobId;
          setStatus(job.progress.label, job.state === 'failed' ? 'error' : 'busy');
        });
        if (completed.state === 'cancelled') {
          prepare.disabled = false;
          cancel.hidden = true;
          setStatus('任务计划准备已取消；任务草稿与稿件编辑保持不变。', 'success');
          return;
        }
        if (completed.kind !== 'task-authorization-preparation' || completed.result === null ||
            !('runRecord' in completed.result)) throw new Error('任务授权准备未返回计划。');
        if (host.isConnected && completed.result.bookId === host.dataset['taskAuthorizationBookId']) {
          renderTaskAuthorization(host, completed.result);
          setStatus('任务授权计划已冻结；当前仍未派发。', 'success');
        }
      } catch (error) {
        prepare.disabled = false;
        cancel.hidden = true;
        setStatus(rendererErrorMessage(error, '无法准备任务授权计划。'), 'error');
      }
    });
    prepare.dataset['taskAuthorizationAction'] = 'prepare';
    const cancel = button('取消准备', 'quiet', async () => {
      const jobId = cancel.dataset['serviceJobId'];
      if (!jobId) return;
      cancel.disabled = true;
      try {
        await window.ai7.cancelServiceJob({ jobId });
      } catch (error) {
        cancel.disabled = false;
        setStatus(rendererErrorMessage(error, '无法取消任务计划准备。'), 'error');
      }
    });
    cancel.hidden = true;
    actions.append(prepare, cancel);
    form.append(label, goal, element('p', 'field-note', '目标由当前 J-03 工作流固定；不会构造模型请求。'), actions);
    card.append(form);
  } else {
    const checkpoint = projection.checkpoint!;
    const manuscriptPin = projection.manuscriptPin!;
    const sourceScope = projection.runSourceScope!;
    const artifact = projection.artifactPin!;
    const provider = projection.providerResolutionPlan!;
    const plan = projection.executionPlan!;
    const envelope = projection.planEnvelope!;
    const facts = element('dl', 'task-authorization-facts');
    // A field the plan declared nothing for no longer costs a full-weight row (ADR 0071 §2). Nothing
    // leaves the record: the labels collect into one `未声明` row that closes the record, in the order
    // they read in, so the reading is still that this plan declared none of them.
    const undeclared: string[] = [];
    const declaredRow = (label: string, values: ReadonlyArray<string>): ReadonlyArray<HTMLElement> => {
      if (values.length === 0) {
        undeclared.push(label);
        return [];
      }
      return [element('dt', undefined, label), element('dd', undefined, values.join('、'))];
    };
    facts.append(
      element('dt', undefined, '任务目标'), element('dd', undefined, projection.taskIntent!.goal),
      element('dt', undefined, '预期结果'), element('dd', undefined, projection.taskIntent!.expectedOutcome),
      element('dt', undefined, '目标修订版'), element('dd', undefined, checkpoint.revisionLabel),
      element('dt', undefined, '任务输入固定点'), element('dd', undefined, `${checkpoint.purpose} · ${checkpoint.createdForDirtyJournal ? '由已确认编辑创建' : '复用当前精确修订版'}`),
      // V2-UX-LAYER-002 names the scope of reading un-demotable, so both scope statements read at full
      // rank: what this Run may read, and that the lineage evidence is outside it. Only the bare
      // identifier of that evidence is technical, and it is disclosed as its own row below.
      element('dt', undefined, '来源版本证据'), element('dd', undefined, '仅血缘证据，不属于可读范围'),
      element('dt', undefined, '可读范围'), element('dd', undefined, `仅图书 ${sourceScope.bookId} · 主稿件 ${sourceScope.manuscriptId} · Task Input 修订版 ${sourceScope.taskInputRevision.revisionId} · ${sourceScope.taskInputRevision.revisionDigest}`),
      element('dt', undefined, '原生构件'), element('dd', undefined, `${artifact.identity}@${artifact.version}`),
      element('dt', undefined, '权限侧车'), element('dd', undefined, `${artifact.sidecarIdentity} · Revision ${artifact.sidecarRevision}`),
      element('dt', undefined, '模型角色'), element('dd', undefined, provider.role),
      ...declaredRow('AI7 能力', provider.capabilities),
      // Which provider and which model this Run would reach is the binding an editor weighs; the adapter
      // and configuration revisions that froze it are identities, and they read in the disclosure below.
      element('dt', undefined, '模型提供方绑定'), element('dd', undefined, `${provider.providerId} · ${provider.modelId}`),
      ...declaredRow('已批准备用链', provider.approvedFallbackChain),
      element('dt', undefined, '凭据引用'), element('dd', undefined, `readiness ${provider.credentialReadiness}`),
      element('dt', undefined, '外发数据类别'), element('dd', undefined, provider.outboundDataCategory),
      element('dt', undefined, '任务运行预算上限'), element('dd', undefined, runBudgetCeilingLabel(provider.runBudgetCeiling)),
      element('dt', undefined, '模型服务数据处理策略'), element('dd', undefined, providerProcessingLabel(provider.providerProcessing)),
      element('dt', undefined, '计划步骤'), element('dd', undefined, plan.steps.join(' → ')),
      ...declaredRow('受控动作', plan.effects),
      element('dt', undefined, '派发状态'), element('dd', undefined, envelope.summary),
    );
    if (undeclared.length > 0) {
      facts.append(element('dt', undefined, '未声明'), element('dd', undefined, undeclared.join('、')));
    }
    card.append(element('h4', undefined, '计划预览'), facts, technicalDetails(
      'task-authorization-facts',
      element('dt', undefined, '目标修订版身份'), element('dd', 'technical-identity', `${checkpoint.revisionId} · ${manuscriptPin.revisionDigest}`),
      element('dt', undefined, '来源版本证据 ID'), element('dd', 'technical-identity', sourceScope.sourceVersionEvidence.sourceVersionId),
      element('dt', undefined, '原生构件摘要'), element('dd', 'technical-identity', artifact.nativeCarrierSha256),
      element('dt', undefined, '权限侧车摘要'), element('dd', 'technical-identity', artifact.sidecarSha256),
      element('dt', undefined, '模型提供方绑定（适配器与契约）'), element('dd', 'technical-identity', `adapter r${provider.adapterRevision} · config r${provider.configurationRevision}`),
      element('dt', undefined, '凭据引用'), element('dd', 'technical-identity', provider.credentialReference),
      element('dt', undefined, '计划权限边界'), element('dd', 'technical-identity', envelope.digest),
    ));
    const nonEffects = element('ul', 'task-authorization-non-effects');
    for (const statement of projection.namedNonEffects) nonEffects.append(element('li', undefined, statement));
    card.append(element('h4', undefined, '明确不会发生'), nonEffects);
    if (projection.actions.canAuthorize) {
      const actions = element('div', 'button-row task-authorization-actions');
      const authorize = button('记录本次运行授权（不派发）', 'primary', async () => {
        authorize.disabled = true;
        setStatus('正在记录标准直接运行授权…', 'busy');
        try {
          const authorized = await window.ai7.authorizeTaskAuthorization({
            taskIntentId: projection.taskIntent!.taskIntentId,
            planEnvelopeDigest: envelope.digest,
          });
          if (host.isConnected && authorized.bookId === host.dataset['taskAuthorizationBookId']) {
            renderTaskAuthorization(host, authorized);
            setStatus('已记录授权 · 未派发', 'success');
          }
        } catch (error) {
          authorize.disabled = false;
          setStatus(rendererErrorMessage(error, '无法记录任务运行授权。'), 'error');
        }
      });
      authorize.dataset['taskAuthorizationAction'] = 'authorize-no-dispatch';
      actions.append(authorize);
      card.append(actions);
    }
    const runRecord = projection.runRecord;
    if (runRecord) {
      const terminal = element('p', 'success-note task-authorization-terminal', runRecord.terminalLabel);
      terminal.dataset['taskAuthorizationTerminal'] = runRecord.state;
      terminal.dataset['runRecordId'] = runRecord.runRecordId;
      card.append(terminal);
      const actions = element('div', 'button-row task-authorization-actions');
      const boundaryHost = element('div');
      boundaryHost.setAttribute('aria-live', 'polite');
      const inspectBoundary = button('核对前台执行边界（不派发）', 'secondary', async () => {
        inspectBoundary.disabled = true;
        setStatus('正在核对前台执行边界…', 'busy');
        try {
          const boundary = await window.ai7.inspectForegroundExecutionBoundary({ runRecordId: runRecord.runRecordId });
          if (host.isConnected && boundary.bookId === host.dataset['taskAuthorizationBookId'] &&
              boundary.runRecordId === runRecord.runRecordId) {
            renderForegroundExecutionBoundary(boundaryHost, boundary);
            setStatus(boundary.terminalLabel);
          }
        } catch (error) {
          setStatus(rendererErrorMessage(error, '无法核对前台执行边界。'), 'error');
        } finally {
          if (inspectBoundary.isConnected && !authorityInterrupted) inspectBoundary.disabled = false;
        }
      });
      inspectBoundary.dataset['taskAuthorizationAction'] = 'inspect-foreground-boundary';
      actions.append(inspectBoundary);
      card.append(actions, boundaryHost);
    }
  }
  host.replaceChildren(card);
}

function renderEditorialWorkspaceProfile(
  host: HTMLElement,
  projection: EditorialWorkspaceProfileProjection,
): void {
  const card = element('section', 'native-artifact-card');
  card.dataset['nativeArtifactState'] = projection.lifecycle.state;
  card.dataset['nativeArtifactIdentity'] = projection.identity;
  card.dataset['authoritySidecarIdentity'] = projection.sidecar.identity;
  if (projection.sidecar.activeRevision !== null) {
    card.dataset['authoritySidecarActiveRevision'] = String(projection.sidecar.activeRevision);
  }
  if (projection.sidecar.offeredRevision !== null) {
    card.dataset['authoritySidecarOfferedRevision'] = String(projection.sidecar.offeredRevision);
  }
  const heading = element('div', 'native-artifact-heading');
  heading.append(
    element('h3', undefined, '编辑工作区方案'),
    element(
      'span',
      `status-pill native-artifact-status native-artifact-status-${projection.lifecycle.state}`,
      projection.lifecycle.label,
    ),
  );
  const values = element('dl', 'native-artifact-facts');
  values.append(
    element('dt', undefined, '类型'), element('dd', undefined, projection.kind),
    element('dt', undefined, '来源'), element('dd', undefined, projection.provenance),
    element('dt', undefined, '许可'), element('dd', undefined, projection.license),
    element('dt', undefined, '精确字节'), element('dd', undefined, `${projection.byteLength} bytes`),
    element('dt', undefined, '兼容性'), element('dd', undefined, projection.compatibility),
  );
  const artifactExact = technicalDetails(
    'native-artifact-facts',
    element('dt', undefined, '原生载体身份'), element('dd', 'technical-identity', projection.identity),
    element('dt', undefined, '原生载体版本'), element('dd', 'technical-identity', projection.version),
    element('dt', undefined, '内置载体'), element('dd', 'technical-identity', projection.source),
    element('dt', undefined, 'SHA-256'), element('dd', 'technical-identity', projection.sha256),
  );
  const sidecar = element('section', 'native-artifact-authority');
  const sidecarValues = element('dl', 'native-artifact-facts');
  // Which Revision is in force for this Book, what successor is on offer, and when each was pinned are
  // the enablement decisions this card exists for, so the pin history keeps its local reading at full
  // rank; the sidecar's identity and the exact pin instants go one step away. It reads as a list rather
  // than a `；`-joined wall (ADR 0071 §2) — one line per pin, in the order this Book pinned them — and
  // each pin's digest and exact instant stay on one line of their own in the disclosure, so a reader can
  // copy the identity of one pin without separating it from the pin it belongs to.
  const pinHistoryValue = (layer: 'decision' | 'technical'): HTMLElement => {
    const value = element('dd', layer === 'technical' ? 'technical-identity' : undefined);
    if (projection.sidecar.pinHistory.length === 0) {
      value.textContent = '空（无）';
      return value;
    }
    const pins = element('ul');
    for (const pin of projection.sidecar.pinHistory) {
      const item = element('li', undefined, layer === 'technical'
        ? `Revision ${pin.revision} · ${pin.sha256} · ${pin.pinnedAt}`
        : `Revision ${pin.revision} · ${localInstantLabel(pin.pinnedAt)}`);
      item.dataset['sidecarPin'] = String(pin.revision);
      pins.append(item);
    }
    value.append(pins);
    return value;
  };
  sidecarValues.append(
    element('dt', undefined, '当前生效 Revision'), element('dd', undefined,
      projection.sidecar.activeRevision === null ? '空（本图书未启用）' : `Revision ${projection.sidecar.activeRevision}`),
    element('dt', undefined, '可审阅后继'), element('dd', undefined,
      projection.sidecar.offeredRevision === null ? '空（无）' : `Revision ${projection.sidecar.offeredRevision}`),
    element('dt', undefined, '本图书 pin 历史'), pinHistoryValue('decision'),
  );
  sidecar.append(element('h4', undefined, 'AI7 权限侧车'), sidecarValues, technicalDetails(
    'native-artifact-facts',
    element('dt', undefined, '侧车身份'), element('dd', 'technical-identity', projection.sidecar.identity),
    element('dt', undefined, '本图书 pin 历史（精确时间）'), pinHistoryValue('technical'),
  ));
  // Past revisions go one step away, so the card's actions stay reachable without scrolling past every
  // revision this artifact has ever had (ADR 0071 §2): the Revision in force for this Book and the
  // successor on offer render in place, and every other section moves into one disclosure that states
  // how many there are. When neither is pinned nothing here is past — every section renders in place,
  // because the ceiling an editor is deciding to install is the decision, not history.
  const pinned = projection.sidecar.activeRevision !== null || projection.sidecar.offeredRevision !== null;
  const pastRevisions: HTMLElement[] = [];
  for (const revision of projection.sidecar.revisions) {
    const revisionSection = element('section', 'native-artifact-authority');
    revisionSection.dataset['authoritySidecarRevision'] = String(revision.revision);
    const authorityValues = element('dl', 'native-artifact-facts');
    const ceiling = revision.authorityCeiling;
    // The eight ceiling fields that can be empty fold into one reading (ADR 0071 §2): a granted field
    // keeps its own row, and the rest collect their labels, in the order they read in, into the row that
    // closes the record. A ceiling that grants none of the eight says so once rather than eight times;
    // `Model Role`, which this artifact always declares, stays at full rank either way.
    const undeclared: string[] = [];
    const ceilingRow = (label: string, granted: ReadonlyArray<string> | boolean): ReadonlyArray<HTMLElement> => {
      const reading = typeof granted === 'boolean'
        ? (granted ? '有' : null)
        : (granted.length === 0 ? null : granted.join('、'));
      if (reading === null) {
        undeclared.push(label);
        return [];
      }
      return [element('dt', undefined, label), element('dd', undefined, reading)];
    };
    authorityValues.append(
      element('dt', undefined, '规范字节'), element('dd', undefined, `${revision.byteLength} bytes`),
      element('dt', undefined, '兼容性'), element('dd', undefined, revision.compatibility),
      element('dt', undefined, '模型角色'), element('dd', undefined, ceiling.modelRoles.join('、')),
      ...ceilingRow('AI7 能力', ceiling.capabilities),
      ...ceilingRow('可读范围', ceiling.readableScopeKinds),
      ...ceilingRow('模型提供方绑定', ceiling.providerBindings),
      ...ceilingRow('凭据访问', ceiling.credentialAccess),
      ...ceilingRow('网络访问', ceiling.networkAccess),
      ...ceilingRow('受控动作', ceiling.effectClasses),
      ...ceilingRow('后台分析登记', ceiling.backgroundAnalysisEnrollment),
      ...ceilingRow('AI7 正式应用', ceiling.applyAuthority),
    );
    if (undeclared.length === 8) {
      authorityValues.append(element('dt', undefined, '权限上限'), element('dd', undefined, '未声明任何权限（8 项均为空）'));
    } else if (undeclared.length > 0) {
      authorityValues.append(element('dt', undefined, '未声明'), element('dd', undefined, undeclared.join('、')));
    }
    revisionSection.append(element('h4', undefined, `权限上限 · Revision ${revision.revision}`), authorityValues,
      technicalDetails('native-artifact-facts',
        element('dt', undefined, 'SHA-256'), element('dd', 'technical-identity', revision.sha256)));
    if (!pinned || revision.revision === projection.sidecar.activeRevision ||
        revision.revision === projection.sidecar.offeredRevision) {
      sidecar.append(revisionSection);
    } else {
      pastRevisions.push(revisionSection);
    }
  }
  if (pastRevisions.length > 0) {
    const otherRevisions = element('details', 'technical-details');
    otherRevisions.append(element('summary', undefined, `其他 Revision（${pastRevisions.length}）`), ...pastRevisions);
    sidecar.append(otherRevisions);
  }
  const nonEffects = element('ul', 'native-artifact-non-effects');
  for (const statement of projection.namedNonEffects) nonEffects.append(element('li', undefined, statement));
  const actions = element('div', 'button-row native-artifact-actions');
  if (projection.actions.canInstall) {
    const install = button('获取并安装（保持停用）', 'primary', async () => {
      install.disabled = true;
      setStatus('正在保留并验证本地方案…', 'busy');
      try {
        const installed = await window.ai7.installEditorialWorkspaceProfile();
        if (host.isConnected && installed.bookId === host.dataset['nativeArtifactBookId']) {
          renderEditorialWorkspaceProfile(host, installed);
          setStatus('方案已安装，本图书仍保持停用。', 'success');
        }
      } catch (error) {
        install.disabled = false;
        setStatus(rendererErrorMessage(error, '无法安装本地方案。'), 'error');
      }
    });
    install.dataset['nativeArtifactAction'] = 'install-disabled';
    actions.append(install);
  }
  if (projection.actions.canEnable) {
    const upgrading = projection.sidecar.activeRevision === 1;
    const enable = button(upgrading ? '审阅并追加 Revision 2' : '审阅并为本图书启用 Revision 2', 'primary', async () => {
      enable.disabled = true;
      setStatus(upgrading ? '正在为当前图书追加 Revision 2…' : '正在为当前图书启用 Revision 2…', 'busy');
      try {
        const enabled = await window.ai7.enableEditorialWorkspaceProfile();
        if (host.isConnected && enabled.bookId === host.dataset['nativeArtifactBookId']) {
          renderEditorialWorkspaceProfile(host, enabled);
          setStatus(upgrading ? 'Revision 2 已追加；Revision 1 历史保持不变。' : 'Revision 2 已仅为当前图书启用。', 'success');
        }
      } catch (error) {
        enable.disabled = false;
        setStatus(rendererErrorMessage(error, '无法为当前图书启用方案。'), 'error');
      }
    });
    enable.dataset['nativeArtifactAction'] = 'enable-current-book';
    actions.append(enable);
  }
  card.append(
    heading,
    element('p', 'field-note', '这是一份声明式、Provider-free 的本地方案；安装与为当前图书启用是两个独立动作。'),
    values,
    artifactExact,
    sidecar,
    element('h4', undefined, '明确不会发生'),
    nonEffects,
    actions,
  );
  host.replaceChildren(card);
}

function renderBookCreationReview(review: BookCreationReviewProjection): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '新建图书 · 复核'),
    element('h2', undefined, '复核空图书创建'),
    element('p', 'lede', '本次提交只创建图书身份与编辑维度集。'),
  );
  const identity = element('section', 'source-card');
  const values = element('dl');
  values.append(
    element('dt', undefined, '书名'), element('dd', undefined, review.proposed.title),
    element('dt', undefined, '内部编号'), element('dd', undefined, review.proposed.internalNumber ?? '未设置'),
  );
  identity.append(element('h3', undefined, '拟创建图书'), values, technicalDetails(
    undefined,
    element('dt', undefined, '拟用图书 ID'), element('dd', 'technical-identity', review.proposed.bookId),
    element('dt', undefined, '拟用稳定标识'), element('dd', 'technical-identity', review.proposed.stableIdentity),
  ));
  content.append(
    identity,
    listSection('将创建的记录', review.recordsToCreate),
    listSection('明确不会发生', review.nonEffects),
  );
  const dimensions = element('section', 'review-section');
  dimensions.append(
    element('h3', undefined, '图书编辑维度集 · 8 项'),
    element('p', 'field-note', `${review.editorialDimensionSet.name} · ${review.editorialDimensionSet.weightSemantics}`),
  );
  const list = element('ul', 'dimension-list');
  for (const item of review.editorialDimensionSet.dimensions) {
    list.append(element('li', undefined, `${item.label} · 中性起始权重 ${item.weight}`));
  }
  dimensions.append(list);
  content.append(dimensions);
  const actions = element('div', 'button-row');
  const commit = button('新建图书', 'primary', async () => {
    commit.disabled = true;
    setStatus('正在原子创建空图书…', 'busy');
    try {
      const result = await window.ai7.commitBookCreation({ ...review.proposed, reviewDigest: review.reviewDigest });
      setStatus(result.completionLabel, 'success');
      renderBookOverview(result.overview, undefined, undefined, true);
    } catch (error) {
      commit.disabled = false;
      setStatus(rendererErrorMessage(error, '图书未创建。'), 'error');
    }
  });
  actions.append(commit, button('取消', 'quiet', () => void initializeStartup()));
  content.append(actions);
  replaceScreen('book-create-review', content);
}

function renderBookCreationForm(): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '独立创建'),
    element('h2', undefined, '新建图书'),
    element('p', 'lede', '先建立空图书；不会同时创建稿件、来源或工作流实例。'),
  );
  const form = element('section', 'form-row');
  const titleLabel = element('label', undefined, '书名');
  titleLabel.htmlFor = 'empty-book-title';
  const title = element('input');
  title.id = 'empty-book-title';
  title.maxLength = 180;
  const titleError = element('p', 'field-error');
  titleError.id = 'empty-book-title-error';
  titleError.hidden = true;
  const numberLabel = element('label', undefined, '内部编号（可选）');
  numberLabel.htmlFor = 'empty-book-number';
  const internalNumber = element('input');
  internalNumber.id = 'empty-book-number';
  internalNumber.maxLength = 80;
  const numberError = element('p', 'field-error');
  numberError.id = 'empty-book-number-error';
  numberError.hidden = true;
  const clearFieldError = (input: HTMLInputElement, error: HTMLElement): void => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    error.hidden = true;
    error.textContent = '';
  };
  const showFieldError = (input: HTMLInputElement, error: HTMLElement, message: string): void => {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id);
    setStatus('');
    input.focus();
  };
  title.addEventListener('input', () => clearFieldError(title, titleError));
  internalNumber.addEventListener('input', () => clearFieldError(internalNumber, numberError));
  const review = button('复核创建', 'primary', async () => {
    clearFieldError(title, titleError);
    clearFieldError(internalNumber, numberError);
    const normalizedTitle = title.value.normalize('NFC').replace(/\s+/g, ' ').trim();
    const normalizedNumber = internalNumber.value.normalize('NFC').trim();
    if (!normalizedTitle) {
      showFieldError(title, titleError, '请输入书名；书名不能只包含空白。');
      return;
    }
    if (normalizedNumber.length > 80 || /[\u0000-\u001f\u007f]/.test(normalizedNumber)) {
      showFieldError(internalNumber, numberError, '内部编号不得包含控制字符，且最多 80 个字符；也可以留空。');
      return;
    }
    review.disabled = true;
    setStatus('正在准备空图书创建复核…', 'busy');
    try {
      renderBookCreationReview(await window.ai7.prepareBookCreation({
        title: normalizedTitle,
        internalNumber: normalizedNumber || null,
      }));
      setStatus('图书创建复核已准备', 'success');
    } catch (error) {
      review.disabled = false;
      if (hasErrorCode(error, 'TITLE_INVALID')) {
        showFieldError(title, titleError, rendererErrorMessage(error, '请修正书名。'));
      } else if (hasErrorCode(error, 'INTERNAL_NUMBER_INVALID') || hasErrorCode(error, 'INTERNAL_NUMBER_CONFLICT')) {
        showFieldError(internalNumber, numberError, rendererErrorMessage(error, '请修正内部编号。'));
      } else {
        setStatus(rendererErrorMessage(error, '无法准备图书创建复核。'), 'error');
      }
    }
  });
  const actions = element('div', 'button-row');
  actions.append(review, button('取消', 'quiet', () => void initializeStartup()));
  form.append(titleLabel, title, titleError, numberLabel, internalNumber, numberError, actions);
  content.append(form);
  replaceScreen('book-create', content);
  queueMicrotask(() => title.focus());
}

async function renderDataAndStorage(): Promise<void> {
  setStatus('正在读取本机数据位置…', 'busy');
  try {
    const projection = await window.ai7.getProductDataLocation();
    const content = panel();
    content.classList.add('data-storage-summary');
    content.dataset['platform'] = projection.platform;
    content.dataset['runtimeForm'] = projection.runtimeForm;
    content.dataset['footprintComplete'] = String(projection.footprint.complete);
    content.dataset['footprintMaximumEntries'] = String(projection.footprint.maximumEntries);
    content.append(
      element('p', 'section-label', '设置 · 数据与存储'),
      element('h2', undefined, '数据与存储摘要'),
      element('p', 'lede', '这里显示当前运行实例实际使用的本机产品数据位置。查看位置不会更改存储、导出内容或授予文件系统权限。'),
    );
    const summary = element('section', 'source-card');
    const values = element('dl');
    // The one value this screen exists to state (V2-UX-LAYER-001: what the surface is about) — an editor
    // came here to read where their data lives. Demoting it would put the answer behind a disclosure on
    // the screen whose whole purpose is to give it, so it reads at full rank, not as technical identity.
    const root = element('dd', undefined, projection.canonicalRoot);
    root.dataset['productDataRoot'] = projection.canonicalRoot;
    values.append(
      element('dt', undefined, '当前平台'), element('dd', undefined, projection.platformLabel),
      element('dt', undefined, '运行方式'), element('dd', undefined, projection.runtimeFormLabel),
      element('dt', undefined, '数据保存在'), element('dd', undefined, projection.locationLabel),
      element('dt', undefined, '实际位置'), root,
      element('dt', undefined, '本机占用'), element('dd', undefined, projection.footprint.label),
    );
    summary.append(element('h3', undefined, '产品数据位置'), values);
    const credentials = element('section', 'review-section');
    credentials.append(
      element('h3', undefined, '凭据与产品数据分开'),
      element('p', undefined, projection.separationLabel),
      element('p', 'field-note', `当前系统保护位置：${projection.protectedSecretStoreLabel}。复制产品数据不会复制模型服务凭据。`),
    );
    const reveal = button('查看数据位置', 'secondary', async () => {
      reveal.disabled = true;
      try {
        const result = await window.ai7.revealProductDataLocation();
        content.dataset['revealRequested'] = result.state;
        content.dataset['nativeRevealSuppressedForE2e'] = String(result.nativeRevealSuppressedForE2e);
        setStatus('已请求系统显示当前产品数据位置。', 'success');
      } catch (error) {
        setStatus(rendererErrorMessage(error, '系统无法显示当前产品数据位置。'), 'error');
      } finally {
        reveal.disabled = false;
      }
    });
    reveal.dataset['action'] = 'reveal-product-data-location';
    const actions = element('div', 'button-row');
    actions.append(reveal, button('返回', 'quiet', () => void initializeStartup()));
    content.append(summary, credentials, actions);
    replaceScreen('data-storage', content);
    setStatus('数据与存储摘要已打开');
  } catch (error) {
    setStatus(rendererErrorMessage(error, '无法读取本机数据位置。'), 'error');
  }
}

function renderModelServiceSettingsProjection(projection: ModelServiceSettingsProjection): void {
  const content = panel();
  content.classList.add('model-service-settings');
  content.dataset['policyIntegrity'] = projection.launchPolicy.integrityState;
  content.dataset['providerTransmissionCount'] = String(
    projection.launchPolicy.providerProcessing.authorizedLiveTransmissionCount,
  );
  content.append(
    element('p', 'section-label', '设置 · 模型服务'),
    element('h2', undefined, '模型服务'),
    element('p', 'lede', '先按编辑工作所需角色查看状态；提供方、模型与凭据绑定属于下一层配置。'),
  );
  const roles = element('section', 'model-role-grid');
  roles.setAttribute('aria-label', '模型角色连接状态');
  for (const role of projection.roles) {
    const card = element('article', 'model-role-card');
    card.dataset['modelRole'] = role.roleId;
    card.dataset['modelRoleStatus'] = role.status;
    const heading = element('div', 'model-role-heading');
    const title = element('h3', undefined, role.roleLabel);
    const status = element('span', `status-pill model-status-${role.status}`, role.statusLabel);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-label', `${role.roleLabel}：${role.statusLabel}`);
    heading.append(title, status);
    card.append(heading, element('p', 'field-note', role.purposeLabel), element('p', undefined, role.statusDetail));
    if (role.binding !== null) {
      const details = element('details', 'model-binding-details');
      const summary = element('summary', undefined, '提供方与模型绑定');
      const values = element('dl');
      values.append(
        element('dt', undefined, '提供方'), element('dd', undefined, role.binding.providerLabel),
        element('dt', undefined, '模型'), element('dd', undefined, role.binding.modelLabel),
        element('dt', undefined, '适配器修订'), element('dd', undefined, String(role.binding.adapterRevision)),
        element('dt', undefined, '配置修订'), element('dd', undefined, String(role.binding.configurationRevision)),
        element('dt', undefined, '已批准备用链'), element('dd', undefined, '无'),
      );
      details.append(summary, values);
      card.append(details);
      const form = element('form', 'model-credential-form');
      const connectionNameId = 'main-editorial-connection-name';
      const credentialId = 'main-editorial-credential';
      const credentialHelpId = 'main-editorial-credential-help';
      const nameLabel = element('label', undefined, '连接名称');
      nameLabel.htmlFor = connectionNameId;
      const connectionName = element('input');
      connectionName.id = connectionNameId;
      connectionName.name = 'connection-name';
      connectionName.type = 'text';
      connectionName.maxLength = 80;
      connectionName.required = true;
      connectionName.autocomplete = 'off';
      connectionName.value = role.connection?.connectionName ?? '';
      const credentialLabel = element('label', undefined, role.connection === null ? 'API 凭据' : '重新输入 API 凭据');
      credentialLabel.htmlFor = credentialId;
      const credential = element('input');
      credential.id = credentialId;
      credential.name = 'credential';
      credential.type = 'password';
      credential.required = true;
      credential.autocomplete = 'off';
      credential.setAttribute('aria-describedby', credentialHelpId);
      const help = element(
        'p',
        'field-note',
        '凭据只发送到本机主进程并写入操作系统安全凭据库；保存后不会显示、复制或导出。',
      );
      help.id = credentialHelpId;
      const save = button(role.connection === null ? '保护并保存' : '重新输入', 'primary', () => undefined);
      save.type = 'submit';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        const pending = window.ai7.saveModelServiceCredential({
          connectionName: connectionName.value,
          secret: credential.value,
        });
        credential.value = '';
        setStatus('正在写入操作系统安全凭据库…', 'busy');
        try {
          renderModelServiceSettingsProjection(await pending);
          setStatus('连接名称与凭据保护状态已更新', 'success');
        } catch (error) {
          save.disabled = false;
          setStatus(rendererErrorMessage(error, '无法更新模型服务凭据。'), 'error');
        }
      });
      form.append(nameLabel, connectionName, credentialLabel, credential, help, save);
      card.append(form);
      if (role.connection !== null) {
        const stored = element('p', 'success-note', `连接名称：${role.connection.connectionName} · 凭据值不再显示`);
        stored.dataset['credentialState'] = role.connection.credentialOperationState;
        const remove = button('移除', 'secondary', async () => {
          remove.disabled = true;
          setStatus('正在从操作系统安全凭据库移除凭据…', 'busy');
          try {
            renderModelServiceSettingsProjection(await window.ai7.removeModelServiceCredential());
            setStatus('凭据已移除；连接保留为需设置状态', 'success');
          } catch (error) {
            remove.disabled = false;
            setStatus(rendererErrorMessage(error, '无法移除模型服务凭据。'), 'error');
          }
        });
        remove.dataset['action'] = 'remove-model-service-credential';
        card.append(stored, remove);
      }
    }
    roles.append(card);
  }
  const policy = element('section', 'review-section model-policy-summary');
  const policyIntegrity = element(
    'p',
    projection.launchPolicy.integrityState === 'verified' ? 'success-note' : 'attention-note',
    projection.launchPolicy.integrityState === 'verified'
      ? launchPolicyIntegritySentence(projection.launchPolicy.providerProcessing.label)
      : '策略完整性：验证未通过。Provider Processing 保持拒绝，不会进行模型传输。',
  );
  policyIntegrity.dataset['policyIntegrityState'] = projection.launchPolicy.integrityState;
  policy.append(
    element('h3', undefined, '当前策略边界'),
    policyIntegrity,
    element('p', undefined, projection.launchPolicy.providerProcessing.label),
    element('p', undefined, projection.launchPolicy.externalExport.label),
    element('p', undefined, projection.launchPolicy.publicReleasePermission.label),
    element('p', 'attention-note', projection.authorityStatement),
  );
  const protectedStore = element(
    'p',
    'field-note',
    `安全凭据库：${projection.protectedSecretStore.label} · ${projection.protectedSecretStore.availability === 'available' ? '可用' : '不可用'}。未启用文件或命令行替代存储。`,
  );
  const actions = element('div', 'button-row');
  actions.append(button('返回', 'quiet', () => void initializeStartup()));
  content.append(roles, policy, protectedStore, actions);
  replaceScreen('model-service', content);
}

async function renderModelServiceSettings(): Promise<void> {
  setStatus('正在读取模型服务状态…', 'busy');
  try {
    renderModelServiceSettingsProjection(await window.ai7.getModelServiceSettings());
    setStatus('模型服务设置已打开');
  } catch (error) {
    setStatus(rendererErrorMessage(error, '无法读取模型服务设置。'), 'error');
  }
}

function renderLanding(
  priorWork: ReadonlyArray<PriorWorkItemProjection>,
  recoveryReturn: RecoveryReturnContext | undefined,
  books: BookSummaryPageProjection,
): void {
  const recoveryWork = priorWork.find((item) => item.recoveryAttention !== null);
  const recoveryAttention = recoveryWork?.recoveryAttention;
  const inferredRecoveryReturn = recoveryWork && recoveryAttention
    ? {
        attentionId: recoveryAttention.attentionId,
        attentionVersion: recoveryAttention.attentionVersion,
        bookTitle: recoveryWork.bookTitle,
      } satisfies RecoveryReturnContext
    : undefined;
  const activeRecoveryReturn = recoveryReturn ?? inferredRecoveryReturn;
  const content = panel();
  content.classList.add('hero');
  const copy = element('div');
  copy.append(
    element('p', 'section-label', '图书与稿件'),
    element('h2', undefined, '开始工作'),
    element('p', 'lede', '可以先创建空图书，也可以从本地 DOCX 开始一次导入。两项操作彼此独立。'),
  );
  const createBook = button('新建图书', 'secondary', renderBookCreationForm);
  const importButton = button('导入稿件', 'primary', async () => {
    importButton.disabled = true;
    setStatus('正在本地解析 DOCX…', 'busy');
    try {
      const result = await window.ai7.selectAndStageManuscript();
      if (result.status === 'cancelled') {
        importButton.disabled = false;
        setStatus('已取消文件选择');
        return;
      }
      setStatus('DOCX 已完成本地暂存', 'success');
      renderTargetChoice(result.staged, null, undefined, activeRecoveryReturn);
    } catch (error) {
      renderError(error, () => renderLanding(priorWork, activeRecoveryReturn, books));
    }
  });
  const dataAndStorage = button('数据与存储', 'secondary', () => renderDataAndStorage());
  dataAndStorage.dataset['settingsRoute'] = 'data-storage';
  const modelService = button('模型服务', 'secondary', () => renderModelServiceSettings());
  modelService.dataset['settingsRoute'] = 'model-service';
  const landingActions = element('div', 'button-row');
  landingActions.append(importButton, createBook, dataAndStorage, modelService);
  copy.append(landingActions);
  const note = element('aside', 'hero-note', '所有导入都要求先明确选择图书目标；系统不会自动选择已有图书或稿件关系。');
  content.append(copy, note);
  if (books.items.length > 0) {
    const library = element('section', 'recent-work');
    library.append(element('p', 'section-label', '图书'), element('h3', undefined, '图书工作概览'));
    const list = element('div', 'recent-work-list');
    for (const summary of books.items) {
      const open = button(`${summary.title} · ${summary.manuscriptStateLabel}`, 'secondary', async () => {
        open.disabled = true;
        setStatus('正在打开精确图书工作台…', 'busy');
        try {
          await requestBookWorkbenchRoute({ kind: 'book', bookId: summary.bookId }, undefined, activeRecoveryReturn);
        } catch (error) {
          open.disabled = false;
          setStatus(rendererErrorMessage(error, '无法打开精确图书工作台。'), 'error');
        }
      });
      open.dataset['bookId'] = summary.bookId;
      const row = element('article', 'book-summary-item');
      row.append(
        open,
        element(
          'p',
          'field-note',
          `${summary.internalNumber === null ? '' : `内部编号 ${summary.internalNumber} · `}图书 ID ${summary.bookId} · 稳定标识 ${summary.stableIdentity}`,
        ),
      );
      list.append(row);
    }
    library.append(list);
    if (books.nextCursor) {
      const loadMore = button('加载更多图书', 'secondary', async () => {
        loadMore.disabled = true;
        setStatus('正在读取下一页图书摘要…', 'busy');
        try {
          const page = await window.ai7.listBooks({ after: books.nextCursor });
          renderLanding(
            priorWork,
            activeRecoveryReturn,
            { items: [...books.items, ...page.items], nextCursor: page.nextCursor },
          );
          setStatus('已加载更多图书摘要', 'success');
        } catch (error) {
          loadMore.disabled = false;
          setStatus(rendererErrorMessage(error, '无法读取下一页图书摘要。'), 'error');
        }
      });
      const loadMoreActions = element('div', 'button-row');
      loadMoreActions.append(loadMore);
      library.append(loadMoreActions);
    }
    content.append(library);
  }
  if (priorWork.length > 0) {
    const recent = element('section', 'recent-work');
    recent.append(element('p', 'section-label', '继续已有工作'), element('h3', undefined, '最近稿件'));
    const list = element('div', 'recent-work-list');
    for (const item of priorWork) {
      const open = button(
        item.recoveryAttention
          ? `${item.bookTitle} · 恢复待确认状态`
          : `${item.bookTitle} · ${item.revisionLabel}`,
        'secondary', async () => {
        open.disabled = true;
        setStatus(item.recoveryAttention ? '正在打开稿件恢复比较…' : '正在重新打开本地稿件…', 'busy');
        try {
          if (item.recoveryAttention) {
            await returnToRecoveryComparison(item.recoveryAttention.attentionId);
            return;
          }
          // The startup return takes the Book route like 书库 does, rather than opening this
          // manuscript at its start: V2-UX-RET-002 asks both ways in to arrive at the same place, the
          // position the editor left, and one route is what keeps them from drifting apart.
          await requestBookWorkbenchRoute({ kind: 'book', bookId: item.bookId }, undefined, activeRecoveryReturn);
        } catch (error) {
          open.disabled = false;
          setStatus(rendererErrorMessage(error, '无法重新打开稿件。'), 'error');
        }
      });
      open.dataset['manuscriptId'] = item.manuscriptId;
      const row = element('article', 'recent-work-item');
      row.append(
        open,
        ...(item.recoveryAttention ? [element('p', 'attention-note', '该分支已稍后处理，普通编辑保持只读；请返回恢复比较作出决定。')] : []),
        element(
          'p',
          'field-note',
          `${item.totalCharacters.toLocaleString('zh-CN')} 字符 · 修订日志 ${item.journalSequence}${
            item.latestMilestone ? ` · 最近里程碑 ${item.latestMilestone.label}` : ''
          }`,
        ),
      );
      list.append(row);
    }
    recent.append(list);
    content.append(recent);
  }
  appendRecoveryReturnAction(content, activeRecoveryReturn);
  replaceScreen('landing', content);
  setStatus('准备就绪');
}

type ImportRelationshipChoice = 'first-manuscript' | 'source-only' | 'reimport';
type ReimportLineageChoice = 'unconfirmed' | string;

function renderTargetChoice(
  staged: StagedImportProjection,
  selectedChoiceId: StagedImportProjection['targetChoices'][number]['id'] | null,
  recoveryNotice?: string,
  recoveryReturn?: RecoveryReturnContext,
  relationshipSelection: ImportRelationshipChoice | null = null,
  reuseSourceVersionId: string | null | undefined = undefined,
  reimportLineageChoice: ReimportLineageChoice | undefined = undefined,
): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '步骤 1 / 3'),
    element('h2', undefined, '选择本地文件导入目标'),
    element('p', 'lede', '系统不会替你选择图书目标、导入关系或同图书来源版本复用。'),
    sourceCard(staged),
  );
  if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));
  if (staged.identityFindings.length > 0) content.append(identityFindingDisclosure(staged.identityFindings));
  const choices = element('fieldset');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', '本地文件导入目标');
  choices.dataset['importTargetChoices'] = 'unselected-by-default';
  choices.append(element('legend', undefined, '图书目标（默认不选择）'));
  for (const targetChoice of staged.targetChoices) {
    const choice = element('label', 'choice');
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'import-target';
    radio.value = targetChoice.id;
    radio.dataset['importTargetChoice'] = targetChoice.kind;
    if (targetChoice.kind === 'existing-book') radio.dataset['bookId'] = targetChoice.bookId;
    radio.setAttribute('aria-label', targetChoice.label);
    radio.checked = selectedChoiceId === targetChoice.id;
    const copy = element('span');
    copy.append(element('strong', undefined, targetChoice.label));
    if (targetChoice.kind === 'new-book') {
      copy.append(element('small', undefined, '选择后仍须另行选择“首份稿件”或“来源材料”关系。'));
    } else {
      copy.append(element(
        'small',
        undefined,
        `${targetChoice.internalNumber ? `内部编号 ${targetChoice.internalNumber} · ` : ''}${
          targetChoice.manuscriptState === 'empty' ? '尚无稿件' : '已有主稿件；仍可导入来源材料'
        }`,
      ));
    }
    choice.append(radio, copy);
    choices.append(choice);
    radio.addEventListener('change', () =>
      renderTargetChoice(staged, targetChoice.id, recoveryNotice, recoveryReturn));
  }
  content.append(choices);
  if (selectedChoiceId === null && staged.nextBookCursor) {
    const moreTargets = button('加载更多图书目标', 'secondary', async () => {
      moreTargets.disabled = true;
      setStatus('正在读取下一页图书目标…', 'busy');
      try {
        const page = await window.ai7.listBooks({ after: staged.nextBookCursor });
        const knownBookIds = new Set(staged.targetChoices.flatMap((choice) =>
          choice.kind === 'existing-book' ? [choice.bookId] : []));
        const additional = page.items.filter((book) => !knownBookIds.has(book.bookId)).map((book) => ({
          kind: 'existing-book' as const,
          id: `existing-book:${book.bookId}`,
          bookId: book.bookId,
          label: `${book.title} · ${book.internalNumber === null ? '' : `内部编号 ${book.internalNumber} · `}图书 ID ${book.bookId}`,
          internalNumber: book.internalNumber,
          manuscriptState: book.manuscriptState,
          reimportLineageSourceVersionIds: book.reimportLineageSourceVersionIds,
          reimportLineagePageAfter: null,
          reimportLineagePreviousCursor: null,
          reimportLineageNextCursor: book.reimportLineageNextCursor,
          selected: false as const,
        }));
        renderTargetChoice(
          { ...staged, targetChoices: [...staged.targetChoices, ...additional], nextBookCursor: page.nextCursor },
          null,
          recoveryNotice,
          recoveryReturn,
        );
        setStatus('已加载更多图书目标', 'success');
      } catch (error) {
        moreTargets.disabled = false;
        setStatus(rendererErrorMessage(error, '无法读取下一页图书目标。'), 'error');
      }
    });
    const moreTargetActions = element('div', 'button-row');
    moreTargetActions.append(moreTargets);
    content.append(moreTargetActions);
  }
  const selectedChoice = selectedChoiceId === null
    ? undefined
    : staged.targetChoices.find((choice) => choice.id === selectedChoiceId);
  if (selectedChoiceId !== null && !selectedChoice) throw new Error('AI7_IMPORT_TARGET_INVALID');

  const cancelImport = button('取消导入', 'quiet', () =>
    abandonAndContinue({ draftId: staged.draftId, draftVersion: staged.draftVersion }, recoveryReturn),
  );
  let revealedControl: HTMLElement | undefined;
  if (selectedChoice) {
    // A format the product cannot read as an editable Manuscript states why, right above the one
    // relationship it can still offer (ADR 0072 §2, V2-UX-IMP-006).
    if (!staged.editableImport.available) {
      content.append(element('p', 'attention-note', staged.editableImport.reason));
    }
    const relationship = element('fieldset');
    relationship.setAttribute('role', 'radiogroup');
    relationship.setAttribute('aria-label', '本地文件与所选图书的关系');
    relationship.dataset['importRelationshipChoices'] = 'unselected-by-default';
    relationship.append(element('legend', undefined, '导入关系（默认不选择）'));
    const allowedRelationships: ReadonlyArray<ImportRelationshipChoice> = !staged.editableImport.available
      ? ['source-only']
      : selectedChoice.kind === 'existing-book' && selectedChoice.manuscriptState === 'populated'
        ? ['source-only', 'reimport']
        : ['first-manuscript', 'source-only'];
    for (const relationshipKind of allowedRelationships) {
      const relationshipChoice = element('label', 'choice');
      const radio = element('input');
      radio.type = 'radio';
      radio.name = 'import-relationship';
      radio.value = relationshipKind;
      radio.dataset['importRelationship'] = relationshipKind;
      radio.checked = relationshipSelection === relationshipKind;
      const copy = element('span');
      if (relationshipKind === 'first-manuscript') {
        radio.setAttribute('aria-label', '作为首份稿件导入');
        copy.append(
          element('strong', undefined, '作为首份稿件导入'),
          element('small', undefined, '创建主稿件、r1、稿件导入记录与工作流程实例。'),
        );
      } else if (relationshipKind === 'source-only') {
        radio.setAttribute('aria-label', '作为来源材料导入');
        copy.append(
          element('strong', undefined, '作为来源材料导入'),
          element('small', undefined, '只形成图书拥有的来源版本、来源记录与来源导入记录；不创建或改变稿件。'),
        );
      } else {
        radio.setAttribute('aria-label', '重新导入主稿件');
        copy.append(
          element('strong', undefined, '重新导入主稿件'),
          element('small', undefined, '先明确来源关系并复核逐块比较；没有已确认来源关系时仍可继续保守的两方比较。'),
        );
      }
      relationshipChoice.append(radio, copy);
      relationship.append(relationshipChoice);
      radio.addEventListener('change', () =>
        renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, relationshipKind));
      if (!revealedControl) revealedControl = radio;
    }
    content.append(relationship);
  }

  if (selectedChoice?.kind === 'new-book' && relationshipSelection !== null) {
    const form = element('section', 'form-row');
    form.dataset['importTitleForRelationship'] = relationshipSelection;
    const label = element('label', undefined, '书名');
    label.htmlFor = 'book-title';
    const title = element('input');
    title.id = 'book-title';
    title.name = 'book-title';
    title.maxLength = 180;
    title.required = true;
    title.value = staged.titleSuggestion.value;
    const note = element('span', 'field-note', `建议来源：${staged.titleSuggestion.sourceLabel}。这是可编辑建议，不会自动创建图书。`);
    const confirm = button('确认书名并复核', 'primary', async () => {
      const confirmedTitle = title.value.normalize('NFC').replace(/\s+/g, ' ').trim();
      if (!confirmedTitle || confirmedTitle.length > 180) {
        setStatus('请输入 1–180 个字符的书名。', 'error');
        title.focus();
        return;
      }
      confirm.disabled = true;
      title.disabled = true;
      setStatus('正在准备导入前复核…', 'busy');
      try {
        if (relationshipSelection === 'source-only') {
          const review = await window.ai7.prepareSourceImportReview({
            draftId: staged.draftId,
            expectedDraftVersion: staged.draftVersion,
            target: {
              kind: 'new-book',
              choiceId: selectedChoice.id,
              confirmedTitle,
              relationship: 'source-only',
            },
          });
          renderSourceImportReview(review, recoveryNotice, recoveryReturn);
        } else {
          const review = await window.ai7.prepareNewBookReview({
            draftId: staged.draftId,
            expectedDraftVersion: staged.draftVersion,
            target: { kind: 'new-book', choiceId: selectedChoice.id, confirmedTitle },
            acceptDegradation: false,
          });
          renderReview(review, recoveryNotice, recoveryReturn);
        }
        setStatus('导入前复核已准备', 'success');
      } catch (error) {
        renderError(error, () => void initializeStartup());
      }
    });
    const actions = element('div', 'button-row');
    actions.append(confirm, cancelImport);
    form.append(label, title, note);
    if (relationshipSelection === 'first-manuscript') {
      form.append(...fidelitySection(staged.fidelity, staged.source.conversion));
    }
    form.append(actions);
    content.append(form);
    revealedControl = title;
  } else if (selectedChoice?.kind === 'existing-book' && relationshipSelection === 'first-manuscript') {
    if (selectedChoice.manuscriptState !== 'empty') throw new Error('AI7_IMPORT_RELATIONSHIP_INVALID');
    content.append(...fidelitySection(staged.fidelity, staged.source.conversion));
    const actions = element('div', 'button-row');
    const confirm = button('复核导入到所选图书', 'primary', async () => {
      confirm.disabled = true;
      setStatus('正在重新校验所选图书并准备导入前复核…', 'busy');
      try {
        const review = await window.ai7.prepareNewBookReview({
          draftId: staged.draftId,
          expectedDraftVersion: staged.draftVersion,
          target: { kind: 'existing-book', bookId: selectedChoice.bookId, relationship: 'first-manuscript' },
          acceptDegradation: false,
        });
        renderReview(review, recoveryNotice, recoveryReturn);
        setStatus('导入前复核已准备', 'success');
      } catch (error) {
        confirm.disabled = false;
        setStatus(rendererErrorMessage(error, '无法复核所选图书。'), 'error');
      }
    });
    actions.append(confirm, cancelImport);
    content.append(actions);
    revealedControl = confirm;
  } else if (selectedChoice?.kind === 'existing-book' && relationshipSelection === 'source-only') {
    const sameBookMatches = [...new Set(staged.identityFindings
      .filter((finding) => finding.bookId === selectedChoice.bookId && finding.identityClass.kind === 'immutable-original')
      .map((finding) => finding.sourceVersionId))];
    if (sameBookMatches.length > 0) {
      const reuseChoices = element('fieldset');
      reuseChoices.setAttribute('role', 'radiogroup');
      reuseChoices.setAttribute('aria-label', '同图书精确来源版本复用');
      reuseChoices.dataset['sourceVersionReuseChoices'] = 'unselected-by-default';
      reuseChoices.append(element('legend', undefined, '同图书精确来源版本（必须明确选择复用）'));
      for (const sourceVersionId of sameBookMatches) {
        const reuseChoice = element('label', 'choice');
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'source-version-reuse';
        radio.value = sourceVersionId;
        radio.dataset['reuseSourceVersionId'] = sourceVersionId;
        radio.checked = reuseSourceVersionId === sourceVersionId;
        radio.setAttribute('aria-label', `复用来源版本 ${sourceVersionId}`);
        const copy = element('span');
        copy.append(
          element('strong', undefined, '复用这个同图书精确来源版本'),
          element('small', 'technical-identity', sourceVersionId),
        );
        reuseChoice.append(radio, copy);
        reuseChoices.append(reuseChoice);
        radio.addEventListener('change', () =>
          renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, 'source-only', sourceVersionId));
        if (reuseSourceVersionId === undefined) revealedControl = radio;
      }
      content.append(reuseChoices);
    }
    const actions = element('div', 'button-row');
    if (sameBookMatches.length === 0 || reuseSourceVersionId !== undefined) {
      const confirm = button('复核来源材料导入', 'primary', async () => {
        confirm.disabled = true;
        setStatus('正在重新校验图书与来源身份并准备复核…', 'busy');
        try {
          const review = await window.ai7.prepareSourceImportReview({
            draftId: staged.draftId,
            expectedDraftVersion: staged.draftVersion,
            target: {
              kind: 'existing-book',
              bookId: selectedChoice.bookId,
              relationship: 'source-only',
              reuseSourceVersionId: reuseSourceVersionId ?? null,
            },
          });
          renderSourceImportReview(review, recoveryNotice, recoveryReturn);
          setStatus('来源材料导入前复核已准备', 'success');
        } catch (error) {
          confirm.disabled = false;
          setStatus(rendererErrorMessage(error, '无法复核来源材料导入。'), 'error');
        }
      });
      confirm.dataset['prepareSourceImportReview'] = selectedChoice.bookId;
      actions.append(confirm);
      revealedControl = confirm;
    }
    actions.append(cancelImport);
    content.append(actions);
  } else if (selectedChoice?.kind === 'existing-book' && relationshipSelection === 'reimport') {
    if (selectedChoice.manuscriptState !== 'populated') throw new Error('AI7_IMPORT_RELATIONSHIP_INVALID');
    const exactSameBookSources = [...new Set(staged.identityFindings
      .filter((finding) => finding.bookId === selectedChoice.bookId &&
        finding.identityClass.kind === 'immutable-original')
      .map((finding) => finding.sourceVersionId))];
    const verifiedLineageSources = selectedChoice.reimportLineageSourceVersionIds;

    const lineageChoices = element('fieldset');
    lineageChoices.setAttribute('role', 'radiogroup');
    lineageChoices.setAttribute('aria-label', '稿件重新导入来源关系');
    lineageChoices.dataset['reimportLineageChoices'] = 'unselected-by-default';
    lineageChoices.append(element('legend', undefined, '来源关系（必须明确选择）'));
    const addLineageChoice = (value: ReimportLineageChoice, title: string, note: string): void => {
      const choice = element('label', 'choice');
      const radio = element('input');
      radio.type = 'radio';
      radio.name = 'reimport-lineage';
      radio.value = value;
      radio.dataset['reimportLineage'] = value === 'unconfirmed' ? 'unconfirmed' : 'verified-source-version';
      if (value !== 'unconfirmed') radio.dataset['sourceVersionId'] = value;
      radio.checked = reimportLineageChoice === value;
      radio.setAttribute('aria-label', title);
      const copy = element('span');
      copy.append(element('strong', undefined, title), element('small', undefined, note));
      choice.append(radio, copy);
      lineageChoices.append(choice);
      radio.addEventListener('change', () =>
        renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, 'reimport',
          reuseSourceVersionId, value));
      if (reimportLineageChoice === undefined) revealedControl = radio;
    };
    addLineageChoice('unconfirmed', '来源关系未确认', '继续保守的两方比较；这不会被解释为来源确认或阻断导入。');
    for (const sourceVersionId of verifiedLineageSources) {
      addLineageChoice(sourceVersionId, `确认来源版本 ${sourceVersionId}`, '使用该图书拥有且已关联主稿件结果修订版的精确来源，执行三方比较。');
    }
    const loadLineagePage = async (after: string | null, control: HTMLButtonElement): Promise<void> => {
      control.disabled = true;
      setStatus('正在读取来源关系版本页…', 'busy');
      try {
        const page = await window.ai7.getReimportLineageSourceVersionPage({
          bookId: selectedChoice.bookId,
          after,
        });
        const pageItems = [...page.items];
        if (reimportLineageChoice !== undefined && reimportLineageChoice !== 'unconfirmed' &&
          !pageItems.includes(reimportLineageChoice)) pageItems.push(reimportLineageChoice);
        const targetChoices = staged.targetChoices.map((choice) =>
          choice.kind !== 'existing-book' || choice.id !== selectedChoice.id
          ? choice
          : {
              ...choice,
              reimportLineageSourceVersionIds: pageItems,
              reimportLineagePageAfter: page.after,
              reimportLineagePreviousCursor: page.previousCursor,
              reimportLineageNextCursor: page.nextCursor,
            });
        renderTargetChoice(
          { ...staged, targetChoices }, selectedChoice.id, recoveryNotice, recoveryReturn,
          'reimport', reuseSourceVersionId, reimportLineageChoice,
        );
        setStatus('来源关系版本页已替换', 'success');
      } catch (error) {
        control.disabled = false;
        setStatus(rendererErrorMessage(error, '无法读取来源关系版本页。'), 'error');
      }
    };
    if (selectedChoice.reimportLineagePageAfter !== null) {
      const previousLineage = button('上一页来源关系版本', 'quiet', () =>
        void loadLineagePage(selectedChoice.reimportLineagePreviousCursor, previousLineage));
      previousLineage.dataset['previousReimportLineage'] = selectedChoice.reimportLineagePreviousCursor ?? 'first';
      lineageChoices.append(previousLineage);
    }
    if (selectedChoice.reimportLineageNextCursor !== null) {
      const moreLineage = button('下一页来源关系版本', 'quiet', () =>
        void loadLineagePage(selectedChoice.reimportLineageNextCursor, moreLineage));
      moreLineage.dataset['loadMoreReimportLineage'] = selectedChoice.reimportLineageNextCursor;
      lineageChoices.append(moreLineage);
    }
    content.append(lineageChoices);

    const sourceChoices = element('fieldset');
    sourceChoices.setAttribute('role', 'radiogroup');
    sourceChoices.setAttribute('aria-label', '稿件重新导入来源版本结果');
    sourceChoices.dataset['reimportSourceVersionChoices'] = 'unselected-by-default';
    sourceChoices.append(element('legend', undefined, '来源版本结果（必须另行明确选择）'));
    const sourceChoice = element('label', 'choice');
    const sourceRadio = element('input');
    sourceRadio.type = 'radio';
    sourceRadio.name = 'reimport-source-version';
    const exactSourceVersionId = exactSameBookSources.length === 1 ? exactSameBookSources[0]! : null;
    if (exactSourceVersionId) {
      sourceRadio.value = exactSourceVersionId;
      sourceRadio.dataset['reuseSourceVersionId'] = exactSourceVersionId;
      sourceRadio.checked = reuseSourceVersionId === exactSourceVersionId;
      sourceRadio.setAttribute('aria-label', `复用来源版本 ${exactSourceVersionId}`);
    } else {
      sourceRadio.value = 'create-new';
      sourceRadio.dataset['createSourceVersion'] = 'true';
      sourceRadio.checked = reuseSourceVersionId === null;
      sourceRadio.setAttribute('aria-label', '创建新的图书来源版本');
    }
    const sourceCopy = element('span');
    sourceCopy.append(
      element('strong', undefined, exactSourceVersionId ? '复用这个同图书精确来源版本' : '创建新的图书来源版本'),
      element('small', 'technical-identity', exactSourceVersionId ?? staged.source.sourceSha256),
    );
    sourceChoice.append(sourceRadio, sourceCopy);
    sourceChoices.append(sourceChoice);
    sourceRadio.addEventListener('change', () =>
      renderTargetChoice(staged, selectedChoice.id, recoveryNotice, recoveryReturn, 'reimport',
        exactSourceVersionId, reimportLineageChoice));
    if (reuseSourceVersionId === undefined && reimportLineageChoice !== undefined) revealedControl = sourceRadio;
    content.append(sourceChoices);

    const actions = element('div', 'button-row');
    if (reimportLineageChoice !== undefined && reuseSourceVersionId !== undefined) {
      let activePreparationJob: ServiceJobProjection | null = null;
      const cancelPreparation = button('取消当前操作', 'secondary', async () => {
        if (activePreparationJob === null) return;
        cancelPreparation.disabled = true;
        try {
          activePreparationJob = await window.ai7.cancelServiceJob({ jobId: activePreparationJob.jobId });
          setStatus(activePreparationJob.progress.label, 'success');
        } catch (error) {
          setStatus(rendererErrorMessage(error, '无法取消重新导入比较准备。'), 'error');
        }
      });
      cancelPreparation.dataset['cancelReimportPreparation'] = 'true';
      cancelPreparation.hidden = true;
      const prepare = button('准备稿件重新导入比较', 'primary', async () => {
        prepare.disabled = true;
        setStatus('正在建立安全固定点并准备逐块比较…', 'busy');
        try {
          activePreparationJob = await window.ai7.prepareManuscriptReimport({
            draftId: staged.draftId,
            expectedDraftVersion: staged.draftVersion,
            target: {
              kind: 'existing-book',
              bookId: selectedChoice.bookId,
              relationship: 'reimport',
              lineage: reimportLineageChoice === 'unconfirmed'
                ? { kind: 'unconfirmed' }
                : { kind: 'verified-source-version', sourceVersionId: reimportLineageChoice },
              reuseSourceVersionId,
            },
          });
          cancelPreparation.dataset['jobProgressCompleted'] = String(activePreparationJob.progress.completed);
          cancelPreparation.dataset['jobProgressTotal'] = String(activePreparationJob.progress.total);
          cancelPreparation.hidden = false;
          cancelPreparation.disabled = false;
          const completed = await awaitServiceJob(activePreparationJob, (job) => {
            activePreparationJob = job;
            cancelPreparation.dataset['jobProgressCompleted'] = String(job.progress.completed);
            cancelPreparation.dataset['jobProgressTotal'] = String(job.progress.total);
            const progress = `${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}`;
            setStatus(`${job.progress.label} ${progress}`, job.state === 'failed' ? 'error' : 'busy');
          });
          if (completed.state === 'cancelled') {
            activePreparationJob = null;
            cancelPreparation.hidden = true;
            prepare.disabled = false;
            setStatus('重新导入比较准备已取消；暂存草稿未变化。', 'success');
            return;
          }
          if (completed.kind !== 'reimport-preparation') {
            throw new Error('重新导入比较任务未返回复核结果。');
          }
          const review = completed.result;
          if (review === null || !('draftId' in review)) throw new Error('重新导入比较任务未返回复核结果。');
          renderManuscriptReimportReview(review, recoveryNotice, recoveryReturn);
          setStatus('稿件重新导入比较已准备', 'success');
        } catch (error) {
          activePreparationJob = null;
          cancelPreparation.hidden = true;
          prepare.disabled = false;
          setStatus(rendererErrorMessage(error, '无法准备稿件重新导入比较。'), 'error');
        }
      });
      prepare.dataset['prepareManuscriptReimport'] = selectedChoice.bookId;
      actions.append(prepare, cancelPreparation);
      revealedControl = prepare;
    }
    actions.append(cancelImport);
    content.append(actions);
  } else {
    const actions = element('div', 'button-row');
    actions.append(cancelImport);
    content.append(actions);
  }

  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen(selectedChoiceId === null ? 'target' : relationshipSelection === null ? 'relationship' : 'title', content);
  queueMicrotask(() => {
    revealedControl?.focus();
    if (!selectedChoice) setStatus('请选择精确图书目标。');
    else if (relationshipSelection === null) setStatus('图书目标已选择；请另行选择导入关系。');
    else if (relationshipSelection === 'source-only' && reuseSourceVersionId === undefined &&
      selectedChoice.kind === 'existing-book' && staged.identityFindings.some((finding) =>
        finding.bookId === selectedChoice.bookId && finding.identityClass.kind === 'immutable-original')) {
      setStatus('发现同图书精确来源版本；必须明确选择复用。');
    } else if (selectedChoice.kind === 'existing-book') {
      setStatus(
        relationshipSelection === 'first-manuscript'
          ? `已选择“作为首份稿件导入”；可以复核目标图书 ${selectedChoice.bookId}。`
          : relationshipSelection === 'source-only'
            ? `已选择“作为来源材料导入”；可以复核目标图书 ${selectedChoice.bookId}。`
            : reimportLineageChoice === undefined
              ? '已选择“重新导入主稿件”；请明确来源关系。'
              : reuseSourceVersionId === undefined
                ? '来源关系已选择；请另行明确来源版本结果。'
                : `重新导入决定已明确；可以准备目标图书 ${selectedChoice.bookId} 的逐块比较。`,
      );
    }
  });
}

function listSection(title: string, items: ReadonlyArray<string>): HTMLElement {
  const section = element('section', 'review-section');
  section.append(element('h3', undefined, title));
  const list = element('ul');
  for (const item of items) list.append(element('li', undefined, item));
  section.append(list);
  return section;
}

function degradationItems(review: ReviewBeforeImportProjection): HTMLElement {
  const list = element('ul', 'degradation-list');
  for (const item of review.degradationDecision.items) {
    const row = element('li', undefined, `${item.label} · ${item.count} 项`);
    row.dataset['degradationCategory'] = item.categoryKey;
    row.dataset['degradationCount'] = String(item.count);
    list.append(row);
  }
  return list;
}

function renderSourceImportReview(
  review: ReviewBeforeSourceImportProjection,
  recoveryNotice?: string,
  recoveryReturn?: RecoveryReturnContext,
): void {
  const content = panel();
  content.dataset['importReviewKind'] = 'source-only';
  content.append(
    element('p', 'section-label', '步骤 2 / 3 · 来源材料导入前复核'),
    element('h2', undefined, '复核来源材料导入'),
    element('p', 'lede', '本次提交只形成图书拥有的来源材料记录；不会创建或改变稿件及其工作状态。'),
  );
  if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));

  const target = element('section', 'source-card');
  target.dataset['sourceReviewTarget'] = review.target.kind;
  target.dataset['bookId'] = review.target.bookId;
  target.dataset['stableIdentity'] = review.target.stableIdentity;
  const targetValues = element('dl');
  targetValues.append(
    element('dt', undefined, '精确目标'), element('dd', undefined, review.target.label),
    ...(review.target.kind === 'new-book'
      ? [element('dt', undefined, '确认书名'), element('dd', undefined, review.target.confirmedTitle)]
      : [element('dt', undefined, '内部编号'), element('dd', undefined, review.target.internalNumber ?? '未设置')]),
    element('dt', undefined, '导入关系'), element('dd', undefined, review.target.relationshipLabel),
  );
  target.append(element('h3', undefined, '目标与关系'), targetValues, technicalDetails(
    undefined,
    element('dt', undefined, '目标图书 ID'), element('dd', 'technical-identity', review.target.bookId),
    element('dt', undefined, '目标稳定标识'), element('dd', 'technical-identity', review.target.stableIdentity),
  ));
  content.append(target);
  if (review.identityFindings.length > 0) {
    content.append(identityFindingDisclosure(review.identityFindings, review.target.label));
  }

  const boundary = element('section', 'review-section');
  boundary.dataset['sourceRetainedBoundary'] = review.retainedBoundary.kind;
  const boundaryValues = element('dl');
  // Each pinned value now carries its own attribute rather than being found by position in the `<dl>`,
  // because the three digests move into the disclosure and a positional lookup would silently follow
  // the wrong row.
  const retainedBytes = element('dd', undefined, String(review.retainedBoundary.sourceBytes));
  retainedBytes.setAttribute('data-source-bytes', '');
  const retainedDigest = element('dd', 'technical-identity', review.retainedBoundary.sourceSha256);
  retainedDigest.setAttribute('data-source-sha256', '');
  boundaryValues.append(
    element('dt', undefined, '保留边界'), element('dd', undefined, review.retainedBoundary.label),
    element('dt', undefined, '文件名'), element('dd', undefined, review.retainedBoundary.displayName),
    element('dt', undefined, '格式'), element('dd', undefined, review.retainedBoundary.format),
    element('dt', undefined, '来源字节数'), retainedBytes,
  );
  // A retained original the product never parsed has no content or structure identity, so those two
  // rows are absent rather than empty: the surface claims only what was actually derived.
  const parsedDigestRows: HTMLElement[] = [];
  if (review.retainedBoundary.contentDigest !== null && review.retainedBoundary.structureDigest !== null) {
    const contentDigest = element('dd', 'technical-identity', review.retainedBoundary.contentDigest);
    contentDigest.setAttribute('data-content-digest', '');
    const structureDigest = element('dd', 'technical-identity', review.retainedBoundary.structureDigest);
    structureDigest.setAttribute('data-structure-digest', '');
    parsedDigestRows.push(
      element('dt', undefined, '内容摘要'), contentDigest,
      element('dt', undefined, '结构摘要'), structureDigest,
    );
  }
  boundary.append(element('h3', undefined, '完整本地文件与内容边界'), boundaryValues, technicalDetails(
    undefined,
    element('dt', undefined, '来源 SHA-256'), retainedDigest,
    ...parsedDigestRows,
  ));

  const provenance = element('section', 'review-section');
  provenance.dataset['sourceReviewProvenance'] = review.provenance.acquisitionPath;
  const provenanceValues = element('dl');
  // This sub-surface holds no other technical row, so the exact instant rides inside the decision row
  // rather than justifying a disclosure of its own; `data-acquired-at` keeps the unmodified ISO instant.
  const acquiredAt = instantValue(review.provenance.acquiredAt);
  acquiredAt.setAttribute('data-acquired-at', review.provenance.acquiredAt);
  provenanceValues.append(
    element('dt', undefined, '取得方式'), element('dd', undefined, review.provenance.label),
    element('dt', undefined, '处理范围'), element('dd', undefined, review.provenance.locality === 'local-provider-free' ? '本地 · 未调用 Provider' : review.provenance.locality),
    element('dt', undefined, '取得时间'), acquiredAt,
  );
  provenance.append(element('h3', undefined, '来源记录'), provenanceValues);

  const sourceResult = element('section', 'review-section');
  sourceResult.dataset['sourceVersionDisposition'] = review.sourceVersionResult.disposition;
  const sourceResultValues = element('dl');
  sourceResultValues.append(
    element('dt', undefined, '结果'), element('dd', undefined, review.sourceVersionResult.label),
  );
  sourceResult.append(element('h3', undefined, '图书拥有的来源版本'), sourceResultValues, technicalDetails(
    undefined,
    element('dt', undefined, '来源版本 ID'),
    element('dd', 'technical-identity', review.sourceVersionResult.sourceVersionId ?? '提交时在所选图书内创建'),
  ));
  content.append(boundary, provenance, sourceResult);

  const dimensions = element('section', 'review-section');
  dimensions.append(
    element('h3', undefined, '图书编辑维度集 · 8 项'),
    element(
      'p',
      'field-note',
      `${review.editorialDimensionSet.createdWithBook ? '随新图书创建' : '保留现有集合'} · ${review.editorialDimensionSet.name} · 版本 ${review.editorialDimensionSet.profileVersion} · ${review.editorialDimensionSet.weightSemantics}`,
    ),
  );
  const dimensionList = element('ul', 'dimension-list');
  for (const dimension of review.editorialDimensionSet.dimensions) {
    dimensionList.append(element('li', undefined, `${dimension.label} · 中性起始权重 ${dimension.weight}`));
  }
  dimensions.append(dimensionList);
  const grid = element('div', 'review-grid');
  grid.append(dimensions, listSection('将创建的记录', review.recordsToCreate), listSection('明确不会发生', review.namedNonEffects));
  content.append(grid);

  const commitBar = element('section', 'commit-bar');
  const explanation = element('div');
  explanation.append(
    element('strong', undefined, '一次提交，不能部分创建'),
    element('div', 'field-note', '来源版本结果、当前取得的来源记录与文件专属来源导入记录会原子关联。'),
  );
  const commitButton = button(
    review.target.kind === 'new-book' ? '新建图书并导入来源材料' : '导入来源材料到所选图书',
    'primary',
    async () => {
      commitButton.disabled = true;
      setStatus('正在原子提交来源材料记录…', 'busy');
      try {
        const result = await window.ai7.commitSourceImport({
          draftId: review.draftId,
          expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest,
          commitAttemptId: review.commitAttemptId,
        });
        setStatus(result.completionLabel, 'success');
        renderImported(result, recoveryReturn);
      } catch (error) {
        if (
          hasErrorCode(error, 'IMPORT_COMMIT_OUTCOME_UNCERTAIN') ||
          hasErrorCode(error, 'REVIEW_CHANGED') ||
          hasErrorCode(error, 'SNAPSHOT_RESELECTION_REQUIRED') ||
          hasErrorCode(error, 'DRAFT_VERSION_CHANGED')
        ) {
          await initializeStartup();
          return;
        }
        commitButton.disabled = false;
        setStatus(rendererErrorMessage(error, '来源材料导入未完成，请重试。'), 'error');
      }
    },
  );
  commitButton.dataset['commitSourceImport'] = review.target.bookId;
  const actions = element('div', 'button-row compact-actions');
  actions.append(
    commitButton,
    button('取消导入', 'quiet', () =>
      abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn)),
  );
  commitBar.append(explanation, actions);
  content.append(commitBar);
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen('review', content);
}

function renderManuscriptReimportReview(
  review: ReviewBeforeManuscriptReimportProjection,
  recoveryNotice?: string,
  recoveryReturn?: RecoveryReturnContext,
  mappingAfter: number | null = null,
): void {
  const content = panel();
  content.dataset['importReviewKind'] = 'reimport';
  content.dataset['reimportLineageStatus'] = review.lineage.status;
  content.dataset['reimportDraftId'] = review.draftId;
  content.dataset['reimportComparisonKind'] = review.lineage.comparisonKind;
  content.dataset['reimportCommitReady'] = String(review.commitReady);
  content.dataset['reimportDraftVersion'] = String(review.draftVersion);
  content.dataset['reimportReviewDigest'] = review.reviewDigest;
  content.dataset['reimportCommitAttemptId'] = review.commitAttemptId ?? '';
  content.append(
    element('p', 'section-label', '步骤 2 / 3 · 稿件重新导入复核'),
    element('h2', undefined, '逐块复核稿件重新导入'),
    element('p', 'lede', review.lineage.status === 'verified'
      ? '已由所选图书拥有的精确来源版本建立三方比较。'
      : '来源关系未确认；本次使用保守的两方比较，但不会阻断重新导入。'),
  );
  if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));

  const target = element('section', 'source-card');
  const values = element('dl');
  values.append(
    element('dt', undefined, '目标图书'), element('dd', undefined, review.target.label),
    element('dt', undefined, '导入关系'), element('dd', undefined, review.target.relationshipLabel),
    element('dt', undefined, '安全固定点'), element('dd', undefined, `${review.checkpoint.revisionLabel} · 修订日志 ${review.checkpoint.journalSequence}`),
    element('dt', undefined, '固定点来源'), element('dd', undefined,
      review.checkpoint.createdForDirtyJournal ? '已为未固定修订日志创建专用安全固定点' : '当前稿件已经位于持久固定点'),
    element('dt', undefined, '来源关系'), element('dd', undefined, review.lineage.label),
    element('dt', undefined, '比较方式'), element('dd', undefined,
      review.lineage.comparisonKind === 'three-way' ? '三方比较' : '两方比较'),
    element('dt', undefined, '来源版本结果'), element('dd', undefined, review.sourceVersionResult.label),
    element('dt', undefined, '暂存文件名'), element('dd', undefined, review.source.displayName),
    element('dt', undefined, '暂存格式'), element('dd', undefined, review.source.format),
    element('dt', undefined, '暂存来源字节数'), element('dd', undefined, String(review.source.sourceBytes)),
    element('dt', undefined, '暂存来源范围'), element('dd', undefined, review.source.provenanceLabel),
  );
  target.dataset['reimportSourceSha256'] = review.source.sourceSha256;
  target.dataset['reimportSourceBytes'] = String(review.source.sourceBytes);
  target.append(element('h3', undefined, '目标、固定点与来源关系'), values, technicalDetails(
    undefined,
    element('dt', undefined, '主稿件 ID'), element('dd', 'technical-identity', review.target.manuscriptId),
    element('dt', undefined, '稿件分支 ID'), element('dd', 'technical-identity', review.target.branchId),
    element('dt', undefined, '当前固定点修订版 ID'), element('dd', 'technical-identity', review.checkpoint.revisionId),
    element('dt', undefined, '当前固定点修订版摘要'), element('dd', 'technical-identity', review.checkpoint.revisionDigest),
    ...(review.lineage.status === 'verified'
      ? [
          element('dt', undefined, '来源关系版本 ID'),
          element('dd', 'technical-identity', review.lineage.sourceVersionId),
          element('dt', undefined, '来源关系修订版 ID'),
          element('dd', 'technical-identity', review.lineage.revisionId),
        ]
      : []),
    element('dt', undefined, '暂存来源 SHA-256'), element('dd', 'technical-identity', review.source.sourceSha256),
  ));
  content.append(target);

  const summary = element('section', 'review-section');
  summary.dataset['comparisonDigest'] = review.comparison.comparisonDigest;
  summary.append(
    element('h3', undefined, '比较摘要'),
    element('p', undefined, `${review.comparison.resultPreviewLabel} · ${review.comparison.totalMappings} 个位置 · ${review.comparison.unresolvedMappings} 个未解决`),
    element('p', 'field-note', review.comparison.changed
      ? '每个变化位置都必须明确接受暂存内容；系统不执行模糊匹配或自动合并。'
      : '当前主稿件与暂存稿件逐块完全一致；提交只记录“未发现稿件变化”，不会创建空修订版。'),
  );
  content.append(summary);

  const fidelity = element('section', 'review-section');
  fidelity.append(element('h3', undefined, '重新导入保真审阅 · 8 类'));
  const fidelityList = element('ul', 'degradation-list');
  for (const category of review.fidelity) {
    fidelityList.append(element('li', undefined,
      `${category.label} · ${category.statusLabel} · ${category.count} 项 · ${category.detail}`));
  }
  fidelity.append(fidelityList);
  if (review.degradationDecision.state === 'required-unselected') {
    fidelity.append(element('p', 'attention-note', '必须明确接受完整降级集合后才能提交本次重新导入。'));
    const accept = button('明确接受完整降级集合', 'secondary', async () => {
      accept.disabled = true;
      setStatus('正在持久化重新导入降级接受…', 'busy');
      try {
        const refreshed = await window.ai7.acceptReimportDegradation({
          draftId: review.draftId,
          expectedDraftVersion: review.draftVersion,
        });
        renderManuscriptReimportReview(refreshed, recoveryNotice, recoveryReturn, mappingAfter);
        setStatus('完整降级集合已明确接受', 'success');
      } catch (error) {
        accept.disabled = false;
        setStatus(rendererErrorMessage(error, '无法接受重新导入降级集合。'), 'error');
      }
    });
    accept.dataset['acceptReimportDegradation'] = review.draftId;
    fidelity.append(accept);
  } else if (review.degradationDecision.state === 'accepted-complete-set') {
    fidelity.append(element('p', 'success-note', '已明确接受完整降级集合'));
  } else {
    fidelity.append(element('p', 'success-note', '未发现需要接受的降级'));
  }
  content.append(fidelity);

  const mappingsHost = element('section', 'review-section');
  mappingsHost.dataset['reimportMappings'] = 'loading';
  mappingsHost.append(element('h3', undefined, '逐块映射'), element('p', 'field-note', '正在读取持久比较事实…'));
  content.append(mappingsHost);
  void Promise.resolve().then(async () => {
    try {
      const page = await window.ai7.getReimportMappingPage({
        draftId: review.draftId,
        expectedDraftVersion: review.draftVersion,
        after: mappingAfter,
      });
      if (!mappingsHost.isConnected) return;
      const list = element('div', 'comparison-list');
      const resolve = async (
        mappingId: string,
        resolution: 'preserve-current-identity' | 'create-new-identity' | 'retire-current-identity',
        currentBlockId: string | null,
        control: HTMLButtonElement,
      ) => {
        control.disabled = true;
        try {
          const initial = await window.ai7.resolveReimportMapping({
            draftId: review.draftId,
            expectedDraftVersion: review.draftVersion,
            mappingId,
            resolution,
            currentBlockId,
          });
          const cancelResolution = button('取消当前操作', 'quiet', async () => {
            cancelResolution.disabled = true;
            await window.ai7.cancelServiceJob({ jobId: initial.jobId });
          });
          cancelResolution.dataset['cancelReimportResolution'] = initial.jobId;
          cancelResolution.dataset['jobProgressCompleted'] = String(initial.progress.completed);
          cancelResolution.dataset['jobProgressTotal'] = String(initial.progress.total);
          control.after(cancelResolution);
          const completed = await awaitServiceJob(initial, (job) => {
            cancelResolution.dataset['jobProgressCompleted'] = String(job.progress.completed);
            cancelResolution.dataset['jobProgressTotal'] = String(job.progress.total);
            const progress = `${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}`;
            setStatus(`${job.progress.label} ${progress}`, job.state === 'failed' ? 'error' : 'busy');
          });
          if (completed.state === 'cancelled') {
            cancelResolution.remove();
            control.disabled = false;
            setStatus('结构身份解决已取消；复核权威未变化。', 'success');
            return;
          }
          if (completed.kind !== 'reimport-resolution') {
            throw new Error('结构身份解决任务未返回复核结果。');
          }
          const refreshed = completed.result;
          if (refreshed === null || !('draftId' in refreshed)) throw new Error('结构身份解决任务未返回复核结果。');
          cancelResolution.remove();
          renderManuscriptReimportReview(refreshed, recoveryNotice, recoveryReturn, mappingAfter);
          setStatus('结构身份后果已持久化；复核摘要已更新', 'success');
        } catch (error) {
          if (hasErrorCode(error, 'DRAFT_VERSION_CHANGED') || hasErrorCode(error, 'REVIEW_CHANGED')) {
            await initializeStartup();
            return;
          }
          control.disabled = false;
          setStatus(rendererErrorMessage(error, '无法持久化结构身份后果。'), 'error');
        }
      };
      for (const mapping of page.items) {
        const row = element('article', 'comparison-item');
        row.dataset['reimportMappingId'] = mapping.mappingId;
        row.dataset['reimportChangeKind'] = mapping.changeKind;
        row.dataset['reimportMappingState'] = mapping.state;
        row.dataset['currentBlockId'] = mapping.currentBlockId ?? '';
        row.dataset['stagedBlockId'] = mapping.stagedBlockId ?? '';
        row.dataset['resolvedCurrentBlockId'] = mapping.resolvedCurrentBlockId ?? '';
        row.dataset['currentText'] = mapping.currentText ?? '';
        row.dataset['stagedText'] = mapping.stagedText ?? '';
        row.append(
          element('strong', undefined, `位置 ${mapping.position} · ${mapping.changeKind}`),
          element('p', 'field-note', `当前：${mapping.currentText ?? '—'}`),
          ...(review.lineage.status === 'verified'
            ? [element('p', 'field-note', `来源基线：${mapping.lineageText ?? '—'}`)]
            : []),
          element('p', 'field-note', `暂存：${mapping.stagedText ?? '—'}`),
        );
        if (mapping.state === 'unresolved') {
          if (mapping.changeKind === 'delete') {
            const retire = button('退役当前结构身份', 'secondary', async () => {
              setStatus(`正在记录位置 ${mapping.position} 的退役后果…`, 'busy');
              await resolve(mapping.mappingId, 'retire-current-identity', null, retire);
            });
            retire.dataset['resolveReimportMapping'] = mapping.mappingId;
            retire.dataset['identityResolution'] = 'retire-current-identity';
            row.append(retire);
          } else {
            const create = button('创建新的结构身份', 'secondary', async () => {
              setStatus(`正在记录位置 ${mapping.position} 的新身份后果…`, 'busy');
              await resolve(mapping.mappingId, 'create-new-identity', null, create);
            });
            create.dataset['resolveReimportMapping'] = mapping.mappingId;
            create.dataset['identityResolution'] = 'create-new-identity';
            const candidatesHost = element('div', 'comparison-list');
            const showCandidates = async (candidateAfter: number | null): Promise<void> => {
              const candidates = await window.ai7.getReimportIdentityCandidatePage({
                draftId: review.draftId,
                expectedDraftVersion: review.draftVersion,
                mappingId: mapping.mappingId,
                after: candidateAfter,
              });
              const candidateItems = element('div', 'comparison-list');
              for (const candidate of candidates.items) {
                const preserve = button(`保留当前身份 · 位置 ${candidate.position}`, 'quiet', async () => {
                  setStatus(`正在把当前结构身份绑定到位置 ${mapping.position}…`, 'busy');
                  await resolve(mapping.mappingId, 'preserve-current-identity', candidate.currentBlockId, preserve);
                });
                preserve.dataset['resolveReimportMapping'] = mapping.mappingId;
                preserve.dataset['identityResolution'] = 'preserve-current-identity';
                preserve.dataset['currentBlockId'] = candidate.currentBlockId;
                candidateItems.append(element('p', 'field-note', candidate.text), preserve);
              }
              const navigation = element('div', 'button-row compact-actions');
              if (candidateAfter !== null) {
                navigation.append(element('span', 'field-note', '候选使用向前分页；重新打开可从第一页开始。'));
              }
              if (candidates.nextCursor !== null) {
                navigation.append(button('下一页候选', 'quiet', () => void showCandidates(candidates.nextCursor)));
              }
              candidatesHost.replaceChildren(candidateItems, navigation);
            };
            const choose = button('选择要保留的当前结构身份', 'quiet', () => void showCandidates(null));
            row.append(create, choose, candidatesHost);
          }
        } else {
          row.append(element('p', 'success-note', mapping.identityConsequence === 'preserve-current-identity'
            ? '已明确保留当前结构身份'
            : mapping.identityConsequence === 'create-new-identity'
              ? '已明确创建新的结构身份'
              : '已明确退役当前结构身份'));
        }
        list.append(row);
      }
      const navigation = element('div', 'button-row compact-actions');
      if (page.previousCursor !== null || mappingAfter !== null) {
        const previous = button('上一页', 'quiet', () =>
          renderManuscriptReimportReview(review, recoveryNotice, recoveryReturn, page.previousCursor));
        previous.dataset['reimportPreviousPage'] = String(page.previousCursor ?? 0);
        navigation.append(previous);
      }
      if (page.nextCursor !== null) {
        const next = button('下一页', 'quiet', () =>
          renderManuscriptReimportReview(review, recoveryNotice, recoveryReturn, page.nextCursor));
        next.dataset['reimportNextPage'] = String(page.nextCursor);
        navigation.append(next);
      }
      mappingsHost.dataset['reimportMappings'] = 'ready';
      mappingsHost.dataset['reimportPageItemCount'] = String(page.items.length);
      mappingsHost.replaceChildren(element('h3', undefined, '逐块映射'), list, navigation);
    } catch (error) {
      mappingsHost.dataset['reimportMappings'] = 'failed';
      mappingsHost.replaceChildren(
        element('h3', undefined, '逐块映射'),
        element('p', 'attention-note', rendererErrorMessage(error, '无法读取逐块映射。')),
      );
    }
  });

  const grid = element('div', 'review-grid');
  grid.append(listSection('将创建的记录', review.recordsToCreate), listSection('明确不会发生', review.namedNonEffects));
  content.append(grid);
  const actions = element('div', 'button-row compact-actions');
  const abandon = button('取消导入', 'quiet', () =>
    abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn));
  if (review.commitReady) {
    let activeCommitJob: ServiceJobProjection | null = null;
    const cancelCommit = button('取消当前提交', 'secondary', async () => {
      if (activeCommitJob === null) return;
      cancelCommit.disabled = true;
      try {
        activeCommitJob = await window.ai7.cancelServiceJob({ jobId: activeCommitJob.jobId });
        setStatus(activeCommitJob.progress.label, 'success');
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法取消重新导入提交。'), 'error');
      }
    });
    cancelCommit.dataset['cancelReimportCommit'] = 'true';
    cancelCommit.hidden = true;
    const commit = button(review.comparison.changed ? '提交稿件重新导入' : '记录未发现稿件变化', 'primary', async () => {
      commit.disabled = true;
      abandon.disabled = true;
      setStatus('正在有界核对并提交稿件重新导入结果…', 'busy');
      try {
        activeCommitJob = await window.ai7.commitManuscriptReimport({
          draftId: review.draftId,
          expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest,
          commitAttemptId: review.commitAttemptId,
        });
        cancelCommit.dataset['jobProgressCompleted'] = String(activeCommitJob.progress.completed);
        cancelCommit.dataset['jobProgressTotal'] = String(activeCommitJob.progress.total);
        cancelCommit.hidden = false;
        cancelCommit.disabled = false;
        const completed = await awaitServiceJob(activeCommitJob, (job) => {
          activeCommitJob = job;
          cancelCommit.dataset['jobProgressCompleted'] = String(job.progress.completed);
          cancelCommit.dataset['jobProgressTotal'] = String(job.progress.total);
          const progress = `${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}`;
          setStatus(`${job.progress.label} ${progress}`, job.state === 'failed' ? 'error' : 'busy');
        });
        if (completed.state === 'cancelled') {
          activeCommitJob = null;
          cancelCommit.hidden = true;
          commit.disabled = false;
          abandon.disabled = false;
          setStatus('重新导入提交已取消；复核与稿件权威未变化。', 'success');
          return;
        }
        const result = completed.result;
        if (completed.kind !== 'reimport-commit' || result === null || !('reimportRecordId' in result)) {
          throw new Error('重新导入提交任务未返回完成凭据。');
        }
        renderImported(result, recoveryReturn);
        setStatus(result.completionLabel, 'success');
      } catch (error) {
        if (hasErrorCode(error, 'IMPORT_COMMIT_OUTCOME_UNCERTAIN') || hasErrorCode(error, 'REVIEW_CHANGED') ||
          hasErrorCode(error, 'SNAPSHOT_RESELECTION_REQUIRED') || hasErrorCode(error, 'DRAFT_VERSION_CHANGED')) {
          await initializeStartup();
          return;
        }
        commit.disabled = false;
        abandon.disabled = false;
        setStatus(rendererErrorMessage(error, '稿件重新导入未完成。'), 'error');
      }
    });
    commit.dataset['commitManuscriptReimport'] = review.target.bookId;
    actions.append(commit, cancelCommit);
  }
  actions.append(abandon);
  // The sticky `.commit-bar` the other two reviews use, so this review's commit and cancel stay
  // reachable below the fidelity table and the block mappings (V2-UX-LAYER-005). It carries the
  // action row alone: the atomic-commit sentence its siblings show is copy, and this change is
  // position only.
  const commitBar = element('section', 'commit-bar');
  commitBar.append(actions);
  content.append(commitBar);
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen('review', content);
}

function renderReview(
  review: ReviewBeforeImportProjection,
  recoveryNotice?: string,
  recoveryReturn?: RecoveryReturnContext,
): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '步骤 2 / 3 · 导入前复核'),
    element('h2', undefined, '导入前复核'),
    element('p', 'lede', '最后一次确认：下面的记录会在一个事务中一起创建；列出的非影响不会随导入发生。'),
  );
  if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));
  const identity = element('section', 'source-card');
  identity.append(element('h3', undefined, review.target.kind === 'new-book'
    ? `${review.target.label} · ${review.target.confirmedTitle}`
    : `${review.target.label} · ${review.target.relationshipLabel}`));
  const identityDetails = element('dl');
  const sourceBytes = element('dd', undefined, String(review.source.sourceBytes));
  sourceBytes.setAttribute('data-source-bytes', '');
  const sourceDigest = element('dd', 'technical-identity', review.source.sourceSha256);
  sourceDigest.setAttribute('data-source-sha256', '');
  const degraded = review.degradationDecision.state !== 'not-required-clean-import';
  const finalActionLabel = review.target.kind === 'existing-book'
    ? degraded ? '按上述降级方式导入为首份稿件' : '导入为首份稿件'
    : degraded ? '按上述降级方式新建图书并导入稿件' : '新建图书并导入稿件';
  const identityExact: HTMLElement[] = [];
  if (review.target.kind === 'existing-book') {
    const reviewedBookId = element('dd', 'technical-identity', review.target.bookId);
    reviewedBookId.dataset['reviewedBookId'] = review.target.bookId;
    identityDetails.append(
      element('dt', undefined, '目标图书'),
      element('dd', undefined, review.target.label),
      element('dt', undefined, '目标内部编号'),
      element('dd', undefined, review.target.internalNumber ?? '未设置'),
      element('dt', undefined, '稿件关系'),
      element('dd', undefined, review.target.relationshipLabel),
    );
    identityExact.push(
      element('dt', undefined, '目标图书 ID'),
      reviewedBookId,
      element('dt', undefined, '目标稳定标识'),
      element('dd', 'technical-identity', review.target.stableIdentity),
    );
  }
  identityDetails.append(
    element('dt', undefined, '本地来源'),
    element('dd', undefined, review.source.displayName),
    element('dt', undefined, '来源边界'),
    element('dd', undefined, review.source.provenanceLabel),
    element('dt', undefined, '来源字节数'),
    sourceBytes,
    element('dt', undefined, '最终动作'),
    element('dd', undefined, finalActionLabel),
  );
  identityExact.push(element('dt', undefined, '来源 SHA-256'), sourceDigest);
  identity.append(identityDetails, technicalDetails(undefined, ...identityExact));
  content.append(identity);
  if (review.identityFindings.length > 0) {
    content.append(identityFindingDisclosure(review.identityFindings, review.target.label));
  }

  const fidelity = element('section', 'review-section');
  fidelity.append(
    element('h3', undefined, '导入保真审阅 · 8 类'),
    ...fidelitySection(review.fidelity, review.source.conversion),
  );
  content.append(fidelity);

  if (review.degradationDecision.state !== 'not-required-clean-import') {
    const decision = element('section', 'review-section degradation-decision');
    decision.append(
      element('h3', undefined, '导入降级决定'),
      element('p', undefined, '本次接受只适用于当前导入，并覆盖下面由服务端确定的完整降级集合。'),
      degradationItems(review),
    );
    const acceptance = element('label', 'choice degradation-acceptance');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'accept-import-degradation';
    checkbox.checked = review.degradationDecision.state === 'accepted-complete-set';
    checkbox.disabled = review.degradationDecision.state === 'accepted-complete-set';
    const copy = element('span');
    copy.append(
      element('strong', undefined, '接受上述完整降级集合'),
      element('small', undefined, '接受后才会形成复核摘要，并允许一次性创建全部导入记录。'),
    );
    acceptance.append(checkbox, copy);
    decision.append(acceptance);
    if (review.degradationDecision.state === 'required-unselected') {
      checkbox.addEventListener('change', async () => {
        if (!checkbox.checked) return;
        checkbox.disabled = true;
        setStatus('正在记录本次导入的完整降级接受…', 'busy');
        try {
          const acceptedReview = await window.ai7.prepareNewBookReview({
            draftId: review.draftId,
            expectedDraftVersion: review.draftVersion,
            target: review.target.kind === 'new-book'
              ? {
                  kind: 'new-book',
                  choiceId: review.target.choiceId,
                  confirmedTitle: review.target.confirmedTitle,
                }
              : {
                  kind: 'existing-book',
                  bookId: review.target.bookId,
                  relationship: review.target.relationship,
                },
            acceptDegradation: true,
          });
          setStatus('已接受本次导入的完整降级集合', 'success');
          renderReview(acceptedReview, recoveryNotice, recoveryReturn);
        } catch (error) {
          renderError(error, () => void initializeStartup());
        }
      });
    }
    content.append(decision);
  }

  const grid = element('div', 'review-grid');
  const workflow = element('section', 'review-section');
  workflow.append(
    element('h3', undefined, '固定工作流程方案'),
    element('p', undefined, `${review.workflowProfile.name} · 版本 ${review.workflowProfile.version}`),
    element('p', 'field-note', `AI7 投影 ${review.workflowProfile.id}@${review.workflowProfile.version} · ${review.workflowProfile.digest}`),
    element('p', 'field-note', `原生 Profile ${review.workflowProfile.nativeProfile.id}@${review.workflowProfile.nativeProfile.version} · ${review.workflowProfile.nativeProfile.digest}`),
    element('p', 'field-note', '将创建一个同时绑定上述精确 AI7 投影与原生 Profile 的工作流程实例。'),
  );
  const dimensions = element('section', 'review-section');
  dimensions.append(
    element('h3', undefined, '图书编辑维度集 · 8 项'),
    element(
      'p',
      'field-note',
      `${review.editorialDimensionSet.name} · 版本 ${review.editorialDimensionSet.profileVersion} · ${review.editorialDimensionSet.weightSemantics}`,
    ),
  );
  const dimensionList = element('ul', 'dimension-list');
  for (const dimension of review.editorialDimensionSet.dimensions) {
    const item = element('li');
    item.append(
      element('span', undefined, dimension.label),
      element('span', 'neutral-weight', `中性起始权重 ${dimension.weight}`),
    );
    dimensionList.append(item);
  }
  dimensions.append(dimensionList);
  grid.append(workflow, dimensions, listSection('将创建的记录', review.recordsToCreate), listSection('明确不会发生', review.nonEffects));
  content.append(grid);

  if (review.reviewDigest !== null) {
    const commitBar = element('section', 'commit-bar');
    const explanation = element('div');
    const acceptedDegradation = review.degradationDecision.state === 'accepted-complete-set';
    explanation.append(
      element('strong', undefined, '一次提交，不能部分创建'),
      element(
        'div',
        'field-note',
        acceptedDegradation
          ? '已接受的完整降级集合、保真审阅、降级决定和稿件导入记录会原子关联；不提供 DOCX 往返保证。'
          : '本次符合范围的导入不创建导入降级决定，也不提供 DOCX 往返保证。',
      ),
    );
    const commitButton = button(finalActionLabel, 'primary', async () => {
      commitButton.disabled = true;
      setStatus(review.target.kind === 'existing-book' ? '正在原子导入首份稿件…' : '正在原子提交图书与稿件记录…', 'busy');
      try {
        const result = await window.ai7.commitNewBookImport({
          draftId: review.draftId,
          expectedDraftVersion: review.draftVersion,
          reviewDigest: review.reviewDigest!,
          commitAttemptId: review.commitAttemptId,
        });
        setStatus(result.completionLabel, 'success');
        renderImported(result, recoveryReturn);
      } catch (error) {
        if (
          hasErrorCode(error, 'IMPORT_COMMIT_OUTCOME_UNCERTAIN') ||
          hasErrorCode(error, 'REVIEW_CHANGED') ||
          hasErrorCode(error, 'SNAPSHOT_RESELECTION_REQUIRED') ||
          hasErrorCode(error, 'DRAFT_VERSION_CHANGED')
        ) {
          await initializeStartup();
          return;
        }
        commitButton.disabled = false;
        setStatus(rendererErrorMessage(error, '导入未完成，请重试。'), 'error');
      }
    });
    const actions = element('div', 'button-row compact-actions');
    actions.append(
      commitButton,
      button('取消导入', 'quiet', () =>
        abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn),
      ),
    );
    commitBar.append(explanation, actions);
    content.append(commitBar);
  } else {
    const actions = element('div', 'button-row');
    actions.append(
      button('取消导入', 'quiet', () =>
        abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }, recoveryReturn),
      ),
    );
    content.append(actions);
  }
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen('review', content);
}

function renderImported(result: ImportCommitProjection, recoveryReturn?: RecoveryReturnContext): void {
  delete document.documentElement.dataset['ai7ImportCompletionPainted'];
  delete document.documentElement.dataset['ai7ImportCompletionAcknowledged'];
  renderBookOverview(result.overview, result, recoveryReturn);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function awaitServiceJob(
  initial: ServiceJobProjection,
  onProgress: (job: ServiceJobProjection) => void,
): Promise<ServiceJobProjection> {
  let job = initial;
  let previousReimportProgress = initial.progress.completed;
  const requireMonotonicReimportProgress = (next: ServiceJobProjection): void => {
    if (next.kind !== 'reimport-preparation' && next.kind !== 'reimport-resolution' && next.kind !== 'reimport-commit' &&
        next.kind !== 'task-authorization-preparation' && next.kind !== 'baseline-analysis-preparation' &&
        next.kind !== 'review-run-preparation') return;
    if (!Number.isSafeInteger(next.progress.completed) || !Number.isSafeInteger(next.progress.total) ||
      next.progress.completed < previousReimportProgress || next.progress.completed > next.progress.total ||
      next.progress.total <= 0 ||
      (next.state === 'completed' && next.progress.completed !== next.progress.total)) {
      throw new Error('重新导入协作任务进度无效或发生倒退。');
    }
    previousReimportProgress = next.progress.completed;
  };
  requireMonotonicReimportProgress(job);
  onProgress(job);
  while (job.state === 'queued' || job.state === 'running') {
    await delay(25);
    job = await window.ai7.pollServiceJob({ jobId: job.jobId });
    requireMonotonicReimportProgress(job);
    onProgress(job);
  }
  if (job.state === 'failed') {
    const failure = job.failure ?? { code: 'SERVICE_JOB_FAILED', message: '后台业务操作未完成。' };
    throw Object.assign(new Error(failure.message), failure);
  }
  return job;
}

function renderEditorWindow(
  initialWindow: ManuscriptWindowProjection,
  bookTitle: string,
  recoveryAttentionId?: string,
  entryNotice?: string,
  /** 审阅's 回到原文: the mark whose card opens once the window is on screen. */
  openMarkId?: string,
): void {
  const content = panel();
  content.classList.add('editor-shell');
  // The manuscript is now a Book's entry surface, so it says which Book it belongs to exactly as the
  // overview does — a window is identified by the Book it holds, not by the surface it happens to show.
  content.dataset['bookId'] = initialWindow.bookId;
  const toolbar = element('header', 'editor-toolbar');
  const title = element('div');
  title.append(element('p', 'section-label', `${bookTitle} · 主分支`), element('h2', undefined, `稿件修订版 ${initialWindow.revisionLabel}`));
  const meta = element('div', 'editor-meta');
  const position = element('span', undefined, initialWindow.position.label);
  const revision = element('span', undefined, `当前修订版 ${initialWindow.revisionLabel}`);
  const journal = element('span', undefined, `修订日志序号 ${initialWindow.journalSequence}`);
  const recoveredState = element('strong', 'recovered-state-marker', '当前为恢复的工作状态');
  recoveredState.hidden = initialWindow.recoveredStateReview === null;
  meta.append(position, revision, journal, recoveredState);
  title.append(meta);
  const save = button('保存当前编辑', 'primary', () => editor?.flush());
  save.disabled = true;
  save.title = window.ai7.platform === 'darwin' ? '快捷键 Command+S' : '快捷键 Ctrl+S';
  const undo = button('撤销', 'quiet', () => void runHistory('undo'));
  const redo = button('重做', 'quiet', () => void runHistory('redo'));
  const retryAuthoritativeRefreshButton = button('重试权威刷新', 'quiet', () => void retryAuthoritativeRefresh());
  retryAuthoritativeRefreshButton.hidden = true;
  const backToOverview = button('返回图书工作概览', 'secondary', async () => {
    backToOverview.disabled = true;
    setStatus('正在保存并返回图书工作概览…', 'busy');
    try {
      if (!(await settleLocalEdit())) {
        backToOverview.disabled = false;
        return;
      }
      // Leaving the manuscript is the last moment the caret is still where the editor left it, so the
      // position is taken here, and taken before the overview is read, so the 上次位置 the overview
      // states is the one the editor just left rather than the one before it (V2-UX-RET-002).
      await rememberEntryPosition();
      renderBookOverview(await window.ai7.getBookOverview({ bookId: currentWindow.bookId, historyCursor: null }));
    } catch (error) {
      backToOverview.disabled = false;
      setStatus(rendererErrorMessage(error, '无法返回图书工作概览。'), 'error');
    }
  });
  const openAnalysis = button('分析', 'secondary', async () => {
    openAnalysis.disabled = true;
    setStatus('正在保存并打开分析…', 'busy');
    try {
      if (!(await settleLocalEdit())) {
        openAnalysis.disabled = false;
        return;
      }
      // Leaving for 分析 is leaving the manuscript, so the position is taken exactly as it is for 工作概览.
      await rememberEntryPosition();
      renderBookAnalysis(currentWindow.bookId, bookTitle);
    } catch (error) {
      openAnalysis.disabled = false;
      setStatus(rendererErrorMessage(error, '无法打开分析。'), 'error');
    }
  });
  openAnalysis.dataset['recordsDestination'] = 'analysis';
  // Leaving for 审阅 is leaving the manuscript too: local edits are settled and the position is taken
  // first, exactly as for 分析. A Mark Card's 查看任务 leaves the same way, for its Review Run and finding.
  const leaveForReview = async (focus: ReviewFocus | null): Promise<boolean> => {
    setStatus('正在保存并打开审阅…', 'busy');
    try {
      if (!(await settleLocalEdit())) return false;
      await rememberEntryPosition();
      renderBookReview(currentWindow.bookId, bookTitle, focus);
      return true;
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法打开审阅。'), 'error');
      return false;
    }
  };
  const openReview = button(REVIEW_ENTRY_LABEL, 'secondary', async () => {
    openReview.disabled = true;
    if (!(await leaveForReview(null))) openReview.disabled = authoritativeMutationBusy();
  });
  openReview.dataset['workDestination'] = 'review';
  const toolbarActions = element('div', 'button-row');
  if (recoveryAttentionId) {
    toolbarActions.append(button('返回恢复待确认', 'secondary', async () => {
      setStatus('正在返回稿件恢复比较…', 'busy');
      try {
        await returnToRecoveryComparison(recoveryAttentionId);
      } catch (error) {
        setStatus(rendererErrorMessage(error, '无法返回恢复比较。'), 'error');
      }
    }));
  }
  // IA-012's `资料与记录` group, as much of it as this surface owns: 工作概览 is reached from here,
  // which is what makes it a destination rather than the way in. The action keeps its own label so
  // the group names where it leads without renaming what it does.
  const recordsGroup = element('nav', 'book-records-group');
  recordsGroup.setAttribute('aria-label', '资料与记录');
  recordsGroup.append(element('span', 'section-label', '资料与记录'), openAnalysis, backToOverview);
  // IA-006's `工作` group (稿件 / 审阅 / 评估 / 交付物), as much of it as exists: 审阅 (editor-surfaces §4).
  // It is a destination of the Book beside 资料与记录, never a fourth entry on the right edge, whose three
  // entries are 导航 / 分析 / 任务.
  const workGroup = element('nav', 'book-work-group');
  workGroup.setAttribute('aria-label', REVIEW_WORK_GROUP_LABEL);
  workGroup.append(element('span', 'section-label', REVIEW_WORK_GROUP_LABEL), openReview);
  toolbarActions.append(workGroup, recordsGroup, undo, redo, save, retryAuthoritativeRefreshButton);
  toolbar.append(title, toolbarActions);

  const workspace = element('div', 'editor-workspace');
  const navigator = element('aside', 'manuscript-navigator');
  navigator.setAttribute('aria-label', '稿件导航与查找');

  const outlineSection = element('section', 'navigator-section');
  outlineSection.append(element('h3', undefined, '结构导航'));
  const outlineList = element('div', 'outline-list');
  outlineList.setAttribute('role', 'list');
  const previousOutline = button('上一组结构', 'quiet', () => void loadOutline(outlinePage?.previousCursor ?? null));
  const nextOutline = button('下一组结构', 'quiet', () => void loadOutline(outlinePage?.nextCursor ?? null));
  previousOutline.hidden = true;
  nextOutline.hidden = true;
  const outlinePaging = element('div', 'button-row');
  outlinePaging.append(previousOutline, nextOutline);
  outlineSection.append(outlineList, outlinePaging);

  const searchSection = element('section', 'navigator-section search-section');
  searchSection.append(element('h3', undefined, '全稿查找与替换'));
  const searchLabel = element('label', undefined, '查找文字');
  searchLabel.htmlFor = 'manuscript-search';
  const searchInput = element('input');
  searchInput.id = 'manuscript-search';
  searchInput.maxLength = 256;
  const replacementLabel = element('label', undefined, '替换为');
  replacementLabel.htmlFor = 'manuscript-replacement';
  const replacementInput = element('input');
  replacementInput.id = 'manuscript-replacement';
  replacementInput.maxLength = 2048;
  const searchButton = button('查找全稿', 'secondary', () => void runSearch());
  const cancelJob = button('取消当前操作', 'quiet', () => void cancelActiveServiceJob());
  cancelJob.hidden = true;
  const prepareReplacementButton = button('预览替换', 'secondary', () => void prepareReplacement());
  prepareReplacementButton.disabled = true;
  const searchActions = element('div', 'button-row');
  searchActions.append(searchButton, prepareReplacementButton, cancelJob);
  const searchSummary = element('p', 'field-note', '范围：全稿。结果会记录查找时的稿件版本。');
  searchSummary.setAttribute('aria-live', 'polite');
  const exclusionSummary = element(
    'p',
    'field-note replacement-exclusion-summary',
    `最多排除 ${MAX_REPLACEMENT_EXCLUSIONS.toLocaleString('zh-CN')} 处，且至少保留 1 处；当前排除 0 处。`,
  );
  exclusionSummary.id = 'replacement-exclusion-summary';
  exclusionSummary.setAttribute('aria-live', 'polite');
  const searchResults = element('div', 'search-results');
  const resultPaging = element('div', 'button-row');
  const previousResults = button('上一组结果', 'quiet', () => void loadSearchResults(searchPage?.previousCursor ?? null));
  const nextResults = button('下一组结果', 'quiet', () => void loadSearchResults(searchPage?.nextCursor ?? null));
  const returnFromSearch = button('返回查找前位置', 'quiet', () => void returnToSearchPosition());
  previousResults.hidden = true;
  nextResults.hidden = true;
  returnFromSearch.hidden = true;
  resultPaging.append(previousResults, nextResults, returnFromSearch);
  const replacementReview = element('section', 'replacement-review');
  replacementReview.hidden = true;
  searchSection.append(
    searchLabel,
    searchInput,
    replacementLabel,
    replacementInput,
    searchActions,
    searchSummary,
    exclusionSummary,
    searchResults,
    resultPaging,
    replacementReview,
  );

  const milestoneSection = element('details', 'navigator-section milestone-section');
  const milestoneSummary = element('summary', undefined, '保存为里程碑版本');
  const milestoneLabel = element('label', undefined, '里程碑名称');
  milestoneLabel.htmlFor = 'milestone-label';
  const milestoneName = element('input');
  milestoneName.id = 'milestone-label';
  milestoneName.maxLength = 80;
  const purposeLabel = element('label', undefined, '保存目的');
  purposeLabel.htmlFor = 'milestone-purpose';
  const purpose = element('input');
  purpose.id = 'milestone-purpose';
  purpose.maxLength = 120;
  const noteLabel = element('label', undefined, '说明（可选）');
  noteLabel.htmlFor = 'milestone-note';
  const note = element('input');
  note.id = 'milestone-note';
  note.maxLength = 500;
  const milestoneButton = button('保存为里程碑版本', 'secondary', () => void saveMilestone());
  milestoneSection.append(milestoneSummary, milestoneLabel, milestoneName, purposeLabel, purpose, noteLabel, note, milestoneButton);
  navigator.append(outlineSection, searchSection, milestoneSection);
  // The outline and the search are one 导航 panel, opened on demand over the manuscript's right side and
  // closed by default, so the manuscript stays the central object (V2-UX-ED-015).
  navigator.id = 'manuscript-navigation-panel';
  navigator.hidden = true;

  const manuscript = element('main', 'manuscript-surface');
  const editorWindow = element('section', 'editor-window');
  const editorHost = element('div');
  editorWindow.append(editorHost);
  const positionRailLabel = element('label', 'position-rail-label', '全稿位置');
  positionRailLabel.htmlFor = 'manuscript-position';
  const positionRail = element('input', 'position-rail');
  positionRail.id = 'manuscript-position';
  positionRail.type = 'range';
  positionRail.min = '0';
  positionRail.max = '1000000';
  positionRail.step = '1';
  positionRail.value = String(Math.round(initialWindow.position.proportion * 1_000_000));
  const previousWindow = button('向前浏览', 'quiet', () => void navigateCursor('previous'));
  const nextWindow = button('向后浏览', 'quiet', () => void navigateCursor('next'));
  const windowActions = element('nav', 'window-actions');
  windowActions.setAttribute('aria-label', '稿件窗口');
  windowActions.append(previousWindow, nextWindow);
  manuscript.append(editorWindow, windowActions);

  // The right edge (editor-surfaces §1 右缘一列): three entries and the one persistent whole-manuscript
  // control. The rail stays visible while the panel is closed; the pane's own scrollbar shows only
  // while it scrolls, so two scrollbars never stand side by side (V2-UX-ED-059).
  const edge = element('aside', 'editor-edge');
  edge.setAttribute('aria-label', '稿件导航');
  const navigationEntry = button('导航', 'quiet', () => setNavigationOpen(navigator.hidden === true));
  navigationEntry.dataset['edgeEntry'] = 'navigation';
  navigationEntry.setAttribute('aria-controls', navigator.id);
  navigationEntry.setAttribute('aria-expanded', 'false');
  navigationEntry.title = '大纲与全稿查找';
  const analysisEntry = button('分析', 'quiet', () => openAnalysis.click());
  analysisEntry.dataset['edgeEntry'] = 'analysis';
  analysisEntry.title = '打开这本书的分析';
  const tasksEntry = button('任务', 'quiet', () => undefined);
  tasksEntry.dataset['edgeEntry'] = 'tasks';
  tasksEntry.disabled = true;
  tasksEntry.title = '任务面接通后可用';
  const edgeEntries = element('div', 'edge-entries');
  edgeEntries.append(navigationEntry, analysisEntry, tasksEntry);
  const railTrack = element('div', 'rail-track');
  railTrack.append(positionRail);
  const railColumn = element('div', 'rail-column');
  railColumn.append(positionRailLabel, railTrack);
  edge.append(edgeEntries, railColumn);
  workspace.append(manuscript, navigator, edge);

  const setNavigationOpen = (open: boolean): void => {
    navigator.hidden = !open;
    navigationEntry.setAttribute('aria-expanded', open ? 'true' : 'false');
    workspace.dataset['navigation'] = open ? 'open' : 'closed';
  };
  navigator.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    setNavigationOpen(false);
    navigationEntry.focus();
  });
  let scrollingTimer: number | undefined;
  editorWindow.addEventListener('scroll', () => {
    editorWindow.dataset['scrolling'] = 'true';
    if (scrollingTimer !== undefined) window.clearTimeout(scrollingTimer);
    scrollingTimer = window.setTimeout(() => {
      delete editorWindow.dataset['scrolling'];
    }, 900);
  }, { passive: true });

  const identities = element('details', 'editor-identities');
  identities.append(element('summary', undefined, '当前业务绑定'));
  const identityGrid = element('dl', 'identity-grid');
  identityGrid.append(
    element('dt', undefined, '图书'),
    element('dd', undefined, '已绑定'),
    element('dt', undefined, '稿件'),
    element('dd', undefined, '主稿件'),
    element('dt', undefined, '分支'),
    element('dd', undefined, '主分支'),
    element('dt', undefined, '修订版'),
    element('dd', undefined, initialWindow.revisionLabel),
  );
  identities.append(identityGrid);
  content.append(toolbar, workspace, identities);
  replaceScreen('editor', content);
  if (entryNotice !== undefined) showEntryNotice(content, entryNotice);

  let currentWindow = initialWindow;
  let dirty = false;
  let saving = false;
  let retryRequired = false;
  let outlinePage: OutlineProjection | undefined;
  let searchPage: SearchResultsProjection | undefined;
  let replacementPreview: ReplacementPreviewProjection | undefined;
  let activeJob: ServiceJobProjection | undefined;
  let serviceJobStarting = false;
  let cancellationRequestedJobId: string | undefined;
  let cancellationRequest: Promise<ServiceJobProjection> | undefined;
  let searchReturn: { window: ManuscriptWindowProjection; continuity: EditorContinuity } | undefined;
  let edgeNavigation = false;
  let authoritativeMutationStarting = false;
  let authoritativeMutation = false;
  let searchInvalidation: Promise<void> | undefined;
  let searchPresentationStale = false;
  const excludedMatchIds = new Set<string>();

  const serviceJobBusy = (): boolean => serviceJobStarting || activeJob !== undefined;
  const authoritativeMutationBusy = (): boolean => authoritativeMutationStarting || authoritativeMutation;
  const updateExclusionSummary = (): void => {
    exclusionSummary.textContent =
      `最多排除 ${MAX_REPLACEMENT_EXCLUSIONS.toLocaleString('zh-CN')} 处，且至少保留 1 处；当前排除 ${excludedMatchIds.size.toLocaleString('zh-CN')} 处。`;
    exclusionSummary.dataset['excludedCount'] = String(excludedMatchIds.size);
    exclusionSummary.dataset['exclusionLimit'] = String(MAX_REPLACEMENT_EXCLUSIONS);
  };

  const updateServiceControls = (): void => {
    const busy = serviceJobBusy();
    searchButton.disabled = authoritativeMutationBusy() || busy;
    prepareReplacementButton.disabled = authoritativeMutationBusy() || busy || searchPresentationStale ||
      searchPage === undefined || searchPage.totalMatches === 0;
    searchInput.disabled = authoritativeMutationBusy() || busy;
    replacementInput.disabled = authoritativeMutationBusy() || busy;
    cancelJob.hidden = activeJob === undefined || (activeJob.state !== 'queued' && activeJob.state !== 'running');
    cancelJob.disabled = activeJob === undefined || (activeJob.state !== 'queued' && activeJob.state !== 'running');
    cancelJob.dataset['serviceJobId'] = activeJob?.jobId ?? '';
    for (const control of replacementReview.querySelectorAll<HTMLButtonElement>('button[data-replacement-action]')) {
      const dismiss = control.dataset['replacementAction'] === 'dismiss';
      control.disabled = authoritativeMutationBusy() || busy || (searchPresentationStale && !dismiss);
    }
  };

  const updateWindowChrome = (): void => {
    position.textContent = currentWindow.position.label;
    revision.textContent = `当前修订版 ${currentWindow.revisionLabel}`;
    journal.textContent = `修订日志序号 ${currentWindow.journalSequence}`;
    recoveredState.hidden = currentWindow.recoveredStateReview === null;
    positionRail.value = String(Math.round(currentWindow.position.proportion * 1_000_000));
    positionRail.setAttribute('aria-valuetext', `全稿 ${(currentWindow.position.proportion * 100).toFixed(3)}%`);
    manuscriptRail?.setPosition(currentWindow.position.proportion);
    previousWindow.disabled = authoritativeMutationBusy() || currentWindow.previousCursor === null;
    nextWindow.disabled = authoritativeMutationBusy() || currentWindow.nextCursor === null;
  };

  const syncAuthoritativeMutationControls = (): void => {
    const busy = authoritativeMutationBusy();
    editorHost.dataset['authoritativeMutation'] = authoritativeMutation ? 'true' : 'false';
    backToOverview.disabled = busy;
    openAnalysis.disabled = busy;
    openReview.disabled = busy;
    undo.disabled = busy;
    redo.disabled = busy;
    milestoneButton.disabled = busy;
    positionRail.disabled = busy;
    previousOutline.disabled = busy;
    nextOutline.disabled = busy;
    milestoneName.disabled = busy;
    purpose.disabled = busy;
    note.disabled = busy;
    setCloseRisk(busy || dirty || saving || retryRequired);
    updateServiceControls();
    updateWindowChrome();
  };

  const setAuthoritativeMutation = (locked: boolean): void => {
    const previous = authoritativeMutation;
    try {
      editor?.setOperationLocked(locked);
      authoritativeMutation = locked;
      syncAuthoritativeMutationControls();
    } catch (error) {
      authoritativeMutation = previous;
      try {
        editor?.setOperationLocked(previous);
        syncAuthoritativeMutationControls();
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], '稿件权威操作锁无法安全回滚。');
      }
      throw error;
    }
  };

  const publishAuthoritativeMutationStarting = (starting: boolean): void => {
    authoritativeMutationStarting = starting;
    syncAuthoritativeMutationControls();
  };

  async function settleLocalEdit(): Promise<boolean> {
    if (editor?.isComposing()) {
      setStatus('请先完成当前输入法组合。', 'busy');
      return false;
    }
    if (dirty || saving || retryRequired) await editor?.flush();
    return !dirty && !saving && !retryRequired;
  }

  /**
   * Remember where the editor is, so the next entry into this Book comes back here (V2-UX-RET-002).
   * It is taken when the editor arrives at a window and again when it leaves the manuscript — never
   * while typing — so it costs one write per place the editor goes to and none per keystroke, and a
   * product that stops between two of those moments still knows the window the editor was reading.
   *
   * The pair is the editor's own caret in the window projection's vocabulary, so what is read back
   * opens as a `block` target with no translation. A remembered position settles nothing, so a
   * failure to write one is not allowed to take the editor's place away from them: the surface keeps
   * working and the previous position stands.
   *
   * Paging and leaving await it, so the position is durable before the surface says where it arrived
   * and before the overview it leaves for is read — an editor who pages and closes the product in the
   * same breath still comes back to the window they moved to, and the overview never states a position
   * the editor has already moved off. Arriving does not await, because a window just fetched is the
   * position a caller already reached and nothing downstream reads it back.
   */
  async function rememberEntryPosition(): Promise<void> {
    if (!editor || authorityInterrupted) return;
    const point = editor.captureContinuity().anchor;
    // Paging with 向前浏览 / 向后浏览 deliberately leaves the caret where it was, off the window now on
    // screen, so the window's own first block answers for the position rather than a caret the editor
    // can no longer see. Anywhere else the caret is the position.
    const carried = currentWindow.blocks.some((block) => block.blockId === point.blockId);
    const blockId = carried ? point.blockId : currentWindow.blocks[0]?.blockId;
    if (blockId === undefined) return;
    await window.ai7.recordManuscriptEntryPosition({
      manuscriptId: currentWindow.manuscriptId,
      branchId: currentWindow.branchId,
      blockId,
      grapheme: carried ? point.grapheme : 0,
    }).catch(() => undefined);
  }

  type AuthoritativeResult = {
    revisionId: string;
    journalSequence: number;
    workingDigest: string;
    completionLabel: string;
  };

  type AuthoritativeRecovery = {
    target: Parameters<typeof window.ai7.getManuscriptWindowAt>[0]['target'];
    continuity: EditorContinuity;
    expected?: AuthoritativeResult;
    reconcile?: (result: AuthoritativeResult) => Promise<void>;
  };

  let pendingAuthoritativeRecovery: AuthoritativeRecovery | undefined;

  const clearAuthoritativeRecovery = (): void => {
    pendingAuthoritativeRecovery = undefined;
    retryAuthoritativeRefreshButton.hidden = true;
    retryAuthoritativeRefreshButton.disabled = false;
  };

  async function refreshAuthoritativeEditor(
    target: Parameters<typeof window.ai7.getManuscriptWindowAt>[0]['target'],
    continuity: EditorContinuity,
    expected?: AuthoritativeResult,
  ): Promise<void> {
    if (!editor) throw new Error('稿件编辑器不可用。');
    const binding = editor.currentWindow();
    const next = await window.ai7.getManuscriptWindowAt({
      manuscriptId: binding.manuscriptId,
      branchId: binding.branchId,
      target,
    });
    if (expected && (
      next.revisionId !== expected.revisionId || next.journalSequence !== expected.journalSequence ||
      next.workingDigest !== expected.workingDigest
    )) throw new Error('权威写入确认与刷新窗口不一致。');
    if (!editor.loadWindow(next, continuity)) throw new Error('权威窗口已返回，但编辑器未能安全装载。');
    currentWindow = next;
    updateWindowChrome();
  }

  async function runAuthoritativeMutation<T extends AuthoritativeResult>(
    operation: () => Promise<T>,
    reconcile: (result: T) => Promise<void>,
  ): Promise<T | undefined> {
    if (authoritativeMutationBusy() || !editor) return undefined;
    publishAuthoritativeMutationStarting(true);
    if (editor.isComposing()) {
      setStatus('请先完成当前输入法组合。', 'busy');
      publishAuthoritativeMutationStarting(false);
      return undefined;
    }
    let continuity: EditorContinuity | undefined;
    let target: Parameters<typeof window.ai7.getManuscriptWindowAt>[0]['target'] | undefined;
    let result: T | undefined;
    try {
      if (!(await settleLocalEdit())) {
        return undefined;
      }
      continuity = editor.captureContinuity();
      target = { kind: 'window-start', blockId: editor.currentWindow().blocks[0]!.blockId };
      setAuthoritativeMutation(true);
      result = await operation();
      await refreshAuthoritativeEditor(target, continuity, result);
      await reconcile(result);
      clearAuthoritativeRecovery();
      setAuthoritativeMutation(false);
      return result;
    } catch (error) {
      if (!authoritativeMutation || !target || !continuity) {
        if (authoritativeMutation) setAuthoritativeMutation(false);
        setStatus(rendererErrorMessage(error, '待保存编辑未能排空；权威操作未开始。'), 'error');
        return undefined;
      }
      try {
        await refreshAuthoritativeEditor(target, continuity, result);
        if (result) await reconcile(result);
        clearAuthoritativeRecovery();
        setAuthoritativeMutation(false);
        if (result) {
          setStatus(`${result.completionLabel}；编辑器已从刷新中断中恢复。`, 'success');
          return result;
        }
        setStatus(rendererErrorMessage(error, '权威操作未完成；编辑器已恢复到当前持久状态。'), 'error');
      } catch (refreshError) {
        pendingAuthoritativeRecovery = result
          ? { target, continuity, expected: result, reconcile: (value) => reconcile(value as T) }
          : { target, continuity };
        retryAuthoritativeRefreshButton.hidden = false;
        setStatus(
          `无法确认权威操作后的当前窗口；编辑区保持只读且保留可见缓冲区。请重试权威刷新。${refreshError instanceof Error ? refreshError.message : ''}`,
          'error',
        );
      }
      return undefined;
    } finally {
      publishAuthoritativeMutationStarting(false);
      if (!authoritativeMutation && searchStateIsStale()) {
        try {
          await invalidateSearchState('待保存编辑已写入；先前搜索结果、替换预览和查找返回位置已失效。');
        } catch (error) {
          setStatus(rendererErrorMessage(error, '无法取消已失效的替换预览。'), 'error');
        }
      }
    }
  }

  async function retryAuthoritativeRefresh(): Promise<void> {
    const recovery = pendingAuthoritativeRecovery;
    if (!recovery || !authoritativeMutation) return;
    retryAuthoritativeRefreshButton.disabled = true;
    try {
      await refreshAuthoritativeEditor(recovery.target, recovery.continuity, recovery.expected);
      if (recovery.expected && recovery.reconcile) await recovery.reconcile(recovery.expected);
      clearAuthoritativeRecovery();
      setAuthoritativeMutation(false);
      setStatus(
        recovery.expected
          ? `${recovery.expected.completionLabel}；权威窗口刷新已恢复。`
          : '权威操作失败后已恢复到当前持久窗口。',
        recovery.expected ? 'success' : 'error',
      );
    } catch (error) {
      retryAuthoritativeRefreshButton.disabled = false;
      setStatus(`权威窗口仍无法刷新；编辑区继续保持只读，请再次重试。${rendererErrorMessage(error, '')}`, 'error');
    }
  }

  type NavigationRequest = {
    target: Parameters<typeof window.ai7.getManuscriptWindowAt>[0]['target'];
    continuity: EditorContinuity | undefined;
    preserveOffWindowContinuity: boolean;
  };

  async function navigate(
    targetOrPrepare: NavigationRequest['target'] | (() => NavigationRequest | undefined),
    continuity?: EditorContinuity,
    preserveOffWindowContinuity = false,
  ): Promise<boolean> {
    if (authoritativeMutationBusy() || edgeNavigation || !editor) return false;
    edgeNavigation = true;
    // Released by this call alone and only once: a later navigation may already hold the guard again
    // by the time this one returns, and must not have it taken away.
    let guardHeld = true;
    const releaseGuard = (): void => {
      if (!guardHeld) return;
      guardHeld = false;
      edgeNavigation = false;
    };
    try {
      if (!(await settleLocalEdit()) || !editor) return false;
      const navigation = typeof targetOrPrepare === 'function'
        ? targetOrPrepare()
        : { target: targetOrPrepare, continuity, preserveOffWindowContinuity };
      if (!navigation) return false;
      const binding = editor.currentWindow();
      const next = await window.ai7.getManuscriptWindowAt({
        manuscriptId: binding.manuscriptId,
        branchId: binding.branchId,
        target: navigation.target,
      });
      const loaded = navigation.preserveOffWindowContinuity && navigation.continuity
        ? editor.loadNavigationWindow(next, navigation.continuity)
        : editor.loadWindow(next, navigation.continuity);
      if (!loaded) return false;
      currentWindow = next;
      updateWindowChrome();
      // The position write starts the moment the window is on screen, and the status that names the
      // arrival still waits for it — the guard does not. `edgeNavigation` covers the window load and
      // the two frames in which the load's own scroll restoration fires `scroll` events this surface
      // must not read as the editor reaching an edge. Held across the write as well, it made every
      // paging command that arrived while the disk was busy vanish without a word: a second PageDown,
      // 向后浏览 or a scroll to the window's end was dropped rather than deferred (#474).
      const remembered = rememberEntryPosition();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      releaseGuard();
      await remembered;
      // With the guard released a later navigation may already have put its own window on screen; its
      // arrival is then the one to name, and naming this one over it would state a place already left.
      if (currentWindow === next) {
        setStatus(`已到达${next.position.structureLabel ? `“${next.position.structureLabel}”附近，` : ''}${next.position.label}。`, 'success');
      }
      return true;
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法移动到该稿件位置。'), 'error');
      return false;
    } finally {
      releaseGuard();
    }
  }

  async function navigateCursor(direction: 'previous' | 'next'): Promise<void> {
    await navigate(() => {
      if (!editor) return undefined;
      const cursor = direction === 'previous' ? editor.currentWindow().previousCursor : editor.currentWindow().nextCursor;
      if (!cursor) return undefined;
      const continuity = editor.captureNavigationContinuity();
      return { target: { kind: 'cursor', cursor }, continuity, preserveOffWindowContinuity: true };
    });
  }

  async function loadOutline(cursor: string | null, propagateFailure = false): Promise<void> {
    try {
      const binding = editor?.currentWindow() ?? currentWindow;
      const page = await window.ai7.getOutline({ manuscriptId: binding.manuscriptId, branchId: binding.branchId, cursor });
      outlinePage = page;
      outlineList.replaceChildren();
      for (const entry of page.entries) {
        const open = button(`${entry.kind === 'title' ? '标题' : `层级 ${entry.level}`} · ${entry.text}${entry.displayTextTruncated ? '（显示已截断）' : ''}`, 'quiet', () =>
          void navigate({ kind: 'block', blockId: entry.blockId }),
        );
        open.style.setProperty('--outline-depth', String(Math.max(0, entry.level - 1)));
        open.setAttribute('role', 'listitem');
        outlineList.append(open);
      }
      previousOutline.hidden = page.previousCursor === null;
      nextOutline.hidden = page.nextCursor === null;
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法读取稿件结构。'), 'error');
      if (propagateFailure) throw error;
    }
  }

  const showJobProgress = (job: ServiceJobProjection): void => {
    activeJob = job;
    updateServiceControls();
    const progress = job.progress.total > 0 ? ` ${job.progress.completed.toLocaleString('zh-CN')} / ${job.progress.total.toLocaleString('zh-CN')}` : '';
    searchSummary.textContent = `${job.progress.label}${progress}`;
  };

  async function runOwnedServiceJob(start: () => Promise<ServiceJobProjection>): Promise<ServiceJobProjection> {
    if (serviceJobBusy()) throw new Error('已有一项全稿本地操作正在处理；请等待或取消当前操作。');
    serviceJobStarting = true;
    delete cancelJob.dataset['cancellationTargetJobId'];
    updateServiceControls();
    try {
      const initial = await start();
      serviceJobStarting = false;
      activeJob = initial;
      updateServiceControls();
      let completed = await awaitServiceJob(initial, showJobProgress);
      if (cancellationRequestedJobId === initial.jobId && cancellationRequest) {
        completed = await cancellationRequest;
      }
      return completed;
    } finally {
      if (activeJob && cancellationRequestedJobId === activeJob.jobId) {
        cancellationRequestedJobId = undefined;
        cancellationRequest = undefined;
      }
      serviceJobStarting = false;
      activeJob = undefined;
      updateServiceControls();
    }
  }

  async function cancelActiveServiceJob(): Promise<void> {
    const target = activeJob;
    if (!target || (target.state !== 'queued' && target.state !== 'running')) return;
    cancelJob.disabled = true;
    cancelJob.dataset['cancellationTargetJobId'] = target.jobId;
    cancellationRequestedJobId = target.jobId;
    const request = (async (): Promise<ServiceJobProjection> => {
      try {
        return await window.ai7.cancelServiceJob({ jobId: target.jobId });
      } catch (error) {
        const preview = replacementPreview;
        if (target.kind !== 'replacement' || !preview) throw error;
        const dismissal = await window.ai7.dismissReplacementPreview({ previewId: preview.previewId });
        if (dismissal.state !== 'cancelled') throw error;
        return {
          ...target,
          state: 'cancelled',
          result: null,
          failure: null,
          progress: { ...target.progress, label: '替换准备已取消' },
        };
      }
    })();
    cancellationRequest = request;
    try {
      const result = await request;
      if (activeJob?.jobId === target.jobId) showJobProgress(result);
      if (result.state === 'cancelled') {
        setStatus(result.progress.label, 'success');
      } else if (result.state === 'completed') {
        setStatus('本地操作已在取消请求到达前完成；未记录取消。', 'busy');
      } else if (result.state === 'failed') {
        setStatus(result.failure?.message ?? '本地操作已失败，未记录取消。', 'error');
      } else {
        setStatus('取消请求尚未成为终态；当前操作仍在处理。', 'busy');
      }
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法确认当前本地操作的取消状态。'), 'error');
    } finally {
      updateServiceControls();
    }
  }

  const setInclusionControlsLocked = (locked: boolean): void => {
    for (const control of searchResults.querySelectorAll<HTMLInputElement>('.match-inclusion input[type="checkbox"]')) {
      control.disabled = locked;
      control.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    searchResults.dataset['inclusionLocked'] = locked ? 'true' : 'false';
  };

  const clearReplacementPresentation = (): void => {
    replacementPreview = undefined;
    replacementReview.hidden = true;
    replacementReview.replaceChildren();
    setInclusionControlsLocked(false);
    updateServiceControls();
  };

  async function dismissVisibleReplacementPreview(): Promise<void> {
    const preview = replacementPreview;
    if (!preview) return;
    const dismissal = await window.ai7.dismissReplacementPreview({ previewId: preview.previewId });
    if (dismissal.previewId !== preview.previewId || dismissal.state !== 'cancelled') {
      throw new Error('替换预览取消确认无效。');
    }
    if (replacementPreview?.previewId === preview.previewId) clearReplacementPresentation();
  }

  const clearSearchPresentation = (message: string): void => {
    searchPresentationStale = false;
    searchPage = undefined;
    searchReturn = undefined;
    excludedMatchIds.clear();
    updateExclusionSummary();
    clearReplacementPresentation();
    searchResults.replaceChildren();
    previousResults.hidden = true;
    nextResults.hidden = true;
    returnFromSearch.hidden = true;
    searchSummary.textContent = message;
    updateServiceControls();
  };

  async function invalidateSearchState(reason: string, terminalPreviewId?: string): Promise<void> {
    if (searchInvalidation) return searchInvalidation;
    searchPresentationStale = true;
    updateServiceControls();
    const pending = (async () => {
      previousResults.hidden = true;
      nextResults.hidden = true;
      returnFromSearch.hidden = true;
      setInclusionControlsLocked(true);
      searchSummary.textContent = reason;
      const preview = replacementPreview;
      if (preview && preview.previewId !== terminalPreviewId) await dismissVisibleReplacementPreview();
      clearSearchPresentation(reason);
    })();
    searchInvalidation = pending;
    try {
      await pending;
    } finally {
      if (searchInvalidation === pending) searchInvalidation = undefined;
    }
  }

  const searchStateIsStale = (): boolean => {
    if (!editor) return false;
    const persisted = searchPage ?? replacementPreview ?? searchReturn?.window;
    if (!persisted) return false;
    const binding = editor.currentWindow();
    return binding.revisionId !== persisted.revisionId ||
      binding.journalSequence !== persisted.journalSequence || binding.workingDigest !== persisted.workingDigest;
  };

  async function invalidateSearchIfStale(reason: string): Promise<void> {
    if (searchStateIsStale()) await invalidateSearchState(reason);
  }

  async function runSearch(): Promise<void> {
    if (authoritativeMutationBusy() || serviceJobBusy()) return;
    const query = searchInput.value.normalize('NFC');
    if (!query || query.length > 256) {
      setStatus('请输入 1–256 个字符的查找文字。', 'error');
      searchInput.focus();
      return;
    }
    try {
      const completed = await runOwnedServiceJob(async () => {
        await dismissVisibleReplacementPreview();
        clearSearchPresentation('正在开始新的全稿查找…');
        const binding = editor?.currentWindow() ?? currentWindow;
        return window.ai7.startSearch({ manuscriptId: binding.manuscriptId, branchId: binding.branchId, query });
      });
      if (completed.state === 'cancelled') {
        searchSummary.textContent = '查找已取消；当前本地编辑不受影响。';
        return;
      }
      if (completed.kind !== 'search' || !completed.result || !('searchId' in completed.result)) {
        throw new Error('查找结果绑定无效。');
      }
      await loadSearchResults(null, completed.result.searchId);
    } catch (error) {
      setStatus(rendererErrorMessage(error, '全稿查找未完成。'), 'error');
    }
  }

  async function returnToSearchPosition(): Promise<void> {
    if (authoritativeMutationBusy() || !(await settleLocalEdit()) || !editor) return;
    if (!searchReturn) return;
    const binding = editor.currentWindow();
    if (
      binding.revisionId !== searchReturn.window.revisionId ||
      binding.journalSequence !== searchReturn.window.journalSequence ||
      binding.workingDigest !== searchReturn.window.workingDigest
    ) {
      setStatus('稿件已变化；查找前的精确选择与滚动锚点无法按原绑定恢复。', 'error');
      return;
    }
    const restored = await navigate(
      { kind: 'window-start', blockId: searchReturn.window.blocks[0]!.blockId },
      searchReturn.continuity,
    );
    if (restored) setStatus(`已返回查找前的精确选择与滚动位置；${currentWindow.position.label}。`, 'success');
  }

  async function loadSearchResults(cursor: string | null, searchId?: string): Promise<void> {
    const id = searchId ?? searchPage?.searchId;
    if (!id) return;
    const page = await window.ai7.getSearchResults({ searchId: id, cursor });
    const binding = editor?.currentWindow() ?? currentWindow;
    if (
      page.revisionId !== binding.revisionId || page.journalSequence !== binding.journalSequence ||
      page.workingDigest !== binding.workingDigest
    ) throw new Error('搜索结果已绑定到旧稿件状态，请重新查找。');
    searchPage = page;
    searchPresentationStale = false;
    searchResults.replaceChildren();
    searchSummary.textContent = `“${page.query}” · 范围：${page.scopeLabel} · 共 ${page.totalMatches.toLocaleString('zh-CN')} 处`;
    for (const match of page.results) {
      const row = element('article', 'search-result');
      const open = button(match.context, 'quiet', () => void jumpToSearchMatch(match));
      open.setAttribute('aria-label', `${match.headingLabel}：${match.context}`);
      const includeLabel = element('label', 'match-inclusion');
      const include = element('input');
      include.type = 'checkbox';
      include.dataset['matchId'] = match.matchId;
      include.checked = !excludedMatchIds.has(match.matchId);
      include.setAttribute('aria-describedby', exclusionSummary.id);
      include.addEventListener('change', () => {
        if (replacementPreview) {
          include.checked = !excludedMatchIds.has(match.matchId);
          return;
        }
        if (include.checked) {
          excludedMatchIds.delete(match.matchId);
        } else if (excludedMatchIds.size >= MAX_REPLACEMENT_EXCLUSIONS) {
          include.checked = true;
          setStatus(`最多只能排除 ${MAX_REPLACEMENT_EXCLUSIONS.toLocaleString('zh-CN')} 处匹配。`, 'error');
        } else if (searchPage && excludedMatchIds.size + 1 >= searchPage.totalMatches) {
          include.checked = true;
          setStatus('至少保留一处精确匹配用于替换。', 'error');
        } else {
          excludedMatchIds.add(match.matchId);
        }
        updateExclusionSummary();
      });
      includeLabel.append(include, document.createTextNode(' 纳入替换'));
      row.append(element('p', 'field-note', match.headingLabel), open, includeLabel);
      searchResults.append(row);
    }
    previousResults.hidden = page.previousCursor === null;
    nextResults.hidden = page.nextCursor === null;
    setInclusionControlsLocked(replacementPreview !== undefined);
    updateExclusionSummary();
    updateServiceControls();
  }

  async function jumpToSearchMatch(match: SearchResultsProjection['results'][number]): Promise<void> {
    if (authoritativeMutationBusy() || !(await settleLocalEdit()) || !editor) return;
    const binding = editor.currentWindow();
    if (!searchPage || binding.revisionId !== searchPage.revisionId ||
        binding.journalSequence !== searchPage.journalSequence || binding.workingDigest !== searchPage.workingDigest) {
      setStatus('稿件已变化；请重新查找后再跳转到精确范围。', 'error');
      return;
    }
    if (!searchReturn) {
      searchReturn = { window: editor.currentWindow(), continuity: editor.captureContinuity() };
      returnFromSearch.hidden = false;
    }
    await navigate({ kind: 'block', blockId: match.blockId });
    if (!editor?.selectRange(match.blockId, match.fromGrapheme, match.toGrapheme)) {
      setStatus('无法在当前稿件状态中精确定位该匹配。', 'error');
    }
  }

  async function prepareReplacement(): Promise<void> {
    if (authoritativeMutationBusy() || serviceJobBusy() || !searchPage) return;
    const searchId = searchPage.searchId;
    const replacement = replacementInput.value.normalize('NFC');
    const exclusions = [...excludedMatchIds];
    if (exclusions.length > MAX_REPLACEMENT_EXCLUSIONS || exclusions.length >= searchPage.totalMatches) {
      setStatus('替换排除清单超出上限或没有保留任何精确匹配。', 'error');
      return;
    }
    let preparedPreviewId: string | undefined;
    try {
      const completed = await runOwnedServiceJob(async () => {
        await dismissVisibleReplacementPreview();
        const prepared = await window.ai7.prepareReplacement({
          searchId,
          replacement,
          excludedMatchIds: exclusions,
        });
        preparedPreviewId = prepared.previewId;
        replacementPreview = prepared;
        setInclusionControlsLocked(true);
        return window.ai7.startReplacementCommit({ previewId: prepared.previewId });
      });
      if (completed.state === 'cancelled') {
        clearReplacementPresentation();
        setStatus('替换预览准备已取消；当前本地编辑不受影响。', 'success');
        return;
      }
      if (completed.kind !== 'replacement' || !completed.result || !('replacement' in completed.result)) throw new Error('替换预览准备结果绑定无效。');
      replacementPreview = completed.result;
      renderReplacementReview(replacementPreview);
    } catch (error) {
      if (preparedPreviewId) {
        try {
          await window.ai7.dismissReplacementPreview({ previewId: preparedPreviewId });
          if (replacementPreview?.previewId === preparedPreviewId) clearReplacementPresentation();
        } catch {
          if (replacementPreview?.previewId === preparedPreviewId) setInclusionControlsLocked(true);
        }
      }
      setStatus(rendererErrorMessage(error, '无法准备替换预览。'), 'error');
    }
  }

  function renderReplacementReview(preview: ReplacementPreviewProjection): void {
    if (preview.excludedMatchIds.length > MAX_REPLACEMENT_EXCLUSIONS || preview.includedMatches < 1) {
      throw new Error('替换预览的纳入集合超出安全范围。');
    }
    excludedMatchIds.clear();
    for (const matchId of preview.excludedMatchIds) excludedMatchIds.add(matchId);
    updateExclusionSummary();
    setInclusionControlsLocked(true);
    replacementReview.hidden = false;
    replacementReview.replaceChildren(
      element('h4', undefined, preview.state === 'frozen' ? '已冻结替换集' : '替换预览'),
      element('p', undefined, `查找“${preview.query}”，替换为“${preview.replacement}”`),
      element('p', 'field-note', `范围：${preview.scopeLabel} · 绑定修订版 ${preview.revisionLabel} · 修订日志序号 ${preview.journalSequence}`),
      element('p', 'field-note', `匹配规则：${preview.matchingRule}`),
      element('p', 'field-note', `纳入 ${preview.includedMatches} 处 · 排除 ${preview.excludedMatches} 处 · ${preview.inclusionRule}`),
      element('p', 'field-note', '精确纳入清单：本次有序搜索结果中，除下列匹配标识外的全部匹配。'),
      element('p', 'field-note inclusion-lock-truth', preview.state === 'frozen' ? '匹配集已冻结；纳入控件保持锁定。' : '当前预览的纳入控件已锁定；取消预览后可重新选择。'),
    );
    const exclusions = element('pre', 'replacement-exclusions', preview.excludedMatchIds.length > 0 ? preview.excludedMatchIds.join('\n') : '（无排除项）');
    exclusions.setAttribute('aria-label', '精确排除匹配标识清单');
    replacementReview.append(exclusions, element('p', 'field-note', '以下仅显示已纳入匹配的代表性上下文。'));
    const contexts = element('ul');
    for (const match of preview.representativeContexts) contexts.append(element('li', undefined, `${match.headingLabel}：${match.context}`));
    replacementReview.append(contexts);
    if (preview.state === 'reviewing') {
      const freeze = button('冻结并重新验证', 'primary', async () => {
        try {
          replacementPreview = await window.ai7.freezeReplacement({
            previewId: preview.previewId,
            excludedMatchIds: [...excludedMatchIds],
          });
          renderReplacementReview(replacementPreview);
        } catch (error) {
          setStatus(rendererErrorMessage(error, '替换集无法冻结。'), 'error');
        }
      });
      freeze.dataset['replacementAction'] = 'freeze';
      replacementReview.append(freeze);
    } else {
      const commit = button('原子提交替换', 'primary', () => void commitReplacement(preview.previewId));
      commit.dataset['replacementAction'] = 'commit';
      replacementReview.append(commit);
    }
    const dismiss = button('取消并关闭替换预览', 'quiet', () => void dismissReplacementFromReview(preview.previewId));
    dismiss.dataset['replacementAction'] = 'dismiss';
    replacementReview.append(dismiss);
    updateServiceControls();
  }

  async function dismissReplacementFromReview(previewId: string): Promise<void> {
    if (authoritativeMutationBusy() || serviceJobBusy() || replacementPreview?.previewId !== previewId) return;
    try {
      const dismissal = await window.ai7.dismissReplacementPreview({ previewId });
      if (dismissal.state !== 'cancelled') throw new Error('替换预览取消确认无效。');
      clearReplacementPresentation();
      setStatus('替换预览已取消并关闭；稿件未发生替换。', 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '替换预览无法取消。'), 'error');
    }
  }

  async function commitReplacement(previewId: string): Promise<void> {
    try {
      const replacement = await runAuthoritativeMutation(async () => {
        const completed = await runOwnedServiceJob(() => window.ai7.startReplacementCommit({ previewId }));
        if (completed.state === 'cancelled') {
          clearReplacementPresentation();
          throw new Error('替换提交已在写入前取消；稿件未发生替换。');
        }
        if (completed.kind !== 'replacement' || completed.result !== null) throw new Error('冻结匹配复核结果绑定无效。');
        return window.ai7.commitReplacement({ previewId });
      }, async (result) => {
        await invalidateSearchState('稿件已替换；先前搜索结果和返回位置已失效。', result.previewId);
        await loadOutline(null, true);
      });
      if (!replacement) {
        if (!authoritativeMutation) {
          try {
            await invalidateSearchState('替换未提交；先前预览已关闭，请重新查找后再试。');
          } catch (error) {
            setStatus(rendererErrorMessage(error, '无法关闭未提交的替换预览。'), 'error');
          }
        }
        return;
      }
      setStatus(replacement.completionLabel, 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '替换提交未完成。'), 'error');
    }
  }

  async function saveMilestone(): Promise<void> {
    if (authoritativeMutationBusy() || !editor) return;
    if (!milestoneName.value.trim() || !purpose.value.trim()) {
      setStatus('请填写里程碑名称和保存目的。', 'error');
      (!milestoneName.value.trim() ? milestoneName : purpose).focus();
      return;
    }
    try {
      const saved = await runAuthoritativeMutation(() => {
        const binding = editor!.currentWindow();
        return window.ai7.saveMilestone({
          manuscriptId: binding.manuscriptId,
          branchId: binding.branchId,
          label: milestoneName.value,
          purpose: purpose.value,
          note: note.value,
        });
      }, async () => {
        milestoneSection.open = false;
        await invalidateSearchIfStale('稿件修订版已变化；先前搜索结果和返回位置已失效。');
        await loadOutline(null, true);
      });
      if (!saved) return;
      setStatus(saved.completionLabel, 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '里程碑未保存。'), 'error');
    }
  }

  async function runHistory(action: 'undo' | 'redo'): Promise<void> {
    if (authoritativeMutationBusy() || !editor) return;
    try {
      const result = await runAuthoritativeMutation(() => {
        const binding = editor!.currentWindow();
        const input = {
          manuscriptId: binding.manuscriptId,
          branchId: binding.branchId,
          expectedWorkingDigest: binding.workingDigest,
        };
        return action === 'undo' ? window.ai7.undoManuscript(input) : window.ai7.redoManuscript(input);
      }, async () => {
        await invalidateSearchIfStale('稿件历史状态已变化；先前搜索结果和返回位置已失效。');
        await loadOutline(null, true);
      });
      if (!result) return;
      setStatus(result.completionLabel, 'success');
    } catch (error) {
      setStatus(rendererErrorMessage(error, `${action === 'undo' ? '撤销' : '重做'}未完成。`), 'error');
    }
  }

  positionRail.addEventListener('change', () => void navigate({ kind: 'proportion', proportion: Number(positionRail.value) / 1_000_000 }));
  editorWindow.addEventListener('scroll', () => {
    // Paging at an edge answers the reader's scroll. A position the editor restored itself — after an
    // arrival, a journal acknowledgement or an authoritative refresh — is not that, even when it rests
    // at the pane's top or bottom: the guards below lapse as soon as their operation ends, which can be
    // a frame before the restore's own `scroll` event arrives (#474). The Mark surface moves the pane too:
    // a card brought into view, or the pane settling once a card's height is gone.
    if (authoritativeMutationBusy() || edgeNavigation || editor?.isComposing() || editor?.isOwnScroll() || editorialMarks?.ownsScroll()) return;
    const atStart = editorWindow.scrollTop <= 0 && currentWindow.previousCursor !== null;
    const atEnd = editorWindow.scrollTop + editorWindow.clientHeight >= editorWindow.scrollHeight - 1 && currentWindow.nextCursor !== null;
    if (!atStart && !atEnd) return;
    void navigateCursor(atStart ? 'previous' : 'next');
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && !authoritativeMutationBusy() && !serviceJobBusy()) {
      event.preventDefault();
      void runSearch();
    }
  });

  editor = mountBoundedEditor({
    host: editorHost,
    scrollContainer: editorWindow,
    platform: window.ai7.platform,
    initialWindow,
    flushJournalEdit: (input) => window.ai7.flushJournalEdit(input),
    onStateChange: (state) => {
      dirty = state.dirty;
      saving = state.saving;
      retryRequired = state.retryRequired;
      save.disabled = authoritativeMutationBusy() || !state.dirty || state.saving || state.interrupted;
      journal.textContent = `修订日志序号 ${state.journalSequence}`;
      setCloseRisk(authoritativeMutationBusy() || state.dirty || state.saving || state.retryRequired || (state.interrupted && state.dirty));
      if (editor) {
        const editorWindowProjection = editor.currentWindow();
        const bindingChanged = editorWindowProjection.revisionId !== currentWindow.revisionId ||
          editorWindowProjection.journalSequence !== currentWindow.journalSequence ||
          editorWindowProjection.workingDigest !== currentWindow.workingDigest;
        if (bindingChanged) {
          currentWindow = editorWindowProjection;
          updateWindowChrome();
          void loadOutline(null);
          scheduleRailRefresh();
        }
        if (!authoritativeMutationBusy() && searchStateIsStale()) {
          void invalidateSearchState('稿件状态已变化；先前搜索结果、替换预览和查找返回位置已失效。').catch((error) => {
            setStatus(rendererErrorMessage(error, '无法取消已失效的替换预览。'), 'error');
          });
        }
      }
    },
    onAnnouncement: setStatus,
    onCommand: (command) => {
      if (command === 'search' || command === 'replace') {
        setNavigationOpen(true);
        (command === 'search' ? searchInput : replacementInput).focus();
      }
      else if (command === 'undo' || command === 'redo') void runHistory(command);
      else void navigateCursor(command === 'previous-window' ? 'previous' : 'next');
    },
    onWindowLoaded: () => editorialMarks?.close(),
  });
  // Typing moves every place behind the caret a little; the rail is read again once the typing rests,
  // never per keystroke, and its cost follows the chapters and marks, not the manuscript's length.
  let railRefreshTimer: number | undefined;
  const scheduleRailRefresh = (): void => {
    if (railRefreshTimer !== undefined) window.clearTimeout(railRefreshTimer);
    railRefreshTimer = window.setTimeout(() => {
      railRefreshTimer = undefined;
      manuscriptRail?.refresh();
    }, 1_200);
  };
  manuscriptRail = mountPositionRail({
    track: railTrack,
    api: window.ai7,
    binding: () => ({ manuscriptId: currentWindow.manuscriptId, branchId: currentWindow.branchId }),
    jumpToBlock: (blockId) => void navigate({ kind: 'block', blockId }),
    onError: (error) => setStatus(rendererErrorMessage(error, '全稿位置轨未能更新。'), 'error'),
  });
  manuscriptRail.setPosition(initialWindow.position.proportion);
  manuscriptRail.refresh();
  editorialMarks = mountEditorialMarks({
    scroll: editorWindow,
    host: editorHost,
    editor,
    api: window.ai7,
    busy: () => authoritativeMutationBusy() || serviceJobBusy(),
    marksChanged: () => manuscriptRail?.refresh(),
    openReviewFinding: (target) => void leaveForReview({ reviewRunId: target.reviewRunId, findingId: target.findingId }),
    // An Apply is an authoritative write like a replacement or an undo: the window is reloaded from the
    // service and must show exactly the manuscript state the Effect Receipt names.
    writeManuscript: async (operation, done) => {
      const written = await runAuthoritativeMutation(async () => {
        const result = await operation();
        return { ...result, ...result.application.after, completionLabel: done };
      }, async () => {
        await invalidateSearchIfStale('稿件已由应用写入；先前搜索结果和返回位置已失效。');
        await loadOutline(null, true);
      });
      if (written) setStatus(done, 'success');
      manuscriptRail?.refresh();
      return written;
    },
    setStatus,
    errorMessage: rendererErrorMessage,
  });
  updateWindowChrome();
  void loadOutline(null);
  editor.focus();
  // Arriving is itself a position worth remembering: a manuscript opened and then left by closing the
  // product never reaches an exit this surface can see, and the entry is what should answer then.
  void rememberEntryPosition();
  setStatus(`稿件窗口已打开；${initialWindow.position.label}。`);
  // 审阅's 回到原文 arrives at a finding's mark: its card opens as a click on it would.
  if (openMarkId !== undefined) void editorialMarks.openMark(openMarkId);
}

function renderError(error: unknown, retry: () => void): void {
  const content = panel();
  content.classList.add('error-panel');
  content.append(
    element('p', 'section-label', '操作未完成'),
    element('h2', undefined, '无法继续当前操作'),
    element('p', 'lede', rendererErrorMessage(error, '桌面操作未完成，请重试。')),
    button('重新开始', 'primary', retry),
  );
  replaceScreen('error', content);
  setStatus('操作未完成', 'error');
}

async function initializeStartup(): Promise<void> {
  setStatus('正在核对本地恢复状态…', 'busy');
  try {
    await renderApplicationStartup(await window.ai7.getStartup());
  } catch (error) {
    renderError(error, () => void initializeStartup());
  }
}

async function initializeRenderer(): Promise<void> {
  try {
    const route = await window.ai7.getBookWorkbenchRoute();
    if (route) {
      await renderResolvedBookWorkbenchRoute(route);
      return;
    }
  } catch (error) {
    renderError(error, () => void initializeRenderer());
    return;
  }
  await initializeStartup();
}

new MutationObserver(() => {
  if (document.documentElement.dataset['ai7ServiceState'] === 'interrupted') applyAuthorityInterruption();
  if (document.documentElement.dataset['ai7CloseState'] === 'blocked') {
    setStatus('当前编辑尚未获得持久写入确认，请先保存成功后再关闭窗口。', 'error');
    delete document.documentElement.dataset['ai7CloseState'];
  }
  if (document.documentElement.dataset['ai7BookWorkbenchRouteGeneration']) {
    delete document.documentElement.dataset['ai7BookWorkbenchRouteGeneration'];
    void renderOwnedBookWorkbenchRoute();
  }
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: [
    'data-ai7-service-state',
    'data-ai7-close-state',
    'data-ai7-book-workbench-route-generation',
  ],
});

setCloseRisk(false);
void initializeRenderer();
if (document.documentElement.dataset['ai7ServiceState'] === 'interrupted') applyAuthorityInterruption();
