import type { FindingsBatchFeedback } from './manuscript-apply.js';
import { retainPollInteraction, pollControlEngaged } from './poll-interaction.js';
import { filterChoices, listPosition, stateTerm, type StateTone } from './components/controls.js';
import { createButton } from './components/controls.js';
import type { BookFindingProjection, BookFindingsReadProjection, InspectBookFindingsInput } from '../shared/protocol.js';
import { FINDINGS_CENTER_WORDS } from './findings-center-labels.js';
import { serviceWords } from './service-wording.js';
import { houseAnnotationWords } from './editorial-mark-labels.js';

// One status vocabulary on the three finding lists (Issue #1531): the review page's, the 批注栏's and 待办汇总's.
const STATUS_TONES: Readonly<Record<string, StateTone>> = {
  '未覆盖': 'attention', '待处理': 'progress', '已处理': 'good', '已忽略': 'neutral',
};

export type FindingTextTarget = { ordinal?: number | undefined; manuscriptId: string; branchId: string; blockId: string; markId: string | null };

export function mountFindingsCenter(root: HTMLElement, read: (input: InspectBookFindingsInput) => Promise<BookFindingsReadProjection>, open: (item: BookFindingProjection) => void,
  apply?: (items: BookFindingProjection[]) => Promise<FindingsBatchFeedback | void>, newReview?: () => void, goToText?: (target: FindingTextTarget) => Promise<void>): void {
  let offset = 0;
  let generation = 0;
  let category = '', severity = '', status = '';
  let version: string | undefined;
  let busy = false, loading = false, reload = false;
  let settleFilters = (): void => {};
  let feedback: FindingsBatchFeedback | void;
  const recoveryReason = '仍有应用或撤销结果待确认，请先核对未知结果。';
  const paintFeedback = (): void => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-finding-apply], [data-findings-batch]')) {
      button.disabled = busy || Boolean(feedback?.recover); button.title = feedback?.recover ? recoveryReason : '';
    }
    root.querySelector('.findings-apply-feedback')?.remove();
    if (!feedback) return;
    const bar = document.createElement('section'); bar.className = 'findings-apply-feedback attention-note'; bar.setAttribute('role', feedback.attention ? 'alert' : 'status');
    const words = document.createElement('p'); words.textContent = feedback.message; bar.append(words);
    if (feedback.recover) { const reason = document.createElement('p'); reason.className = 'findings-apply-blocked'; reason.textContent = recoveryReason; bar.append(reason); }
    for (const [label, action] of [['撤销已确认应用', feedback.undo], ['核对未知结果', feedback.recover]] as const) {
      if (!action) continue;
      const button = createButton(); button.textContent = label;
      button.disabled = Boolean(feedback.recover && action !== feedback.recover); if (button.disabled) button.title = recoveryReason;
      button.addEventListener('click', () => { if (busy || (feedback?.recover && action !== feedback.recover)) return; busy = true; generation++; button.disabled = true; void action().then((next) => { feedback = next; }).finally(() => { busy = false; paintFeedback(); void load(); }); }); bar.append(button);
    }
    root.insertBefore(bar, root.querySelector('.findings-filters'));
  };
  const perform = async (items: BookFindingProjection[]): Promise<void> => {
    if (busy || !apply || feedback?.recover) return; busy = true; generation++;
    root.querySelector('.findings-confirm')?.remove();
    try { feedback = await apply(items); } finally { busy = false; paintFeedback(); void load(); }
  };
  const decide = async (item: BookFindingProjection, button: HTMLButtonElement): Promise<void> => {
    const decision = item.decision;
    if (busy || !decision) return;
    busy = true; generation++; button.disabled = true;
    root.querySelector('.findings-confirm')?.remove();
    try {
      if (decision.kind === 'ignore') {
        const { reviewRunId, findingId, disposition, reason } = decision.input;
        await window.ai7.recordReviewFindingDisposition({ reviewRunId, findingId, disposition, reason });
      }
      else {
        const { manuscriptId, branchId } = decision.input;
        await window.ai7.getManuscriptWindow({ manuscriptId, branchId, cursor: null });
        await window.ai7.recordChangeSuggestionDecision({ ...decision.input, clientDecisionId: crypto.randomUUID() });
      }
    } catch {
      const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = '未能完成处理，请重试。';
      button.parentElement?.querySelector('[role="alert"]')?.remove(); button.parentElement?.append(message);
    } finally { busy = false; button.disabled = false; void load(); }
  };
  const load = async (): Promise<void> => {
    if (busy || loading) { reload = true; return; } loading = true; reload = false;
    const request = ++generation;
    root.setAttribute('aria-busy', 'true');
    try {
      const page = await read({ whole: true, ...(version === undefined ? {} : { since: version }), filters: { category, severity, status } });
      if (!root.isConnected || request !== generation || pollControlEngaged(root) || root.querySelector('.findings-confirm')) return;
      version = page.version;
      if (page.unchanged) { settleFilters(); return; }
      const allItems = [...page.items];
      const restoreInteraction = retainPollInteraction(root);
      const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
      const focusedRow = focused?.closest<HTMLElement>('[data-finding-id]');
      const focusedIndex = focusedRow ? Array.from(root.querySelectorAll('[data-finding-id]')).indexOf(focusedRow) : -1;
      const batchItems = allItems;
      root.replaceChildren();
      root.dataset['findingsState'] = 'ready';
      root.dataset['findingsTotal'] = String(page.total);
      const heading = document.createElement('h2'); heading.textContent = FINDINGS_CENTER_WORDS.heading;
      if (page.groups.length === 0) {
        const card = document.createElement('section'); card.className = 'findings-empty surface-empty';
        const message = document.createElement('p'); message.textContent = FINDINGS_CENTER_WORDS.empty;
        const start = createButton(); start.classList.add('primary'); start.textContent = '新建审阅';
        start.addEventListener('click', () => newReview?.()); start.disabled = !newReview;
        card.append(heading, stateTerm('暂无待处理项'), message, start); root.append(card); paintFeedback();
        restoreInteraction(); if (focused) start.focus({ preventScroll: true });
        return;
      }
      const summary = document.createElement('p'); summary.textContent = FINDINGS_CENTER_WORDS.summary(page.total);
      const matches = (item: BookFindingProjection): boolean => (category === '' || item.category === category) && (severity === '' || item.severity === severity) && (status === '' || item.status === status);
      let filtersChanged = false;
      let batchButton: HTMLButtonElement | null = null;
      const available = (): BookFindingProjection[] => batchItems.filter((item) => item.suggestion?.batchAllowed && matches(item));
      const syncBatch = (): void => { if (batchButton) { const count = available().length; batchButton.textContent = `接受并应用全部 ${count} 条`; batchButton.hidden = count === 0; batchButton.disabled = filtersChanged || Boolean(feedback?.recover); batchButton.title = feedback?.recover ? recoveryReason : ''; } };
      settleFilters = () => { if (filtersChanged) { filtersChanged = false; syncBatch(); } };
      const changeFilter = (): void => { filtersChanged = true; generation++; offset = 0; root.querySelector('.findings-confirm')?.remove(); paint(); syncBatch(); void load(); };
      const filter = filterChoices({ label: FINDINGS_CENTER_WORDS.filter,
        choices: [['', FINDINGS_CENTER_WORDS.allCategories], ...page.groups.map((group) => [group.category, `${group.label} · ${group.count}`] as const)],
        value: category, change: (value) => { category = value; changeFilter(); },
      });
      filter.dataset['findingsFilter'] = 'category';
      const severityFilter = filterChoices({ label: '严重度', choices: [['', '全部严重度'], ...Object.keys(Object.assign({}, ...page.groups.map((group) => group.bySeverity))).map((value) => [value, value] as const)],
        value: severity, change: (value) => { severity = value; changeFilter(); } });
      severityFilter.dataset['findingsFilter'] = 'severity';
      const statusFilter = filterChoices({ label: '处理状态', choices: [['', '全部状态'], ...Object.keys(Object.assign({}, ...page.groups.map((group) => group.byStatus))).map((value) => [value, value] as const)],
        value: status, change: (value) => { status = value; changeFilter(); } });
      statusFilter.dataset['findingsFilter'] = 'status';
      const filters = document.createElement('div'); filters.className = 'findings-filters'; filters.append(filter, severityFilter, statusFilter);
      const list = document.createElement('div');
      const position = document.createElement('div');
      const paint = (): void => {
        const matching = allItems.filter(matches);
        offset = Math.min(offset, Math.floor(Math.max(0, matching.length - 1) / page.pageSize) * page.pageSize);
        const visibleItems = matching.slice(offset, offset + page.pageSize);
        summary.textContent = FINDINGS_CENTER_WORDS.summary(matching.length);
        position.replaceChildren(listPosition({ offset, total: matching.length, pageSize: page.pageSize, label: '发现位置', change: (next) => { offset = next; paint(); } }));
        list.replaceChildren();
        for (const group of page.groups.filter((entry) => category === '' || entry.category === category)) {
          const section = document.createElement('section');
          const heading = document.createElement('h3'); heading.textContent = group.label; section.append(heading);
          for (const item of visibleItems.filter((entry) => entry.category === group.category)) {
            const row = document.createElement('article'); row.dataset['findingId'] = item.id; row.dataset['findingKind'] = item.target.kind;
            row.className = 'finding-row';
            const pills = document.createElement('div'); pills.className = 'finding-pills';
            pills.append(stateTerm(item.status, item.target.kind === 'risk' ? 'attention' : STATUS_TONES[item.status] ?? 'neutral'), stateTerm(item.severity, item.severity === '必须处理' ? 'attention' : 'neutral'));
            const words = document.createElement('div'); words.className = 'finding-body';
            // A review finding's note is the model's or the house list's record; a gap's reason is the service's (Issue #1531).
            const body = document.createElement('p'); body.textContent = item.target.kind === 'gap' ? serviceWords(item.summary) : houseAnnotationWords(item.summary);
            const why = document.createElement('p'); why.className = 'finding-why'; why.textContent = `来自${item.categoryLabel}。`;
            const loc = document.createElement('p'); loc.className = 'finding-location';
            loc.textContent = item.suggestion?.quote ?? (item.target.kind === 'gap' ? `正文第 ${item.target.unitOrdinal} 部分` : item.target.kind === 'risk' ? '评估中的风险项' : '稿件中的审阅标记');
            words.append(body, why, loc);
            const rowActions = document.createElement('div'); rowActions.className = 'finding-actions';
            const link = createButton(); link.type = 'button'; link.textContent = item.place ? '查看审阅' : FINDINGS_CENTER_WORDS.open; link.addEventListener('click', () => open(item));
            rowActions.append(link);
            if (item.place && goToText) {
              const place = item.place;
              const jump = createButton(); jump.textContent = '回到原文'; jump.dataset['action'] = 'finding-text';
              jump.disabled = !place.blockExists; jump.title = jump.disabled ? '这段文字所在的段落已不在当前稿件中。' : '';
              jump.addEventListener('click', () => {
                if (jump.disabled) return;
                const { ordinal, manuscriptId, branchId, blockId, markId } = place;
                void goToText({ ordinal, manuscriptId, branchId, blockId, markId }).catch(() => {
                  jump.title = '无法打开原文，请重试。';
                });
              }); rowActions.append(jump);
            }
            if (item.decision) {
              const decision = createButton(); decision.textContent = item.decision.kind === 'ignore' ? '忽略' : '拒绝'; decision.dataset['action'] = 'finding-decision';
              decision.addEventListener('click', () => void decide(item, decision)); rowActions.append(decision);
            }
            row.append(pills, words, rowActions);
            if (item.suggestion && apply) { const accept = createButton(); accept.type = 'button'; accept.textContent = '接受并应用'; accept.dataset['findingApply'] = item.id;
              accept.disabled = Boolean(feedback?.recover); accept.title = feedback?.recover ? recoveryReason : '';
              accept.addEventListener('click', () => { accept.disabled = true; void perform([item]); }); rowActions.append(accept); }
            section.append(row);
          }
          if (section.childElementCount > 1) list.append(section);
        }
        if (list.childElementCount === 0) {
          const empty = document.createElement('p'); empty.textContent = FINDINGS_CENTER_WORDS.pageEmpty; list.append(empty);
        }
      };
      paint();
      const actions = document.createElement('div'); actions.className = 'button-row';
      actions.append(position);
      if (apply) {
        batchButton = createButton(); batchButton.type = 'button'; batchButton.dataset['findingsBatch'] = ''; syncBatch();
        batchButton.addEventListener('click', () => {
          if (busy || filtersChanged || feedback?.recover || !page.batch.sentence || root.querySelector('.findings-confirm')) return;
          const items = available();
          const bar = document.createElement('div'); bar.className = 'attention-note findings-confirm'; bar.setAttribute('role', 'alert');
          const scope = document.createElement('p'); scope.textContent = page.batch.sentence;
          const confirm = createButton(); confirm.type = 'button'; confirm.textContent = '确认应用'; confirm.addEventListener('click', () => { bar.remove(); void perform(items); });
          const cancel = createButton(); cancel.textContent = '取消'; cancel.addEventListener('click', () => bar.remove());
          bar.append(scope, confirm, cancel); actions.append(bar);
        });
        actions.append(batchButton);
      }
      root.append(heading, summary, filters, list, actions);
      paintFeedback();
      restoreInteraction();
      if (focusedRow && !Array.from(root.querySelectorAll<HTMLElement>('[data-finding-id]')).some((row) => row.dataset['findingId'] === focusedRow.dataset['findingId'])) {
        const rows = root.querySelectorAll<HTMLElement>('[data-finding-id]');
        const next = rows[Math.min(focusedIndex, rows.length - 1)];
        (next?.querySelector<HTMLButtonElement>('[data-action="finding-decision"]') ?? next?.querySelector<HTMLButtonElement>('button') ?? root.querySelector<HTMLButtonElement>('[data-filter-value]'))?.focus({ preventScroll: true });
      }
    } catch {
      if (!root.isConnected || request !== generation) return;
      version = undefined;
      root.dataset['findingsState'] = 'failed';
      root.replaceChildren();
      const retry = createButton(); retry.type = 'button'; retry.textContent = FINDINGS_CENTER_WORDS.unavailable; retry.addEventListener('click', () => void load()); root.append(retry); paintFeedback();
    } finally { loading = false; root.removeAttribute('aria-busy'); if (reload && root.isConnected && !busy) void load(); }
  };
  const visible = (): void => { if (document.visibilityState === 'visible') void load(); };
  document.addEventListener('visibilitychange', visible);
  const timer = window.setInterval(() => { if (!root.isConnected) { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); } else if (!root.querySelector('.findings-confirm') && !pollControlEngaged(root) && document.visibilityState === 'visible') void load(); }, 2000);
  void load();
}
