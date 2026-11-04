import { type SalvagedModelResult, CONFIDENCE_LEVELS, ModelResultReader, NO_USABLE_MODEL_ENTRIES, BLOCK_ID_PATTERN, DIGEST_PATTERN, canonicalJson, hasKeys, isRecord, sha256Hex } from './canonical.js';
import type {
  AnalysisConflictProjection,
  AnalysisEntityKind,
  AnalysisSourceRangeProjection,
  CoverageManifestUnitProjection,
} from '../../shared/protocol.js';
import { BASELINE_ANALYSIS_CONTRACT_VERSION } from './identity.js';
import type { ManifestBlockInput } from './coverage-manifest.js';

/**
 * Baseline Manuscript Analysis Contract v1: the product-built, exact-versioned DSH Analysis Contract
 * for manuscript-internal structure and coverage. One typed partial result per Analysis Unit —
 * structural synopsis, entities/aliases/terms, events and chronology, relationships, internal-setting
 * claims, exact source ranges, confidence, conflicts, unresolved items. AI7 validates every model
 * `contentCandidate` before persistence, salvaging independent entries and recording every exclusion.
 *
 * The prompt contract is frozen text. Its digest binds the Execution Binding and the deterministic
 * fixture key; changing one character of it changes every request digest, which is the intent.
 */
export const BASELINE_UNIT_RESULT_SCHEMA = 'ai7.baseline-manuscript-analysis.unit-result/1' as const;
export const BASELINE_PROMPT_CONTRACT_SCHEMA = 'ai7.baseline-manuscript-analysis.prompt-contract/2' as const;
export const BASELINE_PROMPT_CONTRACT_V1_SCHEMA = 'ai7.baseline-manuscript-analysis.prompt-contract/1' as const;

const ENTITY_KINDS: ReadonlyArray<AnalysisEntityKind> = ['person', 'place', 'organization', 'object', 'term', 'other'];
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

export interface BaselineUnitResult extends SalvagedModelResult {
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
  | { ok: true; salvaged?: SalvagedModelResult['salvaged']; result: BaselineUnitResult; canonicalJson: string; digest: string }
  | { ok: false; code: UnitResultParseFailureCode; detail: string };

/** Drop unknown blocks, retaining their parent entry; invalid offsets fall back to the whole block. */
export function salvageSourceRanges(reader: ModelResultReader, value: unknown, blockIds: ReadonlySet<string>, section: string,
  maximum = MAX_ITEMS, blockLengths?: ReadonlyMap<string, number>): AnalysisSourceRangeProjection[] {
  return reader.array(value, section, maximum).flatMap<AnalysisSourceRangeProjection>((range, index) => {
    if (!hasKeys(range, ['blockId']) || typeof range.blockId !== 'string' || !BLOCK_ID_PATTERN.test(range.blockId) || !blockIds.has(range.blockId)) {
      reader.drop(section, index, 'range-out-of-unit');
      return [];
    }
    const from = range.fromGrapheme ?? null;
    const to = range.toGrapheme ?? null;
    const length = blockLengths?.get(range.blockId) ?? Infinity;
    if (from === null && to === null) return [{ blockId: range.blockId, fromGrapheme: null, toGrapheme: null }];
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || (from as number) < 0 || (to as number) < (from as number) || (to as number) > length) {
      reader.drop(section, index, 'range-offsets-whole-block');
      return [{ blockId: range.blockId, fromGrapheme: null, toGrapheme: null }];
    }
    return [{ blockId: range.blockId, fromGrapheme: from as number, toGrapheme: to as number }];
  });
}

export const CONFIDENCE_ALIASES: Readonly<Record<string, AnalysisConfidence>> = {
  高: 'high', 高置信度: 'high', 中: 'medium', 中等: 'medium', 中置信度: 'medium', 低: 'low', 低置信度: 'low',
};
const ENTITY_ALIASES: Readonly<Record<string, AnalysisEntityKind>> = {
  人物: 'person', 人: 'person', 地点: 'place', 地名: 'place', 机构: 'organization', 组织: 'organization',
  物品: 'object', 器物: 'object', 术语: 'term', 其他: 'other',
};

export function parseUnitResult(
  text: string,
  expected: { unitOrdinal: number; blockIds: ReadonlyArray<string>; blockLengths?: ReadonlyMap<string, number> },
): UnitResultParse {
  const reader = ModelResultReader.read(text, BASELINE_UNIT_RESULT_SCHEMA, expected.unitOrdinal);
  if (reader === null) return ModelResultReader.failure(text);
  const parsed = reader.value;
  const blockIds = new Set(expected.blockIds);
  const prose = (value: unknown, limit: number, section: string, index: number, optional = false) => reader.text(value, limit, section, index, optional);
  const ranges = (value: unknown, section: string) => salvageSourceRanges(reader, value, blockIds, section, MAX_ITEMS, expected.blockLengths);
  const strings = (value: unknown, section: string) => reader.array(value, section, MAX_ITEMS).flatMap((item, index) => {
    const text = prose(item, MAX_SHORT_TEXT, section, index);
    if (text === null) { reader.drop(section, index, 'text-invalid'); return []; }
    return [text];
  });
  const entries = <T>(section: string, parse: (value: Record<string, unknown>, index: number) => T | null): T[] =>
    reader.array(parsed[section], section, MAX_ITEMS).flatMap((candidate, index) => {
      const value = typeof candidate === 'string' && (section === 'conflicts' || section === 'unresolved')
        ? (reader.drop(section, index, 'string-note-wrapped'), { description: candidate }) : candidate;
      const result = isRecord(value) ? parse(value, index) : null;
      if (result === null) { reader.drop(section, index, 'entry-invalid'); return []; }
      return [result];
    });
  const entities = entries<UnitEntity>('entities', (value, index) => {
    const name = prose(value.name, MAX_SHORT_TEXT, 'entities', index);
    if (name === null) return null;
    return { name, kind: reader.enum(value.kind, ENTITY_KINDS, ENTITY_ALIASES, 'other', 'entities', index),
      aliases: strings(value.aliases, `entities.${index}.aliases`), note: prose(value.note, MAX_LONG_TEXT, 'entities', index, true) || null,
      sourceRanges: ranges(value.sourceRanges, `entities.${index}.sourceRanges`) };
  });
  const events = entries<UnitEvent>('events', (value, index) => {
    const summary = prose(value.summary, MAX_LONG_TEXT, 'events', index);
    if (summary === null) return null;
    if (!Number.isSafeInteger(value.ordinal) || (value.ordinal as number) < 1) reader.drop('events', index, 'ordinal-renumbered');
    return { ordinal: Number.isSafeInteger(value.ordinal) && (value.ordinal as number) > 0 ? value.ordinal as number : index + 1,
      summary, chronology: prose(value.chronology, MAX_SHORT_TEXT, 'events', index, true) || null,
      participants: strings(value.participants, `events.${index}.participants`), sourceRanges: ranges(value.sourceRanges, `events.${index}.sourceRanges`) };
  });
  if (new Set(events.map((event) => event.ordinal)).size !== events.length || events.some((event, index) => event.ordinal !== index + 1)) {
    events.forEach((event, index) => { if (event.ordinal !== index + 1) reader.drop('events', index, 'ordinal-renumbered'); });
    events.forEach((event, index) => { events[index] = { ...event, ordinal: index + 1 }; });
  }
  const relationships = entries<UnitRelationship>('relationships', (value, index) => {
    const subject = prose(value.subject, MAX_SHORT_TEXT, 'relationships', index);
    const object = prose(value.object, MAX_SHORT_TEXT, 'relationships', index);
    const relation = prose(value.relation, MAX_SHORT_TEXT, 'relationships', index);
    return subject === null || object === null || relation === null ? null : { subject, object, relation, sourceRanges: ranges(value.sourceRanges, `relationships.${index}.sourceRanges`) };
  });
  const settingClaims = entries<UnitSettingClaim>('settingClaims', (value, index) => {
    const subject = prose(value.subject, MAX_SHORT_TEXT, 'settingClaims', index);
    const claim = prose(value.claim, MAX_LONG_TEXT, 'settingClaims', index);
    return subject === null || claim === null ? null : { subject, claim, sourceRanges: ranges(value.sourceRanges, `settingClaims.${index}.sourceRanges`) };
  });
  const notes = (section: string) => entries<UnitNote>(section, (value, index) => {
    const description = prose(value.description, MAX_LONG_TEXT, section, index);
    return description === null ? null : { description, sourceRanges: ranges(value.sourceRanges, `${section}.${index}.sourceRanges`) };
  });
  const conflicts = notes('conflicts');
  const unresolved = notes('unresolved');
  const synopsis = prose(parsed.synopsis, MAX_LONG_TEXT, 'synopsis', -1, true) ?? '';
  const count = entities.length + events.length + relationships.length + settingClaims.length + conflicts.length + unresolved.length;
  if (synopsis === '' && count === 0) return { ok: false, code: 'schema-invalid', detail: NO_USABLE_MODEL_ENTRIES };
  return reader.finish<BaselineUnitResult>({ schema: BASELINE_UNIT_RESULT_SCHEMA, unitOrdinal: expected.unitOrdinal, synopsis, entities, events, relationships,
    settingClaims, conflicts, unresolved, confidence: reader.enum(parsed.confidence, CONFIDENCE_LEVELS, CONFIDENCE_ALIASES, 'low', 'confidence', -1) });
}

/**
 * Prompt contract /1, retained byte for byte as it was frozen before Issue #826 (digest `4ba25b2f…7eb5`). It describes the
 * `conflicts` and `unresolved` elements in prose alone, and a DeepSeek V4.1 Flash answer to it (S40/first-baseline/9) gave
 * them as bare strings, which {@link parseUnitResult} now wraps as typed notes. It binds nothing new: only the J-04 replay of the
 * recorded `sample1-recorded-v41-baseline` capture asks it again, so that historical Run asks what was asked then.
 */
export const BASELINE_PROMPT_CONTRACT_V1 = {
  schema: BASELINE_PROMPT_CONTRACT_V1_SCHEMA,
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

export const BASELINE_PROMPT_CONTRACT_V1_DIGEST = sha256Hex(canonicalJson(BASELINE_PROMPT_CONTRACT_V1));

/**
 * The current frozen prompt contract, /2 (Issue #826). It asks for the same unit result under the same analysis contract
 * and result schema as /1; only the system section changes. Each `conflicts` and `unresolved` element is given its literal
 * object shape, a bare string is ruled out, and an item no block of the unit anchors carries the empty `sourceRanges` the
 * schema already admits rather than an invented one. The unit message is /1's, header for header. Every field is
 * model-facing text or a fixed format; none is manuscript content.
 */
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
    'conflicts（数组，用于本单元内部发现的矛盾；每项都是对象 {"description": 矛盾说明字符串, "sourceRanges": sourceRanges 数组}）、',
    'unresolved（数组，用于无法在本单元内确定的事项；每项都是对象 {"description": 事项说明字符串, "sourceRanges": sourceRanges 数组}）、',
    'confidence（取 high/medium/low 之一）。',
    '每个 sourceRanges 元素为 {"blockId": 本单元给出的内容块标识, "fromGrapheme": 起始字素或 null, "toGrapheme": 结束字素或 null}，只能引用本单元列出的内容块。',
    'conflicts 与 unresolved 的元素绝不能是裸字符串：应写 [{"description": "说明", "sourceRanges": []}]，不得写 ["说明"]。某一事项在本单元列出的内容块中找不到依据时，其 sourceRanges 为空数组 []，不要编造引用。',
    '找不到的类别输出空数组。不要编造稿件中不存在的内容。',
  ].join('\n'),
  unitMessageHeader: BASELINE_PROMPT_CONTRACT_V1.unitMessageHeader,
  overlapHeader: BASELINE_PROMPT_CONTRACT_V1.overlapHeader,
  ownHeader: BASELINE_PROMPT_CONTRACT_V1.ownHeader,
  blockLine: BASELINE_PROMPT_CONTRACT_V1.blockLine,
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
