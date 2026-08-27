# Provider Processing Policy v3

Status: **policy-version lifecycle `active`; repository authority is target-qualified; default deny with two ordinary-production eligible-only rules**

The authority-bearing serialization of this immutable policy version is [`provider-processing-policy.v3.json`](provider-processing-policy.v3.json), validated by its self-contained Draft 7 [`provider-processing-policy.v3.schema.json`](provider-processing-policy.v3.schema.json). Its `lifecycleStatus: "active"` describes the version internally. Repository-current authority additionally requires an exact integrated `dev` target whose same-tree [`active-policy-set.v3.json`](active-policy-set.v3.json) ordinary-production pin matches identity, version, path and SHA-256. Before integration, this record is accepted-but-unintegrated.

This Markdown file is a human-readable projection and carries no independent authority. The immutable [`v1`](provider-processing-policy.v1.json) and [`v2`](provider-processing-policy.v2.json) records remain unchanged for their trusted operational scopes.

## Identity and scope

- Policy identity: `provider-processing-policy`
- Version: `v3`
- Predecessor: immutable v2
- Operational scope: `ordinary-production`
- Default: deny
- Rules: exactly two, both **eligible only**

Provider v3 is selected only by trusted build/launch authority through active policy set v3. It cannot be selected by an ordinary setting, environment variable, Provider, artifact or Plugin; cross-scope fallback is forbidden. Selection does not configure a Provider or dispatch a Run.

## Eligible foreground work

Rule `user-initiated-production-run-processing` applies only after a newly user-initiated Task creates an exact Run, either through direct Run Authorization or because an active Default Execution Rule exactly matches that new Task. A Default Execution Rule alone never invents or schedules work.

The Run may declare any of the four Outbound Data Categories, including unpublished full content, only inside its exact source/data/Provider envelope. It requires an eligible configured Provider, Provider Preflight, exact Provider Binding and allowed fallback chain, Plan Envelope, Run Authorization, Run Source Scope, declared model-operation classes, exact Run Budget Ceiling state and the final Provider Payload/Egress Gate. `unset` is permitted as the ordinary-production ceiling state.

Declared generation, remote embedding, reranking, subagent work, covered analysis, reducer stages and asynchronous continuation inherit the unchanged Run envelope. Moving the same Run out of the foreground changes presentation only. An undeclared operation or expanded Provider/data/source/budget scope requires Plan Revision and renewed authorization.

No second per-Book, first-use, per-call or per-chunk privacy prompt is required inside the exact authorized Run.

## Eligible background manuscript analysis

Rule `enrolled-background-manuscript-analysis-processing` requires a matching active Background Analysis Enrollment and a newly created exact Run for every autonomous dispatch. It is limited to enrolled manuscript analysis. It grants no formal manuscript mutation, external Effect, general background learning or background Policy work.

Provider onboarding may present a separate explicit Enrollment action. Provider setup, import and artifact install/enablement never create or activate one. An Enrollment without a matching exact dispatch is not a Provider call authorization.

The background Run uses the same exact Provider, Plan, source/data, operation-class, budget and final egress requirements as foreground work. A new idle, scheduled, post-checkpoint, import-triggered or cross-Run dispatch requires the still-active matching Enrollment.

## Credential and authority separation

Credential values remain outside model-visible and general outbound material. Only the Credential Broker resolves an opaque reference at the final authorized adapter. Values never enter repositories, prompts, Session text, generic environments, logs, diagnostics or tool results.

Policy eligibility does not create a Provider implementation or dispatch. Provider configuration, credentials, readable scope, installation, enablement, DSH Session/Plugin membership, Default Execution Rule without a new user Task, Enrollment without an exact Run, External Export Policy or Effect Approval cannot fill a failed rule match.

Provider Processing is controlled model processing only. It grants no formal Manuscript Apply, external export, learning, publication, Public Release Permission or outcome proof.

## No implementation or activation claim

This record selects no Provider, model, endpoint, adapter or credential and proves no launch selector or product path exists. It cannot auto-activate: the stricter existing developer-review rule governs this authority-changing Policy revision until separately superseded.
