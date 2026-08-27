import type {
  FidelityCategoryProjection,
  ContinueImportProjection,
  ImportCommitProjection,
  ImportDraftRecoveryProjection,
  ImportStartupProjection,
  ReviewBeforeImportProjection,
  StagedImportProjection,
} from '../shared/protocol.js';
import { mountBoundedEditor, type BoundedEditor } from './editor.js';

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

async function acknowledgeCompletionAfterPaint(result: ImportCommitProjection): Promise<void> {
  await waitForVisibleProductReady();
  await nextVisibleFrame();
  await nextVisibleFrame();
  const presentedCommitId = screen.querySelector<HTMLElement>('[data-import-commit-id]')?.dataset['importCommitId'];
  if (
    !productIsVisibleAndReady() ||
    screen.dataset['screen'] !== 'imported' ||
    presentedCommitId !== result.commitId
  ) {
    return;
  }
  document.documentElement.dataset['ai7ImportCompletionPainted'] = 'true';
  try {
    await window.ai7.acknowledgeImportCompletion({ commitId: result.commitId });
    document.documentElement.dataset['ai7ImportCompletionAcknowledged'] = 'true';
  } catch {
    setStatus('导入已由权威记录证明；完成提示将在下次启动时再次显示。', 'error');
  }
}

function renderStartupProjection(startup: ImportStartupProjection): void {
  if (startup.state === 'none') {
    renderLanding();
    return;
  }
  if (startup.state === 'committed-recovered') {
    setStatus('已核对中断前的原子提交结果', 'success');
    renderImported(startup.result);
    return;
  }
  renderImportRecovery(startup.recovery);
}

function renderContinuation(continuation: ContinueImportProjection): void {
  if (continuation.state === 'target-review-required') {
    setStatus(continuation.reviewInvalidated ? '旧复核已失效，需要重新确认' : '暂存快照已重新校验', 'success');
    renderTargetChoice(continuation.staged, null, continuation.notice);
    return;
  }
  if (continuation.state === 'review-ready') {
    setStatus('暂存快照与导入前复核已重新校验', 'success');
    renderReview(continuation.review, continuation.notice);
    return;
  }
  if (continuation.state === 'committed-recovered') {
    setStatus('已核对中断前的原子提交结果', 'success');
    renderImported(continuation.result);
    return;
  }
  renderImportRecovery(continuation.recovery);
}

async function abandonAndContinue(recovery: Pick<ImportDraftRecoveryProjection, 'draftId' | 'draftVersion'>): Promise<void> {
  setStatus('正在核对提交证据并放弃非权威草稿…', 'busy');
  try {
    const startup = await window.ai7.abandonImportDraft({
      draftId: recovery.draftId,
      expectedDraftVersion: recovery.draftVersion,
    });
    setStatus(startup.state === 'none' ? '已放弃导入草稿并安全清理暂存引用' : '已核对导入状态', 'success');
    renderStartupProjection(startup);
  } catch (error) {
    renderError(error, () => void initializeStartup());
  }
}

function renderImportRecovery(recovery: ImportDraftRecoveryProjection): void {
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
    actions.append(button('重试放弃清理', 'primary', () => abandonAndContinue(recovery)));
    content.append(support, actions);
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
    replaceScreen('import-uncertain', content);
    setStatus('导入提交结果待确认；已阻止重试、放弃和清理', 'error');
    return;
  }

  const actions = element('div', 'button-row recovery-actions');
  if (recovery.snapshotState === 'complete') {
    const abandonButton = button('放弃', 'secondary', () => abandonAndContinue(recovery));
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
        );
      } catch (error) {
        renderError(error, () => void initializeStartup());
      }
    });
    actions.append(continueButton, abandonButton);
  } else {
    const abandonButton = button('放弃', 'secondary', () => abandonAndContinue(recovery));
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
          renderImportRecovery(recovery);
          setStatus('已取消文件重选');
          return;
        }
        renderContinuation(result.continuation);
      } catch (error) {
        renderError(error, () => void initializeStartup());
      }
    });
    actions.append(reselect, abandonButton);
  }
  content.append(actions);
  replaceScreen('import-recovery', content);
  setStatus('等待你选择继续导入或放弃');
}

function renderLanding(): void {
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
      renderTargetChoice(result.staged, null);
    } catch (error) {
      renderError(error, renderLanding);
    }
  });
  copy.append(steps, importButton);
  const note = element('aside', 'hero-note', '不会先创建空图书。只有最后的“新建图书并导入稿件”会提交业务记录。');
  content.append(copy, note);
  replaceScreen('landing', content);
  setStatus('准备就绪');
}

function renderTargetChoice(
  staged: StagedImportProjection,
  selectedChoiceId: StagedImportProjection['targetChoices'][number]['id'] | null,
  recoveryNotice?: string,
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
  radio.addEventListener('change', () => renderTargetChoice(staged, targetChoice.id, recoveryNotice));

  const cancelImport = button('取消导入', 'quiet', () =>
    abandonAndContinue({ draftId: staged.draftId, draftVersion: staged.draftVersion }),
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
        renderReview(review);
      } catch (error) {
        renderError(error, renderLanding);
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

function renderReview(review: ReviewBeforeImportProjection, recoveryNotice?: string): void {
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
          renderReview(acceptedReview, recoveryNotice);
        } catch (error) {
          renderError(error, renderLanding);
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
        renderImported(result);
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
        abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }),
      ),
    );
    commitBar.append(explanation, actions);
    content.append(commitBar);
  } else {
    const actions = element('div', 'button-row');
    actions.append(
      button('取消导入', 'quiet', () =>
        abandonAndContinue({ draftId: review.draftId, draftVersion: review.draftVersion }),
      ),
    );
    content.append(actions);
  }
  replaceScreen('review', content);
}

function renderImported(result: ImportCommitProjection): void {
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
  const open = button('打开稿件', 'primary', () => renderEditor(result));
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
  replaceScreen('imported', content);
  void acknowledgeCompletionAfterPaint(result);
}

function renderEditor(result: ImportCommitProjection): void {
  const content = panel();
  content.classList.add('editor-shell');
  const toolbar = element('header', 'editor-toolbar');
  const title = element('div');
  title.append(element('p', 'section-label', '主稿件 · 主分支'), element('h2', undefined, `稿件修订版 ${result.firstWindow.revisionLabel}`));
  const meta = element('div', 'editor-meta');
  const position = element('span', undefined, result.firstWindow.position.label);
  const revision = element('span', undefined, `当前修订版 ${result.firstWindow.revisionLabel}`);
  const journal = element('span', undefined, `修订日志序号 ${result.firstWindow.journalSequence}`);
  meta.append(position, revision, journal);
  title.append(meta);
  const save = button('保存当前编辑', 'primary', () => editor?.flush());
  save.disabled = true;
  save.title = window.ai7.platform === 'darwin' ? '快捷键 Command+S' : '快捷键 Ctrl+S';
  toolbar.append(title, save);
  const editorWindow = element('section', 'editor-window');
  const editorHost = element('div');
  editorWindow.append(editorHost);
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
    element('dd', undefined, result.firstWindow.revisionLabel),
  );
  identities.append(identityGrid);
  content.append(toolbar, editorWindow, identities);
  replaceScreen('editor', content);
  editor = mountBoundedEditor({
    host: editorHost,
    platform: window.ai7.platform,
    initialWindow: result.firstWindow,
    flushJournalEdit: (input) => window.ai7.flushJournalEdit(input),
    onStateChange: (state) => {
      save.disabled = !state.dirty || state.saving || state.interrupted;
      journal.textContent = `修订日志序号 ${state.journalSequence}`;
      setCloseRisk(state.dirty || state.saving || state.retryRequired || (state.interrupted && state.dirty));
    },
    onAnnouncement: setStatus,
  });
  editor.focus();
  setStatus(`稿件窗口已打开；${result.firstWindow.position.label}。`);
}

function renderError(error: unknown, retry: () => void): void {
  const content = panel();
  content.classList.add('error-panel');
  content.append(
    element('p', 'section-label', '操作未完成'),
    element('h2', undefined, '无法继续本次导入'),
    element('p', 'lede', error instanceof Error ? error.message : '桌面操作未完成，请重试。'),
    button('重新开始', 'primary', retry),
  );
  replaceScreen('error', content);
  setStatus('操作未完成', 'error');
}

async function initializeStartup(): Promise<void> {
  setStatus('正在核对本地恢复状态…', 'busy');
  try {
    renderStartupProjection(await window.ai7.getImportStartup());
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
