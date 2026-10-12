---
status: accepted — dispatch and sequencing amended by ADR 0089
---

# Reweight repository development toward value-first delivery

The retained decision is value-first delivery and clear documentation ownership. Repository roles, model selection, branch flow, review, and integration are owned by [Orca dispatch](../agents/orca-dispatch.md) under [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). This document contains no second dispatch contract.

## Delivery and documentation ownership

- [The development plan](../development/development-plan.md) is the ordered backlog and the only delivery-order owner. Root `PROGRESS.md` routes current work and records status; Issues bound each outcome.
- `PROGRESS.md` is the single root status router; root `HANDOFF.md` is retired. Its updates belong in the integrating change or a bounded documentation pull request.
- `docs/architecture-v2/`, `docs/ui-ux-v2/`, `kick-in/`, `docs/domain/*/CONTEXT.md`, `GLOSSARY.md`, and `UBIQUITOUS_LANGUAGE.md` retain their frozen design baseline at `dev@4c50ce31b0f15ff2bfadd2af17fc914c317e0f22`. An accepted ADR names any changed clause. ADR 0089 replaces the repository-development dispatch clauses and reorders delivery without silently changing product-domain authority.
- Implementation status lives only in `PROGRESS.md` and [E2E journeys](../development/e2e-journeys.md). A design document describes intent rather than current implementation.
- [The agent router](../agents/README.md) owns target-qualified reading and authority. The PRD remains at `docs/prd/ai7-v2-prd.md`, with Issue #28 as its epic pointer.
- Issues state one bounded outcome, acceptance criteria, allowed change, non-goals, verification and stop conditions. Conflicting older planning instructions are removed from current bodies; retrieve historical evidence only from Git or Issue edit history when needed. The current Issue agrees with the current plan and design owners.

## Fixtures and verification

Synthetic fixtures remain useful for deterministic error, budget, interruption and application behavior. Recorded development evidence is reused through the existing cache, ledger and reviewed fixture tooling under [ADR 0067](./0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md); only exact requests reuse actual responses. A similar validation family may reuse regression evidence without pretending to answer a different input.

[ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md) retains one provider-free hosted E2E surface, and [ADR 0062](./0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md) retains the Local Verification Ladder. CI routing to the Orca wave branches remains the P0 adaptation described in [CI and test boundaries](../agents/ci-test-boundaries.md).

The former dispatch text is available in Git history rather than another archive copy.
