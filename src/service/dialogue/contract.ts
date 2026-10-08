import { MAX_DIALOGUE_QUESTION_CHARACTERS } from '../../shared/protocol.js';
import { DIGEST_PATTERN, canonicalJson, sha256Hex } from '../analysis/canonical.js';
import { DialogueError } from './dialogue-ledger.js';

/**
 * Editorial Dialogue Contract v1 (Issue #52, plan slice S17a; UI ADR 0014; V2-UX-DIALOG-001): the frozen text an
 * Interactive Editorial Dialogue turn carries. One turn sends exactly the words the editor selected and their question —
 * and, when they ask AI7 to go on with an answer that stopped, the complete fragments that answer kept — and nothing else
 * of the Book. The answer is prose for the editor to read: it changes nothing, proposes nothing on its own, and becomes a
 * 修改建议 only through the editor's own 转为修改建议.
 *
 * The contract is frozen text; its digest binds the deterministic fixture key, so changing one character of it changes
 * every request digest, which is the intent. The live OpenCode Go route is not bound to it in this slice: that needs a
 * dialogue-purpose Provider Processing revision the Owner reviews byte by byte (S17c).
 */
export const DIALOGUE_PROMPT_CONTRACT_SCHEMA = 'ai7.dialogue-prompt-contract/1' as const;
export const DIALOGUE_CONTRACT_VERSION = 'ai7.editorial-dialogue/1' as const;

/** How a turn asks: the first ask and 重新回答 ask anew; 继续回答 goes on from what a stopped answer kept. */
export type DialogueTurnKind = 'ask' | 'continue';

export const DIALOGUE_PROMPT_CONTRACT = {
  schema: DIALOGUE_PROMPT_CONTRACT_SCHEMA,
  contractVersion: DIALOGUE_CONTRACT_VERSION,
  systemPrompt: [
    '你是出版社编辑的写作顾问。编辑在稿件中选了一段文字，并就这段文字提了一个问题。',
    '只依据所选文字和问题作答，用简洁、完整的中文句子回答；不要复述整段原文，不要编造所选文字之外的情节、人物或事实。',
    '你的回答只供编辑阅读：它不修改稿件，不构成事实结论，也不自动成为修改建议。需要时可以说明可以怎样改，由编辑自己决定。',
    '不调用任何工具。',
  ].join('\n'),
  messageHeader: 'AI7 编辑对话 · {kind} · 问题摘要 {questionDigest}',
  kindLabels: { ask: '提问', continue: '接着回答' },
  selectionHeader: '【所选文字】',
  questionHeader: '【问题】',
  keptHeader: '【已有的回答（在这里停下了）】',
  continueInstruction: '请从已有回答停下的地方接着回答，不要重复已有的内容。',
} as const;

export const DIALOGUE_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(DIALOGUE_PROMPT_CONTRACT));

const HEADER_PATTERN = /^AI7 编辑对话 · (提问|接着回答) · 问题摘要 ([0-9a-f]{64})$/u;

export function dialogueQuestionDigest(question: string): string {
  return sha256Hex(question);
}

/** The request key the deterministic fixture answers by: the frozen contract, how the turn asks, and the question. */
export function dialogueRequestDigest(contractDigest: string, kind: DialogueTurnKind, questionDigest: string): string {
  return sha256Hex(`${DIALOGUE_CONTRACT_VERSION}\u0000${contractDigest}\u0000${kind}\u0000${questionDigest}`);
}

export interface DialogueMessageInput {
  readonly kind: DialogueTurnKind;
  readonly selection: string;
  readonly question: string;
  /** The complete fragments a stopped answer kept, for `continue`; nothing for `ask`. */
  readonly kept: string | null;
}

/** The one user message a turn sends: its header, the selected words, the question, and for `continue` what was kept. */
export function buildDialogueMessage(input: DialogueMessageInput): string {
  const contract = DIALOGUE_PROMPT_CONTRACT;
  const header = contract.messageHeader
    .replace('{kind}', contract.kindLabels[input.kind])
    .replace('{questionDigest}', dialogueQuestionDigest(input.question));
  const lines = [header, contract.selectionHeader, input.selection, contract.questionHeader, input.question];
  if (input.kind === 'continue') lines.push(contract.keptHeader, input.kept ?? '', contract.continueInstruction);
  return lines.join('\n');
}

/** The header of a dialogue turn's message, or `null` for any other message. */
export function parseDialogueMessageHeader(text: string): { kind: DialogueTurnKind; questionDigest: string } | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = HEADER_PATTERN.exec(firstLine);
  if (match === null || !DIGEST_PATTERN.test(match[2]!)) return null;
  return { kind: match[1] === '提问' ? 'ask' : 'continue', questionDigest: match[2]! };
}

/** Whether a question holds the contract's own section marks, which would let its message read back two ways. */
export function questionHoldsContractMarks(question: string): boolean {
  const contract = DIALOGUE_PROMPT_CONTRACT;
  return [contract.selectionHeader, contract.questionHeader, contract.keptHeader].some((mark) => question.includes(mark));
}

/**
 * A dialogue message read back from the Harness Session Ledger: the selected words, the question and, for `continue`, what
 * the stopped answer kept — exactly as `buildDialogueMessage` wrote them, or `null` for any other message.
 */
export function parseDialogueMessage(text: string): DialogueMessageInput | null {
  const header = parseDialogueMessageHeader(text);
  if (header === null) return null;
  const contract = DIALOGUE_PROMPT_CONTRACT;
  const body = text.slice(text.indexOf('\n') + 1);
  const selectionStart = `${contract.selectionHeader}\n`;
  if (!body.startsWith(selectionStart)) return null;
  const questionMark = `\n${contract.questionHeader}\n`;
  const questionAt = body.indexOf(questionMark);
  if (questionAt === -1) return null;
  const selection = body.slice(selectionStart.length, questionAt);
  const rest = body.slice(questionAt + questionMark.length);
  let question = rest;
  let kept: string | null = null;
  if (header.kind === 'continue') {
    const keptMark = `\n${contract.keptHeader}\n`;
    const instruction = `\n${contract.continueInstruction}`;
    const keptAt = rest.lastIndexOf(keptMark);
    if (keptAt === -1 || !rest.endsWith(instruction)) return null;
    question = rest.slice(0, keptAt);
    kept = rest.slice(keptAt + keptMark.length, rest.length - instruction.length);
  }
  if (dialogueQuestionDigest(question) !== header.questionDigest) return null;
  const parsed: DialogueMessageInput = { kind: header.kind, selection, question, kept };
  return buildDialogueMessage(parsed) === text ? parsed : null;
}

/** The editor's question as it is sent: their own words, trimmed, one to 500 characters, holding no contract mark. */
export function dialogueQuestion(value: unknown): string {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new DialogueError('DIALOGUE_QUESTION_INVALID', '先写下你的问题。');
  const question = value.trim();
  if (question.length === 0) throw new DialogueError('DIALOGUE_QUESTION_INVALID', '先写下你的问题。');
  if ([...question].length > MAX_DIALOGUE_QUESTION_CHARACTERS) {
    throw new DialogueError('DIALOGUE_QUESTION_INVALID', `问题最多 ${MAX_DIALOGUE_QUESTION_CHARACTERS} 个字。`);
  }
  if (questionHoldsContractMarks(question)) throw new DialogueError('DIALOGUE_QUESTION_INVALID', '问题里不能有「【所选文字】」这类标记。');
  return question;
}
