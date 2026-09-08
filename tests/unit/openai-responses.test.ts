import { describe, expect, it } from 'vitest';
import { OPENCODE_GO_V4_FLASH_PROFILE, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

/**
 * The `openai-responses` request shape (Issue #354), driven entirely by test-local profiles. No
 * shipped profile declares this shape's read-side channels, which is the point: the shape must be
 * exercisable without activating anything, so every case here builds the profile it needs, and the
 * only transport is a stub. No socket, no credential, no Provider.
 */

installNodeNetworkDenial();

/** A model declaring the third shape and whatever the case under test needs beside it. */
function responsesModel(capabilities: Partial<ProviderModelProfile['capabilities']> = {}): ProviderModelProfile {
  return {
    ...OPENCODE_GO_V4_FLASH_PROFILE,
    model: 'synthetic-responses-model',
    capabilities: {
      ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities,
      requestShape: 'openai-responses',
      reasoningControl: 'none',
      structuredOutput: 'none',
      answerChannel: 'output-message-text',
      reasoningChannel: 'none',
      ...capabilities,
    },
  };
}

/** One `message` item of the shape's `output`, carrying whichever parts the case is about. */
function message(...parts: ReadonlyArray<unknown>): Record<string, unknown> {
  return { type: 'message', status: 'completed', role: 'assistant', content: parts };
}

const outputText = (text: string) => ({ type: 'output_text', text, annotations: [] });
const REASONING_ITEM = { type: 'reasoning', summary: [{ type: 'summary_text', text: '合成推理' }] };

describe('normalizeModelResponse · output-message-text', () => {
  const model = responsesModel();
  const reasoningModel = responsesModel({ reasoningChannel: 'output-reasoning-items' });

  it('reads the answer across every message item of the output, in order, with usage', () => {
    expect(normalizeModelResponse(model, {
      output: [message(outputText('{"ok":')), message(outputText('true}'))],
      status: 'completed',
      usage: { input_tokens: 120, output_tokens: 30 },
    })).toEqual({ kind: 'answer', text: '{"ok":true}', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    // Two parts of one item concatenate exactly as two items do: the answer is the order the
    // response lists, and the item boundary is not a boundary of the answer.
    expect(normalizeModelResponse(model, { output: [message(outputText('{"ok":'), outputText('true}'))] }))
      .toMatchObject({ kind: 'answer', text: '{"ok":true}' });
    // A reasoning item beside the answer is not answer text, whether or not the channel is declared.
    expect(normalizeModelResponse(reasoningModel, { output: [REASONING_ITEM, message(outputText('答案'))] }))
      .toEqual({ kind: 'answer', text: '答案', reasoningText: null, usage: null });
    // Whitespace is an answer, exactly as it is on the other two shapes: only the contract may judge it.
    expect(normalizeModelResponse(model, { output: [message(outputText(' '))] })).toMatchObject({ kind: 'answer', text: ' ' });
  });

  it('reads a refusal as no answer at all rather than as answer text', () => {
    // The model declined: the refusal string is not the answer, so this is the empty answer the
    // contract layer must never be handed as a parsable one.
    expect(normalizeModelResponse(model, { output: [message({ type: 'refusal', refusal: '我不能回答该请求。' })] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // A refusal beside an answer part leaves the answer exactly the answer.
    expect(normalizeModelResponse(model, { output: [message({ type: 'refusal', refusal: '部分拒绝。' }, outputText('答案'))] }))
      .toMatchObject({ kind: 'answer', text: '答案' });
  });

  it('separates an empty answer from an answer and carries whether the model reasoned', () => {
    // An output that carries reasoning and no message at all: the model thought and said nothing.
    expect(normalizeModelResponse(reasoningModel, { output: [REASONING_ITEM], usage: { input_tokens: 11, output_tokens: 7 } }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: true, usage: { inputTokens: 11, outputTokens: 7 } });
    expect(normalizeModelResponse(reasoningModel, { output: [] })).toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // A message whose text part is empty hands the contract layer the same `''`, so it is the same outcome.
    expect(normalizeModelResponse(reasoningModel, { output: [message(outputText(''))] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // Presence is read only where the channel is declared: an undeclared channel reports nothing.
    expect(normalizeModelResponse(model, { output: [REASONING_ITEM] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
  });

  it('names a response that carries no output array', () => {
    expect(normalizeModelResponse(model, { status: 'completed' })).toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, { output: 'not-an-array' })).toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, null)).toEqual({ kind: 'malformed', reason: 'response-not-a-record' });
    // Neither of the other two shapes' bodies is this shape's body, and each is read as such rather
    // than half-read: the client-side `output_text` the SDK synthesizes is not on the wire either.
    expect(normalizeModelResponse(model, { choices: [{ message: { content: '{"ok":true}' } }] }))
      .toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: '{"ok":true}' }] }))
      .toEqual({ kind: 'malformed', reason: 'output-absent' });
    expect(normalizeModelResponse(model, { output_text: '{"ok":true}' })).toEqual({ kind: 'malformed', reason: 'output-absent' });
    // Declaring no answer channel still refuses first, whichever shape the model requests.
    expect(normalizeModelResponse(responsesModel({ answerChannel: 'none' }), { output: [message(outputText('答案'))] }))
      .toEqual({ kind: 'malformed', reason: 'answer-channel-not-declared' });
  });

  it('reads usage only when both counts are present and sound, and carries the reasoning count when it is', () => {
    const answered = (usage: unknown) => normalizeModelResponse(model, { output: [message(outputText('x'))], usage });
    expect(answered({ input_tokens: 120, output_tokens: 30, output_tokens_details: { reasoning_tokens: 12 } }))
      .toMatchObject({ usage: { inputTokens: 120, outputTokens: 30, reasoningTokens: 12 } });
    // Without the detail there is no count to carry, and none is invented: the whole usage, stated
    // exactly, so a reasoning count that appeared from nowhere would fail here.
    expect(answered({ input_tokens: 120, output_tokens: 30 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    // A count that is not a non-negative integer is not a count: the two sound ones still travel.
    expect(answered({ input_tokens: 120, output_tokens: 30, output_tokens_details: { reasoning_tokens: -1 } }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(answered({ input_tokens: 5 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ input_tokens: -1, output_tokens: 2 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ input_tokens: 0, output_tokens: 0 })).toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 } });
    // The cache accounting nothing has observed on this gateway is not read into the canonical
    // usage: the input count is passed through rather than adjusted the way the other shape's is.
    expect(answered({ input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 100 } }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
  });
});
