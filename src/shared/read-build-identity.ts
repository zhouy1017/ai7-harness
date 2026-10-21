import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentBuildIdentity, parseBuildIdentity, type BuildIdentity } from './build-identity.js';

/** A copied or stale manifest cannot disagree with the identity compiled into the running code. */
export async function readBuiltIdentity(distRoot: string, expected: BuildIdentity = currentBuildIdentity()): Promise<BuildIdentity> {
  let identity: BuildIdentity;
  try { identity = parseBuildIdentity(JSON.parse(await readFile(join(distRoot, 'build-identity.json'), 'utf8'))); }
  catch { throw new Error('AI7_BUILD_IDENTITY_UNAVAILABLE'); }
  if (JSON.stringify(identity) !== JSON.stringify(parseBuildIdentity(expected))) throw new Error('AI7_BUILD_IDENTITY_MISMATCH');
  return identity;
}
