/** Local manual development capture. Never enabled by customer production or CI. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Brave's public search input is necessary to identify a future mock case. Unknown parameters,
// including Gemini's credential query, remain omitted rather than guessing which values are safe.
const PUBLIC_SEARCH_PARAMETERS = new Set(['q', 'count', 'offset', 'safesearch', 'search_lang',
  'country', 'result_filter', 'spellcheck', 'freshness', 'text_decorations', 'extra_snippets']);
// Exact native enums only: arbitrary error names/codes may themselves contain protected data.
const NATIVE_ERROR_NAMES = new Set(['Error', 'TypeError', 'AggregateError', 'AbortError', 'TimeoutError',
  'ConnectTimeoutError', 'HeadersTimeoutError', 'BodyTimeoutError', 'SocketError']);
const NATIVE_ERROR_CODES = new Set(['ABORT_ERR', 'ECONNABORTED', 'ECONNREFUSED', 'ECONNRESET',
  'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_ABORTED', 'UND_ERR_SOCKET']);

function errorProperty(error, property) {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  try { return error[property]; } catch { return undefined; }
}

function nativeErrorMetadata(error) {
  const classified = (value) => {
    const name = errorProperty(value, 'name'), code = errorProperty(value, 'code');
    return { name: NATIVE_ERROR_NAMES.has(name) ? name : 'unclassified',
      code: NATIVE_ERROR_CODES.has(code) ? code : 'unclassified' };
  };
  const result = { ...classified(error), causes: [] };
  // Two cause links, including cycles; never inspect the last node's further cause.
  for (let depth = 0; depth < 2; depth++) {
    error = errorProperty(error, 'cause');
    if (error === undefined || error === null) break;
    result.causes.push(classified(error));
  }
  return result;
}

/** Resolve links before requiring a durable location outside every Git checkout/worktree. */
export function externalRecordingDirectory(input) {
  const directory = resolve(input);
  let ancestor = directory;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  let current = realpathSync(ancestor);
  for (;;) {
    if (existsSync(join(current, '.git'))) throw Error('DEVELOPMENT_RECORDING/repository-path');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  mkdirSync(directory, { recursive: true });
  return realpathSync(directory);
}

/**
 * Decorate the captured native fetch before proxyAwareFetch: the proxy still owns admission and
 * public error sanitization, and invokes this recorder only inside its admitted token.run path.
 * Wrapping proxyAwareFetch instead observes sanitized errors and cannot recover native causes;
 * historical outer-proxy captures retain that limitation and are never backfilled.
 * Context comes from the admitted manual run's
 * existing case/binding owner (source ranges, route/model/protocol, source/config/prompt hashes).
 * Request/response headers, credential resolution and exception prose are deliberately absent.
 * ProviderResultCache remains the owner of exact replay; this records only actual transmissions.
 */
export function recordDevelopmentFetch({ directory, context, fetch: transport }) {
  const root = externalRecordingDirectory(directory);
  return async (url, init = {}) => {
    const identity = context();
    if (identity.material !== 'admitted-public-samplebooks' || !identity.caseId) {
      throw Error('DEVELOPMENT_RECORDING/material-scope');
    }
    if (init.body !== undefined && typeof init.body !== 'string') {
      throw Error('DEVELOPMENT_RECORDING/request-body');
    }
    const target = new URL(String(url));
    const requestQuery = target.hostname === 'api.search.brave.com'
      ? [...target.searchParams].filter(([name]) => PUBLIC_SEARCH_PARAMETERS.has(name)) : [];
    const id = randomUUID(), path = join(root, id + '.jsonl');
    let previous = null, sequence = 0;
    const record = (event) => {
      const value = { schema: 'ai7.local-development-call/1', callId: id, sequence: ++sequence,
        at: new Date().toISOString(), previousSha256: previous, ...event };
      const canonical = JSON.stringify(value);
      previous = hash(canonical);
      appendFileSync(path, JSON.stringify({ ...value, sha256: previous }) + '\n', { mode: 0o600 });
    };
    // Explicit context fields keep accidental transport configuration/secret objects out of captures.
    const { caseId, sourceRanges, sourceCommit, sourceTree, configurationTree, promptContractDigest,
      route, model, protocol, sourceSha256, replayLineage } = identity;
    writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
    record({ kind: 'request', transmission: 'newly-transmitted', material: identity.material,
      caseId, sourceRanges, sourceCommit, sourceTree, configurationTree, promptContractDigest,
      route, model, protocol, sourceSha256, replayLineage,
      // Only known public search parameters survive; no complete credential-bearing URL is retained.
      endpoint: target.origin + target.pathname, method: init.method ?? 'GET',
      requestQuery, omittedQueryParameters: [...target.searchParams].length - requestQuery.length,
      requestBody: init.body ?? null, requestBodySha256: hash(init.body ?? '') });
    let response;
    try { response = await transport(url, init); }
    catch (error) {
      const nativeError = nativeErrorMetadata(error);
      record({ kind: 'outcome', outcome: 'unknown', cause: 'transport-error',
        errorClass: nativeError.name === 'AbortError' ? 'aborted' : 'transport-error', nativeError });
      throw error;
    }
    record({ kind: 'response', status: response.status });
    if (response.body === null) {
      record({ kind: 'outcome', outcome: 'received', cause: 'no-body', chunks: 0, responseBodySha256: hash('') });
      return response;
    }
    const reader = response.body.getReader(), bodyHash = createHash('sha256');
    let chunks = 0, settled = false;
    const finish = (outcome, cause, error) => {
      if (settled) return;
      settled = true;
      record({ kind: 'outcome', outcome, cause, chunks, responseBodySha256: bodyHash.digest('hex'),
        ...(cause === 'read-error' ? { nativeError: nativeErrorMetadata(error) } : {}) });
    };
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { finish('received', 'eof'); controller.close(); return; }
          bodyHash.update(next.value);
          record({ kind: 'response-chunk', ordinal: ++chunks,
            bytesBase64: Buffer.from(next.value).toString('base64'), chunkSha256: hash(next.value) });
          controller.enqueue(next.value);
        } catch (error) { finish('unknown', 'read-error', error); controller.error(error); }
      },
      async cancel(reason) { finish('unknown', 'consumer-cancelled'); await reader.cancel(reason); },
    });
    const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    // Web fetch consumers may use the final URL/redirect state; these are exposed, never persisted.
    for (const property of ['url', 'redirected', 'type']) Object.defineProperty(wrapped, property, { value: response[property] });
    return wrapped;
  };
}
