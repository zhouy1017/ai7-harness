/** Semantic identity pinned beside the digest of the immutable prompt bytes. */
export interface ReviewContractIdentity {
  readonly contractId: 'ai7.editorial-review';
  readonly version: 1 | 2;
  readonly digest: string;
  readonly categoryConfiguration?: { readonly version: string; readonly digest: string };
}

export type ReviewContractRejectionReason = 'contract-schema-invalid' | 'contract-quote-not-in-block' |
  'contract-replacement-required' | 'contract-replacement-refused' | 'contract-clause-unknown';

/** Read-only excluded entry; no Editorial Mark or action identity is exposed. */
export interface ReviewExcludedFindingProjection {
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly unitOrdinal: number;
  readonly text: string;
  readonly textPart?: { readonly index: number; readonly total: number };
  readonly reasonCode: string;
  readonly reasonLabel: string;
}
