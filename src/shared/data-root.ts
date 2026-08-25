import { mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function requireBoundary(condition: unknown): asserts condition {
  if (!condition) throw new Error('AI7_DATA_ROOT_BOUNDARY_INVALID');
}

function isInside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
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
