/** Source identity, distinct from database schema, wire protocol and CI run provenance. */
export interface BuildIdentity {
  readonly schema: 1;
  readonly softwareVersion: string;
  readonly dataVersion: number;
  readonly buildNumber: number;
  readonly sourceCommit: string;
  readonly dirty: boolean;
}

const CORE = '(?:0|[1-9][0-9]{0,3})';
const PRERELEASE = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const SEMVER = new RegExp(`^${CORE}\\.${CORE}\\.${CORE}(?:-${PRERELEASE}(?:\\.${PRERELEASE})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`, 'u');
export function isSoftwareVersion(value: unknown): value is string {
  // Preserve the existing store/backup version field's 32-character suffix bounds.
  return typeof value === 'string' && value.length <= 64 && SEMVER.test(value) &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,32})?(?:\+[0-9A-Za-z.-]{1,32})?$/u.test(value);
}

/** Closed shape: malformed identities fail, never become Electron's version or build zero. */
export function parseBuildIdentity(value: unknown): BuildIdentity {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI7_BUILD_IDENTITY_INVALID');
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).length !== 6 || entry['schema'] !== 1 || !isSoftwareVersion(entry['softwareVersion']) ||
    !Number.isSafeInteger(entry['dataVersion']) || (entry['dataVersion'] as number) < 1 ||
    !Number.isSafeInteger(entry['buildNumber']) || (entry['buildNumber'] as number) < 1 ||
    typeof entry['sourceCommit'] !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(entry['sourceCommit']) ||
    typeof entry['dirty'] !== 'boolean') throw new Error('AI7_BUILD_IDENTITY_INVALID');
  return Object.freeze({ schema: 1, softwareVersion: entry['softwareVersion'], dataVersion: entry['dataVersion'] as number,
    buildNumber: entry['buildNumber'] as number, sourceCommit: entry['sourceCommit'], dirty: entry['dirty'] });
}

declare const __AI7_BUILD_IDENTITY__: unknown;

/** The build supplies the same validated value to main, service and renderer. No runtime Git access. */
export function currentBuildIdentity(): BuildIdentity {
  if (typeof __AI7_BUILD_IDENTITY__ === 'undefined') throw new Error('AI7_BUILD_IDENTITY_UNAVAILABLE');
  return parseBuildIdentity(__AI7_BUILD_IDENTITY__);
}

export function buildIdentityLine(identity: BuildIdentity): string {
  return `构建 ${identity.buildNumber} · 源码 ${identity.sourceCommit}${identity.dirty ? ' · 本地修改（未提交）' : ''}`;
}

export function requireMatchingVersions(identity: BuildIdentity, versions: { softwareVersion: string; dataVersion: number }): void {
  if (identity.softwareVersion !== versions.softwareVersion || identity.dataVersion !== versions.dataVersion) {
    throw new Error('AI7_BUILD_IDENTITY_MISMATCH');
  }
}
