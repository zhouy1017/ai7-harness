import {
  MAX_DIALOGUE_PROPOSAL_CHARACTERS,
  type DialogueAttemptProjection,
  type DialogueProjection,
  type RendererApi,
} from '../shared/protocol.js';
import {
  DIALOGUE_ACTIONS,
  DIALOGUE_ANSWER_HEADING,
  DIALOGUE_AUTHORITY_NOTE,
  DIALOGUE_CONVERT_INCOMPLETE,
  DIALOGUE_CONVERT_NOTE,
  DIALOGUE_CONVERT_ORIGINAL,
  DIALOGUE_CONVERT_PROPOSED,
  DIALOGUE_CONVERT_RATIONALE,
  DIALOGUE_CONVERT_SUBMIT,
  DIALOGUE_CONVERT_TITLE,
  DIALOGUE_CANCEL,
  DIALOGUE_HISTORY_MISSING,
  DIALOGUE_QUESTION_HEADING,
  DIALOGUE_QUESTION_MISSING,
  DIALOGUE_SELECTION_HEADING,
  DIALOGUE_STATE_LABELS,
  DIALOGUE_STATUS,
  dialogueAttemptHeading,
  dialogueConvertRationale,
  dialogueConvertedLine,
  dialogueIncompleteLine,
} from './dialogue-labels.js';

/**
 * The foreground Interactive Editorial Dialogue (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-006 to 016), in the
 * side slot beside the manuscript. While it is on screen its answer appears by complete fragment — new fragments are
 * appended, nothing already shown is redrawn, and focus never moves — under `正在回答 · 内容尚未完成`. Leaving it (the slot
 * showing 任务 or closing) is backgrounding: nothing is read and nothing is shown but the card's `等待回答`; the answer
 * runs exactly the same. Coming back reads every fragment received. `停止回答` keeps the complete fragments, labelled
 * incomplete; `继续回答` and `重新回答` are new attempts; `转为修改建议` makes a 修改建议 of a completed answer, which
 * the editor still decides and applies on the manuscript.
 */
export interface DialogueSurfaceOptions {
  readonly api: Pick<RendererApi, 'inspectDialogue' | 'stopDialogueAnswer' | 'continueDialogueAnswer' | 'regenerateDialogueAnswer' | 'convertDialogueToChangeSuggestion'>;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** The selected words in the manuscript, when it is on screen: `回到所选文字`. */
  jump(target: { readonly manuscriptId: string; readonly blockId: string }): void;
  /** A 修改建议 was made on the manuscript: its marks read again. */
  onConverted(dialogue: DialogueProjection, markId: string): void;
  /** The dialogue's state moved: what lists it reads again. */
  onChanged(): void;
}

export interface DialogueSurface {
  readonly element: HTMLElement;
  /** Bring the dialogue to the foreground: every fragment received so far, then the answer as it streams. */
  show(dialogueId: string): void;
  /** Background: nothing is read or shown until it is shown again. The answer is not touched. */
  stop(): void;
  /** The dialogue on show, if any. */
  current(): string | null;
}

/** How often the foreground dialogue reads the fragments that arrived. */
const STREAM_POLL_MS = 250;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let identities = 0;
function uid(prefix: string): string {
  identities += 1;
  return `dialogue-${prefix}-${identities}`;
}

export function mountDialogue(options: DialogueSurfaceOptions): DialogueSurface {
  const { api } = options;
  const element = el('section', 'dialogue');
  element.dataset['dialogue'] = 'closed';
  const context = el('div', 'dialogue-context');
  const attemptsHost = el('div', 'dialogue-attempts');
  const actions = el('div', 'button-row compact-actions dialogue-actions');
  const convertHost = el('div', 'dialogue-convert-host');
  const note = el('p', 'field-note dialogue-authority', DIALOGUE_AUTHORITY_NOTE);
  element.append(context, attemptsHost, actions, convertHost, note);

  let dialogueId: string | null = null;
  let dialogue: DialogueProjection | null = null;
  let ticket = 0;
  let timer: number | undefined;
  let working = false;
  /** The latest attempt's fragments already on screen, and its answer container. */
  let shown: { attemptId: string; count: number; host: HTMLElement; state: DialogueAttemptProjection['state'] } | null = null;
  let converting = false;
  /** The latest attempt and state the lists beside were last told of. */
  let notified = '';

  function clearTimer(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  }

  function fragmentNode(text: string, breakAfter: boolean): HTMLElement {
    const node = el('span', `dialogue-fragment${breakAfter ? ' dialogue-fragment-break' : ''}`, text);
    node.dataset['dialogueFragment'] = '';
    return node;
  }

  function attemptSection(attempt: DialogueAttemptProjection, latest: boolean): { section: HTMLElement; answer: HTMLElement } {
    const section = el('section', 'dialogue-attempt');
    section.dataset['dialogueAttempt'] = attempt.attemptId;
    section.dataset['dialogueState'] = attempt.state;
    section.dataset['dialogueKind'] = attempt.kind;
    const heading = el('h4', 'dialogue-attempt-heading', dialogueAttemptHeading(attempt));
    heading.id = uid('attempt');
    section.setAttribute('aria-labelledby', heading.id);
    const state = el('span', `status-pill review-pill dialogue-state dialogue-state-${attempt.state}`, DIALOGUE_STATE_LABELS[attempt.state]);
    state.dataset['dialogueStateLabel'] = attempt.state;
    const head = el('div', 'dialogue-attempt-head');
    head.append(heading, state);
    const answer = el('div', 'dialogue-answer');
    answer.dataset['dialogueAnswer'] = attempt.attemptId;
    answer.setAttribute('aria-label', DIALOGUE_ANSWER_HEADING);
    if (latest && attempt.state === 'answering') answer.setAttribute('aria-busy', 'true');
    if (attempt.source === 'missing') answer.append(el('p', 'field-note', DIALOGUE_HISTORY_MISSING));
    for (const fragment of attempt.fragments) answer.append(fragmentNode(fragment.text, fragment.breakAfter));
    section.append(head, answer);
    const incomplete = dialogueIncompleteLine(attempt);
    if (incomplete !== null) section.append(el('p', 'field-note dialogue-incomplete', incomplete));
    if (attempt.convertedMarkIds.length > 0) section.append(el('p', 'field-note dialogue-converted', dialogueConvertedLine(attempt.convertedMarkIds.length)));
    return { section, answer };
  }

  /** Paint the whole dialogue: its context, every attempt and the actions the latest allows. */
  function paint(next: DialogueProjection): void {
    dialogue = next;
    element.dataset['dialogue'] = 'ready';
    element.dataset['dialogueId'] = next.dialogueId;
    const latest = next.attempts.at(-1) ?? null;
    element.dataset['dialogueLatestState'] = latest?.state ?? '';
    const selectionHeading = el('h3', 'section-label', DIALOGUE_SELECTION_HEADING);
    const quote = el('blockquote', 'editorial-mark-quote dialogue-selection', next.selection ?? DIALOGUE_HISTORY_MISSING);
    const jump = el('button', 'quiet dialogue-jump', '回到所选文字');
    jump.type = 'button';
    jump.dataset['dialogueAction'] = 'jump';
    jump.addEventListener('click', () => options.jump({ manuscriptId: next.manuscriptId, blockId: next.range.blockId }));
    const questionHeading = el('h3', 'section-label', DIALOGUE_QUESTION_HEADING);
    const question = el('p', 'dialogue-question', next.question ?? DIALOGUE_QUESTION_MISSING);
    context.replaceChildren(selectionHeading, quote, jump, questionHeading, question);
    const sections = next.attempts.map((attempt, index) => attemptSection(attempt, index === next.attempts.length - 1));
    attemptsHost.replaceChildren(...sections.map((entry) => entry.section));
    const last = sections.at(-1);
    shown = latest === null || last === undefined ? null : { attemptId: latest.attemptId, count: latest.fragmentTotal, host: last.answer, state: latest.state };
    paintActions();
  }

  function actionButton(key: keyof typeof DIALOGUE_ACTIONS, enabled: boolean, primary: boolean, run: () => void, why?: string): HTMLButtonElement {
    const node = el('button', primary ? 'secondary' : 'quiet', DIALOGUE_ACTIONS[key]);
    node.type = 'button';
    node.dataset['dialogueAction'] = key;
    node.disabled = working || !enabled;
    if (!enabled && why !== undefined) node.title = why;
    node.addEventListener('click', () => {
      if (!node.disabled) run();
    });
    return node;
  }

  function paintActions(): void {
    if (dialogue === null) return;
    const latest = dialogue.attempts.at(-1);
    const can = dialogue.actions;
    const active = document.activeElement instanceof HTMLElement && actions.contains(document.activeElement)
      ? document.activeElement.dataset['dialogueAction'] ?? null
      : null;
    const buttons: HTMLButtonElement[] = [];
    if (can.stop) buttons.push(actionButton('stop', true, true, () => void act('stop')));
    if (latest !== undefined && latest.state !== 'answering') {
      buttons.push(actionButton('continue', can.continue, can.continue, () => void act('continue')));
      buttons.push(actionButton('regenerate', can.regenerate, !can.continue, () => void act('regenerate')));
      const incomplete = latest.state !== 'completed';
      buttons.push(actionButton('convert', can.convert, false, () => openConvert(), incomplete ? DIALOGUE_CONVERT_INCOMPLETE : undefined));
    }
    actions.replaceChildren(...buttons);
    if (active !== null) {
      const target = buttons.find((button) => button.dataset['dialogueAction'] === active && !button.disabled) ??
        buttons.find((button) => !button.disabled);
      target?.focus();
    }
  }

  /** Whether `next` only adds fragments to the answer on screen: the same attempt, still answering, read from where it stops. */
  function appends(next: DialogueProjection): boolean {
    const latest = next.attempts.at(-1);
    return shown !== null && latest !== undefined && dialogue !== null && latest.attemptId === shown.attemptId &&
      latest.state === shown.state && latest.fragmentsFrom === shown.count && next.attempts.length === dialogue.attempts.length;
  }

  /** Read the dialogue: whole from `after` 0, or only the fragments that arrived since; anything else that moved reads it whole. */
  async function read(after: number): Promise<void> {
    const id = dialogueId;
    if (id === null) return;
    clearTimer();
    const mine = ++ticket;
    try {
      const next = await api.inspectDialogue({ dialogueId: id, afterFragment: after });
      if (mine !== ticket || dialogueId !== id) return;
      if (after === 0) {
        paint(next);
      } else if (appends(next)) {
        // New fragments are appended; nothing on screen is redrawn and focus stays where it is (DIALOG-006, 010).
        for (const fragment of next.attempts.at(-1)!.fragments) shown!.host.append(fragmentNode(fragment.text, fragment.breakAfter));
        shown!.count = next.attempts.at(-1)!.fragmentTotal;
      } else {
        // The answer settled, or a new attempt began: read it whole once.
        void read(0);
        return;
      }
      const latest = next.attempts.at(-1);
      const settledKey = latest === undefined ? '' : `${latest.attemptId}:${latest.state}`;
      if (settledKey !== notified) {
        notified = settledKey;
        options.onChanged();
      }
      if (latest?.state === 'answering') {
        timer = window.setTimeout(() => {
          timer = undefined;
          void read(shown?.count ?? 0);
        }, STREAM_POLL_MS);
      }
    } catch (error) {
      if (mine !== ticket || dialogueId !== id) return;
      element.dataset['dialogue'] = 'unavailable';
      attemptsHost.replaceChildren(el('p', 'attention-note', options.errorMessage(error, DIALOGUE_STATUS.unavailable)));
    }
  }

  async function act(action: 'stop' | 'continue' | 'regenerate'): Promise<void> {
    if (working || dialogue === null) return;
    const latest = dialogue.attempts.at(-1);
    if (latest === undefined) return;
    working = true;
    paintActions();
    clearTimer();
    ticket += 1;
    const input = { dialogueId: dialogue.dialogueId, attemptId: latest.attemptId };
    const words = action === 'stop' ? DIALOGUE_STATUS.stopping : action === 'continue' ? DIALOGUE_STATUS.continuing : DIALOGUE_STATUS.regenerating;
    options.setStatus(words, 'busy');
    try {
      const next = action === 'stop'
        ? await api.stopDialogueAnswer(input)
        : action === 'continue' ? await api.continueDialogueAnswer(input) : await api.regenerateDialogueAnswer(input);
      working = false;
      if (dialogueId !== next.dialogueId) return;
      paint(next);
      options.setStatus(action === 'stop' ? DIALOGUE_STATUS.stopped : words, 'success');
      options.onChanged();
      actions.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
      if (next.attempts.at(-1)?.state === 'answering') {
        timer = window.setTimeout(() => {
          timer = undefined;
          void read(shown?.count ?? 0);
        }, STREAM_POLL_MS);
      }
    } catch (error) {
      working = false;
      paintActions();
      options.setStatus(options.errorMessage(error, action === 'stop' ? DIALOGUE_STATUS.stopFailed : DIALOGUE_STATUS.actionFailed), 'error');
      void read(0);
    }
  }

  /** 转为修改建议 (DIALOG-016): the selected words, what they would become and why — a 修改建议 the editor still decides. */
  function openConvert(): void {
    if (dialogue === null || converting) return;
    const target = dialogue;
    const latest = target.attempts.at(-1);
    if (latest === undefined || !target.actions.convert) return;
    converting = true;
    const form = el('form', 'editorial-mark-composer dialogue-convert');
    form.dataset['dialogueConvert'] = 'open';
    const title = el('h4', undefined, DIALOGUE_CONVERT_TITLE);
    title.id = uid('convert');
    form.setAttribute('aria-labelledby', title.id);
    const original = el('div', 'dialogue-convert-original');
    original.append(el('p', 'section-label', DIALOGUE_CONVERT_ORIGINAL), el('blockquote', 'editorial-mark-quote', target.selection ?? ''));
    const field = (label: string, value: string, name: string): HTMLTextAreaElement => {
      const area = el('textarea');
      area.name = name;
      area.value = value;
      area.rows = 3;
      area.maxLength = MAX_DIALOGUE_PROPOSAL_CHARACTERS;
      area.id = uid(name);
      const caption = el('label', undefined, label);
      caption.htmlFor = area.id;
      form.append(caption, area);
      return area;
    };
    form.append(title, original);
    const proposed = field(DIALOGUE_CONVERT_PROPOSED, '', 'proposedText');
    proposed.required = true;
    const rationale = field(DIALOGUE_CONVERT_RATIONALE, dialogueConvertRationale(target.question), 'rationale');
    const row = el('div', 'button-row compact-actions');
    const submit = el('button', 'primary', DIALOGUE_CONVERT_SUBMIT);
    submit.type = 'submit';
    submit.dataset['dialogueAction'] = 'convert-submit';
    const cancel = el('button', 'quiet', DIALOGUE_CANCEL);
    cancel.type = 'button';
    cancel.dataset['dialogueAction'] = 'convert-cancel';
    row.append(submit, cancel);
    form.append(row, el('p', 'field-note', DIALOGUE_CONVERT_NOTE));
    const closeForm = (focusConvert: boolean): void => {
      converting = false;
      form.remove();
      if (focusConvert) actions.querySelector<HTMLButtonElement>('[data-dialogue-action="convert"]')?.focus();
    };
    cancel.addEventListener('click', () => closeForm(true));
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        closeForm(true);
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (submit.disabled || proposed.value.trim().length === 0) {
        proposed.focus();
        return;
      }
      submit.disabled = true;
      options.setStatus(DIALOGUE_STATUS.converting, 'busy');
      void api.convertDialogueToChangeSuggestion({
        dialogueId: target.dialogueId, attemptId: latest.attemptId, proposedText: proposed.value, rationale: rationale.value,
      }).then((result) => {
        closeForm(false);
        options.setStatus(result.completionLabel, 'success');
        if (dialogueId === result.dialogue.dialogueId) paint(result.dialogue);
        options.onConverted(result.dialogue, result.markId);
        actions.querySelector<HTMLButtonElement>('[data-dialogue-action="convert"]')?.focus();
      }, (error: unknown) => {
        submit.disabled = false;
        options.setStatus(options.errorMessage(error, DIALOGUE_STATUS.convertFailed), 'error');
      });
    });
    convertHost.replaceChildren(form);
    proposed.focus();
  }

  return {
    element,
    show(next) {
      const changed = next !== dialogueId;
      dialogueId = next;
      if (changed) {
        dialogue = null;
        shown = null;
        converting = false;
        convertHost.replaceChildren();
        element.dataset['dialogue'] = 'loading';
        context.replaceChildren();
        actions.replaceChildren();
        attemptsHost.replaceChildren(el('p', 'field-note', DIALOGUE_STATUS.loading));
      }
      void read(0);
    },
    stop() {
      ticket += 1;
      clearTimer();
      element.dataset['dialogue'] = 'background';
    },
    current() {
      return dialogueId;
    },
  };
}
