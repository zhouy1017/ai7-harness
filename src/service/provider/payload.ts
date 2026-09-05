/**
 * The complete serialized model-bound payload as DSH context assembly hands it to the `llm/stream`
 * waterfall: system slot, ordered messages, tools, route, and model. This structural type is what the
 * AI7-owned gate and adapters evaluate; a DSH `GenerateOptions` value satisfies it without the gate
 * or the adapters depending on DSH types at runtime.
 */
export interface AssembledContentBlock {
  readonly type: string;
  readonly text?: string;
}

export interface AssembledMessage {
  readonly role: string;
  readonly content: ReadonlyArray<AssembledContentBlock>;
  readonly source: { readonly kind: string; readonly provider?: string; readonly model?: string };
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
