import type { DatabaseSync } from 'node:sqlite';

/**
 * The chapter-level Reimport Comparison's relations (Issue #412, plan slice S63; V2-UX-IMP-041 to IMP-043, IMP-057).
 * Schema revision 36 adds five, beside the block mappings a comparison already records:
 *
 * - `manuscript_reimport_group_sets` marks a comparison prepared with its groups (`ai7.reimport-groups/1`). A
 *   comparison without one was prepared before this revision; its review is prepared again, never guessed at.
 * - `manuscript_reimport_groups` and `manuscript_reimport_group_members`: each run of changed blocks between two exact
 *   ones, with the mappings on each side — written once, when the comparison is prepared.
 * - `manuscript_reimport_group_resolutions`: the one verb the editor chose for a group, recorded with the identities it
 *   wrote into `manuscript_reimport_mapping_resolutions`, which the commit reads as before.
 * - `manuscript_reimport_mark_outcomes`: for a changed reimport, each editorial mark of a changed group — followed to
 *   its words in the new paragraphs, or listed as unable to follow — beside the Manuscript Reimport Record.
 *
 * A review that is invalidated takes its comparison with it, so the first four cascade from the comparison; an
 * outcome stays with the record it belongs to.
 */
export const REIMPORT_GROUP_SCHEMA_SQL = {
  manuscript_reimport_group_sets: `CREATE TABLE manuscript_reimport_group_sets (
  comparison_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
  grouping TEXT NOT NULL CHECK(grouping = 'ai7.reimport-groups/1'),
  group_count INTEGER NOT NULL CHECK(group_count >= 0),
  anchor_count INTEGER NOT NULL CHECK(anchor_count >= 0)
) STRICT`,
  manuscript_reimport_groups: `CREATE TABLE manuscript_reimport_groups (
  group_id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  current_count INTEGER NOT NULL CHECK(current_count >= 0),
  staged_count INTEGER NOT NULL CHECK(staged_count >= 0),
  current_from INTEGER CHECK(current_from IS NULL OR current_from >= 1),
  current_to INTEGER CHECK(current_to IS NULL OR current_to >= current_from),
  staged_from INTEGER CHECK(staged_from IS NULL OR staged_from >= 1),
  staged_to INTEGER CHECK(staged_to IS NULL OR staged_to >= staged_from),
  chapter_label TEXT CHECK(chapter_label IS NULL OR length(chapter_label) BETWEEN 1 AND 200),
  UNIQUE(comparison_id, ordinal),
  CHECK(current_count + staged_count >= 1),
  CHECK((current_count = 0) = (current_from IS NULL) AND (current_from IS NULL) = (current_to IS NULL)),
  CHECK((staged_count = 0) = (staged_from IS NULL) AND (staged_from IS NULL) = (staged_to IS NULL))
) STRICT`,
  manuscript_reimport_group_members: `CREATE TABLE manuscript_reimport_group_members (
  group_id TEXT NOT NULL REFERENCES manuscript_reimport_groups(group_id) ON DELETE CASCADE,
  mapping_id TEXT NOT NULL REFERENCES manuscript_reimport_mappings(mapping_id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK(side IN ('current', 'staged')),
  member_order INTEGER NOT NULL CHECK(member_order >= 1),
  PRIMARY KEY(group_id, side, member_order),
  UNIQUE(mapping_id, side)
) STRICT`,
  manuscript_reimport_group_resolutions: `CREATE TABLE manuscript_reimport_group_resolutions (
  group_id TEXT PRIMARY KEY REFERENCES manuscript_reimport_groups(group_id) ON DELETE CASCADE,
  comparison_id TEXT NOT NULL REFERENCES manuscript_reimport_comparisons(comparison_id) ON DELETE CASCADE,
  verb TEXT NOT NULL CHECK(verb IN ('split', 'rewrite', 'delete', 'merge')),
  resolved_at TEXT NOT NULL
) STRICT`,
  manuscript_reimport_mark_outcomes: `CREATE TABLE manuscript_reimport_mark_outcomes (
  reimport_record_id TEXT NOT NULL REFERENCES manuscript_reimport_records(reimport_record_id),
  mark_id TEXT NOT NULL REFERENCES editorial_marks(mark_id),
  group_ordinal INTEGER NOT NULL CHECK(group_ordinal >= 1),
  outcome TEXT NOT NULL CHECK(outcome IN ('followed', 'unfollowed')),
  kind TEXT NOT NULL CHECK(kind IN ('change-suggestion', 'annotation', 'editor-note', 'personal-highlight')),
  words TEXT NOT NULL,
  from_position INTEGER NOT NULL CHECK(from_position >= 1),
  to_block_id TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(reimport_record_id, mark_id),
  CHECK((outcome = 'followed') = (to_block_id IS NOT NULL))
) STRICT`,
} as const;

/** The foreign keys of the five relations, in the exact-schema validator's own spelling. */
export const REIMPORT_GROUP_FOREIGN_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  manuscript_reimport_group_sets: ['comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/CASCADE/NONE'],
  manuscript_reimport_groups: ['comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/CASCADE/NONE'],
  manuscript_reimport_group_members: [
    'group_id>manuscript_reimport_groups.group_id:NO ACTION/CASCADE/NONE',
    'mapping_id>manuscript_reimport_mappings.mapping_id:NO ACTION/CASCADE/NONE',
  ],
  manuscript_reimport_group_resolutions: [
    'group_id>manuscript_reimport_groups.group_id:NO ACTION/CASCADE/NONE',
    'comparison_id>manuscript_reimport_comparisons.comparison_id:NO ACTION/CASCADE/NONE',
  ],
  manuscript_reimport_mark_outcomes: [
    'reimport_record_id>manuscript_reimport_records.reimport_record_id:NO ACTION/NO ACTION/NONE',
    'mark_id>editorial_marks.mark_id:NO ACTION/NO ACTION/NONE',
  ],
};

export class ReimportGroupSchemaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReimportGroupSchemaError';
  }
}

/**
 * Revision 36's relations, created once and never rebuilt: a store that predates them gains five empty relations and
 * nothing existing moves. A comparison it already holds has no group set, so its review is prepared again when it is
 * next read. Shape-detected, and run before the version is stamped in `task-authorization.ts`.
 */
export function initializeReimportGroupSchema(db: DatabaseSync): void {
  const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'manuscript_reimport_group_sets'").get();
  if (existing !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(REIMPORT_GROUP_SCHEMA_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Reimport group schema rollback failed.');
    }
    throw error;
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new ReimportGroupSchemaError('SCHEMA_INVALID', '重新导入章节对应的关系与已有记录不一致。');
  }
}
