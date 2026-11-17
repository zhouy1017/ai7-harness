import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { BoundedManuscriptStore } from './bounded-manuscript.js';
import { parseDocx, type ParsedDocx, type ParsedDocxBlock } from './docx.js';
import { recordProductionDocumentOrigin } from './production-document-origins.js';
import { productionDocumentType, readersReportDocumentType } from './production-document-types.js';
import type { ProductionDocumentWorkflow } from './production-document-workflow.js';
import { PRODUCTION_DOCUMENTS_NEED_MANUSCRIPT, productionDocumentMarksNotCarried, type ProductionDocuments } from './production-documents.js';
import { one } from './store-operation-support.js';
import {
  DIGEST_PATTERN,
  StoreError,
  UUID_PATTERN,
  asNumber,
  asString,
  canonicalJson,
  requireStore,
  sha256,
  type SqlRow,
} from './store-records.js';
import {
  MAX_PRODUCTION_DOCUMENT_BLOCKS,
  publicationText,
  type CreateProductionDocumentInput,
  type DecideProductionDocumentTypeInput,
  type ProductionDocumentResultProjection,
  type ProductionDocumentsProjection,
  type RecordProductionDocumentDeliveryInput,
  type RenameProductionDocumentInput,
  type SaveProductionDocumentVersionInput,
  type TransitionProductionDocumentPhaseInput,
  type UpdateProductionDocumentMetaInput,
} from '../shared/protocol/deliverables.js';

// ---- ⑥ 交付物 · 生产文档 operations of the store (Issue #415, plan slice S66; moved from store.ts by Issue #1534) ---------------

/**
 * What the 生产文档 operations reach of the store, lent by EditorialStore: its connection and ledgers read live, its guarded
 * calls and its one transaction runner bound. The operations open no connection and keep no state of their own.
 */
export interface ProductionDocumentOperationsHost {
  assertAvailable(): void;
  readonly authority: DatabaseSync;
  readonly boundedAuthority: BoundedManuscriptStore;
  boundedCall<T>(operation: () => T): T;
  contentObjectPath(objectDigest: string, relativeKey: string): string;
  documentCall<T>(operation: () => T): T;
  readonly documentWorkflow: ProductionDocumentWorkflow;
  readonly productionDocuments: ProductionDocuments;
  transaction<T>(db: DatabaseSync, operation: () => T): T;
}

/**
 * 从来源材料创建 (V2-UX-DELIV-001, WORK-013): one Production Document of a house type, made from one of the Book's
 * source-only materials. The retained file is read again by the current parser — outside any transaction, since it
 * is a file read — and one transaction writes the document's row in the block store, its branch, its first
 * revision (which carries the material's Source Version) with every block under a newly minted identity, its
 * working state and indexes, the document's ledger row and its `版本 1`. The Book's Manuscript and every record of
 * it are untouched.
 */
export async function createProductionDocument(host: ProductionDocumentOperationsHost, input: CreateProductionDocumentInput): Promise<ProductionDocumentResultProjection> {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(input.bookId) && (input.sourceVersionId == null || UUID_PATTERN.test(input.sourceVersionId)),
    'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
  const type = productionDocumentType(input.typeId, host.authority);
  requireStore(type !== undefined, 'PRODUCTION_DOCUMENT_TYPE_INVALID', '这个文档类型不在本社的类型配置中。');
  const plan = host.documentCall(() => productionDocumentPlan(host, input));
  const title = input.title === undefined ? undefined : publicationText(input.title, 80);
  requireStore(title !== null, 'PRODUCTION_DOCUMENT_TITLE_INVALID', '题目须为 1–80 个字。');
  const object = input.sourceVersionId == null ? null : one(
    host.authority.prepare('SELECT relative_key, byte_length FROM content_objects WHERE object_digest = ?').all(plan.objectDigest) as SqlRow[],
    'PRODUCTION_DOCUMENT_SOURCE_INVALID', '来源材料的文件对象记录缺失。',
  );
  const blocks: ParsedDocxBlock[] = [];
  let parsed: Pick<ParsedDocx, 'contentDigest' | 'structureDigest' | 'blockCount' | 'importedMarks'> & { parserIdentity: string };
  if (object === null) {
    const digest = sha256(canonicalJson({ kind: 'paragraph', level: null, text: '' }));
    blocks.push({ blockId: '', position: 1, kind: 'paragraph', level: null, text: '', digest, graphemeLength: 0, sourceParagraphIndex: -1 });
    parsed = { parserIdentity: 'ai7.blank-production-document/1', contentDigest: digest, structureDigest: digest, blockCount: 1, importedMarks: [] };
  } else try {
    parsed = await parseDocx(
      host.contentObjectPath(plan.objectDigest, asString(object.relative_key)),
      plan.displayName,
      (block) => {
        requireStore(blocks.length < MAX_PRODUCTION_DOCUMENT_BLOCKS, 'PRODUCTION_DOCUMENT_SOURCE_TOO_LARGE',
          `一份文档最多从 ${MAX_PRODUCTION_DOCUMENT_BLOCKS.toLocaleString('zh-CN')} 段文字开始。`);
        blocks.push(block);
      },
      { digest: plan.objectDigest, bytes: asNumber(object.byte_length) },
      { formatIdentified: true, noteBlocks: false },
    );
  } catch (error) {
    if (error instanceof StoreError) throw error;
    throw new StoreError('PRODUCTION_DOCUMENT_SOURCE_INVALID', '来源材料无法读出可编辑的文字。');
  }
  requireStore(blocks.length > 0 && blocks.length === parsed.blockCount, 'PRODUCTION_DOCUMENT_SOURCE_INVALID',
    '来源材料没有可作为文档的文字。');
  const now = new Date().toISOString();
  const documentId = randomUUID();
  const branchId = randomUUID();
  const revisionId = randomUUID();
  const characterCount = blocks.reduce((total, block) => total + block.graphemeLength, 0);
  const revisionDigest = sha256(canonicalJson({
    schema: 'ai7.production-document-revision/1',
    documentId,
    sourceVersionId: plan.sourceVersionId,
    parserIdentity: parsed.parserIdentity,
    contentDigest: parsed.contentDigest,
    structureDigest: parsed.structureDigest,
    blockCount: blocks.length,
    characterCount,
  }));
  host.documentCall(() => host.transaction(host.authority, () => {
    // Recheck the source and type decision after reading the file, inside the writing transaction.
    productionDocumentPlan(host, input);
    host.authority.prepare("INSERT INTO manuscripts(manuscript_id, book_id, role, created_at) VALUES (?, ?, 'production-document', ?)")
      .run(documentId, input.bookId, now);
    host.authority.prepare('INSERT INTO manuscript_branches(branch_id, manuscript_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(branchId, documentId, title ?? host.productionDocuments.defaultTitle(input.bookId, input.typeId, type.label), now);
    host.authority.prepare(
      `INSERT INTO manuscript_revisions(
         revision_id, manuscript_id, branch_id, ordinal, revision_label, parent_revision_id,
         source_version_id, revision_digest, created_at
       ) VALUES (?, ?, ?, 1, 'r1', NULL, ?, ?, ?)`,
    ).run(revisionId, documentId, branchId, plan.sourceVersionId, revisionDigest, now);
    host.authority.prepare('UPDATE manuscript_branches SET base_revision_id = ? WHERE branch_id = ?').run(revisionId, branchId);
    const insertBlock = host.authority.prepare('INSERT INTO manuscript_blocks(block_id, manuscript_id, created_revision_id) VALUES (?, ?, ?)');
    const insertVersion = host.authority.prepare(
      `INSERT INTO manuscript_block_versions(
         revision_id, block_id, position, kind, level, text, digest, start_offset, grapheme_length
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertWorking = host.authority.prepare(
      `INSERT INTO working_blocks(branch_id, block_id, position, kind, level, text, digest, grapheme_length)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let offset = 0;
    blocks.forEach((block, index) => {
      const position = index + 1;
      // A document's blocks are its own: a material imported for the Manuscript too keeps its identities there.
      const blockId = `blk_${sha256(`${revisionId}\u0000${position}\u0000${block.digest}`).slice(0, 24)}`;
      insertBlock.run(blockId, documentId, revisionId);
      insertVersion.run(revisionId, blockId, position, block.kind, block.level, block.text, block.digest, offset, block.graphemeLength);
      insertWorking.run(branchId, blockId, position, block.kind, block.level, block.text, block.digest, block.graphemeLength);
      offset += block.graphemeLength;
    });
    host.authority.prepare(
      `INSERT INTO branch_working_state(
         branch_id, manuscript_id, base_revision_id, journal_sequence, working_digest,
         total_graphemes, history_sequence, last_checkpoint_sequence
       ) VALUES (?, ?, ?, 0, ?, ?, 0, 0)`,
    ).run(branchId, documentId, revisionId, revisionDigest, characterCount);
    requireStore(
      host.boundedCall(() => host.boundedAuthority.initializeImportedBranch(branchId)) === characterCount,
      'PRODUCTION_DOCUMENT_INVALID', '文档索引无法由来源材料精确建立。',
    );
    host.productionDocuments.record({
      documentId, bookId: input.bookId, typeId: input.typeId, originSourceVersionId: plan.sourceVersionId,
      parserIdentity: parsed.parserIdentity, createdAt: now,
    });
    // The document begins following the Book's workflow profile now (Issue #415, S66c; WORK-002).
    host.documentWorkflow.recordInstance(documentId, now);
    // How its material was read, kept for as long as the document exists (Issue #547): every tracked change rejected,
    // the comments left out, and how many 批注与修订 that left behind.
    recordProductionDocumentOrigin(host.authority, {
      documentId, sourceVersionId: plan.sourceVersionId, marksNotCarried: parsed.importedMarks.length, recordedAt: now,
    });
    host.productionDocuments.recordVersion(documentId, revisionId, revisionDigest, 'created');
  }));
  // The material's comments and tracked changes stay with the material: the document says so where it opens.
  const notCarried = parsed.importedMarks.length;
  return productionDocumentResult(host, input.bookId, input.typeId, notCarried === 0 ? null : productionDocumentMarksNotCarried(notCarried), documentId);
}

export function updateProductionDocumentMeta(host: ProductionDocumentOperationsHost, input: UpdateProductionDocumentMetaInput): ProductionDocumentsProjection {
  host.assertAvailable();
  host.documentCall(() => host.productionDocuments.updateMeta(input));
  return inspectProductionDocuments(host, input.bookId);
}

export function renameProductionDocument(host: ProductionDocumentOperationsHost, input: RenameProductionDocumentInput): ProductionDocumentResultProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.documentId), 'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
  const title = publicationText(input.title, 80);
  requireStore(title !== null, 'PRODUCTION_DOCUMENT_TITLE_INVALID', '题目须为 1–80 个字。');
  const row = host.documentCall(() => host.productionDocuments.documentById(input.bookId, input.documentId));
  requireStore(row !== undefined, 'PRODUCTION_DOCUMENT_NOT_FOUND', '这本书没有这份生产文档。');
  host.authority.prepare('UPDATE manuscript_branches SET name = ? WHERE manuscript_id = ?').run(title, row.documentId);
  if (productionDocumentType(row.typeId, host.authority) !== undefined) host.productionDocuments.updateMeta({ bookId: input.bookId, documentId: row.documentId });
  return productionDocumentResult(host, input.bookId, row.typeId, null, row.documentId);
}

/** `本书不做` or `恢复` for one house type of a Book (WORK-013): an appended decision, or no change. */
export function decideProductionDocumentType(host: ProductionDocumentOperationsHost, input: DecideProductionDocumentTypeInput): ProductionDocumentResultProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(input.bookId), 'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
  host.documentCall(() => host.transaction(host.authority, () => {
    one(host.authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(input.bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
    host.productionDocuments.decide(input.bookId, input.typeId, input.notForThisBook);
  }));
  return productionDocumentResult(host, input.bookId, input.typeId);
}

/**
 * 保存为版本 (DELIV-002): the document's working text becomes its next version, through the block store's own
 * checkpoint, and the version is recorded in the transaction that makes the revision. A document whose working text
 * is its latest version already saves nothing and says so.
 */
export async function saveProductionDocumentVersion(host: ProductionDocumentOperationsHost, input: SaveProductionDocumentVersionInput): Promise<ProductionDocumentResultProjection> {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.documentId) && UUID_PATTERN.test(input.branchId),
    'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
  const row = host.documentCall(() => host.productionDocuments.documentById(input.bookId, input.documentId));
  requireStore(row !== undefined && row.branchId === input.branchId, 'PRODUCTION_DOCUMENT_NOT_FOUND', '这本书没有这份生产文档。');
  const owner = host.boundedAuthority;
  const work = host.boundedCall(() => owner.createManuscriptCheckpointWork(input.documentId, input.branchId, 'Document Version / 文档版本'));
  // Nothing to check point — the working state is its revision, as after a journal recovery made one — still saves
  // that revision as a version when no version holds it yet; one already the latest records nothing more.
  if (work.workId === null && work.checkpoint !== null) {
    const checkpoint = work.checkpoint;
    host.documentCall(() => host.productionDocuments.recordVersion(input.documentId, checkpoint.revisionId, checkpoint.revisionDigest, 'saved'));
  }
  if (work.workId !== null) {
    const workId = work.workId;
    try {
      for (;;) {
        const progress = host.boundedCall(() => owner.advanceManuscriptCheckpointWork(workId));
        if (progress.done) break;
        await new Promise<void>((resolveYield) => setImmediate(resolveYield));
      }
      host.boundedCall(() => owner.finalizeManuscriptCheckpointWork(workId, (checkpoint, purpose) => {
        requireStore(purpose === 'Document Version / 文档版本', 'PRODUCTION_DOCUMENT_INVALID', '文档版本的用途无效。');
        host.documentCall(() => host.productionDocuments.recordVersion(input.documentId, checkpoint.revisionId, checkpoint.revisionDigest, 'saved'));
      }));
    } catch (error) {
      host.boundedCall(() => owner.cancelManuscriptCheckpointWork(workId));
      throw error;
    }
  }
  return productionDocumentResult(host, input.bookId, row.typeId, null, row.documentId);
}

/**
 * 交付 (Issue #415, S66b; DELIV-003): one Delivery Record of one exact version of a document of this Book — a version
 * it saved, or its current text, saved as the next version first (origin `delivery`) in the transaction that records
 * the delivery. The export of that version follows on the export card, as the manuscript's does; nothing is sent.
 */
export async function recordProductionDocumentDelivery(host: ProductionDocumentOperationsHost, input: RecordProductionDocumentDeliveryInput): Promise<ProductionDocumentResultProjection> {
  host.assertAvailable();
  const version = input.version;
  requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.documentId) &&
    (version.kind === 'saved' ? UUID_PATTERN.test(version.revisionId) : version.kind === 'current' && DIGEST_PATTERN.test(version.workingDigest)),
  'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
  const row = host.documentCall(() => host.productionDocuments.documentById(input.bookId, input.documentId));
  requireStore(row !== undefined, 'PRODUCTION_DOCUMENT_NOT_FOUND', '这本书没有这份生产文档。');
  // A 审稿意见 draft (Issue #429, S81c) is a draft, never a delivery.
  requireStore(readersReportDocumentType(row.typeId) === undefined, 'READERS_REPORT_NOT_DELIVERABLE', '审稿意见草稿不能在这里交付；它只在稿件编辑面上修改并导出。');
  // Who and the note are checked first: a refused delivery saves no version either.
  const party = host.documentCall(() => host.productionDocuments.deliveryParty(input.recipient, input.note));
  if (version.kind === 'saved') {
    host.documentCall(() => host.transaction(host.authority, () => host.productionDocuments.recordDelivery(row, version.revisionId, party)));
    return productionDocumentResult(host, input.bookId, row.typeId, null, row.documentId);
  }
  requireStore(host.documentCall(() => host.productionDocuments.workingDigest(row)) === version.workingDigest,
    'PRODUCTION_DOCUMENT_DELIVERY_CHANGED', '文档在打开交付后又有修改；请重新选择要交付的版本。');
  // The current text as the next version — or the latest version already, when nothing moved since — and its delivery.
  const deliver = (revisionId: string, revisionDigest: string): void => {
    host.productionDocuments.recordVersion(row.documentId, revisionId, revisionDigest, 'delivery');
    host.productionDocuments.recordDelivery(row, revisionId, party);
  };
  const owner = host.boundedAuthority;
  const work = host.boundedCall(() => owner.createManuscriptCheckpointWork(row.documentId, row.branchId, 'Document Version / 文档版本'));
  if (work.workId === null) {
    const checkpoint = work.checkpoint!;
    host.documentCall(() => host.transaction(host.authority, () => deliver(checkpoint.revisionId, checkpoint.revisionDigest)));
    return productionDocumentResult(host, input.bookId, row.typeId, null, row.documentId);
  }
  const workId = work.workId;
  try {
    for (;;) {
      const progress = host.boundedCall(() => owner.advanceManuscriptCheckpointWork(workId));
      if (progress.done) break;
      await new Promise<void>((resolveYield) => setImmediate(resolveYield));
    }
    host.boundedCall(() => owner.finalizeManuscriptCheckpointWork(workId, (checkpoint, purpose) => {
      requireStore(purpose === 'Document Version / 文档版本', 'PRODUCTION_DOCUMENT_INVALID', '文档版本的用途无效。');
      host.documentCall(() => deliver(checkpoint.revisionId, checkpoint.revisionDigest));
    }));
  } catch (error) {
    host.boundedCall(() => owner.cancelManuscriptCheckpointWork(workId));
    throw error;
  }
  return productionDocumentResult(host, input.bookId, row.typeId, null, row.documentId);
}

/** Resolve this document's source without changing the Book's primary Manuscript. */
function productionDocumentPlan(host: ProductionDocumentOperationsHost, input: CreateProductionDocumentInput): {
  sourceVersionId: string;
  displayName: string;
  objectDigest: string;
} {
  const primary = host.authority.prepare("SELECT 1 FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(input.bookId);
  requireStore(primary !== undefined, 'PRODUCTION_DOCUMENT_NEEDS_MANUSCRIPT', PRODUCTION_DOCUMENTS_NEED_MANUSCRIPT);
  requireStore(!host.productionDocuments.notForThisBook(input.bookId, input.typeId),
    'PRODUCTION_DOCUMENT_NOT_FOR_THIS_BOOK', '这一类文档已标为本书不做；先恢复。');
  if (input.sourceVersionId == null) {
    const row = one(host.authority.prepare(`SELECT mr.source_version_id FROM manuscripts m
      JOIN manuscript_branches mb ON mb.manuscript_id = m.manuscript_id
      JOIN manuscript_revisions mr ON mr.revision_id = mb.base_revision_id
      WHERE m.book_id = ? AND m.role = 'primary'`).all(input.bookId) as SqlRow[], 'PRODUCTION_DOCUMENT_NEEDS_MANUSCRIPT', PRODUCTION_DOCUMENTS_NEED_MANUSCRIPT);
    return { sourceVersionId: asString(row.source_version_id), displayName: '', objectDigest: '' };
  }
  const source = host.productionDocuments.source(input.bookId, input.sourceVersionId);
  requireStore(source !== undefined, 'PRODUCTION_DOCUMENT_SOURCE_INVALID', '只能从这本书作为来源材料导入的文件创建文档。');
  return {
    sourceVersionId: source.sourceVersionId,
    displayName: source.displayName,
    objectDigest: source.workingObjectDigest ?? source.objectDigest,
  };
}

/** 交付 · 生产文档 of one Book (Issue #415): one card per house type and the materials a document can start from. */
export function inspectProductionDocuments(host: ProductionDocumentOperationsHost, bookId: string): ProductionDocumentsProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(bookId), 'BOOK_INVALID', '图书标识无效。');
  one(host.authority.prepare('SELECT 1 FROM books WHERE book_id = ?').all(bookId) as SqlRow[], 'BOOK_NOT_FOUND', '图书不存在。');
  const primary = host.authority.prepare("SELECT 1 FROM manuscripts WHERE book_id = ? AND role = 'primary'").get(bookId) !== undefined;
  return host.documentCall(() => host.productionDocuments.documents(bookId, primary));
}

function productionDocumentResult(host: ProductionDocumentOperationsHost, bookId: string, typeId: string, notice: string | null = null, documentId?: string): ProductionDocumentResultProjection {
  const documents = inspectProductionDocuments(host, bookId);
  // A 审稿意见 draft (Issue #429, S81c) is saved as a version and moves its phases exactly as a house type's document does.
  const card = documents.types.find((type) => type.typeId === typeId);
  const draft = card === undefined && readersReportDocumentType(typeId) !== undefined
    ? host.documentCall(() => host.productionDocuments.documentOfType(bookId, typeId))
    : undefined;
  return { bookId, documents, typeId, document: documentId !== undefined ? host.productionDocuments.document(host.productionDocuments.documentById(bookId, documentId)!) : draft !== undefined ? host.documentCall(() => host.productionDocuments.document(draft)) : card?.document ?? null, notice };
}

/**
 * 开始 / 完成 / 跳过 / 重新打开 one phase of a document of this Book (Issue #415, S66c; WORK-008, WORK-009): one deterministic
 * move recorded in one transaction, or refused — a move the phase's state does not allow, one without the reason a skip
 * or a reopen needs, or one made after the phases moved since the editor looked. It grants nothing else (WORK-011).
 */
export function transitionProductionDocumentPhase(host: ProductionDocumentOperationsHost, input: TransitionProductionDocumentPhaseInput): ProductionDocumentResultProjection {
  host.assertAvailable();
  requireStore(UUID_PATTERN.test(input.bookId) && UUID_PATTERN.test(input.documentId), 'PRODUCTION_DOCUMENT_INVALID', '生产文档参数无效。');
  const row = host.documentCall(() => host.productionDocuments.documentById(input.bookId, input.documentId));
  requireStore(row !== undefined, 'PRODUCTION_DOCUMENT_NOT_FOUND', '这本书没有这份生产文档。');
  const recordedAt = new Date().toISOString();
  host.documentCall(() => host.transaction(host.authority, () => host.documentWorkflow.transition(input, recordedAt)));
  return productionDocumentResult(host, input.bookId, row.typeId, null, row.documentId);
}