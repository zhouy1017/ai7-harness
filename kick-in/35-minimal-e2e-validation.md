# Minimal E2E validation

Status: **accepted; supersedes the engineering-verification gates in earlier design records**

## Decision

AI7 has one CI testing purpose: demonstrate that complete user-facing workflows still function and that previously observed bugs do not recur.

The required CI surface is one Windows end-to-end suite. It covers representative journeys across the packaged application or the closest launchable application boundary available at that stage. A bug fix adds an E2E regression scenario when the failure can be reproduced through a user-visible journey.

CI does not add separate unit, integration, contract, property, coverage, lint, static-analysis, performance, load, security, privacy, compliance, accessibility, provider-conformance, schema-compatibility, ABI, packaging-integrity, reproducibility, signature, provenance, replay, request-fingerprint, release-receipt, architecture-closure, or source/artifact-evidence gates. Build and packaging commands may run only when needed to launch the E2E subject.

Architecture and design work do not wait for source audits, exact artifact probes, prototypes, capability scoring, exact-head double review, or formal proof. Record important assumptions plainly, choose the simplest credible design, and proceed. A hostile architecture review remains available as advisory design feedback, never as an acceptance gate.

Ad hoc diagnostics are permitted when reproducing or fixing an observed bug. They stop when the bug is understood or the regression journey is added; they do not create permanent verification infrastructure by default.

## Product-function boundary

This rule concerns engineering validation. It does not delete product features whose names include review, verification, receipt, recovery, or authorization. Those remain part of functional completeness and are covered, where valuable, by end-to-end journeys rather than independent proof systems.

## Accepted trade-off

The project knowingly accepts weaker early detection of performance, security, provider, packaging, compatibility, and rare edge-case regressions. Simplicity and design velocity take priority unless the owner explicitly changes this policy later.
