/**
 * The evaluation's own speakers of each search backend protocol a document declares (Issue #883): the request one public
 * query becomes and the titles and URLs read back. They exist for the development evaluation alone; the product's
 * adapters implement `SearchBackend` in slice 6b. Each reads the vendor's documented response shape (the document's
 * readings) and nothing else of the body: no snippet, excerpt, summary or answer text leaves this module.
 */

/**
 * DeepSeek bills its server-side search as model tokens (search-deepseek.json, evidence `deepseek-pricing`, read 2026-10-16):
 * deepseek-flash at the documented peak price, so a measured cost is never an underestimate.
 */
const DEEPSEEK_MODEL = 'deepseek-flash';
const DEEPSEEK_PEAK_USD_PER_TOKEN = Object.freeze({ input: 0.3 / 1e6, cacheRead: 0.006 / 1e6, output: 1.2 / 1e6 });
/** The Anthropic server tool the evaluation sends: no DeepSeek page names a type (search-deepseek.json, open question). */
const ANTHROPIC_WEB_SEARCH_TOOL = Object.freeze({ type: 'web_search_20250305', name: 'web_search', max_uses: 1 });

/** How many results each request asks for; the rubric judges the top five. */
const REQUESTED_RESULTS = 10;

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Titles and URLs from a list of result objects, under the field names the vendor documents. */
function hitsOf(list, titleField) {
  if (!Array.isArray(list)) return null;
  const hits = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.url !== 'string') continue;
    hits.push({ title: typeof item[titleField] === 'string' ? item[titleField] : '', url: item.url });
  }
  return hits;
}

function credentialHeader(declaration, credential) {
  switch (declaration.headerForm) {
    case 'authorization-bearer': return { authorization: `Bearer ${credential}` };
    case 'x-api-key': return { 'x-api-key': credential };
    case 'x-subscription-token': return { 'x-subscription-token': credential };
    default: throw new Error('SEARCH_EVALUATION/header-form-unknown');
  }
}

const SPEAKERS = Object.freeze({
  'bocha-web-search': {
    request: (declaration, query) => ({
      url: declaration.endpoint,
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query, freshness: 'noLimit', summary: false, count: REQUESTED_RESULTS }),
    }),
    read(json) {
      // Bing-compatible, with or without the `data` wrapper (search-bochaai.json open question).
      if (isRecord(json?.data) && isRecord(json.data.webPages)) return { hits: hitsOf(json.data.webPages.value, 'name'), shape: 'data.webPages.value' };
      if (isRecord(json?.webPages)) return { hits: hitsOf(json.webPages.value, 'name'), shape: 'webPages.value' };
      if (isRecord(json?.data) && json.data.webPages === undefined && json.code === 200) return { hits: [], shape: 'data (no webPages)' };
      return { hits: null, shape: null };
    },
  },
  'brave-web-search': {
    request: (declaration, query) => ({
      url: `${declaration.endpoint}?${new URLSearchParams({ q: query, count: String(REQUESTED_RESULTS) })}`,
      method: 'GET',
      headers: { accept: 'application/json' },
      body: null,
    }),
    read(json) {
      if (isRecord(json?.web)) return { hits: hitsOf(json.web.results, 'title'), shape: 'web.results' };
      if (isRecord(json) && json.type === 'search') return { hits: [], shape: 'search (no web)' };
      return { hits: null, shape: null };
    },
  },
  'tinyfish-search': {
    request: (declaration, query) => ({
      url: `${declaration.endpoint}?${new URLSearchParams({ query })}`,
      method: 'GET',
      headers: { accept: 'application/json' },
      body: null,
    }),
    read(json) {
      if (Array.isArray(json?.results)) return { hits: hitsOf(json.results, 'title'), shape: 'results' };
      return { hits: null, shape: null };
    },
  },
  'parallel-search': {
    request: (declaration, query) => ({
      url: declaration.endpoint,
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ objective: query, search_queries: [query] }),
    }),
    read(json) {
      if (Array.isArray(json?.results)) return { hits: hitsOf(json.results, 'title'), shape: 'results' };
      return { hits: null, shape: null };
    },
  },
  'anthropic-messages-web-search': {
    request: (declaration, query) => ({
      url: declaration.endpoint,
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'anthropic-version': declaration.anthropicVersion },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 1024,
        tools: [ANTHROPIC_WEB_SEARCH_TOOL],
        messages: [{ role: 'user', content: `Search the web for: ${query}\nAfter searching, reply with the single word: done` }],
      }),
    }),
    read(json) {
      if (!Array.isArray(json?.content)) return { hits: null, shape: null };
      const usage = isRecord(json.usage) ? json.usage : {};
      const tokens = (key) => (typeof usage[key] === 'number' ? usage[key] : 0);
      const costUsd = tokens('input_tokens') * DEEPSEEK_PEAK_USD_PER_TOKEN.input + tokens('cache_read_input_tokens') * DEEPSEEK_PEAK_USD_PER_TOKEN.cacheRead +
        tokens('output_tokens') * DEEPSEEK_PEAK_USD_PER_TOKEN.output;
      const blocks = json.content.filter((block) => isRecord(block) && block.type === 'web_search_tool_result');
      const serverToolUse = json.content.some((block) => isRecord(block) && block.type === 'server_tool_use');
      const hits = blocks.flatMap((block) => (Array.isArray(block.content) ? hitsOf(block.content.filter((item) => isRecord(item) && item.type === 'web_search_result'), 'title') : []));
      const shape = blocks.length > 0 ? 'content[web_search_tool_result]' : serverToolUse ? 'content[server_tool_use, no result]' : 'content (no search)';
      // A call that ran no search answered nothing to judge: it is read as no result, not as an empty one.
      return { hits: blocks.length === 0 ? null : hits, shape, costUsd };
    },
  },
});

/** The request a public query becomes on a backend, with the credential placed in its documented header. */
export function evaluationRequest(declaration, query, credential) {
  const speaker = SPEAKERS[declaration.protocol];
  if (speaker === undefined) throw new Error('SEARCH_EVALUATION/protocol-unknown');
  const request = speaker.request(declaration, query);
  return { ...request, headers: { ...request.headers, ...credentialHeader(declaration, credential) } };
}

/** Titles and URLs (and, for a token-billed backend, the call's cost) from a parsed body; `hits` is null when unreadable. */
export function readEvaluationAnswer(declaration, json) {
  return { costUsd: null, ...SPEAKERS[declaration.protocol].read(json) };
}
