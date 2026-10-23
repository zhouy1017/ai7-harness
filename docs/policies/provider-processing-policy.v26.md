# Provider Processing Policy v26

Canonical authority: [v26 JSON](provider-processing-policy.v26.json), validated against its [exact schema](provider-processing-policy.v26.schema.json). This immutable ordinary-production successor of [v25](provider-processing-policy.v25.json) is selected by [active set v18](active-policy-set.v18.json) only when the coherent successor integrates at the intended target. [ADR 0095 §§2–6](../adr/0095-make-procedures-the-central-object-govern-concurrent-execution-and-use-dsh-as-the-complex-task-harness.md) supplies the authority.

## In plain words

v26 carries the eligibility declarations needed for Wave 20's execution governor, declared local tools, review contracts, procedures and claim ledger. It creates no provider call and implements none of those consumers. The launch verifies every new declaration exactly and continues to project the existing runtime admissions. F-21b owns the expanded projection and runtime model table; the subsequent consumer slices own execution. No predecessor bytes or existing Run binding change.

## What is newly allowed

The root `execution` block authorizes governed concurrency and background dispatch through three configurable defaults, each stated as `{ configurable: true, default: n }`: `maxInFlightRequests` 4 (model requests in flight across the app), `perRunUnitParallelism` 3 (units in flight per Run) and `backgroundShare` 1 (one background slot, what capacity minus one yields under today's two-Run capacity). The launch verifies the shape and the defaults; the effective numbers are runtime configuration under ADR 0095 §2, so changing them needs no policy successor. `backgroundShare` replaces the background rule's fixed `backgroundSlotShare: "capacity-minus-one"`; its new precondition `backgroundShare: "execution.backgroundShare"` refers to that configuration. This does not admit a new background origin, remove the mandatory enrollment ceiling or change the current dispatcher.

The root `transport.requestDeadlineSeconds` is 180. `transport.rateLimitRetry` is exactly `{ honourRetryAfter: true, maxRetries: 1 }`. This eligibility covers one bounded retry of a provable rate-limit refusal on a retryable route. Account quota/balance limits remain terminal, and a request that may have been sent is never automatically resent. Go's current declaration and its bare-429 handling remain unchanged pending separate capability evidence and implementation.

Every currently retrieval-enabled rule declares `retrieve`, `exact_fetch`, `read_blocks`, `baseline_facts`, `guideline_clause`, `term_table` and `search_manuscript` in `localTools.declarations`. Each entry is read-only and concurrency-safe (`readOnly: true`, `concurrencySafe: true`); `localTools.parallelCallsAllowed: true` permits parallel calls only for those declarations. Sources remain the Run's authorized pinned sources with no egress; retrieval retains its five calls of eight candidates per unit, Exact Fetch before citation and 128-round-trip breaker. Enrolled background analysis, material translation and custom analysis gain no declarations or parallel calls.

The review rule adds `transmissions.crossUnitSynthesisAllowed: true` and `transmissions.plusDeclaredContractRetryAdaptations: true`, within the existing Run authorization and transmission bound. The consumer contract permits one bounded contract retry. The rule adds `editorial-review/publication-risk` to `allowedTaskKinds`, with `taskKindOverrides` declaring `{ "editorial-review/publication-risk": { webSearch: false } }`: risk points only, disclosed as 未联网核查. Other research review kinds retain their existing web declarations. The root `research.searchesPerClaim` is 3, the claim-ledger default; existing per-unit web-tool execution is unchanged in this slice.

Only the review rule adds these outbound categories and declarations:

- `editor-task-instruction` (编辑任务说明), declared by `editorTaskInstruction`: at most 1,200 graphemes, attributed to the exact procedure version, never a person's name, and never an override of AI7's contract framing.
- `house-review-guideline-clause` (本社审阅规范条款), declared by `houseReviewGuidelineClause`: at most 40 clauses of at most 300 graphemes each, attributed to the imported document version, never a person's name.

These are bounded instructions and guideline clauses, not an admission of remarks or internal notes. Their category labels, bounds, attribution and name restrictions are checked at launch; composing and checking their actual payload belongs to the later consumers.

## What stays exactly as v25

All model-role bindings, allowed routes, endpoints, models, credential slots and the independent Main/Fast selections remain byte-for-byte equal in meaning and values. The separate explicit synthetic connection test retains its fixed public input, 256-character input and 512-token output bounds, one request, no automatic retry, and no retained response body. OpenAI's two admitted buffered-text choices remain limited to Fast 来源译文 and that probe.

All existing source, redaction, Run, enrollment, budget, credential-broker, final Egress Gate, Apply, export and publication boundaries remain. A declaration is eligibility only. No policy key configures a credential, selects a binding, dispatches a Task, authorizes a payload by itself or supplies a missing capability. No Data Version or old Run binding is rewritten.

## What stays refused

Shell, process execution, roaming filesystem, arbitrary network and code-runtime tools remain excluded. No new background origin, developer-live source, fallback model, account-limit retry, automatic resend after a possibly sent request, unbounded instruction, person's name in either new category, or contract-framing override is admitted. Apply, learning, external export and publication still need their independent authority.

## How a launch uses it

Trusted source-checkout launch authority selects active set v18. Its ordinary-production pin names v26's exact path and SHA-256; the carrier and launch resolver also pin the active set's exact bytes. Missing, unknown, altered or differently shaped declarations deny processing. The verifier checks the Wave 20 declarations before reading the existing runtime terms; it does not expose the newly eligible fields to consumers yet.

Development-ci v1, fixture-recording v2, developer-live v24 and External Export v2 pins remain unchanged. Every launch reports active set v18, while its single trusted operational scope still chooses its own policy. Reverting selection requires a reviewed predecessor activation; editing a predecessor is never rollback.
