import type { DatabaseSync } from 'node:sqlite';
import type { KnowledgeProceduresProjection } from '../shared/protocol.js';
import { isRecord } from './analysis/canonical.js';
import type { EditorialWorkspaceProfileHouseReading } from './editorial-workspace-profile.js';
import { readPreinstalledProcedures } from './procedures/library.js';
import type { ReviewCategoryConfiguration } from './review/category-configuration.js';

/**
 * 知识库 › 工序与规则's expert 工序 (Issue #427, plan slice S79d; V2-UX-KB-010, REUSE-029, REUSE-030): since Issue #1081
 * (F-26a; ADR 0095 §1) the pre-installed procedure library — each version with its stages and how many approved runs it
 * served — and the native artifact AI7 carries in the house's words — 本社方案 vN — in the lifecycle its owner reads, with
 * how many Books enabled it and its identities for 查看技术详情. It is a read over the procedure versions, the Review Runs'
 * snapshots, the baseline Runs and the 方案's owner; it writes nothing.
 */

/** The house's word for the 编辑工作区方案 with its AI7 权限侧车 (editor-surfaces §10). */
export const HOUSE_PROFILE_TITLE = '本社方案';

export function readKnowledgeProcedures(
  db: DatabaseSync,
  configuration: ReviewCategoryConfiguration,
  profile: EditorialWorkspaceProfileHouseReading,
): KnowledgeProceduresProjection {
  // How many approved Review Runs applied each version of each 工序: every category entry a Run snapshotted names the 工序
  // and version it ran, and a Run only prepared, or superseded before its approval, applied none (Issue #427 review).
  // Historical procedure versions need no retained counters: this projection names only the current configuration.
  const applied = new Map(configuration.categories.map((entry) => [`${entry.procedure.procedureId}\n${entry.procedure.version}`, 0]));
  const runs = db.prepare(
    'SELECT r.canonical_json FROM review_runs r WHERE EXISTS (SELECT 1 FROM review_run_authorizations a WHERE a.review_run_id = r.review_run_id)',
  ).iterate();
  for (const row of runs) {
    const snapshot = JSON.parse(String(row.canonical_json)) as unknown;
    const seen = new Set<string>();
    for (const category of isRecord(snapshot) && Array.isArray(snapshot.categories) ? snapshot.categories : []) {
      const procedure = isRecord(category) && isRecord(category.entry) && isRecord(category.entry.procedure) ? category.entry.procedure : null;
      if (procedure === null || typeof procedure.procedureId !== 'string' || typeof procedure.version !== 'string') continue;
      const key = `${procedure.procedureId}\n${procedure.version}`;
      if (!applied.has(key) || seen.has(key)) continue;
      seen.add(key);
      applied.set(key, (applied.get(key) ?? 0) + 1);
    }
  }
  const reviewRuns = new Map(configuration.categories.map((entry) =>
    [entry.categoryId, applied.get(`${entry.procedure.procedureId}\n${entry.procedure.version}`) ?? 0]));
  return {
    preinstalled: readPreinstalledProcedures(db, reviewRuns),
    artifacts: [{
      title: HOUSE_PROFILE_TITLE,
      revision: profile.revision,
      state: profile.state,
      enabledBooks: profile.enabledBooks,
      technical: {
        artifactId: profile.identity,
        version: profile.version,
        sha256: profile.sha256,
        sidecarId: profile.sidecarIdentity,
        sidecarSha256: profile.sidecarSha256,
      },
    }],
  };
}
