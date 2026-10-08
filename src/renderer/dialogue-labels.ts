import type { DialogueAnswerState, DialogueAttemptKind, DialogueAttemptProjection, DialogueProjection } from '../shared/protocol.js';

/**
 * The words of 就这段提问… (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-001 to 016, TASK-044, TASK-046): the
 * composer the selection menu opens, the foreground dialogue in the side slot, a dialogue Task's card in the 任务 panel and
 * its 回答 window. Pure, so the unit suite pins every string byte for byte.
 */

// ---- asking -------------------------------------------------------------------------------------------------

export const DIALOGUE_MENU_LABEL = '就这段提问…';
export const DIALOGUE_MENU_HINT = '对话，不改稿件';
export const DIALOGUE_COMPOSER_TITLE = '就这段提问';
export const DIALOGUE_QUESTION_LABEL = '你的问题';
/** What is sent, said plainly before anything is (the Owner, 2026-10-07): no plan, no 开始任务. */
export const DIALOGUE_SENDS_NOTE = '只发送所选文字和你的问题，不改稿件。';
export const DIALOGUE_ASK = '提问';
export const DIALOGUE_CANCEL = '取消';
export const DIALOGUE_STATUS = {
  asking: '正在提问…',
  asked: '已提问；回答显示在右侧的对话里。',
  askFailed: '无法提问。',
  stopping: '正在停止回答…',
  stopped: '已停止回答，只保留了完整的句子。',
  stopFailed: '无法停止回答。',
  continuing: '正在继续回答…',
  regenerating: '正在重新回答…',
  actionFailed: '无法完成这个操作。',
  converting: '正在转为修改建议…',
  convertFailed: '无法转为修改建议。',
  unavailable: '无法读取这段对话。',
  loading: '正在读取这段对话…',
} as const;
/** A question is one to 500 characters, and it is the editor's own words. */
export function dialogueQuestionRefusal(length: number, max: number): string | null {
  if (length === 0) return '先写下你的问题。';
  return length > max ? `问题最多 ${max} 个字。` : null;
}

// ---- the dialogue -------------------------------------------------------------------------------------------

export const DIALOGUE_TITLE = '对话';
export const DIALOGUE_SELECTION_HEADING = '所选文字';
export const DIALOGUE_QUESTION_HEADING = '问题';
export const DIALOGUE_ANSWER_HEADING = '回答';
/** What a dialogue answer is not (DIALOG-016), under every answer. */
export const DIALOGUE_AUTHORITY_NOTE = '回答是生成的内容，只供参考：它不改稿件，也不是事实结论或修改建议。';
/** The question or the words the Harness Session Ledger no longer holds here (a merged Book's, or a record that does not read). */
export const DIALOGUE_HISTORY_MISSING = '这次回答的记录不在本机。';
export const DIALOGUE_QUESTION_MISSING = '这个问题的记录不在本机。';
/** Background presentation (DIALOG-010): an answer in flight away from the foreground dialogue. */
export const DIALOGUE_WAITING_LABEL = '等待回答';
export const DIALOGUE_OPEN_LABEL = '打开对话';
export const DIALOGUE_ANSWER_LABEL = '回答';

/** Each answer's state, in DIALOG-006 and DIALOG-012's words. */
export const DIALOGUE_STATE_LABELS: Readonly<Record<DialogueAnswerState, string>> = {
  answering: '正在回答 · 内容尚未完成',
  completed: '回答完成',
  stopped: '回答已停止 · 内容不完整',
  interrupted: '回答已中断 · 内容不完整',
  failed: '回答未能完成 · 内容不完整',
};

export const DIALOGUE_ACTIONS = {
  stop: '停止回答',
  continue: '继续回答',
  regenerate: '重新回答',
  convert: '转为修改建议',
} as const;

/** Each attempt, numbered, as the first answer, a 继续回答 or a 重新回答 (DIALOG-014). */
export function dialogueAttemptHeading(attempt: Pick<DialogueAttemptProjection, 'ordinal' | 'kind'>): string {
  const how: Readonly<Record<DialogueAttemptKind, string>> = { ask: '回答', continue: '继续回答', regenerate: '重新回答' };
  return `第 ${attempt.ordinal} 次 · ${how[attempt.kind]}`;
}

/** Why an answer is incomplete, with its known cause (DIALOG-012). */
export function dialogueIncompleteLine(attempt: Pick<DialogueAttemptProjection, 'state' | 'causeCode' | 'fragmentTotal'>): string | null {
  const kept = attempt.fragmentTotal === 0 ? '没有留下完整的句子。' : '只保留了完整的句子。';
  switch (attempt.state) {
    case 'stopped':
      return `你停止了回答；${kept}`;
    case 'interrupted':
      return attempt.causeCode === 'AI7_CLOSED' || attempt.causeCode === 'SERVICE_STOPPED'
        ? `AI7 关闭时回答被中断；${kept}`
        : `回答被中断；${kept}`;
    case 'failed':
      return `回答没有完成（${attempt.causeCode ?? '原因未知'}）；${kept}`;
    default:
      return null;
  }
}

/** An Incomplete Dialogue Answer is never converted (DIALOG-013). */
export const DIALOGUE_CONVERT_INCOMPLETE = '内容不完整的回答不能转为修改建议。';

// ---- 转为修改建议 ---------------------------------------------------------------------------------------------

export const DIALOGUE_CONVERT_TITLE = '转为修改建议';
export const DIALOGUE_CONVERT_ORIGINAL = '原文';
export const DIALOGUE_CONVERT_PROPOSED = '建议改为';
export const DIALOGUE_CONVERT_RATIONALE = '理由';
/** The conversion is a separate governed object (DIALOG-016): nothing is applied until the editor decides it. */
export const DIALOGUE_CONVERT_NOTE = '会在所选文字上新建一条 AI7 修改建议，依据这次回答；它不会自动应用，是否接受由你决定。';
export const DIALOGUE_CONVERT_SUBMIT = '新建修改建议';
export function dialogueConvertRationale(question: string | null): string {
  return question === null ? '依据对话回答。' : `依据对话回答：${question}`;
}
export function dialogueConvertedLine(count: number): string {
  return `已从这次回答新建 ${count} 条修改建议。`;
}

// ---- the 任务 panel's card ---------------------------------------------------------------------------------------

/** The most characters of a question a card names before it is cut short. */
export const DIALOGUE_QUESTION_CHARACTERS = 24;
export function dialogueQuestionLine(question: string | null): string {
  if (question === null) return '提问 · 记录不在本机';
  const words = [...question.trim().replace(/\s+/gu, ' ')];
  return `提问 · 「${words.length > DIALOGUE_QUESTION_CHARACTERS ? `${words.slice(0, DIALOGUE_QUESTION_CHARACTERS).join('')}…` : words.join('')}」`;
}

export const DIALOGUE_CARD_REASONS = {
  'dialogue-answering': '回答在后台继续；打开对话可以看到已经收到的完整内容。',
  'dialogue-answered': '回答已完成；它只是生成的内容，不改稿件，需要时可以转为修改建议。',
  'dialogue-stopped': '你停止了回答，只保留了完整的句子；可以继续回答或重新回答。',
  'dialogue-interrupted': '回答被中断，只保留了完整的句子；可以继续回答或重新回答。',
  'dialogue-failed': '回答没有完成；可以重新回答。',
} as const;

/** The 回答 window: the question and the latest answer, read from the Harness Session Ledger. */
export function dialogueResultTaskLine(dialogue: Pick<DialogueProjection, 'question'>): string {
  return dialogueQuestionLine(dialogue.question);
}
