import type { DatabaseSync } from 'node:sqlite';
import type { TaskIntentDeliverablePin } from '../shared/protocol.js';
import { UUID_PATTERN } from './analysis/canonical.js';
import { documentTypeLabel } from './production-document-types.js';
import { requireDraft } from './task-intent-drafts.js';

export function pinTaskDeliverable(db: DatabaseSync, bookId: string, input: { manuscriptId: string; branchId: string; revisionId: string }): TaskIntentDeliverablePin {
  requireDraft([input.manuscriptId, input.branchId, input.revisionId].every((id) => typeof id === 'string' && UUID_PATTERN.test(id)),
    'TASK_INTENT_DRAFT_DELIVERABLE_INVALID', '交付物任务目标无效。');
  const row = db.prepare(`SELECT d.type_id, v.version, v.revision_id, v.revision_digest, b.branch_id, b.journal_sequence,
      b.last_checkpoint_sequence, b.working_digest
    FROM production_documents d JOIN manuscripts m ON m.manuscript_id = d.document_id AND m.role = 'production-document'
    JOIN production_document_versions v ON v.document_id = d.document_id
    JOIN branch_working_state b ON b.manuscript_id = d.document_id
    WHERE d.book_id = ? AND d.document_id = ? AND b.branch_id = ? ORDER BY v.version DESC LIMIT 1`)
    .get(bookId, input.manuscriptId, input.branchId);
  requireDraft(row !== undefined, 'TASK_INTENT_DRAFT_DELIVERABLE_INVALID', '这份交付物不在当前图书中。');
  requireDraft(row.revision_id === input.revisionId && row.working_digest === row.revision_digest && row.journal_sequence === row.last_checkpoint_sequence,
    'TASK_INTENT_DRAFT_DELIVERABLE_STALE', '交付物已有新版本；请保存为版本并重新选择任务目标。');
  const typeId = String(row.type_id);
  return { manuscriptId: input.manuscriptId, branchId: input.branchId, revisionId: input.revisionId,
    revisionDigest: String(row.revision_digest), journalSequence: Number(row.journal_sequence), version: Number(row.version), typeId,
    label: `交付物 · ${documentTypeLabel(typeId)} · 版本 ${row.version}` };
}

export function taskDeliverableStale(db: DatabaseSync, bookId: string, pin: TaskIntentDeliverablePin): boolean {
  try {
    const now = pinTaskDeliverable(db, bookId, pin);
    return now.version !== pin.version || now.journalSequence !== pin.journalSequence || now.revisionDigest !== pin.revisionDigest;
  } catch { return true; }
}
