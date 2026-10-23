import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { GlobalMemoryItem, GlobalMemoryPin, HouseReviewPreferenceVersion, LearningSupervisionDirective, RecordLearningSupervisionInput, TrustedOperationalScope } from '../../shared/protocol.js';
import { canonicalJson, sha256Hex, UUID_PATTERN } from '../analysis/canonical.js';
import { LearningEligibilityError } from '../learning-eligibility.js';

/** Editor actions only. This ledger holds governance and lineage, never dialogue messages. */
export const SUPERVISION_SCHEMA_SQL = {
  learning_supervision_directives: `CREATE TABLE learning_supervision_directives (
  directive_id TEXT PRIMARY KEY CHECK(length(directive_id) = 36),
  operational_scope TEXT NOT NULL CHECK(operational_scope IN ('development-ci', 'developer-live', 'ordinary-production')),
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  supersedes TEXT REFERENCES learning_supervision_directives(directive_id),
  recorded_at TEXT NOT NULL,
  canonical_json TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256) = 64),
  UNIQUE(operational_scope, ordinal)
) STRICT`,
} as const;
export const SUPERVISION_TRIGGER_SQL: Readonly<Record<string, string>> = Object.fromEntries(['update', 'delete'].map((op) => [
  `learning_supervision_directives_no_${op}`, `CREATE TRIGGER learning_supervision_directives_no_${op}
  BEFORE ${op.toUpperCase()} ON learning_supervision_directives
  BEGIN SELECT RAISE(ABORT, 'LEARNING_SUPERVISION_IMMUTABLE'); END`,
]));
export const SUPERVISION_FOREIGN_KEYS = {
  learning_supervision_directives: ['supersedes>learning_supervision_directives.directive_id:NO ACTION/NO ACTION/NONE'],
};

/** The F-05 owner keeps examples, eligibility and version writes. This seam never reads their manuscript references. */
export interface EditorialMemoryGovernanceRevision {
  readonly itemId: string;
  readonly versionId: string;
  readonly title: string;
  readonly editorialDimension: string;
  readonly activation: 'active' | 'inactive';
  readonly signalIds: ReadonlyArray<string>;
  readonly supervisionDirectiveRefs: ReadonlyArray<string>;
}
export interface EditorialMemoryGovernanceHooks {
  /** Must page EditorialLearningLedger.inspect and use its current `usable` decision, including exclusions. */
  revisions(): ReadonlyArray<{ readonly current: EditorialMemoryGovernanceRevision; readonly usable: boolean }>;
  /** Must append through global_editorial_memory_item_versions, retain signal lineage and add the directive reference. */
  govern(directive: LearningSupervisionDirective, expected: ReadonlyArray<GlobalMemoryPin>): void;
}
export function editorialMemoryGovernanceItem(
  entry: { readonly current: EditorialMemoryGovernanceRevision; readonly usable: boolean }, categoryId: string,
): GlobalMemoryItem {
  return { itemId: entry.current.itemId, revisionId: entry.current.versionId, kind: 'memory', text: entry.current.title,
    categoryId, bookId: null, state: entry.usable && entry.current.activation === 'active' ? 'active' : 'inactive', lineage: [] };
}

function valid(condition: unknown, code = 'LEARNING_SUPERVISION_INVALID'): asserts condition {
  if (!condition) throw new LearningEligibilityError(code, code === 'LEARNING_SUPERVISION_STALE'
    ? '记忆版本已经变化，请重新查看后再操作。' : '学习监督指令或记忆记录无效。');
}
export function initializeSupervisionSchema(db: DatabaseSync, version: number): void {
  if (version >= 87 || db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'learning_supervision_directives'").get() !== undefined) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const sql of Object.values(SUPERVISION_SCHEMA_SQL)) db.exec(sql);
    for (const sql of Object.values(SUPERVISION_TRIGGER_SQL)) db.exec(sql);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function validSupervisionInput(value: unknown): value is RecordLearningSupervisionInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as RecordLearningSupervisionInput;
  if (!['create', 'merge', 'correct', 'deactivate', 'supervise'].includes(input.operation) ||
      !['guide', 'freeze', 'correct'].includes(input.effect) || typeof input.text !== 'string' || !input.text.isWellFormed() ||
      [...input.text.trim()].length > 200 || typeof input.categoryId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/u.test(input.categoryId) ||
      !Array.isArray(input.targets) || input.targets.length > 12 || input.targets.some((pin) => pin === null || typeof pin !== 'object' ||
        Object.keys(pin).sort().join(',') !== 'itemId,revisionId' || typeof pin.itemId !== 'string' || pin.itemId.length === 0 || pin.itemId.length > 180 ||
        typeof pin.revisionId !== 'string' || pin.revisionId.length === 0 || pin.revisionId.length > 180) ||
      new Set(input.targets.map((pin) => pin.itemId)).size !== input.targets.length) return false;
  const scope = input.scope;
  if (scope === null || typeof scope !== 'object' || !(
    scope.kind === 'house' && Object.keys(scope).length === 1 || scope.kind === 'book' && Object.keys(scope).sort().join(',') === 'bookId,kind' && UUID_PATTERN.test(scope.bookId) ||
    scope.kind === 'category' && Object.keys(scope).sort().join(',') === 'categoryId,kind' && /^[a-z][a-z0-9-]{0,47}$/u.test(scope.categoryId))) return false;
  if (scope.kind === 'category' && scope.categoryId !== input.categoryId) return false;
  if (input.operation !== 'deactivate' && input.text.trim().length === 0) return false;
  if (input.operation === 'create' && input.targets.length !== 0) return false;
  if (input.operation === 'merge' && input.targets.length < 2) return false;
  if ((input.operation === 'correct' || input.operation === 'deactivate') && input.targets.length !== 1) return false;
  return input.operation !== 'supervise' || input.effect === 'guide' || input.targets.length > 0;
}

export class SupervisionDirectives {
  constructor(readonly db: DatabaseSync) {}

  history(scope: TrustedOperationalScope): LearningSupervisionDirective[] {
    let previous: string | null = null;
    let ordinal = 0;
    return this.db.prepare('SELECT * FROM learning_supervision_directives WHERE operational_scope = ? ORDER BY ordinal').all(scope).map((row) => {
      const json = String(row.canonical_json);
      const record = JSON.parse(json) as LearningSupervisionDirective;
      valid(record.schema === 'ai7.learning-supervision-directive/1' && record.actor === 'editor' && sha256Hex(json) === row.sha256 && canonicalJson(record) === json && validSupervisionInput(record) &&
        record.directiveId === row.directive_id && UUID_PATTERN.test(record.directiveId) && record.operationalScope === scope &&
        record.ordinal === ++ordinal && record.ordinal === row.ordinal && record.supersedes === previous &&
        record.supersedes === row.supersedes && record.recordedAt === row.recorded_at);
      previous = record.directiveId;
      return record;
    });
  }

  validate(): void {
    for (const scope of ['development-ci', 'developer-live', 'ordinary-production'] as const) this.history(scope);
  }

  record(scope: TrustedOperationalScope, input: RecordLearningSupervisionInput, items: ReadonlyArray<GlobalMemoryItem>, now = new Date()): LearningSupervisionDirective {
    valid(validSupervisionInput(input));
    for (const pin of input.targets) valid(items.some((item) => item.itemId === pin.itemId && item.revisionId === pin.revisionId), 'LEARNING_SUPERVISION_STALE');
    for (const pin of input.targets) {
      const target = items.find((item) => item.itemId === pin.itemId)!;
      if (input.scope.kind === 'category') valid(target.categoryId === input.scope.categoryId);
      if (input.scope.kind === 'book' && (input.operation !== 'supervise' || input.effect !== 'guide')) valid(target.bookId === input.scope.bookId);
    }
    if (input.operation === 'correct' || input.operation === 'merge' || input.operation === 'supervise' && input.effect === 'correct') {
      for (const pin of input.targets) {
        const target = items.find((item) => item.itemId === pin.itemId)!;
        valid(target.categoryId === input.categoryId && (target.bookId === null || input.scope.kind === 'book' && input.scope.bookId === target.bookId));
      }
    }
    const prior = this.history(scope).at(-1);
    const record: LearningSupervisionDirective = {
      ...input, schema: 'ai7.learning-supervision-directive/1', actor: 'editor', text: input.text.trim(), targets: input.targets.map((pin) => ({ itemId: pin.itemId, revisionId: pin.revisionId })),
      directiveId: randomUUID(), ordinal: (prior?.ordinal ?? 0) + 1, supersedes: prior?.directiveId ?? null,
      operationalScope: scope, recordedAt: now.toISOString(),
    };
    const json = canonicalJson(record);
    this.db.prepare('INSERT INTO learning_supervision_directives VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(record.directiveId, scope, record.ordinal, record.supersedes, record.recordedAt, json, sha256Hex(json));
    return record;
  }
}

export function preferenceItems(version: Pick<HouseReviewPreferenceVersion, 'lines' | 'versionId'> | null): GlobalMemoryItem[] {
  return version === null ? [] : version.lines.map((line) => ({
    itemId: `preference:${sha256Hex(canonicalJson(line))}`, revisionId: version.versionId,
    kind: 'preference', text: line.text, categoryId: line.categoryId, bookId: line.bookId, state: 'active', lineage: [],
  }));
}

/** Replay explicit changes over the current eligible preference version. Old derived versions remain untouched. */
export function governedMemoryItems(base: ReadonlyArray<GlobalMemoryItem>, directives: ReadonlyArray<LearningSupervisionDirective>): GlobalMemoryItem[] {
  const items = new Map(base.map((item) => [item.itemId, item]));
  for (const directive of directives) {
    const affected = directive.targets.map((pin) => items.get(pin.itemId)).filter((item): item is GlobalMemoryItem => item !== undefined);
    const changesText = directive.operation === 'create' || directive.operation === 'merge' || directive.operation === 'correct' ||
      directive.operation === 'supervise' && directive.effect === 'correct';
    const stops = directive.operation === 'deactivate' || directive.operation === 'merge' || directive.operation === 'correct' ||
      directive.operation === 'supervise' && directive.effect !== 'guide';
    if (stops) for (const item of affected) items.set(item.itemId, { ...item, revisionId: directive.directiveId,
      state: directive.operation === 'supervise' && directive.effect === 'freeze' ? 'frozen' : 'inactive' });
    if (changesText) {
      // A vanished source (exclusion/remediation) never comes back as an editor correction without its source.
      if (directive.targets.length > 0 && affected.length !== directive.targets.length) continue;
      const bookId = directive.scope.kind === 'book' ? directive.scope.bookId : null;
      const itemId = directive.operation === 'correct' && affected.length === 1 ? affected[0]!.itemId : directive.directiveId;
      items.set(itemId, { itemId, revisionId: directive.directiveId, kind: 'preference', text: directive.text,
        categoryId: directive.categoryId, bookId, state: 'active', lineage: directive.targets });
    }
  }
  return [...items.values()];
}

/** A supervision change invalidates every pinned version it reaches, including an already prepared Run. */
export function supervisionAffects(directives: ReadonlyArray<LearningSupervisionDirective>, bookId: string, categoryId: string): boolean {
  return directives.some((directive) => directive.scope.kind === 'house' ||
    directive.scope.kind === 'book' && directive.scope.bookId === bookId ||
    directive.scope.kind === 'category' && directive.scope.categoryId === categoryId);
}
