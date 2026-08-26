# Provider Processing Policy v2

Status: **policy-version lifecycle `active`; repository authority is target-qualified; default deny with one exact eligible-only local manual recording rule**

The authority-bearing serialization of this immutable policy version is [`provider-processing-policy.v2.json`](provider-processing-policy.v2.json), validated by its policy-specific self-contained Draft 7 [`provider-processing-policy.v2.schema.json`](provider-processing-policy.v2.schema.json). Its `lifecycleStatus: "active"` value describes lifecycle inside this policy version only. Repository-level current/canonical authority exists only at an exact integrated `dev` commit whose same-tree [`active-policy-set.v2.json`](active-policy-set.v2.json) pin matches identity, version, path and exact SHA-256. Before integration, this record is `accepted-but-unintegrated`.

This Markdown file is the human-readable projection. It carries no independent authority. Any drift from the canonical JSON is a defect resolved through a corrected projection or a new reviewed policy version, never an in-place semantic rewrite of the immutable JSON.

## Identity and default

- Policy identity: `provider-processing-policy`
- Version: `v2`
- Predecessor: immutable [`v1`](provider-processing-policy.v1.json)
- Policy-version lifecycle status: `active`
- Default decision: **deny**
- Provider allow rules: exactly one, `sample1-manual-model-fixture-recording`
- Rule result: **eligible only**; it does not dispatch or implement a call

Unknown or unmatched Providers, models, endpoints, adapters, credentials, payloads, purposes, sources, categories, lineages, execution modes or policy conditions remain denied.

## Exact allow rule

The sole rule permits only a future source recording for a Recorded Deterministic Model Fixture, under [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md) and the [manual recording runbook](../development/manual-model-fixture-recording.md).

### Source and payload

The source is exact `SampleBooks/sample1.docx`, 29,550 bytes, SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`, classified `public-or-synthetic` by its Owner designation. The Provider payload must be derived only from its exact imported Book, primary Manuscript, Manuscript Revision, source/provenance and import-record lineage plus a human-confirmed public recording instruction. Private material and unrelated Session/tool material are forbidden.

The recording path does not reclassify any ordinary or private manuscript. Provider Processing v2 remains default-deny for every unpublished category and every other Public SampleBook.

### Local, attended and exact

The recording is local-only, human-attended and manually started. CI, scheduling, background execution and automatic retry are denied. Before any transmission, the future recording requires:

- immediate human intervention;
- an exact Task and an exact human-confirmed Provider Binding covering Provider, model, endpoint, adapter/config revision, Model Role and opaque Credential Reference;
- no fallback and an empty Approved Fallback Chain;
- exact Provider Preflight, Run Authorization, Plan Envelope and Run Source Scope;
- one frozen prompt-contract digest and review of then-current Provider terms;
- an explicit non-`unset` Run Budget Ceiling; and
- `maxCalls: 1`.

Eligibility under this rule is not a current call authorization. No recording occurs until the model-dependent product path exists and a separately authorized recording action freezes those details.

### Required product and credential path

The call must traverse the actual AI7 product path through the Primary Agent Harness, its Provider adapter and the final Provider Payload/Egress Gate. Direct Provider requests, `curl`, side scripts and general network tools are denied.

The Credential Reference remains opaque. Only the Credential Broker may resolve its secret value, and only at the final adapter. Credentials never enter prompts, model-visible material, Session content, repositories, generic environments, logs, diagnostics, tool results or fixture bytes.

## Recording staging and fixture admission

Raw recording-specific request/response material is allowed only in protected local staging outside any repository. It is forbidden from Git, logs, diagnostics, uploaded artifacts and distributions, and is deleted after the candidate is either admitted or abandoned.

A separately authorized Issue and pull request may admit only a reviewed fixture after declared normalization; sanitization of secrets, account identifiers, private material, unnecessary source echo and unnecessary Provider metadata; provenance review; then-current Provider retention/test-reuse/redistribution terms review; human content review; and immutable source, Provider, model, prompt-contract, policy, raw-response and fixture digests. Raw recording bytes cannot be admitted.

## Separate authorities and non-claims

This rule does not create a Provider implementation, configure a credential, dispatch a Run, authorize external export, enter learning, authorize publication, grant Public Release Permission, or ship a fixture. A Recorded Deterministic Model Fixture is not an Effect Receipt, Provider-conformance proof or current-model-quality proof.

External Export Policy remains immutable v1 and separately selected. Deterministic replay makes no Provider call and is admitted only within a complete supported journey. Ordinary Windows/macOS CI remains provider-free and network-disabled; this policy adds no Provider, replay, cassette, fingerprint, quality or release gate.

## Authority basis

This projection preserves the canonical JSON routes: the [Execution context](../domain/execution/CONTEXT.md), [ADR 0007](../adr/0007-separate-decisions-authority-and-effect-proof.md), [ADR 0016](../adr/0016-proprietary-license-and-local-only-sample-manuscripts.md), [ADR 0018](../adr/0018-tiered-activation-for-agent-authored-revisions.md), [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md), [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md), and the [Harness integration contract](../architecture-v2/HARNESS-INTEGRATION.md).
