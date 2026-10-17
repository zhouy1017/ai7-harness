/** Pure, allowlisted diagnostics projection. Never accepts a filesystem root to crawl. */
export const DIAGNOSTICS_CHANNELS = {
  listCrashRecords: 'ai7:diagnostics:list-crashes',
  exportDiagnosticsBundle: 'ai7:diagnostics:export',
  revealDiagnosticsLocation: 'ai7:diagnostics:reveal',
} as const;

export const CRASH_KINDS = ['render-process-gone', 'child-process-gone', 'uncaughtException', 'unhandledRejection', 'service-exit'] as const;
export type CrashKind = typeof CRASH_KINDS[number];
export interface CrashRecord {
  instant: string;
  kind: CrashKind;
  reason: string;
  exitCode: number | null;
  appVersion: string;
  dataVersion: number;
  protocol: number;
  platform: string;
  arch: string;
  electron: string;
  uptimeSeconds: number;
  stack: string;
}
export interface DiagnosticsApi {
  listCrashRecords(): Promise<CrashRecord[]>;
  exportDiagnosticsBundle(): Promise<{ state: 'exported' | 'cancelled' }>;
  revealDiagnosticsLocation(): Promise<{ state: 'requested' }>;
}
declare module '../shared/protocol.js' {
  interface RendererApi extends DiagnosticsApi {}
}

const VERSION = /^[0-9]+(?:\.[0-9]+)*(?:[-+][a-zA-Z0-9.-]+)?$/u;
function version(value: unknown): string {
  return typeof value === 'string' && VERSION.test(value) ? value : 'unknown';
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** Retain only frame coordinates. Function names, messages, source excerpts and URLs can carry manuscript bytes.
 * Replacing the entire frame location also covers encoded paths, spaces, UNC paths and query strings. */
export function redactDiagnosticStack(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value.split(/\r?\n/u).slice(0, 100).map((line) => {
    const frame = /^\s*at .+?:(\d{1,9}):(\d{1,9})\)?\s*$/u.exec(line.split('?')[0] ?? '');
    return frame ? `    at <redacted-path>:${frame[1]}:${frame[2]}` : '<redacted>';
  }).join('\n');
}

const REASONS = new Set(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError']);
export function sanitizeCrashRecord(input: Partial<CrashRecord>): CrashRecord {
  const instant = typeof input.instant === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.instant)
    ? input.instant : '1970-01-01T00:00:00.000Z';
  return {
    instant,
    kind: CRASH_KINDS.includes(input.kind!) ? input.kind! : 'uncaughtException',
    reason: REASONS.has(input.reason ?? '') ? input.reason! : '<redacted>',
    exitCode: typeof input.exitCode === 'number' && Number.isInteger(input.exitCode) ? input.exitCode : null,
    appVersion: version(input.appVersion), dataVersion: count(input.dataVersion), protocol: count(input.protocol),
    platform: ['win32', 'darwin', 'linux'].includes(input.platform ?? '') ? input.platform! : 'unknown',
    arch: ['x64', 'arm64'].includes(input.arch ?? '') ? input.arch! : 'unknown',
    electron: version(input.electron), uptimeSeconds: count(input.uptimeSeconds),
    stack: redactDiagnosticStack(input.stack),
  };
}

function safePreferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safePreferences);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/secret|token|key/iu.test(key))
    .map(([key, item]) => [key, safePreferences(item)]));
  // View preferences may contain book IDs; arbitrary strings are not diagnostics metadata.
  if (typeof value === 'string') return '<redacted>';
  return typeof value === 'number' || typeof value === 'boolean' || value === null ? value : null;
}

export interface DiagnosticsInputs {
  facts: Omit<CrashRecord, 'instant' | 'kind' | 'reason' | 'exitCode' | 'stack'> & {
    policySetVersion: string; node: string; locale: string; windowCount: number;
  };
  crashes: readonly Partial<CrashRecord>[];
  preferences: unknown;
  /** Already-collected files only; arbitrary fixture entries are deliberately ignored. No product log files exist. */
  fixtureTree?: Readonly<Record<string, string>>;
}

export function buildDiagnosticsBundle(inputs: DiagnosticsInputs): Readonly<Record<string, string>> {
  const facts = sanitizeCrashRecord(inputs.facts);
  const files: Record<string, string> = {
    'summary.json': JSON.stringify({
      appVersion: facts.appVersion, dataVersion: facts.dataVersion, protocol: facts.protocol,
      policySetVersion: /^v\d+$/u.test(inputs.facts.policySetVersion) ? inputs.facts.policySetVersion : 'unknown',
      platform: facts.platform, arch: facts.arch, electron: facts.electron, node: version(inputs.facts.node),
      locale: /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(inputs.facts.locale) ? inputs.facts.locale : 'unknown',
      uptimeSeconds: facts.uptimeSeconds, windowCount: count(inputs.facts.windowCount),
      preferences: safePreferences(inputs.preferences), logs: '无日志文件',
    }, null, 2),
    'README.txt': 'AI7 本机诊断包\n包含软件、数据、协议与策略集版本、运行环境、脱敏的本机偏好及最多 30 条崩溃记录。\n崩溃记录仅保留错误类别与堆栈坐标；消息、函数名、路径、查询参数及任意文本均已移除。\n无日志文件。AI7 不持久化主进程或服务日志。\n不含数据库、书稿、暂存 DOCX、导出文件、模型缓存、凭据库或密钥文件。\n仅写入所选本机文件夹，不联网、不上传。\n',
  };
  inputs.crashes.slice(-30).map(sanitizeCrashRecord).forEach((record, index) => {
    files[`crashes/${String(index + 1).padStart(2, '0')}-${record.kind}.json`] = JSON.stringify(record, null, 2);
  });
  return files;
}
