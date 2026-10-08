import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DialogueExecutionOwner, dialogueRouteRefusal } from '../../src/service/dialogue/dialogue-execution.js';
import { DIALOGUE_SCHEMA_SQL } from '../../src/service/dialogue/dialogue-ledger.js';
import { HARNESS_SESSION_LOG_DIRECTORY } from '../../src/service/harness/session-log.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { DATABASE_MERGE_SCHEMA_VERSION, DIALOGUE_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type { DialogueProjection, DialogueSelectionInput } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';

// Service-integration suite (L2) for 就这段提问… (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-001 to 016) over the
// real store, the real PrimaryAgentHarness composition and the AI7 local deterministic adapter: an answer streamed by
// complete fragment with a sentence cut in two held back; 停止回答 keeping only complete fragments; 重新回答 and 继续回答 as
// new attempts linked to the one before; the history read back from the Harness Session Ledger after a restart, with no
// answer text in any AI7 table; an answer AI7 closed under settled 回答已中断 at the next start; 转为修改建议 of a completed
// answer, refused for an incomplete one, leaving the manuscript as it was; and revision 60 added to a revision-58 store.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const QUESTION = '这段的叙述视角是否一致？';
const FIRST_SENTENCE = '这段一直用第三人称限知视角叙述。';
const SECOND_SENTENCE = '人物的心理只写到主人公为止，没有越界。';
const TAIL = '唯一可以斟酌的是末句的语气，略显突兀，可以改得更平缓些';
const BROKEN_TAIL = '人物的心理只写到';

let roots: ServiceTestRoots;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-dialogue-');
  await requireExactSample1(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-dialogue');
});

afterEach(async () => {
  await roots.dispose();
});

/** A hold the test releases chunk by chunk: `allow(n)` lets the n-th delta through. */
function steppedHold(): { hold: (streamed: number, interrupted: () => boolean) => Promise<void>; allow: (count: number) => void; waiting: () => number } {
  let allowed = 0;
  let waitingAt = -1;
  const wakers = new Set<() => void>();
  return {
    hold: async (streamed, interrupted) => {
      while (streamed >= allowed && !interrupted()) {
        waitingAt = streamed;
        await new Promise<void>((resolveWait) => {
          wakers.add(resolveWait);
          setTimeout(resolveWait, 20);
        });
      }
      waitingAt = -1;
    },
    allow: (count) => {
      allowed = count;
      for (const wake of wakers) wake();
      wakers.clear();
    },
    waiting: () => waitingAt,
  };
}

function owner(store: EditorialStore, hold: ((streamed: number, interrupted: () => boolean) => Promise<void>) | null, withFixture = true): DialogueExecutionOwner {
  return new DialogueExecutionOwner({
    records: store,
    fixture: withFixture ? fixture : null,
    sessionLogRoot: join(roots.dataRoot, HARNESS_SESSION_LOG_DIRECTORY),
    developerLive: false,
    answerHold: hold,
  });
}

function selectionOf(store: EditorialStore, book: { manuscriptId: string; branchId: string }): DialogueSelectionInput {
  const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 30)!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: 2,
    toGrapheme: 22,
    selectedText: graphemesOf(block.text).slice(2, 22).join(''),
  };
}

async function waitFor<T>(read: () => T, done: (value: T) => boolean, label: string): Promise<T> {
  const until = Date.now() + 10_000;
  for (;;) {
    const value = read();
    if (done(value)) return value;
    if (Date.now() > until) throw new Error(`timed out: ${label} ${JSON.stringify(value)}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

const texts = (projection: DialogueProjection, attempt = projection.attempts.length - 1): string[] =>
  projection.attempts[attempt]!.fragments.map((fragment) => fragment.text);

function storeBytes(): Buffer {
  return Buffer.concat(readdirSync(join(roots.dataRoot, 'store')).map((name) => readFileSync(join(roots.dataRoot, 'store', name))));
}

describe('就这段提问… over the real store and harness', () => {
  it('streams by complete fragment, stops, answers anew, reads its history from the ledger after a restart, and converts', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const stepped = steppedHold();
    let dialogues = owner(store, stepped.hold);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '对话旅程');
      const selection = selectionOf(store, book);
      const workingBefore = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest;

      // 就这段提问…: no plan and no start step; the Task is recorded and its answer starts at once.
      dialogues.requireReady();
      const turn = store.askAboutSelection(book.bookId, { selection, question: `  ${QUESTION}\n` });
      expect(turn.message).toEqual({ kind: 'ask', selection: selection.selectedText, question: QUESTION, kept: null });
      stepped.allow(2);
      dialogues.begin(turn);
      expect(() => dialogues.requireReady()).toThrowError(/另一段对话正在回答/u);
      const live = (id: string) => dialogues.liveText(id);
      // Held after two deltas: the first sentence is whole, the second is cut in two and is not shown (DIALOG-006).
      await waitFor(() => stepped.waiting(), (at) => at === 2, 'held at two');
      const held = store.inspectDialogue(book.bookId, turn.dialogueId, 0, live);
      expect(held.attempts).toHaveLength(1);
      expect(held.attempts[0]).toMatchObject({ ordinal: 1, kind: 'ask', state: 'answering', source: 'live', fragmentTotal: 1 });
      expect(texts(held)).toEqual([FIRST_SENTENCE]);
      expect(JSON.stringify(held)).not.toContain(BROKEN_TAIL);
      expect(held.question).toBe(QUESTION);
      expect(held.selection).toBe(selection.selectedText);
      expect(held.actions).toEqual({ stop: true, continue: false, regenerate: false, convert: false });
      // A reader that has shown the first fragment is given only what follows it.
      expect(store.inspectDialogue(book.bookId, turn.dialogueId, 1, live).attempts[0]).toMatchObject({ fragments: [], fragmentsFrom: 1, fragmentTotal: 1 });
      // The 任务 panel lists it in 进行中, read in the background as 等待回答 only.
      const panel = store.inspectBookTasks(book.bookId, () => null, 'admitting', live);
      const running = panel.groups.find((group) => group.key === 'running')!;
      expect(panel.running).toBe(true);
      expect(running.items.map((entry) => [entry.item.state, entry.item.object, entry.result])).toEqual([
        ['dialogue-answering', { kind: 'dialogue', question: QUESTION }, null],
      ]);

      // 停止回答: only complete fragments are kept, labelled incomplete; nothing is retried (DIALOG-012, 014).
      expect(refusal(() => store.convertDialogueToChangeSuggestion(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId, proposedText: '改', rationale: '' })))
        .toBe('DIALOGUE_INCOMPLETE');
      await dialogues.stop(store.answeringDialogueAttempt(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId }));
      const stopped = store.inspectDialogue(book.bookId, turn.dialogueId, 0, live);
      expect(stopped.attempts[0]).toMatchObject({ state: 'stopped', source: 'ledger', causeCode: null, fragmentTotal: 1 });
      expect(texts(stopped)).toEqual([FIRST_SENTENCE]);
      expect(stopped.actions).toEqual({ stop: false, continue: true, regenerate: true, convert: false });
      expect(refusal(() => store.convertDialogueToChangeSuggestion(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId, proposedText: '改', rationale: '' })))
        .toBe('DIALOGUE_INCOMPLETE');
      expect(refusal(() => store.answeringDialogueAttempt(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId }))).toBe('DIALOGUE_NOT_ANSWERING');

      // 重新回答: a new traceable attempt linked to the one before, sending the same words and question again.
      stepped.allow(99);
      const again = store.nextDialogueAttempt(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId }, 'regenerate');
      expect(again.message).toEqual(turn.message);
      expect(again.attemptId).not.toBe(turn.attemptId);
      dialogues.begin(again);
      const answered = await waitFor(() => store.inspectDialogue(book.bookId, turn.dialogueId, 0, live), (value) => value.attempts[1]?.state === 'completed', 'regenerated');
      expect(answered.attempts.map((attempt) => [attempt.ordinal, attempt.kind, attempt.state])).toEqual([[1, 'ask', 'stopped'], [2, 'regenerate', 'completed']]);
      expect(texts(answered, 0)).toEqual([FIRST_SENTENCE]);
      expect(texts(answered, 1)).toEqual([FIRST_SENTENCE, SECOND_SENTENCE, TAIL]);
      expect(answered.actions).toEqual({ stop: false, continue: false, regenerate: true, convert: true });
      expect(refusal(() => store.nextDialogueAttempt(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId }, 'regenerate'))).toBe('DIALOGUE_STALE');

      // No transcript copy (ADR 0011, ADR 0014): neither the question nor any answer is in an AI7 table.
      const bytes = storeBytes();
      for (const words of [QUESTION, FIRST_SENTENCE, SECOND_SENTENCE, TAIL]) expect(bytes.includes(Buffer.from(words, 'utf8'))).toBe(false);
      const panelDone = store.inspectBookTasks(book.bookId, () => null);
      expect(panelDone.running).toBe(false);
      expect(panelDone.groups.find((group) => group.key === 'recent')!.items.map((entry) => [entry.item.state, entry.result]))
        .toEqual([['dialogue-answered', { kind: 'dialogue', dialogueId: turn.dialogueId }]]);

      // A restart: the history is joined again from the records to the Harness Session Ledger.
      await dialogues.dispose();
      store.close();
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.reconcileDialogueAttempts()).toBe(0);
      dialogues = owner(store, null);
      const recovered = store.inspectDialogue(book.bookId, turn.dialogueId, 0, () => null);
      expect(recovered).toEqual({ ...answered, attempts: answered.attempts.map((attempt) => ({ ...attempt, source: 'ledger' })) });

      // 转为修改建议: an AI7-produced 修改建议 on the selected words, its origin the dialogue Task; nothing is applied.
      const latest = recovered.attempts[1]!.attemptId;
      expect(refusal(() => store.convertDialogueToChangeSuggestion(book.bookId, { dialogueId: turn.dialogueId, attemptId: latest, proposedText: selection.selectedText, rationale: '' })))
        .toBe('MARK_BODY_INVALID');
      const converted = store.convertDialogueToChangeSuggestion(book.bookId, {
        dialogueId: turn.dialogueId, attemptId: latest, proposedText: '这段话的语气改得平缓些', rationale: `依据对话回答：${QUESTION}`,
      });
      expect(converted.dialogue.attempts[1]!.convertedMarkIds).toEqual([converted.markId]);
      const card = store.getEditorialMarkCard(book.manuscriptId, book.branchId, converted.markId);
      expect(card.kind).toBe('change-suggestion');
      expect(card.source).toEqual({ kind: 'ai7', origin: 'task', label: '对话回答', taskId: turn.dialogueId });
      expect(card.suggestion).toMatchObject({ currentText: selection.selectedText, proposedText: '这段话的语气改得平缓些', decision: null, application: null });
      expect(card.basis).toEqual([{ label: '对话回答 · 第 2 次', blockId: selection.blockId, fromGrapheme: 2, toGrapheme: 22, quote: `${FIRST_SENTENCE}${SECOND_SENTENCE}${TAIL}` }]);
      expect(store.getManuscriptWindow(book.manuscriptId, book.branchId, null).workingDigest).toBe(workingBefore);
    } finally {
      await dialogues.dispose();
      store.close();
    }
  });

  it('goes on from what a stopped answer kept, as a new attempt carrying it', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const stepped = steppedHold();
    const dialogues = owner(store, stepped.hold);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '继续回答');
      const selection = selectionOf(store, book);
      const turn = store.askAboutSelection(book.bookId, { selection, question: QUESTION });
      stepped.allow(2);
      dialogues.begin(turn);
      await waitFor(() => stepped.waiting(), (at) => at === 2, 'held');
      await dialogues.stop(turn.attemptId);
      stepped.allow(99);
      const next = store.nextDialogueAttempt(book.bookId, { dialogueId: turn.dialogueId, attemptId: turn.attemptId }, 'continue');
      expect(next.message).toEqual({ kind: 'continue', selection: selection.selectedText, question: QUESTION, kept: FIRST_SENTENCE });
      dialogues.begin(next);
      const done = await waitFor(() => store.inspectDialogue(book.bookId, turn.dialogueId, 0, (id) => dialogues.liveText(id)),
        (value) => value.attempts[1]?.state === 'completed', 'continued');
      expect(done.attempts[1]).toMatchObject({ kind: 'continue', state: 'completed' });
      expect(texts(done)).toEqual([FIRST_SENTENCE, SECOND_SENTENCE, `${TAIL}。`]);
      // A completed answer is not continued; a stale attempt is refused.
      expect(refusal(() => store.nextDialogueAttempt(book.bookId, { dialogueId: turn.dialogueId, attemptId: next.attemptId }, 'continue'))).toBe('DIALOGUE_NOT_INCOMPLETE');
    } finally {
      await dialogues.dispose();
      store.close();
    }
  });

  it('settles an answer AI7 closed under as interrupted, and one a stopped service left as interrupted at the next start', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const stepped = steppedHold();
    let dialogues = owner(store, stepped.hold);
    let bookId = '';
    let dialogueId = '';
    try {
      const book = await importSample1Book(store, roots.codeRoot, '中断');
      bookId = book.bookId;
      const turn = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
      dialogueId = turn.dialogueId;
      stepped.allow(3);
      dialogues.begin(turn);
      await waitFor(() => stepped.waiting(), (at) => at === 3, 'held at three');
      // AI7 closing: the answer is interrupted while the store is still open.
      await dialogues.dispose();
      const closed = store.inspectDialogue(bookId, dialogueId, 0, () => null);
      expect(closed.attempts[0]).toMatchObject({ state: 'interrupted', causeCode: 'AI7_CLOSED' });
      expect(texts(closed)).toEqual([FIRST_SENTENCE, SECOND_SENTENCE]);
      expect(closed.actions).toMatchObject({ continue: true, regenerate: true, convert: false });
      // A service that stopped before settling its answer: the next start settles it from the ledger, sending nothing.
      dialogues = owner(store, stepped.hold);
      const next = store.nextDialogueAttempt(bookId, { dialogueId, attemptId: closed.attempts[0]!.attemptId }, 'regenerate');
      stepped.allow(1);
      dialogues.begin(next);
      await waitFor(() => stepped.waiting(), (at) => at === 1, 'held at one');
    } finally {
      store.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(store.reconcileDialogueAttempts()).toBe(1);
      const reconciled = store.inspectDialogue(bookId, dialogueId, 0, () => null);
      expect(reconciled.attempts[1]).toMatchObject({ state: 'interrupted', causeCode: 'SERVICE_STOPPED', source: 'ledger', fragmentTotal: 0 });
      expect(store.reconcileDialogueAttempts()).toBe(0);
    } finally {
      await dialogues.dispose().catch(() => undefined);
      store.close();
    }
  });

  it('refuses before anything is recorded when no dialogue route is bound, and refuses words and questions it cannot take', async () => {
    expect(dialogueRouteRefusal({ fixture: null, developerLive: false })).toBe('这次启动没有可用的对话模型；没有发送任何内容。');
    expect(dialogueRouteRefusal({ fixture: {} as ResolvedModelFixture, developerLive: true })).toMatch(/对话还没有接入实时模型/u);
    expect(dialogueRouteRefusal({ fixture: {} as ResolvedModelFixture, developerLive: false })).toBeNull();
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(() => owner(store, null, false).requireReady()).toThrowError(/没有可用的对话模型/u);
      const book = await importSample1Book(store, roots.codeRoot, '拒绝');
      const selection = selectionOf(store, book);
      expect(refusal(() => store.askAboutSelection(book.bookId, { selection, question: '   ' }))).toBe('DIALOGUE_QUESTION_INVALID');
      expect(refusal(() => store.askAboutSelection(book.bookId, { selection, question: '问'.repeat(501) }))).toBe('DIALOGUE_QUESTION_INVALID');
      expect(refusal(() => store.askAboutSelection(book.bookId, { selection, question: '【问题】是什么' }))).toBe('DIALOGUE_QUESTION_INVALID');
      expect(refusal(() => store.askAboutSelection(book.bookId, { selection: { ...selection, selectedText: '别的字' }, question: QUESTION }))).not.toBe('no-error');
      const other = await importSample1Book(store, roots.codeRoot, '另一本');
      expect(refusal(() => store.askAboutSelection(other.bookId, { selection, question: QUESTION }))).toBe('DIALOGUE_SELECTION_INVALID');
      const turn = store.askAboutSelection(book.bookId, { selection, question: QUESTION });
      expect(refusal(() => store.inspectDialogue(other.bookId, turn.dialogueId, 0, () => null))).toBe('DIALOGUE_NOT_FOUND');
      expect(refusal(() => store.inspectDialogue(book.bookId, turn.dialogueId, -1, () => null))).toBe('DIALOGUE_CURSOR_INVALID');
    } finally {
      store.close();
    }
  });

  it('adds revision 60 to a revision-58 store, and keeps its relations append-only and verified', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.close();
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    let database = new DatabaseSync(path);
    try {
      database.exec('PRAGMA foreign_keys = OFF');
      for (const table of Object.keys(DIALOGUE_SCHEMA_SQL).reverse()) database.exec(`DROP TABLE ${table}`);
      database.exec(`PRAGMA user_version = ${DATABASE_MERGE_SCHEMA_VERSION}`);
    } finally {
      database.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const stepped = steppedHold();
    const dialogues = owner(store, stepped.hold);
    let dialogueId = '';
    let bookId = '';
    try {
      const book = await importSample1Book(store, roots.codeRoot, '迁移');
      bookId = book.bookId;
      const turn = store.askAboutSelection(book.bookId, { selection: selectionOf(store, book), question: QUESTION });
      dialogueId = turn.dialogueId;
      stepped.allow(99);
      dialogues.begin(turn);
      await waitFor(() => store.inspectDialogue(book.bookId, dialogueId, 0, () => null), (value) => value.attempts[0]!.state === 'completed', 'completed');
    } finally {
      await dialogues.dispose();
      store.close();
    }
    database = new DatabaseSync(path);
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(DIALOGUE_SCHEMA_VERSION);
      expect(() => database.prepare('UPDATE dialogue_tasks SET asked_at = asked_at').run()).toThrowError(/DIALOGUE_LEDGER_IMMUTABLE/u);
      expect(() => database.prepare('DELETE FROM dialogue_attempt_outcomes').run()).toThrowError(/DIALOGUE_LEDGER_IMMUTABLE/u);
      // A row altered by hand does not read.
      database.exec('DROP TRIGGER dialogue_harness_spans_no_update');
      database.prepare('UPDATE dialogue_harness_spans SET start_seq = start_seq + 1').run();
      database.exec(DIALOGUE_TRIGGER_FOR_TEST);
    } finally {
      database.close();
    }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot).catch((error: unknown) => {
      throw error;
    });
    try {
      expect(refusal(() => store.inspectDialogue(bookId, dialogueId, 0, () => null))).toBe('DIALOGUE_RECORD_INVALID');
    } finally {
      store.close();
    }
  });
});

const DIALOGUE_TRIGGER_FOR_TEST = `CREATE TRIGGER dialogue_harness_spans_no_update
    BEFORE UPDATE ON dialogue_harness_spans
    BEGIN
      SELECT RAISE(ABORT, 'DIALOGUE_LEDGER_IMMUTABLE');
    END`;
