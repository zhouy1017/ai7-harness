/** Optional frozen context of new downstream tasks; absent on all predecessor plans. */
export interface FrozenBaselineSynopsisContext {
  readonly revisionId: string;
  readonly manuscriptRevisionId: string;
  /** null means the configured model has no registered context window. */
  readonly maximumMessageBytes: number | null;
  readonly maximumSupplementBytes: number;
  readonly synopses: ReadonlyArray<{ readonly unitOrdinal: number; readonly synopsis: string }>;
  readonly missingUnitOrdinals: ReadonlyArray<number>;
  readonly omittedUnitOrdinals: ReadonlyArray<number>;
  readonly shortenedUnitOrdinals: ReadonlyArray<number>;
}

export interface FrozenBaselineSynopsisPlan {
  readonly baselineSynopsisContext?: FrozenBaselineSynopsisContext;
  readonly baselineSynopsisUnavailable?: 'damaged-baseline';
}
