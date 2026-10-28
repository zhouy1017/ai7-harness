import data from './standard-data.json' with { type: 'json' };
export { validBookTerms, validLocalTables } from '../../../shared/protocol/deterministic.js';

/** 2013 membership: Unicode 17.0.0 Unihan kTGH, ordered 1..8105.
 * https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip (Unicode License v3).
 * Character references combine the public 2013 table's encoded forms/conditions with
 * Unihan kSimplifiedVariant; these are references, never unconditional conversions.
 * GF 1001-2001: all 338 main groups and 44 appendix groups, from the admitted public
 * standard-table transcription. 双𨱑 was resolved from the source's p10/c1/r24 glyph.
 * https://gf.ywky.edu.cn/uploads/pdf/第一批异形词整理表.pdf
 * No network or material-admission mechanism participates in runtime checking.
 */
export const STANDARD_TABLE_VERSION = 1 as const;
export const STANDARD_CHARACTERS: ReadonlySet<string> = new Set(data.membership);
export const CHARACTER_FORMS: ReadonlyMap<string, { readonly targets: string; readonly note: string }> = new Map(
  data.characterForms.map(([form, targets, note]) => [form!, { targets: targets!, note: note! }]),
);
export const VARIANT_WORDS = data.variantWords;
export const APPENDIX_WORDS = data.appendixWords;
export const TABLE_RULE_IDS = ['C01', 'C02', 'V01', 'T01'] as const;
export type TableRuleId = typeof TABLE_RULE_IDS[number];
