import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { delimiter, dirname, isAbsolute, resolve } from 'node:path';
import {
  MAX_FRAME_BYTES,
  PROVIDER_CACHE_ROOT_ARGUMENT,
  RUN_BUDGET_CEILING_ARGUMENT,
  BACKGROUND_QUIET_ARGUMENT,
  TRUSTED_SCOPE_ARGUMENT,
  type J01ImportControl,
  type J03ForegroundExecutionControl,
  type J04ModelAdapterControl,
  type J08RecoveryControl,
  type ServiceOperation,
  type ServiceOperationMap,
  type ServiceReadiness,
  type ServiceResponse,
  type TrustedLaunchForm,
} from '../shared/protocol.js';

const MAX_PENDING_REQUESTS = 16;
const REQUEST_TIMEOUT_MS = 30_000;
const LONG_REQUEST_TIMEOUT_MS = 10 * 60_000;
// The startup readiness call waits for the service to open a store whose schema work grows with the
// stored manuscript, so it is bounded separately from an ordinary request and never by a deadline
// shorter than the launch wait a caller applies to the window it is starting. A service that fails
// or exits still rejects this call at once, so startup failure remains immediate.
const STARTUP_READY_TIMEOUT_MS = 2 * 60_000;
const SERVICE_STOP_GRACE_MS = 5_000;
const SERVICE_STOP_FORCE_MS = 5_000;

/**
 * How far the service's startup came (Issue #675): `spawned` once its process exists, which the client sees itself, then
 * the steps the service names on its stderr as it enters them, and `stopped` if it stopped before it was ready. Only these
 * fixed lines are read from that stream, and only until the service is ready; everything else on it is discarded as before.
 */
export type ServiceStartupStep = 'spawned' | 'process' | 'store' | 'owners' | 'serving' | 'stopped';
const SERVICE_STARTUP_LINE = /^AI7_SERVICE_(?:STARTUP\/(process|store|owners|serving)|(STOPPED)\/[A-Z][A-Z0-9_]{0,63})$/u;
// A startup line is a few dozen bytes; a longer unfinished line is something else the service said, and is dropped.
const MAX_STARTUP_LINE_BYTES = 128;

/**
 * Main's relay of the service's startup steps (Issue #675): under an E2E Journey only, the same switch as main's own
 * `AI7_STARTUP/` steps, each step one fixed line on main's stderr; otherwise no relay at all, and the service's stderr is
 * discarded as before.
 */
export function journeyStartupRelay(
  env: NodeJS.ProcessEnv,
  write: (line: string) => void,
): ((step: ServiceStartupStep) => void) | undefined {
  if (env.AI7_E2E_JOURNEY === undefined) return undefined;
  return (step) => write(`AI7_SERVICE_STARTUP/${step}\n`);
}

/**
 * How long one request may take before the service is treated as hung and stopped: startup's readiness, the operations
 * whose work grows with a file or a manuscript, and every other request, each as the reason beside it says.
 */
export function requestTimeoutMs(operation: ServiceOperation): number {
  if (operation === 'ready') return STARTUP_READY_TIMEOUT_MS;
  const long =
    operation === 'stageSelectedManuscript' || operation === 'commitNewBookImport' || operation === 'commitSourceImport' ||
    operation === 'commitManuscriptReimport' || operation === 'commitReplacement' ||
    operation === 'saveMilestone' || operation === 'getStartup' || operation === 'getRecoveryComparison' ||
    operation === 'viewRecoveryCandidate' || operation === 'restoreRecovery' ||
    operation === 'authorizeBaselineAnalysis' ||
    // A Review Run's drive loop starts inside these two answers, and it writes at once whatever
    // needs no model: the leads, or a category whose Run finished before a restart.
    operation === 'authorizeReviewRun' || operation === 'continueReviewRun' ||
    // An export renders the whole file for its review, its staging, its preparation and its approval; a timeout
    // would stop the service mid-write and leave its stage behind.
    operation === 'reviewManuscriptExport' || operation === 'stageManuscriptExport' ||
    operation === 'prepareManuscriptExport' || operation === 'approveManuscriptExport' ||
    // A 图书交付包 export (Issue #416, S67b) does the same for every file of the version, one after another.
    operation === 'reviewBookDeliveryPackageExport' || operation === 'prepareBookDeliveryPackageExport' ||
    operation === 'approveBookDeliveryPackageExport' ||
    // 资料库 (Issue #427, S79c) reads a file of up to 1 GiB whole to digest it, and 放入资料库 copies, syncs and checks
    // it; from a slow disk or share that takes minutes, and a timeout would stop the service mid-copy.
    operation === 'previewLibraryMaterial' || operation === 'addLibraryMaterial' ||
    // 导入数据库 (Issue #434, S86c) reads and verifies a whole package for its preview; 替换 and 回退 extract one whole and back
    // the data up as another, and 取消替换 removes the extracted copy: each grows with the data. 合并 (S86d) extracts, opens
    // and checks the package as a store of its own, and backs the data up, likewise.
    operation === 'inspectDatabaseImport' || operation === 'prepareDatabaseReplacement' ||
    operation === 'rollBackDatabaseReplacement' || operation === 'cancelDatabaseReplacement' || operation === 'prepareDatabaseMerge';
  return long ? LONG_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

interface PendingRequest {
  readonly operation: ServiceOperation;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutMs: number;
  timeout: NodeJS.Timeout | undefined;
}

export class ServiceCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceCallError';
  }
}

async function exitsBefore(
  exit: Promise<true>,
  timeoutMs: number,
): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      exit,
      new Promise<false>((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout(false), timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function serviceEnvironment(
  executable: string,
  importControl: J01ImportControl | undefined,
  foregroundExecutionControl: J03ForegroundExecutionControl | undefined,
  recoveryControl: J08RecoveryControl | undefined,
  modelAdapterControl: J04ModelAdapterControl | undefined,
): NodeJS.ProcessEnv {
  const selected: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: '1' };
  if (importControl) selected.AI7_E2E_JOURNEY = 'J-01';
  if (foregroundExecutionControl) selected.AI7_E2E_JOURNEY = 'J-03';
  if (recoveryControl) selected.AI7_E2E_JOURNEY = 'J-08';
  // The model adapter binds J-04's Runs, J-09's (Issue #424), J-10's (Issue #422), J-16's (Issue #423), J-11's (Issue #94) and J-13's,
  // whose unit hold the service admits for J-13 only as itself (Issue #64, S29b); main admitted it for exactly one.
  if (modelAdapterControl) {
    const journey = process.env.AI7_E2E_JOURNEY;
    selected.AI7_E2E_JOURNEY = journey === 'J-09' || journey === 'J-10' || journey === 'J-16' || journey === 'J-11' || journey === 'J-13' ? journey : 'J-04';
  }
  const names =
    process.platform === 'win32'
      ? ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']
      : ['HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) selected[name] = value;
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot || !isAbsolute(systemRoot)) throw new ServiceCallError('SERVICE_LAUNCH_INVALID', '本地业务服务启动参数无效。');
    selected.PATH = [dirname(executable), resolve(systemRoot, 'System32'), resolve(systemRoot)].join(delimiter);
  } else {
    selected.PATH = [dirname(executable), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
  }
  return selected;
}

function readinessIsExact(value: ServiceReadiness): boolean {
  return (
    value.protocolVersion === 110 &&
    value.state === 'ready' &&
    value.runtime.electron === '43.4.1' &&
    value.runtime.node === '24.18.1' &&
    value.runtime.modules === '148' &&
    value.harness.state === 'mounted-dormant' &&
    value.harness.executionReady === false &&
    value.harness.providerFree === true &&
    value.harness.services === 6 &&
    value.harness.serviceSet.join(',') === 'agents,sessions,llm,systemPrompt,tools,agentLoop' &&
    value.harness.configuredAgents === 0 &&
    value.harness.agents === 0 &&
    value.harness.sessions === 0 &&
    value.harness.providers === 0 &&
    value.harness.configurableProviders === 0 &&
    value.harness.tools === 0 &&
    value.harness.assembledTools === 0 &&
    value.harness.renderedPrompt === '' &&
    value.harness.renderedRuntimeContext === ''
  );
}

export class ServiceClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<string, PendingRequest>();
  #stdoutBuffer = Buffer.alloc(0);
  #expectedExit = false;
  #stopped = false;
  #faulted = false;
  #terminalUnexpected = false;
  #unexpectedExit: (() => void) | undefined;
  #endStartupTrace: (() => void) | undefined;

  private constructor(child: ChildProcessWithoutNullStreams, onStartupStep?: (step: ServiceStartupStep) => void) {
    this.#child = child;
    if (onStartupStep === undefined) child.stderr.resume();
    else this.#traceStartup(onStartupStep);
    child.stdout.on('data', (chunk: Buffer) => this.#acceptStdout(chunk));
    child.stdout.on('error', () => this.#fault());
    child.stdin.on('error', () => this.#fault());
    child.on('error', () => this.#fault());
    child.on('exit', () => {
      const unexpected = !this.#expectedExit;
      this.#stopped = true;
      this.#rejectPending(new ServiceCallError('SERVICE_STOPPED', '本地业务服务已停止。'));
      if (unexpected) this.#reportUnexpectedExit();
    });
  }

  static async start(
    executable: string,
    serviceEntry: string,
    dataRoot: string,
    launchForm: TrustedLaunchForm,
    importControl?: J01ImportControl,
    foregroundExecutionControl?: J03ForegroundExecutionControl,
    recoveryControl?: J08RecoveryControl,
    modelAdapterControl?: J04ModelAdapterControl,
    connectivityPath?: string,
    unitHoldPath?: string,
    answerHoldPath?: string,
    onStartupStep?: (step: ServiceStartupStep) => void,
    /** J-09 only (Issue #95, S39): the 后台分析登记 quiet period, in milliseconds, so the Journey waits on progress, not a clock. */
    backgroundQuietMs?: number,
  ): Promise<ServiceClient> {
    if (!isAbsolute(executable) || !isAbsolute(serviceEntry) || !isAbsolute(dataRoot)) {
      throw new ServiceCallError('SERVICE_LAUNCH_INVALID', '本地业务服务启动参数无效。');
    }
    const args = [serviceEntry, '--data-root', dataRoot, '--parent-pid', String(process.pid)];
    // The trusted launch form travels as argv, exactly as main received it; the service re-parses it.
    if (launchForm.trustedOperationalScope !== 'development-ci') args.push(TRUSTED_SCOPE_ARGUMENT, launchForm.trustedOperationalScope);
    if (launchForm.runBudgetCeiling !== null) args.push(RUN_BUDGET_CEILING_ARGUMENT, String(launchForm.runBudgetCeiling));
    if (launchForm.providerCacheRoot !== null) args.push(PROVIDER_CACHE_ROOT_ARGUMENT, launchForm.providerCacheRoot);
    if (importControl) args.push('--j01-import-control', importControl);
    if (foregroundExecutionControl) {
      args.push('--j03-foreground-execution-control', foregroundExecutionControl);
    }
    if (recoveryControl) args.push('--j08-recovery-control', recoveryControl);
    if (modelAdapterControl) args.push('--j04-model-adapter', modelAdapterControl);
    // J-04's connectivity control (Issue #502) rides beside the adapter: the file the Journey writes to go offline.
    if (connectivityPath !== undefined) args.push('--j04-connectivity-path', connectivityPath);
    // J-10's unit hold (Issue #422) rides beside the adapter as well: the file whose number lets units settle.
    if (unitHoldPath !== undefined) args.push('--j10-unit-hold-path', unitHoldPath);
    // J-16's answer hold (Issue #52, S17a) likewise: the file whose number lets a dialogue answer's deltas through.
    if (answerHoldPath !== undefined) args.push('--j16-answer-hold-path', answerHoldPath);
    // J-09's 后台分析登记 pace (Issue #95, S39): a shorter quiet period beside the adapter.
    if (backgroundQuietMs !== undefined) args.push(BACKGROUND_QUIET_ARGUMENT, String(backgroundQuietMs));
    const child = spawn(
      executable,
      args,
      {
        cwd: dirname(serviceEntry),
        env: serviceEnvironment(executable, importControl, foregroundExecutionControl, recoveryControl, modelAdapterControl),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const client = new ServiceClient(child, onStartupStep);
    try {
      const readiness = await client.call('ready', {});
      if (!readinessIsExact(readiness)) throw new ServiceCallError('SERVICE_READINESS_INVALID', '本地业务服务就绪校验失败。');
      client.#endStartupTrace?.();
      return client;
    } catch (error) {
      await client.stop();
      throw error;
    }
  }

  /** Read the service's startup lines from its stderr until it is ready (Issue #675); every other byte is discarded. */
  #traceStartup(onStartupStep: (step: ServiceStartupStep) => void): void {
    const child = this.#child;
    let line = '';
    let overlong = false;
    const read = (chunk: Buffer): void => {
      const parts = chunk.toString('latin1').split('\n');
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index] ?? '';
        if (index < parts.length - 1) {
          const found = overlong ? null : SERVICE_STARTUP_LINE.exec((line + part).replace(/\r$/u, ''));
          if (found !== null) onStartupStep(found[2] === 'STOPPED' ? 'stopped' : (found[1] as ServiceStartupStep));
          line = '';
          overlong = false;
        } else if (!overlong) {
          line += part;
          if (line.length > MAX_STARTUP_LINE_BYTES) {
            line = '';
            overlong = true;
          }
        }
      }
    };
    const spawned = (): void => onStartupStep('spawned');
    child.once('spawn', spawned);
    child.stderr.on('data', read);
    this.#endStartupTrace = () => {
      this.#endStartupTrace = undefined;
      child.off('spawn', spawned);
      child.stderr.off('data', read);
      child.stderr.resume();
    };
  }

  onUnexpectedExit(callback: () => void): void {
    this.#unexpectedExit = callback;
    if (this.#terminalUnexpected) callback();
  }

  call<Operation extends ServiceOperation>(
    operation: Operation,
    input: ServiceOperationMap[Operation]['input'],
  ): Promise<ServiceOperationMap[Operation]['output']> {
    if (this.#stopped || this.#faulted || this.#pending.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new ServiceCallError('SERVICE_UNAVAILABLE', '本地业务服务当前不可用。'));
    }
    const id = randomUUID();
    const payload = Buffer.from(JSON.stringify({ id, op: operation, input }), 'utf8');
    if (payload.length === 0 || payload.length > MAX_FRAME_BYTES) {
      return Promise.reject(new ServiceCallError('SERVICE_REQUEST_TOO_LARGE', '本地业务请求超出安全范围。'));
    }
    const frame = Buffer.allocUnsafe(4 + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, 4);
    return new Promise<ServiceOperationMap[Operation]['output']>((resolve, reject) => {
      const timeoutMs = requestTimeoutMs(operation);
      this.#pending.set(id, {
        operation,
        resolve: (value) => resolve(value as ServiceOperationMap[Operation]['output']),
        reject,
        timeoutMs,
        timeout: undefined,
      });
      this.#armFirstDeadline();
      this.#child.stdin.write(frame, (error) => {
        if (!error) return;
        const pending = this.#pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.#pending.delete(id);
        pending.reject(new ServiceCallError('SERVICE_WRITE_FAILED', '无法写入本地业务服务。'));
        this.#fault();
      });
    });
  }

  /** The service dispatches serially: queued time is not the next operation's execution time. */
  #armFirstDeadline(): void {
    const first = this.#pending.entries().next().value;
    if (first === undefined) return;
    const [id, pending] = first;
    if (pending.timeout !== undefined) return;
    pending.timeout = setTimeout(() => {
      this.#pending.delete(id);
      pending.reject(new ServiceCallError('SERVICE_TIMEOUT', '本地业务服务响应超时。'));
      this.#fault();
    }, pending.timeoutMs);
    pending.timeout.unref();
  }

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#expectedExit = true;
    try {
      if (!this.#faulted) await this.call('shutdown', {});
    } catch {
      // The exact child remains scoped below and is terminated after its grace interval.
    }
    this.#child.stdin.end();
    if (this.#stopped || this.#child.exitCode !== null || this.#child.signalCode !== null) {
      this.#stopped = true;
      return;
    }
    const exited = once(this.#child, 'exit').then(() => true as const);
    if (!(await exitsBefore(exited, SERVICE_STOP_GRACE_MS))) {
      this.#child.kill('SIGKILL');
      if (!(await exitsBefore(exited, SERVICE_STOP_FORCE_MS))) {
        throw new ServiceCallError('SERVICE_STOP_TIMEOUT', '本地业务服务未能在强制终止期限内停止。');
      }
    }
    this.#stopped = true;
  }

  #acceptStdout(chunk: Buffer): void {
    if (this.#faulted) return;
    this.#stdoutBuffer = Buffer.concat([this.#stdoutBuffer, chunk]);
    while (this.#stdoutBuffer.length >= 4) {
      const length = this.#stdoutBuffer.readUInt32BE(0);
      if (length === 0 || length > MAX_FRAME_BYTES) {
        this.#fault();
        return;
      }
      if (this.#stdoutBuffer.length < 4 + length) return;
      const payload = this.#stdoutBuffer.subarray(4, 4 + length);
      this.#stdoutBuffer = this.#stdoutBuffer.subarray(4 + length);
      let response: ServiceResponse;
      try {
        response = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)) as ServiceResponse;
      } catch {
        this.#fault();
        return;
      }
      const pending = this.#pending.get(response.id);
      if (!pending || this.#pending.keys().next().value !== response.id) {
        this.#fault();
        return;
      }
      clearTimeout(pending.timeout);
      this.#pending.delete(response.id);
      if (!response.ok) {
        pending.reject(new ServiceCallError(response.error.code, response.error.message));
      } else if (response.op !== pending.operation) {
        pending.reject(new ServiceCallError('SERVICE_RESPONSE_INVALID', '本地业务服务响应不匹配。'));
        this.#fault();
        return;
      } else {
        pending.resolve(response.result);
      }
      this.#armFirstDeadline();
    }
  }

  #fault(): void {
    if (this.#faulted) return;
    const unexpected = !this.#expectedExit;
    this.#faulted = true;
    this.#expectedExit = true;
    this.#rejectPending(new ServiceCallError('SERVICE_PROTOCOL_FAILED', '本地业务服务边界失效。'));
    this.#child.stdin.destroy();
    this.#child.kill();
    if (unexpected) this.#reportUnexpectedExit();
  }

  #reportUnexpectedExit(): void {
    if (this.#terminalUnexpected) return;
    this.#terminalUnexpected = true;
    this.#unexpectedExit?.();
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
