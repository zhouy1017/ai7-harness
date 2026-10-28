import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { MAX_BLOCK_CODE_UNITS, MAX_BLOCK_GRAPHEMES, type ManuscriptBlockProjection } from '../../shared/protocol.js';
import { HISTORY_BATCH, UUID_PATTERN, DIGEST_PATTERN, asNumber, asString, canonicalJson, one, requireBounded, sha256, stagedBlockLength, type SqlRow } from './bounded-kernel.js';

export function blockDigest(kind: ManuscriptBlockProjection['kind'], level: number | null, text: string): string {
  return sha256(canonicalJson({ kind, level, text }));
}

/** The canonical header `ai7.recovery-command-evidence/1` hashes before a command group's members. */
export interface CommandEvidenceHeader {
  readonly schema: 'ai7.recovery-command-evidence/1';
  readonly groupId: string;
  readonly branchId: string;
  readonly ordinal: number;
  readonly kind: 'edit' | 'replacement';
  readonly sourceGroupId: string | null;
}

/** One member of a command group exactly as its evidence hashes it: the block's whole text before and after. */
export interface CommandEvidenceMember {
  readonly position: number;
  readonly blockId: string;
  readonly beforeText: string;
  readonly beforeDigest: string;
  readonly afterText: string;
  readonly afterDigest: string;
}

/**
 * The one reading of a command group's immutable evidence (Issue #1140). The group is validated whole first; then its
 * canonical header and every member, in position order and in storage batches, pass through the
 * `ai7.recovery-command-evidence/1` digest as they are read. The working-state chain keeps only that digest; the manual
 * source reader also keeps the members of the page it is packing, so the page and the digest that proves it come from
 * one pass over the group.
 */
export class CommandEvidenceReader {
  readonly header: CommandEvidenceHeader;
  readonly #db: DatabaseSync;
  readonly #digest = createHash('sha256');
  #position = 0;
  #count = 0;
  #exhausted = false;

  constructor(db: DatabaseSync, groupId: string) {
    validateCommandHistoryGroup(db, groupId);
    const group = one(db.prepare(
      `SELECT branch_id, ordinal, kind, source_group_id
       FROM manuscript_command_groups WHERE command_group_id = ?`,
    ).all(groupId) as SqlRow[], 'HISTORY_CORRUPT', '恢复命令证据缺失。');
    this.#db = db;
    this.header = {
      schema: 'ai7.recovery-command-evidence/1',
      groupId,
      branchId: asString(group.branch_id),
      ordinal: asNumber(group.ordinal),
      kind: asString(group.kind) as CommandEvidenceHeader['kind'],
      sourceGroupId: group.source_group_id === null ? null : asString(group.source_group_id),
    };
    this.#digest.update(canonicalJson(this.header));
  }

  /** The next storage batch of members, each already hashed; empty once the last member has been read. */
  nextBatch(): CommandEvidenceMember[] {
    if (this.#exhausted) return [];
    const edits = this.#db.prepare(
      `SELECT position, block_id, before_text, before_digest, after_text, after_digest
       FROM manuscript_command_edits
       WHERE command_group_id = ? AND position > ? ORDER BY position LIMIT ?`,
    ).all(this.header.groupId, this.#position, HISTORY_BATCH) as SqlRow[];
    if (edits.length === 0) {
      this.#exhausted = true;
      return [];
    }
    return edits.map((edit) => {
      this.#position = asNumber(edit.position);
      const member: CommandEvidenceMember = {
        position: this.#position,
        blockId: asString(edit.block_id),
        beforeText: asString(edit.before_text),
        beforeDigest: asString(edit.before_digest),
        afterText: asString(edit.after_text),
        afterDigest: asString(edit.after_digest),
      };
      this.#digest.update(canonicalJson(member));
      this.#count += 1;
      return member;
    });
  }

  /** Reads whatever members remain, then the whole group's digest and member count. */
  finish(): { memberCount: number; digest: string } {
    while (this.nextBatch().length > 0) { /* hashed as read */ }
    requireBounded(this.#position > 0, 'HISTORY_CORRUPT', '恢复命令证据为空。');
    return { memberCount: this.#count, digest: this.#digest.digest('hex') };
  }
}

export function recoveryCommandEvidenceDigest(db: DatabaseSync, groupId: string): string {
  return new CommandEvidenceReader(db, groupId).finish().digest;
}

export function recoveryWorkingDigest(
  previous: string,
  sequence: number,
  action: 'edit' | 'replacement' | 'undo' | 'redo',
  groupId: string,
  evidenceDigest: string,
): string {
  return sha256(canonicalJson({
    schema: 'ai7.recovery-working-digest/1', previous, sequence, action, groupId, evidenceDigest,
  }));
}

export function validateCommandHistoryGroup(db: DatabaseSync, groupId: string): void {
  requireBounded(UUID_PATTERN.test(groupId), 'HISTORY_CORRUPT', '历史命令组标识无效。');
  const group = one(
    db.prepare(
      'SELECT branch_id, status, before_working_digest, after_working_digest FROM manuscript_command_groups WHERE command_group_id = ?',
    ).all(groupId) as SqlRow[],
    'HISTORY_CORRUPT',
    '历史命令组缺失。',
  );
  requireBounded(
    UUID_PATTERN.test(asString(group.branch_id)) && DIGEST_PATTERN.test(asString(group.before_working_digest)) &&
      DIGEST_PATTERN.test(asString(group.after_working_digest)),
    'HISTORY_CORRUPT',
    '历史命令组绑定摘要无效。',
  );
  const oversized = db.prepare(
    `SELECT position FROM manuscript_command_edits
     WHERE command_group_id = ? AND (
       typeof(before_text) <> 'text' OR typeof(after_text) <> 'text' OR
       length(CAST(before_text AS BLOB)) > ? OR length(CAST(after_text AS BLOB)) > ?
     ) ORDER BY position LIMIT 1`,
  ).get(groupId, MAX_BLOCK_CODE_UNITS * 3, MAX_BLOCK_CODE_UNITS * 3) as SqlRow | undefined;
  requireBounded(oversized === undefined, 'HISTORY_CORRUPT', '历史命令文字超出有界校验范围。');
  let position = 0;
  let expectedPosition = 1;
  while (true) {
    const rows = db.prepare(
      `SELECT ce.position, ce.block_id, ce.before_text, ce.before_digest, ce.after_text, ce.after_digest,
              wb.kind, wb.level, wb.block_id working_block_id
       FROM manuscript_command_edits ce
       JOIN manuscript_command_groups cg ON cg.command_group_id = ce.command_group_id
       LEFT JOIN working_blocks wb ON wb.branch_id = cg.branch_id AND wb.block_id = ce.block_id
       WHERE ce.command_group_id = ? AND ce.position > ? ORDER BY ce.position LIMIT ?`,
    ).all(groupId, position, HISTORY_BATCH) as SqlRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      position = asNumber(row.position);
      requireBounded(position === expectedPosition, 'HISTORY_CORRUPT', '历史命令内容块顺序或绑定无效。');
      let kind: ManuscriptBlockProjection['kind'];
      let level: number | null;
      if (typeof row.working_block_id === 'string' && typeof row.kind === 'string') {
        kind = asString(row.kind) as ManuscriptBlockProjection['kind'];
        level = row.level === null ? null : asNumber(row.level);
      } else {
        requireBounded(asString(group.status) === 'superseded', 'HISTORY_CORRUPT', '历史命令内容块顺序或绑定无效。');
        const shapes = db.prepare(
          `SELECT kind, level FROM manuscript_block_versions WHERE block_id = ?
           GROUP BY kind, level ORDER BY kind, level LIMIT 2`,
        ).all(asString(row.block_id)) as SqlRow[];
        requireBounded(shapes.length === 1, 'HISTORY_CORRUPT', '已归档历史命令的内容块结构证据无效。');
        kind = asString(shapes[0]!.kind) as ManuscriptBlockProjection['kind'];
        level = shapes[0]!.level === null ? null : asNumber(shapes[0]!.level);
      }
      const shapeValid =
        (kind === 'title' && level === 1) ||
        (kind === 'heading' && level !== null && Number.isSafeInteger(level) && level >= 1 && level <= 6) ||
        (kind === 'paragraph' && level === null);
      const beforeText = asString(row.before_text);
      const afterText = asString(row.after_text);
      const beforeLength = stagedBlockLength(beforeText, 'HISTORY_CORRUPT', '历史命令文字超出内容块边界。');
      const afterLength = stagedBlockLength(afterText, 'HISTORY_CORRUPT', '历史命令文字超出内容块边界。');
      requireBounded(
        shapeValid && beforeLength <= MAX_BLOCK_GRAPHEMES && afterLength <= MAX_BLOCK_GRAPHEMES &&
          blockDigest(kind, level, beforeText) === asString(row.before_digest) &&
          blockDigest(kind, level, afterText) === asString(row.after_digest),
        'HISTORY_CORRUPT',
        '历史命令的前后文字与摘要不一致。',
      );
      expectedPosition += 1;
    }
  }
  requireBounded(expectedPosition > 1, 'HISTORY_CORRUPT', '历史命令组没有可重放内容。');
}
