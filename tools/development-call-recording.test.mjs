import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { externalRecordingDirectory, recordDevelopmentFetch } from './development-call-recording.mjs';
import { archiveDevelopmentCalls } from './archive-development-calls.mjs';

const temporary = () => mkdtempSync(join(tmpdir(), 'ai7-local-recording-test-'));
const identity = () => ({ material: 'admitted-public-samplebooks', caseId: 'synthetic-wire-container',
  sourceCommit: 'a'.repeat(40), sourceSha256: 'b'.repeat(64), sourceRanges: [{ from: 1, to: 2 }],
  route: 'synthetic-local', model: 'no-provider', protocol: 'synthetic-stream' });
const rows = (directory) => readFileSync(join(directory, readdirSync(directory)[0]), 'utf8').trim().split('\n').map(JSON.parse);

test('retains exact synthetic wire chunks/messages and identity, excluding all transport secrets', async () => {
  const directory = temporary(), source = ['data: one\n\n', 'data: two\n\n'];
  // Synthetic transport bytes test the recorder container; no manuscript or provider is involved.
  const fetch = recordDevelopmentFetch({ directory, context: identity, fetch: async () => new Response(
    new ReadableStream({ start(c) { for (const chunk of source) c.enqueue(new TextEncoder().encode(chunk)); c.close(); } }),
    { headers: { 'x-synthetic-secret': 'RESPONSE_SENTINEL' } }) });
  const request = JSON.stringify({ messages: [{ role: 'user', content: 'synthetic container input' }] });
  const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=synthetic+query&key=QUERY_SENTINEL', {
    method: 'POST', body: request, headers: { Authorization: 'HEADER_SENTINEL' } });
  assert.equal(await response.text(), source.join(''));
  const captured = rows(directory), raw = JSON.stringify(captured);
  assert.equal(captured[0].requestBody, request);
  assert.equal(captured[0].caseId, identity().caseId);
  assert.deepEqual(captured[0].requestQuery, [['q', 'synthetic query']]);
  assert.equal(captured[0].omittedQueryParameters, 1);
  assert.equal(captured.at(-1).outcome, 'received');
  assert.equal(Buffer.concat(captured.filter(r => r.kind === 'response-chunk').map(r => Buffer.from(r.bytesBase64, 'base64'))).toString(), source.join(''));
  assert.doesNotMatch(raw, /QUERY_SENTINEL|HEADER_SENTINEL|RESPONSE_SENTINEL|Authorization/);
  for (let i = 0; i < captured.length; i++) {
    const { sha256, ...record } = captured[i];
    assert.equal(sha256, createHash('sha256').update(JSON.stringify(record)).digest('hex'));
    assert.equal(record.previousSha256, i === 0 ? null : captured[i - 1].sha256);
  }
});

test('preserves cancellation and transport failure as unknown without capturing exception prose', async () => {
  const failed = temporary(), cancelled = temporary();
  const fetch = recordDevelopmentFetch({ directory: failed, context: identity, fetch: async () => { throw Error('SECRET_SENTINEL'); } });
  await assert.rejects(fetch('https://example.test'), /SECRET_SENTINEL/);
  assert.equal(rows(failed).at(-1).outcome, 'unknown');
  assert.doesNotMatch(JSON.stringify(rows(failed)), /SECRET_SENTINEL/);
  const stream = recordDevelopmentFetch({ directory: cancelled, context: identity,
    fetch: async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array([1])); } })) });
  const response = await stream('https://example.test');
  await response.body.cancel();
  assert.equal(rows(cancelled).at(-1).outcome, 'unknown');
});

test('rejects repository recording and non-admitted input before any send', async () => {
  assert.throws(() => externalRecordingDirectory(join(process.cwd(), '.cache', 'recorder-refused')), /repository-path/);
  let calls = 0;
  const fetch = recordDevelopmentFetch({ directory: temporary(), context: () => ({ caseId: 'x', material: 'private' }),
    fetch: async () => { calls++; return new Response(''); } });
  await assert.rejects(fetch('https://example.test'), /material-scope/);
  assert.equal(calls, 0);
});

test('archives existing replay lineage and execution records while excluding connection/secret owners', () => {
  const source = temporary(), output = temporary(), cache = join(source, 'cache'), path = join(source, 'store.sqlite');
  mkdirSync(join(cache, 'entries'), { recursive: true });
  writeFileSync(join(cache, 'ledger.jsonl'), '{"outcome":"replayed","incurredUsage":{"inputTokens":0}}\n');
  writeFileSync(join(cache, 'entries', 'capture.json'), '{"requestBody":"synthetic","response":{}}');
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE dialogue_attempts(id TEXT); INSERT INTO dialogue_attempts VALUES('synthetic'); CREATE TABLE model_service_connections(secret TEXT); INSERT INTO model_service_connections VALUES('EXCLUDED_SENTINEL')");
  db.close();
  const result = archiveDevelopmentCalls({ directory: output, material: 'admitted-public-samplebooks', identity: identity(),
    providerCacheRoots: [cache], databases: [path] });
  assert.equal(result.tables, 1);
  assert.equal(result.files, 2);
  const inventory = JSON.parse(readFileSync(join(output, 'inventory.json')));
  assert.equal(inventory.databases[0].tables[0].name, 'dialogue_attempts');
  assert.equal(readFileSync(join(output, 'provider-cache-0/ledger.jsonl'), 'utf8'), readFileSync(join(cache, 'ledger.jsonl'), 'utf8'));
  assert.deepEqual(readdirSync(join(output, 'database-0')), ['dialogue_attempts.jsonl']);
});
