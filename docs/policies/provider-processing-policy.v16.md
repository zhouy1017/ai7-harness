# Provider Processing Policy v16

This is the human projection of [the immutable v16 JSON](provider-processing-policy.v16.json), validated by [its schema](provider-processing-policy.v16.schema.json). It directly succeeds selected developer-live [v14](provider-processing-policy.v14.md) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), [ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) §5 and §7, [ADR 0074](../adr/0074-admit-a-bounded-research-egress-and-a-runtime-factual-verification-policy.md) and the Owner's decisions on web search (Issue #473, #883). Activation requires the exact [active-set v12](active-policy-set.v12.json) pin and the trusted launch carrier; an internal active label grants no dispatch authority. Local production for the editor's own manuscripts is a different scope with its own document, [v17](provider-processing-policy.v17.md).

## In plain words

Everything v14 allowed under `developer-live` it still allows, on the same Go route (`opencode-go` / `deepseek-v4.1-flash`, broker slot `opencode-go`) and the same eight rules. The one change: three kinds of work may now look things up on the public web while they run, through two tools AI7 itself provides — **websearch** and **webfetch**. Each rule is eligibility only: it authorizes no Run, no Apply, no export and no publication, and it does not by itself make a tool run; the product slice that executes the tools decides that within these terms.

## What is newly allowed

1. **Who may search and fetch.** Exactly three rules turn the web switch on (`transmissions.webSearchToolAllowed: true`) and carry a `platformTools` block:
   - **Review** — its existing kinds, and now also **事实核查** (`editorial-review/factual-review`, executed as `factual-review`) and **学术道德与引用** (`editorial-review/academic-integrity`) as kinds of the review rule;
   - **Writing** (`writing`);
   - **Evaluation** — the three contracts (`evaluation`, `readers-report`, `evaluation-rewrite`; 评估 · 市场 needs the web).

   Editorial dialogue, baseline analysis, 润色这段, 稿件冲突 › 基于当前稿件重新生成建议 and enrolled background analysis keep `webSearchToolAllowed: false` and name no tool.
2. **The user chooses the search backend.** `websearch.selection` is `user-configured`: the user picks one backend among the five that the search backend evaluation shipped (#883), listed in its recorded ranking order — TinyFish `search-tinyfish` (the default, rank 1), DeepSeek server-side search `search-deepseek`, Brave `search-brave`, Parallel `search-parallel` and 博查 `search-bochaai`. Each entry names the backend's id, the one host its searches may address, its endpoint, its development broker slot and the development Credential Reference its provider document fixes; none is anonymous. A backend outside this list appears in no rule. The launch checks the list against the search backend registry: any host, endpoint, slot or order that differs is a policy it cannot read.
3. **What leaves AI7.** Only the model's own search query is sent to the selected search host (category `web-search-query`); manuscript text is never the query. webfetch requests only a public `https` page the model cited (category `public-source-fetch`), at most **5,242,880 bytes** and **30 seconds** per page (`webfetch.boundedByCitations: true`). What the tools return is treated as public material (`toolResultCategory: "public-or-synthetic"`).
4. **Bounds.** One search query per Run unit (`oneQueryPerRunUnit: true`). A unit that reaches **128** consecutive tool round trips is ended by the breaker and disclosed as **联网核查未完成** (`breaker`). The Run Budget Ceiling remains the only budget; the breaker is not one.

## What stays exactly as v14

| Boundary | Exact admission |
| --- | --- |
| Scope | Developer host `developer-live`; CI and hosted execution refused |
| Rules | The same eight rules; dialogue, baseline analysis, 润色, conflict regeneration and enrolled background analysis are byte-for-byte v14's |
| Binding | `opencode-go/deepseek-v4.1-flash`, `https://opencode.ai/zen/go/v1/chat/completions`, broker slot `opencode-go`; Role bindings unchanged |
| Origins, ceilings, clarification | As v14: newly user-initiated Tasks (writing and review also by quick start), the enrollment's mandatory ceiling for background Runs, one model question per unit on the Run-based rules |
| Capture | The protected local cache outside every checkout; raw bytes never in logs, diagnostics, uploads or Git |

## What stays refused

The default is deny. Still refused: **出版政策与风险** (`editorial-review/publication-risk`, in no rule until its web declaration), **书系一致性** (Series Knowledge) in any live rule, any web tool for dialogue, baseline analysis, 润色, conflict regeneration or background Runs, any search backend the evaluation did not ship, a provider-side search tool, private manuscripts, the unpublished data categories, hosted and CI execution, fact-check as its own kind, and every other task kind. House people names/roles, remarks and internal notes are stripped from every rule; author information and house name may be included.

## How a launch uses it

The launch resolver verifies this document byte for byte against the active-set pin and reads every rule whole. Each projected rule (`providerProcessing.admittedRules`) now also carries `webSearchToolAllowed` and `platformTools` — the selectable backends (id, host, broker slot), the webfetch bounds and the breaker — or `null` for a rule without web. Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission.
