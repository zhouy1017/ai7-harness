# CI and test boundaries

Status: **accepted implementation boundary under [ADR 0027](../adr/0027-concentrate-ci-on-e2e-functionality.md), integrated into `design-doc` through Issue #6; not `main` acceptance or implementation authorization**

On `design-doc`, this file is the concise authority for implementation-time CI and test admission. ADR 0027 remains the decision authority; aggregate integration alone grants no `main` or product-implementation authority.

## One standing automated test surface

AI7 has exactly one standing automated engineering test surface: one logical, provider-free **E2E Functional Gate**. It runs on Windows and macOS with the same supported journey IDs. Every platform result belongs to that one gate, and a failure on either platform fails the logical gate.

The gate exists to answer only two questions:

1. Do complete supported user journeys still produce their accepted user-visible, domain, authority, and data outcomes?
2. Does an observed user-visible bug remain fixed inside the smallest complete journey that reproduces it?

It does not prove individual layers, packages, providers, platforms, quality attributes, or a release as separate subjects.

## Scenario admission

Every standing scenario declares its admission basis in the scenario source:

- a **supported-journey scenario** names one supported journey ID; or
- an **observed-bug regression** names the bug's GitHub issue, the user-visible outcome being preserved, and the nearest supported journey ID that supplies the complete journey around the failure.

The scenario itself is the record. Do not create a separate test catalog, coverage inventory, component-ownership matrix, or evidence registry.

A complete journey starts through the launchable AI7 product path and reaches a user-visible outcome across the applicable renderer, Electron main, AI7 service, composed Harness runtime, and domain authority boundaries. A scenario that stops at a function, module, IPC edge, service method, Harness adapter, database, package, or platform mechanic is not admitted as a standing test.

For an observed bug, add the smallest end-to-end variation of the nearest complete journey that reproduces the reported outcome. Preserve the issue link and expected outcome in the scenario. Do not build speculative edge-case catalogs, generate tests from coverage gaps or component ownership, or add cases for failures nobody has observed and no supported journey requires.

## Provider-free and public-synthetic boundary

The gate uses public synthetic data only. It never uses a live model or provider, API key, credential, outbound network request, unpublished manuscript, private sample Book, or derivative of either.

A deterministic model fixture is allowed only as an in-process or local part of the same AI7 E2E journey boundary. It supplies predictable model-facing turns so the product journey can proceed; it is not a provider emulator, provider-conformance subject, replay proof, cassette programme, or request-fingerprint proof.

Repository fixtures may contain only clearly public synthetic material. CI logs and uploaded artifacts must not retain manuscript payloads, including synthetic manuscript-shaped text emitted while the journey runs. Report scenario identity, state, and failure location without copying editorial payloads.

## Product subject and platform contract

The E2E subject follows the launchable product path. Build or package only as far as needed to start that subject on the current platform. A service-only, headless, package-only, signing-only, or installer-only execution is not a substitute for the supported journey and does not become another gate.

Windows and macOS run the same supported journey IDs. Native setup and mechanics may differ for menus, shortcuts, dialogs, filesystem locations, protected secret stores, private IPC adapters, packages, signing/notarization, and OS prompts. The supported function, domain meaning, authority transition, data outcome, and user-visible result may not differ.

There is no separate headless, packaging, signing, notarization, platform-certification, release, or same-SHA gate. Release automation may package an already accepted source state without creating new test or proof obligations.

## Observed failures and diagnostics

An admitted scenario has no quarantine, flaky registry, tolerated-failure status, or platform waiver. Fix the product or the scenario. Remove or replace a scenario only when the supported journey or recorded bug outcome has explicitly changed; do not hide a failure behind standing exception machinery.

Temporary diagnostics may be created while diagnosing or implementing a concrete change. They are local or otherwise non-gating and must be deleted before integration unless their user-visible behavior is admitted into the E2E Functional Gate under the rules above.

Lint, type-check, format, and build commands may exist as developer commands. They are not required CI gates, merge evidence, coverage programmes, or substitutes for the E2E Functional Gate.

## Explicitly excluded standing gates

Unless the owner explicitly reverses ADR 0027, do not create separate:

- unit, integration, contract, or property test gates;
- coverage targets or coverage-driven test generation;
- lint, format, type-check, static-analysis, or architecture-closure gates;
- performance or load gates;
- security, privacy, compliance, or accessibility gates;
- provider, live-model, schema, ABI, or protocol-conformance gates;
- packaging, replay, provenance, reproducibility, signature, notarization, platform-certification, release-proof, release-receipt, or same-SHA gates; or
- formal review or exact-head review gates.

This exclusion removes separate engineering proof machinery. It does not remove AI7 product requirements. Factual Verification, authority boundaries and records, Effect Receipts, recovery, privacy, accessibility, document fidelity, and long-manuscript behavior remain required product behavior and belong in a complete supported journey when that journey exercises them.

## Pull-request application

Normal pull-request flow and Commander-only integration remain in force. An implementation change that affects a supported journey or an observed-bug outcome updates the applicable E2E scenario and runs the one logical gate on both platforms. Documentation-only and design-only changes do not invent an automated proof task. Independent Reviewer work is optional and advisory under [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md), not a prerequisite for the pull request or the gate.
