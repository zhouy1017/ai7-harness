import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import type { KnowledgeProceduresProjection } from '../shared/protocol.js';
import { isRecord } from './analysis/canonical.js';
import type { ReviewCategoryConfiguration } from './review/category-configuration.js';

/**
 * 知识库 › 工序与规则's expert 工序 (Issue #427, plan slice S79d; V2-UX-KB-010, REUSE-029, REUSE-030): the 工序 the review
 * categories run, named by what each does, with its version, its state, the category it serves and how many Review Runs
 * applied it; and the native artifact AI7 carries, 编辑工作区方案, in its own lifecycle words — installed or not, and how many
 * Books enabled it. It is a read over the configuration and the Review Runs' snapshots; it writes nothing.
 */

type SqlRow = Record<string, SQLOutputValue>;

const TABLE_PRESENT = "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?";

function count(value: SQLOutputValue | undefined): number {
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

export function readKnowledgeProcedures(db: DatabaseSync, configuration: ReviewCategoryConfiguration): KnowledgeProceduresProjection {
  // How many Review Runs applied each 工序: every category entry a Run snapshotted names the 工序 it ran.
  const applied = new Map<string, number>();
  const runs = db.prepare('SELECT canonical_json FROM review_runs').all() as SqlRow[];
  for (const row of runs) {
    const snapshot = JSON.parse(String(row.canonical_json)) as unknown;
    const seen = new Set<string>();
    for (const category of isRecord(snapshot) && Array.isArray(snapshot.categories) ? snapshot.categories : []) {
      const procedure = isRecord(category) && isRecord(category.entry) && isRecord(category.entry.procedure) ? category.entry.procedure : null;
      if (procedure === null || typeof procedure.procedureId !== 'string' || seen.has(procedure.procedureId)) continue;
      seen.add(procedure.procedureId);
      applied.set(procedure.procedureId, (applied.get(procedure.procedureId) ?? 0) + 1);
    }
  }
  const procedures = configuration.categories.map((entry) => ({
    procedureId: entry.procedure.procedureId,
    title: entry.procedure.title,
    version: entry.procedure.version,
    categoryId: entry.categoryId,
    categoryLabel: entry.label,
    state: entry.executor === 'unavailable' ? 'unavailable' as const : 'enabled' as const,
    unavailableReason: entry.executor === 'unavailable' ? entry.unavailableReason : null,
    reviewRuns: applied.get(entry.procedure.procedureId) ?? 0,
  }));
  // The one native artifact: a store that never installed it holds no row, and an older store may lack the relations.
  const installed = db.prepare(TABLE_PRESENT).get('native_artifact_installations') !== undefined
    ? db.prepare('SELECT artifact_version FROM native_artifact_installations').get() as SqlRow | undefined
    : undefined;
  const enabledBooks = installed === undefined || db.prepare(TABLE_PRESENT).get('native_artifact_book_enablements') === undefined
    ? 0
    : count((db.prepare('SELECT COUNT(*) AS n FROM native_artifact_book_enablements').get() as SqlRow).n);
  return {
    procedures,
    artifacts: [{
      artifactId: '@ai7/editorial-workspace-profile',
      title: '编辑工作区方案',
      version: installed === undefined ? null : String(installed.artifact_version),
      state: installed === undefined ? 'not-installed' : 'installed',
      enabledBooks,
    }],
  };
}
