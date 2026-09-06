---
status: accepted
---

# Admit a developer-live Provider Processing scope

On 2026-09-06 the Owner decided that prompt contracts and the analysis pipeline must be tuned on real model output before any recording, and that the existing `fixture-recording` scope is the wrong instrument for that purpose: it exists to freeze one reviewed fixture, it allows one call, and every contract change invalidates what it recorded. This decision extends [ADR 0046](./0046-separate-provider-processing-by-operational-scope.md) with a fourth trusted operational scope. It changes no production default, no Model Role binding outside the development interval, and none of the recording rules of [ADR 0044](./0044-use-sample1-as-compatibility-and-recording-baseline.md).

## Decision

A new trusted operational scope, **`developer-live`**, maps to immutable **Provider Processing Policy v4**. Its rules:

- **Human-attended, developer host only.** The scope binds only through a trusted launch form on a developer host, never through a product setting, environment variable, Provider, artifact, Plugin, or fallback. CI, the E2E Gate, and every hosted execution stay on `development-ci` / v1.
- **Origin.** Live transmission is eligible only for a newly user-initiated Task under standard Run Authorization. No Default Execution Rule, Background Analysis Enrollment, idle, scheduled, import-triggered, or cross-Run dispatch is eligible.
- **Bounded transmissions.** A Run's transmission count is bounded by its frozen Coverage Manifest unit count plus the declared `safe-retry` adaptations of its Plan Envelope. One technical Session per Analysis Unit; the accumulating single-session composition is not used under this scope.
- **Hard ceiling.** The Plan Envelope must bind an explicit Run Budget Ceiling; `unset` is refused. The development default is 500,000 total tokens. Reaching it ends the Run with the existing `Run Budget Ceiling Reached` outcome.
- **Inputs.** Only admitted Public SampleBooks under [ADR 0043](./0043-allow-public-samplebooks-in-repository-and-ci.md) may be transmitted. Private manuscripts stay prohibited in every development scope.
- **No fixture, no capture, no upload.** The scope emits no fixture and no raw capture by itself. Raw request and response bytes stay in process memory or protected local staging outside every repository working tree, are never logged, uploaded, or committed, and are deleted at Run end unless a separately authorized fixture-generation tool consumes them on the same host.
- **Credential.** The value is entered only through the product's Protected Secret Store and released by the Credential Broker against a `transmit-remote` ticket for the bound Run. It never appears in a chat, prompt, Issue, log, diagnostic, or repository file.
- **Development-interval binding.** Under this scope the Main Editorial Role binds `deepseek-v4-flash`. [ADR 0041](./0041-dsh-first-deepseek-primary-architecture.md)'s production defaults are unchanged; the production `ordinary-production` scope keeps V4 Pro High.

The Egress Gate returns `transmit-remote` under v4 only when the assembled payload matches the immutable Execution Binding, the Run Source Scope, the manifest unit message set, and the ceiling state; everything else refuses as today.

## Purpose and boundary

The scope exists to learn what the Baseline Manuscript Analysis Contract, the cross-unit reduction contract, and the factual-verification prompts actually produce on `sample1`, and to generate deterministic fixtures from real output through tooling. It produces no CI evidence, no product-eligibility claim, and no Recorded Deterministic Model Fixture. ADR 0044's human-attended recording remains the route to a reviewed fixture and stays deferred until the contracts stabilize.

## Consequences

- Provider Processing v4, its schema, its human projection, and active-policy-set v4 enter through one implementation slice (plan slice S40) together with the trusted launch form, the launch-policy pins, the per-unit Session composition, ceiling enforcement, and the gate decision. Until that slice integrates, no live route exists.
- The launch policy code, the Egress Gate, the DeepSeek adapter, the three runner pins, and the ledger CHECKs that hard-code `deepseek-v4-pro` change inside that slice for the development interval only.
- Development runs under this scope are the cheapest way to obtain the quality evidence the prompt-only practice obtained; they cost model usage, which the ceiling bounds.

## Rejected alternatives

- **Use `fixture-recording` v2 for tuning.** Rejected: one call per authorization, mandatory fixture emission, and normalization/review obligations make every tuning iteration a recording ceremony.
- **Widen `development-ci` v1.** Rejected: CI and the Gate must stay provider-free and network-denied.
- **Tune with hand-written fixtures.** Rejected: a fixture the developer wrote cannot tell the developer what the model does.
