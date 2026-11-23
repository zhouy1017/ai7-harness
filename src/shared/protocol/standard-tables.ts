import { z } from 'zod';

export const standardTableKind = z.enum(['standard-characters', 'character-forms', 'word-forms', 'common-words']);
export const standardStrength = z.enum(['national', 'dictionary', 'house']);
export const standardTableRow = z.object({
  recommended: z.string().max(4096), discouraged: z.array(z.string().min(1).max(4096)).max(64),
  rank: z.number().int().positive().nullable(), condition: z.string().min(1).max(8192).nullable(),
  source: z.string().max(8192).nullable(), strength: standardStrength,
  status: z.enum(['applied', 'to-confirm', 'unrecognized']), reviewNote: z.string().max(8192).nullable(), sourceText: z.string().max(32768).nullable(),
}).strict().refine(row => (row.status === 'unrecognized' || row.recommended.trim().length > 0) && new TextEncoder().encode(JSON.stringify(row)).length <= 48000);
export type StandardTableRow = z.infer<typeof standardTableRow>;
export type StandardTableKind = z.infer<typeof standardTableKind>;
export type StandardStrength = z.infer<typeof standardStrength>;
export type StandardEntryStatus = StandardTableRow['status'];
export type PreinstalledTableKey = 'tgh-2013' | 'tgh-2013-annex-1' | 'gf-1001-2001' | 'cycb-2';
export interface StandardTableCounts { applied: number; toConfirm: number; unrecognized: number }
export interface StandardTableConversionReport {
  method: 'direct' | 'model' | 'editor'; model: string | null; counts: StandardTableCounts; partsTotal?: number;
  parts: { part: number; firstParagraph: number; paragraphs: number; attempts: number; state: 'checked' | 'fallback' | 'outcome-unknown'; reason: string | null }[];
}
export interface StandardTableVersion {
  versionId: string; ordinal: number; versionLabel: string; sourceDescription: string; digest: string;
  sourceFileName: string | null; sourceObjectDigest: string | null; recordedAt: string; entryCount: number;
}
export interface StandardTableItem extends Omit<StandardTableVersion, 'versionId' | 'ordinal' | 'digest' | 'sourceObjectDigest' | 'entryCount'> {
  tableId: string; name: string; kind: StandardTableKind; origin: 'preinstalled' | 'imported'; preinstalledKey: PreinstalledTableKey | null;
  enabled: boolean; currentVersionId: string; counts: StandardTableCounts; recentChecksCount: number;
}
export interface StandardTablesProjection { tables: StandardTableItem[]; missingPreinstalledKeys: PreinstalledTableKey[] }
export interface StandardTableInspection {
  table: StandardTableItem; versions: StandardTableVersion[]; versionsTotal: number; selected: StandardTableVersion;
  entries: (StandardTableRow & { position: number })[]; total: number; offset: number;
  conversionReport: StandardTableConversionReport | null;
  sourceContent: { fileName: string; digest: string; byteLength: number; text: string; offset: number; total: number } | null;
}
export interface StandardTableDiff {
  added: StandardTableRow[]; removed: StandardTableRow[]; changed: { before: StandardTableRow; after: StandardTableRow }[];
  counts: { added: number; removed: number; changed: number };
}
export interface StandardTablePreview {
  previewId: string; tableId: string | null; expectedVersionId: string | null; name: string; kind: StandardTableKind;
  versionLabel: string; sourceDescription: string; proposedStrength: StandardStrength; sourceFileName: string;
  entries: (StandardTableRow & { position: number })[]; total: number; offset: number;
  conversionReport: StandardTableConversionReport; diff: StandardTableDiff | null;
}
const uuid = z.uuid();
const metadata = { name: z.string().trim().min(1).max(180).optional(), kind: standardTableKind.optional(),
  versionLabel: z.string().max(180).optional(), sourceDescription: z.string().max(8192).optional(), strength: standardStrength.optional() };
const offset = z.number().int().min(0).optional();
const rowEdit = z.object({ position: z.number().int().positive().nullable(), row: standardTableRow.nullable() }).strict();
export const standardTableInputs = {
  inspectStandardTables: z.object({}).strict(),
  inspectStandardTable: z.object({ tableId: uuid, versionId: uuid.optional(), query: z.string().max(200).optional(), offset,
    versionsOffset: offset, sourceOffset: offset, reportOffset: offset }).strict(),
  previewStandardTableImport: z.object({ tableId: uuid.optional(), previewId: uuid.optional(), offset,
    path: z.string().min(1).max(32767).optional(), text: z.string().max(300000).optional(), bytesBase64: z.string().max(400000).optional(),
    fileName: z.string().max(255).optional(), formatConfirmed: z.boolean().optional(), ...metadata }).strict(),
  commitStandardTableImport: z.object({ previewId: uuid, ...metadata, entries: z.array(standardTableRow).max(1000).optional(), edits: z.array(rowEdit).max(1000).optional() }).strict(),
  saveStandardTable: z.object({ tableId: uuid.optional(), expectedVersionId: uuid.optional(), ...metadata,
    entries: z.array(standardTableRow).max(1000).optional(), edits: z.array(rowEdit).max(1000).optional() }).strict(),
  setStandardTableEnabled: z.object({ tableId: uuid, enabled: z.boolean() }).strict(),
  deleteStandardTable: z.object({ tableId: uuid }).strict(),
  restorePreinstalledStandardTables: z.object({ keys: z.array(z.enum(['tgh-2013', 'tgh-2013-annex-1', 'gf-1001-2001', 'cycb-2'])).max(4).optional() }).strict(),
};
type Input<K extends keyof typeof standardTableInputs> = z.infer<(typeof standardTableInputs)[K]>;
export interface StandardTableOperations {
  inspectStandardTables: { input: Input<'inspectStandardTables'>; output: StandardTablesProjection };
  inspectStandardTable: { input: Input<'inspectStandardTable'>; output: StandardTableInspection };
  previewStandardTableImport: { input: Input<'previewStandardTableImport'>; output: StandardTablePreview };
  commitStandardTableImport: { input: Input<'commitStandardTableImport'>; output: StandardTableInspection };
  saveStandardTable: { input: Input<'saveStandardTable'>; output: StandardTableInspection };
  setStandardTableEnabled: { input: Input<'setStandardTableEnabled'>; output: StandardTablesProjection };
  deleteStandardTable: { input: Input<'deleteStandardTable'>; output: StandardTablesProjection };
  restorePreinstalledStandardTables: { input: Input<'restorePreinstalledStandardTables'>; output: StandardTablesProjection };
}
export type StandardTableRendererApi = {
  [K in Exclude<keyof StandardTableOperations, 'previewStandardTableImport'>]: (input: StandardTableOperations[K]['input']) => Promise<StandardTableOperations[K]['output']>;
} & { previewStandardTableImport(input: Omit<Input<'previewStandardTableImport'>, 'path' | 'bytesBase64' | 'formatConfirmed'>): Promise<StandardTablePreview | null> };
export const STANDARD_TABLE_CHANNELS = {
  inspectStandardTables: 'ai7:standards:list', inspectStandardTable: 'ai7:standards:inspect', previewStandardTableImport: 'ai7:standards:preview',
  commitStandardTableImport: 'ai7:standards:commit', saveStandardTable: 'ai7:standards:save', setStandardTableEnabled: 'ai7:standards:enable',
  deleteStandardTable: 'ai7:standards:delete', restorePreinstalledStandardTables: 'ai7:standards:restore',
} as const;
