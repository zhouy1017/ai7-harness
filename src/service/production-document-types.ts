import { canonicalJson, sha256Hex } from './analysis/canonical.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { requireStore } from './store-records.js';
import type { ProductionDocumentTypesProjection, SaveProductionDocumentTypeInput } from '../shared/protocol.js';

/** Schema 112 adds editable house categories and document management metadata; historical ledgers stay intact. */
export const DERIVATIVE_WORKSPACE_SCHEMA_SQL = {
  production_document_categories: `CREATE TABLE production_document_categories (
  type_id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0)
) STRICT`,
  production_document_metadata: `CREATE TABLE production_document_metadata (
  document_id TEXT PRIMARY KEY REFERENCES production_documents(document_id),
  type_id TEXT NOT NULL REFERENCES production_document_categories(type_id),
  finalized INTEGER CHECK(finalized IN (0, 1)),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0, 1)),
  updated_at TEXT NOT NULL
) STRICT`,
} as const;

export const DERIVATIVE_WORKSPACE_FOREIGN_KEYS = {
  production_document_categories: [],
  production_document_metadata: [
    'document_id>production_documents.document_id:NO ACTION/NO ACTION/NONE',
    'type_id>production_document_categories.type_id:NO ACTION/NO ACTION/NONE',
  ],
};

export function initializeDerivativeWorkspaceSchema(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'production_document_categories'").get()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(DERIVATIVE_WORKSPACE_SCHEMA_SQL)) db.exec(sql);
    BUILTIN_PRODUCTION_DOCUMENT_TYPES.types.forEach((type, position) => db.prepare(
      'INSERT INTO production_document_categories VALUES (?, ?, ?, ?)',
    ).run(type.typeId, type.label, '', position));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function listProductionDocumentTypes(db: DatabaseSync): ProductionDocumentTypesProjection {
  return { types: db.prepare('SELECT type_id, name, description FROM production_document_categories ORDER BY position, type_id').all()
    .map((row) => ({ typeId: String(row.type_id), name: String(row.name), label: String(row.name), description: String(row.description) })) };
}

export function saveProductionDocumentType(db: DatabaseSync, input: SaveProductionDocumentTypeInput): ProductionDocumentTypesProjection {
  const name = typeof input.name === 'string' ? input.name.normalize('NFC').trim() : '';
  requireStore(name.length > 0 && [...name].length <= 80, 'PRODUCTION_DOCUMENT_TYPE_INVALID', '类别名称须为 1–80 个字。');
  const description = input.description?.normalize('NFC').trim() ?? '';
  requireStore([...description].length <= 500, 'PRODUCTION_DOCUMENT_TYPE_INVALID', '类别说明最多 500 个字。');
  if (input.typeId !== undefined) {
    requireStore(productionDocumentType(input.typeId, db) !== undefined, 'PRODUCTION_DOCUMENT_TYPE_INVALID', '这个类别已不存在。');
    db.prepare('UPDATE production_document_categories SET name = ?, description = coalesce(?, description) WHERE type_id = ?').run(name, input.description === undefined ? null : description, input.typeId);
  } else {
    db.prepare('INSERT INTO production_document_categories VALUES (?, ?, ?, (SELECT coalesce(max(position), -1) + 1 FROM production_document_categories))')
      .run(`custom-${randomUUID()}`, name, description);
  }
  return listProductionDocumentTypes(db);
}

/** Refuse deletion while any document (including one removed from the workspace) still uses the category. */
export function deleteProductionDocumentType(db: DatabaseSync, typeId: string): ProductionDocumentTypesProjection {
  requireStore(productionDocumentType(typeId, db) !== undefined, 'PRODUCTION_DOCUMENT_TYPE_INVALID', '这个类别已不存在。');
  const used = db.prepare(`SELECT 1 FROM production_documents pd LEFT JOIN production_document_metadata meta ON meta.document_id = pd.document_id
    WHERE coalesce(meta.type_id, pd.type_id) = ? LIMIT 1`).get(typeId);
  requireStore(!used, 'PRODUCTION_DOCUMENT_TYPE_IN_USE', '仍有稿件使用这个类别，请先更改稿件类别。');
  db.prepare('DELETE FROM production_document_categories WHERE type_id = ?').run(typeId);
  return listProductionDocumentTypes(db);
}

export function reorderProductionDocumentTypes(db: DatabaseSync, typeIds: readonly string[]): ProductionDocumentTypesProjection {
  const current = listProductionDocumentTypes(db).types;
  requireStore(typeIds.length === current.length && new Set(typeIds).size === current.length && current.every((type) => typeIds.includes(type.typeId)),
    'PRODUCTION_DOCUMENT_TYPE_INVALID', '类别列表已变化，请刷新后重试。');
  db.exec('BEGIN IMMEDIATE');
  try {
    typeIds.forEach((id, position) => db.prepare('UPDATE production_document_categories SET position = ? WHERE type_id = ?').run(position, id));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return listProductionDocumentTypes(db);
}

/**
 * The house's Production Document types (Issue #415, plan slice S66; V2-UX-WORK-013, DELIV-001, ADR 0077 §6).
 * The types a Book may hold are configuration a house owns, so the five of the V1 baseline are data here and
 * never literals in a schema: a document and every decision about a type name the type by its identity and
 * pin the configuration's version and digest, which is how a record keeps naming the type it was made under
 * after a house changes its list. Schema 112 stores the editable house list; the five baseline identities are seeds.
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

/** The current configuration is read at creation time; historical records retain their original pins. */
export function productionDocumentTypeConfiguration(db: DatabaseSync): ProductionDocumentTypeConfiguration {
  const types = listProductionDocumentTypes(db).types.map(({ typeId, label }) => ({ typeId, label }));
  const digest = sha256Hex(canonicalJson(types));
  return digest === sha256Hex(canonicalJson(BUILTIN_PRODUCTION_DOCUMENT_TYPES.types)) ? BUILTIN_PRODUCTION_DOCUMENT_TYPES
    : { schema: PRODUCTION_DOCUMENT_TYPES_SCHEMA, version: `h-${digest.slice(0, 14)}`, types };
}

/** The digest every record made under this configuration pins beside its version. */
export const BUILTIN_PRODUCTION_DOCUMENT_TYPES_DIGEST = sha256Hex(canonicalJson(BUILTIN_PRODUCTION_DOCUMENT_TYPES));

/** The type of the configuration in force, or `undefined` for an identity it does not hold. */
export function productionDocumentType(typeId: string, db?: DatabaseSync): ProductionDocumentTypeEntry | undefined {
  if (db !== undefined) return listProductionDocumentTypes(db).types.find((type) => type.typeId === typeId);
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
export function documentTypeLabel(typeId: string, db?: DatabaseSync): string {
  return (productionDocumentType(typeId, db) ?? readersReportDocumentType(typeId))?.label ?? '衍生稿件';
}
