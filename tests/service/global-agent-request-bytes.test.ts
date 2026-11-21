import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { captureGlobalAgentRequests, normalizeCapture, type GlobalAgentCapture } from '../support/global-agent-capture.js';

// The expectation was written by the base (34389e13c) running this same file with AI7_GLOBAL_AGENT_CAPTURE_WRITE set
// (Issue #1655 review): what the AI 助手 lists and sends over a store holding no 重新启用 / 删除 record.
const EXPECTED = resolve('tests/fixtures/global-agent/requests-at-34389e13c.json');

it('lists and sends what the base did over a store without lifecycle records, and after 重新启用 only the entry comes back (#1655)', async () => {
  const write = process.env['AI7_GLOBAL_AGENT_CAPTURE_WRITE'] === '1';
  const { before, after } = await captureGlobalAgentRequests(write ? undefined : (store, itemId) => {
    const pin = store.inspectEditorialLearning({ signalOffset: 0, itemOffset: 0, detailItemId: itemId }).items[0]!.current.versionId;
    store.reviewPreferenceLifecycle({ itemId, expectedRevisionId: pin, actionId: randomUUID() }, 'reactivate');
  });
  if (write) { writeFileSync(EXPECTED, `${JSON.stringify(normalizeCapture(before), null, 2)}\n`); return; }
  // Byte for byte: every listed and sent revision, every text and both request bodies.
  expect(normalizeCapture(before)).toEqual(JSON.parse(readFileSync(EXPECTED, 'utf8')));
  // After one 重新启用 of a memory entry (no directive), the only new source is that entry; every other pin is unchanged.
  const { before: was, after: now } = normalizeCapture({ before, after }) as { before: GlobalAgentCapture; after: GlobalAgentCapture };
  const added = now.sourceCandidates.filter((entry) => !was.sourceCandidates.some((old) => old.itemId === entry.itemId));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ kind: 'memory', text: '合成停用后的记忆。' });
  expect(now.sourceCandidates.filter((entry) => entry !== added[0])).toEqual(was.sourceCandidates);
  expect(now.items.filter((entry) => entry.itemId !== added[0]!.itemId)).toEqual(was.items.filter((entry) => entry.itemId !== added[0]!.itemId));
  expect(now.items.find((entry) => entry.itemId === added[0]!.itemId)).toMatchObject({ state: 'active' });
}, 180_000);
