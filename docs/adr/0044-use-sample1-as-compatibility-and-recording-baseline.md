---
status: accepted
---

# Use sample1 as the compatibility and recording baseline

This ADR partially supersedes [ADR 0043](./0043-allow-public-samplebooks-in-repository-and-ci.md) only for exact [`SampleBooks/sample1.docx`](../../SampleBooks/sample1.docx). It makes that exact file the standing development compatibility baseline and permits a governed local development capture plus reviewed-fixture path. ADR 0043 continues to govern every other Public SampleBook, and [ADR 0016](./0016-proprietary-license-and-local-only-sample-manuscripts.md) continues to govern ordinary and private manuscripts.

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

### Runtime predecessor and current development capture

[Provider Processing Policy v2](../policies/provider-processing-policy.v2.json) retains the immutable `sample1-manual-model-fixture-recording` rule as an existing runtime asset; the source checkout does not select its recording scope. Those bytes are not the operational instructions for new development validation.

Necessary development capture follows [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) under [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md): admitted material, the authorized product path, protected credentials and budget, saved evidence and reviewed fixture admission. Agents execute necessary new questions autonomously within those rules; repeated attendance, a one-call manual ceremony or immediate human intervention is not a prerequisite. Runtime policy migration remains a separate coherent implementation change.
### Protected recording and fixture admission

The recording-specific raw request and response remain in protected local staging outside every repository, working tree, log, diagnostic, uploaded artifact and distribution. Raw staging is deleted after the candidate fixture is admitted or the recording effort is abandoned.

A Recorded Deterministic Model Fixture is not the raw response. Admission requires all of the following under a separate authorized Issue and pull request:

- declared normalization;
- sanitization of secrets, account identifiers, private material, unnecessary source echo and other unnecessary Provider metadata;
- provenance and review of the Provider's then-current retention, test-reuse and redistribution terms;
- content and sanitization review through the assigned Reviewer;
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
- Rollback selects a reviewed predecessor through the active-policy-set owner. It never mutates an immutable policy version.

## Rejected alternatives

- **Choose another DOCX whenever a new signal appears.** Rejected because it makes the Owner-selected functional target unstable and evades truthful compatibility work.
- **Require one giant all-component sample1 test.** Rejected because the baseline is a cross-Issue invariant consumed at existing seams, not a second test architecture.
- **Record through a script or direct Provider request.** Rejected because that would bypass the actual AI7 Harness, Provider Binding, credential and payload-egress path that the fixture is meant to serve.
- **Record in CI or make live Provider access a gate.** Rejected because the standing Windows/macOS gate is provider-free and network-disabled.
- **Commit raw Provider request/response material.** Rejected because only normalized, sanitized, rights-reviewed and content-reviewed fixture bytes may be separately admitted.
- **Rewrite ADR 0043 or Provider Processing v1.** Rejected because successor records preserve history and supersede only the named narrow clauses.

## Authority and stop boundary

Stop if protected material or credentials would leave the authorized path, if exact source/binding evidence cannot be preserved, or if raw capture would enter Git, logs, hosted artifacts or distributions. Unknown sent outcomes remain potentially processed and billed under ADR 0067 rather than silently becoming new live work. [Orca dispatch](../agents/orca-dispatch.md) owns repository assignment, review and integration; fixture use grants no product Effect or public-release authority.
