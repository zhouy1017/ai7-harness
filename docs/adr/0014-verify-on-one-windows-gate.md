---
status: superseded
---

# Verify on one Windows gate and defer additional tiers

This historical decision is superseded by ADR 0027 for minimal engineering validation and ADR 0028 for the Windows-and-macOS product scope. Its single-Windows topology, unit/contract/replay requirements, release-proof workflow, and associated machinery are not current requirements.

Verification uses two GitHub Actions workflows, `pr` and `release`, both running a single job on `windows-2025`. Windows is the only target platform, so it is the only place required evidence is produced. `pr` is the sole required gate: unfiltered, cancel-on-supersede, format plus typecheck/build plus provider-free unit and contract tests plus one assembled mock-provider replay, targeting ten minutes. `release` builds the Windows package once on a `v*` tag and proves install, launch, canonical journey, and uninstall against that exact package, failing closed without a green `pr` run for the same source SHA. Focused verification is a local command with no workflow and no promotion authority; Provider Rehearsal is local, opt-in, credential-bearing, and never gating.

A Ubuntu lane is rejected for V1 rather than forgotten. Two lanes cost two checkouts, two installs, two caches, and an aggregator, and a Ubuntu pass that Windows later contradicts was never evidence. Hosted Windows minutes bill at twice Linux and Linux is faster for pure-logic work, so the arithmetic reverses once the gate grows — that is the stated trigger, not a permanent judgment. Nightly fan-out, same-SHA suppression, a machine-owned Test Catalog, a quarantine registry, and the wire-level fault server are deferred on the same basis: each is added when a concrete problem appears, since this repository starts at zero tests while the original AI7 justified that machinery at roughly 360.

Four requirements survive the reduction because they are cheap and load-bearing: required CI never calls a live provider or handles unpublished manuscript text; replay fails closed on a request-fingerprint mismatch, without which a changed prompt silently reuses a stale cassette and the generated mock-provider evidence proves nothing; the legacy public-synthetic corpus is regenerated because its byte length leaked a private sample document's size; and release emits a five-field receipt rather than a twelve-field proof-input fingerprint. The stated time budgets were set before any code existed and are calibration to revise against a measurable suite.
