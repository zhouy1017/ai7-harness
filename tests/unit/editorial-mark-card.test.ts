import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderEditorialMarkCard } from '../../src/renderer/editorial-mark-card.js';
import type { EditorialMarkCardProjection } from '../../src/shared/protocol.js';
import { installMiniDom } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => restore());

const card: EditorialMarkCardProjection = {
  markId: 'mark', kind: 'change-suggestion', status: 'open', anchorState: 'exact', highlightColor: null,
  blockId: 'block', fromGrapheme: 0, toGrapheme: 2, pinnedText: '原文', body: '', replies: [], basis: [],
  source: { kind: 'ai7', origin: 'task', label: '校对', taskId: 'task', modelLabel: 'OpenAI 官方', modelTechnicalLabel: 'raw-model-id' },
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
  it('puts separate proposed/original paragraphs before rationale, author, collapsed More and core actions', () => {
    const { panel, more } = render();
    expect(blocks(panel)).toEqual(['proposed', 'original', 'rationale', 'author', 'more', 'actions']);
    expect(panel.querySelector('ins')?.textContent).toBe('改后');
    expect(panel.querySelector('del')?.textContent).toBe('原文');
    expect(panel.querySelector('[data-mark-source]')?.textContent).toContain('OpenAI 官方');
    expect(panel.textContent).not.toContain('raw-model-id');
    expect(more.open).toBe(false);
  });

  it('keeps replies beside the body, before the pinned quote and author', () => {
    const { panel } = render({ ...card, kind: 'annotation', body: '批注正文', suggestion: null,
      replies: [{ replyId: 'reply', body: '回复正文', createdAt: card.createdAt }] });
    expect(blocks(panel)).toEqual(['body', 'quote', 'author', 'more', 'actions']);
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
    expect(panel.querySelector('[data-mark-source]')?.textContent).toContain('raw-model-id');
  });
});
