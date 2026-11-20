import { ASSURANCE_SAMPLING_PROMPT_CONTRACT } from '../analysis/assurance-sampling-contract.js';
import { BASELINE_CROSS_UNIT_PROMPT_CONTRACT_V1 } from '../analysis/cross-unit-contract.js';

/**
 * Identity-normalised replay of development validation evidence (Issue #1585; ADR 0067 amendment of 2026-11-20). Developer-live
 * only: `transmitOnce` is reached solely under a development validation launch, and it alone calls this module. A fresh Book
 * asks the analysis path's questions with newly minted identities; when an earlier capture asked exactly the same question
 * under the same generation (route, endpoint, request shape, model, prompt contract and task contract), its answer is replayed
 * with the identities mapped onto the current request. The capture is never modified or copied; the mapped answer exists only
 * in memory. An earlier answer never answers materially different input: everything outside the slots below stays exact.
 * "Exact" here means canonical-JSON-equal — the request body parsed and re-serialised with sorted keys, so key order and
 * whitespace between JSON tokens are ignored; every string, message text included, compares character for character.
 *
 * Only messages whose first line is one of the analysis-path task headers in {@link TASK_HEADER} are normalised, and in each
 * only the slots its builder emits there:
 *
 * - `block`: a manuscript block identity `blk_<24 hex>`, minted at random per import. It is normalised at the start of a block
 *   line (`[blk_…] (kind level) text`, `[n] [blk_…] …`) in a unit message and in a 保证抽样 message before its finding header,
 *   and in a `单元 n：blk_…` cited-block listing of a 跨单元归纳 message after its listing header — nowhere else. The block's
 *   kind, level and text are the rest of its line and stay exact, and every position naming one identity shares one slot, so
 *   which lines name the same block is preserved. A block's text may hold a soft line break; a continuation line that itself
 *   looks like a block line would be read as one, and the header's 单元摘要 — a digest over the unit's content — keeps such a
 *   difference exact.
 * - `run`: the Run record identity in the `运行反思 <run> · 账目摘要 …` header, minted at random per Run. It covers nothing
 *   else; the accounting and its digest stay exact.
 * - `ref`: the finding handle in a 保证抽样 finding line `- [ref]（tier）text`, after the finding header only. It is not
 *   content-free: for the baseline kind it is the finding's list index, for factual review a `fnd_…` hash over the anchoring
 *   block identity and the quotation. The tier and text stay exact, and the header's 抽样摘要 covers the sampled findings.
 *
 * Not normalised: every header and request digest (单元摘要, 抽样摘要, 单元集摘要, 账目摘要, 依据摘要, 段落摘要, and the
 * clarification line's 请求摘要). Each is identity-free by construction — over ordinals, block positions, content digests, the
 * prompt contract and result positions — and some cover values the body does not carry (a unit's block positions, an
 * observation's block ordinals), so a normalised digest could hide a difference. They stay exact; the same text imported
 * again yields the same digests. A recognised message that already contains a slot placeholder (`<block-0>`) is not
 * normalised at all: its form could not be told from a real slot.
 *
 * In the answer, `block` identities are rewritten old → new wherever they occur (their form cannot be mistaken for other text).
 * A `run` or `ref` value that differs and occurs in the answer cannot be rewritten safely, so no replay is offered.
 */

const UNIT_HEADER = /^(?:分析单元|事实核查单元|评估单元|审稿意见单元|评语重写单元|写作单元|审阅单元) /u;
const SAMPLING_HEADER = /^保证抽样 /u;
const CROSS_UNIT_HEADER = /^跨单元归纳 /u;
const REFLECTION_HEADER = /^运行反思 /u;
/** Recognised, with no slot: a synthesis carries no minted identity, so it maps only when it is exact. */
const SYNTHESIS_HEADER = /^(?:评估综合|审稿意见综合|评语重写综合|写作综合) /u;
const TASK_HEADER = new RegExp([UNIT_HEADER, SAMPLING_HEADER, CROSS_UNIT_HEADER, REFLECTION_HEADER, SYNTHESIS_HEADER]
  .map((pattern) => pattern.source).join('|'), 'u');
const BLOCK_ID = /blk_[0-9a-f]{24}/gu;
const PLACEHOLDER = /<(?:block|run|ref)-\d+>/u;

type SlotKind = 'block' | 'run' | 'ref';

/** A request body with its minted slots replaced: what {@link identityRemap} compares a capture with. */
export interface IdentityForm {
  readonly form: string;
  /** Each slot's kind and minted value, in the order of first appearance. */
  readonly slots: ReadonlyArray<{ readonly kind: SlotKind; readonly value: string }>;
}

/**
 * The request body with only the slots above replaced, as canonical JSON; `null` for a body that is not JSON, that carries no
 * task header (a single-request kind is never normalised), or whose recognised message already holds a placeholder.
 */
export function identityForm(body: string): IdentityForm | null {
  const slots: Array<{ kind: SlotKind; value: string }> = [];
  const numbered = new Map<string, string>();
  let recognised = false;
  let literal = false;
  const slot = (kind: SlotKind, value: string): string => {
    const key = `${kind}\u0000${value}`;
    if (!numbered.has(key)) {
      numbered.set(key, `<${kind}-${slots.length}>`);
      slots.push({ kind, value });
    }
    return numbered.get(key)!;
  };
  const blockLine = (line: string): string => line.replace(/^((?:\[[1-9][0-9]*\] )?\[)(blk_[0-9a-f]{24})(\])/u,
    (_match, before: string, id: string, after: string) => `${before}${slot('block', id)}${after}`);
  const message = (text: string): string => {
    const lines = text.split('\n');
    const header = lines[0] ?? '';
    if (!TASK_HEADER.test(header)) return text;
    recognised = true;
    if (PLACEHOLDER.test(text)) literal = true;
    if (REFLECTION_HEADER.test(header)) {
      lines[0] = header.replace(/(?<=^运行反思 )[A-Za-z0-9_-]{1,64}(?= · )/u, (run) => slot('run', run));
      return lines.join('\n');
    }
    // The builders write their finding and listing headers after every block line; the last such line starts that section.
    const findings = SAMPLING_HEADER.test(header) ? lines.lastIndexOf(ASSURANCE_SAMPLING_PROMPT_CONTRACT.findingHeader) : -1;
    const listing = CROSS_UNIT_HEADER.test(header) ? lines.lastIndexOf(BASELINE_CROSS_UNIT_PROMPT_CONTRACT_V1.citedBlocksHeader) : -1;
    return lines.map((line, index) => {
      if (index === 0) return line;
      if (UNIT_HEADER.test(header)) return blockLine(line);
      if (SAMPLING_HEADER.test(header)) {
        if (findings < 0 || index < findings) return blockLine(line);
        return line.replace(/^(- \[)([A-Za-z0-9_-]{1,64})(\]（)/u, (_match, before: string, ref: string, after: string) => `${before}${slot('ref', ref)}${after}`);
      }
      if (listing >= 0 && index > listing && /^单元 \d+：blk_[0-9a-f]{24}/u.test(line)) return line.replace(BLOCK_ID, (id) => slot('block', id));
      return line;
    }).join('\n');
  };
  const canonical = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') return key === 'content' ? message(value) : value;
    if (Array.isArray(value)) return value.map((part) => canonical(part));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, part]) => [name, canonical(part, name)]));
    }
    return value;
  };
  let form: string;
  try {
    form = JSON.stringify(canonical(JSON.parse(body)));
  } catch {
    return null;
  }
  return recognised && !literal ? { form, slots } : null;
}

/** Old → new value of every slot, per kind. */
export type IdentityRemap = ReadonlyMap<SlotKind, ReadonlyMap<string, string>>;

/**
 * The slot mapping from a captured request onto the current one's form, or `null` unless both are normalisable, equal outside
 * the slots, and carry the same slots by count and kind. Equal forms number the slots identically, so the mapping is
 * one-to-one by construction.
 */
export function identityRemap(capturedBody: string, current: IdentityForm): IdentityRemap | null {
  const captured = identityForm(capturedBody);
  if (captured === null || captured.form !== current.form || captured.slots.length !== current.slots.length ||
    captured.slots.some(({ kind }, index) => current.slots[index]!.kind !== kind)) return null;
  const remap = new Map<SlotKind, Map<string, string>>();
  captured.slots.forEach(({ kind, value }, index) => {
    const kinds = remap.get(kind) ?? new Map<string, string>();
    kinds.set(value, current.slots[index]!.value);
    remap.set(kind, kinds);
  });
  return remap;
}

/**
 * The captured answer with its block identities mapped onto the current request, or `null` when a changed `run` or `ref`
 * value occurs in it. The captured value is never mutated.
 */
export function remapResponse(response: unknown, remap: IdentityRemap): unknown | null {
  const serialized = JSON.stringify(response) ?? 'null';
  for (const kind of ['run', 'ref'] as const) {
    for (const [from, to] of remap.get(kind) ?? []) {
      // Slot values are `[A-Za-z0-9_-]` only, so the value itself needs no escaping in the pattern.
      if (from !== to && new RegExp(`(?<![A-Za-z0-9_-])${from}(?![A-Za-z0-9_-])`, 'u').test(serialized)) return null;
    }
  }
  const blocks = remap.get('block') ?? new Map<string, string>();
  return JSON.parse(serialized.replace(BLOCK_ID, (id) => blocks.get(id) ?? id)) as unknown;
}
