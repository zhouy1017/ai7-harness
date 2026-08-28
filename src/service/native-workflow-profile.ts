import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const PROFILE_RELATIVE_PATH = ['config', 'dsh-profiles', 'manuscript-editorial', 'package.json'] as const;
const NATIVE_PROFILE_ID = 'manuscript-editorial';
const PROFILE_PACKAGE_NAME = '@ai7/manuscript-editorial-profile';
const NATIVE_PROFILE_VERSION = '1.0.0';
const NATIVE_PROFILE_DIGEST = 'fc337a46d41a88a6f4d7bad7fc7b6846fe4b973e84776722ec126906a7b1d3ff';
const PROJECTION_ID = 'ai7.manuscript.editorial.zh-CN';
const PROJECTION_VERSION = '2.0.0';
const PROJECTION_NAME = '基础书稿编辑流程';
const PROJECTION_DIGEST = 'd9c36f1a80f8461001e028bca9b8fc44723e44d1558dfc6f8863af4e47a5b03f';
const LEGACY_PROFILE_DIGEST = '45f4166304bfbfddb9ae159cc0ed0900867f7bd29832ad6f2a0f625de45bc48f';
const WORKFLOW_SCHEMA = 'ai7.native-manuscript-workflow-definition/1';

const PHASES = [
  { id: 'intake', label: '接收与准备' },
  { id: 'source-development', label: '来源建设' },
  { id: 'drafting', label: '起草' },
  { id: 'review-verification', label: '审阅与核查' },
  { id: 'finalization', label: '定稿' },
  { id: 'delivery', label: '交付' },
  { id: 'maintenance', label: '维护' },
] as const;

const LEGACY_DEFINITION = {
  id: 'ai7.manuscript.editorial.zh-CN',
  name: '基础书稿编辑流程',
  version: '1.0.0',
  phases: PHASES.map((phase) => phase.label),
} as const;

export interface BuiltInWorkflowProfile {
  readonly native: {
    readonly id: typeof NATIVE_PROFILE_ID;
    readonly version: typeof NATIVE_PROFILE_VERSION;
    readonly digest: typeof NATIVE_PROFILE_DIGEST;
    readonly bundles: readonly [];
  };
  readonly projection: {
    readonly schema: 'ai7.workflow-profile-projection/1';
    readonly id: typeof PROJECTION_ID;
    readonly name: typeof PROJECTION_NAME;
    readonly version: typeof PROJECTION_VERSION;
    readonly digest: typeof PROJECTION_DIGEST;
    readonly phases: typeof PHASES;
    readonly gates: readonly [];
  };
  readonly legacy: {
    readonly id: typeof LEGACY_DEFINITION.id;
    readonly name: typeof LEGACY_DEFINITION.name;
    readonly version: typeof LEGACY_DEFINITION.version;
    readonly digest: typeof LEGACY_PROFILE_DIGEST;
    readonly definitionJson: string;
  };
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'string' && !value.isWellFormed()) throw new Error('Built-in Profile contains invalid text.');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Built-in Profile contains an unsupported value.');
  return encoded;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requireProfile(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Built-in native DSH Profile validation failed: ${message}`);
}

function validateManifest(value: unknown): void {
  requireProfile(isRecord(value), 'manifest root is invalid');
  requireProfile(hasExactKeys(value, ['name', 'version', 'private', 'description', 'dsh', 'ai7']), 'manifest fields drifted');
  requireProfile(
    value.name === PROFILE_PACKAGE_NAME && value.version === NATIVE_PROFILE_VERSION && value.private === true &&
      value.description === 'Built-in declarative DSH Profile for the AI7 Manuscript editorial workflow.',
    'native identity or package metadata drifted',
  );
  requireProfile(isRecord(value.dsh) && hasExactKeys(value.dsh, ['profile']), 'dsh.profile is missing');
  requireProfile(
    isRecord(value.dsh.profile) && hasExactKeys(value.dsh.profile, ['bundles']) &&
      Array.isArray(value.dsh.profile.bundles) && value.dsh.profile.bundles.length === 0,
    'dsh.profile.bundles must be explicitly empty',
  );
  requireProfile(isRecord(value.ai7) && hasExactKeys(value.ai7, ['workflowDefinition']), 'workflow definition is missing');
  const definition = value.ai7.workflowDefinition;
  requireProfile(
    isRecord(definition) && hasExactKeys(definition, ['schema', 'deliverableFamily', 'phases', 'gates']) &&
      definition.schema === WORKFLOW_SCHEMA && definition.deliverableFamily === 'manuscript' &&
      Array.isArray(definition.gates) && definition.gates.length === 0 && Array.isArray(definition.phases) &&
      canonicalJson(definition.phases) === canonicalJson(PHASES),
    'declarative workflow definition drifted',
  );
}

export async function loadBuiltInManuscriptProfile(codeRoot: string): Promise<BuiltInWorkflowProfile> {
  const manifestPath = resolve(codeRoot, ...PROFILE_RELATIVE_PATH);
  requireProfile(basename(dirname(manifestPath)) === NATIVE_PROFILE_ID, 'native directory identity drifted');
  const canonicalPath = await realpath(manifestPath);
  requireProfile(canonicalPath === manifestPath, 'manifest path was redirected');
  const metadata = await lstat(canonicalPath);
  requireProfile(metadata.isFile() && !metadata.isSymbolicLink(), 'manifest is not an exact regular file');
  const bytes = await readFile(canonicalPath);
  requireProfile(sha256(bytes) === NATIVE_PROFILE_DIGEST, 'manifest integrity digest drifted');
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error('Built-in native DSH Profile validation failed: manifest is not exact UTF-8 JSON');
  }
  validateManifest(manifest);

  const projectionWithoutDigest = {
    schema: 'ai7.workflow-profile-projection/1',
    id: PROJECTION_ID,
    name: PROJECTION_NAME,
    version: PROJECTION_VERSION,
    phases: PHASES,
    gates: [] as const,
  } as const;
  const legacyDefinitionJson = canonicalJson(LEGACY_DEFINITION);
  requireProfile(
    sha256(canonicalJson(projectionWithoutDigest)) === PROJECTION_DIGEST,
    'AI7 projection identity or canonicalization drifted',
  );
  requireProfile(sha256(legacyDefinitionJson) === LEGACY_PROFILE_DIGEST, 'known legacy projection identity drifted');
  return {
    native: { id: NATIVE_PROFILE_ID, version: NATIVE_PROFILE_VERSION, digest: NATIVE_PROFILE_DIGEST, bundles: [] as const },
    projection: {
      ...projectionWithoutDigest,
      digest: PROJECTION_DIGEST,
    },
    legacy: {
      id: LEGACY_DEFINITION.id,
      name: LEGACY_DEFINITION.name,
      version: LEGACY_DEFINITION.version,
      digest: LEGACY_PROFILE_DIGEST,
      definitionJson: legacyDefinitionJson,
    },
  };
}
