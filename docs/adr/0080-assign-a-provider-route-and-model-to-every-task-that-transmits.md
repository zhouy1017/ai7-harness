---
status: proposed
date: 2026-09-11
deciders: Owner (chooow.yang@gmail.com)
amends: ADR 0079 §4.2, read with §5.2 (the search tool may be the binding platform's)
---

# 0080 · Assign a provider, route and model to every task that transmits to a Model Provider or its tools

## Context

[ADR 0079](./0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §6 defers the web-search binding and the production binding changes to one consolidated design, in the Owner's words: 「websearch的问题留待不同人物的供应商进行一次集中设计和配置，我们必须先确定整个项目有多少涉及供应商的任务才能正确分配供应商」. This record is that design. It enumerates every task that transmits to a Model Provider or its tools, binds each to a Model Role and the capabilities it needs, settles the supported provider set and the capability-matching rule that assigns provider, route and model per operational scope, and names the credential slots to enroll when a slice first needs a live transmission. S70 (#425), every search-enabled review category, and the production binding wait for it.

The facts this record starts from:

- **Two scopes, two bindings, one of them exact.** Under `developer-live`, Provider Processing v5 pins one binding exactly — Main Editorial Role → `opencode-go` (`https://opencode.ai/zen/go/v1/chat/completions`), `deepseek-v4-flash`, slot `opencode-go` — with `webSearchToolAllowed: false` ([`provider-processing-policy.v5.json`](../policies/provider-processing-policy.v5.json)). Under `ordinary-production`, v6 carries the v3 decisions and pins no route: the product's Model Service projection binds Main Editorial Role → `deepseek-open-platform` / `deepseek-v4-pro`, slot `deepseek-api-key`, and every read-side capability of that route is declared absent because no Run has ever transmitted on it (`src/service/provider/model-profile.ts`, [provider support](../development/provider-support.md)).
- **A capability nobody has seen work is `none`.** The profile table declares `structuredOutput`, `reasoningChannel` and `usageAttribution` per `${route}/${model}` with evidence, and only `opencode-go/deepseek-v4-flash` has live evidence (`json-object` from `S40/reanalyze-range/1`; the answer channel, reasoning channel and usage attribution from `S40/first-baseline/1..8`). The Egress Gate refuses any payload that carries tools (`tools-present`), so the model-tool path of ADR 0079 §4.2 needs a narrowed rule, not a new gate.
- **Four request shapes** are assembled and read: `openai-chat-completions`, `anthropic-messages`, `openai-responses`, `google-generate-content`. Four Model Roles exist with accepted user-facing labels `快速交互角色`, `主编辑角色`, `疑难升级角色`, `前沿模型角色` ([execution CONTEXT](../domain/execution/CONTEXT.md), V2-UX-MODEL-002), and their binding is a configuration fact, never authority.
- **The provider line is unimplemented by design.** [ADR 0073](./0073-configure-a-compatible-provider-by-declaration-and-defer-discovery.md) accepted on 2026-09-10: a provider whose format AI7 implements is configured by a repository document under `config/providers/` and generated into the closed unions; slot 1c.10 (S55a #435) lands the first five documents — Claude official, OpenAI official, Qwen, HY, Gemini — **all inert on arrival**. No Model Role can bind a configured route until a Provider Processing revision names its exact binding, which is the Owner's decision per provider.
- **The product's privacy rule is settled** (ADR 0079 §4): the manuscript's text and the author's information may leave; 责编 and 相关人 names and roles, 备注 and internal notes are stripped; the house name is not hidden; nothing is ever published verbatim to a public-access network; search is the model's tool, never a local search-engine call built by AI7 (read with §5.2, which admits the binding platform's tool); AI7 fetches cited pages itself for retention.
- **What the Owner decided on 2026-09-10** (ADR 0079 §4.1, §4.2, §6): default-allowed web activities state their use once and need no per-Run authorization — 事实核查, 学术道德与引用, 出版政策与风险, the evaluation's market section, writing tasks, dialogue tasks, 资料库 web capture and the staleness check of retained sources; the search-enabled path runs provider-free with a disclosed state until this design names the binding; and 「要查文档确定」 — every capability claim reads the vendor's documentation on a stated day, recorded, never assumed.
- **What the Owner decided in this session** (2026-09-10 and 2026-09-11, recorded verbatim in §5): the supported set is fourteen entries picked from the full candidate list of §5.1 — nine domestic providers, Gemini / OpenAI / Claude, and the OpenCode Zen and Go gateways the Owner named; any picked provider may serve any row whose needs its capabilities match; the OpenCode platform's `websearch` / `webfetch` pair meets the search and retrieval requirement (§5.2); credentials are deferred and will live in one dedicated configuration file with its entry in the Settings menu; the production Main Editorial Role stays on DeepSeek official; the Fast Interaction Role is not bound yet.

## Decision

### 1 · Every task that transmits, its Model Role, and the capabilities it needs

The table is the enumeration ADR 0079 §6 requires. "Capabilities" uses the two the profile table already carries plus the two it gains in §2: **SO** structured output (a JSON contract parses the answer), **RC** reasoning channel (reasoning is read to explain an empty or malformed answer), **WS** web-search tool (a provider-side model tool or a platform-supplied tool — §2 and §5.2), **CTX** context (the plan declares the largest transmission and preflight compares it with the binding's declared context). 「—」 means the row needs nothing beyond the answer channel.

| # | Task (surface) | Model Role | Capabilities | Notes |
| --- | --- | --- | --- | --- |
| 1 | Baseline analysis unit turns (②A, the baseline unit contract) | 主编辑角色 | SO, RC, CTX | One technical session per unit; unit budget 1,200 graphemes + one overlap block (`UNIT_BUDGET_GRAPHEMES`) |
| 2 | Cross-unit reduction (②A, S42a) | 主编辑角色 | SO, RC, CTX | One turn over the closed unit set, four topic sections; grows with unit count (sample1: 8 units) |
| 3 | Assurance sampling (②A, S43) | 主编辑角色 | SO, RC, CTX | One turn per anchor unit |
| 4 | Run Report reflection (②A / 历史与更新, S44a) | 主编辑角色 | SO, RC | One turn, at most ten items |
| 5 | 审阅 · 错别字与规范用语 (category 1, S69) | 快速交互角色 | SO, CTX | High-volume candidate generation; category produces 修改建议 (batch) |
| 6 | 审阅 · 体例与格式 (category 2, S69) | 快速交互角色 | SO, CTX | Produces 批注 |
| 7 | 审阅 · 情节逻辑与前后一致 (category 3, S69) | 主编辑角色 | SO, RC, CTX | Consumes the baseline's conflicts as leads |
| 8 | 审阅 · 事实核查 (category 4, S69 → S70) | 主编辑角色 | SO, RC, CTX, **WS** | The Factual Review Contract's executor; search is the point (Owner: 「4类查重需要允许外网查询，不然没有意义」) |
| 9 | 审阅 · 学术道德与引用 (category 5, S69 → S70) | 主编辑角色 | SO, RC, CTX, **WS** | Only 需人工复核的风险点; AI7 states no compliance verdict |
| 10 | 审阅 · 出版政策与风险 (category 6, S69 → S70) | 主编辑角色 | SO, RC, CTX, **WS** | Only 需人工复核的风险点 |
| 11 | 审阅 · 文学性与表达改进 (category 7, S69) | 主编辑角色 | SO, RC, CTX | Produces 修改建议 |
| 12 | 审阅 · 书系一致性 (category 8, S69 → #63) | 主编辑角色 | SO, RC, CTX | Reads Series Knowledge revisions; unavailable without one |
| 13 | 审阅 · 跨交付物一致性 (category 9, S69) | 主编辑角色 | SO, RC, CTX | |
| 14 | 评估 · 初评 (②C, S81) | 主编辑角色 | SO, RC | The editor finalizes; the record keeps the editor's score |
| 15 | 评估 · 市场板块 (②C, S81) | 主编辑角色 | SO, CTX, **WS** | Default-allowed web; predictions labeled 低确定性 |
| 16 | 审稿意见 (②C, S81) | 主编辑角色 | CTX | Long-form draft artifact; two templates; no web |
| 17 | 写作任务 (⑥ 新建文档, S84) | 主编辑角色 | CTX, **WS** | 市场 / 同类书 / 作者公开信息; 范例 referenced, never copied |
| 18 | 对话任务 (③ 任务面, S77 / #52) | 快速交互角色 | **WS** allowed | Quick interaction; latency-sensitive; durable non-authoritative answers |
| 19 | 来源译文 (SRC-013, S70; 资料库 machine translation, S80) | 快速交互角色 | CTX | Labeled machine translation beside the original, never replacing it |
| 20 | External Evidence Retention Procedure (⑤ 外部来源留存, S70) | — (rides the calling row) | — | The **search** is row 8/9/10/15's `webSearchTool` on its binding; the **retention fetch is AI7's own**, requires no model and no row of its own |
| 21 | Material Index vectors (⑤ 资料库, S80) | — (local) | — | The embedding is built **locally**; no provider embedding is bound in v1 (ADR 0079 §1's data rules; S80 decides the local dependency) |
| 22 | 校准 (设置 › 评估校准与预测, S82) | — (deterministic) | — | An offset computed from stored records; nothing transmits |

Two roles no row requires: **疑难升级角色** and **前沿模型角色**. Nothing in the enumeration needs a model stronger than the Main Editorial Role's; they exist for the editor's later explicit choice on unusually consequential work (V2-UX-MODEL-002), and the settings surface shows them `需设置` until a binding is configured.

Deliberately absent from the table, because they transmit nothing: import, reimport and fidelity review (ADR 0077 §5, V2-UX-IMP-051 — import never calls a model); plan preparation, plan editing and plan revision (deterministic over the task-kind definition and the 工序); the 快速开始 default rule (it selects a plan, never dispatches); Reference Integrity (deterministic quote location); the retention fetch and the staleness check (AI7's own egress under §4.3 of ADR 0079, not a model task); export and delivery (effects, not transmissions).

### 2 · The profile capability set gains `webSearchTool`, and a binding declares its context size

Two proposals, both following the table's own rule that an unverified capability is declared absent:

1. **`webSearchTool`** joins `ModelCapabilities` as a proposal: `'none' | 'provider-tool' | 'platform-tool'`, declared per `${route}/${model}` with evidence exactly as every other capability is (`vendor-documentation` naming the page and the day, or `live-test-item` citing the item). `provider-tool` is the model's own server-side tool (Claude's `web_search`, OpenAI's `web_search`, Gemini's `google_search`, Qwen's `enable_search`, …); `platform-tool` is a tool the binding's platform supplies to the model (the OpenCode `websearch` / `webfetch` pair of §3, whose search runs on the platform's hosted Exa-or-Parallel service). `none` until established. The applicable Provider Processing document's `webSearchToolAllowed` flag is what enables it for a rule, and the Egress Gate's `tools-present` refusal narrows to: a payload may carry exactly the declared web-search tool when the exact binding declares it and the pinned policy document names that rule's allowance — every other tool stays refused. The gate and the profile field land with the slices that first need them (S55a's generated documents and S70), not in this record.
2. **A declared context size** per profile (input tokens, `vendor-documentation` evidence), so Provider Preflight can compare the plan's declared largest transmission with the binding's declared context and refuse a binding that cannot carry it. §3 records each candidate model's context window where the pages read state one, and "context not read" where they do not.

Neither proposal authorizes a call: a configured route stays unbindable until a policy revision names its exact binding, and every first transmission on a new binding is a named test item under ADR 0067/0070.

### 3 · What the evidence establishes (read 2026-09-10; the 2026-09-11 readings are named where they occur)

Every fact below was read from the vendor's own documentation, the page is named, and the reading's date sits on the section. The rule of `model-profile.ts` governs: what is not written here is `none`, and nothing is assumed from a neighbouring row.

#### DeepSeek official — production incumbent (Main Editorial Role)

Read 2026-09-10 (api-docs.deepseek.com):
- **Models**: `deepseek-flash` (DeepSeek-V4.1-Flash) and `deepseek-v4-pro` (DeepSeek-V4-Pro-0813); the pricing page states a **1M context** for both. The legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are still accepted but retired. **A dated fact this record must carry**: from 12:00 Beijing Time on 2026-09-14, `deepseek-v4-pro` requests "will all be routed to V4.1 Flash" — the production binding's model id keeps working, and the model behind it changes on that date by the vendor's notice.
- **Structured output**: supported — `response_format: {"type": "json_object"}` ("DeepSeek provides JSON Output to ensure the model outputs valid JSON strings"), with the vendor's own caveats: the prompt should contain the word "json" and an example; `max_tokens` should be set "to prevent the JSON string from being truncated midway"; and "the API may occasionally return empty content".
- **Reasoning**: thinking mode is on by default at effort `high`; `reasoning_effort` takes `none` / `low` / `high` / `max`, and the chain of thought returns in `reasoning_content` beside `content`. Named tool choices are refused in thinking mode. This is the production route's `deepseek-thinking` control the adapter already assembles (`frozen-request-baseline`); its response side remains unobserved.
- **Web search**: **the API documents none.** The Tool Calls guide admits only `"type": "function"` ("the model itself does not execute specific functions"); the Chat Completions reference says "Currently, only functions are supported as a tool"; the Responses API guide's Tools table marks `web_search` **`Ignored`** and its reference states "Built-in tool types are ignored." DeepSeek is therefore never the search row's binding.
- **Embeddings**: none — the API reference lists no embeddings endpoint.
- **Endpoint and auth**: `https://api.deepseek.com`, `Authorization: Bearer` — unchanged from the v3 binding.

#### OpenCode Go and Zen — the two gateways the Owner named

Read 2026-09-10 (opencode.ai/docs/go/ · opencode.ai/docs/zen/) and 2026-09-11 (opencode.ai/docs/tools/):
- The Go plan is "a low cost **$10/month subscription**"; Zen is a separate optional pay-as-you-go gateway. The Go page lists its models as `opencode-go/<id>` (now including `qwen3.8-max`, `qwen3.8-flash`, `deepseek-flash`, `deepseek-v4-pro`, `hy4-preview`, `hy3`, GLM, Kimi, MiniMax, MiMo, LongCat, Grok, GPT 5.6 Luna, Muse Spark); Zen serves a wider list including Claude, GPT and Gemini ids. Neither gateway page prints a capability table — only pricing and deprecation tables.
- **The gateway wire API documents no provider-side model tool**: the `go/` and `zen/` pages mention no web search, server-side tools, or tools at all. **The OpenCode platform documents its own built-in tools on a separate page** (read 2026-09-11): `webfetch` — "Fetch web content", "Allows the LLM to fetch and read web pages" — and `websearch` — "Search the web for information", "Performs web searches using **Exa or Parallel** to find relevant information online", "connects directly to the backend's hosted MCP service without authentication", available "only when using the OpenCode or OpenCode Go provider, or when either the `OPENCODE_ENABLE_EXA` or `OPENCODE_ENABLE_PARALLEL` environment variable is set to any truthy value". Tools are enabled by default and governed per tool by an `allow` / `deny` / `ask` permission field.
- **Embeddings**: not stated on any page read.
- **Auth**: the gateway pages name no header form; the Go page prints only `x-opencode-session` for session stability. The repository's own frozen request baseline carries the header form the gateway has been observed to accept.

#### Qwen (Alibaba Model Studio / DashScope) — planned official document

Read 2026-09-10 (help.aliyun.com/zh/model-studio/…, alibabacloud.com/help/en/model-studio/…):
- **Web search**: a built-in provider-side capability — 「设置 `enable_search: true` 即可启用联网搜索。」 It is non-standard for OpenAI compatibility (the Python SDK passes it via `extra_body`; Node.js top-level), and the OpenAI-compatible protocol **does not return the search sources**: 「以上 enable_source、enable_citation、citation_format 参数仅支持 DashScope 调用方式」/ "The OpenAI-compatible protocol does not support returning search sources in the response." Structured sources (`search_info` → `search_results`, each with `index` / `title` / `url`) arrive only in DashScope mode, which is not a shape this repository implements. 「2025 年 7 月后发布的千问Max、千问Plus、千问Flash 模型都自动支持联网搜索。」 Billing: search policy fee per 1,000 calls — $0.573411 in the China regions, $10.00 in Singapore for agent/agent_max — plus the model call.
- **Structured output**: documented — `response_format: {"type": "json_object"}` broadly, and `{"type": "json_schema", …}` for "Qwen3.7-Plus series, Qwen3.7-Flash series, Qwen3.7-Max series, Qwen3.8-Max series, and Qwen3.8-Flash series models".
- **Models**: the model page prints `qwen3.8-max`, `qwen3.7-plus`, `qwen3.8-flash` (and resold `deepseek-v4-pro`, `kimi-k3`, `glm-5.2`, `MiniMax-M3`, `mimo-v2.5-pro`); the overview no longer prints `qwen-max` / `qwen-plus` / `qwen-turbo`, and **per-model context windows were not read today** — the 1c.10 document records them from its own reading.
- **Embeddings**: `text-embedding-v4` (2,048–64 dimensions, default 1,024; 8,192 tokens per row) and `qwen3.7-text-embedding` (up to 128,000 tokens per row); OpenAI-compatible `POST …/compatible-mode/v1/embeddings`.
- **Endpoint and auth**: `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` (the docs record a migration from `dashscope.aliyuncs.com`, which still works), `Authorization: Bearer`; keys are region-bound.

#### HY (Tencent Hunyuan) — planned official document

Read 2026-09-10 (cloud.tencent.com/document/…):
- **Web search**: documented on two first-party routes. The legacy ChatCompletions API carries `EnableEnhancement` (「功能增强（如搜索）开关」, default off), `SearchInfo`, `Citation` and `EnableSpeedSearch` — and the legacy platform's own notice says its models 「逐步迁移至 TokenHub」 and that it 「将不再新增模型能力，并停止支持新购模型服务」. The current TokenHub platform exposes `"web_search_options": { "enable": true }` with sources returned via `search_results`, and a Responses-API tool `{"type": "web_search"}`; 「模型会自主判断是否需要搜索、搜索什么关键词，并基于搜索结果生成回答。」
- **Structured output**: **not stated on any first-party page read.** The legacy parameter list has function calling (`Tools.N` / `ToolChoice`) but no `response_format`, and TokenHub's calling overview states only that 「标准协议中的个别字段可能被忽略或降级」. Hunyuan therefore cannot carry a row whose contract parses JSON until a page or a named live item establishes it.
- **Models**: TokenHub prints `hy4-preview` (1M context / 960k input / 64k output), `hy3` (256k / 192k / 128k), the `hy-mt2-*` translation family, and `hunyuan-role-latest`; the classic `hunyuan-turbos` / `hunyuan-pro` / `hunyuan-large` text ids are not printed on the current pages.
- **Embeddings**: `kinfra-text-embedding-0.6b` (1,024 dims), `kinfra-text-embedding-4b` (2,560), `kinfra-vl-embedding-2b` (2,048), `kinfra-vl-embedding-8b` (4,096), 32k context, via TokenHub `POST https://tokenhub.tencentmaas.com/v1/embeddings`.
- **Endpoint and auth**: TokenHub `https://tokenhub.tencentmaas.com/v1` (Guangzhou; a Singapore host exists), `Authorization: Bearer`; the legacy OpenAI-compatible host is `https://api.hunyuan.cloud.tencent.com/v1/`.

#### Claude official — planned official document

Read 2026-09-10 (docs.claude.com redirects to platform.claude.com):
- **Web search tool**: server-side, executed on Anthropic's infrastructure; versions `web_search_20250305` (basic), `web_search_20260209` (adds dynamic filtering), `web_search_20260318` (adds response inclusion control). Request: `"tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}]`. Availability: the Claude API, Claude Platform on AWS and Microsoft Foundry; **Google Cloud gets only the basic version and Amazon Bedrock is not served**. $10 per 1,000 searches. The docs name no per-model support list; every example uses `claude-opus-5`.
- **Structured outputs**: GA — `output_config.format` with `"type": "json_schema"`; the beta header is no longer required.
- **Reasoning**: the Claude 5 family (Fable 5.1, Opus 5, Sonnet 5, Fable 5, Mythos 5, Opus 4.8/4.7) rejects `thinking.type: "enabled"` with a 400; the replacement is `thinking: {type: "adaptive"}` with `output_config.effort`.
- **Models**: `claude-opus-5` (1M context / 128K output), `claude-fable-5-1` (1M / 128K), `claude-sonnet-5` (1M / 128K), `claude-haiku-4-5` (200K / 64K).
- **Embeddings**: Anthropic offers none ("Anthropic does not offer its own embedding model"); the page documents Voyage AI instead.
- **Endpoint and auth**: `https://api.anthropic.com/v1/messages`, `x-api-key` + `anthropic-version: 2023-06-01` — the form ADR 0073 §5 already names.

#### OpenAI official — planned official document

Read 2026-09-10 (platform.openai.com/docs redirects to developers.openai.com/api/docs):
- **Web search tool**: server-side in the Responses API — `"tools": [{"type": "web_search"}]` (`web_search_preview` is the legacy form). Responses carry inline `url_citation` annotations (URL, title, location) and `sources` lists every URL consulted. The guide's own examples use `gpt-5.5` and `gpt-6-astra`; Chat Completions search is a separate model id (`gpt-5-search-api`). Price: "$10.00 / 1k calls + Search content tokens billed at model rates."
- **Structured outputs**: `text.format` with `{"type": "json_schema", "strict": true}`; GA status is not stated on the pages read.
- **Reasoning**: `reasoning.effort` with `none` … `max`, and a `reasoning.mode` of `standard` or `pro`.
- **Models**: `gpt-6-astra` (1.05M context / 128K output; $10 / $50 per 1M tokens), `gpt-5.6-sol` (alias `gpt-5.6`), `gpt-5.6-terra`, `gpt-5.6-luna` (each 1.05M / 128K; `gpt-5.6-luna` $0.20 / $1.20 per 1M). The models page lists Web search in every flagship's tools row.
- **Embeddings**: `text-embedding-3-small` (1,536 dims) and `text-embedding-3-large` (3,072 dims), 8,192-token input, `POST /v1/embeddings`.
- **Endpoint and auth**: `https://api.openai.com/v1/responses`, `Authorization: Bearer`.

#### Gemini (Google) — planned official document

Read 2026-09-10 (ai.google.dev/gemini-api/docs):
- **Grounding with Google Search**: `tools: [{"type": "google_search"}]` (older models used `google_search_retrieval`); citations arrive as `url_citation` objects (url, title, start/end index). Billing: per search query the model executes on Gemini 3 — 5,000 free requests per month shared across 3.x, then $14 per 1,000; 2.5-and-older bill per grounded prompt.
- **Structured output**: `response_format` with `type`, `mime_type`, `schema`; the page labels it a preview feature of the Gemini 3 series and states that Gemini 3 can combine it with built-in tools including Grounding with Google Search.
- **Reasoning**: `thinking_level` (`minimal` / `low` / `medium` / `high` by model) plus `thinking_summaries`.
- **Models**: `gemini-3.8-flash` (1,048,576 context / 65,536 output), `gemini-3.1-pro-preview` (1,048,576 / 65,536), `gemini-2.5-pro` (1,048,576 / 65,536); Flash-Lite tier for high-throughput low-cost work.
- **Embeddings**: `gemini-embedding-2` (multimodal; 3,072 dimensions, adjustable 128–3,072; 8,192-token input) and `gemini-embedding-001` for text.
- **A shape warning, recorded rather than resolved**: the pages read today describe an **Interactions-style API** — endpoint `https://generativelanguage.googleapis.com/v1beta/interactions`, `response_format`, and `steps` typed `thought` / `google_search_call` / `google_search_result` / `model_output` — while the implemented `google-generate-content` shape (S54d) assembles the older `:generateContent` request with `responseMimeType` / `responseSchema` and reads `candidates` / `groundingMetadata`. The vendor documentation no longer states the older shape. The Owner named Gemini official in the supported set; its document records the discrepancy and no Gemini binding carries a web-search-enabled rule until the shape review §6 assigns.
- **Endpoint and auth**: `x-goog-api-key` as ADR 0073 §5 names (`https://generativelanguage.googleapis.com/v1beta/...`).

#### Baidu ERNIE (Qianfan) — candidate

Read 2026-09-10 (cloud.baidu.com/doc/qianfan-*):
- **Endpoint and auth**: `https://qianfan.baidubce.com/v2` (`/v2/chat/completions`), header `Authorization: Bearer bce-v3/…`; the quickstart states 「同时接口协议兼容OPENAI的SDK」. No Anthropic-compatible endpoint and no Responses-style API are documented on the pages read.
- **Web search**: a `web_search` object on `/v2/chat/completions` — 「搜索增强的选项」, default off — with `enable`, `enable_citation`, `enable_trace`, `search_mode` (`auto` / `required`; 「ernie系列模型不支持该参数」) and `search_number` 「检索的文献数量，范围在[1~28]之间」. A separate search API exists (`POST /v2/ai_search/web_search`, `search_source: baidu_search_v2`).
- **Structured output**: `response_format` with `type` = `json_object` / `text` / `json_schema` (the schema is required for `json_schema`); 「不支持以下模型：ERNIE X1 Turbo系列」.
- **Models**: `ERNIE-5.0` / `ERNIE-5.1` / `ERNIE-4.5-Turbo-128K` (128k context) and resold `DeepSeek-V4-Pro` (1M).
- **Embeddings**: `embedding-v1` (384), `bge-large-zh` / `bge-large-en` (1,024), `qwen3-embedding-*` (1,024–4,096); the endpoint path is not stated on the pages read.

#### ByteDance Doubao (Volcengine Ark) — candidate, evidence incomplete

Read 2026-09-10 (volcengine.com):
- **The official API reference did not render for automated reading.** Ten attempts against `docs.volcengine.com/docs/82379` and its console/region mirrors returned empty SPA bodies; the facts below come from two first-party Volcengine properties instead, and the row is **incomplete by this record's own rule**.
- What was read: model ids `doubao-seed-1-8-251228`, `doubao-seed-2.0-code`, `ark-code-latest` plus resold `kimi-k2.5`, `deepseek-r1-250528`; a coding-plan endpoint pair (`https://ark.cn-beijing.volces.com/api/coding` for the Anthropic protocol, `/api/coding/v3` for the OpenAI protocol) and a Responses API surface in the vendor's ADK documentation. Context windows, web search, structured output and embeddings are **not stated on the pages read**.
- Consequence: Doubao can be picked, but its document waits on a readable API reference or a named live item — recorded as a task, not an assumption.

#### iFlytek Spark — candidate

Read 2026-09-10 (xfyun.cn/doc/spark/…):
- **Endpoint and auth**: `https://spark-api-open.xf-yun.com/x2/chat/completions` (model `spark-x`, X2) and `/v2/chat/completions` (X1.5), header `Authorization: Bearer` (the API password). OpenAI-compatible per the docs' own SDK example, and an Anthropic-compatible path is documented (`/anthropic/agent/v1/messages`). No Responses-style API stated.
- **Web search**: a tool — `{"type":"web_search","web_search":{"enable":true,"search_mode":"deep/normal"}}` — with the constraint 「web_search和function 不可同时传」.
- **Structured output**: **no `response_format` or JSON-mode parameter appears on the pages read** (function-call schemas only).
- **Models**: `spark-x`; the X2-Flash doc gives `max_tokens` up to 262,144.
- **Embeddings**: two private services returning 2,560-dimensional vectors with the vendor's URL-signature auth (not OpenAI-compatible), no model id printed.

#### Zhipu GLM — candidate

Read 2026-09-10 (docs.z.ai · docs.bigmodel.cn):
- **Endpoint and auth**: international `https://api.z.ai/api/paas/v4/`; China `https://open.bigmodel.cn/api/paas/v4` (the OpenAI chat protocol), `/api/v1` (a Responses protocol) and `/api/anthropic` (an Anthropic-message protocol) — the landing page says 「兼容 OpenAI SDK，快速迁移现有应用」. `Authorization: Bearer`.
- **Web search**: a chat-completions tool — `"type": "web_search"` with `search_engine` (default `search_pro_jina`), `count` 1–50, recency filters — and a standalone tool API (`POST /paas/v4/web_search`, engines `search_std` / `search_pro` / `search_pro_sogou` / `search_pro_quark`). No model allowlist is printed.
- **Structured output**: `response_format` with **`text` and `json_object` only — `json_schema` is absent** from the reference.
- **Models**: `glm-5.3` (「支持 1M 上下文窗口」, 128K output), `glm-5.3-flash` (1M), `glm-5.2` (1M), `glm-4.6` (200K).
- **Embeddings**: `POST /paas/v4/embeddings` — `embedding-3` (2,048 default; 1,024 / 512 / 256) and `embedding-2` (1,024).

#### Moonshot Kimi — candidate

Read 2026-09-10 (platform.moonshot.cn → platform.kimi.com/docs):
- **Endpoint and auth**: `https://api.moonshot.cn/v1` (`/v1/chat/completions`, `/v1/responses`, `/v1/models`) and an Anthropic-compatible `/anthropic/v1/messages`; `Authorization: Bearer`.
- **Web search**: a provider-run builtin — 「`$web_search`（`builtin_function` 类型）是 Kimi 内置的联网搜索工具函数」, registered by declaring `type` + `function.name` in `tools`; 「除了 Tokens 消耗外，我们还会对每次联网搜索收取一次调用费用」. Recommended with `kimi-k3` (1M context); `kimi-k2.6` also searches with thinking on.
- **Structured output**: `response_format` with `text` / `json_object` / `json_schema` (`name`, `strict`, `schema`).
- **Models**: `kimi-k3` (1M context, 2.8T parameters, always reasons), `kimi-k2.7-code` / `kimi-k2.6` (256K); the `moonshot-v1-*` line retired 2026-08-31.
- **Embeddings**: none documented.

#### MiniMax — candidate

Read 2026-09-10 (platform.minimaxi.com/docs):
- **Endpoint and auth**: `https://api.minimax.cn/v1` (`/v1/chat/completions`), plus an Anthropic-compatible `/anthropic/v1/messages` and an OpenAI Responses-style `/v1/responses` (Beta); `Authorization: Bearer`.
- **Web search**: server tools documented **only on the Anthropic Messages API** (`{"type": "web_search_20250305", "name": "web_search"}`) and the **Responses API** (`{"type": "web_search"}`) — the pages describe no chat-completions web search.
- **Structured output**: **not documented** — no `response_format` appears anywhere in the chat schema or guides read.
- **Models**: `MiniMax-M3` (「1M 超长上下文」; recommended 128K output, ceiling 512K), `MiniMax-M2.7` / `M2.5` / `M2.x` series.
- **Embeddings**: none documented (the embeddings page 404s).

#### Xiaomi MiMo — candidate

Read 2026-09-11 (mimo.mi.com):
- **Endpoint and auth**: `https://api.xiaomimimo.com/v1/chat/completions` (OpenAI-compatible) with an `api-key:` header (a Bearer form is also listed); the documentation index also lists an OpenAI Responses API page and an Anthropic API page.
- **Web search**: a chat-completions tool — `{"type": "web_search", "max_keyword": 3, "force_search": true, "limit": 1}` — which must be activated in the vendor's console before use; the response carries `annotations` of `url_citation` entries (`url`, `title`, `summary`, `site_name`, `publish_time`) and a `web_search_usage` object. Billing: 「China ¥16 / 1K requests、Overseas $5 / 1K requests」 plus the searched pages' tokens. The page states that API protocols other than OpenAI Chat Completions 「are not supported for the time being」 for this tool.
- **Structured output**: `response_format: {"type": "json_object"}` only — the mode "only guarantees syntactically valid JSON output" and the structure comes from the prompt; no `json_schema` is documented.
- **Models**: `mimo-v2.5-pro` and `mimo-v2.5` — 1M context, up to 128K output; both list "Function Call" and "Web Search" capabilities. The `mimo-v2-*` line was deprecated on 2026-06-30.
- **Embeddings**: none documented.

#### xAI — candidate

Read 2026-09-10 (docs.x.ai):
- **Endpoint and auth**: `https://api.x.ai/v1`, `Authorization: Bearer`. Both `chat/completions` (the docs call it a "legacy endpoint" with a migration guide) and a Responses-style `/v1/responses` are documented with OpenAI SDK examples; the pages never print "OpenAI-compatible".
- **Web search**: a server-side tool — `"type": "web_search"` — with `allowed_domains` (max 5) / `excluded_domains` (max 5), which "cannot be set together"; examples use `grok-4.6`. The docs do not use the name "Live Search" on the pages read.
- **Structured output**: `response_format` with `"json_schema"` / `"json_object"` / `"text"`; combining structured outputs with tools is stated as "only available for supported Grok 4 family models".
- **Models**: `grok-4.6` (500k context), `grok-4.5` (500k), `grok-4.3` (1M), `grok-4.20-*` variants (1M), `grok-build-0.1` (256k).
- **Embeddings**: an embeddings endpoint exists (`POST /v1/embeddings`); the pages state no model id or dimensions.

#### Mistral — candidate

Read 2026-09-10 (docs.mistral.ai):
- **Endpoint and auth**: `https://api.mistral.ai`, `Authorization: Bearer`; the quickstart documents only Mistral's own SDK, and the pages read make no OpenAI-compatibility claim.
- **Web search**: two built-in server-side tools — `"web_search"` and `"web_search_premium"` — returning sources as typed content chunks; **they are served through the Conversations API (`/v1/conversations`) and the page states they are "not supported" in `/v1/chat/completions`**, which no shape of this repository speaks.
- **Structured output**: JSON mode (`response_format: {"type": "json_object"}`) and custom structured outputs; no literal `json_schema` request body is shown on the pages read.
- **Models**: `mistral-medium-3-5-26-04`, `mistral-small-4-0-26-03`, `mistral-large-3-25-12`, `ministral-3-*`, `codestral-25-08`; context windows are printed only for some (e.g. `zai-glm-5-2` at 1M).
- **Embeddings**: `mistral-embed` (`POST /v1/embeddings`); dimensions not stated.

#### Cohere — candidate

Read 2026-09-10 (docs.cohere.com):
- **Endpoint and auth**: `https://api.cohere.ai/v2/chat`, `Authorization: bearer`; an OpenAI compatibility layer exists at `https://api.cohere.ai/compatibility/v1` with `/chat/completions` and `/embeddings`.
- **Web search**: the `connectors=[{"id": "web-search"}]` connector — **deprecated on 2025-09-15**, with the docs pointing to multi-step tool use for equivalent behavior.
- **Structured output**: Chat API v2 `response_format` with `{"type": "json_object"}` and an optional `schema`, plus `strict_tools`, with a documented restriction list (schema `type` must be `object`; `allOf` / `oneOf` / `not` / numeric bounds / array-size keywords unsupported).
- **Models**: `command-a-plus-05-2026` (128k context), `command-a-03-2025` (256k), `command-a-reasoning-08-2025` (256k), and others.
- **Embeddings**: `embed-v4.0` (256 / 512 / 1024 / 1536 dimensions, 128k context), plus the v3 family.

### 4 · The assignment rule

**A row declares needs; the supported set supplies candidates.** For every row of §1 the product resolves a binding at preparation time, deterministically and on the record:

1. The row's Model Role and its declared capability needs (SO / RC / WS / CTX) are plan facts, shown in the plan's 模型服务 section (V2-UX-PLAN-002, MSET-003).
2. The candidate set is the **supported providers** (§5.1's pick) admitted for the Run's operational scope, each entry carrying its declared capabilities with evidence — an unestablished capability is `none` and matches nothing.
3. The selection filters candidates by capability match and the scope's policy allowance, and freezes exactly one binding — route, endpoint, model, slot — into the Run's Execution Binding, which stays immutable and exact as it is today. A capability-matched alternative is a candidate for a *later* Run or a fallback chain entry, never a silent mid-Run switch.
4. No candidate matches → the disclosed state (the row's own refusal surface, e.g. 未联网核查 for a search-dependent category), never a fallback to an unmatched provider.

Two consequences of this rule are worth stating because they change the policy shape: a Provider Processing allow rule needs to name the **eligibility set** for a row rather than one hand-picked binding (each member still exact: route, endpoint, model, slot, with the capability evidence that admitted it), and the Egress Gate's `tools-present` refusal narrows exactly as §2 states. `webSearchToolAllowed` is then per rule, as it is today, and only bindings whose profile declares `webSearchTool` can consume it.

**`developer-live`** keeps the v5 binding for everything the product's developer path implements today: Main Editorial Role → `opencode-go/deepseek-v4-flash`, slot `opencode-go` (Provider Processing v5, unchanged). The search-dependent rows (8, 9, 10, 15, 17 — the rows whose basis declares search) gain their first live path from §5.2: an OpenCode binding carrying the platform's `websearch` / `webfetch` tools, or a picked provider whose documentation establishes a provider-side tool — either way admitted by a new Provider Processing revision naming the eligible binding and the tool (and, once the Owner widens the scope's set, the eligibility-set form of the rule above). Until that revision exists, search-dependent rows run provider-free with their disclosed states (S69's 未联网核查 for the review categories; the sibling slices name their own). Row 18's web use rides the same decision — the default-allowed tier permits web use, it does not require it.

**`ordinary-production`** binds per role by the same rule:
- 主编辑角色, non-search rows (1–7, 11–14, 16): `deepseek-open-platform`, the Owner's confirmed choice — the unchanged v3/v6 binding. **Before the first production Run, that route's read-side capabilities must be established** (answer channel, structured output, reasoning channel, usage attribution) by vendor documentation or a named live test item; today they are `unverified`, and the production path is not runnable for any contract without them. This record authorizes no such test.
- Search rows (8, 9, 10, 15, 17): capability-matched among the supported set's bindings whose evidence establishes a web-search tool — a provider-side tool or the OpenCode platform's (§5.2) — on the Main Editorial Role, with `webSearchToolAllowed` enabled for exactly that rule by a Provider Processing revision.
- 快速交互角色 (rows 5, 6, 18, 19): unbound; the Owner deferred it, and the rows run on the Main Editorial Role's binding until a slice needs the cheap tier.
- 疑难升级角色 / 前沿模型角色: unbound; no row requires them.

**Production availability is a requirement, not an afterthought.** A production candidate must be a service the house can reach and is served under the vendor's own terms from its operating region; §5.1 records what each candidate's documentation states about platform and region. The Owner weighs this in the pick.

### 5 · The Owner's decisions (recorded verbatim)

The questions were put to the Owner on 2026-09-10 with the evidence of §3, and the Owner refined the answer on 2026-09-11 after the full candidate list was produced. Both rounds are quoted verbatim; where an answer changes the design the consequence is written out beneath it.

**Round one, 2026-09-10.**

1. **The provider set to support.** Asked which provider carries the first web-search-capable binding, the Owner answered: 「gemini official + deepseek official + models avaiable in opencode go subscription」. Asked which providers get credentials, the Owner answered: 「给我生成一个包含所有主流模型提供商和我指定的opencode go + zen的列表，我从其中挑选我们必须支持的，同时我选中的提供商要能够在能力匹配的情况下应用在所有以上环节。配key工作后置，使用一个单独配置文件储存key，配置入口放在设置菜单里，先支持后添加key」。
   - **The supported set is chosen from a full list, not named piecemeal.** §5.1 below is that list: every mainstream Model Provider with its own official API, plus the two OpenCode gateways the Owner named (Go and Zen), each with what its documentation establishes today.
   - **Capability matching replaces per-row exclusive binding.** Any provider in the supported set may serve any row of §1 whose declared needs its declared capabilities satisfy; the binding is still frozen exactly per Run and per policy rule. §4 states the rule.
   - **Credentials are deferred, and the product stores them in one dedicated file.** Key enrollment does not happen in this session and is not a prerequisite for provider support: routes, profiles and documents land first (「先支持后添加key」). When the product-side keys arrive they live in one separate configuration file — never in the repository, never in a log — and the configuration entry is a place in the Settings menu. This is the Owner's direction for the product's ordinary-production credentials; the `developer-live` key remains governed by ADR 0067 (the enrollment helper is the only reader of the checkout-root key file), and the file's permissions, location and backup exclusion are settled in the Brief of the slice that implements it.
2. **The production Main Editorial Role** stays on DeepSeek official: 「留在 DeepSeek 官方（推荐）」 — non-search rows bind `deepseek-open-platform` as §4 states, with the 2026-09-14 routing notice of §3 carried as a fact.
3. **The Fast Interaction Role is not bound now**: 「先不绑（推荐）」 — rows 5, 6, 18 and 19 run on the Main Editorial Role's binding until a slice needs otherwise; the role card shows its honest `需设置` state.

**Round two, 2026-09-11 — the pick, and the OpenCode tools.** After §5.1 was produced, the Owner answered: 「opencode official doc中tool一章节包含了websearch和webfetch两个工具可以符合我们的要求，现在作为文档设计，先把opencode 用量付费+go订阅付费，国内9个列表去掉讯飞不要，额外添加小米mimo，国外geimini，openai和claude三家即可」.

- **The supported set is fourteen entries**: the domestic nine — DeepSeek 官方, 阿里云百炼 Qwen, 腾讯混元, 智谱 GLM, 月之暗面 Kimi, MiniMax, 百度文心（千帆）, 字节豆包（方舟）, 小米 MiMo — the overseas three — Gemini 官方, OpenAI 官方, Claude 官方 — and the two OpenCode offerings the Owner named again, Zen (用量付费) and Go (订阅付费). xAI, Mistral, Cohere and iFlytek Spark are read and not picked; their evidence stays in §3 as the record of the reading.
- **The OpenCode tool pair meets the search and retrieval requirement** — see §5.2, which reads ADR 0079 §4.2 with it.

#### 5.1 The candidate list the Owner picked from

Every entry was read from the vendor's own documentation on 2026-09-10 and its evidence is §3. The **✔** rows are the Owner's supported set of §5 (round two); the **—** rows are read and not picked. "Shape" names which of the four implemented request shapes the provider's official API matches today; "search" and "SO" record only what the documentation states — everything else is `none` by the table's rule. Each picked provider gains one credential slot through the generated documents (ADR 0073 §4); the slots to enroll are exactly the slots of the picked providers a slice will first transmit through — today `deepseek-api-key` and `opencode-go` exist, and every other slot arrives with its document.

| Picked | Provider (official API) | Region | Implemented shape it matches | Web-search tool (documented) | Structured output (documented) | Embeddings (documented) | Flagship models (context) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✔ | DeepSeek official | China | `openai-chat-completions` (an Anthropic-format path is also documented) | none | `json_object` | none | `deepseek-v4-pro` · `deepseek-flash` (1M) |
| ✔ | Alibaba Model Studio (Qwen) | China | `openai-chat-completions` | `enable_search` (sources only in DashScope mode) | `json_object`; `json_schema` on 3.7/3.8 series | `text-embedding-v4`, `qwen3.7-text-embedding` | `qwen3.8-max` · `qwen3.7-plus` · `qwen3.8-flash` (context not read) |
| ✔ | Tencent Hunyuan (TokenHub) | China | `openai-chat-completions` | `web_search_options` → `search_results` | not stated | `kinfra-*` family | `hy4-preview` (1M) · `hy3` (256k) |
| ✔ | Zhipu GLM | China / Global | `openai-chat-completions` (also an Anthropic-message path) | `web_search` tool (chat) + standalone tool API | `json_object` only (`json_schema` absent) | `embedding-3` (≤2,048) | `glm-5.3` · `glm-5.3-flash` · `glm-5.2` (1M); `glm-4.6` (200K) |
| ✔ | Moonshot Kimi | China | `openai-chat-completions` (also `/responses` and an Anthropic-message path) | `$web_search` builtin (per-call fee) | `json_object` + `json_schema` | none | `kimi-k3` (1M) · `kimi-k2.7-code` / `kimi-k2.6` (256K) |
| ✔ | MiniMax | China | `openai-chat-completions` (also `/responses` and an Anthropic-message path) | `web_search` server tool, Anthropic/Responses APIs only | not documented | none | `MiniMax-M3` (1M) · `M2.7` / `M2.5` |
| ✔ | Baidu ERNIE (Qianfan) | China | `openai-chat-completions` | `web_search` object on chat completions | `json_object` + `json_schema` (not ERNIE X1 Turbo) | `embedding-v1`, `bge-large-*`, `qwen3-embedding-*` | `ERNIE-5.1` · `ERNIE-5.0` (128K) · resold `DeepSeek-V4-Pro` (1M) |
| ✔ | ByteDance Doubao (Volcengine Ark) | China | not readable today (§3) | not stated on the pages read | not stated on the pages read | not stated on the pages read | `doubao-seed-1-8` · `ark-code-latest` (contexts not stated) |
| ✔ | Xiaomi MiMo | China | `openai-chat-completions` (a Responses and an Anthropic path are also listed) | `web_search` tool (console-activated; ¥16 / 1K requests in China) | `json_object` only | none | `mimo-v2.5-pro` · `mimo-v2.5` (1M) |
| ✔ | Google Gemini | Global | `google-generate-content` (shape review pending — §3) | `google_search` | `response_format` (Gemini 3, preview) | `gemini-embedding-2` | `gemini-3.8-flash` · `gemini-3.1-pro` (1M) |
| ✔ | OpenAI official | Global | `openai-responses` | `web_search` | `json_schema` | `text-embedding-3-small` / `-large` | `gpt-6-astra` · `gpt-5.6-*` (1.05M) |
| ✔ | Anthropic (Claude official) | Global | `anthropic-messages` | `web_search_20250305` / `…0209` / `…0318` | `json_schema` (GA) | none (documented: Voyage AI) | `claude-opus-5` · `claude-fable-5-1` · `claude-sonnet-5` (1M); `claude-haiku-4-5` (200K) |
| ✔ | OpenCode Zen (gateway) | — | all three remote shapes | platform `websearch` / `webfetch` (§5.2) | not established | none | the Zen catalog |
| ✔ | OpenCode Go (gateway) | — | all three remote shapes | platform `websearch` / `webfetch` (§5.2) | `json_object` live-verified on `deepseek-v4-flash` only | none | the Go catalog |
| — | xAI | Global | `openai-chat-completions` / `openai-responses` | `web_search` | `json_schema` / `json_object` | endpoint only, no model stated | `grok-4.6` (500K) · `grok-4.3` (1M) |
| — | Mistral | Global | none of the four (Conversations API) | `web_search` / `web_search_premium`, Conversations API only | `json_object`; custom outputs | `mistral-embed` | `mistral-medium-3-5` · `mistral-large-3` |
| — | Cohere | Global | `openai-chat-completions` (compatibility layer) | `web-search` connector (deprecated 2025-09-15) | `json_object` + `schema` (Chat v2) | `embed-v4.0` | `command-a-plus-05-2026` (128K) |
| — | iFlytek Spark | China | `openai-chat-completions` (also an Anthropic-message path) | `web_search` tool (deep / normal) | not documented | private services, 2,560 dims | `spark-x`; X2-Flash 262,144 max tokens |

Read and not picked, with their evidence kept in §3: xAI (a provider-side `web_search` tool and `json_schema`, outside the Owner's three overseas picks), Mistral (its web search runs only on the Conversations API, which no implemented shape speaks), Cohere (its web-search connector was deprecated on 2025-09-15), and iFlytek Spark (removed by the Owner's round-two answer 「去掉讯飞不要」).

Deliberately outside the list: hosting and aggregation platforms (OpenRouter, SiliconFlow, Azure OpenAI, AWS Bedrock and their kind) — they serve other providers' models and are admitted, if ever, by a separate decision; and model families with no first-party API (Llama and the open-weight families generally) — they reach AI7 only through a listed provider or such a platform.

#### 5.2 The OpenCode `websearch` / `webfetch` decision

The Owner's round-two answer opens with it: the OpenCode documentation's tools chapter 「包含了websearch和webfetch两个工具可以符合我们的要求」, recorded here **as design** (「现在作为文档设计」) — this session changes no route, tool, policy byte or call.

- **What the two tools are** (§3): `webfetch` retrieves a page the model names, and `websearch` performs discovery search "using Exa or Parallel" through the platform's hosted service without an API key. On an OpenCode binding the pair is the **platform-tool** supply of the WS capability of §2.
- **How it is read with ADR 0079 §4.2.** That clause says search is the model's tool, never a local search-engine call, and that AI7 calls no search API and holds no search credential. The Owner's decision reads the first half as: the search tool belongs to the model's provider **or its platform** — the OpenCode platform's hosted search is such a tool — while what stays rejected is AI7 building its own search-engine integration or holding its own search credential. The Owner's privacy sentence is unchanged and binds: the manuscript's text is never published verbatim to a public-access network, and a search query derived from a Task is not the manuscript.
- **Consequences carried into the slices.** S70's Brief names the exact tool of each binding in the plan's 发送 line (EGR-005) and in the policy revision that admits it; whether Zen (as distinct from Go) entitles `websearch` is verified, not assumed — the page says "only when using the OpenCode or OpenCode Go provider"; the tool's backend (Exa or Parallel) is recorded beside the binding as its evidence; and the retention fetch stays AI7's own — the `webfetch`-equivalent the procedure already owns. An OpenCode binding carrying the pair is therefore a first-class candidate for the first search-enabled live item beside the picked providers' provider-side tools.

### 6 · What follows this record

- **The Owner's pick sets S55a's document set.** The supported set lands as one `config/providers/<id>.json` document per provider — the nine domestic providers, the three overseas providers, and Zen (Go's three routes already exist in the code and keep their evidence) — every one inert on arrival. A provider whose official API matches none of the four implemented shapes cannot land this way and waits for the next tier (ADR 0073 §1); the picked set contains none, and Mistral (not picked) is the one that would have needed it.
- The Provider Processing documents that enable the first web-search tool are revisions after v5/v6, each naming the rule's eligibility set and enabling `webSearchToolAllowed` for exactly the bindings whose evidence admits it — a provider-side tool, or the OpenCode platform's pair of §5.2. A policy revision remains the Owner's byte review per ADR 0079 §2.5.
- **Sequencing, stated because it is a real dependency**: the first search-enabled live item needs, beyond this record, the chosen binding's exact form — either the OpenCode route that already exists (`opencode-go`, whose developer key is already enrolled) plus a `developer-live` policy revision naming the platform tools, or a picked provider's configuration document from S55a (#435) plus its policy revision plus that provider's development key enrolled the ADR 0073 §4 way. S70's first live item is a named test under ADR 0070 with its stated question — 「what does the full chain cost」 for the search-enabled path.
- S55a (#435, 1c.10) writes the provider documents and the generator; every route arrives inert, and each profile declares `webSearchTool: 'none'` with the vendor page in evidence until §2's field lands. Its Gemini document records the shape discrepancy of §3 and binds nothing until a shape review establishes which API the endpoint serves today.
- S69 (#417), S81 (#429), S84 (#432) and S77/S17 (#423/#52) write their rows' contracts against this table; none of them transmits before the policy names its rule, and every first transmission on a new binding is a named test item, never a re-transmission of the nine cached items.
- [`provider-support.md`](../development/provider-support.md) grows the same evidence as the documents land; this record is the assignment, the documents are the configuration, and the policy is the authorization.

## Consequences

- The 审阅 surface's search-enabled categories and the evaluation's market section can state their basis in 知识库 (REV-010) only after the policy revision that admits their binding's search tool (§6); until then their disclosed state is 未联网核查, and the plan's 发送 line names the model's web use in editorial language (EGR-005).
- The product can say what it will do with each task's bytes before a provider is chosen, and the settings surface's four role cards gain their real content: a role shows `可用` only when a binding exists for it per scope.
- Adding a provider stays adding a document and a generated row; assigning it stays a policy revision naming the rule's eligible bindings; transmitting stays a named test item. The three acts stay three.
- The production path's gap is now explicit: DeepSeek official has never been observed to answer, so before the first production Run its read-side capabilities must be established — this record names the requirement instead of leaving it to a failed Run.
- Product-side credential storage changes shape: the Owner's §5 direction — one dedicated configuration file, entered from the Settings menu — is the successor of the never-implemented product half of ADR 0073 §4, and the slice that implements it states in its Brief how the file relates to ADR 0067's Protected Secret Store and the developer-live enrollment helper, which stay exactly as they are for the `developer-live` key.

## Rejected alternatives

- **One hard-picked provider per row, frozen in this record.** Rejected by the Owner's own framing: the supported set is chosen once and any member whose capabilities match may serve a row. Capability matching keeps the assignment honest as vendors change, and a per-row exclusive binding would make every model retirement a design revision.
- **Rejecting the OpenCode gateways as search candidates.** Withdrawn by the Owner's §5.2 decision: the platform's `websearch` / `webfetch` pair supplies the WS capability for an OpenCode binding, so the gateways are capability-complete for the search rows; whether the production scope binds to one stays a per-slice policy decision, not a capability gap.
- **A local search API.** Already rejected by the Owner (ADR 0079 §4.2) in favour of the model's own tool.
- **Binding the Difficult Escalation or Frontier role now.** Rejected: no enumerated task requires one, and an unbound role is a truthful `需设置` state, not a gap.
- **Declaring capabilities from the vendors' model-name conventions.** Rejected by the table's existing rule: an unverified capability is `none`, and §3 records only what pages state.
- **Enrolling keys in this session.** Rejected by the Owner: 「配key工作后置……先支持后添加key」 — support (routes, profiles, documents) lands first; a key is added when a slice needs a live transmission.
