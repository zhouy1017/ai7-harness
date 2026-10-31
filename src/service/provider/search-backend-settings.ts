import type { FrozenWebToolsFallback, SearchBackendCandidateProjection, SearchBackendConnectionProjection, SearchBackendSettingsProjection, SearchCandidateId } from '../../shared/protocol.js';
import type { SearchFallbackTerms } from '../launch-policy.js';
import { SEARCH_BACKENDS, SEARCH_BACKEND_CANDIDATES, type SearchBackendCandidate } from './search-backends.js';
import { searchBackend, searchBackendCandidateConfigurationDigest, searchBackendConfigurationDigest } from './search-backends/index.js';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { StoreError } from '../store-records.js';
import { SEARCH_BACKEND_FALLBACK_SQL, SEARCH_FALLBACK_SCHEMA_VERSION } from '../task-authorization.js';

/** A plain price line: a token-billed backend shows its measured cost per call, never the vendor's English basis. */
function priceLine(price: { readonly amount: number | null; readonly currency: string; readonly per: number }, measuredUsd: number | null): string {
  if (price.amount === null) return measuredUsd === null ? '按 token 计费' : `按 token 计费，实测约 USD ${measuredUsd.toFixed(4)} / 次`;
  return price.amount === 0 ? '免费' : `${price.currency} ${price.amount} / ${price.per === 1 ? '' : `${price.per} `}次`;
}

/**
 * The candidate's disclosure (Issue #1055; Commander decision 2026-10-29): 未实测, not selectable, what the one connection test
 * sends, and the vendor's billing terms as read — with no free-tier assumption for a direct call.
 */
function candidateProjection(candidate: SearchBackendCandidate): SearchBackendCandidateProjection {
  const args = candidate.search.probeArguments;
  const readOn = candidate.priceSource.readOn ?? '未记录日期';
  return {
    backendId: candidate.backendId, candidateId: candidate.candidateId as SearchCandidateId, revision: candidate.revision, name: candidate.displayName,
    measurement: 'not-measured', endpoint: candidate.search.endpoint, protocol: candidate.search.protocol,
    configurationDigest: searchBackendCandidateConfigurationDigest(candidate.backendId, candidate.candidateId),
    capabilities: { search: true, fetch: true }, selectable: false, price: priceLine(candidate.price, null),
    disclosure: [
      '未实测：AI7 尚未测量这一接口的命中率、延迟与可达性；它不能用于任务，也不能设为默认后端或备用来源。',
      `声明的能力：搜索（${new URL(candidate.search.endpoint).pathname}）与取回（${new URL(candidate.fetch.endpoint).pathname}）；本版本只开放下面的连接测试。`,
      `连接测试只发送一条固定的公开查询“${args.query}”（count ${args.count}，不取正文），不发送书稿或任何书籍材料；使用本页已保存的 DeepSeek 服务端搜索（官方）密钥。`,
      `计费（DeepSeek 官方指南，${readOn} 读取）：成功的搜索或取回请求每 1,000 次 USD 0.75；空结果、失败与超时不计费。指南所说的免费期只覆盖经 DeepSeek Harness、Claude Code 或 Codex 的服务端工具调用（至北京时间 2026-11-01 00:00），不承诺直连调用免费。`,
      '测试结果只在本页显示，不保存；离开设置或重启 AI7 后清除。',
    ],
  };
}

/** The editor's search-backend connections, one row per shipped backend (revision 74). */
export function readSearchBackendConnections(db: DatabaseSync): SearchBackendConnectionProjection[] {
  return (db.prepare('SELECT * FROM search_backend_connections').all() as Array<Record<string, SQLOutputValue>>).map((row) => ({
    backendId: String(row.backend_id), credentialReference: row.credential_reference === null ? null : String(row.credential_reference),
    credentialOperationState: String(row.credential_operation_state) as SearchBackendConnectionProjection['credentialOperationState'],
    selected: row.selected === 1, selectedAt: String(row.selected_at),
  }));
}

/** Revision 104 (Issue #1226): the one 备用来源 row; an existing table is checked, never rebuilt; it starts empty. */
export function initializeSearchFallbackSchema(db: DatabaseSync): void {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'search_backend_fallback'").get();
  const fold = (sql: string): string => sql.trim().replace(/\s+/gu, ' ');
  if (row !== undefined) {
    if (fold(String(row.sql)) !== fold(SEARCH_BACKEND_FALLBACK_SQL)) throw new StoreError('SCHEMA_INVALID', '联网检索备用来源表结构不兼容。');
    return;
  }
  if (Number(db.prepare('PRAGMA user_version').get()?.user_version) >= SEARCH_FALLBACK_SCHEMA_VERSION) throw new StoreError('SCHEMA_INVALID', '联网检索备用来源表缺失。');
  db.exec(SEARCH_BACKEND_FALLBACK_SQL);
}

/** The editor's 备用来源, or `null` when none is chosen. */
export function readSearchFallback(db: DatabaseSync): { readonly backendId: string; readonly selectedAt: string } | null {
  const row = db.prepare('SELECT backend_id, selected_at FROM search_backend_fallback WHERE singleton = 1').get();
  return row === undefined ? null : { backendId: String(row.backend_id), selectedAt: String(row.selected_at) };
}

/**
 * Choose or clear the 备用来源 (Issue #1226): at most one, among the shipped ranked backends whose key is saved, never the default
 * itself; the direct-search candidate is not a backend here and is refused at the frame. Clearing removes the one row.
 */
export function writeSearchFallback(db: DatabaseSync, backendId: string | null): void {
  if (backendId === null) { db.prepare('DELETE FROM search_backend_fallback').run(); return; }
  const connection = readSearchBackendConnections(db).find((row) => row.backendId === backendId);
  if (!SEARCH_BACKENDS.some((entry) => entry.shipped && entry.id === backendId) || connection === undefined) throw new StoreError('SEARCH_BACKEND_NOT_SHIPPED', '该联网检索后端未提供。');
  if (connection.selected) throw new StoreError('SEARCH_FALLBACK_IS_DEFAULT', '默认后端不能同时作为备用来源。');
  if (connection.credentialOperationState !== 'ready' || connection.credentialReference === null) throw new StoreError('SEARCH_CREDENTIAL_MISSING', '请先保存该后端的密钥，再设为备用来源。');
  db.prepare('INSERT INTO search_backend_fallback(singleton, backend_id, selected_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET backend_id = excluded.backend_id, selected_at = excluded.selected_at')
    .run(backendId, new Date().toISOString());
}

/**
 * What a Plan freezes beside its default backend (Issue #1226): the chosen 备用来源 only when the selected policy's verified terms
 * admit it (v32), it is not the default, and its key is saved; otherwise nothing, so a v31-era or fallback-free Plan keeps its bytes.
 */
export function freezeSearchFallback(db: DatabaseSync, terms: SearchFallbackTerms | null, primaryBackendId: string): FrozenWebToolsFallback | undefined {
  const fallback = terms === null ? null : readSearchFallback(db);
  if (fallback === null || fallback.backendId === primaryBackendId || !terms!.eligibleBackendIds.includes(fallback.backendId)) return undefined;
  const connection = readSearchBackendConnections(db).find((row) => row.backendId === fallback.backendId);
  if (connection?.credentialOperationState !== 'ready' || connection.credentialReference === null) return undefined;
  return { backendId: fallback.backendId, host: searchBackend(fallback.backendId).declaration.host!, configurationDigest: searchBackendConfigurationDigest(fallback.backendId),
    credentialReference: connection.credentialReference, selectedAt: fallback.selectedAt };
}

/** 设置 › 模型服务 › 联网检索: the shipped backends in rank order with the editor's connections, then the declared candidates. */
export function searchBackendSettingsProjection(connections: readonly SearchBackendConnectionProjection[], fallback: { readonly backendId: string } | null = null): SearchBackendSettingsProjection {
  return { selectedBackendId: connections.find((row) => row.selected)!.backendId, fallbackBackendId: fallback?.backendId ?? null,
    backends: SEARCH_BACKENDS.filter((entry) => entry.shipped).map((entry) => ({
      backendId: entry.id, name: entry.displayName, rank: entry.rank!, host: entry.host!,
      reachable: entry.profile?.verdict === 'measured', p50Ms: entry.profile?.latencyMs.p50 ?? null,
      price: priceLine(entry.price, entry.profile?.costPerCallUsd ?? null),
      keyRequired: entry.keyRequired,
      chineseHitRate: entry.profile === null || entry.profile.totals.chinese === 0 ? 0 : entry.profile.hits.chinese / entry.profile.totals.chinese,
      internationalHitRate: entry.profile === null || entry.profile.totals.international === 0 ? 0 : entry.profile.hits.international / entry.profile.totals.international,
      note: [entry.id === 'search-tinyfish' ? '提供方限速：30 次/分钟、500 次/小时；另一页面标示每日 12,000 次。' : entry.id === 'search-brave' ? '测量时出现间歇性连接失败。' : entry.profile?.note ?? null,
        // #884: a price whose vendor source was not retained is shown only with that caveat.
        entry.priceSource.verified ? null : '单价来源未经核实：这是评估时记录的历史标价，以服务商当前价格页为准。',
      ].filter((line): line is string => line !== null).join(' ') || null,
      connection: connections.find((row) => row.backendId === entry.id)!,
    })),
    candidates: SEARCH_BACKEND_CANDIDATES.map(candidateProjection),
  };
}
