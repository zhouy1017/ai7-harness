import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DialogueSelectionInput,
  PromoteTaskIntentDraftInput,
  SaveTaskIntentDraftInput,
  ServiceJobProjection,
  TaskIntentDraftProjection,
  TaskIntentDraftsProjection,
} from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';
import { mountTaskComposer, type ComposerRange, type TaskComposerOptions, type TaskComposerSeed } from '../../src/renderer/task-panel.js';
import {
  TASK_COMPOSER_ACTIONS,
  TASK_COMPOSER_ADD_RANGE,
  TASK_COMPOSER_GOAL_LABEL,
  TASK_COMPOSER_NOTE,
  TASK_COMPOSER_TITLES,
  TASK_PANEL_COMPOSE_OPEN,
  TASK_PANEL_DRAFT_KIND,
  taskComposerParkedLine,
  taskComposerRevisionLine,
  taskPanelCardView,
} from '../../src/renderer/task-panel-labels.js';
import { DIALOGUE_PROMOTE_LABEL, dialogueReasoningLine } from '../../src/renderer/dialogue-labels.js';
import { taskPlanDraftSentence } from '../../src/renderer/task-drawer-labels.js';

// Unit (L1) suite for the Context-bound Task Composer (Issue #423, wave 10 slice 7a; V2-UX-TASK-001 to 009, 046) on a minimal DOM:
// a selection seeds exactly its words, the whole-Book route seeds none, the composer is transient, an input method's composition
// never prepares, 再选一段加入 pins one more range, the 7c recommendation slot keeps its element and its attributes follow the draft,
// and 准备任务 / 准备计划 call exactly the draft operations — nothing else.

const BOOK = 'b0000000-0000-4000-8000-000000000001';
const DRAFT = 'd0000000-0000-4000-8000-000000000001';
const VERSION = 'e0000000-0000-4000-8000-000000000001';

let uninstall: () => void;

beforeEach(() => {
  uninstall = installMiniDom();
});

afterEach(() => {
  uninstall();
});

function span(blockId: string, text: string, from = 2): DialogueSelectionInput {
  return {
    manuscriptId: 'a0000000-0000-4000-8000-000000000001', branchId: 'a0000000-0000-4000-8000-000000000002',
    windowStartBlockId: blockId, baseRevisionId: 'a0000000-0000-4000-8000-000000000003', expectedJournalSequence: 4,
    blockId, baseBlockDigest: '0'.repeat(64), fromGrapheme: from, toGrapheme: from + [...text].length, selectedText: text,
  };
}

function range(blockId: string, text: string, from = 2): ComposerRange {
  return { key: `new-${randomUUID()}`, rangeId: null, span: span(blockId, text, from), blockId, text, position: 3, revisionLabel: 'r1', journalSequence: 4, state: 'exact', stateLabel: null };
}

function draftOf(input: SaveTaskIntentDraftInput, ordinal: number): TaskIntentDraftProjection {
  return {
    draftId: DRAFT, bookId: BOOK, bookTitle: '任务撰写', origin: input.draftId === null ? input.origin : 'composer-selection', createdAt: '2026-10-17T00:00:00.000Z',
    version: {
      versionId: VERSION, ordinal, goal: input.goal.trim(), target: input.target.kind, outcomeClass: input.outcomeClass,
      ranges: input.target.kind === 'ranges' ? input.target.ranges.map((entry, index) => ({
        rangeId: `f0000000-0000-4000-8000-00000000000${index}`, manuscriptId: 'a0000000-0000-4000-8000-000000000001',
        blockId: entry.kind === 'new' ? entry.span.blockId : 'blk_000000000000000000000001', fromGrapheme: 2, toGrapheme: 6,
        text: entry.kind === 'new' ? entry.span.selectedText : '原来的字', revisionLabel: 'r1', journalSequence: 4, state: 'pending-save', stateLabel: '待保存修订版', position: 3,
      })) : [],
      answer: null, procedurePin: input.procedurePin ?? null, createdAt: '2026-10-17T00:00:01.000Z',
    },
    promotion: null,
    resolution: input.outcomeClass === null ? { state: 'unsupported', reason: '先选「希望得到的结果」，再准备计划。' }
      : { state: 'ready', option: { choice: { kind: 'baseline', mode: 'first-baseline' }, taskKind: 'baseline-analysis', label: '首次基线分析', available: true, reason: null } },
  };
}

function harness(overrides: Partial<TaskComposerOptions> = {}) {
  const saved: SaveTaskIntentDraftInput[] = [];
  const promoted: PromoteTaskIntentDraftInput[] = [];
  let latest: TaskIntentDraftProjection | null = null;
  const reads: TaskIntentDraftsProjection = { bookId: BOOK, bookTitle: '任务撰写', manuscript: { revisionLabel: 'r2', journalSequence: 9, pendingSave: true }, drafts: [] };
  const opened: Array<[string, string, string]> = [];
  const closed = vi.fn();
  const statuses: string[] = [];
  const options: TaskComposerOptions = {
    api: {
      saveTaskIntentDraft: async (input) => {
        saved.push(structuredClone(input) as SaveTaskIntentDraftInput);
        latest = draftOf({ ...input, bookId: BOOK }, saved.length);
        return latest;
      },
      inspectTaskIntentDrafts: async (input) => input.draftId === null ? reads : { ...reads, drafts: latest === null ? [] : [latest] },
      promoteTaskIntentDraft: async (input) => {
        promoted.push(structuredClone(input) as PromoteTaskIntentDraftInput);
        latest = { ...latest!, resolution: null, promotion: { taskKind: 'baseline-analysis', taskIntentId: 'c0000000-0000-4000-8000-000000000001', planRef: 'c0000000-0000-4000-8000-000000000001', promotedAt: 'now' } };
        return { jobId: randomUUID(), kind: 'baseline-analysis-preparation', state: 'completed', progress: { completed: 1, total: 1, label: '已准备' }, result: null, failure: null } as unknown as ServiceJobProjection;
      },
    },
    setStatus: (message) => { statuses.push(message); },
    errorMessage: (_error, fallback) => fallback,
    awaitServiceJob: async (initial) => initial,
    pickRange: async () => range('blk_000000000000000000000009', '再加一段'),
    openProcedures: vi.fn(),
    settle: async () => true,
    openPlan: (bookId, kind, ref) => { opened.push([bookId, kind, ref]); },
    openNew: vi.fn(),
    close: closed,
    onChanged: vi.fn(),
    ...overrides,
  };
  const composer = mountTaskComposer(options);
  miniDocument.body.append(composer.element as unknown as MiniElement);
  const root = composer.element as unknown as MiniElement;
  const action = (name: string): MiniElement | null => root.querySelector(`[data-task-composer-action="${name}"]`);
  const field = (name: string): MiniElement | null => root.querySelector(`[data-task-composer-field="${name}"]`);
  const type = (text: string): void => {
    const goal = field('goal')!;
    goal.value = text;
    goal.dispatchEvent({ type: 'input', bubbles: true });
  };
  return { composer, root, action, field, type, saved, promoted, opened, closed, statuses, options };
}

const settle = async (): Promise<void> => {
  for (let index = 0; index < 5; index += 1) await new Promise((resolveWait) => setTimeout(resolveWait, 0));
};

const SEED_SELECTION = (ranges: ComposerRange[]): TaskComposerSeed => ({
  bookId: BOOK, bookTitle: '任务撰写', origin: 'composer-selection', manuscript: { revisionLabel: 'r2', journalSequence: 9, pending: false }, ranges,
});

describe('the Context-bound Task Composer', () => {
  it('is transient: nothing shows until it is opened, and 取消 leaves nothing behind and saves nothing', async () => {
    const { composer, root, action, closed, saved } = harness();
    expect(root.dataset['taskComposer']).toBe('closed');
    expect(root.children).toHaveLength(0);
    composer.openNew(SEED_SELECTION([range('blk_000000000000000000000001', '所选的字')]));
    await settle();
    expect(root.dataset['taskComposer']).toBe('new');
    action('close')!.click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(root.dataset['taskComposer']).toBe('closed');
    expect(root.children).toHaveLength(0);
    expect(saved).toEqual([]);
    expect(composer.held()).toBeNull();
  });

  it('seeds a selection\'s words only, with the Book, revision and the range\'s state, and prepares a draft of exactly that', async () => {
    const { composer, root, action, field, type, saved } = harness();
    const words = range('blk_000000000000000000000001', '所选的字');
    composer.openNew(SEED_SELECTION([words]));
    await settle();
    expect(root.querySelector('h3')!.textContent).toBe(TASK_COMPOSER_TITLES.selection);
    expect(root.querySelector('.task-composer-book')!.textContent).toBe('《任务撰写》 · 稿件');
    // The manuscript as it stands now: edits no revision holds yet, so the words just pinned read 待保存修订版 (TASK-002).
    expect(root.querySelector('.task-composer-revision')!.textContent).toBe(taskComposerRevisionLine('r2', 9, true));
    const items = root.querySelectorAll('li.task-composer-range');
    expect(items.map((item) => [item.querySelector('blockquote')!.textContent, item.dataset['rangeState'], item.querySelector('[data-range-state-label]')?.textContent ?? null]))
      .toEqual([['所选的字', 'pending-save', '待保存修订版']]);
    expect(field('target-ranges')!.checked).toBe(true);
    expect(field('target-book')!.checked).toBe(false);
    expect(root.querySelector('.task-composer-goal span')!.textContent).toBe(TASK_COMPOSER_GOAL_LABEL);
    expect(root.querySelector('.task-composer-note')!.textContent).toBe(TASK_COMPOSER_NOTE);
    // Nothing is prepared without the editor's words.
    expect(action('prepare')!.disabled).toBe(true);
    type('  统一这段的人名  ');
    expect(action('prepare')!.disabled).toBe(false);
    field('outcome-review')!.checked = true;
    field('outcome-review')!.dispatchEvent({ type: 'change' });
    action('prepare')!.click();
    await settle();
    expect(saved).toEqual([{ draftId: null, expectedOrdinal: null, origin: 'composer-selection', goal: '  统一这段的人名  ',
      target: { kind: 'ranges', ranges: [{ kind: 'new', span: words.span }] }, outcomeClass: 'review' }]);
    // Saved, the same surface edits the draft: its version, and 准备计划 once nothing is unsaved.
    expect(root.dataset['taskComposer']).toBe('draft');
    expect(root.dataset['taskComposerDraft']).toBe(DRAFT);
    expect(root.querySelector('h3')!.textContent).toBe('任务意图草稿 · 第 1 版');
    expect(action('promote')!.disabled).toBe(false);
    expect(action('save')!.disabled).toBe(true);
    expect(composer.held()).toEqual({ bookId: BOOK, bookTitle: '任务撰写', draftId: DRAFT, unsaved: false, promoted: false });
  });

  it('opens on the whole Book with no range, never defaulting to the selected words, and offers 发起全书任务\'s words', async () => {
    const { composer, root, field } = harness();
    composer.openNew({ bookId: BOOK, bookTitle: '任务撰写', origin: 'composer-book', manuscript: null, ranges: [] });
    await settle();
    expect(root.querySelector('h3')!.textContent).toBe(TASK_COMPOSER_TITLES.book);
    expect(field('target-book')!.checked).toBe(true);
    expect(field('target-ranges')!.disabled).toBe(true);
    expect(root.querySelector('.task-composer-book-note')).not.toBeNull();
    expect(root.querySelector('.task-composer-no-ranges')).not.toBeNull();
    expect(root.querySelector('[data-task-composer-action="procedures"]')).toBeNull();
    expect(TASK_PANEL_COMPOSE_OPEN).toBe('发起全书任务…');
  });

  it('never prepares on an input method\'s Enter (TASK-009), and does on Ctrl+Enter outside a composition', async () => {
    const { composer, root, field, type, saved, statuses } = harness();
    composer.openNew({ bookId: BOOK, bookTitle: '任务撰写', origin: 'composer-book', manuscript: null, ranges: [] });
    await settle();
    type('统一全书的人名');
    const goal = field('goal')!;
    goal.dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: true, isComposing: true, keyCode: 229 });
    goal.dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: true, isComposing: false, keyCode: 229 });
    root.dispatchEvent({ type: 'compositionstart' });
    goal.dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: true, isComposing: false, keyCode: 13 });
    root.querySelector('[data-task-composer-action="prepare"]')!.click();
    await settle();
    expect(saved).toEqual([]);
    expect(statuses).toContain('输入法正在输入，完成后再准备任务。');
    root.dispatchEvent({ type: 'compositionend' });
    goal.dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: false, isComposing: false, keyCode: 13 });
    await settle();
    expect(saved).toEqual([]);
    goal.dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: true, isComposing: false, keyCode: 13 });
    await settle();
    expect(saved.map((input) => input.goal)).toEqual(['统一全书的人名']);
  });

  it('pins one more range with 再选一段加入, refuses the same words twice, and says why when nothing is selected', async () => {
    let answer: ComposerRange | string = range('blk_000000000000000000000009', '再加一段');
    const { composer, root, action, field } = harness({ pickRange: async () => answer });
    composer.openNew({ bookId: BOOK, bookTitle: '任务撰写', origin: 'composer-book', manuscript: null, ranges: [] });
    await settle();
    expect(action('add-range')!.textContent).toBe(TASK_COMPOSER_ADD_RANGE);
    action('add-range')!.click();
    await settle();
    expect(root.querySelectorAll('li.task-composer-range').map((item) => item.querySelector('blockquote')!.textContent)).toEqual(['再加一段']);
    // Adding words is the editor's explicit choice of the ranges as the target (TASK-003).
    expect(field('target-ranges')!.checked).toBe(true);
    action('add-range')!.click();
    await settle();
    expect(root.querySelectorAll('li.task-composer-range')).toHaveLength(1);
    expect(root.querySelector('.task-composer-problem')!.textContent).toBe('这段文字已经在草稿里。');
    answer = '先在稿件里选中要加入的文字，再按「再选一段加入」。';
    action('add-range')!.click();
    await settle();
    expect(root.querySelector('.task-composer-problem')!.textContent).toBe(answer);
    // Removing the last one leaves the whole Book, said as the target, never the words silently.
    action('remove-range')!.click();
    expect(root.querySelectorAll('li.task-composer-range')).toHaveLength(0);
    expect(field('target-book')!.checked).toBe(true);
  });

  it('keeps 7c\'s recommendation slot element, follows the draft in its attributes only, and keeps the 工序 its event picks', async () => {
    const { composer, root, type, action, saved } = harness();
    composer.openNew(SEED_SELECTION([range('blk_000000000000000000000001', '所选的字')]));
    await settle();
    const slot = root.querySelector('[data-procedure-recommendation]')!;
    const child = miniDocument.createElement('p');
    slot.append(child);
    type('统一这段的人名');
    await settle();
    expect(slot.dataset['scopeKind']).toBe('selection');
    expect(slot.dataset['taskKind']).toBe('');
    expect(slot.dataset['goalDigest']).toBe(createHash('sha256').update('统一这段的人名').digest('hex'));
    const procedureId = '90000000-0000-4000-8000-000000000001';
    const versionId = '90000000-0000-4000-8000-000000000002';
    slot.dispatchEvent({ type: 'procedure-recommendation-selected', bubbles: true, detail: { procedureId, versionId, title: '人名统一', matchRationale: '按人名' } });
    // A repaint moves the same slot, with 7c's children, and the pick shows as a chip.
    expect(root.querySelector('[data-procedure-recommendation]')).toBe(slot);
    expect(slot.children.includes(child)).toBe(true);
    expect(root.querySelector('[data-task-composer-pin]')!.textContent).toContain('已选工序：《人名统一》');
    action('prepare')!.click();
    await settle();
    expect(saved[0]!.procedurePin).toEqual({ procedureId, versionId });
    slot.dispatchEvent({ type: 'procedure-recommendation-cleared', bubbles: true });
    expect(root.querySelector('[data-task-composer-pin]')).toBeNull();
  });

  it('makes a prepared Task with 准备计划 through the draft operation and opens its plan, never on an unsaved version', async () => {
    const { composer, root, action, type, field, promoted, opened } = harness();
    composer.openNew({ bookId: BOOK, bookTitle: '任务撰写', origin: 'composer-book', manuscript: null, ranges: [] });
    await settle();
    type('为这本书做基线分析');
    field('outcome-analysis')!.checked = true;
    field('outcome-analysis')!.dispatchEvent({ type: 'change' });
    action('prepare')!.click();
    await settle();
    expect(root.querySelector('.task-composer-ready')!.textContent).toBe('准备计划会按「首次基线分析」准备一项任务；由你在计划里开始。');
    type('为这本书做基线分析，重点看人物');
    expect(action('promote')!.disabled).toBe(true);
    expect(root.querySelector('.task-composer-unsaved')!.hidden).toBe(false);
    action('save')!.click();
    await settle();
    action('promote')!.click();
    await settle();
    expect(promoted).toEqual([{ draftId: DRAFT, versionId: VERSION, choice: { kind: 'baseline', mode: 'first-baseline' } }]);
    expect(opened).toEqual([[BOOK, 'baseline-analysis', 'c0000000-0000-4000-8000-000000000001']]);
    expect(root.dataset['taskComposer']).toBe('promoted');
    expect(action('copy')!.textContent).toBe(TASK_COMPOSER_ACTIONS.copy);
  });
});

describe('the composer\'s words', () => {
  it('keeps every new string byte for byte', () => {
    expect(TASK_COMPOSER_TITLES).toEqual({ selection: '就这段发起任务', book: '发起全书任务', draft: '任务意图草稿' });
    expect(TASK_COMPOSER_GOAL_LABEL).toBe('描述希望 AI7 完成的编辑工作');
    expect(TASK_COMPOSER_ACTIONS.prepare).toBe('准备任务');
    expect(TASK_COMPOSER_ACTIONS.promote).toBe('准备计划');
    expect(TASK_COMPOSER_ACTIONS.resume).toBe('返回继续');
    expect(taskComposerParkedLine('甲书')).toBe('《甲书》有一份没有完成的任务草稿，留在那本书里。');
    expect(taskPlanDraftSentence('统一人名')).toBe('你的要求：「统一人名」');
    expect(DIALOGUE_PROMOTE_LABEL).toBe('转为任务意图草稿');
    expect(dialogueReasoningLine(0)).toBe('正在检索与所选文字相关的段落…');
    expect(dialogueReasoningLine(3)).toBe('正在比对检索到的 3 个段落…');
  });

  it('names a draft\'s card as a draft, never a Task', () => {
    const view = taskPanelCardView({
      item: {
        itemId: `draft:${DRAFT}`, group: 'decisions', state: 'draft-unfinished', blocked: false, at: '2026-10-17T00:00:00.000Z',
        book: { bookId: BOOK, title: '任务撰写' }, object: { kind: 'draft', goal: '统一全书的人名译法', origin: 'composer-book', ranges: 0 },
        facts: { progress: null, categories: [], revisionOrdinal: null }, nextStep: 'continue-draft',
        target: { kind: 'task-intent-draft', bookId: BOOK, draftId: DRAFT }, technical: [],
      },
      result: null,
    });
    expect(view).toMatchObject({ kindLabel: TASK_PANEL_DRAFT_KIND, title: '任务草稿 · 「统一全书的人名译法」', stateLabel: '任务草稿 · 尚未准备计划' });
    expect(view.actions).toEqual([{ key: 'next', label: '继续编辑草稿', primary: true }]);
  });
});
