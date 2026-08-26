---
status: accepted
---

# Use sample1 as the compatibility and recording baseline

This ADR partially supersedes [ADR 0043](./0043-allow-public-samplebooks-in-repository-and-ci.md) only for exact [`SampleBooks/sample1.docx`](../../SampleBooks/sample1.docx). It makes that exact file the standing development compatibility baseline and permits a separately governed local manual recording plus reviewed-fixture path. ADR 0043 continues to govern every other Public SampleBook, and [ADR 0016](./0016-proprietary-license-and-local-only-sample-manuscripts.md) continues to govern ordinary and private manuscripts.

The Owner accepted this decision for intended integration target `dev`, and Commander integration made it repository-current there. A later task branch inherits this target-qualified design authority without gaining adjacent implementation authority. The decision authorizes canonical design and policy records only. It performs and authorizes no immediate Provider call, credential setup, fixture generation, product implementation, CI-workflow change, export, learning, publication, release, or `main` promotion.

## Context

The first provider-free tracer originally generated a synthetic DOCX. Issue #36 / PR #75 subsequently extended that bounded tracer to consume exact `sample1.docx`, which remains the Owner-selected functional target for manuscript-dependent supported journeys. Treating each newly discovered fidelity signal as a reason to reject that file would make the target unstable and would hide compatibility work behind repeated admission decisions.

Later model-dependent journeys also need deterministic responses. A synthetic response can exercise plumbing, but one future real response over the accepted target is needed as source material for deterministic replay. That narrow recording must not turn ordinary CI into a provider rehearsal, create a general provider exception, copy raw Provider material into Git, or bypass AI7's product authority seams.

The names **Sample1 Compatibility Baseline / sample1 兼容性基线** and **Recorded Deterministic Model Fixture / 录制型确定性模型夹具** are repository-development vocabulary. They add no AI7 product-domain term and change no definition in the Execution or Editorial contexts.

## Decision

### Exact standing compatibility baseline

The Sample1 Compatibility Baseline is exactly:

| Repository path | Bytes | SHA-256 |
| --- | ---: | --- |
| `SampleBooks/sample1.docx` | 29,550 | `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483` |

Every manuscript-dependent supported journey uses this exact identity as its standing development target when its Change Brief reaches manuscript input. The import boundary parses the DOCX once. Downstream modules consume the resulting exact Book, primary Manuscript, Manuscript Revision, source/provenance, fidelity, and import records; this decision does not require every component to reparse DOCX.

Correct processing means:

1. preserve every fidelity signal covered by an accepted preservation contract;
2. disclose every exact degraded category and require an explicit, initially-unselected editor decision before commit;
3. never silently lose a signal or claim round-trip preservation that the implementation does not provide; and
4. never reject this exact file merely because another discovered signal can be truthfully represented as preserve or explicit degrade.

A newly observed fidelity signal in this exact file is implementation evidence, not a new Owner-admission trigger. If current code cannot truthfully preserve or disclose it, the consuming Issue must revise the implementation boundary rather than silently replacing or rejecting the standing baseline. This is a cross-Issue invariant, not one giant scenario, a requirement that every module parse the source file, or a claim that full J-01 or every PRD outcome is complete.

### One narrow future recording eligibility rule

[Provider Processing Policy v2](../policies/provider-processing-policy.v2.json) remains default-deny and adds exactly one eligible-only rule: `sample1-manual-model-fixture-recording`. The rule applies only when all of these are exact and frozen before transmission:

- the source identity above and its imported Book / primary Manuscript / Manuscript Revision lineage;
- a human-confirmed public recording instruction containing no private material;
- one exact Task and one human-confirmed Provider Binding, including Provider, model, endpoint, adapter/config revision, Model Role and opaque Credential Reference, with no fallback;
- one Provider Preflight, Run Authorization and Plan Envelope whose Run Budget Ceiling is explicit and non-`unset`;
- a maximum of one Provider call for the authorized recording; and
- the actual AI7 product path through the Primary Agent Harness, Provider adapter, Credential Broker and final Provider Payload/Egress Gate.

The recording is local-only, human-attended, manually started and forbidden in CI, scheduled work, background work, `curl`, a side script, or a general network tool. Policy eligibility does not create an implementation, configure a credential, dispatch a Run, or substitute for the exact preflight and authorization records. Immediately before the future recording, the Commander must request human intervention to select and confirm every deferred binding, budget, credential enrollment, prompt contract and then-current Provider term.

### Protected recording and fixture admission

The recording-specific raw request and response remain in protected local staging outside every repository, working tree, log, diagnostic, uploaded artifact and distribution. Raw staging is deleted after the candidate fixture is admitted or the recording effort is abandoned.

A Recorded Deterministic Model Fixture is not the raw response. Admission requires all of the following under a separate authorized Issue and pull request:

- declared normalization;
- sanitization of secrets, account identifiers, private material, unnecessary source echo and other unnecessary Provider metadata;
- provenance and review of the Provider's then-current retention, test-reuse and redistribution terms;
- human content review;
- immutable digests for the exact source, Provider, model, prompt contract, active policy, raw response and final fixture; and
- confirmation that only the reviewed fixture bytes, not raw staging, enter the repository.

The fixture is development/test material only. It does not ship, enter product learning, authorize export or publication, establish Public Release Permission, prove Provider conformance, prove current model quality, or become an Effect Receipt.

### Replay and CI

Record once, replay many. Deterministic replay invokes no Provider and performs no Effect. It may participate only as the existing local deterministic model adapter/fixture inside a complete supported journey through the launchable AI7 product boundary.

Ordinary Windows and macOS CI remains provider-free and network-disabled with identical journey meaning. This decision adds no live-provider workflow, nightly/provider tier, cassette gate, fingerprint gate, replay gate, quality gate, or other standing test surface.

## Consequences

- Exact `sample1.docx` remains stable across later Issues even as its truthful fidelity classifications become more complete.
- Provider Processing v1 remains immutable history. V2 is its default-deny successor with one narrow eligible-only rule.
- External Export Policy v1 remains byte-for-byte unchanged and separately authoritative. Recording permission is not export, delivery, publication, learning, or Public Release Permission.
- A future abandoned or failed recording consumes the one authorized call attempt unless a new exact recording authorization is established; fallback and automatic retry are not permitted.
- Rollback selects a reviewed predecessor through the active-policy-set owner. It never mutates an immutable policy version.

## Rejected alternatives

- **Choose another DOCX whenever a new signal appears.** Rejected because it makes the Owner-selected functional target unstable and evades truthful compatibility work.
- **Require one giant all-component sample1 test.** Rejected because the baseline is a cross-Issue invariant consumed at existing seams, not a second test architecture.
- **Record through a script or direct Provider request.** Rejected because that would bypass the actual AI7 Harness, Provider Binding, credential and payload-egress path that the fixture is meant to serve.
- **Record in CI or make live Provider access a gate.** Rejected because the standing Windows/macOS gate is provider-free and network-disabled.
- **Commit raw Provider request/response material.** Rejected because only normalized, sanitized, rights-reviewed and human-reviewed fixture bytes may be separately admitted.
- **Rewrite ADR 0043 or Provider Processing v1.** Rejected because successor records preserve history and supersede only the named narrow clauses.

## Authority and stop boundary

This decision records the Owner clarification in Issue #73. Stop if the exception cannot remain exact-source, local-only, human-attended, non-CI, one-call, non-`unset`-budget, exact-binding and no-fallback; if a Credential Reference cannot remain opaque until the Credential Broker supplies the final adapter; or if raw recording material would enter Git, logs, artifacts or distributions.

Issue #36's bounded compatibility/degraded-import implementation is complete. Any later implementation must proceed only through its own authorized bounded Change Brief against the then-current exact `dev`. The actual recording remains deferred until a model-dependent product path exists and the Commander requests immediate human intervention.
