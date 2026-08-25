import type {
  FidelityCategoryProjection,
  ImportCommitProjection,
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
  details.append(
    element('dt', undefined, '格式'),
    element('dd', undefined, staged.source.format),
    element('dt', undefined, '来源'),
    element('dd', undefined, staged.source.provenanceLabel),
    element('dt', undefined, '检测结果'),
    element('dd', undefined, `${staged.detectedBlockCount} 个可编辑内容块`),
  );
  card.append(details);
  return card;
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
      renderTargetChoice(result.staged, false);
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

function renderTargetChoice(staged: StagedImportProjection, selected: boolean): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '步骤 1 / 3'),
    element('h2', undefined, '选择稿件导入目标'),
    element('p', 'lede', '系统不会替你选择。先明确这份来源要建立什么关系。'),
    sourceCard(staged),
  );
  const choices = element('fieldset');
  const legend = element('legend', undefined, '稿件导入目标');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-label', '稿件导入目标');
  const choice = element('label', 'choice');
  const radio = element('input');
  radio.type = 'radio';
  radio.name = 'import-target';
  radio.value = 'new-book';
  radio.setAttribute('aria-label', '新建图书');
  radio.checked = selected;
  const copy = element('span');
  copy.append(element('strong', undefined, '新建图书'), element('small', undefined, '以这份来源建立图书、主稿件、r1 和工作流程实例'));
  choice.append(radio, copy);
  choices.append(legend, choice);
  content.append(choices);
  radio.addEventListener('change', () => renderTargetChoice(staged, true));

  if (selected) {
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
          confirmedTitle,
        });
        setStatus('导入前复核已准备', 'success');
        renderReview(review);
      } catch (error) {
        renderError(error, renderLanding);
      }
    });
    form.append(label, title, note, fidelityTable(staged.fidelity), element('div', 'button-row'));
    form.lastElementChild?.append(confirm);
    content.append(form);
    queueMicrotask(() => title.focus());
  }

  replaceScreen(selected ? 'title' : 'target', content);
}

function listSection(title: string, items: ReadonlyArray<string>): HTMLElement {
  const section = element('section', 'review-section');
  section.append(element('h3', undefined, title));
  const list = element('ul');
  for (const item of items) list.append(element('li', undefined, item));
  section.append(list);
  return section;
}

function renderReview(review: ReviewBeforeImportProjection): void {
  const content = panel();
  content.append(
    element('p', 'section-label', '步骤 2 / 3 · 导入前复核'),
    element('h2', undefined, '导入前复核'),
    element('p', 'lede', '最后一次确认：下面的记录会在一个事务中一起创建；列出的非影响不会随导入发生。'),
  );
  const identity = element('section', 'source-card');
  identity.append(element('h3', undefined, `${review.target.label} · ${review.target.confirmedTitle}`));
  const identityDetails = element('dl');
  identityDetails.append(
    element('dt', undefined, '本地来源'),
    element('dd', undefined, review.source.displayName),
    element('dt', undefined, '来源边界'),
    element('dd', undefined, review.source.provenanceLabel),
    element('dt', undefined, '最终动作'),
    element('dd', undefined, '新建图书并导入稿件'),
  );
  identity.append(identityDetails);
  content.append(identity);

  const fidelity = element('section', 'review-section');
  fidelity.append(element('h3', undefined, '导入保真审阅 · 8 类'), fidelityTable(review.fidelity));
  content.append(fidelity);

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

  const commitBar = element('section', 'commit-bar');
  const explanation = element('div');
  explanation.append(
    element('strong', undefined, '一次提交，不能部分创建'),
    element('div', 'field-note', '本次符合范围的导入不创建导入降级决定，也不提供 DOCX 往返保证。'),
  );
  const commitButton = button('新建图书并导入稿件', 'primary', async () => {
    commitButton.disabled = true;
    setStatus('正在原子提交图书与稿件记录…', 'busy');
    try {
      const result = await window.ai7.commitNewBookImport({
        draftId: review.draftId,
        expectedDraftVersion: review.draftVersion,
        reviewDigest: review.reviewDigest,
      });
      setStatus(result.completionLabel, 'success');
      renderImported(result);
    } catch (error) {
      commitButton.disabled = false;
      setStatus(error instanceof Error ? error.message : '导入未完成，请重试。', 'error');
    }
  });
  commitBar.append(explanation, commitButton);
  content.append(commitBar);
  replaceScreen('review', content);
}

function renderImported(result: ImportCommitProjection): void {
  const content = panel();
  content.classList.add('completion');
  content.append(
    element('div', 'completion-mark', '✓'),
    element('p', 'section-label', '步骤 3 / 3'),
    element('h2', undefined, result.completionLabel),
    element('p', 'lede', '图书、维度集、来源与保真记录、主稿件、主分支、r1、工作流程实例和稿件导入记录已一起创建。'),
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
      element('p', 'field-note', '这不是稿件检查点、里程碑版本、导出回执、往返保证或发布事实。'),
    );
    content.append(detail);
  });
  actions.append(open, record);
  content.append(actions);
  replaceScreen('imported', content);
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
renderLanding();
if (document.documentElement.dataset['ai7ServiceState'] === 'interrupted') applyAuthorityInterruption();
