import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { capturedProcedureDocument, houseExecutor, isCapturedProcedureDocument, readCapturedProcedureDocument } from '../../src/service/captured-procedures.js';
import { BUILTIN_REVIEW_CATEGORY_CONFIGURATION, reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import { procedureCeilingLines } from '../../src/renderer/captured-procedure-labels.js';
import { CAPTURED_PROCEDURE_CAPTURE_SLOTS, CAPTURED_PROCEDURE_SCHEMA_V2, MAX_CAPTURED_PROCEDURE_TITLE_CHARACTERS } from '../../src/shared/protocol.js';

describe('ADR 0090 captured procedure /2', () => {
  it('publishes Series eligibility only with a Series step and discloses its per-Run opt-in', () => {
    const document = capturedProcedureDocument('书系复核', [reviewCategoryEntry('series-consistency')!], 'whole');
    expect(document.schema).toBe('ai7.captured-procedure/2');
    expect(document.authorityCeiling.runSourceScope).toBe('series');
    expect(isCapturedProcedureDocument(document)).toBe(true);
    expect(procedureCeilingLines(document.authorityCeiling)[0]).toContain('须由你另行勾选');
    const ordinary = capturedProcedureDocument('体例复核', [reviewCategoryEntry('style-and-format')!], 'whole');
    expect(isCapturedProcedureDocument({ ...ordinary, schema: 'ai7.captured-procedure/2', authorityCeiling: { ...ordinary.authorityCeiling, runSourceScope: 'series' } })).toBe(false);
    // Reviewer (#66): a /2 Series step under a `current-book` scope is not its steps' sum either.
    expect(isCapturedProcedureDocument({ ...document, authorityCeiling: { ...document.authorityCeiling, runSourceScope: 'current-book' } })).toBe(false);
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

  it('keeps the published /2 schema file in step with the runtime validator (Reviewer, #66)', () => {
    const schema = JSON.parse(readFileSync(new URL('../../src/service/captured-procedure-v2.schema.json', import.meta.url), 'utf8'));
    expect(schema.$id).toBe(CAPTURED_PROCEDURE_SCHEMA_V2);
    expect(schema.properties.schema.const).toBe(CAPTURED_PROCEDURE_SCHEMA_V2);
    expect(schema.properties.title.maxLength).toBe(MAX_CAPTURED_PROCEDURE_TITLE_CHARACTERS);
    expect(schema.properties.parameters.properties.scope.enum).toEqual([...CAPTURED_PROCEDURE_CAPTURE_SLOTS]);
    expect(schema.properties.authorityCeiling.properties.runSourceScope.enum).toEqual(['current-book', 'series']);
    const executors: unknown[] = schema.properties.authorityCeiling.properties.steps.items.properties.executor.enum;
    const outputs: unknown[] = schema.properties.steps.items.properties.output.enum;
    for (const entry of BUILTIN_REVIEW_CATEGORY_CONFIGURATION.categories) {
      if (entry.executor === 'unavailable') continue;
      expect(executors).toContain(houseExecutor(entry));
      expect(outputs).toContain(entry.output);
    }
  });
});
