import type { EditorialMarkCardProjection } from '../shared/protocol.js';
import { resolveEditorialMarkCategory } from '../shared/editorial-mark-category.js';
import { MARK_KIND_LABELS, markSourceLine, markSourceMark, markIsHandled, markDisplayNote, markStateLabel, markTimeLabel } from './editorial-mark-labels.js';

/** Renderer-session memory shared by cards even when the manuscript surface is remounted. */
export const editorialMarkCardMoreOpen = new Map<string, boolean>();

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function wording(tag: 'ins' | 'del', text: string, other: string): HTMLElement {
  const element = node(tag, '');
  const parts = Array.from(text);
  const compared = Array.from(other);
  let prefix = 0;
  let suffix = 0;
  while (prefix < Math.min(parts.length, compared.length) && parts[prefix] === compared[prefix]) prefix++;
  while (suffix < Math.min(parts.length, compared.length) - prefix && parts[parts.length - suffix - 1] === compared[compared.length - suffix - 1]) suffix++;
  if (prefix + suffix > parts.length / 2 && prefix + suffix < parts.length) {
    element.append(parts.slice(0, prefix).join(''), node('mark', 'editorial-mark-difference', parts.slice(prefix, parts.length - suffix).join('')), parts.slice(parts.length - suffix).join(''));
  } else element.textContent = text;
  return element;
}

/** Shared card hierarchy for floating cards and the manuscript comments pane (#1379 / #1380).
 * Callers supply the existing authority-bearing actions and secondary evidence; this renderer writes no manuscript.
 */
export function renderEditorialMarkCard(card: EditorialMarkCardProjection, options: {
  technical: boolean;
  pane?: boolean;
  expanded?: boolean;
  moreOpen: Map<string, boolean>;
  dismiss: HTMLButtonElement;
}): { panel: HTMLElement; more: HTMLDetailsElement; actions: HTMLElement } {
  const panel = node('section', 'editorial-mark-card');
  panel.dataset['markCard'] = card.markId;
  panel.setAttribute('aria-label', `${MARK_KIND_LABELS[card.kind]}${options.pane ? '卡片' : '浮卡'}`);
  panel.dataset['learningDecisionId'] = card.suggestion?.decision?.decisionId ?? '';
  panel.dataset['markKind'] = card.kind;
  panel.dataset['markCategory'] = card.categoryKey;
  panel.dataset['markAnchor'] = card.anchorState;
  const header = node('header', 'editorial-mark-card-header');
  const category = resolveEditorialMarkCategory({ sourceKind: card.source.kind, sourceOrigin: card.source.origin, sourceLabel: card.source.label });
  const badge = node('span', 'editorial-mark-category-badge', category.badgeText);
  badge.title = card.categoryLabel;
  if (options.pane) badge.textContent = category.badgeText.replace(/^【|】$/gu, '');
  header.append(badge, node('span', `editorial-mark-kind editorial-mark-kind-${card.kind}`, MARK_KIND_LABELS[card.kind]), options.dismiss);
  // The author, time and state pill are the header's second line (Issue #1413 cluster 3).
  const author = node('p', 'editorial-mark-author');
  author.dataset['markBlock'] = 'author';
  const source = node('span', 'editorial-mark-source', `${markSourceLine({ ...card, convertedFrom: null, resolvedFrom: null }, options.technical)} · ${markTimeLabel(card.createdAt)}`);
  source.dataset['markSource'] = card.source.kind;
  const fullState = markStateLabel(card);
  const compactState = fullState.split(' · ').slice(0, 2).join(' · ');
  const state = node('span', 'state-term status-pill', compactState);
  state.dataset['markState'] = card.suggestion?.decision?.disposition ?? card.status;
  author.append(source, state);
  if (options.pane) {
    source.textContent = markSourceMark(card.source, options.technical);
    source.title = source.textContent;
    header.replaceChildren(badge);
    if (card.kind !== 'change-suggestion') header.append(node('span', 'editorial-mark-kind', MARK_KIND_LABELS[card.kind]));
    const handled = markIsHandled({ ...card, disposition: card.suggestion?.decision?.disposition ?? null });
    panel.dataset['handled'] = String(handled);
    state.textContent = `${handled ? '✓' : '○'} ${compactState}`;
    state.title = fullState;
    header.append(source, state);
  } else header.append(author);
  panel.append(header);
  const expandedContent = options.pane ? node('div', 'editorial-mark-expanded-content') : panel;
  const displayNote = markDisplayNote(card.suggestion?.rationale ?? card.body);
  if (options.pane) {
    const preview = node('p', 'editorial-mark-compact-preview', card.suggestion
      ? `${card.suggestion.currentText || '插入位置'} → ${(card.suggestion.decision?.editedText ?? card.suggestion.proposedText) || '（删去这段文字）'}`
      : displayNote.text.split(/\r?\n/u)[0]);
    panel.append(preview, expandedContent);
    panel.dataset['paneCard'] = 'true';
  }
  if (displayNote.unchecked || displayNote.guessedAnchor) {
    const tags = node('div', 'editorial-mark-note-tags');
    if (displayNote.unchecked) tags.append(node('small', 'editorial-mark-note-tag', '未联网核查'));
    if (displayNote.guessedAnchor) tags.append(node('small', 'editorial-mark-note-tag', '位置待确认'));
    expandedContent.append(tags);
  }
  const content = node('div', 'editorial-mark-content');
  content.dataset['markRegion'] = 'content';
  if (card.kind === 'change-suggestion' && card.suggestion !== null) {
    const suggestion = card.suggestion;
    const shown = suggestion.decision?.editedText ?? suggestion.proposedText;
    content.dataset['markChange'] = suggestion.changeType;
    // 原文 → 修改后 (Issue #1413 cluster 3): the original struck through first, then the proposed words; a short change
    // reads as one line, a long one keeps two blocks. The 修改前 / 修改后 words stay for assistive technology.
    const before = suggestion.currentText || '插入位置';
    const after = shown || '（删去这段文字）';
    const inline = Array.from(before).length + Array.from(after).length <= SHORT_DIFF_GRAPHEMES && !/\n/u.test(before + after);
    const original = node('div', 'editorial-mark-block editorial-mark-original');
    original.dataset['markBlock'] = 'original';
    original.append(node('small', inline ? 'visually-hidden' : 'muted', '修改前'), wording('del', before, shown));
    const proposed = node('div', 'editorial-mark-block editorial-mark-proposed');
    proposed.dataset['markBlock'] = 'proposed';
    proposed.append(node('small', inline ? 'visually-hidden' : 'muted', '修改后'), wording('ins', after, suggestion.currentText));
    content.classList.add(inline ? 'editorial-mark-diff-inline' : 'editorial-mark-diff-stacked');
    const arrow = node('span', 'editorial-mark-diff-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    content.append(original, arrow, proposed);
    expandedContent.append(content);
    if (suggestion.rationale.trim()) {
      const rationale = node('p', 'editorial-mark-rationale', displayNote.text);
      rationale.dataset['markBlock'] = 'rationale';
      rationale.dataset['markRegion'] = 'rationale';
      expandedContent.append(rationale);
    }
  } else {
    const body = node('p', 'editorial-mark-body', displayNote.text);
    body.dataset['markBody'] = card.kind;
    body.dataset['markBlock'] = 'body';
    content.append(body);
    if (card.replies.length > 0) {
      const replies = node('ol', 'editorial-mark-replies');
      replies.dataset['markRegion'] = 'replies';
      for (const reply of card.replies) {
        const item = node('li', '');
        item.append(node('span', '', reply.body), node('small', 'muted', ` · 你 · ${markTimeLabel(reply.createdAt)}`));
        replies.append(item);
      }
      content.append(replies);
    }
    const quote = node('blockquote', 'editorial-mark-quote', card.pinnedText);
    quote.dataset['markBlock'] = 'quote';
    expandedContent.append(content, quote);
  }
  const more = node('details', 'editorial-mark-more');
  more.dataset['markBlock'] = 'more';
  more.open = options.moreOpen.get(card.markId) ?? false;
  const summary = node('summary', '', '更多');
  summary.setAttribute('aria-label', '更多操作与说明');
  more.append(summary);
  if (card.convertedFrom !== null || card.resolvedFrom) {
    const provenance = node('p', 'editorial-mark-provenance', markSourceLine(card, options.technical));
    provenance.dataset['markProvenance'] = 'true';
    more.append(provenance);
  }
  if (fullState !== compactState) {
    const detail = node('p', 'muted', fullState);
    detail.dataset['markStateDetail'] = 'true';
    more.append(detail);
  }
  more.addEventListener('toggle', () => { if (more.isConnected) options.moreOpen.set(card.markId, more.open); });
  const actions = node('section', 'editorial-mark-region editorial-mark-actions');
  actions.dataset['markRegion'] = 'disposition';
  actions.dataset['markBlock'] = 'actions';
  expandedContent.append(more, actions);
  if (options.pane) {
    const footer = node('p', 'editorial-mark-footer', `${markSourceLine({ ...card, convertedFrom: null, resolvedFrom: null }, options.technical)} · ${markTimeLabel(card.createdAt)}`);
    footer.title = footer.textContent ?? '';
    expandedContent.append(footer);
    setEditorialMarkCardExpanded(panel, options.expanded ?? false);
  }
  return { panel, more, actions };
}

/** Expansion only changes visibility; cached content, controls and forms keep their identity. */
export function setEditorialMarkCardExpanded(panel: HTMLElement, expanded: boolean): void {
  panel.dataset['expanded'] = String(expanded);
  const preview = panel.querySelector<HTMLElement>('.editorial-mark-compact-preview');
  const content = panel.querySelector<HTMLElement>('.editorial-mark-expanded-content');
  if (preview) preview.hidden = expanded;
  if (content) content.hidden = !expanded;
}

/** A change reads on one line when both sides together are at most this many characters. */
const SHORT_DIFF_GRAPHEMES = 48;
/** At most two core buttons stand on the card (Issue #1413 cluster 1); the rest move into 更多. */
const CORE_ACTIONS = 2;
/** Folded first when a row holds more than two: the editing variants of a decision the row already offers. */
const FOLD_FIRST: ReadonlySet<string> = new Set(['accept-with-edit', 'edit']);

function actionOf(item: Element): string {
  const control = item instanceof HTMLElement && item.dataset['markAction'] !== undefined ? item : item.querySelector<HTMLElement>('[data-mark-action]');
  return control?.dataset['markAction'] ?? '';
}

function shown(child: Element): boolean {
  if (child.tagName === 'SUMMARY' || (child instanceof HTMLElement && child.hidden)) return false;
  return !(child instanceof HTMLElement && child.dataset['technicalLayer'] === 'true' && child.childElementCount === 0);
}

/**
 * Settle a card once its caller has filled it: each action row keeps at most two core buttons and moves the others, in
 * their order, to the top of 更多; 更多 is hidden when it holds nothing a reader would see.
 */
export function settleEditorialMarkCard(parts: { more: HTMLDetailsElement; actions: HTMLElement }): void {
  const { more, actions } = parts;
  const folded: Element[] = [];
  for (const row of Array.from(actions.children)) {
    if (!row.classList.contains('button-row')) continue;
    const items = Array.from(row.children).filter((item) => !(item instanceof HTMLElement && item.hidden));
    const moved: Element[] = [];
    while (items.length > CORE_ACTIONS) {
      let index = -1;
      for (let at = items.length - 1; at >= 0; at--) if (FOLD_FIRST.has(actionOf(items[at]!))) { index = at; break; }
      if (index < 0) index = items.length - 1;
      moved.push(...items.splice(index, 1));
    }
    const all = Array.from(row.children);
    folded.push(...moved.sort((a, b) => all.indexOf(a) - all.indexOf(b)));
  }
  if (folded.length > 0) {
    const row = node('div', 'button-row editorial-mark-more-actions');
    row.append(...folded);
    more.querySelector('summary')!.after(row);
  }
  more.hidden = !Array.from(more.children).some(shown);
}

