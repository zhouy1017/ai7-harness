import { join } from 'node:path';
import { BaselineAnalysisExecutionOwner, type ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { EditorialStore } from '../../src/service/store.js';
import { DEVELOPER_LIVE_POLICY_BINDING, resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { parseFactualReviewUnitMessageHeader } from '../../src/service/analysis/factual-review-contract.js';
import { parseAssuranceSamplingListedRefs } from '../../src/service/analysis/assurance-sampling-contract.js';
import { SEARCH_BACKENDS } from '../../src/service/provider/search-backends.js';
import { armPerTicketHostAdmission } from '../../src/shared/network-denial.js';
import { DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE } from '../../src/shared/protected-secret-identity.js';
import type { ServiceTestRoots } from './temp-data-root.js';

// Socket-free, public research responses shared by the store regression and guest source-row fixture.
armPerTicketHostAdmission();
const QUERY = 'public background fact for a provider-free retention regression';
const TINYFISH = SEARCH_BACKENDS.find((entry) => entry.id === 'search-tinyfish')!;
export const MUSEUM = 'https://museum.example.org/zun';
export const WIKI = 'https://wiki.example.net/zun';
export const ENGLISH = 'https://en.example.com/zun';
const PAGES: Record<string, { status: number; body: string }> = {
  [MUSEUM]: { status: 200, body: '<html><head><meta charset="utf-8"></head><body><h1>馆藏</h1><p>这件尊盘出土于1978年。它现藏湖北省博物馆，是馆藏重器。</p></body></html>' },
  [WIKI]: { status: 403, body: 'forbidden' },
  [ENGLISH]: { status: 200, body: '<html><body><p>The vessel was excavated in 1978. It is held by a provincial museum and shown to visitors.</p></body></html>' },
};


/** The located quotation the stub cites: eight characters of the first own block long enough to hold them once. */
function quoteFrom(unit: string): { quote: string; blockOrdinal: number } | null {
  const lines = unit.split('\n');
  const own = lines.findIndex((line) => line.startsWith('以下为本单元需要核查的内容块'));
  let ordinal = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\[blk_[0-9a-f]{24}\] \([a-z]+(?: h\d)?\) (.*)$/u.exec(lines[index]!);
    if (match === null) continue;
    ordinal += 1;
    if (index < own) continue;
    const text = [...match[1]!];
    for (let start = 0; start + 8 <= text.length; start += 4) {
      const quote = text.slice(start, start + 8).join('');
      if (quote.trim().length === 8 && match[1]!.indexOf(quote) === match[1]!.lastIndexOf(quote)) return { quote, blockOrdinal: ordinal };
    }
  }
  return null;
}


export interface ResearchFixtureOptions {
  failedModelFetch?: boolean; failRetentionOnce?: boolean; cancelDuringRetention?: boolean; failedSearch?: boolean;
  activeRun?: () => string;
}

export async function createResearchRunFixture(roots: Pick<ServiceTestRoots, 'codeRoot' | 'dataRoot' | 'inputRoot'>, requestGovernor: ModelRequestGovernor, options: ResearchFixtureOptions = {}) {
  let owner: BaselineAnalysisExecutionOwner;
  const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot, 'developer-live');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const launch = {
    operationalScope: 'developer-live' as const, policy,
    live: { ...DEVELOPER_LIVE_POLICY_BINDING, credentialReference: DEVELOPMENT_OPENCODE_GO_CREDENTIAL_REFERENCE, runBudgetCeiling: { kind: 'tokens' as const, maxTotalTokens: 500_000 } },
  };
  store.baselineAnalysisLedger.bindLaunch(launch);
  store.factualReviewLedger.bindLaunch(launch);
  const sends: { model: number; search: number; pages: string[] } = { model: 0, search: 0, pages: [] };
  const usage = { prompt_tokens: 40, completion_tokens: 20 };
  const answer = (message: Record<string, unknown>): Response => new Response(JSON.stringify({ model: DEVELOPER_LIVE_POLICY_BINDING.model,
    choices: [{ message: { reasoning_content: '合成推理通道。', ...message }, finish_reason: 'tool_calls' in message ? 'tool_calls' : 'stop' }], usage }), { status: 200 });
  const nativeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === TINYFISH.host) {
      sends.search += 1;
      if (options.failedSearch) return new Response('unavailable', { status: 503 });
      return new Response(JSON.stringify({ results: [
        { title: '馆藏', url: MUSEUM, snippet: '馆藏页。' },
        { title: '尊盘 - 维基百科', url: WIKI, snippet: '该器现藏于湖北省博物馆。' },
        { title: 'Vessel', url: ENGLISH, snippet: 'A vessel.' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const page = PAGES[url.href];
    if (page !== undefined) {
      sends.pages.push(url.href);
      if (options.cancelDuringRetention && url.href === ENGLISH) owner.cancelRun(options.activeRun!(), store.factualReviewLedger);
      return new Response(page.body, { status: page.status, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    sends.model += 1;
    const body = JSON.parse(String(init?.body)) as { tools?: unknown[]; messages: Array<{ role: string; content: string | null }> };
    const unit = body.messages.find((message) => message.role === 'user')!.content ?? '';
    const header = parseFactualReviewUnitMessageHeader(unit);
    const tools = body.messages.filter((message) => message.role === 'tool').length;
    if (header !== null) {
      // Unit 1 searches once and reads the museum's page; every other unit answers without its tools.
      if (header.ordinal === 1 && tools === 0) return answer({ content: null, tool_calls: [{ id: 'call_search', type: 'function', function: { name: 'websearch', arguments: JSON.stringify({ query: QUERY }) } }] });
      if (header.ordinal === 1 && tools === 1) return answer({ content: null, tool_calls: [{ id: 'call_fetch', type: 'function', function: { name: 'webfetch', arguments: JSON.stringify({ url: options.failedModelFetch ? WIKI : MUSEUM }) } }] });
      const cited = header.ordinal === 1 ? quoteFrom(unit) : null;
      const assertions = cited === null ? [] : [
        { quote: cited.quote, blockOrdinal: cited.blockOrdinal, assertionClass: 'real-world-fact', category: '机构', severity: 'A', question: '该器物现藏何处？',
          basis: `馆藏页 ${MUSEUM}、维基百科 与 ${ENGLISH} 记载「现藏湖北省博物馆」。` },
      ];
      // Synchronized delta with Issue #901: a new 事实核查 Task runs at 标准核查, whose contract is the additive /2 — each
      // assertion states its evidence relations (none here: this suite proves retention, which reads the basis as before).
      return answer({ content: JSON.stringify({ schema: 'ai7.factual-review.unit-result/2', unitOrdinal: header.ordinal,
        assertions: assertions.map((assertion) => ({ ...assertion, evidenceRelations: [] })) }) });
    }
    const last = body.messages.at(-1)!.content ?? '';
    const result = last.startsWith('保证抽样 ')
      ? { schema: 'ai7.analysis.assurance-sampling-result/1', dispositions: parseAssuranceSamplingListedRefs(last).map((ref) => ({ ref, disposition: '成立', reason: '合成回归抽样。' })) }
      : { schema: 'ai7.analysis.run-report-reflection-result/1', items: [{ suggestion: '复查留存来源。', basis: '合成回归账目。' }] };
    return answer({ content: JSON.stringify(result) });
  };
  owner = new BaselineAnalysisExecutionOwner({
    requestGovernor,
    ledger: store.factualReviewLedger, launchPolicy: policy, fixture: null,
    secretResolver: { resolve: async () => 'placeholder-development-key' },
    developerLive: { launch: { runBudgetCeiling: launch.live.runBudgetCeiling, providerCacheRoot: join(roots.inputRoot, 'cache'), validation: { family: 'reference-free-review', case: 'sample1-whole-book', delta: null } }, nativeFetch },
    researchEvidence: (input) => {
      if (options.failRetentionOnce) { options.failRetentionOnce = false; throw new Error('synthetic storage failure'); }
      store.recordResearchEvidence(input);
    },
  });
  return { policy, store, owner, sends };
}
