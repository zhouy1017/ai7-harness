import type { LocalCheckOptions, ProcedureDefinitionPin } from '../../../shared/protocol/procedures.js';
import { BLOCK_ID_PATTERN, canonicalJson, hasExactKeys, isRecord, sha256Hex } from '../../analysis/canonical.js';
import { graphemeCount } from '../../analysis/factual-review-contract.js';
import { LOCAL_CHECK_PROCEDURE, LOCAL_RULE_IDS } from './rules.js';

export const LOCAL_PLAN_SCHEMA = 'ai7.review.local-plan/1' as const;
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
export class LocalCheckError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'LocalCheckError'; }
}
function requireLocal(condition: unknown): asserts condition {
  if (!condition) throw new LocalCheckError('LOCAL_PLAN_INVALID', '本地检查计划或输入无效；请重新准备。');
}
export function validLocalOptions(value: unknown): value is LocalCheckOptions {
  if (!isRecord(value) || !hasExactKeys(value, ['punctuation', 'numerals', 'publication', 'numeralRules', 'numeralsConfirmed', 'excludedRanges', 'doubledEllipsisBlockIds'])) return false;
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
  requireLocal(value.bookImportId === null || typeof value.bookImportId === 'string' && /^[0-9a-f-]{36}$/i.test(value.bookImportId));
  requireLocal(isRecord(value.procedure) && hasExactKeys(value.procedure, ['procedureId', 'version', 'digest']) &&
    value.procedure.procedureId === LOCAL_CHECK_PROCEDURE && value.procedure.version === 1 && typeof value.procedure.digest === 'string' && /^[0-9a-f]{64}$/.test(value.procedure.digest));
  requireLocal(canonicalJson(value.rules) === canonicalJson(LOCAL_RULE_IDS.map((id) => ({ id, version: 1 }))));
  requireLocal(['whole', 'chapters', 'selection'].includes(String(value.scope)) && validLocalOptions(value.options));
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

export function numeralBasis(options: LocalCheckOptions): 'disabled' | 'out-of-applicability' | 'national-standard' | 'editor-convention' {
  return options.numerals === 'off' ? 'disabled' : options.numerals === 'national-standard' && options.publication !== 'within-scope'
    ? 'out-of-applicability' : options.numerals;
}
