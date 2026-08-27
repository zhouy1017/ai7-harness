---
status: accepted
---

# Separate Provider Processing by operational scope

This ADR records the Owner-approved Provider Processing correction for Issue #86. It is repository-current only when read from an exact integrated `dev` commit containing this revision; elsewhere it remains accepted-but-unintegrated. It defines policy and authority contracts only; no Provider adapter, endpoint, model, credential, launch selector, call, policy activation or implementation follows from it.

## Decision

Development/CI provider-free execution, exact human-attended fixture recording and ordinary production Provider Processing use separate immutable policy selections. Trusted build/launch authority binds exactly one operational scope for a launch. An ordinary product setting, environment variable, Provider, DSH artifact or Plugin cannot select or switch scope, and cross-scope fallback is forbidden.

The three selected Provider policy records are:

- `development-ci` → immutable Provider Processing v1, which permits no live transmission;
- `fixture-recording` → immutable Provider Processing v2, whose sole eligible-only rule remains exact `sample1` local human-attended recording; and
- `ordinary-production` → new immutable Provider Processing v3 for exact production Runs.

The v1/v2 policy and active-set bytes remain unchanged history. Active policy set v3 serializes the closed trusted scope-to-pin map plus unchanged External Export v1. This is a selection contract, not a runtime mode predicate inside one Provider policy, and it does not claim the executable selector exists.

## Ordinary production authority

Provider Processing v3 remains default-deny and has two eligible-only authority origins:

1. **User-initiated foreground work.** A newly user-initiated Task creates an exact Run through direct Run Authorization or through a matching active Default Execution Rule. The rule never invents or schedules a Task by itself.
2. **Enrolled background manuscript analysis.** A matching active Background Analysis Enrollment may originate a new background analysis dispatch; each dispatch still creates an exact Task/Plan/Run record and retains its own provenance.

Moving an already authorized user-initiated Run out of the foreground does not create a new authority origin. It may continue asynchronously only inside its unchanged frozen envelope. Any new idle, scheduled, post-checkpoint, import-triggered or cross-Run Provider dispatch without a newly user-initiated Task requires an active matching Background Analysis Enrollment.

Both origins require an eligible configured Provider and exact Provider Preflight, Provider Binding and allowed fallback chain, Plan Envelope, Run Authorization, Run Source Scope, Outbound Data Categories, declared model-operation classes, exact Run Budget Ceiling state and final Provider Payload/Egress Gate. The ceiling may be `unset` in ordinary production. Unknown or unmatched scope, source, datum, Provider, operation class or authority fails closed.

## Inherited declared operations

Generation, remote embedding, reranking, subagent work, multi-pass covered analysis, reducer stages and asynchronous continuation declared in the frozen Plan Envelope inherit that Run's exact authority. DSH Session or Plugin membership grants nothing. Adding an undeclared operation class or expanding Provider, data, source or budget scope requires Plan Revision and renewed authorization.

An already authorized exact Run needs no second per-Book, first-use, per-call or per-chunk privacy prompt. This removes repeated ceremony, not the Provider Payload/Egress Gate or any source/category check.

## Non-authorizing setup and separate authorities

Provider setup, credential configuration, manuscript import, catalog visibility, artifact installation or enablement, Default Execution Rule existence without a newly user-started Task, and Background Analysis Enrollment existence without a matching exact dispatch are each insufficient. Onboarding may present a separate disclosed Enrollment action, but setup or import never creates or activates it implicitly.

Provider Processing remains separate from External Export Policy, Effect Approval, formal Manuscript Apply, publication and Public Release Permission. Production processing authorizes no external storage, Internet publication, redistribution, learning, policy activation or outcome proof. Credentials remain opaque until the final authorized adapter and never enter model-visible material, repositories, generic environments, logs, diagnostics or tool results.

## Retained stricter Policy rule

Provider Processing v3 changes semantic authority and therefore cannot auto-activate. Issue #86 does not resolve the pre-existing conflict between ADR 0018 and the more permissive Policy-activation language elsewhere. Until separately superseded, the stricter developer-review rule governs every Policy revision.

## Deferred details and stop boundary

The exact executable trusted launch selector, Provider adapters, endpoints, credential bindings, Run schemas, onboarding UI, general background learning/Policy work and non-manuscript external Effects remain outside this ADR. If the policy cannot be serialized without changing trusted launch authority, normalization stops rather than introducing a user/runtime mode switch.
