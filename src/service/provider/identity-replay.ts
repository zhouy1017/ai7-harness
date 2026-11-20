/**
 * Identity-normalised replay of development validation evidence (Issue #1585; ADR 0067 amendment of 2026-11-20). Developer-live
 * only: `transmitOnce` is reached solely under a development validation launch, and it alone calls this module. A fresh Book
 * asks the analysis path's questions with newly minted identities; when an earlier capture asked exactly the same question
 * under the same generation (route, endpoint, request shape, model, prompt contract and task contract), its answer is replayed
 * with the identities mapped onto the current request. The capture is never modified or copied; the mapped answer exists only
 * in memory. An earlier answer never answers materially different input: everything outside the slots below stays byte-exact.
 *
 * Only messages whose first line is one of the analysis-path task headers in {@link TASK_HEADER} are normalised, and in them
 * only these slots — each stands for a minted handle and nothing else:
 *
 * - `block`: a manuscript block identity `blk_<24 hex>`, minted per import, at the block-line positions the builders emit
 *   (`[blk_…] (kind level) text`, `[n] [blk_…] …`) and in a `单元 n：blk_…` cited-block listing. It is computed from no content;
 *   the block's kind, level and text are the rest of its line and stay byte-exact, and every position naming one identity
 *   shares one slot, so which lines name the same block is preserved.
 * - `run`: the Run record identity in the `运行反思 <run> · 账目摘要 …` header, minted per Run. It covers nothing else; the
 *   accounting and its digest stay byte-exact.
 * - `ref`: the finding handle in a sampling line `- [ref]（tier）text` — a list index for the baseline kind, a finding id
 *   minted from a committed block identity for factual review. It covers nothing else; the tier and text stay byte-exact.
 *
 * Not normalised: every header and request digest (单元摘要, 抽样摘要, 单元集摘要, 账目摘要, 依据摘要, 段落摘要, and the
 * clarification line's 请求摘要). Each is identity-free by construction — over ordinals, block positions, content digests, the
 * prompt contract and result positions — and some cover values the body does not carry (a unit's block positions, an
 * observation's block ordinals), so a normalised digest could hide a difference. They stay byte-exact; the same text imported
 * again yields the same digests.
 *
 * In the answer, `block` identities are rewritten old → new wherever they occur (their form cannot be mistaken for other text).
 * A `run` or `ref` value that differs and occurs in the answer cannot be rewritten safely, so no replay is offered.
 */

const TASK_HEADER = /^(?:分析单元|保证抽样|跨单元归纳|运行反思|事实核查单元|评估单元|评估综合|审稿意见单元|审稿意见综合|评语重写单元|评语重写综合|写作单元|写作综合|审阅单元) /u;
const BLOCK_ID = /blk_[0-9a-f]{24}/gu;

type SlotKind = 'block' | 'run' | 'ref';

interface IdentityForm {
  readonly form: string;
  /** Whether any message carries a task header: a request without one (a single-request kind) is never normalised. */
  readonly recognised: boolean;
  /** Each slot's kind and minted value, in the order of first appearance. */
  readonly slots: ReadonlyArray<{ readonly kind: SlotKind; readonly value: string }>;
}

/** The request body with only the slots above replaced, as canonical JSON; `null` for a body that is not JSON. */
function identityForm(body: string): IdentityForm | null {
  const slots: Array<{ kind: SlotKind; value: string }> = [];
  const numbered = new Map<string, string>();
  let recognised = false;
  const slot = (kind: SlotKind, value: string): string => {
    const key = `${kind}\u0000${value}`;
    if (!numbered.has(key)) {
      numbered.set(key, `<${kind}-${slots.length}>`);
      slots.push({ kind, value });
    }
    return numbered.get(key)!;
  };
  const message = (text: string): string => {
    const lines = text.split('\n');
    if (!TASK_HEADER.test(lines[0] ?? '')) return text;
    recognised = true;
    lines[0] = lines[0]!.replace(/(?<=^运行反思 )[A-Za-z0-9_-]{1,64}(?= · )/u, (run) => slot('run', run));
    return lines.map((line, index) => {
      if (index === 0) return line;
      if (/^单元 \d+：blk_[0-9a-f]{24}/u.test(line)) return line.replace(BLOCK_ID, (id) => slot('block', id));
      return line.replace(/^((?:\[[1-9][0-9]*\] )?\[)(blk_[0-9a-f]{24})(\])/u, (_match, before: string, id: string, after: string) => `${before}${slot('block', id)}${after}`)
        .replace(/^(- \[)([A-Za-z0-9_-]{1,64})(\]（)/u, (_match, before: string, ref: string, after: string) => `${before}${slot('ref', ref)}${after}`);
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
  try {
    const form = JSON.stringify(canonical(JSON.parse(body)));
    return { form, recognised, slots };
  } catch {
    return null;
  }
}

/** Old → new value of every slot, per kind. */
export type IdentityRemap = ReadonlyMap<SlotKind, ReadonlyMap<string, string>>;

/**
 * The slot mapping from a captured request onto the current one, or `null` unless both carry a task header and are equal
 * outside the slots. Equal forms number the slots identically, so the mapping is one-to-one by construction.
 */
export function identityRemap(capturedBody: string, currentBody: string): IdentityRemap | null {
  const captured = identityForm(capturedBody);
  const current = identityForm(currentBody);
  if (captured === null || current === null || !captured.recognised || captured.form !== current.form) return null;
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
