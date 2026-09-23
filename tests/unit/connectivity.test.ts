import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { NetworkInterfaceInfo } from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALWAYS_ONLINE, controlledConnectivity, hostConnectivity } from '../../src/service/connectivity.js';

// The device's own reading for Connectivity Wait (Issue #502): local and side-effect-free, never a probe, and
// J-04's control that stands in for it.

function address(family: 'IPv4' | 'IPv6', value: string, internal = false): NetworkInterfaceInfo {
  return family === 'IPv4'
    ? { address: value, netmask: '255.255.0.0', family, mac: '00:00:00:00:00:00', internal, cidr: `${value}/16` }
    : { address: value, netmask: 'ffff:ffff:ffff:ffff::', family, mac: '00:00:00:00:00:00', internal, cidr: `${value}/64`, scopeid: 0 };
}

describe('the device\'s own reading', () => {
  it('is online when any interface carries an address that is neither internal nor link-local', () => {
    expect(hostConnectivity({ lo: [address('IPv4', '127.0.0.1', true)], eth0: [address('IPv4', '192.168.1.20')] })).toBe('online');
    expect(hostConnectivity({ eth0: [address('IPv6', '2001:db8::5')] })).toBe('online');
  });

  it('is offline with only loopback, or with an adapter that is up but reached nothing', () => {
    expect(hostConnectivity({})).toBe('offline');
    expect(hostConnectivity({ lo: [address('IPv4', '127.0.0.1', true), address('IPv6', '::1', true)] })).toBe('offline');
    // A link-local address is what an interface assigns itself when no network answered it.
    expect(hostConnectivity({ wifi: [address('IPv4', '169.254.10.4'), address('IPv6', 'fe80::1c2a:3bff:fe4d:5e6f')] })).toBe('offline');
    expect(hostConnectivity({ wifi: undefined as unknown as NetworkInterfaceInfo[] })).toBe('offline');
  });

  it('answers without an argument from this machine\'s own table', () => {
    expect(['online', 'offline']).toContain(hostConnectivity());
  });
});

describe('J-04\'s connectivity control', () => {
  let folder: string;
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'ai7-connectivity-'));
  });
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('reads the file\'s own word at each reading, so one launch can go offline and come back', async () => {
    const path = join(folder, 'connectivity');
    expect(controlledConnectivity(path)).toBe('online');
    await writeFile(path, 'offline\n');
    expect(controlledConnectivity(path)).toBe('offline');
    await writeFile(path, 'online');
    expect(controlledConnectivity(path)).toBe('online');
    await writeFile(path, 'OFFLINE');
    expect(controlledConnectivity(path)).toBe('online');
  });

  it('gives callers without a service a reader that is always online, reaches no network and has a free slot', () => {
    expect(ALWAYS_ONLINE.reading()).toBe('online');
    expect(ALWAYS_ONLINE.reachesNetwork('opencode-go')).toBe(false);
    expect(ALWAYS_ONLINE.slotBusy()).toBe(false);
  });
});
