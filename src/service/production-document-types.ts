import { canonicalJson, sha256Hex } from './analysis/canonical.js';

/**
 * The house's Production Document types (Issue #415, plan slice S66; V2-UX-WORK-013, DELIV-001, ADR 0077 §6).
 * The types a Book may hold are configuration a house owns, so the five of the V1 baseline are data here and
 * never literals in a schema: a document and every decision about a type name the type by its identity and
 * pin the configuration's version and digest, which is how a record keeps naming the type it was made under
 * after a house changes its list. Managing a house's own list is the knowledge base's (S79, #427); until then
 * these are the only types, and their version is `1`.
 *
 * Each type is bound to a Workflow Profile (WORK-013) once documents carry the Deliverable Workflow Lens
 * (S66c); a document of any type is edited, versioned and delivered the same way.
 */
export const PRODUCTION_DOCUMENT_TYPES_SCHEMA = 'ai7.production-document-types/1' as const;

export interface ProductionDocumentTypeEntry {
  readonly typeId: string;
  readonly label: string;
}

export interface ProductionDocumentTypeConfiguration {
  readonly schema: typeof PRODUCTION_DOCUMENT_TYPES_SCHEMA;
  readonly version: string;
  readonly types: ReadonlyArray<ProductionDocumentTypeEntry>;
}

/** The V1 baseline in the specification's order, which is also the order of the cards in 交付物 (editor-surfaces §9). */
export const BUILTIN_PRODUCTION_DOCUMENT_TYPES: ProductionDocumentTypeConfiguration = {
  schema: PRODUCTION_DOCUMENT_TYPES_SCHEMA,
  version: '1',
  types: [
    { typeId: 'news-release', label: '新闻稿' },
    { typeId: 'promotion-article', label: '宣传文章' },
    { typeId: 'review-article', label: '评论文章' },
    { typeId: 'launch-materials', label: '发布会材料' },
    { typeId: 'marketing-points', label: '营销要点' },
  ],
};

/** The digest every record made under this configuration pins beside its version. */
export const BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST = sha256Hex(canonicalJson(BUILTIN_PRODUCTION_DOCUMENT_TYPES));

/** The type of the configuration in force, or `undefined` for an identity it does not hold. */
export function productionDocumentType(typeId: string): ProductionDocumentTypeEntry | undefined {
  return BUILTIN_PRODUCTION_DOCUMENT_TYPES.types.find((entry) => entry.typeId === typeId);
}
