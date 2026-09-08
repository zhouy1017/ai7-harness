import type { LlmAdapter, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk, GenerateOptions } from '@deepseek-ai/dsh-llm';
import { sha256Hex } from '../analysis/canonical.js';
import {
  ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST,
  assuranceSamplingRequestDigest,
  parseAssuranceSamplingListedRefs,
  parseAssuranceSamplingMessageHeader,
} from '../analysis/assurance-sampling-contract.js';
import { BASELINE_PROMPT_CONTRACT, parseUnitMessageHeader, unitRequestDigest } from '../analysis/contract.js';
import {
  BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST,
  crossUnitRequestDigest,
  parseCrossUnitCitedBlocks,
  parseCrossUnitMessageHeader,
} from '../analysis/cross-unit-contract.js';
import { parseFactualReviewUnitMessageHeader } from '../analysis/factual-review-contract.js';
import {
  RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST,
  parseRunReportReflectionMessageHeader,
  runReportReflectionRequestDigest,
} from '../analysis/run-report-contract.js';
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
 * A factual-review unit message (Issue #53) is recognized by its own header and answered from the
 * same fixture format under its own prompt-contract digest. Its responses need no placeholder: that
 * contract anchors a quotation by the block's 1-based position in the message, and the service
 * locates the quotation in the committed block itself.
 *
 * The Run's one cross-unit reduction (ADR 0066) is matched the same way under unit ordinal `0`: its
 * header names the closed unit set, and its request digest is a function of the frozen cross-unit
 * prompt contract and that set. Its responses cite blocks as `{{unit:U:block:N}}` — unit U's N-th
 * cited block in the message's own cited-blocks section — so one synthetic finding can cite exact
 * ranges of two units without a fixture author ever knowing a minted identity. Content-digest mode
 * keys entries by a unit's own block texts, which the reduction has none of, so it never answers
 * there; that mode exists for `tests/` and the reduction simply records a gap under it.
 *
 * The Run Report's one reflection turn (S44) is matched the same way under unit ordinal `0`: its
 * header names the Run and carries the digest of that Run's own accounting, and its request digest is
 * a function of the frozen reflection contract and that accounting alone. Its responses need no
 * placeholder — the request carried no block and no finding, so the answer can name none — and
 * content-digest mode never answers one, for the same reason it never answers the other two.
 *
 * Each assurance sampling turn (S43) is matched the same way under unit ordinal `0`: its header names
 * the anchor unit and carries that unit's content digest and the digest of the findings the turn
 * listed, so its request digest is a function of the frozen sampling contract, the blocks carried, and
 * the findings listed. Its responses name a finding as `{{ref:N}}` — the N-th finding listed in the
 * message — because the factual kind mints a `findingId` from a committed block identity and no
 * fixture author can know one. Content-digest mode never answers a sampling turn, for the same reason
 * it never answers the reduction.
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
const CROSS_UNIT_BLOCK_PLACEHOLDER = /\{\{unit:(\d+):block:(\d+)\}\}/gu;
const SAMPLING_REF_PLACEHOLDER = /\{\{ref:(\d+)\}\}/gu;
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

/** Substitute `{{unit:U:block:N}}` placeholders from the cross-unit message's own cited-blocks section. */
export function substituteCrossUnitBlockPlaceholders(text: string, citedBlocks: ReadonlyMap<number, ReadonlyArray<string>>): string {
  return text.replace(CROSS_UNIT_BLOCK_PLACEHOLDER, (placeholder, unit: string, index: string) =>
    citedBlocks.get(Number(unit))?.[Number(index) - 1] ?? placeholder);
}

/** Substitute `{{ref:N}}` placeholders with the N-th finding a sampling turn listed, 1-based. */
export function substituteAssuranceSamplingRefPlaceholders(text: string, listedRefs: ReadonlyArray<string>): string {
  return text.replace(SAMPLING_REF_PLACEHOLDER, (placeholder, index: string) => listedRefs[Number(index) - 1] ?? placeholder);
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
    // The four headers are disjoint and are tried in turn, so a unit message of either analysis kind
    // can never be read as the other kind's, as the reduction's, or as a sampling turn's. Which kind a
    // request belongs to is decided by its header alone; its request digest is then keyed by that
    // kind's contract digest, which the adapter was constructed with.
    const crossUnit = text === null ? null : parseCrossUnitMessageHeader(text);
    const sampling = text === null || crossUnit !== null ? null : parseAssuranceSamplingMessageHeader(text);
    const reflection = text === null || crossUnit !== null || sampling !== null
      ? null
      : parseRunReportReflectionMessageHeader(text);
    const header = text === null || crossUnit !== null || sampling !== null || reflection !== null
      ? null
      : parseUnitMessageHeader(text) ?? parseFactualReviewUnitMessageHeader(text);
    if (crossUnit === null && sampling === null && reflection === null && header === null) {
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, '请求不含可识别的分析单元消息头。');
      return;
    }
    // Ordinal 0 is not a unit: it is the reduction's entry, keyed by the closed unit set its header
    // names, a sampling turn's, keyed by the anchor unit and the findings its header names, or the Run
    // Report reflection's, keyed by the Run's own accounting. None can collide, because each digest is
    // taken over its own frozen contract digest as well as its own key set.
    const ordinal = crossUnit === null && sampling === null && reflection === null ? header!.ordinal : 0;
    const expectedDigest = crossUnit !== null
      ? crossUnitRequestDigest(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST, crossUnit.unitSetDigest)
      : sampling !== null
        ? assuranceSamplingRequestDigest(ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST, sampling.unitOrdinal, sampling.unitDigest, sampling.sampleDigest)
        : reflection !== null
          ? runReportReflectionRequestDigest(RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, reflection.accountingDigest)
          : this.#resolveBy === 'content-digest'
            ? unitContentDigest(ownBlockTextsOf(text!))
            : unitRequestDigest(this.#promptContractDigest, header!.ordinal, header!.unitDigest);
    const pairKey = fixtureEntryKey(ordinal, expectedDigest);
    const attempt = (this.#servedByKey.get(pairKey) ?? 0) + 1;
    this.#servedByKey.set(pairKey, attempt);
    const entry = resolveFixtureEntry(this.#entries, ordinal, expectedDigest, attempt);
    if (entry === undefined) {
      const named = crossUnit !== null || sampling !== null || reflection !== null;
      const label = !named && this.#resolveBy === 'content-digest' ? '内容摘要' : '请求摘要';
      const subject = crossUnit !== null ? '跨单元归纳'
        : sampling !== null ? `单元 ${sampling.unitOrdinal} 的保证抽样`
          : reflection !== null ? '运行反思'
            : `单元 ${ordinal}`;
      // The reflection's key is the Run's own accounting and nothing minted, so naming it here is
      // what lets a fixture author add the one missing entry without re-deriving anything.
      const key = reflection === null ? '' : `（账目摘要 ${reflection.accountingDigest}）`;
      yield failure(AI7_FAILURE_CODES.FIXTURE_MISMATCH, `夹具 ${this.#fixture.identity} 没有${subject}${key}在当前${label}下的对应响应。`);
      return;
    }
    const response = entry.response;
    switch (response.kind) {
      case 'unit-result': {
        // A sampling response names each finding by `{{ref:N}}` — the N-th finding its turn listed —
        // because the factual kind mints a `findingId` per import and a fixture cannot know one. A
        // reflection response needs no placeholder at all: it names no finding and no block, because
        // its request carried neither.
        const replay = reflection !== null
          ? response.text
          : sampling !== null
            ? substituteAssuranceSamplingRefPlaceholders(response.text, parseAssuranceSamplingListedRefs(text!))
            : crossUnit === null
              ? substituteBlockPlaceholders(response.text, ownBlockIdsOf(text!))
              : substituteCrossUnitBlockPlaceholders(response.text, parseCrossUnitCitedBlocks(text!));
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
