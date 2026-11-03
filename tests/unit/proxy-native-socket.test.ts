import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proxyAwareFetch, parseProxyUrl } from '../../src/service/provider/proxy-setting.js';
import { admitTicketHost, armPerTicketHostAdmission, installNodeNetworkDenial } from '../../src/shared/network-denial.js';

const nativeFetch = globalThis.fetch;
const sockets = new Set<net.Socket>();
let server: net.Server;
let port: number;
let accepted = 0;

beforeAll(async () => {
  // Real Node socket normalization, confined to loopback: this proxy never forwards a request.
  server = net.createServer((socket) => {
    accepted += 1;
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.once('data', () => socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as net.AddressInfo).port;
  armPerTicketHostAdmission();
  installNodeNetworkDenial();
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('production proxy with native socket primitives', () => {
  it('reaches only the ticket-scoped proxy and records its actual CONNECT refusal', async () => {
    const release = admitTicketHost({ host: 'api.search.brave.com', port: 443, ticketId: 'native-proxy-ticket' });
    const transport = proxyAwareFetch(nativeFetch, async () => parseProxyUrl(`http://127.0.0.1:${port}`));
    try {
      await expect(transport('https://api.search.brave.com/never-forwarded')).rejects.toMatchObject({ code: 'AI7_PROXY_UNREACHABLE' });
      expect(accepted).toBe(1);
    } finally { release(); }
    expect(() => net.connect({ host: '127.0.0.1', port })).toThrow();
    await expect(globalThis.fetch('https://api.search.brave.com/never-forwarded')).rejects.toMatchObject({ code: 'AI7_OUTBOUND_NETWORK_DENIED' });
  });
});
