import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveImportFidelityPlan, parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';

// The runners' plain-JS twin of the composed-fixture builder (`e2e/composed-docx.mjs`), read through the
// product's own parser so its retention content is exactly what the Journeys import.
const { ADMITTED_BASELINE_DOCX, composeAdmittedDocx } = (await import(new URL('../../e2e/composed-docx.mjs', import.meta.url).href)) as {
  ADMITTED_BASELINE_DOCX: string;
  composeAdmittedDocx(path: string, request: Record<string, unknown>): Promise<Uint8Array>;
};

// Unit suite for the runner twin's retention content (Issue #410; ADR 0086). Every assertion is a count,
// a key or a digest; no excerpt's text is asserted, named or printed.

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-composed-runner-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

async function composedParse(name: string, request: Record<string, unknown>) {
  const path = join(sandbox, name);
  const archive = await composeAdmittedDocx(path, request);
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, name, (block) => blocks.push(block));
  return { archive, parsed, blocks };
}

describe('the runners\' composed-docx helper', () => {
  it('keeps a plain excerpt exactly as it was composed before retention content existed', async () => {
    const { archive, parsed } = await composedParse('plain.docx', { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '组稿' });
    expect(createHash('sha256').update(archive).digest('hex')).toBe('21cd901def7c1df45ac3020b8d98d5b8f55d8589aed518d5d57c223acffdb3f4');
    expect(parsed.fidelity.every((category) => category.count === 0)).toBe(true);
  });

  it('writes a Word text box of source blocks that the parser reads as one retained box', async () => {
    const { parsed, blocks } = await composedParse('box.docx', {
      source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '文本框组稿',
      retention: { textBox: { anchorBlock: 2, sourceStartBlock: 7, blocks: 2 } },
    });
    expect(blocks).toHaveLength(6);
    expect(parsed.textBoxes.map((box) => [box.boxOrdinal, box.paragraphs.length])).toEqual([[1, 2]]);
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['text-boxes', 1, 'retained']]);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)?.outcome).toBe('clean-import-no-round-trip');
  });

  it('writes a field and a footnote that the parser reads as the two classes that need the decision', async () => {
    const { parsed, blocks } = await composedParse('degraded.docx', {
      source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 8, title: '降级组稿',
      retention: { field: { block: 1 }, footnote: { block: 3, noteSourceBlock: 9 } },
    });
    expect(blocks).toHaveLength(8);
    expect(deriveImportFidelityPlan(parsed.fidelity, parsed.sourceDigest, parsed.archiveBytes)?.degradations).toEqual([
      { categoryKey: 'notes', label: '脚注与尾注', count: 1 },
      { categoryKey: 'fields', label: '域（目录等）', count: 1 },
    ]);
  });
});
