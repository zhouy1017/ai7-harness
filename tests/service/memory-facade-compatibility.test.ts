import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, expect, it } from 'vitest';
import type { memoryCompatibilityPacket } from '../support/memory-facade-compatibility.js';

type Packet = Awaited<ReturnType<typeof memoryCompatibilityPacket>>;
let expected: Packet;
let actual: Packet;
beforeAll(async () => {
  const { base, ...packet } = JSON.parse(await readFile(resolve('tests/fixtures/database/sample1-memory-base.json'), 'utf8'));
  expect(base).toBe('73a3e75fa16e5ba48d8467c4fbb98a68f62fd90c');
  expected = packet;
  const interpreter: { memoryCompatibilityPacketFrom(): Promise<Packet> } = await import(pathToFileURL(resolve('tools/memory-compatibility-packet.mjs')).href);
  actual = await interpreter.memoryCompatibilityPacketFrom();
}, 180_000);

it.each(['analysis', 'review', 'review-synthesis', 'factual-first-synthesis', 'fast-role', 'dialogue', 'global-agent'])(
  'keeps the base ordinary-production %s request bytes on sample1 (#1498)', surface => {
    const base = expected.requests.filter(request => request.surface === surface);
    expect(base.length).toBeGreaterThan(0);
    expect(actual.requests.filter(request => request.surface === surface)).toEqual(base);
  });

it('keeps base snapshots, frozen digests, rule attribution and stored memory records (#1498)', () => {
  expect(actual.snapshots).toEqual(expected.snapshots);
  expect(actual.frozen).toEqual(expected.frozen);
  expect(actual.bindings).toEqual(expected.bindings);
  expect(actual.records).toEqual(expected.records);
});

it('reads and writes memory at the base transaction and request-lifecycle points (#1498)', () => {
  expect(actual.timing).toEqual(expected.timing);
  const dialogue = actual.requests.find(request => request.surface === 'dialogue')!;
  // The rule was changed after askAboutSelection and before begin, exactly where the base reads it.
  expect(dialogue.body).toContain('在提问后派发前确认的准则。');
});
