import type { DatabaseSync } from 'node:sqlite';
import { deriveSpanEdit, followBlockTextChange, followSpanEdit, graphemesOf } from '../shared/mark-anchor.js';
import type { EditQualitySignalsProjection, TrustedOperationalScope } from '../shared/protocol.js';
import { canonicalJson, sha256Hex } from './analysis/canonical.js';

/** Grapheme Levenshtein distance for accepted-with-edit text; common edges avoid work on unchanged prose. */
export function graphemeEditVolume(before: string, after: string): number {
  const left = graphemesOf(before);
  const right = graphemesOf(after);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let end = 0;
  while (end < left.length - start && end < right.length - start && left[left.length - 1 - end] === right[right.length - 1 - end]) end += 1;
  let a = left.slice(start, left.length - end);
  let b = right.slice(start, right.length - end);
  if (a.length > b.length) [a, b] = [b, a];
  const row = Uint32Array.from({ length: a.length + 1 }, (_, index) => index);
  for (let j = 1; j <= b.length; j += 1) {
    let diagonal = row[0]!; row[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const above = row[i]!;
      row[i] = Math.min(above + 1, row[i - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[a.length]!;
}

/** Stable effort weights: expression 3, format 2, other categories 1; these are effort units, not quality scores. */
export function editCategoryWeight(categoryId: string): number {
  return categoryId === 'literary-expression' ? 3 : categoryId === 'style-and-format' ? 2 : 1;
}

/** One explicitly accepted Apply target as it stands now: whether it survives, its unweighted effort and its lineage. */
interface TargetSignal {
  readonly decisionId: string;
  readonly categoryId: string;
  readonly survives: boolean;
  readonly volume: number;
  readonly lineage: unknown;
}

/** One decision's own targets (Issue #911 review): what the house record may read of a source it admits, and nothing else. */
export interface DecisionEditQuality {
  readonly applied: number;
  readonly surviving: number;
  readonly editVolume: number;
  readonly lineageDigest: string;
}

/** A decision with no applied target: nothing survives or was rewritten, and its lineage is the empty one. */
export const NO_EDIT_QUALITY: DecisionEditQuality = { applied: 0, surviving: 0, editVolume: 0, lineageDigest: sha256Hex(canonicalJson([])) };

/**
 * Each explicitly accepted Apply target with its receipt and the later durable journal edits touching it. With a scope, only
 * targets whose 修改建议 came from a review finding materialized under that scope are read (the development-data rule).
 */
function* targetSignals(db: DatabaseSync, bookId: string | null, operationalScope?: TrustedOperationalScope): IterableIterator<TargetSignal> {
  const targets = db.prepare(`SELECT t.*, i.book_id, i.branch_id, r.resulting_journal_sequence, r.receipt_digest,
      d.disposition, d.edited_text, p.proposed_text, m.anchor_state, m.status, m.from_grapheme, m.to_grapheme,
      w.digest AS current_digest, w.text AS current_text,
      COALESCE((SELECT f.category_id FROM review_findings f WHERE f.mark_id = m.mark_id ORDER BY rowid DESC LIMIT 1), 'editorial') AS category_id,
      EXISTS(SELECT 1 FROM manuscript_effect_intents reverse WHERE reverse.reverses_effect_id = i.effect_id) AS reversed
    FROM manuscript_effect_targets t JOIN manuscript_effect_intents i ON i.effect_id = t.effect_id
    JOIN manuscript_effect_receipts r ON r.effect_id = i.effect_id
    JOIN proposal_item_decisions d ON d.decision_id = t.decision_id
    JOIN proposal_change_items p ON p.item_id = t.item_id
    JOIN editorial_marks m ON m.mark_id = p.mark_id
    LEFT JOIN working_blocks w ON w.branch_id = i.branch_id AND w.block_id = t.block_id
    WHERE i.kind = 'apply' AND d.disposition IN ('accepted', 'accepted-with-edit') AND (? IS NULL OR i.book_id = ?)
    ORDER BY i.book_id, i.effect_id, t.ordinal`).all(bookId, bookId);
  for (const target of targets) {
    if (operationalScope !== undefined) {
      const origin = db.prepare(`SELECT r.canonical_json, r.sha256 FROM review_findings f
        JOIN review_run_category_events e ON e.review_run_id = f.review_run_id AND e.category_id = f.category_id AND e.state = 'materialized'
        JOIN analysis_result_set_revisions r ON r.revision_id = e.result_set_revision_id
        JOIN proposal_change_items p ON p.mark_id = f.mark_id
        WHERE p.item_id = ? ORDER BY f.rowid, e.sequence DESC LIMIT 1`).get(target.item_id!);
      if (origin === undefined || sha256Hex(String(origin.canonical_json)) !== origin.sha256) continue;
      const record = JSON.parse(String(origin.canonical_json)) as { policyPin?: { operationalScope?: string } };
      if (record.policyPin?.operationalScope !== operationalScope) continue;
    }
    const categoryId = String(target.category_id);
    const current = target.current_text === null ? null : graphemesOf(String(target.current_text));
    const rangeDigest = current === null ? null : sha256Hex(current.slice(Number(target.from_grapheme), Number(target.to_grapheme)).join(''));
    const survives = target.reversed === 0 && target.status === 'applied' && target.anchor_state === 'exact' &&
      (target.current_digest === target.resulting_block_digest || rangeDigest === target.replacement_text_digest);
    let volume = target.disposition === 'accepted-with-edit' ? graphemeEditVolume(String(target.proposed_text), String(target.edited_text ?? '')) : 0;
    let range = { fromGrapheme: Number(target.resulting_from_grapheme), toGrapheme: Number(target.resulting_to_grapheme) };
    // Bulk replacements and undo/redo record one synthetic journal row for several blocks. Their
    // command ledger supplies each block's actual before/after text; the journal's 0..0 range is not an edit.
    const edits = db.prepare(`SELECT e.sequence, e.from_grapheme, e.to_grapheme, e.insert_text,
        e.resulting_block_digest, e.command_kind, ce.before_text, ce.after_text, ce.before_digest, ce.after_digest,
        EXISTS(SELECT 1 FROM manuscript_effect_receipts r WHERE r.command_group_id = e.command_group_id) AS effect_command
      FROM edit_journal_entries e
      LEFT JOIN manuscript_command_edits ce ON ce.command_group_id = e.command_group_id AND ce.block_id = ?
      WHERE e.branch_id = ? AND e.sequence > ? AND (e.block_id = ? OR ce.block_id IS NOT NULL)
      ORDER BY e.sequence`).all(target.block_id!, target.branch_id!, target.resulting_journal_sequence!, target.block_id!);
    const lineage: unknown[] = [];
    for (const edit of edits) {
      let touches: boolean;
      let editedVolume: number;
      if (edit.command_kind !== 'edit' && typeof edit.before_text === 'string' && typeof edit.after_text === 'string') {
        const beforeText = edit.command_kind === 'undo' ? edit.after_text : edit.before_text;
        const afterText = edit.command_kind === 'undo' ? edit.before_text : edit.after_text;
        const before = graphemesOf(beforeText);
        const after = graphemesOf(afterText);
        const span = deriveSpanEdit(before, after);
        const priorText = before.slice(range.fromGrapheme, range.toGrapheme).join('');
        const followed = followBlockTextChange(range, priorText, beforeText, afterText);
        // Disjoint replacements on both sides may bracket this range. An exactly retained range
        // contributes no effort merely because the command's bounding span crosses it.
        touches = span !== null && (followed.state !== 'exact' || (priorText === '' &&
          span.fromGrapheme <= range.fromGrapheme && span.toGrapheme >= range.toGrapheme));
        editedVolume = touches ? graphemeEditVolume(priorText, after.slice(followed.fromGrapheme, followed.toGrapheme).join('')) : 0;
        range = followed;
      } else {
        const inserted = graphemesOf(String(edit.insert_text)).length;
        const span = { fromGrapheme: Number(edit.from_grapheme), toGrapheme: Number(edit.to_grapheme), insertedGraphemes: inserted };
        const followed = followSpanEdit(range, span);
        touches = followed.touched || (range.fromGrapheme === range.toGrapheme && span.fromGrapheme <= range.fromGrapheme && span.toGrapheme >= range.toGrapheme);
        editedVolume = touches ? span.toGrapheme - span.fromGrapheme + inserted : 0;
        range = followed;
      }
      if (edit.effect_command === 0) volume += editedVolume;
      lineage.push({ sequence: edit.sequence, digest: edit.command_kind === 'undo' ? edit.before_digest : edit.after_digest ?? edit.resulting_block_digest, touches });
    }
    yield { decisionId: String(target.decision_id), categoryId, survives, volume, lineage: { decisionId: target.decision_id, receiptDigest: target.receipt_digest,
      currentDigest: target.current_digest, anchor: target.anchor_state, status: target.status, reversed: target.reversed, survives, volume, edits: lineage } };
  }
}

/** Read-only projection over explicitly accepted Apply targets, their receipts and later durable journal edits. */
export function inspectEditQualitySignals(db: DatabaseSync, bookId: string | null, operationalScope?: TrustedOperationalScope): EditQualitySignalsProjection {
  const categories = new Map<string, { categoryId: string; applied: number; surviving: number; editVolume: number; lineage: unknown[] }>();
  for (const signal of targetSignals(db, bookId, operationalScope)) {
    const metric = categories.get(signal.categoryId) ?? { categoryId: signal.categoryId, applied: 0, surviving: 0, editVolume: 0, lineage: [] };
    metric.applied += 1;
    metric.surviving += signal.survives ? 1 : 0;
    metric.editVolume += signal.volume * editCategoryWeight(signal.categoryId);
    metric.lineage.push(signal.lineage);
    categories.set(signal.categoryId, metric);
  }
  const projected = [...categories.values()].sort((a, b) => a.categoryId.localeCompare(b.categoryId)).map(({ lineage, ...metric }) =>
    ({ ...metric, lineageDigest: sha256Hex(canonicalJson(lineage)) }));
  return { bookId, applied: projected.reduce((sum, metric) => sum + metric.applied, 0), surviving: projected.reduce((sum, metric) => sum + metric.surviving, 0),
    editVolume: projected.reduce((sum, metric) => sum + metric.editVolume, 0), categories: projected, lineageDigest: sha256Hex(canonicalJson(projected)) };
}

/**
 * The same signals by the decision that applied them (Issue #911 review): the house record reads each admitted source's own
 * targets, so an excluded, deferred or never-offered decision's survival and edits never shape a preference line.
 */
export function editQualityOfDecisions(db: DatabaseSync, bookId: string, operationalScope: TrustedOperationalScope): ReadonlyMap<string, DecisionEditQuality> {
  const decisions = new Map<string, { applied: number; surviving: number; editVolume: number; lineage: unknown[] }>();
  for (const signal of targetSignals(db, bookId, operationalScope)) {
    const metric = decisions.get(signal.decisionId) ?? { applied: 0, surviving: 0, editVolume: 0, lineage: [] };
    metric.applied += 1;
    metric.surviving += signal.survives ? 1 : 0;
    metric.editVolume += signal.volume * editCategoryWeight(signal.categoryId);
    metric.lineage.push(signal.lineage);
    decisions.set(signal.decisionId, metric);
  }
  return new Map([...decisions].map(([decisionId, { lineage, ...metric }]) => [decisionId, { ...metric, lineageDigest: sha256Hex(canonicalJson(lineage)) }]));
}
