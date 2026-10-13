# Provider Processing Policy v10

This is the human projection of [the immutable v10 JSON](provider-processing-policy.v10.json), validated by [its schema](provider-processing-policy.v10.schema.json). It directly succeeds selected developer-live [v9](provider-processing-policy.v9.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). Activation requires the exact [active-set v8](active-policy-set.v8.json) pin and trusted launch carrier; an internal active label grants no dispatch authority.

## What is newly allowed

Under `developer-live` only, on the developer host, with admitted Public SampleBooks only:

1. **Editorial dialogue** (`editorial-dialogue`): the editor selects words in the manuscript and asks, then may 继续回答 or 重新生成. Each of these is one new foreground attempt with one technical session and one bounded payload: the frozen dialogue contract, the selected words, the question and, for continuation, the fragments kept from the stopped answer. Selecting and asking is the authority; no Plan Envelope or Run Authorization is needed. The outbound category is `editor-selected-manuscript-excerpt`. A dialogue has no Run, so no Run Budget Ceiling applies; the account limit still stops the attempt. It uses the **Fast Interaction Role** ([ADR 0088](../adr/0088-carry-the-editorial-dialogue-under-developer-live.md)).
2. **Reference-free review** of three built-in categories: 错别字与规范用语 (`editorial-review/typos-and-usage`), 体例与格式 (`editorial-review/style-and-format`) and 文学性与表达改进 (`editorial-review/literary-expression`). They run like baseline analysis: newly user-initiated Task, direct Run Authorization, Coverage Manifest units, declared safe retries, assurance sample anchors and one Run Report reflection turn, within the same Run ceiling. A review sends only the admitted sample text and the category's built-in guideline; it carries no Material References, Series Knowledge or editorial deliverables, and has no cross-unit reduction. It uses the Main Editorial Role, on which [ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) runs these rows until a slice needs the cheaper tier.
3. **Role bindings** are declared: the Main Editorial Role and the Fast Interaction Role are both bound to the one route below. The Difficult Escalation Role and the Frontier Model Role are user-configurable and unbound by default; no rule names them, so configuring one authorizes no transmission.

## What stays exactly as v9

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Baseline rule | `developer-live-public-samplebook-analysis`, byte-equivalent to v9's only rule |
| Data | `public-or-synthetic` for analysis and review, `editor-selected-manuscript-excerpt` for dialogue, always restricted by runtime to admitted sample lineage and permitted tester edits |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`, for every rule |
| Budget | Analysis and review: existing non-unset Run ceiling, default 30,000 tokens per frozen unit, evaluated before every dispatch |
| Account limit | `quota-exhausted` ends the Run or attempt; no retry, second model, Provider or spending-source fallback |

## What stays refused

The default is deny. Still refused: writing, evaluation (AI7 初评, 审稿意见, 按我的评分重写评语), 润色, conflict regeneration, every web tool, and every other task kind. Among review categories, 事实核查, 学术道德与引用 and 出版政策与风险 (web-bearing), 书系一致性 (Series Knowledge), 跨交付物一致性 (deliverables) and any review with attached Material References stay refused; 情节逻辑与前后一致 calls no model. Default Execution Rules, Background Analysis Enrollment, idle/scheduled/import-triggered/cross-Run dispatch, private manuscripts and the unpublished data categories remain refused. Ordinary production is unchanged.

House people names/roles, remarks and internal notes are stripped; author information and house name may be included. The enrollment helper alone reads the key file; the Credential Broker releases the secret only to the final adapter. Request/response captures stay outside every checkout and never enter logs, diagnostics, uploads or Git. Similar development evidence is reused under ADR 0089 and the existing protected Ledger/Result Cache; ordinary user business never inherits this cache or development credential.

Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission. A dialogue answer changes no manuscript.
