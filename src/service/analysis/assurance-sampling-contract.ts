import type {
  AnalysisAssuranceSampleStratumProjection,
  CoverageManifestProjection,
  CoverageManifestUnitProjection,
} from '../../shared/protocol.js';
import { DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, requireAnalysis, sha256Hex } from './canonical.js';
import type { ManifestBlockInput } from './coverage-manifest.js';

/**
 * Assurance Sampling Contract v1 (ADR 0066 §Assurance sampling): the third product-built,
 * exact-versioned contract, and the only one both analysis kinds share. After reduction the Run draws
 * a stratified, fixed-seed sample of its own findings and re-reads each sampled finding against the
 * blocks of the unit it is anchored in, returning `成立`, `需降级`, or `应删除` with a reason. A
 * disposition is evidence for the editor and for the Run Report; it never edits, deletes, reorders, or
 * re-ranks a finding.
 *
 * Three things this contract deliberately is not. It is not a second system prompt: the
 * PrimaryAgentHarness freezes one system section at `prepareExecution` and the Egress Gate refuses a
 * payload whose system text differs from the Execution Binding, so the instruction text travels at the
 * top of the user message as frozen, digested contract text. It is not a second reading of the whole
 * Book: one turn carries exactly one Analysis Unit's blocks, so every sampling message stays inside
 * the unit budget plus its one overlap block by construction, which is ADR 0066's "re-reads each
 * finding's unit and surrounding blocks" read literally. And it is not a verdict: the model is asked
 * whether the blocks in front of it support what the finding already says, never whether the claim is
 * true of the world.
 *
 * The prompt contract is frozen text. Its digest binds the deterministic fixture key; changing one
 * character of it changes every request digest, which is the intent.
 */
export const ASSURANCE_SAMPLING_RESULT_SCHEMA = 'ai7.analysis.assurance-sampling-result/1' as const;
export const ASSURANCE_SAMPLING_PROMPT_CONTRACT_SCHEMA = 'ai7.analysis.assurance-sampling-prompt-contract/1' as const;
export const ASSURANCE_SAMPLING_CONTRACT_VERSION = 'ai7.analysis.assurance-sampling/1' as const;

/** The closed disposition set ADR 0066 names; never widened, and never reduced to a boolean. */
export const ASSURANCE_DISPOSITIONS = ['成立', '需降级', '应删除'] as const;
export type AssuranceDisposition = (typeof ASSURANCE_DISPOSITIONS)[number];

/** The default sample size ADR 0066 states; the per-stratum floor may raise it, never lower it. */
export const DEFAULT_ASSURANCE_SAMPLE_SIZE = 30;

const MAX_REASON_GRAPHEMES = 200;
const MAX_DISPOSITIONS = 512;
/** A decimal index for the baseline kind, a `fnd_…` identity for the factual kind; both fit this shape. */
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
/** Graphemes, the unit every bound in the two existing contracts is already measured in. */
const GRAPHEMES = new Intl.Segmenter('zh', { granularity: 'grapheme' });

function graphemeCount(text: string): number {
  let count = 0;
  for (const _segment of GRAPHEMES.segment(text)) count += 1;
  return count;
}

/**
 * One sampleable finding, as the kind that owns it declares it. `unitOrdinal` is the unit the finding
 * is *anchored* in — the factual finding's own unit, the cross-unit finding's first side — which is
 * both the unit whose blocks re-read it and the unit whose section stratifies it.
 */
export interface AssuranceSamplingCandidate {
  readonly ref: string;
  readonly unitOrdinal: number;
  readonly tier: string;
  readonly text: string;
}

export interface AssuranceSamplingDisposition {
  readonly ref: string;
  readonly disposition: AssuranceDisposition;
  readonly reason: string;
}

export interface AssuranceSamplingResult {
  readonly schema: typeof ASSURANCE_SAMPLING_RESULT_SCHEMA;
  readonly dispositions: ReadonlyArray<AssuranceSamplingDisposition>;
}

export type AssuranceSamplingParseFailureCode = 'not-json' | 'schema-invalid' | 'ref-out-of-sample' | 'disposition-missing';

export type AssuranceSamplingResultParse =
  | { ok: true; result: AssuranceSamplingResult; canonicalJson: string; digest: string }
  | { ok: false; code: AssuranceSamplingParseFailureCode; detail: string };

/** The frozen prompt contract. Every field is model-facing text or a fixed format; none is manuscript content. */
export const ASSURANCE_SAMPLING_PROMPT_CONTRACT = {
  schema: ASSURANCE_SAMPLING_PROMPT_CONTRACT_SCHEMA,
  contractVersion: ASSURANCE_SAMPLING_CONTRACT_VERSION,
  responseSchema: ASSURANCE_SAMPLING_RESULT_SCHEMA,
  instruction: [
    '以下是某个分析单元的全部内容块，以及此前由本次运行得出、锚定在该单元的若干发现。请以对抗的态度重读这些内容块，逐条判定每条发现是否被它们支持。',
    '只依据本消息给出的内容块判断，不进行事实核查、不引用外部知识、不改写稿件、不给出修改建议、不调用任何工具。',
    '不评判本消息未列出的发现，不新增发现，也不修改任何发现的文字。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.analysis.assurance-sampling-result/1"）、',
    'dispositions（数组；每项含 ref、disposition、reason）。',
    'ref 必须是本消息列出的发现编号；本消息列出的每个编号恰好出现一次，不得遗漏，也不得多出。',
    'disposition 取 成立/需降级/应删除 之一：内容块按原样支持该发现取「成立」，只支持其较弱的说法取「需降级」，内容块不支持该发现取「应删除」。',
    'reason 说明判定依据，不超过 200 个字素。',
  ].join('\n'),
  messageHeader: '保证抽样 {unitOrdinal}/{totalUnits} · 单元摘要 {unitDigest} · 抽样摘要 {sampleDigest}',
  overlapHeader: '以下为承接上一单元的重叠上下文（仅供理解）：',
  ownHeader: '以下为本单元的内容块：',
  blockLine: '[{blockId}] ({kind}{level}) {text}',
  findingHeader: '以下为需要复核的发现：',
  findingLine: '- [{ref}]（{tier}）{text}',
} as const;

export const ASSURANCE_SAMPLING_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(ASSURANCE_SAMPLING_PROMPT_CONTRACT));

/**
 * The header carries every part of the request key that is not the frozen contract itself: the anchor
 * unit, its content digest, and the digest of the findings this turn listed. The deterministic adapter
 * holds only the assembled message, and both existing contracts already put what their key needs in
 * their header, so a sampling turn is resolvable from its own first line exactly as a unit turn is.
 */
const HEADER_PATTERN = /^保证抽样 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64}) · 抽样摘要 ([0-9a-f]{64})$/u;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder);
}

function blockLine(block: Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>): string {
  return fill(ASSURANCE_SAMPLING_PROMPT_CONTRACT.blockLine, {
    blockId: block.blockId,
    kind: block.kind,
    level: block.level === null ? '' : ` h${block.level}`,
    text: block.text,
  });
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

/**
 * The digest of one turn's listed findings: SHA-256 over the canonical JSON of their texts, each at
 * its 1-based position in the listing. Together with the manifest unit's own content digest it makes
 * the request key a function of the blocks actually carried and the findings actually listed, so a
 * changed block, a changed finding, or a changed listing changes it.
 *
 * The positions are the point, exactly as in `unitSetDigest`. A `ref` is not content: the factual
 * kind's is minted from a committed block identity, which is minted per import, so the same manuscript
 * imported twice yields different refs and a digest over them could never be reproduced — not across
 * imports, and not across two runs of one test. A finding's text is a function of the manuscript and
 * the model alone, so a hand-written fixture can pin this.
 */
export function assuranceSampleDigest(findings: ReadonlyArray<AssuranceSamplingCandidate>): string {
  return sha256Hex(canonicalJson(findings.map((finding, index) => ({ position: index + 1, text: finding.text }))));
}

/**
 * The exact user-role message for one sampling turn: header, the frozen instruction text, the anchor
 * unit's blocks exactly as the unit contract writes them, then the findings anchored there.
 */
export function buildAssuranceSamplingMessage(
  unit: CoverageManifestUnitProjection,
  totalUnits: number,
  blocksById: ReadonlyMap<string, Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>>,
  findings: ReadonlyArray<AssuranceSamplingCandidate>,
): string {
  const contract = ASSURANCE_SAMPLING_PROMPT_CONTRACT;
  const lines = [
    fill(contract.messageHeader, {
      unitOrdinal: String(unit.ordinal),
      totalUnits: String(totalUnits),
      unitDigest: unit.digest,
      sampleDigest: assuranceSampleDigest(findings),
    }),
    contract.instruction,
  ];
  if (unit.overlapBlockIds.length > 0) {
    lines.push(contract.overlapHeader);
    for (const blockId of unit.overlapBlockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  }
  lines.push(contract.ownHeader);
  for (const blockId of unit.blockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  lines.push(contract.findingHeader);
  for (const finding of findings) {
    lines.push(fill(contract.findingLine, { ref: finding.ref, tier: finding.tier, text: finding.text }));
  }
  return lines.join('\n');
}

const FINDING_LINE_PATTERN = /^- \[([A-Za-z0-9_-]{1,64})\]（/u;

/**
 * The refs a message built by {@link buildAssuranceSamplingMessage} listed, in listing order, read
 * back from the text alone. The deterministic adapter holds only the assembled message, and the
 * factual kind's `ref` is minted per import, so a hand-written fixture names a finding by its position
 * here rather than by an identity it cannot know — the same move the cross-unit contract's
 * cited-blocks reader exists for.
 */
export function parseAssuranceSamplingListedRefs(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.indexOf(ASSURANCE_SAMPLING_PROMPT_CONTRACT.findingHeader);
  if (start === -1) return [];
  const refs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = FINDING_LINE_PATTERN.exec(line);
    if (match !== null) refs.push(match[1]!);
  }
  return refs;
}

export interface AssuranceSamplingMessageHeader {
  readonly unitOrdinal: number;
  readonly totalUnits: number;
  readonly unitDigest: string;
  readonly sampleDigest: string;
}

/** Recover the turn identity from a message built by {@link buildAssuranceSamplingMessage}; `null` for anything else. */
export function parseAssuranceSamplingMessageHeader(text: string): AssuranceSamplingMessageHeader | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = HEADER_PATTERN.exec(firstLine);
  if (match === null) return null;
  const unitOrdinal = Number(match[1]);
  const totalUnits = Number(match[2]);
  if (!Number.isSafeInteger(unitOrdinal) || unitOrdinal < 1 || !Number.isSafeInteger(totalUnits) || totalUnits < unitOrdinal) return null;
  return { unitOrdinal, totalUnits, unitDigest: match[3]!, sampleDigest: match[4]! };
}

/**
 * The request digest a deterministic fixture keys one sampling turn by beside unit ordinal `0`: a pure
 * function of the frozen prompt contract, the anchor unit, its content digest, and the listed findings.
 * Block identities are minted per import and appear nowhere in it, exactly as in the two existing
 * digests, so a hand-written fixture can pin it across imports of the same manuscript.
 */
export function assuranceSamplingRequestDigest(
  promptContractDigest: string,
  unitOrdinal: number,
  unitDigest: string,
  sampleDigest: string,
): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest) || !DIGEST_PATTERN.test(sampleDigest)) {
    throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  }
  if (!Number.isSafeInteger(unitOrdinal) || unitOrdinal < 1) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitOrdinal, unitDigest, sampleDigest }));
}

function boundedReason(value: unknown): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= MAX_REASON_GRAPHEMES;
}

/**
 * Validate a model response against the sampling contract. Every refusal is one of four codes, and the
 * caller records it as a gap for this turn's findings only; nothing here throws, because an invalid
 * response is a disclosed gap in the Result Set Revision and never a failed Run.
 */
export function parseAssuranceSamplingResult(
  text: string,
  expected: { readonly refs: ReadonlyArray<string> },
): AssuranceSamplingResultParse {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  const body = fenced?.[1] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  }
  const invalid = (detail: string): AssuranceSamplingResultParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['schema', 'dispositions'])) return invalid('保证抽样结果键集合不符合契约 v1。');
  if (parsed.schema !== ASSURANCE_SAMPLING_RESULT_SCHEMA) return invalid('保证抽样结果 schema 不是契约 v1。');
  if (!Array.isArray(parsed.dispositions) || parsed.dispositions.length > MAX_DISPOSITIONS) return invalid('保证抽样判定集合缺失或超出边界。');
  const listed = new Set(expected.refs);
  const seen = new Set<string>();
  const dispositions: AssuranceSamplingDisposition[] = [];
  for (const [index, candidate] of (parsed.dispositions as unknown[]).entries()) {
    const label = `第 ${index + 1} 项判定`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['ref', 'disposition', 'reason'])) return invalid(`${label}的键集合不符合契约 v1。`);
    if (typeof candidate.ref !== 'string' || !REF_PATTERN.test(candidate.ref)) return invalid(`${label}的发现编号无效。`);
    if (!ASSURANCE_DISPOSITIONS.includes(candidate.disposition as AssuranceDisposition)) return invalid(`${label}的判定不在闭合集合内。`);
    if (!boundedReason(candidate.reason)) return invalid(`${label}的理由缺失或超出边界。`);
    if (!listed.has(candidate.ref)) {
      return { ok: false, code: 'ref-out-of-sample', detail: `${label}引用了本次抽样未列出的发现 ${candidate.ref}。` };
    }
    // A repeated ref is a malformed array rather than an unlisted finding: the second row has no
    // finding of its own to judge, and admitting it would let one finding carry two dispositions.
    if (seen.has(candidate.ref)) return invalid(`${label}重复判定了同一条发现。`);
    seen.add(candidate.ref);
    dispositions.push({ ref: candidate.ref, disposition: candidate.disposition as AssuranceDisposition, reason: candidate.reason });
  }
  const missing = expected.refs.filter((ref) => !seen.has(ref));
  if (missing.length > 0) {
    return { ok: false, code: 'disposition-missing', detail: `本次抽样列出的发现 ${missing.join('、')} 没有判定。` };
  }
  const result: AssuranceSamplingResult = { schema: ASSURANCE_SAMPLING_RESULT_SCHEMA, dispositions };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

// ---- the seed and the strata ---------------------------------------------------------------------

export interface AssuranceSampleDraw {
  readonly seed: string;
  readonly size: number;
  readonly candidateCount: number;
  readonly strata: ReadonlyArray<AnalysisAssuranceSampleStratumProjection>;
  /** The drawn candidates, in candidate order; the order the turns list them in. */
  readonly sampled: ReadonlyArray<AssuranceSamplingCandidate>;
}

/** One sampling turn: the anchor unit and the sampled findings anchored there, in sample order. */
export interface AssuranceSamplingTurn {
  readonly unitOrdinal: number;
  readonly findings: ReadonlyArray<AssuranceSamplingCandidate>;
}

/**
 * The keyed hash one candidate is ordered by inside its stratum: a function of the seed and the
 * candidate's 1-based position in candidate order. Position rather than `ref`, for the same reason the
 * seed is taken over content — the factual kind mints a `ref` per import — so no shuffle, clock, or
 * `Math.random` is involved anywhere in the analysis service and the draw is the same on every import.
 */
function sortKey(seed: string, position: number): string {
  return sha256Hex(`${seed}${position}`);
}

/**
 * The digest of one candidate set: SHA-256 over the canonical JSON of the candidates at their
 * positions, never over a `ref`. Together with the manifest's unit content digests it makes the seed a
 * function of the manuscript and the findings alone.
 */
function findingsDigestOf(candidates: ReadonlyArray<AssuranceSamplingCandidate>): string {
  return sha256Hex(canonicalJson(candidates.map((candidate, index) => ({
    position: index + 1,
    unitOrdinal: candidate.unitOrdinal,
    tier: candidate.tier,
    text: candidate.text,
  }))));
}

/**
 * The seed the draw is keyed by: a function of the manifest's unit content digests in ordinal order
 * and of the candidates at their positions. Every input is content — a unit digest is taken over block
 * content digests, never over minted block identities — so the same manuscript and the same findings
 * seed the same draw on every import, which is what lets a fixture answer a partial sample at all.
 * The manifest digest could not give this: it covers the import's own minted identities.
 */
export function assuranceSampleSeed(
  unitDigests: ReadonlyArray<string>,
  candidates: ReadonlyArray<AssuranceSamplingCandidate>,
): string {
  return sha256Hex(canonicalJson({ unitDigests, findingsDigest: findingsDigestOf(candidates) }));
}

/**
 * Draw the stratified, fixed-seed sample (ADR 0066). Strata are the manifest's structural sections;
 * every stratum holding a candidate contributes at least one, and the remainder is allocated
 * proportionally to candidate counts, largest remainders first, ties by section ordinal.
 *
 * The floor and the default size can disagree — a Book with more than thirty sections that each hold a
 * finding cannot give every section a place inside thirty. The floor wins, because "at least one per
 * structural section" is the promise an editor reads the coverage of the sample by, and thirty is the
 * default it is drawn to otherwise. The size is still never more than the candidate count.
 */
export function drawAssuranceSample(
  manifest: Pick<CoverageManifestProjection, 'units'>,
  candidates: ReadonlyArray<AssuranceSamplingCandidate>,
): AssuranceSampleDraw {
  const seed = assuranceSampleSeed(manifest.units.map((unit) => unit.digest), candidates);
  // Each candidate travels with its 1-based position in candidate order: the position is what the
  // seed digested and what the sort key is taken over, and it is the same on every import.
  const groups = new Map<number, Array<{ candidate: AssuranceSamplingCandidate; position: number }>>();
  candidates.forEach((candidate, index) => {
    const unit = manifest.units[candidate.unitOrdinal - 1];
    requireAnalysis(unit !== undefined && unit.ordinal === candidate.unitOrdinal,
      'ANALYSIS_ASSURANCE_STRATUM_UNKNOWN', '抽样候选发现的单元不在覆盖清单内，无法按结构段分层。');
    const entry = { candidate, position: index + 1 };
    const group = groups.get(unit.sectionOrdinal);
    if (group === undefined) groups.set(unit.sectionOrdinal, [entry]);
    else group.push(entry);
  });
  const sections = [...groups.keys()].sort((left, right) => left - right);
  if (sections.length === 0) {
    return { seed, size: 0, candidateCount: 0, strata: [], sampled: [] };
  }
  const size = Math.max(Math.min(DEFAULT_ASSURANCE_SAMPLE_SIZE, candidates.length), sections.length);
  const quota = new Map<number, number>(sections.map((section) => [section, 1]));
  let remaining = size - sections.length;
  // The proportional part of the remainder, floored, then the leftover seats one at a time by largest
  // fractional remainder. A stratum already at capacity is skipped, and its seat moves to the next.
  const shares = sections.map((section) => {
    const count = groups.get(section)!.length;
    const ideal = candidates.length === 0 ? 0 : (remaining * count) / candidates.length;
    return { section, count, base: Math.floor(ideal), fraction: ideal - Math.floor(ideal) };
  });
  for (const share of shares) {
    const give = Math.min(share.base, share.count - quota.get(share.section)!, remaining);
    if (give <= 0) continue;
    quota.set(share.section, quota.get(share.section)! + give);
    remaining -= give;
  }
  const byRemainder = [...shares].sort((left, right) => right.fraction - left.fraction || left.section - right.section);
  while (remaining > 0) {
    let placed = false;
    for (const share of byRemainder) {
      if (remaining === 0) break;
      if (quota.get(share.section)! >= share.count) continue;
      quota.set(share.section, quota.get(share.section)! + 1);
      remaining -= 1;
      placed = true;
    }
    // Every stratum is at capacity: the sample is already the whole candidate set.
    if (!placed) break;
  }
  const strata: AnalysisAssuranceSampleStratumProjection[] = [];
  const drawn = new Set<number>();
  for (const section of sections) {
    const group = groups.get(section)!;
    const take = quota.get(section)!;
    const ordered = [...group].sort((left, right) => {
      const keys = [sortKey(seed, left.position), sortKey(seed, right.position)];
      return keys[0]! < keys[1]! ? -1 : keys[0]! > keys[1]! ? 1 : left.position - right.position;
    });
    strata.push({ sectionOrdinal: section, candidates: group.length, sampled: take });
    for (const entry of ordered.slice(0, take)) drawn.add(entry.position);
  }
  // The keyed hash decides *which* candidates are drawn; they are emitted in candidate order, which
  // both kinds derive from the manuscript and the model rather than from the seed. Membership and
  // listing are therefore both the same on every import of one manuscript, which is what lets a
  // fixture answer a sampling turn — a partial sample included.
  const sampled = candidates.filter((_candidate, index) => drawn.has(index + 1));
  return { seed, size: sampled.length, candidateCount: candidates.length, strata, sampled };
}

/**
 * The turns one draw dispatches: one per distinct anchor unit, in unit order, each listing that unit's
 * sampled findings in candidate order. A Run's sampling transmissions are therefore bounded by the
 * number of distinct anchor units, which is never more than the unit count.
 */
export function assuranceSamplingTurns(sampled: ReadonlyArray<AssuranceSamplingCandidate>): AssuranceSamplingTurn[] {
  const byUnit = new Map<number, AssuranceSamplingCandidate[]>();
  for (const candidate of sampled) {
    const group = byUnit.get(candidate.unitOrdinal);
    if (group === undefined) byUnit.set(candidate.unitOrdinal, [candidate]);
    else group.push(candidate);
  }
  return [...byUnit.keys()]
    .sort((left, right) => left - right)
    .map((unitOrdinal) => ({ unitOrdinal, findings: byUnit.get(unitOrdinal)! }));
}
