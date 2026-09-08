import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveImportFidelityPlan, parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import {
  ADMITTED_BASELINE_DOCX,
  ADMITTED_LARGE_FINAL_DOCX,
  ADMITTED_SMALL_DOCX,
  admittedSourcePath,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { SAMPLE1_SHA256 } from '../support/sample1-baseline.js';

// Unit suite (L1) for the composed-fixture builder. Every assertion is a count, a block kind, a heading
// level, or a digest: no excerpt's text is asserted, named, or printed, so a failing case reports a
// number or a boolean rather than manuscript prose.

const TITLE = '组稿测试标题';
/** The small source, preferred wherever size is not the subject. */
const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_SMALL_DOCX, startBlock: 1, blocks: 12, title: TITLE };
/**
 * Exact `2听漏（定稿368544字）.docx` is the only admitted file whose blocks carry heading styles — its
 * first block is a level-1 heading and its fourth a level-3 one — so the style mapping can be proven
 * from real material only here. No admitted file carries a title block, so `Title` stays unexercised.
 */
const HEADING_EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_LARGE_FINAL_DOCX, startBlock: 1, blocks: 6, title: TITLE };

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-composed-fixture-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** The composed archive's SHA-256, which is what a test may say about composed content. */
async function composedDigest(name: string, request: ComposedManuscriptRequest): Promise<string> {
  const archive = await composeManuscriptDocx(join(sandbox, name), request);
  return createHash('sha256').update(archive).digest('hex');
}

/** Block kinds and heading levels only, from either an admitted source or a composed package. */
async function shapeOf(path: string): Promise<{
  kinds: ParsedDocxBlock['kind'][];
  levels: (number | null)[];
  parsed: Awaited<ReturnType<typeof parseDocx>>;
}> {
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, basename(path), (block) => blocks.push(block));
  return { kinds: blocks.map((block) => block.kind), levels: blocks.map((block) => block.level), parsed };
}

describe('composeManuscriptDocx', () => {
  it('writes the same bytes for the same request', async () => {
    const first = await composedDigest('first.docx', EXCERPT);
    const second = await composedDigest('second.docx', EXCERPT);
    expect(second).toBe(first);
  });

  it('gives a different digest to a different excerpt of the same source', async () => {
    const base = await composedDigest('base.docx', EXCERPT);
    expect(await composedDigest('later.docx', { ...EXCERPT, startBlock: EXCERPT.startBlock + EXCERPT.blocks })).not.toBe(base);
    expect(await composedDigest('shorter.docx', { ...EXCERPT, blocks: EXCERPT.blocks - 1 })).not.toBe(base);
    expect(await composedDigest('retitled.docx', { ...EXCERPT, title: `${TITLE}（二）` })).not.toBe(base);
  });

  it('never reproduces the exact sample1 digest, not even when composing from sample1 itself', async () => {
    expect(await composedDigest('small.docx', EXCERPT)).not.toBe(SAMPLE1_SHA256);
    expect(await composedDigest('baseline.docx', { ...EXCERPT, source: ADMITTED_BASELINE_DOCX })).not.toBe(SAMPLE1_SHA256);
  });

  it('carries every excerpt block kind and heading level into the composed package', async () => {
    const source = await shapeOf(admittedSourcePath(HEADING_EXCERPT.source));
    const from = HEADING_EXCERPT.startBlock - 1;
    const expectedKinds = source.kinds.slice(from, from + HEADING_EXCERPT.blocks);
    const expectedLevels = source.levels.slice(from, from + HEADING_EXCERPT.blocks);
    // The case is only worth running while the excerpt still carries structure, and a level above 1
    // is what proves the level itself is carried rather than defaulted.
    expect(expectedKinds).toContain('heading');
    expect(expectedLevels.some((level) => level !== null && level > 1)).toBe(true);

    const path = join(sandbox, 'composed.docx');
    await composeManuscriptDocx(path, HEADING_EXCERPT);
    const composed = await shapeOf(path);
    expect(composed.parsed.blockCount).toBe(HEADING_EXCERPT.blocks);
    expect(composed.kinds).toEqual(expectedKinds);
    expect(composed.levels).toEqual(expectedLevels);
    // The title is the request's, never the source's, so a test may still pin the title it asked for.
    expect(composed.parsed.titleSuggestion).toEqual({ value: TITLE, sourceLabel: 'DOCX 标题元数据' });
    // Composed packaging keeps the generated helper's clean fidelity, which is why the service call
    // sites that switch to it keep the import-review sequence they already had.
    expect(deriveImportFidelityPlan(composed.parsed.fidelity, composed.parsed.sourceDigest, composed.parsed.archiveBytes))
      .toEqual({ outcome: 'clean-import-no-round-trip', degradations: [] });
  });

  it('refuses an excerpt that runs past the end of its source', async () => {
    // Far past any admitted source's block count, so the case pins the refusal and not a source length.
    await expect(composeManuscriptDocx(join(sandbox, 'past-end.docx'), { ...EXCERPT, blocks: 10_000 }))
      .rejects.toThrow(/composed excerpt out of range/u);
  });
});
