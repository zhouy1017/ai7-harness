---
status: accepted
---

# Concentrate engineering verification on E2E functionality

The owner accepts lower engineering rigor in exchange for faster design and delivery. AI7 therefore keeps one logical automated verification surface, executed on both supported product platforms: one provider-free E2E Functional Gate covering complete supported user journeys and regressions for observed user-visible bugs. Windows and macOS run the same supported journey IDs; any failure fails the logical gate. Platform-native setup and launch mechanics may differ inside it, but supported function, domain meaning, authority transitions, data outcomes, and user-visible results may not.

A standing scenario must map either to a supported journey ID or to an observed-bug issue and outcome nested in the nearest complete supported journey. The subject follows the launchable product path across the applicable renderer, Electron main, AI7 service, composed Harness runtime, and domain boundaries. Layer-only tests, speculative edge catalogs, coverage-driven or component-ownership-driven tests, and separate test inventories are not admitted.

The gate uses public synthetic data only and makes no live provider or model call, holds no API key, performs no outbound network request, and contains no unpublished manuscript, private sample Book, or derivative. A deterministic model fixture may exist only inside the same AI7 E2E boundary; it is not provider, replay, cassette, or request-fingerprint proof. CI logs and uploaded artifacts retain no manuscript payload.

Build or packaging steps needed to launch the E2E subject are allowed but are not separate acceptance gates. Service-only headless execution and package, installer, signing, notarization, release, or same-SHA checks do not substitute for the journey and do not become gates. Ad hoc diagnostics are allowed only to diagnose or implement concrete behavior, remain non-gating, and are removed before integration unless admitted into the E2E journey surface. Lint, type-check, format, and build commands may exist as developer commands without becoming required CI or an evidence programme. Admitted scenarios have no quarantine, flaky registry, tolerated-failure status, or platform waiver.

Architecture proof exercises, source and artifact probes, exact-head or formal review gates, separate unit/integration/contract/property suites, coverage targets, lint/type/format/static-analysis gates, performance/load gates, security/privacy/compliance/accessibility gates, provider/live-model/schema/ABI conformance, packaging/replay/provenance/reproducibility/signature/notarization/platform-certification, release-proof/receipt, request-fingerprint, and same-SHA gates are not required and must not be created unless the owner explicitly reverses this decision.

Architecture uses reasoned design, explicit assumptions, and optional advisory hostile review; an unknown becomes an implementation assumption rather than a mandatory evidence spike. Normal pull-request flow and Commander-only integration remain unchanged, while independent review is optional and advisory rather than a pull-request gate.

This decision removes separate proof machinery, not user-facing product behavior. Factual Verification, authority records, Effect Receipts, recovery, privacy boundaries, and other accepted domain behaviors remain functional requirements and may be exercised through E2E journeys. The project accepts that performance, security, packaging, provider, and rare edge-case regressions may escape CI.

This ADR supersedes the mandatory verification and review-gate clauses of ADRs 0015, 0018, 0019, 0020, 0023, and 0025, and replaces the active verification plan in `kick-in/26-tiered-verification-and-mock-provider-evidence.md`. It does not change Commander integration or external-action authority, Worker isolation, or the optional Reviewer's read-only authority.

The concise implementation rules live in [`docs/agents/ci-test-boundaries.md`](../agents/ci-test-boundaries.md).
