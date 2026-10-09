import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE, type EgressBindingFacts } from '../../src/service/provider/egress-gate.js';
import { readPlatformToolsRule, type PlatformToolsRule } from '../../src/service/provider/platform-tools.js';
import type { PlatformToolFetch } from '../../src/service/provider/platform-tool-http.js';
import { PlatformToolSession } from '../../src/service/provider/platform-tool-session.js';
import { ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { ResearchSnapshotCache } from '../../src/service/provider/research-snapshot-cache.js';
import {
  admitTicketHost,
  allowanceAdmitsConnection,
  armHostAllowanceSet,
  armPerTicketHostAdmission,
  installNodeNetworkDenial,
  ticketHostHolds,
} from '../../src/shared/network-denial.js';

// Two concurrent live Runs, each with its own platform-tool session, fetching cited pages at the same time through the
// real per-ticket host admission (#676). Each holds its own ticket: neither fetch is refused because the other holds a
// host, and one Run's release never closes the host the other is still reading. The pages come from stub transports; the
// process's network denial is installed, so nothing here can reach a network. The rule is v7's block, selected by nothing.

armHostAllowanceSet([{ host: 'opencode.ai', port: 443 }, { host: 'search.parallel.ai', port: 443 }]);
armPerTicketHostAdmission();
installNodeNetworkDenial();

const REPO_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PAGE = '<h1>新青年</h1><p>1918 年 5 月号。</p>';
let roots: string[] = [];

beforeEach(() => {
  roots = [];
});

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

async function v7Rule(): Promise<PlatformToolsRule> {
  const document = JSON.parse(await readFile(resolve(REPO_ROOT, 'docs/policies/provider-processing-policy.v7.json'), 'utf8')) as {
    decision: { providerAllowRules: unknown[] };
  };
  return readPlatformToolsRule(document.decision.providerAllowRules[0])!;
}

/** A gate both fetches wait at, so that each is in flight — its host held — while the other is too. */
function barrier(parties: number): { arrive: () => Promise<void> } {
  let arrived = 0;
  let open!: () => void;
  const opened = new Promise<void>((resolveOpen) => { open = resolveOpen; });
  return {
    arrive: async () => {
      arrived += 1;
      if (arrived === parties) open();
      await opened;
    },
  };
}

/** One live Run's session: its own binding, Agent Data Root, cache, and cited page. */
async function run(rule: PlatformToolsRule, digest: string, page: string, fetch: PlatformToolFetch): Promise<PlatformToolSession> {
  const root = await mkdtemp(join(tmpdir(), 'ai7-concurrent-runs-'));
  roots.push(root);
  const binding: EgressBindingFacts = {
    bindingDigest: digest,
    route: LOCAL_DETERMINISTIC_ROUTE,
    model: LOCAL_DETERMINISTIC_MODEL,
    systemPrompt: '合成系统提示。',
    outboundDataCategory: 'public-or-synthetic',
    policy: { operationalScope: 'developer-live', providerProcessingVersion: 'v8', liveTransmissionAllowed: true, authorizedLiveTransmissionCount: 'bounded-by-run' },
    admittedUserMessages: new Set(),
    platformTools: rule,
  };
  const cache = new ProviderResultCache(root);
  await cache.open();
  const snapshots = new ResearchSnapshotCache(root);
  await snapshots.open();
  const session = new PlatformToolSession({
    binding,
    scope: { currentBindingDigest: () => digest, acceptedOutputDigests: new Set(), ceilingState: () => 'within' },
    fetch,
    admitHost: admitTicketHost,
    cache,
    snapshots,
    purpose: 'factual-review',
  });
  session.cite(page);
  session.startUnit();
  return session;
}

describe('two concurrent live Runs fetching through per-ticket admission', () => {
  it('each keeps its own ticket and its own host, on different hosts', async () => {
    const rule = await v7Rule();
    const gate = barrier(2);
    const seenWhileHeld: string[] = [];
    const fetch: PlatformToolFetch = async (url) => {
      await gate.arrive();
      // Both fetches are in flight here: each Run's host is admitted at once, by its own ticket.
      seenWhileHeld.push(`${new URL(url).hostname}:${ticketHostHolds()}:${allowanceAdmitsConnection([{ host: 'example.org', port: 443 }])}:${allowanceAdmitsConnection([{ host: 'example.net', port: 443 }])}`);
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    };
    const first = await run(rule, 'a'.repeat(64), 'https://example.org/source', fetch);
    const second = await run(rule, 'b'.repeat(64), 'https://example.net/source', fetch);
    const signal = new AbortController().signal;
    const [one, two] = await Promise.all([
      first.execute({ callId: 'a1', tool: 'webfetch', arguments: { url: 'https://example.org/source' }, signal }),
      second.execute({ callId: 'b1', tool: 'webfetch', arguments: { url: 'https://example.net/source' }, signal }),
    ]);
    expect(one).toEqual({ text: '# 新青年\n\n1918 年 5 月号。', sourceUrl: 'https://example.org/source' });
    expect(two).toEqual({ text: '# 新青年\n\n1918 年 5 月号。', sourceUrl: 'https://example.net/source' });
    expect(seenWhileHeld.sort()).toEqual(['example.net:2:true:true', 'example.org:2:true:true']);
    expect(ticketHostHolds()).toBe(0);
    expect(allowanceAdmitsConnection([{ host: 'example.org', port: 443 }])).toBe(false);
    expect(allowanceAdmitsConnection([{ host: 'example.net', port: 443 }])).toBe(false);
  });

  it('each keeps its own ticket on the same host, and the first release leaves the host open for the other', async () => {
    const rule = await v7Rule();
    const gate = barrier(2);
    let firstDone!: () => void;
    const firstSettled = new Promise<void>((resolveFirst) => { firstDone = resolveFirst; });
    const seenAfterFirst: Array<[number, boolean]> = [];
    const fetch: PlatformToolFetch = async (url) => {
      await gate.arrive();
      if (url.endsWith('/b')) {
        // The first Run's fetch has finished and released its ticket; this one is still reading the same host.
        await firstSettled;
        seenAfterFirst.push([ticketHostHolds(), allowanceAdmitsConnection([{ host: 'example.org', port: 443 }])]);
      }
      return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    };
    const first = await run(rule, 'a'.repeat(64), 'https://example.org/a', fetch);
    const second = await run(rule, 'b'.repeat(64), 'https://example.org/b', fetch);
    const signal = new AbortController().signal;
    const settled = await Promise.all([
      first.execute({ callId: 'a1', tool: 'webfetch', arguments: { url: 'https://example.org/a' }, signal }).finally(firstDone),
      second.execute({ callId: 'b1', tool: 'webfetch', arguments: { url: 'https://example.org/b' }, signal }),
    ]);
    expect(settled.map((outcome) => outcome.sourceUrl)).toEqual(['https://example.org/a', 'https://example.org/b']);
    expect(seenAfterFirst).toEqual([[1, true]]);
    expect(ticketHostHolds()).toBe(0);
    expect(allowanceAdmitsConnection([{ host: 'example.org', port: 443 }])).toBe(false);
  });
});
