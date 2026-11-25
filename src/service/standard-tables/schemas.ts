import { z } from 'zod';
import type { StandardStrength, StandardTableKind, StandardTableRow } from '../../shared/protocol/standard-tables.js';

export const standardTableKind: z.ZodType<StandardTableKind> = z.enum(['standard-characters', 'character-forms', 'word-forms', 'common-words']);
export const standardStrength: z.ZodType<StandardStrength> = z.enum(['national', 'dictionary', 'house']);
export const standardTableRow: z.ZodType<StandardTableRow> = z.object({
  recommended: z.string().max(4096), discouraged: z.array(z.string().min(1).max(4096)).max(64),
  rank: z.number().int().positive().nullable(), condition: z.string().min(1).max(8192).nullable(),
  source: z.string().max(8192).nullable(), strength: standardStrength,
  status: z.enum(['applied', 'to-confirm', 'unrecognized']), reviewNote: z.string().max(8192).nullable(), sourceText: z.string().max(32768).nullable(),
}).strict().refine(row => (row.status === 'unrecognized' || row.recommended.trim().length > 0) && new TextEncoder().encode(JSON.stringify(row)).length <= 48000);

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
