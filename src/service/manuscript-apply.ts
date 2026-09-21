import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { BoundedManuscriptStore, ExactReplacementCommit, ExactReplacementTarget } from './bounded-manuscript.js';
import { applyProjection, EditorialMarkError, type EditorialMarkStore } from './editorial-marks.js';
import { graphemesOf } from '../shared/mark-anchor.js';
import {
  MAX_MARK_BODY_CODE_UNITS,
  type ApplyChangeSuggestionBatchInput,
  type ApplyChangeSuggestionInput,
  type ManuscriptApplyCommandProjection,
  type ManuscriptApplyOutcomeProjection,
  type ManuscriptApplyProjection,
  type ManuscriptWindowProjection,
  type ReverseAppliedChangeSuggestionInput,
} from '../shared/protocol.js';

/**
 * AI7 Apply for Change Suggestions and its Effect ledger (Issue #408, schema revision 23;
 * ARCHITECTURE › Proposal and Effect, HARNESS-INTEGRATION › Effect seam, kick-in/19).
 *
 * One editor interaction — 接受并应用, 修改后接受, 确认应用 on a batch strip, 确认撤销本次应用 — writes
 * five records that stay apart and are never rewritten: the Proposal Decision (the item's own ledger),
 * the Effect Intent with its exact targets, the Effect Approval bound to that intent's payload, the
 * dispatch that consumed the approval, and the Effect Receipt. They are written in the one transaction
 * that writes the manuscript text, so an Apply is committed with its receipt or not at all: there is
 * no state in which text was written and no receipt says so, and none in which an approval outlives
 * the attempt it was given for. That is what makes a lost acknowledgement harmless — asking again with
 * the same idempotency key answers with the receipt already held, or with proof that nothing was
 * written — and what makes an approval single-use by construction.
 *
 * A receipt holds identities, digests, times and the two manuscript states, never manuscript text
 * (kick-in/19 rule 14). The text an Apply replaced stays in the Proposal Change Item; the text it wrote
 * is the item's proposal or the decision's edited text.
 */
export const MANUSCRIPT_EFFECT_SCHEMA_SQL = {
  manuscript_effect_intents: `CREATE TABLE manuscript_effect_intents (
  effect_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('apply', 'reverse-apply')),
  book_id TEXT NOT NULL REFERENCES books(book_id),
  manuscript_id TEXT NOT NULL REFERENCES manuscripts(manuscript_id),
  branch_id TEXT NOT NULL REFERENCES manuscript_branches(branch_id),
  base_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  base_journal_sequence INTEGER NOT NULL CHECK(base_journal_sequence >= 0),
  base_working_digest TEXT NOT NULL CHECK(length(base_working_digest) = 64),
  target_count INTEGER NOT NULL CHECK(target_count >= 1),
  payload_digest TEXT NOT NULL CHECK(length(payload_digest) = 64),
  replay_policy TEXT NOT NULL CHECK(replay_policy = 'idempotency-keyed'),
  reverses_effect_id TEXT REFERENCES manuscript_effect_intents(effect_id),
  created_at TEXT NOT NULL,
  CHECK((kind = 'reverse-apply') = (reverses_effect_id IS NOT NULL))
) STRICT`,
  manuscript_effect_targets: `CREATE TABLE manuscript_effect_targets (
  effect_id TEXT NOT NULL REFERENCES manuscript_effect_intents(effect_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  item_id TEXT NOT NULL REFERENCES proposal_change_items(item_id),
  decision_id TEXT NOT NULL REFERENCES proposal_item_decisions(decision_id),
  block_id TEXT NOT NULL REFERENCES manuscript_blocks(block_id),
  from_grapheme INTEGER NOT NULL CHECK(from_grapheme >= 0),
  to_grapheme INTEGER NOT NULL CHECK(to_grapheme >= from_grapheme),
  expected_text_digest TEXT NOT NULL CHECK(length(expected_text_digest) = 64),
  expected_block_digest TEXT NOT NULL CHECK(length(expected_block_digest) = 64),
  replacement_text_digest TEXT NOT NULL CHECK(length(replacement_text_digest) = 64),
  resulting_from_grapheme INTEGER NOT NULL CHECK(resulting_from_grapheme >= 0),
  resulting_to_grapheme INTEGER NOT NULL CHECK(resulting_to_grapheme >= resulting_from_grapheme),
  resulting_block_digest TEXT NOT NULL CHECK(length(resulting_block_digest) = 64),
  CHECK(to_grapheme > from_grapheme OR resulting_to_grapheme > resulting_from_grapheme),
  PRIMARY KEY(effect_id, ordinal)
) STRICT`,
  manuscript_effect_approvals: `CREATE TABLE manuscript_effect_approvals (
  approval_id TEXT PRIMARY KEY,
  effect_id TEXT NOT NULL UNIQUE REFERENCES manuscript_effect_intents(effect_id),
  payload_digest TEXT NOT NULL CHECK(length(payload_digest) = 64),
  actor TEXT NOT NULL CHECK(actor = 'editor'),
  interaction TEXT NOT NULL CHECK(interaction IN ('accept-and-apply', 'accept-edited-and-apply', 'apply-recorded-decision', 'confirm-batch-apply', 'confirm-reverse-apply')),
  approved_at TEXT NOT NULL
) STRICT`,
  manuscript_effect_dispatches: `CREATE TABLE manuscript_effect_dispatches (
  dispatch_id TEXT PRIMARY KEY,
  effect_id TEXT NOT NULL UNIQUE REFERENCES manuscript_effect_intents(effect_id),
  approval_id TEXT NOT NULL UNIQUE REFERENCES manuscript_effect_approvals(approval_id),
  service_lifetime_id TEXT NOT NULL,
  dispatched_at TEXT NOT NULL
) STRICT`,
  manuscript_effect_receipts: `CREATE TABLE manuscript_effect_receipts (
  receipt_id TEXT PRIMARY KEY,
  effect_id TEXT NOT NULL UNIQUE REFERENCES manuscript_effect_intents(effect_id),
  dispatch_id TEXT NOT NULL UNIQUE REFERENCES manuscript_effect_dispatches(dispatch_id),
  outcome TEXT NOT NULL CHECK(outcome = 'committed'),
  command_group_id TEXT NOT NULL UNIQUE REFERENCES manuscript_command_groups(command_group_id),
  resulting_revision_id TEXT NOT NULL REFERENCES manuscript_revisions(revision_id),
  resulting_journal_sequence INTEGER NOT NULL CHECK(resulting_journal_sequence > 0),
  resulting_working_digest TEXT NOT NULL CHECK(length(resulting_working_digest) = 64),
  change_count INTEGER NOT NULL CHECK(change_count >= 1),
  receipt_digest TEXT NOT NULL CHECK(length(receipt_digest) = 64),
  committed_at TEXT NOT NULL
) STRICT`,
} as const;

export const MANUSCRIPT_EFFECT_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(MANUSCRIPT_EFFECT_SCHEMA_SQL).flatMap((table) => [
    [`${table}_no_update`, `CREATE TRIGGER ${table}_no_update
    BEFORE UPDATE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MANUSCRIPT_EFFECT_LEDGER_IMMUTABLE');
    END`],
    [`${table}_no_delete`, `CREATE TRIGGER ${table}_no_delete
    BEFORE DELETE ON ${table}
    BEGIN
      SELECT RAISE(ABORT, 'MANUSCRIPT_EFFECT_LEDGER_IMMUTABLE');
    END`],
  ]),
);

export const MANUSCRIPT_EFFECT_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  manuscript_effect_intents: [
    'base_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
    'book_id>books.book_id:NO ACTION/NO ACTION/NONE',
    'branch_id>manuscript_branches.branch_id:NO ACTION/NO ACTION/NONE',
    'manuscript_id>manuscripts.manuscript_id:NO ACTION/NO ACTION/NONE',
    'reverses_effect_id>manuscript_effect_intents.effect_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_effect_targets: [
    'block_id>manuscript_blocks.block_id:NO ACTION/NO ACTION/NONE',
    'decision_id>proposal_item_decisions.decision_id:NO ACTION/NO ACTION/NONE',
    'effect_id>manuscript_effect_intents.effect_id:NO ACTION/NO ACTION/NONE',
    'item_id>proposal_change_items.item_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_effect_approvals: ['effect_id>manuscript_effect_intents.effect_id:NO ACTION/NO ACTION/NONE'],
  manuscript_effect_dispatches: [
    'approval_id>manuscript_effect_approvals.approval_id:NO ACTION/NO ACTION/NONE',
    'effect_id>manuscript_effect_intents.effect_id:NO ACTION/NO ACTION/NONE',
  ],
  manuscript_effect_receipts: [
    'command_group_id>manuscript_command_groups.command_group_id:NO ACTION/NO ACTION/NONE',
    'dispatch_id>manuscript_effect_dispatches.dispatch_id:NO ACTION/NO ACTION/NONE',
    'effect_id>manuscript_effect_intents.effect_id:NO ACTION/NO ACTION/NONE',
    'resulting_revision_id>manuscript_revisions.revision_id:NO ACTION/NO ACTION/NONE',
  ],
};

type SqlRow = Record<string, SQLOutputValue>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCK_PATTERN = /^blk_[0-9a-f]{24}$/;

function requireApply(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new EditorialMarkError(code, message);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Created once and never rebuilt; shape-detected, like the relations of revisions 21 and 22. */
export function initializeManuscriptEffectSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_effect_intents'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(MANUSCRIPT_EFFECT_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(MANUSCRIPT_EFFECT_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  requireApply(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'SCHEMA_MIGRATION_FAILED', '数据库引用校验失败。');
}

interface PlannedTarget {
  markId: string;
  itemId: string;
  blockId: string;
  fromGrapheme: number;
  toGrapheme: number;
  expectedText: string;
  insertText: string;
  decision: { disposition: 'accepted' | 'accepted-with-edit' | 'withdrawn'; editedText: string | null; reason: string | null } | { existingDecisionId: string };
  standsAs: 'applied' | 'open';
}

interface Binding {
  manuscriptId: string;
  branchId: string;
  windowStartBlockId: string;
}

export class ManuscriptApplyStore {
  readonly #db: DatabaseSync;
  readonly #manuscript: BoundedManuscriptStore;
  readonly #marks: EditorialMarkStore;
  readonly #lifetimeId: string;

  constructor(db: DatabaseSync, manuscript: BoundedManuscriptStore, marks: EditorialMarkStore, lifetimeId: string) {
    this.#db = db;
    this.#manuscript = manuscript;
    this.#marks = marks;
    this.#lifetimeId = lifetimeId;
  }

  /** 接受并应用, 修改后接受, or applying a decision recorded before Apply existed. */
  apply(input: ApplyChangeSuggestionInput): ManuscriptApplyCommandProjection {
    this.#requireIdentities(input, [input.markId], input.clientEffectId);
    const replayed = this.#replay(input, input.clientEffectId, input.markId);
    if (replayed) return replayed;
    const target = this.#marks.suggestionTarget(input);
    requireApply(target.status !== 'applied', 'APPLY_ALREADY_COMMITTED', '这条修改建议已经应用。');
    requireApply(target.anchorState === 'exact', 'APPLY_TARGET_DRIFTED', '原文已变，本次应用没有写入稿件。');
    let insertText: string;
    let decision: PlannedTarget['decision'];
    if (input.interaction === 'accept-and-apply') {
      requireApply(target.decision === null && input.editedText === null && input.reason === null, 'APPLY_INVALID', '这条修改建议已经处理过，请先撤回。');
      insertText = target.proposedText;
      decision = { disposition: 'accepted', editedText: null, reason: null };
    } else if (input.interaction === 'accept-edited-and-apply') {
      requireApply(target.decision === null, 'APPLY_INVALID', '这条修改建议已经处理过，请先撤回。');
      requireApply(
        typeof input.editedText === 'string' && input.editedText.isWellFormed() && input.editedText.length <= MAX_MARK_BODY_CODE_UNITS &&
          input.editedText !== target.currentText,
        'APPLY_INVALID',
        '修改后的文字需要与原文不同。',
      );
      insertText = input.editedText;
      decision = { disposition: 'accepted-with-edit', editedText: input.editedText, reason: input.reason };
    } else {
      requireApply(
        input.interaction === 'apply-recorded-decision' && target.decision?.disposition === 'accepted-with-edit' &&
          target.decision.editedText !== null && input.editedText === null && input.reason === null,
        'APPLY_INVALID',
        '没有已记录、尚未写入的「修改后接受」。',
      );
      insertText = target.decision.editedText;
      decision = { existingDecisionId: target.decision.decisionId };
    }
    return this.#commit(input, 'apply', input.interaction, input.clientEffectId, null, [{
      markId: input.markId, itemId: target.itemId, blockId: target.blockId, fromGrapheme: target.fromGrapheme,
      toGrapheme: target.toGrapheme, expectedText: target.currentText, insertText, decision, standsAs: 'applied',
    }], input.markId);
  }

  /**
   * 确认应用 on the batch confirmation strip. The strip named these suggestions; every one of them is
   * rechecked, and one that drifted refuses the whole Effect rather than silently leaving the set
   * (V2-UX-APREP-007, APREP-009).
   */
  applyBatch(input: ApplyChangeSuggestionBatchInput): ManuscriptApplyCommandProjection {
    requireApply(Array.isArray(input.markIds) && input.markIds.length > 0 && new Set(input.markIds).size === input.markIds.length, 'APPLY_INVALID', '应用范围无效。');
    this.#requireIdentities(input, input.markIds, input.clientEffectId);
    const replayed = this.#replay(input, input.clientEffectId, input.markIds[0]!);
    if (replayed) return replayed;
    const planned = input.markIds.map((markId): PlannedTarget => {
      const target = this.#marks.suggestionTarget({ ...input, markId });
      requireApply(target.status !== 'applied' && target.decision === null, 'APPLY_INVALID', '其中有修改建议已经处理过；请重新准备这次应用。');
      requireApply(target.anchorState === 'exact', 'APPLY_TARGET_DRIFTED', '其中有修改建议的原文已变；本次应用没有写入稿件。');
      return {
        markId, itemId: target.itemId, blockId: target.blockId, fromGrapheme: target.fromGrapheme, toGrapheme: target.toGrapheme,
        expectedText: target.currentText, insertText: target.proposedText,
        decision: { disposition: 'accepted', editedText: null, reason: null }, standsAs: 'applied',
      };
    });
    return this.#commit(input, 'apply', 'confirm-batch-apply', input.clientEffectId, null, planned, input.markIds[0]!);
  }

  /**
   * 确认撤销本次应用. The inverse of a committed Apply is a new Effect against the text the manuscript
   * holds now; the original Apply and its receipt stay exactly as they were committed. It is refused
   * when the applied text has been changed since — that is a conflict to resolve, never a text to
   * overwrite (V2-UX-EREC-010 to 012). The inverse of an Apply that deleted its words inserts them at
   * the point they left, and is refused only once an edit has spanned that point.
   */
  reverse(input: ReverseAppliedChangeSuggestionInput): ManuscriptApplyCommandProjection {
    this.#requireIdentities(input, [input.markId], input.clientEffectId);
    const replayed = this.#replay(input, input.clientEffectId, input.markId);
    if (replayed) return replayed;
    const target = this.#marks.suggestionTarget(input);
    requireApply(target.status === 'applied', 'APPLY_INVALID', '这条修改建议没有已应用的写入可以撤销。');
    requireApply(target.anchorState === 'exact', 'APPLY_TARGET_DRIFTED', '应用后的文字又改过，不能直接撤销这次应用。');
    const original = this.#db.prepare(
      `SELECT i.effect_id FROM manuscript_effect_targets t
       JOIN manuscript_effect_intents i ON i.effect_id = t.effect_id AND i.kind = 'apply'
       JOIN manuscript_effect_receipts r ON r.effect_id = i.effect_id
       WHERE t.item_id = ? ORDER BY r.resulting_journal_sequence DESC LIMIT 1`,
    ).get(target.itemId) as SqlRow | undefined;
    requireApply(original !== undefined && typeof original.effect_id === 'string', 'APPLY_INVALID', '找不到这次应用的凭据。');
    requireApply(
      this.#db.prepare('SELECT 1 FROM manuscript_effect_intents WHERE reverses_effect_id = ?').get(original.effect_id) === undefined,
      'APPLY_INVALID',
      '这次应用已经撤销过。',
    );
    return this.#commit(input, 'reverse-apply', 'confirm-reverse-apply', input.clientEffectId, original.effect_id, [{
      markId: input.markId, itemId: target.itemId, blockId: target.blockId, fromGrapheme: target.fromGrapheme,
      toGrapheme: target.toGrapheme, expectedText: target.standingText, insertText: target.currentText,
      decision: { disposition: 'withdrawn', editedText: null, reason: null }, standsAs: 'open',
    }], input.markId);
  }

  /** Apply Outcome Recovery: what the store holds for one Effect identity, and nothing else. */
  outcome(manuscriptId: string, branchId: string, clientEffectId: string): ManuscriptApplyOutcomeProjection {
    requireApply(UUID_PATTERN.test(manuscriptId) && UUID_PATTERN.test(branchId) && UUID_PATTERN.test(clientEffectId), 'APPLY_INVALID', '应用标识无效。');
    const application = this.#application(clientEffectId, manuscriptId, branchId);
    return application === null ? { state: 'not-committed', application: null } : { state: 'committed', application };
  }

  #requireIdentities(binding: Binding, markIds: ReadonlyArray<string>, clientEffectId: string): void {
    requireApply(
      UUID_PATTERN.test(binding.manuscriptId) && UUID_PATTERN.test(binding.branchId) && BLOCK_PATTERN.test(binding.windowStartBlockId) &&
        UUID_PATTERN.test(clientEffectId) && markIds.every((markId) => typeof markId === 'string' && UUID_PATTERN.test(markId)),
      'APPLY_INVALID',
      '应用标识无效。',
    );
  }

  #application(clientEffectId: string, manuscriptId: string, branchId: string): ManuscriptApplyProjection | null {
    const row = this.#db.prepare(
      `SELECT i.effect_id, i.kind, i.payload_digest, i.target_count, i.base_revision_id, i.base_journal_sequence, i.base_working_digest,
              i.reverses_effect_id, i.manuscript_id, i.branch_id, a.approval_id, a.interaction, d.dispatch_id, r.receipt_id,
              r.receipt_digest, r.committed_at, r.resulting_revision_id, r.resulting_journal_sequence, r.resulting_working_digest,
              (SELECT x.effect_id FROM manuscript_effect_intents x
                 JOIN manuscript_effect_receipts xr ON xr.effect_id = x.effect_id
                WHERE x.reverses_effect_id = i.effect_id LIMIT 1) reversed_by
       FROM manuscript_effect_intents i
       JOIN manuscript_effect_approvals a ON a.effect_id = i.effect_id
       JOIN manuscript_effect_dispatches d ON d.effect_id = i.effect_id
       JOIN manuscript_effect_receipts r ON r.effect_id = i.effect_id
       WHERE i.idempotency_key = ?`,
    ).get(clientEffectId) as SqlRow | undefined;
    if (row === undefined) return null;
    requireApply(row.manuscript_id === manuscriptId && row.branch_id === branchId, 'IDEMPOTENCY_CONFLICT', '应用标识已用于另一份稿件。');
    return applyProjection(row);
  }

  /** The same idempotency key never writes twice: it answers with the receipt it already has. */
  #replay(binding: Binding, clientEffectId: string, markId: string): ManuscriptApplyCommandProjection | null {
    const application = this.#application(clientEffectId, binding.manuscriptId, binding.branchId);
    if (application === null) return null;
    return { ...this.#marks.commandProjection(binding, markId), application, window: this.#window(binding) };
  }

  #window(binding: Binding): ManuscriptWindowProjection {
    return this.#manuscript.getWindow(binding.manuscriptId, binding.branchId, { kind: 'window-start', blockId: binding.windowStartBlockId });
  }

  #commit(
    binding: Binding,
    kind: 'apply' | 'reverse-apply',
    interaction: ManuscriptApplyProjection['interaction'],
    clientEffectId: string,
    reversesEffectId: string | null,
    planned: ReadonlyArray<PlannedTarget>,
    projectedMarkId: string,
  ): ManuscriptApplyCommandProjection {
    const targets: ExactReplacementTarget[] = planned.map((target) => ({
      blockId: target.blockId,
      fromGrapheme: target.fromGrapheme,
      toGrapheme: target.toGrapheme,
      expectedText: target.expectedText,
      insertText: target.insertText,
    }));
    const payloadDigest = sha256(JSON.stringify(planned.map((target) => [
      target.itemId, target.blockId, target.fromGrapheme, target.toGrapheme, sha256(target.expectedText), sha256(target.insertText),
    ])));
    this.#manuscript.commitExactReplacements(binding.manuscriptId, binding.branchId, targets, this.#lifetimeId, (commit: ExactReplacementCommit) => {
      const effectId = randomUUID();
      const approvalId = randomUUID();
      const dispatchId = randomUUID();
      const receiptId = randomUUID();
      const now = commit.committedAt;
      this.#db.prepare(
        `INSERT INTO manuscript_effect_intents(
           effect_id, idempotency_key, kind, book_id, manuscript_id, branch_id, base_revision_id, base_journal_sequence,
           base_working_digest, target_count, payload_digest, replay_policy, reverses_effect_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idempotency-keyed', ?, ?)`,
      ).run(effectId, clientEffectId, kind, commit.bookId, binding.manuscriptId, binding.branchId, commit.before.revisionId,
        commit.before.journalSequence, commit.before.workingDigest, planned.length, payloadDigest, reversesEffectId, now);
      planned.forEach((target, index) => {
        const written = commit.targets[index]!;
        const decisionId = 'existingDecisionId' in target.decision
          ? target.decision.existingDecisionId
          : this.#marks.recordDecisionForApply(binding, target.itemId, target.blockId, target.decision.disposition, target.decision.editedText, target.decision.reason, now);
        this.#db.prepare(
          `INSERT INTO manuscript_effect_targets(
             effect_id, ordinal, item_id, decision_id, block_id, from_grapheme, to_grapheme, expected_text_digest,
             expected_block_digest, replacement_text_digest, resulting_from_grapheme, resulting_to_grapheme, resulting_block_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(effectId, index + 1, target.itemId, decisionId, target.blockId, target.fromGrapheme, target.toGrapheme,
          sha256(target.expectedText), written.beforeBlockDigest, sha256(target.insertText), written.resultingFromGrapheme,
          written.resultingToGrapheme, written.afterBlockDigest);
      });
      this.#db.prepare(
        "INSERT INTO manuscript_effect_approvals(approval_id, effect_id, payload_digest, actor, interaction, approved_at) VALUES (?, ?, ?, 'editor', ?, ?)",
      ).run(approvalId, effectId, payloadDigest, interaction, now);
      this.#db.prepare(
        'INSERT INTO manuscript_effect_dispatches(dispatch_id, effect_id, approval_id, service_lifetime_id, dispatched_at) VALUES (?, ?, ?, ?, ?)',
      ).run(dispatchId, effectId, approvalId, this.#lifetimeId, now);
      const receiptDigest = sha256(JSON.stringify([
        effectId, clientEffectId, kind, payloadDigest, approvalId, dispatchId, commit.commandGroupId,
        commit.before.revisionId, commit.before.journalSequence, commit.before.workingDigest,
        commit.after.revisionId, commit.after.journalSequence, commit.after.workingDigest, planned.length, now,
      ]));
      this.#db.prepare(
        `INSERT INTO manuscript_effect_receipts(
           receipt_id, effect_id, dispatch_id, outcome, command_group_id, resulting_revision_id, resulting_journal_sequence,
           resulting_working_digest, change_count, receipt_digest, committed_at
         ) VALUES (?, ?, ?, 'committed', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(receiptId, effectId, dispatchId, commit.commandGroupId, commit.after.revisionId, commit.after.journalSequence,
        commit.after.workingDigest, planned.length, receiptDigest, now);
      // Each mark now stands on the text this Effect wrote: the applied text, or the restored original. A
      // suggestion that deleted its words wrote none, and its mark stands exactly on the empty range they
      // left — nothing has changed there since — so reversing it is an insertion at that point.
      planned.forEach((target, index) => {
        const written = commit.targets[index]!;
        requireApply(
          written.resultingToGrapheme - written.resultingFromGrapheme === graphemesOf(target.insertText).length,
          'MARK_STORE_INVALID',
          '应用后的范围无法核对。',
        );
        this.#marks.standMarkOn(target.markId, target.standsAs, {
          revisionId: commit.after.revisionId,
          journalSequence: commit.after.journalSequence,
          blockDigest: written.afterBlockDigest,
          fromGrapheme: written.resultingFromGrapheme,
          toGrapheme: written.resultingToGrapheme,
          text: target.insertText,
        }, now);
      });
    });
    const application = this.#application(clientEffectId, binding.manuscriptId, binding.branchId);
    requireApply(application !== null, 'APPLY_RECEIPT_MISSING', '应用已提交但无法读取凭据。');
    return { ...this.#marks.commandProjection(binding, projectedMarkId), application, window: this.#window(binding) };
  }
}
