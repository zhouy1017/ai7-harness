import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, expect, it } from 'vitest';

type Pins = { blocks: Array<{ surface: string; block: string | null }>; snapshots: Record<string, unknown>;
  contexts: Array<{ surface: string; bookId: string | null; taskKind: string }>; events: Array<{ unitPreferenceReferences: unknown }>;
  records: Record<string, unknown[]>; attributionLists: unknown[]; timing: { points: unknown[]; order: string }; frozen: unknown[];
  automaticDigest: string; preferenceDigests: string[] };
let expected: Pins;
let actual: Pins;
// These literals were produced by the BASE, not by the facade. A future memory behaviour change must
// deliberately review/update the affected memory literals; unrelated prompts and transport bytes are not pinned.
// The full request/table packet is opt-in one-time PR evidence in .cache, never a permanent expectation.
beforeAll(async () => {
  const { base, ...pins } = JSON.parse(await readFile(resolve('tests/fixtures/database/sample1-memory-base.json'), 'utf8'));
  expect(base).toBe('73a3e75fa16e5ba48d8467c4fbb98a68f62fd90c'); expected = pins;
  const interpreter: { memoryCompatibilityPacketFrom(): Promise<Pins> } = await import(pathToFileURL(resolve('tools/memory-compatibility-packet.mjs')).href);
  actual = await interpreter.memoryCompatibilityPacketFrom();
}, 180_000);

it('pins original rule indexes in stored category events and finding attribution (#1498)', () => {
  expect(actual.events.length).toBeGreaterThan(0);
  expect(actual.attributionLists).toEqual(expected.attributionLists);
  expect(actual.events).toEqual(expected.events);
  expect(actual.snapshots.reviewAttribution).toEqual(expected.snapshots.reviewAttribution);
});
it('pins the 15-line and exact 1200-grapheme whole-line boundaries (#1498)', () => {
  expect(actual.snapshots.characterCount).toBe(1200);
  for (const key of ['lineLimit', 'characterLimit', 'excluded', 'disabled', 'restored']) expect(actual.snapshots[key]).toEqual(expected.snapshots[key]);
});
it('pins ignored, decision, manual and both Word capture rows plus curation publication (#1498)', () => {
  expect(actual.records.learning_signals).toEqual(expected.records.learning_signals);
  expect(actual.records.global_editorial_memory_item_versions).toEqual(expected.records.global_editorial_memory_item_versions);
  expect(actual.snapshots.curation).toEqual(expected.snapshots.curation);
  expect(JSON.stringify(actual.snapshots.curation)).toContain('"actor":"AI7"');
});
it('pins Global Agent name redaction and the adds-text governance bound (#1498)', () => {
  expect(actual.snapshots.redactedSources).toEqual(expected.snapshots.redactedSources);
  expect(JSON.stringify(actual.snapshots.redactedSources)).not.toContain('合成人名甲');
  expect(actual.snapshots.governanceBound).toEqual(expected.snapshots.governanceBound);
  expect(actual.snapshots.governanceBound).toContain('GLOBAL_AGENT_MEMORY_LIMIT');
});
it('pins custom-category selection and the distinct workspace request context (#1498)', () => {
  expect(actual.snapshots.customCategory).toEqual(expected.snapshots.customCategory);
  expect(actual.contexts).toEqual(expected.contexts);
  expect(actual.contexts).toContainEqual(expect.objectContaining({ surface: 'agent-workspace', taskKind: 'agent-workspace' }));
});
it('pins memory blocks carried by every exercised ordinary request family (#1498)', () => {
  expect(actual.blocks).toEqual(expected.blocks);
  for (const surface of ['analysis', 'clarification', 'review', 'review-synthesis', 'factual-first-synthesis', 'fast-role', 'scoped-edit', 'conflict-regenerate', 'dialogue', 'agent-workspace', 'global-agent', 'curation'])
    expect(actual.blocks.some(entry => entry.surface === surface)).toBe(true);
});
it('pins memory snapshots, separate digest formulas and preference records (#1498)', () => {
  expect(actual.snapshots).toEqual(expected.snapshots);
  expect(actual.automaticDigest).toBe(expected.automaticDigest);
  expect(actual.preferenceDigests).toEqual(expected.preferenceDigests);
  expect(actual.frozen).toEqual(expected.frozen);
  expect(actual.records).toEqual(expected.records);
});
it('pins distinct memory read order and transaction placement (#1498)', () => {
  // Consecutive repeats are cache details; transitions and actual execution flags are memory timing.
  expect(actual.timing.points).toContainEqual(expect.objectContaining({ surface: 'transaction-placement', inTransaction: true }));
  // The open reads each memory ledger once since the baseline fold (#1634; the base's chain read two of them twice): which
  // ledgers the open reads, all outside a transaction, stays pinned, and everything after the open in its exact order.
  const split = (timing: Pins['timing']) => {
    const points = timing.order.split(',').map((index) => JSON.stringify(timing.points[parseInt(index, 36)]));
    const opened = points.findIndex((point) => (JSON.parse(point) as { surface: string }).surface !== 'open');
    return { open: [...new Set(points.slice(0, opened))].sort(), after: points.slice(opened) };
  };
  expect(split(actual.timing)).toEqual(split(expected.timing));
});
