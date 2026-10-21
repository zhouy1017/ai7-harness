import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentBuildIdentity, IDENTITY_BOUND_OUTPUTS, parseBuildIdentity, type BuildIdentity } from './build-identity.js';

/** A copied or stale manifest cannot disagree with the identity compiled into the running code. */
export async function readBuiltIdentity(distRoot: string, expected: BuildIdentity = currentBuildIdentity()): Promise<BuildIdentity> {
  let identity: BuildIdentity;
  try { identity = parseBuildIdentity(JSON.parse(await readFile(join(distRoot, 'build-identity.json'), 'utf8'))); }
  catch { throw new Error('AI7_BUILD_IDENTITY_UNAVAILABLE'); }
  if (JSON.stringify(identity) !== JSON.stringify(parseBuildIdentity(expected))) throw new Error('AI7_BUILD_IDENTITY_MISMATCH');
  return identity;
}

declare const __AI7_BUILD_OUTPUT_DIGESTS__: unknown;

/** A stale renderer can share the same software/Data Version. Bind actual output bytes without changing IPC. */
export async function readApplicationBuildIdentity(distRoot: string): Promise<BuildIdentity> {
  const identity = await readBuiltIdentity(distRoot);
  if (typeof __AI7_BUILD_OUTPUT_DIGESTS__ === 'undefined') throw new Error('AI7_BUILD_IDENTITY_UNAVAILABLE');
  const value = __AI7_BUILD_OUTPUT_DIGESTS__;
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== IDENTITY_BOUND_OUTPUTS.length) throw new Error('AI7_BUILD_IDENTITY_INVALID');
  const digests = value as Record<string, unknown>;
  for (const path of IDENTITY_BOUND_OUTPUTS) {
    const expected = digests[path];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)) throw new Error('AI7_BUILD_IDENTITY_INVALID');
    let bytes: Buffer;
    try { bytes = await readFile(join(distRoot, path)); }
    catch { throw new Error('AI7_BUILD_IDENTITY_UNAVAILABLE'); }
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('AI7_BUILD_IDENTITY_MISMATCH');
  }
  return identity;
}
