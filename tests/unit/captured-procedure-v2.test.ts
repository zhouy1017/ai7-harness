import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { capturedProcedureDocument, isCapturedProcedureDocument, readCapturedProcedureDocument } from '../../src/service/captured-procedures.js';
import { reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import { procedureCeilingLines } from '../../src/renderer/captured-procedure-labels.js';

describe('ADR 0090 captured procedure /2', () => {
  it('publishes Series eligibility only with a Series step and discloses its per-Run opt-in', () => {
    const document = capturedProcedureDocument('书系复核', [reviewCategoryEntry('series-consistency')!], 'whole');
    expect(document.schema).toBe('ai7.captured-procedure/2');
    expect(document.authorityCeiling.runSourceScope).toBe('series');
    expect(isCapturedProcedureDocument(document)).toBe(true);
    expect(procedureCeilingLines(document.authorityCeiling)[0]).toContain('须由你另行勾选');
    const ordinary = capturedProcedureDocument('体例复核', [reviewCategoryEntry('style-and-format')!], 'whole');
    expect(isCapturedProcedureDocument({ ...ordinary, schema: 'ai7.captured-procedure/2', authorityCeiling: { ...ordinary.authorityCeiling, runSourceScope: 'series' } })).toBe(false);
  });

  it('reads and pins predecessor /1 bytes without rewriting their document or digest', () => {
    const current = capturedProcedureDocument('书系复核', [reviewCategoryEntry('series-consistency')!], 'whole');
    const predecessor = { ...current, schema: 'ai7.captured-procedure/1', authorityCeiling: { ...current.authorityCeiling, runSourceScope: 'current-book' } };
    const json = canonicalJson(predecessor);
    const digest = sha256Hex(json);
    const read = readCapturedProcedureDocument(json, digest);
    expect(read).toEqual(predecessor);
    expect(canonicalJson(read)).toBe(json);
    expect(sha256Hex(canonicalJson(read))).toBe(digest);
    expect(isCapturedProcedureDocument({ ...current, schema: 'ai7.captured-procedure/1' })).toBe(false);
  });
});
