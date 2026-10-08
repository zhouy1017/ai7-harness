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
 * One host allowance of the developer-live scope (ADR 0065, Issue #272). The service entry arms the
 * model endpoint's under Provider Processing v5, only before the denial is installed, so the denial's
 * own replacements consult the armed set at call time: exactly an armed host and port may open a TLS
 * or TCP connection and resolve its name; every other primitive, host, and port stays denied, and the
 * global `fetch`, HTTP clients, servers, datagrams, and WebSockets are denied regardless.
 */
export interface SingleHostAllowance {
  readonly host: string;
  readonly port: number;
}

const HOSTNAME_SHAPE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u;
/**
 * The policy-declared allowance set (ADR 0080 §7.3, Issue #473): the model endpoint first, then — only under a rule that
 * names the platform tools — the rule's search-service host. Empty while every remote primitive is denied. Armed once,
 * before the install, and never re-armed.
 */
let allowances: ReadonlyArray<SingleHostAllowance> = [];
/**
 * Whether per-ticket host admission is armed. A `webfetch` target is not a host the policy can list — it is bounded by
 * citations, not by a host list (ADR 0079 §4.3) — so it is reached only while one `fetch-public-source` ticket holds it
 * open. Armed before the install, only under a rule naming the platform tools; unarmed, no host can ever be admitted late.
 */
let perTicketAdmissionArmed = false;
/** The one host a redeemed ticket holds open, or `null`. At most one at a time: `maxParallelToolCalls` is 1. */
let ticketHost: SingleHostAllowance | null = null;

function validatedTarget(target: SingleHostAllowance): SingleHostAllowance {
  const host = target.host.toLowerCase();
  if (!HOSTNAME_SHAPE.test(host) || !Number.isSafeInteger(target.port) || target.port < 1 || target.port > 65_535) {
    throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  }
  return { host, port: target.port };
}

/** Whether a host is a name the public network resolves, rather than an address literal or a loopback name. */
function isPublicHostName(host: string): boolean {
  const labels = host.split('.');
  return labels.length >= 2 && !/^[0-9]+$/u.test(labels[labels.length - 1]!) && host !== 'localhost' && !host.endsWith('.localhost');
}

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
  armHostAllowanceSet([target]);
}

/**
 * Arm the policy-declared allowance set: the model endpoint host first, then each host the selected rule names. Must
 * precede `installNodeNetworkDenial()`; a late, repeated, empty, or duplicated arming fails closed and arms nothing.
 */
export function armHostAllowanceSet(targets: ReadonlyArray<SingleHostAllowance>): void {
  if (networkDenialInstalled) throw new Error(NETWORK_ALLOWANCE_LATE_CODE);
  if (allowances.length > 0 || targets.length === 0) throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  const validated = targets.map(validatedTarget);
  if (new Set(validated.map((target) => target.host)).size !== validated.length) throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  allowances = Object.freeze(validated);
}

/** The model endpoint's allowance — the first of the set — or `null` when every remote primitive is denied. */
export function singleHostAllowance(): SingleHostAllowance | null {
  return allowances[0] ?? null;
}

/** The whole armed allowance set, model endpoint first. */
export function hostAllowanceSet(): ReadonlyArray<SingleHostAllowance> {
  return allowances;
}

/** Arm per-ticket host admission for `webfetch`. Must precede the install; a late or repeated arming fails closed. */
export function armPerTicketHostAdmission(): void {
  if (networkDenialInstalled) throw new Error(NETWORK_ALLOWANCE_LATE_CODE);
  if (perTicketAdmissionArmed) throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  perTicketAdmissionArmed = true;
}

/** Whether per-ticket host admission was armed. */
export function perTicketHostAdmissionArmed(): boolean {
  return perTicketAdmissionArmed;
}

/**
 * Hold one public host open for the one fetch a redeemed `fetch-public-source` ticket authorizes, and return the release.
 * Refused unless per-ticket admission was armed before the install, while another ticket holds a host, or for an address
 * literal or loopback name. The release is idempotent and closes exactly the host it opened.
 */
export function admitTicketHost(target: SingleHostAllowance): () => void {
  if (!perTicketAdmissionArmed || ticketHost !== null) throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  const validated = validatedTarget(target);
  if (!isPublicHostName(validated.host)) throw new Error(NETWORK_ALLOWANCE_INVALID_CODE);
  const held = validated;
  ticketHost = held;
  return () => {
    if (ticketHost === held) ticketHost = null;
  };
}

/** Every host and port a connection may address at this instant: the armed set, and the one ticket host if held. */
function admittedTargets(): ReadonlyArray<SingleHostAllowance> {
  return ticketHost === null ? allowances : [...allowances, ticketHost];
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

/** Whether one connection request addresses exactly an admitted host and its port. */
export function allowanceAdmitsConnection(args: readonly unknown[]): boolean {
  const target = connectionTargetOf(args);
  return target !== null && admittedTargets().some((admitted) => target.host === admitted.host && target.port === admitted.port);
}

/** Whether one name lookup names exactly an admitted host. */
export function allowanceAdmitsLookup(args: readonly unknown[]): boolean {
  const hostname = args[0];
  if (typeof hostname !== 'string') return false;
  const name = hostname.toLowerCase();
  return admittedTargets().some((admitted) => admitted.host === name);
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
