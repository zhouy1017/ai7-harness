import type { DialogueAnswerState, DialogueAttemptProjection, DialogueProjection } from '../../shared/protocol.js';
import { readHarnessSessionLog, type StoredHarnessLog } from '../harness/session-log.js';
import { parseDialogueMessage, type DialogueMessageInput } from './contract.js';
import type { StoredDialogueAttempt, StoredDialogueTask } from './dialogue-ledger.js';
import { fragmentsText, splitFragments, type DialogueFragment, type FragmentReading } from './fragments.js';

/**
 * Dialogue Answer History (Issue #52, plan slice S17a; V2-UX-DIALOG-015): a recoverable, non-authoritative projection joined
 * from the dialogue's own records — each attempt's Execution Binding and Harness Execution Span — to the Harness Session
 * Ledger, the persisted DSH Session log, which alone holds the question, the words that were sent and every answer. Nothing
 * here is stored: each read joins again.
 */

/** What one attempt's turn holds in the Harness Session Ledger, read through its span. */
export interface AttemptTurn {
  /** The message the turn sent, read back by the dialogue contract; `null` when the turn's message is not there. */
  readonly message: DialogueMessageInput | null;
  /** Every text delta the model streamed in the turn, in order. */
  readonly streamed: string;
}

function textOf(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const texts = content.map((block) => typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : null);
  return texts.every((value) => value !== null) ? texts.join('') : null;
}

/** The turn between `startSeq` and `endSeq` (or the log's end, for a turn whose end was never recorded). */
export function attemptTurn(log: StoredHarnessLog, startSeq: number, endSeq: number | null): AttemptTurn {
  const last = endSeq ?? log.events.length - 1;
  let message: DialogueMessageInput | null = null;
  let streamed = '';
  for (const event of log.events.slice(startSeq, last + 1)) {
    const data = event.data as Record<string, unknown> | null;
    if (event.type === 'user/message' && message === null && data !== null) {
      const text = textOf(data.content);
      if (text !== null) message = parseDialogueMessage(text);
    } else if (event.type === 'assistant/chunk' && data !== null) {
      const chunk = data.chunk as { type?: unknown; text?: unknown } | undefined;
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') streamed += chunk.text;
    }
  }
  return { message, streamed };
}

export interface DialogueHistoryReader {
  /** An attempt's turn from the Harness Session Ledger, or `null` when its log is not here or does not read. */
  turn(attempt: StoredDialogueAttempt): AttemptTurn | null;
}

/** The reader over the Harness Session Ledger under `root`, caching each Session's log by its length. */
export function harnessHistoryReader(root: string): DialogueHistoryReader {
  const cache = new Map<string, { bytes: number; log: StoredHarnessLog }>();
  const logOf = (sessionId: string): StoredHarnessLog | null => {
    try {
      const log = readHarnessSessionLog(root, sessionId);
      if (log === null) return null;
      const cached = cache.get(sessionId);
      if (cached !== undefined && cached.bytes === log.bytes) return cached.log;
      cache.set(sessionId, { bytes: log.bytes, log });
      return log;
    } catch {
      return null;
    }
  };
  return {
    turn(attempt) {
      if (attempt.span === null) return null;
      const log = logOf(attempt.span.harnessSessionId);
      if (log === null || log.events.length <= attempt.span.startSeq) return null;
      return attemptTurn(log, attempt.span.startSeq, attempt.outcome?.endSeq ?? null);
    },
  };
}

/** How an attempt reads now: answering until an outcome settles it. */
export function attemptState(attempt: StoredDialogueAttempt): DialogueAnswerState {
  return attempt.outcome === null ? 'answering' : attempt.outcome.outcome;
}

/** The reading an attempt's streamed text is split by (DIALOG-006, 012): in flight, cut short, or whole. */
export function fragmentReading(state: DialogueAnswerState): FragmentReading {
  return state === 'answering' ? 'streaming' : state === 'completed' ? 'settled' : 'cut';
}

/** Whether an answer is an Incomplete Dialogue Answer (DIALOG-012, 013): stopped, interrupted or failed. */
export function incompleteAnswer(state: DialogueAnswerState): boolean {
  return state === 'stopped' || state === 'interrupted' || state === 'failed';
}

export interface ResolvedAttempt {
  readonly attempt: StoredDialogueAttempt;
  readonly state: DialogueAnswerState;
  /** The answer's complete fragments: a 继续回答 carries what the answer it goes on from kept, then its own. */
  readonly fragments: ReadonlyArray<DialogueFragment>;
  readonly source: 'live' | 'ledger' | 'missing';
}

/**
 * Every attempt of a dialogue resolved against the Harness Session Ledger — or, for the one answering now, against what it
 * has streamed so far (`live`) — with the dialogue's question and selected words as its first turn sent them.
 */
/** What the answer in flight holds in memory: the message its turn sent, and every delta streamed so far. */
export interface LiveAnswer {
  readonly message: DialogueMessageInput;
  readonly streamed: string;
}

export function resolveAttempts(
  attempts: ReadonlyArray<StoredDialogueAttempt>,
  reader: DialogueHistoryReader,
  live: (attemptId: string) => LiveAnswer | null,
): { attempts: ResolvedAttempt[]; first: DialogueMessageInput | null } {
  const resolved: ResolvedAttempt[] = [];
  let first: DialogueMessageInput | null = null;
  for (const attempt of attempts) {
    const state = attemptState(attempt);
    const turn = reader.turn(attempt);
    const streaming = state === 'answering' ? live(attempt.attemptId) : null;
    // Every turn sends the question and the selected words; the earliest one the ledger — or, before its log is written, the
    // answer in flight — still holds says them.
    const message = turn?.message ?? streaming?.message ?? null;
    if (first === null && message !== null) first = message;
    const streamed = streaming?.streamed ?? turn?.streamed ?? null;
    const source: ResolvedAttempt['source'] = streaming !== null ? 'live' : turn !== null ? 'ledger' : 'missing';
    const own = streamed === null ? [] : splitFragments(streamed, fragmentReading(state));
    const prior = attempt.kind === 'continue' ? resolved.at(-1) : undefined;
    const carried = prior === undefined ? [] : prior.fragments;
    resolved.push({ attempt, state, fragments: [...carried, ...own], source });
  }
  return { attempts: resolved, first };
}

/** The words a 继续回答 sends as kept: the complete fragments of the answer it goes on from. */
export function keptText(resolved: ResolvedAttempt): string {
  return fragmentsText(resolved.fragments);
}

/**
 * The dialogue as the editor reads it (V2-UX-DIALOG-009 to 016). The latest attempt's fragments start at `afterFragment`, so
 * a foreground reader asks only for what it has not shown; every earlier attempt is given whole.
 */
export function dialogueProjection(
  task: StoredDialogueTask,
  resolved: { attempts: ReadonlyArray<ResolvedAttempt>; first: DialogueMessageInput | null },
  afterFragment: number,
): DialogueProjection {
  const latest = resolved.attempts.at(-1);
  const attempts: DialogueAttemptProjection[] = resolved.attempts.map((entry) => {
    const from = entry === latest ? Math.min(afterFragment, entry.fragments.length) : 0;
    return {
      attemptId: entry.attempt.attemptId,
      ordinal: entry.attempt.ordinal,
      kind: entry.attempt.kind,
      state: entry.state,
      fragments: entry.fragments.slice(from).map((fragment) => ({ text: fragment.text, breakAfter: fragment.breakAfter })),
      fragmentsFrom: from,
      fragmentTotal: entry.fragments.length,
      source: entry.source,
      causeCode: entry.attempt.outcome?.causeCode ?? null,
      startedAt: entry.attempt.createdAt,
      settledAt: entry.attempt.outcome?.settledAt ?? null,
      convertedMarkIds: entry.attempt.conversions.map((conversion) => conversion.markId),
    };
  });
  const latestState = latest?.state ?? null;
  const known = resolved.first !== null;
  return {
    dialogueId: task.dialogueId,
    bookId: task.bookId,
    manuscriptId: task.manuscriptId,
    branchId: task.branchId,
    question: resolved.first?.question ?? null,
    selection: resolved.first?.selection ?? null,
    range: { blockId: task.blockId, fromGrapheme: task.fromGrapheme, toGrapheme: task.toGrapheme },
    askedAt: task.askedAt,
    attempts,
    actions: {
      stop: latestState === 'answering',
      // 继续回答 goes on from complete fragments the answer kept; 重新回答 asks again (DIALOG-014). Both need the question.
      continue: known && latest !== undefined && (latestState === 'stopped' || latestState === 'interrupted') && latest.fragments.length > 0,
      regenerate: known && latestState !== null && latestState !== 'answering',
      // An Incomplete Dialogue Answer is no completed answer and is never converted (DIALOG-013).
      convert: latestState === 'completed' && latest !== undefined && latest.fragments.length > 0,
    },
  };
}
