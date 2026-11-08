import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderEditorialMarkCard, settleEditorialMarkCard } from '../../src/renderer/editorial-mark-card.js';
import type { EditorialMarkCardProjection } from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => restore());

const card: EditorialMarkCardProjection = {
  markId: 'mark', kind: 'change-suggestion', status: 'open', anchorState: 'exact', highlightColor: null,
  blockId: 'block', fromGrapheme: 0, toGrapheme: 2, pinnedText: '原文', body: '', replies: [], basis: [],
  source: { kind: 'ai7', origin: 'task', label: '校对', taskId: 'task', modelLabel: 'gpt-6-luna@high', modelTechnicalLabel: 'OpenAI 官方 · gpt-6-luna@high' },
  suggestion: { itemId: 'item', changeType: 'replace', currentText: '原文', proposedText: '改后', rationale: '理由', atomicGroupId: null, decision: null, application: null },
  convertedFrom: null, resolvedFrom: null, changedElsewhere: false, conflict: null, exportDisposition: 'exported-by-default',
  createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z',
  pin: { revisionId: 'revision', revisionLabel: '1', journalSequence: 0, blockDigest: 'digest' },
};

function render(value = card, moreOpen = new Map<string, boolean>()) {
  return renderEditorialMarkCard(value, { technical: false, moreOpen, dismiss: document.createElement('button') });
}
const blocks = (panel: HTMLElement) => Array.from(panel.querySelectorAll<HTMLElement>('[data-mark-block]')).map((node) => node.dataset['markBlock']);

describe('shared editorial card hierarchy in ordinary mode (#1379)', () => {
  it('puts the author line in the header, then 原文 → 修改后, rationale, collapsed More and core actions (#1413)', () => {
    const { panel, more } = render();
    expect(blocks(panel)).toEqual(['author', 'original', 'proposed', 'rationale', 'more', 'actions']);
    expect(panel.querySelector('header [data-mark-block="author"]')).not.toBeNull();
    expect(panel.querySelector('[data-mark-region="content"]')?.className).toContain('editorial-mark-diff-inline');
    expect(panel.querySelector('ins')?.textContent).toBe('改后');
    expect(panel.querySelector('del')?.textContent).toBe('原文');
    expect(panel.querySelector('[data-mark-source]')?.textContent).toContain('gpt-6-luna@high · 任务「校对」');
    expect(panel.textContent).not.toContain('OpenAI 官方');
    expect(more.open).toBe(false);
  });

  it('keeps replies beside the body, before the pinned quote and author', () => {
    const { panel } = render({ ...card, kind: 'annotation', body: '批注正文', suggestion: null,
      replies: [{ replyId: 'reply', body: '回复正文', createdAt: card.createdAt }] });
    expect(blocks(panel)).toEqual(['author', 'body', 'quote', 'more', 'actions']);
    const content = panel.querySelector('[data-mark-region="content"]')!;
    expect(content.textContent).toContain('批注正文回复正文');
    expect(panel.querySelector('blockquote')?.textContent).toBe('原文');
  });

  it('remembers More per mark and omits an empty rationale; deletions and insertions remain explicit', () => {
    const memory = new Map([['mark', true]]);
    const deletion = render({ ...card, suggestion: { ...card.suggestion!, proposedText: '', rationale: '' } }, memory);
    expect(deletion.more.open).toBe(true);
    expect(deletion.panel.querySelector('ins')?.textContent).toBe('（删去这段文字）');
    expect(blocks(deletion.panel)).not.toContain('rationale');
    const insertion = render({ ...card, markId: 'other', suggestion: { ...card.suggestion!, changeType: 'insert', currentText: '' } }, memory);
    expect(insertion.more.open).toBe(false);
    expect(insertion.panel.querySelector('del')?.textContent).toBe('插入位置');
  });

  it('highlights only the changed middle when most wording is shared, and exposes technical author labels on request', () => {
    const value = { ...card, suggestion: { ...card.suggestion!, currentText: '公开合成原句示例', proposedText: '公开合成改句示例' } };
    const { panel } = renderEditorialMarkCard(value, { technical: true, moreOpen: new Map(), dismiss: document.createElement('button') });
    expect(panel.querySelector('ins mark')?.textContent).toBe('改');
    expect(panel.querySelector('del mark')?.textContent).toBe('原');
    expect(panel.querySelector('ins')?.textContent).toBe(value.suggestion.proposedText);
    expect(panel.querySelector('[data-mark-source]')?.textContent).toContain('OpenAI 官方 · gpt-6-luna@high');
  });

  it('keeps unrecorded effort absent in ordinary-mode shared cards (#1402)', () => {
    const { panel } = render({ ...card, source: { ...card.source, modelLabel: 'gpt-6-luna',
      modelTechnicalLabel: 'OpenAI 官方 · gpt-6-luna' } });
    expect(panel.querySelector('[data-mark-source]')?.textContent).toContain('gpt-6-luna · 任务「校对」');
    expect(panel.textContent).not.toContain('@high');
    expect(panel.textContent).not.toContain('OpenAI 官方');
  });

  it('keeps conversion provenance under More while the author stays compact for conflict-card consumers', () => {
    const { panel, more } = render({ ...card, resolvedFrom: { markId: 'original', conflictKind: 'suggestion' } });
    expect(panel.querySelector('[data-mark-source]')?.textContent).not.toContain('由冲突');
    expect(more.querySelector('[data-mark-provenance]')?.textContent).toContain('由冲突解决生成的新版本');
    expect(more.open).toBe(false);
  });

  it('keeps a deferred conflict and its timestamp in More while the author status stays compact', () => {
    const { panel, more } = render({ ...card, anchorState: 'drifted', conflict: { kind: 'suggestion', state: 'deferred',
      deferredAt: '2026-11-07T00:00:00Z', outcome: null, newMarkId: null, resolvedAt: null } });
    expect(panel.querySelector('[data-mark-state]')?.textContent).toBe('待你处理 · 原文已变');
    expect(more.querySelector('[data-mark-state-detail]')?.textContent).toContain(' · 暂不处理 · ');
    expect(more.open).toBe(false);
  });

  it('stacks a long change and keeps 修改前 / 修改后 visible (#1413)', () => {
    const long = '公开合成示例文字'.repeat(4);
    const { panel } = render({ ...card, suggestion: { ...card.suggestion!, currentText: long, proposedText: `${long}改` } });
    expect(panel.querySelector('[data-mark-region="content"]')?.className).toContain('editorial-mark-diff-stacked');
    expect(panel.querySelector('[data-mark-block="original"] small')?.className).toBe('muted');
  });

  it('hides an empty More and folds actions beyond two core buttons into it, in order (#1413)', () => {
    const empty = render();
    settleEditorialMarkCard(empty);
    expect(empty.more.hidden).toBe(true);
    const full = render();
    const row = document.createElement('div');
    row.className = 'button-row';
    for (const action of ['accept-and-apply', 'reject', 'accept-with-edit', 'resolve-conflict']) {
      const control = document.createElement('button');
      control.dataset['markAction'] = action;
      row.append(control);
    }
    full.actions.append(row);
    settleEditorialMarkCard(full);
    const kept = Array.from(row.children, (item) => (item as HTMLElement).dataset['markAction']);
    const folded = Array.from(full.more.querySelectorAll<HTMLElement>('.editorial-mark-more-actions [data-mark-action]'), (item) => item.dataset['markAction']);
    expect(kept).toEqual(['accept-and-apply', 'reject']);
    expect(folded).toEqual(['accept-with-edit', 'resolve-conflict']);
    expect(full.more.hidden).toBe(false);
  });
});
