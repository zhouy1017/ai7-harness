import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dialogueSseEvents } from '../../src/service/provider/family-chat-completions.js';
import { responsesSseEvents } from '../../src/service/provider/family-openai-responses.js';
import { messagesSseEvents } from '../../src/service/provider/family-anthropic-messages.js';
import { generateContentSseEvents } from '../../src/service/provider/family-gemini.js';
import { sseFrames } from '../../src/service/provider/stream-frames.js';
import type { DeepSeekTransportResponse, DialogueStreamEvent } from '../../src/service/provider/deepseek-adapter.js';

const readers = {
  'openai-chat-completions': (response: DeepSeekTransportResponse) => dialogueSseEvents(response, 'request-model'),
  'openai-responses': responsesSseEvents,
  'anthropic-messages': messagesSseEvents,
  'google-generate-content': generateContentSseEvents,
};
type Family = keyof typeof readers;
function fixture(family: Family, name = 'text-stream'): string[] {
  const record = JSON.parse(readFileSync(`tests/fixtures/model/provider-families/${family}.json`, 'utf8'));
  return record.cases.find((entry: { name: string }) => entry.name === name).response.frames;
}
const sse = (frames: string[]) => new Response(frames.join(''), { headers: { 'content-type': 'text/event-stream' } });
async function read(family: Family, response: DeepSeekTransportResponse): Promise<DialogueStreamEvent[]> {
  const events: DialogueStreamEvent[] = [];
  for await (const event of readers[family](response)) events.push(event);
  return events;
}
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
function mapFrames(frames: string[], map: (value: any) => unknown): string[] {
  return frames.map((text) => text.replace(/data: ([^\r\n]+)/u, (match, data: string) => data === '[DONE]' ? match : `data: ${JSON.stringify(map(JSON.parse(data)))}`));
}

describe('recorded family frame salvage', () => {
  for (const family of Object.keys(readers) as Family[]) {
    it(`${family}: parses its recorded final frame without a trailing separator`, async () => {
      const frames = fixture(family);
      frames[frames.length - 1] = frames.at(-1)!.trimEnd();
      const events = await read(family, sse(frames));
      expect(events.at(-1)).toMatchObject({ kind: 'complete' });
      expect(events.filter((event) => event.kind === 'text').map((event) => event.text).join('')).toBe('合成回答。');
    });
    it(`${family}: falls back to a buffered JSON response`, async () => {
      const events = await read(family, sse(fixture(family)));
      const complete = events.at(-1)!;
      if (complete.kind !== 'complete') throw new Error('Expected recorded completion');
      const response = new Response(JSON.stringify(complete.response), { headers: { 'content-type': 'application/json' } });
      expect(await read(family, response)).toEqual([complete]);
    });
  }

  it('Chat Completions accepts DONE, aliases, extra choices and redundant id fields', async () => {
    const frames = mapFrames(fixture('openai-chat-completions', 'tool-stream'), (value) => ({ ...value, model: 'gateway/alias',
      choices: value.choices.length === 0 ? [] : [...value.choices, { index: 9, delta: { content: 'ignored' } }] }));
    frames.splice(1, 0, frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_r1', type: 'function' }] } }] }));
    const events = await read('openai-chat-completions', sse(frames.filter((text) => !text.includes('finish_reason'))));
    expect(events.at(-1)).toMatchObject({ kind: 'complete', response: { choices: [{ message: { tool_calls: [{ id: 'call_r1', function: { name: 'retrieve', arguments: '{"query":"合成"}' } }] } }] } });
  });

  it('Chat Completions preserves text before a classified in-stream refusal', async () => {
    const events = await read('openai-chat-completions', sse([...fixture('openai-chat-completions').slice(0, 2), frame({ error: { code: 'rate_limit_exceeded', message: 'synthetic' } })]));
    expect(events).toMatchObject([{ kind: 'text', text: '合成' }, { kind: 'error', status: 429 }]);
  });

  it('Responses skips unexpected frames, uses completed text and records a delta mismatch', async () => {
    const frames = mapFrames(fixture('openai-responses'), (value) => value.type === 'response.output_text.delta' ? { ...value, delta: 'different' } : value);
    frames.unshift(frame({ ping: true }), 'data: {broken}\n\n');
    expect((await read('openai-responses', sse(frames))).at(-1)).toMatchObject({ kind: 'complete', response: { ai7StreamTextMismatch: true } });
    const noOutput = mapFrames(fixture('openai-responses'), (value) => value.type === 'response.completed' ? { ...value, response: { status: 'completed' } } : value);
    expect((await read('openai-responses', sse(noOutput))).at(-1)).toMatchObject({ kind: 'complete', response: { output_text: '合成回答。' } });
  });

  it('Messages addresses blocks by index and rejects an unclosed tool without losing text', async () => {
    const frames = mapFrames(fixture('anthropic-messages'), (value) => typeof value.index === 'number' ? { ...value, index: 2 } : value);
    frames.splice(2, 0, frame({ type: 'content_block_start', index: 5, content_block: { type: 'tool_use', id: 'bad', name: 'retrieve', input: {} } }),
      frame({ type: 'content_block_delta', index: 99, delta: { type: 'text_delta', text: 'ignored' } }));
    const events = await read('anthropic-messages', sse(frames));
    expect(events.filter((event) => event.kind === 'text').map((event) => event.text).join('')).toBe('合成回答。');
    const complete = events.at(-1)!;
    expect(complete).toMatchObject({ kind: 'complete' });
    if (complete.kind === 'complete') expect((complete.response as any).content[5]).toMatchObject({ type: 'tool_use', input: null });
  });

  it('Gemini reads the first candidate and accepts usage after finishReason', async () => {
    const frames = mapFrames(fixture('google-generate-content'), (value) => ({ ...value, candidates: [...value.candidates, { content: { parts: [{ text: 'ignored' }] } }] }));
    frames.push(frame({ usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 8 }, promptFeedback: {} }));
    const events = await read('google-generate-content', sse(frames));
    expect(events.filter((event) => event.kind === 'text').map((event) => event.text).join('')).toBe('合成回答。');
    expect(events.at(-1)).toMatchObject({ kind: 'complete', response: { usageMetadata: { candidatesTokenCount: 8 } } });
  });

  it('replaces malformed UTF-8 without losing a final unterminated frame', async () => {
    const bytes = Uint8Array.from([...new TextEncoder().encode('data: {"text":"'), 255, ...new TextEncoder().encode('"}')]);
    const frames = [];
    for await (const frame of sseFrames(new Response(bytes, { headers: { 'content-type': 'text/event-stream' } }))) frames.push(frame);
    expect(JSON.parse(frames[0]!.data)).toEqual({ text: '\uFFFD' });
  });
});
