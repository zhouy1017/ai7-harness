import type { LocalCheckOptions, ProcedureDefinitionPin } from '../../../shared/protocol/procedures.js';
import { BLOCK_ID_PATTERN, canonicalJson, hasExactKeys, isRecord, sha256Hex } from '../../analysis/canonical.js';
import { graphemeCount } from '../../analysis/factual-review-contract.js';
import { LOCAL_CHECK_PROCEDURE, LOCAL_RULE_IDS, LOCAL_RULE_IDS_V2 } from './rules.js';
import type { HouseWordListDocument, HouseWordListPin } from '../../../shared/protocol/house-word-list.js';
import { validateHouseWordListSnapshot } from '../house-word-list.js';
import { localCheckProcedureDefinitionV2, localCheckProcedureDefinitionV3 } from '../../procedures/preinstalled.js';
import { STANDARD_TABLE_VERSION, TABLE_RULE_IDS, validLocalTables } from './tables.js';

export const LOCAL_PLAN_SCHEMA = 'ai7.review.local-plan/1' as const;
export const LOCAL_PLAN_SCHEMA_V2 = 'ai7.review.local-plan/2' as const;
export interface LocalCheckBlock { readonly blockId: string; readonly position: number; readonly text: string }
export interface LocalCheckSource {
  readonly manuscriptId: string; readonly branchId: string; readonly revisionId: string;
  readonly journalSequence: number; readonly workingDigest: string;
}
export interface LocalCheckPlan {
  readonly schema: typeof LOCAL_PLAN_SCHEMA;
  readonly procedure: ProcedureDefinitionPin;
  readonly rules: readonly { readonly id: string; readonly version: number }[];
  readonly source: LocalCheckSource;
  /** Exact per-Book import boundary, so copied historical authorization cannot run in its destination. */
  readonly bookImportId: string | null;
  readonly scope: 'whole' | 'chapters' | 'selection';
  readonly options: LocalCheckOptions;
  readonly blocks: readonly LocalCheckBlock[];
  readonly digest: string;
}
export interface LocalCheckPlanV2 extends Omit<LocalCheckPlan, 'schema' | 'rules'> {
  readonly schema: typeof LOCAL_PLAN_SCHEMA_V2;
  readonly rules: readonly { readonly id: string; readonly version: number }[];
  readonly grammarVersion: 1; readonly exclusionVersion: 1;
  readonly houseWordList: { readonly pin: HouseWordListPin; readonly document: HouseWordListDocument };
}
export interface LocalCheckPlanV3 extends Omit<LocalCheckPlanV2, 'schema' | 'houseWordList'> {
  readonly schema: 'ai7.review.local-plan/3';
  readonly standardTableVersion: typeof STANDARD_TABLE_VERSION;
  readonly houseWordList: LocalCheckPlanV2['houseWordList'] | null;
}
export type AnyLocalCheckPlan = LocalCheckPlan | LocalCheckPlanV2 | LocalCheckPlanV3;
export class LocalCheckError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'LocalCheckError'; }
}
function requireLocal(condition: unknown): asserts condition {
  if (!condition) throw new LocalCheckError('LOCAL_PLAN_INVALID', '本地检查计划或输入无效；请重新准备。');
}
export function validLocalOptions(value: unknown): value is LocalCheckOptions {
  if (!isRecord(value) || !hasExactKeys(value, ['punctuation', 'numerals', 'publication', 'numeralRules', 'numeralsConfirmed', 'excludedRanges', 'doubledEllipsisBlockIds', ...(value.tables === undefined ? [] : ['tables'])]) ||
      value.tables !== undefined && !validLocalTables(value.tables)) return false;
  return ['chinese-prose', 'off'].includes(String(value.punctuation)) && ['off', 'national-standard', 'editor-convention'].includes(String(value.numerals)) &&
    ['within-scope', 'literary', 'reprinted-classic', 'unknown'].includes(String(value.publication)) && typeof value.numeralsConfirmed === 'boolean' &&
    Array.isArray(value.numeralRules) && value.numeralRules.length <= 2 && new Set(value.numeralRules).size === value.numeralRules.length && value.numeralRules.every((id) => id === 'N01' || id === 'N02') &&
    (value.numerals === 'off' ? value.numeralRules.length === 0 && value.numeralsConfirmed === false : value.numeralsConfirmed && value.numeralRules.length > 0) &&
    Array.isArray(value.excludedRanges) && value.excludedRanges.length <= 256 && value.excludedRanges.every((range) => isRecord(range) && hasExactKeys(range, ['blockId', 'from', 'to', 'reason']) &&
      typeof range.blockId === 'string' && BLOCK_ID_PATTERN.test(range.blockId) && Number.isSafeInteger(range.from) && Number.isSafeInteger(range.to) && Number(range.from) >= 0 && Number(range.to) > Number(range.from) && (range.reason === 'foreign' || range.reason === 'technical')) &&
    Array.isArray(value.doubledEllipsisBlockIds) && value.doubledEllipsisBlockIds.length <= 256 && new Set(value.doubledEllipsisBlockIds).size === value.doubledEllipsisBlockIds.length &&
    value.doubledEllipsisBlockIds.every((id) => typeof id === 'string' && BLOCK_ID_PATTERN.test(id));
}
export function freezeLocalPlan(input: Omit<LocalCheckPlan, 'schema' | 'rules' | 'digest'>): LocalCheckPlan {
  const body = { schema: LOCAL_PLAN_SCHEMA, ...structuredClone(input), rules: LOCAL_RULE_IDS.map((id) => ({ id, version: 1 })) };
  const plan = { ...body, digest: sha256Hex(canonicalJson(body)) };
  validateLocalPlan(plan);
  return plan;
}
export function validateLocalPlan(value: unknown): asserts value is LocalCheckPlan {
  requireLocal(isRecord(value) && hasExactKeys(value, ['schema', 'procedure', 'rules', 'source', 'bookImportId', 'scope', 'options', 'blocks', 'digest']));
  const { digest, ...body } = value;
  requireLocal(value.schema === LOCAL_PLAN_SCHEMA && typeof digest === 'string' && digest === sha256Hex(canonicalJson(body)));
  validateLocalFields(value, 1, LOCAL_RULE_IDS);
}
/** Same source/options validation, with genuine versioned owner data rather than a projected v1 record. */
function validateLocalFields(value: Record<string, unknown>, version: 1 | 2 | 3, ruleIds: readonly string[]): void {
  requireLocal(value.bookImportId === null || typeof value.bookImportId === 'string' && /^[0-9a-f-]{36}$/i.test(value.bookImportId));
  requireLocal(isRecord(value.procedure) && hasExactKeys(value.procedure, ['procedureId', 'version', 'digest']) &&
    value.procedure.procedureId === LOCAL_CHECK_PROCEDURE && value.procedure.version === version && typeof value.procedure.digest === 'string' && /^[0-9a-f]{64}$/.test(value.procedure.digest));
  requireLocal(canonicalJson(value.rules) === canonicalJson(ruleIds.map((id) => ({ id, version: 1 }))));
  requireLocal(['whole', 'chapters', 'selection'].includes(String(value.scope)) && validLocalOptions(value.options));
  requireLocal(version === 3 ? value.options.tables !== undefined : value.options.tables === undefined);
  const source = value.source;
  requireLocal(isRecord(source) && hasExactKeys(source, ['manuscriptId', 'branchId', 'revisionId', 'journalSequence', 'workingDigest']) &&
    ['manuscriptId', 'branchId', 'revisionId'].every((key) => typeof source[key] === 'string' && /^[0-9a-f-]{36}$/i.test(source[key] as string)) &&
    Number.isSafeInteger(source.journalSequence) && Number(source.journalSequence) >= 0 && typeof source.workingDigest === 'string' && /^[0-9a-f]{64}$/.test(source.workingDigest));
  requireLocal(Array.isArray(value.blocks) && value.blocks.length > 0);
  let previous = 0;
  const ids = new Set<string>();
  for (const block of value.blocks) {
    requireLocal(isRecord(block) && hasExactKeys(block, ['blockId', 'position', 'text']) && typeof block.blockId === 'string' && BLOCK_ID_PATTERN.test(block.blockId) &&
      typeof block.text === 'string' && Number.isSafeInteger(block.position) && Number(block.position) > previous && !ids.has(block.blockId));
    previous = Number(block.position); ids.add(block.blockId);
  }
  const blocks = value.blocks as unknown as LocalCheckBlock[];
  for (const range of value.options.excludedRanges) {
    const block = blocks.find((block) => block.blockId === range.blockId);
    requireLocal(block !== undefined && range.to <= graphemeCount(block.text));
  }
  requireLocal(value.options.doubledEllipsisBlockIds.every((id) => ids.has(id)));
}

export function freezeLocalPlanV2(input: Omit<LocalCheckPlanV2, 'schema' | 'rules' | 'digest' | 'grammarVersion' | 'exclusionVersion'>): LocalCheckPlanV2 {
  const body = { schema: LOCAL_PLAN_SCHEMA_V2, ...structuredClone(input), grammarVersion: 1 as const, exclusionVersion: 1 as const,
    rules: LOCAL_RULE_IDS_V2.map((id) => ({ id, version: 1 })) };
  const plan = { ...body, digest: sha256Hex(canonicalJson(body)) };
  validateLocalPlanV2(plan); return plan;
}
export function validateLocalPlanV2(value: unknown): asserts value is LocalCheckPlanV2 {
  requireLocal(isRecord(value) && hasExactKeys(value, ['schema', 'procedure', 'rules', 'source', 'bookImportId', 'scope', 'options', 'blocks', 'digest', 'grammarVersion', 'exclusionVersion', 'houseWordList']));
  const { digest, ...body } = value;
  requireLocal(value.schema === LOCAL_PLAN_SCHEMA_V2 && typeof digest === 'string' && digest === sha256Hex(canonicalJson(body)) && value.grammarVersion === 1 && value.exclusionVersion === 1);
  validateLocalFields(value, 2, LOCAL_RULE_IDS_V2);
  requireLocal(isRecord(value.procedure) && value.procedure.digest === sha256Hex(canonicalJson(localCheckProcedureDefinitionV2())));
  requireLocal(isRecord(value.houseWordList) && hasExactKeys(value.houseWordList, ['pin', 'document']));
  validateHouseWordListSnapshot(value.houseWordList.document, value.houseWordList.pin);
  requireLocal(value.houseWordList.document.entries.some((entry) => entry.enabled));
}

export function freezeLocalPlanV3(input: Omit<LocalCheckPlanV3, 'schema' | 'rules' | 'digest' | 'grammarVersion' | 'exclusionVersion' | 'standardTableVersion'>): LocalCheckPlanV3 {
  const body = { schema: 'ai7.review.local-plan/3' as const, ...structuredClone(input), grammarVersion: 1 as const, exclusionVersion: 1 as const,
    standardTableVersion: STANDARD_TABLE_VERSION, rules: [...LOCAL_RULE_IDS_V2, ...TABLE_RULE_IDS].map((id) => ({ id, version: 1 })) };
  const plan = { ...body, digest: sha256Hex(canonicalJson(body)) };
  validateLocalPlanV3(plan); return plan;
}
export function validateLocalPlanV3(value: unknown): asserts value is LocalCheckPlanV3 {
  requireLocal(isRecord(value) && hasExactKeys(value, ['schema', 'procedure', 'rules', 'source', 'bookImportId', 'scope', 'options', 'blocks', 'digest', 'grammarVersion', 'exclusionVersion', 'houseWordList', 'standardTableVersion']));
  const { digest, ...body } = value;
  requireLocal(value.schema === 'ai7.review.local-plan/3' && digest === sha256Hex(canonicalJson(body)) && value.grammarVersion === 1 && value.exclusionVersion === 1 && value.standardTableVersion === STANDARD_TABLE_VERSION);
  validateLocalFields(value, 3, [...LOCAL_RULE_IDS_V2, ...TABLE_RULE_IDS]);
  requireLocal(isRecord(value.procedure) && value.procedure.digest === sha256Hex(canonicalJson(localCheckProcedureDefinitionV3())) && isRecord(value.options) && validLocalTables(value.options.tables));
  if (value.houseWordList === null) requireLocal(value.options.tables.houseWordList === null);
  else {
    requireLocal(isRecord(value.houseWordList) && hasExactKeys(value.houseWordList, ['pin', 'document']));
    validateHouseWordListSnapshot(value.houseWordList.document, value.houseWordList.pin);
    requireLocal(canonicalJson(value.houseWordList.pin) === canonicalJson(value.options.tables.houseWordList));
    requireLocal(value.houseWordList.document.entries.some((entry) => entry.enabled));
  }
}
export function validateAnyLocalPlan(value: unknown): asserts value is AnyLocalCheckPlan {
  if (isRecord(value) && value.schema === 'ai7.review.local-plan/3') validateLocalPlanV3(value);
  else if (isRecord(value) && value.schema === 'ai7.review.local-plan/2') validateLocalPlanV2(value);
  else validateLocalPlan(value);
}

export function numeralBasis(options: LocalCheckOptions): 'disabled' | 'out-of-applicability' | 'national-standard' | 'editor-convention' {
  return options.numerals === 'off' ? 'disabled' : options.numerals === 'national-standard' && options.publication !== 'within-scope'
    ? 'out-of-applicability' : options.numerals;
}
