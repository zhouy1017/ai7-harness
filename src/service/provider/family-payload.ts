import { isRecord } from '../analysis/canonical.js';
import { messageText, type AssembledModelPayload } from './payload.js';

/**
 * What every protocol family's assembler reads from one `AssembledModelPayload` the same way (Issue #1180). Each family
 * module beside the adapter spells these in its own wire form; none of them learns another family's spelling.
 */

/** The turn's user and assistant messages as every shape carries them; where the system prompt goes is each shape's own business. */
export function conversationMessages(payload: AssembledModelPayload): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  for (const message of payload.messages) {
    const text = messageText(message);
    if (text === null) throw new Error('DEEPSEEK_REQUEST_NON_TEXT_CONTENT');
    if (message.role !== 'user' && message.role !== 'assistant') throw new Error('DEEPSEEK_REQUEST_ROLE_INVALID');
    messages.push({ role: message.role, content: text });
  }
  return messages;
}

/** The system prompt of one payload, or `null` when the payload carries none. */
export function systemPromptOf(payload: AssembledModelPayload): string | null {
  return payload.system !== undefined && payload.system.length > 0 ? payload.system : null;
}

/** One canonical client function as the payload carries it: `{ name, description, parameters }`, or a refusal. */
export function functionToolOf(tool: unknown): { name: string; description: string; parameters: Record<string, unknown> } {
  if (!isRecord(tool) || typeof tool.name !== 'string' || typeof tool.description !== 'string' || !isRecord(tool.parameters)) {
    throw new Error('PROVIDER_TOOL_SCHEMA_INVALID');
  }
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

/**
 * The canonical client functions a strict-name family admits (Messages and Gemini): exactly `{ name, description,
 * parameters }` and a name of at most `maxName` characters the vendor documents, unique within the request.
 * Native/server declarations and toolsets cannot be silently converted.
 */
export function strictFunctionTools(payload: AssembledModelPayload, maxName: number): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  const tools = (payload.tools ?? []).map((tool) => {
    const declared = functionToolOf(tool);
    if (!/^[a-zA-Z0-9_-]+$/u.test(declared.name) || declared.name.length > maxName || !isRecord(tool) ||
        Object.keys(tool).some((key) => !['name', 'description', 'parameters'].includes(key))) {
      throw new Error('PROVIDER_TOOL_SCHEMA_INVALID');
    }
    return declared;
  });
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw new Error('PROVIDER_TOOL_SCHEMA_INVALID');
  return tools;
}
