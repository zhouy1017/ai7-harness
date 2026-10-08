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

/** Name suffixes that never resolve on the public network: loopback, mDNS, and the conventional private zones. */
const NON_PUBLIC_NAME_SUFFIXES = ['localhost', 'local', 'internal', 'home.arpa', 'lan', 'intranet', 'corp'] as const;

/**
 * Whether a host is a name the public network resolves, rather than an address literal, a loopback name, or a name in a
 * zone that only a local or private resolver answers. Shared by the URL check of `webfetch` and per-ticket admission.
 */
export function isPublicHostName(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/u, '');
  const labels = name.split('.');
  if (labels.length < 2 || /^[0-9]+$/u.test(labels[labels.length - 1]!)) return false;
  return !NON_PUBLIC_NAME_SUFFIXES.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}

/** The four octets of a dotted IPv4 address, or `null`. */
function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^[0-9]{1,3}$/u.test(part) ? Number(part) : Number.NaN));
  return octets.every((octet) => Number.isInteger(octet) && octet <= 255) ? octets : null;
}

function isPublicIpv4(octets: readonly number[]): boolean {
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this network, RFC 1918, loopback, multicast and reserved
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return false; // link-local, the cloud metadata endpoint included
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC 1918
  if (a === 192 && b === 168) return false; // RFC 1918
  if (a === 192 && b === 0 && octets[2] === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

/** The eight 16-bit groups of an IPv6 address (a trailing dotted IPv4 part included), or `null`. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  const lastColon = text.lastIndexOf(':');
  if (lastColon < 0) return null;
  if (text.slice(lastColon + 1).includes('.')) {
    // A trailing dotted IPv4 part is two groups written another way.
    const octets = ipv4Octets(text.slice(lastColon + 1));
    if (octets === null) return null;
    const hex = (high: number, low: number): string => ((high << 8) | low).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hex(octets[0]!, octets[1]!)}:${hex(octets[2]!, octets[3]!)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':').map((group) => (/^[0-9a-f]{1,4}$/u.test(group) ? Number.parseInt(group, 16) : Number.NaN));
    return groups.every((group) => Number.isInteger(group)) ? groups : null;
  };
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  if (head === null || rest === null) return null;
  const explicit = head.length + rest.length;
  if (halves.length === 1 ? explicit !== 8 : explicit > 7) return null;
  return [...head, ...new Array<number>(8 - explicit).fill(0), ...rest];
}

/**
 * Whether one resolved address is on the public network (ADR 0080 §7.3, the review of #671). Loopback, unspecified,
 * link-local (the cloud metadata endpoint 169.254.169.254 included), RFC 1918 and unique-local, CGNAT, multicast and
 * reserved ranges are not, nor is any IPv6 form that embeds one of them (IPv4-mapped, IPv4-compatible, NAT64, 6to4), nor
 * the transition and special-purpose blocks whose embedding cannot be read off the address (Teredo and the rest of
 * 2001::/23, IPv4-translated, local-use NAT64, site-local, discard-only).
 */
export function isPublicAddress(address: string): boolean {
  const v4 = ipv4Octets(address);
  if (v4 !== null) return isPublicIpv4(v4);
  const groups = ipv6Groups(address);
  if (groups === null) return false;
  const embedded = [(groups[6]! >> 8) & 0xff, groups[6]! & 0xff, (groups[7]! >> 8) & 0xff, groups[7]! & 0xff];
  const zeroPrefix = groups.slice(0, 5).every((group) => group === 0);
  if (zeroPrefix && groups[5] === 0xffff) return isPublicIpv4(embedded); // IPv4-mapped ::ffff:a.b.c.d
  if (zeroPrefix && groups[5] === 0) return false; // `::`, `::1`, and the deprecated IPv4-compatible ::a.b.c.d
  if (groups.slice(0, 4).every((group) => group === 0) && groups[4] === 0xffff && groups[5] === 0) return false; // IPv4-translated ::ffff:0:0/96
  if (groups[0] === 0x2002) {
    // 6to4 2002::/16 carries its IPv4 address in bits 16–47: it is as public as that address.
    return isPublicIpv4([(groups[1]! >> 8) & 0xff, groups[1]! & 0xff, (groups[2]! >> 8) & 0xff, groups[2]! & 0xff]);
  }
  if (groups[0] === 0x2001 && groups[1]! <= 0x01ff) return false; // 2001::/23 IETF protocol assignments, Teredo 2001::/32 among them
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups[2] === 1) return false; // local-use NAT64 64:ff9b:1::/48
  if (groups[0] === 0x100 && groups.slice(1, 4).every((group) => group === 0)) return false; // discard-only 100::/64
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) return isPublicIpv4(embedded); // NAT64
  const first = groups[0]!;
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xffc0) === 0xfec0) return false; // deprecated site-local fec0::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast ff00::/8
  if (first === 0x2001 && groups[1] === 0x0db8) return false; // documentation
  return true;
}

type LookupCallback = (error: Error | null, address?: unknown, family?: number) => void;

/** Every address one lookup answered, whatever its shape: a string, or the `all: true` list of records. */
function lookupAddresses(address: unknown): string[] | null {
  if (typeof address === 'string') return [address];
  if (!Array.isArray(address)) return null;
  const addresses = address.map((entry) => (entry !== null && typeof entry === 'object' ? (entry as { address?: unknown }).address : entry));
  return addresses.every((entry) => typeof entry === 'string') ? (addresses as string[]) : null;
}

/** Whether a lookup's answer may be connected to: at least one address, and every one of them public. */
function lookupAnswerPublic(address: unknown): boolean {
  const addresses = lookupAddresses(address);
  return addresses !== null && addresses.length > 0 && addresses.every(isPublicAddress);
}

/** Whether one lookup names the host a ticket holds open, whose answer must be vetted before any connect uses it. */
function namesTicketHost(args: readonly unknown[]): boolean {
  return ticketHost !== null && typeof args[0] === 'string' && args[0].toLowerCase() === ticketHost.host;
}

/**
 * The gate on the callback `dns.lookup`, given the original (exported so a test can hand it a stub resolver). An
 * unadmitted name is denied before any query. A ticket host's answer is vetted inside the lookup's own callback, which is
 * the answer `net` and `tls` connect to: a name that resolves to any non-public address is denied there, so no connect
 * ever reaches it and nothing re-resolves between the check and the connect.
 */
export function guardedLookup(original: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  return function gatedLookup(this: unknown, ...args: unknown[]): unknown {
    if (!allowanceAdmitsLookup(args)) return denyNetwork();
    if (!namesTicketHost(args)) return Reflect.apply(original, this, args);
    const callbackIndex = args.findIndex((arg) => typeof arg === 'function');
    if (callbackIndex < 0) return denyNetwork();
    const callback = args[callbackIndex] as LookupCallback;
    const vetted = [...args];
    vetted[callbackIndex] = (error: Error | null, address?: unknown, family?: number): void => {
      if (error !== null && error !== undefined) {
        callback(error);
        return;
      }
      if (!lookupAnswerPublic(address)) {
        callback(new OutboundNetworkDeniedError());
        return;
      }
      callback(null, address, family);
    };
    return Reflect.apply(original, this, vetted);
  };
}

/** The same gate on the promise `dns/promises.lookup`. */
export function guardedLookupPromise(original: (...args: unknown[]) => Promise<unknown>): (...args: unknown[]) => Promise<unknown> {
  return function gatedLookupPromise(this: unknown, ...args: unknown[]): Promise<unknown> {
    if (!allowanceAdmitsLookup(args)) return denyNetwork();
    if (!namesTicketHost(args)) return Reflect.apply(original, this, args) as Promise<unknown>;
    return (Reflect.apply(original, this, args) as Promise<unknown>).then((answer) => {
      const address = answer !== null && typeof answer === 'object' && !Array.isArray(answer) ? (answer as { address?: unknown }).address : answer;
      if (!lookupAnswerPublic(address)) throw new OutboundNetworkDeniedError();
      return answer;
    });
  };
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
  if (target === null) return false;
  if (allowances.some((admitted) => target.host === admitted.host && target.port === admitted.port)) return true;
  // A ticket host is reached only through the gated `dns.lookup`, whose answer is vetted: a connect that brings its own
  // `lookup` would resolve the name past that check, so it is denied.
  const options = args[0] !== null && typeof args[0] === 'object' ? (args[0] as Record<string, unknown>) : null;
  return ticketHost !== null && target.host === ticketHost.host && target.port === ticketHost.port && options?.['lookup'] === undefined;
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

/** Replace a primitive with a wrapper built over the original. */
function wrapCallable(target: object, key: PropertyKey, wrap: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown): void {
  const descriptor = requireDescriptor(target, key, true)!;
  Object.defineProperty(target, key, { ...descriptor, configurable: false, writable: false, value: wrap(descriptor.value as (...args: unknown[]) => unknown) });
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

  // The two lookups admit only an armed or ticket-held name, and vet a ticket host's answer before any connect uses it.
  wrapCallable(dns, 'lookup', (original) => guardedLookup(original));
  wrapCallable(dnsPromises, 'lookup', (original) => guardedLookupPromise(original as (...args: unknown[]) => Promise<unknown>));
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
