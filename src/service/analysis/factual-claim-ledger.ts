import { FACTUAL_FINDING_CLASSES, type CoverageManifestProjection } from '../../shared/protocol.js';
import { canonicalJson, canonicalRecord, requireAnalysis, sha256Hex } from './canonical.js';
import type { ManifestBlockInput } from './coverage-manifest.js';
import {
  factualReviewMessageBlockIds, locateQuotation, type FactualReviewUnitResult, type FactualUnitAssertion,
} from './factual-review-contract.js';

export const FACTUAL_CLAIM_LEDGER_SCHEMA = 'ai7.factual-claim-ledger/1' as const;
export const FACTUAL_CLAIM_EXTRACTION_CONTRACT = 'ai7.factual-claim-extraction/1' as const;
export const FACTUAL_CLAIM_VERIFICATION_CONTRACT = 'ai7.factual-claim-verification/1' as const;

export interface FactualClaimProducer {
  readonly sourceUnitOrdinal: number;
  readonly sourceUnitDigest: string;
  readonly assertionOrdinal: number;
  readonly assertion: FactualUnitAssertion;
}

/** Every member participates in identity. Similar wording or questions never transfer a claim's allowance. */
export interface FactualClaimOccurrence {
  readonly bookId: string;
  readonly revision: string;
  readonly block: string;
  readonly exactRange: { readonly fromGrapheme: number; readonly toGrapheme: number };
  readonly quote: string;
  readonly assertionClass: FactualUnitAssertion['assertionClass'];
  readonly question: string;
}

export interface FactualClaim {
  readonly claimId: string;
  readonly occurrence: FactualClaimOccurrence;
  readonly producers: readonly FactualClaimProducer[];
}

export interface FactualClaimSourceUnit {
  readonly ordinal: number;
  readonly digest: string;
  readonly sourceUnitMessage: string;
  readonly messageDigest: string;
  readonly messageByteCount: number;
}

export interface FactualClaimLedger {
  readonly schema: typeof FACTUAL_CLAIM_LEDGER_SCHEMA;
  readonly coverageManifestDigest: string;
  readonly units: readonly FactualClaimSourceUnit[];
  readonly claims: readonly FactualClaim[];
  readonly excluded: readonly { readonly producer: FactualClaimProducer; readonly reason: 'ineligible-class' | 'quote-not-found' | 'quote-ambiguous' }[];
  readonly counts: { readonly coverageUnits: number; readonly assertions: number; readonly eligibleClaims: number };
  readonly digest: string;
}

/** Freeze only after extraction settles. Source messages are the authorized bytes, never rebuilt from current text. */
export function freezeFactualClaimLedger(input: {
  readonly manifest: CoverageManifestProjection;
  readonly blocks: ReadonlyMap<string, Pick<ManifestBlockInput, 'text'>>;
  readonly units: readonly { readonly result: Pick<FactualReviewUnitResult, 'unitOrdinal' | 'assertions'>; readonly sourceUnitMessage: string }[];
}): FactualClaimLedger {
  const claims = new Map<string, FactualClaim>();
  const excluded: FactualClaimLedger['excluded'][number][] = [];
  const units: FactualClaimSourceUnit[] = [];
  const seen = new Set<number>();
  let assertions = 0;
  for (const extracted of [...input.units].sort((a, b) => a.result.unitOrdinal - b.result.unitOrdinal)) {
    const unit = input.manifest.units.find((candidate) => candidate.ordinal === extracted.result.unitOrdinal);
    requireAnalysis(unit !== undefined && !seen.has(unit.ordinal), 'FACTUAL_CLAIM_UNIT_INVALID', '断言抽取单元不属于覆盖清单，或已记录。');
    seen.add(unit.ordinal);
    requireAnalysis(extracted.result.assertions.length <= 200, 'FACTUAL_CLAIM_COUNT_INVALID', '单元断言超过已声明的上限。');
    units.push({ ordinal: unit.ordinal, digest: unit.digest, sourceUnitMessage: extracted.sourceUnitMessage,
      messageDigest: sha256Hex(extracted.sourceUnitMessage), messageByteCount: Buffer.byteLength(extracted.sourceUnitMessage, 'utf8') });
    const blockIds = factualReviewMessageBlockIds(unit);
    extracted.result.assertions.forEach((assertion, index) => {
      assertions += 1;
      const producer: FactualClaimProducer = { sourceUnitOrdinal: unit.ordinal, sourceUnitDigest: unit.digest, assertionOrdinal: index + 1, assertion };
      if (!FACTUAL_FINDING_CLASSES.includes(assertion.assertionClass)) {
        excluded.push({ producer, reason: 'ineligible-class' });
        return;
      }
      const block = blockIds[assertion.blockOrdinal - 1];
      const text = block === undefined ? undefined : input.blocks.get(block)?.text;
      const location = text === undefined ? { state: 'not-found' as const } : locateQuotation(text, assertion.quote);
      if (block === undefined || location.state !== 'verified') {
        excluded.push({ producer, reason: location.state === 'ambiguous' ? 'quote-ambiguous' : 'quote-not-found' });
        return;
      }
      const occurrence: FactualClaimOccurrence = { bookId: input.manifest.manuscript.bookId, revision: input.manifest.manuscript.revisionId,
        block, exactRange: { fromGrapheme: location.fromGrapheme, toGrapheme: location.toGrapheme },
        quote: assertion.quote, assertionClass: assertion.assertionClass, question: assertion.question };
      const claimId = sha256Hex(canonicalJson(occurrence));
      const prior = claims.get(claimId);
      claims.set(claimId, { claimId, occurrence, producers: [...(prior?.producers ?? []), producer] });
    });
  }
  const body = { schema: FACTUAL_CLAIM_LEDGER_SCHEMA, coverageManifestDigest: input.manifest.digest, units, claims: [...claims.values()], excluded,
    counts: { coverageUnits: input.manifest.units.length, assertions, eligibleClaims: claims.size } };
  return { ...body, digest: canonicalRecord(body).digest };
}

/** A single selected occurrence, plus precisely its producing unit; no whole-ledger or ambient-context payload. */
export function factualClaimVerificationInput(ledger: FactualClaimLedger, claimId: string, maximumMetadataUtf8Bytes: number) {
  const claim = ledger.claims.find((candidate) => candidate.claimId === claimId);
  requireAnalysis(claim !== undefined, 'FACTUAL_CLAIM_NOT_ELIGIBLE', '这条断言不在冻结的可核查集合中。');
  const producer = claim.producers[0]!;
  const source = ledger.units.find((unit) => unit.ordinal === producer.sourceUnitOrdinal)!;
  const { assertion } = producer;
  const metadata = { schema: FACTUAL_CLAIM_VERIFICATION_CONTRACT, ledgerDigest: ledger.digest, claimId,
    sourceUnitOrdinal: producer.sourceUnitOrdinal, sourceUnitDigest: producer.sourceUnitDigest, assertionOrdinal: producer.assertionOrdinal,
    assertionClass: assertion.assertionClass, category: assertion.category, severity: assertion.severity,
    quote: assertion.quote, question: assertion.question, basis: assertion.basis };
  requireAnalysis(Buffer.byteLength(canonicalJson(metadata), 'utf8') <= maximumMetadataUtf8Bytes,
    'FACTUAL_CLAIM_METADATA_TOO_LARGE', '断言元数据超过声明的字节上限；未截短或发送。');
  const message = canonicalJson({ ...metadata, sourceUnitMessage: source.sourceUnitMessage });
  return { message, digest: sha256Hex(message), byteCount: Buffer.byteLength(message, 'utf8'),
    sourceUnitMessageDigest: source.messageDigest, sourceUnitMessageByteCount: source.messageByteCount };
}
