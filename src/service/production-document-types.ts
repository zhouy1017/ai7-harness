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

/**
 * The 审稿意见 drafts' document types (Issue #429, plan slice S81c; V2-UX-EVAL-013): one per V1 template. A draft is an
 * Editorial Artifact edited on the Manuscript's surface exactly as a Production Document is, so it lives in the same block
 * store and ledgers under a type of its own; but it is made from a finalized Evaluation Record in 评估, never 从来源材料创建,
 * is no card of 交付物 and no condition of 图书交付包 (BUNDLE-001 names the finalized 审稿意见 apart from the documents), and a
 * draft is never a delivery. Its own configuration, so the house's deliverable types and their digest stay as they were.
 */
export const READERS_REPORT_DOCUMENT_TYPES: ProductionDocumentTypeConfiguration = {
  schema: PRODUCTION_DOCUMENT_TYPES_SCHEMA,
  version: '1',
  types: [
    { typeId: 'readers-report-author', label: '审稿意见 · 给作者的修改意见' },
    { typeId: 'readers-report-editorial', label: '审稿意见 · 给编辑部 / 选题会的审读报告' },
  ],
};

export const READERS_REPORT_DOCUMENT_TYPES_DIGEST = sha256Hex(canonicalJson(READERS_REPORT_DOCUMENT_TYPES));

/** The draft type of one template. */
export function readersReportDocumentTypeId(template: 'author' | 'editorial'): string {
  return template === 'author' ? 'readers-report-author' : 'readers-report-editorial';
}

/** A 审稿意见 draft's type, or `undefined` for any other identity. */
export function readersReportDocumentType(typeId: string): ProductionDocumentTypeEntry | undefined {
  return READERS_REPORT_DOCUMENT_TYPES.types.find((entry) => entry.typeId === typeId);
}

/** Any document's type as a surface names it: a house deliverable type, or a 审稿意见 draft's. */
export function documentTypeLabel(typeId: string): string {
  return (productionDocumentType(typeId) ?? readersReportDocumentType(typeId))?.label ?? typeId;
}
