import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOC_CONVERTER_IDENTITY,
  convertDocManuscript,
  isDocConversionRefusal,
} from '../../src/service/doc-manuscript.js';
import { isCleanTracerFidelity, parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import type { ConversionLoss } from '../../src/service/text-manuscript.js';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES } from '../../src/shared/protocol.js';
import { LOCAL_ONLY_DOC, localOnlyAvailable, localOnlyPath } from '../support/local-only-manuscripts.js';

// The subject here is the conversion of a legacy binary Word document, which only a real one can be
// the subject of. ADR 0079 §5 narrowed the repository to exact `sample1`, and no generator for the
// legacy binary format exists, so the one `.doc` is local-only test material: the group below reads
// it where the developer keeps it and skips wherever it is absent, which includes every CI host. It
// speaks of the file in counts and digests alone — no block text, no document title, and no part of
// the file's name enters a test name, an assertion, or a failure message. The synthetic inputs carry
// the refusals, where no real document would say anything a made-up one does not, so the format's
// refusal behavior stays covered on every host.

/** The local-only file, with the identity `SampleBooks/README.md` records for it as history. */
const LOCAL_DOC = localOnlyPath(LOCAL_ONLY_DOC);
const LOCAL_DOC_BYTES = LOCAL_ONLY_DOC.bytes;
const LOCAL_DOC_SHA256 = '931d8035946f7689aaaa25c14c5822f46eedc59d23925081ded7b06618d9e4d2';

/**
 * What this document converts to, at this converter identity. The working representation is a
 * derived object, so its digest is a fact about the converter rather than about the manuscript: it
 * pins reproducibility across runs and across every host that has the local material.
 */
const WORKING_SHA256 = 'ea5068a74444217fbca9ece5ab572933c007b0d8797f0d1cd3f815314a8213a1';
const WORKING_BLOCKS = 5_815;
const WORKING_CHARACTERS = 396_107;

const NO_LOSS: ConversionLoss = {
  inlineStyles: 0,
  commentsRevisions: 0,
  notes: 0,
  tables: 0,
  imagesCaptions: 0,
  sections: 0,
  headersFooters: 0,
};

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ai7-doc-test-'));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Read the working representation back through the product's own DOCX parser. */
async function parseConverted(docx: Uint8Array): Promise<{
  blocks: ParsedDocxBlock[];
  parsed: Awaited<ReturnType<typeof parseDocx>>;
}> {
  const path = join(sandbox, 'working.docx');
  await writeFile(path, docx);
  const blocks: ParsedDocxBlock[] = [];
  // A synthetic display name: the parser reads it only for the title suggestion, and the admitted
  // file's own name is not this suite's to repeat.
  const parsed = await parseDocx(path, '合成来源.doc', (block) => blocks.push(block), undefined, {
    formatIdentified: true,
  });
  return { blocks, parsed };
}

describe('convertDocManuscript', () => {
  it('declares the identity the records name it by', () => {
    expect(DOC_CONVERTER_IDENTITY).toBe('ai7-doc-to-docx/1');
  });

  it('refuses an empty input, a non-OLE input, and an OLE container it cannot read', async () => {
    const encoder = new TextEncoder();
    const oleHeaderOnly = new Uint8Array(512);
    oleHeaderOnly.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
    for (const bytes of [new Uint8Array(0), encoder.encode('这不是旧版 Word 文档。'), oleHeaderOnly]) {
      try {
        await convertDocManuscript(bytes);
        throw new Error('Expected a conversion refusal.');
      } catch (error) {
        expect(isDocConversionRefusal(error)).toBe(true);
        expect((error as Error).message.split(':').slice(1).join(':').length).toBeGreaterThan(0);
      }
    }
  });
});

// Local-only (ADR 0079 §5): a real legacy binary Word document, which the repository no longer
// carries and no generator produces. Absent, the group is skipped rather than weakened.
describe.skipIf(!localOnlyAvailable(LOCAL_ONLY_DOC))('convertDocManuscript on the local-only legacy document', () => {
  it('reads the local document at exactly the identity the records name it by', async () => {
    const bytes = await readFile(LOCAL_DOC);
    expect((await stat(LOCAL_DOC)).size).toBe(LOCAL_DOC_BYTES);
    expect(sha256(bytes)).toBe(LOCAL_DOC_SHA256);
  });

  it('converts the same bytes to the same bytes', async () => {
    const bytes = await readFile(LOCAL_DOC);
    const first = await convertDocManuscript(bytes);
    const second = await convertDocManuscript(bytes);
    expect(sha256(first.docx)).toBe(sha256(second.docx));
    expect(sha256(first.docx)).toBe(WORKING_SHA256);
    expect(first.loss).toEqual(second.loss);
  });

  it('counts what the reader exposes and claims nothing it cannot see', async () => {
    const { loss } = await convertDocManuscript(await readFile(LOCAL_DOC));
    // The reader resolves Word's markers as it extracts, so the body reaches the converter with no
    // marker left to count: every class below is what the parts the reader does expose carried.
    expect(loss).toEqual({ ...NO_LOSS, headersFooters: 1 });
  });

  it('gives the DOCX parser a package it reads inside its own bounds, with no signal of its own', async () => {
    const { docx } = await convertDocManuscript(await readFile(LOCAL_DOC));
    const { blocks, parsed } = await parseConverted(docx);
    expect(parsed.blockCount).toBe(WORKING_BLOCKS);
    expect(parsed.characterCount).toBe(WORKING_CHARACTERS);
    expect(blocks).toHaveLength(WORKING_BLOCKS);
    // Headings are not recoverable from this reader, so every block is a body paragraph.
    expect(blocks.every((block) => block.kind === 'paragraph' && block.level === null)).toBe(true);
    // Every count in the merged review must be the conversion's, which holds only if the parser
    // found nothing of its own in the package the converter wrote.
    expect(isCleanTracerFidelity(parsed.fidelity)).toBe(true);
    const longest = blocks.reduce((total, block) => Math.max(total, block.text.length), 0);
    expect(longest).toBeLessThanOrEqual(Math.min(MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES));
  });
});
