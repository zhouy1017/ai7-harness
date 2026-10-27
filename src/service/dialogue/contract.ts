import type { GlobalAgentScope, GlobalMemoryPin } from '../../shared/protocol.js';
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
 * every request digest, which is the intent. The live route sends the same contract (S17c), under the dialogue rule the
 * selected Provider Processing policy names; a 重新回答 sends exactly the request its ask sent.
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

/** The admitted retrieval successor; predecessor recordings retain their exact no-tool contract. */
export const DIALOGUE_RETRIEVAL_PROMPT_CONTRACT = {
  ...DIALOGUE_PROMPT_CONTRACT,
  schema: 'ai7.dialogue-prompt-contract/2',
  contractVersion: 'ai7.editorial-dialogue/2',
  systemPrompt: [
    '你是出版社编辑的写作顾问。编辑在稿件中选了一段文字，并提出一个问题。',
    '根据所选文字、问题与本次已授权固定来源作答；找到书中哪里的问题先 retrieve，再 exact_fetch。检索预览不是原文。',
    '引用检索到的文字前必须精确取文；只引用 exact_fetch 返回的原文，并附上 [retrieval:候选 candidateId] 锚点。未经精确取文的引用不被接受。',
    '用简洁的一行中文回答，不编造情节或事实；回答只供编辑参考，不修改稿件，也不自动成为修改建议。',
  ].join('\n'),
} as const;
export const DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(DIALOGUE_RETRIEVAL_PROMPT_CONTRACT));

const HEADER_PATTERN = /^AI7 编辑对话 · (提问|接着回答) · 问题摘要 ([0-9a-f]{64})$/u;

export function dialogueQuestionDigest(question: string): string {
  return sha256Hex(question);
}

/** The request key the deterministic fixture answers by: the frozen contract, how the turn asks, and the question. */
export function dialogueRequestDigest(contractDigest: string, kind: DialogueTurnKind, questionDigest: string): string {
  const version = contractDigest === DIALOGUE_RETRIEVAL_PROMPT_CONTRACT_DIGEST ? DIALOGUE_RETRIEVAL_PROMPT_CONTRACT.contractVersion : DIALOGUE_CONTRACT_VERSION;
  return sha256Hex(`${version}\u0000${contractDigest}\u0000${kind}\u0000${questionDigest}`);
}

export interface DialogueMessageInput {
  readonly globalSources?: ReadonlyArray<GlobalMemoryPin & { readonly text: string }>;
  /** A scoped Global Agent turn's pinned Books and procedures (#1171); absent on the no-tools turn, whose bytes are unchanged. */
  readonly globalScope?: GlobalAgentScope;
  readonly kind: DialogueTurnKind;
  readonly selection: string;
  readonly question: string;
  /** The complete fragments a stopped answer kept, for `continue`; nothing for `ask`. */
  readonly kept: string | null;
}

/** The one user message a turn sends: its header, the selected words, the question, and for `continue` what was kept. */
export function buildDialogueMessage(input: DialogueMessageInput): string {
  if (input.globalSources !== undefined) return `AI7 全域对话\n${canonicalJson({ kind: input.kind, sources: input.globalSources, question: input.question, kept: input.kept,
    ...(input.globalScope === undefined ? {} : { scope: input.globalScope }) })}`;
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
  if (text.startsWith('AI7 全域对话\n')) {
    try {
      const record = JSON.parse(text.slice('AI7 全域对话\n'.length)) as { kind: DialogueTurnKind; sources: DialogueMessageInput['globalSources']; question: string; kept: string | null; scope?: GlobalAgentScope };
      const scope = record.scope;
      // The round trip below proves the bytes; this proves only the closed shape a scoped reader relies on.
      if (scope !== undefined && (scope === null || typeof scope !== 'object' || !Array.isArray(scope.books) || !Array.isArray(scope.procedures) ||
          scope.books.length > 8 || scope.procedures.length > 8 ||
          !scope.books.every((book) => typeof book?.bookId === 'string' && typeof book.title === 'string' && typeof book.manuscriptId === 'string' && typeof book.revisionId === 'string') ||
          !scope.procedures.every((pin) => typeof pin?.procedureId === 'string' && Number.isSafeInteger(pin.version) && typeof pin.digest === 'string' && typeof pin.title === 'string'))) return null;
      if ((record.kind !== 'ask' && record.kind !== 'continue') || typeof record.question !== 'string' ||
          !(record.kept === null || typeof record.kept === 'string') || !Array.isArray(record.sources) || record.sources.length > 12 ||
          record.sources.some((source) => source === null || typeof source !== 'object' || Object.keys(source).sort().join(',') !== 'itemId,revisionId,text' ||
            typeof source.itemId !== 'string' || source.itemId.length > 180 || typeof source.revisionId !== 'string' || source.revisionId.length > 180 ||
            typeof source.text !== 'string' || [...source.text].length > 200)) return null;
      const parsed: DialogueMessageInput = { kind: record.kind, selection: '', question: record.question, kept: record.kept, globalSources: record.sources,
        ...(scope === undefined ? {} : { globalScope: scope }) };
      return buildDialogueMessage(parsed) === text ? parsed : null;
    } catch { return null; }
  }
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

/**
 * The Agent 工作区 fragment (Issue #90, wave 13 slice 13a; ADR 0045 "Book-bound presentation and Apply"; UI ADR 0015): the
 * frozen words one workspace turn adds to the dialogue contract above, which is otherwise unchanged. The turn is a dialogue
 * turn of the `editorial-dialogue` kind — the selected words and the editor's instruction, as `buildDialogueMessage` writes
 * them, under the rule the selected policy names for the dialogue — and the fragment asks for a change set: anchored
 * replacements of words inside the selection, each with a one-line reason. The answer still changes nothing and proposes
 * nothing on its own; it becomes 修改建议 only through the editor's own 提交为修改建议, and is applied only through the
 * existing Mark Cards and Apply.
 *
 * The workspace contract is the dialogue contract with this fragment appended to its system prompt; its digest is what the
 * workspace turn's Execution Binding records, so a workspace turn is told from a dialogue turn in the ledger.
 */
export const AGENT_WORKSPACE_RESULT_SCHEMA = 'ai7.agent-workspace.change-set/1' as const;
/** The most items one change set may carry; any further one is dropped and disclosed. */
export const MAX_AGENT_WORKSPACE_ITEMS = 12;
/** The longest one-line reason an item may give, in characters. */
export const MAX_AGENT_WORKSPACE_RATIONALE_CHARACTERS = 200;

export const AGENT_WORKSPACE_FRAGMENT = [
  '这是 Agent 工作区的一轮变更集提议：编辑写下的【问题】是一条修改要求，请就【所选文字】提出一组修改。',
  '每一项必须从【所选文字】中原样摘出要替换的一小段文字（anchor），它在【所选文字】中只能出现一次；给出替换后的文字（proposedText）和一行简短理由（rationale）。',
  `最多 ${MAX_AGENT_WORKSPACE_ITEMS} 项，各项摘出的文字互不重叠；没有需要修改的地方就返回空列表。`,
  `只输出一个 JSON 对象，不要输出其他文字：{"schema":"${AGENT_WORKSPACE_RESULT_SCHEMA}","items":[{"anchor":"…","proposedText":"…","rationale":"…"}]}`,
  '这些提议只是候选：是否提交为修改建议、是否采纳和应用，都由编辑决定。',
].join('\n');

export const AGENT_WORKSPACE_PROMPT_CONTRACT = {
  ...DIALOGUE_PROMPT_CONTRACT,
  schema: 'ai7.dialogue-prompt-contract/agent-workspace-1',
  contractVersion: 'ai7.editorial-dialogue/agent-workspace-1',
  systemPrompt: `${DIALOGUE_PROMPT_CONTRACT.systemPrompt}\n${AGENT_WORKSPACE_FRAGMENT}`,
  resultSchema: AGENT_WORKSPACE_RESULT_SCHEMA,
} as const;

export const AGENT_WORKSPACE_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(AGENT_WORKSPACE_PROMPT_CONTRACT));
