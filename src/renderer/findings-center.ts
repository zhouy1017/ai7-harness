import type { FindingsBatchFeedback } from './manuscript-apply.js';
import { retainPollInteraction, pollControlEngaged } from './poll-interaction.js';
import { filterChoices, listPosition, stateTerm, type StateTone } from './components/controls.js';
import { createButton } from './components/controls.js';
import type { BookFindingProjection, BookFindingsProjection } from '../shared/protocol.js';
import { FINDINGS_CENTER_WORDS } from './findings-center-labels.js';

const STATUS_TONES: Readonly<Record<string, StateTone>> = {
  '未覆盖': 'attention', '待复核': 'attention',
  '待处理': 'progress', '已处理': 'good', '已忽略': 'neutral',
};

export function mountFindingsCenter(root: HTMLElement, read: (offset: number) => Promise<BookFindingsProjection>, open: (item: BookFindingProjection) => void,
  apply?: (items: BookFindingProjection[]) => Promise<FindingsBatchFeedback | void>, newReview?: () => void): void {
  let offset = 0;
  let generation = 0;
  let category = '', severity = '', status = '';
  let signature = '', busy = false, loading = false;
  let feedback: FindingsBatchFeedback | void;
  const recoveryReason = '仍有应用或撤销结果待确认，请先核对未知结果。';
  const paintFeedback = (): void => {
    root.querySelector('.findings-apply-feedback')?.remove();
    if (!feedback) return;
    const bar = document.createElement('section'); bar.className = 'findings-apply-feedback attention-note'; bar.setAttribute('role', feedback.attention ? 'alert' : 'status');
    const words = document.createElement('p'); words.textContent = feedback.message; bar.append(words);
    if (feedback.recover) { const reason = document.createElement('p'); reason.className = 'findings-apply-blocked'; reason.textContent = recoveryReason; bar.append(reason); }
    for (const [label, action] of [['撤销已确认应用', feedback.undo], ['核对未知结果', feedback.recover]] as const) {
      if (!action) continue;
      const button = createButton(); button.textContent = label;
      button.disabled = Boolean(feedback.recover && action !== feedback.recover); if (button.disabled) button.title = recoveryReason;
      button.addEventListener('click', () => { if (busy || (feedback?.recover && action !== feedback.recover)) return; busy = true; button.disabled = true; void action().then((next) => { feedback = next; }).finally(() => { busy = false; signature = ''; void load(); }); }); bar.append(button);
    }
    root.insertBefore(bar, root.querySelector('.findings-filters'));
  };
  const perform = async (items: BookFindingProjection[]): Promise<void> => {
    if (busy || !apply || feedback?.recover) return; busy = true;
    try { feedback = await apply(items); } finally { busy = false; signature = ''; void load(); }
  };
  const load = async (): Promise<void> => {
    if (busy || loading) return; loading = true;
    const request = ++generation;
    root.setAttribute('aria-busy', 'true');
    try {
      const page = await read(0);
      const allItems = [...page.items];
      let cursor = page.next;
      while (cursor !== null) { const rest = await read(cursor); allItems.push(...rest.items); cursor = rest.next; }
      if (!root.isConnected || request !== generation || pollControlEngaged(root)) return;
      const key = JSON.stringify([page.groups, allItems]); if (key === signature) return;
      signature = key;
      const restoreInteraction = retainPollInteraction(root);
      const batchItems = allItems;
      root.replaceChildren();
      root.dataset['findingsState'] = 'ready';
      root.dataset['findingsTotal'] = String(page.total);
      const heading = document.createElement('h2'); heading.textContent = FINDINGS_CENTER_WORDS.heading;
      if (page.total === 0) {
        const card = document.createElement('section'); card.className = 'findings-empty surface-empty';
        const message = document.createElement('p'); message.textContent = FINDINGS_CENTER_WORDS.empty;
        const start = createButton(); start.classList.add('primary'); start.textContent = '新建审阅';
        start.addEventListener('click', () => newReview?.()); start.disabled = !newReview;
        card.append(heading, stateTerm('暂无待处理项'), message, start); root.append(card); paintFeedback();
        return;
      }
      const summary = document.createElement('p'); summary.textContent = FINDINGS_CENTER_WORDS.summary(page.total);
      const matches = (item: BookFindingProjection): boolean => (category === '' || item.category === category) && (severity === '' || item.severity === severity) && (status === '' || item.status === status);
      let batchButton: HTMLButtonElement | null = null;
      const available = (): BookFindingProjection[] => batchItems.filter((item) => item.suggestion?.batchAllowed && matches(item));
      const syncBatch = (): void => { if (batchButton) { const count = available().length; batchButton.textContent = `接受并应用全部 ${count} 条`; batchButton.hidden = count === 0; batchButton.disabled = Boolean(feedback?.recover); batchButton.title = feedback?.recover ? recoveryReason : ''; } };
      const filter = filterChoices({ label: FINDINGS_CENTER_WORDS.filter,
        choices: [['', FINDINGS_CENTER_WORDS.allCategories], ...page.groups.map((group) => [group.category, `${group.label} · ${group.count}`] as const)],
        value: category, change: (value) => { category = value; offset = 0; paint(); syncBatch(); },
      });
      filter.dataset['findingsFilter'] = 'category';
      const severityFilter = filterChoices({ label: '严重度', choices: [['', '全部严重度'], ...Object.keys(Object.assign({}, ...page.groups.map((group) => group.bySeverity))).map((value) => [value, value] as const)],
        value: severity, change: (value) => { severity = value; offset = 0; paint(); syncBatch(); } });
      severityFilter.dataset['findingsFilter'] = 'severity';
      const statusFilter = filterChoices({ label: '处理状态', choices: [['', '全部状态'], ...Object.keys(Object.assign({}, ...page.groups.map((group) => group.byStatus))).map((value) => [value, value] as const)],
        value: status, change: (value) => { status = value; offset = 0; paint(); syncBatch(); } });
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
            pills.append(stateTerm(item.status, STATUS_TONES[item.status] ?? 'neutral'), stateTerm(item.severity, item.severity === '必须处理' ? 'attention' : 'neutral'));
            const words = document.createElement('div'); words.className = 'finding-body';
            const body = document.createElement('p'); body.textContent = item.summary;
            const why = document.createElement('p'); why.className = 'finding-why'; why.textContent = `来自${item.categoryLabel}。`;
            const loc = document.createElement('p'); loc.className = 'finding-location';
            loc.textContent = item.suggestion?.quote ?? (item.target.kind === 'gap' ? `第 ${item.target.unitOrdinal} 个阅读单元` : item.target.kind === 'risk' ? '评估中的风险项' : '稿件中的审阅标记');
            words.append(body, why, loc);
            const rowActions = document.createElement('div'); rowActions.className = 'finding-actions';
            const link = createButton(); link.type = 'button'; link.textContent = FINDINGS_CENTER_WORDS.open; link.addEventListener('click', () => open(item));
            rowActions.append(link);
            row.append(pills, words, rowActions);
            if (item.suggestion && apply) { const accept = createButton(); accept.type = 'button'; accept.textContent = '接受并应用'; accept.dataset['findingApply'] = item.id;
              accept.disabled = Boolean(feedback?.recover); accept.title = feedback?.recover ? recoveryReason : '';
              accept.addEventListener('click', () => { accept.disabled = true; void perform([item]); }); rowActions.append(accept); }
            section.append(row);
          }
          if (section.childElementCount > 1) list.append(section);
        }
        if (list.childElementCount === 0 && page.total > 0) {
          const empty = document.createElement('p'); empty.textContent = FINDINGS_CENTER_WORDS.pageEmpty; list.append(empty);
        }
      };
      paint();
      const actions = document.createElement('div'); actions.className = 'button-row';
      actions.append(position);
      if (apply) {
        batchButton = createButton(); batchButton.type = 'button'; syncBatch();
        batchButton.addEventListener('click', () => {
          if (busy || feedback?.recover) return;
          const items = available();
          const bar = document.createElement('div'); bar.className = 'attention-note findings-confirm'; bar.setAttribute('role', 'alert');
          const scope = document.createElement('p'); scope.textContent = `将把所列 ${items.length} 条修改建议写入稿件。`;
          const confirm = createButton(); confirm.type = 'button'; confirm.textContent = '确认应用'; confirm.addEventListener('click', () => { bar.remove(); void perform(items); });
          const cancel = createButton(); cancel.textContent = '取消'; cancel.addEventListener('click', () => bar.remove());
          bar.append(scope, ...items.map((item) => { const line = document.createElement('p'); line.textContent = `${item.suggestion!.quote} → ${item.suggestion!.replacement}`; return line; }), confirm, cancel); actions.append(bar);
        });
        actions.append(batchButton);
      }
      root.append(heading, summary, filters, list, actions);
      paintFeedback();
      restoreInteraction();
    } catch {
      if (!root.isConnected || request !== generation) return;
      signature = '';
      root.dataset['findingsState'] = 'failed';
      root.replaceChildren();
      const retry = createButton(); retry.type = 'button'; retry.textContent = FINDINGS_CENTER_WORDS.unavailable; retry.addEventListener('click', () => void load()); root.append(retry); paintFeedback();
    } finally { loading = false; if (request === generation) root.removeAttribute('aria-busy'); }
  };
  const visible = (): void => { if (document.visibilityState === 'visible') void load(); };
  document.addEventListener('visibilitychange', visible);
  const timer = window.setInterval(() => { if (!root.isConnected) { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); } else if (!root.querySelector('.findings-confirm') && !pollControlEngaged(root) && document.visibilityState === 'visible') void load(); }, 2000);
  void load();
}
