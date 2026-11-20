---
status: accepted — reuse and autonomous execution clarified by ADR 0089; identity-normalised replay added by the amendment of 2026-11-20
---

# Authorize the OpenCode Go development credential with live-once provider testing

The Owner authorizes necessary OpenCode Go tests within the current rules, existing product Run budget semantics and subscription limits, executed autonomously by the assigned agents. [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and [Orca dispatch](../agents/orca-dispatch.md) own dispatch and review; this decision owns credential protection and development-only evidence reuse. It grants no live access to CI.

## Credential boundary

The untracked `opencodego.key.txt` at the main checkout root is read only by `tools/enroll-dev-credential.mjs`. The helper enrolls the value into the Protected Secret Store under the `opencode-go` slot and reports only `present`, `absent` or `unavailable` when checked. No agent reads, prints, hashes, copies or exposes a key in prompts, environments, commands, diagnostics, Issues, logs or repository files. The Credential Broker supplies it only to an authorized final adapter. Ad hoc key-bearing scripts and general network tools are outside this path.

## Live once, then reuse

The existing Provider Test Ledger and Provider Result Cache remain the single host-local development evidence owner, outside every checkout. Each live item records a stated validation question, model/route, prompt contract, request identity, usage, time and outcome. Raw request and response bytes remain protected local capture; repository admission uses reviewed, sanitized fixture tooling.

Three reuse boundaries are distinct; the second is added by the [amendment of 2026-11-20](#amendment-of-2026-11-20--identity-normalised-replay-in-developer-live):

- **Exact response reuse:** the same configured route/model and exact canonical request may replay its saved response. The response retains its original capture identity and date; replay is never fresh evidence about the current remote model.
- **Identity-normalised replay (developer-live only):** the same exact question asked again with only newly minted identities replays the capture's response, mapped onto the new identities, under the checks of the amendment.
- **Similar validation reuse:** the same capability or business question under an unchanged semantic contract, with only technical identities or other immaterial differences, reuses prior fixtures and regression evidence. A different actual input is not answered with the old response. Changing a Run UUID, sequence, worktree, title or display wording does not by itself justify a new live item.

Necessary new semantic evidence may be collected autonomously: state what the existing evidence cannot answer, use the smallest representative admitted input, execute only the required delta, save the result, and reuse it thereafter. New behavior, a material prompt/contract change, a new input class, a changed route/model/protocol, or an unproven failure mode may justify it. Deterministic UI, storage, projection, recovery and bookkeeping changes normally reuse fixtures. Each test report distinguishes live capture, exact cache replay and fixture regression, together with the original model/contract/date. No additional per-call approval, daily quota or fixed test-count cap is introduced.

A request already sent with an unknown result is possibly processed and billed. It is retained as unknown rather than reset by a cache miss, renamed item or new Run. A repeat requires a stated necessary retry/new-evidence reason within existing product Run budget semantics and subscription limits; it must not be silently resent. Invalidated evidence keeps its reason and original identity. Cache loss, corruption, concurrent misses and restart must not manufacture permission to pay for the same test again.

The P0 reuse slice [#808](https://github.com/zhouy1017/ai7-harness/issues/808) extended the existing Provider Test Ledger and Result Cache in place, with no second status ledger. An exact replay is keyed by the request namespace (route, endpoint, request shape, model) and the request digest; a launch names its stable validation family/case, and a same or similar validation selects earlier evidence rather than another input's answer. A durable pre-send claim keeps a possibly billed unknown across restart and concurrent misses, so a repeat needs a stated necessary retry reason and a stopped sender, and an occupied item id is still refused.

## Spend and account limits

Use the existing product Run Budget Ceiling and the subscription's account limits; avoid duplicate work and unproductive loops while completing the task. Record actual live usage separately from replayed usage. The gateway's stated account-limit response — a 402, or a body naming quota or balance; a bare 429 on a route declared rate-limit-retryable is a rate limit handled by backoff under [ADR 0095 §2](./0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#2-an-execution-governor-and-real-throughput) — ends the live attempt as `quota-exhausted`; keep any stated reset window, report it, and stop without fallback to Zen balance or another paid route. No numeric subscription allowance is asserted by this document.

## Development and production

Development reuse applies only to tests and fixtures. Every newly authorized product Task uses its own manuscript, selection, question and current sources through the product's processing scope; similar earlier user questions are not a business-response cache hit. A fresh user Task is not a repeated development test.

The runtime binds `opencode-go/deepseek-v4.1-flash` under active-policy-set v7 and baseline-only Provider Processing v9 ([#807](https://github.com/zhouy1017/ai7-harness/issues/807)); earlier V4 Flash evidence keeps its actual model. The ordinary-production local controlled trial remains the P0 migration [#811](https://github.com/zhouy1017/ai7-harness/issues/811) in the development plan. The official DeepSeek route is retained. Repository-development agents use the subscriptions and models selected by Orca dispatch; those orchestration bindings are distinct from the product's Model Roles.

## Amendment of 2026-11-20 — identity-normalised replay in developer-live

The Owner chose option 1 of [#1585](https://github.com/zhouy1017/ai7-harness/issues/1585) on 2026-11-20 (recorded in wave [#1540](https://github.com/zhouy1017/ai7-harness/issues/1540)): identity-normalised prerequisite replay in developer-live only, with product-owned identity mapping, immutable capture provenance and exact semantic, source and contract checks; an earlier response never answers materially different input. Product behaviour and every product request stay unchanged.

**What it does.** A fresh Book asks the analysis path's questions with newly minted identities, so no request is byte-identical to the evidence that already answers it. Before this amendment such a call was refused (`PROVIDER_VALIDATION_EVIDENCE_EXISTS`) or, where the existing similarity check did not recognise the message, needed a paid resend. Now, under a development validation launch, the once-only transmission (`src/service/provider/live-transmission.ts`) answers it from the newest valid capture that passes all three checks:

1. **Contract:** the same generation — route, endpoint, request shape, model, prompt contract and task contract.
2. **Semantic and source:** the request is equal to the capture's as canonical JSON (parsed and re-serialised with sorted keys, so key order and whitespace between JSON tokens are ignored; every string compares character for character) once a closed set of minted slots is replaced (`src/service/provider/identity-replay.ts`). Only messages that start with an analysis-path task header are normalised (分析单元, 保证抽样, 跨单元归纳, 运行反思, 事实核查单元, 评估单元 / 评估综合, 审稿意见单元 / 审稿意见综合, 评语重写单元 / 评语重写综合, 写作单元 / 写作综合, 审阅单元). Single-request kinds (润色这段, 冲突重新生成, 编辑对话, 来源译文, 局部修改) stay exact-only. Everything else stays exact in that sense, including manuscript and material text, the system prompt, ordinals and every digest.
3. **Mapping:** the slots map one-to-one, and the answer can be carried over safely.

**The slots and what each hides.** Each slot is normalised only in the message section where its builder writes it:

- a manuscript block identity, minted at random per import, at the start of a block line in a unit message or in a 保证抽样 message before its finding header, and in a 跨单元归纳 cited-block listing (its kind, level and text are the rest of the line, exact);
- the Run identity in the reflection header, minted at random per Run (the accounting and its digest stay exact);
- a sampling finding's handle in `- [ref]（tier）text`, after the 保证抽样 finding header only. It is not content-free: for the baseline kind it is the finding's list index, for factual review a `fnd_…` hash over the anchoring block identity and the quotation (the tier and text stay exact).

A recognised message that already contains a slot placeholder is not normalised, and the slots must match by count and kind, so the mapping is one-to-one.

Header and request digests (单元摘要, 抽样摘要, 单元集摘要, 账目摘要, 依据摘要, 段落摘要, the clarification line's 请求摘要) are **not** normalised. They are identity-free by construction, and some cover values the body does not carry, such as a unit's block positions or an observation's block ordinals. So they stay exact; the same text imported again yields the same digests. In the answer, block identities are rewritten onto the new ones. A changed Run identity or finding handle that the answer repeats cannot be rewritten safely, so that call keeps the refusal and nothing is sent.

**Provenance.** The capture's entry is never modified, copied or re-keyed; the mapped answer exists only in memory. The ledger line is `replayed` with decision `identity-replay`. It names the one capture it rests on as its evidence and keeps that capture's time and original usage; it incurs nothing. A replay sends nothing and takes no send claim, so cancellation, pause, restart and relaunch replay again without a send. Fixture generation still converts only the original capture: an `identity-replay` line converts to nothing (`FIXTURE_GEN/capture-unproven`). A new final request — for example a synthesis carrying a frozen chapter-synopsis supplement — differs from every capture by construction. It is decided, authorized and accounted as before (`first-capture`, `input-delta` or `config-delta`). A reflection whose accounting counts the current Run's replays is another question too, and similar evidence still refuses it.

**Three consequences beside the earlier decisions.** The replay is decided before the held-request and similar-evidence steps, so, for a request with a recognised task header:

- a request declared as `retry-unknown` that a sibling capture answers is replayed, not resent, and its unknown stays held (before this amendment it was sent as the declared retry);
- a byte-identical request whose own capture was superseded at its cache key by a capture of another generation is replayed from that superseded capture as `identity-replay` (before, it was refused);
- a replay crosses validation family, case and step: invalidating the asking family does not stop it, only retiring the answering capture does.

**Scope.** Developer-live only: `transmitOnce` is reached solely under a development validation launch. Ordinary production, business Tasks, CI and the Gate neither read nor write the cache, and nothing a model is sent changes.

**The shared ledger and older readers.** The ledger is shared by every checkout on a developer host. A reader built before this amendment (0.7.3, and 0.7.4, which carries the same reader) holds a closed decision list. It refuses the whole ledger as `PROVIDER_LEDGER_CORRUPT` once an `identity-replay` line exists, so developer-live on such a build stops on that host. This is a one-way consequence of the first identity replay, and older readers are not changed. Their fixture tool and evidence scorer still read the line: the scorer labels it `cache`, and the fixture tool refuses to convert it.

**Ledger comparison.** `node tools/generate-provider-configuration.mjs --ledger <cache root>` compares the record only with transmitted lines, so replays never appear there. Successful calls kept external, never admitted to the record, are listed as "transmitted but not recorded"; that is expected for unadmitted items, and a slice reporting the check says so.
