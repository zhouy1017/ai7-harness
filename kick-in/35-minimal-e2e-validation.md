# Minimal E2E validation

Status: **accepted; supersedes the engineering-verification gates in earlier design records**

## Decision

AI7 has one standing automated test surface: one logical provider-free E2E Functional Gate. It executes the same supported journey IDs on Windows and macOS, and a failure on either platform fails the gate.

The gate covers only:

- complete supported user journeys; and
- regressions for observed user-visible bugs, each linked to its GitHub issue, expected outcome, and nearest complete supported journey.

A scenario starts through the launchable product path and crosses the applicable renderer, Electron main, AI7 service, composed Harness runtime, and domain authority boundaries to a user-visible outcome. Layer-only tests, speculative edge catalogs, coverage-driven tests, component-ownership-generated tests, and a separate test catalog are outside the standing surface.

## Data and model boundary

After exact dependency restoration, the product E2E execution interval uses public synthetic data only. It has no live provider or model call, API key, credential, outbound network request, unpublished manuscript, private sample Book, or derivative.

Before that interval, each Windows and macOS execution starts from a fresh checkout and empty job-local dependency-store/build-output roots. It may use narrowly scoped repository and declared dependency-source authentication plus approved package registries and immutable artifact sources to restore the committed lockfile, declared pins, and integrity-bound secondary downloads. Those infrastructure credentials never reach the product process. Optional caches remain job-local and non-authoritative, the first contract fulfillment on each host succeeds with them absent inside the same complete journey, and the same developer bootstrap/build/readiness/lifecycle semantics construct the E2E subject under the [Source Checkout Buildability Contract](../docs/agents/source-checkout-buildability.md).

A deterministic model fixture may participate only inside the same AI7 E2E journey boundary. It keeps the journey predictable; it does not become provider conformance, replay, cassette, or request-fingerprint proof. CI logs and uploaded artifacts retain no manuscript payload.

## Product and platform boundary

Build or package only as far as needed to launch the product subject. Fresh-checkout bootstrap/build/launch is setup for this one gate and has no independent scenario or success record. E2E retains the normal renderer/main/service/Harness/private-IPC/platform-adapter topology; only the deterministic model fixture, isolated data root, disabled outbound network, and non-substituting test hooks may differ. Service-only headless, topology-skipping, package-only, installer-only, signing-only, release-only, and same-SHA checks are neither substitutes nor separate gates.

Platform-native setup may differ inside the one gate. Functional behavior, domain meaning, authority transitions, data outcomes, and user-visible results may not differ. The same supported journey IDs run on both platforms.

An admitted scenario has no quarantine, flaky registry, tolerated-failure status, or platform waiver. Fix the product or the scenario; remove a scenario only when its supported journey or recorded bug outcome has explicitly changed.

## Excluded validation machinery

Unless the owner explicitly reverses [ADR 0027](../docs/adr/0027-concentrate-ci-on-e2e-functionality.md), do not add separate unit, integration, contract, property, coverage, lint, type-check, format, static-analysis, performance, load, security, privacy, compliance, accessibility, provider, live-model, schema, ABI, packaging, replay, provenance, reproducibility, signature, notarization, platform-certification, release-proof, release-receipt, same-SHA, architecture-closure, exact-head-review, or formal-review gates.

Lint, type-check, format, and build may exist as developer commands, but they are not required CI, merge evidence, or independent proof programmes. Temporary diagnostics may support diagnosis or implementation; they remain non-gating and are deleted before integration unless their user-visible behavior is admitted into the E2E Functional Gate.

Architecture and design use reasoned decisions and explicit assumptions. Optional hostile review is advisory. Neither review nor evidence work blocks a branch by default.

## Product-function boundary

This rule removes proof machinery, not product behavior. Factual Verification, authority, Effect Receipts, recovery, privacy, accessibility, document fidelity, and long-manuscript behavior remain functional requirements. When a supported journey exercises one of them, the journey must preserve its accepted outcome rather than moving it to a separate gate.

## Accepted trade-off

The project knowingly accepts weaker early detection of performance, security, provider, packaging, compatibility, accessibility, and rare edge-case regressions. Simplicity and delivery velocity take priority unless the owner explicitly reverses ADR 0027.

Implementation details are binding in [`docs/agents/ci-test-boundaries.md`](../docs/agents/ci-test-boundaries.md).
