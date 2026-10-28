/**
 * What a staged import says about how its file was read and what it resembles (ADR 0072 §2, §3), moved out of `protocol.ts`
 * (Issue #1205, F-25) unchanged.
 */

/**
 * The converter a format is read through, and the format it was read from. A format with no
 * conversion is read natively; nothing else in the product may present a conversion as a native
 * read (ADR 0072 §2, §3).
 */
export interface ManuscriptConversionProjection {
  converterIdentity: string;
  sourceFormat: 'TXT' | 'MD' | 'DOC';
}

/**
 * Whether the staged file can become an editable Manuscript, why not when it cannot, and through
 * which converter when it can only be read through one.
 */
export type EditableImportProjection =
  | { available: true; conversion?: ManuscriptConversionProjection }
  | { available: false; code: 'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT'; reason: string };

export interface ImportIdentityFindingProjection {
  bookId: string;
  bookTitle: string;
  sourceVersionId: string;
  importRecordId: string;
  recordKind: 'manuscript-import' | 'source-import' | 'manuscript-reimport';
  recordLabel: '稿件导入记录' | '来源导入记录' | '稿件重新导入记录';
  identityClass: {
    kind: 'immutable-original' | 'parsed-content-structure' | 'filename-collision';
    label: '精确原始文件身份' | '发现相同内容' | '名称相同，内容不同';
  };
}
