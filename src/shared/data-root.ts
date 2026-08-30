import { lstat, mkdir, opendir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function requireBoundary(condition: unknown): asserts condition {
  if (!condition) throw new Error('AI7_DATA_ROOT_BOUNDARY_INVALID');
}

function isInside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
}

function requireSegment(segment: string): void {
  requireBoundary(segment.length > 0 && segment !== '.' && segment !== '..' && basename(segment) === segment);
}

async function canonicalDataRoot(dataRootInput: string): Promise<string> {
  requireBoundary(isAbsolute(dataRootInput));
  const lexical = resolve(dataRootInput);
  const canonical = await realpath(lexical);
  requireBoundary(samePath(lexical, canonical));
  return canonical;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function canonicalProspectivePath(input: string): Promise<string> {
  let current = resolve(input);
  const missingParts: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...missingParts);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(current);
      requireBoundary(parent !== current);
      missingParts.unshift(basename(current));
      current = parent;
    }
  }
}

/** Resolve aliases before and after creation so business data cannot enter the code checkout. */
export async function createCanonicalExternalDataRoot(dataRootInput: string, codeRootInput: string): Promise<string> {
  requireBoundary(isAbsolute(dataRootInput) && isAbsolute(codeRootInput));
  const codeRoot = await realpath(codeRootInput);
  const prospective = await canonicalProspectivePath(dataRootInput);
  requireBoundary(!isInside(codeRoot, prospective) && !isInside(prospective, codeRoot));
  await mkdir(prospective, { recursive: true });
  const dataRoot = await realpath(prospective);
  requireBoundary(!isInside(codeRoot, dataRoot) && !isInside(dataRoot, codeRoot));
  return dataRoot;
}

/** Create or validate one exact directory chain beneath an already canonical Agent Data Root. */
export async function ensureCanonicalDataDirectory(dataRootInput: string, ...segments: string[]): Promise<string> {
  const dataRoot = await canonicalDataRoot(dataRootInput);
  requireBoundary(segments.length > 0);
  let current = dataRoot;
  for (const segment of segments) {
    requireSegment(segment);
    const candidate = resolve(current, segment);
    requireBoundary(isInside(dataRoot, candidate) && !samePath(dataRoot, candidate));
    if (!(await pathExists(candidate))) await mkdir(candidate);
    const canonical = await realpath(candidate);
    const metadata = await stat(candidate);
    requireBoundary(samePath(canonical, candidate) && isInside(dataRoot, canonical) && metadata.isDirectory());
    current = candidate;
  }
  return current;
}

/** Require every already-existing directory value to resolve to the same canonical owner. */
export async function requireSameCanonicalDataDirectory(
  expectedInput: string,
  ...candidateInputs: string[]
): Promise<void> {
  requireBoundary(isAbsolute(expectedInput) && candidateInputs.length > 0);
  const expected = await realpath(resolve(expectedInput));
  const expectedMetadata = await stat(expected);
  requireBoundary(expectedMetadata.isDirectory());
  for (const candidateInput of candidateInputs) {
    requireBoundary(isAbsolute(candidateInput));
    const candidate = await realpath(resolve(candidateInput));
    const candidateMetadata = await stat(candidate);
    requireBoundary(candidateMetadata.isDirectory() && samePath(candidate, expected));
  }
}

/** Measure a deliberately capped view of product-owned local data without creating an inventory. */
export async function inspectBoundedDataFootprint(
  dataRootInput: string,
): Promise<{ measuredBytes: number; measuredEntries: number; maximumEntries: 128; complete: boolean }> {
  const dataRoot = await canonicalDataRoot(dataRootInput);
  const maximumEntries = 128 as const;
  const pending = [dataRoot];
  let measuredBytes = 0;
  let measuredEntries = 0;
  let complete = true;
  while (pending.length > 0 && measuredEntries < maximumEntries) {
    const directory = pending.shift()!;
    const handle = await opendir(directory);
    for await (const entry of handle) {
      if (measuredEntries >= maximumEntries) {
        complete = false;
        break;
      }
      const candidate = resolve(directory, entry.name);
      requireBoundary(isInside(dataRoot, candidate));
      const metadata = await lstat(candidate);
      measuredEntries += 1;
      if (metadata.isDirectory()) pending.push(candidate);
      else if (metadata.isFile()) measuredBytes = Math.min(Number.MAX_SAFE_INTEGER, measuredBytes + metadata.size);
    }
  }
  if (pending.length > 0 || measuredEntries === maximumEntries) complete = false;
  return { measuredBytes, measuredEntries, maximumEntries, complete };
}

/** Validate an existing file or prove its exact canonical parent before first creation. */
export async function inspectCanonicalDataFile(
  dataRootInput: string,
  parentInput: string,
  fileName: string,
): Promise<{ path: string; exists: boolean }> {
  const dataRoot = await canonicalDataRoot(dataRootInput);
  requireSegment(fileName);
  const parent = resolve(parentInput);
  const canonicalParent = await realpath(parent);
  const parentMetadata = await stat(parent);
  requireBoundary(
    samePath(parent, canonicalParent) &&
      isInside(dataRoot, canonicalParent) &&
      !samePath(dataRoot, canonicalParent) &&
      parentMetadata.isDirectory(),
  );
  const path = resolve(parent, fileName);
  requireBoundary(isInside(dataRoot, path) && !samePath(dataRoot, path));
  if (!(await pathExists(path))) return { path, exists: false };
  const canonical = await realpath(path);
  const metadata = await stat(path);
  requireBoundary(samePath(canonical, path) && isInside(dataRoot, canonical) && metadata.isFile());
  return { path, exists: true };
}
