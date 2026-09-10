import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { buildSyntheticDocx, type SyntheticDocxParagraph } from './synthetic-docx.js';

// Composed manuscript fixtures for tests whose subject is manuscript content. The builder assembles a
// DOCX at test time from a contiguous excerpt of the one admitted Public SampleBook — exact
// `sample1.docx` (ADR 0043 as narrowed by ADR 0079 §5) — read through the product's own parser, so a
// test that reads block text back runs on real prose instead of invented text. Nothing leaves
// `SampleBooks/`: the bytes are returned and written only to the path the calling test names under its
// own temporary root, and a test speaks of the source, the block range, and digests and counts rather
// than of any excerpt's text. A test whose subject is the DOCX container itself keeps
// `./synthetic-docx.js`.

/**
 * Exact `sample1`, the only admitted DOCX Public SampleBook (ADR 0044 compatibility baseline), by
 * exact path under `SampleBooks/`, with the block count the import-verdict table in
 * `SampleBooks/README.md` records for parser identity `ai7-docx-fflate-saxes/1`.
 */
export const ADMITTED_BASELINE_DOCX = 'sample1.docx'; // 97 blocks
/**
 * Local-only test material (ADR 0079 §5): these files left the repository with S88 (#438) and live
 * only in a developer's own untracked `SampleBooks/`. A case that reads one runs only where an exact
 * local copy is present, and a fresh checkout reports it as skipped.
 */
export const ADMITTED_SMALL_DOCX = '蟠虺.docx'; // 100 blocks
/** 4577 blocks; the only file whose blocks carry heading styles, local-only like the small one. */
export const ADMITTED_LARGE_FINAL_DOCX = '2听漏（定稿368544字）.docx';

const SAMPLE_BOOKS_ROOT = fileURLToPath(new URL('../../SampleBooks/', import.meta.url));

/** The admitted file itself. Reading it is what ADR 0043 admitted it for; copying it is not admitted. */
export function admittedSourcePath(source: string): string {
  return join(SAMPLE_BOOKS_ROOT, source);
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
  /** Exact path under `SampleBooks/`; one of the admitted constants above. */
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
