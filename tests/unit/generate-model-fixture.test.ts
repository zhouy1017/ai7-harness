import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BASELINE_PROMPT_CONTRACT, BASELINE_PROMPT_CONTRACT_DIGEST, parseUnitMessageHeader, unitRequestDigest } from '../../src/service/analysis/contract.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  assuranceSamplingRequestDigest,
  parseAssuranceSamplingListedRefs,
  parseAssuranceSamplingMessageHeader,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2,
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST,
} from '../../src/service/analysis/assurance-sampling-contract.js';
import {
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT,
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST,
  crossUnitRequestDigest,
  parseCrossUnitCitedBlocks,
  parseCrossUnitMessageHeader,
} from '../../src/service/analysis/cross-unit-contract.js';
import {
  RUN_REPORT_REFLECTION_PROMPT_CONTRACT,
  RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST,
  parseRunReportReflectionMessageHeader,
  runReportReflectionRequestDigest,
} from '../../src/service/analysis/run-report-contract.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { transmitOnce, type LiveModelFetch } from '../../src/service/provider/live-transmission.js';
import {
  ownBlockIdsOf,
  ownBlockTextsOf,
  substituteAssuranceSamplingRefPlaceholders,
  substituteCrossUnitBlockPlaceholders,
  unitContentDigest,
} from '../../src/service/provider/local-deterministic-adapter.js';
import { parseModelFixture } from '../../src/service/provider/model-fixture.js';
import { ProviderResultCache, providerCacheKey, providerEvidenceGeneration } from '../../src/service/provider/provider-result-cache.js';
import { FACTUAL_REVIEW_PROMPT_CONTRACT, parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { reviewCategoryContractInput, reviewCategoryEntry } from '../../src/service/review/category-configuration.js';
import { parseReviewCategoryUnitMessageHeader, reviewCategoryContract } from '../../src/service/review/review-category-contract.js';
import { parseInitialEvaluationSynthesisMessageHeader, parseInitialEvaluationUnitMessageHeader } from '../../src/service/evaluation/initial-evaluation-contract.js';
import { parseReadersReportSynthesisMessageHeader, parseReadersReportUnitMessageHeader } from '../../src/service/evaluation/readers-report-contract.js';
import { parseEvaluationRewriteSynthesisMessageHeader, parseEvaluationRewriteUnitMessageHeader } from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import { parseWritingSynthesisMessageHeader, parseWritingUnitMessageHeader } from '../../src/service/writing/writing-contract.js';
import { parseDialogueMessageHeader } from '../../src/service/dialogue/contract.js';

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
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST: string;
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST: string;
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST: string;
  ASSURANCE_SAMPLING_V1_INSTRUCTION_SHA256: string;
  ASSURANCE_SAMPLING_V2_INSTRUCTION_SHA256: string;
  RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST: string;
  crossUnitRequestDigest: (promptContractDigest: string, setDigest: string) => string;
  assuranceSamplingRequestDigest: (promptContractDigest: string, unitOrdinal: number, unitDigest: string, sampleDigest: string) => string;
  runReportReflectionRequestDigest: (promptContractDigest: string, accountingDigest: string) => string;
  parseCrossUnitMessageHeader: (text: string) => unknown;
  parseCrossUnitCitedBlocks: (text: string) => Map<number, string[]>;
  parseAssuranceSamplingMessageHeader: (text: string) => unknown;
  parseAssuranceSamplingListedRefs: (text: string) => string[];
  parseRunReportReflectionMessageHeader: (text: string) => unknown;
  namespacedCacheKey: (namespace: { route: string; endpoint: string; requestShape: string; model: string }, requestDigest: string) => string;
  evidenceGeneration: (
    namespace: { route: string; endpoint: string; requestShape: string; model: string }, promptContractDigest: string, taskPromptContractDigest?: string | null,
  ) => string;
  parseTaskHeader: (text: string, promptContractDigest: string) => { subject: string; unitOrdinal: number; requestDigest: string } | null;
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
    // The entry keeps the usage its response states, as the cache has always written it.
    const counts = (response as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
    const usage = Number.isSafeInteger(counts?.prompt_tokens) && Number.isSafeInteger(counts?.completion_tokens)
      ? { inputTokens: counts!.prompt_tokens as number, outputTokens: counts!.completion_tokens as number }
      : null;
    await writeFile(tool.cacheEntryPath(root, model, requestDigest),
      `${JSON.stringify({ model, requestDigest, requestBody, status, response, usage, transmittedAt: '2026-09-08T00:00:00.000Z' })}\n`, 'utf8');
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
    // Ordinary conversion stays build-independent; exact sample1 proof bundles the existing source owners in memory.
    expect(source).not.toMatch(/^import .*from '[^']*(?:src|dist)\//mu);
  });
});

// Issue #808: the converter reads what the real cache writes — namespaced entries captured through `transmitOnce` — and
// converts the reduction, a sampling turn and the reflection beside the unit, each under its own contract's key, with every
// minted identity remapped to the placeholder the deterministic adapter fills and the capture's provenance kept.
const ENDPOINT = 'https://x.invalid/v1/chat/completions';
const VALIDATION = { family: 'baseline-analysis', case: 'sample1-whole-book', delta: null } as const;
const BLOCKS = [`blk_${'3'.repeat(24)}`, `blk_${'4'.repeat(24)}`, `blk_${'5'.repeat(24)}`];

function reductionMessage(setDigest = 'd'.repeat(64)): string {
  return [
    BASELINE_CROSS_UNIT_PROMPT_CONTRACT.messageHeader.replace('{closed}', '2').replace('{total}', '3').replace('{unitSetDigest}', setDigest),
    '合成单元结果占位。',
    BASELINE_CROSS_UNIT_PROMPT_CONTRACT.citedBlocksHeader,
    `单元 1：${BLOCKS[0]!}${BASELINE_CROSS_UNIT_PROMPT_CONTRACT.blockIdSeparator}${BLOCKS[1]!}`,
    `单元 2：${BLOCKS[2]!}`,
  ].join('\n');
}

/** A sampling turn's message under an exact contract; tests may replace its instruction to exercise refusal (Issue #826). */
function samplingMessage(instruction = ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction): string {
  return [
    ASSURANCE_SAMPLING_PROMPT_CONTRACT.messageHeader.replace('{unitOrdinal}', '2').replace('{totalUnits}', '3')
      .replace('{unitDigest}', 'a'.repeat(64)).replace('{sampleDigest}', 'b'.repeat(64)),
    ...(instruction === '' ? [] : [instruction]),
    ASSURANCE_SAMPLING_PROMPT_CONTRACT.ownHeader,
    `[${BLOCKS[0]!}] (paragraph) ${OWN_TEXTS[0]!}`,
    ASSURANCE_SAMPLING_PROMPT_CONTRACT.findingHeader,
    '- [f1]（主要）合成发现一。',
    '- [f12]（次要）合成发现二。',
  ].join('\n');
}

function reflectionMessage(runRecordId: string): string {
  return [RUN_REPORT_REFLECTION_PROMPT_CONTRACT.messageHeader.replace('{runRecordId}', runRecordId).replace('{accountingDigest}', 'c'.repeat(64)), '{"stages":[]}'].join('\n');
}

const answer = (content: string): LiveModelFetch => async () => ({
  status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 120 } }),
});

async function capture(root: string, message: string, content: string, step: string, samplingContractDigest = ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST): Promise<string> {
  const cache = new ProviderResultCache(root);
  await cache.open();
  const promptContractDigest = message.startsWith('跨单元') ? BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST
    : message.startsWith('保证抽样') ? samplingContractDigest
    : message.startsWith('运行反思') ? RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST : BASELINE_PROMPT_CONTRACT_DIGEST;
  await transmitOnce(cache, answer(content), { purpose: 'first-baseline', promptContractDigest, taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST },
    { intent: VALIDATION, step, requestShape: 'openai-chat-completions' }, OPENCODE_GO_ROUTE_PROFILE, MODEL, ENDPOINT,
    { method: 'POST', headers: { authorization: 'Bearer placeholder' }, body: chatBody(message) });
  return chatBody(message);
}

describe('generate-model-fixture over the namespaced cache (Issue #808)', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-fixture-gen-808-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const request = (selector: string): Request => ({ selector, cacheRoot: root, identity: 'generated-808', description: '合成生成夹具', out: join(root, 'out.json') });

  it('converts a reduction under the cross-unit contract, remapping its cited blocks and keeping the capture provenance', async () => {
    const content = JSON.stringify({ findings: [{ claim: '合成跨单元发现。', sourceRanges: [{ blockId: BLOCKS[1]! }, { blockId: BLOCKS[2]! }] }] });
    const body = await capture(root, reductionMessage(), content, 'first-baseline/reduction');
    const fixture = parseModelFixture(await tool.generateModelFixture(request('S40/first-baseline/1'), new Date('2026-10-12T00:00:00.000Z')));
    const entry = fixture.entries[0]!;
    expect(entry).toMatchObject({ unitOrdinal: 0, requestDigest: crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, 'd'.repeat(64)), contentDigest: null });
    const text = (entry.response as { text: string }).text;
    expect(text).not.toMatch(/blk_/u);
    // The deterministic adapter fills the placeholders from the message it answers and gets the captured answer back.
    expect(substituteCrossUnitBlockPlaceholders(text, parseCrossUnitCitedBlocks(reductionMessage()))).toBe(content);
    expect(entry.capture).toMatchObject({
      subject: 'reduction', itemId: 'S40/first-baseline/1', selectedItemId: 'S40/first-baseline/1', evidenceScope: 'namespaced',
      route: 'opencode-go', endpoint: ENDPOINT, requestShape: 'openai-chat-completions', model: MODEL,
      promptContractDigest: BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, capturedAt: expect.any(String) as string,
      providerRequestDigest: sha256Hex(body),
      providerResponseDigest: sha256Hex(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 120 } })),
      validation: { family: 'baseline-analysis', case: 'sample1-whole-book', step: 'first-baseline/reduction' },
      identityMap: [{ placeholder: '{{unit:1:block:2}}', identity: BLOCKS[1]! }, { placeholder: '{{unit:2:block:1}}', identity: BLOCKS[2]! }],
    });
    // The capture's request carried a stand-in credential header; nothing of a header reaches the cache or the fixture.
    expect(JSON.stringify(fixture)).not.toMatch(/Bearer|authorization/u);
    // Naming the replay of the capture converts the same capture, and says which item was named.
    await capture(root, reductionMessage(), content, 'reanalyze-book/reduction');
    const viaReplay = parseModelFixture(await tool.generateModelFixture(request('S40/first-baseline/2'), new Date('2026-10-12T00:00:00.000Z')));
    expect(viaReplay.entries[0]!.capture).toMatchObject({ itemId: 'S40/first-baseline/1', selectedItemId: 'S40/first-baseline/2' });
    expect(viaReplay.entries[0]!.response).toEqual(entry.response);
  });

  it('remaps bare-index finding references only where the sampling result uses them as references', async () => {
    const message = samplingMessage().replace('[f1]', '[0]').replace('[f12]', '[1]');
    const content = JSON.stringify({ schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: [
      { ref: '0', disposition: '成立', reason: '合成理由，第1处。' }, { ref: '1', disposition: '需降级', reason: '合成理由，见 0 号。' },
    ] });
    await capture(root, message, content, 'first-baseline/sampling-1-unit-2');
    const text = (parseModelFixture(await tool.generateModelFixture(request('S40/first-baseline/1'))).entries[0]!.response as { text: string }).text;
    expect(JSON.parse(text)).toMatchObject({ schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: [
      { ref: '{{ref:1}}', reason: '合成理由，第1处。' }, { ref: '{{ref:2}}', reason: '合成理由，见 0 号。' },
    ] });
    // A replay that lists other references fills only the references.
    expect(JSON.parse(substituteAssuranceSamplingRefPlaceholders(text, ['4', '7']))).toMatchObject({
      schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: [{ ref: '4' }, { ref: '7' }],
    });
  });

  it('converts a sampling turn, remapping its listed findings as references only', async () => {
    const content = JSON.stringify([{ ref: 'f1', disposition: '成立', reason: '合成理由一。' }, { ref: 'f12', disposition: '需降级', reason: '合成理由二，提到 f1。' }]);
    await capture(root, samplingMessage(), content, 'first-baseline/sampling-1-unit-2');
    const entry = parseModelFixture(await tool.generateModelFixture(request('S40/first-baseline/1'))).entries[0]!;
    expect(entry).toMatchObject({ unitOrdinal: 0, requestDigest: assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 2, 'a'.repeat(64), 'b'.repeat(64)) });
    const text = (entry.response as { text: string }).text;
    expect(text).toContain('"ref":"{{ref:1}}"');
    expect(text).toContain('"ref":"{{ref:2}}"');
    expect(substituteAssuranceSamplingRefPlaceholders(text, parseAssuranceSamplingListedRefs(samplingMessage()))).toBe(content);
    expect(entry.capture!.identityMap).toEqual([{ placeholder: '{{ref:1}}', identity: 'f1' }, { placeholder: '{{ref:2}}', identity: 'f12' }]);
  });

  it('converts a sampling turn written under sampling /2 with its /2 key (#826)', async () => {
    const content = JSON.stringify({ schema: ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2.responseSchema, dispositions: [
      { ref: 'f1', disposition: '成立', reason: '合成理由一。' }, { ref: 'f12', disposition: '需降级', reason: '合成理由二。' },
    ] });
    const message = samplingMessage(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2.instruction);
    await capture(root, message, content, 'reanalyze-range/sampling-1-unit-2', ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST);
    const entry = parseModelFixture(await tool.generateModelFixture(request('S40/first-baseline/1'))).entries[0]!;
    expect(entry).toMatchObject({ unitOrdinal: 0, requestDigest: assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST, 2, 'a'.repeat(64), 'b'.repeat(64)) });
    expect(entry.capture).toMatchObject({ subject: 'sampling', promptContractDigest: ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST });
  });

  it.each([
    ['a /2 message recorded as /1', () => samplingMessage(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2.instruction), ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST],
    ['a /1 message recorded as /2', () => samplingMessage(ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction), ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST],
    ['a missing instruction recorded as /1', () => samplingMessage(''), ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST],
    ['an unknown instruction recorded as /1', () => samplingMessage('未知抽样指令。'), ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST],
    ['a modified /1 instruction recorded as /1', () => samplingMessage(ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction.replace('200', '201')), ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST],
    ['a modified /2 instruction recorded as /1', () => samplingMessage(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2.instruction.replace('200', '201')), ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST],
    ['an extended /1 instruction recorded as /1', () => samplingMessage(`${ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction}\n额外指令。`), ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST],
    ['an extended /2 instruction recorded as /2', () => samplingMessage(`${ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2.instruction}\n额外指令。`), ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST],
  ])('refuses %s rather than relabel its sampling contract (#826)', async (_label, message, recorded) => {
    await capture(root, message(), JSON.stringify({ dispositions: [] }), 'reanalyze-range/sampling-1-unit-2', recorded);
    await expect(tool.generateModelFixture(request('S40/first-baseline/1'))).rejects.toThrowError(/FIXTURE_GEN\/contract-mismatch/u);
    await expect(stat(join(root, 'out.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('converts the reflection under its own contract, keyed by the accounting and nothing minted', async () => {
    await capture(root, reflectionMessage(randomUUID()), JSON.stringify({ ifRedone: [{ change: '合成改进。' }] }), 'first-baseline/reflection');
    const entry = parseModelFixture(await tool.generateModelFixture(request('S40/first-baseline/1'))).entries[0]!;
    expect(entry).toMatchObject({ unitOrdinal: 0, requestDigest: runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, 'c'.repeat(64)), contentDigest: null });
    expect(entry.capture).toMatchObject({ subject: 'reflection', identityMap: [] });
  });

  it('converts a unit with its own blocks remapped, so the entry answers a fresh import through its content digest', async () => {
    const content = UNIT_RESULT('合成概述：本单元交代人物甲的出场。', `合成注记：见 ${IDENTITIES[1]!}。`);
    await capture(root, unitMessage(), content, 'first-baseline/unit-1');
    const entry = parseModelFixture(await tool.generateModelFixture(request('S40/first-baseline/1'))).entries[0]!;
    expect(entry).toMatchObject({ unitOrdinal: 1, contentDigest: unitContentDigest(OWN_TEXTS) });
    expect((entry.response as { text: string }).text).toContain('{{block:2}}');
    expect(entry.capture!.identityMap).toEqual([{ placeholder: '{{block:2}}', identity: IDENTITIES[1]! }]);
  });

  it('refuses a retired capture, a refused call, and an identity the request never named, writing nothing', async () => {
    const stray = JSON.stringify({ findings: [{ claim: '合成发现。', sourceRanges: [{ blockId: `blk_${'9'.repeat(24)}` }] }] });
    await capture(root, reductionMessage(), stray, 'first-baseline/reduction');
    await expect(tool.generateModelFixture(request('S40/first-baseline/1'))).rejects.toMatchObject({ code: 'FIXTURE_GEN/identity-unmapped' });
    const cache = new ProviderResultCache(root);
    await cache.open();
    await cache.invalidate({ itemId: 'S40/first-baseline/1' }, 'captured-with-stray-identity');
    await expect(tool.generateModelFixture(request('S40/first-baseline/1'))).rejects.toMatchObject({ code: 'FIXTURE_GEN/item-retired' });
    // A capture retired with its whole validation case converts to nothing either, and neither does a refusal's line.
    await capture(root, reflectionMessage(randomUUID()), '{}', 'first-baseline/reflection');
    await cache.invalidate({ family: 'baseline-analysis', case: 'sample1-whole-book' }, 'sample-edited-by-tester');
    await expect(tool.generateModelFixture(request('S40/first-baseline/2'))).rejects.toMatchObject({ code: 'FIXTURE_GEN/item-retired' });
    const lines = await tool.readLedgerLines(root);
    expect(() => tool.resolveLedgerSelection([...lines, { ...lines[0]!, itemId: 'S40/first-baseline/9', outcome: 'refused' }], 'S40/first-baseline/9'))
      .toThrowError(/FIXTURE_GEN\/item-unknown/u);
    expect(await absent(join(root, 'out.json'))).toBe(true);
  });

  it('says a capture cached before #808 is legacy, with no route, endpoint or request shape recorded', async () => {
    await buildCache(root);
    const entry = parseModelFixture(await tool.generateModelFixture(request(ITEM_ID))).entries[0]!;
    expect(entry.capture).toMatchObject({ subject: 'unit', itemId: ITEM_ID, evidenceScope: 'legacy-unnamespaced', route: null, endpoint: null, requestShape: null, validation: null });
  });

  it('refuses a capture record the schema does not admit', () => {
    const base = {
      schema: 'ai7.model-fixture/1', identity: 'x', description: '合成', basedOn: null, provider: 'ai7-local-deterministic', model: 'ai7-deterministic-fixture',
    };
    const capture = {
      subject: 'unit', itemId: 'S40/first-baseline/1', selectedItemId: 'S40/first-baseline/1', evidenceScope: 'namespaced', route: 'opencode-go',
      endpoint: ENDPOINT, requestShape: 'openai-chat-completions', model: MODEL, promptContractDigest: 'a'.repeat(64), taskPromptContractDigest: 'a'.repeat(64), capturedAt: '2026-10-12T00:00:00.000Z',
      providerRequestDigest: 'b'.repeat(64), providerResponseDigest: 'c'.repeat(64),
      responseDigestOrigin: 'recorded',
      cacheKey: tool.namespacedCacheKey({ route: 'opencode-go', endpoint: ENDPOINT, requestShape: 'openai-chat-completions', model: MODEL }, 'b'.repeat(64)),
      generation: sha256Hex(JSON.stringify(['opencode-go', ENDPOINT, 'openai-chat-completions', MODEL, 'a'.repeat(64)])),
      fixtureResponseDigest: sha256Hex(canonicalJson({ kind: 'interrupted', message: '合成' })),
      validation: { family: 'a', case: 'b', step: 'unit-1' }, identityMap: [],
    };
    const entry = (overrides: Record<string, unknown>) => ({ ...base, entries: [{ unitOrdinal: 1, requestDigest: 'd'.repeat(64), response: { kind: 'interrupted', message: '合成' }, capture: { ...capture, ...overrides } }] });
    expect(parseModelFixture(entry({})).entries[0]!.capture).toEqual(capture);
    for (const overrides of [{ subject: 'unknown' }, { identityMap: [{ placeholder: '{{other:1}}', identity: 'x' }] }, { evidenceScope: 'legacy-unnamespaced' },
      { providerRequestDigest: 'short' }, { extra: true }, { validation: { family: 'a', case: 'b' } }]) {
      expect(() => parseModelFixture(entry(overrides)), JSON.stringify(overrides)).toThrowError(/夹具/u);
    }
  });
});

describe('generate-model-fixture agreement with the #808 owners', () => {
  it('duplicates the three suboperation contract digests and their request-digest formulas exactly', () => {
    expect(tool.BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST).toBe(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST);
    expect(tool.ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST).toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST);
    expect(tool.ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST).toBe(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2_DIGEST);
    expect(tool.ASSURANCE_SAMPLING_V1_INSTRUCTION_SHA256).toBe(sha256Hex(ASSURANCE_SAMPLING_PROMPT_CONTRACT.instruction));
    expect(tool.ASSURANCE_SAMPLING_V2_INSTRUCTION_SHA256).toBe(sha256Hex(ASSURANCE_SAMPLING_PROMPT_CONTRACT_V2.instruction));
    expect(tool.RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST).toBe(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST);
    expect(tool.crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, 'e'.repeat(64))).toBe(crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, 'e'.repeat(64)));
    expect(tool.assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 3, 'a'.repeat(64), 'b'.repeat(64)))
      .toBe(assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, 3, 'a'.repeat(64), 'b'.repeat(64)));
    expect(tool.runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, 'c'.repeat(64)))
      .toBe(runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, 'c'.repeat(64)));
  });

  it('reads the reduction, sampling and reflection messages exactly as their contracts do', () => {
    for (const message of [reductionMessage(), samplingMessage(), reflectionMessage(randomUUID()), unitMessage(), '没有消息头']) {
      expect(tool.parseCrossUnitMessageHeader(message)).toEqual(parseCrossUnitMessageHeader(message));
      expect(tool.parseCrossUnitCitedBlocks(message)).toEqual(parseCrossUnitCitedBlocks(message));
      expect(tool.parseAssuranceSamplingMessageHeader(message)).toEqual(parseAssuranceSamplingMessageHeader(message));
      expect(tool.parseAssuranceSamplingListedRefs(message)).toEqual(parseAssuranceSamplingListedRefs(message));
      expect(tool.parseRunReportReflectionMessageHeader(message)).toEqual(parseRunReportReflectionMessageHeader(message));
    }
  });

  it('keys a namespaced entry by the same formula the cache writes it with', () => {
    const namespace = { route: 'opencode-go', endpoint: ENDPOINT, requestShape: 'openai-chat-completions', model: MODEL };
    expect(tool.namespacedCacheKey(namespace, 'f'.repeat(64))).toBe(providerCacheKey(namespace, 'f'.repeat(64)));
  });

  it('derives the evidence generation as the cache does, joining the enclosing task contract only when it differs', () => {
    const namespace = { route: 'opencode-go', endpoint: ENDPOINT, requestShape: 'openai-chat-completions', model: MODEL };
    for (const task of [undefined, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, BASELINE_PROMPT_CONTRACT_DIGEST]) {
      expect(tool.evidenceGeneration(namespace, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, task))
        .toBe(providerEvidenceGeneration(namespace, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, task));
    }
    expect(tool.evidenceGeneration(namespace, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, BASELINE_PROMPT_CONTRACT_DIGEST))
      .not.toBe(tool.evidenceGeneration(namespace, BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST));
  });

  it('reads own blocks under every own-blocks header the deterministic adapter reads them under', () => {
    const review = reviewCategoryContract(reviewCategoryContractInput(reviewCategoryEntry('typos-and-usage')!));
    for (const ownHeader of [BASELINE_PROMPT_CONTRACT.ownHeader, FACTUAL_REVIEW_PROMPT_CONTRACT.ownHeader, review.ownHeader, ASSURANCE_SAMPLING_PROMPT_CONTRACT.ownHeader]) {
      const message = [`合成单元 1/1 · 单元摘要 ${'c'.repeat(64)}`, ownHeader, `[${BLOCKS[0]!}] (paragraph) 合成一。`, `[${BLOCKS[1]!}] (heading h2) 合成二`].join('\n');
      expect(tool.ownBlockIdsOf(message), ownHeader).toEqual(ownBlockIdsOf(message));
      expect(tool.ownBlockTextsOf(message), ownHeader).toEqual(ownBlockTextsOf(message));
      expect(tool.ownBlockIdsOf(message), ownHeader).toHaveLength(2);
    }
  });

  it('recognizes exactly the task headers their owning contracts parse', () => {
    const digest = 'e'.repeat(64);
    const cases: Array<[string, (text: string) => unknown]> = [
      [`事实核查单元 2/3 · 单元摘要 ${digest}`, parseFactualReviewUnitMessageHeader],
      [`事实核查单元 0/3 · 单元摘要 ${digest}`, parseFactualReviewUnitMessageHeader],
      [`审阅单元 1/1 · 类别 typos-and-usage · 单元摘要 ${digest}`, parseReviewCategoryUnitMessageHeader],
      [`审阅单元 1/1 · 类别 ${'a'.repeat(49)} · 单元摘要 ${digest}`, parseReviewCategoryUnitMessageHeader],
      [`审阅单元 1/1 · 类别 Typos · 单元摘要 ${digest}`, parseReviewCategoryUnitMessageHeader],
      [`审阅单元 1/1 · 单元摘要 ${digest}`, parseReviewCategoryUnitMessageHeader],
      [`评估单元 3/2 · 单元摘要 ${digest}`, parseInitialEvaluationUnitMessageHeader],
      [`评估单元 1/2 · 类别 typos · 单元摘要 ${digest}`, parseInitialEvaluationUnitMessageHeader],
      [`审稿意见单元 1/2 · 单元摘要 ${digest}`, parseReadersReportUnitMessageHeader],
      [`评语重写单元 2/2 · 单元摘要 ${digest}`, parseEvaluationRewriteUnitMessageHeader],
      [`写作单元 1/1 · 单元摘要 ${digest.slice(1)}`, parseWritingUnitMessageHeader],
      [`评估综合 1/2 · 依据摘要 ${digest}`, parseInitialEvaluationSynthesisMessageHeader],
      [`评估综合 1/2 · 段落摘要 ${digest}`, parseInitialEvaluationSynthesisMessageHeader],
      [`审稿意见综合 2/2 · 段落摘要 ${digest}`, parseReadersReportSynthesisMessageHeader],
      [`评语重写综合 0/2 · 依据摘要 ${digest}`, parseEvaluationRewriteSynthesisMessageHeader],
      [`写作综合 2/2 · 段落摘要 ${digest}`, parseWritingSynthesisMessageHeader],
      [`AI7 编辑对话 · 接着回答 · 问题摘要 ${digest}`, parseDialogueMessageHeader],
      [`AI7 编辑对话 · 追问 · 问题摘要 ${digest}`, parseDialogueMessageHeader],
    ];
    for (const [header, owner] of cases) {
      expect(tool.parseTaskHeader(`${header}\n合成正文`, BASELINE_PROMPT_CONTRACT_DIGEST) === null, header).toBe(owner(`${header}\n合成正文`) === null);
    }
  });
});

describe('generate-model-fixture provenance edges (Issue #808)', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai7-fixture-gen-edges-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const request = (selector: string): Request => ({ selector, cacheRoot: root, identity: 'generated-808', description: '合成生成夹具', out: join(root, 'out.json') });

  it('retires a capture whose validation case was invalidated while its call was in flight', async () => {
    const cache = new ProviderResultCache(root);
    await cache.open();
    // The invalidation lands between the claim and the capture line: by ledger order alone it would precede the capture.
    const inFlight: LiveModelFetch = async () => {
      const other = new ProviderResultCache(root);
      await other.open();
      await other.invalidate({ family: VALIDATION.family, case: VALIDATION.case }, 'sample-edited-in-flight');
      return { status: 200, json: async () => ({ choices: [{ message: { content: '{"ifRedone":[]}' } }], usage: { prompt_tokens: 9, completion_tokens: 3 } }) };
    };
    await transmitOnce(cache, inFlight, { purpose: 'first-baseline', promptContractDigest: RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, taskPromptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST },
      { intent: VALIDATION, step: 'first-baseline/reflection', requestShape: 'openai-chat-completions' }, OPENCODE_GO_ROUTE_PROFILE, MODEL, ENDPOINT,
      { method: 'POST', headers: {}, body: chatBody(reflectionMessage(randomUUID())) });
    const lines = await tool.readLedgerLines(root);
    expect(lines.map((line) => line.kind ?? line.outcome)).toEqual(['invalidation', 'transmitted']);
    await expect(tool.generateModelFixture(request('S40/first-baseline/1'))).rejects.toMatchObject({ code: 'FIXTURE_GEN/item-retired' });
  });

  it('resolves a replay written before #808 to the legacy capture of the same model and request', async () => {
    const requestDigest = sha256Hex(chatBody(unitMessage()));
    await buildCache(root, {
      extraLines: [{
        itemId: 'S40/fixture/2', purpose: 'fixture', model: MODEL, promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST, requestDigest,
        outcome: 'replayed', status: 200, usage: { inputTokens: 1_400, outputTokens: 180 }, recordedAt: '2026-09-09T00:00:00.000Z',
      }],
    });
    for (const selector of [requestDigest, 'S40/fixture/2']) {
      const entry = parseModelFixture(await tool.generateModelFixture(request(selector))).entries[0]!;
      expect(entry.capture, selector).toMatchObject({ itemId: ITEM_ID, selectedItemId: 'S40/fixture/2', evidenceScope: 'legacy-unnamespaced' });
    }
  });

  it('refuses a legacy reduction, whose ledger line names only the enclosing task contract', async () => {
    await buildCache(root, {
      requestBody: chatBody(reductionMessage()),
      response: { choices: [{ message: { content: '{"findings":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } },
    });
    await expect(tool.generateModelFixture(request(ITEM_ID))).rejects.toMatchObject({ code: 'FIXTURE_GEN/capture-unproven' });
  });
});
