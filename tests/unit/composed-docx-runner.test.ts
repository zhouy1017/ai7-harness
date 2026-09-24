import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveImportFidelityPlan, parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';

// The runners' plain-JS twin of the composed-fixture builder (`e2e/composed-docx.mjs`), read through the
// product's own parser so its retention content is exactly what the Journeys import.
const {
  ADMITTED_BASELINE_DOCX,
  IMPORTED_MARKS_AUTHOR,
  IMPORTED_MARKS_COUNT,
  IMPORTED_MARKS_OTHER_AUTHOR,
  IMPORTED_MARKS_RECIPE,
  IMPORTED_MARKS_REJECTED_BLOCKS,
  admittedSpanText,
  composeAdmittedDocx,
  composeRevisedAdmittedDocx,
} = (await import(new URL('../../e2e/composed-docx.mjs', import.meta.url).href)) as {
  ADMITTED_BASELINE_DOCX: string;
  IMPORTED_MARKS_AUTHOR: string;
  IMPORTED_MARKS_COUNT: number;
  IMPORTED_MARKS_OTHER_AUTHOR: string;
  IMPORTED_MARKS_RECIPE: Record<string, unknown>;
  IMPORTED_MARKS_REJECTED_BLOCKS: ReadonlyArray<number>;
  admittedSpanText(source: string, span: { block: number; from?: number; to?: number }): Promise<string>;
  composeAdmittedDocx(path: string, request: Record<string, unknown>): Promise<Uint8Array>;
  composeRevisedAdmittedDocx(path: string, request: Record<string, unknown>): Promise<Uint8Array>;
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

  it('writes J-01\'s comments and tracked changes so that the parser reads the source rejected and seven marks (Issue #411)', async () => {
    const path = join(sandbox, 'revised.docx');
    await composeRevisedAdmittedDocx(path, { source: ADMITTED_BASELINE_DOCX, title: '修订组稿', ...IMPORTED_MARKS_RECIPE });
    const blocks: ParsedDocxBlock[] = [];
    const parsed = await parseDocx(path, 'revised.docx', (block) => blocks.push(block));
    const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
    const expected = await Promise.all(IMPORTED_MARKS_REJECTED_BLOCKS.map(async (block) => digest(await admittedSpanText(ADMITTED_BASELINE_DOCX, { block }))));
    expect(blocks.map((block) => digest(block.text))).toEqual(expected);
    expect(parsed.importedMarks.map((mark) => [mark.blockPosition, mark.kind, mark.origin, mark.authorLabel, mark.status])).toEqual([
      [1, 'change-suggestion', 'deletion', IMPORTED_MARKS_AUTHOR, 'open'],
      [2, 'change-suggestion', 'insertion', IMPORTED_MARKS_AUTHOR, 'open'],
      [3, 'change-suggestion', 'replacement', IMPORTED_MARKS_AUTHOR, 'open'],
      [4, 'annotation', 'comment', IMPORTED_MARKS_AUTHOR, 'open'],
      [5, 'annotation', 'comment', IMPORTED_MARKS_AUTHOR, 'resolved'],
      [5, 'annotation', 'paragraph-insertion', IMPORTED_MARKS_OTHER_AUTHOR, 'open'],
      [6, 'annotation', 'move', IMPORTED_MARKS_AUTHOR, 'open'],
    ]);
    expect(parsed.importedMarks).toHaveLength(IMPORTED_MARKS_COUNT);
    expect(parsed.fidelity.filter((category) => category.count > 0).map((category) => [category.key, category.count, category.status]))
      .toEqual([['inline-styles', 1, 'retained'], ['comments-revisions', IMPORTED_MARKS_COUNT, 'preserved']]);
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
