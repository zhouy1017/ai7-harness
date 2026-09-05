import type {
  AnalysisConflictProjection,
  AnalysisEntityKind,
  AnalysisSourceRangeProjection,
  CoverageManifestUnitProjection,
} from '../../shared/protocol.js';
import { BLOCK_ID_PATTERN, DIGEST_PATTERN, canonicalJson, hasExactKeys, isRecord, sha256Hex } from './canonical.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION } from './identity.js';
import type { ManifestBlockInput } from './coverage-manifest.js';

/**
 * Baseline Manuscript Analysis Contract v1: the product-built, exact-versioned DSH Analysis Contract
 * for manuscript-internal structure and coverage. One typed partial result per Analysis Unit —
 * structural synopsis, entities/aliases/terms, events and chronology, relationships, internal-setting
 * claims, exact source ranges, confidence, conflicts, unresolved items. AI7 validates every model
 * `contentCandidate` against this schema before persistence; an invalid unit is an exact gap.
 *
 * The prompt contract is frozen text. Its digest binds the Execution Binding and the deterministic
 * fixture key; changing one character of it changes every request digest, which is the intent.
 */
export const BASELINE_UNIT_RESULT_SCHEMA = 'ai7.baseline-manuscript-analysis.unit-result/1' as const;
export const BASELINE_PROMPT_CONTRACT_SCHEMA = 'ai7.baseline-manuscript-analysis.prompt-contract/1' as const;

const ENTITY_KINDS: ReadonlyArray<AnalysisEntityKind> = ['person', 'place', 'organization', 'object', 'term', 'other'];
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
const MAX_ITEMS = 500;
const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 4_000;

export type AnalysisConfidence = (typeof CONFIDENCE_LEVELS)[number];

export interface UnitEntity {
  readonly name: string;
  readonly kind: AnalysisEntityKind;
  readonly aliases: ReadonlyArray<string>;
  readonly note: string | null;
  readonly sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface UnitEvent {
  readonly ordinal: number;
  readonly summary: string;
  readonly chronology: string | null;
  readonly participants: ReadonlyArray<string>;
  readonly sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface UnitRelationship {
  readonly subject: string;
  readonly object: string;
  readonly relation: string;
  readonly sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface UnitSettingClaim {
  readonly subject: string;
  readonly claim: string;
  readonly sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface UnitNote {
  readonly description: string;
  readonly sourceRanges: ReadonlyArray<AnalysisSourceRangeProjection>;
}

export interface BaselineUnitResult {
  readonly schema: typeof BASELINE_UNIT_RESULT_SCHEMA;
  readonly unitOrdinal: number;
  readonly synopsis: string;
  readonly entities: ReadonlyArray<UnitEntity>;
  readonly events: ReadonlyArray<UnitEvent>;
  readonly relationships: ReadonlyArray<UnitRelationship>;
  readonly settingClaims: ReadonlyArray<UnitSettingClaim>;
  readonly conflicts: ReadonlyArray<UnitNote>;
  readonly unresolved: ReadonlyArray<UnitNote>;
  readonly confidence: AnalysisConfidence;
}

export type UnitResultParseFailureCode = 'not-json' | 'schema-invalid' | 'unit-mismatch' | 'range-out-of-unit';

export type UnitResultParse =
  | { ok: true; result: BaselineUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: UnitResultParseFailureCode; detail: string };

function boundedText(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.isWellFormed() && value.length <= maximum && (allowEmpty || value.trim().length > 0);
}

function boundedList<T>(value: unknown, item: (candidate: unknown) => candidate is T): value is T[] {
  return Array.isArray(value) && value.length <= MAX_ITEMS && value.every(item);
}

function validSourceRange(value: unknown, blockIds: ReadonlySet<string>): value is AnalysisSourceRangeProjection {
  if (!isRecord(value) || !hasExactKeys(value, ['blockId', 'fromGrapheme', 'toGrapheme'])) return false;
  if (typeof value.blockId !== 'string' || !BLOCK_ID_PATTERN.test(value.blockId) || !blockIds.has(value.blockId)) return false;
  const from = value.fromGrapheme;
  const to = value.toGrapheme;
  if (from === null && to === null) return true;
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && (from as number) >= 0 && (to as number) >= (from as number);
}

function validText(candidate: unknown): candidate is string {
  return boundedText(candidate, MAX_SHORT_TEXT);
}

export function parseUnitResult(
  text: string,
  expected: { unitOrdinal: number; blockIds: ReadonlyArray<string> },
): UnitResultParse {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text);
  const body = fenced?.[1] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, code: 'not-json', detail: '模型输出不是 JSON。' };
  }
  const invalid = (detail: string): UnitResultParse => ({ ok: false, code: 'schema-invalid', detail });
  if (!isRecord(parsed) || !hasExactKeys(parsed, [
    'schema', 'unitOrdinal', 'synopsis', 'entities', 'events', 'relationships', 'settingClaims', 'conflicts', 'unresolved', 'confidence',
  ])) return invalid('单元结果键集合不符合契约 v1。');
  if (parsed.schema !== BASELINE_UNIT_RESULT_SCHEMA) return invalid('单元结果 schema 不是契约 v1。');
  if (!Number.isSafeInteger(parsed.unitOrdinal) || (parsed.unitOrdinal as number) < 1) return invalid('单元序号无效。');
  if (parsed.unitOrdinal !== expected.unitOrdinal) {
    return { ok: false, code: 'unit-mismatch', detail: `单元结果声明的序号 ${String(parsed.unitOrdinal)} 与请求单元 ${expected.unitOrdinal} 不一致。` };
  }
  if (!boundedText(parsed.synopsis, MAX_LONG_TEXT)) return invalid('结构概述缺失或超出边界。');
  if (!CONFIDENCE_LEVELS.includes(parsed.confidence as AnalysisConfidence)) return invalid('置信度不在闭合集合内。');
  const blockIds = new Set(expected.blockIds);
  let rangeOutOfUnit = false;
  const ranges = (candidate: unknown): candidate is AnalysisSourceRangeProjection[] => {
    if (!Array.isArray(candidate) || candidate.length > MAX_ITEMS) return false;
    for (const range of candidate) {
      if (!isRecord(range) || !hasExactKeys(range, ['blockId', 'fromGrapheme', 'toGrapheme'])) return false;
      if (typeof range.blockId === 'string' && BLOCK_ID_PATTERN.test(range.blockId) && !blockIds.has(range.blockId)) {
        rangeOutOfUnit = true;
        return false;
      }
      if (!validSourceRange(range, blockIds)) return false;
    }
    return true;
  };
  const validEntity = (candidate: unknown): candidate is UnitEntity =>
    isRecord(candidate) && hasExactKeys(candidate, ['name', 'kind', 'aliases', 'note', 'sourceRanges']) &&
    validText(candidate.name) && ENTITY_KINDS.includes(candidate.kind as AnalysisEntityKind) &&
    boundedList(candidate.aliases, validText) && (candidate.note === null || boundedText(candidate.note, MAX_LONG_TEXT)) &&
    ranges(candidate.sourceRanges);
  const validEvent = (candidate: unknown): candidate is UnitEvent =>
    isRecord(candidate) && hasExactKeys(candidate, ['ordinal', 'summary', 'chronology', 'participants', 'sourceRanges']) &&
    Number.isSafeInteger(candidate.ordinal) && (candidate.ordinal as number) >= 1 && boundedText(candidate.summary, MAX_LONG_TEXT) &&
    (candidate.chronology === null || boundedText(candidate.chronology, MAX_SHORT_TEXT)) &&
    boundedList(candidate.participants, validText) && ranges(candidate.sourceRanges);
  const validRelationship = (candidate: unknown): candidate is UnitRelationship =>
    isRecord(candidate) && hasExactKeys(candidate, ['subject', 'object', 'relation', 'sourceRanges']) &&
    validText(candidate.subject) && validText(candidate.object) && validText(candidate.relation) && ranges(candidate.sourceRanges);
  const validClaim = (candidate: unknown): candidate is UnitSettingClaim =>
    isRecord(candidate) && hasExactKeys(candidate, ['subject', 'claim', 'sourceRanges']) &&
    validText(candidate.subject) && boundedText(candidate.claim, MAX_LONG_TEXT) && ranges(candidate.sourceRanges);
  const validNote = (candidate: unknown): candidate is UnitNote =>
    isRecord(candidate) && hasExactKeys(candidate, ['description', 'sourceRanges']) &&
    boundedText(candidate.description, MAX_LONG_TEXT) && ranges(candidate.sourceRanges);
  const sections: Array<[string, (candidate: unknown) => boolean, string]> = [
    ['entities', (value) => boundedList(value, validEntity), '实体/别名/术语'],
    ['events', (value) => boundedList(value, validEvent), '事件与时序'],
    ['relationships', (value) => boundedList(value, validRelationship), '关系'],
    ['settingClaims', (value) => boundedList(value, validClaim), '内部设定声明'],
    ['conflicts', (value) => boundedList(value, validNote), '冲突'],
    ['unresolved', (value) => boundedList(value, validNote), '未解决事项'],
  ];
  for (const [key, valid, label] of sections) {
    if (!valid(parsed[key])) {
      if (rangeOutOfUnit) return { ok: false, code: 'range-out-of-unit', detail: `${label}引用了本单元范围之外的内容块。` };
      return invalid(`${label}不符合契约 v1。`);
    }
  }
  const events = parsed.events as UnitEvent[];
  const ordinals = events.map((event) => event.ordinal);
  if (new Set(ordinals).size !== ordinals.length) return invalid('事件序号重复。');
  const result: BaselineUnitResult = {
    schema: BASELINE_UNIT_RESULT_SCHEMA,
    unitOrdinal: expected.unitOrdinal,
    synopsis: parsed.synopsis as string,
    entities: parsed.entities as UnitEntity[],
    events,
    relationships: parsed.relationships as UnitRelationship[],
    settingClaims: parsed.settingClaims as UnitSettingClaim[],
    conflicts: parsed.conflicts as UnitNote[],
    unresolved: parsed.unresolved as UnitNote[],
    confidence: parsed.confidence as AnalysisConfidence,
  };
  const canonical = canonicalJson(result);
  return { ok: true, result, canonicalJson: canonical, digest: sha256Hex(canonical) };
}

/** The frozen prompt contract. Every field is model-facing text or a fixed format; none is manuscript content. */
export const BASELINE_PROMPT_CONTRACT = {
  schema: BASELINE_PROMPT_CONTRACT_SCHEMA,
  contractVersion: BASELINE_ANALYSIS_CONTRACT_VERSION,
  responseSchema: BASELINE_UNIT_RESULT_SCHEMA,
  systemPrompt: [
    '你是 AI7 的基线稿件分析组件。你只处理用户消息中给出的一个分析单元，逐块阅读并输出一份结构化归纳。',
    '不进行事实核查、不评审文学质量、不改写稿件、不给出修改建议、不引用外部知识、不调用任何工具。',
    '只输出一个 JSON 对象，不加说明文字，不加代码围栏。JSON 必须精确包含以下键，且不得多出任何键：',
    'schema（固定为 "ai7.baseline-manuscript-analysis.unit-result/1"）、unitOrdinal（与用户消息头部的单元序号一致）、synopsis（本单元结构概述，字符串）、',
    'entities（数组；每项含 name、kind、aliases、note、sourceRanges；kind 取 person/place/organization/object/term/other 之一；note 可为 null）、',
    'events（数组；每项含 ordinal、summary、chronology、participants、sourceRanges；chronology 可为 null）、',
    'relationships（数组；每项含 subject、object、relation、sourceRanges）、',
    'settingClaims（数组；每项含 subject、claim、sourceRanges，用于稿件内部设定声明）、',
    'conflicts（数组；每项含 description、sourceRanges，用于本单元内部发现的矛盾）、',
    'unresolved（数组；每项含 description、sourceRanges，用于无法在本单元内确定的事项）、',
    'confidence（取 high/medium/low 之一）。',
    '每个 sourceRanges 元素为 {"blockId": 本单元给出的内容块标识, "fromGrapheme": 起始字素或 null, "toGrapheme": 结束字素或 null}，只能引用本单元列出的内容块。',
    '找不到的类别输出空数组。不要编造稿件中不存在的内容。',
  ].join('\n'),
  unitMessageHeader: '分析单元 {ordinal}/{total} · 单元摘要 {unitDigest}',
  overlapHeader: '以下为承接上一单元的重叠上下文（仅供理解，不属于本单元的覆盖范围）：',
  ownHeader: '以下为本单元需要归纳的内容块：',
  blockLine: '[{blockId}] ({kind}{level}) {text}',
} as const;

export const BASELINE_PROMPT_CONTRACT_DIGEST = sha256Hex(canonicalJson(BASELINE_PROMPT_CONTRACT));

const HEADER_PATTERN = /^分析单元 (\d+)\/(\d+) · 单元摘要 ([0-9a-f]{64})$/u;

function blockLine(block: Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>): string {
  return BASELINE_PROMPT_CONTRACT.blockLine
    .replace('{blockId}', block.blockId)
    .replace('{kind}', block.kind)
    .replace('{level}', block.level === null ? '' : ` h${block.level}`)
    .replace('{text}', block.text);
}

/** The exact user-role message for one Analysis Unit: header, optional overlap context, then own blocks. */
export function buildUnitMessage(
  unit: CoverageManifestUnitProjection,
  totalUnits: number,
  blocksById: ReadonlyMap<string, Pick<ManifestBlockInput, 'blockId' | 'kind' | 'level' | 'text'>>,
): string {
  const lines = [
    BASELINE_PROMPT_CONTRACT.unitMessageHeader
      .replace('{ordinal}', String(unit.ordinal))
      .replace('{total}', String(totalUnits))
      .replace('{unitDigest}', unit.digest),
  ];
  if (unit.overlapBlockIds.length > 0) {
    lines.push(BASELINE_PROMPT_CONTRACT.overlapHeader);
    for (const blockId of unit.overlapBlockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  }
  lines.push(BASELINE_PROMPT_CONTRACT.ownHeader);
  for (const blockId of unit.blockIds) lines.push(blockLine(requireBlock(blocksById, blockId)));
  return lines.join('\n');
}

function requireBlock<T>(blocksById: ReadonlyMap<string, T>, blockId: string): T {
  const block = blocksById.get(blockId);
  if (block === undefined) throw new Error('ANALYSIS_UNIT_BLOCK_MISSING');
  return block;
}

export interface UnitMessageHeader {
  readonly ordinal: number;
  readonly total: number;
  readonly unitDigest: string;
}

/** Recover the unit identity from a user message built by {@link buildUnitMessage}; `null` for anything else. */
export function parseUnitMessageHeader(text: string): UnitMessageHeader | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const match = HEADER_PATTERN.exec(firstLine);
  if (match === null) return null;
  const ordinal = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || !Number.isSafeInteger(total) || total < ordinal) return null;
  return { ordinal, total, unitDigest: match[3]! };
}

/**
 * The request digest a deterministic fixture is keyed by beside the unit ordinal: a pure function of
 * the frozen prompt contract and the exact manifest unit, independent of accumulated history.
 */
export function unitRequestDigest(promptContractDigest: string, unitOrdinal: number, unitDigest: string): string {
  if (!DIGEST_PATTERN.test(promptContractDigest) || !DIGEST_PATTERN.test(unitDigest)) throw new Error('ANALYSIS_REQUEST_DIGEST_INVALID');
  return sha256Hex(canonicalJson({ promptContractDigest, unitOrdinal, unitDigest }));
}

/** Conflict kinds the deterministic cross-unit pass may report, beside unit-reported conflicts. */
export const CROSS_UNIT_CONFLICT_KINDS: ReadonlyArray<AnalysisConflictProjection['kind']> = [
  'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence',
];
