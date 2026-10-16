# Provider Processing Policy v19

This is the human projection of [the immutable v19 JSON](provider-processing-policy.v19.json), validated by [its schema](provider-processing-policy.v19.schema.json). It directly succeeds the `ordinary-production` document [v17](provider-processing-policy.v17.md) and is written in the same schema family as developer-live [v18](provider-processing-policy.v18.md), so the launch resolver reads both the same way. It is selected by [active-set v13](active-policy-set.v13.json) under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), [ADR 0026](../adr/0026-manuscript-retrieval-returns-candidates.md), [ADR 0047](../adr/0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md) and [ADR 0080](../adr/0080-assign-a-provider-route-and-model-to-every-task-that-transmits.md) §5 and §7; an internal active label grants no dispatch authority.

## In plain words

Everything v17 let the editor do with their own manuscripts, on their own computer, with their own model-service account, v19 still lets them do — the same eight rules, the same two model routes, the same redaction, ceilings, account-limit stop and web tools on the same three rules (see [the v17 projection](provider-processing-policy.v17.md)). Two things are new. While a model works on a unit, it may now **look things up in the Book's own authorized sources** through a tool AI7 runs on the editor's computer — targeted retrieval. And **来源译文**, a Chinese translation of source text, becomes a named step: a ninth rule translates one 资料库 excerpt, and the research review rule states the term for a retained external source's passage. Both are eligibility only: the rule authorizes no Run, Apply, export or publication, and it does not by itself make the tool or the translation run.

## What is newly allowed

Every rule that admits a model task kind carries a `localTools` block beside `platformTools`, except enrolled background analysis:

1. **What the tool may read.** Only what the Run was authorized to read (`source: "authorized-pinned-sources-only"`): the editor's pinned Manuscript Revision of the Book, the 允许参考 items at their frozen index version, and the sources the Run retained. Nothing else on the computer and no other Book's material.
2. **That it sends nothing.** The tool runs inside AI7's process (`scope: "no-egress"`): no request to any host, no Egress Gate ticket, nothing leaves the computer. What it returns enters the model's context under the outbound categories the rule already lists; the transmissions, bindings and routes of the rule are unchanged.
3. **The per-unit cap.** At most **5** retrieval calls per Run unit (`callsPerUnit: 5`), each returning at most **8** ranked candidates (`candidatesPerCall: 8`). A candidate is a pointer with its anchor, not a quotation, and proves neither relevance nor coverage.
4. **Quotation needs an Exact Fetch.** A passage may be quoted or cited only after an Exact Fetch of that exact record against the pinned revision (`exactFetchRequiredBeforeCitation: true`); a citation without one is refused by the result validator.
5. **The breaker.** A unit that reaches **128** consecutive tool round trips ends as **检索未完成** (`breaker`). It is a loop guard; retrieval calls and the tokens their results add count into the Run Budget Ceiling, when the editor sets one.

6. **来源译文 of a 资料库 material.** The ninth rule, `ordinary-production-material-translation` (kind `material-translation`), runs on the Fast Interaction Role with the editor's own configured binding, like the dialogue rule. It is one foreground editor action: one session and one bounded payload — a frozen excerpt of a 资料库 item (outbound category `frozen-material-reference-excerpt`, with the same unpublished classes every production rule names) — and the model returns a Chinese translation labelled as machine translation. It has no Run and so no Run ceiling when the editor sets none, no web, no question and no retrieval; its output replaces nothing and applies nothing, and the cache, ledger and development credential are never consulted.
7. **The review rule's translation term.** The research review rule also states `sourceTranslationAllowed: true`, the same term as developer-live v18; the product acts on it for a retained external source's passage under developer-live today, and no other rule states it.

## What does not use retrieval

**Enrolled background analysis** and the **来源译文 rule** carry the same block with `targetedRetrieval.allowed: false`: a background Run makes no model-initiated retrieval, as it makes no web call, and a bounded translation of one excerpt has nothing to search. Apart from the ninth rule and the review rule's translation term, every rule's other terms are v17's, unchanged.

## What stays exactly as v17

| Boundary | Exact admission |
| --- | --- |
| Scope | The editor's own computer; hosted and CI execution refused; the Provider Result Cache, the Provider Test Ledger and the development credential are never consulted |
| Rules | The same eight `eligible-only` rules — kinds, origins and one-question-per-unit clarification — and, appended, the 来源译文 rule |
| Routes | The Main Editorial and Fast Interaction Roles are user-configurable among OpenCode Go `deepseek-v4.1-flash` (default) and the official DeepSeek platform `deepseek-flash`; the launch resolver fills each admitted rule from the binding the launch supplies and reports `bindingState: setup-required` with no admitted rule when none is configured |
| Web | `platformTools` unchanged: the editor's own key for the selected search backend, citation-bound webfetch, 128-round-trip breaker ending 联网核查未完成 |

## What stays refused

The default is deny. Still refused: **出版政策与风险**, **书系一致性** (Series Knowledge), web tools outside the three research rules and in background Runs, any search backend the evaluation did not ship, hosted and CI execution, the unpublished data categories, and every other task kind. Retrieval never stands in for covered analysis: a Task that claims whole-manuscript coverage still enumerates the whole pinned revision.

## How a launch uses it

The launch resolver verifies this document byte for byte against the active-set pin and reads every rule whole, the `localTools` block included. Until a model service is configured the projection admits no rule (`bindingState: "setup-required"`); once the launch supplies an allowed binding, each admitted rule (now nine) also carries the verified `localTools` terms (`providerProcessing.admittedRules[].localTools`) and `sourceTranslationAllowed`, `true` for the research review rule alone. Provider eligibility is not Run Authorization, Apply, export, learning, publication or public release permission.
