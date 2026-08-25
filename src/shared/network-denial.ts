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
let networkDenialInstalled = false;

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
  replaceCallable(net, 'connect');
  replaceCallable(net, 'createConnection');
  replaceCallable(net, 'createServer');
  replaceCallable(net.Socket.prototype, 'connect');
  replaceCallable(net.Server.prototype, 'listen');
  replaceCallable(tls, 'connect');
  replaceCallable(tls, 'createServer');
  replaceCallable(tls.TLSSocket.prototype, 'connect', denyNetwork, false);
  replaceCallable(dgram, 'createSocket');
  replaceCallable(dgram.Socket.prototype, 'bind');
  replaceCallable(dgram.Socket.prototype, 'connect');
  replaceCallable(dgram.Socket.prototype, 'send');

  for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'] as const) {
    replaceCallable(dns, key);
    replaceCallable(dnsPromises, key);
  }
  for (const key of ['resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'] as const) {
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
  networkDenialInstalled = true;
}
