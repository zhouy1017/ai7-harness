import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createImportReview } from '../../src/renderer/import-review.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { ReimportGroupProjection, ReviewBeforeManuscriptReimportProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

const group = (ordinal: number, verb: ReimportGroupProjection['verb'] = null): ReimportGroupProjection => ({
  groupId: `group-${ordinal}`, ordinal, chapterLabel: null, verb, verbs: ['split', 'rewrite', 'delete', 'merge'],
  current: { count: 2, from: 1, to: 2, excerpts: [] }, staged: { count: 2, from: 1, to: 2, excerpts: [] },
});
const projection = (unresolvedGroups = 1): ReviewBeforeManuscriptReimportProjection => ({
  draftId: 'draft', draftVersion: 3, reviewDigest: 'review-3', commitAttemptId: null,
  target: { kind: 'existing-book', bookId: 'book', stableIdentity: 'book', label: '测试图书', internalNumber: null,
    manuscriptId: 'manuscript', branchId: 'branch', relationship: 'reimport', relationshipLabel: '重新导入主稿件', bookStateDigest: 'book-state' },
  checkpoint: { revisionId: 'revision', revisionLabel: '已保存', revisionDigest: 'revision-digest', journalSequence: 0, createdForDirtyJournal: false },
  lineage: { status: 'unconfirmed', label: '来源关系未确认', comparisonKind: 'two-way', sourceVersionId: null, revisionId: null },
  source: { displayName: 'sample1.docx', format: 'DOCX', sourceSha256: 'source', sourceBytes: 1,
    provenanceLabel: '本机文件选择器 · 本地解析 · 未联网', conversion: null, workingObjectSha256: null },
  sourceVersionResult: { disposition: 'created', label: '创建所选图书拥有的新来源版本', sourceVersionId: null },
  comparison: { comparisonDigest: 'comparison', totalMappings: 4, unresolvedMappings: unresolvedGroups, changed: true,
    resultPreviewLabel: '稿件将重新导入', groups: 2, unresolvedGroups, exactBlocks: 0 },
  fidelity: [], degradationDecision: { state: 'not-required-clean-import', items: [] }, commitReady: unresolvedGroups === 0,
  recordsToCreate: [], namedNonEffects: [],
});
const page = (items: ReimportGroupProjection[], nextCursor: number | null = null) => ({ items, nextCursor, previousCursor: null });
const job = (result: unknown, kind = 'reimport-resolution', state = 'completed') => ({
  jobId: 'job', kind, state, result, progress: { completed: 1, total: 1, label: '处理' },
});
const mapping = vi.fn();
const resolve = vi.fn();
const commit = vi.fn();
const returnEditing = vi.fn();
const status = vi.fn();
const replace = vi.fn();
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(done => setTimeout(done, 0)); };
let root: HTMLElement;
let view: ReturnType<typeof createImportReview>;
let restore: () => void;
const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
const choose = (ordinal: number, verb: string) => find(`article[data-reimport-group-id="group-${ordinal}"] [data-reimport-verb-choice="${verb}"]`);

beforeEach(() => {
  restore = installMiniDom(); setTechnicalLayerVisible(false);
  for (const mock of [mapping, resolve, commit, returnEditing, status, replace]) mock.mockReset();
  mapping.mockResolvedValue(page([group(1, 'split'), group(2)]));
  vi.stubGlobal('window', { ai7: { getReimportMappingPage: mapping, resolveReimportMapping: resolve,
    commitManuscriptReimport: commit, returnImportToEditing: returnEditing }, setTimeout, clearTimeout });
  root = document.createElement('main'); document.body.append(root);
  replace.mockImplementation((_state, content) => root.replaceChildren(content));
  view = createImportReview({ replaceScreen: replace, setStatus: status, awaitServiceJob: async initial => initial,
    abandonAndContinue: vi.fn(), appendRecoveryReturnAction: vi.fn(), hasErrorCode: () => false,
    identityFindingDisclosure: () => document.createElement('div'), initializeStartup: vi.fn(), instantValue: () => document.createElement('span'),
    rendererErrorMessage: (_error, fallback) => fallback, renderError: vi.fn(), renderImported: vi.fn(),
    sourceCard: () => document.createElement('div'), technicalDetails: () => document.createElement('details') });
});
afterEach(() => { setTechnicalLayerVisible(true); restore(); vi.unstubAllGlobals(); });

it('explains all four choices in one sentence and keeps resolved choices accessible', async () => {
  view.renderManuscriptReimportReview(projection()); await settle();
  const explanations = ['拆成新稿的多段', '用新稿改写这一处或加入新段落', '删去旧稿这一处', '并成新稿这一处'];
  ['split', 'rewrite', 'delete', 'merge'].forEach((verb, index) => {
    const button = choose(1, verb);
    const explanation = find(`[id="${button.getAttribute('aria-describedby')}"]`);
    expect(explanation.textContent).toContain(explanations[index]);
    expect(explanation.textContent).not.toContain('\n');
    expect(button.getAttribute('aria-pressed')).toBe(String(verb === 'split'));
  });
});

it('re-chooses one row without replacing its page or neighbours and focuses the next unresolved row', async () => {
  view.renderManuscriptReimportReview(projection()); await settle();
  const screen = root.firstElementChild;
  const first = find('article[data-reimport-group-id="group-1"]');
  const second = find('article[data-reimport-group-id="group-2"]');
  const fold = find('.fidelity-details') as HTMLDetailsElement; fold.open = true;
  resolve.mockResolvedValueOnce(job({ ...projection(), draftVersion: 4, reviewDigest: 'review-4', row: group(1, 'merge'), unresolvedGroups: 1 }));
  choose(1, 'merge').click(); await settle();
  expect(replace).toHaveBeenCalledTimes(1); expect(root.firstElementChild).toBe(screen);
  expect(find('article[data-reimport-group-id="group-1"]')).toBe(first);
  expect(find('article[data-reimport-group-id="group-2"]')).toBe(second);
  expect(fold.open).toBe(true); expect(mapping).toHaveBeenCalledTimes(1);
  expect(first.dataset['reimportGroupVerb']).toBe('merge');
  expect(miniDocument.activeElement).toBe(choose(2, 'split'));
  expect(find('[data-import-review-kind]').dataset).toMatchObject({ reimportDraftVersion: '4', reimportReviewDigest: 'review-4' });
  expect(find('[data-reimport-unresolved-groups]').dataset['reimportUnresolvedGroups']).toBe('1');
  resolve.mockResolvedValueOnce(job({ ...projection(0), draftVersion: 5, reviewDigest: 'review-5', row: group(2, 'rewrite'), unresolvedGroups: 0 }));
  choose(2, 'rewrite').click(); await settle();
  expect(resolve.mock.calls[1]![0]).toMatchObject({ expectedDraftVersion: 4, groupId: 'group-2', verb: 'rewrite' });
  expect(find('[data-reimport-unresolved-groups]').dataset['reimportUnresolvedGroups']).toBe('0');
  commit.mockRejectedValue(new Error('retry'));
  find('[data-commit-manuscript-reimport]').click(); await settle();
  expect(commit).toHaveBeenCalledWith(expect.objectContaining({ expectedDraftVersion: 5, reviewDigest: 'review-5' }));
});

it('finds the next unresolved page with the updated version while retaining the review surface', async () => {
  mapping.mockResolvedValueOnce(page([group(1)], 1)).mockResolvedValueOnce(page([group(2)]));
  view.renderManuscriptReimportReview(projection(2)); await settle();
  resolve.mockResolvedValue(job({ ...projection(), draftVersion: 4, reviewDigest: 'review-4', row: group(1, 'rewrite'), unresolvedGroups: 1 }));
  choose(1, 'rewrite').click(); await settle();
  expect(mapping.mock.calls[1]![0]).toEqual({ draftId: 'draft', expectedDraftVersion: 4, after: 1 });
  expect(replace).toHaveBeenCalledTimes(1);
  expect(miniDocument.activeElement).toBe(choose(2, 'split'));
});

it('submits degradation acceptance in the final action and keeps it on retry', async () => {
  const review = { ...projection(0), commitReady: false, degradationDecision: { state: 'required-unselected' as const, items: [] } };
  mapping.mockResolvedValue(page([group(1, 'rewrite'), group(2, 'rewrite')]));
  view.renderManuscriptReimportReview(review); await settle();
  commit.mockRejectedValue(new Error('after acceptance'));
  const submit = find('[data-accept-reimport-degradation]');
  expect(submit.textContent).toBe('接受降级并提交稿件重新导入');
  submit.click(); await settle(); submit.click(); await settle();
  expect(commit).toHaveBeenCalledTimes(2);
  for (const [input] of commit.mock.calls) expect(input).toMatchObject({ expectedDraftVersion: 3, reviewDigest: 'review-3', acceptDegradation: true });
  expect(status.mock.calls.flat().join(' ')).toContain('正在保存新稿');
  expect(status.mock.calls.flat().join(' ')).not.toMatch(/持久化|权威|有界/);
});

it('keeps final submission disabled until all comparison rows have a choice', async () => {
  view.renderManuscriptReimportReview({ ...projection(), degradationDecision: { state: 'required-unselected', items: [] } }); await settle();
  expect((find('[data-accept-reimport-degradation]') as HTMLButtonElement).disabled).toBe(true);
});

it('returns to a reimport comparison using the new version and digest', async () => {
  view.renderManuscriptReimportReview(projection()); await settle();
  returnEditing.mockResolvedValue({ state: 'reimport', draftVersion: 4, review: { ...projection(), draftVersion: 4, reviewDigest: 'review-4' } });
  find('[data-return-import-to-editing]').click(); await settle();
  expect(returnEditing).toHaveBeenCalledWith({ draftId: 'draft', expectedDraftVersion: 3 });
  expect(mapping.mock.calls[1]![0]).toEqual({ draftId: 'draft', expectedDraftVersion: 4, after: null });
  expect(find('[data-import-review-kind]').dataset['reimportReviewDigest']).toBe('review-4');
});
