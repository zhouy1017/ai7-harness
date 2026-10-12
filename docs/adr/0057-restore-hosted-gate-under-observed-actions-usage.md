---
status: historical restoration fact; operating instructions retired
---

# Hosted Gate restoration record

On 2026-09-01 the Owner authorized restoration of workflow `E2E Functional Gate` (ID `342459594`). That restoration is a historical fact, not a current disable/enable instruction or a fixed Journey inventory.

The superseded usage-observation, single-occurrence and Commander-only instructions are deleted under [ADR 0089](./0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). [ADR 0058](./0058-remove-actions-usage-observation-from-development-gating.md) owns the current exclusion of Actions-usage observation. [CI and test boundaries](../agents/ci-test-boundaries.md) owns validation, and [Orca dispatch](../agents/orca-dispatch.md) owns review and integration. The executable PR/nightly topology is described by ADRs [0075](./0075-split-the-hosted-gate-into-a-fast-pull-request-lane-and-a-nightly-full-gate.md) and [0081](./0081-run-the-nightly-full-gate-over-every-open-pull-request-merge-the-ones-that-pass-and-then-over-dev.md). Historical restoration terms remain in Git.
