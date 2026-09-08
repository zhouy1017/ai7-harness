import type { LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk, GenerateOptions } from '@deepseek-ai/dsh-llm';
import { sha256Hex } from '../analysis/canonical.js';
import { BASELINE_PROMPT_CONTRACT, parseUnitMessageHeader, unitRequestDigest } from '../analysis/contract.js';
import { AI7_FAILURE_CODES, type DshFailureCodes } from './classification.js';
import { LOCAL_DETERMINISTIC_MODEL, LOCAL_DETERMINISTIC_ROUTE } from './egress-gate.js';
import { lastUserMessageText } from './payload.js';
import { fixtureEntryKey, resolveFixtureEntry, type ModelFixtureEntry, type ResolvedModelFixture } from './model-fixture.js';

/**
 * The AI7 local deterministic model adapter: replays a hand-written synthetic fixture in-process and
 * transmits nothing. It is the bound adapter in every supported development launch and in the E2E
 * Gate. Each request is matched by the pair of the unit ordinal parsed from the unit message header
 * and the request digest recomputed from the frozen prompt contract and the manifest unit digest, so
 * one fixture identity serves successive manifests of the same Book; a request the fixture does not
 * describe fails closed as a fixture mismatch, which the Run records as a gap. The adapter counts
 * how often each pair has been served within its own lifetime (one adapter per Run), so an
 * attempt-specific fixture entry answers exactly the n-th request of the same unit and digest and
 * the any-attempt entry answers the rest.
 *
 * A fixture response may name a block of the unit it answers with `{{block:N}}` (the N-th own block
 * listed in the unit message, 1-based). Block identities are minted per import, so a hand-written
 * fixture cannot know them; the placeholder lets a synthetic response cite exact in-unit ranges
 * while echoing nothing of the manuscript beyond those identities.
 *
 * A test may instead construct the adapter with `resolveBy: 'content-digest'`, which keys the same
 * fixture by the unit's own block texts rather than by the request digest. Block identities are
 * minted per import, so a fixture generated from one import of a text cannot answer a fresh import
 * of the same text under a request digest; the content digest does not move with the identities, so
 * it can. Production and the J-04 Journey stay on request digests: the mode exists for `tests/`.
 *
 * Structurally an `LlmAdapter`; the class is not extended so that no DSH runtime value is imported
 * before the service installs network denial.
 */
const BLOCK_PLACEHOLDER = /\{\{block:(\d+)\}\}/gu;
const BLOCK_LINE = /^\[(blk_[0-9a-f]{24})\] /u;
/** The `({kind}{level})` marker the prompt contract writes between a block's identity and its text. */
const BLOCK_KIND_MARKER = /^\((?:title|heading|paragraph)(?: h[1-6])?\) /u;

/** How a request is matched to a fixture entry: by the request digest, or by the unit's own text alone. */
export type FixtureResolution = 'request-digest' | 'content-digest';

/** The own blocks of a unit message, in order: the `[blk_…]` lines after the own-blocks header. */
function ownBlockLinesOf(unitMessage: string): Array<{ id: string; rest: string }> {
  const lines = unitMessage.split('\n');
  const start = lines.indexOf(BASELINE_PROMPT_CONTRACT.ownHeader);
  if (start === -1) return [];
  const blocks: Array<{ id: string; rest: string }> = [];
  for (const line of lines.slice(start + 1)) {
    const match = BLOCK_LINE.exec(line);
    if (match !== null) blocks.push({ id: match[1]!, rest: line.slice(match[0].length) });
  }
  return blocks;
}

/** Own block identities of a unit message, in order: the `[blk_…]` lines after the own-blocks header. */
export function ownBlockIdsOf(unitMessage: string): string[] {
  return ownBlockLinesOf(unitMessage).map((block) => block.id);
}

/**
 * Own block texts of a unit message, in order and positionally matching {@link ownBlockIdsOf}: each
 * own block line with its identity and its kind marker removed, so what is left is the block text
 * the prompt contract's `blockLine` interpolated and nothing the import minted.
 */
export function ownBlockTextsOf(unitMessage: string): string[] {
  return ownBlockLinesOf(unitMessage).map((block) => block.rest.replace(BLOCK_KIND_MARKER, ''));
}

/**
 * The content key of one Analysis Unit: SHA-256 over its own block texts joined by a newline. It is
 * a function of the manuscript text alone — no block identity, no unit digest, no prompt contract —
 * which is exactly why a fixture keyed by it survives a re-import of the same manuscript.
 */
export function unitContentDigest(ownBlockTexts: ReadonlyArray<string>): string {
  return sha256Hex(ownBlockTexts.join('\n'));
}

/** The entries reachable in content mode, keyed by content digest; an entry without one is unreachable. */
function contentDigestEntries(fixture: ResolvedModelFixture): Map<string, ModelFixtureEntry> {
  const entries = new Map<string, ModelFixtureEntry>();
  for (const entry of fixture.entries.values()) {
    if (entry.contentDigest !== null) entries.set(fixtureEntryKey(entry.unitOrdinal, entry.contentDigest, entry.attempt), entry);
  }
  return entries;
}

/** Substitute `{{block:N}}` placeholders; an out-of-range placeholder is left for the contract to reject. */
export function substituteBlockPlaceholders(text: string, ownBlockIds: ReadonlyArray<string>): string {
  return text.replace(BLOCK_PLACEHOLDER, (placeholder, index: string) => ownBlockIds[Number(index) - 1] ?? placeholder);
}

export class Ai7LocalDeterministicAdapter implements LlmAdapter {
  readonly #fixture: ResolvedModelFixture;
  readonly #promptContractDigest: string;
  readonly #codes: DshFailureCodes;
  readonly #resolveBy: FixtureResolution;
  readonly #entries: ReadonlyMap<string, ModelFixtureEntry>;
  readonly #servedByKey = new Map<string, number>();
  #served = 0;

  constructor(
    fixture: ResolvedModelFixture,
    promptContractDigest: string,
    codes: DshFailureCodes,
    options: { readonly resolveBy?: FixtureResolution } = {},
  ) {
    this.#fixture = fixture;
    this.#promptContractDigest = promptContractDigest;
    this.#codes = codes;
    this.#resolveBy = options.resolveBy ?? 'request-digest';
    this.#entries = this.#resolveBy === 'content-digest' ? contentDigestEntries(fixture) : fixture.entries;
  }

  /** Replayed requests so far; there is never a transmission count. */
  get servedRequests(): number {
    return this.#served;
  }

  providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'AI7 本地确定性模型适配器' };
  }

  providerRetryPolicy(): undefined {
    return undefined;
  }

  listModels(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: 'AI7 确定性夹具', inputModalities: ['text'] });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.#served += 1;
    const failure = (code: string, message: string, status?: number): StreamChunk => ({
      type: 'finish',
      reason: { kind: code === AI7_FAILURE_CODES.INTERRUPTED ? 'aborted' : 'error', failure: { code, message, ...(status === undefined ? {} : { status }) } },
    });
    if (options.provider !== LOCAL_DETERMINISTIC_ROUTE || options.model !== LOCAL_DETERMINISTIC_MODEL) {
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, '确定性适配器只服务本地确定性路由。');
      return;
    }
    const text = lastUserMessageText(options);
    const header = text === null ? null : parseUnitMessageHeader(text);
    if (header === null) {
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, '请求不含可识别的分析单元消息头。');
      return;
    }
    const expectedDigest = this.#resolveBy === 'content-digest'
      ? unitContentDigest(ownBlockTextsOf(text!))
      : unitRequestDigest(this.#promptContractDigest, header.ordinal, header.unitDigest);
    const pairKey = fixtureEntryKey(header.ordinal, expectedDigest);
    const attempt = (this.#servedByKey.get(pairKey) ?? 0) + 1;
    this.#servedByKey.set(pairKey, attempt);
    const entry = resolveFixtureEntry(this.#entries, header.ordinal, expectedDigest, attempt);
    if (entry === undefined) {
      const label = this.#resolveBy === 'content-digest' ? '内容摘要' : '请求摘要';
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, `夹具 ${this.#fixture.identity} 没有单元 ${header.ordinal} 在当前${label}下的对应响应。`);
      return;
    }
    const response = entry.response;
    switch (response.kind) {
      case 'unit-result': {
        const replay = substituteBlockPlaceholders(response.text, ownBlockIdsOf(text!));
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'text-delta', index: 0, text: replay };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: replay } };
        yield { type: 'usage', usage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens } };
        yield { type: 'finish', reason: { kind: 'stop' } };
        return;
      }
      case 'adapter-failure':
        yield failure(response.code, response.message, response.status ?? undefined);
        return;
      case 'quota-exceeded':
        yield failure(this.#codes.QUOTA_EXCEEDED_CODE, response.message, response.status);
        return;
      case 'interrupted':
        yield failure(AI7_FAILURE_CODES.INTERRUPTED, response.message);
        return;
    }
  }
}
