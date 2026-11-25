import { appendOnly } from '../append-only.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { GlobalAgentSourceCandidate, GlobalEditorialMemoryVersion, EditorialMemoryVersion, LegacyEditorialMemoryVersion, GlobalMemoryItem, GlobalMemoryPin, HouseReviewPreferenceVersion, LearningSupervisionDirective, RecordLearningSupervisionInput, ReviewPreferenceRow, StoredLearningSupervisionInput, TrustedOperationalScope } from '../../shared/protocol.js';
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
export const SUPERVISION_TRIGGER_SQL: Readonly<Record<string, string>> = appendOnly({
  learning_supervision_directives: 'LEARNING_SUPERVISION_IMMUTABLE',
});

/**
 * The F-05 owner (Issue #1082) keeps examples, eligibility and version writes; this seam reads its memory versions by their
 * own shape and never their manuscript references. Declared only: F-06 part 2 wires it together with the tools (#1025).
 */
export type EditorialMemoryGovernanceRevision = Pick<GlobalEditorialMemoryVersion,
  'itemId' | 'versionId' | 'title' | 'editorialDimension' | 'signalIds' | 'supervisionDirectiveRefs'> & (
  Pick<EditorialMemoryVersion, 'schema' | 'state' | 'applicability' | 'parentVersions'> |
  Pick<LegacyEditorialMemoryVersion, 'schema' | 'activation'>);
export function editorialMemoryGovernanceItem(
  entry: { readonly current: EditorialMemoryGovernanceRevision; readonly usable: boolean }, categoryId: string,
): GlobalMemoryItem {
  return { itemId: entry.current.itemId, revisionId: entry.current.versionId, kind: 'memory', text: entry.current.title,
    categoryId, bookId: entry.current.schema === 'ai7.global-editorial-memory/2' && entry.current.applicability.kind === 'book' ? entry.current.applicability.bookId : null,
    // A retired entry is never listed (Issue #1655), so it never becomes an item.
    state: entry.current.schema === 'ai7.global-editorial-memory/2' ? entry.current.state as GlobalMemoryItem['state']
      : entry.usable && entry.current.activation === 'active' ? 'active' : 'inactive',
    lineage: entry.current.schema === 'ai7.global-editorial-memory/2' ? entry.current.parentVersions.map((pin) => ({ itemId: pin.itemId, revisionId: pin.versionId })) : [] };
}

/** Explicit directions are selectable data for the next question; listing one neither runs nor changes curation. */
export function supervisionSourceCandidates(directives: ReadonlyArray<LearningSupervisionDirective>): GlobalAgentSourceCandidate[] {
  const head = directives.at(-1)?.directiveId ?? 'base';
  return directives.filter((entry) => entry.operation === 'supervise' && entry.effect === 'guide' && entry.text.length > 0)
    .map((entry) => ({ itemId: `supervision:${entry.directiveId}`, revisionId: `${entry.directiveId}@${head}`,
      kind: 'supervision', title: `学习方向 ${entry.ordinal}`, text: entry.text }));
}

function valid(condition: unknown, code = 'LEARNING_SUPERVISION_INVALID'): asserts condition {
  if (!condition) throw new LearningEligibilityError(code, code === 'LEARNING_SUPERVISION_STALE'
    ? '这条审阅偏好刚在别处改过，请重新查看后再操作。' : '学习监督指令或记忆记录无效。');
}

/** 重新启用 / 删除's refusals (Issue #1655): the page shows the sentence and reads again. */
const REVIEW_PREFERENCE_REFUSALS = {
  CHANGED: '这条审阅偏好刚在别处改过，已重新读取。',
  ALREADY_REENABLED: '这条审阅偏好已经重新启用了。',
  DELETED: '这条审阅偏好已经删除了。',
  MERGED: '这条审阅偏好已并入另一条，不能单独重新启用。',
  MATERIAL_STOPPED: '这条审阅偏好依据的学习材料已停止今后使用，不能重新启用。',
} as const;
export function refuseReviewPreference(reason: keyof typeof REVIEW_PREFERENCE_REFUSALS): never {
  throw new LearningEligibilityError(`REVIEW_PREFERENCE_${reason}`, REVIEW_PREFERENCE_REFUSALS[reason]);
}
/** What a disabled row says about 重新启用. */
export const REVIEW_PREFERENCE_REENABLE_SENTENCES: Readonly<Record<NonNullable<ReviewPreferenceRow['reenable']>['standing'], string>> = {
  allowed: '可以重新启用，恢复到停用前的样子。',
  merged: '已并入另一条，不能单独重新启用。',
  'material-stopped': '依据的学习材料已停止今后使用，不能重新启用。',
};

/**
 * One check for a request, an AI 助手 proposal and a stored record. Only a stored record (`stored`) may hold 重新启用 / 删除 of one
 * line, which their own requests write (Issue #1655); a request or proposal naming them is refused.
 */
export function validSupervisionInput(value: unknown, stored: true): value is StoredLearningSupervisionInput;
export function validSupervisionInput(value: unknown, stored?: false): value is RecordLearningSupervisionInput;
export function validSupervisionInput(value: unknown, stored = false): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as StoredLearningSupervisionInput;
  if (input.actionId !== undefined && !UUID_PATTERN.test(input.actionId)) return false;
  const lifecycle = input.operation === 'reactivate' || input.operation === 'retire';
  if (lifecycle && !(stored && input.actionId !== undefined && Array.isArray(input.targets) && input.targets.length === 1 && input.text === '' && input.effect === 'guide')) return false;
  if (![...['create', 'merge', 'correct', 'deactivate', 'supervise'], ...(stored ? ['reactivate', 'retire'] : [])].includes(input.operation) ||
      !['guide', 'freeze', 'correct'].includes(input.effect) || typeof input.text !== 'string' || !input.text.isWellFormed() ||
      [...input.text.trim()].length > 1_200 || typeof input.categoryId !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/u.test(input.categoryId) ||
      !Array.isArray(input.targets) || input.targets.length > 12 || input.targets.some((pin) => pin === null || typeof pin !== 'object' ||
        Object.keys(pin).sort().join(',') !== 'itemId,revisionId' || typeof pin.itemId !== 'string' || pin.itemId.length === 0 || pin.itemId.length > 180 ||
        typeof pin.revisionId !== 'string' || pin.revisionId.length === 0 || pin.revisionId.length > 180) ||
      new Set(input.targets.map((pin) => pin.itemId)).size !== input.targets.length) return false;
  const scope = input.scope;
  if (scope === null || typeof scope !== 'object' || !(
    scope.kind === 'house' && Object.keys(scope).length === 1 || scope.kind === 'book' && Object.keys(scope).sort().join(',') === 'bookId,kind' && UUID_PATTERN.test(scope.bookId) ||
    scope.kind === 'category' && Object.keys(scope).sort().join(',') === 'categoryId,kind' && /^[a-z][a-z0-9-]{0,47}$/u.test(scope.categoryId))) return false;
  if (scope.kind === 'category' && scope.categoryId !== input.categoryId) return false;
  if (input.operation !== 'deactivate' && !lifecycle && input.text.trim().length === 0) return false;
  if (input.operation === 'create' && input.targets.length !== 0) return false;
  if (input.operation === 'merge' && input.targets.length < 2) return false;
  if ((input.operation === 'correct' || input.operation === 'deactivate') && input.targets.length !== 1) return false;
  return input.operation !== 'supervise' || input.effect === 'guide' || input.targets.length > 0;
}

export class SupervisionDirectives {
  #hasMemoryItem(itemId: string): boolean {
    return this.db.prepare('SELECT 1 FROM global_editorial_memory_items WHERE item_id = ?').get(itemId) !== undefined;
  }
  memoryTargets(targets: readonly GlobalMemoryPin[]): GlobalMemoryPin[] { return targets.filter(pin => this.#hasMemoryItem(pin.itemId)); }
  legacyDirectives(directives: readonly LearningSupervisionDirective[]): LearningSupervisionDirective[] {
    return directives.filter(directive => !directive.targets.some(pin => this.#hasMemoryItem(pin.itemId)));
  }
  constructor(readonly db: DatabaseSync) {}

  history(scope: TrustedOperationalScope): LearningSupervisionDirective[] {
    let previous: string | null = null;
    let ordinal = 0;
    return this.db.prepare('SELECT * FROM learning_supervision_directives WHERE operational_scope = ? ORDER BY ordinal').all(scope).map((row) => {
      const json = String(row.canonical_json);
      const record = JSON.parse(json) as LearningSupervisionDirective;
      valid(record.schema === 'ai7.learning-supervision-directive/1' && record.actor === 'editor' && sha256Hex(json) === row.sha256 && canonicalJson(record) === json && validSupervisionInput(record, true) &&
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

  /** `lifecycle` only for 重新启用 / 删除's own requests (Issue #1655), which alone may write those operations. */
  record(scope: TrustedOperationalScope, input: StoredLearningSupervisionInput, items: ReadonlyArray<GlobalMemoryItem>, now = new Date(), lifecycle = false): LearningSupervisionDirective {
    valid(lifecycle ? validSupervisionInput(input, true) && (input.operation === 'reactivate' || input.operation === 'retire') : validSupervisionInput(input));
    valid(Object.keys(input).sort().join(',') === ['operation', 'targets', 'scope', 'text', 'categoryId', 'effect',
      ...(input.actionId === undefined ? [] : ['actionId'])].sort().join(','));
    if (input.actionId !== undefined) {
      const prior = this.history(scope).find((entry) => entry.actionId === input.actionId);
      if (prior !== undefined) {
        const { schema: _schema, actor: _actor, directiveId: _id, ordinal: _ordinal, supersedes: _supersedes,
          operationalScope: _scope, recordedAt: _at, ...original } = prior;
        valid(canonicalJson(original) === canonicalJson(input)); return prior;
      }
    }
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
      ...input, schema: 'ai7.learning-supervision-directive/1', actor: 'editor', text: input.actionId === undefined ? input.text.trim() : input.text, targets: input.targets.map((pin) => ({ itemId: pin.itemId, revisionId: pin.revisionId })),
      directiveId: randomUUID(), ordinal: (prior?.ordinal ?? 0) + 1, supersedes: prior?.directiveId ?? null,
      operationalScope: scope, recordedAt: now.toISOString(),
    };
    const json = canonicalJson(record);
    this.db.prepare('INSERT INTO learning_supervision_directives VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(record.directiveId, scope, record.ordinal, record.supersedes, record.recordedAt, json, sha256Hex(json));
    return record;
  }
}

/**
 * A derived line is named by its group — the house or one Book, and one category — not by its words: a later decision or a
 * 停止今后使用 rereads the group's tendency, and the 停用, 冻结 or 修正 recorded on it must still reach the reread line.
 */
export function preferenceItems(version: Pick<HouseReviewPreferenceVersion, 'lines' | 'versionId'> | null): GlobalMemoryItem[] {
  return version === null ? [] : version.lines.filter((line) => line.owner?.kind !== 'editorial-memory').map((line) => ({
    itemId: line.owner?.itemId ?? `preference:${line.bookId ?? 'house'}:${line.categoryId}`, revisionId: version.versionId,
    kind: 'preference', text: line.text, categoryId: line.categoryId, bookId: line.bookId, state: 'active', lineage: [],
  }));
}

/** One preference line as the replay leaves it, with what 审阅偏好's row and 重新启用 / 删除 read of it (Issue #1655). */
export interface GovernedPreference {
  item: GlobalMemoryItem;
  /** 删除: absent from every list, kept here so a merged line's lineage still resolves. */
  retired: boolean;
  /** Stopped by a merge, or replaced by an AI 助手 correction: never 重新启用-ed alone. */
  merged: boolean;
  /** The line just before its latest 停用 or 冻结, which 重新启用 restores. */
  before: GlobalMemoryItem | null;
  /** `ai` for a group's derived line (also once corrected), `editor` for a line a directive created. */
  origin: 'editor' | 'ai';
  last: LearningSupervisionDirective | null;
}

/**
 * Replay explicit changes over the current eligible preference version. Old derived versions remain untouched. A derived line's
 * snapshot is the current base line itself, so 重新启用 brings it back derived, with the group's words of today.
 */
export function governedPreferences(base: ReadonlyArray<GlobalMemoryItem>, directives: ReadonlyArray<LearningSupervisionDirective>): Map<string, GovernedPreference> {
  const entries = new Map(base.map((item): [string, GovernedPreference] => [item.itemId, { item, retired: false, merged: false, before: null, origin: 'ai', last: null }]));
  for (const directive of directives) {
    const affected = directive.targets.map((pin) => entries.get(pin.itemId)).filter((entry): entry is GovernedPreference => entry !== undefined && !entry.retired);
    for (const entry of affected) entry.last = directive;
    if (directive.operation === 'reactivate' || directive.operation === 'retire') {
      for (const entry of affected) {
        if (directive.operation === 'retire') entry.retired = true;
        else if (entry.before !== null) Object.assign(entry, { item: entry.before, before: null, merged: false });
      }
      continue;
    }
    const changesText = directive.operation === 'create' || directive.operation === 'merge' || directive.operation === 'correct' ||
      directive.operation === 'supervise' && directive.effect === 'correct';
    const stops = directive.operation === 'deactivate' || directive.operation === 'merge' || directive.operation === 'correct' ||
      directive.operation === 'supervise' && directive.effect !== 'guide';
    const replaces = directive.operation === 'merge' || directive.operation === 'supervise' && directive.effect === 'correct';
    if (stops) for (const entry of affected) {
      if (replaces) entry.merged = true;
      else if (entry.item.state === 'active' && directive.operation !== 'correct') entry.before = entry.item;
      entry.item = { ...entry.item, revisionId: directive.directiveId,
        state: directive.operation === 'supervise' && directive.effect === 'freeze' ? 'frozen' : 'inactive' };
    }
    if (changesText) {
      // A vanished source (exclusion/remediation) never comes back as an editor correction without its source.
      if (directive.targets.length > 0 && affected.length !== directive.targets.length) continue;
      const bookId = directive.scope.kind === 'book' ? directive.scope.bookId : null;
      const itemId = directive.operation === 'correct' && affected.length === 1 ? affected[0]!.item.itemId : directive.directiveId;
      const item: GlobalMemoryItem = { itemId, revisionId: directive.directiveId, kind: 'preference', text: directive.text,
        categoryId: directive.categoryId, bookId, state: 'active', lineage: directive.targets };
      const entry = entries.get(itemId);
      if (entry === undefined) entries.set(itemId, { item, retired: false, merged: false, before: null, origin: 'editor', last: directive });
      else Object.assign(entry, { item, merged: false, before: null, last: directive });
    }
  }
  return entries;
}

export function governedMemoryItems(base: ReadonlyArray<GlobalMemoryItem>, directives: ReadonlyArray<LearningSupervisionDirective>): GlobalMemoryItem[] {
  return [...governedPreferences(base, directives).values()].filter((entry) => !entry.retired).map((entry) => entry.item);
}

/** 审阅偏好's row of one preference line: its own revision is its pin, so another line's directive never makes it stale. */
// A line no directive touched is a derived one, so the version it is read from exists.
export function preferenceRow(entry: GovernedPreference, derivedAt: string | undefined): ReviewPreferenceRow {
  const disabled = entry.item.state !== 'active';
  const standing = entry.merged ? 'merged' as const : 'allowed' as const;
  return { group: disabled ? 'disabled' : 'enabled', changedAt: (entry.last?.recordedAt ?? derivedAt)!, origin: entry.origin,
    reenable: disabled ? { standing, sentence: REVIEW_PREFERENCE_REENABLE_SENTENCES[standing] } : null, pin: entry.item.revisionId, pausedInUse: false };
}
