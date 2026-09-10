import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveImportFidelityPlan, parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import {
  ADMITTED_BASELINE_DOCX,
  LOCAL_ONLY_HEADING_SOURCE,
  admittedSourcePath,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { localOnlyAvailable } from '../support/local-only-manuscripts.js';
import { SAMPLE1_BLOCKS, SAMPLE1_SHA256 } from '../support/sample1-baseline.js';

// Unit suite (L1) for the composed-fixture builder. Every assertion is a count, a block kind, a heading
// level, or a digest: no excerpt's text is asserted, named, or printed, so a failing case reports a
// number or a boolean rather than manuscript prose.

const TITLE = '组稿测试标题';
/** The one admitted source (ADR 0079 §5), excerpted short wherever size is not the subject. */
const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 12, title: TITLE };
/**
 * Style mapping needs blocks that carry heading styles, and exact `sample1` carries none: after the
 * narrowing, the only material whose first block is a level-1 heading and whose fourth is a level-3
 * one is local-only, so this one case is gated on the developer having it and skipped everywhere
 * else. No source carries a title block, so `Title` stays unexercised either way.
 */
const HEADING_EXCERPT: ComposedManuscriptRequest = { source: LOCAL_ONLY_HEADING_SOURCE.name, startBlock: 1, blocks: 6, title: TITLE };

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

  it('never reproduces the exact sample1 digest, not even when composing every block of sample1', async () => {
    expect(await composedDigest('excerpt.docx', EXCERPT)).not.toBe(SAMPLE1_SHA256);
    // The whole source, which is the closest a composed package can come to the file it excerpts:
    // the container is the builder's own, so the ADR 0044 baseline's identity stays unreachable.
    expect(await composedDigest('whole.docx', { ...EXCERPT, startBlock: 1, blocks: SAMPLE1_BLOCKS })).not.toBe(SAMPLE1_SHA256);
  });

  it.skipIf(!localOnlyAvailable(LOCAL_ONLY_HEADING_SOURCE))('carries every excerpt block kind and heading level into the composed package', async () => {
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
