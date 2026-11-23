import { expect, it, vi } from 'vitest';
import { seedRetainedReviewFallback } from '../support/retained-review-fixture.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions } from '../../src/renderer/review-workspace.js';
import { setTechnicalLayerVisible, technicalDisclosure } from '../../src/renderer/technical-layer.js';
import { checkBrowserAddress } from '../../src/shared/browser-address.js';
import { EditorialStore } from '../../src/service/store.js';
import type { RendererApi, SourceIdentityInput } from '../../src/shared/protocol.js';
import type { RetainedReviewFixture } from '../support/retained-review-fixture.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { findingRetainedSources } from '../../src/renderer/research-evidence.js';
import { randomUUID } from 'node:crypto';

const configuration = (store: EditorialStore) => ({ connections: store.getModelServiceConnections(),
  main: store.getConfiguredModelRoleBinding('main-editorial'), fast: store.getConfiguredModelRoleBinding('fast-interaction'),
  search: store.getSearchBackendSettings() });

async function verifySurface(store: EditorialStore, fixture: RetainedReviewFixture, developer: boolean) {
  const restore = installMiniDom(); setTechnicalLayerVisible(developer);
  const opened: SourceIdentityInput[] = [], copied: string[] = [];
  const api = new Proxy({
    inspectReviewWorkspace: async (input: { reviewRunId?: string }) => store.inspectReviewWorkspace(fixture.bookId, input.reviewRunId ?? fixture.reviewRunId),
    inspectResearchEvidence: async (input: Parameters<RendererApi['inspectResearchEvidence']>[0]) => store.inspectResearchEvidence({ after: null, staleAfterDays: null, ...input }),
    inspectFactualVerification: async (input: Parameters<EditorialStore['inspectFactualVerification']>[0]) => store.inspectFactualVerification(input),
  }, { get: (target, key) => Reflect.get(target, key) ?? (async () => { throw new Error('Unexpected fixture read'); }) });
  vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null, addEventListener() {}, removeEventListener() {}, ai7: {
    getPreferences: async () => ({ values: { 'actions.defaults': DEFAULT_QUICK_ACTIONS, 'model.favourites': {} } }),
    openSourceInBrowser: async (identity: SourceIdentityInput) => { const recorded = store.inspectSourceAddress(identity); const checked = checkBrowserAddress(recorded.address);
      if (!checked.ok) throw new Error(checked.sentence); opened.push(identity); return { host: checked.host }; },
  } });
  vi.stubGlobal('Option', class extends MiniElement { constructor(text: string, value: string) { super('option'); this.textContent=text; this.value=value; } });
  Object.defineProperty(MiniElement.prototype, 'options', { configurable: true, get(this: MiniElement) { return this.querySelectorAll('option'); } });
  Object.defineProperty(MiniElement.prototype, 'select', { configurable: true, value() {} });
  Object.assign(miniDocument, { execCommand: () => { copied.push((miniDocument.activeElement as MiniElement).value); return true; } });
  const root = document.createElement('main'); miniDocument.body.append(root as never);
  const surface = mountReviewWorkspace({ root, bookId: fixture.bookId, bookTitle: '公开来源回归', focus: { reviewRunId: fixture.reviewRunId, findingId: null }, api: api as unknown as MountReviewWorkspaceOptions['api'],
    awaitServiceJob: async initial => initial, technicalDetails: (_name, ...rows) => { const dl=document.createElement('dl'); dl.append(...rows); return technicalDisclosure(dl); },
    setStatus: Object.assign(vi.fn(), { settle: vi.fn() }), errorMessage: (_error, fallback) => fallback, errorCode: () => null,
    openManuscript: async () => {}, goToText: async () => {}, openPlan() {}, planChanged() {},
  });
  try {
    surface.start(); await vi.waitFor(() => expect(root.querySelectorAll('.review-finding-source').length).toBe(3));
    expect(root.querySelectorAll('.fact-lens').length).toBe(0);
    const rows = Array.from(root.querySelectorAll('.finding-evidence-source'));
    expect(rows.length).toBe(3);
    for (const source of fixture.sources) {
      const row = rows.find(node => node.getAttribute('data-evidence-id') === source.evidenceId)!;
      expect(row.textContent).toContain(new URL(source.address).host);
      expect(row.querySelector('.research-evidence-url')?.textContent).toBe(developer ? source.address : '');
      row.querySelector<HTMLButtonElement>('[data-source-action="copy-link"]')!.click();
      row.querySelector<HTMLButtonElement>('[data-source-action="open-in-browser"]')!.click();
    }
    await vi.waitFor(() => expect(opened.length).toBe(3));
    expect(copied).toEqual(fixture.sources.map(source => source.address));
    expect(opened).toEqual(fixture.sources.map(source => ({ bookId: fixture.bookId, evidenceId: source.evidenceId })));
    const retained = store.inspectResearchEvidence({ bookId: fixture.bookId, taskIntentId: fixture.taskIntentId, reviewFindingId: fixture.findingId, after: null, staleAfterDays: null });
    const finding = store.inspectReviewWorkspace(fixture.bookId, fixture.reviewRunId).run!.findings[0]!;
    const address = 'ftp://files.example.org/retained-refused';
    const refused = findingRetainedSources({ ...retained, records: [{ ...retained.records[0]!, url: address }] }, finding, fixture.bookId)!;
    expect(refused.querySelector('[data-source-action="open-in-browser"]') === null).toBe(true);
    const checked = checkBrowserAddress(address);
    expect(checked.ok).toBe(false);
    expect(refused.querySelector('.source-link-refusal')?.textContent).toBe(checked.ok ? null : checked.sentence);
    miniDocument.body.append(refused as never);
    refused.querySelector<HTMLButtonElement>('[data-source-action="copy-link"]')!.click();
    expect(copied.at(-1)).toBe(address); expect(opened.length).toBe(3);
  } finally {
    surface.destroy(); Reflect.deleteProperty(MiniElement.prototype, 'select'); Reflect.deleteProperty(MiniElement.prototype, 'options'); Reflect.deleteProperty(miniDocument, 'execCommand');
    setTechnicalLayerVisible(true); vi.unstubAllGlobals(); restore();
  }
}

it.each([false, true])('keeps retained web controls after verification failure, preserving pre-existing configuration=%s', async (populated) => {
  const roots = await createServiceTestRoots('ai7-retained-review-');
  const reader = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  try {
    if (populated) {
      reader.saveModelServiceConnection('Existing J04 connection', randomUUID(), 'ready');
      reader.selectFastRoleModel('deepseek-open-platform', 'account-future-model', 'off');
    }
    const before = configuration(reader);
    await seedRetainedReviewFallback(roots, async (_writer, fixture) => {
      expect(fixture.retainedBeforeFailure).toBe(3); expect(fixture.verificationResults).toBe(0);
      for (const developer of [false, true]) await verifySurface(reader, fixture, developer);
    });
    if (populated) expect(configuration(reader)).toEqual(before);
    else expect(reader.getModelServiceConnection()?.credentialOperationState).toBe('missing');
  } finally { reader.close(); await roots.dispose(); }
}, 60_000);
