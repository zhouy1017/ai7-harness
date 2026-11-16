import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { appendTaskBaselineSynopses, fitSynopsisChain, MAX_TASK_SYNOPSIS_BYTES, MAX_REVIEW_SYNTHESIS_BYTES, synopsisCandidates, taskSynopsisRequestDigest, taskSynopsisMessageRequestDigest,
  remainingSynopsisMessageBytes, reviewSynthesisRequestBytes } from '../../src/service/analysis/baseline-synopsis.js';
import { taskSynopsisStageInputDigest } from '../../src/service/analysis/baseline-synopsis.js';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { baselineSynopsisSent, baselineSynopsisTechnical } from '../../src/shared/baseline-synopsis-wording.js';
import type { FrozenBaselineSynopsisContext } from '../../src/shared/protocol/baseline-synopsis.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/model/sample1-review-authored.json', import.meta.url), 'utf8'));
const note: string = fixture.entries.flatMap((entry: { response: { text: string } }) => JSON.parse(entry.response.text).findings ?? [])
  .find((entry: { note?: string }) => typeof entry.note === 'string').note;
const context = (maximumMessageBytes: number | null): FrozenBaselineSynopsisContext => ({ revisionId: 'baseline-local-id', manuscriptRevisionId: 'manuscript-local-id',
  maximumMessageBytes, maximumSupplementBytes: MAX_TASK_SYNOPSIS_BYTES, synopses: synopsisCandidates(Array.from({ length: 40 }, (_, index) => ({ unitOrdinal: index + 1, synopsis: note.repeat(100) }))),
  missingUnitOrdinals: [41], omittedUnitOrdinals: [], shortenedUnitOrdinals: [] });

it('describes send-time room and discloses omission when only the header would fit (#1500 R1)', () => {
  const base = '全书综合\n' + note;
  const full = appendTaskBaselineSynopses(base, context(null));
  const headerBytes = Buffer.byteLength(full.slice(base.length, full.indexOf('\n{') + 1));
  const frozen = context(Buffer.byteLength(base) + headerBytes);
  expect(baselineSynopsisSent(frozen)).toContain('有余量');
  expect(appendTaskBaselineSynopses(base, frozen)).toContain('全部省略');
});

it.each(['partial', 'header-only', 'none'])('records only the sent input with %s room for the chapter chain (#1500 R1)', room => {
  const base = '全书综合\n' + note, full = appendTaskBaselineSynopses(base, context(null));
  const headerBytes = Buffer.byteLength(full.slice(base.length, full.indexOf('\n{') + 1));
  const frozen = context(Buffer.byteLength(base) + (room === 'partial' ? headerBytes + 2500 : room === 'header-only' ? headerBytes : 0));
  const sent = appendTaskBaselineSynopses(base, frozen);
  const input = taskSynopsisStageInputDigest('base-input', sent, frozen), request = taskSynopsisMessageRequestDigest('base-request', sent);
  expect(Buffer.byteLength(sent)).toBeLessThanOrEqual(frozen.maximumMessageBytes!);
  if (room === 'partial') {
    const payload = JSON.parse(sent.slice(sent.indexOf('\n{') + 1));
    expect(payload.shortenedUnitOrdinals.length + payload.omittedUnitOrdinals.length).toBeGreaterThan(0);
    expect(input).toBe(canonicalRecord({ inputDigest: 'base-input', baselineSynopsisSent: payload }).digest);
    expect(request).toBe(taskSynopsisRequestDigest('base-request', frozen));
  } else if (room === 'header-only') {
    expect(sent).toContain('全部省略');
    expect(input).toBe(canonicalRecord({ inputDigest: 'base-input', baselineSynopsisOmitted: 'capacity' }).digest);
    expect(request).toBe(canonicalRecord({ requestDigest: 'base-request', baselineSynopsisOmitted: 'capacity' }).digest);
  } else { expect(sent).toBe(base); expect(input).toBe('base-input'); expect(request).toBe('base-request'); }
  expect(input).not.toBe(taskSynopsisRequestDigest('base-input', frozen));
});

it.each([1024, 24 * 1024, 96 * 1024, null])('fits only the final message at %s bytes with truthful chapter disclosures (#1500)', maximum => {
  const frozen = context(maximum), before = JSON.stringify(frozen), base = '全书综合\n' + note;
  const message = appendTaskBaselineSynopses(base, frozen), payload = JSON.parse(message.slice(message.indexOf('\n{') + 1));
  if (maximum !== null) expect(Buffer.byteLength(message)).toBeLessThanOrEqual(maximum);
  expect(Buffer.byteLength(message) - Buffer.byteLength(base)).toBeLessThanOrEqual(MAX_TASK_SYNOPSIS_BYTES);
  expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThanOrEqual(MAX_TASK_SYNOPSIS_BYTES);
  expect(payload.missingUnitOrdinals).toEqual([41]);
  expect(payload.synopses.length + payload.omittedUnitOrdinals.length).toBe(40);
  expect(payload.shortenedUnitOrdinals).toHaveLength(payload.synopses.length);
  expect(new Set(payload.synopses.map((unit: { synopsis: string }) => [...unit.synopsis].length)).size).toBe(1);
  expect(message).not.toContain(frozen.revisionId); expect(message).not.toContain(frozen.manuscriptRevisionId);
  expect(JSON.stringify(frozen)).toBe(before);
  expect(taskSynopsisMessageRequestDigest('request', message)).toBe(taskSynopsisRequestDigest('request', frozen));
  expect(baselineSynopsisSent(frozen)).toContain('400 字'); expect(baselineSynopsisSent(frozen)).toContain('缺少第 41 范围');
});

it('shares the known/unknown remaining-capacity rule while preserving each intrinsic format cap (#1500)', () => {
  expect(remainingSynopsisMessageBytes(null, note)).toBeNull();
  expect(reviewSynthesisRequestBytes(null, note)).toBe(MAX_REVIEW_SYNTHESIS_BYTES);
  for (const tokens of [1000, 16 * 1024, 128 * 1024]) {
    expect(remainingSynopsisMessageBytes(tokens, note)).toBe(Math.max(0, tokens - Buffer.byteLength(note) - 4096));
    expect(reviewSynthesisRequestBytes(tokens, note)).toBe(Math.max(1024, tokens - Buffer.byteLength(note) - 4096));
  }
  const unknown = context(null), base = note.repeat(10_000), sent = appendTaskBaselineSynopses(base, unknown);
  expect(Buffer.byteLength(base)).toBeGreaterThan(MAX_REVIEW_SYNTHESIS_BYTES);
  expect(sent.startsWith(base)).toBe(true); expect(sent.length).toBeGreaterThan(base.length);
  expect(Buffer.byteLength(sent) - Buffer.byteLength(base)).toBeLessThanOrEqual(MAX_TASK_SYNOPSIS_BYTES);
  expect(baselineSynopsisSent(unknown)).toBe(baselineSynopsisSent(context(128 * 1024)));
  expect(baselineSynopsisSent(unknown)).not.toContain('unregistered');
  expect(baselineSynopsisTechnical(unknown)[0]!.value).toContain('supplement=24576');
  expect(baselineSynopsisTechnical(unknown)[0]!.value).toContain('unregistered');
});

it('leaves absent context byte-identical and excludes local row identities from fixture request keys (#1500)', () => {
  expect(appendTaskBaselineSynopses('existing message')).toBe('existing message');
  expect(taskSynopsisRequestDigest('existing request')).toBe('existing request'); expect(baselineSynopsisSent()).toBe('');
  const frozen = context(96 * 1024);
  expect(taskSynopsisRequestDigest('request', frozen)).toBe(taskSynopsisRequestDigest('request', { ...frozen, revisionId: 'other', manuscriptRevisionId: 'other' }));
  expect(appendTaskBaselineSynopses('existing message', { ...frozen, maximumMessageBytes: 1 })).toBe('existing message');
  expect(taskSynopsisMessageRequestDigest('request', 'existing message')).toBe('request');
});

it('uses the same even-shortening-before-tail fit rule for all consumers (#1500)', () => {
  const candidates = synopsisCandidates(context(96 * 1024).synopses);
  let kept = candidates;
  fitSynopsisChain(candidates, value => { kept = value; }, () => Buffer.byteLength(JSON.stringify(kept)) <= 300);
  expect(kept.length).toBeLessThan(40); expect(kept.map(unit => unit.unitOrdinal)).toEqual(candidates.slice(0, kept.length).map(unit => unit.unitOrdinal));
  expect(kept.every(unit => [...unit.synopsis].length === 1)).toBe(true);
});
