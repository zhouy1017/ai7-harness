import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, expect, it } from 'vitest';

type Pins = { blocks: Array<{ surface: string; block: string | null }>; snapshots: Record<string, unknown>;
  contexts: Array<{ surface: string; bookId: string | null; taskKind: string }>; events: Array<{ unitPreferenceReferences: unknown }>;
  records: Record<string, unknown[]>; attributionLists: unknown[]; timing: { points: unknown[]; order: string }; frozen: unknown[];
  automaticDigest: string; preferenceDigests: string[] };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Two-stage curation allocates four additional synthetic IDs before publication. The later linked records and
// digests change together. Keep the original fixture for all other fields and pin these exact successor values.
const curationPins: Record<'snapshots' | 'records', Record<string, string>> = {
  "snapshots": {
    "redactedSources": "ac285b05010022a33371daa9b4c746d45f46c061fdabd3fd0bf01d86a4629bb3",
    "legacyPreferences": "32d988600c111b417f0b79f8ab1f7afb4a52f1a15540b8175d6a26c1c2944ca1",
    "curation": "61361f78bc6295687e90511de7b0557c61bc76f7ad9d133c0490aa5eb768a2d2"
  },
  "records": {
    "learning_signals": "43605dfbfac08d9914e22e1ed0c2fc813980f0f56cb2a49739f394b43aa2e233",
    "global_editorial_memory_items": "e5c6599617b862aede804309a5b5833098393691f49dc72e86e31d8b7b20130c",
    "global_editorial_memory_item_versions": "7859e699e0af070a8f06e4ab9502735ea60dec52644983ba7764276d19407c14",
    "learning_supervision_directives": "ff7ac56360c22d33ef52b926a52ad06bfb8b9e6ac965803fa5a1d007cc588935",
    "review_run_preference_pins": "35377fd7b0e3e52b45cb69d0b91a6baa5292961049a4bbfea1ea3daf46fd434b",
    "house_review_preference_versions": "3890432e889cdb390e70c7139a275712110701bbfc1a2af8027a64aa63bb0813"
  }
};
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

function expectPin(section: 'snapshots' | 'records', key: string): void {
  const next = curationPins[section][key];
  if (next === undefined) expect(actual[section][key]).toEqual(expected[section][key]);
  else expect(digest(actual[section][key]), key).toBe(next);
}

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
  expectPin('records', 'learning_signals');
  expectPin('records', 'global_editorial_memory_item_versions');
  expectPin('snapshots', 'curation');
  expect(JSON.stringify(actual.snapshots.curation)).toContain('"actor":"AI7"');
});
it('pins Global Agent name redaction and the adds-text governance bound (#1498)', () => {
  expectPin('snapshots', 'redactedSources');
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
  for (const section of ['snapshots', 'records'] as const) {
    expect(Object.keys(actual[section]).sort()).toEqual(Object.keys(expected[section]).sort());
    for (const key of Object.keys(expected[section])) expectPin(section, key);
  }
  expect(actual.automaticDigest).toBe(expected.automaticDigest);
  expect(digest(actual.preferenceDigests)).toBe('0abd8f82af2a3ceb90ebc57827183a37fd920c8e60750c21711f9003d2a8afb0');
  expect(actual.frozen).toEqual(expected.frozen);
});
it('pins distinct memory read order and transaction placement (#1498)', () => {
  // Consecutive repeats are cache details; transitions and actual execution flags are memory timing.
  expect(actual.timing.points).toContainEqual(expect.objectContaining({ surface: 'transaction-placement', inTransaction: true }));
  // The open reads each memory ledger once since the baseline fold (#1634): the base's chain read two of them twice during
  // the creating open, so the open's reads are exactly the base's last six, in order. Curation now checks both recipients before reserving its two turns.
  const split = (timing: Pins['timing']) => {
    const points = timing.order.split(',').map((index) => JSON.stringify(timing.points[parseInt(index, 36)]));
    const opened = points.findIndex((point) => (JSON.parse(point) as { surface: string }).surface !== 'open');
    const curation = points.filter(point => JSON.parse(point).surface === 'curation');
    return { open: points.slice(0, opened), curation, after: points.slice(opened).filter(point => JSON.parse(point).surface !== 'curation') };
  };
  const [head, base] = [split(actual.timing), split(expected.timing)];
  expect(base.open).toHaveLength(8);
  expect(head.open).toEqual(base.open.slice(2));
  expect(head.after).toEqual(base.after);
  expect(digest(head.curation)).toBe('96392aa298a8b8339bb876a2cd9a2be5f3c714db8b63314b3b692036e253588c');
});
