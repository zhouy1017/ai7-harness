import { describe, expect, it } from 'vitest';
import { OPENCODE_GO_V4_FLASH_PROFILE, type ProviderModelProfile } from '../../src/service/provider/model-profile.js';
import { normalizeModelResponse } from '../../src/service/provider/response-normalization.js';
import { installNodeNetworkDenial } from '../../src/shared/network-denial.js';

/**
 * The `google-generate-content` request shape (Issue #362), driven entirely by test-local profiles.
 * No shipped profile declares this shape or either of its channels — Gemini is on no OpenCode Go
 * path and its own endpoint waits for the credential slot of plan slot 1c.10 — which is the point:
 * the shape must be exercisable without activating anything, so every case here builds the profile it
 * needs, and the only transport is a stub. No socket, no credential, no Provider.
 */

installNodeNetworkDenial();

/** A model declaring this shape's read-side channels and whatever the case under test needs beside them. */
function geminiModel(capabilities: Partial<ProviderModelProfile['capabilities']> = {}): ProviderModelProfile {
  return {
    ...OPENCODE_GO_V4_FLASH_PROFILE,
    model: 'synthetic-gemini-model',
    capabilities: {
      ...OPENCODE_GO_V4_FLASH_PROFILE.capabilities,
      reasoningControl: 'none',
      structuredOutput: 'none',
      answerChannel: 'candidate-parts-text',
      reasoningChannel: 'none',
      ...capabilities,
    },
  };
}

/** One candidate of the shape's `candidates`, carrying whichever parts the case is about. */
function candidate(...parts: ReadonlyArray<unknown>): Record<string, unknown> {
  return { content: { role: 'model', parts }, finishReason: 'STOP' };
}

const thought = (text: string) => ({ text, thought: true });

describe('normalizeModelResponse · candidate-parts-text', () => {
  const model = geminiModel();
  const reasoningModel = geminiModel({ reasoningChannel: 'candidate-thought-parts' });

  it('reads the answer across every part of the first candidate, in order, with usage', () => {
    expect(normalizeModelResponse(model, {
      candidates: [candidate({ text: '{"ok":' }, { text: 'true}' })],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 },
    })).toEqual({ kind: 'answer', text: '{"ok":true}', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    // A thought part beside the answer is not answer text, whether or not the channel is declared:
    // the flag is what separates them, and the text beside the flag is never read.
    expect(normalizeModelResponse(reasoningModel, { candidates: [candidate(thought('合成推理'), { text: '答案' })] }))
      .toEqual({ kind: 'answer', text: '答案', reasoningText: null, usage: null });
    expect(normalizeModelResponse(model, { candidates: [candidate(thought('合成推理'), { text: '答案' })] }))
      .toMatchObject({ kind: 'answer', text: '答案' });
    // Only the first candidate answers: a second is a different answer, not more of this one.
    expect(normalizeModelResponse(model, { candidates: [candidate({ text: '第一' }), candidate({ text: '第二' })] }))
      .toMatchObject({ kind: 'answer', text: '第一' });
    // Whitespace is an answer, exactly as it is on the three shapes before it: only the contract may judge it.
    expect(normalizeModelResponse(model, { candidates: [candidate({ text: ' ' })] })).toMatchObject({ kind: 'answer', text: ' ' });
  });

  it('separates an empty answer from an answer and carries whether the model reasoned', () => {
    // The model thought and said nothing: thought parts only, and no answer text at all.
    expect(normalizeModelResponse(reasoningModel, {
      candidates: [candidate(thought('合成推理'))],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 0 },
    })).toEqual({ kind: 'empty-answer', reasoningPresent: true, usage: { inputTokens: 11, outputTokens: 0 } });
    // A candidate that carries no parts, an empty part list, or an empty text part hands the contract
    // layer the same `''`, so all three are the one outcome.
    expect(normalizeModelResponse(reasoningModel, { candidates: [candidate()] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    expect(normalizeModelResponse(reasoningModel, { candidates: [{ finishReason: 'SAFETY' }] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    expect(normalizeModelResponse(reasoningModel, { candidates: [{ content: { role: 'model' } }] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    expect(normalizeModelResponse(reasoningModel, { candidates: [candidate({ text: '' })] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
    // Presence is read only where the channel is declared: an undeclared channel reports nothing.
    expect(normalizeModelResponse(model, { candidates: [candidate(thought('合成推理'))] }))
      .toEqual({ kind: 'empty-answer', reasoningPresent: false, usage: null });
  });

  it('names a response that carries no candidate at all', () => {
    expect(normalizeModelResponse(model, { promptFeedback: { blockReason: 'SAFETY' } }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    // An empty array is where this shape parts company with the one before it: no candidate is not an
    // empty answer, and a blocked prompt is exactly what returns none. `promptFeedback` is not read,
    // so the reason names what the response lacked rather than why the vendor withheld it — the
    // reading the first live item on this shape should confirm.
    expect(normalizeModelResponse(model, { candidates: [], promptFeedback: { blockReason: 'SAFETY' } }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { candidates: 'not-an-array' })).toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { candidates: [null] })).toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, null)).toEqual({ kind: 'malformed', reason: 'response-not-a-record' });
    // None of the three shapes before it is this shape, and each of their bodies is read as such.
    expect(normalizeModelResponse(model, { choices: [{ message: { content: '{"ok":true}' } }] }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { content: [{ type: 'text', text: '{"ok":true}' }] }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    expect(normalizeModelResponse(model, { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] }))
      .toEqual({ kind: 'malformed', reason: 'candidate-absent' });
    // Declaring no answer channel still refuses first, whichever shape the model requests.
    expect(normalizeModelResponse(geminiModel({ answerChannel: 'none' }), { candidates: [candidate({ text: '答案' })] }))
      .toEqual({ kind: 'malformed', reason: 'answer-channel-not-declared' });
  });

  it('reads usage from usageMetadata, and the reasoning count only when it is one', () => {
    const answered = (usageMetadata: unknown) => normalizeModelResponse(model, { candidates: [candidate({ text: 'x' })], usageMetadata });
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 12, totalTokenCount: 162 }))
      .toMatchObject({ usage: { inputTokens: 120, outputTokens: 30, reasoningTokens: 12 } });
    // Without the count there is nothing to carry, and none is invented: the whole usage, stated
    // exactly, so a reasoning count that appeared from nowhere would fail here.
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: -1 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(answered({ promptTokenCount: 5 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ promptTokenCount: -1, candidatesTokenCount: 2 })).toMatchObject({ kind: 'answer', usage: null });
    expect(answered({ promptTokenCount: 0, candidatesTokenCount: 0 })).toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 } });
    expect(normalizeModelResponse(model, { candidates: [candidate({ text: 'x' })] })).toMatchObject({ usage: null });
    // The cache accounting nothing has observed on this vendor is not read, and the total is a sum of
    // counts already carried rather than a count of its own: the input count passes through untouched.
    expect(answered({ promptTokenCount: 120, candidatesTokenCount: 30, cachedContentTokenCount: 100, totalTokenCount: 150 }))
      .toEqual({ kind: 'answer', text: 'x', reasoningText: null, usage: { inputTokens: 120, outputTokens: 30 } });
  });
});
