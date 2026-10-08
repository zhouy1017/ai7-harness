/**
 * The complete serialized model-bound payload as DSH context assembly hands it to the `llm/stream`
 * waterfall: system slot, ordered messages, tools, route, and model. This structural type is what the
 * AI7-owned gate and adapters evaluate; a DSH `GenerateOptions` value satisfies it without the gate
 * or the adapters depending on DSH types at runtime.
 */
export interface AssembledContentBlock {
  readonly type: string;
  readonly text?: string;
  /** A `tool-call` block's provider-issued call id, name, and raw JSON arguments (Issue #473). */
  readonly id?: string;
  readonly name?: string;
  readonly arguments?: string;
  /** A `tool-result` block's correlation, nested content, and outcome (Issue #473). */
  readonly toolCallId?: string;
  readonly content?: ReadonlyArray<AssembledContentBlock>;
  readonly isError?: boolean;
}

export interface AssembledMessage {
  readonly role: string;
  readonly content: ReadonlyArray<AssembledContentBlock>;
  readonly source: { readonly kind: string; readonly provider?: string; readonly model?: string; readonly callId?: string };
}

/** One tool call an assistant message carries, as the adapter and the gate read it. */
export interface AssembledToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/**
 * The text and tool calls of an assistant message whose blocks are only text and tool calls, with at least one tool call;
 * `null` for any other message. Reasoning, images, and results are not part of a tool-call message.
 */
export function assistantToolCalls(message: AssembledMessage): { text: string; reasoning: string; calls: AssembledToolCall[] } | null {
  if (message.role !== 'assistant') return null;
  const texts: string[] = [];
  const reasoning: string[] = [];
  const calls: AssembledToolCall[] = [];
  for (const block of message.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text);
    } else if (block.type === 'reasoning' && typeof block.text === 'string') {
      // The reasoning a thinking-mode model wrote beside its calls travels back with them (the review of #671).
      reasoning.push(block.text);
    } else if (block.type === 'tool-call' && typeof block.id === 'string' && block.id.length > 0 &&
        typeof block.name === 'string' && typeof block.arguments === 'string') {
      calls.push({ id: block.id, name: block.name, arguments: block.arguments });
    } else {
      return null;
    }
  }
  return calls.length === 0 ? null : { text: texts.join(''), reasoning: reasoning.join(''), calls };
}

/**
 * The one tool result a user-role message of source `tool` carries — DSH's `ToolResultMessage` — or `null` for any other
 * message: exactly one `tool-result` block whose correlation equals the source's, whose nested content is text only.
 */
export function toolResultOf(message: AssembledMessage): { callId: string; text: string; isError: boolean } | null {
  if (message.role !== 'user' || message.source.kind !== 'tool' || typeof message.source.callId !== 'string') return null;
  if (message.content.length !== 1) return null;
  const block = message.content[0]!;
  if (block.type !== 'tool-result' || block.toolCallId !== message.source.callId || !Array.isArray(block.content)) return null;
  const texts: string[] = [];
  for (const inner of block.content as ReadonlyArray<AssembledContentBlock>) {
    if (inner.type !== 'text' || typeof inner.text !== 'string') return null;
    texts.push(inner.text);
  }
  return { callId: block.toolCallId, text: texts.join(''), isError: block.isError === true };
}

export interface AssembledModelPayload {
  readonly provider: string;
  readonly model: string;
  readonly system?: string;
  readonly tools?: ReadonlyArray<unknown>;
  readonly messages: ReadonlyArray<AssembledMessage>;
}

/** The text of a message whose every block is text; `null` when any block is not text. */
export function messageText(message: AssembledMessage): string | null {
  const texts: string[] = [];
  for (const block of message.content) {
    if (block.type !== 'text' || typeof block.text !== 'string') return null;
    texts.push(block.text);
  }
  return texts.join('');
}

/** The last user-role message of a payload; the unit prompt the current step asks about. */
export function lastUserMessageText(payload: AssembledModelPayload): string | null {
  for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
    const message = payload.messages[index]!;
    if (message.role === 'user') return messageText(message);
  }
  return null;
}
