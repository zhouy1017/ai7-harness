import type {
  FidelityCategoryProjection,
  ContinueImportProjection,
  ImportCommitProjection,
  ImportDraftRecoveryProjection,
  ImportStartupProjection,
  ManuscriptWindowProjection,
  OutlineProjection,
  PriorWorkItemProjection,
  ReplacementPreviewProjection,
  RecoveryComparisonProjection,
  RecoverySelection,
  RecoveryWindowProjection,
  ReviewBeforeImportProjection,
  SearchResultsProjection,
  ServiceJobProjection,
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

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as Error & { code?: unknown }).code === code;
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

function appendRecoveryReturnAction(content: HTMLElement, context: RecoveryReturnContext | undefined): void {
  if (!context) return;
  const actions = element('div', 'button-row recovery-return-actions');
  const returnButton = button(`返回 ${context.bookTitle} 的恢复待确认`, 'secondary', async () => {
    returnButton.disabled = true;
    setStatus('正在返回稿件恢复比较…', 'busy');
    try {
      renderManuscriptRecovery(await window.ai7.getRecoveryComparison({ attentionId: context.attentionId }));
    } catch (error) {
      returnButton.disabled = false;
      setStatus(error instanceof Error ? error.message : '无法返回恢复比较。', 'error');
    }
  });
  returnButton.dataset['recoveryReturn'] = context.attentionId;
  returnButton.dataset['recoveryReturnVersion'] = String(context.attentionVersion);
  actions.append(returnButton);
  content.append(actions);
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
  reviewTarget?: ReviewBeforeImportProjection['target']['label'],
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
      element('dt', undefined, '稿件导入记录'),
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
    try {
      renderLanding(await window.ai7.listPriorWork(), recoveryReturn);
    } catch {
      renderLanding([], recoveryReturn);
    }
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
    renderLanding(startup.priorWork);
  }
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
      setStatus(error instanceof Error ? error.message : '恢复未完成。', 'error');
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
      setStatus(deferred.completionLabel, 'success');
      const recoveryReturn = {
        attentionId: deferred.attentionId,
        attentionVersion: deferred.attentionVersion,
        bookTitle: recovery.bookTitle,
      } satisfies RecoveryReturnContext;
      if (deferred.next.state === 'import') await renderStartupProjection(deferred.next.startup, recoveryReturn);
      else renderLanding(deferred.next.priorWork, recoveryReturn);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '恢复待确认状态未能保留。', 'error');
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
    setStatus(error instanceof Error ? error.message : '无法读取恢复证据。', 'error');
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
    renderReview(continuation.review, continuation.notice, recoveryReturn);
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

function renderLanding(
  priorWork: ReadonlyArray<PriorWorkItemProjection> = [],
  recoveryReturn?: RecoveryReturnContext,
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
    element('p', 'section-label', '本地 DOCX · 新图书起稿'),
    element('h2', undefined, '新建图书'),
    element('p', 'lede', '从一份本地 DOCX 开始，在创建任何图书记录之前先看清来源、保真结果和最终影响。'),
  );
  const steps = element('ol', 'hero-steps');
  for (const item of ['选择本地 DOCX', '明确选择“新建图书”并确认书名', '复核全部记录与非影响后一次提交']) {
    steps.append(element('li', undefined, item));
  }
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
      renderError(error, () => renderLanding(priorWork, activeRecoveryReturn));
    }
  });
  copy.append(steps, importButton);
  const note = element('aside', 'hero-note', '不会先创建空图书。只有最后的“新建图书并导入稿件”会提交业务记录。');
  content.append(copy, note);
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
            renderManuscriptRecovery(await window.ai7.getRecoveryComparison({ attentionId: item.recoveryAttention.attentionId }));
            return;
          }
          const windowProjection = await window.ai7.getManuscriptWindowAt({
            manuscriptId: item.manuscriptId,
            branchId: item.branchId,
            target: { kind: 'start' },
          });
          renderEditorWindow(windowProjection, item.bookTitle, activeRecoveryReturn?.attentionId);
        } catch (error) {
          open.disabled = false;
          setStatus(error instanceof Error ? error.message : '无法重新打开稿件。', 'error');
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

function renderTargetChoice(
  staged: StagedImportProjection,
  selectedChoiceId: StagedImportProjection['targetChoices'][number]['id'] | null,
  recoveryNotice?: string,
  recoveryReturn?: RecoveryReturnContext,
): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '步骤 1 / 3'),
    element('h2', undefined, '选择稿件导入目标'),
    element('p', 'lede', '系统不会替你选择。先明确这份来源要建立什么关系。'),
    sourceCard(staged),
  );
  if (recoveryNotice) content.append(element('p', 'recovery-notice', recoveryNotice));
  if (staged.identityFindings.length > 0) content.append(identityFindingDisclosure(staged.identityFindings));
  const targetChoice = staged.targetChoices[0];
  if (!targetChoice) throw new Error('AI7_IMPORT_TARGET_INVALID');
  const choices = element('fieldset');
  const legend = element('legend', undefined, '稿件导入目标');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', '稿件导入目标');
  const choice = element('label', 'choice');
  const radio = element('input');
  radio.type = 'radio';
  radio.name = 'import-target';
  radio.value = targetChoice.id;
  radio.setAttribute('aria-label', targetChoice.label);
  radio.checked = selectedChoiceId === targetChoice.id;
  const copy = element('span');
  copy.append(
    element('strong', undefined, targetChoice.label),
    element(
      'small',
      undefined,
      staged.identityFindings.length > 0
        ? '将当前文件作为不同作品，建立新的图书、主稿件、r1 和工作流程实例'
        : '以这份来源建立图书、主稿件、r1 和工作流程实例',
    ),
  );
  choice.append(radio, copy);
  choices.append(legend, choice);
  content.append(choices);
  radio.addEventListener('change', () =>
    renderTargetChoice(staged, targetChoice.id, recoveryNotice, recoveryReturn));

  const cancelImport = button('取消导入', 'quiet', () =>
    abandonAndContinue({ draftId: staged.draftId, draftVersion: staged.draftVersion }, recoveryReturn),
  );

  if (selectedChoiceId !== null) {
    const form = element('section', 'form-row');
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
        const review = await window.ai7.prepareNewBookReview({
          draftId: staged.draftId,
          expectedDraftVersion: staged.draftVersion,
          targetChoiceId: selectedChoiceId,
          confirmedTitle,
          acceptDegradation: false,
        });
        setStatus('导入前复核已准备', 'success');
        renderReview(review, recoveryNotice, recoveryReturn);
      } catch (error) {
        renderError(error, () => renderLanding([], recoveryReturn));
      }
    });
    form.append(label, title, note, fidelityTable(staged.fidelity), element('div', 'button-row'));
    form.lastElementChild?.append(confirm, cancelImport);
    content.append(form);
    queueMicrotask(() => title.focus());
  } else {
    const actions = element('div', 'button-row');
    actions.append(cancelImport);
    content.append(actions);
  }

  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen(selectedChoiceId === null ? 'target' : 'title', content);
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
  identity.append(element('h3', undefined, `${review.target.label} · ${review.target.confirmedTitle}`));
  const identityDetails = element('dl');
  const sourceBytes = element('dd', undefined, String(review.source.sourceBytes));
  sourceBytes.setAttribute('data-source-bytes', '');
  const sourceDigest = element('dd', 'technical-identity', review.source.sourceSha256);
  sourceDigest.setAttribute('data-source-sha256', '');
  const degraded = review.degradationDecision.state !== 'not-required-clean-import';
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
    element('dd', undefined, degraded ? '按上述降级方式新建图书并导入稿件' : '新建图书并导入稿件'),
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
            targetChoiceId: review.target.choiceId,
            confirmedTitle: review.target.confirmedTitle,
            acceptDegradation: true,
          });
          setStatus('已接受本次导入的完整降级集合', 'success');
          renderReview(acceptedReview, recoveryNotice, recoveryReturn);
        } catch (error) {
          renderError(error, () => renderLanding([], recoveryReturn));
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
    element('p', 'field-note', '将创建一个绑定该精确方案版本的工作流程实例。'),
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
    const commitLabel = acceptedDegradation ? '按上述降级方式新建图书并导入稿件' : '新建图书并导入稿件';
    const commitButton = button(commitLabel, 'primary', async () => {
      commitButton.disabled = true;
      setStatus('正在原子提交图书与稿件记录…', 'busy');
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
        setStatus(error instanceof Error ? error.message : '导入未完成，请重试。', 'error');
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
  const content = panel();
  content.classList.add('completion');
  content.dataset['importCommitId'] = result.commitId;
  const degradation = result.importRecord.degradationDecision;
  content.append(
    element('div', 'completion-mark', '✓'),
    element('p', 'section-label', '步骤 3 / 3'),
    element('h2', undefined, result.completionLabel),
    element(
      'p',
      'lede',
      degradation
        ? '图书、维度集、来源、导入保真审阅、导入降级决定、主稿件、主分支、r1、工作流程实例和稿件导入记录已一起创建。'
        : '图书、维度集、来源与保真记录、主稿件、主分支、r1、工作流程实例和稿件导入记录已一起创建。',
    ),
  );
  const actions = element('div', 'button-row');
  const open = button('打开稿件', 'primary', () =>
    renderEditorWindow(result.firstWindow, '主稿件', recoveryReturn?.attentionId));
  open.disabled = true;
  const record = button('查看导入记录', 'secondary', () => {
    if (content.querySelector('.record-detail')) return;
    const detail = element('section', 'source-card record-detail');
    detail.append(
      element('h3', undefined, '稿件导入记录'),
      element('p', undefined, `完成时间：${new Date(result.importedAt).toLocaleString('zh-CN')}`),
      element('p', undefined, '结果：主稿件 · 主分支 · 稿件修订版 r1'),
      element('p', undefined, `来源：${result.source.displayName} · ${result.source.sourceBytes} 字节 · SHA-256 ${result.source.sourceSha256}`),
      element('p', undefined, `导入保真审阅：${result.fidelityReview.fidelityReviewId} · 8 类`),
      element('p', undefined, `稿件导入记录：${result.importRecord.importRecordId} · 已链接导入保真审阅`),
      element('p', 'field-note', '这不是稿件检查点、里程碑版本、导出回执、往返保证或发布事实。'),
    );
    if (degradation) {
      detail.append(
        element(
          'p',
          undefined,
          `导入降级决定：${degradation.degradationDecisionId} · ${degradation.summaryLabel} · 已链接稿件导入记录`,
        ),
      );
      const disclosure = element('details', 'degradation-disclosure');
      disclosure.append(element('summary', undefined, '查看受影响类别、示例与导出后果'));
      const accepted = element('ul', 'degradation-list');
      for (const item of degradation.acceptedItems) {
        const category = result.fidelityReview.categories.find((candidate) => candidate.key === item.categoryKey);
        if (!category) throw new Error('AI7_IMPORT_RESULT_INVALID');
        const row = element('li', undefined, `${item.label} · ${item.count} 项 · ${category.detail}`);
        row.dataset['degradationCategory'] = item.categoryKey;
        row.dataset['degradationCount'] = String(item.count);
        accepted.append(row);
      }
      disclosure.append(accepted);
      detail.append(disclosure);
    }
    content.append(detail);
  });
  actions.append(open, record);
  content.append(actions);
  appendRecoveryReturnAction(content, recoveryReturn);
  replaceScreen('imported', content);
  void acknowledgeCompletionAfterPaint(result).then((acknowledged) => {
    if (
      acknowledged &&
      !authorityInterrupted &&
      screen.dataset['screen'] === 'imported' &&
      content.isConnected
    ) {
      open.disabled = false;
    }
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function awaitServiceJob(
  initial: ServiceJobProjection,
  onProgress: (job: ServiceJobProjection) => void,
): Promise<ServiceJobProjection> {
  let job = initial;
  onProgress(job);
  while (job.state === 'queued' || job.state === 'running') {
    await delay(25);
    job = await window.ai7.pollServiceJob({ jobId: job.jobId });
    onProgress(job);
  }
  if (job.state === 'failed') throw new Error(job.failure?.message ?? '后台业务操作未完成。');
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
  const toolbarActions = element('div', 'button-row');
  if (recoveryAttentionId) {
    toolbarActions.append(button('返回恢复待确认', 'secondary', async () => {
      setStatus('正在返回稿件恢复比较…', 'busy');
      try {
        renderManuscriptRecovery(await window.ai7.getRecoveryComparison({ attentionId: recoveryAttentionId }));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '无法返回恢复比较。', 'error');
      }
    }));
  }
  toolbarActions.append(undo, redo, save, retryAuthoritativeRefreshButton);
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
        setStatus(error instanceof Error ? error.message : '待保存编辑未能排空；权威操作未开始。', 'error');
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
        setStatus(error instanceof Error ? error.message : '权威操作未完成；编辑器已恢复到当前持久状态。', 'error');
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
          setStatus(error instanceof Error ? error.message : '无法取消已失效的替换预览。', 'error');
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
      setStatus(`权威窗口仍无法刷新；编辑区继续保持只读，请再次重试。${error instanceof Error ? error.message : ''}`, 'error');
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
      setStatus(error instanceof Error ? error.message : '无法移动到该稿件位置。', 'error');
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
      setStatus(error instanceof Error ? error.message : '无法读取稿件结构。', 'error');
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
      setStatus(error instanceof Error ? error.message : '无法确认当前本地操作的取消状态。', 'error');
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
      if (completed.kind !== 'search' || !completed.result || 'replacement' in completed.result) throw new Error('查找结果绑定无效。');
      await loadSearchResults(null, completed.result.searchId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '全稿查找未完成。', 'error');
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
      setStatus(error instanceof Error ? error.message : '无法准备替换预览。', 'error');
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
          setStatus(error instanceof Error ? error.message : '替换集无法冻结。', 'error');
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
      setStatus(error instanceof Error ? error.message : '替换预览无法取消。', 'error');
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
            setStatus(error instanceof Error ? error.message : '无法关闭未提交的替换预览。', 'error');
          }
        }
        return;
      }
      setStatus(replacement.completionLabel, 'success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '替换提交未完成。', 'error');
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
      setStatus(error instanceof Error ? error.message : '里程碑未保存。', 'error');
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
      setStatus(error instanceof Error ? error.message : `${action === 'undo' ? '撤销' : '重做'}未完成。`, 'error');
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
            setStatus(error instanceof Error ? error.message : '无法取消已失效的替换预览。', 'error');
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
    element('p', 'lede', error instanceof Error ? error.message : '桌面操作未完成，请重试。'),
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

new MutationObserver(() => {
  if (document.documentElement.dataset['ai7ServiceState'] === 'interrupted') applyAuthorityInterruption();
  if (document.documentElement.dataset['ai7CloseState'] === 'blocked') {
    setStatus('当前编辑尚未获得持久写入确认，请先保存成功后再关闭窗口。', 'error');
    delete document.documentElement.dataset['ai7CloseState'];
  }
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-ai7-service-state', 'data-ai7-close-state'],
});

setCloseRisk(false);
void initializeStartup();
if (document.documentElement.dataset['ai7ServiceState'] === 'interrupted') applyAuthorityInterruption();
