import type {
  PreviewSeriesExclusionInput,
  RendererApi,
  SeriesExclusionImpactGroupProjection,
  SeriesExclusionPreviewProjection,
  SeriesExclusionRevisionProjection,
  SeriesExclusionTargetKind,
  SeriesExclusionTargetProjection,
  SeriesExclusionTargetsCursor,
  SeriesExclusionsProjection,
  SeriesProjection,
} from '../shared/protocol.js';
import { localInstantLabel } from './plan-preview-labels.js';
import {
  EXCLUSIONS_ADD_OPEN,
  EXCLUSIONS_CANCEL,
  EXCLUSIONS_CHANGE_OPEN,
  EXCLUSIONS_EMPTY,
  EXCLUSIONS_END_OPEN,
  EXCLUSIONS_HEADING,
  EXCLUSIONS_HISTORY_EMPTY,
  EXCLUSIONS_HISTORY_HEADING,
  EXCLUSIONS_HISTORY_IMPACT,
  EXCLUSIONS_HISTORY_MORE,
  EXCLUSIONS_KIND_LEGEND,
  EXCLUSIONS_NOTE,
  EXCLUSIONS_PREVIEW_ACTION,
  EXCLUSIONS_PREVIEW_HEADING,
  EXCLUSIONS_REASON_CHANGE_LABEL,
  EXCLUSIONS_REASON_LABEL,
  EXCLUSIONS_REFRESH,
  EXCLUSIONS_STATUS,
  EXCLUSIONS_TARGET_LEGEND,
  EXCLUSIONS_TARGETS_MORE,
  EXCLUSIONS_TARGETS_NONE,
  EXCLUSIONS_UNREAD_NOTE,
  EXCLUSION_KIND_CHOICES,
  exclusionChoiceLine,
  exclusionLine,
  exclusionPreviewRows,
  exclusionReasonLine,
  exclusionRevisionByline,
  exclusionRevisionLine,
} from './series-exclusion-labels.js';
import { SERIES_CHANGES_LABEL, SERIES_NO_CHANGE, SERIES_UNCHANGED_LABEL } from './series-labels.js';

/**
 * 书系检索排除 on a Series' page (Issue #64, plan slice S29b; V2-UX-SER-020 to SER-029; editor-surfaces §8.3): the exclusions in
 * force, each with 修改检索排除… (its reason) and 停止此排除…; 添加检索排除… naming one exact target of one kind and an optional
 * reason; and 书系检索排除影响预览 before every revision, whose only committing action is that revision's own name. A stale
 * preview is withdrawn and read again. The revisions follow, newest first, each with the impact it showed.
 */

type Status = (message: string, tone?: 'busy' | 'success' | 'error') => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function action(label: string, tone: 'primary' | 'secondary' | 'quiet', name: string, run: () => void): HTMLButtonElement {
  const node = el('button', `button ${tone}`, label);
  node.type = 'button';
  node.dataset['exclusionAction'] = name;
  node.addEventListener('click', run);
  return node;
}

/** Escape closes an open form or preview unless an input method is composing (J-14). */
function onEscape(root: HTMLElement, cancel: () => void): void {
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    cancel();
  });
}

function impactGroup(group: SeriesExclusionImpactGroupProjection, heading: 'h5' | 'h6'): HTMLElement {
  const box = el('div', 'series-impact-group');
  box.dataset['impactGroup'] = group.key;
  box.append(el(heading, undefined, group.title));
  const changes = el('div', 'series-impact-changes');
  changes.append(el('p', 'series-impact-label', SERIES_CHANGES_LABEL));
  if (group.changes.length === 0) changes.append(el('p', 'field-note', SERIES_NO_CHANGE));
  else {
    const list = el('ul');
    for (const line of group.changes) list.append(el('li', undefined, line));
    changes.append(list);
  }
  const unchanged = el('div', 'series-impact-unchanged');
  unchanged.append(el('p', 'series-impact-label', SERIES_UNCHANGED_LABEL));
  if (group.unchanged.length === 0) unchanged.append(el('p', 'field-note', SERIES_NO_CHANGE));
  else {
    const list = el('ul');
    for (const line of group.unchanged) list.append(el('li', undefined, line));
    unchanged.append(list);
  }
  box.append(changes, unchanged);
  return box;
}

export interface MountSeriesExclusionsOptions {
  readonly root: HTMLElement;
  readonly seriesId: string;
  readonly api: Pick<RendererApi, 'inspectSeries' | 'inspectSeriesExclusionTargets' | 'inspectSeriesExclusionHistory' | 'previewSeriesExclusion' |
    'recordSeriesExclusion'>;
  readonly setStatus: Status;
  readonly errorMessage: (error: unknown, fallback: string) => string;
  /** The Series as read again after a revision was recorded: the page repaints from it. */
  readonly seriesChanged: (series: SeriesProjection) => void;
}

interface Chooser {
  kind: SeriesExclusionTargetKind | null;
  targets: ReadonlyArray<SeriesExclusionTargetProjection & { readonly excluded: boolean }> | null;
  next: SeriesExclusionTargetsCursor | null;
  later: boolean;
  selected: SeriesExclusionTargetProjection | null;
  reason: string;
}

export function mountSeriesExclusions(options: MountSeriesExclusionsOptions): { update(exclusions: SeriesExclusionsProjection): void } {
  const { root, api, setStatus, errorMessage } = options;
  root.classList.add('series-exclusions');
  let exclusions: SeriesExclusionsProjection | null = null;
  let chooser: Chooser | null = null;
  /** 修改检索排除…'s form: the exclusion and the reason typed. */
  let change: { exclusionId: string; reason: string } | null = null;
  let preview: SeriesExclusionPreviewProjection | null = null;
  /** What the editor asked a preview of, so a stale refusal can ask again. */
  let asked: PreviewSeriesExclusionInput | null = null;
  let refusal: { message: string; stale: boolean } | null = null;
  let busy = false;
  let historyLater = false;

  const paint = (focus: string | null): void => {
    if (exclusions === null) return;
    root.dataset['exclusionsEffective'] = String(exclusions.effective.length);
    const heading = el('h3', 'exclusions-heading', EXCLUSIONS_HEADING);
    heading.tabIndex = -1;
    const nodes: HTMLElement[] = [heading, el('p', 'field-note exclusions-note', EXCLUSIONS_NOTE)];
    if (exclusions.effective.length === 0) nodes.push(el('p', 'field-note exclusions-empty', EXCLUSIONS_EMPTY));
    else {
      const list = el('ul', 'series-exclusion-list');
      for (const exclusion of exclusions.effective) {
        const item = el('li', 'series-exclusion');
        item.dataset['exclusionId'] = exclusion.exclusionId;
        item.dataset['targetKind'] = exclusion.target.kind;
        item.dataset['targetId'] = exclusion.target.id;
        item.append(
          el('p', 'series-exclusion-line', exclusionLine(exclusion, localInstantLabel)),
          el('p', 'field-note series-exclusion-reason', exclusionReasonLine(exclusion.reason)),
          el('p', 'field-note series-exclusion-continuing', exclusion.target.continuing),
        );
        if (!exclusion.target.read) item.append(el('p', 'field-note series-exclusion-unread', EXCLUSIONS_UNREAD_NOTE));
        const buttons = el('div', 'button-row');
        const edit = action(EXCLUSIONS_CHANGE_OPEN, 'quiet', 'change-open', () => {
          if (busy) return;
          change = { exclusionId: exclusion.exclusionId, reason: exclusion.reason };
          chooser = null;
          preview = null;
          refusal = null;
          paint('#series-exclusion-change-reason');
        });
        edit.setAttribute('aria-label', `修改检索排除：${exclusion.target.label}`);
        const end = action(EXCLUSIONS_END_OPEN, 'quiet', 'end-open', () =>
          void ask({ seriesId: options.seriesId, action: 'end', exclusionId: exclusion.exclusionId, target: null, reason: exclusion.reason }));
        end.setAttribute('aria-label', `停止此排除：${exclusion.target.label}`);
        const open = busy || chooser !== null || change !== null || preview !== null;
        edit.disabled = open;
        end.disabled = open;
        buttons.append(edit, end);
        item.append(buttons);
        if (change?.exclusionId === exclusion.exclusionId) item.append(changeForm(exclusion.target, exclusion.reason));
        list.append(item);
      }
      nodes.push(list);
    }
    const toolbar = el('div', 'button-row');
    const add = action(EXCLUSIONS_ADD_OPEN, 'secondary', 'add-open', () => {
      if (busy) return;
      chooser = { kind: null, targets: null, next: null, later: false, selected: null, reason: '' };
      change = null;
      preview = null;
      refusal = null;
      paint('input[name="series-exclusion-kind"]');
    });
    add.disabled = busy || chooser !== null || change !== null || preview !== null;
    toolbar.append(add);
    nodes.push(toolbar);
    if (chooser !== null) nodes.push(chooserNode(chooser));
    if (preview !== null || (refusal !== null && asked !== null)) nodes.push(previewNode());
    nodes.push(historyNode());
    root.replaceChildren(...nodes);
    if (focus !== null) root.querySelector<HTMLElement>(focus)?.focus();
  };

  const reasonField = (id: string, label: string, value: string, set: (value: string) => void): HTMLElement => {
    const box = el('label', 'series-field');
    const input = el('input');
    input.id = id;
    input.type = 'text';
    input.maxLength = 400;
    input.value = value;
    input.disabled = busy;
    input.addEventListener('input', () => set(input.value));
    box.append(el('span', undefined, label), input);
    return box;
  };

  const changeForm = (target: SeriesExclusionTargetProjection, current: string): HTMLElement => {
    const box = el('div', 'series-exclusion-change');
    box.append(reasonField('series-exclusion-change-reason', EXCLUSIONS_REASON_CHANGE_LABEL, change?.reason ?? current, (value) => {
      if (change !== null) change.reason = value;
    }));
    const look = action(EXCLUSIONS_PREVIEW_ACTION, 'primary', 'change-preview', () => {
      if (change === null) return;
      void ask({ seriesId: options.seriesId, action: 'change', exclusionId: change.exclusionId, target: null, reason: change.reason });
    });
    look.disabled = busy;
    const cancel = action(EXCLUSIONS_CANCEL, 'secondary', 'change-cancel', () => {
      if (busy) return;
      const id = change?.exclusionId;
      change = null;
      paint(id === undefined ? null : `li[data-exclusion-id="${id}"] [data-exclusion-action="change-open"]`);
    });
    cancel.disabled = busy;
    const buttons = el('div', 'button-row');
    buttons.append(look, cancel);
    box.append(buttons);
    box.setAttribute('aria-label', `修改检索排除：${target.label}`);
    onEscape(box, () => cancel.click());
    return box;
  };

  const chooserNode = (open: Chooser): HTMLElement => {
    const box = el('fieldset', 'series-exclusion-chooser');
    box.append(el('legend', undefined, EXCLUSIONS_KIND_LEGEND));
    const kinds = el('div', 'series-exclusion-kinds');
    for (const choice of EXCLUSION_KIND_CHOICES) {
      const label = el('label', 'series-exclusion-kind');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'series-exclusion-kind';
      radio.value = choice.kind;
      radio.checked = open.kind === choice.kind;
      radio.disabled = busy;
      radio.addEventListener('change', () => {
        if (!radio.checked || chooser !== open) return;
        open.kind = choice.kind;
        void loadTargets(true);
      });
      label.append(radio, el('span', undefined, choice.label));
      kinds.append(label);
    }
    box.append(kinds);
    if (open.kind !== null) {
      const targets = el('div', 'series-exclusion-targets');
      targets.append(el('p', 'series-exclusion-targets-legend', EXCLUSIONS_TARGET_LEGEND));
      if (open.targets === null) targets.append(el('p', 'field-note', EXCLUSIONS_STATUS.loading));
      else if (open.targets.length === 0) targets.append(el('p', 'field-note series-exclusion-targets-none', EXCLUSIONS_TARGETS_NONE[open.kind]));
      const visible = [...(open.targets ?? [])];
      const selected = open.selected;
      if (selected !== null && !visible.some((entry) => entry.id === selected.id)) visible.push({ ...selected, excluded: false });
      for (const target of visible) {
        const label = el('label', 'series-exclusion-choice');
        const radio = el('input');
        radio.type = 'radio';
        radio.name = 'series-exclusion-target';
        radio.value = target.id;
        radio.checked = open.selected?.id === target.id;
        radio.disabled = busy || target.excluded;
        radio.addEventListener('change', () => {
          if (!radio.checked || chooser !== open) return;
          open.selected = target;
          look.disabled = busy;
        });
        label.append(radio, el('span', undefined, exclusionChoiceLine(target)));
        targets.append(label);
      }
      if (open.next !== null) {
        const more = action(EXCLUSIONS_TARGETS_MORE, 'secondary', 'targets-more', () => void loadTargets(false));
        more.disabled = busy;
        targets.append(more);
      }
      if (open.later) {
        const reset = action('回到开头', 'secondary', 'targets-first', () => void loadTargets(true));
        reset.disabled = busy;
        targets.append(reset);
      }
      box.append(targets);
    }
    box.append(reasonField('series-exclusion-reason', EXCLUSIONS_REASON_LABEL, open.reason, (value) => { open.reason = value; }));
    const look = action(EXCLUSIONS_PREVIEW_ACTION, 'primary', 'preview', () => {
      if (open.kind === null || open.selected === null) return;
      void ask({ seriesId: options.seriesId, action: 'add', exclusionId: null, target: { kind: open.kind, id: open.selected.id }, reason: open.reason });
    });
    look.disabled = busy || open.selected === null;
    const cancel = action(EXCLUSIONS_CANCEL, 'secondary', 'add-cancel', () => {
      if (busy) return;
      chooser = null;
      paint('[data-exclusion-action="add-open"]');
    });
    cancel.disabled = busy;
    const buttons = el('div', 'button-row');
    buttons.append(look, cancel);
    box.append(buttons);
    onEscape(box, () => cancel.click());
    return box;
  };

  const previewNode = (): HTMLElement => {
    const box = el('section', 'series-exclusion-preview');
    if (preview !== null) {
      box.dataset['previewAction'] = preview.action;
      box.dataset['targetKind'] = preview.target.kind;
      box.dataset['targetId'] = preview.target.id;
      const heading = el('h4', 'series-exclusion-preview-heading', EXCLUSIONS_PREVIEW_HEADING);
      heading.tabIndex = -1;
      const rows = el('dl', 'series-exclusion-preview-identity');
      for (const [term, value] of exclusionPreviewRows(preview)) rows.append(el('dt', undefined, term), el('dd', undefined, value));
      box.append(heading, rows);
      if (!preview.target.read) box.append(el('p', 'field-note series-exclusion-unread', EXCLUSIONS_UNREAD_NOTE));
      box.append(...preview.groups.map((group) => impactGroup(group, 'h5')));
    }
    if (refusal !== null) {
      const alert = el('p', 'attention-note series-refusal', refusal.message);
      alert.setAttribute('role', 'alert');
      box.append(alert);
    }
    const buttons = el('div', 'button-row');
    if (refusal?.stale && asked !== null) {
      const again = asked;
      const refresh = action(EXCLUSIONS_REFRESH, 'secondary', 'refresh', () => void ask(again));
      refresh.disabled = busy;
      buttons.append(refresh);
    } else if (preview !== null) {
      const commit = action(preview.actionLabel, 'primary', 'commit', () => void submit());
      commit.disabled = busy;
      buttons.append(commit);
    }
    const cancel = action(EXCLUSIONS_CANCEL, 'secondary', 'preview-cancel', () => {
      if (busy) return;
      const exclusionId = preview?.exclusionId ?? asked?.exclusionId ?? null;
      preview = null;
      asked = null;
      refusal = null;
      chooser = null;
      change = null;
      paint(exclusionId === null ? '[data-exclusion-action="add-open"]' : `li[data-exclusion-id="${exclusionId}"] [data-exclusion-action="end-open"]`);
    });
    cancel.disabled = busy;
    buttons.append(cancel);
    box.append(buttons);
    onEscape(box, () => cancel.click());
    return box;
  };

  const historyNode = (): HTMLElement => {
    const section = el('section', 'series-exclusion-history');
    const heading = el('h4', undefined, EXCLUSIONS_HISTORY_HEADING);
    heading.tabIndex = -1;
    section.append(heading);
    const shown = exclusions!;
    if (shown.history.length === 0) section.append(el('p', 'field-note', EXCLUSIONS_HISTORY_EMPTY));
    else {
      const list = el('ol', 'series-exclusion-revisions');
      for (const revision of shown.history) list.append(revisionNode(revision));
      section.append(list);
    }
    if (shown.historyNext !== null) {
      const more = action(EXCLUSIONS_HISTORY_MORE, 'secondary', 'history-more', () => void loadHistory(false));
      more.disabled = busy;
      section.append(more);
    }
    if (historyLater) {
      const reset = action('回到最新记录', 'secondary', 'history-first', () => void loadHistory(true));
      reset.disabled = busy;
      section.append(reset);
    }
    return section;
  };

  const revisionNode = (revision: SeriesExclusionRevisionProjection): HTMLElement => {
    const item = el('li', 'series-exclusion-revision');
    item.dataset['revisionId'] = revision.revisionId;
    item.dataset['exclusionId'] = revision.exclusionId;
    item.dataset['action'] = revision.action;
    const details = el('details', 'series-change-impact');
    details.append(el('summary', undefined, EXCLUSIONS_HISTORY_IMPACT), ...revision.impact.map((group) => impactGroup(group, 'h6')));
    item.append(el('p', 'series-exclusion-revision-line', exclusionRevisionLine(revision)),
      el('p', 'field-note', exclusionRevisionByline(revision, localInstantLabel)), details);
    return item;
  };

  /** One page of the chosen kind's targets: the first, or the one after those shown. */
  const loadTargets = async (fresh: boolean): Promise<void> => {
    const open = chooser;
    if (busy || open === null || open.kind === null) return;
    const kind = open.kind;
    busy = true;
    if (fresh) {
      open.targets = null;
      open.next = null;
      open.selected = null;
    }
    paint(null);
    try {
      const page = await api.inspectSeriesExclusionTargets({ seriesId: options.seriesId, kind, after: fresh ? null : open.next });
      busy = false;
      if (!root.isConnected || chooser !== open || open.kind !== kind) return;
      open.targets = page.targets;
      open.next = page.nextCursor;
      open.later = !fresh;
      const first = page.targets.find((target) => !target.excluded);
      paint(first === undefined ? `input[name="series-exclusion-kind"][value="${kind}"]` : `input[name="series-exclusion-target"][value="${first.id}"]`);
    } catch (error) {
      busy = false;
      if (open.targets === null) open.targets = [];
      paint(`input[name="series-exclusion-kind"][value="${kind}"]`);
      setStatus(errorMessage(error, EXCLUSIONS_STATUS.failed), 'error');
    }
  };

  const loadHistory = async (fresh: boolean): Promise<void> => {
    const shown = exclusions;
    if (busy || shown === null) return;
    busy = true;
    paint(null);
    setStatus(EXCLUSIONS_STATUS.loadingMore, 'busy');
    try {
      if (fresh) {
        const series = await api.inspectSeries({ seriesId: options.seriesId });
        exclusions = { ...shown, history: series.exclusions.history, historyNext: series.exclusions.historyNext };
      } else if (shown.historyNext !== null) {
        const page = await api.inspectSeriesExclusionHistory({ seriesId: options.seriesId, after: shown.historyNext });
        exclusions = { ...shown, history: page.history, historyNext: page.nextCursor };
      }
      busy = false;
      historyLater = !fresh;
      if (!root.isConnected) return;
      paint('.series-exclusion-history h4');
      setStatus('');
    } catch (error) {
      busy = false;
      paint('.series-exclusion-history h4');
      setStatus(errorMessage(error, EXCLUSIONS_STATUS.failed), 'error');
    }
  };

  /** Ask what the revision would do: the preview replaces the form, and nothing is recorded yet. */
  const ask = async (input: PreviewSeriesExclusionInput): Promise<void> => {
    if (busy) return;
    busy = true;
    asked = input;
    refusal = null;
    paint(null);
    setStatus(EXCLUSIONS_STATUS.previewing, 'busy');
    try {
      preview = await api.previewSeriesExclusion(input);
      busy = false;
      chooser = null;
      change = null;
      paint('.series-exclusion-preview-heading');
      setStatus(EXCLUSIONS_PREVIEW_HEADING);
    } catch (error) {
      busy = false;
      preview = null;
      refusal = { message: errorMessage(error, EXCLUSIONS_STATUS.failed), stale: false };
      paint('[data-exclusion-action="preview-cancel"]');
      setStatus(refusal.message, 'error');
    }
  };

  const submit = async (): Promise<void> => {
    if (busy || preview === null || asked === null) return;
    const shown = preview;
    const input = asked;
    busy = true;
    refusal = null;
    paint(null);
    setStatus(EXCLUSIONS_STATUS.committing, 'busy');
    try {
      const result = await api.recordSeriesExclusion({ ...input, previewDigest: shown.previewDigest });
      // The answer is the revision alone: the Series is read again, so the list and the records show it in their places.
      try {
        const series = await api.inspectSeries({ seriesId: options.seriesId });
        exclusions = series.exclusions;
        historyLater = false;
        options.seriesChanged(series);
      } catch {
        // The revision stands whatever that read meets; the page keeps what it had.
      }
      busy = false;
      preview = null;
      asked = null;
      paint(shown.action === 'end' ? '[data-exclusion-action="add-open"]' : `li[data-exclusion-id="${result.exclusionId}"] [data-exclusion-action="end-open"]`);
      setStatus(result.stoppedRuns > 0 ? `${result.completionLabel}；${result.stoppedRuns} 个已授权的任务已在读取前停下` : result.completionLabel, 'success');
    } catch (error) {
      busy = false;
      const stale = typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'SERIES_EXCLUSION_PREVIEW_STALE';
      refusal = { message: errorMessage(error, EXCLUSIONS_STATUS.failed), stale };
      // A stale preview is withdrawn: the editor reads the consequence again before any commit.
      preview = null;
      paint(stale ? '[data-exclusion-action="refresh"]' : '[data-exclusion-action="preview-cancel"]');
      setStatus(refusal.message, 'error');
    }
  };

  return {
    update(next: SeriesExclusionsProjection): void {
      exclusions = next;
      historyLater = false;
      paint(null);
    },
  };
}
