---
status: accepted
---

# Admit J-12 as the fourth supported E2E journey

On 2026-08-29 the Owner selected Issue #42's J-12 outcome as the fourth supported journey in the one logical provider-free E2E Functional Gate. This decision resolves the fourth-journey routing boundary reserved by [ADR 0049](./0049-bound-hosted-actions-consumption-inside-the-e2e-gate.md): until another explicit Owner decision and separate CI-governance integration, every product-affecting Ready pull-request occurrence runs J-01, J-02, J-08, and J-12 on both Windows and macOS. Shared and unclassified changes also fail closed to all four journeys.

## Meaning and ownership

Issue #42 owns the first executable bounded J-12 slice: exact Book and Revision routes across multiple non-focus-stealing windows, offline local reading and editing, native file selection, and authoritative Product Data Location meaning with equivalent Windows/macOS outcomes. That slice establishes a runnable supported path; it does not claim the full canonical J-12 journey or authorize adjacent Book Workspace behavior.

J-12 admission does not move role or credential authority. Issue #46 continues to own role-first credential behavior, Credential Broker operations, and the Windows Credential Manager/macOS Keychain boundary. This decision creates no Provider call, credential operation, dependency, product implementation, release, publication, or `main` authority.

## Staged cutover

The existing workflow may project the admitted four-Journey command sequence while exact workflow `E2E Functional Gate` (ID `342459594`) remains `disabled_manually` under [ADR 0053](./0053-preserve-local-first-development-through-a-bounded-ci-degraded-mode.md). Issue #138 does not authorize enablement, dispatch, or a probe; restoration remains a separate exact external action. No placeholder, alias, fake success, or retrospective run may stand in for the executable J-12 slice.

Draft suppression, integration-ready pull-request invocation, pull-request-scoped cancellation, the complete-diff Markdown router, Markdown-only early exit, one logical Gate, and the unchanged Windows Server 2025 x64/macOS 15 arm64 matrix remain intact. Admission of any later supported journey requires another explicit routing decision and separate CI-governance integration; it is never added silently.

## Consequences

This ADR amends only ADR 0049's initial three-Journey routing default. [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md)'s Gate identity, provider-free boundary, scenario meaning, platform parity, failure semantics, and excluded proof surfaces remain unchanged. ADR 0053 owns current CI-degraded activation, completion, integration, disclosure, and exit conditions without changing this Journey admission.
