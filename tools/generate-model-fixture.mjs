import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Turn one Provider Result Cache entry (ADR 0067) into an `ai7.model-fixture/1` file.
 *
 *   node tools/generate-model-fixture.mjs --from-cache <test item id | request digest> \
 *     --cache-root <dir> --identity <id> --description <text> --out <file>
 *
 * Every argument is required and nothing defaults to any host's paths: the cache lives outside every
 * checkout, and a tool that guessed where would be one flag away from reading it by accident.
 *
 * The point of the tool is that a cached live result becomes a deterministic fixture without anyone
 * hand-copying a digest, and without manuscript text riding along. The entry is keyed twice. Its
 * `requestDigest` is the same function of the frozen prompt contract and the manifest unit that the
 * live request was keyed by, so the generated entry answers exactly the import it came from. Its
 * `contentDigest` is taken over the unit's own block texts alone, so the same entry also answers a
 * fresh import of the same manuscript, whose block identities are new — that is the resolution mode
 * `tests/` uses, and the one reason the fixture schema grew an optional key.
 *
 * Nothing is written until every check has passed: the fixture is assembled in memory and the single
 * write is the last thing that happens, so a refusal leaves no file behind. The refusals are the
 * interesting part of the tool. A free-text field that still shares a run of
 * MANUSCRIPT_ECHO_THRESHOLD characters with an own block after placeholder substitution refuses as
 * `FIXTURE_GEN/manuscript-echo`, naming the JSON path and the run length and never the characters
 * themselves. An `--out` under `tests/fixtures/` refuses outright: a fixture enters that directory
 * only through a reviewed pull request, which is where a human reads every free-text field.
 *
 * One shape only: `openai-chat-completions` request bodies. Note that `execution.ts` caches an entry
 * only for HTTP 200, so from the real cache a limit or a server error refuses `entry-missing` before
 * the non-200 mappings below are reached; they exist for entries that carry such a status, and the
 * unit suite drives them from a synthetic cache.
 *
 * This file is plain ESM run by `node` directly, before and outside any TypeScript build, so it
 * imports nothing from `src/` or `dist/` and duplicates the few constants and pure functions it
 * needs. `tests/unit/generate-model-fixture.test.ts` imports these exports beside the owning modules'
 * and asserts they agree; drift is caught there rather than prevented by an import that cannot exist.
 */
const MODEL_FIXTURE_SCHEMA = 'ai7.model-fixture/1';
const FIXTURE_IDENTITY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const LEDGER_ITEM_ID_PATTERN = /^[A-Za-z0-9]+\/[a-z0-9-]+\/[1-9][0-9]{0,5}$/u;
const UNIT_MESSAGE_HEADER = /^分析单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;
const OWN_BLOCKS_HEADER = '以下为本单元需要归纳的内容块：';
const BLOCK_LINE = /^\[(blk_[0-9a-f]{24})\] /u;
const BLOCK_KIND_MARKER = /^\((?:title|heading|paragraph)(?: h[1-6])?\) /u;
const PROVIDER_LEDGER_FILE = 'ledger.jsonl';
const PROVIDER_CACHE_DIRECTORY = 'entries';

/**
 * How many consecutive characters a free-text field may share with an own block before the tool
 * refuses. Twelve is short enough that a quoted clause cannot slip through and long enough that the
 * contract's own vocabulary — a name, a place, a term the response is supposed to carry — does not
 * trip it. Whitespace is collapsed before the comparison and a run of only punctuation or digits is
 * ignored, so formatting and numbering are never mistaken for manuscript.
 */
export const MANUSCRIPT_ECHO_THRESHOLD = 12;
const IGNORABLE_RUN = /^[\p{P}\p{S}\p{N}\s]+$/u;
const MAX_DESCRIPTION_LENGTH = 512;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

/** Fixed messages: a fixture never restates a provider's own words, which could quote the request. */
const QUOTA_MESSAGE = '来源测试项在实时调用中触及提供方账户限额。';
const HTTP_FAILURE_MESSAGE = '来源测试项的实时调用未返回单元结果。';

export class FixtureGenerationError extends Error {
  constructor(code, detail) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'FixtureGenerationError';
    this.code = code;
  }
}

function refuse(condition, code, detail) {
  if (!condition) throw new FixtureGenerationError(code, detail);
}

// --- Duplicated from src/service/analysis/canonical.ts and contract.ts ------------------------

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Object keys sorted by code point, arrays in order, no whitespace; `undefined` members dropped. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Recover the unit identity from a unit message; `null` for anything else. */
export function parseUnitMessageHeader(text) {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = UNIT_MESSAGE_HEADER.exec(firstLine);
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3] };
}

/** The request-digest key: a pure function of the frozen prompt contract and the exact manifest unit. */
export function unitRequestDigest(promptContractDigest, unitOrdinal, unitDigest) {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitOrdinal, unitDigest }));
}

function ownBlockLinesOf(unitMessage) {
  const lines = unitMessage.split('\n');
  const start = lines.indexOf(OWN_BLOCKS_HEADER);
  if (start === -1) return [];
  const blocks = [];
  for (const line of lines.slice(start + 1)) {
    const match = BLOCK_LINE.exec(line);
    if (match !== null) blocks.push({ id: match[1], rest: line.slice(match[0].length) });
  }
  return blocks;
}

/** Own block identities of a unit message, in order. */
export function ownBlockIdsOf(unitMessage) {
  return ownBlockLinesOf(unitMessage).map((block) => block.id);
}

/** Own block texts of a unit message, in order: identity and kind marker stripped, text and nothing else. */
export function ownBlockTextsOf(unitMessage) {
  return ownBlockLinesOf(unitMessage).map((block) => block.rest.replace(BLOCK_KIND_MARKER, ''));
}

/** The content-digest key: SHA-256 over the own block texts joined by a newline. */
export function unitContentDigest(ownBlockTexts) {
  return sha256Hex(ownBlockTexts.join('\n'));
}

// --- Arguments --------------------------------------------------------------------------------

const ARGUMENT_KEYS = ['--from-cache', '--cache-root', '--identity', '--description', '--out'];

/**
 * A path is reserved when any two consecutive segments are `tests` and `fixtures`. The check is on
 * the shape of the path rather than on this checkout's location, so it holds from a worktree, from a
 * copy, and from wherever a later caller runs the tool.
 */
export function withinReservedFixtures(path) {
  const segments = path.split(/[\\/]/u).filter((segment) => segment.length > 0).map((segment) => segment.toLowerCase());
  return segments.some((segment, index) => segment === 'tests' && segments[index + 1] === 'fixtures');
}

/** Parse the exact argument form. Every key is required, none is repeated, and none has a default. */
export function parseGenerationArguments(argv) {
  refuse(Array.isArray(argv), 'FIXTURE_GEN/arguments-invalid', '参数序列无效。');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    refuse(ARGUMENT_KEYS.includes(key), 'FIXTURE_GEN/arguments-invalid', `无法识别的参数 ${String(key)}。`);
    const value = argv[index + 1];
    refuse(typeof value === 'string' && value.length > 0 && !values.has(key), 'FIXTURE_GEN/arguments-invalid', `参数 ${key} 缺少值或重复出现。`);
    values.set(key, value);
    index += 1;
  }
  for (const key of ARGUMENT_KEYS) refuse(values.has(key), 'FIXTURE_GEN/arguments-invalid', `缺少必需参数 ${key}。`);
  const identity = values.get('--identity');
  refuse(FIXTURE_IDENTITY_PATTERN.test(identity), 'FIXTURE_GEN/arguments-invalid', '夹具身份不符合允许的形式。');
  const selector = values.get('--from-cache');
  refuse(DIGEST_PATTERN.test(selector) || LEDGER_ITEM_ID_PATTERN.test(selector),
    'FIXTURE_GEN/arguments-invalid', '--from-cache 既不是测试项标识也不是请求摘要。');
  const description = values.get('--description');
  refuse(description.isWellFormed() && description.length <= MAX_DESCRIPTION_LENGTH,
    'FIXTURE_GEN/arguments-invalid', '夹具描述超出边界。');
  const cacheRoot = resolve(values.get('--cache-root'));
  refuse(isAbsolute(cacheRoot), 'FIXTURE_GEN/arguments-invalid', '缓存根目录必须解析为绝对路径。');
  const out = resolve(values.get('--out'));
  refuse(!withinReservedFixtures(out), 'FIXTURE_GEN/out-path-reserved',
    '生成的夹具只能经过评审的拉取请求进入 tests/fixtures/。');
  return { selector, cacheRoot, identity, description, out };
}

// --- Ledger and cache -------------------------------------------------------------------------

/** The append-only Provider Test Ledger as parsed lines; a malformed line refuses, never silently skips. */
export async function readLedgerLines(cacheRoot) {
  let raw;
  try {
    raw = await readFile(join(cacheRoot, PROVIDER_LEDGER_FILE), 'utf8');
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/ledger-unreadable', '找不到或无法读取 Provider Test Ledger。');
  }
  const lines = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new FixtureGenerationError('FIXTURE_GEN/ledger-unreadable', 'Provider Test Ledger 含有无法解析的记录。');
    }
    refuse(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.itemId === 'string',
      'FIXTURE_GEN/ledger-unreadable', 'Provider Test Ledger 记录缺少测试项标识。');
    lines.push(parsed);
  }
  return lines;
}

/**
 * Which cached result the selector names. A test item id resolves to its latest non-stale line; a
 * request digest resolves through every line carrying it. Either way the lines must agree on one
 * model: two models under one digest are two different cached results, and picking one of them
 * silently is exactly the mistake this tool exists to prevent.
 */
export function resolveLedgerSelection(lines, selector) {
  const carrying = DIGEST_PATTERN.test(selector)
    ? lines.filter((line) => line.requestDigest === selector)
    : lines.filter((line) => line.itemId === selector);
  const live = carrying.filter((line) => line.stale !== true);
  refuse(live.length > 0, 'FIXTURE_GEN/item-unknown', 'Provider Test Ledger 中没有该测试项或请求摘要的未作废记录。');
  const models = new Set(live.map((line) => line.model));
  refuse(models.size === 1, 'FIXTURE_GEN/model-ambiguous', `该请求摘要在 Provider Test Ledger 中对应 ${models.size} 个模型。`);
  const chosen = live[live.length - 1];
  refuse(typeof chosen.model === 'string' && chosen.model.length > 0, 'FIXTURE_GEN/item-unknown', '账本记录缺少模型标识。');
  refuse(typeof chosen.requestDigest === 'string' && DIGEST_PATTERN.test(chosen.requestDigest),
    'FIXTURE_GEN/item-unknown', '账本记录缺少有效的请求摘要。');
  refuse(typeof chosen.promptContractDigest === 'string' && DIGEST_PATTERN.test(chosen.promptContractDigest),
    'FIXTURE_GEN/item-unknown', '账本记录缺少有效的提示契约摘要。');
  return {
    itemId: chosen.itemId,
    model: chosen.model,
    requestDigest: chosen.requestDigest,
    promptContractDigest: chosen.promptContractDigest,
    quotaExhausted: chosen.classification === 'quota-exhausted',
  };
}

/** The entry file of one (model, request digest) pair: the same formula `ProviderResultCache` writes. */
export function cacheEntryPath(cacheRoot, model, requestDigest) {
  const key = sha256Hex(JSON.stringify([model, requestDigest]));
  return join(cacheRoot, PROVIDER_CACHE_DIRECTORY, `${key}.json`);
}

export async function readCacheEntry(cacheRoot, model, requestDigest) {
  let raw;
  try {
    raw = await readFile(cacheEntryPath(cacheRoot, model, requestDigest), 'utf8');
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/entry-missing', 'Provider Result Cache 中没有该模型与请求摘要的条目。');
  }
  refuse(raw.length <= MAX_ENTRY_BYTES, 'FIXTURE_GEN/entry-invalid', '缓存条目超出安全大小。');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/entry-invalid', '缓存条目不是有效 JSON。');
  }
  refuse(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) &&
    typeof parsed.requestBody === 'string' && Number.isSafeInteger(parsed.status) && parsed.status >= 100,
  'FIXTURE_GEN/entry-invalid', '缓存条目缺少请求体或状态。');
  return parsed;
}

// --- The request ------------------------------------------------------------------------------

/** The text of one chat-completions message: a plain string, or text blocks concatenated. */
function chatMessageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') return null;
    texts.push(block.text);
  }
  return texts.join('');
}

/**
 * The Analysis Unit the cached request asked about: the last `user` message of an
 * `openai-chat-completions` body, with its header and its own blocks read exactly as the prompt
 * contract wrote them. Any other request shape refuses rather than being guessed at.
 */
export function parseCachedRequest(requestBody) {
  let body;
  try {
    body = JSON.parse(requestBody);
  } catch {
    throw new FixtureGenerationError('FIXTURE_GEN/request-shape-unsupported', '缓存条目的请求体不是 JSON。');
  }
  refuse(body !== null && typeof body === 'object' && !Array.isArray(body) && Array.isArray(body.messages) && body.messages.length > 0,
    'FIXTURE_GEN/request-shape-unsupported', '缓存条目不是 openai-chat-completions 请求体。');
  let unitMessage = null;
  for (const message of body.messages) {
    refuse(message !== null && typeof message === 'object' && !Array.isArray(message) && typeof message.role === 'string',
      'FIXTURE_GEN/request-shape-unsupported', '请求体中的消息缺少角色。');
    const text = chatMessageText(message.content);
    refuse(text !== null, 'FIXTURE_GEN/request-shape-unsupported', '请求体中的消息内容既不是字符串也不是文本块序列。');
    if (message.role === 'user') unitMessage = text;
  }
  refuse(unitMessage !== null, 'FIXTURE_GEN/request-shape-unsupported', '请求体不含任何 user 消息。');
  const header = parseUnitMessageHeader(unitMessage);
  refuse(header !== null, 'FIXTURE_GEN/unit-message-unrecognized', '最后一条 user 消息不含可识别的分析单元消息头。');
  const ownBlockTexts = ownBlockTextsOf(unitMessage);
  refuse(ownBlockTexts.length > 0, 'FIXTURE_GEN/unit-message-unrecognized', '分析单元消息不含任何本单元内容块。');
  return { unitMessage, header, ownBlockTexts };
}

// --- Manuscript echo --------------------------------------------------------------------------

function collapseWhitespace(text) {
  return text.replace(/\s+/gu, ' ');
}

/**
 * Replace every whole own block text with its `{{block:N}}` placeholder. Longest first, so a block
 * whose text is a prefix of another's cannot claim the longer block's span.
 */
export function replaceOwnBlockTexts(text, ownBlockTexts) {
  const ordered = ownBlockTexts
    .map((value, index) => ({ value, placeholder: `{{block:${index + 1}}}` }))
    .filter((block) => block.value.length > 0)
    .sort((left, right) => right.value.length - left.value.length);
  let replaced = text;
  for (const block of ordered) replaced = replaced.split(block.value).join(block.placeholder);
  return replaced;
}

/**
 * The length of the first run of MANUSCRIPT_ECHO_THRESHOLD characters or more that this field shares
 * with any own block, or `null`. Whitespace is collapsed on both sides and the comparison walks code
 * points, not code units, so a surrogate pair is never cut in half. The run itself is measured and
 * then discarded: the caller may report how long it was and never what it said.
 */
export function longestEchoRun(field, collapsedBlocks) {
  const points = Array.from(collapseWhitespace(field));
  for (let start = 0; start + MANUSCRIPT_ECHO_THRESHOLD <= points.length; start += 1) {
    let end = start + MANUSCRIPT_ECHO_THRESHOLD;
    const window = points.slice(start, end).join('');
    if (IGNORABLE_RUN.test(window)) continue;
    if (!collapsedBlocks.some((block) => block.includes(window))) continue;
    while (end < points.length && collapsedBlocks.some((block) => block.includes(points.slice(start, end + 1).join('')))) end += 1;
    return end - start;
  }
  return null;
}

/**
 * The first free-text field of a parsed response that still echoes an own block, as its JSON path
 * and the run length — never the characters. A plain string is one field at path `$`.
 */
export function findManuscriptEcho(value, ownBlockTexts) {
  const collapsedBlocks = ownBlockTexts.map(collapseWhitespace);
  const visit = (node, path) => {
    if (typeof node === 'string') {
      const runLength = longestEchoRun(node, collapsedBlocks);
      return runLength === null ? null : { path, runLength };
    }
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        const found = visit(node[index], `${path}[${index}]`);
        if (found !== null) return found;
      }
      return null;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, item] of Object.entries(node)) {
        const found = visit(item, `${path}.${key}`);
        if (found !== null) return found;
      }
      return null;
    }
    return null;
  };
  return visit(value, '$');
}

function mapStrings(node, map) {
  if (typeof node === 'string') return map(node);
  if (Array.isArray(node)) return node.map((item) => mapStrings(item, map));
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, mapStrings(item, map)]));
  }
  return node;
}

/**
 * The unit-result text as a fixture may carry it: every string value with whole own blocks replaced
 * by their placeholders, refused outright if anything manuscript-shaped survives. A text that is not
 * JSON is treated as one field, which is the honest reading of a response that did not parse.
 */
export function redactUnitResultText(text, ownBlockTexts) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const replaced = parsed === undefined
    ? replaceOwnBlockTexts(text, ownBlockTexts)
    : mapStrings(parsed, (field) => replaceOwnBlockTexts(field, ownBlockTexts));
  const echo = findManuscriptEcho(replaced, ownBlockTexts);
  if (echo !== null) {
    throw new FixtureGenerationError('FIXTURE_GEN/manuscript-echo',
      `字段 ${echo.path} 与本单元内容块仍有 ${echo.runLength} 个字符重合。`);
  }
  return typeof replaced === 'string' ? replaced : JSON.stringify(replaced);
}

// --- The response -----------------------------------------------------------------------------

/**
 * One cached result as a fixture response. A limit is a limit whichever way the ledger and the
 * status say so; any other non-200 becomes an adapter failure named after its status; and a 200 must
 * actually carry a unit result, with the usage the ceiling is measured against. Absent usage refuses
 * rather than being written as zeros, which would silently make the fixture free to replay.
 */
export function mapCachedResponse(entry, selection, ownBlockTexts) {
  if (selection.quotaExhausted || entry.status === 429) {
    return { kind: 'quota-exceeded', message: QUOTA_MESSAGE, status: entry.status };
  }
  if (entry.status !== 200) {
    return { kind: 'adapter-failure', code: `PROVIDER_HTTP_${entry.status}`, message: HTTP_FAILURE_MESSAGE, status: entry.status };
  }
  const response = entry.response;
  refuse(response !== null && typeof response === 'object' && !Array.isArray(response) && Array.isArray(response.choices),
    'FIXTURE_GEN/response-shape-unsupported', '缓存条目的响应不是 openai-chat-completions 结果。');
  const message = response.choices[0] === undefined ? undefined : response.choices[0].message;
  const text = message === null || typeof message !== 'object' ? undefined : message.content;
  refuse(typeof text === 'string' && text.length > 0,
    'FIXTURE_GEN/response-shape-unsupported', '缓存条目的响应不含 choices[0].message.content 文本。');
  const usage = response.usage;
  const inputTokens = usage === null || typeof usage !== 'object' ? undefined : usage.prompt_tokens;
  const outputTokens = usage === null || typeof usage !== 'object' ? undefined : usage.completion_tokens;
  refuse(Number.isSafeInteger(inputTokens) && inputTokens >= 0 && Number.isSafeInteger(outputTokens) && outputTokens >= 0,
    'FIXTURE_GEN/usage-absent', '缓存条目的响应不含可用的 usage 计数。');
  return { kind: 'unit-result', text: redactUnitResultText(text, ownBlockTexts), usage: { inputTokens, outputTokens } };
}

// --- Assembly ---------------------------------------------------------------------------------

/** The fixture document. Its description carries the provenance a reviewer needs to trace it back. */
export function assembleFixture(parts) {
  return {
    schema: MODEL_FIXTURE_SCHEMA,
    identity: parts.identity,
    description: `${parts.description} · 来源测试项 ${parts.itemId} · 模型 ${parts.model} · 生成于 ${parts.generatedOn}`,
    basedOn: null,
    provider: 'ai7-local-deterministic',
    model: 'ai7-deterministic-fixture',
    entries: [{
      unitOrdinal: parts.unitOrdinal,
      requestDigest: parts.requestDigest,
      contentDigest: parts.contentDigest,
      response: parts.response,
    }],
  };
}

/** Everything but the write: a caller that refuses here has left nothing on disk. */
export async function generateModelFixture(request, now = new Date()) {
  const selection = resolveLedgerSelection(await readLedgerLines(request.cacheRoot), request.selector);
  const entry = await readCacheEntry(request.cacheRoot, selection.model, selection.requestDigest);
  const { header, ownBlockTexts } = parseCachedRequest(entry.requestBody);
  return assembleFixture({
    identity: request.identity,
    description: request.description,
    itemId: selection.itemId,
    model: selection.model,
    generatedOn: now.toISOString().slice(0, 10),
    unitOrdinal: header.ordinal,
    requestDigest: unitRequestDigest(selection.promptContractDigest, header.ordinal, header.unitDigest),
    contentDigest: unitContentDigest(ownBlockTexts),
    response: mapCachedResponse(entry, selection, ownBlockTexts),
  });
}

async function main() {
  const request = parseGenerationArguments(process.argv.slice(2));
  const fixture = await generateModelFixture(request);
  await writeFile(request.out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  // The path and nothing else: no field of the fixture is ever printed.
  process.stdout.write(`${request.out}\n`);
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof FixtureGenerationError ? error.message : 'FIXTURE_GEN/failed'}\n`);
    process.exitCode = 1;
  });
}
