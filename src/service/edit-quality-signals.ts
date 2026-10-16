import type { DatabaseSync } from 'node:sqlite';
import { followSpanEdit, graphemesOf } from '../shared/mark-anchor.js';
import type { EditQualitySignalsProjection } from '../shared/protocol.js';
import { canonicalJson, sha256Hex } from './analysis/canonical.js';

/** Editorial effort counts graphemes, never elapsed Task time. Replacements count removed plus inserted graphemes. */
export function graphemeEditVolume(before: string, after: string): number {
  const left = graphemesOf(before);
  const right = graphemesOf(after);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let end = 0;
  while (end < left.length - start && end < right.length - start && left[left.length - 1 - end] === right[right.length - 1 - end]) end += 1;
  return left.length + right.length - 2 * (start + end);
}

/** Stable effort weights: expression 3, format 2, other categories 1; these are effort units, not quality scores. */
export function editCategoryWeight(categoryId: string): number {
  return categoryId === 'literary-expression' ? 3 : categoryId === 'style-and-format' ? 2 : 1;
}

/** Read-only projection over explicitly accepted Apply targets, their receipts and later durable journal edits. */
export function inspectEditQualitySignals(db: DatabaseSync, bookId: string | null): EditQualitySignalsProjection {
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
  const categories = new Map<string, { categoryId: string; applied: number; surviving: number; editVolume: number; lineage: unknown[] }>();
  for (const target of targets) {
    const categoryId = String(target.category_id);
    const metric = categories.get(categoryId) ?? { categoryId, applied: 0, surviving: 0, editVolume: 0, lineage: [] };
    const current = target.current_text === null ? null : graphemesOf(String(target.current_text));
    const rangeDigest = current === null ? null : sha256Hex(current.slice(Number(target.from_grapheme), Number(target.to_grapheme)).join(''));
    const survives = target.reversed === 0 && target.status === 'applied' && target.anchor_state === 'exact' &&
      (target.current_digest === target.resulting_block_digest || rangeDigest === target.replacement_text_digest);
    let volume = target.disposition === 'accepted-with-edit' ? graphemeEditVolume(String(target.proposed_text), String(target.edited_text ?? '')) : 0;
    let range = { fromGrapheme: Number(target.resulting_from_grapheme), toGrapheme: Number(target.resulting_to_grapheme) };
    const edits = db.prepare(`SELECT sequence, from_grapheme, to_grapheme, insert_text, resulting_block_digest, command_kind
      FROM edit_journal_entries WHERE branch_id = ? AND block_id = ? AND sequence > ? ORDER BY sequence`).all(
      target.branch_id!, target.block_id!, target.resulting_journal_sequence!);
    const lineage: unknown[] = [];
    for (const edit of edits) {
      const inserted = graphemesOf(String(edit.insert_text)).length;
      const span = { fromGrapheme: Number(edit.from_grapheme), toGrapheme: Number(edit.to_grapheme), insertedGraphemes: inserted };
      const followed = followSpanEdit(range, span);
      // An applied deletion is an empty range. Insertion at that point also changes its survival/effort evidence.
      const touches = followed.touched || (range.fromGrapheme === range.toGrapheme && span.fromGrapheme <= range.fromGrapheme && span.toGrapheme >= range.toGrapheme);
      if (touches && edit.command_kind === 'edit') volume += span.toGrapheme - span.fromGrapheme + inserted;
      range = followed;
      lineage.push({ sequence: edit.sequence, digest: edit.resulting_block_digest, touches });
    }
    metric.applied += 1;
    metric.surviving += survives ? 1 : 0;
    metric.editVolume += volume * editCategoryWeight(categoryId);
    metric.lineage.push({ decisionId: target.decision_id, receiptDigest: target.receipt_digest, currentDigest: target.current_digest,
      anchor: target.anchor_state, status: target.status, reversed: target.reversed, survives, volume, edits: lineage });
    categories.set(categoryId, metric);
  }
  const projected = [...categories.values()].sort((a, b) => a.categoryId.localeCompare(b.categoryId)).map(({ lineage, ...metric }) =>
    ({ ...metric, lineageDigest: sha256Hex(canonicalJson(lineage)) }));
  return { bookId, applied: projected.reduce((sum, metric) => sum + metric.applied, 0), surviving: projected.reduce((sum, metric) => sum + metric.surviving, 0),
    editVolume: projected.reduce((sum, metric) => sum + metric.editVolume, 0), categories: projected, lineageDigest: sha256Hex(canonicalJson(projected)) };
}
