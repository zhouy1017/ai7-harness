import { createHash } from 'node:crypto';
import { lstat, mkdir, opendir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function requireBoundary(condition: unknown): asserts condition {
  if (!condition) throw new Error('AI7_DATA_ROOT_BOUNDARY_INVALID');
}

/** Issue #961: the sole admitted development sample, never a packaged or renderer-selected path. */
export async function resolveDevelopmentSampleBook(codeRoot: string, runtimeForm: string): Promise<string> {
  requireBoundary(runtimeForm === 'source-checkout' && isAbsolute(codeRoot));
  const expected = resolve(await realpath(codeRoot), 'SampleBooks', 'sample1.docx');
  requireBoundary(samePath(expected, await realpath(expected)));
  const bytes = await readFile(expected);
  requireBoundary(bytes.length === 29_550 && createHash('sha256').update(bytes).digest('hex') ===
    'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483');
  return expected;
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

/**
 * The developer Provider Result Cache siblings of a checkout (ADR 0067, Issue #808): the directory the developer-live launch
 * defaults to, and the name the #811 brief gives it. Development captures live there and nowhere an ordinary user's data does.
 */
export const DEVELOPMENT_CACHE_SIBLING_DIRECTORIES = ['ai7-harness-provider-cache', 'ai7-provider-cache'] as const;

export function defaultProductionDataRoot({ platform = process.platform, env = process.env, home = homedir() }: {
  platform?: string; env?: Record<string, string | undefined>; home?: string;
} = {}): string {
  if (platform === 'win32') {
    requireBoundary(typeof env['LOCALAPPDATA'] === 'string' && isAbsolute(env['LOCALAPPDATA']));
    return resolve(env['LOCALAPPDATA'], 'ai7', 'production');
  }
  requireBoundary(platform === 'darwin' && isAbsolute(home));
  return resolve(home, 'Library', 'Application Support', 'ai7', 'production');
}

export function startupDataChoiceFile(defaultRoot: string): string {
  requireBoundary(isAbsolute(defaultRoot));
  return resolve(defaultRoot, '..', 'startup-data-location.json');
}

export function requireStartupChoiceOutsideDataRoot(defaultRoot: string, dataRoot: string): void {
  requireBoundary(isAbsolute(dataRoot) && !isInside(resolve(dataRoot), startupDataChoiceFile(defaultRoot)));
}

export async function readStartupDataChoice(defaultRoot: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(startupDataChoiceFile(defaultRoot), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('AI7_STARTUP_CHOICE_INVALID');
  }
  const stored: unknown = JSON.parse(text);
  requireBoundary(typeof stored === 'object' && stored !== null && !Array.isArray(stored));
  const value = stored as Record<string, unknown>;
  requireBoundary(Object.keys(value).length === 2 && value['version'] === 1 && typeof value['dataRoot'] === 'string' && isAbsolute(value['dataRoot']));
  requireStartupChoiceOutsideDataRoot(defaultRoot, value['dataRoot']);
  return resolve(value['dataRoot']);
}

/** Launcher metadata beside the default root, never in the selected product root or its database export. */
export async function storeStartupDataChoice(defaultRoot: string, dataRoot: string): Promise<void> {
  requireStartupChoiceOutsideDataRoot(defaultRoot, dataRoot);
  const path = startupDataChoiceFile(defaultRoot);
  await mkdir(dirname(path), { recursive: true });
  const staged = `${path}.${process.pid}.tmp`;
  await writeFile(staged, `${JSON.stringify({ version: 1, dataRoot: resolve(dataRoot) })}\n`, { flag: 'wx' });
  await rename(staged, path);
}

/**
 * An ordinary-production Agent Data Root (Issue #811): outside the checkout exactly as every data root is — so never under its
 * `.cache` either — and besides that neither equal to, inside, nor containing a developer cache sibling of the checkout, so
 * the production instance can never reach a development capture through its own data.
 */
export async function createCanonicalProductionDataRoot(dataRootInput: string, codeRootInput: string): Promise<string> {
  requireBoundary(isAbsolute(dataRootInput) && isAbsolute(codeRootInput));
  const codeRoot = await realpath(codeRootInput);
  const caches = await Promise.all(DEVELOPMENT_CACHE_SIBLING_DIRECTORIES.map((name) => canonicalProspectivePath(resolve(codeRoot, '..', name))));
  const apart = (candidate: string): boolean => caches.every((cache) => !isInside(cache, candidate) && !isInside(candidate, cache));
  requireBoundary(apart(await canonicalProspectivePath(dataRootInput)));
  const dataRoot = await createCanonicalExternalDataRoot(dataRootInput, codeRoot);
  requireBoundary(apart(dataRoot));
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
