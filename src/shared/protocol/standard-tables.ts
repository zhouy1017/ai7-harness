export type StandardTableKind = 'standard-characters' | 'character-forms' | 'word-forms' | 'common-words';
export type StandardStrength = 'national' | 'dictionary' | 'house';
export type StandardEntryStatus = 'applied' | 'to-confirm' | 'unrecognized';
export type PreinstalledTableKey = 'tgh-2013' | 'tgh-2013-annex-1' | 'gf-1001-2001' | 'cycb-2';

export interface StandardTableRow {
  recommended: string;
  discouraged: string[];
  rank: number | null;
  condition: string | null;
  source: string | null;
  strength: StandardStrength;
  status: StandardEntryStatus;
  reviewNote: string | null;
  sourceText: string | null;
}

export interface StandardTableRowEdit {
  position: number | null;
  row: StandardTableRow | null;
}

export interface StandardTableMetadataInput {
  name?: string | undefined;
  kind?: StandardTableKind | undefined;
  versionLabel?: string | undefined;
  sourceDescription?: string | undefined;
  strength?: StandardStrength | undefined;
}

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

export interface StandardTableOperations {
  inspectStandardTables: { input: Record<string, never>; output: StandardTablesProjection };
  inspectStandardTable: {
    input: {
      tableId: string;
      versionId?: string | undefined;
      query?: string | undefined;
      offset?: number | undefined;
      versionsOffset?: number | undefined;
      sourceOffset?: number | undefined;
      reportOffset?: number | undefined;
    };
    output: StandardTableInspection;
  };
  previewStandardTableImport: {
    input: StandardTableMetadataInput & {
      tableId?: string | undefined;
      previewId?: string | undefined;
      offset?: number | undefined;
      path?: string | undefined;
      text?: string | undefined;
      bytesBase64?: string | undefined;
      fileName?: string | undefined;
      formatConfirmed?: boolean | undefined;
    };
    output: StandardTablePreview;
  };
  commitStandardTableImport: {
    input: StandardTableMetadataInput & {
      previewId: string;
      entries?: StandardTableRow[] | undefined;
      edits?: StandardTableRowEdit[] | undefined;
    };
    output: StandardTableInspection;
  };
  saveStandardTable: {
    input: StandardTableMetadataInput & {
      tableId?: string | undefined;
      expectedVersionId?: string | undefined;
      entries?: StandardTableRow[] | undefined;
      edits?: StandardTableRowEdit[] | undefined;
    };
    output: StandardTableInspection;
  };
  setStandardTableEnabled: { input: { tableId: string; enabled: boolean }; output: StandardTablesProjection };
  deleteStandardTable: { input: { tableId: string }; output: StandardTablesProjection };
  restorePreinstalledStandardTables: { input: { keys?: PreinstalledTableKey[] | undefined }; output: StandardTablesProjection };
}

export type StandardTableRendererApi = {
  [K in Exclude<keyof StandardTableOperations, 'previewStandardTableImport'>]: (input: StandardTableOperations[K]['input']) => Promise<StandardTableOperations[K]['output']>;
} & {
  previewStandardTableImport(input: Omit<StandardTableOperations['previewStandardTableImport']['input'], 'path' | 'bytesBase64' | 'formatConfirmed'>): Promise<StandardTablePreview | null>;
};

export const STANDARD_TABLE_CHANNELS = {
  inspectStandardTables: 'ai7:standards:list', inspectStandardTable: 'ai7:standards:inspect', previewStandardTableImport: 'ai7:standards:preview',
  commitStandardTableImport: 'ai7:standards:commit', saveStandardTable: 'ai7:standards:save', setStandardTableEnabled: 'ai7:standards:enable',
  deleteStandardTable: 'ai7:standards:delete', restorePreinstalledStandardTables: 'ai7:standards:restore',
} as const;
