import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { platformToolCallOnce, transmitOnce, type LiveModelFetch } from '../../src/service/provider/live-transmission.js';
import { PROVIDER_LEDGER_FILE, ProviderResultCache } from '../../src/service/provider/provider-result-cache.js';
import { ResearchSnapshotCache } from '../../src/service/provider/research-snapshot-cache.js';

// The shared once-only transmission (Issue #473, S87-f3a): the analysis path's S40 items and lines are byte-identical
// after the extraction, the ledger names S87 and S17c items beside S40's, and a platform-tool call is sent once and
// answered from the Research Snapshot Cache after. Stub transports only; the roots are temporary directories.

const CONTRACT = 'a'.repeat(64);
let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai7-live-transmission-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function modelFetch(calls: string[], status = 200): LiveModelFetch {
  return async (_url, init) => {
    calls.push(init.body);
    return { status, json: async () => ({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }) };
  };
}

async function rawLedger(): Promise<string[]> {
  return (await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8')).split('\n').filter((line) => line.length > 0);
}

describe('transmitOnce', () => {
  it('writes the S40 model-call line exactly as the analysis path always has, and replays an identical request', async () => {
    const cache = new ProviderResultCache(root);
    await cache.open();
    const calls: string[] = [];
    const init = { method: 'POST' as const, headers: { authorization: 'Bearer placeholder' }, body: '{"model":"deepseek-v4-flash"}' };
    const first = await transmitOnce(cache, modelFetch(calls), { purpose: 'first-baseline', promptContractDigest: CONTRACT }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', 'https://x.invalid', init);
    expect(first.status).toBe(200);
    const second = await transmitOnce(cache, modelFetch(calls), { purpose: 'first-baseline', promptContractDigest: CONTRACT }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', 'https://x.invalid', init);
    expect(await second.json()).toEqual(await first.json());
    expect(calls).toHaveLength(1);
    const lines = (await rawLedger()).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.map((line) => line.itemId)).toEqual(['S40/first-baseline/1', 'S40/first-baseline/2']);
    expect(lines.map((line) => line.outcome)).toEqual(['transmitted', 'replayed']);
    // The key set of a model-call line is the one it always had: no `kind`, no new field.
    expect(Object.keys(lines[0]!).sort()).toEqual(['itemId', 'model', 'outcome', 'promptContractDigest', 'purpose', 'recordedAt', 'requestDigest', 'status', 'usage']);
    expect(JSON.stringify(lines)).not.toContain('placeholder');
  });

  it('mints an item under a named slice and records a limit as quota-exhausted', async () => {
    const cache = new ProviderResultCache(root);
    await cache.open();
    const init = { method: 'POST' as const, headers: {}, body: '{"q":1}' };
    await transmitOnce(cache, modelFetch([], 429), { purpose: 'dialogue', slice: 'S17c', promptContractDigest: CONTRACT }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', 'https://x.invalid', init);
    expect(cache.lines).toMatchObject([{ itemId: 'S17c/dialogue/1', outcome: 'failed', status: 429, classification: 'quota-exhausted' }]);
  });

  // Issue #51 (S16c): accepted, and the answer never came back whole. It was sent, so its item is on the ledger with the
  // status it carried — in the line shape the ledger already has, the classification its own — and nothing is cached, so an
  // identical request later transmits again rather than replaying a result nobody saw.
  it('records an accepted request whose answer never came back whole as outcome-unknown, and never caches or replays it', async () => {
    const cache = new ProviderResultCache(root);
    await cache.open();
    const calls: string[] = [];
    const dropped: LiveModelFetch = async (_url, init) => {
      calls.push(init.body);
      return { status: 200, json: async () => { throw new Error('socket hang up'); } };
    };
    const init = { method: 'POST' as const, headers: { authorization: 'Bearer placeholder' }, body: '{"model":"deepseek-v4-flash","n":4}' };
    const first = await transmitOnce(cache, dropped, { purpose: 'first-baseline', promptContractDigest: CONTRACT }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', 'https://x.invalid', init);
    expect(first.status).toBe(200);
    await expect(first.json()).rejects.toThrowError(/AI7_OUTCOME_UNKNOWN/u);
    expect(await readdir(join(root, 'entries'))).toEqual([]);
    const second = await transmitOnce(cache, modelFetch(calls), { purpose: 'first-baseline', promptContractDigest: CONTRACT }, OPENCODE_GO_ROUTE_PROFILE, 'deepseek-v4-flash', 'https://x.invalid', init);
    expect(second.status).toBe(200);
    expect(calls).toHaveLength(2);
    const lines = (await rawLedger()).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.map((line) => [line.itemId, line.outcome, line.status, line.classification ?? null])).toEqual([
      ['S40/first-baseline/1', 'failed', 200, 'outcome-unknown'],
      ['S40/first-baseline/2', 'transmitted', 200, null],
    ]);
    expect(lines[0]!.usage).toBeNull();
    // The S40 line shape is unchanged: the same keys a limit's line carries beside its classification, and nothing else.
    expect(Object.keys(lines[0]!).sort()).toEqual(['classification', 'itemId', 'model', 'outcome', 'promptContractDigest', 'purpose', 'recordedAt', 'requestDigest', 'status', 'usage']);
    expect(JSON.stringify(lines)).not.toContain('placeholder');
  });
});

describe('the ledger across slices and kinds', () => {
  it('reads every line it already carries, names only the closed slice set, and counts model calls apart from tools', async () => {
    const legacy = { itemId: 'S40/smoke/1', purpose: 'smoke', model: 'm', promptContractDigest: CONTRACT, requestDigest: CONTRACT, outcome: 'transmitted', status: 200, usage: null, recordedAt: '2026-09-06T00:00:00.000Z' };
    const tool = { itemId: 'S87/factual-review/1', kind: 'search-call', purpose: 'factual-review', argumentsDigest: CONTRACT, host: 'search.parallel.ai', outcome: 'transmitted', status: 200, resultDigest: CONTRACT, resultBytes: 10, elapsedMs: 5, recordedAt: '2026-10-08T00:00:00.000Z' };
    await writeFile(join(root, PROVIDER_LEDGER_FILE), `${JSON.stringify(legacy)}\n${JSON.stringify(tool)}\n`, 'utf8');
    const cache = new ProviderResultCache(root);
    await cache.open();
    expect(cache.lines.map((line) => line.itemId)).toEqual(['S40/smoke/1', 'S87/factual-review/1']);
    expect(cache.counts()).toEqual({ transmitted: 1, replayed: 0, failed: 0 });
    expect(cache.toolCounts('search-call')).toEqual({ transmitted: 1, replayed: 0, failed: 0 });
    expect(cache.toolCounts('fetch')).toEqual({ transmitted: 0, replayed: 0, failed: 0 });
    expect(cache.nextItemId('smoke')).toBe('S40/smoke/2');
    expect(cache.nextItemId('factual-review', 'S87')).toBe('S87/factual-review/2');
    expect(cache.nextItemId('factual-review')).toBe('S40/factual-review/1');
    expect(() => cache.claimItem('S87/factual-review/1')).toThrowError(/Provider Test Ledger/u);
    expect(() => cache.claimItem('S41/smoke/1')).toThrowError(/<slice>/u);
    expect(() => cache.nextItemId('smoke', 'S41' as never)).toThrowError(/切片/u);
    await writeFile(join(root, PROVIDER_LEDGER_FILE), `${JSON.stringify({ ...tool, kind: 'shell' })}\n`, 'utf8');
    await expect(new ProviderResultCache(root).open()).rejects.toMatchObject({ code: 'PROVIDER_LEDGER_CORRUPT' });
  });
});

const SEARCH_ORIGIN = 'parallel@search.parallel.ai';

describe('platformToolCallOnce', () => {
  async function opened(): Promise<{ cache: ProviderResultCache; snapshots: ResearchSnapshotCache }> {
    const cache = new ProviderResultCache(root);
    await cache.open();
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    return { cache, snapshots };
  }

  it('sends a call once under an S87 item, keeps its snapshot, and answers the identical call from it', async () => {
    const { cache, snapshots } = await opened();
    const bytes = new TextEncoder().encode('{"result":"x"}');
    let sent = 0;
    let authorized = 0;
    const call = {
      authorize: () => { authorized += 1; return 'ok' as const; },
      send: async () => {
        sent += 1;
        return { url: 'https://search.parallel.ai/mcp', status: 200, contentType: 'application/json', bytes, text: '结果' };
      },
    };
    const item = { kind: 'search-call' as const, purpose: 'factual-review', argumentsDigest: 'b'.repeat(64), host: 'search.parallel.ai', origin: SEARCH_ORIGIN };
    let clock = 1_000;
    const first = await platformToolCallOnce(cache, snapshots, item, call, () => (clock += 7));
    expect(first).toMatchObject({ replayed: false, status: 200, snapshot: { text: '结果', url: 'https://search.parallel.ai/mcp', responseBytes: bytes.byteLength } });
    const again = await platformToolCallOnce(cache, new ResearchSnapshotCache(root), item, call);
    expect(again).toMatchObject({ replayed: true, snapshot: { text: '结果' } });
    expect(sent).toBe(1);
    // A replay authorizes nothing: no ticket is redeemed for a call that sends nothing.
    expect(authorized).toBe(1);
    const digest = createHash('sha256').update(bytes).digest('hex');
    expect(cache.lines).toMatchObject([
      { itemId: 'S87/factual-review/1', kind: 'search-call', outcome: 'transmitted', host: 'search.parallel.ai', resultDigest: digest, resultBytes: bytes.byteLength, elapsedMs: 7 },
      { itemId: 'S87/factual-review/2', kind: 'search-call', outcome: 'replayed', resultDigest: digest },
    ]);
    expect(await readFile(join(root, PROVIDER_LEDGER_FILE), 'utf8')).not.toContain('结果');
    // Another service or host never replays this one's answer.
    expect(await snapshots.lookup('search-call', 'exa@mcp.exa.ai', item.argumentsDigest)).toBeNull();
    await platformToolCallOnce(cache, snapshots, { ...item, origin: 'exa@mcp.exa.ai' }, call);
    expect(sent).toBe(2);
  });

  it('claims no item and records nothing when the ticket does not redeem', async () => {
    const { cache, snapshots } = await opened();
    let sent = 0;
    const refused = platformToolCallOnce(cache, snapshots,
      { kind: 'fetch', purpose: 'factual-review', argumentsDigest: 'c'.repeat(64), host: 'example.org', origin: 'webfetch' },
      {
        authorize: () => { throw Object.assign(new Error('refused'), { code: 'PLATFORM_TOOL_TICKET_REFUSED' }); },
        send: async () => { sent += 1; return { url: 'https://example.org/', status: 200, contentType: null, bytes: new Uint8Array(0), text: 'x' }; },
      });
    await expect(refused).rejects.toMatchObject({ code: 'PLATFORM_TOOL_TICKET_REFUSED' });
    expect(sent).toBe(0);
    expect(cache.lines).toEqual([]);
    expect(cache.nextItemId('factual-review', 'S87')).toBe('S87/factual-review/1');
  });

  it('records a sent call on the ledger even when its snapshot cannot be kept, and still hands back the answer', async () => {
    const { cache } = await opened();
    const failing = new ResearchSnapshotCache(root);
    failing.store = async () => { throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); };
    const bytes = new TextEncoder().encode('{"result":"x"}');
    const item = { kind: 'search-call' as const, purpose: 'factual-review', argumentsDigest: 'e'.repeat(64), host: 'search.parallel.ai', origin: SEARCH_ORIGIN };
    const settled = await platformToolCallOnce(cache, failing, item, {
      authorize: () => null,
      send: async () => ({ url: 'https://search.parallel.ai/mcp', status: 200, contentType: 'application/json', bytes, text: '结果' }),
    });
    expect(settled).toMatchObject({ replayed: false, kept: false, status: 200, snapshot: { text: '结果' } });
    expect(cache.lines).toMatchObject([{ itemId: 'S87/factual-review/1', kind: 'search-call', outcome: 'transmitted' }]);
    // The next reader of the ledger sees the item: it is never live again under the same id.
    const reread = new ProviderResultCache(root);
    await reread.open();
    expect(reread.nextItemId('factual-review', 'S87')).toBe('S87/factual-review/2');
  });

  it('keeps nothing from an unusable or failed call, and records it as failed', async () => {
    const { cache, snapshots } = await opened();
    const item = { kind: 'fetch' as const, purpose: 'factual-review', argumentsDigest: 'c'.repeat(64), host: 'example.org', origin: 'webfetch' };
    const unusable = await platformToolCallOnce(cache, snapshots, item,
      { authorize: () => null, send: async () => ({ url: 'https://example.org/', status: 404, contentType: null, bytes: new Uint8Array(0), text: null }) });
    expect(unusable).toMatchObject({ snapshot: null, status: 404, replayed: false });
    await expect(platformToolCallOnce(cache, snapshots, item, { authorize: () => null, send: async () => { throw new Error('boom'); } })).rejects.toThrowError('boom');
    expect(cache.lines.map((line) => [line.itemId, line.outcome])).toEqual([['S87/factual-review/1', 'failed'], ['S87/factual-review/2', 'failed']]);
    expect(await snapshots.lookup('fetch', 'webfetch', item.argumentsDigest)).toBeNull();
  });
});

describe('ResearchSnapshotCache', () => {
  const snapshot = {
    kind: 'fetch' as const, origin: 'webfetch', argumentsDigest: 'd'.repeat(64), url: 'https://example.org/', retrievedAt: '2026-10-08T00:00:00.000Z',
    status: 200, contentType: 'text/plain', responseDigest: createHash('sha256').update('x').digest('hex'), responseBytes: 1,
    bodyBase64: Buffer.from('x').toString('base64'), text: 'x',
  };

  it('refuses to keep bytes that do not match their digest, and keeps nothing half-written', async () => {
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    await expect(snapshots.store({ ...snapshot, responseDigest: 'e'.repeat(64) })).rejects.toMatchObject({ code: 'RESEARCH_SNAPSHOT_DIGEST_MISMATCH' });
    await snapshots.store(snapshot);
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toEqual(snapshot);
    expect((await readdir(snapshots.root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(() => new ResearchSnapshotCache('relative')).toThrowError(/绝对路径/u);
  });

  it('reads a torn, tampered, or foreign entry as a miss, which the next store overwrites', async () => {
    const snapshots = new ResearchSnapshotCache(root);
    await snapshots.open();
    const path = snapshots.entryPath('fetch', 'webfetch', snapshot.argumentsDigest);
    await writeFile(path, '{"kind":"fetch","ori', 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await writeFile(path, JSON.stringify({ ...snapshot, bodyBase64: Buffer.from('y').toString('base64') }), 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await writeFile(path, JSON.stringify({ ...snapshot, text: 7 }), 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await writeFile(path, JSON.stringify({ ...snapshot, origin: 'other' }), 'utf8');
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await snapshots.store(snapshot);
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toEqual(snapshot);
    // An entry that cannot be read at all — here a directory in its place — is a miss too, and the next store replaces it.
    await rm(path, { force: true });
    await mkdir(join(path, 'occupant'), { recursive: true });
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toBeNull();
    await snapshots.store(snapshot);
    expect(await snapshots.lookup('fetch', 'webfetch', snapshot.argumentsDigest)).toEqual(snapshot);
  });
});
