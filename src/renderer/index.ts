import type {
  BookCreationReviewProjection,
  BookRecordPresentation,
  BookSummaryPageProjection,
  BookWorkbenchRoute,
  BookWorkOverviewProjection,
  FidelityCategoryProjection,
  ContinueImportProjection,
  ImportCommitProjection,
  ImportDraftRecoveryProjection,
  ImportStartupProjection,
  HistoricalRevisionProjection,
  ManuscriptWindowProjection,
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
  SearchResultsProjection,
  ServiceJobProjection,
  SourceImportCommitProjection,
  StagedImportProjection,
  StartupProjection,
} from '../shared/protocol.js';
import { MAX_REPLACEMENT_EXCLUSIONS } from '../shared/protocol.js';
import { mountBoundedEditor, type BoundedEditor, type EditorContinuity } from './editor.js';

function requiredElement(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');
  return node;
}

const screen = requiredElement('#screen');
const persistenceStatus = requiredElement('#persistence-status');
if (!window.ai7) throw new Error('AI7_RENDERER_BOOTSTRAP_INVALID');

let editor: BoundedEditor | undefined;
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

function setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void {
  persistenceStatus.textContent = message;
  if (tone) persistenceStatus.dataset['tone'] = tone;
  else delete persistenceStatus.dataset['tone'];
}

function setCloseRisk(risk: boolean): void {
  document.documentElement.dataset['ai7CloseRisk'] = risk ? 'true' : 'false';
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

async function renderResolvedBookWorkbenchRoute(
  route: ResolvedBookWorkbenchRoute,
  recoveryReturn?: RecoveryReturnContext,
): Promise<void> {
  if (route.kind === 'book') {
    renderBookOverview(
      await window.ai7.getBookOverview({ bookId: route.bookId, historyCursor: null }),
      undefined,
      recoveryReturn,
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
  details.append(
    element('dt', undefined, '格式'),
    element('dd', undefined, staged.source.format),
    element('dt', undefined, '来源'),
    element('dd', undefined, staged.source.provenanceLabel),
    element('dt', undefined, '来源字节数'),
    sourceBytes,
    element('dt', undefined, '来源 SHA-256'),
    sourceDigest,
    element('dt', undefined, '检测结果'),
    element('dd', undefined, `${staged.detectedBlockCount} 个可编辑内容块`),
  );
  card.append(details);
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
      element('dt', undefined, '来源材料版本'),
      element('dd', 'technical-identity', finding.sourceVersionId),
      element('dt', undefined, finding.recordLabel),
      element('dd', 'technical-identity', finding.importRecordId),
    );
    item.append(classes, details);
    disclosure.append(item);
  }
  return disclosure;
}

function statusIcon(status: FidelityCategoryProjection['status']): string {
  if (status === 'preserved') return '✓';
  if (status === 'degraded') return '△';
  return '⊘';
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

function waitForVisibleProductReady(): Promise<void> {
  if (productIsVisibleAndReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      if (!productIsVisibleAndReady()) return;
      observer.disconnect();
      document.removeEventListener('visibilitychange', finish);
      resolve();
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ai7-product-ready'],
    });
    document.addEventListener('visibilitychange', finish);
    finish();
  });
}

function nextVisibleFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function acknowledgeCompletionAfterPaint(result: ImportCommitProjection): Promise<boolean> {
  await waitForVisibleProductReady();
  await nextVisibleFrame();
  await nextVisibleFrame();
  const presentedCommitId = screen.querySelector<HTMLElement>('[data-import-commit-id]')?.dataset['importCommitId'];
  if (
    !productIsVisibleAndReady() ||
    screen.dataset['screen'] !== 'imported' ||
    presentedCommitId !== result.commitId
  ) {
    return false;
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
    element('dt', undefined, '修订版身份'), revisionIdentity,
    element('dt', undefined, '修订摘要'), revisionDigest,
    element('dt', undefined, '持久边界'), element('dd', undefined, `修订日志序号 ${candidate.journalSequence} · ${candidate.durableAt}`),
    element('dt', undefined, '覆盖范围'), element('dd', undefined, candidate.coveredChangeExtent),
    element('dt', undefined, '校验'), element('dd', undefined, candidate.verification),
    element('dt', undefined, '限制'), element('dd', undefined, candidate.limitation),
  );
  if (candidate.snapshotId !== null) {
    const snapshotIdentity = element('dd', 'technical-identity', candidate.snapshotId);
    snapshotIdentity.dataset['snapshotId'] = candidate.snapshotId;
    details.append(element('dt', undefined, '快照身份'), snapshotIdentity);
  }
  copy.append(details);
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
  identityDetails.append(
    element('dt', undefined, '图书'), element('dd', undefined, `${recovery.bookTitle} · ${recovery.bookId}`),
    element('dt', undefined, '稿件'), element('dd', 'technical-identity', recovery.manuscriptId),
    element('dt', undefined, '分支'), element('dd', undefined, `${recovery.branchName} · ${recovery.branchId}`),
    element('dt', undefined, '最后持久写入边界'),
    element('dd', undefined, `修订日志序号 ${recovery.lastDurableEditBoundary.journalSequence} · ${recovery.lastDurableEditBoundary.durableAt}`),
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
  values.append(
    element('dt', undefined, '图书 ID'), element('dd', 'technical-identity', projection.bookId),
    element('dt', undefined, '稿件 ID'), element('dd', 'technical-identity', projection.manuscriptId),
    element('dt', undefined, '分支 ID'), element('dd', 'technical-identity', projection.branchId),
    element('dt', undefined, '修订版 ID'), element('dd', 'technical-identity', projection.revisionId),
    element('dt', undefined, '修订摘要'), element('dd', 'technical-identity', projection.revisionDigest),
    element('dt', undefined, '来源版本 ID'), element('dd', 'technical-identity', projection.sourceVersionId),
    element('dt', undefined, '创建时间'), element('dd', undefined, projection.createdAt),
  );
  identity.append(element('h3', undefined, '不可变修订身份'), values);
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
      appendRecordField(values, '创建时间', record.createdAt);
      appendRecordField(values, '编辑维度集 ID', record.dimensionSetId, true);
      appendRecordField(values, '编辑维度集摘要', record.dimensionSetDigest, true);
      break;
    case 'manuscript':
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '关系', '主稿件');
      appendRecordField(values, '创建时间', record.createdAt);
      break;
    case 'revision':
      appendRecordField(values, '修订版 ID', record.revisionId, true);
      appendRecordField(values, '稿件 ID', record.manuscriptId, true);
      appendRecordField(values, '分支 ID', record.branchId, true);
      appendRecordField(values, '版本标签', record.revisionLabel);
      appendRecordField(values, '修订摘要', record.revisionDigest, true);
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '创建时间', record.createdAt);
      break;
    case 'source':
      appendRecordField(values, '来源版本 ID', record.sourceVersionId, true);
      appendRecordField(values, '来源记录 ID', record.provenanceId, true);
      appendRecordField(values, '所属图书 ID', record.bookId, true);
      appendRecordField(values, '原文件名', record.displayName);
      appendRecordField(values, '原文件 SHA-256', record.sourceDigest, true);
      appendRecordField(values, '内容摘要', record.contentDigest, true);
      appendRecordField(values, '结构摘要', record.structureDigest, true);
      appendRecordField(values, '解析器', record.parserIdentity);
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
      appendRecordField(values, '导入时间', record.importedAt);
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
      appendRecordField(values, '保留边界', '完整所选 DOCX 文件及本地解析出的完整内容与结构身份');
      appendRecordField(values, '保留文件名', record.retainedBoundary.displayName);
      appendRecordField(values, '保留字节数', String(record.retainedBoundary.sourceBytes));
      appendRecordField(values, '保留文件 SHA-256', record.retainedBoundary.sourceSha256, true);
      appendRecordField(values, '保留内容摘要', record.retainedBoundary.contentDigest, true);
      appendRecordField(values, '保留结构摘要', record.retainedBoundary.structureDigest, true);
      appendRecordField(values, '记录摘要', record.recordDigest, true);
      appendRecordField(values, '导入时间', record.importedAt);
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
      appendRecordField(values, '导入时间', record.importedAt);
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
  const identity = element('section', 'source-card');
  const identityValues = element('dl');
  identityValues.append(
    element('dt', undefined, '图书 ID'), element('dd', 'technical-identity', overview.book.bookId),
    element('dt', undefined, '稳定标识'), element('dd', 'technical-identity', overview.book.stableIdentity),
    element('dt', undefined, '内部编号'), element('dd', undefined, overview.book.internalNumber ?? '未设置'),
    element('dt', undefined, '稿件状态'), element('dd', undefined, overview.manuscriptState.label),
  );
  identity.append(element('h3', undefined, '图书'), identityValues);
  content.append(identity);

  const detailHost = element('div');
  const actions = element('div', 'button-row');
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
        const result = await window.ai7.selectAndStageDocx();
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
  content.append(actions);

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
  content.append(records);
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen(completion ? 'imported' : 'book-overview', content);
  if (completion) {
    void acknowledgeCompletionAfterPaint(completion).then((acknowledged) => {
      if (acknowledged && !authorityInterrupted && content.isConnected) {
        for (const action of completionActionButtons) action.disabled = false;
        setStatus(completion.completionLabel, 'success');
      }
    });
  } else {
    setStatus('图书工作概览已打开');
  }
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
    element('dt', undefined, '拟用图书 ID'), element('dd', 'technical-identity', review.proposed.bookId),
    element('dt', undefined, '拟用稳定标识'), element('dd', 'technical-identity', review.proposed.stableIdentity),
    element('dt', undefined, '内部编号'), element('dd', undefined, review.proposed.internalNumber ?? '未设置'),
  );
  identity.append(element('h3', undefined, '拟创建图书'), values);
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
    const root = element('dd', 'technical-identity', projection.canonicalRoot);
    root.dataset['productDataRoot'] = projection.canonicalRoot;
    values.append(
      element('dt', undefined, '当前平台'), element('dd', undefined, projection.platformLabel),
      element('dt', undefined, '运行方式'), element('dd', undefined, projection.runtimeFormLabel),
      element('dt', undefined, '数据保存在'), element('dd', undefined, projection.locationLabel),
      element('dt', undefined, '实际位置'), root,
      element('dt', undefined, '本机占用'), element('dd', undefined, projection.footprint.label),
    );
    summary.append(element('h3', undefined, 'Product Data Location'), values);
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
      const result = await window.ai7.selectAndStageDocx();
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
  const landingActions = element('div', 'button-row');
  landingActions.append(importButton, createBook, dataAndStorage);
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
          await requestBookWorkbenchRoute(
            { kind: 'book', bookId: item.bookId },
            async () => {
              const windowProjection = await window.ai7.getManuscriptWindowAt({
                manuscriptId: item.manuscriptId,
                branchId: item.branchId,
                target: { kind: 'start' },
              });
              renderEditorWindow(windowProjection, item.bookTitle, activeRecoveryReturn?.attentionId);
            },
            activeRecoveryReturn,
          );
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
    const relationship = element('fieldset');
    relationship.setAttribute('role', 'radiogroup');
    relationship.setAttribute('aria-label', '本地文件与所选图书的关系');
    relationship.dataset['importRelationshipChoices'] = 'unselected-by-default';
    relationship.append(element('legend', undefined, '导入关系（默认不选择）'));
    const allowedRelationships: ReadonlyArray<ImportRelationshipChoice> =
      selectedChoice.kind === 'existing-book' && selectedChoice.manuscriptState === 'populated'
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
    if (relationshipSelection === 'first-manuscript') form.append(fidelityTable(staged.fidelity));
    form.append(actions);
    content.append(form);
    revealedControl = title;
  } else if (selectedChoice?.kind === 'existing-book' && relationshipSelection === 'first-manuscript') {
    if (selectedChoice.manuscriptState !== 'empty') throw new Error('AI7_IMPORT_RELATIONSHIP_INVALID');
    content.append(fidelityTable(staged.fidelity));
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
          const review = completed.result;
          if (completed.kind !== 'reimport-preparation' || review === null || !('checkpoint' in review)) {
            throw new Error('重新导入比较任务未返回复核结果。');
          }
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
    element('dt', undefined, '目标图书 ID'), element('dd', 'technical-identity', review.target.bookId),
    element('dt', undefined, '目标稳定标识'), element('dd', 'technical-identity', review.target.stableIdentity),
    ...(review.target.kind === 'new-book'
      ? [element('dt', undefined, '确认书名'), element('dd', undefined, review.target.confirmedTitle)]
      : [element('dt', undefined, '内部编号'), element('dd', undefined, review.target.internalNumber ?? '未设置')]),
    element('dt', undefined, '导入关系'), element('dd', undefined, review.target.relationshipLabel),
  );
  target.append(element('h3', undefined, '目标与关系'), targetValues);
  content.append(target);
  if (review.identityFindings.length > 0) {
    content.append(identityFindingDisclosure(review.identityFindings, review.target.label));
  }

  const boundary = element('section', 'review-section');
  boundary.dataset['sourceRetainedBoundary'] = review.retainedBoundary.kind;
  const boundaryValues = element('dl');
  boundaryValues.append(
    element('dt', undefined, '保留边界'), element('dd', undefined, review.retainedBoundary.label),
    element('dt', undefined, '文件名'), element('dd', undefined, review.retainedBoundary.displayName),
    element('dt', undefined, '格式'), element('dd', undefined, review.retainedBoundary.format),
    element('dt', undefined, '来源字节数'), element('dd', undefined, String(review.retainedBoundary.sourceBytes)),
    element('dt', undefined, '来源 SHA-256'), element('dd', 'technical-identity', review.retainedBoundary.sourceSha256),
    element('dt', undefined, '内容摘要'), element('dd', 'technical-identity', review.retainedBoundary.contentDigest),
    element('dt', undefined, '结构摘要'), element('dd', 'technical-identity', review.retainedBoundary.structureDigest),
  );
  const boundaryValuesList = boundaryValues.querySelectorAll('dd');
  boundaryValuesList[3]?.setAttribute('data-source-bytes', '');
  boundaryValuesList[4]?.setAttribute('data-source-sha256', '');
  boundaryValuesList[5]?.setAttribute('data-content-digest', '');
  boundaryValuesList[6]?.setAttribute('data-structure-digest', '');
  boundary.append(element('h3', undefined, '完整本地文件与内容边界'), boundaryValues);

  const provenance = element('section', 'review-section');
  provenance.dataset['sourceReviewProvenance'] = review.provenance.acquisitionPath;
  const provenanceValues = element('dl');
  provenanceValues.append(
    element('dt', undefined, '取得方式'), element('dd', undefined, review.provenance.label),
    element('dt', undefined, '处理范围'), element('dd', undefined, review.provenance.locality === 'local-provider-free' ? '本地 · 未调用 Provider' : review.provenance.locality),
    element('dt', undefined, '取得时间'), element('dd', undefined, review.provenance.acquiredAt),
  );
  provenanceValues.querySelectorAll('dd')[2]?.setAttribute('data-acquired-at', review.provenance.acquiredAt);
  provenance.append(element('h3', undefined, '来源记录'), provenanceValues);

  const sourceResult = element('section', 'review-section');
  sourceResult.dataset['sourceVersionDisposition'] = review.sourceVersionResult.disposition;
  const sourceResultValues = element('dl');
  sourceResultValues.append(
    element('dt', undefined, '结果'), element('dd', undefined, review.sourceVersionResult.label),
    element('dt', undefined, '来源版本 ID'),
    element('dd', 'technical-identity', review.sourceVersionResult.sourceVersionId ?? '提交时在所选图书内创建'),
  );
  sourceResult.append(element('h3', undefined, '图书拥有的来源版本'), sourceResultValues);
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
    element('dt', undefined, '主稿件 ID'), element('dd', 'technical-identity', review.target.manuscriptId),
    element('dt', undefined, '稿件分支 ID'), element('dd', 'technical-identity', review.target.branchId),
    element('dt', undefined, '导入关系'), element('dd', undefined, review.target.relationshipLabel),
    element('dt', undefined, '安全固定点'), element('dd', undefined, `${review.checkpoint.revisionLabel} · 修订日志 ${review.checkpoint.journalSequence}`),
    element('dt', undefined, '当前固定点修订版 ID'), element('dd', 'technical-identity', review.checkpoint.revisionId),
    element('dt', undefined, '当前固定点修订版摘要'), element('dd', 'technical-identity', review.checkpoint.revisionDigest),
    element('dt', undefined, '固定点来源'), element('dd', undefined,
      review.checkpoint.createdForDirtyJournal ? '已为未固定修订日志创建专用安全固定点' : '当前稿件已经位于持久固定点'),
    element('dt', undefined, '来源关系'), element('dd', undefined, review.lineage.label),
    ...(review.lineage.status === 'verified'
      ? [
          element('dt', undefined, '来源关系版本 ID'),
          element('dd', 'technical-identity', review.lineage.sourceVersionId),
          element('dt', undefined, '来源关系修订版 ID'),
          element('dd', 'technical-identity', review.lineage.revisionId),
        ]
      : []),
    element('dt', undefined, '比较方式'), element('dd', undefined,
      review.lineage.comparisonKind === 'three-way' ? '三方比较' : '两方比较'),
    element('dt', undefined, '来源版本结果'), element('dd', undefined, review.sourceVersionResult.label),
    element('dt', undefined, '暂存文件名'), element('dd', undefined, review.source.displayName),
    element('dt', undefined, '暂存格式'), element('dd', undefined, review.source.format),
    element('dt', undefined, '暂存来源字节数'), element('dd', undefined, String(review.source.sourceBytes)),
    element('dt', undefined, '暂存来源 SHA-256'), element('dd', 'technical-identity', review.source.sourceSha256),
    element('dt', undefined, '暂存来源范围'), element('dd', undefined, review.source.provenanceLabel),
  );
  target.dataset['reimportSourceSha256'] = review.source.sourceSha256;
  target.dataset['reimportSourceBytes'] = String(review.source.sourceBytes);
  target.append(element('h3', undefined, '目标、固定点与来源关系'), values);
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
          const refreshed = completed.result;
          if (completed.kind !== 'reimport-resolution' || refreshed === null || !('checkpoint' in refreshed)) {
            throw new Error('结构身份解决任务未返回复核结果。');
          }
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
  content.append(actions);
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
  if (review.target.kind === 'existing-book') {
    const reviewedBookId = element('dd', 'technical-identity', review.target.bookId);
    reviewedBookId.dataset['reviewedBookId'] = review.target.bookId;
    identityDetails.append(
      element('dt', undefined, '目标图书'),
      element('dd', undefined, review.target.label),
      element('dt', undefined, '目标图书 ID'),
      reviewedBookId,
      element('dt', undefined, '目标稳定标识'),
      element('dd', 'technical-identity', review.target.stableIdentity),
      element('dt', undefined, '目标内部编号'),
      element('dd', undefined, review.target.internalNumber ?? '未设置'),
      element('dt', undefined, '稿件关系'),
      element('dd', undefined, review.target.relationshipLabel),
    );
  }
  identityDetails.append(
    element('dt', undefined, '本地来源'),
    element('dd', undefined, review.source.displayName),
    element('dt', undefined, '来源边界'),
    element('dd', undefined, review.source.provenanceLabel),
    element('dt', undefined, '来源字节数'),
    sourceBytes,
    element('dt', undefined, '来源 SHA-256'),
    sourceDigest,
    element('dt', undefined, '最终动作'),
    element('dd', undefined, finalActionLabel),
  );
  identity.append(identityDetails);
  content.append(identity);
  if (review.identityFindings.length > 0) {
    content.append(identityFindingDisclosure(review.identityFindings, review.target.label));
  }

  const fidelity = element('section', 'review-section');
  fidelity.append(element('h3', undefined, '导入保真审阅 · 8 类'), fidelityTable(review.fidelity));
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
    if (next.kind !== 'reimport-preparation' && next.kind !== 'reimport-resolution' && next.kind !== 'reimport-commit') return;
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
): void {
  const content = panel();
  content.classList.add('editor-shell');
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
      renderBookOverview(await window.ai7.getBookOverview({ bookId: currentWindow.bookId, historyCursor: null }));
    } catch (error) {
      backToOverview.disabled = false;
      setStatus(rendererErrorMessage(error, '无法返回图书工作概览。'), 'error');
    }
  });
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
  toolbarActions.append(backToOverview, undo, redo, save, retryAuthoritativeRefreshButton);
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
  windowActions.append(previousWindow, positionRailLabel, positionRail, nextWindow);
  manuscript.append(editorWindow, windowActions);
  workspace.append(navigator, manuscript);

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
    previousWindow.disabled = authoritativeMutationBusy() || currentWindow.previousCursor === null;
    nextWindow.disabled = authoritativeMutationBusy() || currentWindow.nextCursor === null;
  };

  const syncAuthoritativeMutationControls = (): void => {
    const busy = authoritativeMutationBusy();
    editorHost.dataset['authoritativeMutation'] = authoritativeMutation ? 'true' : 'false';
    backToOverview.disabled = busy;
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

  async function navigate(
    target: Parameters<typeof window.ai7.getManuscriptWindowAt>[0]['target'],
    continuity?: EditorContinuity,
    preserveOffWindowContinuity = false,
  ): Promise<boolean> {
    if (authoritativeMutationBusy() || !(await settleLocalEdit()) || !editor) return false;
    try {
      const binding = editor.currentWindow();
      const next = await window.ai7.getManuscriptWindowAt({
        manuscriptId: binding.manuscriptId,
        branchId: binding.branchId,
        target,
      });
      const loaded = preserveOffWindowContinuity && continuity
        ? editor.loadNavigationWindow(next, continuity)
        : editor.loadWindow(next, continuity);
      if (!loaded) return false;
      currentWindow = next;
      updateWindowChrome();
      setStatus(`已到达${next.position.structureLabel ? `“${next.position.structureLabel}”附近，` : ''}${next.position.label}。`, 'success');
      return true;
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法移动到该稿件位置。'), 'error');
      return false;
    }
  }

  async function navigateCursor(direction: 'previous' | 'next'): Promise<void> {
    if (authoritativeMutationBusy() || edgeNavigation || !(await settleLocalEdit()) || !editor) return;
    const cursor = direction === 'previous' ? editor.currentWindow().previousCursor : editor.currentWindow().nextCursor;
    if (!cursor) return;
    edgeNavigation = true;
    try {
      const continuity = editor.captureNavigationContinuity();
      await navigate({ kind: 'cursor', cursor }, continuity, true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    } finally {
      edgeNavigation = false;
    }
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
    if (authoritativeMutationBusy() || edgeNavigation || editor?.isComposing()) return;
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
      if (command === 'search') searchInput.focus();
      else if (command === 'replace') replacementInput.focus();
      else if (command === 'undo' || command === 'redo') void runHistory(command);
      else void navigateCursor(command === 'previous-window' ? 'previous' : 'next');
    },
  });
  updateWindowChrome();
  void loadOutline(null);
  editor.focus();
  setStatus(`稿件窗口已打开；${initialWindow.position.label}。`);
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
