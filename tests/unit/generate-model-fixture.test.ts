import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitMessageHeader, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { ownBlockIdsOf, ownBlockTextsOf, unitContentDigest } from '../../src/service/provider/local-deterministic-adapter.js';
import { parseModelFixture } from '../../src/service/provider/model-fixture.js';

// The S41 generation tool, proven on a cache the tests build in a temporary directory. The real
// Provider Result Cache of ADR 0067 is never named, read, or listed here, and no generated fixture
// leaves the temporary root: a fixture enters `tests/fixtures/` only through a reviewed pull
// request, which is the refusal `out-path-reserved` exists to enforce.

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const TOOL_PATH = fileURLToPath(new URL('../../tools/generate-model-fixture.mjs', import.meta.url));

type Selection = { itemId: string; model: string; requestDigest: string; promptContractDigest: string; quotaExhausted: boolean };
type Request = { selector: string; cacheRoot: string; identity: string; description: string; out: string };
type Header = { ordinal: number; total: number; unitDigest: string };

type Tool = {
  MANUSCRIPT_ECHO_THRESHOLD: number;
  sha256Hex: (value: string) => string;
  canonicalJson: (value: unknown) => string;
  parseUnitMessageHeader: (text: string) => Header | null;
  unitRequestDigest: (promptContractDigest: string, unitOrdinal: number, unitDigest: string) => string;
  ownBlockIdsOf: (unitMessage: string) => string[];
  ownBlockTextsOf: (unitMessage: string) => string[];
  unitContentDigest: (ownBlockTexts: ReadonlyArray<string>) => string;
  withinReservedFixtures: (path: string) => boolean;
  parseGenerationArguments: (argv: string[]) => Request;
  readLedgerLines: (cacheRoot: string) => Promise<Array<Record<string, unknown>>>;
  resolveLedgerSelection: (lines: ReadonlyArray<unknown>, selector: string) => Selection;
  cacheEntryPath: (cacheRoot: string, model: string, requestDigest: string) => string;
  readCacheEntry: (cacheRoot: string, model: string, requestDigest: string) => Promise<{ status: number; requestBody: string; response: unknown }>;
  parseCachedRequest: (requestBody: string) => { unitMessage: string; header: Header; ownBlockTexts: string[] };
  replaceOwnBlockTexts: (text: string, ownBlockTexts: ReadonlyArray<string>) => string;
  longestEchoRun: (field: string, collapsedBlocks: ReadonlyArray<string>) => number | null;
  findManuscriptEcho: (value: unknown, ownBlockTexts: ReadonlyArray<string>) => { path: string; runLength: number } | null;
  redactUnitResultText: (text: string, ownBlockTexts: ReadonlyArray<string>) => string;
  mapCachedResponse: (entry: unknown, selection: unknown, ownBlockTexts: ReadonlyArray<string>) => Record<string, unknown>;
  generateModelFixture: (request: Request, now?: Date) => Promise<Record<string, unknown>>;
};

// @ts-expect-error tools/*.mjs carry no declarations; the tool is exercised as the plain module it is.
const tool = (await import('../../tools/generate-model-fixture.mjs')) as unknown as Tool;

const MODEL = 'deepseek-v4-flash';
const ITEM_ID = 'S40/fixture/1';
const UNIT_DIGEST = 'a'.repeat(64);
const IDENTITIES = [`blk_${'1'.repeat(24)}`, `blk_${'2'.repeat(24)}`];
const FRESH_IDENTITIES = [`blk_${'7'.repeat(24)}`, `blk_${'8'.repeat(24)}`];
const OWN_TEXTS = ['合成段落一：人物甲在合成之城落脚。', '合成段落二：合成之城的规矩被首次提及。'];

function unitMessage(identities: ReadonlyArray<string> = IDENTITIES, texts: ReadonlyArray<string> = OWN_TEXTS, ordinal = 1, unitDigest = UNIT_DIGEST): string {
  return [
    BASELINE_PROMPT_CONTRACT.unitMessageHeader.replace('{ordinal}', String(ordinal)).replace('{total}', '3').replace('{unitDigest}', unitDigest),
    BASELINE_PROMPT_CONTRACT.overlapHeader,
    `[blk_${'0'.repeat(24)}] (paragraph) 合成重叠段落，不属于本单元。`,
    BASELINE_PROMPT_CONTRACT.ownHeader,
    ...identities.map((identity, index) => `[${identity}] (paragraph) ${texts[index]!}`),
  ].join('\n');
}

function chatBody(message: string): string {
  return canonicalJson({
    model: MODEL,
    messages: [{ role: 'system', content: BASELINE_PROMPT_CONTRACT.systemPrompt }, { role: 'user', content: message }],
    stream: false,
  });
}

const UNIT_RESULT = (synopsis: string, note: string): string => JSON.stringify({ synopsis, entities: [{ name: '合成人物甲', note }] });

type CacheOptions = {
  requestBody?: string;
  status?: number;
  response?: unknown;
  model?: string;
  extraLines?: Array<Record<string, unknown>>;
  omitEntry?: boolean;
  classification?: 'quota-exhausted';
};

/** One synthetic cache root: a ledger line and, unless suppressed, the entry file it points at. */
async function buildCache(root: string, options: CacheOptions = {}): Promise<{ requestDigest: string; model: string }> {
  const model = options.model ?? MODEL;
  const requestBody = options.requestBody ?? chatBody(unitMessage());
  const requestDigest = sha256Hex(requestBody);
  const status = options.status ?? 200;
  const response = 'response' in options
    ? options.response
    : { choices: [{ message: { content: UNIT_RESULT('合成概述：本单元交代人物甲的出场。', '合成注记：主要人物占位。') } }], usage: { prompt_tokens: 1_400, completion_tokens: 180 } };
  const line = {
    itemId: ITEM_ID,
    purpose: 'fixture',
    model,
    promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
    requestDigest,
    outcome: status === 200 ? 'transmitted' : 'failed',
    status,
    usage: null,
    ...(options.classification === undefined ? {} : { classification: options.classification }),
    recordedAt: '2026-09-08T00:00:00.000Z',
  };
  const lines = [line, ...(options.extraLines ?? [])];
  await mkdir(join(root, 'entries'), { recursive: true });
  await writeFile(join(root, 'ledger.jsonl'), `${lines.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
  if (options.omitEntry !== true) {
    await writeFile(tool.cacheEntryPath(root, model, requestDigest),
      `${JSON.stringify({ model, requestDigest, requestBody, status, response, usage: null, transmittedAt: '2026-09-08T00:00:00.000Z' })}\n`, 'utf8');
  }
  return { requestDigest, model };
}

async function absent(path: string): Promise<boolean> {
  try {
    await stat(path);
    return false;
  } catch {
    return true;
  }
}

describe('generate-model-fixture arguments', () => {
  const base = (out: string): string[] => [
    '--from-cache', ITEM_ID, '--cache-root', resolve(tmpdir(), 'cache'), '--identity', 'generated-unit-1',
    '--description', '合成生成夹具', '--out', out,
  ];

  it('accepts exactly the five required arguments and resolves both paths', () => {
    const parsed = tool.parseGenerationArguments(base(resolve(tmpdir(), 'out.json')));
    expect(parsed).toMatchObject({ selector: ITEM_ID, identity: 'generated-unit-1', description: '合成生成夹具' });
    expect(parsed.out).toBe(resolve(tmpdir(), 'out.json'));
    expect(parsed.cacheRoot).toBe(resolve(tmpdir(), 'cache'));
    // A request digest is the other admitted selector.
    expect(tool.parseGenerationArguments(['--from-cache', 'b'.repeat(64), ...base(resolve(tmpdir(), 'out.json')).slice(2)]).selector).toBe('b'.repeat(64));
  });

  it('refuses a missing, repeated, unknown, or malformed argument', () => {
    const full = base(resolve(tmpdir(), 'out.json'));
    for (const argv of [
      [],
      full.slice(0, 8),
      [...full, '--identity', 'again'],
      [...full, '--unknown', 'x'],
      [...full.slice(0, 10), '--out'],
      ['--from-cache', 'Not-An-Item', ...full.slice(2)],
      ['--from-cache', 'a'.repeat(63), ...full.slice(2)],
      [...full.slice(0, 4), '--identity', 'Upper', ...full.slice(6)],
      [...full.slice(0, 4), '--identity', '-leading', ...full.slice(6)],
      [...full.slice(0, 6), '--description', 'x'.repeat(513), ...full.slice(8)],
    ]) {
      expect(() => tool.parseGenerationArguments(argv), argv.join(' ')).toThrowError(/FIXTURE_GEN\/arguments-invalid/u);
    }
  });

  it('refuses an --out under tests/fixtures with out-path-reserved, on either separator', () => {
    for (const out of [
      join(REPOSITORY_ROOT, 'tests', 'fixtures', 'model', 'generated.json'),
      resolve('/srv/tests/fixtures/model/generated.json'),
    ]) {
      expect(() => tool.parseGenerationArguments(base(out)), out).toThrowError(/FIXTURE_GEN\/out-path-reserved/u);
    }
    expect(tool.withinReservedFixtures(join(REPOSITORY_ROOT, 'tests', 'fixtures'))).toBe(true);
    expect(tool.withinReservedFixtures(resolve('/a/tests/support/x.json'))).toBe(false);
    expect(tool.withinReservedFixtures(resolve('/a/fixtures/tests/x.json'))).toBe(false);
  });
});

describe('generate-model-fixture cache lookup', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-fixture-gen-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('computes the entry path by the same formula the cache writes it with', async () => {
    const { requestDigest } = await buildCache(root);
    const key = sha256Hex(JSON.stringify([MODEL, requestDigest]));
    expect(tool.cacheEntryPath(root, MODEL, requestDigest)).toBe(join(root, 'entries', `${key}.json`));
    await expect(tool.readCacheEntry(root, MODEL, requestDigest)).resolves.toMatchObject({ status: 200 });
  });

  it('resolves a test item id to its latest non-stale line and skips the stale ones', async () => {
    const { requestDigest } = await buildCache(root, {
      extraLines: [
        { itemId: ITEM_ID, model: 'retired-model', promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, requestDigest: 'f'.repeat(64), stale: true, recordedAt: '2026-09-08T01:00:00.000Z' },
      ],
    });
    const selection = tool.resolveLedgerSelection(await tool.readLedgerLines(root), ITEM_ID);
    expect(selection).toMatchObject({ itemId: ITEM_ID, model: MODEL, requestDigest, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, quotaExhausted: false });
  });

  it('resolves a request digest, and refuses when more than one model carries it', async () => {
    const { requestDigest } = await buildCache(root);
    expect(tool.resolveLedgerSelection(await tool.readLedgerLines(root), requestDigest).model).toBe(MODEL);
    const ambiguous = [
      ...(await tool.readLedgerLines(root)),
      { itemId: 'S40/fixture/2', model: 'deepseek-v4-pro', promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, requestDigest, recordedAt: '2026-09-08T02:00:00.000Z' },
    ];
    expect(() => tool.resolveLedgerSelection(ambiguous, requestDigest)).toThrowError(/FIXTURE_GEN\/model-ambiguous/u);
  });

  it('refuses an unknown item, an entirely stale item, an unreadable ledger, and a missing entry', async () => {
    const { requestDigest } = await buildCache(root, { omitEntry: true });
    const lines = await tool.readLedgerLines(root);
    expect(() => tool.resolveLedgerSelection(lines, 'S40/absent/9')).toThrowError(/FIXTURE_GEN\/item-unknown/u);
    expect(() => tool.resolveLedgerSelection([{ ...lines[0]!, stale: true }], ITEM_ID)).toThrowError(/FIXTURE_GEN\/item-unknown/u);
    await expect(tool.readCacheEntry(root, MODEL, requestDigest)).rejects.toMatchObject({ code: 'FIXTURE_GEN/entry-missing' });
    await writeFile(join(root, 'ledger.jsonl'), '{ not json\n', 'utf8');
    await expect(tool.readLedgerLines(root)).rejects.toMatchObject({ code: 'FIXTURE_GEN/ledger-unreadable' });
    const empty = await mkdtemp(join(tmpdir(), 'ai7-fixture-gen-empty-'));
    await expect(tool.readLedgerLines(empty)).rejects.toMatchObject({ code: 'FIXTURE_GEN/ledger-unreadable' });
    await rm(empty, { recursive: true, force: true });
  });
});

describe('generate-model-fixture request shape', () => {
  it('reads the unit message from the last user message, as a string or as text blocks', () => {
    const message = unitMessage();
    expect(tool.parseCachedRequest(chatBody(message))).toMatchObject({ unitMessage: message, ownBlockTexts: OWN_TEXTS });
    const blocks = JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: '合成的较早用户消息。' },
        { role: 'assistant', content: '合成的助手回复。' },
        { role: 'user', content: [{ type: 'text', text: message.slice(0, 20) }, { type: 'text', text: message.slice(20) }] },
      ],
    });
    expect(tool.parseCachedRequest(blocks).header).toMatchObject({ ordinal: 1, total: 3, unitDigest: UNIT_DIGEST });
  });

  it('refuses any other request shape and any message it cannot read as text', () => {
    for (const body of [
      'not json',
      JSON.stringify({ model: MODEL }),
      JSON.stringify({ model: MODEL, messages: [] }),
      JSON.stringify({ model: MODEL, contents: [{ parts: [{ text: 'x' }] }] }),
      JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: [{ type: 'image', url: 'x' }] }] }),
      JSON.stringify({ model: MODEL, messages: [{ content: 'x' }] }),
      JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: 'x' }] }),
    ]) {
      expect(() => tool.parseCachedRequest(body), body.slice(0, 40)).toThrowError(/FIXTURE_GEN\/request-shape-unsupported/u);
    }
    // A user message that is not an Analysis Unit is a different refusal: the shape was fine.
    expect(() => tool.parseCachedRequest(chatBody('没有消息头'))).toThrowError(/FIXTURE_GEN\/unit-message-unrecognized/u);
    expect(() => tool.parseCachedRequest(chatBody(`分析单元 1/1 · 单元摘要 ${UNIT_DIGEST}`))).toThrowError(/FIXTURE_GEN\/unit-message-unrecognized/u);
  });
});

describe('generate-model-fixture response mapping', () => {
  const selection = { itemId: ITEM_ID, model: MODEL, requestDigest: 'b'.repeat(64), promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, quotaExhausted: false };
  const cached = (status: number, response: unknown) => ({ status, requestBody: chatBody(unitMessage()), response });

  it('maps a 200 with a unit result and usage counts', () => {
    const text = UNIT_RESULT('合成概述：占位。', '合成注记：占位。');
    const mapped = tool.mapCachedResponse(cached(200, { choices: [{ message: { content: text } }], usage: { prompt_tokens: 1_400, completion_tokens: 180 } }), selection, OWN_TEXTS);
    expect(mapped).toEqual({ kind: 'unit-result', text, usage: { inputTokens: 1_400, outputTokens: 180 } });
  });

  it('refuses absent usage rather than writing zeros', () => {
    const text = UNIT_RESULT('合成概述：占位。', '合成注记：占位。');
    for (const usage of [undefined, null, {}, { prompt_tokens: 1 }, { prompt_tokens: 1.5, completion_tokens: 2 }, { prompt_tokens: -1, completion_tokens: 2 }]) {
      expect(() => tool.mapCachedResponse(cached(200, { choices: [{ message: { content: text } }], usage }), selection, OWN_TEXTS), String(JSON.stringify(usage)))
        .toThrowError(/FIXTURE_GEN\/usage-absent/u);
    }
  });

  it('refuses a 200 that carries no unit-result text', () => {
    for (const response of [null, {}, { choices: [] }, { choices: [{ message: {} }] }, { choices: [{ message: { content: '' } }] }, { choices: [{ message: { content: 12 } }] }]) {
      expect(() => tool.mapCachedResponse(cached(200, response), selection, OWN_TEXTS), JSON.stringify(response))
        .toThrowError(/FIXTURE_GEN\/response-shape-unsupported/u);
    }
  });

  it('maps a 429, and a ledger line classified quota-exhausted at any status, to quota-exceeded without the body', () => {
    const body = { error: { message: '真实提供方文本，不得进入夹具。' } };
    expect(tool.mapCachedResponse(cached(429, body), selection, OWN_TEXTS)).toEqual({ kind: 'quota-exceeded', message: expect.any(String), status: 429 });
    expect(tool.mapCachedResponse(cached(402, body), { ...selection, quotaExhausted: true }, OWN_TEXTS)).toMatchObject({ kind: 'quota-exceeded', status: 402 });
    expect(JSON.stringify(tool.mapCachedResponse(cached(429, body), selection, OWN_TEXTS))).not.toContain('真实提供方文本');
  });

  it('maps any other non-200 to an adapter failure named after its status, with a fixed message', () => {
    for (const status of [400, 401, 500, 503]) {
      expect(tool.mapCachedResponse(cached(status, { error: { message: '真实提供方文本，不得进入夹具。' } }), selection, OWN_TEXTS))
        .toMatchObject({ kind: 'adapter-failure', code: `PROVIDER_HTTP_${status}`, status });
    }
    expect(JSON.stringify(tool.mapCachedResponse(cached(503, { error: { message: '真实提供方文本，不得进入夹具。' } }), selection, OWN_TEXTS))).not.toContain('真实提供方文本');
  });
});

describe('generate-model-fixture manuscript echo', () => {
  it('replaces a whole own block with its placeholder, longest block first', () => {
    expect(tool.replaceOwnBlockTexts(`本单元开篇为${OWN_TEXTS[0]!}`, OWN_TEXTS)).toBe('本单元开篇为{{block:1}}');
    expect(tool.replaceOwnBlockTexts(`${OWN_TEXTS[1]!}——${OWN_TEXTS[0]!}`, OWN_TEXTS)).toBe('{{block:2}}——{{block:1}}');
    // A block whose text is a prefix of another's does not claim the longer span.
    expect(tool.replaceOwnBlockTexts('甲乙丙丁戊', ['甲乙', '甲乙丙丁'])).toBe('{{block:2}}戊');
    const redacted = tool.redactUnitResultText(UNIT_RESULT(`本单元开篇为${OWN_TEXTS[0]!}`, '合成注记：占位。'), OWN_TEXTS);
    expect(JSON.parse(redacted)).toMatchObject({ synopsis: '本单元开篇为{{block:1}}' });
  });

  it('refuses a partial echo at the threshold and admits one below it', () => {
    const threshold = tool.MANUSCRIPT_ECHO_THRESHOLD;
    expect(threshold).toBe(12);
    const atThreshold = OWN_TEXTS[0]!.slice(0, threshold);
    const belowThreshold = OWN_TEXTS[0]!.slice(0, threshold - 1);
    expect(() => tool.redactUnitResultText(UNIT_RESULT(`概述提到${atThreshold}`, '合成注记：占位。'), OWN_TEXTS))
      .toThrowError(/FIXTURE_GEN\/manuscript-echo/u);
    expect(JSON.parse(tool.redactUnitResultText(UNIT_RESULT(`概述提到${belowThreshold}`, '合成注记：占位。'), OWN_TEXTS)))
      .toMatchObject({ synopsis: `概述提到${belowThreshold}` });
  });

  it('names the JSON path and the run length and never the characters', () => {
    const echoed = `${OWN_TEXTS[1]!.slice(0, 14)}`;
    const found = tool.findManuscriptEcho({ synopsis: '合成概述：占位。', entities: [{ name: '合成人物甲', note: echoed }] }, OWN_TEXTS);
    expect(found).toEqual({ path: '$.entities[0].note', runLength: 14 });
    let message = '';
    try {
      tool.redactUnitResultText(UNIT_RESULT('合成概述：占位。', echoed), OWN_TEXTS);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('$.entities[0].note');
    expect(message).toContain('14');
    expect(message).not.toContain(echoed);
    expect(message).not.toContain(echoed.slice(0, 6));
  });

  it('treats a non-JSON text as one field at the root path', () => {
    expect(tool.redactUnitResultText(`模型输出了散文：${OWN_TEXTS[0]!}`, OWN_TEXTS)).toBe('模型输出了散文：{{block:1}}');
    expect(tool.findManuscriptEcho(OWN_TEXTS[0]!.slice(0, 13), OWN_TEXTS)).toEqual({ path: '$', runLength: 13 });
  });

  it('ignores a run of only digits or punctuation, and collapses whitespace before comparing', () => {
    expect(tool.findManuscriptEcho('1234567890123456', ['编号 1234567890123456。'])).toBeNull();
    expect(tool.findManuscriptEcho('——————————————', ['句读——————————————结束'])).toBeNull();
    // Collapsed whitespace means differently spaced copies of the same run still echo.
    expect(tool.findManuscriptEcho('alpha   beta gamma delta', ['alpha beta gamma delta epsilon'])?.runLength).toBeGreaterThanOrEqual(12);
  });
});

describe('generate-model-fixture end to end', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-fixture-gen-e2e-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const request = (out: string, selector = ITEM_ID): Request => ({
    selector, cacheRoot: root, identity: 'generated-unit-1', description: '合成生成夹具', out,
  });

  it('writes a fixture parseModelFixture accepts, keyed by both digests and traceable to its test item', async () => {
    await buildCache(root);
    const out = join(root, 'generated-unit-1.json');
    const result = spawnSync(process.execPath, [
      TOOL_PATH, '--from-cache', ITEM_ID, '--cache-root', root, '--identity', 'generated-unit-1',
      '--description', '合成生成夹具', '--out', out,
    ], { cwd: REPOSITORY_ROOT, encoding: 'utf8', windowsHide: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(out);
    const fixture = parseModelFixture(JSON.parse(await readFile(out, 'utf8')));
    expect(fixture.identity).toBe('generated-unit-1');
    expect(fixture.description).toContain(`来源测试项 ${ITEM_ID}`);
    expect(fixture.description).toContain(`模型 ${MODEL}`);
    expect(fixture.description).toMatch(/生成于 \d{4}-\d{2}-\d{2}$/u);
    expect(fixture.entries).toHaveLength(1);
    const entry = fixture.entries[0]!;
    expect(entry).toMatchObject({
      unitOrdinal: 1,
      requestDigest: unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 1, UNIT_DIGEST),
      contentDigest: unitContentDigest(OWN_TEXTS),
    });
    expect(entry.response).toMatchObject({ kind: 'unit-result', usage: { inputTokens: 1_400, outputTokens: 180 } });
    // No socket was opened and no manuscript-shaped run survived into the file.
    expect(await readFile(out, 'utf8')).not.toContain(OWN_TEXTS[0]!.slice(0, 12));
  });

  it('resolves the same entry through a request digest as through its test item id', async () => {
    const { requestDigest } = await buildCache(root);
    const byItem = await tool.generateModelFixture(request(join(root, 'a.json')), new Date('2026-09-08T00:00:00.000Z'));
    const byDigest = await tool.generateModelFixture(request(join(root, 'b.json'), requestDigest), new Date('2026-09-08T00:00:00.000Z'));
    expect(byDigest).toEqual(byItem);
  });

  it('writes nothing when the response still echoes the manuscript', async () => {
    const echoed = UNIT_RESULT(`概述提到${OWN_TEXTS[0]!.slice(0, 12)}`, '合成注记：占位。');
    await buildCache(root, { response: { choices: [{ message: { content: echoed } }], usage: { prompt_tokens: 10, completion_tokens: 2 } } });
    const out = join(root, 'refused.json');
    await expect(tool.generateModelFixture(request(out))).rejects.toMatchObject({ code: 'FIXTURE_GEN/manuscript-echo' });
    expect(await absent(out)).toBe(true);
    const result = spawnSync(process.execPath, [
      TOOL_PATH, '--from-cache', ITEM_ID, '--cache-root', root, '--identity', 'refused',
      '--description', '合成生成夹具', '--out', out,
    ], { cwd: REPOSITORY_ROOT, encoding: 'utf8', windowsHide: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FIXTURE_GEN/manuscript-echo');
    expect(await absent(out)).toBe(true);
  });

  it('writes nothing when the entry is missing or the request shape is unsupported', async () => {
    await buildCache(root, { omitEntry: true });
    const out = join(root, 'refused.json');
    await expect(tool.generateModelFixture(request(out))).rejects.toMatchObject({ code: 'FIXTURE_GEN/entry-missing' });
    expect(await absent(out)).toBe(true);
    await rm(join(root, 'ledger.jsonl'), { force: true });
    await rm(join(root, 'entries'), { recursive: true, force: true });
    await buildCache(root, { requestBody: JSON.stringify({ model: MODEL, contents: [{ parts: [{ text: '合成。' }] }] }) });
    await expect(tool.generateModelFixture(request(out))).rejects.toMatchObject({ code: 'FIXTURE_GEN/request-shape-unsupported' });
    expect(await absent(out)).toBe(true);
  });
});

describe('generate-model-fixture agreement with the owning modules', () => {
  const messages = [
    unitMessage(),
    unitMessage(FRESH_IDENTITIES, ['合成标题', '合成段落。'], 2, 'b'.repeat(64)),
    unitMessage([IDENTITIES[0]!], ['单块单元。'], 7, 'c'.repeat(64)),
    '没有消息头',
    `分析单元 1/1 · 单元摘要 ${UNIT_DIGEST}`,
  ];

  it('parses the unit message header exactly as the contract does', () => {
    for (const message of messages) {
      expect(tool.parseUnitMessageHeader(message), message.slice(0, 24)).toEqual(parseUnitMessageHeader(message));
    }
    // The malformed forms the contract rejects are rejected identically.
    for (const header of [`分析单元 0/1 · 单元摘要 ${UNIT_DIGEST}`, `分析单元 2/1 · 单元摘要 ${UNIT_DIGEST}`, '分析单元 1/1 · 单元摘要 short']) {
      expect(tool.parseUnitMessageHeader(header)).toEqual(parseUnitMessageHeader(header));
      expect(tool.parseUnitMessageHeader(header)).toBeNull();
    }
  });

  it('derives the same canonical JSON and the same request digest', () => {
    for (const value of [{ b: 1, a: '甲' }, [1, '乙', null], { nested: { z: true, a: [1, 2] } }, '丙', 42, null]) {
      expect(tool.canonicalJson(value)).toBe(canonicalJson(value));
    }
    expect(tool.sha256Hex('合成')).toBe(sha256Hex('合成'));
    for (const ordinal of [1, 2, 97]) {
      for (const unitDigest of [UNIT_DIGEST, 'b'.repeat(64)]) {
        expect(tool.unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, ordinal, unitDigest))
          .toBe(unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, ordinal, unitDigest));
      }
    }
  });

  it('extracts the same own blocks and derives the same content digest', () => {
    for (const message of messages) {
      expect(tool.ownBlockIdsOf(message), message.slice(0, 24)).toEqual(ownBlockIdsOf(message));
      expect(tool.ownBlockTextsOf(message), message.slice(0, 24)).toEqual(ownBlockTextsOf(message));
      expect(tool.unitContentDigest(tool.ownBlockTextsOf(message))).toBe(unitContentDigest(ownBlockTextsOf(message)));
    }
    // A heading block carries its level in the marker; both readers strip it and keep the text.
    const heading = [
      `分析单元 1/1 · 单元摘要 ${UNIT_DIGEST}`,
      BASELINE_PROMPT_CONTRACT.ownHeader,
      `[${IDENTITIES[0]!}] (heading h3) 合成小节标题`,
    ].join('\n');
    expect(tool.ownBlockTextsOf(heading)).toEqual(['合成小节标题']);
    expect(tool.ownBlockTextsOf(heading)).toEqual(ownBlockTextsOf(heading));
  });

  it('duplicates the own-blocks header literal exactly as the prompt contract declares it', async () => {
    const source = await readFile(TOOL_PATH, 'utf8');
    expect(source).toContain(`const OWN_BLOCKS_HEADER = '${BASELINE_PROMPT_CONTRACT.ownHeader}';`);
    // The tool imports nothing from the built or the source tree: the duplication is the whole point.
    expect(source).not.toMatch(/from '[^']*(?:src|dist)\//u);
  });
});
