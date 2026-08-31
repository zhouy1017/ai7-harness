---
status: accepted
---

# Defer macOS evidence until after the initial v1.0.0 development milestone

On 2026-08-31 the Owner decided that product integration will require fresh Windows evidence only until AI7 crosses the **Initial v1.0.0 Development Milestone Boundary**. macOS evidence is deferred during that interval, not passed or removed from the product contract. This decision temporarily amends only the evidence-platform and integration-timing clauses of [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md), [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md), [ADR 0051](./0051-admit-j-12-as-the-fourth-supported-e2e-journey.md), and [ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md). It preserves [ADR 0028](./0028-support-windows-and-macos-as-one-product.md), [ADR 0052](./0052-select-the-macos-v1-distribution-and-data-location-profile.md), one logical provider-free E2E Functional Gate, and the then-current executable admitted Journey set. [ADR 0055](./0055-stage-the-bounded-provider-free-j-03-authorization-journey.md) governs that set's staged J-03 cutover without changing this ADR's evidence timing. This decision does not revive ADR 0014's superseded Windows-only Gate.

## Initial v1.0.0 Development Milestone Boundary

This is a repository-development boundary, not the product-domain Milestone Version, a GitHub milestone object, package version, tag, release, or `main` promotion. It is crossed only after a separately authorized completion Issue and pull request integrate a stable record naming the exact `dev` commit that contains the Owner-confirmed complete initial-v1.0.0 development scope. Package metadata, elapsed time, Issue count, a Draft pull request, or an unintegrated declaration cannot cross it.

## Before the boundary

A product pull request rebases onto newest `dev`, re-resolves target-qualified authority, and obtains fresh Windows Local completion at that exact head with `pnpm run doctor`, `pnpm run bootstrap`, `pnpm run build`, and `pnpm run e2e:all`. Every Windows product, bootstrap, build, or Journey failure or unknown cause blocks Ready and merge. Product pull requests integrate one at a time; the next candidate rebases and repeats the Windows sequence.

`e2e:all` executes the then-current real admitted set. That set remains J-01/J-02/J-08/J-12 until another separately authorized Journey implementation; Issue #88's separate J-15 route may change it before Issue #47, and Issue #47 must atomically add J-03. The Windows-only evidence timing applies to the resolved set without fixing its total count.

This is an independent pre-boundary integration route under ADR 0054; it does not depend on [ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md)'s external Hosted-CI condition remaining active. When that condition is active, ADR 0053's workflow-state, no-run, and truthful external-condition records apply in addition. If the external condition resolves before the boundary, ADR 0054 remains active, exact workflow `342459594` remains disabled and unrun, and the same Windows Local completion remains sufficient for Ready and merge without becoming Hosted or Gate evidence.

macOS evidence is not required even when a change affects shared or macOS-native code. Missing macOS evidence and any known macOS-only problem are recorded truthfully for re-entry, never represented as a pass, but are not pre-boundary merge requirements. This timing change does not permit semantic or support divergence: AI7 remains one Windows/macOS product with the same domain, authority, data, document-fidelity, privacy, egress, credential, and user-visible meanings.

Exact workflow `E2E Functional Gate` (ID `342459594`) remains `disabled_manually` and unrun. Ready under the ADR 0054 route does not start it. Its existing Windows/macOS matrix remains dormant and structurally unchanged as the post-boundary topology. Restoration, dispatch, rerun, probing, or replacement before the boundary requires a new exact Owner and CI-governance decision; this ADR authorizes none.

Each pre-boundary product pull request states, with placeholders resolved:

> Verification state: **Windows Local completion — pre-Initial v1.0.0 Development Milestone Boundary under ADR 0054** at `<exact-head>` on `<Windows host>`; `doctor`, `bootstrap`, `build`, and the then-current executable admitted Journeys (`<resolved Journey IDs>`) passed. Workflow `342459594` remained disabled and unrun. No macOS Local completion, Hosted occurrence, green Gate, paired-platform evidence, or macOS-pass claim is made. macOS product support remains unchanged; consolidated macOS evidence is deferred to post-boundary re-entry.

Resolve the Journey IDs from the exact head. They remain J-01/J-02/J-08/J-12 until another separately authorized executable cutover, may include J-15 only after its own unresolved decision and implementation, and must include J-03 after Issue #47's cutover. Dormant workflow projection is never listed as passed.

## Boundary expiry and macOS re-entry

At the exact boundary commit, the pre-boundary exception expires. Before any later product pull request integrates—and before any `dev` to `main` promotion, `v1.0.0` tag, package, signing, notarization, publication, or release action—a separate authorized CI-governance/re-entry Issue validates every then-current executable admitted Journey on integrated `dev` using actual Windows and macOS hosts, or through the exact paired workflow if its restoration is separately authorized. Re-entry uses the set resolved at that exact boundary commit, including J-03 if Issue #47 has cut over; this ADR neither fixes its count nor decides J-15.

If Hosted CI remains unavailable, the Windows and macOS results remain two truthful Local completions and are not called a Hosted occurrence or green Gate. Either platform failure blocks re-entry and is fixed under its own authorized product scope. Ready but unmerged product pull requests rebase after successful re-entry and resume the normal current Windows/macOS evidence lifecycle.

Re-entry validates the consolidated then-current `dev` state. It does not retrospectively relabel or backfill old pull requests, manufacture macOS evidence, authorize release, or create another Gate, test surface, evidence registry, platform edition, or milestone-control mechanism.
