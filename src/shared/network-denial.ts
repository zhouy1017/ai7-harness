import dgram from 'node:dgram';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http, { ClientRequest as namedClientRequest, request as namedHttpRequest } from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

export const NETWORK_DENIED_CODE = 'AI7_OUTBOUND_NETWORK_DENIED';
export const NETWORK_ALLOWANCE_LATE_CODE = 'AI7_NETWORK_ALLOWANCE_LATE';
export const NETWORK_ALLOWANCE_INVALID_CODE = 'AI7_NETWORK_ALLOWANCE_INVALID';
let networkDenialInstalled = false;

/**
 * The one single-host allowance of the developer-live scope (ADR 0065, Issue #272). It is armed by
 * the service entry only under Provider Processing v5 and only before the denial is installed, so
 * the denial's own replacements consult it at call time: exactly the armed host and port may open a
 * TLS or TCP connection and resolve their name; every other primitive, host, and port stays denied,
 * and the global `fetch`, HTTP clients, servers, datagrams, and WebSockets are denied regardless.
 */
export interface SingleHostAllowance {
  readonly host: string;
  readonly port: number;
}

const HOSTNAME_SHAPE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u;
let allowance: SingleHostAllowance | null = null;

class OutboundNetworkDeniedError extends Error {
  readonly code = NETWORK_DENIED_CODE;

  constructor() {
    super('Outbound network is disabled for the provider-free J-01 product interval.');
    this.name = 'OutboundNetworkDeniedError';
  }
}

function denyNetwork(): never {
  throw new OutboundNetworkDeniedError();
}

function denyFetch(): Promise<never> {
  return Promise.reject(new OutboundNetworkDeniedError());
}

/** Arm the single-host allowance. Must precede `installNodeNetworkDenial()`; a late or repeated arming fails closed. */
export function armSingleHostAllowance(target: SingleHostAllowance): void {
  if (networkDenialInstalled) throw new Error(NETWORK_ALLOWANCE_LATE_CODE);
  if (allowance !== null) throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  const host = target.host.toLowerCase();
  if (!HOSTNAME_SHAPE.test(host) || !Number.isSafeInteger(target.port) || target.port < 1 || target.port > 65_535) {
    throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  }
  allowance = { host, port: target.port };
}

/** The armed allowance, or `null` when every remote primitive is denied. */
export function singleHostAllowance(): SingleHostAllowance | null {
  return allowance;
}

/** The host and port one `connect` call addresses, as `net`, `tls`, and `Socket.prototype.connect` accept them; IPC paths never resolve. */
export function connectionTargetOf(args: readonly unknown[]): { host: string; port: number } | null {
  const first = args[0];
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/u.test(first))) {
    const port = Number(first);
    const host = typeof args[1] === 'string' ? args[1] : 'localhost';
    return Number.isSafeInteger(port) ? { host: host.toLowerCase(), port } : null;
  }
  if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
    const options = first as Record<string, unknown>;
    if (options['path'] !== undefined) return null;
    const port = typeof options['port'] === 'string' ? Number(options['port']) : options['port'];
    const hostValue = options['host'] ?? options['hostname'] ?? 'localhost';
    if (typeof hostValue !== 'string' || !Number.isSafeInteger(port)) return null;
    return { host: hostValue.toLowerCase(), port: port as number };
  }
  return null;
}

/** Whether one connection request addresses exactly the armed host and port. */
export function allowanceAdmitsConnection(args: readonly unknown[]): boolean {
  if (allowance === null) return false;
  const target = connectionTargetOf(args);
  return target !== null && target.host === allowance.host && target.port === allowance.port;
}

/** Whether one name lookup names exactly the armed host. */
export function allowanceAdmitsLookup(args: readonly unknown[]): boolean {
  const hostname = args[0];
  return allowance !== null && typeof hostname === 'string' && hostname.toLowerCase() === allowance.host;
}

function requireDenied(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === NETWORK_DENIED_CODE) return;
    throw new Error('AI7_NETWORK_DENIAL_PROBE_FAILED');
  }
  throw new Error('AI7_NETWORK_DENIAL_PROBE_FAILED');
}

function requireDescriptor(target: object, key: PropertyKey, required: boolean): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor && 'value' in descriptor && typeof descriptor.value === 'function') return descriptor;
  if (required) throw new Error('AI7_NETWORK_DENIAL_GUARD_MISMATCH');
  return undefined;
}

function replaceCallable(
  target: object,
  key: PropertyKey,
  value: (...args: never[]) => unknown = denyNetwork,
  required = true,
): void {
  const descriptor = requireDescriptor(target, key, required);
  if (!descriptor) return;
  Object.defineProperty(target, key, { ...descriptor, configurable: false, writable: false, value });
}

/** Replace a primitive with a gate that forwards to the original only for an admitted call and denies everything else. */
function gateCallable(target: object, key: PropertyKey, admits: (args: readonly unknown[]) => boolean, required = true): void {
  const descriptor = requireDescriptor(target, key, required);
  if (!descriptor) return;
  const original = descriptor.value as (...args: unknown[]) => unknown;
  const gated = function gatedNetworkPrimitive(this: unknown, ...args: unknown[]): unknown {
    if (admits(args)) return Reflect.apply(original, this, args);
    return denyNetwork();
  };
  Object.defineProperty(target, key, { ...descriptor, configurable: false, writable: false, value: gated });
}

function replaceConstructor(target: object, key: PropertyKey, required = true): void {
  const descriptor = requireDescriptor(target, key, required);
  if (!descriptor) return;
  const denied = new Proxy(descriptor.value as new (...args: never[]) => unknown, {
    apply: denyNetwork,
    construct: denyNetwork,
  });
  Object.defineProperty(target, key, { ...descriptor, configurable: false, writable: false, value: denied });
}

/** Install synchronously before product dependencies can retain any live Node network primitive. */
export function installNodeNetworkDenial(): void {
  if (networkDenialInstalled) return;

  replaceCallable(http, 'request');
  replaceCallable(http, 'get');
  replaceCallable(http, 'createServer');
  replaceConstructor(http, 'ClientRequest');
  replaceCallable(http.Agent.prototype, 'createConnection');
  replaceCallable(https, 'request');
  replaceCallable(https, 'get');
  replaceCallable(https, 'createServer');
  replaceCallable(https.Agent.prototype, 'createConnection');
  replaceCallable(http2, 'connect');
  replaceCallable(http2, 'createServer');
  replaceCallable(http2, 'createSecureServer');
  gateCallable(net, 'connect', allowanceAdmitsConnection);
  gateCallable(net, 'createConnection', allowanceAdmitsConnection);
  replaceCallable(net, 'createServer');
  gateCallable(net.Socket.prototype, 'connect', allowanceAdmitsConnection);
  replaceCallable(net.Server.prototype, 'listen');
  gateCallable(tls, 'connect', allowanceAdmitsConnection);
  replaceCallable(tls, 'createServer');
  gateCallable(tls.TLSSocket.prototype, 'connect', allowanceAdmitsConnection, false);
  replaceCallable(dgram, 'createSocket');
  replaceCallable(dgram.Socket.prototype, 'bind');
  replaceCallable(dgram.Socket.prototype, 'connect');
  replaceCallable(dgram.Socket.prototype, 'send');

  gateCallable(dns, 'lookup', allowanceAdmitsLookup);
  gateCallable(dnsPromises, 'lookup', allowanceAdmitsLookup);
  for (const key of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'] as const) {
    replaceCallable(dns, key);
    replaceCallable(dnsPromises, key);
    replaceCallable(dns.Resolver.prototype, key);
    replaceCallable(dnsPromises.Resolver.prototype, key);
  }

  replaceCallable(globalThis, 'fetch', denyFetch);
  replaceConstructor(globalThis, 'WebSocket');
  replaceConstructor(globalThis, 'EventSource', false);
  syncBuiltinESMExports();
  if (
    http.request !== denyNetwork ||
    namedHttpRequest !== denyNetwork ||
    namedClientRequest !== http.ClientRequest ||
    globalThis.fetch !== denyFetch
  ) {
    throw new Error('AI7_NETWORK_DENIAL_PROBE_FAILED');
  }
  requireDenied(() => Reflect.apply(http.ClientRequest, undefined, [{ host: '127.0.0.1', port: 9 }]));
  requireDenied(() => Reflect.construct(http.ClientRequest, [{ host: '127.0.0.1', port: 9 }]));
  // A host no allowance can name proves the gates deny before any socket or lookup exists.
  requireDenied(() => net.connect({ host: 'ai7-denied.invalid', port: 9 }));
  requireDenied(() => tls.connect({ host: 'ai7-denied.invalid', port: 9 }));
  requireDenied(() => dns.lookup('ai7-denied.invalid', () => undefined));
  networkDenialInstalled = true;
}
