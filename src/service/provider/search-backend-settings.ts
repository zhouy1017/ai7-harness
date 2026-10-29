import type { SearchBackendCandidateProjection, SearchBackendConnectionProjection, SearchBackendSettingsProjection, SearchCandidateId } from '../../shared/protocol.js';
import { SEARCH_BACKENDS, SEARCH_BACKEND_CANDIDATES, type SearchBackendCandidate } from './search-backends.js';
import { searchBackendCandidateConfigurationDigest } from './search-backends/index.js';

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
      '未实测：AI7 尚未测量这一接口的命中率、延迟与可达性；它不能用于任务，也不能设为默认后端。',
      `声明的能力：搜索（${new URL(candidate.search.endpoint).pathname}）与取回（${new URL(candidate.fetch.endpoint).pathname}）；本版本只开放下面的连接测试。`,
      `连接测试只发送一条固定的公开查询“${args.query}”（count ${args.count}，不取正文），不发送书稿或任何书籍材料；使用本页已保存的 DeepSeek 服务端搜索（官方）密钥。`,
      `计费（DeepSeek 官方指南，${readOn} 读取）：成功的搜索或取回请求每 1,000 次 USD 0.75；空结果、失败与超时不计费。指南所说的免费期只覆盖经 DeepSeek Harness、Claude Code 或 Codex 的服务端工具调用（至北京时间 2026-11-01 00:00），不承诺直连调用免费。`,
      '测试结果只在本页显示，不保存；离开设置或重启 AI7 后清除。',
    ],
  };
}

/** 设置 › 模型服务 › 联网检索: the shipped backends in rank order with the editor's connections, then the declared candidates. */
export function searchBackendSettingsProjection(connections: readonly SearchBackendConnectionProjection[]): SearchBackendSettingsProjection {
  return { selectedBackendId: connections.find((row) => row.selected)!.backendId,
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
