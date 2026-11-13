import { filterChoices } from './components/controls.js';
import { identityWords, technicalDisclosure, technicalLayerVisible, technicalWords } from './technical-layer.js';
import { MAX_BATCH_APPLY_SUGGESTIONS } from '../shared/protocol.js';
import type { RendererApi, ProposalWorkspaceInput, ProposalWorkspaceProjection, ProposalNavigatorItem, ProposalReviewReturnPosition, ProposalDraftDisposition, ProposalDraftBatchProjection, EditorialMarkCardProjection, ManuscriptWindowProjection, ApplyReceiptProjection, BatchProposalDecisionDraftInput } from '../shared/protocol.js';
import { graphemesOf } from '../shared/mark-anchor.js';
import { mountWindowedList } from './windowed-list.js';
import { applyOnce } from './manuscript-apply.js';
import { mountPositionRail } from './position-rail.js';
import { DECISION_REASON_CHIPS } from './editorial-mark-labels.js';
import { proposalIdentityRows } from './technical-layer-labels.js';

const dispositions = { accepted: '拟采纳', rejected: '拟拒绝', deferred: '暂不决定' } as const;
const exclusionLabels = { 'guessed-anchor': '位置待确认，请逐条采纳', conflict: '未解决冲突', get 'unclassified-stale'() { return technicalWords('旧基准尚未分类', '原文已变化，尚未核对'); }, unloaded: '未加载', 'other-version': '其他版本',
  get 'atomic-group'() { return technicalWords('原子组需单独处理', '需一起处理的修改请单独处理'); }, applied: '已经应用' };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = identityWords(text, className); if (className) node.className = className; if (tag === 'button') node.className = `${node.className} btn`.trim(); return node;
}
function button(label: string, action: string, run: () => void): HTMLButtonElement {
  const node = el('button', label, 'secondary'); node.type = 'button'; node.dataset['proposalAction'] = action; node.addEventListener('click', run); return node;
}
/** Identities one disclosure away (ADR 0096 §3, ADR 0071 §1): 查看技术详情, closed by default. */
function technical(rows: ReadonlyArray<readonly [string, string]>): HTMLElement {
  const details = el('details', undefined, 'technical-details'); const list = el('dl');
  for (const [term, value] of rows) list.append(el('dt', term), el('dd', value, 'technical-identity'));
  details.append(el('summary', '查看技术详情'), list); return technicalDisclosure(details);
}
function region(title: string, ...nodes: HTMLElement[]): HTMLElement { const section = el('section', undefined, 'proposal-region'); section.append(el('h4', title), ...nodes); return section; }

/** Read metadata pages against one immutable scope digest; no comparison or manuscript text is loaded. */
export async function readProposalWorkspace(api: Pick<RendererApi, 'inspectProposalWorkspace'>, input: ProposalWorkspaceInput): Promise<ProposalWorkspaceProjection> {
  const first = await api.inspectProposalWorkspace({ ...input, offset: 0 });
  const items = [...first.items]; let decision = first.decision; let offset = first.nextOffset;
  while (offset !== null) {
    const page = await api.inspectProposalWorkspace({ ...input, offset });
    if (page.scopeDigest !== first.scopeDigest || (page.nextOffset !== null && page.nextOffset <= offset)) throw new Error('提案范围已变，请重新检查。');
    items.push(...page.items);
    if (decision !== null && page.decision !== null) decision = { ...decision,
      baseRevisionIds: [...new Set([...decision.baseRevisionIds, ...page.decision.baseRevisionIds])],
      items: [...decision.items, ...page.decision.items], unresolved: [...decision.unresolved, ...page.decision.unresolved] };
    offset = page.nextOffset;
  }
  return { ...first, items, decision, nextOffset: null };
}

/** Dedicated work workspace; only active comparison/card text is fetched. Navigation never decides. */
export function mountProposalWorkspace(options: {
  root: HTMLElement; api: RendererApi; input: ProposalWorkspaceInput; bookTitle: string;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  returnToManuscript(blockId: string | null, markId: string | null): Promise<void>;
  openConflict(markId: string): void;
}): { start(): void; destroy(): void; settle(): Promise<boolean> } {
  const { root, api, input } = options;
  const binding = { manuscriptId: input.manuscriptId, branchId: input.branchId };
  let workspace: ProposalWorkspaceProjection | null = null;
  let active: ProposalNavigatorItem | null = null;
  let position: ProposalReviewReturnPosition = { blockId: null, activeMarkId: null, comparison: 'inline', review: 'all', chapterBlockId: null, changeType: null, expanded: false };
  let destroyed = false; let generation = 0; let working = false; let autoAdvance = false;
  let preparedDecision: string | null = null;
  let draftUndo: Array<{ ids: string[]; disposition: ProposalDraftDisposition | null; group: string | null }> | null = null;
  const selected = new Set<string>();
  const header = el('header'); const toolbar = el('div', undefined, 'proposal-toolbar');
  const layout = el('div', undefined, 'proposal-layout');
  const nav = el('div', undefined, 'proposal-navigator'); const navigator = el('div'); const railTrack = el('div', undefined, 'position-rail');
  const comparison = el('main', undefined, 'proposal-comparison'); const controls = el('section', undefined, 'proposal-controls');
  const message = el('p'); message.setAttribute('role', 'status');
  const returnButton = button('返回稿件', 'return', () => void act(async () => { await persist(); await options.returnToManuscript(position.blockId, position.activeMarkId); }));
  header.append(el('h2', '提案审阅工作区'), el('p', options.bookTitle), returnButton);
  nav.append(navigator, railTrack); layout.append(nav, comparison); root.append(header, toolbar, layout, controls, message);
  const rail = mountPositionRail({ track: railTrack, api, binding: () => binding,
    jumpToBlock: (blockId) => { const index = filtered().findIndex((item) => item.blockId === blockId); if (index >= 0) list.activate(index); }, onError: () => {} });
  const list = mountWindowedList({ root: navigator, rowHeight: 64, viewportHeight: 448, label: '修改导航', key: (item: ProposalNavigatorItem) => item.markId,
    render: (item) => {
      const row = el('div', undefined, 'proposal-navigator-row'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(item.markId);
      checkbox.setAttribute('aria-label', `选择第 ${item.position} 段修改`);
      checkbox.addEventListener('click', (event) => event.stopPropagation());
      checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(item.markId); else selected.delete(item.markId); });
      row.append(checkbox, el('span', `${item.chapter} · 第 ${item.position} 段${technicalWords(` ${item.fromGrapheme}–${item.toGrapheme}`)} · ${item.changeType === 'replace' ? '替换' : item.changeType === 'insert' ? '插入' : '删除'}`),
        el('small', `${item.draft === null ? item.disposition === null ? '未审阅' : '已记录' : dispositions[item.draft]}${item.stale ? technicalWords(' · 旧基准', ' · 原文已变化') : ''}${item.conflict ? ' · 冲突' : ''}${item.atomicGroupId ? technicalWords(' · 原子组', ' · 需一起处理') : ''}`)); return row;
    }, onActivate: (item) => { active = item; position = { ...position, blockId: item.blockId, activeMarkId: item.markId }; rail.setPosition(workspace === null ? 0 : workspace.items.indexOf(item) / Math.max(1, workspace.items.length - 1)); void persist().catch(() => options.setStatus('审阅位置未能保存。', 'error')); void loadComparison(item).catch(() => { message.textContent = '无法加载此修改的精确对比。'; }); },
  });
  async function act(run: () => Promise<void>): Promise<void> {
    if (working || destroyed) return; working = true; root.setAttribute('aria-busy', 'true');
    try { await run(); } catch { message.textContent = '操作未完成；范围可能已变，请重新检查。'; options.setStatus(message.textContent, 'error'); }
    finally { working = false; root.setAttribute('aria-busy', 'false'); }
  }
  async function persist(): Promise<void> {
    await api.inspectProposalWorkspace({ ...input, returnPosition: position });
  }
  function filtered(): ProposalNavigatorItem[] { return (workspace?.items ?? []).filter((item) =>
    (position.chapterBlockId === null || item.chapterBlockId === position.chapterBlockId) && (position.changeType === null || item.changeType === position.changeType) &&
    (position.review === 'all' || (position.review === 'unreviewed' ? item.draft === null && item.disposition === null : position.review === 'reviewed' ? item.draft !== null || item.disposition !== null : position.review === 'stale' ? item.stale : item.conflict))); }
  function refreshList(): void { const items = filtered(); list.setItems(items, Math.max(0, items.findIndex((item) => item.markId === position.activeMarkId))); }
  async function refresh(): Promise<void> { workspace = await readProposalWorkspace(api, input); if (destroyed) return; refreshList(); renderControls(); if (active) { active = workspace.items.find((item) => item.markId === active!.markId) ?? null; if (active) await loadComparison(active); } }
  function selectFilter<T extends string>(label: string, values: ReadonlyArray<readonly [T, string]>, value: T, change: (value: T) => void): HTMLDivElement {
    const field = el('div', label);
    const choices = filterChoices({ label, choices: values, value, change: (next) => {
      change(next as T); refreshList(); renderControls();
      void persist().catch(() => options.setStatus('审阅位置未能保存。', 'error'));
    } });
    choices.dataset['proposalFilter'] = label;
    field.append(choices);
    return field;
  }
  async function previewBatch(request: BatchProposalDecisionDraftInput): Promise<ProposalDraftBatchProjection> {
    const first = await api.batchProposalDecisionDraft({ ...request, offset: 0 });
    const included = [...first.included]; const excluded = [...first.excluded]; let offset = first.nextOffset;
    while (offset !== null) {
      const page = await api.batchProposalDecisionDraft({ ...request, offset });
      if (page.scopeDigest !== first.scopeDigest || (page.nextOffset !== null && page.nextOffset <= offset)) throw new Error('批量范围已变，请重新检查。');
      included.push(...page.included); excluded.push(...page.excluded); offset = page.nextOffset;
    }
    return { ...first, included, excluded, nextOffset: null, workspace: await readProposalWorkspace(api, input) };
  }
  function renderToolbar(): void {
    message.textContent = workspace?.truncated ? '提案超过本次可审阅的精确范围；本次不能记录或批量执行，请按结果分开审阅。' : `共 ${workspace?.totalItems ?? 0} 项修改；浏览与筛选不会记录决定。`;
    const chapters = [...new Map((workspace?.items ?? []).filter((item) => item.chapterBlockId !== null).map((item) => [item.chapterBlockId!, item.chapter])).entries()];
    const advance = el('input'); advance.type = 'checkbox'; advance.addEventListener('change', () => { autoAdvance = advance.checked; }); const advanceLabel = el('label', '选择后前往下一未决定项'); advanceLabel.append(advance);
    toolbar.replaceChildren(selectFilter('审阅状态', [['all', '全部'], ['unreviewed', '未审阅'], ['reviewed', '已审阅'], ['stale', technicalWords('旧基准', '原文已变化')], ['conflicting', '冲突']] as const, position.review, (value) => { position.review = value; }),
      selectFilter('章节', [['', '全部章节'], ...chapters], position.chapterBlockId ?? '', (value) => { position.chapterBlockId = value || null; }),
      selectFilter('修改类型', [['', '全部类型'], ['replace', '替换'], ['delete', '删除'], ['insert', '插入']] as const, position.changeType ?? '', (value) => { position.changeType = value || null; }), advanceLabel);
  }
  async function loadComparison(item: ProposalNavigatorItem): Promise<void> {
    const ticket = ++generation; const [card, window] = await Promise.all([api.getEditorialMarkCard({ manuscriptId: input.manuscriptId, branchId: input.branchId, markId: item.markId }),
      api.getManuscriptWindowAt({ manuscriptId: input.manuscriptId, branchId: input.branchId, target: { kind: 'block', blockId: item.blockId } })]);
    if (destroyed || ticket !== generation) return; paintComparison(item, card, window);
  }
  function paintComparison(item: ProposalNavigatorItem, card: EditorialMarkCardProjection, window: ManuscriptWindowProjection): void {
    const suggestion = card.suggestion; if (!suggestion) return;
    comparison.dataset['proposalActive'] = item.markId; comparison.dataset['comparisonMode'] = position.comparison;
    const content = el('div', undefined, position.comparison === 'side-by-side' ? 'proposal-side-by-side' : 'proposal-inline');
    const current = window.blocks.find((block) => block.blockId === item.blockId);
    const words = current ? graphemesOf(current.text) : [];
    const context = `${words.slice(Math.max(0, item.fromGrapheme - 40), item.fromGrapheme).join('')}〔当前范围〕${words.slice(item.toGrapheme, item.toGrapheme + 40).join('')}`;
    const before = el('div'); before.append(el('h5', technicalWords('提案基准', '原文')), el('del', suggestion.currentText));
    const now = el('div'); now.append(el('h5', technicalWords('当前权威稿件', '当前稿件')), el('p', words.slice(item.fromGrapheme, item.toGrapheme).join('')));
    const proposed = el('div'); proposed.append(el('h5', '提议内容（未应用）'), el('ins', suggestion.proposedText || '（删去）'));
    content.append(before, now, proposed);
    const yours = region('你的处理'); const group = item.atomicGroupId === null ? [item] : workspace!.items.filter((entry) => entry.atomicGroupId === item.atomicGroupId);
    if (item.atomicGroupId !== null) {
      const members = el('ul'); for (const member of group) members.append(el('li', `${member.chapter} · 第 ${member.position} 段${technicalWords(` ${member.fromGrapheme}–${member.toGrapheme}`)}`));
      yours.append(el('p', technicalWords(`原子组依赖与部分采纳后果：${item.atomicReason ?? '依赖说明缺失，不能处理'}`, `这些修改需要一起处理${item.atomicReason === null ? '' : `：${item.atomicReason}`}`)), members,
        el('p', technicalWords('以下一个处理适用于全部成员；拆分需要新的提案版本。', '以下处理适用于这一组全部修改。')));
    }
    if (item.appliedRevisionId === null) for (const disposition of ['accepted', 'rejected', 'deferred'] as const) {
      const control = button(dispositions[disposition], `draft-${disposition}`, () => void act(async () => {
        draftUndo = [{ ids: group.map((entry) => entry.markId), disposition: item.draft, group: item.atomicGroupId }];
        workspace = await api.saveProposalDecisionDraft({ ...input, markIds: group.map((entry) => entry.markId), disposition, atomicGroupId: item.atomicGroupId, expectedScopeDigest: workspace!.scopeDigest });
        await refresh();
        if (autoAdvance) { const index = filtered().findIndex((entry) => entry.draft === null && entry.disposition === null && entry.appliedRevisionId === null); if (index >= 0) list.activate(index); }
      })); control.disabled = disposition === 'accepted' && group.some((member) => member.conflict || !member.loaded); yours.append(control);
    }
    if (item.conflict) yours.append(button('解决冲突…', 'conflict', () => options.openConflict(item.markId)));
    yours.append(el('p', item.appliedRevisionId !== null ? '已应用 · 已写入稿件' : item.disposition === 'accepted' || item.disposition === 'accepted-with-edit' ? '已采纳 · 尚未应用' : item.draft !== null ? `${dispositions[item.draft]} · 草稿已保存，尚未记录决定` : '尚未选择处理。'));
    const decision = suggestion.decision;
    if (decision !== null) {
      if (decision.reason !== null) yours.append(el('p', `你的原因：${decision.reason}`));
      const reasons = el('details'); reasons.append(el('summary', '你的原因 · 可选'));
      const saveReason = (reason: string, reasonSource: 'suggested' | 'free-text'): void => void act(async () => {
        const target = { ...binding, windowStartBlockId: item.blockId, markId: item.markId, decisionId: decision.decisionId, reason, reasonSource };
        if (decision.reasonState === 'given') await api.recordProposalDecisionFeedback({ ...target, action: 'revise', expectedFeedback: decision.feedbackEntries });
        else await api.recordProposalDecisionReason(target);
        await refresh();
      });
      for (const chip of DECISION_REASON_CHIPS[decision.disposition]) reasons.append(button(chip, 'reason-chip', () => saveReason(chip, 'suggested')));
      const label = el('label', '其他 / 自行输入'); const field = el('textarea'); field.maxLength = 2000; label.append(field);
      const save = button('保存你的原因', 'reason-own', () => saveReason(field.value.trim(), 'free-text')); save.disabled = true;
      field.addEventListener('input', () => { save.disabled = field.value.trim().length === 0; }); reasons.append(label, save); yours.append(reasons);
    }
    comparison.replaceChildren(...(item.stale ? [el('p', technicalWords('旧基准，按精确范围核对', '原文已变化，请核对'))] : []), technical(proposalIdentityRows({ 基准修订: item.baseRevisionId, 当前修订: window.revisionId, 应用后的稿件修订: item.appliedRevisionId })),
      button(position.comparison === 'inline' ? '并排对比' : '行内对比', 'comparison', () => { position.comparison = position.comparison === 'inline' ? 'side-by-side' : 'inline'; void persist().catch(() => options.setStatus('审阅位置未能保存。', 'error')); paintComparison(item, card, window); }),
      region('修改内容', content, (() => { const detail = el('details'); detail.open = position.expanded; detail.append(el('summary', '周围语境'), el('p', context)); detail.addEventListener('toggle', () => { position.expanded = detail.open; void persist().catch(() => options.setStatus('审阅位置未能保存。', 'error')); }); return detail; })()), region('修改理由', el('p', suggestion.rationale || '没有填写修改理由。')),
      region('依据与核查', el('p', '支持资料与核查状态见原修改建议卡。'), button('在稿件中查看', 'source-card', () => void options.returnToManuscript(item.blockId, item.markId))), yours);
    if (suggestion.application !== null) void api.inspectApplyReceipt({ ...binding, clientEffectId: suggestion.application.effectId, recovery: 'settled' }).then((receipt) => { if (!destroyed && active?.markId === item.markId) yours.append(receiptCard(receipt)); }).catch(() => {});
  }
  function receiptCard(receipt: ApplyReceiptProjection): HTMLElement {
    const node = el('section', undefined, 'proposal-receipt'); node.dataset['applyReceiptState'] = receipt.state;
    const labels = { applied: '已应用', 'not-applied': '未应用', confirming: '正在确认应用结果', unresolved: '结果待确认' } as const;
    node.append(el('h4', labels[receipt.state]), el('p', receipt.reason), button('在稿件中查看', 'receipt-manuscript', () => void options.returnToManuscript(position.blockId, position.activeMarkId)),
      button('返回提案', 'receipt-proposal', () => { controls.replaceChildren(); renderControls(); }));
    node.append(el('p', `${options.bookTitle} · 你 · ${receipt.approvedAt ?? '尚无批准记录'} · ${receipt.application?.changeCount ?? 0} 处写入`), technical(proposalIdentityRows({ 分支: receipt.branchId })));
    if (receipt.safeRetry && receipt.state === 'not-applied') node.append(button('重新应用', 'safe-reprepare', () => void act(applyAccepted)));
    // EREC-005: no retry while 结果待确认; the editor's re-check reads the authoritative records and dispatches nothing.
    if (receipt.state === 'unresolved') node.append(button('重新核对应用结果', 'receipt-recheck', () => void act(async () => {
      const next = await api.inspectApplyReceipt({ ...binding, clientEffectId: receipt.clientEffectId, recovery: 'recheck' });
      if (!destroyed) node.replaceWith(receiptCard(next));
    })));
    // The raw receipt is diagnostics only (Issue #1431 item 23): the whole disclosure, never an empty shell, in ordinary mode.
    if (technicalLayerVisible) { const details = el('details'); details.append(el('summary', '查看完整凭据'), el('pre', JSON.stringify(receipt, null, 2))); node.append(technicalDisclosure(details)); }
    return node;
  }
  function renderControls(): void {
    controls.replaceChildren(); if (!workspace) return;
    if (draftUndo) controls.append(button('撤销上次草稿处理', 'draft-undo', () => void act(async () => {
      for (const undo of draftUndo!) workspace = await api.saveProposalDecisionDraft({ ...input, markIds: undo.ids, disposition: undo.disposition, atomicGroupId: undo.group, expectedScopeDigest: workspace!.scopeDigest }); draftUndo = null; await refresh();
    })));
    for (const [scope, label] of [['selection', '已选修改'], ['chapter', '当前章节'], ['change-type', '当前修改类型'], ['filter', '当前筛选']] as const) {
      for (const disposition of ['accepted', 'rejected', 'deferred'] as const) {
        controls.append(button(`${dispositions[disposition]} · ${label}`, `batch-${scope}-${disposition}`, () => void act(() => saveBatch(scope, disposition))));
      }
    }
    controls.append(button('采纳全部无冲突项', 'accept-conflict-free', () => void act(() => saveBatch('filter', 'accepted', []))));
    const summary = el('details'); summary.append(el('summary', `提案决定范围 · ${workspace.items.filter((item) => item.draft !== null).length} 项草稿 · ${workspace.items.filter((item) => item.draft === null || item.draft === 'deferred' || item.conflict).length} 项未解决`));
    const rows = el('ul'); for (const item of workspace.items) rows.append(el('li', `第 ${item.position} 段 · ${item.draft === null ? '未决定' : dispositions[item.draft]}${item.conflict ? ' · 冲突' : ''}`)); summary.append(rows);
    controls.append(summary, button('应用已采纳修改', 'apply-accepted', () => void act(applyAccepted)));
  }
  /**
   * A batch button saves its drafts at once (Issue #1410 item 8): the scope is frozen and confirmed in the same step, what was
   * left out is said with its reason, and 撤销上次草稿处理 takes the batch back.
   */
  async function saveBatch(scope: 'selection' | 'chapter' | 'change-type' | 'filter', disposition: ProposalDraftDisposition, markIds: string[] = [...selected]): Promise<void> {
    const request = { ...input, scope, markIds, chapterBlockId: position.chapterBlockId, changeType: position.changeType, review: position.review, disposition };
    const frozen = await previewBatch({ ...request, confirmDigest: null });
    if (frozen.included.length > 0) {
      const undo = frozen.included.map((id) => { const item = frozen.workspace.items.find((entry) => entry.markId === id)!; return { ids: [id], disposition: item.draft, group: null }; });
      await api.batchProposalDecisionDraft({ ...request, confirmDigest: frozen.scopeDigest });
      draftUndo = undo; await refresh();
    }
    renderBatchOutcome(frozen);
  }
  function renderBatchOutcome(frozen: ProposalDraftBatchProjection): void {
    const outcome = el('section', undefined, 'proposal-batch-outcome'); outcome.setAttribute('role', 'status');
    const left = frozen.excluded.length > 0 ? `，${frozen.excluded.length} 项未纳入` : '';
    outcome.append(el('p', frozen.included.length > 0 ? `已保存 ${frozen.included.length} 项草稿${left}；稿件未发生变化。` : `没有可处理的修改${left}。`));
    const guessedCount = frozen.excluded.filter((item) => item.reason === 'guessed-anchor').length;
    if (guessedCount > 0) outcome.append(el('p', `位置待确认 ${guessedCount} 项：请逐条采纳。`));
    if (frozen.excluded.length > 0) {
      const excluded = el('ul'); for (const item of frozen.excluded) { const found = workspace!.items.find((entry) => entry.markId === item.markId); excluded.append(el('li', `未纳入：${found ? `${found.chapter} · 第 ${found.position} 段 ${found.fromGrapheme}–${found.toGrapheme}` : '不在本次范围的修改项'} · ${exclusionLabels[item.reason]}`)); }
      outcome.append(excluded);
    }
    controls.prepend(outcome);
  }
  /**
   * 应用已采纳修改 (Issue #1410 item 8): the drafts are recorded as the decision, the accepted changes that can be applied are
   * gathered, and they are applied in one step; with nothing accepted the manuscript stays as it was and the line says so.
   */
  async function applyAccepted(): Promise<void> {
    if (!workspace) return;
    if (workspace.items.some((item) => item.draft !== null)) {
      workspace = await api.recordProposalDecision({ ...input, expectedScopeDigest: workspace.scopeDigest, clientDecisionId: crypto.randomUUID() });
      await refresh();
    }
    workspace = await readProposalWorkspace(api, input); preparedDecision = workspace.decision?.decisionId ?? null;
    const ready = workspace.decision?.items.filter((entry) => entry.disposition === 'accepted' && workspace!.items.some((item) => item.markId === entry.markId && item.decisionId === entry.decisionId && item.disposition === 'accepted' && !item.conflict && item.loaded && item.appliedRevisionId === null)).map((entry) => entry.markId) ?? [];
    renderControls();
    if (preparedDecision === null || ready.length === 0) { message.textContent = '提案决定已记录；没有可应用的已采纳修改，稿件未发生变化。'; return; }
    // One Effect carries at most the existing batch bound; the line says so instead of sending what would be refused.
    if (ready.length > MAX_BATCH_APPLY_SUGGESTIONS) { message.textContent = `一次应用最多 ${MAX_BATCH_APPLY_SUGGESTIONS} 项；请按章节或筛选分开应用。`; return; }
    const fresh = await readProposalWorkspace(api, input);
    if (fresh.scopeDigest !== workspace.scopeDigest || fresh.decision?.decisionId !== preparedDecision) { await refresh(); message.textContent = '决定或稿件已变，请再试一次。'; return; }
    const first = workspace.items.find((item) => item.markId === ready[0])!;
    let effectIdentity = '';
    const result = await applyOnce(input, (clientEffectId) => { effectIdentity = clientEffectId; return api.applyChangeSuggestionBatch({ manuscriptId: input.manuscriptId, branchId: input.branchId, windowStartBlockId: first.blockId, markIds: ready, clientEffectId }); },
      (target) => api.getManuscriptApplyOutcome(target), undefined, async (clientEffectId, state) => {
        const status = el('p', state === 'confirming' ? '正在确认应用结果' : '结果待确认'); status.dataset['applyReceiptState'] = state; controls.replaceChildren(status);
        const receipt = await api.inspectApplyReceipt({ ...binding, clientEffectId, recovery: state }); if (!destroyed) controls.replaceChildren(receiptCard(receipt));
      });
    if (result.acknowledged) { const receipt = await api.inspectApplyReceipt({ ...binding, clientEffectId: result.result.application.effectId, recovery: 'settled' }); await refresh(); controls.prepend(receiptCard(receipt)); message.textContent = `已应用 ${ready.length} 项已采纳修改。`; }
    else if (result.outcome !== null) { const receipt = await api.inspectApplyReceipt({ ...binding, clientEffectId: effectIdentity, recovery: 'settled' }); await refresh(); controls.prepend(receiptCard(receipt)); message.textContent = result.outcome.state === 'committed' ? '已应用，结果从记录确认。' : '未应用，请再试一次。'; }
  }
  return { start() { void act(async () => { workspace = await readProposalWorkspace(api, input); position = workspace.returnPosition ?? position; renderToolbar(); refreshList(); renderControls(); rail.refresh();
      const first = filtered().find((item) => item.markId === position.activeMarkId) ?? filtered()[0]; if (first) list.activate(filtered().indexOf(first), false); }); },
    destroy() { destroyed = true; generation += 1; list.destroy(); rail.destroy(); },
    async settle() { if (working) return false; try { await persist(); return true; } catch { return false; } },
  };
}
