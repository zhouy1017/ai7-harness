---
status: accepted — reuse and autonomous execution clarified by ADR 0089
---

# Authorize the OpenCode Go development credential with live-once provider testing

The Owner authorizes necessary OpenCode Go tests within the current rules, existing product Run budget semantics and subscription limits, executed autonomously by the assigned agents. [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and [Orca dispatch](../agents/orca-dispatch.md) own dispatch and review; this decision owns credential protection and development-only evidence reuse. It grants no live access to CI.

## Credential boundary

The untracked `opencodego.key.txt` at the main checkout root is read only by `tools/enroll-dev-credential.mjs`. The helper enrolls the value into the Protected Secret Store under the `opencode-go` slot and reports only `present`, `absent` or `unavailable` when checked. No agent reads, prints, hashes, copies or exposes a key in prompts, environments, commands, diagnostics, Issues, logs or repository files. The Credential Broker supplies it only to an authorized final adapter. Ad hoc key-bearing scripts and general network tools are outside this path.

## Live once, then reuse

The existing Provider Test Ledger and Provider Result Cache remain the single host-local development evidence owner, outside every checkout. Each live item records a stated validation question, model/route, prompt contract, request identity, usage, time and outcome. Raw request and response bytes remain protected local capture; repository admission uses reviewed, sanitized fixture tooling.

Two reuse boundaries are distinct:

- **Exact response reuse:** the same configured route/model and exact canonical request may replay its saved response. The response retains its original capture identity and date; replay is never fresh evidence about the current remote model.
- **Similar validation reuse:** the same capability or business question under an unchanged semantic contract, with only technical identities or other immaterial differences, reuses prior fixtures and regression evidence. A different actual input is not answered with the old response. Changing a Run UUID, sequence, worktree, title or display wording does not by itself justify a new live item.

Necessary new semantic evidence may be collected autonomously: state what the existing evidence cannot answer, use the smallest representative admitted input, execute only the required delta, save the result, and reuse it thereafter. New behavior, a material prompt/contract change, a new input class, a changed route/model/protocol, or an unproven failure mode may justify it. Deterministic UI, storage, projection, recovery and bookkeeping changes normally reuse fixtures. Each test report distinguishes live capture, exact cache replay and fixture regression, together with the original model/contract/date. No additional per-call approval, daily quota or fixed test-count cap is introduced.

A request already sent with an unknown result is possibly processed and billed. It is retained as unknown rather than reset by a cache miss, renamed item or new Run. A repeat requires a stated necessary retry/new-evidence reason within existing product Run budget semantics and subscription limits; it must not be silently resent. Invalidated evidence keeps its reason and original identity. Cache loss, corruption, concurrent misses and restart must not manufacture permission to pay for the same test again.

The P0 reuse slice [#808](https://github.com/zhouy1017/ai7-harness/issues/808) extended the existing Provider Test Ledger and Result Cache in place, with no second status ledger. An exact replay is keyed by the request namespace (route, endpoint, request shape, model) and the request digest; a launch names its stable validation family/case, and a same or similar validation selects earlier evidence rather than another input's answer. A durable pre-send claim keeps a possibly billed unknown across restart and concurrent misses, so a repeat needs a stated necessary retry reason and a stopped sender, and an occupied item id is still refused.

## Spend and account limits

Use the existing product Run Budget Ceiling and the subscription's account limits; avoid duplicate work and unproductive loops while completing the task. Record actual live usage separately from replayed usage. The gateway's stated account-limit response — a 402, or a body naming quota or balance; a bare 429 on a route declared rate-limit-retryable is a rate limit handled by backoff under [ADR 0095 §2](./0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md#2-an-execution-governor-and-real-throughput) — ends the live attempt as `quota-exhausted`; keep any stated reset window, report it, and stop without fallback to Zen balance or another paid route. No numeric subscription allowance is asserted by this document.

## Development and production

Development reuse applies only to tests and fixtures. Every newly authorized product Task uses its own manuscript, selection, question and current sources through the product's processing scope; similar earlier user questions are not a business-response cache hit. A fresh user Task is not a repeated development test.

The runtime binds `opencode-go/deepseek-v4.1-flash` under active-policy-set v7 and baseline-only Provider Processing v9 ([#807](https://github.com/zhouy1017/ai7-harness/issues/807)); earlier V4 Flash evidence keeps its actual model. The ordinary-production local controlled trial remains the P0 migration [#811](https://github.com/zhouy1017/ai7-harness/issues/811) in the development plan. The official DeepSeek route is retained. Repository-development agents use the subscriptions and models selected by Orca dispatch; those orchestration bindings are distinct from the product's Model Roles.
