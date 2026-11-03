/** Local manual development capture. Never enabled by customer production or CI. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Brave's public search input is necessary to identify a future mock case. Unknown parameters,
// including Gemini's credential query, remain omitted rather than guessing which values are safe.
const PUBLIC_SEARCH_PARAMETERS = new Set(['q', 'count', 'offset', 'safesearch', 'search_lang',
  'country', 'result_filter', 'spellcheck', 'freshness', 'text_decorations', 'extra_snippets']);

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
 * Decorate the transport already selected by the admitted manual run. Context comes from its
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
      record({ kind: 'outcome', outcome: 'unknown', errorClass: error?.name === 'AbortError' ? 'aborted' : 'transport-error' });
      throw error;
    }
    record({ kind: 'response', status: response.status });
    if (response.body === null) {
      record({ kind: 'outcome', outcome: 'received', chunks: 0, responseBodySha256: hash('') });
      return response;
    }
    const reader = response.body.getReader(), bodyHash = createHash('sha256');
    let chunks = 0, settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      record({ kind: 'outcome', outcome, chunks, responseBodySha256: bodyHash.digest('hex') });
    };
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { finish('received'); controller.close(); return; }
          bodyHash.update(next.value);
          record({ kind: 'response-chunk', ordinal: ++chunks,
            bytesBase64: Buffer.from(next.value).toString('base64'), chunkSha256: hash(next.value) });
          controller.enqueue(next.value);
        } catch (error) { finish('unknown'); controller.error(error); }
      },
      async cancel(reason) { finish('unknown'); await reader.cancel(reason); },
    });
    const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    // Web fetch consumers may use the final URL/redirect state; these are exposed, never persisted.
    for (const property of ['url', 'redirected', 'type']) Object.defineProperty(wrapped, property, { value: response[property] });
    return wrapped;
  };
}
