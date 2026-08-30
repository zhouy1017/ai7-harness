---
status: accepted
---

# Preserve local-first development through a bounded CI-degraded mode

The Owner requires development to remain stable when GitHub-hosted CI is unavailable while keeping hosted usage low when it is available. This decision fully supersedes [ADR 0050](./0050-waive-hosted-e2e-integration-evidence-during-actions-exhaustion.md) and amends only [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md)'s local-completion, hosted-consumption, and unavailable-hosted-integration clauses. It does not change [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md)'s one logical provider-free E2E Functional Gate, test/data/privacy boundary, failure meaning, or excluded proof surfaces, and it does not change [ADR 0051](./0051-admit-j-12-as-the-fourth-supported-e2e-journey.md)'s J-01/J-02/J-08/J-12 admission or paired Windows/macOS success requirement.

## Three distinct verification states

- **Local diagnostic** is a bounded single-Journey or issue-specific run used to locate a concrete failure. A standing diagnostic command may emit only allowlisted Journey, phase, error-class, and non-payload process metadata. It never emits manuscript or DOM text, IPC payloads, database rows, source excerpts, credentials, screenshots, traces, videos, or proof artifacts. Its result is never Local completion, merge evidence, or the Gate.
- **Local completion** is execution of the applicable clean build and real admitted Journey path on an actual Supported Development Host. It records only the exact source head, host, commands, and outcomes. It is development completion, not hosted or paired-platform evidence.
- **Hosted E2E Functional Gate** is only the exact GitHub workflow's product-affecting Windows/macOS occurrence. A successful occurrence executes all four admitted Journeys on both platforms. A missing, cancelled, partial, local, or single-platform result is not a green Gate.

No local command creates a second test suite or substitute Gate. The durable diagnostic and all-Journey orchestration reuse the existing production-shaped provider-free subject and admitted Journey runners.

## Normal low-usage hosted operation

ADR 0049's Draft suppression, Ready-only trigger, complete-diff router, and same-pull-request cancellation remain unchanged. Each platform occurrence performs checkout, tool selection, bootstrap, and build once, then runs J-01, J-02, J-08, and J-12 sequentially.

The workflow may restore only the exact declared immutable Electron download into checkout-local `.cache/bootstrap/electron`. Its cache key is bound to platform, architecture, and the complete dependency-artifact manifest. A miss uses the same bootstrap path. Bootstrap must re-check the canonical path and declared digest before the archive becomes an input; only after successful bootstrap may the verified download be saved, so a later build or Journey failure can still benefit a same-pull-request retry. GitHub's pull-request cache scope means cross-pull-request reuse is not assumed. A hit has no success meaning. The cache excludes `.pnpm-store`, `node_modules`, `.runtime`, `dist`, Agent Data Roots, databases, product runtime state, manuscript-shaped material, credentials, logs, and test artifacts.

The matrix may fail fast after the first product, bootstrap, build, or Journey failure, cancelling work that can no longer produce a successful paired occurrence. A successful Gate still requires both platforms to complete all four Journeys; a cancelled sibling is never reported as passing. This is qualitative consumption control, not a numeric budget, selective router, fast lane, manual run, schedule, nightly run, or platform waiver.

## CI-degraded activation boundary

CI-degraded integration is available only when all of these conditions hold:

- the exact Hosted Gate cannot produce a paired-platform occurrence because of a Commander-recorded external CI condition unrelated to the current product source, bootstrap, build, or Journey behavior;
- exact workflow `E2E Functional Gate` (ID `342459594`) remains `disabled_manually` with no queued or in-progress run; and
- no product, bootstrap, build, or Journey failure is unresolved or of unknown cause.

The mode is explicit, not automatic. A date, expected quota reset, slow queue, visible workflow control, or ambiguous failure is insufficient. Immediately before Ready and again before merge, the Commander records the workflow state, absence of runs, and concrete external condition. No one enables, dispatches, reruns, or creates another workflow to probe availability or manufacture evidence. This decision and Issue #138 do not authorize workflow restoration.

## Completion and integration while CI is degraded

Before a product-affecting pull request may integrate under this mode, the Commander rebases it onto the newest intended `dev`, re-resolves target-qualified authority, and obtains fresh Local completion at that exact rebased head on an actual Supported Development Host. That completion runs repository-root `doctor`, `bootstrap`, one clean `build`, then `e2e:all`, which executes J-01, J-02, J-08, and J-12 sequentially from that build and stops on the first failure. Every locally reproducible failure must be resolved. Only the head, host, commands, and outcomes are reported; no proof artifact or payload is retained.

If a change affects a Supported Host or platform adapter; `doctor`, bootstrap, dependency/runtime acquisition, or build; Electron/native launch, readiness, IPC, process lifecycle, or another OS-native lifecycle, the pull request remains Draft until there is fresh Local completion on every affected platform. A shared change affecting both platforms therefore needs separate Windows and macOS Local completions or waits for the Hosted Gate to return. Multiple local hosts still produce Local completion, never paired-platform hosted evidence.

Product pull requests integrate one at a time. The next candidate rebases onto the just-integrated `dev`, re-resolves authority, and reruns the full CI-degraded Local completion sequence; candidates do not silently stack on unintegrated code. Documentation, design, and CI-governance work whose Change Brief declares the Journey `N/A` performs its applicable local validation and does not invent a product run.

Every product pull request integrated this way includes exactly this disclosure, with the placeholders resolved:

> Verification state: **Local completion — CI-degraded under ADR 0053** at `<exact-head>` on `<supported-host>`; clean build and J-01/J-02/J-08/J-12 passed. The Hosted E2E Functional Gate was unavailable because `<recorded external condition>`; no hosted run, paired-platform evidence, green Gate, or substitute Gate is claimed.

## Exit and restoration

When the external condition is authoritatively confirmed absent, Ready but unmerged product pull requests return immediately to ADR 0049's normal Hosted Gate lifecycle. Availability confirmation does not itself authorize workflow enablement or dispatch; that external action requires separate exact authority. There is no automatic restoration, availability probe, manual dispatch, retrospective run, or synthetic backfill. Product changes already integrated under CI-degraded mode keep their truthful disclosure, and the next normal Gate exercises then-current integrated `dev`.

## Consequences

This mode accepts the bounded risk that a platform-specific regression may integrate without fresh hosted detection, while preventing hosted unavailability from stopping ordinary development that can be completed on a supported host. It cannot bypass a known or ambiguous product failure, reduce admitted Journey/platform coverage when the Hosted Gate runs, create release or `main`-promotion authority, or weaken provider, public-test-material, privacy, egress, credential, dependency, or cleanup boundaries.

The executable projection and future-Agent rules live in [`docs/agents/ci-test-boundaries.md`](../agents/ci-test-boundaries.md). The concrete local command and cache implementation lives in [`docs/development/source-checkout.md`](../development/source-checkout.md).
