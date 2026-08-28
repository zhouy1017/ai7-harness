# CI and test boundaries

Status: **Owner-accepted `dev` implementation boundary under [ADR 0027](../adr/0027-concentrate-ci-on-e2e-functionality.md), with hosted invocation amended by [ADR 0049](../adr/0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md) and its temporary exhausted-usage integration-evidence waiver in [ADR 0050](../adr/0050-waive-hosted-e2e-integration-evidence-during-actions-exhaustion.md); one logical provider-free E2E surface, not an independent action or `main`-promotion authorization**

On `dev`, this file is the concise authority for implementation-time CI and test admission. ADR 0027 remains the decision authority; the current bounded implementation authorization is recorded separately in the applicable Issue and Change Brief.

## One standing automated test surface

AI7 has exactly one standing automated engineering test surface: one logical, provider-free **E2E Functional Gate**. It runs on Windows and macOS with the same supported journey IDs. Every platform result belongs to that one gate, and a failure on either platform fails the logical gate.

The gate exists to answer only two questions:

1. Do complete supported user journeys still produce their accepted user-visible, domain, authority, and data outcomes?
2. Does an observed user-visible bug remain fixed inside the smallest complete journey that reproduces it?

It does not prove individual layers, packages, providers, platforms, quality attributes, or a release as separate subjects.

## Usage-bounded pull-request invocation

A pull request remains Draft during authoring, debugging, review, rebase, and local validation. Draft activity runs no hosted workflow. Once the change is locally complete and target authority has been re-resolved, only the Commander changes it to Ready for review. That transition starts the one logical Gate. A later push while it remains Ready starts the newest occurrence and cancels any superseded in-progress occurrence for that same pull request; cancellation is a consumption control, not exact-head or same-SHA proof.

The existing complete-pull-request-diff router remains inside the workflow. A Markdown-only Ready pull request may therefore consume its small route job, rather than relying on GitHub trigger-level path filters that can omit part of a large diff. There is no author-selected label, component catalog, manual dispatch, direct `push` event, schedule, nightly, release, package, or exact-head activation path.

Every product-affecting Ready pull request initially runs all currently admitted J-01, J-02, and J-08 journeys on both Windows and macOS. Admission of a fourth supported journey must explicitly reevaluate routing; it does not silently add that journey to every change. Until a later accepted routing authority exists, shared, infrastructure, toolchain, lockfile, bootstrap, build, launch, Gate, and unclassified changes fail closed to every admitted journey.

The qualitative resource objective is normally one completed paired-platform Gate occurrence per integration-ready product change. Do not create a numeric budget, secondary fast lane, or weaker single-platform substitute without another Owner decision.

## Scenario admission

Every standing scenario declares its admission basis in the scenario source:

- a **supported-journey scenario** names one supported journey ID; or
- an **observed-bug regression** names the bug's GitHub issue, the user-visible outcome being preserved, and the nearest supported journey ID that supplies the complete journey around the failure.

The scenario itself is the record. Do not create a separate test catalog, coverage inventory, component-ownership matrix, or evidence registry.

A complete journey starts through the launchable AI7 product path and reaches a user-visible outcome across the applicable renderer, Electron main, AI7 service, composed Harness runtime, and domain authority boundaries. A scenario that stops at a function, module, IPC edge, service method, Harness adapter, database, package, or platform mechanic is not admitted as a standing test.

For an observed bug, add the smallest end-to-end variation of the nearest complete journey that reproduces the reported outcome. Preserve the issue link and expected outcome in the scenario. Do not build speculative edge-case catalogs, generate tests from coverage gaps or component ownership, or add cases for failures nobody has observed and no supported journey requires.

## Provider-free public-test-material boundary

The product E2E execution interval uses only public test material: runtime-generated public synthetic data, or an Owner-designated **Public SampleBook** admitted under [ADR 0043](../adr/0043-allow-public-samplebooks-in-repository-and-ci.md). A Public SampleBook must be under exact root `SampleBooks/` and explicitly designated through an authorized Issue and pull request; directory placement alone is not admission. A scenario that consumes one names the exact admitted input in its own Change Brief. Under [ADR 0044](../adr/0044-use-sample1-as-compatibility-and-recording-baseline.md) and Issue #36, the current J-01 tracer consumes exact `SampleBooks/sample1.docx`, 29,550 bytes with SHA-256 `b8a3dbde0aa8a1ec7265f9ae3fe47877759e7947c5ab69682cd0a8f424a8d483`, as its standing compatibility input.

After exact dependency restoration finishes, the product subject and scenario make no live model or provider call, receive no API key or credential, perform no outbound network request, and contain no unpublished manuscript, private sample Book, or derivative of either. Public SampleBook admission does not grant provider, product-learning, export, distribution, or public-release authority. Exact `sample1`'s separately governed local manual recording eligibility exists outside CI and does not weaken this interval.

Before that interval, CI may use narrowly scoped repository checkout and declared dependency-source authentication plus approved package registries and immutable artifact sources to restore the exact committed lockfile, declared pins, and integrity-bound secondary downloads. Those infrastructure credentials never reach the product process. Any local dependency store must be reconstructable from empty. Job-local dependency caches may accelerate this step, but their initially absent state must remain supported without deleting global or shared caches. This is the declared-source-assisted bootstrap defined by the [Source Checkout Buildability Contract](./source-checkout-buildability.md), not product network access or a provider rehearsal.

A deterministic model fixture is allowed only as an in-process or local part of the same AI7 E2E journey boundary. It supplies predictable model-facing turns so the product journey can proceed; it is not a provider emulator, provider-conformance subject, replay proof, cassette programme, request-fingerprint proof, current-model-quality proof, Effect Receipt, learning input or shipped asset. A future Recorded Deterministic Model Fixture derived from exact `sample1` may enter only after ADR 0044's normalization, sanitization, rights review, human review and separate Issue/pull-request admission; raw recording bytes never enter CI or the repository.

Repository test inputs may contain only clearly public synthetic material, exact Public SampleBooks admitted under ADR 0043, or an exact reviewed Recorded Deterministic Model Fixture separately admitted under ADR 0044. CI logs and uploaded build/test artifacts must not retain manuscript payloads, including Public SampleBook content or synthetic manuscript-shaped text emitted while the journey runs. Report scenario identity, state and failure location without copying editorial payloads. Public SampleBooks and deterministic model fixtures are test inputs only and never enter a shipped distribution.

## Product subject and platform contract

The E2E subject follows the launchable product path. Each Windows and macOS execution begins from a fresh checkout or an equivalently empty job checkout, selects the repository-pinned toolchain, starts with empty job-local dependency-store/build-output roots, and uses the same documented root bootstrap, build, readiness, and lifecycle semantics used by developers. An optional cache may be restored only into a job-local cache root, and the first contract fulfillment on each host succeeds with that cache absent inside the same complete journey. Any Agent Data Root-owned runtime store is atomically materialized and re-verified from the declared snapshot rather than another root or a global/pre-filled store. E2E instantiates the same renderer, Electron main, service, composed Harness runtime, private IPC, required platform adapters, and non-release-only startup dependencies as local launch; only the deterministic model fixture, isolated data root, disabled outbound network, and non-substituting observation/control hooks may differ. No sibling checkout, personal path, ambient payload discovery, untracked source, pre-generated application output, private material, or CI-image-only tool is a permitted input. Build or package only as far as needed to start that subject on the current platform. A service-only, headless, topology-skipping, detached-or-immediately-exited, package-only, signing-only, or installer-only execution is not a substitute for the supported journey and does not become another gate.

Windows and macOS run the same supported journey IDs. Native setup and mechanics may differ for menus, shortcuts, dialogs, filesystem locations, protected secret stores, private IPC adapters, packages, signing/notarization, and OS prompts. The supported function, domain meaning, authority transition, data outcome, and user-visible result may not differ.

There is no separate headless, packaging, signing, notarization, platform-certification, release, or same-SHA gate. Release automation may package an already accepted source state without creating new test or proof obligations.

## Observed failures and diagnostics

An admitted scenario has no quarantine, flaky registry, tolerated-failure status, or platform waiver. Fix the product or the scenario. Remove or replace a scenario only when the supported journey or recorded bug outcome has explicitly changed; do not hide a failure behind standing exception machinery.

Hosted CI is not the development debugger. A product, bootstrap, build, or journey failure returns the pull request to Draft for local reproduction and repair. Only a clearly external GitHub runner, network, or infrastructure transient may be rerun once without a code change, and only by the Commander. A second occurrence or an ambiguous failure returns to Draft.

Temporary diagnostics may be created while diagnosing or implementing a concrete change. They are local or otherwise non-gating and must be deleted before integration unless their user-visible behavior is admitted into the E2E Functional Gate under the rules above.

Lint, type-check, format, and build commands may exist as developer commands. The Buildability Contract requires the root build and launch semantics only because the E2E subject must be constructed from the fresh checkout; they have no independent scenario, success record, CI gate, merge evidence, coverage programme, or authority and never substitute for the E2E Functional Gate.

On the actual supported development host, implementation uses the repository-root sequence `doctor` → `bootstrap` → `build` → applicable journey. Existing accepted pins and declared caches may be restored, but caches never supply correctness and a new dependency still requires exact Issue authority. Before reporting local completion, clear the change's build outputs and rerun `build` plus the applicable journey. Report only the host, commands, and outcomes; do not commit logs, receipts, proof artifacts, credentials, Provider payloads, private material, personal inputs, or ambient generated output.

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

Normal pull-request flow and Commander-only external action/integration remain in force. An implementation change that affects a supported journey or an observed-bug outcome updates the applicable E2E scenario, completes the local loop, and normally receives one integration-ready occurrence of the logical Gate on both platforms. Only the active exact ADR 0050 exception below waives that hosted occurrence. Documentation-only and design-only changes do not invent an automated proof task. Independent Reviewer work is optional and advisory under [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md), not a prerequisite for the pull request or the Gate.

The active Issue's [Change Brief](change-brief.md) names the applicable journey or observed bug before implementation. Verification follows that bounded outcome; it does not expand the Issue's structural budget or create adjacent scenarios.

## Current hosted-execution suspension and temporary waiver

The Owner suspended all GitHub-hosted Actions testing on 2026-08-28 after confirming that the account's minutes were exhausted, and exact workflow `E2E Functional Gate` (ID `342459594`) is disabled. ADR 0050 records the later exact Owner exception. That exception becomes current only when ADR 0050 and these projections integrate into `dev`.

The waiver is active only while workflow `342459594` is `disabled_manually`, no run is queued or in progress, and no fresh usable Actions allocation after reset has been authoritatively confirmed. Immediately before changing an otherwise integration-ready product pull request from Draft to Ready, and again immediately before merge, the Commander records the workflow state and absence of queued or active runs. Each waived pull request states exactly:

> Hosted E2E Functional Gate: temporarily waived under ADR 0050 because Actions usage remained exhausted; workflow 342459594 was disabled_manually with no queued or active run; no hosted run, green Gate, or substitute Gate is claimed.

Only hosted integration evidence is waived. The unchanged local `doctor` → `bootstrap` → `build` → applicable journey sequence, final cleared-output `build` plus applicable journey rerun, authority/privacy/credential/dependency rules, target re-resolution, explicit integration order, and Commander-only integration remain required. Waived product pull requests integrate one at a time in authorized dependency order. Local completion and advisory review are not represented as the hosted or paired-platform Gate. No fake green, different workflow, substitute Gate, single-platform Gate, branch-protection check, or release authority is created.

Pure documentation, design, and CI-governance work may still integrate while the workflow is disabled only within an exact Change Brief after local validation. The Commander may request optional advisory read-only review, whose verdict informs rather than gates integration. This path claims no green Gate.

Do not enable or dispatch a workflow to probe for reset. Authoritative confirmation of a fresh usable Actions allocation after reset expires the waiver immediately. A Ready but unmerged product pull request returns to ADR 0049's normal Gate lifecycle and may not merge until the paired-platform occurrence succeeds. Only after that confirmation, the Owner prospectively authorizes the Commander to re-enable exact workflow `342459594` as a separate explicit action and resume ADR 0049. There is no automatic enablement, manual dispatch, probe, or retrospective run. Already merged waived pull requests receive no synthetic backfill; the next normal product Gate exercises then-current integrated `dev`.
