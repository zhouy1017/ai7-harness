---
status: accepted
---

# Concentrate engineering verification on E2E functionality

The owner accepts lower engineering rigor in exchange for faster design and delivery. AI7 therefore keeps one logical automated verification surface, executed on both supported product platforms: provider-free Windows and macOS end-to-end tests covering complete user-facing journeys and regressions for observed bugs. Platform-native setup and launch steps may differ inside that same gate; they do not create separate platform-certification programmes. Architecture proof exercises, source and artifact probes, exact-head review gates, unit/integration/contract/property suites, coverage targets, static-analysis gates, performance gates, security or compliance test gates, provider conformance, reproducibility checks, release receipts, request fingerprints, ABI matrices, and separate package-validation gates are not required and should not be created unless the owner later reverses this decision.

Build steps needed to launch the product under E2E are allowed but are not separate acceptance gates. Ad hoc diagnostics are allowed only to reproduce or fix an observed bug and do not become standing CI. Architecture uses reasoned design, explicit assumptions, and optional advisory hostile review; an unknown becomes an implementation assumption rather than a mandatory evidence spike.

This decision removes separate proof machinery, not user-facing product behavior. Factual Verification, authority records, Effect Receipts, recovery, privacy boundaries, and other accepted domain behaviors remain functional requirements and may be exercised through E2E journeys. The project accepts that performance, security, packaging, provider, and rare edge-case regressions may escape CI.

This ADR supersedes the mandatory verification and review-gate clauses of ADRs 0015, 0018, 0019, 0020, 0023, and 0025, and replaces the active verification plan in `kick-in/26-tiered-verification-and-mock-provider-evidence.md`. It does not change Commander integration or external-action authority, Worker isolation, or the optional Reviewer's read-only authority.
