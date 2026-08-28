import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { delimiter, dirname, isAbsolute, resolve } from 'node:path';
import {
  MAX_FRAME_BYTES,
  type J01ImportControl,
  type J08RecoveryControl,
  type ServiceOperation,
  type ServiceOperationMap,
  type ServiceReadiness,
  type ServiceResponse,
} from '../shared/protocol.js';

const MAX_PENDING_REQUESTS = 16;
const REQUEST_TIMEOUT_MS = 30_000;
const LONG_REQUEST_TIMEOUT_MS = 10 * 60_000;

interface PendingRequest {
  readonly operation: ServiceOperation;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
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

function serviceEnvironment(
  executable: string,
  importControl: J01ImportControl | undefined,
  recoveryControl: J08RecoveryControl | undefined,
): NodeJS.ProcessEnv {
  const selected: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: '1' };
  if (importControl) selected.AI7_E2E_JOURNEY = 'J-01';
  if (recoveryControl) selected.AI7_E2E_JOURNEY = 'J-08';
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
    value.protocolVersion === 6 &&
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

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.#child = child;
    child.stderr.resume();
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
    importControl?: J01ImportControl,
    recoveryControl?: J08RecoveryControl,
  ): Promise<ServiceClient> {
    if (!isAbsolute(executable) || !isAbsolute(serviceEntry) || !isAbsolute(dataRoot)) {
      throw new ServiceCallError('SERVICE_LAUNCH_INVALID', '本地业务服务启动参数无效。');
    }
    const args = [serviceEntry, '--data-root', dataRoot, '--parent-pid', String(process.pid)];
    if (importControl) args.push('--j01-import-control', importControl);
    if (recoveryControl) args.push('--j08-recovery-control', recoveryControl);
    const child = spawn(
      executable,
      args,
      {
        cwd: dirname(serviceEntry),
        env: serviceEnvironment(executable, importControl, recoveryControl),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const client = new ServiceClient(child);
    try {
      const readiness = await client.call('ready', {});
      if (!readinessIsExact(readiness)) throw new ServiceCallError('SERVICE_READINESS_INVALID', '本地业务服务就绪校验失败。');
      return client;
    } catch (error) {
      await client.stop();
      throw error;
    }
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
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new ServiceCallError('SERVICE_TIMEOUT', '本地业务服务响应超时。'));
        this.#fault();
      }, operation === 'stageSelectedDocx' || operation === 'commitNewBookImport' || operation === 'commitReplacement' ||
          operation === 'saveMilestone' || operation === 'getStartup' || operation === 'getRecoveryComparison' ||
          operation === 'viewRecoveryCandidate' || operation === 'restoreRecovery'
        ? LONG_REQUEST_TIMEOUT_MS
        : REQUEST_TIMEOUT_MS);
      timeout.unref();
      this.#pending.set(id, {
        operation,
        resolve: (value) => resolve(value as ServiceOperationMap[Operation]['output']),
        reject,
        timeout,
      });
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

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#expectedExit = true;
    try {
      if (!this.#faulted) await this.call('shutdown', {});
    } catch {
      // The exact child remains scoped below and is terminated after its grace interval.
    }
    this.#child.stdin.end();
    if (this.#child.exitCode !== null) {
      this.#stopped = true;
      return;
    }
    const exited = once(this.#child, 'exit').then(() => true);
    const grace = new Promise<false>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5_000);
      timeout.unref();
    });
    if (!(await Promise.race([exited, grace]))) {
      this.#child.kill();
      await once(this.#child, 'exit').catch(() => undefined);
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
      if (!pending) {
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
      } else {
        pending.resolve(response.result);
      }
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
