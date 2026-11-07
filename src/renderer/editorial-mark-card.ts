import type { EditorialMarkCardProjection } from '../shared/protocol.js';
import { MARK_KIND_LABELS, markSourceLine, markStateLabel, markTimeLabel } from './editorial-mark-labels.js';

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
  moreOpen: Map<string, boolean>;
  dismiss: HTMLButtonElement;
}): { panel: HTMLElement; more: HTMLDetailsElement; actions: HTMLElement } {
  const panel = node('section', 'editorial-mark-card');
  panel.dataset['markCard'] = card.markId;
  panel.dataset['learningDecisionId'] = card.suggestion?.decision?.decisionId ?? '';
  panel.dataset['markKind'] = card.kind;
  panel.dataset['markAnchor'] = card.anchorState;
  const header = node('header', 'editorial-mark-card-header');
  header.append(node('span', `editorial-mark-kind editorial-mark-kind-${card.kind}`, MARK_KIND_LABELS[card.kind]), options.dismiss);
  panel.append(header);
  const content = node('div', 'editorial-mark-content');
  content.dataset['markRegion'] = 'content';
  if (card.kind === 'change-suggestion' && card.suggestion !== null) {
    const suggestion = card.suggestion;
    const shown = suggestion.decision?.editedText ?? suggestion.proposedText;
    content.dataset['markChange'] = suggestion.changeType;
    const proposed = node('div', 'editorial-mark-block editorial-mark-proposed');
    proposed.dataset['markBlock'] = 'proposed';
    proposed.append(node('small', 'muted', '修改后'), wording('ins', shown || '（删去这段文字）', suggestion.currentText));
    const original = node('div', 'editorial-mark-block editorial-mark-original');
    original.dataset['markBlock'] = 'original';
    original.append(node('small', 'muted', '修改前'), wording('del', suggestion.currentText || '插入位置', shown));
    content.append(proposed, original);
    panel.append(content);
    if (suggestion.rationale.trim()) {
      const rationale = node('p', 'editorial-mark-rationale', suggestion.rationale);
      rationale.dataset['markBlock'] = 'rationale';
      rationale.dataset['markRegion'] = 'rationale';
      panel.append(rationale);
    }
  } else {
    const body = node('p', 'editorial-mark-body', card.body);
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
    panel.append(content, quote);
  }
  const author = node('p', 'editorial-mark-author');
  author.dataset['markBlock'] = 'author';
  const source = node('span', 'editorial-mark-source', `${markSourceLine({ ...card, convertedFrom: null, resolvedFrom: null }, options.technical)} · ${markTimeLabel(card.createdAt)}`);
  source.dataset['markSource'] = card.source.kind;
  const fullState = markStateLabel(card);
  const compactState = fullState.split(' · ').slice(0, 2).join(' · ');
  const state = node('span', 'state-term status-pill', compactState);
  state.dataset['markState'] = card.suggestion?.decision?.disposition ?? card.status;
  author.append(source, state);
  const more = node('details', 'editorial-mark-more');
  more.dataset['markBlock'] = 'more';
  more.open = options.moreOpen.get(card.markId) ?? false;
  more.append(node('summary', '', '更多'));
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
  panel.append(author, more, actions);
  return { panel, more, actions };
}
