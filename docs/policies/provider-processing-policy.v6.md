# Provider Processing Policy v6

Status: **policy-version lifecycle `active`; repository authority is target-qualified; default deny with two ordinary-production eligible-only rules, the three declared suboperations, the per-frozen-unit Run Budget Ceiling default, and the house-people redaction rule**

The authority-bearing serialization of this immutable policy version is [`provider-processing-policy.v6.json`](provider-processing-policy.v6.json), validated by its self-contained Draft 7 [`provider-processing-policy.v6.schema.json`](provider-processing-policy.v6.schema.json). Its `lifecycleStatus: "active"` describes the version internally. Repository-current authority additionally requires an exact integrated `dev` target whose same-tree [`active-policy-set.v5.json`](active-policy-set.v5.json) ordinary-production pin matches identity, version, path and SHA-256. Before integration, this record is accepted-but-unintegrated.

This Markdown file is a human-readable projection and carries no independent authority. The immutable [`v1`](provider-processing-policy.v1.json), [`v2`](provider-processing-policy.v2.json), [`v3`](provider-processing-policy.v3.json), [`v4`](provider-processing-policy.v4.json) and [`v5`](provider-processing-policy.v5.json) records remain unchanged for their trusted operational scopes.

## Identity and scope

- Policy identity: `provider-processing-policy`
- Version: `v6`
- Predecessor: immutable v3
- Operational scope: `ordinary-production`
- Default: deny
- Rules: exactly two, both **eligible only**

Provider v6 is selected only by trusted build/launch authority. It cannot be selected by an ordinary setting, environment variable, Provider, artifact or Plugin; cross-scope fallback is forbidden. Selection does not configure a Provider or dispatch a Run. The binding the v3 rules carry is unchanged: the same authority origins, allowed Outbound Data Categories, fallback-chain requirement, operation-class inheritance and authority separations.

## Eligible foreground work

Rule `user-initiated-production-run-processing` applies only after a newly user-initiated Task creates an exact Run, either through direct Run Authorization or because an active Default Execution Rule exactly matches that new Task. A Default Execution Rule alone never invents or schedules work.

The Run may declare any of the four Outbound Data Categories, including unpublished full content, only inside its exact source/data/Provider envelope. It requires an eligible configured Provider, Provider Preflight, exact Provider Binding and allowed fallback chain, Plan Envelope, Run Authorization, Run Source Scope, declared model-operation classes, exact Run Budget Ceiling state and the final Provider Payload/Egress Gate. `unset` remains permitted as the ordinary-production ceiling state; when a ceiling is applied, the policy default is 30,000 tokens multiplied by the frozen unit count of the Coverage Manifest, computed after the manifest is frozen and before the plan is.

Declared generation, remote embedding, reranking, subagent work, covered analysis, reducer stages and asynchronous continuation inherit the unchanged Run envelope. Moving the same Run out of the foreground changes presentation only. An undeclared operation or expanded Provider/data/source/budget scope requires Plan Revision and renewed authorization.

No second per-Book, first-use, per-call or per-chunk privacy prompt is required inside the exact authorized Run.

## Eligible background manuscript analysis

Rule `enrolled-background-manuscript-analysis-processing` requires a matching active Background Analysis Enrollment and a newly created exact Run for every autonomous dispatch. It is limited to enrolled manuscript analysis. It grants no formal manuscript mutation, external Effect, general background learning or background Policy work.

Provider onboarding may present a separate explicit Enrollment action. Provider setup, import and artifact install/enablement never create or activate one. An Enrollment without a matching exact dispatch is not a Provider call authorization.

The background Run uses the same exact Provider, Plan, source/data, operation-class, budget and final egress requirements as foreground work. A new idle, scheduled, post-checkpoint, import-triggered or cross-Run dispatch requires the still-active matching Enrollment.

## Transmissions and the three declared suboperations

Both rules carry the same transmission bound: the frozen Coverage Manifest unit count, plus declared `safe-retry` adaptations, plus the cross-unit reduction's topic sections, plus the assurance sample's anchor units, plus one Run Report reflection turn. Both rules allow the three suboperations [ADR 0066](../adr/0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md) declares — `crossUnitReductionAllowed`, `assuranceSamplingAllowed` and `runReportReflectionAllowed` — each as its own bounded transmission, and both set `webSearchToolAllowed` to `false`. No web-search capability is enabled by this version; the provider assignment design of [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §6 decides which provider carries the model's own web-search tool, and until it does, search-enabled categories run provider-free with a disclosed state.

## Redaction

The manuscript's text in full and the author's information may leave; the house's people never do. Before any transmission the house-people identity is stripped: 责编 and 相关人 names and roles, 备注, and internal notes are removed. The author's information and the house name may leave — a Book in the 发稿 flow is public information. This is the policy form of the single privacy sentence [ADR 0079](../adr/0079-record-the-owner-s-decisions-of-2026-09-10-on-storage-policies-export-egress-providers-and-samplebooks.md) §4.4 records: the text may go to the model and its tools; it is never published verbatim to the public web; the house's people never leave.

## Credential and authority separation

Credential values remain outside model-visible and general outbound material. Only the Credential Broker resolves an opaque reference at the final authorized adapter. Values never enter repositories, prompts, Session text, generic environments, logs, diagnostics or tool results.

Policy eligibility does not create a Provider implementation or dispatch. Provider configuration, credentials, readable scope, installation, enablement, DSH Session/Plugin membership, Default Execution Rule without a new user Task, Enrollment without an exact Run, External Export Policy or Effect Approval cannot fill a failed rule match.

Provider Processing is controlled model processing only. It grants no formal Manuscript Apply, external export, learning, publication, Public Release Permission or outcome proof.

## No implementation or activation claim

This record selects no Provider, model, endpoint, adapter or credential and proves no launch selector or product path exists. The suboperations it names dispatch only through the guards the implementing slices already carry. It cannot auto-activate: the stricter existing developer-review rule governs this authority-changing Policy revision until separately superseded.
