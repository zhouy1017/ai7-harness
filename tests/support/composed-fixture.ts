import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { LOCAL_ONLY_HEADING_DOCX, localOnlyPath } from './local-only-manuscripts.js';
import { buildSyntheticDocx, type SyntheticDocxParagraph } from './synthetic-docx.js';

// Composed manuscript fixtures for tests whose subject is manuscript content. The builder assembles a
// DOCX at test time from a contiguous excerpt of an admitted Public SampleBook (ADR 0043), read
// through the product's own parser, so a test that reads block text back runs on real prose instead of
// invented text. Nothing leaves `SampleBooks/`: the bytes are returned and written only to the path the
// calling test names under its own temporary root, and a test speaks of the source, the block range,
// and digests and counts rather than of any excerpt's text. A test whose subject is the DOCX container
// itself keeps `./synthetic-docx.js`.

/**
 * The one admitted DOCX Public SampleBook after ADR 0079 §5 narrowed the repository to exact
 * `sample1`: the ADR 0044 compatibility baseline, 97 blocks at parser identity
 * `ai7-docx-fflate-saxes/1`, as the import-verdict table in `SampleBooks/README.md` records. Every
 * composed fixture excerpts it, and the composed container never reproduces its digest.
 */
export const ADMITTED_BASELINE_DOCX = 'sample1.docx';

/**
 * A local-only source, admitted to no repository fixture. Only a case whose subject exact `sample1`
 * cannot be — real heading styles, which `sample1` carries none of — reaches for one, and it skips
 * wherever the material is absent (`./local-only-manuscripts.js`).
 */
export const LOCAL_ONLY_HEADING_SOURCE = LOCAL_ONLY_HEADING_DOCX;

const SAMPLE_BOOKS_ROOT = fileURLToPath(new URL('../../SampleBooks/', import.meta.url));

/** The admitted file itself. Reading it is what ADR 0043 admitted it for; copying it is not admitted. */
export function admittedSourcePath(source: string): string {
  return source === LOCAL_ONLY_HEADING_SOURCE.name
    ? localOnlyPath(LOCAL_ONLY_HEADING_SOURCE)
    : join(SAMPLE_BOOKS_ROOT, source);
}

/**
 * One parse per admitted file per process. The pending promise is what is memoized, so callers that
 * ask for the same source before the first parse settles share it rather than starting a second.
 */
const sourceBlocks = new Map<string, Promise<readonly ParsedDocxBlock[]>>();

function blocksOf(source: string): Promise<readonly ParsedDocxBlock[]> {
  const pending = sourceBlocks.get(source);
  if (pending !== undefined) return pending;
  const path = admittedSourcePath(source);
  const started = (async () => {
    const blocks: ParsedDocxBlock[] = [];
    await parseDocx(path, basename(path), (block) => blocks.push(block));
    return blocks;
  })();
  sourceBlocks.set(source, started);
  return started;
}

export interface ComposedManuscriptRequest {
  /** Exact file name: the admitted constant above, or a local-only source a gated case names. */
  readonly source: string;
  /** 1-based position of the excerpt's first block in the source. */
  readonly startBlock: number;
  /** Length of the contiguous excerpt `[startBlock, startBlock + blocks)`. */
  readonly blocks: number;
  /** `dc:title` of the composed package. Test-authored: no title is ever taken from the source. */
  readonly title: string;
}

function paragraphOf(block: ParsedDocxBlock): SyntheticDocxParagraph {
  if (block.kind === 'paragraph') return { text: block.text };
  return { text: block.text, style: block.kind === 'title' ? 'Title' : `Heading${block.level ?? 1}` };
}

/**
 * Compose one DOCX at `path` from the requested excerpt and return its bytes. The same request yields
 * the same bytes — the excerpt is deterministic and `buildSyntheticDocx` fixes the archive mtime — so a
 * composed digest is stable across runs and processes.
 */
export async function composeManuscriptDocx(
  path: string,
  request: ComposedManuscriptRequest,
): Promise<Uint8Array> {
  const available = await blocksOf(request.source);
  const lastBlock = request.startBlock + request.blocks - 1;
  if (request.startBlock < 1 || request.blocks < 1 || lastBlock > available.length) {
    throw new Error(
      `composed excerpt out of range: blocks ${request.startBlock}-${lastBlock} of ${available.length} in ${request.source}`,
    );
  }
  const excerpt = available.slice(request.startBlock - 1, lastBlock);
  const archive = buildSyntheticDocx({ paragraphs: excerpt.map(paragraphOf), coreTitle: request.title });
  await writeFile(path, archive);
  return archive;
}
