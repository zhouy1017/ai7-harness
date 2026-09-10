import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local-only manuscript test material (ADR 0079 §5). Slice S88 (#438) narrowed the repository
// admission to exact `sample1.docx`: the five other files the Owner designated through Issue #32
// left the tree, `.gitignore` refuses them, and they remain test material a developer keeps
// locally. A case whose subject only one of them can be — a legacy binary `.doc`, or paragraphs
// carrying real heading styles — reads the local file where the developer keeps it and is skipped
// everywhere else, so the whole ladder is green on a clean checkout. Nothing derived from these
// files ever enters the repository: a skipped case is disclosed, never silently absent, and every
// assertion these cases make is a count or a digest.

/**
 * Where a developer keeps the local-only files. `AI7_LOCAL_SAMPLEBOOKS` names the directory
 * `SampleBooks/README.md` describes; the checkout's own `SampleBooks/`, which now ignores these
 * exact names, is the default, so dropping the files back beside `sample1` is enough.
 */
function localRoot(): string {
  const declared = process.env.AI7_LOCAL_SAMPLEBOOKS;
  if (declared !== undefined && declared.length > 0 && isAbsolute(declared)) return declared;
  return fileURLToPath(new URL('../../SampleBooks/', import.meta.url));
}

/**
 * One local-only file, by the exact name and byte count `SampleBooks/README.md` records for it.
 * The byte count is what makes presence decidable without reading the file, so a suite can gate
 * itself synchronously; identity is still proven by digest inside the cases that run.
 */
export interface LocalOnlyManuscript {
  readonly name: string;
  readonly bytes: number;
}

/** The one legacy binary `.doc`, the only material a `.doc` conversion can be shown on. */
export const LOCAL_ONLY_DOC: LocalOnlyManuscript = Object.freeze({
  name: '3天兽（定稿395870字)##＊.doc',
  bytes: 1_173_504,
});

/** The one file whose blocks carry heading styles, which exact `sample1` does not. */
export const LOCAL_ONLY_HEADING_DOCX: LocalOnlyManuscript = Object.freeze({
  name: '2听漏（定稿368544字）.docx',
  bytes: 631_075,
});

/** The absolute path the developer's copy would occupy. Reading it is a local-only act. */
export function localOnlyPath(manuscript: LocalOnlyManuscript): string {
  return join(localRoot(), manuscript.name);
}

/**
 * True only when a regular file of exactly the recorded size sits at that path, which is what a
 * suite gates on. False everywhere the material is absent — CI, a clean checkout, another host —
 * so the gated cases skip rather than fail.
 */
export function localOnlyAvailable(manuscript: LocalOnlyManuscript): boolean {
  try {
    const metadata = statSync(localOnlyPath(manuscript));
    return metadata.isFile() && metadata.size === manuscript.bytes;
  } catch {
    return false;
  }
}
