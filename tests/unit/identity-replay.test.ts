import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocx } from '../../src/service/docx.js';
import { deriveCoverageManifest, type ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import { initialEvaluationKindDefinition } from '../../src/service/evaluation/initial-evaluation-kind.js';
import { BUILTIN_EVALUATION_PROFILE, evaluationProfileDigest } from '../../src/service/evaluation-records.js';
import { withModelClarification } from '../../src/service/provider/clarification-contract.js';
import { OPENCODE_GO_ROUTE_PROFILE } from '../../src/service/provider/deepseek-adapter.js';
import { identityForm, identityRemap } from '../../src/service/provider/identity-replay.js';
import { transmitOnce, type LiveModelFetch } from '../../src/service/provider/live-transmission.js';
import { ProviderResultCache, isModelCallLine } from '../../src/service/provider/provider-result-cache.js';
import type { DevelopmentValidationIntent } from '../../src/shared/protocol.js';

// The #1585 no-send reconstruction as a provider-free test: exact sample1 imported twice, each initial-evaluation unit request
// built by the product's own kind definition and clarification wrapper. Only block identities differ, so every unit maps.
const root = fileURLToPath(new URL('../../', import.meta.url));
const SAMPLE1_DIGEST = 'b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483';
const MODEL = 'deepseek-v4.1-flash';
const block = (seed: string) => `blk_${seed.repeat(24)}`;
const userBody = (content: string) => JSON.stringify({ model: MODEL, messages: [{ role: 'user', content }] });
/** The captured request's mapping onto the current one, through the current request's form. */
const remapOnto = (captured: string, current: string) => {
  const form = identityForm(current);
  return form === null ? null : identityRemap(captured, form);
};

/** Exact sample1 imported twice: the same blocks, newly minted identities, and the product's own 初评 unit messages. */
async function sample1Twice() {
  const blocks: ManifestBlockInput[] = [];
  await parseDocx(resolve(root, 'SampleBooks/sample1.docx'), 'sample1.docx', (parsed) => blocks.push({ ...parsed, graphemes: parsed.graphemeLength }), { digest: SAMPLE1_DIGEST, bytes: 29_550 });
  const imported = (minted: ManifestBlockInput[]) => {
    const manifest = deriveCoverageManifest({ bookId: randomUUID(), manuscriptId: randomUUID(), branchId: randomUUID(), revisionId: randomUUID(), revisionLabel: 'r1', revisionDigest: 'a'.repeat(64), blocks: minted });
    return { manifest, byId: new Map(minted.map((entry) => [entry.blockId, entry])) };
  };
  const first = imported(blocks);
  const second = imported(blocks.map((entry) => ({ ...entry, blockId: `blk_${randomBytes(12).toString('hex')}` })));
  const definition = withModelClarification(initialEvaluationKindDefinition({ ...BUILTIN_EVALUATION_PROFILE, sha256: evaluationProfileDigest(BUILTIN_EVALUATION_PROFILE) }));
  const message = (book: ReturnType<typeof imported>, ordinal: number) => definition.buildUnitMessage(book.manifest.units[ordinal]!, book.manifest.units.length, book.byId);
  const body = (user: string) => JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: definition.systemPrompt }, { role: 'user', content: user }] });
  const ids = (book: ReturnType<typeof imported>, ordinal: number) => [...book.manifest.units[ordinal]!.overlapBlockIds, ...book.manifest.units[ordinal]!.blockIds];
  return { first, second, definition, message, body, ids };
}

describe('identity-normalised forms of initial-evaluation unit requests (#1585)', () => {
  it('maps every unit of a fresh import of sample1 onto the earlier one by block identity alone', async () => {
    const { first, second, message, body, ids } = await sample1Twice();
    expect(second.manifest.units).toHaveLength(first.manifest.units.length);
    for (let ordinal = 0; ordinal < first.manifest.units.length; ordinal++) {
      const earlier = message(first, ordinal);
      const fresh = message(second, ordinal);
      expect(fresh).not.toBe(earlier);
      // The header and the clarification line carry identity-free digests: byte-exact across the two imports.
      expect(fresh.split('\n')[1]).toMatch(/^AI7 单元指令\/2 · 请求摘要 [0-9a-f]{64}$/u);
      expect(fresh.split('\n').slice(0, 2)).toEqual(earlier.split('\n').slice(0, 2));
      // Each earlier block identity maps onto the block at the same place in the fresh import.
      const after = ids(second, ordinal);
      expect(remapOnto(body(earlier), body(fresh))?.get('block')).toEqual(new Map(ids(first, ordinal).map((id, index) => [id, after[index]!])));
      // One more byte of manuscript text is another question.
      expect(remapOnto(body(earlier), body(`${fresh}！`))).toBeNull();
    }
  });

  it('answers a final-only 初评 launch declaring an input delta: eight replayed units, one sent and separately accounted synthesis', async () => {
    const { first, second, definition, message, body } = await sample1Twice();
    const cacheRoot = await mkdtemp(join(tmpdir(), 'ai7-identity-replay-'));
    try {
      const cache = new ProviderResultCache(cacheRoot);
      await cache.open();
      const sent: string[] = [];
      // A unit answer cites the first block its message lists; a synthesis answer cites none.
      const fetch: LiveModelFetch = async (_url, init) => {
        sent.push(init.body);
        const cited = /blk_[0-9a-f]{24}/u.exec(init.body)?.[0] ?? null;
        return { status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ cited }) } }], usage: cited === null ? { prompt_tokens: 70, completion_tokens: 50 } : { prompt_tokens: 3, completion_tokens: 2 } }) };
      };
      const call = (intent: DevelopmentValidationIntent, step: string, requestBody: string) => transmitOnce(cache, fetch,
        { purpose: 'evaluation-first', promptContractDigest: definition.promptContractDigest },
        { intent, step: `evaluation-first/${step}`, requestShape: 'openai-chat-completions' },
        OPENCODE_GO_ROUTE_PROFILE, MODEL, 'https://x.invalid/v1/chat/completions', { method: 'POST', headers: {}, body: requestBody });
      const units = first.manifest.units.length;
      const synthesis = (supplement: string) => body(`评估综合 ${units}/${units} · 依据摘要 ${'d'.repeat(64)}${supplement}`);
      const recorded: DevelopmentValidationIntent = { family: 'editorial-evidence', case: 'sample1-initial-evaluation', delta: null };
      for (let ordinal = 0; ordinal < units; ordinal++) await call(recorded, `unit-${ordinal + 1}`, body(message(first, ordinal)));
      await call(recorded, 'reduction', synthesis(''));
      expect(sent).toHaveLength(units + 1);
      // The final-only launch must declare `input`, or its new synthesis is refused as similar evidence.
      const finalOnly: DevelopmentValidationIntent = { family: 'editorial-evidence', case: 'sample1-final-only', delta: { kind: 'input', rationale: 'the synthesis gains the frozen synopsis supplement' } };
      for (let ordinal = 0; ordinal < units; ordinal++) {
        const answered = await call(finalOnly, `unit-${ordinal + 1}`, body(message(second, ordinal)));
        expect(answered.replayed).toBe(true);
        expect(JSON.parse(((await answered.json()) as { choices: [{ message: { content: string } }] }).choices[0].message.content).cited)
          .toBe(second.manifest.units[ordinal]!.overlapBlockIds[0] ?? second.manifest.units[ordinal]!.blockIds[0]);
      }
      const final = await call(finalOnly, 'reduction', synthesis('\n以下为冻结的章节梗概：……'));
      expect(final.replayed).toBeUndefined();
      expect(sent).toHaveLength(units + 2);
      const later = cache.lines.filter(isModelCallLine).slice(units + 1);
      expect(later.map((line) => [line.outcome, line.validation?.decision])).toEqual([
        ...Array.from({ length: units }, () => ['replayed', 'identity-replay']), ['transmitted', 'input-delta'],
      ]);
      expect(later.slice(0, units).every((line) => line.incurredUsage?.inputTokens === 0 && line.incurredUsage.outputTokens === 0 &&
        line.usage?.inputTokens === 3)).toBe(true);
      expect(later[units]).toMatchObject({ usage: { inputTokens: 70, outputTokens: 50 }, incurredUsage: { inputTokens: 70, outputTokens: 50 },
        validation: { evidence: [`S40/evaluation-first/${units + 1}`] } });
      expect(cache.counts()).toEqual({ transmitted: units + 2, replayed: units, failed: 0 });
      expect(cache.usageTotals()).toEqual({
        recorded: { inputTokens: 3 * units * 2 + 140, outputTokens: 2 * units * 2 + 100 },
        incurred: { inputTokens: 3 * units + 140, outputTokens: 2 * units + 100 },
      });
    } finally {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  });
});

describe('the identity mapping is one-to-one (#1585)', () => {
  const unit = (...lines: string[]) => userBody([`评估单元 1/8 · 单元摘要 ${'c'.repeat(64)}`, ...lines].join('\n'));
  const crossUnit = (...listing: string[]) => userBody([`跨单元归纳 2/8 · 单元集摘要 ${'e'.repeat(64)}`, '各单元引用的内容块标识（按首次引用顺序）：', ...listing].join('\n'));

  it('maps a repeated identity onto one repeated identity', () => {
    expect(remapOnto(unit(`[${block('a')}] (paragraph) 雨`, `[${block('a')}] (paragraph) 雪`), unit(`[${block('b')}] (paragraph) 雨`, `[${block('b')}] (paragraph) 雪`))?.get('block'))
      .toEqual(new Map([[block('a'), block('b')]]));
    expect(remapOnto(crossUnit(`单元 1：${block('a')}、${block('c')}`, `单元 2：${block('a')}`), crossUnit(`单元 1：${block('b')}、${block('d')}`, `单元 2：${block('b')}`))?.get('block'))
      .toEqual(new Map([[block('a'), block('b')], [block('c'), block('d')]]));
  });

  it('maps no many-to-one, no one-to-many, and no listing that breaks the same block under two units', () => {
    expect(remapOnto(unit(`[${block('a')}] (paragraph) 雨`, `[${block('c')}] (paragraph) 雪`), unit(`[${block('b')}] (paragraph) 雨`, `[${block('b')}] (paragraph) 雪`))).toBeNull();
    expect(remapOnto(unit(`[${block('a')}] (paragraph) 雨`, `[${block('a')}] (paragraph) 雪`), unit(`[${block('b')}] (paragraph) 雨`, `[${block('d')}] (paragraph) 雪`))).toBeNull();
    expect(remapOnto(crossUnit(`单元 1：${block('a')}、${block('c')}`, `单元 2：${block('a')}`), crossUnit(`单元 1：${block('b')}、${block('d')}`, `单元 2：${block('e')}`))).toBeNull();
  });

  it('never normalises a recognised message that already holds a slot placeholder, in either direction', () => {
    const real = unit(`[${block('a')}] (paragraph) 雨`);
    const literal = unit('[<block-0>] (paragraph) 雨');
    expect(identityForm(literal)).toBeNull();
    expect(identityRemap(literal, identityForm(real)!)).toBeNull();
    // Equal forms and equal slot counts: only the placeholder tells the literal line from a real block line.
    expect(identityForm(unit(`[${block('a')}] (paragraph) 雨`, '[<block-0>] (paragraph) 雪'))).toBeNull();
    expect(identityRemap(unit(`[${block('a')}] (paragraph) 雨`, '[<block-0>] (paragraph) 雪'), identityForm(unit(`[${block('b')}] (paragraph) 雨`, `[${block('b')}] (paragraph) 雪`))!)).toBeNull();
  });
});
