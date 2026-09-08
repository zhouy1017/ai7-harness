import type { AnalysisSourceRangeProjection } from '../../shared/protocol.js';
import { BLOCK_ID_PATTERN, DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, sha256Hex } from './canonical.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION } from './identity.js';
import type { AnalysisConfidence, BaselineUnitResult } from './contract.js';

/**
 * Baseline Cross-Unit Reduction Contract v1 (ADR 0066): the second product-built, exact-versioned
 * contract of the same analysis kind. It runs once per Run after the unit stage, reads the complete
 * closed unit set reorganized by topic — entities and aliases, events and chronology, relationships,
 * setting claims — and returns typed cross-unit findings the deterministic pass cannot reach, each
 * citing source ranges on every side with a confidence. The deterministic contradiction pass stays as
 * a pre-filter and is untouched.
 *
 * Two things this contract deliberately is not. It is not a second system prompt: the
 * PrimaryAgentHarness freezes one system section at `prepareExecution` and the Egress Gate refuses a
 * payload whose system text differs from the Execution Binding, so the instruction text travels at
 * the top of the user message as frozen, digested contract text and no gate refusal is weakened. And
 * it carries no manuscript text of its own: every row is built from unit results the Run already
 * holds, and every block identity was already cited by the unit that reported it.
 *
 * The prompt contract is frozen text. Its digest binds the deterministic fixture key; changing one
 * character of it changes every request digest, which is the intent.
 */
export const BASELINE_CROSS_UNIT_RESULT_SCHEMA = 'ai7.baseline-manuscript-analysis.cross-unit-result/1' as const;
export const BASELINE_CROSS_UNIT_PROMPT_CONTRACT_SCHEMA = 'ai7.baseline-manuscript-analysis.cross-unit-prompt-contract/1' as const;

/** The four typed finding kinds ADR 0066 names; a closed set, listed in the reducer descriptor. */
export const CROSS_UNIT_FINDING_KINDS = ['contradiction', 'continuity-break', 'alias-identity-divergence', 'chronology-conflict'] as const;
export type CrossUnitFindingKind = (typeof CROSS_UNIT_FINDING_KINDS)[number];

/**
 * The unit contract's confidence set, restated against its exported type rather than re-exported from
 * it: `contract.ts` keeps its constant private, and typing this list as the same union makes a
 * divergence a compile error rather than a runtime one.
 */
const CONFIDENCE_LEVELS: ReadonlyArray<AnalysisConfidence> = ['high', 'medium', 'low'];
const MAX_FINDINGS = 200;
const MAX_SIDES = 8;
const MAX_SIDE_RANGES = 200;
const MAX_NOTES = 200;
const MAX_DESCRIPTION_GRAPHEMES = 400;

/** One closed unit of the complete new unit set, in the shape the execution owner already holds. */
export interface ClosedUnitResult {
  readonly unitOrdinal: number;
  readonly result: BaselineUnitResult;
}

export interface CrossUnitFindingSide {
  readonly unitOrdinal: number;
  readonly sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface CrossUnitFinding {
  readonly kind: CrossUnitFindingKind;
  readonly description: string;
  readonly sides: ReadonlyArray<CrossUnitFindingSide>;
  readonly confidence: AnalysisConfidence;
}

export interface BaselineCrossUnitResult {
  readonly schema: typeof BASELINE_CROSS_UNIT_RESULT_SCHEMA;
  readonly findings: ReadonlyArray<CrossUnitFinding>;
  /** Observations the model could not raise to a typed finding; text only, no ranges, never a finding. */
  readonly notes: ReadonlyArray<string>;
}

export type CrossUnitResultParseFailureCode = 'not-json' | 'schema-invalid' | 'unit-out-of-set' | 'range-out-of-unit';

export type CrossUnitResultParse =
  | { ok: true; result: BaselineCrossUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: CrossUnitResultParseFailureCode; detail: string };

/** The frozen prompt contract. Every field is model-facing text or a fixed format; none is manuscript content. */
export const BASELINE_CROSS_UNIT_PROMPT_CONTRACT = {
  schema: BASELINE_CROSS_UNIT_PROMPT_CONTRACT_SCHEMA,
  contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
  responseSchema: BASELINE_CROSS_UNIT_RESULT_SCHEMA,
  instruction: [
    '以下是同一部书稿全部已闭合分析单元的归纳结果，按主题重新组织。只依据这些内容做跨单元核对。',
    '不重读稿件原文、不进行事实核查、不评审文学质量、不改写稿件、不给出修改建议、不引用外部知识、不调用任何工具。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.baseline-manuscript-analysis.cross-unit-result/1"）、',
    'findings（数组；每项含 kind、description、sides、confidence）、',
    'notes（字符串数组，用于无法归入 findings 的观察；没有时输出空数组）。',
    'kind 取 contradiction/continuity-break/alias-identity-divergence/chronology-conflict 之一。',
    'sides 至少两项，且至少落在两个不同的单元上；每项含 unitOrdinal（本消息列出的单元序号）与 sourceRanges。',
    '每个 sourceRanges 元素为 {"blockId": 该单元在本消息末尾列出的内容块标识, "fromGrapheme": 起始字素或 null, "toGrapheme": 结束字素或 null}，只能引用该单元自己列出的内容块。',
    'confidence 取 high/medium/low 之一；description 不超过 400 个字素；findings 最多 200 项，每项 sides 最多 8 项。',
    '只报告确实跨越两个及以上单元的矛盾、连续性断裂、别名与身份分歧、时序冲突；不重复单元内部已记录的冲突，也不为分歧的任一侧判定对错。',
  ].join('\n'),
  messageHeader: '跨单元归纳 {closed}/{total} · 单元集摘要 {unitSetDigest}',
  entityHeader: '实体与别名',
  eventHeader: '事件与时序',
  relationshipHeader: '关系',
  settingClaimHeader: '设定声明',
  entityLine: '- {name}（{kind}{aliases}）· 单元 {unitOrdinal} · 内容块 {blockIds}',
  eventLine: '- {summary}{chronology} · 单元 {unitOrdinal} · 内容块 {blockIds}',
  relationshipLine: '- {subject} —{relation}→ {object} · 单元 {unitOrdinal} · 内容块 {blockIds}',
  settingClaimLine: '- {subject}：{claim} · 单元 {unitOrdinal} · 内容块 {blockIds}',
  citedBlocksHeader: '各单元引用的内容块标识（按首次引用顺序）：',
  citedBlocksLine: '单元 {unitOrdinal}：{blockIds}',
  aliasPrefix: '；别名：',
  chronologyPrefix: '（时序：',
  chronologySuffix: '）',
  blockIdSeparator: '、',
} as const;

export const BASELINE_CROSS_UNIT_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(BASELINE_CROSS_UNIT_PROMPT_CONTRACT));

const HEADER_PATTERN = /^跨单元归纳 (\d+)\/(\d+) · 单元集摘要 ([0-9a-f]{64})$/u;
const CITED_BLOCKS_LINE_PATTERN = /^单元 (\d+)：(.+)$/u;
/** Graphemes, the unit every source range in this contract is already measured in. */
const GRAPHEMES = new Intl.Segmenter('zh', { granularity: 'grapheme' });

function graphemeCount(text: string): number {
  let count = 0;
  for (const _segment of GRAPHEMES.segment(text)) count += 1;
  return count;
}

/**
 * Interpolate a frozen template. A function replacement is used rather than a plain string so that a
 * `$` in a manuscript-derived name is inserted literally instead of being read as a replacement
 * pattern; an unknown placeholder is left in place, where the message tests catch it.
 */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) => values[key] ?? placeholder);
}

/** The distinct block ids of one row's ranges, in citation order. */
function rowBlockIds(ranges: ReadonlyArray<AnalysisSourceRangeProjection>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const range of ranges) {
    if (seen.has(range.blockId)) continue;
    seen.add(range.blockId);
    ids.push(range.blockId);
  }
  return ids;
}

function orderedClosed(closed: ReadonlyArray<ClosedUnitResult>): ClosedUnitResult[] {
  return [...closed].sort((left, right) => left.unitOrdinal - right.unitOrdinal);
}

interface TopicRow {
  readonly unitOrdinal: number;
  readonly text: string;
  readonly blockIds: ReadonlyArray<string>;
}

/**
 * The four topic sections in message order: topic first, then unit ordinal, then the unit's own item
 * order. The cited-blocks section is derived from exactly this traversal, so "first citation order"
 * is the order the reader of the message actually meets each identity in.
 */
function topicSections(closed: ReadonlyArray<ClosedUnitResult>): Array<{ header: string; rows: TopicRow[] }> {
  const contract = BASELINE_CROSS_UNIT_PROMPT_CONTRACT;
  const units = orderedClosed(closed);
  const rows = <T>(select: (result: BaselineUnitResult) => ReadonlyArray<T>, line: (item: T, unitOrdinal: number) => TopicRow): TopicRow[] =>
    units.flatMap((unit) => select(unit.result).map((item) => line(item, unit.unitOrdinal)));
  return [
    {
      header: contract.entityHeader,
      rows: rows((result) => result.entities, (entity, unitOrdinal) => {
        const blockIds = rowBlockIds(entity.sourceRanges);
        return {
          unitOrdinal,
          blockIds,
          text: fill(contract.entityLine, {
            name: entity.name,
            kind: entity.kind,
            aliases: entity.aliases.length === 0 ? '' : `${contract.aliasPrefix}${entity.aliases.join(contract.blockIdSeparator)}`,
            unitOrdinal: String(unitOrdinal),
            blockIds: blockIds.join(contract.blockIdSeparator),
          }),
        };
      }),
    },
    {
      header: contract.eventHeader,
      rows: rows((result) => result.events, (event, unitOrdinal) => {
        const blockIds = rowBlockIds(event.sourceRanges);
        return {
          unitOrdinal,
          blockIds,
          text: fill(contract.eventLine, {
            summary: event.summary,
            chronology: event.chronology === null ? '' : `${contract.chronologyPrefix}${event.chronology}${contract.chronologySuffix}`,
            unitOrdinal: String(unitOrdinal),
            blockIds: blockIds.join(contract.blockIdSeparator),
          }),
        };
      }),
    },
    {
      header: contract.relationshipHeader,
      rows: rows((result) => result.relationships, (relationship, unitOrdinal) => {
        const blockIds = rowBlockIds(relationship.sourceRanges);
        return {
          unitOrdinal,
          blockIds,
          text: fill(contract.relationshipLine, {
            subject: relationship.subject,
            relation: relationship.relation,
            object: relationship.object,
            unitOrdinal: String(unitOrdinal),
            blockIds: blockIds.join(contract.blockIdSeparator),
          }),
        };
      }),
    },
    {
      header: contract.settingClaimHeader,
      rows: rows((result) => result.settingClaims, (claim, unitOrdinal) => {
        const blockIds = rowBlockIds(claim.sourceRanges);
        return {
          unitOrdinal,
          blockIds,
          text: fill(contract.settingClaimLine, {
            subject: claim.subject,
            claim: claim.claim,
            unitOrdinal: String(unitOrdinal),
            blockIds: blockIds.join(contract.blockIdSeparator),
          }),
        };
      }),
    },
  ];
}

/**
 * Each closed unit's distinct cited block identities in first-citation order, keyed by unit ordinal.
 * This is the set a finding's side may cite, and the list `{{unit:U:block:N}}` indexes into.
 */
export function citedBlocksByUnit(closed: ReadonlyArray<ClosedUnitResult>): Map<number, string[]> {
  const cited = new Map<number, string[]>();
  for (const unit of orderedClosed(closed)) cited.set(unit.unitOrdinal, []);
  for (const section of topicSections(closed)) {
    for (const row of section.rows) {
      const ids = cited.get(row.unitOrdinal);
      if (ids === undefined) continue;
      for (const blockId of row.blockIds) if (!ids.includes(blockId)) ids.push(blockId);
    }
  }
  return cited;
}

/**
 * The exact user-role message for the cross-unit reduction: header, the frozen instruction text, the
 * four topic sections over the whole closed unit set, then each unit's cited block identities.
 */
export function buildCrossUnitMessage(closed: ReadonlyArray<ClosedUnitResult>, totalUnits: number): string {
  const contract = BASELINE_CROSS_UNIT_PROMPT_CONTRACT;
  const units = orderedClosed(closed);
  const lines = [
    fill(contract.messageHeader, { closed: String(units.length), total: String(totalUnits), unitSetDigest: unitSetDigest(units) }),
    contract.instruction,
  ];
  for (const section of topicSections(units)) {
    lines.push(section.header);
    for (const row of section.rows) lines.push(row.text);
  }
  lines.push(contract.citedBlocksHeader);
  for (const [unitOrdinal, blockIds] of citedBlocksByUnit(units)) {
    lines.push(fill(contract.citedBlocksLine, { unitOrdinal: String(unitOrdinal), blockIds: blockIds.join(contract.blockIdSeparator) }));
  }
  return lines.join('\n');
}

export interface CrossUnitMessageHeader {
  readonly closed: number;
  readonly total: number;
  readonly unitSetDigest: string;
}

/** Recover the reduction identity from a message built by {@link buildCrossUnitMessage}; `null` for anything else. */
export function parseCrossUnitMessageHeader(text: string): CrossUnitMessageHeader | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = HEADER_PATTERN.exec(firstLine);
  if (match === null) return null;
  const closed = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(closed) || closed < 2 || !Number.isSafeInteger(total) || total < closed) return null;
  return { closed, total, unitSetDigest: match[3]! };
}

/**
 * The cited-blocks section of a message built by {@link buildCrossUnitMessage}, read back from the
 * text alone. The deterministic adapter holds only the assembled message, and the section's format is
 * this contract's to own, so the reader lives here beside the writer.
 */
export function parseCrossUnitCitedBlocks(text: string): Map<number, string[]> {
  const contract = BASELINE_CROSS_UNIT_PROMPT_CONTRACT;
  const lines = text.split('\n');
  const start = lines.indexOf(contract.citedBlocksHeader);
  const cited = new Map<number, string[]>();
  if (start === -1) return cited;
  for (const line of lines.slice(start + 1)) {
    const match = CITED_BLOCKS_LINE_PATTERN.exec(line);
    if (match === null) continue;
    const blockIds = match[2]!.split(contract.blockIdSeparator).filter((blockId) => BLOCK_ID_PATTERN.test(blockId));
    cited.set(Number(match[1]), blockIds);
  }
  return cited;
}

/**
 * The digest of one exact closed unit set: SHA-256 over the canonical JSON of the closed results in
 * ordinal order with the schema field stripped. The same unit set always yields the same digest, so
 * a deterministic fixture entry answers exactly the reduction over exactly that set.
 */
export function unitSetDigest(closed: ReadonlyArray<ClosedUnitResult>): string {
  const bodies = orderedClosed(closed).map(({ result }) => {
    const { schema: _schema, ...rest } = result;
    return rest;
  });
  return sha256Hex(canonicalJson(bodies));
}

/**
 * The request digest a deterministic fixture keys the reduction by beside unit ordinal `0`: a pure
 * function of the frozen prompt contract and the exact closed unit set, independent of accumulated
 * history and of which Run produced the set.
 */
export function crossUnitRequestDigest(promptContractDigest: string, setDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(setDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitSetDigest: setDigest }));
}

function boundedText(value: unknown, maximumGraphemes: number): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.trim().length > 0 && graphemeCount(value) <= maximumGraphemes;
}

/**
 * Validate a model response against the cross-unit contract. Every refusal is one of four codes, and
 * the caller records it as a reducer gap; nothing here throws, because an invalid response is a
 * disclosed gap in the Result Set Revision and never a failed Run.
 */
export function parseCrossUnitResult(
  text: string,
  expected: { closedOrdinals: ReadonlyArray<number>; citedBlocksByUnit: ReadonlyMap<number, ReadonlyArray<string>> },
): CrossUnitResultParse {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  const body = fenced?.[1] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  }
  const invalid = (detail: string): CrossUnitResultParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(parsed) || !hasExactKeys(parsed, ['schema', 'findings', 'notes'])) return invalid('跨单元结果键集合不符合契约 v1。');
  if (parsed.schema !== BASELINE_CROSS_UNIT_RESULT_SCHEMA) return invalid('跨单元结果 schema 不是契约 v1。');
  if (!Array.isArray(parsed.findings) || parsed.findings.length > MAX_FINDINGS) return invalid('跨单元发现集合缺失或超出边界。');
  if (!Array.isArray(parsed.notes) || parsed.notes.length > MAX_NOTES || !parsed.notes.every((note) => boundedText(note, MAX_DESCRIPTION_GRAPHEMES))) {
    return invalid('跨单元备注不符合契约 v1。');
  }
  const closedOrdinals = new Set(expected.closedOrdinals);
  const findings: CrossUnitFinding[] = [];
  for (const [index, candidate] of (parsed.findings as unknown[]).entries()) {
    const label = `第 ${index + 1} 项跨单元发现`;
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['kind', 'description', 'sides', 'confidence'])) return invalid(`${label}的键集合不符合契约 v1。`);
    if (!CROSS_UNIT_FINDING_KINDS.includes(candidate.kind as CrossUnitFindingKind)) return invalid(`${label}的类别不在闭合集合内。`);
    if (!boundedText(candidate.description, MAX_DESCRIPTION_GRAPHEMES)) return invalid(`${label}的描述缺失或超出边界。`);
    if (!CONFIDENCE_LEVELS.includes(candidate.confidence as AnalysisConfidence)) return invalid(`${label}的置信度不在闭合集合内。`);
    if (!Array.isArray(candidate.sides) || candidate.sides.length < 2 || candidate.sides.length > MAX_SIDES) return invalid(`${label}的涉及方数量不符合契约 v1。`);
    const sides: CrossUnitFindingSide[] = [];
    for (const side of candidate.sides as unknown[]) {
      if (!isRecord(side) || !hasExactKeys(side, ['unitOrdinal', 'sourceRanges'])) return invalid(`${label}的涉及方键集合不符合契约 v1。`);
      if (!Number.isSafeInteger(side.unitOrdinal) || (side.unitOrdinal as number) < 1) return invalid(`${label}的涉及方单元序号无效。`);
      const unitOrdinal = side.unitOrdinal as number;
      if (!closedOrdinals.has(unitOrdinal)) {
        return { ok: false, code: 'unit-out-of-set', detail: `${label}引用了本次归纳单元集之外的单元 ${unitOrdinal}。` };
      }
      const cited = new Set(expected.citedBlocksByUnit.get(unitOrdinal) ?? []);
      if (!Array.isArray(side.sourceRanges) || side.sourceRanges.length > MAX_SIDE_RANGES) return invalid(`${label}的来源范围集合超出边界。`);
      for (const range of side.sourceRanges as unknown[]) {
        if (!isRecord(range) || !hasExactKeys(range, ['blockId', 'fromGrapheme', 'toGrapheme'])) return invalid(`${label}的来源范围不符合契约 v1。`);
        if (typeof range.blockId !== 'string' || !BLOCK_ID_PATTERN.test(range.blockId)) return invalid(`${label}的来源范围内容块标识无效。`);
        if (!cited.has(range.blockId)) {
          return { ok: false, code: 'range-out-of-unit', detail: `${label}引用了单元 ${unitOrdinal} 未列出的内容块。` };
        }
        const from = range.fromGrapheme;
        const to = range.toGrapheme;
        const bothNull = from === null && to === null;
        if (!bothNull && !(Number.isSafeInteger(from) && Number.isSafeInteger(to) && (from as number) >= 0 && (to as number) >= (from as number))) {
          return invalid(`${label}的来源范围字素位置无效。`);
        }
      }
      sides.push({
        unitOrdinal,
        sourceRanges: (side.sourceRanges as AnalysisSourceRangeProjection[])
          .map((range) => ({ blockId: range.blockId, fromGrapheme: range.fromGrapheme, toGrapheme: range.toGrapheme })),
      });
    }
    if (new Set(sides.map((side) => side.unitOrdinal)).size < 2) return invalid(`${label}没有落在两个不同的单元上。`);
    findings.push({
      kind: candidate.kind as CrossUnitFindingKind,
      description: candidate.description as string,
      sides,
      confidence: candidate.confidence as AnalysisConfidence,
    });
  }
  const result: BaselineCrossUnitResult = {
    schema: BASELINE_CROSS_UNIT_RESULT_SCHEMA,
    findings,
    notes: parsed.notes as string[],
  };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}
