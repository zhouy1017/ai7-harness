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
  assert.equal(captured.at(-1).cause, 'eof');
  assert.equal(Buffer.concat(captured.filter(r => r.kind === 'response-chunk').map(r => Buffer.from(r.bytesBase64, 'base64'))).toString(), source.join(''));
  assert.doesNotMatch(raw, /QUERY_SENTINEL|HEADER_SENTINEL|RESPONSE_SENTINEL|Authorization/);
  for (let i = 0; i < captured.length; i++) {
    const { sha256, ...record } = captured[i];
    assert.equal(sha256, createHash('sha256').update(JSON.stringify(record)).digest('hex'));
    assert.equal(record.previousSha256, i === 0 ? null : captured[i - 1].sha256);
  }
  const empty = temporary();
  const noBody = recordDevelopmentFetch({ directory: empty, context: identity, fetch: async () => new Response(null, { status: 204 }) });
  await noBody('https://example.test');
  assert.equal(rows(empty).at(-1).cause, 'no-body');
});

test('distinguishes cancellation, read and transport failure without capturing exception prose', async () => {
  const failed = temporary(), cancelled = temporary();
  const fetch = recordDevelopmentFetch({ directory: failed, context: identity, fetch: async () => { throw Error('SECRET_SENTINEL'); } });
  await assert.rejects(fetch('https://example.test'), /SECRET_SENTINEL/);
  assert.equal(rows(failed).at(-1).outcome, 'unknown');
  assert.equal(rows(failed).at(-1).cause, 'transport-error');
  assert.doesNotMatch(JSON.stringify(rows(failed)), /SECRET_SENTINEL/);
  const stream = recordDevelopmentFetch({ directory: cancelled, context: identity,
    fetch: async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array([1])); } })) });
  const response = await stream('https://example.test');
  await response.body.cancel({ name: 'CANCEL_SECRET_SENTINEL', code: 'CANCEL_CODE_SECRET_SENTINEL' });
  assert.equal(rows(cancelled).at(-1).outcome, 'unknown');
  assert.equal(rows(cancelled).at(-1).cause, 'consumer-cancelled');
  assert.equal(rows(cancelled).at(-1).nativeError, undefined);
  assert.doesNotMatch(JSON.stringify(rows(cancelled)), /CANCEL_.*SENTINEL/);
  const aborted = temporary(), abort = Object.assign(Error('ABORT_SECRET_SENTINEL'), { name: 'AbortError', code: 'ABORT_ERR' });
  const abortFetch = recordDevelopmentFetch({ directory: aborted, context: identity, fetch: async () => { throw abort; } });
  await assert.rejects(abortFetch('https://example.test'), error => error === abort);
  assert.equal(rows(aborted).at(-1).errorClass, 'aborted');
  assert.deepEqual(rows(aborted).at(-1).nativeError, { name: 'AbortError', code: 'ABORT_ERR', causes: [] });
  const broken = temporary();
  const streamError = recordDevelopmentFetch({ directory: broken, context: identity,
    fetch: async () => new Response(new ReadableStream({ start(c) { c.error(Error('READ_SECRET_SENTINEL')); } })) });
  await assert.rejects((await streamError('https://example.test')).text(), /READ_SECRET_SENTINEL/);
  assert.equal(rows(broken).at(-1).outcome, 'unknown');
  assert.equal(rows(broken).at(-1).cause, 'read-error');
  assert.doesNotMatch(JSON.stringify(rows(broken)), /READ_SECRET_SENTINEL/);
});

test('rejects repository recording and non-admitted input before any send', async () => {
  assert.throws(() => externalRecordingDirectory(join(process.cwd(), '.cache', 'recorder-refused')), /repository-path/);
  let calls = 0;
  const fetch = recordDevelopmentFetch({ directory: temporary(), context: () => ({ caseId: 'x', material: 'private' }),
    fetch: async () => { calls++; return new Response(''); } });
  await assert.rejects(fetch('https://example.test'), /material-scope/);
  assert.equal(calls, 0);
});

test('records recognized native transport codes without exception prose and rethrows the same error', async () => {
  const directory = temporary();
  const socket = Object.assign(Error('SOCKET_SENTINEL'), { code: 'ECONNRESET' });
  const cause = Object.assign(Error('CONNECT_SENTINEL', { cause: socket }), { name: 'ConnectTimeoutError', code: 'UND_ERR_CONNECT_TIMEOUT' });
  const failure = Object.assign(new TypeError('MESSAGE_SENTINEL', { cause }), {
    stack: 'STACK_SENTINEL', headers: { authorization: 'HEADER_SENTINEL' }, url: 'https://URL_SENTINEL',
  });
  const fetch = recordDevelopmentFetch({ directory, context: identity, fetch: async () => { throw failure; } });
  await assert.rejects(fetch('https://example.test'), error => error === failure);
  const captured = rows(directory), outcome = captured.at(-1);
  assert.equal(outcome.outcome, 'unknown');
  assert.equal(outcome.cause, 'transport-error');
  assert.equal(outcome.errorClass, 'transport-error');
  assert.deepEqual(outcome.nativeError, { name: 'TypeError', code: 'unclassified', causes: [
    { name: 'ConnectTimeoutError', code: 'UND_ERR_CONNECT_TIMEOUT' }, { name: 'Error', code: 'ECONNRESET' },
  ] });
  assert.doesNotMatch(JSON.stringify(captured), /SENTINEL|"(?:message|stack|headers|url)"/);
});

test('classifies unknown values without coercion, bounds causes and keeps hostile errors intact', async () => {
  const deepest = Object.assign(Error('DEPTH_SENTINEL'), { code: 'ETIMEDOUT' });
  let beyondLimit = 0;
  Object.defineProperty(deepest, 'cause', { get() { beyondLimit++; throw Error('TOO_DEEP_SENTINEL'); } });
  const deep = new TypeError('ROOT_SENTINEL', { cause: Error('CAUSE_SENTINEL', { cause: deepest }) });
  const hostile = { get name() { throw Error('GETTER_SENTINEL'); },
    code: { toString() { throw Error('COERCION_SENTINEL'); } }, get cause() { throw Error('CAUSE_GETTER_SENTINEL'); } };
  const cyclic = { name: 'NAME_SENTINEL', code: 'CODE_SENTINEL' }; cyclic.cause = cyclic;
  for (const failure of [deep, hostile, cyclic, 'PRIMITIVE_SENTINEL', undefined]) {
    const directory = temporary();
    const fetch = recordDevelopmentFetch({ directory, context: identity, fetch: async () => { throw failure; } });
    await assert.rejects(fetch('https://example.test'), error => error === failure);
    const metadata = rows(directory).at(-1).nativeError;
    assert.ok(metadata);
    assert.ok(metadata.causes.length <= 2);
    if (failure === deep) assert.deepEqual(metadata.causes.at(-1), { name: 'Error', code: 'ETIMEDOUT' });
    else assert.deepEqual(metadata, { name: 'unclassified', code: 'unclassified',
      causes: failure === cyclic ? Array.from({ length: 2 }, () => ({ name: 'unclassified', code: 'unclassified' })) : [] });
    assert.doesNotMatch(JSON.stringify(rows(directory)), /SENTINEL/);
  }
  assert.equal(beyondLimit, 0);
});

test('retains partial stream hashes and original read error with safe native metadata', async () => {
  const directory = temporary(), bytes = new TextEncoder().encode('synthetic partial response');
  const failure = Object.assign(Error('READ_SENTINEL'), { name: 'SocketError', code: 'UND_ERR_SOCKET' });
  let sent = false, fail;
  const gate = new Promise(resolve => { fail = resolve; });
  const fetch = recordDevelopmentFetch({ directory, context: identity, fetch: async () => new Response(
    new ReadableStream({ pull(controller) {
      if (!sent) { sent = true; controller.enqueue(bytes); }
      else return gate.then(() => controller.error(failure));
    } }), { status: 206 }) });
  const response = await fetch('https://example.test'), reader = response.body.getReader();
  assert.deepEqual((await reader.read()).value, bytes);
  fail();
  await assert.rejects(reader.read(), error => error === failure);
  const captured = rows(directory), outcome = captured.at(-1);
  assert.equal(captured.find(row => row.kind === 'response').status, 206);
  assert.equal(outcome.outcome, 'unknown');
  assert.equal(outcome.cause, 'read-error');
  assert.equal(outcome.chunks, 1);
  assert.equal(outcome.responseBodySha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(outcome.nativeError, { name: 'SocketError', code: 'UND_ERR_SOCKET', causes: [] });
  assert.doesNotMatch(JSON.stringify(captured), /READ_SENTINEL/);
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
