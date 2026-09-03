# CI and test boundaries

Status: **Owner-accepted `dev` implementation boundary under [ADR 0027](../adr/0027-concentrate-ci-on-e2e-functionality.md), with hosted invocation amended by [ADR 0049](../adr/0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md), fourth-Journey history recorded by [ADR 0051](../adr/0051-admit-j-12-as-the-fourth-supported-e2e-journey.md), local-first/CI-degraded operation governed by [ADR 0053](../adr/0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md), pre-milestone platform-evidence timing governed by [ADR 0054](../adr/0054-defer-macos-evidence-until-after-initial-v1-0-0-development-milestone.md), the staged J-03 executable cutover governed by [ADR 0055](../adr/0055-stage-the-bounded-provider-free-j-03-authorization-journey.md), the preceding staged J-15 cutover governed by [ADR 0056](../adr/0056-stage-the-bounded-provider-free-j-15-artifact-lifecycle-journey.md), and current safe restoration/usage observation governed by [ADR 0057](../adr/0057-restore-hosted-gate-under-observed-actions-usage.md); one logical provider-free E2E surface, not an independent action or `main`-promotion authorization**

On `dev`, this file is the concise authority for implementation-time CI and test admission. ADR 0027 remains the decision authority; the current bounded implementation authorization is recorded separately in the applicable Issue and Change Brief.

## One standing automated test surface

AI7 has exactly one standing automated engineering test surface: one logical, provider-free **E2E Functional Gate**. It runs on Windows and macOS with the same supported journey IDs. Every platform result belongs to that one gate, and a failure on either platform fails the logical gate.

Before the exact Initial v1.0.0 Development Milestone Boundary, Windows Local completion remains required before a product pull request becomes Ready. Under ADR 0057's restored normal operation, the applicable Ready pull request then requires the paired Windows/macOS Hosted Gate; either platform failure fails the logical Gate. ADR 0054's Windows-only route and truthful macOS deferral apply only during an exact ADR 0053 degraded interval and remain historical truth for already integrated work. A local Windows result is never a Windows-only Gate, paired evidence, or a macOS pass.

The gate exists to answer only two questions:

1. Do complete supported user journeys still produce their accepted user-visible, domain, authority, and data outcomes?
2. Does an observed user-visible bug remain fixed inside the smallest complete journey that reproduces it?

It does not prove individual layers, packages, providers, platforms, quality attributes, or a release as separate subjects.

## Usage-bounded pull-request invocation

A pull request remains Draft during authoring, debugging, review, rebase, and local validation. Draft activity runs no hosted workflow. Once the change is locally complete and target authority has been re-resolved, only the Commander changes it to Ready for review. While exact workflow `342459594` is active and applicable, that transition starts the one logical Gate, including before the ADR 0054 boundary after required Windows Local completion. A repair or changing push first returns the pull request to Draft; same-pull-request cancellation is a last-resort consumption control, not permission for iterative Ready-state pushes or exact-head/same-SHA proof.

When the workflow is applicable, the existing complete-pull-request-diff router remains inside it. A Markdown-only Ready pull request may therefore consume its small route job, rather than relying on GitHub trigger-level path filters that can omit part of a large diff. There is no author-selected label, component catalog, manual dispatch, direct `push` event, schedule, nightly, release, package, or exact-head activation path.

ADRs 0055 and 0056 keep admission distinct from executable activation. Issue #88 made J-01, J-02, J-08, J-12 and J-15 executable; Issue #47 now supplies the real J-03 runner/dispatcher and atomically adds it to local `e2e:all` and the hosted workflow. Under ADR 0057 the active workflow contains those six real commands. A product-affecting Ready pull request runs every then-current executable admitted Journey on both Windows and macOS; shared and unclassified changes fail closed to that same set. No phase fixes a permanent total, and every further admission still requires an explicit Owner routing decision and separate CI-governance integration.

Each applicable platform occurrence checks out and selects the exact toolchain once, performs bootstrap and build once, then runs every then-current executable admitted Journey sequentially. The workflow may restore only `.cache/bootstrap/electron`, keyed by OS, architecture, and the complete declared artifact manifest. Bootstrap revalidates its canonical path and SHA-256; a miss follows the same path, and only a successful bootstrap may save the verified download for a later occurrence in the same pull request. Do not assume cross-pull-request reuse. A hit has no success meaning. Never cache `.pnpm-store`, `node_modules`, `.runtime`, `dist`, Agent Data Roots, databases, product runtime state, manuscript-shaped material, credentials, logs, screenshots, traces, videos, or test artifacts. Matrix failure early-stop may cancel the sibling after a definitive failure; only both platforms completing the whole resolved set is a successful Gate. A dormant Journey is absent from the active job until its real runner, dispatcher, local orchestration, and workflow cut over atomically.

The qualitative resource objective is normally one completed paired-platform Gate occurrence per integration-ready product change. The account's confirmed 3,000 included minutes per month is an availability fact, not permission to consume the allowance or a per-pull-request engineering budget. Do not create a numeric budget, secondary fast lane, or weaker single-platform substitute without another Owner decision.

Monitoring consumes no Actions. Before each Ready transition, the Commander or account Owner checks GitHub's authoritative account-wide month-to-date Actions usage and repository attribution through Billing and licensing or its supported read API. After the occurrence, the same meter and the run/job Usage view are checked for the actual delta, duplicate occurrences, and unexpected platform duration. GitHub retains those records; do not create a repository ledger, schedule, monitoring workflow, artifact, or receipt. If the authoritative meter cannot be read, remaining availability is insufficient or exhausted, or consumption is unexplained, keep the next product pull request Draft and escalate rather than probing with a run or silently widening account permissions.

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

An admitted scenario has no quarantine, flaky registry, tolerated-failure status, or platform waiver. While the restored Gate is active, a failure or unknown on either platform blocks integration and is fixed in the product or scenario. During an exact pre-boundary ADR 0053 degraded interval, ADR 0054 instead makes every Windows failure or unknown blocking while a known macOS-only issue remains a truthful re-entry obligation, not a pass or tolerated failure. Remove or replace a scenario only when the supported journey or recorded bug outcome has explicitly changed; do not hide a failure behind standing exception machinery.

Hosted CI is not the development debugger. A product, bootstrap, build, or journey failure returns the pull request to Draft for local reproduction and repair. Only a clearly external GitHub runner, network, or infrastructure transient may be rerun once without a code change, and only by the Commander. A second occurrence or an ambiguous failure returns to Draft.

Keep these three repository-development states distinct:

- **Local diagnostic** uses `pnpm --silent run e2e:diagnose -- --journey <executable-admitted-id>` or an issue-bounded temporary probe to locate a concrete failure. The durable command captures child output and emits only a controller-owned Journey, closed stage identity, fixed error class, and non-completion label; it forwards no raw child output, and silent pnpm invocation does not reflect a rejected argument. Its success or failure is never completion, merge evidence, or a Gate result. Delete issue-specific probes before integration; the generic payload-safe diagnostic facility may remain.
- **Local completion** executes the applicable clean build and real admitted Journey path on an actual Supported Development Host and reports only source head, host, commands, and outcomes. `pnpm run e2e:all` provides the then-current executable admitted sequence when all Journeys are required. It is now J-01 → J-02 → J-08 → J-12 → J-15 → J-03 after Issue #47's atomic cutover. The orchestration captures and discards child streams, emits only controller-owned completion markers, stops on first failure, and claims completion only after the whole resolved set passes. An operator interruption first requests bounded cleanup of the active Journey's owned browser, loopback, and disposable runtime root, then emits a fixed interruption marker and exits nonzero; direct foreground-group signals and controller-channel loss are runner-owned cancellation inputs to the same cleanup path. A child signal without a recorded controller interruption remains a failure. None is completion.
- **Hosted E2E Functional Gate** is only exact workflow `342459594` running the admitted set on Windows and macOS. Missing, cancelled, partial, local, or single-platform results cannot be called a green or paired-platform Gate.

Diagnostics never emit or retain credentials, manuscript or DOM text, IPC payload, SQL data, TypeScript error prose or source excerpts, screenshots, traces, videos, artifacts, exception messages, or arbitrary child output. Build diagnostics may expose only a bounded root-relative file/line/column/TypeScript-code tuple, a bounded `BUILD_TYPESCRIPT/config/<code>` tuple, a fixed bounded `BUILD_TYPESCRIPT/omitted/<count>` tuple, the fixed `BUILD_TYPESCRIPT/unclassified` marker, or the fixed `BUILD/unclassified` marker. The root build command enters through a fixed dynamic-import controller so implementation parse, resolution, static-import, and execution failures remain inside that boundary.

Lint, type-check, format, and build commands may exist as developer commands. The Buildability Contract requires the root build and launch semantics only because the E2E subject must be constructed from the fresh checkout; they have no independent scenario, success record, CI gate, merge evidence, coverage programme, or authority and never substitute for the E2E Functional Gate.

On the actual supported development host, normal implementation uses the repository-root sequence `doctor` → `bootstrap` → `build` → applicable Journey. Existing accepted pins and declared caches may be restored, but caches never supply correctness and a new dependency still requires exact Issue authority. The root `build` validates and replaces its canonical `dist` output, so its final run is clean. Before reporting normal Local completion, rerun `build` plus the applicable Journey. Report only the exact head, host, commands, and outcomes; do not commit logs, receipts, proof artifacts, credentials, Provider payloads, private material, personal inputs, or ambient generated output. Pre-boundary product completion and CI-degraded completion use the stricter all-Journey sequence below.

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

Normal pull-request flow and Commander-only external action/integration remain in force. An implementation change that affects a supported Journey or an observed-bug outcome updates the applicable E2E scenario and completes the local loop. Before the milestone boundary, fresh exact-head Windows Local completion precedes Ready; while the ADR 0057 workflow is active and usable, the normal lifecycle then receives one integration-ready paired occurrence. During an exact ADR 0053 degraded interval, its workflow-state, no-run, and external-condition records apply and ADR 0054 supplies only that interval's truthful Windows-only route. A blocking failure or unknown under the active route never integrates. Documentation-only and design-only changes do not invent an automated proof task. Independent Reviewer work is optional and advisory under [Repository Development Dispatch](../../kick-in/27-repository-development-dispatch.md), not a prerequisite for the pull request or the Gate.

The active Issue's [Change Brief](change-brief.md) names the applicable journey or observed bug before implementation. Verification follows that bounded outcome; it does not expand the Issue's structural budget or create adjacent scenarios.

A testing-framework or CI-governance pull request whose Change Brief declares the Journey `N/A` validates only its bounded command, isolation, redaction, failure-propagation, workflow, and documentation contracts. It may execute an admitted real Journey to prove that the framework launches the production-shaped subject and reports the observed outcome, but that run is not Local completion for unfinished product behavior. A failure attributable to incomplete or defective product behavior stays red and is routed to its own authorized product Issue; never implement, weaken, or relabel product behavior merely to make the framework pull request pass. A failure caused by the framework itself remains inside the framework Issue and must be fixed there.

## Pre-Initial v1.0.0 Development Milestone Boundary

The **Initial v1.0.0 Development Milestone Boundary** is crossed only after a separately authorized completion Issue and pull request integrate a stable record naming the exact `dev` commit that contains the Owner-confirmed complete initial-v1.0.0 development scope. It is not the product-domain Milestone Version, a GitHub milestone object, package version, tag, release, `main` promotion, elapsed time, Issue count, Draft pull request, or unintegrated declaration.

Before that boundary, every product pull request rebases onto newest `dev`, re-resolves target-qualified authority, and obtains fresh Local completion on an actual Windows host at that exact head:

```text
pnpm run doctor
pnpm run bootstrap
pnpm run build
pnpm run e2e:all
```

Every Windows product, bootstrap, build, or Journey failure or unknown cause blocks Ready and merge. This Windows sequence is required even when the diff affects shared or macOS-native code. While workflow `342459594` is active and usable under ADR 0057, Windows Local completion is the prerequisite to Ready; the ensuing paired Hosted Gate must then succeed before merge, and either platform failure blocks. Product pull requests integrate one at a time; the next candidate rebases and repeats the Windows sequence before its single Ready transition.

ADR 0057 separately authorizes restoration only after the active workflow contains the exact real executable set. It grants no manual dispatch, probe, rerun beyond the one clearly external-transient exception, retrospective run, or backfill. If a future external condition activates the exact ADR 0053 degraded mode, ADR 0054 again supplies the pre-boundary Windows-only integration route and truthful macOS deferral for that interval.

Each product pull request integrated during such a pre-boundary degraded interval states exactly, with placeholders resolved:

> Verification state: **Windows Local completion — pre-Initial v1.0.0 Development Milestone Boundary under ADR 0054** at `<exact-head>` on `<Windows host>`; `doctor`, `bootstrap`, `build`, and the then-current executable admitted Journeys (`<resolved Journey IDs>`) passed. Workflow `342459594` remained disabled and unrun. No macOS Local completion, Hosted occurrence, green Gate, paired-platform evidence, or macOS-pass claim is made. macOS product support remains unchanged; consolidated macOS evidence is deferred to post-boundary re-entry.

Resolve those IDs from the exact head. The current set is J-01/J-02/J-08/J-12/J-15/J-03 after Issue #47's atomic cutover. Never disclose a dormant Journey as passed or assert a fixed permanent total.

At the exact boundary commit, this exception expires. Before any later product pull request integrates—and before any `dev` to `main` promotion, `v1.0.0` tag, package, signing, notarization, publication, or release action—a separate authorized CI-governance/re-entry Issue validates every then-current executable admitted Journey on integrated `dev` using actual Windows and macOS, or through the exact paired workflow if restoration is separately authorized. Re-entry resolves the set at that exact commit, including the current J-15 and J-03 cutovers; it fixes no total. With Hosted CI unavailable, those are two Local completions rather than a Hosted or green Gate. Either platform failure blocks re-entry and is fixed under its own authorized product scope. Ready but unmerged product pull requests rebase after successful re-entry and resume the normal current Windows/macOS lifecycle. Re-entry validates consolidated `dev`; it does not retrospectively relabel or backfill old pull requests.

## CI-degraded operation

The Owner suspended GitHub-hosted Actions testing on 2026-08-28 after confirming exhausted usage. ADR 0057 records the Owner's 2026-09-01 capacity restoration and separately authorizes exact workflow `342459594` to become active only after Issue #166's truthful configuration integrates. The earlier exhaustion condition is then inactive; Issue #138 itself never authorized enablement or dispatch.

The ADR 0053 path is active only when the exact Hosted Gate cannot produce a paired-platform occurrence because of a Commander-recorded external CI condition unrelated to current product source/bootstrap/build/Journey behavior, workflow `342459594` is `disabled_manually` with no queued or in-progress run, and no product/bootstrap/build/Journey failure or unknown that ADR 0054 makes blocking remains unresolved. Before the boundary, every Windows failure or unknown is blocking while a known macOS-only problem follows ADR 0054's truthful re-entry record. A date, expected reset, unreadable billing meter, slow queue, visible workflow control, or ambiguous failure is insufficient by itself. Immediately before Ready and again before merge, the Commander records the exact workflow state, absence of runs, concrete external reason, current milestone phase, and applicable disclosure. No workflow is enabled, dispatched, rerun, or replaced to probe availability or manufacture evidence.

Before a product-affecting pull request integrates in this state, the Commander rebases it onto newest intended `dev`, re-resolves every target-qualified authority, and obtains fresh Local completion at that exact rebased head on every platform required by the current ADR 0054 milestone phase:

```text
pnpm run doctor
pnpm run bootstrap
pnpm run build
pnpm run e2e:all
```

`build` validates and replaces the canonical build output; `e2e:all` starts every then-current executable admitted Journey in a fresh controller process and stops at the first failure. The order is now J-01 → J-02 → J-08 → J-12 → J-15 → J-03 after Issue #47's atomic cutover. Resolve every locally reproducible failure. Report only exact head, supported host, commands, and outcomes; retain no log, receipt, payload, database, screenshot, trace, video, or proof artifact.

Before the Initial v1.0.0 Development Milestone Boundary, ADR 0054 temporarily replaces the affected-platform stop with fresh Windows completion only, including for shared and macOS-native changes. At the boundary the exception expires. After successful re-entry, a pull request again remains Draft without fresh Local completion on every affected platform when it changes a Supported Host/platform adapter; `doctor`, bootstrap, dependency/runtime acquisition, or build; Electron/native launch, readiness, IPC, process lifecycle, or another OS-native lifecycle. A shared change affecting both platforms then needs Windows and macOS Local completions or waits for the normal Hosted Gate. Two local results remain two Local completions, not Hosted or paired-platform evidence.

Product pull requests integrate one at a time. The next candidate rebases onto just-integrated `dev`, re-resolves authority, and reruns the whole then-current executable admitted sequence; do not silently stack candidates. Documentation, design, and CI-governance work with Journey `N/A` performs only its Change Brief's applicable local validation. Do not create a fake green, different workflow, substitute or single-platform Gate, branch check, evidence registry, required advisory review, or release authority.

After successful post-boundary re-entry, each product pull request integrated through ADR 0053's CI-degraded path states exactly, with placeholders resolved:

> Verification state: **Local completion — CI-degraded under ADR 0053** at `<exact-head>` on `<supported-host>`; clean build and the then-current executable admitted Journeys (`<resolved Journey IDs>`) passed. The Hosted E2E Functional Gate was unavailable because `<recorded external condition>`; no hosted run, paired-platform evidence, green Gate, or substitute Gate is claimed.

Resolve the disclosure list from the exact head: the current set includes J-15 and J-03 after their atomic cutovers. A dormant command is never a completion result, and no report asserts a fixed permanent total.

ADR 0057 is the separate exact authority for the 2026-09-01 restoration only. A later degraded interval has no automatic restoration, probe, manual dispatch, retrospective run, synthetic backfill, or per-pull-request backfill; a new authoritative availability fact and Commander external action are required. At the milestone boundary, ADR 0054's separately authorized consolidated re-entry remains required before later product integration or release-path action and does not retrospectively relabel earlier pull requests.
