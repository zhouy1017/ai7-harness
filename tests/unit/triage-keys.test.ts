import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inTextEntry, triageKeyAction, triageKeyLabel } from '../../src/renderer/triage-keys.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// The single keys of a focused card (Issue #1523), shared with the review page (#1525): A accepts, R rejects, and neither ever
// fires from text entry, during composition or with a modifier held.

let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); });
afterEach(() => { vi.unstubAllGlobals(); uninstall(); });

const element = (tag: string, attributes: Record<string, string> = {}): MiniElement => {
  const node = miniDocument.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  miniDocument.body.append(node);
  return node;
};

it('names accept and reject on a focused card, in either case', () => {
  const card = element('article');
  expect(triageKeyAction({ key: 'a', target: card as unknown as EventTarget })).toBe('accept');
  expect(triageKeyAction({ key: 'R', target: card as unknown as EventTarget })).toBe('reject');
  expect(triageKeyAction({ key: 'Enter', target: card as unknown as EventTarget })).toBeNull();
  expect([triageKeyLabel('accept'), triageKeyLabel('reject')]).toEqual(['A', 'R']);
});

it('leaves the key to an input, a textarea, a select or an editable region, inside the card or anywhere', () => {
  const card = element('article');
  const reply = miniDocument.createElement('textarea'); card.append(reply);
  for (const target of [element('input'), reply, element('select'), element('div', { contenteditable: 'true' }), element('div', { contenteditable: '' })]) {
    expect(triageKeyAction({ key: 'a', target: target as unknown as EventTarget })).toBeNull();
  }
  const inside = miniDocument.createElement('span'); element('div', { contenteditable: 'true' }).append(inside);
  expect(triageKeyAction({ key: 'r', target: inside as unknown as EventTarget })).toBeNull();
  expect([inTextEntry(reply as unknown as EventTarget), inTextEntry(card as unknown as EventTarget), inTextEntry(null)]).toEqual([true, false, false]);
});

it('does nothing while an input method composes or a modifier is held', () => {
  const target = element('article') as unknown as EventTarget;
  expect(triageKeyAction({ key: 'a', target, isComposing: true })).toBeNull();
  expect(triageKeyAction({ key: 'Process', target, keyCode: 229 })).toBeNull();
  for (const held of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) expect(triageKeyAction({ key: 'a', target, ...held })).toBeNull();
});
